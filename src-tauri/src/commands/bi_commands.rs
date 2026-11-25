#![allow(non_snake_case)]

use crate::errors::AppError;
use crate::models::bi::{
    BiAttendanceAnalyticsDto, BiAttendanceFilterInput, BiControlAnalyticsDto, BiControlFilterInput,
    BiExecutivePdfInput, BiExportAttendanceInput, BiExportControlInput, BiExportFinanceInput,
    BiExportInventoryInput, BiExportMembersInput, BiFinanceAnalyticsDto, BiFinanceFilterInput,
    BiGranularity, BiInventoryAnalyticsDto, BiInventoryFilterInput, BiMembersAnalyticsDto,
    BiMembersFilterInput,
};
use crate::models::dashboard::{ExportFileResult, ExportFormat};
use crate::services::bi_analytics_service;
use crate::state::AppState;
use tauri::State;

// ============================================================================
// COMANDOS IPC: MOTOR ANALÍTICO BI — FINANZAS Y RENTABILIDAD (BI-SLICE 2)
// ============================================================================

#[tauri::command]
pub async fn get_bi_finance_analytics(
    input: Option<BiFinanceFilterInput>,
    filter: Option<BiFinanceFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    granularidad: Option<BiGranularity>,
    canal_caja: Option<String>,
    canalCaja: Option<String>,
    state: State<'_, AppState>,
) -> Result<BiFinanceAnalyticsDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = input.or(filter).unwrap_or_else(|| BiFinanceFilterInput {
        fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
        fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
        granularidad,
        canal_caja: canal_caja.or(canalCaja),
    });

    bi_analytics_service::get_bi_finance_analytics(&state.pool(), &session, resolved).await
}

#[tauri::command]
pub async fn export_bi_finance_analytics(
    input: Option<BiExportFinanceInput>,
    request: Option<BiExportFinanceInput>,
    filter: Option<BiFinanceFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    granularidad: Option<BiGranularity>,
    canal_caja: Option<String>,
    canalCaja: Option<String>,
    format: Option<ExportFormat>,
    state: State<'_, AppState>,
) -> Result<ExportFileResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = if let Some(req) = input.or(request) {
        req
    } else {
        let fmt = format.ok_or_else(|| {
            AppError::Validation("Debe especificar el formato de exportación (CSV o XLSX).".into())
        })?;
        let resolved_filter = filter.unwrap_or_else(|| BiFinanceFilterInput {
            fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
            fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
            granularidad,
            canal_caja: canal_caja.or(canalCaja),
        });
        BiExportFinanceInput {
            filter: resolved_filter,
            format: fmt,
        }
    };

    bi_analytics_service::export_bi_finance_analytics(&state.pool(), &session, resolved).await
}

// ============================================================================
// COMANDOS IPC: SOCIOS Y RETENCIÓN + ASISTENCIA Y DEMANDA (BI-SLICE 3)
// ============================================================================

#[tauri::command]
pub async fn get_bi_members_analytics(
    input: Option<BiMembersFilterInput>,
    filter: Option<BiMembersFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    granularidad: Option<BiGranularity>,
    rango_edad: Option<String>,
    rangoEdad: Option<String>,
    genero: Option<String>,
    canal_captacion: Option<String>,
    canalCaptacion: Option<String>,
    plan_id: Option<i64>,
    planId: Option<i64>,
    dias_inactividad_riesgo: Option<i64>,
    diasInactividadRiesgo: Option<i64>,
    state: State<'_, AppState>,
) -> Result<BiMembersAnalyticsDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = input.or(filter).unwrap_or_else(|| BiMembersFilterInput {
        fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
        fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
        granularidad,
        rango_edad: rango_edad.or(rangoEdad),
        genero,
        canal_captacion: canal_captacion.or(canalCaptacion),
        plan_id: plan_id.or(planId),
        dias_inactividad_riesgo: dias_inactividad_riesgo.or(diasInactividadRiesgo),
    });

    bi_analytics_service::get_bi_members_analytics(&state.pool(), &session, resolved).await
}

