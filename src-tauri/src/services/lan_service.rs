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
use std::collections::HashMap;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio_rustls::TlsAcceptor;
use tower_http::cors::{Any, CorsLayer};

// Biblioteca jsQR offline embebida para que el escáner móvil funcione 100% en LAN sin Internet
const JSQR_BUNDLE: &str = include_str!("../../assets/jsQR.js");

// Íconos PNG oficiales de ZaramaGYM embebidos para acceso directo móvil (Android / iOS PWA)
const APP_ICON_512_PNG: &[u8] = include_bytes!("../../icons/icon.png");
const APP_ICON_256_PNG: &[u8] = include_bytes!("../../icons/128x128@2x.png");

const SCANNER_WEB_MANIFEST: &str = r##"{
  "name": "ZaramaGYM Escáner Móvil",
  "short_name": "ZaramaGYM",
  "description": "Escáner QR LAN en tiempo real para control de asistencias ZaramaGYM",
  "start_url": "/scanner",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#090e1a",
  "theme_color": "#090e1a",
  "icons": [
    {
      "src": "/assets/zaramagym-icon-256.png",
      "sizes": "256x256",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/assets/zaramagym-icon.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}"##;

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

pub const DEFAULT_MDNS_HOSTNAME: &str = "zaramagym.local";
const LEGACY_MDNS_HOSTNAME: &str = "sistema.local";

/// Lee el hostname mDNS configurado en SQLite, usando `zaramagym.local` por defecto.
pub async fn resolve_mdns_hostname(pool: &SqlitePool) -> String {
    sqlx::query("SELECT valor FROM configuracion_sistema WHERE clave = 'LAN_MDNS_HOSTNAME'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.get::<Option<String>, _>("valor"))
        .map(|s| s.trim().trim_end_matches('.').to_lowercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_MDNS_HOSTNAME.to_string())
}

/// Construye el `TlsAcceptor` para el servidor HTTPS emitiendo un certificado hoja válido para
/// localhost, zaramagym.local (mDNS), alias sistema.local y la lista de IPs LAN indicada.
pub async fn build_server_tls_acceptor_for_ips(
    pool: &SqlitePool,
    lan_ips: &[String],
) -> Result<(TlsAcceptor, String, Vec<String>), AppError> {
    let (ca_pem, ca_cert, ca_key) = ensure_or_load_root_ca(pool).await?;

    let mdns_hostname = resolve_mdns_hostname(pool).await;

    let mut sans = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        mdns_hostname.clone(),
    ];
    if !sans.iter().any(|s| s.eq_ignore_ascii_case(LEGACY_MDNS_HOSTNAME)) {
        sans.push(LEGACY_MDNS_HOSTNAME.to_string());
    }
    for ip in lan_ips {
        let clean_ip = ip.trim();
        if !clean_ip.is_empty() && !sans.iter().any(|s| s == clean_ip) {
            sans.push(clean_ip.to_string());
        }
    }

    let mut server_params = CertificateParams::new(sans.clone())
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

    Ok((TlsAcceptor::from(Arc::new(tls_config)), ca_pem, sans))
}

/// Construye el `TlsAcceptor` para el servidor HTTPS con las IPs LAN privadas activas del sistema.
async fn build_server_tls_acceptor(
    pool: &SqlitePool,
) -> Result<(TlsAcceptor, String, Vec<String>), AppError> {
    let live_ips = get_lan_interface_ips();
    build_server_tls_acceptor_for_ips(pool, &live_ips).await
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

pub const SCANNER_HTML: &str = r##"<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#090e1a">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="ZaramaGYM">
  <link rel="icon" type="image/png" sizes="256x256" href="/assets/zaramagym-icon-256.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/zaramagym-icon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/zaramagym-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <title>ZaramaGYM Escáner Móvil</title>
  <style>
    :root {
      --bg: #090e1a;
      --card: #101728;
      --card-elevated: #121a2e;
      --control: #0a101e;
      --control-alt: #162038;
      --border: rgba(148, 163, 184, 0.14);
      --border-strong: #243250;
      --emerald: #10b981;
      --emerald-dark: #059669;
      --emerald-soft: #34d399;
      --cyan: #0ea5e9;
      --cyan-dark: #0284c7;
      --amber: #f59e0b;
      --rose: #fb7185;
      --text: #f8fafc;
      --text-sec: #94a3b8;
      --text-mut: #64748b;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    }
    html, body {
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      min-height: 100dvh;
    }
    body {
      display: flex;
      flex-direction: column;
      padding-top: env(safe-area-inset-top, 0px);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background-image: radial-gradient(circle at 50% -10%, rgba(16, 185, 129, 0.08), transparent 55%);
    }
    .svg-ic {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      display: inline-block;
    }

    /* Header */
    .app-header {
      width: 100%;
      background: rgba(12, 19, 36, 0.92);
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      backdrop-filter: blur(10px);
    }
    .app-header-inner {
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .brand-logo {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: cover;
      border: 1.5px solid rgba(16, 185, 129, 0.55);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.22);
      flex-shrink: 0;
    }
    .brand-copy {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .brand-title-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-title {
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text);
      line-height: 1.15;
    }
    .brand-accent {
      color: var(--emerald-soft);
    }
    body[data-view="m1"] .brand-accent {
      color: var(--text);
    }
    .pwa-pill {
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--text-sec);
      background: var(--control-alt);
      border: 1px solid rgba(148, 163, 184, 0.22);
      padding: 2px 6px;
      border-radius: 6px;
      line-height: 1.2;
    }
    body[data-view="m2"] .pwa-pill {
      color: var(--emerald-soft);
      background: rgba(16, 185, 129, 0.14);
      border-color: rgba(16, 185, 129, 0.32);
    }
    .brand-sub {
      font-size: 0.72rem;
      color: var(--text-sec);
      margin-top: 2px;
      line-height: 1.15;
    }
    body[data-view="m1"] .brand-sub {
      display: none;
    }

    .badge-lan {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border-radius: 9999px;
      font-size: 0.74rem;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: rgba(6, 78, 59, 0.42);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: var(--emerald-soft);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .badge-lan.is-amber {
      background: rgba(120, 53, 15, 0.45);
      border-color: rgba(245, 158, 11, 0.42);
      color: #fbbf24;
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--emerald);
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.75);
      display: inline-block;
      flex-shrink: 0;
    }
    .badge-lan.is-amber .status-dot {
      background-color: var(--amber);
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.75);
    }

    /* Main Containers */
    main {
      flex: 1;
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
      padding: 14px 16px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    #viewM1 {
      justify-content: center;
    }
    #viewM2 {
      justify-content: flex-start;
      gap: 12px;
    }

    /* Vista M1 */
    .m1-card {
      width: 100%;
      max-width: 400px;
      background: linear-gradient(180deg, var(--card-elevated) 0%, var(--card) 100%);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 26px 22px 22px;
      box-shadow: 0 20px 44px -16px rgba(0, 0, 0, 0.65);
    }
    .m1-title {
      font-size: 1.42rem;
      font-weight: 800;
      text-align: center;
      color: var(--text);
      letter-spacing: -0.02em;
      margin-bottom: 10px;
    }
    .m1-subtitle {
      font-size: 0.84rem;
      color: var(--text-sec);
      text-align: center;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .input-code {
      width: 100%;
      height: 62px;
      text-align: center;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: 0.48em;
      padding-left: 0.48em;
      text-transform: uppercase;
      border-radius: 14px;
      border: 1px solid var(--border-strong);
      background-color: var(--bg);
      color: var(--text);
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .input-code::placeholder {
      color: #475569;
    }
    .input-code:focus {
      border-color: var(--emerald);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
    }
    .inline-error {
      display: none;
      margin-top: 10px;
      padding: 9px 12px;
      border-radius: 10px;
      background: rgba(244, 63, 94, 0.12);
      border: 1px solid rgba(251, 113, 133, 0.35);
      color: #fda4af;
      font-size: 0.8rem;
      line-height: 1.35;
      text-align: center;
    }
    .inline-error.is-visible {
      display: block;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 46px;
      padding: 12px 14px;
      border-radius: 13px;
      font-size: 0.92rem;
      font-weight: 700;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.12s, opacity 0.18s, background-color 0.18s, border-color 0.18s;
    }
    .btn:active {
      transform: scale(0.985);
    }
    .btn:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    .btn-emerald {
      background: linear-gradient(135deg, var(--emerald) 0%, var(--emerald-dark) 100%);
      color: #ffffff;
      box-shadow: 0 10px 26px -8px rgba(16, 185, 129, 0.55);
    }
    .btn-emerald.is-stop {
      background: linear-gradient(135deg, #271521 0%, #3b1724 100%);
      border: 1px solid rgba(251, 113, 133, 0.4);
      color: #fda4af;
      box-shadow: none;
    }
    .btn-cyan {
      background: linear-gradient(135deg, var(--cyan) 0%, var(--cyan-dark) 100%);
      color: #ffffff;
      box-shadow: 0 8px 20px -8px rgba(14, 165, 233, 0.5);
    }
    .btn-dark {
      background: var(--control-alt);
      border: 1px solid var(--border-strong);
      color: var(--text);
    }
    .btn-amber {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #090e1a;
    }
    .btn-ca {
      background: var(--control-alt);
      border: 1px solid rgba(148, 163, 184, 0.2);
      color: #e2e8f0;
      font-size: 0.85rem;
      font-weight: 600;
      margin-top: 10px;
    }
    .btn-ca .svg-ic {
      color: var(--emerald);
    }
    .m1-actions {
      margin-top: 16px;
    }
    .m1-divider {
      height: 1px;
      background: rgba(148, 163, 184, 0.12);
      margin: 20px 0 16px;
    }
    .m1-guide {
      font-size: 0.74rem;
      color: var(--text-sec);
      text-align: center;
      line-height: 1.5;
    }
    .m1-guide strong {
      color: var(--text);
      font-weight: 700;
    }

    /* Vista M2: Terminal Bar */
    .terminal-bar {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 9px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .terminal-left {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
      font-size: 0.82rem;
      color: var(--text-sec);
    }
    .terminal-icon-box {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--control-alt);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: #38bdf8;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .terminal-name {
      color: var(--text);
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 145px;
    }
    .btn-unlink {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: transparent;
      border: none;
      color: var(--rose);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      padding: 4px 2px;
      flex-shrink: 0;
    }

    /* Banner HTTP */
    .warning-banner {
      width: 100%;
      background: rgba(120, 53, 15, 0.34);
      border: 1px solid rgba(245, 158, 11, 0.42);
      color: #fef3c7;
      border-radius: 14px;
      padding: 10px 12px;
      font-size: 0.78rem;
      line-height: 1.45;
      display: none;
      flex-direction: column;
      gap: 9px;
    }
    .warning-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .warning-row .svg-ic {
      color: #fbbf24;
      margin-top: 2px;
    }

    /* Video Input Section */
    .video-section {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .video-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .section-kicker {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 0.71rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--text-sec);
      text-transform: uppercase;
    }
    .section-kicker .svg-ic {
      color: var(--emerald);
    }
    .video-tools {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .icon-btn {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--card-elevated);
      border: 1px solid var(--border-strong);
      color: #cbd5e1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: border-color 0.18s, color 0.18s, background-color 0.18s;
    }
    .icon-btn:active {
      transform: scale(0.95);
    }
    .icon-btn.is-active {
      border-color: rgba(16, 185, 129, 0.65);
      background: rgba(16, 185, 129, 0.16);
      color: var(--emerald-soft);
    }

    .select-wrap {
      position: relative;
      width: 100%;
    }
    .select-cam {
      width: 100%;
      appearance: none;
      -webkit-appearance: none;
      background: var(--card);
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      color: var(--text);
      font-size: 0.82rem;
      font-weight: 500;
      padding: 10px 36px 10px 12px;
      outline: none;
      cursor: pointer;
    }
    .select-cam:focus {
      border-color: var(--emerald);
    }
    .select-chevron {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      color: var(--text-sec);
    }

    /* Scanner Viewport */
    .scanner-box {
      width: 100%;
      height: 268px;
      background-color: #050a14;
      background-image: radial-gradient(rgba(16, 185, 129, 0.16) 1px, transparent 1px);
      background-size: 16px 16px;
      border: 1.5px solid rgba(16, 185, 129, 0.38);
      border-radius: 18px;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 32px rgba(0, 0, 0, 0.65), 0 12px 30px -14px rgba(16, 185, 129, 0.25);
    }
    .scanner-box video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    .scanner-box.is-live video {
      opacity: 1;
    }
    .cam-telemetry {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 4;
      padding: 4px 9px;
      border-radius: 8px;
      background: rgba(9, 14, 26, 0.82);
      border: 1px solid rgba(16, 185, 129, 0.32);
      color: var(--emerald-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.67rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .scan-reticle {
      position: absolute;
      inset: 28px 42px 34px;
      pointer-events: none;
      z-index: 3;
    }
    .corner {
      position: absolute;
      width: 24px;
      height: 24px;
      border-color: var(--emerald);
      border-style: solid;
      border-width: 0;
    }
    .corner.tl { top: 0; left: 0; border-top-width: 3px; border-left-width: 3px; border-top-left-radius: 10px; }
    .corner.tr { top: 0; right: 0; border-top-width: 3px; border-right-width: 3px; border-top-right-radius: 10px; }
    .corner.bl { bottom: 0; left: 0; border-bottom-width: 3px; border-left-width: 3px; border-bottom-left-radius: 10px; }
    .corner.br { bottom: 0; right: 0; border-bottom-width: 3px; border-right-width: 3px; border-bottom-right-radius: 10px; }
    .center-reticle {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 54px;
      height: 54px;
      transform: translate(-50%, -50%);
      opacity: 0.45;
      transition: opacity 0.25s ease;
    }
    .scanner-box.is-live .center-reticle {
      opacity: 0.18;
    }
    .center-reticle span {
      position: absolute;
      width: 14px;
      height: 14px;
      border-color: rgba(52, 211, 153, 0.65);
      border-style: solid;
      border-width: 0;
    }
    .center-reticle .ctl { top: 0; left: 0; border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 4px; }
    .center-reticle .ctr { top: 0; right: 0; border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 4px; }
    .center-reticle .cbl { bottom: 0; left: 0; border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 4px; }
    .center-reticle .cbr { bottom: 0; right: 0; border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 4px; }

    .laser {
      position: absolute;
      top: 10px;
      left: 8px;
      right: 8px;
      height: 2px;
      border-radius: 999px;
      background: linear-gradient(90deg, transparent 0%, #34d399 18%, #d1fae5 50%, #34d399 82%, transparent 100%);
      box-shadow: 0 0 18px 4px rgba(16, 185, 129, 0.6), 0 0 6px 1px rgba(167, 243, 208, 0.9);
      animation: laserSweep 2.4s ease-in-out infinite;
      will-change: transform;
      z-index: 3;
    }
    @keyframes laserSweep {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(184px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .laser {
        animation: none;
        transform: translateY(92px);
      }
    }

    .cam-status-wrap {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      max-width: calc(100% - 20px);
      z-index: 4;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 12px;
      border-radius: 9999px;
      background: rgba(9, 14, 26, 0.88);
      border: 1px solid rgba(148, 163, 184, 0.2);
      font-size: 0.72rem;
      font-weight: 600;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cam-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--emerald);
      flex-shrink: 0;
    }
    .cam-dot.is-idle { background-color: var(--text-mut); }
    .cam-dot.is-warn { background-color: var(--amber); }
    .cam-dot.is-err { background-color: var(--rose); }

    /* Controls Row */
    .controls-row {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .controls-row .btn {
      font-size: 0.84rem;
      padding: 11px 10px;
    }
    .controls-row .btn-dark .svg-ic {
      color: #38bdf8;
    }

    /* Manual / Backup Card */
    .manual-card {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .manual-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .terminal-tag {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.71rem;
      color: var(--text-mut);
    }
    .field-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .field-label {
      font-size: 0.67rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      color: var(--text-sec);
      text-transform: uppercase;
    }
    .input-row {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }
    .input-text {
      flex: 1;
      min-width: 0;
      padding: 10px 12px;
      border-radius: 11px;
      border: 1px solid var(--border-strong);
      background-color: var(--control);
      color: var(--text);
      font-size: 0.84rem;
      outline: none;
      transition: border-color 0.18s;
    }
    .input-text::placeholder {
      color: #475569;
    }
    .input-text:focus {
      border-color: var(--emerald);
    }
    .btn-inline {
      width: auto;
      min-width: 74px;
      min-height: 40px;
      padding: 0 14px;
      border-radius: 11px;
      font-size: 0.82rem;
      flex-shrink: 0;
    }
    .scan-notice {
      display: none;
      padding: 8px 11px;
      border-radius: 10px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #fde68a;
      font-size: 0.77rem;
      line-height: 1.35;
    }
    .scan-notice.is-error {
      background: rgba(244, 63, 94, 0.12);
      border-color: rgba(251, 113, 133, 0.38);
      color: #fecdd3;
    }
    .scan-notice.is-visible {
      display: block;
    }

    .last-pass-bar {
      background: var(--control);
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 12px;
      padding: 9px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.76rem;
    }
    .last-pass-left {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      color: var(--text-sec);
    }
    .last-pass-left strong {
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 145px;
    }
    .last-pass-status {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-mut);
      white-space: nowrap;
    }
    .last-pass-bar.is-verde .last-pass-status { color: var(--emerald-soft); }
    .last-pass-bar.is-amarillo .last-pass-status { color: #fbbf24; }
    .last-pass-bar.is-rojo .last-pass-status { color: var(--rose); }
    .last-pass-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--text-mut);
      flex-shrink: 0;
    }
    .last-pass-bar.is-verde .last-pass-dot { background: var(--emerald); }
    .last-pass-bar.is-amarillo .last-pass-dot { background: var(--amber); }
    .last-pass-bar.is-rojo .last-pass-dot { background: #ef4444; }

    /* Live Footer */
    .app-footer {
      width: 100%;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
      background: rgba(9, 14, 26, 0.85);
    }
    .app-footer-inner {
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
      padding: 11px 16px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.69rem;
      color: var(--text-mut);
    }
    body[data-view="m1"] .app-footer-inner {
      justify-content: center;
      gap: 8px;
    }
    .section-divider {
      width: 100%;
      height: 1px;
      background: rgba(148, 163, 184, 0.1);
      margin: 2px 0;
    }
    .footer-left {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .footer-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--emerald);
      display: inline-block;
    }
    .footer-dot.is-err { background: #ef4444; }
    .footer-sep {
      display: none;
    }
    body[data-view="m1"] .footer-sep {
      display: inline;
    }

    /* Unlink Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgba(5, 8, 16, 0.78);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-backdrop.is-open {
      display: flex;
    }
    .modal-card {
      width: 100%;
      max-width: 340px;
      background: var(--card-elevated);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      gap: 12px;
      text-align: center;
    }
    .modal-icon {
      width: 44px;
      height: 44px;
      margin: 0 auto;
      border-radius: 12px;
      background: rgba(244, 63, 94, 0.14);
      border: 1px solid rgba(251, 113, 133, 0.35);
      color: var(--rose);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal-title {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text);
    }
    .modal-desc {
      font-size: 0.82rem;
      color: var(--text-sec);
      line-height: 1.45;
    }
    .modal-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 4px;
    }
    .btn-danger {
      background: linear-gradient(135deg, #e11d48 0%, #be123c 100%);
      color: #ffffff;
    }

    /* Traffic Light Overlay */
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
      color: #ffffff;
    }
    .overlay.VERDE { background: radial-gradient(circle at 50% 25%, #10b981 0%, #065f46 75%, #042f2e 100%); }
    .overlay.AMARILLO { background: radial-gradient(circle at 50% 25%, #f59e0b 0%, #b45309 75%, #451a03 100%); }
    .overlay.ROJO { background: radial-gradient(circle at 50% 25%, #ef4444 0%, #991b1b 75%, #450a0a 100%); }
    .overlay-icon-circle {
      width: 84px;
      height: 84px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.16);
      border: 2px solid rgba(255, 255, 255, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 14px;
    }
    .overlay-icon-circle svg {
      width: 44px;
      height: 44px;
      display: none;
    }
    .overlay h1 {
      font-size: 1.75rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .overlay h2 {
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .overlay-doc {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.82rem;
      opacity: 0.88;
      margin-bottom: 12px;
    }
    .overlay-box {
      background: rgba(9, 14, 26, 0.36);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 16px;
      padding: 16px;
      width: 100%;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
    }
    .overlay-plan-pill {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.18);
      font-size: 0.82rem;
      font-weight: 700;
    }
    .overlay-days {
      font-size: 1.05rem;
      font-weight: 800;
    }
    .overlay-debt {
      display: none;
      padding: 5px 10px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.34);
      font-size: 0.82rem;
      font-weight: 700;
      color: #fef08a;
    }
    .overlay-reason {
      font-size: 0.86rem;
      opacity: 0.92;
      line-height: 1.35;
    }
    .overlay-cashier {
      display: none;
      width: 100%;
      max-width: 360px;
      padding: 10px 14px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.16);
      border: 1.5px solid rgba(255, 255, 255, 0.55);
      font-size: 0.95rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      margin-bottom: 14px;
    }
    .overlay-progress-track {
      width: 100%;
      max-width: 260px;
      height: 4px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.25);
      overflow: hidden;
      margin-bottom: 14px;
      display: none;
    }
    .overlay-progress-bar {
      width: 100%;
      height: 100%;
      background: #ffffff;
      transform-origin: left center;
    }
    @keyframes overlayDrain {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }
    .btn-overlay-close {
      max-width: 260px;
      background: #ffffff;
      color: #090e1a;
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
    }
  </style>
</head>
<body data-view="m1">
  <header class="app-header">
    <div class="app-header-inner">
      <div class="brand">
        <img src="/assets/zaramagym-icon-256.png" alt="ZaramaGYM" class="brand-logo">
        <div class="brand-copy">
          <div class="brand-title-row">
            <span class="brand-title">Zarama<span class="brand-accent">GYM</span></span>
            <span class="pwa-pill">PWA</span>
          </div>
          <div class="brand-sub">Control de Accesos</div>
        </div>
      </div>
      <div class="badge-lan" id="statusBadge">
        <span class="status-dot"></span>
        <svg id="badgeLockIcon" class="svg-ic" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <svg id="badgeAlertIcon" class="svg-ic" style="width:13px;height:13px;display:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span id="statusBadgeText">HTTPS 3443</span>
      </div>
    </div>
  </header>

  <!-- VISTA M1: VINCULACIÓN POR CÓDIGO -->
  <main id="viewM1" style="display: none;">
    <div class="m1-card">
      <h1 class="m1-title">Vincular Celular</h1>
      <p class="m1-subtitle">Conecta este teléfono a la red Wi-Fi del gimnasio e introduce el código de 6 caracteres generado en la PC principal.</p>
      <input type="text" id="pairInput" class="input-code" maxlength="6" placeholder="K9M2PX" autocomplete="off" autocapitalize="characters" spellcheck="false" autofocus>
      <div id="pairError" class="inline-error" role="alert"></div>
      <div class="m1-actions">
        <button type="button" class="btn btn-emerald" id="btnPair">
          <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          <span id="btnPairLabel">Vincular este Teléfono</span>
        </button>
        <a href="/api/lan/ca.pem" download="zaramagym-root-ca.crt" class="btn btn-ca">
          <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Descargar Certificado CA Local</span>
        </a>
      </div>
      <div class="m1-divider"></div>
      <p class="m1-guide">
        Para habilitar la cámara en vivo en iOS/Android usa siempre <strong>HTTPS</strong>. Si tu navegador muestra alerta de certificado local, pulsa <strong>Avanzado → Continuar</strong> o instala el certificado CA arriba.
      </p>
    </div>
  </main>

  <!-- VISTA M2: ESCÁNER DE ASISTENCIA & SEMÁFORO -->
  <main id="viewM2" style="display: none;">
    <div class="terminal-bar">
      <div class="terminal-left">
        <span class="terminal-icon-box" aria-hidden="true">
          <svg class="svg-ic" style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
          </svg>
        </span>
        <span>Terminal:</span>
        <strong id="devNameLabel" class="terminal-name">Móvil</strong>
        <span class="status-dot" aria-hidden="true"></span>
      </div>
      <button type="button" id="btnUnlink" class="btn-unlink">
        <span>Desvincular</span>
        <svg class="svg-ic" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </button>
    </div>

    <div class="section-divider" aria-hidden="true"></div>

    <!-- Aviso automático si abrió sin HTTPS -->
    <div id="insecureHttpsBanner" class="warning-banner">
      <div class="warning-row">
        <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span>Para activar el escaneo automático en vivo por video necesitas conexión segura <strong>HTTPS</strong> (o usar el botón de captura por foto abajo).</span>
      </div>
      <button type="button" id="btnSwitchHttps" class="btn btn-amber" style="min-height:38px;padding:8px 12px;font-size:0.8rem;">
        <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span>Cambiar a Modo HTTPS (Cámara en Vivo)</span>
      </button>
    </div>

    <div class="video-section">
      <div class="video-head">
        <span class="section-kicker">
          <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          <span>ENTRADA DE VIDEO</span>
        </span>
        <div class="video-tools">
          <button type="button" id="btnTorch" class="icon-btn" title="Linterna" aria-label="Alternar linterna" aria-pressed="false">
            <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </button>
          <button type="button" id="btnSwitchCam" class="icon-btn" title="Cambiar cámara" aria-label="Cambiar cámara">
            <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="select-wrap">
        <select id="cameraSelect" class="select-cam" aria-label="Seleccionar cámara">
          <option value="">Cámara trasera (Automática)</option>
        </select>
        <svg class="svg-ic select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </div>

    <div class="scanner-box" id="scannerBox">
      <div id="camTelemetry" class="cam-telemetry">STANDBY • LISTO</div>
      <video id="videoPreview" autoplay playsinline muted></video>
      <div class="scan-reticle" aria-hidden="true">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
        <div class="center-reticle">
          <span class="ctl"></span>
          <span class="ctr"></span>
          <span class="cbl"></span>
          <span class="cbr"></span>
        </div>
        <div class="laser"></div>
      </div>
      <div id="camStatusWrap" class="cam-status-wrap">
        <span id="camDot" class="cam-dot is-idle"></span>
        <span id="camStatus">Escáner activo • Apunta al QR del socio</span>
      </div>
    </div>

    <div class="controls-row">
      <button type="button" id="btnStartCam" class="btn btn-emerald">
        <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
        <span id="btnStartCamText">Activar Cámara</span>
      </button>
      <label for="qrFileInput" class="btn btn-dark" style="cursor:pointer;">
        <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span>Subir Foto QR</span>
        <input type="file" id="qrFileInput" accept="image/*" capture="environment" style="display: none;">
      </label>
    </div>

    <div class="manual-card">
      <div class="manual-head">
        <span class="section-kicker">
          <svg class="svg-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          <span>INGRESO MANUAL / RESPALDO</span>
        </span>
        <span id="terminalTag" class="terminal-tag">Acceso LAN</span>
      </div>

      <div class="field-group">
        <label class="field-label" for="qrTextInput">TOKEN DIRECTO DE APLICACIÓN</label>
        <div class="input-row">
          <input type="text" id="qrTextInput" class="input-text" placeholder="Pegar token QR (ZG-...)" autocomplete="off">
          <button type="button" class="btn btn-emerald btn-inline" id="btnSendQrText">Validar</button>
        </div>
      </div>

      <div class="field-group">
        <label class="field-label" for="dniInput">BÚSQUEDA POR DOCUMENTO</label>
        <div class="input-row">
          <input type="text" id="dniInput" class="input-text" placeholder="Ingreso manual por DNI / CE" inputmode="numeric" autocomplete="off">
          <button type="button" class="btn btn-cyan btn-inline" id="btnSendManual">DNI</button>
        </div>
      </div>

      <div id="scanNotice" class="scan-notice" role="status"></div>

      <div id="lastPassBar" class="last-pass-bar">
        <div class="last-pass-left">
          <span class="last-pass-dot" aria-hidden="true"></span>
          <span>Último pase:</span>
          <strong id="lastPassName">Sin lecturas</strong>
        </div>
        <span id="lastPassStatus" class="last-pass-status">En espera</span>
      </div>
    </div>
  </main>

  <footer class="app-footer">
    <div class="app-footer-inner">
      <div class="footer-left">
        <span id="footerDot" class="footer-dot" aria-hidden="true"></span>
        <span>SQLite Local-First: <span id="footerDbStatus">OK</span></span>
      </div>
      <span class="footer-sep" aria-hidden="true">•</span>
      <div>Build: <span id="footerBuild">v0.1.0-prod</span></div>
    </div>
  </footer>

  <canvas id="scanCanvas" style="display: none;"></canvas>

  <!-- MODAL DE DESVINCULACIÓN -->
  <div id="unlinkModal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="unlinkModalTitle">
    <div class="modal-card">
      <div class="modal-icon" aria-hidden="true">
        <svg class="svg-ic" style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </div>
      <h2 id="unlinkModalTitle" class="modal-title">¿Desvincular este teléfono?</h2>
      <p class="modal-desc">Dejarás de enviar asistencias desde esta terminal hasta ingresar un nuevo código de 6 caracteres.</p>
      <div class="modal-actions">
        <button type="button" id="btnCancelUnlink" class="btn btn-dark">Cancelar</button>
        <button type="button" id="btnConfirmUnlink" class="btn btn-danger">Desvincular</button>
      </div>
    </div>
  </div>

  <!-- OVERLAY SEMAFÓRICO COMPLETO -->
  <div id="trafficOverlay" class="overlay" role="alertdialog" aria-modal="true" aria-labelledby="overlayTitle">
    <div class="overlay-icon-circle" aria-hidden="true">
      <svg id="iconVerde" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <svg id="iconAmarillo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <svg id="iconRojo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
      </svg>
    </div>
    <h1 id="overlayTitle">ACCESO CONCEDIDO</h1>
    <h2 id="overlayClientName">Socio</h2>
    <div id="overlayDoc" class="overlay-doc"></div>
    <div class="overlay-box">
      <span id="overlayPlan" class="overlay-plan-pill">Plan</span>
      <p id="overlayDays" class="overlay-days"></p>
      <p id="overlayDebt" class="overlay-debt"></p>
      <p id="overlayReason" class="overlay-reason"></p>
    </div>
    <div id="overlayCashierNote" class="overlay-cashier">POR FAVOR DIRÍJASE A CAJA</div>
    <div id="overlayProgressTrack" class="overlay-progress-track">
      <div id="overlayProgressBar" class="overlay-progress-bar"></div>
    </div>
    <button type="button" id="overlayCloseBtn" class="btn btn-overlay-close">Continuar Escaneando</button>
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

    const params = new URLSearchParams(window.location.search);
    const pairParam = params.get('pair') || params.get('code');
    let currentStream = null;
    let rafId = null;
    let lastDecodedCode = '';
    let lastDecodedAt = 0;
    let scanBusy = false;
    let overlayOpen = false;
    let torchEnabled = false;
    let videoDevices = [];
    let activeDeviceId = '';
    let preferredFacingMode = 'environment';
    let noticeTimeout = null;
    let overlayTimeout = null;
    let barcodeDetector = null;
    if ('BarcodeDetector' in window) {
      try { barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {}
    }

    function updateStatusBadge(view) {
      const badge = document.getElementById('statusBadge');
      const lockIc = document.getElementById('badgeLockIcon');
      const alertIc = document.getElementById('badgeAlertIcon');
      const txt = document.getElementById('statusBadgeText');
      const isHttps = window.location.protocol === 'https:';
      const port = window.location.port || (isHttps ? '3443' : '80');

      if (isHttps) {
        badge.classList.remove('is-amber');
        lockIc.style.display = 'inline-block';
        alertIc.style.display = 'none';
        txt.textContent = view === 'm2' ? port : ('HTTPS ' + port);
      } else {
        badge.classList.add('is-amber');
        lockIc.style.display = 'none';
        alertIc.style.display = 'inline-block';
        txt.textContent = 'HTTP ' + port;
      }
    }

    if (!window.isSecureContext && window.location.protocol !== 'https:') {
      document.getElementById('insecureHttpsBanner').style.display = 'flex';
    }
    document.getElementById('btnSwitchHttps').addEventListener('click', () => {
      window.location.href = 'https://' + window.location.host + window.location.pathname + window.location.search;
    });

    // Persistencia dual (localStorage + Cookie de 365 días)
    function readCookieVal(name) {
      try {
        const prefix = name + '=';
        const parts = document.cookie.split(';');
        for (let i = 0; i < parts.length; i++) {
          const item = parts[i].trim();
          if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length));
        }
      } catch (e) {}
      return null;
    }

    function getMobileToken() {
      let tok = null;
      try { tok = localStorage.getItem('zarama_mobile_token'); } catch (e) {}
      if (!tok) {
        tok = readCookieVal('zarama_mobile_token');
        if (tok) {
          try { localStorage.setItem('zarama_mobile_token', tok); } catch (e) {}
        }
      }
      return tok || null;
    }

    function getMobileName() {
      let name = null;
      try { name = localStorage.getItem('zarama_mobile_name'); } catch (e) {}
      if (!name) name = readCookieVal('zarama_mobile_name');
      return name || 'Móvil Vinculado';
    }

    function getMobileId() {
      let id = null;
      try { id = localStorage.getItem('zarama_mobile_id'); } catch (e) {}
      if (!id) id = readCookieVal('zarama_mobile_id');
      return id || '';
    }

    function saveMobileSession(token, deviceName, deviceId) {
      const idStr = deviceId != null ? String(deviceId) : '';
      try {
        localStorage.setItem('zarama_mobile_token', token);
        localStorage.setItem('zarama_mobile_name', deviceName);
        if (idStr) localStorage.setItem('zarama_mobile_id', idStr);
      } catch (e) {}
      try {
        document.cookie = 'zarama_mobile_token=' + encodeURIComponent(token) + '; Path=/; Max-Age=31536000; SameSite=Lax';
        document.cookie = 'zarama_mobile_name=' + encodeURIComponent(deviceName) + '; Path=/; Max-Age=31536000; SameSite=Lax';
        if (idStr) {
          document.cookie = 'zarama_mobile_id=' + encodeURIComponent(idStr) + '; Path=/; Max-Age=31536000; SameSite=Lax';
        }
      } catch (e) {}
    }

    function clearMobileSession() {
      try {
        localStorage.removeItem('zarama_mobile_token');
        localStorage.removeItem('zarama_mobile_name');
        localStorage.removeItem('zarama_mobile_id');
      } catch (e) {}
      try {
        document.cookie = 'zarama_mobile_token=; Path=/; Max-Age=0; SameSite=Lax';
        document.cookie = 'zarama_mobile_name=; Path=/; Max-Age=0; SameSite=Lax';
        document.cookie = 'zarama_mobile_id=; Path=/; Max-Age=0; SameSite=Lax';
      } catch (e) {}
    }

    function showPairError(msg) {
      const el = document.getElementById('pairError');
      if (!msg) {
        el.textContent = '';
        el.classList.remove('is-visible');
      } else {
        el.textContent = msg;
        el.classList.add('is-visible');
      }
    }

    function showScanNotice(msg, isError) {
      const el = document.getElementById('scanNotice');
      if (noticeTimeout) clearTimeout(noticeTimeout);
      if (!msg) {
        el.textContent = '';
        el.className = 'scan-notice';
        return;
      }
      el.textContent = msg;
      el.className = 'scan-notice is-visible' + (isError ? ' is-error' : '');
      noticeTimeout = setTimeout(() => {
        el.className = 'scan-notice';
      }, 4000);
    }

    function setCamStatus(text, tone) {
      document.getElementById('camStatus').textContent = text;
      const dot = document.getElementById('camDot');
      dot.className = 'cam-dot' + (tone ? (' is-' + tone) : '');
    }

    function updateCameraButton(isActive) {
      const btn = document.getElementById('btnStartCam');
      const txt = document.getElementById('btnStartCamText');
      if (isActive) {
        btn.classList.add('is-stop');
        txt.textContent = 'Detener Cámara';
      } else {
        btn.classList.remove('is-stop');
        txt.textContent = 'Activar Cámara';
      }
    }

    function applyLastPass(name, color) {
      const bar = document.getElementById('lastPassBar');
      const nameEl = document.getElementById('lastPassName');
      const statusEl = document.getElementById('lastPassStatus');
      if (!name || !color) {
        bar.className = 'last-pass-bar';
        nameEl.textContent = 'Sin lecturas';
        statusEl.textContent = 'En espera';
        return;
      }
      nameEl.textContent = name;
      if (color === 'VERDE') {
        bar.className = 'last-pass-bar is-verde';
        statusEl.textContent = 'Acceso Autorizado';
      } else if (color === 'AMARILLO') {
        bar.className = 'last-pass-bar is-amarillo';
        statusEl.textContent = 'Alerta Preventiva';
      } else {
        bar.className = 'last-pass-bar is-rojo';
        statusEl.textContent = 'Acceso Denegado';
      }
    }

    function restoreLastPass() {
      try {
        const raw = sessionStorage.getItem('zarama_last_pass');
        if (!raw) return applyLastPass(null, null);
        const parsed = JSON.parse(raw);
        applyLastPass(parsed.name, parsed.color);
      } catch (e) {
        applyLastPass(null, null);
      }
    }

    function updateTerminalTag() {
      const id = getMobileId();
      const tag = document.getElementById('terminalTag');
      if (id && /^\d+$/.test(id)) {
        tag.textContent = 'Terminal #' + id.padStart(2, '0');
      } else {
        tag.textContent = 'Acceso LAN';
      }
    }

    function showM1(reasonMsg) {
      stopCamera();
      document.body.dataset.view = 'm1';
      document.getElementById('viewM1').style.display = 'flex';
      document.getElementById('viewM2').style.display = 'none';
      updateStatusBadge('m1');
      showPairError(reasonMsg || '');
    }

    function showM2() {
      document.body.dataset.view = 'm2';
      document.getElementById('viewM1').style.display = 'none';
      document.getElementById('viewM2').style.display = 'flex';
      document.getElementById('devNameLabel').textContent = getMobileName();
      updateStatusBadge('m2');
      updateTerminalTag();
      restoreLastPass();
      startCamera();
    }

    const pairInputEl = document.getElementById('pairInput');
    pairInputEl.addEventListener('input', () => {
      const cleaned = pairInputEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (pairInputEl.value !== cleaned) pairInputEl.value = cleaned;
      showPairError('');
    });
    pairInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnPair').click();
      }
    });

    document.getElementById('btnPair').addEventListener('click', async () => {
      unlockAudio();
      const btn = document.getElementById('btnPair');
      const label = document.getElementById('btnPairLabel');
      const code = pairInputEl.value.trim().toUpperCase();
      if (code.length < 6) {
        showPairError('Por favor ingresa el código completo de 6 caracteres.');
        pairInputEl.focus();
        return;
      }
      showPairError('');
      btn.disabled = true;
      label.textContent = 'Vinculando...';
      try {
        const res = await fetch('/api/lan/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigoVinculacion: code, userAgent: navigator.userAgent })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          showPairError('No se pudo vincular: ' + (err.error || res.statusText));
          return;
        }
        const data = await res.json();
        saveMobileSession(data.tokenSesion, data.nombreDispositivo, data.deviceId);
        showM2();
      } catch (e) {
        showPairError('Fallo de conexión con el servidor LAN: ' + e.message);
      } finally {
        btn.disabled = false;
        label.textContent = 'Vincular este Teléfono';
      }
    });

    // Modal de desvinculación accesible
    const unlinkModal = document.getElementById('unlinkModal');
    function openUnlinkModal() {
      unlinkModal.classList.add('is-open');
      document.getElementById('btnCancelUnlink').focus();
    }
    function closeUnlinkModal() {
      unlinkModal.classList.remove('is-open');
    }
    document.getElementById('btnUnlink').addEventListener('click', openUnlinkModal);
    document.getElementById('btnCancelUnlink').addEventListener('click', closeUnlinkModal);
    document.getElementById('btnConfirmUnlink').addEventListener('click', () => {
      closeUnlinkModal();
      clearMobileSession();
      showM1();
    });
    unlinkModal.addEventListener('click', (e) => {
      if (e.target === unlinkModal) closeUnlinkModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && unlinkModal.classList.contains('is-open')) {
        closeUnlinkModal();
      }
    });

    function stopCamera() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
      }
      torchEnabled = false;
      const torchBtn = document.getElementById('btnTorch');
      torchBtn.classList.remove('is-active');
      torchBtn.setAttribute('aria-pressed', 'false');
      document.getElementById('scannerBox').classList.remove('is-live');
      document.getElementById('camTelemetry').textContent = 'STANDBY • LISTO';
      const video = document.getElementById('videoPreview');
      if (video) video.srcObject = null;
      updateCameraButton(false);
    }

    async function populateCameras() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videos = devices.filter(d => d.kind === 'videoinput');
        videoDevices = videos;
        const sel = document.getElementById('cameraSelect');
        const prevVal = activeDeviceId || sel.value;
        while (sel.firstChild) sel.removeChild(sel.firstChild);

        if (videos.length === 0) {
          const defOpt = document.createElement('option');
          defOpt.value = '';
          defOpt.textContent = 'Cámara trasera (Automática)';
          sel.appendChild(defOpt);
          return;
        }

        videos.forEach((d, idx) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || ('Cámara ' + (idx + 1));
          sel.appendChild(opt);
        });
        if (prevVal && videos.some(d => d.deviceId === prevVal)) {
          sel.value = prevVal;
        }
      } catch (e) {}
    }

    function updateTelemetryFromStream(stream) {
      const telEl = document.getElementById('camTelemetry');
      try {
        const track = stream.getVideoTracks()[0];
        if (!track || typeof track.getSettings !== 'function') {
          telEl.textContent = 'EN VIVO • ACTIVA';
          return;
        }
        const s = track.getSettings();
        if (s.deviceId) activeDeviceId = s.deviceId;
        const fps = s.frameRate ? (Math.round(s.frameRate) + ' FPS') : 'LIVE';
        const res = s.height ? (s.height + 'p') : (s.width ? (s.width + 'px') : 'HD');
        telEl.textContent = fps + ' • ' + res;
      } catch (e) {
        telEl.textContent = 'EN VIVO • ACTIVA';
      }
    }

    async function startCamera(selectedDeviceId, facingOverride) {
      stopCamera();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCamStatus('Requiere HTTPS para cámara en vivo (usa Subir Foto QR)', 'warn');
        return;
      }
      setCamStatus('Solicitando permiso de cámara...', 'warn');
      const facing = facingOverride || preferredFacingMode || 'environment';
      try {
        const constraints = {
          audio: false,
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }
        };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        const video = document.getElementById('videoPreview');
        video.srcObject = currentStream;
        await video.play();
        document.getElementById('scannerBox').classList.add('is-live');
        updateTelemetryFromStream(currentStream);
        updateCameraButton(true);
        setCamStatus('Escáner activo • Apunta al QR del socio', '');
        await populateCameras();
        rafId = requestAnimationFrame(scanVideoFrame);
      } catch (err) {
        stopCamera();
        setCamStatus('Cámara sin permiso (' + err.name + '). Usa Subir Foto QR.', 'err');
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
      setCamStatus('QR detectado • Validando acceso...', 'warn');
      await sendScan({ qrToken: cleaned });
    }

    document.getElementById('btnStartCam').addEventListener('click', () => {
      unlockAudio();
      if (currentStream) {
        stopCamera();
        setCamStatus('Cámara en espera • Pulsa Activar Cámara', 'idle');
      } else {
        const sel = document.getElementById('cameraSelect');
        startCamera(sel.value || undefined);
      }
    });

    document.getElementById('cameraSelect').addEventListener('change', (e) => {
      activeDeviceId = e.target.value || '';
      startCamera(activeDeviceId || undefined);
    });

    document.getElementById('btnTorch').addEventListener('click', async () => {
      if (!currentStream) {
        showScanNotice('Activa la cámara para usar la linterna.', false);
        return;
      }
      const track = currentStream.getVideoTracks()[0];
      if (!track) return;
      const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : null;
      if (!caps || !caps.torch) {
        showScanNotice('Esta cámara o navegador no soporta control de linterna.', false);
        return;
      }
      try {
        torchEnabled = !torchEnabled;
        await track.applyConstraints({ advanced: [{ torch: torchEnabled }] });
        const torchBtn = document.getElementById('btnTorch');
        torchBtn.classList.toggle('is-active', torchEnabled);
        torchBtn.setAttribute('aria-pressed', String(torchEnabled));
      } catch (e) {
        torchEnabled = false;
        showScanNotice('No se pudo activar la linterna en este dispositivo.', true);
      }
    });

    document.getElementById('btnSwitchCam').addEventListener('click', () => {
      unlockAudio();
      const sel = document.getElementById('cameraSelect');
      if (videoDevices.length > 1) {
        const curId = sel.value || activeDeviceId;
        const curIdx = videoDevices.findIndex(d => d.deviceId === curId);
        const nextCam = videoDevices[(curIdx + 1) % videoDevices.length];
        sel.value = nextCam.deviceId;
        activeDeviceId = nextCam.deviceId;
        startCamera(nextCam.deviceId);
      } else {
        preferredFacingMode = preferredFacingMode === 'environment' ? 'user' : 'environment';
        startCamera(undefined, preferredFacingMode);
      }
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
          showScanNotice('No se detectó un código QR nítido en la fotografía. Acerca un poco más.', true);
        }
        e.target.value = '';
      };
      img.src = objUrl;
    });

    const qrTextInputEl = document.getElementById('qrTextInput');
    const dniInputEl = document.getElementById('dniInput');

    qrTextInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnSendQrText').click();
      }
    });
    dniInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btnSendManual').click();
      }
    });

    document.getElementById('btnSendQrText').addEventListener('click', async () => {
      unlockAudio();
      const val = qrTextInputEl.value.trim();
      if (!val) {
        showScanNotice('Pega o escribe el token QR antes de validar.', true);
        qrTextInputEl.focus();
        return;
      }
      const ok = await sendScan({ qrToken: val });
      if (ok) qrTextInputEl.value = '';
    });

    document.getElementById('btnSendManual').addEventListener('click', async () => {
      unlockAudio();
      const dni = dniInputEl.value.trim();
      if (!dni) {
        showScanNotice('Ingresa el número de DNI o documento.', true);
        dniInputEl.focus();
        return;
      }
      const ok = await sendScan({ numeroDocumento: dni });
      if (ok) dniInputEl.value = '';
    });

    async function sendScan(payload) {
      const curToken = getMobileToken();
      if (!curToken) {
        showM1('El dispositivo no está vinculado.');
        return false;
      }
      if (scanBusy) return false;
      scanBusy = true;
      showScanNotice('', false);
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
          clearMobileSession();
          showM1('Dispositivo revocado o no autorizado. Vuelve a vincular este teléfono.');
          return false;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const errMsg = err.error || res.statusText || 'QR no reconocido';
          setCamStatus(errMsg, 'err');
          showScanNotice('Error en lectura: ' + errMsg, true);
          return false;
        }
        const evalData = await res.json();
        try {
          sessionStorage.setItem('zarama_last_pass', JSON.stringify({
            name: evalData.nombreCompleto || 'Socio',
            color: evalData.colorSemaforo || 'VERDE'
          }));
        } catch (e) {}
        applyLastPass(evalData.nombreCompleto || 'Socio', evalData.colorSemaforo || 'VERDE');
        showTrafficLight(evalData);
        return true;
      } catch (e) {
        showScanNotice('Error conectando al servidor LAN: ' + e.message, true);
        return false;
      } finally {
        scanBusy = false;
      }
    }

    function closeOverlay() {
      if (overlayTimeout) clearTimeout(overlayTimeout);
      document.getElementById('trafficOverlay').style.display = 'none';
      overlayOpen = false;
      if (currentStream) {
        setCamStatus('Escáner activo • Apunta al QR del socio', '');
      } else {
        setCamStatus('Cámara en espera • Pulsa Activar Cámara', 'idle');
      }
    }

    function showTrafficLight(data) {
      if (overlayTimeout) clearTimeout(overlayTimeout);
      overlayOpen = true;
      const overlay = document.getElementById('trafficOverlay');
      const iconVerde = document.getElementById('iconVerde');
      const iconAmarillo = document.getElementById('iconAmarillo');
      const iconRojo = document.getElementById('iconRojo');
      const title = document.getElementById('overlayTitle');
      const clientName = document.getElementById('overlayClientName');
      const docEl = document.getElementById('overlayDoc');
      const plan = document.getElementById('overlayPlan');
      const days = document.getElementById('overlayDays');
      const debtEl = document.getElementById('overlayDebt');
      const reason = document.getElementById('overlayReason');
      const cashierNote = document.getElementById('overlayCashierNote');
      const progressTrack = document.getElementById('overlayProgressTrack');
      const progressBar = document.getElementById('overlayProgressBar');
      const closeBtn = document.getElementById('overlayCloseBtn');

      const color = data.colorSemaforo || 'ROJO';
      overlay.className = 'overlay ' + color;
      clientName.textContent = data.nombreCompleto || 'Socio';

      const docTipo = data.tipoDocumento || 'DNI';
      const docNum = data.numeroDocumento || '';
      docEl.textContent = docNum ? (docTipo + ': ' + docNum) : '';
      docEl.style.display = docNum ? 'block' : 'none';

      plan.textContent = data.nombrePlan || 'Sin membresía activa';
      reason.textContent = data.motivoSemaforo || '';

      const deuda = Number(data.deudaTotalPendiente || 0);
      if (deuda > 0) {
        debtEl.textContent = 'Deuda pendiente: S/ ' + deuda.toFixed(2);
        debtEl.style.display = 'inline-block';
      } else {
        debtEl.textContent = '';
        debtEl.style.display = 'none';
      }

      iconVerde.style.display = 'none';
      iconAmarillo.style.display = 'none';
      iconRojo.style.display = 'none';
      cashierNote.style.display = 'none';
      progressTrack.style.display = 'none';
      progressBar.style.animation = 'none';

      playBeep(color);

      if (color === 'VERDE') {
        iconVerde.style.display = 'block';
        title.textContent = 'ACCESO CONCEDIDO';
        days.textContent = data.diasRestantes != null
          ? ('Quedan ' + data.diasRestantes + ' días vigentes')
          : 'Membresía vigente';
        closeBtn.textContent = 'Continuar Escaneando';
        progressTrack.style.display = 'block';
        void progressBar.offsetWidth;
        progressBar.style.animation = 'overlayDrain 2500ms linear forwards';
        overlay.style.display = 'flex';
        overlayTimeout = setTimeout(closeOverlay, 2500);
      } else if (color === 'AMARILLO') {
        iconAmarillo.style.display = 'block';
        title.textContent = 'ALERTA PREVENTIVA';
        days.textContent = data.diasRestantes != null
          ? ('Vence en ' + data.diasRestantes + ' días')
          : 'Revisar membresía';
        closeBtn.textContent = 'Continuar Escaneando';
        progressTrack.style.display = 'block';
        void progressBar.offsetWidth;
        progressBar.style.animation = 'overlayDrain 3500ms linear forwards';
        overlay.style.display = 'flex';
        overlayTimeout = setTimeout(closeOverlay, 3500);
      } else {
        iconRojo.style.display = 'block';
        title.textContent = 'ACCESO BLOQUEADO';
        days.textContent = data.diasRestantes != null && data.diasRestantes < 0
          ? ('Vencida hace ' + Math.abs(data.diasRestantes) + ' días')
          : 'Membresía no habilitada';
        cashierNote.style.display = 'block';
        closeBtn.textContent = 'Cerrar y Escanear Siguiente';
        overlay.style.display = 'flex';
      }
    }

    document.getElementById('overlayCloseBtn').addEventListener('click', closeOverlay);

    async function refreshPingHealth() {
      const dbEl = document.getElementById('footerDbStatus');
      const buildEl = document.getElementById('footerBuild');
      const dotEl = document.getElementById('footerDot');
      try {
        const res = await fetch('/api/lan/ping', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const info = await res.json();
        const dbOk = info.dbStatus === 'OK';
        dbEl.textContent = info.dbStatus || 'OK';
        dotEl.className = 'footer-dot' + (dbOk ? '' : ' is-err');
        if (info.version) buildEl.textContent = info.version;
      } catch (e) {
        dbEl.textContent = 'Sin conexión';
        dotEl.className = 'footer-dot is-err';
      }
    }

    if (getMobileToken()) {
      showM2();
    } else {
      showM1();
      if (pairParam) {
        pairInputEl.value = pairParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      }
    }

    refreshPingHealth();
    setInterval(refreshPingHealth, 30000);
  </script>
</body>
</html>
"##;

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
        .route("/manifest.webmanifest", get(handle_web_manifest))
        .route("/assets/zaramagym-icon.png", get(handle_app_icon_512))
        .route("/assets/zaramagym-icon-256.png", get(handle_app_icon_256))
        .route("/apple-touch-icon.png", get(handle_app_icon_512))
        .route("/favicon.ico", get(handle_app_icon_256))
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

async fn handle_web_manifest() -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        "application/manifest+json; charset=utf-8".parse().unwrap(),
    );
    headers.insert(
        header::CACHE_CONTROL,
        "public, max-age=3600".parse().unwrap(),
    );
    (StatusCode::OK, headers, SCANNER_WEB_MANIFEST)
}

