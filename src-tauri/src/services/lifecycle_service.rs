// ============================================================================
// SERVICIO: CICLO DE VIDA DE VENTANA, INTEGRIDAD DE CAJA Y CRASH RECOVERY
// 1. Interceptación preventiva de cierre de ventana (WindowEvent::CloseRequested)
// 2. Bandera persistente + Heartbeat en SQLite para detección de cierre forzado
// Ubicación: src-tauri/src/services/lifecycle_service.rs
// ============================================================================

use crate::errors::AppError;
use crate::models::{CloseBlockedPayload, CrashRecoveryNotice};
use crate::services::audit_service::record_audit;
use crate::state::AppState;
use chrono::Local;
use sqlx::{Row, SqlitePool};
use std::time::Duration;

pub const KEY_RUNTIME_RUNNING: &str = "APP_RUNTIME_RUNNING";
pub const KEY_RUNTIME_LAST_HEARTBEAT: &str = "APP_RUNTIME_LAST_HEARTBEAT";
pub const KEY_RUNTIME_ACTIVE_USERNAME: &str = "APP_RUNTIME_ACTIVE_USERNAME";
pub const KEY_RUNTIME_ACTIVE_USER_ID: &str = "APP_RUNTIME_ACTIVE_USER_ID";

#[derive(Debug, Clone)]
pub struct OpenCashShiftBrief {
    pub shift_id: i64,
    pub usuario_apertura_id: i64,
    pub usuario_apertura_username: String,
    pub usuario_apertura_nombre: String,
    pub fecha_apertura: String,
}

fn current_local_timestamp() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

async fn upsert_runtime_key(
    pool: &SqlitePool,
    clave: &str,
    valor: &str,
    descripcion: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO configuracion_sistema (clave, valor, descripcion, updated_at)
        VALUES (?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(clave) DO UPDATE SET
            valor = excluded.valor,
            updated_at = datetime('now', 'localtime')
        "#,
    )
    .bind(clave)
    .bind(valor)
    .bind(descripcion)
    .execute(pool)
    .await?;
    Ok(())
}

async fn get_runtime_key(pool: &SqlitePool, clave: &str) -> Result<Option<String>, AppError> {
    let row = sqlx::query("SELECT valor FROM configuracion_sistema WHERE clave = ?")
        .bind(clave)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.get::<String, _>("valor")))
}

/// Consulta si existe actualmente algún turno de caja en estado ABIERTO.
pub async fn get_open_cash_shift_brief(
    pool: &SqlitePool,
) -> Result<Option<OpenCashShiftBrief>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT
            tc.id AS shift_id,
            tc.usuario_apertura_id,
            u.username AS usuario_apertura_username,
            TRIM(p.nombres || ' ' || p.apellidos) AS usuario_apertura_nombre,
            tc.fecha_apertura
        FROM turnos_caja tc
        INNER JOIN usuarios_sistema u ON tc.usuario_apertura_id = u.id
        INNER JOIN personas p ON u.persona_id = p.id
        WHERE tc.estado = 'ABIERTO'
        ORDER BY tc.id DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| OpenCashShiftBrief {
        shift_id: r.get("shift_id"),
        usuario_apertura_id: r.get("usuario_apertura_id"),
        usuario_apertura_username: r.get("usuario_apertura_username"),
        usuario_apertura_nombre: r.get("usuario_apertura_nombre"),
        fecha_apertura: r.get("fecha_apertura"),
    }))
}

