use crate::errors::AppError;
use crate::models::dashboard::ReceptionistPermissionsDto;
use crate::models::user::{AuthSession, UserRole};
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ReceptionistPermissionKey {
    VerIngresosMesOperativo,
    VerTabFinanzas,
    VerDashboardModuloFinanzas,
    VerTabSocios,
    VerTabAsistencia,
    VerTabInventario,
    VerTabControl,
    ExportarClientes,
    ExportarDeudores,
    ExportarVentasCaja,
    ExportarContextualBi,
    ExportarReporteEjecutivoPdf,
}

impl ReceptionistPermissionKey {
    pub const ALL: [ReceptionistPermissionKey; 12] = [
        ReceptionistPermissionKey::VerIngresosMesOperativo,
        ReceptionistPermissionKey::VerTabFinanzas,
        ReceptionistPermissionKey::VerDashboardModuloFinanzas,
        ReceptionistPermissionKey::VerTabSocios,
        ReceptionistPermissionKey::VerTabAsistencia,
        ReceptionistPermissionKey::VerTabInventario,
        ReceptionistPermissionKey::VerTabControl,
        ReceptionistPermissionKey::ExportarClientes,
        ReceptionistPermissionKey::ExportarDeudores,
        ReceptionistPermissionKey::ExportarVentasCaja,
        ReceptionistPermissionKey::ExportarContextualBi,
        ReceptionistPermissionKey::ExportarReporteEjecutivoPdf,
    ];

