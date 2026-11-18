// ============================================================================
// SERVICIOS IPC: CATÁLOGO DE PLANES, PRODUCTOS E INVENTARIO (SLICE 3)
// Envoltorios tipados para comandos Tauri v2 con dual-binding camelCase + snake_case
// Ubicación: src/services/ipc/catalogIpc.ts
// ============================================================================

import {
  CreatePlanInput,
  CreateProductInput,
  InventoryMovementItem,
  ListInventoryMovementsFilter,
  ListPlansFilter,
  ListProductsFilter,
  PlanExpirationPreviewDto,
  PlanListItem,
  ProductListItem,
  RecordInventoryMovementInput,
  TipoPlan,
  UpdatePlanInput,
  UpdateProductInput,
} from '../../types/catalog';
import { safeInvoke } from './client';

export const catalogIpc = {
  // ==========================================================================
  // 1. PLANES Y SIMULADOR DAY OVERFLOW
  // ==========================================================================

  /**
   * Lista planes de membresía y pases diarios según filtros
   */
  async listPlans(filter: ListPlansFilter = {}): Promise<PlanListItem[]> {
    return safeInvoke<PlanListItem[]>('list_plans', { filter });
  },

  /**
   * Da de alta un nuevo plan en el catálogo (Requiere SUPERVISOR o ADMINISTRADOR)
   */
  async createPlan(input: CreatePlanInput): Promise<PlanListItem> {
    return safeInvoke<PlanListItem>('create_plan', { input });
  },

  /**
   * Actualiza datos y precios de un plan (Requiere SUPERVISOR o ADMINISTRADOR)
   */
  async updatePlan(planId: number, input: UpdatePlanInput): Promise<PlanListItem> {
    return safeInvoke<PlanListItem>('update_plan', {
      planId,
      plan_id: planId,
      input,
    });
  },

  /**
   * Alterna el estado activo/inactivo de un plan (Requiere SUPERVISOR o ADMINISTRADOR)
   */
  async togglePlanActive(planId: number, activo?: boolean): Promise<void> {
    return safeInvoke<void>('toggle_plan_active', {
      planId,
      plan_id: planId,
      active: activo,
      activo,
    });
  },

  /**
   * Simula y calcula con precisión matemática el vencimiento con Day Overflow
   */
  async previewPlanExpiration(
    fechaInicio: string,
    planId?: number,
    tipoPlan?: TipoPlan,
    duracionMeses?: number | null
  ): Promise<PlanExpirationPreviewDto> {
    return safeInvoke<PlanExpirationPreviewDto>('preview_plan_expiration', {
      fechaInicio,
      fecha_inicio: fechaInicio,
      planId,
      plan_id: planId,
      tipoPlan,
      tipo_plan: tipoPlan,
      duracionMeses: duracionMeses ?? 0,
      duracion_meses: duracionMeses ?? 0,
    });
  },

  // ==========================================================================
  // 2. PRODUCTOS Y STOCK FÍSICO
  // ==========================================================================

  /**
   * Lista productos con stock actual y alerta de stock bajo
   */
  async listProducts(filter: ListProductsFilter = {}): Promise<ProductListItem[]> {
    return safeInvoke<ProductListItem[]>('list_products', { filter });
  },

  /**
   * Da de alta un producto y genera automáticamente STOCK_INICIAL si stock > 0
   */
  async createProduct(input: CreateProductInput): Promise<ProductListItem> {
    return safeInvoke<ProductListItem>('create_product', { input });
  },

  /**
   * Actualiza metadatos de producto sin alterar stock físico directo
   */
  async updateProduct(productId: number, input: UpdateProductInput): Promise<ProductListItem> {
    return safeInvoke<ProductListItem>('update_product', {
      productId,
      product_id: productId,
      input,
    });
  },

  /**
   * Alterna el estado activo de un producto
   */
  async toggleProductActive(productoId: number, activo?: boolean): Promise<void> {
    return safeInvoke<void>('toggle_product_active', {
      productId: productoId,
      product_id: productoId,
      active: activo,
      activo,
    });
  },

  // ==========================================================================
  // 3. MOVIMIENTOS DE INVENTARIO Y MERMAS (KARDEX INMUTABLE)
  // ==========================================================================

  /**
   * Asienta un movimiento físico en el Kardex (MERMA, AJUSTE, CONSUMO INTERNO)
   * Garantiza invarianza de stock >= 0 y justificación >= 5 caracteres.
   */
  async recordInventoryMovement(
    input: RecordInventoryMovementInput
  ): Promise<InventoryMovementItem> {
    return safeInvoke<InventoryMovementItem>('record_inventory_movement', { input });
  },

  /**
   * Consulta el historial inmutable de movimientos del inventario
   */
  async listInventoryMovements(
    filter: ListInventoryMovementsFilter = {}
  ): Promise<InventoryMovementItem[]> {
    return safeInvoke<InventoryMovementItem[]>('list_inventory_movements', { filter });
  },
};
