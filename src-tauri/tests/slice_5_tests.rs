use chrono::{Duration, Local};
use rust_decimal::Decimal;
use sqlx::Row;
use std::str::FromStr;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AttendanceCheckInMode, AttendanceFilter, AuthorizeRedPassInput, AuthSession, CheckInInput,
    ClientDetail, CreateClientInput, CreateUserInput, ExtendMembershipInput, LoginCredentials,
    TrafficLightColor, UpdateSystemConfigInput, UserRole,
};
use zarama_gym_lib::services::{
    attendance_service, auth_service, entity_service,
};
use zarama_gym_lib::state::AppState;

/// Helper para crear un entorno aislado con base de datos en archivo temporal
async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_slice5.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new(pool);
    (state, temp_dir)
}

/// Helper para crear clientes de prueba de forma compacta
async fn create_test_client(
    pool: &sqlx::SqlitePool,
    session: &AuthSession,
    dni: &str,
    nombres: &str,
    apellidos: &str,
) -> ClientDetail {
    entity_service::create_client(
        pool,
        session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some(dni.into()),
            nombres: Some(nombres.into()),
            apellidos: Some(apellidos.into()),
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
    .unwrap()
}

// ============================================================================
// TC-S5-01: CHECK-IN VERDE PERFECTO (SIN RUIDO EN AUDITORÍA)
// ============================================================================
#[tokio::test]
async fn test_tc_s5_01_checkin_green_without_audit_noise() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "11223344",
        "Carlos",
        "Verde",
    )
    .await;

    let expiration_date = Local::now().date_naive() + Duration::days(20);
    let expiration_str = format!("{} 23:59:59", expiration_date.format("%Y-%m-%d"));

    // Membresía activa que vence en 20 días amparada en PLAN-1M (id: 2)
    sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, datetime('now', 'localtime'), ?, '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .bind(&expiration_str)
    .execute(&state.pool())
    .await
    .unwrap();

    let check_in = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: None,
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .expect("Check-in verde debe ser exitoso");

    assert_eq!(check_in.color_semaforo, TrafficLightColor::Verde);
    assert!(check_in.ingreso_permitido);
    assert!(!check_in.alerta_sonora);
    assert!(!check_in.es_rebote);
    assert_eq!(check_in.dias_restantes, Some(20));
    assert_eq!(check_in.deuda_total_pendiente, Decimal::ZERO);
    assert_eq!(check_in.modo_ingreso, AttendanceCheckInMode::QrLocal);
    assert!(check_in.asistencia_id.is_some());

    // Verificación crítica: 1 fila en asistencias
    let asis_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM asistencias WHERE cliente_id = ?")
        .bind(client.id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    assert_eq!(asis_count, 1);

    // Verificación crítica de POLÍTICA CERO RUIDO: Cero filas en auditoria_logs para este módulo
    let audit_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM auditoria_logs WHERE modulo = 'ASISTENCIAS'")
            .fetch_one(&state.pool())
            .await
            .unwrap();
    assert_eq!(audit_count, 0, "No debe registrar ruido en auditoria_logs para ingresos de rutina");
}

// ============================================================================
// TC-S5-02: CHECK-IN AMARILLO POR VENCIMIENTO PRÓXIMO (<= 5 DÍAS)
// ============================================================================
#[tokio::test]
async fn test_tc_s5_02_checkin_yellow_near_expiration() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "22334455",
        "Ana",
        "Amarillo",
    )
    .await;

    let expiration_date = Local::now().date_naive() + Duration::days(3);
    let expiration_str = format!("{} 23:59:59", expiration_date.format("%Y-%m-%d"));

    sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, datetime('now', 'localtime'), ?, '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .bind(&expiration_str)
    .execute(&state.pool())
    .await
    .unwrap();

    let check_in = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: None,
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .expect("Check-in amarillo debe ser exitoso");

    assert_eq!(check_in.color_semaforo, TrafficLightColor::Amarillo);
    assert!(check_in.ingreso_permitido);
    assert!(check_in.alerta_sonora);
    assert_eq!(check_in.dias_restantes, Some(3));
    assert!(check_in.motivo_semaforo.contains("Membresía por vencer en 3 día(s)"));
}

