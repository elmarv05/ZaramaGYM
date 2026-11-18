use crate::errors::AppError;
use crate::models::{
    AttendanceCheckInMode, AuthSession, CheckInEvaluationDto, CheckInInput,
    CreateMobileDeviceInput, LanServerStatusDto, MobileDeviceDto, MobileDeviceFilter,
    MobileDevicePairingDto, MobileScanInput, PairMobileDeviceInput, PairedMobileSessionDto,
    UserRole,
};
use crate::services::attendance_service;
use crate::services::audit_service::record_audit;
use crate::state::AppState;
use argon2::password_hash::rand_core::{OsRng, RngCore};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::Local;
use hyper_util::{
    rt::{TokioExecutor, TokioIo},
    server::conn::auto::Builder as AutoConnBuilder,
    service::TowerToHyperService,
};
use qrcode::{render::svg, EcLevel, QrCode};
use rcgen::{
    date_time_ymd, BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType,
    ExtendedKeyUsagePurpose, IsCa, KeyIdMethod, KeyPair, KeyUsagePurpose, SerialNumber,
};
use rustls::pki_types::{PrivateKeyDer, PrivatePkcs8KeyDer};
use serde_json::json;
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tokio_rustls::TlsAcceptor;
use tower_http::cors::{Any, CorsLayer};

// Biblioteca jsQR offline embebida para que el escáner móvil funcione 100% en LAN sin Internet
const JSQR_BUNDLE: &str = include_str!("../../assets/jsQR.js");

// ============================================================================
// CERTIFICADO CA RAÍZ LOCAL + TLS MULTI-IP DINÁMICO (RUST PURO: RCGEN + RUSTLS)
// ============================================================================

fn build_root_ca_params() -> Result<CertificateParams, AppError> {
    let mut params = CertificateParams::new(Vec::<String>::new())
        .map_err(|e| AppError::Internal(format!("Error configurando parámetros CA: {}", e)))?;
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    params.distinguished_name = DistinguishedName::new();
    params
        .distinguished_name
        .push(DnType::CommonName, "ZaramaGYM Local Root CA");
    params
        .distinguished_name
        .push(DnType::OrganizationName, "ZaramaGYM");
    params.not_before = date_time_ymd(2026, 1, 1);
    params.not_after = date_time_ymd(2036, 1, 1);
    params.serial_number = Some(SerialNumber::from(1u64));
    params.key_identifier_method = KeyIdMethod::Sha256;
    params.key_usages = vec![
        KeyUsagePurpose::KeyCertSign,
        KeyUsagePurpose::CrlSign,
        KeyUsagePurpose::DigitalSignature,
    ];
    Ok(params)
}

/// Obtiene o inicializa de manera persistente en SQLite la Autoridad Certificadora (CA) raíz local.
/// Así, iOS y Android solo necesitan confiar en zaramagym-root-ca.crt una sola vez aunque la PC reinicie.
async fn ensure_or_load_root_ca(
    pool: &SqlitePool,
) -> Result<(String, Certificate, KeyPair), AppError> {
    let key_row = sqlx::query(
        "SELECT valor FROM configuracion_sistema WHERE clave = 'LAN_CA_KEY_PEM'",
    )
    .fetch_optional(pool)
    .await?;

    let saved_key_pem = key_row
        .and_then(|r| r.get::<Option<String>, _>("valor"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let ca_key = if let Some(pem_str) = saved_key_pem {
        match KeyPair::from_pem(&pem_str) {
            Ok(kp) => kp,
            Err(_) => KeyPair::generate()
                .map_err(|e| AppError::Internal(format!("Error generando par CA: {}", e)))?,
        }
    } else {
        KeyPair::generate()
            .map_err(|e| AppError::Internal(format!("Error generando par CA: {}", e)))?
    };

    let ca_params = build_root_ca_params()?;
    let ca_cert = ca_params
        .self_signed(&ca_key)
        .map_err(|e| AppError::Internal(format!("Error autofirmando CA raíz: {}", e)))?;

    let ca_cert_pem = ca_cert.pem();
    let ca_key_pem = ca_key.serialize_pem();

    sqlx::query(
        "INSERT INTO configuracion_sistema (clave, valor, descripcion, updated_at) \
         VALUES ('LAN_CA_KEY_PEM', ?, 'Llave privada CA raíz local LAN', datetime('now', 'localtime')) \
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = datetime('now', 'localtime')",
    )
    .bind(&ca_key_pem)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO configuracion_sistema (clave, valor, descripcion, updated_at) \
         VALUES ('LAN_CA_CERT_PEM', ?, 'Certificado público CA raíz local LAN', datetime('now', 'localtime')) \
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = datetime('now', 'localtime')",
    )
    .bind(&ca_cert_pem)
    .execute(pool)
    .await?;

    Ok((ca_cert_pem, ca_cert, ca_key))
}

/// Construye el `TlsAcceptor` para el servidor HTTPS emitiendo un certificado hoja válido para
/// localhost, sistema.local y TODAS las IPs LAN privadas activas (Wi-Fi y Ethernet).
async fn build_server_tls_acceptor(
    pool: &SqlitePool,
) -> Result<(TlsAcceptor, String), AppError> {
    let (ca_pem, ca_cert, ca_key) = ensure_or_load_root_ca(pool).await?;

    let mdns_hostname = sqlx::query(
        "SELECT valor FROM configuracion_sistema WHERE clave = 'LAN_MDNS_HOSTNAME'",
    )
    .fetch_optional(pool)
    .await?
    .and_then(|r| r.get::<Option<String>, _>("valor"))
    .unwrap_or_else(|| "sistema.local".to_string());

    let mut sans = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        mdns_hostname,
    ];
    for ip in get_lan_interface_ips() {
        if !sans.contains(&ip) {
            sans.push(ip);
        }
    }

    let mut server_params = CertificateParams::new(sans)
        .map_err(|e| AppError::Internal(format!("Error configurando SANs TLS: {}", e)))?;
    server_params.distinguished_name = DistinguishedName::new();
    server_params
        .distinguished_name
        .push(DnType::CommonName, "ZaramaGYM LAN Scanner");
    server_params
        .distinguished_name
        .push(DnType::OrganizationName, "ZaramaGYM");
    server_params.not_before = date_time_ymd(2026, 1, 1);
    server_params.not_after = date_time_ymd(2030, 12, 31);
    server_params.key_usages = vec![
        KeyUsagePurpose::DigitalSignature,
        KeyUsagePurpose::KeyEncipherment,
    ];
    server_params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];

    let server_key = KeyPair::generate()
        .map_err(|e| AppError::Internal(format!("Error generando llave TLS servidor: {}", e)))?;
    let server_cert = server_params
        .signed_by(&server_key, &ca_cert, &ca_key)
        .map_err(|e| AppError::Internal(format!("Error firmando certificado TLS servidor: {}", e)))?;

    let cert_chain = vec![server_cert.der().clone(), ca_cert.der().clone()];
    let key_der = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(server_key.serialize_der()));

    let mut tls_config = rustls::ServerConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|e| AppError::Internal(format!("Error versiones TLS: {}", e)))?
    .with_no_client_auth()
    .with_single_cert(cert_chain, key_der)
    .map_err(|e| AppError::Internal(format!("Error configuración certificado TLS: {}", e)))?;

    tls_config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];

    Ok((TlsAcceptor::from(Arc::new(tls_config)), ca_pem))
}