async fn handle_app_icon_512() -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "image/png".parse().unwrap());
    headers.insert(
        header::CACHE_CONTROL,
        "public, max-age=86400".parse().unwrap(),
    );
    (StatusCode::OK, headers, APP_ICON_512_PNG)
}

async fn handle_app_icon_256() -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, "image/png".parse().unwrap());
    headers.insert(
        header::CACHE_CONTROL,
        "public, max-age=86400".parse().unwrap(),
    );
    (StatusCode::OK, headers, APP_ICON_256_PNG)
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
    let pool = state.pool();
    let hostname = resolve_mdns_hostname(&pool).await;
    let db_status = match sqlx::query_scalar::<_, i64>("SELECT 1")
        .fetch_one(&pool)
        .await
    {
        Ok(1) => "OK",
        _ => "ERROR",
    };
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let body = json!({
        "status": "ok",
        "gym": "ZaramaGYM",
        "hostname": hostname,
        "port": port,
        "serverTime": now,
        "dbStatus": db_status,
        "version": format!("v{}-prod", env!("CARGO_PKG_VERSION"))
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

// ============================================================================
// RESPONDER mDNS RFC 6762 (UDP 5353 - Multicast 224.0.0.251)
// ============================================================================

/// Decodifica un QNAME DNS a partir de `start_pos`, soportando punteros de compresión RFC 1035 (`0xC0`).
/// Retorna `(qname, next_pos_after_name)`.
fn decode_dns_qname(packet: &[u8], start_pos: usize) -> Option<(String, usize)> {
    let mut pos = start_pos;
    let mut next_pos: Option<usize> = None;
    let mut labels: Vec<String> = Vec::new();
    let mut hops = 0usize;

    loop {
        if hops > 16 {
            return None;
        }
        let len = *packet.get(pos)? as usize;
        if len == 0 {
            let final_next = next_pos.unwrap_or(pos + 1);
            return Some((labels.join("."), final_next));
        }
        if (len & 0xC0) == 0xC0 {
            let b2 = *packet.get(pos + 1)? as usize;
            if next_pos.is_none() {
                next_pos = Some(pos + 2);
            }
            let ptr_offset = ((len & 0x3F) << 8) | b2;
            if ptr_offset >= packet.len() {
                return None;
            }
            pos = ptr_offset;
            hops += 1;
            continue;
        }
        if (len & 0xC0) != 0 {
            return None;
        }
        pos += 1;
        if pos + len > packet.len() {
            return None;
        }
        let label = std::str::from_utf8(&packet[pos..pos + len]).ok()?;
        labels.push(label.to_string());
        pos += len;
    }
}

/// Parsea una consulta mDNS (RFC 6762) recorriendo TODAS las preguntas (`qdcount`)
/// y verifica si algún QNAME coincide con `target_hostname` para registro tipo A (1) o ANY (255).
pub fn parse_mdns_query_for_host(packet: &[u8], target_hostname: &str) -> Option<u16> {
    if packet.len() < 12 {
        return None;
    }

    let tx_id = u16::from_be_bytes([packet[0], packet[1]]);
    let flags = u16::from_be_bytes([packet[2], packet[3]]);
    let qdcount = u16::from_be_bytes([packet[4], packet[5]]);

    // Ignorar respuestas (QR=1) o paquetes sin preguntas
    if (flags & 0x8000) != 0 || qdcount == 0 {
        return None;
    }

    let target = target_hostname.trim().trim_end_matches('.');
    if target.is_empty() {
        return None;
    }

    let mut pos = 12usize;
    for _ in 0..qdcount {
        let (qname, after_name) = decode_dns_qname(packet, pos)?;
        if after_name + 4 > packet.len() {
            return None;
        }
        let qtype = u16::from_be_bytes([packet[after_name], packet[after_name + 1]]);
        pos = after_name + 4;

        if !qname.is_empty()
            && qname.eq_ignore_ascii_case(target)
            && (qtype == 1 || qtype == 255)
        {
            return Some(tx_id);
        }
    }

    None
}

/// Construye un paquete de respuesta mDNS autoritativa con un registro A (RFC 6762).
pub fn build_mdns_a_record_packet(tx_id: u16, hostname: &str, ip: Ipv4Addr) -> Vec<u8> {
    let mut packet = Vec::with_capacity(64);

    // Header DNS: ID, Flags (0x8400 = QR + AA), QDCOUNT=0, ANCOUNT=1, NSCOUNT=0, ARCOUNT=0
    packet.extend_from_slice(&tx_id.to_be_bytes());
    packet.extend_from_slice(&0x8400u16.to_be_bytes());
    packet.extend_from_slice(&0u16.to_be_bytes());
    packet.extend_from_slice(&1u16.to_be_bytes());
    packet.extend_from_slice(&0u16.to_be_bytes());
    packet.extend_from_slice(&0u16.to_be_bytes());

    // NAME en etiquetas DNS (ej. \x07sistema\x05local\x00)
    let clean_host = hostname.trim().trim_end_matches('.');
    for label in clean_host.split('.').filter(|l| !l.is_empty()) {
        let bytes = label.as_bytes();
        let len = bytes.len().min(63);
        packet.push(len as u8);
        packet.extend_from_slice(&bytes[..len]);
    }
    packet.push(0x00);

    // TYPE = 0x0001 (A), CLASS = 0x8001 (IN + cache-flush), TTL = 120s, RDLENGTH = 4, RDATA = IPv4
    packet.extend_from_slice(&0x0001u16.to_be_bytes());
    packet.extend_from_slice(&0x8001u16.to_be_bytes());
    packet.extend_from_slice(&120u32.to_be_bytes());
    packet.extend_from_slice(&4u16.to_be_bytes());
    packet.extend_from_slice(&ip.octets());

    packet
}

/// Enlaza el socket UDP 5353 con `SO_REUSEADDR` (compatible con Windows `Dnscache` / `svchost`)
/// y se une al grupo multicast `224.0.0.251` en todas las interfaces IPv4 LAN activas.
fn bind_mdns_udp_socket() -> Option<tokio::net::UdpSocket> {
    let sock = socket2::Socket::new(
        socket2::Domain::IPV4,
        socket2::Type::DGRAM,
        Some(socket2::Protocol::UDP),
    )
    .ok()?;
    let _ = sock.set_reuse_address(true);
    let _ = sock.set_nonblocking(true);

    let bind_addr = SocketAddr::from(([0, 0, 0, 0], 5353));
    if sock.bind(&bind_addr.into()).is_err() {
        return None;
    }

    let std_sock: std::net::UdpSocket = sock.into();
    let multicast_ip = Ipv4Addr::new(224, 0, 0, 251);
    let _ = std_sock.join_multicast_v4(&multicast_ip, &Ipv4Addr::UNSPECIFIED);
    for ip_str in get_lan_interface_ips() {
        if let Ok(iface_ip) = ip_str.parse::<Ipv4Addr>() {
            if !iface_ip.is_loopback() {
                let _ = std_sock.join_multicast_v4(&multicast_ip, &iface_ip);
            }
        }
    }

    tokio::net::UdpSocket::from_std(std_sock).ok()
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

    let initial_ips = get_lan_interface_ips();
    let (tls_acceptor_opt, ca_pem) =
        match build_server_tls_acceptor_for_ips(&state.pool(), &initial_ips).await {
            Ok((acc, pem, _sans)) => (Some((initial_ips, acc)), pem),
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

    // Responder mDNS RFC 6762 sobre UDP 5353 (multicast 224.0.0.251) con SO_REUSEADDR
    let mdns_socket_opt = bind_mdns_udp_socket();
    {
        let mut mdns_guard = state.lan_mdns_active.write().await;
        *mdns_guard = mdns_socket_opt.is_some();
    }

    if let Some(socket) = mdns_socket_opt {
        let mdns_hostname_cfg = resolve_mdns_hostname(&state.pool()).await;
        let state_for_mdns = state.clone();

        tokio::spawn(async move {
            let multicast_ip = Ipv4Addr::new(224, 0, 0, 251);
            let multicast_dest = SocketAddr::from((multicast_ip, 5353));

            let mut mdns_hosts = vec![mdns_hostname_cfg.clone()];
            if !mdns_hosts
                .iter()
                .any(|h| h.eq_ignore_ascii_case(LEGACY_MDNS_HOSTNAME))
            {
                mdns_hosts.push(LEGACY_MDNS_HOSTNAME.to_string());
            }

            let current_ip = detect_primary_ip()
                .parse::<Ipv4Addr>()
                .unwrap_or(Ipv4Addr::LOCALHOST);
            for host in &mdns_hosts {
                let announcement = build_mdns_a_record_packet(0, host, current_ip);
                let _ = socket.send_to(&announcement, multicast_dest).await;
            }
            let mut last_announce = tokio::time::Instant::now();
            let mut buf = [0u8; 1500];

            while *state_for_mdns.lan_server_running.read().await {
                if let Ok(Ok((len, peer_addr))) = tokio::time::timeout(
                    std::time::Duration::from_secs(15),
                    socket.recv_from(&mut buf),
                )
                .await
                {
                    let live_ipv4 = detect_primary_ip()
                        .parse::<Ipv4Addr>()
                        .unwrap_or(Ipv4Addr::LOCALHOST);
                    for host in &mdns_hosts {
                        if let Some(tx_id) = parse_mdns_query_for_host(&buf[..len], host) {
                            let resp = build_mdns_a_record_packet(tx_id, host, live_ipv4);
                            let _ = socket.send_to(&resp, multicast_dest).await;
                            if peer_addr.port() != 5353 {
                                let _ = socket.send_to(&resp, peer_addr).await;
                            }
                        }
                    }
                }

                if last_announce.elapsed() >= std::time::Duration::from_secs(30) {
                    for ip_str in get_lan_interface_ips() {
                        if let Ok(iface_ip) = ip_str.parse::<Ipv4Addr>() {
                            if !iface_ip.is_loopback() {
                                let _ = socket.join_multicast_v4(multicast_ip, iface_ip);
                            }
                        }
                    }
                    let live_ipv4 = detect_primary_ip()
                        .parse::<Ipv4Addr>()
                        .unwrap_or(Ipv4Addr::LOCALHOST);
                    for host in &mdns_hosts {
                        let announcement = build_mdns_a_record_packet(0, host, live_ipv4);
                        let _ = socket.send_to(&announcement, multicast_dest).await;
                    }
                    last_announce = tokio::time::Instant::now();
                }
            }
        });
    }

    let router = create_lan_router(state.clone());
    let state_clone = state.clone();
    let tls_cache = Arc::new(tokio::sync::RwLock::new(tls_acceptor_opt));

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
                    let tls_cache_conn = tls_cache.clone();
                    let state_for_conn = state_clone.clone();

                    tokio::spawn(async move {
                        let mut peek_buf = [0u8; 1];
                        let is_tls = matches!(stream.peek(&mut peek_buf).await, Ok(1) if peek_buf[0] == 0x16);

                        let hyper_svc = TowerToHyperService::new(router_svc);
                        let builder = AutoConnBuilder::new(TokioExecutor::new());

                        if is_tls {
                            // Si las IPs LAN cambiaron (ej. laptop conectada al Hotspot del celular después de abrir ZaramaGYM),
                            // regeneramos al vuelo el certificado hoja para incluir la nueva IP en los SANs TLS.
                            let live_ips = get_lan_interface_ips();
                            let cached_acc = {
                                let guard = tls_cache_conn.read().await;
                                match &*guard {
                                    Some((ips, acc)) if *ips == live_ips => Some(acc.clone()),
                                    _ => None,
                                }
                            };

                            let active_acceptor = match cached_acc {
                                Some(acc) => Some(acc),
                                None => {
                                    match build_server_tls_acceptor_for_ips(&state_for_conn.pool(), &live_ips).await {
                                        Ok((new_acc, pem, _sans)) => {
                                            if !pem.is_empty() {
                                                let mut ca_guard = state_for_conn.lan_ca_pem.write().await;
                                                *ca_guard = pem;
                                            }
                                            let mut cache_guard = tls_cache_conn.write().await;
                                            *cache_guard = Some((live_ips, new_acc.clone()));
                                            Some(new_acc)
                                        }
                                        Err(_) => {
                                            let guard = tls_cache_conn.read().await;
                                            guard.as_ref().map(|(_, acc)| acc.clone())
                                        }
                                    }
                                }
                            };

                            if let Some(tls_acc) = active_acceptor {
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
        let mut mdns_guard = state_clone.lan_mdns_active.write().await;
        *mdns_guard = false;
    });

    Ok(())
}

// Eliminamos warning si AsyncReadExt no se usa directamente en el socket
#[allow(dead_code)]
async fn _read_helper<T: AsyncReadExt + Unpin>(_s: &mut T) {
    let _ = build_server_tls_acceptor;
}

// ============================================================================
// LÓGICA DE NEGOCIO Y PERSISTENCIA (LAN SERVICE)
// ============================================================================

/// Obtiene el estado consolidado del servidor LAN y estadísticas de dispositivos
pub async fn get_lan_server_status(state: &AppState) -> Result<LanServerStatusDto, AppError> {
    let is_running = *state.lan_server_running.read().await;
    let mdns_active = is_running && *state.lan_mdns_active.read().await;
    let port = *state.lan_server_port.read().await;
    let primary_ip = detect_primary_ip();
    let local_ips = get_local_ips(&primary_ip);

    let mdns_hostname = resolve_mdns_hostname(&state.pool()).await;
    // Priorizar IP local directa por defecto para garantizar conexión en Hotspots móviles
    // sin depender de resolución DNS (.local) ni sufrir DNS_PROBE_FINISHED_NXDOMAIN
    let https_url = format!("https://{}:{}/scanner", primary_ip, port);
    let http_url = format!("http://{}:{}/scanner", primary_ip, port);

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
        mdns_active,
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
    session.require_admin()?;

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
        {
            let mut mdns_guard = state.lan_mdns_active.write().await;
            *mdns_guard = false;
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
    session.require_admin()?;

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

    // Usar la IP LAN directa por defecto en el QR de emparejamiento para que funcione
    // en Hotspots móviles sin depender de DNS (.local) ni arrojar DNS_PROBE_FINISHED_NXDOMAIN
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

const PAIRING_CODE_TTL_MINUTES: i64 = 60;
const PAIRING_RATE_LIMIT_MAX_FAILURES: usize = 10;
const PAIRING_RATE_LIMIT_WINDOW_SECS: u64 = 300;

static PAIRING_FAILED_ATTEMPTS: LazyLock<Mutex<HashMap<String, Vec<Instant>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn check_pairing_rate_limit(bucket_key: &str) -> Result<(), AppError> {
    let now = Instant::now();
    let window = Duration::from_secs(PAIRING_RATE_LIMIT_WINDOW_SECS);
    if let Ok(mut map) = PAIRING_FAILED_ATTEMPTS.lock() {
        let entries = map.entry(bucket_key.to_string()).or_default();
        entries.retain(|t| now.duration_since(*t) < window);
        if entries.len() >= PAIRING_RATE_LIMIT_MAX_FAILURES {
            return Err(AppError::Validation(
                "Demasiados intentos fallidos de vinculación desde este dispositivo. Espera 5 minutos e intenta nuevamente."
                    .into(),
            ));
        }
    }
    Ok(())
}

fn record_pairing_failure(bucket_key: &str) {
    let now = Instant::now();
    let window = Duration::from_secs(PAIRING_RATE_LIMIT_WINDOW_SECS);
    if let Ok(mut map) = PAIRING_FAILED_ATTEMPTS.lock() {
        let entries = map.entry(bucket_key.to_string()).or_default();
        entries.retain(|t| now.duration_since(*t) < window);
        entries.push(now);
    }
}

fn clear_pairing_failures(bucket_key: &str) {
    if let Ok(mut map) = PAIRING_FAILED_ATTEMPTS.lock() {
        map.remove(bucket_key);
    }
}

/// Canjea el código de 6 caracteres por el Bearer Token CSPRNG permanente
pub async fn pair_mobile_device(
    pool: &SqlitePool,
    input: PairMobileDeviceInput,
) -> Result<PairedMobileSessionDto, AppError> {
    let ip_clean = input
        .ip_address
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let ua_clean = input
        .user_agent
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let rate_bucket = ip_clean.unwrap_or("lan_local_default");

    check_pairing_rate_limit(rate_bucket)?;

    let codigo = input.codigo_vinculacion.trim().to_uppercase();
    if codigo.is_empty() {
        record_pairing_failure(rate_bucket);
        return Err(AppError::Validation(
            "Debe proporcionar el código de vinculación.".into(),
        ));
    }

    let row_opt = sqlx::query(
        r#"
        SELECT id, nombre_dispositivo, estado_vinculacion, estado_activo, creado_por_usuario_id,
               CASE
                   WHEN datetime(created_at, '+60 minutes') < datetime('now', 'localtime') THEN 1
                   ELSE 0
               END AS is_expired
        FROM dispositivos_moviles
        WHERE codigo_vinculacion = ?
        "#,
    )
    .bind(&codigo)
    .fetch_optional(pool)
    .await?;

    let row = match row_opt {
        Some(r) => r,
        None => {
            record_pairing_failure(rate_bucket);
            return Err(AppError::NotFound(
                "Código de emparejamiento no encontrado o inválido.".into(),
            ));
        }
    };

    let device_id: i64 = row.get("id");
    let nombre_dispositivo: String = row.get("nombre_dispositivo");
    let estado_vinculacion: String = row.get("estado_vinculacion");
    let estado_activo: i64 = row.get("estado_activo");
    let creado_por_id: i64 = row.get("creado_por_usuario_id");
    let is_expired: i64 = row.get("is_expired");

    if estado_activo == 0 {
        record_pairing_failure(rate_bucket);
        return Err(AppError::Conflict("El dispositivo no se encuentra activo.".into()));
    }

    if estado_vinculacion != "PENDIENTE_VINCULACION" {
        record_pairing_failure(rate_bucket);
        return Err(AppError::Conflict(
            "El dispositivo ya ha sido vinculado previamente o se encuentra revocado.".into(),
        ));
    }

    if is_expired == 1 {
        record_pairing_failure(rate_bucket);
        return Err(AppError::Validation(format!(
            "El código de vinculación expiró (vigencia máxima de {} minutos). Genera un nuevo código QR desde ZaramaGYM.",
            PAIRING_CODE_TTL_MINUTES
        )));
    }

    let token_sesion = generate_session_token();

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

    clear_pairing_failures(rate_bucket);

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
    session.require_admin()?;

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
            let rol = rol_str.parse::<UserRole>().unwrap_or(UserRole::Recepcionista);
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

#[cfg(test)]
mod tests {
    use super::{build_mdns_a_record_packet, parse_mdns_query_for_host};
    use std::net::Ipv4Addr;

    #[test]
    fn mdns_parse_and_build_a_record_roundtrip() {
        // Consulta mDNS estándar para "Sistema.LOCAL" tipo A (0x0001) con tx_id = 0x1234
        let mut query = Vec::new();
        query.extend_from_slice(&0x1234u16.to_be_bytes()); // TX ID
        query.extend_from_slice(&0x0000u16.to_be_bytes()); // Flags: standard query
        query.extend_from_slice(&1u16.to_be_bytes()); // QDCOUNT = 1
        query.extend_from_slice(&0u16.to_be_bytes()); // ANCOUNT = 0
        query.extend_from_slice(&0u16.to_be_bytes()); // NSCOUNT = 0
        query.extend_from_slice(&0u16.to_be_bytes()); // ARCOUNT = 0
        query.push(7);
        query.extend_from_slice(b"Sistema");
        query.push(5);
        query.extend_from_slice(b"LOCAL");
        query.push(0);
        query.extend_from_slice(&0x0001u16.to_be_bytes()); // QTYPE = A
        query.extend_from_slice(&0x0001u16.to_be_bytes()); // QCLASS = IN

        assert_eq!(
            parse_mdns_query_for_host(&query, "sistema.local."),
            Some(0x1234)
        );
        assert_eq!(
            parse_mdns_query_for_host(&query, "otro.local"),
            None
        );

        // Respuesta no debe ser aceptada como consulta
        let ip = Ipv4Addr::new(192, 168, 1, 42);
        let resp = build_mdns_a_record_packet(0x1234, "sistema.local", ip);
        assert_eq!(parse_mdns_query_for_host(&resp, "sistema.local"), None);

        // Validar cabecera y payload de respuesta autoritativa RFC 6762
        assert_eq!(&resp[0..2], &0x1234u16.to_be_bytes());
        assert_eq!(&resp[2..4], &0x8400u16.to_be_bytes());
        assert_eq!(&resp[4..6], &0u16.to_be_bytes());
        assert_eq!(&resp[6..8], &1u16.to_be_bytes());
        let expected_qname = b"\x07sistema\x05local\x00";
        assert_eq!(&resp[12..12 + expected_qname.len()], expected_qname);
        let tail = &resp[12 + expected_qname.len()..];
        assert_eq!(&tail[0..2], &0x0001u16.to_be_bytes()); // TYPE A
        assert_eq!(&tail[2..4], &0x8001u16.to_be_bytes()); // CLASS IN + cache-flush
        assert_eq!(&tail[4..8], &120u32.to_be_bytes()); // TTL 120s
        assert_eq!(&tail[8..10], &4u16.to_be_bytes()); // RDLENGTH 4
        assert_eq!(&tail[10..14], &[192, 168, 1, 42]); // RDATA IPv4

        // Consulta tipo ANY (255) también debe coincidir
        let qtype_offset = 12 + expected_qname.len();
        query[qtype_offset..qtype_offset + 2].copy_from_slice(&255u16.to_be_bytes());
        assert_eq!(
            parse_mdns_query_for_host(&query, "sistema.local"),
            Some(0x1234)
        );

        // Consulta multi-pregunta (QDCOUNT = 2: 1ra pregunta AAAA/28 para zaramagym.local,
        // 2da pregunta A/1 con puntero de compresión 0xC00C a zaramagym.local)
        let mut multi_q = Vec::new();
        multi_q.extend_from_slice(&0x5678u16.to_be_bytes()); // TX ID
        multi_q.extend_from_slice(&0x0000u16.to_be_bytes()); // Flags
        multi_q.extend_from_slice(&2u16.to_be_bytes()); // QDCOUNT = 2
        multi_q.extend_from_slice(&0u16.to_be_bytes());
        multi_q.extend_from_slice(&0u16.to_be_bytes());
        multi_q.extend_from_slice(&0u16.to_be_bytes());
        // Pregunta 1 en offset 12: zaramagym.local (QTYPE = 28 AAAA)
        multi_q.push(9);
        multi_q.extend_from_slice(b"zaramagym");
        multi_q.push(5);
        multi_q.extend_from_slice(b"local");
        multi_q.push(0);
        multi_q.extend_from_slice(&28u16.to_be_bytes()); // AAAA
        multi_q.extend_from_slice(&1u16.to_be_bytes()); // IN
        // Pregunta 2: puntero 0xC00C -> offset 12 (QTYPE = 1 A)
        multi_q.extend_from_slice(&[0xC0, 0x0C]);
        multi_q.extend_from_slice(&1u16.to_be_bytes()); // A
        multi_q.extend_from_slice(&0x8001u16.to_be_bytes()); // IN + QU

        assert_eq!(
            parse_mdns_query_for_host(&multi_q, "zaramagym.local"),
            Some(0x5678)
        );
    }
}