#[tauri::command]
pub async fn export_bi_members_analytics(
    input: Option<BiExportMembersInput>,
    request: Option<BiExportMembersInput>,
    filter: Option<BiMembersFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    granularidad: Option<BiGranularity>,
    rango_edad: Option<String>,
    rangoEdad: Option<String>,
    genero: Option<String>,
    canal_captacion: Option<String>,
    canalCaptacion: Option<String>,
    plan_id: Option<i64>,
    planId: Option<i64>,
    dias_inactividad_riesgo: Option<i64>,
    diasInactividadRiesgo: Option<i64>,
    format: Option<ExportFormat>,
    state: State<'_, AppState>,
) -> Result<ExportFileResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = if let Some(req) = input.or(request) {
        req
    } else {
        let fmt = format.ok_or_else(|| {
            AppError::Validation("Debe especificar el formato de exportación (CSV o XLSX).".into())
        })?;
        let resolved_filter = filter.unwrap_or_else(|| BiMembersFilterInput {
            fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
            fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
            granularidad,
            rango_edad: rango_edad.or(rangoEdad),
            genero,
            canal_captacion: canal_captacion.or(canalCaptacion),
            plan_id: plan_id.or(planId),
            dias_inactividad_riesgo: dias_inactividad_riesgo.or(diasInactividadRiesgo),
        });
        BiExportMembersInput {
            filter: resolved_filter,
            format: fmt,
        }
    };

    bi_analytics_service::export_bi_members_analytics(&state.pool(), &session, resolved).await
}

#[tauri::command]
pub async fn get_bi_attendance_analytics(
    input: Option<BiAttendanceFilterInput>,
    filter: Option<BiAttendanceFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    granularidad: Option<BiGranularity>,
    rango_edad: Option<String>,
    rangoEdad: Option<String>,
    genero: Option<String>,
    plan_id: Option<i64>,
    planId: Option<i64>,
    color_semaforo: Option<String>,
    colorSemaforo: Option<String>,
    modo_ingreso: Option<String>,
    modoIngreso: Option<String>,
    state: State<'_, AppState>,
) -> Result<BiAttendanceAnalyticsDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = input.or(filter).unwrap_or_else(|| BiAttendanceFilterInput {
        fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
        fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
        granularidad,
        rango_edad: rango_edad.or(rangoEdad),
        genero,
        plan_id: plan_id.or(planId),
        color_semaforo: color_semaforo.or(colorSemaforo),
        modo_ingreso: modo_ingreso.or(modoIngreso),
    });

    bi_analytics_service::get_bi_attendance_analytics(&state.pool(), &session, resolved).await
}

#[tauri::command]
pub async fn export_bi_attendance_analytics(
    input: Option<BiExportAttendanceInput>,
    request: Option<BiExportAttendanceInput>,
    filter: Option<BiAttendanceFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    granularidad: Option<BiGranularity>,
    rango_edad: Option<String>,
    rangoEdad: Option<String>,
    genero: Option<String>,
    plan_id: Option<i64>,
    planId: Option<i64>,
    color_semaforo: Option<String>,
    colorSemaforo: Option<String>,
    modo_ingreso: Option<String>,
    modoIngreso: Option<String>,
    format: Option<ExportFormat>,
    state: State<'_, AppState>,
) -> Result<ExportFileResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = if let Some(req) = input.or(request) {
        req
    } else {
        let fmt = format.ok_or_else(|| {
            AppError::Validation("Debe especificar el formato de exportación (CSV o XLSX).".into())
        })?;
        let resolved_filter = filter.unwrap_or_else(|| BiAttendanceFilterInput {
            fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
            fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
            granularidad,
            rango_edad: rango_edad.or(rangoEdad),
            genero,
            plan_id: plan_id.or(planId),
            color_semaforo: color_semaforo.or(colorSemaforo),
            modo_ingreso: modo_ingreso.or(modoIngreso),
        });
        BiExportAttendanceInput {
            filter: resolved_filter,
            format: fmt,
        }
    };

    bi_analytics_service::export_bi_attendance_analytics(&state.pool(), &session, resolved).await
}

// ============================================================================
// COMANDOS IPC: PRODUCTOS/INVENTARIO Y CONTROL/RIESGO (BI-SLICE 4)
// ============================================================================