async fn get_active_ca_pem(state: &AppState) -> String {
    let cached = state.lan_ca_pem.read().await.clone();
    if !cached.is_empty() {
        return cached;
    }

    if let Ok((pem, _, _)) = ensure_or_load_root_ca(&state.pool()).await {
        let mut guard = state.lan_ca_pem.write().await;
        *guard = pem.clone();
        return pem;
    }

    String::new()
}

pub fn get_ca_fingerprint_from_pem(pem_str: &str) -> String {
    use sha2::{Digest, Sha256};

    if pem_str.trim().is_empty() {
        return String::new();
    }

    let mut hasher = Sha256::new();
    // Si tiene bloque PEM base64 válido, calcular SHA-256 sobre el DER (igual que iOS/Android)
    let der_b64: String = pem_str
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .map(|line| line.trim())
        .collect();

    if let Ok(der_bytes) = general_purpose::STANDARD.decode(der_b64) {
        if !der_bytes.is_empty() {
            hasher.update(&der_bytes);
        } else {
            hasher.update(pem_str.as_bytes());
        }
    } else {
        hasher.update(pem_str.as_bytes());
    }

    let result = hasher.finalize();
    result
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<String>>()
        .join(":")
}

// ============================================================================
// DETECCIÓN MULTI-INTERFAZ LAN Y GENERADOR DE CÓDIGOS QR REALES (ISO 18004)
// ============================================================================

fn is_private_lan_v4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    (octets[0] == 192 && octets[1] == 168)
        || octets[0] == 10
        || (octets[0] == 172 && (16..=31).contains(&octets[1]))
}

fn is_virtual_interface_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("vethernet")
        || lower.contains("vmware")
        || lower.contains("virtualbox")
        || lower.contains("wsl")
        || lower.contains("hyper-v")
        || lower.contains("docker")
        || lower.contains("tailscale")
        || lower.contains("zerotier")
        || lower.contains("bluetooth")
}

/// Enumera todas las IPs IPv4 LAN reales priorizando adaptadores físicos Wi-Fi y Ethernet
pub fn get_lan_interface_ips() -> Vec<String> {
    let mut ranked: Vec<(u8, String)> = Vec::new();

    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            if let if_addrs::IfAddr::V4(v4) = iface.addr {
                let ip = v4.ip;
                if ip.is_loopback()
                    || ip.is_link_local()
                    || ip.is_unspecified()
                    || ip.is_multicast()
                {
                    continue;
                }

                let lower_name = iface.name.to_lowercase();
                let is_wifi = lower_name.contains("wi-fi")
                    || lower_name.contains("wifi")
                    || lower_name.contains("wlan");
                let is_eth = lower_name.contains("ethernet");
                let is_virt = is_virtual_interface_name(&iface.name);
                let is_priv = is_private_lan_v4(ip);

                let priority = if is_priv && !is_virt && is_wifi {
                    0
                } else if is_priv && !is_virt && is_eth {
                    1
                } else if is_priv && !is_virt {
                    2
                } else if is_priv {
                    3
                } else {
                    4
                };

                ranked.push((priority, ip.to_string()));
            }
        }
    }

    ranked.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    let mut unique: Vec<String> = Vec::new();
    for (_, ip) in ranked {
        if !unique.contains(&ip) {
            unique.push(ip);
        }
    }

    if unique.is_empty() {
        if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
            if socket.connect("8.8.8.8:80").is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    let ip = addr.ip().to_string();
                    if !ip.is_empty() && ip != "0.0.0.0" && !ip.starts_with("169.254.") {
                        unique.push(ip);
                    }
                }
            }
        }
    }

    if unique.is_empty() {
        unique.push("127.0.0.1".to_string());
    }

    unique
}