// ============================================================================
// TC-S5-03: CHECK-IN AMARILLO POR DEUDA PENDIENTE
// ============================================================================
#[tokio::test]
async fn test_tc_s5_03_checkin_yellow_pending_debt() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "33445566",
        "Luis",
        "Deudor",
    )
    .await;

    // Membresía vence en 25 días (en verde por días)
    let expiration_date = Local::now().date_naive() + Duration::days(25);
    let expiration_str = format!("{} 23:59:59", expiration_date.format("%Y-%m-%d"));

    sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, datetime('now', 'localtime'), ?, '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .bind(&expiration_str)
    .execute(&state.pool())
    .await
    .unwrap();

    // Crédito pendiente de S/ 40.00
    sqlx::query(
        r#"
        INSERT INTO creditos_clientes (
            cliente_id, venta_origen_id, origen_credito, descripcion,
            monto_total, monto_pagado, saldo_pendiente, estado,
            registrado_por_usuario_id, fecha_emision
        ) VALUES (?, NULL, 'MEMBRESIA_PAGO_PARCIAL', 'Saldo de membresía mensual', '80.00', '40.00', '40.00', 'PENDIENTE', 1, datetime('now', 'localtime'));
        "#,
    )
    .bind(client.id)
    .execute(&state.pool())
    .await
    .unwrap();

    let check_in = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: None,
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .expect("Check-in amarillo por deuda debe ser exitoso");

    assert_eq!(check_in.color_semaforo, TrafficLightColor::Amarillo);
    assert!(check_in.ingreso_permitido);
    assert!(check_in.alerta_sonora);
    assert_eq!(check_in.deuda_total_pendiente, Decimal::new(4000, 2));
    assert!(check_in.motivo_semaforo.contains("saldo deudor pendiente de S/ 40.00"));
}

// ============================================================================
// TC-S5-04: CHECK-IN AMARILLO DOBLE (VENCE HOY + DEUDA)
// ============================================================================
#[tokio::test]
async fn test_tc_s5_04_checkin_yellow_double_factor_expires_today_and_debt() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "44556677",
        "Diana",
        "Doble",
    )
    .await;

    // Vence hoy a las 23:59:59
    let today = Local::now().date_naive();
    let expiration_str = format!("{} 23:59:59", today.format("%Y-%m-%d"));

    sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, datetime('now', 'localtime'), ?, '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .bind(&expiration_str)
    .execute(&state.pool())
    .await
    .unwrap();

    // Deuda de S/ 15.00
    sqlx::query(
        r#"
        INSERT INTO creditos_clientes (
            cliente_id, venta_origen_id, origen_credito, descripcion,
            monto_total, monto_pagado, saldo_pendiente, estado,
            registrado_por_usuario_id, fecha_emision
        ) VALUES (?, NULL, 'PRODUCTO_CREDITO', 'Bebida isotónica', '15.00', '0.00', '15.00', 'PENDIENTE', 1, datetime('now', 'localtime'));
        "#,
    )
    .bind(client.id)
    .execute(&state.pool())
    .await
    .unwrap();

    let check_in = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: None,
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .expect("Check-in amarillo doble factor debe procesarse");

    assert_eq!(check_in.color_semaforo, TrafficLightColor::Amarillo);
    assert_eq!(check_in.dias_restantes, Some(0));
    assert_eq!(check_in.deuda_total_pendiente, Decimal::new(1500, 2));
    assert!(check_in.motivo_semaforo.contains("Membresía vence hoy"));
    assert!(check_in.motivo_semaforo.contains("saldo deudor pendiente de S/ 15.00"));
}