/// Se ejecuta al arrancar la aplicación:
/// 1. Evalúa si la bandera `APP_RUNTIME_RUNNING` seguía en `"1"` (cierre forzado / corte eléctrico).
/// 2. Si estaba en `"1"` y existe un turno de caja ABIERTO, registra `CIERRE_FORZADO_DETECTADO`
///    en `auditoria_logs` y guarda un `CrashRecoveryNotice` en `AppState` para avisar en UI.
/// 3. Si estaba en `"1"` sin turno abierto, igual deja constancia de auditoría `CIERRE_FORZADO_DETECTADO`
///    en el módulo `SISTEMA` sin molestar con modal bloqueante.
/// 4. Marca la nueva ejecución como activa (`APP_RUNTIME_RUNNING = "1"`) con el heartbeat actual.
pub async fn detect_and_mark_startup(
    pool: &SqlitePool,
    state: &AppState,
) -> Result<Option<CrashRecoveryNotice>, AppError> {
    let prev_running = get_runtime_key(pool, KEY_RUNTIME_RUNNING)
        .await?
        .unwrap_or_else(|| "0".to_string());
    let prev_heartbeat = get_runtime_key(pool, KEY_RUNTIME_LAST_HEARTBEAT)
        .await?
        .filter(|s| !s.trim().is_empty());
    let prev_username = get_runtime_key(pool, KEY_RUNTIME_ACTIVE_USERNAME)
        .await?
        .filter(|s| !s.trim().is_empty());
    let prev_user_id = get_runtime_key(pool, KEY_RUNTIME_ACTIVE_USER_ID)
        .await?
        .and_then(|s| s.trim().parse::<i64>().ok());

    let restarted_at = current_local_timestamp();
    let open_shift = get_open_cash_shift_brief(pool).await?;

    let mut notice_out: Option<CrashRecoveryNotice> = None;

    if prev_running == "1" {
        if let Some(shift) = open_shift {
            let audit_user_id = prev_user_id.or(Some(shift.usuario_apertura_id));
            let audit_username = prev_username
                .clone()
                .unwrap_or_else(|| shift.usuario_apertura_username.clone());

            let detalles = serde_json::json!({
                "turno_id": shift.shift_id,
                "ultima_actividad": prev_heartbeat.clone().unwrap_or_else(|| shift.fecha_apertura.clone()),
                "reinicio": restarted_at,
                "caja_abierta": true
            })
            .to_string();

            let _ = record_audit(
                pool,
                audit_user_id,
                &audit_username,
                "CIERRE_FORZADO_DETECTADO",
                "CAJA_INTEGRIDAD",
                &detalles,
                Some("CRASH_RECOVERY"),
            )
            .await;

            let message = format!(
                "Se detectó un cierre inesperado o forzado de la aplicación mientras el Turno de Caja #{} (abierto por @{}) permanecía ABIERTO. Todos los montos y ventas fueron preservados en SQLite y el incidente quedó auditado. Retoma la operación o realiza el Arqueo y Cierre de Caja.",
                shift.shift_id, shift.usuario_apertura_username
            );

            let notice = CrashRecoveryNotice {
                detected: true,
                had_open_cash_shift: true,
                shift_id: Some(shift.shift_id),
                shift_opened_by_username: Some(shift.usuario_apertura_username),
                shift_opened_by_name: Some(shift.usuario_apertura_nombre),
                shift_opened_at: Some(shift.fecha_apertura),
                last_active_username: prev_username,
                last_heartbeat_at: prev_heartbeat,
                restarted_at: restarted_at.clone(),
                message,
            };

            state.set_crash_recovery_notice(Some(notice.clone())).await;
            notice_out = Some(notice);
        } else {
            // Cierre forzado sin caja abierta: constatar en auditoría sin modal bloqueante
            let audit_username = prev_username.unwrap_or_else(|| "SYSTEM".to_string());
            let detalles = serde_json::json!({
                "ultima_actividad": prev_heartbeat.unwrap_or_else(|| "DESCONOCIDA".to_string()),
                "reinicio": restarted_at,
                "caja_abierta": false
            })
            .to_string();

            let _ = record_audit(
                pool,
                prev_user_id,
                &audit_username,
                "CIERRE_FORZADO_DETECTADO",
                "SISTEMA",
                &detalles,
                Some("CRASH_RECOVERY"),
            )
            .await;
        }
    }

    // Activar bandera de ejecución actual y heartbeat inicial
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_RUNNING,
        "1",
        "Bandera interna de ejecución activa (1=corriendo, 0=cierre limpio)",
    )
    .await?;
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_LAST_HEARTBEAT,
        &restarted_at,
        "Última marca temporal de actividad (heartbeat) de la aplicación",
    )
    .await?;
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_ACTIVE_USERNAME,
        "",
        "Último usuario con sesión activa durante la ejecución actual",
    )
    .await?;
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_ACTIVE_USER_ID,
        "",
        "ID del último usuario con sesión activa durante la ejecución actual",
    )
    .await?;

    Ok(notice_out)
}

/// Actualiza el usuario activo en las banderas de runtime y refresca el heartbeat.
pub async fn update_runtime_active_user(
    pool: &SqlitePool,
    user_id: Option<i64>,
    username: Option<&str>,
) -> Result<(), AppError> {
    let uid_str = user_id.map(|id| id.to_string()).unwrap_or_default();
    let uname_str = username.unwrap_or("");
    let now = current_local_timestamp();

    upsert_runtime_key(
        pool,
        KEY_RUNTIME_ACTIVE_USER_ID,
        &uid_str,
        "ID del último usuario con sesión activa durante la ejecución actual",
    )
    .await?;
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_ACTIVE_USERNAME,
        uname_str,
        "Último usuario con sesión activa durante la ejecución actual",
    )
    .await?;
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_LAST_HEARTBEAT,
        &now,
        "Última marca temporal de actividad (heartbeat) de la aplicación",
    )
    .await?;
    Ok(())
}

