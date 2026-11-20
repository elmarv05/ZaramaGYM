use axum::{
    body::Body,
    http::{header, Request, StatusCode},
};
use chrono::{Duration, Local};
use sqlx::Row;
use tower::ServiceExt;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AttendanceCheckInMode, AuthSession, CreateClientInput, CreateMobileDeviceInput,
    CreateUserInput, LoginCredentials, MobileDeviceFilter, MobileScanInput, PairMobileDeviceInput,
    TrafficLightColor, UserRole,
};
use zarama_gym_lib::services::{
    auth_service, entity_service, lan_service,
};
use zarama_gym_lib::state::AppState;

/// Helper para obtener un puerto TCP efímero libre
fn get_free_tcp_port() -> u16 {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("No se pudo obtener puerto TCP libre");
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    port
}

/// Helper para crear un entorno aislado con base de datos en archivo temporal
async fn setup_test_env() -> (AppState, tempfile::TempDir, AuthSession) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_slice6.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let port = get_free_tcp_port();
    let state = AppState::new_with_port(pool, port);

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .expect("Login admin falló en setup");

    (state, temp_dir, admin_session)
}

/// Helper para crear un usuario recepcionista
async fn create_receptionist_user(state: &AppState) -> AuthSession {
    let _ = auth_service::create_user(
        &state.pool(),
        state,
        CreateUserInput {
            persona_id: None,
            username: "recep_lan".into(),
            password: "recep123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "88776655".into(),
            nombres: "Recep".into(),
            apellidos: "Test".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    auth_service::login(
        &state.pool(),
        state,
        LoginCredentials {
            username: "recep_lan".into(),
            password: "recep123".into(),
        },
    )
    .await
    .unwrap()
}

/// Helper para crear cliente con membresía activa
async fn create_client_with_membership(
    state: &AppState,
    session: &AuthSession,
    dni: &str,
    days_duration: i64,
) -> (i64, String) {
    let client = entity_service::create_client(
        &state.pool(),
        session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some(dni.into()),
            nombres: Some("Cliente".into()),
            apellidos: Some("LAN".into()),
            fecha_nacimiento: None,
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
        },
    )
    .await
    .unwrap();

    let exp_date = Local::now().date_naive() + Duration::days(days_duration);
    let exp_str = format!("{} 23:59:59", exp_date.format("%Y-%m-%d"));

    sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, datetime('now', 'localtime'), ?, '100.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .bind(exp_str)
    .execute(&state.pool())
    .await
    .unwrap();

    (client.id, client.codigo_qr_token)
}

// ============================================================================
// CP-LAN-01: INICIO Y PARADA DEL SERVIDOR LAN AXUM & IDEMPOTENCIA DDL
// ============================================================================
#[tokio::test]
async fn test_cp_lan_01_toggle_server_and_idempotent_migrations() {
    let (state, _temp, admin) = setup_test_env().await;

    let init_status = lan_service::get_lan_server_status(&state).await.unwrap();
    assert!(!init_status.is_running);
    assert!(!init_status.primary_ip.is_empty());
    assert!(init_status.port > 0);

    // Iniciar servidor LAN
    let started = lan_service::toggle_lan_server(&state, &admin, true).await.unwrap();
    assert!(started.is_running);
    assert!(started.mdns_active);
    assert_eq!(started.mdns_hostname, "zaramagym.local");
    assert!(started.https_url.contains(&started.mdns_hostname));
    assert!(!started.primary_ip.is_empty());

    // Detener servidor LAN
    let stopped = lan_service::toggle_lan_server(&state, &admin, false).await.unwrap();
    assert!(!stopped.is_running);

    // Idempotencia DDL: volver a invocar run_migrations en la misma DB no debe fallar
    let re_migration_result = zarama_gym_lib::db::run_migrations(&state.pool()).await;
    assert!(re_migration_result.is_ok(), "run_migrations debe ser 100% idempotente");
}

// ============================================================================
// CP-LAN-02: HEALTHCHECK PING PÚBLICO
// ============================================================================
#[tokio::test]
async fn test_cp_lan_02_healthcheck_ping() {
    let (state, _temp, _admin) = setup_test_env().await;
    let app = lan_service::create_lan_router(state.clone());

    let req = Request::builder()
        .uri("/api/lan/ping")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(res.into_body(), 1024 * 16).await.unwrap();
    let body_json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();

    assert_eq!(body_json["status"], "ok");
    assert_eq!(body_json["gym"], "ZaramaGYM");
    assert_eq!(body_json["hostname"], "zaramagym.local");
}

// ============================================================================
// CP-LAN-03: DESCARGA DEL CERTIFICADO CA RAÍZ
// ============================================================================
#[tokio::test]
async fn test_cp_lan_03_download_ca_pem() {
    let (state, _temp, _admin) = setup_test_env().await;
    let app = lan_service::create_lan_router(state.clone());

    let req = Request::builder()
        .uri("/api/lan/ca.pem")
        .body(Body::empty())
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers().get(header::CONTENT_TYPE).unwrap(),
        "application/x-x509-ca-cert"
    );

    let body_bytes = axum::body::to_bytes(res.into_body(), 1024 * 16).await.unwrap();
    let body_str = String::from_utf8_lossy(&body_bytes);
    assert!(body_str.contains("BEGIN CERTIFICATE"));
    assert!(body_str.contains("END CERTIFICATE"));

    // Verificar huella SHA256 determinista
    let status = lan_service::get_lan_server_status(&state).await.unwrap();
    assert!(!status.ca_cert_fingerprint_sha256.is_empty());
    assert!(status.ca_cert_fingerprint_sha256.contains(':'));
}

