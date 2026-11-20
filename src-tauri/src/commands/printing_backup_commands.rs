#![allow(non_snake_case)]

use crate::errors::AppError;
use crate::models::printing_backup::*;
use crate::services::printing_backup_service;
use crate::state::AppState;
use tauri::State;

// ============================================================================
// COMANDOS IPC: COMPROBANTES Y SERIES DOCUMENTALES
// ============================================================================

#[tauri::command]
pub async fn issue_sale_receipt(
    input: Option<IssueReceiptRequest>,
    request: Option<IssueReceiptRequest>,
    venta_id: Option<i64>,
    ventaId: Option<i64>,
    tipo_comprobante: Option<ReceiptType>,
    tipoComprobante: Option<ReceiptType>,
    state: State<'_, AppState>,
) -> Result<IssuedReceipt, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved_req = if let Some(req) = input.or(request) {
        req
    } else {
        let v_id = venta_id
            .or(ventaId)
            .ok_or_else(|| AppError::Validation("Debe indicar el ID de la venta.".into()))?;
        let tipo = tipo_comprobante
            .or(tipoComprobante)
            .unwrap_or(ReceiptType::NotaVenta);
        IssueReceiptRequest {
            venta_id: v_id,
            tipo_comprobante: tipo,
            receptor_tipo_doc: None,
            receptor_numero_doc: None,
            receptor_razon_nombre: None,
            receptor_direccion: None,
        }
    };

    printing_backup_service::issue_sale_receipt(&state.pool(), &session, resolved_req).await
}

#[tauri::command]
pub async fn get_sale_receipt(
    id: Option<i64>,
    venta_id: Option<i64>,
    ventaId: Option<i64>,
    sale_id: Option<i64>,
    saleId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Option<IssuedReceipt>, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved_id = id
        .or(venta_id)
        .or(ventaId)
        .or(sale_id)
        .or(saleId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID de la venta.".into()))?;

    printing_backup_service::get_sale_receipt(&state.pool(), &session, resolved_id).await
}

#[tauri::command]
pub async fn list_receipt_series(
    state: State<'_, AppState>,
) -> Result<Vec<ReceiptSeries>, AppError> {
    let session = state.require_admin().await?;
    printing_backup_service::list_receipt_series(&state.pool(), &session).await
}

#[tauri::command]
pub async fn update_receipt_series(
    input: Option<UpdateReceiptSeriesRequest>,
    request: Option<UpdateReceiptSeriesRequest>,
    serie_id: Option<i64>,
    serieId: Option<i64>,
    descripcion: Option<String>,
    estado_activo: Option<bool>,
    estadoActivo: Option<bool>,
    state: State<'_, AppState>,
) -> Result<ReceiptSeries, AppError> {
    let session = state.require_admin().await?;
    let resolved_req = if let Some(req) = input.or(request) {
        req
    } else {
        let s_id = serie_id
            .or(serieId)
            .ok_or_else(|| AppError::Validation("Debe indicar el ID de la serie.".into()))?;
        UpdateReceiptSeriesRequest {
            serie_id: s_id,
            descripcion,
            estado_activo: estado_activo.or(estadoActivo).unwrap_or(true),
        }
    };

    printing_backup_service::update_receipt_series(&state.pool(), &session, resolved_req).await
}

// ============================================================================
// COMANDOS IPC: IMPRESIÓN TÉRMICA Y PDFS EN RAM
// ============================================================================

#[tauri::command]
pub async fn print_sale_ticket(
    input: Option<PrintTicketRequest>,
    request: Option<PrintTicketRequest>,
    venta_id: Option<i64>,
    ventaId: Option<i64>,
    sale_id: Option<i64>,
    saleId: Option<i64>,
    forced_width_mm: Option<u16>,
    forcedWidthMm: Option<u16>,
    open_drawer_override: Option<bool>,
    openDrawerOverride: Option<bool>,
    state: State<'_, AppState>,
) -> Result<PrintTicketResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved_req = if let Some(req) = input.or(request) {
        req
    } else {
        let v_id = venta_id
            .or(ventaId)
            .or(sale_id)
            .or(saleId)
            .ok_or_else(|| AppError::Validation("Debe indicar el ID de la venta.".into()))?;
        PrintTicketRequest {
            venta_id: v_id,
            forced_width_mm: forced_width_mm.or(forcedWidthMm),
            open_drawer_override: open_drawer_override.or(openDrawerOverride),
        }
    };

    printing_backup_service::print_sale_ticket(&state.pool(), &session, resolved_req).await
}