pub fn detect_primary_ip() -> String {
    get_lan_interface_ips()
        .into_iter()
        .next()
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

pub fn get_local_ips(primary: &str) -> Vec<String> {
    let mut ips = get_lan_interface_ips();
    if !ips.iter().any(|ip| ip == primary) {
        ips.insert(0, primary.to_string());
    }
    if !ips.iter().any(|ip| ip == "127.0.0.1") {
        ips.push("127.0.0.1".to_string());
    }
    ips
}

/// Genera un código QR SVG ISO-18004 auténtico codificado en Base64 listo para `<img>`
pub fn generate_qr_svg_data_url(content: &str) -> Result<String, AppError> {
    let code = QrCode::with_error_correction_level(content.as_bytes(), EcLevel::M)
        .map_err(|e| AppError::Internal(format!("No se pudo codificar código QR: {}", e)))?;

    let svg_xml = code
        .render::<svg::Color>()
        .min_dimensions(260, 260)
        .quiet_zone(true)
        .dark_color(svg::Color("#0f172a"))
        .light_color(svg::Color("#ffffff"))
        .build();

    let encoded = general_purpose::STANDARD.encode(svg_xml.as_bytes());
    Ok(format!("data:image/svg+xml;base64,{}", encoded))
}

// Genera un código de emparejamiento de 6 caracteres alfanuméricos legibles
pub fn generate_pairing_code() -> String {
    const CHARSET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    let mut bytes = [0u8; 6];
    OsRng.fill_bytes(&mut bytes);
    bytes
        .iter()
        .map(|&b| CHARSET[(b as usize) % CHARSET.len()] as char)
        .collect()
}

// Genera un token Bearer CSPRNG de 32 caracteres hexadecimales
pub fn generate_session_token() -> String {
    let mut bytes = [0u8; 16];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

// ============================================================================
// PÁGINA WEB EMBEBIDA PWA (VISTAS M1 & M2 CON CÁMARA REAL + JSQR OFFLINE)
// ============================================================================

pub const SCANNER_HTML: &str = r#"<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ZaramaGYM Escáner Móvil</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; }
    header { background-color: #1e293b; padding: 14px 18px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-size: 1.2rem; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    .badge-lan { font-size: 0.75rem; background-color: #065f46; color: #34d399; padding: 3px 8px; border-radius: 9999px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
    .badge-lan::before { content: ""; width: 7px; height: 7px; background-color: #10b981; border-radius: 50%; display: inline-block; }
    main { flex: 1; padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
    .card { background-color: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 22px; width: 100%; max-width: 420px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4); }
    h2 { font-size: 1.35rem; margin-bottom: 8px; text-align: center; color: #f1f5f9; }
    p.subtitle { font-size: 0.85rem; color: #94a3b8; text-align: center; margin-bottom: 18px; line-height: 1.4; }
    .input-code { width: 100%; text-align: center; font-size: 2rem; font-weight: 800; letter-spacing: 6px; text-transform: uppercase; padding: 12px; border-radius: 10px; border: 2px solid #475569; background-color: #0f172a; color: #38bdf8; margin-bottom: 16px; outline: none; }
    .input-code:focus { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.3); }
    .btn { display: block; width: 100%; padding: 12px; border-radius: 10px; font-size: 0.95rem; font-weight: 700; border: none; cursor: pointer; transition: background 0.2s, transform 0.1s; text-align: center; }
    .btn:active { transform: scale(0.98); }
    .btn-primary { background-color: #0284c7; color: white; }
    .btn-emerald { background-color: #059669; color: white; }
    .btn-amber { background-color: #d97706; color: white; }
    .btn-outline { background: transparent; border: 1px solid #475569; color: #cbd5e1; margin-top: 10px; }
    .scanner-box { width: 100%; max-width: 380px; height: 280px; background: #020617; border: 2px solid #38bdf8; border-radius: 14px; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .scan-guide { position: absolute; width: 72%; height: 72%; border: 2px solid rgba(52, 211, 153, 0.85); border-radius: 10px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.45); pointer-events: none; z-index: 2; }
    .laser { position: absolute; width: 70%; height: 2px; background: #10b981; box-shadow: 0 0 10px #10b981; animation: scanning 2s infinite ease-in-out; z-index: 3; pointer-events: none; }
    @keyframes scanning { 0% { top: 18%; } 50% { top: 80%; } 100% { top: 18%; } }
    .cam-status { position: absolute; bottom: 8px; left: 8px; right: 8px; text-align: center; font-size: 0.72rem; background: rgba(15, 23, 42, 0.82); color: #e2e8f0; padding: 4px 8px; border-radius: 6px; z-index: 4; }
    .warning-banner { width: 100%; max-width: 380px; background: #451a03; border: 1px solid #d97706; color: #fef3c7; border-radius: 10px; padding: 10px 12px; font-size: 0.8rem; line-height: 1.4; display: none; flex-direction: column; gap: 8px; }
    .controls-row { width: 100%; max-width: 380px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .manual-dni-card { width: 100%; max-width: 380px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .input-text { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background-color: #0f172a; color: #f8fafc; font-size: 0.95rem; }
    .select-cam { width: 100%; max-width: 380px; padding: 8px 10px; border-radius: 8px; border: 1px solid #475569; background: #1e293b; color: #f8fafc; font-size: 0.8rem; display: none; }
    .overlay { position: fixed; inset: 0; z-index: 100; display: none; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; }
    .overlay.VERDE { background-color: #059669; }
    .overlay.AMARILLO { background-color: #d97706; }
    .overlay.ROJO { background-color: #dc2626; }
    .overlay h1 { font-size: 2rem; font-weight: 900; margin-bottom: 6px; text-transform: uppercase; }
    .overlay h2 { font-size: 1.45rem; margin-bottom: 10px; }
    .overlay p { font-size: 1.05rem; margin-bottom: 6px; opacity: 0.95; }
    .overlay .alert-box { background: rgba(0,0,0,0.28); border-radius: 12px; padding: 16px; max-width: 360px; width: 100%; margin: 14px 0; }
  </style>
</head>
<body>
  <header>
    <div class="logo">⚡ ZaramaGYM</div>
    <div class="badge-lan" id="statusBadge">LAN :3443</div>
  </header>

  <!-- VISTA M1: VINCULACIÓN POR CÓDIGO -->
  <main id="viewM1" style="display: none;">
    <div class="card">
      <h2>Vincular Celular</h2>
      <p class="subtitle">Conecta este teléfono a la red Wi-Fi del gimnasio e introduce el código de 6 caracteres generado en la PC principal.</p>
      <input type="text" id="pairInput" class="input-code" maxlength="6" placeholder="K9M2PX" autofocus>
      <button class="btn btn-primary" id="btnPair">🔗 Vincular este Teléfono</button>
      <a href="/api/lan/ca.pem" download="zaramagym-root-ca.crt" class="btn btn-outline" style="text-decoration: none; font-size: 0.85rem;">📥 Descargar Certificado CA Local</a>
      <p style="font-size: 0.72rem; color: #94a3b8; text-align: center; margin-top: 12px; line-height: 1.4;">
        Para habilitar la cámara en vivo en iOS/Android usa siempre <strong>HTTPS</strong>. Si tu navegador muestra alerta de certificado local, pulsa <em>Avanzado → Continuar</em> o instala el certificado CA arriba.
      </p>
    </div>
  </main>

  <!-- VISTA M2: ESCÁNER DE ASISTENCIA & SEMÁFORO -->
  <main id="viewM2" style="display: none;">
    <div style="width: 100%; max-width: 380px; display: flex; justify-content: space-between; align-items: center;">
      <span id="devNameLabel" style="font-size: 0.85rem; color: #94a3b8; font-weight: 600;">📱 Dispositivo Vinculado</span>
      <button id="btnUnlink" style="background: none; border: none; color: #f87171; font-size: 0.8rem; cursor: pointer; text-decoration: underline;">Desvincular</button>
    </div>

    <!-- Aviso automático si abrió sin HTTPS (getUserMedia bloqueado por el navegador) -->
    <div id="insecureHttpsBanner" class="warning-banner">
      <span>⚠️ Para activar el escaneo automático en vivo por video necesitas conexión segura <strong>HTTPS</strong> (o usar el botón de captura por foto abajo).</span>
      <button type="button" id="btnSwitchHttps" class="btn btn-amber" style="padding: 8px; font-size: 0.82rem;">🔒 Cambiar a Modo HTTPS (Cámara en Vivo)</button>
    </div>

    <select id="cameraSelect" class="select-cam"></select>

    <div class="scanner-box">
      <div class="scan-guide"></div>
      <div class="laser"></div>
      <video id="videoPreview" autoplay playsinline muted style="width:100%; height:100%; object-fit: cover;"></video>
      <div id="camStatus" class="cam-status">Iniciando cámara trasera...</div>
    </div>

    <div class="controls-row">
      <button type="button" id="btnStartCam" class="btn btn-emerald" style="font-size: 0.82rem; padding: 10px 8px;">📷 Activar Cámara</button>
      <label for="qrFileInput" class="btn btn-outline" style="margin-top: 0; font-size: 0.82rem; padding: 10px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
        📸 Foto QR
        <input type="file" id="qrFileInput" accept="image/*" capture="environment" style="display: none;">
      </label>
    </div>

    <div class="manual-dni-card">
      <div style="display: flex; gap: 6px;">
        <input type="text" id="qrTextInput" class="input-text" placeholder="Pegar token QR (ZG-...)" style="margin-bottom: 0; font-size: 0.85rem;">
        <button type="button" class="btn btn-emerald" id="btnSendQrText" style="width: auto; padding: 0 14px; font-size: 0.82rem;">Validar</button>
      </div>
      <div style="display: flex; gap: 6px;">
        <input type="text" id="dniInput" class="input-text" placeholder="Ingreso manual por DNI / CE" style="margin-bottom: 0; font-size: 0.85rem;">
        <button type="button" class="btn btn-primary" id="btnSendManual" style="width: auto; padding: 0 14px; font-size: 0.82rem;">DNI</button>
      </div>
    </div>
  </main>

  <canvas id="scanCanvas" style="display: none;"></canvas>

  <!-- OVERLAY SEMAFÓRICO COMPLETO -->
  <div id="trafficOverlay" class="overlay">
    <div id="overlayIcon" style="font-size: 5rem; margin-bottom: 10px;">✅</div>
    <h1 id="overlayTitle">ACCESO PERMITIDO</h1>
    <h2 id="overlayClientName">Socio</h2>
    <div class="alert-box">
      <p id="overlayPlan">Plan</p>
      <p id="overlayDays" style="font-weight: 700;">¡Pasa adelante!</p>
      <p id="overlayReason" style="font-size: 0.9rem; margin-top: 4px;"></p>
    </div>
    <button id="overlayCloseBtn" class="btn btn-outline" style="background: white; color: #0f172a; max-width: 240px; display: none;">Cerrar y Continuar</button>
  </div>

  <script src="/assets/jsqr.js"></script>
  <script>
    let audioCtx = null;
    function unlockAudio() {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
      } catch (e) {}
    }

    function playBeep(color) {
      try {
        unlockAudio();
        if (!audioCtx) return;
        if (color === 'VERDE') {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.15);
        } else if (color === 'AMARILLO') {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(660, audioCtx.currentTime);
          osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12);
          gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.28);
        } else {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, audioCtx.currentTime);
          gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.35);
        }
      } catch (e) {}
    }

    // Gestión de vistas M1 y M2
    const params = new URLSearchParams(window.location.search);
    const pairParam = params.get('pair') || params.get('code');
    let currentStream = null;
    let rafId = null;
    let lastDecodedCode = '';
    let lastDecodedAt = 0;
    let scanBusy = false;
    let overlayOpen = false;
    let barcodeDetector = null;
    if ('BarcodeDetector' in window) {
      try { barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {}
    }

    document.getElementById('statusBadge').textContent = (window.location.protocol === 'https:' ? '🔒 HTTPS ' : '⚠️ HTTP ') + (window.location.port || '3443');

    if (!window.isSecureContext && window.location.protocol !== 'https:') {
      document.getElementById('insecureHttpsBanner').style.display = 'flex';
    }
    document.getElementById('btnSwitchHttps').addEventListener('click', () => {
      window.location.href = 'https://' + window.location.host + window.location.pathname + window.location.search;
    });

    if (localStorage.getItem('zarama_mobile_token')) {
      showM2();
    } else {
      showM1();
      if (pairParam) {
        document.getElementById('pairInput').value = pairParam.toUpperCase();
      }
    }

    function showM1() {
      stopCamera();
      document.getElementById('viewM1').style.display = 'flex';
      document.getElementById('viewM2').style.display = 'none';
    }

    function showM2() {
      document.getElementById('viewM1').style.display = 'none';
      document.getElementById('viewM2').style.display = 'flex';
      document.getElementById('devNameLabel').textContent = '📱 ' + (localStorage.getItem('zarama_mobile_name') || 'Móvil Vinculado');
      startCamera();
    }

    document.getElementById('btnPair').addEventListener('click', async () => {
      unlockAudio();
      const code = document.getElementById('pairInput').value.trim().toUpperCase();
      if (!code) return alert('Por favor ingrese el código de 6 caracteres.');
      try {
        const res = await fetch('/api/lan/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigoVinculacion: code, userAgent: navigator.userAgent })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return alert('Error vinculando: ' + (err.error || res.statusText));
        }
        const data = await res.json();
        localStorage.setItem('zarama_mobile_token', data.tokenSesion);
        localStorage.setItem('zarama_mobile_name', data.nombreDispositivo);
        showM2();
      } catch (e) {
        alert('Fallo de conexión con el servidor LAN ZaramaGYM: ' + e.message);
      }
    });

    document.getElementById('btnUnlink').addEventListener('click', () => {
      if (confirm('¿Desvincular este teléfono?')) {
        localStorage.removeItem('zarama_mobile_token');
        localStorage.removeItem('zarama_mobile_name');
        showM1();
      }
    });

    function stopCamera() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
      }
    }

    async function populateCameras() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter(d => d.kind === 'videoinput');
        const sel = document.getElementById('cameraSelect');
        if (videos.length > 1) {
          sel.innerHTML = '';
          videos.forEach((d, idx) => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || ('Cámara ' + (idx + 1));
            sel.appendChild(opt);
          });
          sel.style.display = 'block';
        }
      } catch (e) {}
    }

    async function startCamera(selectedDeviceId) {
      stopCamera();
      const statusEl = document.getElementById('camStatus');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusEl.textContent = 'Cámara en vivo requiere abrir por HTTPS (o usa 📸 Foto QR).';
        return;
      }
      statusEl.textContent = 'Solicitando permiso de cámara...';
      try {
        const constraints = {
          audio: false,
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        const video = document.getElementById('videoPreview');
        video.srcObject = currentStream;
        await video.play();
        statusEl.textContent = 'Escáner activo • Apunta al QR del socio';
        await populateCameras();
        rafId = requestAnimationFrame(scanVideoFrame);
      } catch (err) {
        statusEl.textContent = 'Cámara bloqueada o sin permiso (' + err.name + '). Pulsa Activar Cámara o usa 📸 Foto QR.';
      }
    }

    async function scanVideoFrame() {
      const video = document.getElementById('videoPreview');
      if (!currentStream || video.readyState < 2 || overlayOpen || scanBusy) {
        if (currentStream) rafId = requestAnimationFrame(scanVideoFrame);
        return;
      }

      const canvas = document.getElementById('scanCanvas');
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const scale = Math.min(1, 640 / Math.max(vw, vh));
      const w = Math.max(1, Math.floor(vw * scale));
      const h = Math.max(1, Math.floor(vh * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);

      let decoded = null;
      if (typeof window.jsQR === 'function') {
        const imageData = ctx.getImageData(0, 0, w, h);
        const result = window.jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (result && result.data) decoded = result.data;
      }
      if (!decoded && barcodeDetector) {
        try {
          const codes = await barcodeDetector.detect(canvas);
          if (codes && codes.length > 0 && codes[0].rawValue) decoded = codes[0].rawValue;
        } catch (e) {}
      }

      if (decoded) {
        await handleDetectedQrString(decoded);
      }
      if (currentStream) rafId = requestAnimationFrame(scanVideoFrame);
    }

    async function handleDetectedQrString(raw) {
      const cleaned = String(raw || '').trim();
      if (!cleaned) return;
      const now = Date.now();
      if (cleaned === lastDecodedCode && (now - lastDecodedAt) < 2800) {
        return;
      }
      lastDecodedCode = cleaned;
      lastDecodedAt = now;
      if (navigator.vibrate) try { navigator.vibrate(80); } catch (e) {}
      document.getElementById('camStatus').textContent = 'QR leído: ' + cleaned + ' • Validando...';
      await sendScan({ qrToken: cleaned });
    }

    document.getElementById('btnStartCam').addEventListener('click', () => {
      unlockAudio();
      const sel = document.getElementById('cameraSelect');
      startCamera(sel.value || undefined);
    });
    document.getElementById('cameraSelect').addEventListener('change', (e) => {
      startCamera(e.target.value);
    });

    // Decodificación desde foto (Funciona incluso por HTTP en iOS y Android)
    document.getElementById('qrFileInput').addEventListener('change', (e) => {
      unlockAudio();
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = async () => {
        URL.revokeObjectURL(objUrl);
        const canvas = document.getElementById('scanCanvas');
        const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const result = typeof window.jsQR === 'function'
          ? window.jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' })
          : null;
        if (result && result.data) {
          await handleDetectedQrString(result.data);
        } else {
          alert('No se detectó un código QR nítido en la fotografía. Intenta acercar un poco más.');
        }
        e.target.value = '';
      };
      img.src = objUrl;
    });

    document.getElementById('btnSendQrText').addEventListener('click', async () => {
      unlockAudio();
      const val = document.getElementById('qrTextInput').value.trim();
      if (!val) return alert('Pega o escribe el token QR.');
      await sendScan({ qrToken: val });
      document.getElementById('qrTextInput').value = '';
    });

    document.getElementById('btnSendManual').addEventListener('click', async () => {
      unlockAudio();
      const dni = document.getElementById('dniInput').value.trim();
      if (!dni) return alert('Ingrese el DNI.');
      await sendScan({ numeroDocumento: dni });
      document.getElementById('dniInput').value = '';
    });

    async function sendScan(payload) {
      const curToken = localStorage.getItem('zarama_mobile_token');
      if (!curToken) {
        alert('El dispositivo no está vinculado.');
        return showM1();
      }
      if (scanBusy) return;
      scanBusy = true;
      try {
        const res = await fetch('/api/lan/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + curToken
          },
          body: JSON.stringify(payload)
        });
        if (res.status === 401) {
          alert('Dispositivo revocado o no autorizado. Se desvinculará este teléfono.');
          localStorage.removeItem('zarama_mobile_token');
          return showM1();
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          document.getElementById('camStatus').textContent = err.error || 'QR no reconocido';
          alert('Error en escaneo: ' + (err.error || res.statusText));
          return;
        }
        const evalData = await res.json();
        showTrafficLight(evalData);
      } catch (e) {
        alert('Error conectando al servidor LAN: ' + e.message);
      } finally {
        scanBusy = false;
      }
    }

    let overlayTimeout = null;
    function closeOverlay() {
      if (overlayTimeout) clearTimeout(overlayTimeout);
      document.getElementById('trafficOverlay').style.display = 'none';
      overlayOpen = false;
      document.getElementById('camStatus').textContent = currentStream
        ? 'Escáner activo • Apunta al QR del socio'
        : 'Cámara inactiva';
    }

    function showTrafficLight(data) {
      if (overlayTimeout) clearTimeout(overlayTimeout);
      overlayOpen = true;
      const overlay = document.getElementById('trafficOverlay');
      const icon = document.getElementById('overlayIcon');
      const title = document.getElementById('overlayTitle');
      const clientName = document.getElementById('overlayClientName');
      const plan = document.getElementById('overlayPlan');
      const days = document.getElementById('overlayDays');
      const reason = document.getElementById('overlayReason');
      const closeBtn = document.getElementById('overlayCloseBtn');

      overlay.className = 'overlay ' + data.colorSemaforo;
      clientName.textContent = data.nombreCompleto || 'Cliente';
      plan.textContent = data.nombrePlan || '';
      reason.textContent = data.motivoSemaforo || '';

      playBeep(data.colorSemaforo);

      if (data.colorSemaforo === 'VERDE') {
        icon.textContent = '✅';
        title.textContent = 'ACCESO CONCEDIDO';
        days.textContent = data.diasRestantes != null ? `¡Pasa adelante! Quedan ${data.diasRestantes} días` : '¡Pasa adelante!';
        closeBtn.style.display = 'block';
        closeBtn.textContent = 'Continuar Escaneando';
        overlay.style.display = 'flex';
        overlayTimeout = setTimeout(closeOverlay, 2500);
      } else if (data.colorSemaforo === 'AMARILLO') {
        icon.textContent = '⚠️';
        title.textContent = 'ALERTA PREVENTIVA';
        days.textContent = data.diasRestantes != null ? `¡Vence en ${data.diasRestantes} días!` : 'Revisar membresía';
        closeBtn.style.display = 'block';
        closeBtn.textContent = 'Continuar Escaneando';
        overlay.style.display = 'flex';
        overlayTimeout = setTimeout(closeOverlay, 3500);
      } else {
        icon.textContent = '🚫';
        title.textContent = 'ACCESO BLOQUEADO';
        days.textContent = 'POR FAVOR DIRÍJASE A CAJA';
        closeBtn.style.display = 'block';
        closeBtn.textContent = 'Cerrar y Escanear Siguiente';
        overlay.style.display = 'flex';
      }
    }

    document.getElementById('overlayCloseBtn').addEventListener('click', closeOverlay);
  </script>
</body>
</html>
"#;

// ============================================================================
// ROUTER AXUM, SERVIDOR DUAL HTTPS/HTTP EN :3443 Y ENDPOINTS
// ============================================================================

pub fn create_lan_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/", get(handle_scanner_page))
        .route("/scanner", get(handle_scanner_page))
        .route("/assets/jsqr.js", get(handle_jsqr_asset))
        .route("/api/lan/ping", get(handle_lan_ping))
        .route("/api/lan/ca.pem", get(handle_lan_ca_pem))
        .route("/api/lan/pair", post(handle_lan_pair))
        .route("/api/lan/scan", post(handle_lan_scan))
        .layer(cors)
        .with_state(state)
}

async fn handle_scanner_page() -> impl IntoResponse {
    Html(SCANNER_HTML)
}

async fn handle_jsqr_asset() -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        "application/javascript; charset=utf-8".parse().unwrap(),
    );
    headers.insert(
        header::CACHE_CONTROL,
        "public, max-age=86400".parse().unwrap(),
    );
    (StatusCode::OK, headers, JSQR_BUNDLE)
}

async fn handle_lan_ping(State(state): State<AppState>) -> impl IntoResponse {
    let port = *state.lan_server_port.read().await;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let body = json!({
        "status": "ok",
        "gym": "ZaramaGYM",
        "hostname": "sistema.local",
        "port": port,
        "serverTime": now
    });
    (StatusCode::OK, Json(body))
}

async fn handle_lan_ca_pem(State(state): State<AppState>) -> impl IntoResponse {
    let ca_pem = get_active_ca_pem(&state).await;
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        "application/x-x509-ca-cert".parse().unwrap(),
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        "attachment; filename=\"zaramagym-root-ca.crt\""
            .parse()
            .unwrap(),
    );
    (StatusCode::OK, headers, ca_pem)
}

async fn handle_lan_pair(
    State(state): State<AppState>,
    Json(input): Json<PairMobileDeviceInput>,
) -> Response {
    match pair_mobile_device(&state.pool(), input).await {
        Ok(dto) => (StatusCode::OK, Json(dto)).into_response(),
        Err(AppError::NotFound(msg)) => {
            (StatusCode::NOT_FOUND, Json(json!({ "error": msg }))).into_response()
        }
        Err(AppError::Conflict(msg)) => {
            (StatusCode::CONFLICT, Json(json!({ "error": msg }))).into_response()
        }
        Err(AppError::Validation(msg)) => {
            (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

async fn handle_lan_scan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut input): Json<MobileScanInput>,
) -> Response {
    if input
        .token_sesion
        .as_ref()
        .map(|s| s.trim().is_empty())
        .unwrap_or(true)
    {
        if let Some(auth_val) = headers.get(header::AUTHORIZATION) {
            if let Ok(auth_str) = auth_val.to_str() {
                if let Some(bearer_token) = auth_str.strip_prefix("Bearer ") {
                    input.token_sesion = Some(bearer_token.trim().to_string());
                }
            }
        }
    }

    match mobile_scan_qr(&state.pool(), &state, input).await {
        Ok(dto) => (StatusCode::OK, Json(dto)).into_response(),
        Err(AppError::Unauthorized(msg)) => {
            (StatusCode::UNAUTHORIZED, Json(json!({ "error": msg }))).into_response()
        }
        Err(AppError::NotFound(msg)) => {
            (StatusCode::NOT_FOUND, Json(json!({ "error": msg }))).into_response()
        }
        Err(AppError::Validation(msg)) => {
            (StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "error": msg }))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// Arranca el listener TCP dual HTTPS (TLS rustls) + HTTP en el puerto configurado
pub async fn start_lan_server(state: &AppState) -> Result<(), AppError> {
    if *state.lan_server_running.read().await {
        return Ok(());
    }

    let port = *state.lan_server_port.read().await;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        AppError::Internal(format!("No se pudo enlazar el puerto TCP {}: {}", port, e))
    })?;

    let (tls_acceptor_opt, ca_pem) = match build_server_tls_acceptor(&state.pool()).await {
        Ok((acc, pem)) => (Some(acc), pem),
        Err(e) => {
            eprintln!("[LAN] Aviso TLS fallback HTTP: {}", e);
            (None, get_active_ca_pem(state).await)
        }
    };

    if !ca_pem.is_empty() {
        let mut ca_guard = state.lan_ca_pem.write().await;
        *ca_guard = ca_pem;
    }

    let (tx, mut rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut stop_guard = state.lan_server_stop_tx.write().await;
        *stop_guard = Some(tx);
    }
    {
        let mut run_guard = state.lan_server_running.write().await;
        *run_guard = true;
    }

    let router = create_lan_router(state.clone());
    let state_clone = state.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut rx => {
                    break;
                }
                accepted = listener.accept() => {
                    let Ok((stream, _peer)) = accepted else {
                        continue;
                    };
                    let router_svc = router.clone();
                    let acceptor = tls_acceptor_opt.clone();

                    tokio::spawn(async move {
                        let mut peek_buf = [0u8; 1];
                        let is_tls = matches!(stream.peek(&mut peek_buf).await, Ok(1) if peek_buf[0] == 0x16);

                        let hyper_svc = TowerToHyperService::new(router_svc);
                        let builder = AutoConnBuilder::new(TokioExecutor::new());

                        if is_tls {
                            if let Some(tls_acc) = acceptor {
                                if let Ok(tls_stream) = tls_acc.accept(stream).await {
                                    let _ = builder
                                        .serve_connection(TokioIo::new(tls_stream), hyper_svc)
                                        .await;
                                }
                            }
                        } else {
                            // Asegurar al menos un peek completado antes de pasar al servidor HTTP
                            let _ = builder
                                .serve_connection(TokioIo::new(stream), hyper_svc)
                                .await;
                        }
                    });
                }
            }
        }

        let mut run_guard = state_clone.lan_server_running.write().await;
        *run_guard = false;
    });

    Ok(())
}

// Eliminamos warning si AsyncReadExt no se usa directamente en el socket
#[allow(dead_code)]
async fn _read_helper<T: AsyncReadExt + Unpin>(_s: &mut T) {}

// ============================================================================
// LÓGICA DE NEGOCIO Y PERSISTENCIA (LAN SERVICE)
// ============================================================================

/// Obtiene el estado consolidado del servidor LAN y estadísticas de dispositivos
pub async fn get_lan_server_status(state: &AppState) -> Result<LanServerStatusDto, AppError> {
    let is_running = *state.lan_server_running.read().await;
    let port = *state.lan_server_port.read().await;
    let primary_ip = detect_primary_ip();
    let local_ips = get_local_ips(&primary_ip);
    let https_url = format!("https://{}:{}/scanner", primary_ip, port);
    let http_url = format!("http://{}:{}/scanner", primary_ip, port);

    let mdns_row = sqlx::query(
        "SELECT valor FROM configuracion_sistema WHERE clave = 'LAN_MDNS_HOSTNAME'",
    )
    .fetch_optional(&state.pool())
    .await?;
    let mdns_hostname = mdns_row
        .and_then(|r| r.get::<Option<String>, _>("valor"))
        .unwrap_or_else(|| "sistema.local".to_string());

    let ca_cert_pem = get_active_ca_pem(state).await;
    let ca_cert_fingerprint_sha256 = get_ca_fingerprint_from_pem(&ca_cert_pem);

    let linked_count_row = sqlx::query(
        "SELECT COUNT(*) as c FROM dispositivos_moviles WHERE estado_vinculacion = 'VINCULADO' AND estado_activo = 1",
    )
    .fetch_one(&state.pool())
    .await?;
    let total_devices_linked: i64 = linked_count_row.get("c");

    let pending_count_row = sqlx::query(
        "SELECT COUNT(*) as c FROM dispositivos_moviles WHERE estado_vinculacion = 'PENDIENTE_VINCULACION' AND estado_activo = 1",
    )
    .fetch_one(&state.pool())
    .await?;
    let total_devices_pending: i64 = pending_count_row.get("c");

    let scans_today_row = sqlx::query(
        "SELECT COUNT(*) as c FROM asistencias WHERE DATE(fecha_hora_ingreso) = DATE('now', 'localtime') AND modo_ingreso = 'QR_MOVIL_LAN'",
    )
    .fetch_one(&state.pool())
    .await?;
    let total_scans_today: i64 = scans_today_row.get("c");

    Ok(LanServerStatusDto {
        is_running,
        port,
        local_ips,
        primary_ip,
        https_url,
        http_url,
        mdns_hostname,
        mdns_active: is_running,
        ca_cert_pem,
        ca_cert_fingerprint_sha256,
        total_devices_linked,
        total_devices_pending,
        total_scans_today,
    })
}

/// Inicia o detiene el servidor LAN Axum en caliente
pub async fn toggle_lan_server(
    state: &AppState,
    session: &AuthSession,
    enable: bool,
) -> Result<LanServerStatusDto, AppError> {
    if session.rol.hierarchy_level() < UserRole::Supervisor.hierarchy_level() {
        return Err(AppError::Forbidden(
            "Se requieren permisos de SUPERVISOR o ADMINISTRADOR para gestionar el servidor LAN.".into(),
        ));
    }

    let current_running = *state.lan_server_running.read().await;
    let port = *state.lan_server_port.read().await;

    if enable && !current_running {
        start_lan_server(state).await?;

        sqlx::query(
            "INSERT INTO configuracion_sistema (clave, valor, updated_at) VALUES ('LAN_SERVER_ENABLED', '1', datetime('now', 'localtime')) \
             ON CONFLICT(clave) DO UPDATE SET valor = '1', updated_at = datetime('now', 'localtime')",
        )
        .execute(&state.pool())
        .await?;

        let det_str = json!({ "running": true, "port": port }).to_string();
        record_audit(
            &state.pool(),
            Some(session.user_id),
            &session.username,
            "CAMBIAR_ESTADO_SERVIDOR_LAN",
            "CONFIGURACION",
            &det_str,
            Some("LOCAL_DESKTOP"),
        )
        .await?;
    } else if !enable && current_running {
        {
            let mut stop_guard = state.lan_server_stop_tx.write().await;
            if let Some(tx) = stop_guard.take() {
                let _ = tx.send(());
            }
        }
        {
            let mut run_guard = state.lan_server_running.write().await;
            *run_guard = false;
        }

        sqlx::query(
            "INSERT INTO configuracion_sistema (clave, valor, updated_at) VALUES ('LAN_SERVER_ENABLED', '0', datetime('now', 'localtime')) \
             ON CONFLICT(clave) DO UPDATE SET valor = '0', updated_at = datetime('now', 'localtime')",
        )
        .execute(&state.pool())
        .await?;

        let det_str = json!({ "running": false, "port": port }).to_string();
        record_audit(
            &state.pool(),
            Some(session.user_id),
            &session.username,
            "CAMBIAR_ESTADO_SERVIDOR_LAN",
            "CONFIGURACION",
            &det_str,
            Some("LOCAL_DESKTOP"),
        )
        .await?;
    }

    get_lan_server_status(state).await
}

/// Lista los dispositivos móviles registrados según filtros
pub async fn list_mobile_devices(
    pool: &SqlitePool,
    filter: &MobileDeviceFilter,
) -> Result<Vec<MobileDeviceDto>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            d.id,
            d.nombre_dispositivo,
            d.codigo_vinculacion,
            d.estado_vinculacion,
            d.ip_ultima_conexion,
            d.user_agent,
            d.ultimo_acceso_at,
            d.total_escaneos,
            d.creado_por_usuario_id,
            COALESCE(u_crea.username, 'Sistema') AS creado_por_nombre,
            d.revocado_por_usuario_id,
            u_revo.username AS revocado_por_nombre,
            d.revocado_at,
            d.estado_activo,
            d.created_at
        FROM dispositivos_moviles d
        LEFT JOIN usuarios_sistema u_crea ON u_crea.id = d.creado_por_usuario_id
        LEFT JOIN usuarios_sistema u_revo ON u_revo.id = d.revocado_por_usuario_id
        WHERE 1=1
        "#,
    );

    if let Some(ref estado) = filter.estado_vinculacion {
        builder.push(" AND d.estado_vinculacion = ");
        builder.push_bind(estado);
    }

    if let Some(activo) = filter.estado_activo {
        builder.push(" AND d.estado_activo = ");
        builder.push_bind(activo);
    }

    if let Some(ref busq) = filter.busqueda {
        let pattern = format!("%{}%", busq.trim());
        if !busq.trim().is_empty() {
            builder.push(" AND (d.nombre_dispositivo LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR d.codigo_vinculacion LIKE ");
            builder.push_bind(pattern);
            builder.push(")");
        }
    }

    builder.push(" ORDER BY d.id DESC");

    let rows = builder.build().fetch_all(pool).await?;

    let mut devices = Vec::with_capacity(rows.len());
    for row in rows {
        devices.push(MobileDeviceDto {
            id: row.get("id"),
            nombre_dispositivo: row.get("nombre_dispositivo"),
            codigo_vinculacion: row.get("codigo_vinculacion"),
            estado_vinculacion: row.get("estado_vinculacion"),
            ip_ultima_conexion: row.get("ip_ultima_conexion"),
            user_agent: row.get("user_agent"),
            ultimo_acceso_at: row.get("ultimo_acceso_at"),
            total_escaneos: row.get("total_escaneos"),
            creado_por_usuario_id: row.get("creado_por_usuario_id"),
            creado_por_nombre: row.get("creado_por_nombre"),
            revocado_por_usuario_id: row.get("revocado_por_usuario_id"),
            revocado_por_nombre: row.get("revocado_por_nombre"),
            revocado_at: row.get("revocado_at"),
            estado_activo: row.get("estado_activo"),
            created_at: row.get("created_at"),
        });
    }

    Ok(devices)
}

/// Crea una pre-autorización de emparejamiento con código de 6 caracteres y QR ISO-18004 real
pub async fn create_mobile_device_pairing(
    pool: &SqlitePool,
    session: &AuthSession,
    state: &AppState,
    input: CreateMobileDeviceInput,
) -> Result<MobileDevicePairingDto, AppError> {
    if session.rol.hierarchy_level() < UserRole::Supervisor.hierarchy_level() {
        return Err(AppError::Forbidden(
            "Se requieren permisos de SUPERVISOR o ADMINISTRADOR para generar vinculaciones móviles.".into(),
        ));
    }

    let nombre = input.nombre_dispositivo.trim();
    if nombre.is_empty() {
        return Err(AppError::Validation(
            "El nombre del dispositivo no puede estar vacío.".into(),
        ));
    }

    let codigo = generate_pairing_code();
    let res = sqlx::query(
        r#"
        INSERT INTO dispositivos_moviles (
            nombre_dispositivo, codigo_vinculacion, estado_vinculacion,
            creado_por_usuario_id, estado_activo, created_at
        ) VALUES (
            ?, ?, 'PENDIENTE_VINCULACION',
            ?, 1, datetime('now', 'localtime')
        );
        "#,
    )
    .bind(nombre)
    .bind(&codigo)
    .bind(session.user_id)
    .execute(pool)
    .await?;

    let device_id = res.last_insert_rowid();

    let primary_ip = detect_primary_ip();
    let port = *state.lan_server_port.read().await;
    let pairing_url = format!("https://{}:{}/scanner?pair={}", primary_ip, port, codigo);
    let qr_data_url = generate_qr_svg_data_url(&pairing_url)?;

    let det_str = json!({ "device_id": device_id, "nombre": nombre, "codigo": codigo }).to_string();
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "CREAR_VINCULACION_MOVIL",
        "DISPOSITIVOS_MOVILES",
        &det_str,
        Some("LOCAL_DESKTOP"),
    )
    .await?;

    Ok(MobileDevicePairingDto {
        device_id,
        nombre_dispositivo: nombre.to_string(),
        codigo_vinculacion: codigo,
        pairing_url,
        qr_data_url,
        expires_in_minutes: 60,
    })
}