// ============================================================================
// TC-S5-05: CHECK-IN ROJO BLOQUEADO (MEMBRESÍA VENCIDA)
// ============================================================================
#[tokio::test]
async fn test_tc_s5_05_checkin_red_blocked_expired_membership() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "55667788",
        "Mario",
        "Vencido",
    )
    .await;

    // Membresía venció ayer a las 23:59:59
    let yesterday = Local::now().date_naive() - Duration::days(1);
    let expiration_str = format!("{} 23:59:59", yesterday.format("%Y-%m-%d"));

    sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, '2026-01-01 08:00:00', ?, '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .bind(&expiration_str)
    .execute(&state.pool())
    .await
    .unwrap();

    let check_in = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: None,
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .expect("Evaluación semafórica en rojo debe retornar DTO");

    assert_eq!(check_in.color_semaforo, TrafficLightColor::Rojo);
    assert!(!check_in.ingreso_permitido);
    assert!(check_in.alerta_sonora);
    assert!(check_in.asistencia_id.is_none());
    assert!(check_in.motivo_semaforo.contains("Membresía vencida el"));

    // Verificación crítica: CERO inserciones en asistencias
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM asistencias WHERE cliente_id = ?")
        .bind(client.id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    assert_eq!(count, 0, "No debe registrar asistencias para accesos rechazados en rojo");

    // Verificación crítica: La membresía pasa a estado 'VENCIDA' por sincronización atómica
    let estado_memb: String = sqlx::query_scalar("SELECT estado FROM membresias_clientes WHERE cliente_id = ?")
        .bind(client.id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    assert_eq!(estado_memb, "VENCIDA");
}

// ============================================================================
// TC-S5-06: CHECK-IN ROJO BLOQUEADO (SIN MEMBRESÍA)
// ============================================================================
#[tokio::test]
async fn test_tc_s5_06_checkin_red_blocked_no_membership() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "66778899",
        "Nora",
        "Nueva",
    )
    .await;

    let check_in = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: None,
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .expect("Check-in sin membresía");

    assert_eq!(check_in.color_semaforo, TrafficLightColor::Rojo);
    assert!(!check_in.ingreso_permitido);
    assert!(check_in.asistencia_id.is_none());
    assert!(check_in.motivo_semaforo.contains("Cliente no registra membresía activa"));
}

// ============================================================================
// TC-S5-07: FILTRO ANTI-REBOTE DINÁMICO (3 MINUTOS)
// ============================================================================
#[tokio::test]
async fn test_tc_s5_07_anti_rebound_filter_3_minutes() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "77889900",
        "Pedro",
        "Rebote",
    )
    .await;

    let expiration_date = Local::now().date_naive() + Duration::days(15);
    let expiration_str = format!("{} 23:59:59", expiration_date.format("%Y-%m-%d"));

    sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, datetime('now', 'localtime'), ?, '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .bind(&expiration_str)
    .execute(&state.pool())
    .await
    .unwrap();

    // 1ra lectura: No es rebote, genera asistencia
    let first = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: None,
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .unwrap();

    assert!(!first.es_rebote);
    assert!(first.ingreso_permitido);
    assert!(first.asistencia_id.is_some());
    let primer_id = first.asistencia_id.unwrap();

    // 2da lectura inmediata: Debe ser detectada como REBOTE
    let second = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: None,
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .unwrap();

    assert!(second.es_rebote, "Segunda lectura inmediata debe marcar es_rebote=true");
    assert!(second.ingreso_permitido);
    assert_eq!(second.asistencia_id, Some(primer_id));

    // Verificación crítica: Solo existe 1 registro en la tabla asistencias
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM asistencias WHERE cliente_id = ?")
        .bind(client.id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    assert_eq!(count, 1, "El filtro anti-rebote no debe duplicar filas en asistencias");
}

// ============================================================================
// TC-S5-08: INGRESO MANUAL POR OLVIDO DE QR (BÚSQUEDA POR DNI)
// ============================================================================
#[tokio::test]
async fn test_tc_s5_08_manual_checkin_by_dni_without_qr() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "88990011",
        "Manuel",
        "DNI",
    )
    .await;

    let expiration_date = Local::now().date_naive() + Duration::days(20);
    let expiration_str = format!("{} 23:59:59", expiration_date.format("%Y-%m-%d"));

    sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, datetime('now', 'localtime'), ?, '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .bind(&expiration_str)
    .execute(&state.pool())
    .await
    .unwrap();

    // Check-in por número de documento (DNI)
    let check_in = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: None,
            cliente_id: None,
            numero_documento: Some("88990011".into()),
            modo_ingreso: None,
            dispositivo_id: None,
            notas: Some("Olvidó credencial QR".into()),
        },
    )
    .await
    .expect("Check-in manual por DNI debe funcionar");

    assert_eq!(check_in.modo_ingreso, AttendanceCheckInMode::ManualOlvidoQr);
    assert_eq!(check_in.color_semaforo, TrafficLightColor::Verde);
    assert!(check_in.ingreso_permitido);
    assert_eq!(check_in.numero_documento, "88990011");
}