#[tauri::command]
pub async fn generate_sale_receipt_pdf(
    id: Option<i64>,
    venta_id: Option<i64>,
    ventaId: Option<i64>,
    sale_id: Option<i64>,
    saleId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<GeneratePdfResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved_id = id
        .or(venta_id)
        .or(ventaId)
        .or(sale_id)
        .or(saleId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID de la venta.".into()))?;

    printing_backup_service::generate_sale_receipt_pdf(&state.pool(), &session, resolved_id).await
}

#[tauri::command]
pub async fn generate_financial_report_pdf(
    input: Option<GenerateFinancialReportPdfRequest>,
    request: Option<GenerateFinancialReportPdfRequest>,
    fecha_desde: Option<String>,
    fechaDesde: Option<String>,
    fecha_hasta: Option<String>,
    fechaHasta: Option<String>,
    canal_filtro: Option<String>,
    canalFiltro: Option<String>,
    state: State<'_, AppState>,
) -> Result<GeneratePdfResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved_req = if let Some(req) = input.or(request) {
        req
    } else {
        let desde = fecha_desde.or(fechaDesde).unwrap_or_default();
        let hasta = fecha_hasta.or(fechaHasta).unwrap_or_default();
        GenerateFinancialReportPdfRequest {
            fecha_desde: desde,
            fecha_hasta: hasta,
            canal_filtro: canal_filtro.or(canalFiltro),
        }
    };

    printing_backup_service::generate_financial_report_pdf(&state.pool(), &session, resolved_req).await
}

#[tauri::command]
pub async fn send_receipt_email(
    input: Option<SendReceiptEmailRequest>,
    request: Option<SendReceiptEmailRequest>,
    venta_id: Option<i64>,
    ventaId: Option<i64>,
    destinatario_email: Option<String>,
    destinatarioEmail: Option<String>,
    mensaje_adicional: Option<String>,
    mensajeAdicional: Option<String>,
    state: State<'_, AppState>,
) -> Result<SendEmailResult, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved_req = if let Some(req) = input.or(request) {
        req
    } else {
        let v_id = venta_id
            .or(ventaId)
            .ok_or_else(|| AppError::Validation("Debe indicar el ID de la venta.".into()))?;
        let email = destinatario_email
            .or(destinatarioEmail)
            .ok_or_else(|| AppError::Validation("Debe indicar el correo destinatario.".into()))?;
        SendReceiptEmailRequest {
            venta_id: v_id,
            destinatario_email: email,
            mensaje_adicional: mensaje_adicional.or(mensajeAdicional),
        }
    };

    printing_backup_service::send_receipt_email(&state.pool(), &session, resolved_req).await
}

// ============================================================================
// COMANDOS IPC: RESPALDOS Y BASE DE DATOS (ADMIN EXCLUSIVO)
// ============================================================================

