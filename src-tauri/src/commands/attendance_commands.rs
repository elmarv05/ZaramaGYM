#![allow(non_snake_case)]

use crate::errors::AppError;
use crate::models::{
    AttendanceFilter, AttendanceListItemDto, AttendanceTodaySummaryDto, AuthorizeRedPassInput,
    CheckInEvaluationDto, CheckInInput, ExtendMembershipInput, MembershipExtensionDto,
    MembershipExtensionFilter, SystemConfigDto, UpdateSystemConfigInput, UserRole,
};
use crate::services::attendance_service;
use crate::state::AppState;
use tauri::State;

// ============================================================================
// 1. EVALUACIÓN Y CHECK-IN DEL SEMÁFORO INTELIGENTE
// ============================================================================

#[tauri::command]
pub async fn check_in_client(
    input: CheckInInput,
    state: State<'_, AppState>,
) -> Result<CheckInEvaluationDto, AppError> {
    let session = state.require_unlocked_session().await?;
    attendance_service::check_in_client(&state.pool(), &session, input).await
}

// ============================================================================
// 2. AUTORIZACIÓN DE PASE DIARIO A CRÉDITO DESDE SEMÁFORO ROJO
// ============================================================================

#[tauri::command]
pub async fn authorize_red_daily_pass_credit(
    input: AuthorizeRedPassInput,
    state: State<'_, AppState>,
) -> Result<CheckInEvaluationDto, AppError> {
    let session = state.require_unlocked_session().await?;
    attendance_service::authorize_red_daily_pass_credit(&state.pool(), &session, input).await
}

// ============================================================================
// 3. CONSULTA DE HISTORIAL Y LISTADO DE ASISTENCIAS
// ============================================================================

#[tauri::command]
pub async fn list_attendances(
    filter: Option<AttendanceFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<AttendanceListItemDto>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    attendance_service::list_attendances(&state.pool(), &session, &f).await
}

// ============================================================================
// 4. RESUMEN DE ASISTENCIAS DE LA JORNADA (HOY)
// ============================================================================

#[tauri::command]
pub async fn get_attendance_summary_today(
    state: State<'_, AppState>,
) -> Result<AttendanceTodaySummaryDto, AppError> {
    let session = state.require_unlocked_session().await?;
    attendance_service::get_attendance_summary_today(&state.pool(), &session).await
}

// ============================================================================
// 5. EXTENSIÓN Y RECUPERACIÓN MANUAL DE DÍAS DE MEMBRESÍA
// ============================================================================

#[tauri::command]
pub async fn extend_membership_days(
    input: ExtendMembershipInput,
    state: State<'_, AppState>,
) -> Result<MembershipExtensionDto, AppError> {
    let session = state.require_unlocked_session().await?;
    attendance_service::extend_membership_days(&state.pool(), &session, input).await
}

// ============================================================================
// 6. HISTORIAL DE EXTENSIONES DE MEMBRESÍA
// ============================================================================

#[tauri::command]
pub async fn list_membership_extensions(
    filter: Option<MembershipExtensionFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<MembershipExtensionDto>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    attendance_service::list_membership_extensions(&state.pool(), &session, &f).await
}

// ============================================================================
// 7. CONSULTA DE PARÁMETROS GLOBALES DEL SISTEMA
// ============================================================================

#[tauri::command]
pub async fn get_system_config(
    state: State<'_, AppState>,
) -> Result<SystemConfigDto, AppError> {
    let session = state.require_unlocked_session().await?;
    attendance_service::get_system_config(&state.pool(), &session).await
}

// ============================================================================
// 8. ACTUALIZACIÓN DE PARÁMETROS GLOBALES DEL SISTEMA (ADMIN / SUPERVISOR)
// ============================================================================

#[tauri::command]
pub async fn update_system_config(
    input: UpdateSystemConfigInput,
    state: State<'_, AppState>,
) -> Result<SystemConfigDto, AppError> {
    let session = state.require_unlocked_session().await?;
    if session.rol == UserRole::Recepcionista {
        return Err(AppError::Forbidden(
            "Solo administradores y supervisores pueden modificar la configuración del sistema"
                .to_string(),
        ));
    }
    attendance_service::update_system_config(&state.pool(), &session, input).await
}