// ============================================================================
// TC-S5-09: AUTORIZACIÓN DE PASE DIARIO A CRÉDITO DESDE SEMÁFORO ROJO
// ============================================================================
#[tokio::test]
async fn test_tc_s5_09_authorize_red_daily_pass_credit() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "99001122",
        "Roberto",
        "Rojo",
    )
    .await;

    // Autorizar Pase Diario a Crédito
    let auth_res = attendance_service::authorize_red_daily_pass_credit(
        &state.pool(),
        &admin_session,
        AuthorizeRedPassInput {
            cliente_id: client.id,
            monto_pase: None, // Tomará default 10.00
            notas: Some("Acceso autorizado con pago diferido".into()),
        },
    )
    .await
    .expect("Autorización de pase diario a crédito debe ser exitosa");

    assert_eq!(auth_res.color_semaforo, TrafficLightColor::Rojo);
    assert!(auth_res.ingreso_permitido);
    assert_eq!(auth_res.modo_ingreso, AttendanceCheckInMode::PaseDiarioCreditoRojo);
    assert!(auth_res.credito_generado_id.is_some());
    assert_eq!(auth_res.deuda_total_pendiente, Decimal::new(1000, 2));

    let credito_id = auth_res.credito_generado_id.unwrap();

    // Verificación en creditos_clientes
    let cred_row = sqlx::query(
        "SELECT CAST(monto_total AS TEXT) as monto_total, CAST(saldo_pendiente AS TEXT) as saldo_pendiente, estado, origen_credito FROM creditos_clientes WHERE id = ?",
    )
    .bind(credito_id)
    .fetch_one(&state.pool())
    .await
    .unwrap();

    let monto_str: String = cred_row.get("monto_total");
    let saldo_str: String = cred_row.get("saldo_pendiente");
    let estado: String = cred_row.get("estado");
    let origen: String = cred_row.get("origen_credito");

    let monto = Decimal::from_str(&monto_str).unwrap();
    let saldo = Decimal::from_str(&saldo_str).unwrap();

    assert_eq!(monto, Decimal::new(1000, 2));
    assert_eq!(saldo, Decimal::new(1000, 2));
    assert_eq!(estado, "PENDIENTE");
    assert_eq!(origen, "PASE_DIARIO_SEMAFORO_ROJO");

    // Verificación en membresias_clientes: activo hasta 23:59:59 de hoy
    let memb_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM membresias_clientes WHERE cliente_id = ? AND estado = 'ACTIVA'",
    )
    .bind(client.id)
    .fetch_one(&state.pool())
    .await
    .unwrap();
    assert_eq!(memb_count, 1);

    // Verificación crítica: SÍ audita evento ATTENDANCE_RED_CREDIT_AUTHORIZED
    let audit_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auditoria_logs WHERE accion = 'ATTENDANCE_RED_CREDIT_AUTHORIZED' AND modulo = 'ASISTENCIAS'",
    )
    .fetch_one(&state.pool())
    .await
    .unwrap();
    assert_eq!(audit_count, 1, "Debe auditar autorización de pase a crédito");
}

// ============================================================================
// TC-S5-10: RECUPERACIÓN MANUAL DE DÍAS EXITOSA EN MEMBRESÍA MENSUAL
// ============================================================================
#[tokio::test]
async fn test_tc_s5_10_extend_membership_days_success() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "12344321",
        "Elena",
        "Extensión",
    )
    .await;

    let res = sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, '2026-10-20 08:00:00', '2026-11-20 23:59:59', '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .execute(&state.pool())
    .await
    .unwrap();

    let memb_id = res.last_insert_rowid();

    // Extender 5 días
    let ext = attendance_service::extend_membership_days(
        &state.pool(),
        &admin_session,
        ExtendMembershipInput {
            membresia_id: memb_id,
            dias_otorgados: 5,
            motivo_justificacion: "Reposo médico certificado por lumbalgia aguda".into(),
        },
    )
    .await
    .expect("Extensión de membresía mensual debe procesarse");

    assert_eq!(ext.dias_otorgados, 5);
    assert_eq!(ext.fecha_vencimiento_anterior, "2026-11-20 23:59:59");
    assert_eq!(ext.fecha_vencimiento_nueva, "2026-11-25 23:59:59");

    // Verificar en membresias_clientes
    let new_fv: String =
        sqlx::query_scalar("SELECT fecha_vencimiento FROM membresias_clientes WHERE id = ?")
            .bind(memb_id)
            .fetch_one(&state.pool())
            .await
            .unwrap();
    assert_eq!(new_fv, "2026-11-25 23:59:59");

    // Verificar en extensiones_membresia
    let ext_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM extensiones_membresia WHERE membresia_id = ?")
            .bind(memb_id)
            .fetch_one(&state.pool())
            .await
            .unwrap();
    assert_eq!(ext_count, 1);

    // Verificar auditoría
    let audit_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auditoria_logs WHERE accion = 'MEMBERSHIP_DAYS_EXTENDED' AND modulo = 'MEMBRESIAS'",
    )
    .fetch_one(&state.pool())
    .await
    .unwrap();
    assert_eq!(audit_count, 1);
}