// ============================================================================
// CP-LAN-04: CREACIÓN DE EMPAREJAMIENTO DESDE DESKTOP & RBAC
// ============================================================================
#[tokio::test]
async fn test_cp_lan_04_create_pairing_and_rbac() {
    let (state, _temp, admin) = setup_test_env().await;

    // 1. Admin crea exitosamente emparejamiento
    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "iPhone Recepción Puerta 1".into(),
        },
    )
    .await
    .unwrap();

    assert_eq!(pairing.codigo_vinculacion.len(), 6);
    assert!(pairing.pairing_url.contains(&pairing.codigo_vinculacion));
    assert!(pairing.qr_data_url.starts_with("data:image/svg+xml"));

    // Verificar en BD que está PENDIENTE_VINCULACION
    let devices = lan_service::list_mobile_devices(&state.pool(), &MobileDeviceFilter::default())
        .await
        .unwrap();
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].estado_vinculacion, "PENDIENTE_VINCULACION");
    assert_eq!(devices[0].creado_por_nombre, "admin");

    // 2. Recepcionista bloqueado por RBAC
    let recep = create_receptionist_user(&state).await;
    let recep_err = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &recep,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "Android Molinete".into(),
        },
    )
    .await;
    assert!(matches!(recep_err, Err(AppError::Forbidden(_))));

    // 3. Auditoría registrada con detalles < 200 bytes
    let audit_row = sqlx::query("SELECT detalles_json FROM auditoria_logs WHERE accion = 'CREAR_VINCULACION_MOVIL'")
        .fetch_one(&state.pool())
        .await
        .unwrap();
    let det: String = audit_row.get("detalles_json");
    assert!(det.len() < 200, "Auditoría debe ser ligera: {} bytes", det.len());
}

// ============================================================================
// CP-LAN-05: CANJE DE CÓDIGO POR TOKEN DE SESIÓN MÓVIL CSPRNG (32 HEX)
// ============================================================================
#[tokio::test]
async fn test_cp_lan_05_pair_device_success() {
    let (state, _temp, admin) = setup_test_env().await;

    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "Samsung Galaxy A54".into(),
        },
    )
    .await
    .unwrap();

    let paired_session = lan_service::pair_mobile_device(
        &state.pool(),
        PairMobileDeviceInput {
            codigo_vinculacion: pairing.codigo_vinculacion.clone(),
            user_agent: Some("Mozilla/5.0 (Linux; Android 14)".into()),
            ip_address: Some("192.168.1.120".into()),
        },
    )
    .await
    .unwrap();

    assert_eq!(paired_session.token_sesion.len(), 32);
    assert_eq!(paired_session.nombre_dispositivo, "Samsung Galaxy A54");
    assert_eq!(paired_session.gym_name, "ZaramaGYM");

    // Verificar estado en BD actualizado a VINCULADO
    let dev_row = sqlx::query(
        "SELECT estado_vinculacion, token_sesion, ip_ultima_conexion FROM dispositivos_moviles WHERE id = ?",
    )
    .bind(pairing.device_id)
    .fetch_one(&state.pool())
    .await
    .unwrap();

    let estado: String = dev_row.get("estado_vinculacion");
    let token: String = dev_row.get("token_sesion");
    let ip: String = dev_row.get("ip_ultima_conexion");

    assert_eq!(estado, "VINCULADO");
    assert_eq!(token, paired_session.token_sesion);
    assert_eq!(ip, "192.168.1.120");
}