/// Canjea el código de 6 caracteres por el Bearer Token CSPRNG permanente
pub async fn pair_mobile_device(
    pool: &SqlitePool,
    input: PairMobileDeviceInput,
) -> Result<PairedMobileSessionDto, AppError> {
    let codigo = input.codigo_vinculacion.trim().to_uppercase();
    if codigo.is_empty() {
        return Err(AppError::Validation(
            "Debe proporcionar el código de vinculación.".into(),
        ));
    }

    let row_opt = sqlx::query(
        "SELECT id, nombre_dispositivo, estado_vinculacion, estado_activo, creado_por_usuario_id FROM dispositivos_moviles WHERE codigo_vinculacion = ?",
    )
    .bind(&codigo)
    .fetch_optional(pool)
    .await?;

    let row = match row_opt {
        Some(r) => r,
        None => {
            return Err(AppError::NotFound(
                "Código de emparejamiento no encontrado o inválido.".into(),
            ))
        }
    };

    let device_id: i64 = row.get("id");
    let nombre_dispositivo: String = row.get("nombre_dispositivo");
    let estado_vinculacion: String = row.get("estado_vinculacion");
    let estado_activo: i64 = row.get("estado_activo");
    let creado_por_id: i64 = row.get("creado_por_usuario_id");

    if estado_activo == 0 {
        return Err(AppError::Conflict("El dispositivo no se encuentra activo.".into()));
    }

    if estado_vinculacion != "PENDIENTE_VINCULACION" {
        return Err(AppError::Conflict(
            "El dispositivo ya ha sido vinculado previamente o se encuentra revocado.".into(),
        ));
    }

    let token_sesion = generate_session_token();
    let ip_clean = input.ip_address.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let ua_clean = input.user_agent.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());

    sqlx::query(
        r#"
        UPDATE dispositivos_moviles
        SET estado_vinculacion = 'VINCULADO',
            token_sesion = ?,
            ip_ultima_conexion = ?,
            user_agent = ?,
            ultimo_acceso_at = datetime('now', 'localtime')
        WHERE id = ?;
        "#,
    )
    .bind(&token_sesion)
    .bind(ip_clean)
    .bind(ua_clean)
    .bind(device_id)
    .execute(pool)
    .await?;

    let det_str = json!({ "device_id": device_id, "ip": ip_clean }).to_string();
    record_audit(
        pool,
        Some(creado_por_id),
        "MOVIL_LAN",
        "VINCULAR_DISPOSITIVO_MOVIL",
        "DISPOSITIVOS_MOVILES",
        &det_str,
        ip_clean,
    )
    .await?;

    Ok(PairedMobileSessionDto {
        token_sesion,
        device_id,
        nombre_dispositivo,
        gym_name: "ZaramaGYM".to_string(),
    })
}

