// ============================================================================
// PRUEBAS DE INTEGRACIÓN RUST: INTEGRIDAD DE CIERRE DE VENTANA Y CRASH RECOVERY
// Verifica:
//  - CP-LIFE-01: Bloqueo preventivo de cierre (X) con turno de caja ABIERTO
//  - CP-LIFE-02: Cierre limpio por X sin turno abierto (logout + flag = "0")
//  - CP-LIFE-03: Reinicio tras cierre limpio NO dispara falso positivo
//  - CP-LIFE-04: Crash Recovery tras cierre forzado/apagado con caja ABIERTA
//  - CP-LIFE-05: Cierre forzado sin caja abierta audita sin modal de caja
// Ubicación: src-tauri/tests/lifecycle_integrity_tests.rs
// ============================================================================

use rust_decimal::Decimal;
use sqlx::Row;
use std::str::FromStr;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::models::{
    AuditFilter, AuthSession, CloseCashShiftInput, LoginCredentials, OpenCashShiftInput,
};
use zarama_gym_lib::services::{audit_service, auth_service, lifecycle_service, pos_service};
use zarama_gym_lib::state::AppState;

async fn setup_test_env() -> (sqlx::SqlitePool, AppState) {
    let pool = init_db("sqlite::memory:")
        .await
        .expect("Fallo al inicializar DB en memoria");
    let state = AppState::new(pool.clone());
    (pool, state)
}

async fn login_admin(pool: &sqlx::SqlitePool, state: &AppState) -> AuthSession {
    auth_service::login(
        pool,
        state,
        LoginCredentials {
            username: "admin".to_string(),
            password: "admin123".to_string(),
        },
    )
    .await
    .expect("Login admin debe funcionar")
}

#[tokio::test]
async fn cp_life_01_close_requested_blocked_when_cash_shift_is_open() {
    let (pool, state) = setup_test_env().await;

    // Arranque limpio inicial
    let startup_notice = lifecycle_service::detect_and_mark_startup(&pool, &state)
        .await
        .expect("Startup inicial OK");
    assert!(startup_notice.is_none());

    let session = login_admin(&pool, &state).await;

    // Abrir turno de caja
    let shift = pos_service::open_cash_shift(
        &pool,
        &session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("150.00").unwrap(),
            notas_apertura: Some("Turno mañana".to_string()),
        },
    )
    .await
    .expect("Debe abrir turno de caja");

    // Intentar cerrar la ventana desde la X de Windows
    let blocked = lifecycle_service::handle_window_close_requested(&state)
        .await
        .expect("Verificación de cierre no debe fallar");

    assert!(
        blocked.is_some(),
        "Debe bloquear el cierre cuando hay turno de caja ABIERTO"
    );
    let payload = blocked.unwrap();
    assert_eq!(payload.shift_id, shift.id);
    assert_eq!(payload.usuario_apertura_username, "admin");
    assert!(payload.message.contains("Arqueo y Cierre de Caja"));

    // La sesión sigue intacta y la bandera APP_RUNTIME_RUNNING sigue en "1"
    assert!(state.get_session().await.is_some());
    let flag: String = sqlx::query("SELECT valor FROM configuracion_sistema WHERE clave = ?")
        .bind(lifecycle_service::KEY_RUNTIME_RUNNING)
        .fetch_one(&pool)
        .await
        .unwrap()
        .get("valor");
    assert_eq!(flag, "1");
}