// ============================================================================
// CP-LAN-06: CANJE DE CÓDIGO INVÁLIDO O REUTILIZADO
// ============================================================================
#[tokio::test]
async fn test_cp_lan_06_pair_device_rejection_invalid_or_already_paired() {
    let (state, _temp, admin) = setup_test_env().await;

    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "Pixel 8".into(),
        },
    )
    .await
    .unwrap();

    // 1. Canje con código inexistente
    let err_not_found = lan_service::pair_mobile_device(
        &state.pool(),
        PairMobileDeviceInput {
            codigo_vinculacion: "XXXXXX".into(),
            user_agent: None,
            ip_address: None,
        },
    )
    .await;
    assert!(matches!(err_not_found, Err(AppError::NotFound(_))));

    // 2. Canje exitoso primera vez
    lan_service::pair_mobile_device(
        &state.pool(),
        PairMobileDeviceInput {
            codigo_vinculacion: pairing.codigo_vinculacion.clone(),
            user_agent: None,
            ip_address: None,
        },
    )
    .await
    .unwrap();

    // 3. Intento de reutilización del mismo código (Conflicto)
    let err_conflict = lan_service::pair_mobile_device(
        &state.pool(),
        PairMobileDeviceInput {
            codigo_vinculacion: pairing.codigo_vinculacion,
            user_agent: None,
            ip_address: None,
        },
    )
    .await;
    assert!(matches!(err_conflict, Err(AppError::Conflict(_))));
}