/// Revoca un dispositivo móvil invalidando su token de sesión
pub async fn revoke_mobile_device(
    pool: &SqlitePool,
    session: &AuthSession,
    device_id: i64,
) -> Result<(), AppError> {
    if session.rol.hierarchy_level() < UserRole::Supervisor.hierarchy_level() {
        return Err(AppError::Forbidden(
            "Se requieren permisos de SUPERVISOR o ADMINISTRADOR para revocar dispositivos móviles.".into(),
        ));
    }

    let row = sqlx::query("SELECT id FROM dispositivos_moviles WHERE id = ?")
        .bind(device_id)
        .fetch_optional(pool)
        .await?;

    if row.is_none() {
        return Err(AppError::NotFound("Dispositivo móvil no encontrado.".into()));
    }

    sqlx::query(
        r#"
        UPDATE dispositivos_moviles
        SET estado_vinculacion = 'REVOCADO',
            estado_activo = 0,
            token_sesion = NULL,
            revocado_por_usuario_id = ?,
            revocado_at = datetime('now', 'localtime')
        WHERE id = ?;
        "#,
    )
    .bind(session.user_id)
    .bind(device_id)
    .execute(pool)
    .await?;

    let det_str = json!({ "device_id": device_id, "estado": "REVOCADO" }).to_string();
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "REVOCAR_DISPOSITIVO_MOVIL",
        "DISPOSITIVOS_MOVILES",
        &det_str,
        Some("LOCAL_DESKTOP"),
    )
    .await?;

    Ok(())
}

