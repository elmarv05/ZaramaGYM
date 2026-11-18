#![allow(non_snake_case)]

use crate::errors::AppError;
use crate::models::{
    ClientDetail, ClientFilter, ClientListItem, ClientWeightRecord, CompanyDetail,
    CompanyFilter, CompanyListItem, CreateClientInput, CreateCompanyInput, CreatePersonInput,
    CreateSupplierInput, PersonDetail, PersonFilter, PersonListItem, RecordWeightInput,
    SupplierDetail, SupplierFilter, SupplierListItem, UpdateClientInput, UpdateCompanyInput,
    UpdatePersonInput, UpdateSupplierInput,
};
use crate::services::entity_service;
use crate::state::AppState;
use tauri::State;

// ============================================================================
// COMANDOS IPC: PERSONAS NATURALES
// ============================================================================

#[tauri::command]
pub async fn list_persons(
    filter: Option<PersonFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<PersonListItem>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    entity_service::list_persons(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn get_person(
    person_id: Option<i64>,
    personId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<PersonDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = person_id
        .or(personId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID de la persona.".into()))?;
    entity_service::get_person(&state.pool(), &session, id).await
}

#[tauri::command]
pub async fn create_person(
    input: CreatePersonInput,
    state: State<'_, AppState>,
) -> Result<PersonDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    entity_service::create_person(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn update_person(
    person_id: Option<i64>,
    personId: Option<i64>,
    input: UpdatePersonInput,
    state: State<'_, AppState>,
) -> Result<PersonDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = person_id
        .or(personId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID de la persona.".into()))?;
    entity_service::update_person(&state.pool(), &session, id, input).await
}

#[tauri::command]
pub async fn toggle_person_active(
    person_id: Option<i64>,
    personId: Option<i64>,
    active: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let session = state.require_unlocked_session().await?;
    let id = person_id
        .or(personId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID de la persona.".into()))?;
    entity_service::toggle_person_active(&state.pool(), &session, id, active).await
}

// ============================================================================
// COMANDOS IPC: CLIENTES Y RÉCORD HISTÓRICO DE PESO
// ============================================================================

#[tauri::command]
pub async fn list_clients(
    filter: Option<ClientFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<ClientListItem>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    entity_service::list_clients(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn get_client(
    client_id: Option<i64>,
    clientId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<ClientDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = client_id
        .or(clientId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID del cliente.".into()))?;
    entity_service::get_client(&state.pool(), &session, id).await
}

#[tauri::command]
pub async fn create_client(
    input: CreateClientInput,
    state: State<'_, AppState>,
) -> Result<ClientDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    entity_service::create_client(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn update_client(
    client_id: Option<i64>,
    clientId: Option<i64>,
    input: UpdateClientInput,
    state: State<'_, AppState>,
) -> Result<ClientDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = client_id
        .or(clientId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID del cliente.".into()))?;
    entity_service::update_client(&state.pool(), &session, id, input).await
}

#[tauri::command]
pub async fn toggle_client_active(
    client_id: Option<i64>,
    clientId: Option<i64>,
    active: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let session = state.require_unlocked_session().await?;
    let id = client_id
        .or(clientId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID del cliente.".into()))?;
    entity_service::toggle_client_active(&state.pool(), &session, id, active).await
}

#[tauri::command]
pub async fn regenerate_client_qr(
    client_id: Option<i64>,
    clientId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = client_id
        .or(clientId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID del cliente.".into()))?;
    entity_service::regenerate_client_qr(&state.pool(), &session, id).await
}

#[tauri::command]
pub async fn record_client_weight(
    input: RecordWeightInput,
    state: State<'_, AppState>,
) -> Result<ClientWeightRecord, AppError> {
    let session = state.require_unlocked_session().await?;
    entity_service::record_client_weight(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn get_client_weight_history(
    client_id: Option<i64>,
    clientId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<ClientWeightRecord>, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = client_id
        .or(clientId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID del cliente.".into()))?;
    entity_service::get_client_weight_history(&state.pool(), &session, id).await
}

// ============================================================================
// COMANDOS IPC: EMPRESAS JURÍDICAS RUC 20
// ============================================================================

#[tauri::command]
pub async fn list_companies(
    filter: Option<CompanyFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<CompanyListItem>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    entity_service::list_companies(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn get_company(
    company_id: Option<i64>,
    companyId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<CompanyDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = company_id
        .or(companyId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID de la empresa.".into()))?;
    entity_service::get_company(&state.pool(), &session, id).await
}

#[tauri::command]
pub async fn create_company(
    input: CreateCompanyInput,
    state: State<'_, AppState>,
) -> Result<CompanyDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    entity_service::create_company(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn update_company(
    company_id: Option<i64>,
    companyId: Option<i64>,
    input: UpdateCompanyInput,
    state: State<'_, AppState>,
) -> Result<CompanyDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = company_id
        .or(companyId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID de la empresa.".into()))?;
    entity_service::update_company(&state.pool(), &session, id, input).await
}

#[tauri::command]
pub async fn toggle_company_active(
    company_id: Option<i64>,
    companyId: Option<i64>,
    active: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let session = state.require_unlocked_session().await?;
    let id = company_id
        .or(companyId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID de la empresa.".into()))?;
    entity_service::toggle_company_active(&state.pool(), &session, id, active).await
}

// ============================================================================
// COMANDOS IPC: PROVEEDORES POLIMÓRFICOS
// ============================================================================

#[tauri::command]
pub async fn list_suppliers(
    filter: Option<SupplierFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<SupplierListItem>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    entity_service::list_suppliers(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn get_supplier(
    supplier_id: Option<i64>,
    supplierId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<SupplierDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = supplier_id
        .or(supplierId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID del proveedor.".into()))?;
    entity_service::get_supplier(&state.pool(), &session, id).await
}

#[tauri::command]
pub async fn create_supplier(
    input: CreateSupplierInput,
    state: State<'_, AppState>,
) -> Result<SupplierDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    entity_service::create_supplier(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn update_supplier(
    supplier_id: Option<i64>,
    supplierId: Option<i64>,
    input: UpdateSupplierInput,
    state: State<'_, AppState>,
) -> Result<SupplierDetail, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = supplier_id
        .or(supplierId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID del proveedor.".into()))?;
    entity_service::update_supplier(&state.pool(), &session, id, input).await
}

#[tauri::command]
pub async fn toggle_supplier_active(
    supplier_id: Option<i64>,
    supplierId: Option<i64>,
    active: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let session = state.require_unlocked_session().await?;
    let id = supplier_id
        .or(supplierId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID del proveedor.".into()))?;
    entity_service::toggle_supplier_active(&state.pool(), &session, id, active).await
}

// ============================================================================
// COMANDO IPC: APERTURA SEGURA DE ENLACES EXTERNOS (WHATSAPP / NAVEGADOR)
// ============================================================================

/// Valida que una URL externa sea segura (únicamente esquema https://, sin espacios sin codificar ni caracteres de control).
pub fn validate_external_url(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(
            "La URL externa no puede estar vacía.".into(),
        ));
    }

    if trimmed
        .chars()
        .any(|c| c.is_control() || c.is_whitespace())
    {
        return Err(AppError::Validation(
            "La URL externa contiene espacios sin codificar o caracteres de control inválidos."
                .into(),
        ));
    }

    let lower = trimmed.to_ascii_lowercase();
    let is_allowed_prefix = lower.starts_with("https://wa.me/")
        || lower.starts_with("https://api.whatsapp.com/")
        || lower.starts_with("https://");

    if !is_allowed_prefix {
        return Err(AppError::Validation(
            "Solo se permiten enlaces externos seguros con protocolo https://.".into(),
        ));
    }

    let after_scheme = &trimmed["https://".len()..];
    let host_part = after_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("");
    if host_part.is_empty() {
        return Err(AppError::Validation(
            "La URL externa debe incluir un dominio válido después de https://.".into(),
        ));
    }

    Ok(trimmed.to_string())
}

#[tauri::command]
pub async fn open_external_url(
    url: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.require_unlocked_session().await?;
    let clean_url = validate_external_url(&url)?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        std::process::Command::new("powershell.exe")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                "Start-Process -FilePath $env:ZG_EXTERNAL_URL",
            ])
            .env("ZG_EXTERNAL_URL", &clean_url)
            .spawn()
            .map_err(|e| {
                AppError::Internal(format!("No se pudo abrir el enlace externo: {}", e))
            })?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&clean_url)
            .spawn()
            .map_err(|e| {
                AppError::Internal(format!("No se pudo abrir el enlace externo: {}", e))
            })?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&clean_url)
            .spawn()
            .map_err(|e| {
                AppError::Internal(format!("No se pudo abrir el enlace externo: {}", e))
            })?;
    }

    Ok(())
}