// ============================================================================
// CP-LAN-07: ESCANEO QR MÓVIL SEMÁFORO VERDE
// ============================================================================
#[tokio::test]
async fn test_cp_lan_07_mobile_scan_green() {
    let (state, _temp, admin) = setup_test_env().await;

    // Vincular teléfono
    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "iPhone 15 Molinete".into(),
        },
    )
    .await
    .unwrap();

    let session = lan_service::pair_mobile_device(
        &state.pool(),
        PairMobileDeviceInput {
            codigo_vinculacion: pairing.codigo_vinculacion,
            user_agent: Some("iPhone iOS 17".into()),
            ip_address: Some("192.168.1.15".into()),
        },
    )
    .await
    .unwrap();

    // Cliente con membresía vigente de 25 días
    let (_client_id, qr_token) = create_client_with_membership(&state, &admin, "10203040", 25).await;

    // Escanear QR móvil
    let eval = lan_service::mobile_scan_qr(
        &state.pool(),
        &state,
        MobileScanInput {
            token_sesion: Some(session.token_sesion),
            qr_token: Some(qr_token),
            numero_documento: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(eval.color_semaforo, TrafficLightColor::Verde);
    assert!(eval.ingreso_permitido);
    assert_eq!(eval.modo_ingreso, AttendanceCheckInMode::QrMovilLan);

    // Verificar registro en tabla asistencias con dispositivo_id vinculado
    let asis_id = eval.asistencia_id.expect("Debe retornar ID de asistencia");
    let asis_row = sqlx::query(
        "SELECT modo_ingreso, dispositivo_id FROM asistencias WHERE id = ?",
    )
    .bind(asis_id)
    .fetch_one(&state.pool())
    .await
    .unwrap();

    let modo: String = asis_row.get("modo_ingreso");
    let disp_id: Option<i64> = asis_row.get("dispositivo_id");

    assert_eq!(modo, "QR_MOVIL_LAN");
    assert_eq!(disp_id, Some(pairing.device_id));

    // Contador de escaneos incrementado a 1
    let dev_row = sqlx::query("SELECT total_escaneos FROM dispositivos_moviles WHERE id = ?")
        .bind(pairing.device_id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    let total_scans: i64 = dev_row.get("total_escaneos");
    assert_eq!(total_scans, 1);

    // Auditoría Zero-Noise: CERO registros de auditoría por asistencias rutinarias
    let count_audit: i64 = sqlx::query("SELECT COUNT(*) as c FROM auditoria_logs WHERE accion = 'CHECK_IN'")
        .fetch_one(&state.pool())
        .await
        .unwrap()
        .get("c");
    assert_eq!(count_audit, 0);
}

// ============================================================================
// CP-LAN-08: ESCANEO QR MÓVIL SEMÁFORO AMARILLO (VENCIMIENTO PRÓXIMO O DEUDA)
// ============================================================================
#[tokio::test]
async fn test_cp_lan_08_mobile_scan_yellow() {
    let (state, _temp, admin) = setup_test_env().await;

    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "Tablet Recepción".into(),
        },
    )
    .await
    .unwrap();

    let session = lan_service::pair_mobile_device(
        &state.pool(),
        PairMobileDeviceInput {
            codigo_vinculacion: pairing.codigo_vinculacion,
            user_agent: None,
            ip_address: None,
        },
    )
    .await
    .unwrap();

    // Cliente que vence en 2 días (alerta amarilla <= 5 días)
    let (_client_id, qr_token) = create_client_with_membership(&state, &admin, "55667788", 2).await;

    let eval = lan_service::mobile_scan_qr(
        &state.pool(),
        &state,
        MobileScanInput {
            token_sesion: Some(session.token_sesion),
            qr_token: Some(qr_token),
            numero_documento: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(eval.color_semaforo, TrafficLightColor::Amarillo);
    assert!(eval.ingreso_permitido);
    assert!(eval.alerta_sonora);
    assert_eq!(eval.modo_ingreso, AttendanceCheckInMode::QrMovilLan);
}

// ============================================================================
// CP-LAN-09: ESCANEO QR MÓVIL SEMÁFORO ROJO (MEMBRESÍA VENCIDA)
// ============================================================================
#[tokio::test]
async fn test_cp_lan_09_mobile_scan_red() {
    let (state, _temp, admin) = setup_test_env().await;

    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "Celular Puerta".into(),
        },
    )
    .await
    .unwrap();

    let session = lan_service::pair_mobile_device(
        &state.pool(),
        PairMobileDeviceInput {
            codigo_vinculacion: pairing.codigo_vinculacion,
            user_agent: None,
            ip_address: None,
        },
    )
    .await
    .unwrap();

    // Cliente con membresía vencida hace 5 días
    let (client_id, qr_token) = create_client_with_membership(&state, &admin, "99887766", -5).await;

    // Asegurar estado VENCIDA
    sqlx::query("UPDATE membresias_clientes SET estado = 'VENCIDA' WHERE cliente_id = ?")
        .bind(client_id)
        .execute(&state.pool())
        .await
        .unwrap();

    let eval = lan_service::mobile_scan_qr(
        &state.pool(),
        &state,
        MobileScanInput {
            token_sesion: Some(session.token_sesion),
            qr_token: Some(qr_token),
            numero_documento: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(eval.color_semaforo, TrafficLightColor::Rojo);
    assert!(!eval.ingreso_permitido);
    assert!(eval.alerta_sonora);
    assert!(eval.asistencia_id.is_none());

    // El contador de escaneos del dispositivo aún se incrementa
    let dev_row = sqlx::query("SELECT total_escaneos FROM dispositivos_moviles WHERE id = ?")
        .bind(pairing.device_id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    let total_scans: i64 = dev_row.get("total_escaneos");
    assert_eq!(total_scans, 1);
}

// ============================================================================
// CP-LAN-10: REVOCACIÓN INMEDIATA DE DISPOSITIVO MÓVIL
// ============================================================================
#[tokio::test]
async fn test_cp_lan_10_revoke_device_and_subsequent_scans_rejected() {
    let (state, _temp, admin) = setup_test_env().await;

    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "Dispositivo a Revocar".into(),
        },
    )
    .await
    .unwrap();

    let session = lan_service::pair_mobile_device(
        &state.pool(),
        PairMobileDeviceInput {
            codigo_vinculacion: pairing.codigo_vinculacion,
            user_agent: None,
            ip_address: None,
        },
    )
    .await
    .unwrap();

    let (_client_id, qr_token) = create_client_with_membership(&state, &admin, "33445566", 15).await;

    // 1. Escaneo funciona antes de revocar
    let ok_scan = lan_service::mobile_scan_qr(
        &state.pool(),
        &state,
        MobileScanInput {
            token_sesion: Some(session.token_sesion.clone()),
            qr_token: Some(qr_token.clone()),
            numero_documento: None,
        },
    )
    .await;
    assert!(ok_scan.is_ok());

    // 2. Administrador revoca el dispositivo
    lan_service::revoke_mobile_device(&state.pool(), &admin, pairing.device_id)
        .await
        .unwrap();

    // Verificar en BD: estado REVOCADO y estado_activo = 0
    let dev_row = sqlx::query("SELECT estado_vinculacion, estado_activo, token_sesion FROM dispositivos_moviles WHERE id = ?")
        .bind(pairing.device_id)
        .fetch_one(&state.pool())
        .await
        .unwrap();

    let estado: String = dev_row.get("estado_vinculacion");
    let activo: i64 = dev_row.get("estado_activo");
    let token_opt: Option<String> = dev_row.get("token_sesion");

    assert_eq!(estado, "REVOCADO");
    assert_eq!(activo, 0);
    assert!(token_opt.is_none());

    // 3. Intento de escaneo posterior con el token revocado es rechazado inmediatamente
    let err_scan = lan_service::mobile_scan_qr(
        &state.pool(),
        &state,
        MobileScanInput {
            token_sesion: Some(session.token_sesion),
            qr_token: Some(qr_token),
            numero_documento: None,
        },
    )
    .await;

    assert!(matches!(err_scan, Err(AppError::Unauthorized(_))));
}

// ============================================================================
// CP-LAN-11: FLUJO HTTP COMPLETO A TRAVÉS DEL ENRUTADOR AXUM
// ============================================================================
#[tokio::test]
async fn test_cp_lan_11_http_router_full_flow() {
    let (state, _temp, admin) = setup_test_env().await;
    let app = lan_service::create_lan_router(state.clone());

    // 1. GET / y /scanner sirven HTML5 autocontenido
    let req_html = Request::builder()
        .uri("/scanner")
        .body(Body::empty())
        .unwrap();
    let res_html = app.clone().oneshot(req_html).await.unwrap();
    assert_eq!(res_html.status(), StatusCode::OK);

    // 2. Crear pre-autorización para probar POST /api/lan/pair
    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "HTTP Client Phone".into(),
        },
    )
    .await
    .unwrap();

    let pair_body = serde_json::to_vec(&serde_json::json!({
        "codigoVinculacion": pairing.codigo_vinculacion,
        "userAgent": "TestBrowser/1.0"
    }))
    .unwrap();

    let req_pair = Request::builder()
        .method("POST")
        .uri("/api/lan/pair")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(pair_body))
        .unwrap();

    let res_pair = app.clone().oneshot(req_pair).await.unwrap();
    assert_eq!(res_pair.status(), StatusCode::OK);

    let pair_resp_bytes = axum::body::to_bytes(res_pair.into_body(), 1024 * 16).await.unwrap();
    let pair_resp_json: serde_json::Value = serde_json::from_slice(&pair_resp_bytes).unwrap();
    let token_sesion = pair_resp_json["tokenSesion"].as_str().unwrap().to_string();

    // 3. Cliente con membresía para probar POST /api/lan/scan con Bearer Token
    let (_client_id, qr_token) = create_client_with_membership(&state, &admin, "77112233", 10).await;

    let scan_body = serde_json::to_vec(&serde_json::json!({
        "qrToken": qr_token
    }))
    .unwrap();

    let req_scan = Request::builder()
        .method("POST")
        .uri("/api/lan/scan")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {}", token_sesion))
        .body(Body::from(scan_body))
        .unwrap();

    let res_scan = app.clone().oneshot(req_scan).await.unwrap();
    assert_eq!(res_scan.status(), StatusCode::OK);

    let scan_resp_bytes = axum::body::to_bytes(res_scan.into_body(), 1024 * 16).await.unwrap();
    let scan_resp_json: serde_json::Value = serde_json::from_slice(&scan_resp_bytes).unwrap();
    assert_eq!(scan_resp_json["colorSemaforo"], "VERDE");
    assert_eq!(scan_resp_json["modoIngreso"], "QR_MOVIL_LAN");
}