/// Procesa un escaneo QR o ingreso manual desde un dispositivo móvil autenticado
pub async fn mobile_scan_qr(
    pool: &SqlitePool,
    state: &AppState,
    input: MobileScanInput,
) -> Result<CheckInEvaluationDto, AppError> {
    let token = match input.token_sesion.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        Some(t) => t,
        None => {
            return Err(AppError::Unauthorized(
                "Token de sesión de dispositivo móvil ausente.".into(),
            ))
        }
    };

    let dev_row = sqlx::query(
        r#"
        SELECT id, nombre_dispositivo, estado_vinculacion, estado_activo, creado_por_usuario_id
        FROM dispositivos_moviles
        WHERE token_sesion = ?;
        "#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await?;

    let dev = match dev_row {
        Some(d) => d,
        None => {
            return Err(AppError::Unauthorized(
                "Dispositivo no autorizado o revocado.".into(),
            ))
        }
    };

    let device_id: i64 = dev.get("id");
    let nombre_disp: String = dev.get("nombre_dispositivo");
    let estado_vinc: String = dev.get("estado_vinculacion");
    let activo: i64 = dev.get("estado_activo");
    let creador_id: i64 = dev.get("creado_por_usuario_id");

    if estado_vinc != "VINCULADO" || activo != 1 {
        return Err(AppError::Unauthorized(
            "El dispositivo se encuentra inactivo o revocado.".into(),
        ));
    }

    let auth_session = match state.get_session().await {
        Some(sess) => sess,
        None => {
            let user_row = sqlx::query(
                "SELECT u.persona_id, u.username, u.rol_principal, p.nombres, p.apellidos \
                 FROM usuarios_sistema u \
                 INNER JOIN personas p ON p.id = u.persona_id \
                 WHERE u.id = ?",
            )
            .bind(creador_id)
            .fetch_one(pool)
            .await?;
            let persona_id: i64 = user_row.get("persona_id");
            let username: String = user_row.get("username");
            let rol_str: String = user_row.get("rol_principal");
            let nombres: String = user_row.get("nombres");
            let apellidos: String = user_row.get("apellidos");
            let rol = rol_str.parse::<UserRole>().unwrap_or(UserRole::Supervisor);
            AuthSession {
                user_id: creador_id,
                persona_id,
                username,
                nombre_completo: format!("{} {}", nombres, apellidos),
                rol,
                foto_perfil_data_url: None,
                is_locked: false,
                login_at: Local::now().to_rfc3339(),
            }
        }
    };

    let check_in_input = CheckInInput {
        qr_token: input.qr_token,
        cliente_id: None,
        numero_documento: input.numero_documento,
        modo_ingreso: Some(AttendanceCheckInMode::QrMovilLan),
        dispositivo_id: Some(device_id),
        notas: Some(format!("Escaneo móvil: {}", nombre_disp)),
    };

    let evaluation = attendance_service::check_in_client(pool, &auth_session, check_in_input).await?;

    sqlx::query(
        "UPDATE dispositivos_moviles SET total_escaneos = total_escaneos + 1, ultimo_acceso_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(device_id)
    .execute(pool)
    .await?;

    Ok(evaluation)
}