// ============================================================================
// TC-S5-11: RECHAZO DE EXTENSIÓN EN PASE DIARIO (PERMITE_RECUPERACION_DIAS = 0)
// ============================================================================
#[tokio::test]
async fn test_tc_s5_11_extend_membership_rejection_for_daily_pass() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "23455432",
        "David",
        "Diario",
    )
    .await;

    // Membresía de Pase Diario (plan_id: 1, permite_recuperacion_dias = 0)
    let res = sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 1, NULL, datetime('now', 'localtime'), date('now', 'localtime') || ' 23:59:59', '10.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .execute(&state.pool())
    .await
    .unwrap();

    let pase_id = res.last_insert_rowid();

    // Intento de prórroga debe ser rechazado
    let err = attendance_service::extend_membership_days(
        &state.pool(),
        &admin_session,
        ExtendMembershipInput {
            membresia_id: pase_id,
            dias_otorgados: 2,
            motivo_justificacion: "Intento injustificado de prórroga en pase diario".into(),
        },
    )
    .await
    .expect_err("Debe rechazar prórrogas en pases diarios");

    match err {
        AppError::Validation(msg) => {
            assert!(
                msg.contains("no permite recuperación o prórroga"),
                "Mensaje debe indicar la restricción del plan: {}",
                msg
            );
        }
        other => panic!("Se esperaba AppError::Validation, pero se obtuvo: {:?}", other),
    }

    // Base de datos inalterada
    let ext_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM extensiones_membresia")
        .fetch_one(&state.pool())
        .await
        .unwrap();
    assert_eq!(ext_count, 0);
}

// ============================================================================
// TC-S5-12: AJUSTE DE PARÁMETROS GLOBALES CON RBAC
// ============================================================================
#[tokio::test]
async fn test_tc_s5_12_system_config_lifecycle_and_rbac() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // 1. Consulta inicial de parámetros por defecto
    let init_config = attendance_service::get_system_config(&state.pool(), &admin_session)
        .await
        .unwrap();
    assert_eq!(init_config.dias_alerta_amarillo, 5);
    assert_eq!(init_config.minutos_antirebote_qr, 3);
    assert_eq!(init_config.precio_pase_diario_credito_default, Decimal::new(1000, 2));

    // 2. Modificación de configuración por Administrador
    let updated = attendance_service::update_system_config(
        &state.pool(),
        &admin_session,
        UpdateSystemConfigInput {
            dias_alerta_amarillo: Some(7),
            minutos_antirebote_qr: Some(5),
            precio_pase_diario_credito_default: Some(Decimal::new(1200, 2)), // 12.00
        },
    )
    .await
    .expect("Actualización de configuración por admin debe ser exitosa");

    assert_eq!(updated.dias_alerta_amarillo, 7);
    assert_eq!(updated.minutos_antirebote_qr, 5);
    assert_eq!(updated.precio_pase_diario_credito_default, Decimal::new(1200, 2));

    // Verificar persistencia real
    let db_config = attendance_service::get_system_config(&state.pool(), &admin_session)
        .await
        .unwrap();
    assert_eq!(db_config.dias_alerta_amarillo, 7);
    assert_eq!(db_config.minutos_antirebote_qr, 5);
    assert_eq!(db_config.precio_pase_diario_credito_default, Decimal::new(1200, 2));

    // 3. Verificación de auditoría de configuración
    let audit_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auditoria_logs WHERE accion = 'SYSTEM_CONFIG_UPDATED' AND modulo = 'CONFIGURACION'",
    )
    .fetch_one(&state.pool())
    .await
    .unwrap();
    assert_eq!(audit_count, 1);

    // 4. Creación de usuario recepcionista y prueba RBAC
    let _recep_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "recep_test".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "98765432".into(),
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

    let recep_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "recep_test".into(),
            password: "password123".into(),
        },
    )
    .await
    .unwrap();

    // Verificación de guardarraíl RBAC: recepcionista no puede modificar la configuración
    assert_eq!(recep_session.rol, UserRole::Recepcionista);
    let rec_cfg_err = attendance_service::update_system_config(
        &state.pool(),
        &recep_session,
        UpdateSystemConfigInput {
            dias_alerta_amarillo: Some(3),
            minutos_antirebote_qr: None,
            precio_pase_diario_credito_default: None,
        },
    )
    .await
    .expect_err("Recepcionista no debe poder modificar configuración del sistema");
    assert!(matches!(rec_cfg_err, AppError::Forbidden(_)));

    // Recepcionista SÍ puede otorgar prórrogas / días gratis
    let cli_ext = create_test_client(&state.pool(), &admin_session, "65432198", "Luis", "Prorroga").await;
    let res_memb = sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, '2026-10-20 08:00:00', '2026-11-20 23:59:59', '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(cli_ext.id)
    .execute(&state.pool())
    .await
    .unwrap();
    let rec_ext = attendance_service::extend_membership_days(
        &state.pool(),
        &recep_session,
        ExtendMembershipInput {
            membresia_id: res_memb.last_insert_rowid(),
            dias_otorgados: 2,
            motivo_justificacion: "Prórroga autorizada en recepción".into(),
        },
    )
    .await
    .expect("Recepcionista debe poder otorgar días gratis/prórrogas");
    assert_eq!(rec_ext.dias_otorgados, 2);

    // 5. Validaciones de entrada en la función de actualización
    let val_err = attendance_service::update_system_config(
        &state.pool(),
        &admin_session,
        UpdateSystemConfigInput {
            dias_alerta_amarillo: Some(0), // Inválido (< 1)
            minutos_antirebote_qr: None,
            precio_pase_diario_credito_default: None,
        },
    )
    .await
    .expect_err("Días alerta amarillo < 1 debe fallar");

    assert!(matches!(val_err, AppError::Validation(_)));
}