// ============================================================================
// CP-LAN-12: QR ISO-18004 REAL EN PAIRING Y BUNDLE OFFLINE jsQR + CÁMARA
// ============================================================================
#[tokio::test]
async fn test_cp_lan_12_real_qr_svg_and_offline_jsqr_bundle() {
    use base64::{engine::general_purpose, Engine as _};

    let (state, _temp, admin) = setup_test_env().await;

    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "Androidp".into(),
        },
    )
    .await
    .unwrap();

    // 1. Verificar Data URL SVG base64 real (módulos QR <path>, no texto plano V7HAJ7)
    let b64_payload = pairing
        .qr_data_url
        .strip_prefix("data:image/svg+xml;base64,")
        .expect("qr_data_url debe usar data:image/svg+xml;base64,");
    let svg_bytes = general_purpose::STANDARD
        .decode(b64_payload)
        .expect("Base64 del QR SVG debe ser válido");
    let svg_str = String::from_utf8(svg_bytes).expect("SVG debe ser UTF-8");
    assert!(svg_str.contains("<svg"));
    assert!(svg_str.contains("<path"));
    assert!(!svg_str.contains(&format!(">{}<", pairing.codigo_vinculacion)));

    // 2. Verificar que /assets/jsqr.js y /scanner sirvan cámara real + decoder offline
    let app = lan_service::create_lan_router(state);

    let res_js = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/assets/jsqr.js")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res_js.status(), StatusCode::OK);
    let js_bytes = axum::body::to_bytes(res_js.into_body(), 1024 * 512)
        .await
        .unwrap();
    let js_str = String::from_utf8_lossy(&js_bytes);
    assert!(js_str.contains("jsQR"));

    let res_html = app
        .oneshot(
            Request::builder()
                .uri("/scanner")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res_html.status(), StatusCode::OK);
    let html_bytes = axum::body::to_bytes(res_html.into_body(), 1024 * 256)
        .await
        .unwrap();
    let html_str = String::from_utf8_lossy(&html_bytes);
    assert!(html_str.contains("/assets/jsqr.js"));
    assert!(html_str.contains("getUserMedia"));
    assert!(html_str.contains("qrFileInput") && html_str.contains("window.jsQR"));
}

