#![allow(non_snake_case)]

use crate::errors::AppError;
use crate::models::dashboard::{
    ExportFileResult, ExportFormat, ExportSalesReportRequest, HomeDashboardMetricsDto,
    ReceptionistPermissionsDto,
};
use crate::services::{dashboard_service, permissions_service};
use crate::state::AppState;
use tauri::State;

// ============================================================================
// COMANDOS IPC: HOME DASHBOARD & EXPORTACIONES CONTABLES
// ============================================================================

#[tauri::command]
pub async fn get_home_dashboard_metrics(
    state: State<'_, AppState>,
) -> Result<HomeDashboardMetricsDto, AppError> {
    let session = state.require_unlocked_session().await?;
    dashboard_service::get_home_dashboard_metrics(&state.pool(), &session).await
}

#[tauri::command]
pub async fn export_clients_roster(
    format: ExportFormat,
    state: State<'_, AppState>,
) -> Result<ExportFileResult, AppError> {
    let session = state.require_unlocked_session().await?;
    dashboard_service::export_clients_roster(&state.pool(), &session, format).await
}

#[tauri::command]
pub async fn export_debtors_portfolio(
    format: ExportFormat,
    state: State<'_, AppState>,
) -> Result<ExportFileResult, AppError> {
    let session = state.require_unlocked_session().await?;
    dashboard_service::export_debtors_portfolio(&state.pool(), &session, format).await
}

#[tauri::command]
pub async fn export_sales_cash_report(
    request: Option<ExportSalesReportRequest>,
    input: Option<ExportSalesReportRequest>,
    format: Option<ExportFormat>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    canal_filtro: Option<String>,
    canalFiltro: Option<String>,
    state: State<'_, AppState>,
) -> Result<ExportFileResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved_req = if let Some(req) = request.or(input) {
        req
    } else {
        let fmt = format.ok_or_else(|| {
            AppError::Validation("Debe especificar el formato de exportación (CSV, XLSX o PDF).".into())
        })?;
        ExportSalesReportRequest {
            fecha_desde: fecha_desde.or(fechaDesde),
            fecha_hasta: fecha_hasta.or(fechaHasta),
            canal_filtro: canal_filtro.or(canalFiltro),
            format: fmt,
        }
    };

    dashboard_service::export_sales_cash_report(&state.pool(), &session, resolved_req).await
}

// ============================================================================
// COMANDOS IPC: PERMISOS RBAC CONFIGURABLES HOME (BI-SLICE 1)
// ============================================================================

#[tauri::command]
pub async fn get_receptionist_permissions(
    state: State<'_, AppState>,
) -> Result<ReceptionistPermissionsDto, AppError> {
    let _session = state.require_unlocked_session().await?;
    permissions_service::get_receptionist_permissions(&state.pool()).await
}

#[tauri::command]
pub async fn get_my_effective_permissions(
    state: State<'_, AppState>,
) -> Result<ReceptionistPermissionsDto, AppError> {
    let session = state.require_unlocked_session().await?;
    permissions_service::get_effective_permissions(&state.pool(), &session).await
}

#[tauri::command]
pub async fn update_receptionist_permissions(
    input: Option<ReceptionistPermissionsDto>,
    permissions: Option<ReceptionistPermissionsDto>,
    state: State<'_, AppState>,
) -> Result<ReceptionistPermissionsDto, AppError> {
    let session = state.require_admin().await?;
    let dto = input.or(permissions).ok_or_else(|| {
        AppError::Validation("Debe enviar el objeto de permisos de recepcionista.".into())
    })?;
    permissions_service::update_receptionist_permissions(&state.pool(), &session, dto).await
}