#[tokio::test]
async fn cp_life_02_and_03_clean_close_when_no_open_shift_and_clean_restart() {
    let (pool, state) = setup_test_env().await;

    lifecycle_service::detect_and_mark_startup(&pool, &state)
        .await
        .expect("Startup inicial OK");
    let session = login_admin(&pool, &state).await;

    // Abrir y cerrar turno de caja correctamente
    pos_service::open_cash_shift(
        &pool,
        &session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("100.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    pos_service::close_cash_shift(
        &pool,
        &session,
        CloseCashShiftInput {
            monto_cierre_fisico_declarado: Decimal::from_str("100.00").unwrap(),
            notas_cierre: Some("Arqueo exacto".to_string()),
        },
    )
    .await
    .unwrap();

    // Intentar cerrar la ventana (X) sin turno abierto -> debe permitir cierre limpio
    let blocked = lifecycle_service::handle_window_close_requested(&state)
        .await
        .expect("Cierre limpio OK");
    assert!(blocked.is_none(), "No debe bloquear cierre sin caja abierta");

    // Sesión cerrada y bandera en "0"
    assert!(state.get_session().await.is_none());
    let flag: String = sqlx::query("SELECT valor FROM configuracion_sistema WHERE clave = ?")
        .bind(lifecycle_service::KEY_RUNTIME_RUNNING)
        .fetch_one(&pool)
        .await
        .unwrap()
        .get("valor");
    assert_eq!(flag, "0");

    // Simular reinicio limpio (nuevo AppState compartiendo el mismo SQLite)
    let restarted_state = AppState::new(pool.clone());
    let notice = lifecycle_service::detect_and_mark_startup(&pool, &restarted_state)
        .await
        .expect("Reinicio limpio OK");
    assert!(
        notice.is_none(),
        "Tras cierre limpio NO debe dispararse aviso de crash recovery"
    );

    // No debe haber ningún CIERRE_FORZADO_DETECTADO en auditoría
    let logs = audit_service::get_audit_logs(
        &pool,
        &AuditFilter {
            accion: Some("CIERRE_FORZADO_DETECTADO".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert!(logs.is_empty());
}

#[tokio::test]
async fn cp_life_04_crash_recovery_detects_forced_termination_with_open_cash_shift() {
    let (pool, state) = setup_test_env().await;

    // 1. Ejecución 1: inicia app, login, abre caja y registra heartbeat
    lifecycle_service::detect_and_mark_startup(&pool, &state)
        .await
        .unwrap();
    let session = login_admin(&pool, &state).await;

    let shift = pos_service::open_cash_shift(
        &pool,
        &session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("220.00").unwrap(),
            notas_apertura: Some("Turno tarde".to_string()),
        },
    )
    .await
    .unwrap();

    lifecycle_service::record_runtime_heartbeat(&pool)
        .await
        .unwrap();

    // 2. Simulación de TerminateProcess / apagado brusco (NO se llama handle_window_close_requested)
    drop(state);

    // 3. Ejecución 2: la aplicación vuelve a arrancar sobre la misma BD SQLite
    let recovered_state = AppState::new(pool.clone());
    let notice = lifecycle_service::detect_and_mark_startup(&pool, &recovered_state)
        .await
        .expect("Crash recovery al arrancar debe ejecutarse sin error");

    assert!(
        notice.is_some(),
        "Debe detectar cierre forzado con turno de caja ABIERTO"
    );
    let n = notice.unwrap();
    assert!(n.detected);
    assert!(n.had_open_cash_shift);
    assert_eq!(n.shift_id, Some(shift.id));
    assert_eq!(n.shift_opened_by_username.as_deref(), Some("admin"));
    assert_eq!(n.last_active_username.as_deref(), Some("admin"));
    assert!(n.last_heartbeat_at.is_some());
    assert!(!n.restarted_at.is_empty());

    // El estado en memoria guarda el aviso para entregarlo al Frontend
    assert!(recovered_state.get_crash_recovery_notice().await.is_some());

    // Debe haberse insertado el evento CIERRE_FORZADO_DETECTADO en auditoria_logs
    let logs = audit_service::get_audit_logs(
        &pool,
        &AuditFilter {
            accion: Some("CIERRE_FORZADO_DETECTADO".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].modulo, "CAJA_INTEGRIDAD");
    assert_eq!(logs[0].username, "admin");
    assert!(logs[0].detalles_json.contains("\"caja_abierta\":true"));
    assert!(logs[0].detalles_json.contains("\"ultima_actividad\""));
    assert!(logs[0].detalles_json.contains("\"reinicio\""));

    // Al reconocer (acknowledge) el aviso, se limpia de AppState
    recovered_state.clear_crash_recovery_notice().await;
    assert!(recovered_state.get_crash_recovery_notice().await.is_none());
}

#[tokio::test]
async fn cp_life_05_forced_termination_without_open_shift_audits_silently() {
    let (pool, state) = setup_test_env().await;

    lifecycle_service::detect_and_mark_startup(&pool, &state)
        .await
        .unwrap();
    let _ = login_admin(&pool, &state).await;

    // Muerte abrupta sin abrir turno de caja
    drop(state);

    let recovered_state = AppState::new(pool.clone());
    let notice = lifecycle_service::detect_and_mark_startup(&pool, &recovered_state)
        .await
        .unwrap();

    // No bloquea UI con modal de recuperación de caja
    assert!(notice.is_none());
    assert!(recovered_state.get_crash_recovery_notice().await.is_none());

    // Sí queda trazabilidad en la bitácora de auditoría
    let logs = audit_service::get_audit_logs(
        &pool,
        &AuditFilter {
            accion: Some("CIERRE_FORZADO_DETECTADO".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].modulo, "SISTEMA");
    assert!(logs[0].detalles_json.contains("\"caja_abierta\":false"));
}

#[tokio::test]
async fn cp_life_06_safe_update_blocked_when_cash_shift_is_open() {
    let (pool, state) = setup_test_env().await;
    lifecycle_service::detect_and_mark_startup(&pool, &state)
        .await
        .unwrap();
    let session = login_admin(&pool, &state).await;

    let shift = pos_service::open_cash_shift(
        &pool,
        &session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("80.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let temp_dir = tempfile::tempdir().unwrap();
    let res = lifecycle_service::prepare_safe_app_update(
        &state,
        &session,
        "0.2.0",
        Some(temp_dir.path()),
    )
    .await;

    assert!(res.is_err(), "No debe permitir actualizar con caja abierta");
    let err_msg = res.unwrap_err().to_string();
    assert!(
        err_msg.contains(&format!("Turno de Caja #{}", shift.id)),
        "Mensaje inesperado: {}",
        err_msg
    );
}

#[tokio::test]
async fn cp_life_07_safe_update_creates_verified_backup_audits_and_marks_clean_shutdown() {
    // Usar SQLite real en archivo temporal para probar el camino exacto de producción (VACUUM INTO + backups/)
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("zaramagym_update_test.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy().replace('\\', "/"));
    let pool = init_db(&db_url)
        .await
        .expect("Fallo al inicializar DB temporal en disco");
    let state = AppState::new_with_db_path(pool.clone(), db_path);

    lifecycle_service::detect_and_mark_startup(&pool, &state)
        .await
        .unwrap();
    let session = login_admin(&pool, &state).await;

    let prep = lifecycle_service::prepare_safe_app_update(
        &state,
        &session,
        "0.2.0",
        None,
    )
    .await
    .expect("Preparación de actualización segura debe triunfar sin caja abierta");

    assert_eq!(prep.target_version, "0.2.0");
    assert!(prep.integrity_verified);
    assert!(prep.backup_size_bytes > 0);
    assert!(std::path::Path::new(&prep.backup_path).exists());

    // Bandera APP_RUNTIME_RUNNING debe haberse apagado a "0" para reinicio limpio sin falso Crash Recovery
    let flag: String = sqlx::query("SELECT valor FROM configuracion_sistema WHERE clave = ?")
        .bind(lifecycle_service::KEY_RUNTIME_RUNNING)
        .fetch_one(&pool)
        .await
        .unwrap()
        .get("valor");
    assert_eq!(flag, "0");

    // Debe haberse auditado APP_UPDATE_INITIATED
    let logs = audit_service::get_audit_logs(
        &pool,
        &AuditFilter {
            accion: Some("APP_UPDATE_INITIATED".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(logs.len(), 1);
    assert!(logs[0].detalles_json.contains("0.2.0"));

    // Simular fallo de descarga -> restaurar bandera runtime a "1" para seguir protegido fluidamente
    lifecycle_service::restore_runtime_after_failed_update(&state, &session)
        .await
        .unwrap();
    let flag_after: String = sqlx::query("SELECT valor FROM configuracion_sistema WHERE clave = ?")
        .bind(lifecycle_service::KEY_RUNTIME_RUNNING)
        .fetch_one(&pool)
        .await
        .unwrap()
        .get("valor");
    assert_eq!(flag_after, "1");

    pool.close().await;
}

#[tokio::test]
async fn cp_life_08_safe_update_forbidden_for_receptionist() {
    let (_pool, state) = setup_test_env().await;
    let fake_recep = AuthSession {
        user_id: 99,
        persona_id: 99,
        username: "recep_test".to_string(),
        nombre_completo: "Recepcionista Test".to_string(),
        rol: zarama_gym_lib::models::UserRole::Recepcionista,
        foto_perfil_data_url: None,
        is_locked: false,
        login_at: "2026-11-20 08:00:00".to_string(),
    };

    let temp_dir = tempfile::tempdir().unwrap();
    let res = lifecycle_service::prepare_safe_app_update(
        &state,
        &fake_recep,
        "0.2.0",
        Some(temp_dir.path()),
    )
    .await;
    assert!(res.is_err(), "Recepcionista no debe poder ejecutar actualizaciones del sistema");
}