#[tauri::command]
pub async fn create_local_backup(
    state: State<'_, AppState>,
) -> Result<BackupRecord, AppError> {
    let session = state.require_admin().await?;
    let app_backups_dir = state.db_path().and_then(|p| {
        p.parent()
            .filter(|d| !d.as_os_str().is_empty())
            .map(|d| d.join("backups"))
    });
    printing_backup_service::create_local_backup(
        &state.pool(),
        &session,
        app_backups_dir.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn list_backup_history(
    state: State<'_, AppState>,
) -> Result<Vec<BackupRecord>, AppError> {
    let session = state.require_admin().await?;
    printing_backup_service::list_backup_history(&state.pool(), &session).await
}

#[tauri::command]
pub async fn verify_backup_integrity(
    id: Option<i64>,
    backup_id: Option<i64>,
    backupId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<BackupIntegrityReport, AppError> {
    let session = state.require_admin().await?;
    let resolved_id = id
        .or(backup_id)
        .or(backupId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID del respaldo.".into()))?;

    printing_backup_service::verify_backup_integrity(&state.pool(), &session, resolved_id).await
}

#[tauri::command]
pub async fn pick_export_folder(
    state: State<'_, AppState>,
) -> Result<Option<String>, AppError> {
    let _session = state.require_admin().await?;

    #[cfg(target_os = "windows")]
    {
        let selected = tokio::task::spawn_blocking(|| -> Result<Option<String>, AppError> {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'Seleccione la carpeta o memoria USB donde exportar la base de datos ZaramaGYM'
$dlg.ShowNewFolderButton = $true
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::Out.Write($dlg.SelectedPath)
}
"#;

            let output = std::process::Command::new("powershell")
                .args(["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", script])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| {
                    AppError::Internal(format!(
                        "No se pudo abrir el selector de carpetas de Windows: {}",
                        e
                    ))
                })?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(AppError::Internal(format!(
                    "El selector de carpetas falló: {}",
                    stderr.trim()
                )));
            }

            let trimmed = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed))
            }
        })
        .await
        .map_err(|e| AppError::Internal(format!("Error ejecutando selector de carpetas: {}", e)))??;

        return Ok(selected);
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err(AppError::Validation(
            "El selector nativo de carpetas está soportado únicamente en Windows.".into(),
        ))
    }
}

#[tauri::command]
pub async fn export_database_file(
    target_path: Option<String>,
    targetPath: Option<String>,
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<BackupRecord, AppError> {
    let session = state.require_admin().await?;
    let resolved_path = target_path
        .or(targetPath)
        .or(path)
        .ok_or_else(|| AppError::Validation("Debe indicar la ruta destino para la exportación.".into()))?;

    printing_backup_service::export_database_file(&state.pool(), &session, &resolved_path).await
}

#[tauri::command]
pub async fn restore_database(
    input: Option<RestoreDatabaseRequest>,
    request: Option<RestoreDatabaseRequest>,
    source_path: Option<String>,
    sourcePath: Option<String>,
    file_bytes_base64: Option<String>,
    fileBytesBase64: Option<String>,
    file_name: Option<String>,
    fileName: Option<String>,
    state: State<'_, AppState>,
) -> Result<RestoreDatabaseResult, AppError> {
    let resolved_req = if let Some(req) = input.or(request) {
        req
    } else {
        RestoreDatabaseRequest {
            source_path: source_path.or(sourcePath),
            file_bytes_base64: file_bytes_base64.or(fileBytesBase64),
            file_name: file_name.or(fileName),
        }
    };

    printing_backup_service::restore_database(&state, resolved_req).await
}

#[tauri::command]
pub async fn sync_backup_to_gdrive(
    id: Option<i64>,
    backup_id: Option<i64>,
    backupId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<BackupRecord, AppError> {
    let session = state.require_admin().await?;
    let resolved_id = id
        .or(backup_id)
        .or(backupId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID del respaldo.".into()))?;

    printing_backup_service::sync_backup_to_gdrive(&state.pool(), &session, resolved_id).await
}

// ============================================================================
// COMANDOS IPC: CONFIGURACIÓN INTEGRAL DE IMPRESIÓN Y RESPALDOS
// ============================================================================

#[tauri::command]
pub async fn get_printing_backup_config(
    state: State<'_, AppState>,
) -> Result<PrintingBackupConfigDto, AppError> {
    let session = state.require_admin().await?;
    printing_backup_service::get_printing_backup_config(&state.pool(), &session).await
}

#[tauri::command]
pub async fn update_printing_backup_config(
    input: Option<UpdatePrintingBackupConfigRequest>,
    request: Option<UpdatePrintingBackupConfigRequest>,
    state: State<'_, AppState>,
) -> Result<PrintingBackupConfigDto, AppError> {
    let session = state.require_admin().await?;
    let resolved_req = input
        .or(request)
        .ok_or_else(|| AppError::Validation("Debe proveer los datos de configuración a actualizar.".into()))?;

    printing_backup_service::update_printing_backup_config(&state.pool(), &session, resolved_req).await
}
