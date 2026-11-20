#![allow(non_snake_case)]

use crate::errors::AppError;
use crate::models::{
    AuditFilter, AuditLogItem, AuthSession, CrashRecoveryNotice, CreateUserInput, LoginCredentials,
    SafeUpdatePreparationDto, UpdateUserInput, UpdateUserPhotoInput, UserListItem,
};
use crate::services::{audit_service, auth_service, lifecycle_service};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn login(
    credentials: LoginCredentials,
    state: State<'_, AppState>,
) -> Result<AuthSession, AppError> {
    auth_service::login(&state.pool(), &state, credentials).await
}

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<(), AppError> {
    auth_service::logout(&state.pool(), &state).await
}

#[tauri::command]
pub async fn get_current_session(
    state: State<'_, AppState>,
) -> Result<Option<AuthSession>, AppError> {
    auth_service::get_current_session(&state).await
}

#[tauri::command]
pub async fn lock_session(state: State<'_, AppState>) -> Result<(), AppError> {
    auth_service::lock_session(&state.pool(), &state).await
}

#[tauri::command]
pub async fn unlock_session(
    password: String,
    state: State<'_, AppState>,
) -> Result<AuthSession, AppError> {
    auth_service::unlock_session(&state.pool(), &state, &password).await
}

#[tauri::command]
pub async fn change_own_password(
    current_password: String,
    new_password: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    auth_service::change_own_password(&state.pool(), &state, &current_password, &new_password).await
}

#[tauri::command]
pub async fn list_users(state: State<'_, AppState>) -> Result<Vec<UserListItem>, AppError> {
    auth_service::list_users(&state.pool(), &state).await
}

#[tauri::command]
pub async fn create_user(
    input: CreateUserInput,
    state: State<'_, AppState>,
) -> Result<UserListItem, AppError> {
    auth_service::create_user(&state.pool(), &state, input).await
}

#[tauri::command]
pub async fn update_user(
    input: UpdateUserInput,
    state: State<'_, AppState>,
) -> Result<UserListItem, AppError> {
    auth_service::update_user(&state.pool(), &state, input).await
}

#[tauri::command]
pub async fn update_user_photo(
    input: UpdateUserPhotoInput,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    auth_service::update_user_photo(&state.pool(), &state, input).await
}

#[tauri::command]
pub async fn toggle_user_active(
    user_id: Option<i64>,
    userId: Option<i64>,
    active: bool,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let id = user_id
        .or(userId)
        .ok_or_else(|| AppError::Validation("Debe proporcionar el ID del usuario.".into()))?;
    auth_service::toggle_user_active(&state.pool(), &state, id, active).await
}

#[tauri::command]
pub async fn get_audit_logs(
    filter: Option<AuditFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<AuditLogItem>, AppError> {
    // Guard: Exclusivo de Administrador, sesión no bloqueada
    state.require_admin().await?;
    let f = filter.unwrap_or_default();
    audit_service::get_audit_logs(&state.pool(), &f).await
}

#[tauri::command]
pub async fn get_crash_recovery_notice(
    state: State<'_, AppState>,
) -> Result<Option<CrashRecoveryNotice>, AppError> {
    Ok(state.get_crash_recovery_notice().await)
}

#[tauri::command]
pub async fn acknowledge_crash_recovery_notice(
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.clear_crash_recovery_notice().await;
    Ok(())
}

#[tauri::command]
pub async fn prepare_safe_app_update(
    target_version: Option<String>,
    targetVersion: Option<String>,
    state: State<'_, AppState>,
) -> Result<SafeUpdatePreparationDto, AppError> {
    let session = state.require_admin().await?;
    let version = target_version
        .or(targetVersion)
        .unwrap_or_else(|| "nueva".to_string());
    lifecycle_service::prepare_safe_app_update(&state, &session, &version, None).await
}

#[tauri::command]
pub async fn restore_runtime_after_failed_update(
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let session = state.require_admin().await?;
    lifecycle_service::restore_runtime_after_failed_update(&state, &session).await
}