// ============================================================================
// CP-LAN-13: LISTENER DUAL TLS (HTTPS) + HTTP REAL EN EL MISMO PUERTO LAN
// ============================================================================
#[tokio::test]
async fn test_cp_lan_13_live_dual_tls_and_http_listener() {
    use base64::{engine::general_purpose, Engine as _};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let (state, _temp, _admin) = setup_test_env().await;
    lan_service::start_lan_server(&state)
        .await
        .expect("start_lan_server debe iniciar HTTPS+HTTP");
    let status = lan_service::get_lan_server_status(&state)
        .await
        .unwrap();
    assert!(status.is_running);
    assert!(status.https_url.starts_with("https://"));
    assert!(status.ca_cert_pem.contains("BEGIN CERTIFICATE"));

    let port = *state.lan_server_port.read().await;

    // 1. Petición HTTP plano al mismo puerto
    let mut tcp_http = tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("Conexión TCP HTTP debe abrir");
    tcp_http
        .write_all(b"GET /api/lan/ping HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut http_resp = Vec::new();
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tcp_http.read_to_end(&mut http_resp),
    )
    .await
    .expect("Timeout leyendo respuesta HTTP")
    .unwrap();
    let http_str = String::from_utf8_lossy(&http_resp);
    assert!(http_str.contains("200 OK"), "HTTP resp: {}", http_str);
    assert!(http_str.contains("\"status\":\"ok\""), "HTTP resp: {}", http_str);

    // 2. Petición HTTPS real validando contra el Certificado Raíz CA generado por ZaramaGYM
    let ca_pem = state.lan_ca_pem.read().await.clone();
    let mut pem_b64 = String::new();
    let mut inside = false;
    for line in ca_pem.lines() {
        let t = line.trim();
        if t == "-----BEGIN CERTIFICATE-----" {
            inside = true;
        } else if t == "-----END CERTIFICATE-----" {
            break;
        } else if inside {
            pem_b64.push_str(t);
        }
    }
    let ca_der = general_purpose::STANDARD.decode(pem_b64).unwrap();
    let mut roots = rustls::RootCertStore::empty();
    roots.add(rustls::pki_types::CertificateDer::from(ca_der)).unwrap();

    let client_cfg = rustls::ClientConfig::builder_with_provider(std::sync::Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .unwrap()
    .with_root_certificates(roots)
    .with_no_client_auth();

    let connector = tokio_rustls::TlsConnector::from(std::sync::Arc::new(client_cfg));
    let tcp_tls = tokio::net::TcpStream::connect(("127.0.0.1", port))
        .await
        .expect("Conexión TCP TLS debe abrir");
    let server_name = rustls::pki_types::ServerName::try_from("localhost").unwrap();
    let mut tls_stream = connector
        .connect(server_name, tcp_tls)
        .await
        .expect("Handshake TLS con CA local debe triunfar");

    tls_stream
        .write_all(b"GET /api/lan/ping HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut tls_resp = Vec::new();
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tls_stream.read_to_end(&mut tls_resp),
    )
    .await
    .expect("Timeout leyendo respuesta HTTPS")
    .unwrap();
    let tls_str = String::from_utf8_lossy(&tls_resp);
    assert!(tls_str.contains("200 OK"), "HTTPS resp: {}", tls_str);
    assert!(tls_str.contains("\"status\":\"ok\""), "HTTPS resp: {}", tls_str);
}

// ============================================================================
// CP-LAN-14: NORMALIZACIÓN DE QR DE PISTOLA LÁSER ES (zg'...) EN CHECK-IN
// ============================================================================
#[tokio::test]
async fn test_cp_lan_14_hid_keyboard_es_qr_normalization_in_checkin() {
    let (state, _temp, admin) = setup_test_env().await;
    let (client_id, qr_token) = create_client_with_membership(&state, &admin, "77889900", 15).await;

    // Simular pistola láser en teclado español que reemplaza '-' por '\'' y lee minúsculas
    let malformed_hid_input = format!("  {}  ", qr_token.to_lowercase().replace('-', "'"));

    let eval = zarama_gym_lib::services::attendance_service::check_in_client(
        &state.pool(),
        &admin,
        zarama_gym_lib::models::CheckInInput {
            qr_token: Some(malformed_hid_input),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: Some(AttendanceCheckInMode::QrLocal),
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .expect("Check-in debe aceptar token normalizado con apóstrofe HID y minúsculas");

    assert_eq!(eval.cliente_id, client_id);
    assert_eq!(eval.color_semaforo, TrafficLightColor::Verde);
    assert!(eval.ingreso_permitido);
}

// ============================================================================
// CP-LAN-15: ÍCONO OFICIAL ZARAMAGYM Y MANIFEST PWA PARA ACCESO DIRECTO MÓVIL
// ============================================================================
#[tokio::test]
async fn test_cp_lan_15_mobile_pwa_icon_and_manifest_routes() {
    let (state, _temp, _admin) = setup_test_env().await;
    let app = lan_service::create_lan_router(state);

    // 1. Verificar que /scanner declara manifest, apple-touch-icon y favicon oficiales
    let scanner_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/scanner")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(scanner_resp.status(), StatusCode::OK);
    let scanner_bytes = axum::body::to_bytes(scanner_resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let scanner_html = String::from_utf8_lossy(&scanner_bytes);
    assert!(scanner_html.contains(r#"rel="manifest" href="/manifest.webmanifest""#));
    assert!(scanner_html.contains(r#"rel="apple-touch-icon" sizes="180x180" href="/assets/zaramagym-icon.png""#));
    assert!(scanner_html.contains(r#"name="apple-mobile-web-app-capable" content="yes""#));

    // 2. Verificar /manifest.webmanifest
    let manifest_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/manifest.webmanifest")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(manifest_resp.status(), StatusCode::OK);
    let manifest_ct = manifest_resp
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(manifest_ct.contains("application/manifest+json"));
    let manifest_bytes = axum::body::to_bytes(manifest_resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let manifest_json: serde_json::Value = serde_json::from_slice(&manifest_bytes).unwrap();
    assert_eq!(manifest_json["short_name"], "ZaramaGYM");
    assert_eq!(manifest_json["display"], "standalone");
    assert_eq!(manifest_json["start_url"], "/scanner");

    // 3. Verificar PNG embebidos (magic bytes \x89PNG\r\n\x1a\n) en todas las rutas de ícono
    for route in [
        "/assets/zaramagym-icon.png",
        "/assets/zaramagym-icon-256.png",
        "/apple-touch-icon.png",
        "/favicon.ico",
    ] {
        let icon_resp = app
            .clone()
            .oneshot(Request::builder().uri(route).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(icon_resp.status(), StatusCode::OK, "Ruta falló: {}", route);
        let ct = icon_resp
            .headers()
            .get("content-type")
            .unwrap()
            .to_str()
            .unwrap();
        assert_eq!(ct, "image/png", "Content-Type incorrecto en {}", route);
        let bytes = axum::body::to_bytes(icon_resp.into_body(), usize::MAX)
            .await
            .unwrap();
        assert!(bytes.len() > 1024, "PNG demasiado pequeño en {}", route);
        assert_eq!(
            &bytes[..8],
            b"\x89PNG\r\n\x1a\n",
            "Header PNG inválido en {}",
            route
        );
    }
}

// ============================================================================
// CP-LAN-16: ENLACE PRINCIPAL mDNS (zaramagym.local:3443) Y MIGRACIÓN IDEMPOTENTE
// ============================================================================
#[tokio::test]
async fn test_cp_lan_16_mdns_primary_url_and_legacy_migration() {
    let (state, _temp, admin) = setup_test_env().await;

    // 1. Verificar que get_lan_server_status expone zaramagym.local como URL principal
    let status = lan_service::get_lan_server_status(&state).await.unwrap();
    assert_eq!(status.mdns_hostname, "zaramagym.local");
    assert_eq!(
        status.https_url,
        format!("https://zaramagym.local:{}/scanner", status.port)
    );
    assert_eq!(
        status.http_url,
        format!("http://zaramagym.local:{}/scanner", status.port)
    );

    // 2. Verificar que create_mobile_device_pairing genera pairing_url con mDNS zaramagym.local
    let pairing = lan_service::create_mobile_device_pairing(
        &state.pool(),
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "Celular Turno Hotspot".into(),
        },
    )
    .await
    .unwrap();
    assert!(
        pairing
            .pairing_url
            .starts_with(&format!("https://zaramagym.local:{}/scanner?pair=", status.port)),
        "pairing_url inesperada: {}",
        pairing.pairing_url
    );

    // 3. Verificar migración idempotente si una BD antigua tenía 'sistema.local'
    sqlx::query("UPDATE configuracion_sistema SET valor = 'sistema.local' WHERE clave = 'LAN_MDNS_HOSTNAME'")
        .execute(&state.pool())
        .await
        .unwrap();
    zarama_gym_lib::db::run_migrations(&state.pool())
        .await
        .expect("Re-ejecutar migraciones debe migrar sistema.local -> zaramagym.local");
    let migrated_host = lan_service::resolve_mdns_hostname(&state.pool()).await;
    assert_eq!(migrated_host, "zaramagym.local");

    // 4. Verificar que el responder mDNS parsea consultas para zaramagym.local
    let packet = lan_service::build_mdns_a_record_packet(
        0x1234,
        "zaramagym.local",
        std::net::Ipv4Addr::new(192, 168, 43, 100),
    );
    assert!(packet.len() > 24);
    assert_eq!(&packet[packet.len() - 4..], &[192, 168, 43, 100]);
}