#[tauri::command]
pub async fn get_bi_inventory_analytics(
    input: Option<BiInventoryFilterInput>,
    filter: Option<BiInventoryFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    categoria: Option<String>,
    proveedor_id: Option<i64>,
    proveedorId: Option<i64>,
    dias_stock_muerto: Option<i64>,
    diasStockMuerto: Option<i64>,
    state: State<'_, AppState>,
) -> Result<BiInventoryAnalyticsDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = input.or(filter).unwrap_or_else(|| BiInventoryFilterInput {
        fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
        fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
        categoria,
        proveedor_id: proveedor_id.or(proveedorId),
        dias_stock_muerto: dias_stock_muerto.or(diasStockMuerto),
    });

    bi_analytics_service::get_bi_inventory_analytics(&state.pool(), &session, resolved).await
}

#[tauri::command]
pub async fn export_bi_inventory_analytics(
    input: Option<BiExportInventoryInput>,
    request: Option<BiExportInventoryInput>,
    filter: Option<BiInventoryFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    categoria: Option<String>,
    proveedor_id: Option<i64>,
    proveedorId: Option<i64>,
    dias_stock_muerto: Option<i64>,
    diasStockMuerto: Option<i64>,
    format: Option<ExportFormat>,
    state: State<'_, AppState>,
) -> Result<ExportFileResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = if let Some(req) = input.or(request) {
        req
    } else {
        let fmt = format.ok_or_else(|| {
            AppError::Validation("Debe especificar el formato de exportación (CSV o XLSX).".into())
        })?;
        let resolved_filter = filter.unwrap_or_else(|| BiInventoryFilterInput {
            fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
            fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
            categoria,
            proveedor_id: proveedor_id.or(proveedorId),
            dias_stock_muerto: dias_stock_muerto.or(diasStockMuerto),
        });
        BiExportInventoryInput {
            filter: resolved_filter,
            format: fmt,
        }
    };

    bi_analytics_service::export_bi_inventory_analytics(&state.pool(), &session, resolved).await
}

#[tauri::command]
pub async fn get_bi_control_analytics(
    input: Option<BiControlFilterInput>,
    filter: Option<BiControlFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    usuario_id: Option<i64>,
    usuarioId: Option<i64>,
    origen_credito: Option<String>,
    origenCredito: Option<String>,
    state: State<'_, AppState>,
) -> Result<BiControlAnalyticsDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = input.or(filter).unwrap_or_else(|| BiControlFilterInput {
        fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
        fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
        usuario_id: usuario_id.or(usuarioId),
        origen_credito: origen_credito.or(origenCredito),
    });

    bi_analytics_service::get_bi_control_analytics(&state.pool(), &session, resolved).await
}

#[tauri::command]
pub async fn export_bi_control_analytics(
    input: Option<BiExportControlInput>,
    request: Option<BiExportControlInput>,
    filter: Option<BiControlFilterInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    usuario_id: Option<i64>,
    usuarioId: Option<i64>,
    origen_credito: Option<String>,
    origenCredito: Option<String>,
    format: Option<ExportFormat>,
    state: State<'_, AppState>,
) -> Result<ExportFileResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = if let Some(req) = input.or(request) {
        req
    } else {
        let fmt = format.ok_or_else(|| {
            AppError::Validation("Debe especificar el formato de exportación (CSV o XLSX).".into())
        })?;
        let resolved_filter = filter.unwrap_or_else(|| BiControlFilterInput {
            fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
            fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
            usuario_id: usuario_id.or(usuarioId),
            origen_credito: origen_credito.or(origenCredito),
        });
        BiExportControlInput {
            filter: resolved_filter,
            format: fmt,
        }
    };

    bi_analytics_service::export_bi_control_analytics(&state.pool(), &session, resolved).await
}

// ============================================================================
// COMANDO IPC: REPORTE EJECUTIVO PDF CONSOLIDADO (BI-SLICE 5)
// ============================================================================

#[tauri::command]
pub async fn generate_executive_bi_report_pdf(
    input: Option<BiExecutivePdfInput>,
    request: Option<BiExecutivePdfInput>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    canal_caja: Option<String>,
    canalCaja: Option<String>,
    state: State<'_, AppState>,
) -> Result<ExportFileResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved = input.or(request).unwrap_or_else(|| BiExecutivePdfInput {
        fecha_desde: fecha_desde.or(fechaDesde).unwrap_or_default(),
        fecha_hasta: fecha_hasta.or(fechaHasta).unwrap_or_default(),
        canal_caja: canal_caja.or(canalCaja),
    });

    bi_analytics_service::generate_executive_bi_report_pdf(&state.pool(), &session, resolved).await
}