    pub fn config_key(&self) -> &'static str {
        match self {
            ReceptionistPermissionKey::VerIngresosMesOperativo => "HOME_RBAC_REC_MONTHLY_REVENUE",
            ReceptionistPermissionKey::VerTabFinanzas => "HOME_RBAC_REC_TAB_FINANCE",
            ReceptionistPermissionKey::VerDashboardModuloFinanzas => {
                "HOME_RBAC_REC_FINANCE_MODULE_DASHBOARD"
            }
            ReceptionistPermissionKey::VerTabSocios => "HOME_RBAC_REC_TAB_MEMBERS",
            ReceptionistPermissionKey::VerTabAsistencia => "HOME_RBAC_REC_TAB_ATTENDANCE",
            ReceptionistPermissionKey::VerTabInventario => "HOME_RBAC_REC_TAB_INVENTORY",
            ReceptionistPermissionKey::VerTabControl => "HOME_RBAC_REC_TAB_CONTROL",
            ReceptionistPermissionKey::ExportarClientes => "HOME_RBAC_REC_EXPORT_CLIENTS",
            ReceptionistPermissionKey::ExportarDeudores => "HOME_RBAC_REC_EXPORT_DEBTORS",
            ReceptionistPermissionKey::ExportarVentasCaja => "HOME_RBAC_REC_EXPORT_SALES",
            ReceptionistPermissionKey::ExportarContextualBi => "HOME_RBAC_REC_EXPORT_CONTEXTUAL",
            ReceptionistPermissionKey::ExportarReporteEjecutivoPdf => {
                "HOME_RBAC_REC_EXPORT_EXEC_PDF"
            }
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            ReceptionistPermissionKey::VerIngresosMesOperativo => {
                "Permite a recepcionista ver ingresos operativos del mes en Home Dashboard (0/1)"
            }
            ReceptionistPermissionKey::VerTabFinanzas => {
                "Permite a recepcionista ver la pestaña Finanzas en Home BI (0/1)"
            }
            ReceptionistPermissionKey::VerDashboardModuloFinanzas => {
                "Permite a recepcionista acceder al dashboard financiero y su reporte PDF (0/1)"
            }
            ReceptionistPermissionKey::VerTabSocios => {
                "Permite a recepcionista ver la pestaña Socios en Home BI (0/1)"
            }
            ReceptionistPermissionKey::VerTabAsistencia => {
                "Permite a recepcionista ver la pestaña Asistencia en Home BI (0/1)"
            }
            ReceptionistPermissionKey::VerTabInventario => {
                "Permite a recepcionista ver la pestaña Inventario en Home BI (0/1)"
            }
            ReceptionistPermissionKey::VerTabControl => {
                "Permite a recepcionista ver la pestaña Control en Home BI (0/1)"
            }
            ReceptionistPermissionKey::ExportarClientes => {
                "Permite a recepcionista exportar padrón general de clientes (0/1)"
            }
            ReceptionistPermissionKey::ExportarDeudores => {
                "Permite a recepcionista exportar cartera de deudores (0/1)"
            }
            ReceptionistPermissionKey::ExportarVentasCaja => {
                "Permite a recepcionista exportar reporte detallado de ventas y caja (0/1)"
            }
            ReceptionistPermissionKey::ExportarContextualBi => {
                "Permite a recepcionista exportar vistas contextuales de BI (0/1)"
            }
            ReceptionistPermissionKey::ExportarReporteEjecutivoPdf => {
                "Permite a recepcionista exportar reporte ejecutivo BI en PDF (0/1)"
            }
        }
    }

    pub fn get_flag(&self, dto: &ReceptionistPermissionsDto) -> bool {
        match self {
            ReceptionistPermissionKey::VerIngresosMesOperativo => dto.ver_ingresos_mes_operativo,
            ReceptionistPermissionKey::VerTabFinanzas => dto.ver_tab_finanzas,
            ReceptionistPermissionKey::VerDashboardModuloFinanzas => {
                dto.ver_dashboard_modulo_finanzas
            }
            ReceptionistPermissionKey::VerTabSocios => dto.ver_tab_socios,
            ReceptionistPermissionKey::VerTabAsistencia => dto.ver_tab_asistencia,
            ReceptionistPermissionKey::VerTabInventario => dto.ver_tab_inventario,
            ReceptionistPermissionKey::VerTabControl => dto.ver_tab_control,
            ReceptionistPermissionKey::ExportarClientes => dto.exportar_clientes,
            ReceptionistPermissionKey::ExportarDeudores => dto.exportar_deudores,
            ReceptionistPermissionKey::ExportarVentasCaja => dto.exportar_ventas_caja,
            ReceptionistPermissionKey::ExportarContextualBi => dto.exportar_contextual_bi,
            ReceptionistPermissionKey::ExportarReporteEjecutivoPdf => {
                dto.exportar_reporte_ejecutivo_pdf
            }
        }
    }

    pub fn set_flag(&self, dto: &mut ReceptionistPermissionsDto, value: bool) {
        match self {
            ReceptionistPermissionKey::VerIngresosMesOperativo => {
                dto.ver_ingresos_mes_operativo = value
            }
            ReceptionistPermissionKey::VerTabFinanzas => dto.ver_tab_finanzas = value,
            ReceptionistPermissionKey::VerDashboardModuloFinanzas => {
                dto.ver_dashboard_modulo_finanzas = value
            }
            ReceptionistPermissionKey::VerTabSocios => dto.ver_tab_socios = value,
            ReceptionistPermissionKey::VerTabAsistencia => dto.ver_tab_asistencia = value,
            ReceptionistPermissionKey::VerTabInventario => dto.ver_tab_inventario = value,
            ReceptionistPermissionKey::VerTabControl => dto.ver_tab_control = value,
            ReceptionistPermissionKey::ExportarClientes => dto.exportar_clientes = value,
            ReceptionistPermissionKey::ExportarDeudores => dto.exportar_deudores = value,
            ReceptionistPermissionKey::ExportarVentasCaja => dto.exportar_ventas_caja = value,
            ReceptionistPermissionKey::ExportarContextualBi => dto.exportar_contextual_bi = value,
            ReceptionistPermissionKey::ExportarReporteEjecutivoPdf => {
                dto.exportar_reporte_ejecutivo_pdf = value
            }
        }
    }
}

fn parse_bool_config(raw: Option<&str>) -> bool {
    match raw.map(str::trim) {
        Some(v) => v == "1" || v.eq_ignore_ascii_case("true"),
        None => false,
    }
}

fn all_true_permissions() -> ReceptionistPermissionsDto {
    let mut dto = ReceptionistPermissionsDto::default();
    for key in ReceptionistPermissionKey::ALL {
        key.set_flag(&mut dto, true);
    }
    dto
}