// ============================================================================
// TC-S5-13: CONSULTAS DE HISTORIAL, FILTROS Y RESUMEN DE JORNADA
// ============================================================================
#[tokio::test]
async fn test_tc_s5_13_summary_and_listing_queries() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let client = create_test_client(
        &state.pool(),
        &admin_session,
        "99887766",
        "Consulta",
        "Prueba",
    )
    .await;

    let expiration_date = Local::now().date_naive() + Duration::days(15);
    let expiration_str = format!("{} 23:59:59", expiration_date.format("%Y-%m-%d"));

    sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (?, 2, NULL, datetime('now', 'localtime'), ?, '80.00', 'ACTIVA', 1);
        "#,
    )
    .bind(client.id)
    .bind(&expiration_str)
    .execute(&state.pool())
    .await
    .unwrap();

    let checkin = attendance_service::check_in_client(
        &state.pool(),
        &admin_session,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: None,
            dispositivo_id: None,
            notas: Some("Acceso de consulta".into()),
        },
    )
    .await
    .unwrap();

    assert!(checkin.ingreso_permitido);

    // Listar asistencias sin filtro
    let list = attendance_service::list_attendances(
        &state.pool(),
        &admin_session,
        &AttendanceFilter::default(),
    )
    .await
    .unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].cliente_id, client.id);
    assert_eq!(list[0].nombre_completo, "Consulta Prueba");

    // Filtrar por color VERDE
    let green_list = attendance_service::list_attendances(
        &state.pool(),
        &admin_session,
        &AttendanceFilter {
            color_semaforo: Some(TrafficLightColor::Verde),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(green_list.len(), 1);

    // Filtrar por color ROJO (debe ser 0)
    let red_list = attendance_service::list_attendances(
        &state.pool(),
        &admin_session,
        &AttendanceFilter {
            color_semaforo: Some(TrafficLightColor::Rojo),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(red_list.len(), 0);

    // Resumen de la jornada
    let summary = attendance_service::get_attendance_summary_today(&state.pool(), &admin_session)
        .await
        .unwrap();
    assert_eq!(summary.total_ingresos_hoy, 1);
    assert_eq!(summary.total_verde, 1);
    assert_eq!(summary.total_amarillo, 0);
    assert_eq!(summary.total_rojo_autorizados, 0);
    assert_eq!(summary.total_qr_local, 1);
}
