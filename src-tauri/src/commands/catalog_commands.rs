#![allow(non_snake_case)]

use crate::errors::AppError;
use crate::models::{
    CreatePlanInput, CreateProductInput, InventoryMovementFilter, InventoryMovementItem,
    PlanExpirationPreview, PlanFilter, PlanListItem, ProductFilter, ProductListItem,
    RecordInventoryMovementInput, UpdatePlanInput, UpdateProductInput,
};
use crate::services::catalog_service;
use crate::state::AppState;
use tauri::State;

// ============================================================================
// COMANDOS IPC: PLANES Y MEMBRESÍAS
// ============================================================================

#[tauri::command]
pub async fn list_plans(
    filter: Option<PlanFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<PlanListItem>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    catalog_service::list_plans(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn create_plan(
    input: CreatePlanInput,
    state: State<'_, AppState>,
) -> Result<PlanListItem, AppError> {
    let session = state.require_unlocked_session().await?;
    catalog_service::create_plan(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn update_plan(
    plan_id: Option<i64>,
    planId: Option<i64>,
    input: UpdatePlanInput,
    state: State<'_, AppState>,
) -> Result<PlanListItem, AppError> {
    let session = state.require_admin().await?;
    let id = plan_id
        .or(planId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID del plan.".into()))?;
    catalog_service::update_plan(&state.pool(), &session, id, input).await
}

#[tauri::command]
pub async fn toggle_plan_active(
    plan_id: Option<i64>,
    planId: Option<i64>,
    active: Option<bool>,
    activo: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let session = state.require_admin().await?;
    let id = plan_id
        .or(planId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID del plan.".into()))?;
    let is_act = active
        .or(activo)
        .ok_or_else(|| AppError::Validation("Debe indicar el nuevo estado activo.".into()))?;
    catalog_service::toggle_plan_active(&state.pool(), &session, id, is_act).await
}

#[tauri::command]
pub async fn preview_plan_expiration(
    fecha_inicio: Option<String>,
    fechaInicio: Option<String>,
    plan_id: Option<i64>,
    planId: Option<i64>,
    tipo_plan: Option<String>,
    tipoPlan: Option<String>,
    duracion_meses: Option<u32>,
    duracionMeses: Option<u32>,
    state: State<'_, AppState>,
) -> Result<PlanExpirationPreview, AppError> {
    let _session = state.require_unlocked_session().await?;
    let f_inicio = fecha_inicio
        .or(fechaInicio)
        .ok_or_else(|| AppError::Validation("Debe indicar la fecha de inicio.".into()))?;

    let mut t_plan = tipo_plan.or(tipoPlan);
    let mut d_meses = duracion_meses.or(duracionMeses);

    if t_plan.is_none() {
        if let Some(pid) = plan_id.or(planId) {
            let row = sqlx::query("SELECT tipo_plan, duracion_meses FROM planes WHERE id = ?")
                .bind(pid)
                .fetch_optional(&state.pool())
                .await?;
            if let Some(r) = row {
                use sqlx::Row;
                let tp: String = r.get("tipo_plan");
                let dm: i64 = r.get("duracion_meses");
                t_plan = Some(tp);
                if d_meses.is_none() {
                    d_meses = Some(dm as u32);
                }
            }
        }
    }

    let tp = t_plan.ok_or_else(|| AppError::Validation("Debe indicar el tipo de plan.".into()))?;
    let dm = d_meses.unwrap_or(0);

    catalog_service::preview_plan_expiration(&f_inicio, &tp, dm)
}

// ============================================================================
// COMANDOS IPC: PRODUCTOS E INVENTARIO (KARDEX / MERMAS)
// ============================================================================

#[tauri::command]
pub async fn list_products(
    filter: Option<ProductFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<ProductListItem>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    catalog_service::list_products(&state.pool(), &session, &f).await
}

#[tauri::command]
pub async fn create_product(
    input: CreateProductInput,
    state: State<'_, AppState>,
) -> Result<ProductListItem, AppError> {
    let session = state.require_unlocked_session().await?;
    catalog_service::create_product(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn update_product(
    product_id: Option<i64>,
    productId: Option<i64>,
    input: UpdateProductInput,
    state: State<'_, AppState>,
) -> Result<ProductListItem, AppError> {
    let session = state.require_unlocked_session().await?;
    let id = product_id
        .or(productId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID del producto.".into()))?;
    catalog_service::update_product(&state.pool(), &session, id, input).await
}

#[tauri::command]
pub async fn toggle_product_active(
    product_id: Option<i64>,
    productId: Option<i64>,
    active: Option<bool>,
    activo: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let session = state.require_admin().await?;
    let id = product_id
        .or(productId)
        .ok_or_else(|| AppError::Validation("Debe indicar el ID del producto.".into()))?;
    let is_act = active
        .or(activo)
        .ok_or_else(|| AppError::Validation("Debe indicar el nuevo estado activo.".into()))?;
    catalog_service::toggle_product_active(&state.pool(), &session, id, is_act).await
}

#[tauri::command]
pub async fn record_inventory_movement(
    input: RecordInventoryMovementInput,
    state: State<'_, AppState>,
) -> Result<InventoryMovementItem, AppError> {
    let session = state.require_admin().await?;
    catalog_service::record_inventory_movement(&state.pool(), &session, input).await
}

#[tauri::command]
pub async fn list_inventory_movements(
    filter: Option<InventoryMovementFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<InventoryMovementItem>, AppError> {
    let session = state.require_unlocked_session().await?;
    let f = filter.unwrap_or_default();
    catalog_service::list_inventory_movements(&state.pool(), &session, &f).await
}