/// Lee las 12 claves RBAC configurables para el rol Recepcionista.
/// Cualquier clave faltante se interpreta como `false` (Secure-by-Default).
pub async fn get_receptionist_permissions(
    pool: &SqlitePool,
) -> Result<ReceptionistPermissionsDto, AppError> {
    let rows = sqlx::query(
        "SELECT clave, valor FROM configuracion_sistema WHERE clave LIKE 'HOME_RBAC_REC_%'",
    )
    .fetch_all(pool)
    .await?;

    let mut map: HashMap<String, String> = HashMap::with_capacity(rows.len());
    for row in rows {
        let clave: String = row.get("clave");
        let valor: String = row.get("valor");
        map.insert(clave, valor);
    }

    let mut dto = ReceptionistPermissionsDto::default();
    for key in ReceptionistPermissionKey::ALL {
        let val = map.get(key.config_key()).map(String::as_str);
        key.set_flag(&mut dto, parse_bool_config(val));
    }

    Ok(dto)
}

/// Retorna los permisos efectivos para la sesión activa:
/// - `ADMINISTRADOR`: todos los permisos en `true`.
/// - `RECEPCIONISTA`: lee los permisos configurables desde `configuracion_sistema`.
pub async fn get_effective_permissions(
    pool: &SqlitePool,
    session: &AuthSession,
) -> Result<ReceptionistPermissionsDto, AppError> {
    match session.rol {
        UserRole::Administrador => Ok(all_true_permissions()),
        UserRole::Recepcionista => get_receptionist_permissions(pool).await,
    }
}

/// Evalúa si la sesión activa cuenta con el permiso indicado.
pub async fn has_permission(
    pool: &SqlitePool,
    session: &AuthSession,
    key: ReceptionistPermissionKey,
) -> Result<bool, AppError> {
    if session.rol == UserRole::Administrador {
        return Ok(true);
    }

    let row = sqlx::query("SELECT valor FROM configuracion_sistema WHERE clave = ?")
        .bind(key.config_key())
        .fetch_optional(pool)
        .await?;

    let val = row.map(|r| r.get::<String, _>("valor"));
    Ok(parse_bool_config(val.as_deref()))
}

/// Exige que la sesión activa cuente con el permiso indicado; de lo contrario retorna `AppError::Forbidden`.
pub async fn require_permission(
    pool: &SqlitePool,
    session: &AuthSession,
    key: ReceptionistPermissionKey,
    denial_message: &str,
) -> Result<(), AppError> {
    if !has_permission(pool, session, key).await? {
        return Err(AppError::Forbidden(denial_message.to_string()));
    }
    Ok(())
}

/// Actualiza atómicamente los 12 permisos configurables del rol Recepcionista y registra auditoría.
/// Exclusivo para `ADMINISTRADOR`.
pub async fn update_receptionist_permissions(
    pool: &SqlitePool,
    session: &AuthSession,
    input: ReceptionistPermissionsDto,
) -> Result<ReceptionistPermissionsDto, AppError> {
    session.require_admin()?;

    let mut tx = pool.begin().await?;

    let mut enabled_count: usize = 0;
    let mut flags = String::with_capacity(ReceptionistPermissionKey::ALL.len());

    for key in ReceptionistPermissionKey::ALL {
        let is_enabled = key.get_flag(&input);
        if is_enabled {
            enabled_count += 1;
            flags.push('1');
        } else {
            flags.push('0');
        }

        let val_str = if is_enabled { "1" } else { "0" };

        sqlx::query(
            r#"
            INSERT INTO configuracion_sistema (clave, valor, descripcion, updated_at)
            VALUES (?, ?, ?, datetime('now', 'localtime'))
            ON CONFLICT(clave) DO UPDATE SET
                valor = excluded.valor,
                updated_at = datetime('now', 'localtime')
            "#,
        )
        .bind(key.config_key())
        .bind(val_str)
        .bind(key.description())
        .execute(&mut *tx)
        .await?;
    }

    let audit_details = serde_json::json!({
        "enabled_count": enabled_count,
        "total": ReceptionistPermissionKey::ALL.len(),
        "flags": flags
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'HOME_PERMISSIONS_UPDATED', 'USUARIOS', ?, 'LOCAL_DESKTOP')
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_receptionist_permissions(pool).await
}
