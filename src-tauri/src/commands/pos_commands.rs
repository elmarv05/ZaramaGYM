#![allow(non_snake_case)]

use crate::errors::AppError;
use crate::models::{
    CashShiftDto, CashShiftFilter, CashShiftSummaryDto, ClientCreditDto, ClientCreditFilter,
    ClientMembershipDto, ClientMembershipFilter, CloseCashShiftInput, CreatePosSaleInput,
    OpenCashShiftInput, ResolveStruckSaleInput, SaleDetailDto, SaleFilter, SaleListItemDto,
    StrikeSaleInput,
};
use crate::services::pos_service;
use crate::state::AppState;
use tauri::State;

// ============================================================================
// COMANDOS IPC: TURNOS DE CAJA
// ============================================================================

#[tauri::command]
pub async fn get_active_cash_shift(
    state: State<'_, AppState>,
) -> Result<Option<CashShiftDto>, AppError> {
    let session = state.require_unlocked_session().await?;
    pos_service::get_active_cash_shift(&state.pool(), &session).await
}

#[tauri::command]
pub async fn open_cash_shift(
    input: OpenCashShiftInput,
    state: State<'_, AppState>,
) -> Result<CashShiftDto, AppError> {
    let session = state.require_unlocked_session().await?;
    pos_service::open_cash_shift(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn close_cash_shift(
    input: CloseCashShiftInput,
    state: State<'_, AppState>,
) -> Result<CashShiftDto, AppError> {
    let session = state.require_unlocked_session().await?;
    pos_service::close_cash_shift(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn list_cash_shifts(
    filter: Option<CashShiftFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<CashShiftDto>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    pos_service::list_cash_shifts(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn get_cash_shift_summary(
    shift_id: Option<i64>,
    shiftId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<CashShiftSummaryDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = shift_id.or(shiftId);
    pos_service::get_cash_shift_summary(&state.pool(), &session, id).await
}

// ============================================================================
// COMANDOS IPC: VENTAS PUNTO DE VENTA (POS)
// ============================================================================

#[tauri::command]
pub async fn create_pos_sale(
    input: CreatePosSaleInput,
    state: State<'_, AppState>,
) -> Result<SaleDetailDto, AppError> {
    let session = state.require_unlocked_session().await?;
    pos_service::create_pos_sale(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn list_sales(
    filter: Option<SaleFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<SaleListItemDto>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    pos_service::list_sales(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn get_sale_detail(
    sale_id: Option<i64>,
    saleId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<SaleDetailDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = sale_id
        .or(saleId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID de la venta.".into()))?;
    pos_service::get_sale_detail(&state.pool(), &session, id).await
}

// ============================================================================
// COMANDOS IPC: FLUJO DE TACHADO EN 2 PASOS
// ============================================================================

#[tauri::command]
pub async fn strike_sale(
    sale_id: Option<i64>,
    saleId: Option<i64>,
    input: StrikeSaleInput,
    state: State<'_, AppState>,
) -> Result<SaleDetailDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = sale_id
        .or(saleId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID de la venta.".into()))?;
    pos_service::strike_sale(&state.pool(), &session, id, input).await
}

#[tauri::command]
pub async fn resolve_struck_sale(
    sale_id: Option<i64>,
    saleId: Option<i64>,
    input: ResolveStruckSaleInput,
    state: State<'_, AppState>,
) -> Result<SaleDetailDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = sale_id
        .or(saleId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID de la venta.".into()))?;
    pos_service::resolve_struck_sale(&state.pool(), &session, id, input).await
}

// ============================================================================
// COMANDOS IPC: CRÉDITOS Y MEMBRESÍAS EMITIDAS
// ============================================================================

#[tauri::command]
pub async fn list_client_credits(
    filter: Option<ClientCreditFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<ClientCreditDto>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    pos_service::list_client_credits(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn list_client_memberships(
    filter: Option<ClientMembershipFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<ClientMembershipDto>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    pos_service::list_client_memberships(&state.pool(), &session, &f).await
}
