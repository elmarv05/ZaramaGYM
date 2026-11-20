#![allow(non_snake_case)]

use crate::errors::AppError;
use crate::models::finance::*;
use crate::services::finance_service;
use crate::state::AppState;
use tauri::State;

// ============================================================================
// COMANDOS IPC: COMPRAS A PROVEEDORES
// ============================================================================

#[tauri::command]
pub async fn create_supplier_purchase(
    input: CreateSupplierPurchaseDto,
    state: State<'_, AppState>,
) -> Result<SupplierPurchaseDetailDto, AppError> {
    let session = state.require_unlocked_session().await?;
    finance_service::create_supplier_purchase(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn list_supplier_purchases(
    filter: Option<SupplierPurchaseFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<SupplierPurchaseSummaryDto>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    finance_service::list_supplier_purchases(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn get_supplier_purchase_detail(
    id: Option<i64>,
    purchase_id: Option<i64>,
    purchaseId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<SupplierPurchaseDetailDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let resolved_id = id
        .or(purchase_id)
        .or(purchaseId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID de la compra a proveedor.".into()))?;
    finance_service::get_supplier_purchase_detail(&state.pool(), &session, resolved_id).await
}

#[tauri::command]
pub async fn cancel_supplier_purchase(
    id: Option<i64>,
    purchase_id: Option<i64>,
    purchaseId: Option<i64>,
    input: CancelSupplierPurchaseDto,
    state: State<'_, AppState>,
) -> Result<SupplierPurchaseDetailDto, AppError> {
    let session = state.require_admin().await?;
    let resolved_id = id
        .or(purchase_id)
        .or(purchaseId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID de la compra a proveedor.".into()))?;
    finance_service::cancel_supplier_purchase(&state.pool(), &session, resolved_id, input).await
}

// ============================================================================
// COMANDOS IPC: GASTOS OPERATIVOS (ADMIN EXCLUSIVO)
// ============================================================================

#[tauri::command]
pub async fn create_operational_expense(
    input: CreateExpenseDto,
    state: State<'_, AppState>,
) -> Result<OperationalExpenseDto, AppError> {
    let session = state.require_admin().await?;
    finance_service::create_operational_expense(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn update_operational_expense(
    id: Option<i64>,
    expense_id: Option<i64>,
    expenseId: Option<i64>,
    input: UpdateExpenseDto,
    state: State<'_, AppState>,
) -> Result<OperationalExpenseDto, AppError> {
    let session = state.require_admin().await?;
    let resolved_id = id
        .or(expense_id)
        .or(expenseId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID del gasto operativo.".into()))?;
    finance_service::update_operational_expense(&state.pool(), &session, resolved_id, input).await
}

#[tauri::command]
pub async fn toggle_operational_expense_active(
    id: Option<i64>,
    expense_id: Option<i64>,
    expenseId: Option<i64>,
    state: State<'_, AppState>,
) -> Result<OperationalExpenseDto, AppError> {
    let session = state.require_admin().await?;
    let resolved_id = id
        .or(expense_id)
        .or(expenseId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID del gasto operativo.".into()))?;
    finance_service::toggle_operational_expense_active(&state.pool(), &session, resolved_id).await
}

#[tauri::command]
pub async fn list_operational_expenses(
    filter: Option<ExpenseFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<OperationalExpenseDto>, AppError> {
    let session = state.require_admin().await?;
    let f = filter.unwrap_or_default();
    finance_service::list_operational_expenses(&state.pool(), &session, &f).await
}

// ============================================================================
// COMANDOS IPC: BANDEJA GLOBAL DE TACHADOS (PASO 2)
// ============================================================================

#[tauri::command]
pub async fn list_struck_sales_tray(
    filter: Option<StruckSaleFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<StruckSaleTrayItemDto>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    finance_service::list_struck_sales_tray(&state.pool(), &session, &f).await
}

// ============================================================================
// COMANDOS IPC: DASHBOARD Y AGREGACIONES FINANCIERAS
// ============================================================================

#[tauri::command]
pub async fn get_financial_dashboard_summary(
    filter: Option<FinancialReportFilter>,
    state: State<'_, AppState>,
) -> Result<FinancialDashboardDto, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    finance_service::get_financial_dashboard_summary(&state.pool(), &session, &f).await
}