/// Actualiza el heartbeat solo si la aplicación sigue marcada como activa (`APP_RUNTIME_RUNNING = '1'`).
pub async fn record_runtime_heartbeat(pool: &SqlitePool) -> Result<(), AppError> {
    let now = current_local_timestamp();
    sqlx::query(
        r#"
        UPDATE configuracion_sistema
        SET valor = ?, updated_at = datetime('now', 'localtime')
        WHERE clave = ?
          AND EXISTS (
              SELECT 1 FROM configuracion_sistema
              WHERE clave = ? AND valor = '1'
          )
        "#,
    )
    .bind(&now)
    .bind(KEY_RUNTIME_LAST_HEARTBEAT)
    .bind(KEY_RUNTIME_RUNNING)
    .execute(pool)
    .await?;
    Ok(())
}

/// Lanza un latido (heartbeat) en segundo plano cada 30 segundos para registrar la última hora
/// de actividad real en caso de apagado brusco o terminación forzada desde el Administrador de Tareas.
pub fn start_runtime_heartbeat_task(state: AppState) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        // Descartar el tick inmediato del segundo 0
        interval.tick().await;
        loop {
            interval.tick().await;
            let pool = state.pool();
            let _ = record_runtime_heartbeat(&pool).await;
        }
    });
}

/// Marca el apagado limpio de la aplicación (`APP_RUNTIME_RUNNING = "0"`).
pub async fn mark_clean_shutdown(pool: &SqlitePool) -> Result<(), AppError> {
    let now = current_local_timestamp();
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_RUNNING,
        "0",
        "Bandera interna de ejecución activa (1=corriendo, 0=cierre limpio)",
    )
    .await?;
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_LAST_HEARTBEAT,
        &now,
        "Última marca temporal de actividad (heartbeat) de la aplicación",
    )
    .await?;
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_ACTIVE_USERNAME,
        "",
        "Último usuario con sesión activa durante la ejecución actual",
    )
    .await?;
    upsert_runtime_key(
        pool,
        KEY_RUNTIME_ACTIVE_USER_ID,
        "",
        "ID del último usuario con sesión activa durante la ejecución actual",
    )
    .await?;
    Ok(())
}

/// Manejador preventivo al intentar cerrar la ventana desde la "X" de Windows (`WindowEvent::CloseRequested`).
/// - Si existe un turno de caja ABIERTO: devuelve `Ok(Some(CloseBlockedPayload))` para que el
///   caller ejecute `api.prevent_close()` y notifique al Frontend.
/// - Si NO existe turno abierto: cierra sesión limpiamente si aplica, limpia la bandera
///   `APP_RUNTIME_RUNNING = "0"` y devuelve `Ok(None)` para permitir el cierre de la ventana.
pub async fn handle_window_close_requested(
    state: &AppState,
) -> Result<Option<CloseBlockedPayload>, AppError> {
    let pool = state.pool();

    if let Some(shift) = get_open_cash_shift_brief(&pool).await? {
        let message = format!(
            "No puedes cerrar ZaramaGYM mientras el Turno de Caja #{} (abierto por @{}) permanezca ABIERTO. Realiza primero el Arqueo y Cierre de Caja en el módulo POS.",
            shift.shift_id, shift.usuario_apertura_username
        );

        return Ok(Some(CloseBlockedPayload {
            shift_id: shift.shift_id,
            usuario_apertura_username: shift.usuario_apertura_username,
            usuario_apertura_nombre: shift.usuario_apertura_nombre,
            fecha_apertura: shift.fecha_apertura,
            message,
        }));
    }

    // No hay turno de caja abierto -> cerrar sesión si existe una sesión activa
    if let Some(session) = state.get_session().await {
        let _ = record_audit(
            &pool,
            Some(session.user_id),
            &session.username,
            "LOGOUT",
            "AUTH",
            r#"{"mensaje": "Cierre de sesión automático al cerrar ventana"}"#,
            None,
        )
        .await;
        state.set_session(None).await;
    }

    // Apagar la bandera de ejecución activa para distinguir cierre normal de cierre forzado
    mark_clean_shutdown(&pool).await?;

    Ok(None)
}
