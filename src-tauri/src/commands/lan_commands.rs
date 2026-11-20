use crate::errors::AppError;
use crate::models::{
    CheckInEvaluationDto, CreateMobileDeviceInput, LanServerStatusDto, MobileDeviceDto,
    MobileDeviceFilter, MobileDevicePairingDto, MobileScanInput, PairMobileDeviceInput,
    PairedMobileSessionDto,
};
use crate::services::lan_service;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_lan_server_status(
    state: State<'_, AppState>,
) -> Result<LanServerStatusDto, AppError> {
    state.require_admin().await?;
    lan_service::get_lan_server_status(&state).await
}

#[tauri::command]
pub async fn toggle_lan_server(
    state: State<'_, AppState>,
    enable: bool,
) -> Result<LanServerStatusDto, AppError> {
    let session = state.require_admin().await?;
    lan_service::toggle_lan_server(&state, &session, enable).await
}

#[tauri::command]
pub async fn list_mobile_devices(
    state: State<'_, AppState>,
    filter: Option<MobileDeviceFilter>,
) -> Result<Vec<MobileDeviceDto>, AppError> {
    state.require_admin().await?;
    let f = filter.unwrap_or_default();
    lan_service::list_mobile_devices(&state.pool(), &f).await
}

#[tauri::command]
pub async fn create_mobile_device_pairing(
    state: State<'_, AppState>,
    input: CreateMobileDeviceInput,
) -> Result<MobileDevicePairingDto, AppError> {
    let session = state.require_admin().await?;
    lan_service::create_mobile_device_pairing(&state.pool(), &session, &state, input).await
}

#[tauri::command]
pub async fn pair_mobile_device(
    state: State<'_, AppState>,
    input: PairMobileDeviceInput,
) -> Result<PairedMobileSessionDto, AppError> {
    lan_service::pair_mobile_device(&state.pool(), input).await
}

#[tauri::command]
pub async fn revoke_mobile_device(
    state: State<'_, AppState>,
    device_id: i64,
) -> Result<(), AppError> {
    let session = state.require_admin().await?;
    lan_service::revoke_mobile_device(&state.pool(), &session, device_id).await
}

#[tauri::command]
pub async fn mobile_scan_qr(
    state: State<'_, AppState>,
    input: MobileScanInput,
) -> Result<CheckInEvaluationDto, AppError> {
    lan_service::mobile_scan_qr(&state.pool(), &state, input).await
}
