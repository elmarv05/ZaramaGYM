// ============================================================================
// CONTRATO TIPADO DE CATÁLOGO DE PLANES, PRODUCTOS E INVENTARIO (SLICE 3)
// Algoritmo Day Overflow, Kardex inmutable y Mermas
// Ubicación: src/types/catalog.ts
// ============================================================================

export type PlanType = 'PASE_DIARIO' | 'MENSUALIDAD';
export type TipoPlan = PlanType;

export type ProductCategory =
  | 'BEBIDAS'
  | 'SUPLEMENTOS'
  | 'ACCESORIOS'
  | 'SNACKS'
  | 'OTROS';
export type CategoriaProducto = ProductCategory;

export type UnidadMedida =
  | 'UNIDAD'
  | 'BOTELLA'
  | 'SCOOP'
  | 'BARRA'
  | 'PAQUETE'
  | 'OTRO'
  | string;

export type InventoryMovementType =
  | 'STOCK_INICIAL'
  | 'ENTRADA_AJUSTE'
  | 'ENTRADA_COMPRA'
  | 'SALIDA_VENTA'
  | 'MERMA_DANIO'
  | 'MERMA_VENCIMIENTO'
  | 'CONSUMO_PROPIO'
  | 'REVERSION_TACHADO';
export type TipoMovimientoInventario = InventoryMovementType;

// ============================================================================
// PLANES Y SIMULADOR DAY OVERFLOW
// ============================================================================

export interface PlanListItem {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo_plan: PlanType;
  duracion_meses: number;
  precio_base: string; // DECIMAL(10,2) formateado
  precio?: string;
  permite_recuperacion_dias: boolean;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}
export type PlanDto = PlanListItem;

export interface PlanFilter {
  search?: string;
  busqueda?: string;
  tipo_plan?: PlanType;
  solo_activos?: boolean;
}
export type ListPlansFilter = PlanFilter;

export interface CreatePlanInput {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  tipo_plan: PlanType;
  duracion_meses: number;
  precio_base: string;
  precio?: string;
  permite_recuperacion_dias: boolean;
}

export interface UpdatePlanInput {
  nombre: string;
  descripcion?: string | null;
  precio_base: string;
  precio?: string;
  permite_recuperacion_dias: boolean;
}

export interface PlanExpirationPreview {
  fecha_inicio: string;
  fecha_inicio_evaluada?: string;
  fecha_vencimiento_date: string;
  fecha_vencimiento_timestamp: string;
  fecha_vencimiento?: string;
  dias_totales: number;
  hubo_desbordamiento: boolean;
  dias_desbordamiento: number;
  dias_overflow_aplicados?: number;
  es_bisiesto_destino?: boolean;
  explicacion: string;
  nota_explicativa?: string;
  formula_aplicada?: string;
}
export type PlanExpirationPreviewDto = PlanExpirationPreview;

// ============================================================================
// PRODUCTOS Y STOCK
// ============================================================================

export interface ProductListItem {
  id: number;
  codigo_sku: string;
  nombre: string;
  categoria: ProductCategory;
  unidad_medida: string;
  precio_compra_referencial: string;
  precio_venta: string;
  stock_actual: number;
  stock_minimo: number;
  alerta_stock_bajo: boolean;
  proveedor_preferido_id: number | null;
  proveedor_nombre: string | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}
export type ProductDto = ProductListItem;

export interface ProductFilter {
  search?: string;
  categoria?: ProductCategory;
  solo_activos?: boolean;
  solo_stock_bajo?: boolean;
}
export type ListProductsFilter = ProductFilter;

export interface CreateProductInput {
  codigo_sku: string;
  nombre: string;
  categoria: ProductCategory;
  unidad_medida?: string;
  precio_compra_referencial: string;
  precio_venta: string;
  stock_inicial: number;
  stock_minimo: number;
  proveedor_preferido_id?: number | null;
}

export interface UpdateProductInput {
  nombre: string;
  categoria: ProductCategory;
  unidad_medida?: string;
  precio_compra_referencial: string;
  precio_venta: string;
  stock_minimo: number;
  proveedor_preferido_id?: number | null;
}

// ============================================================================
// KARDEX INMUTABLE Y MERMAS
// ============================================================================

export interface InventoryMovementItem {
  id: number;
  producto_id: number;
  producto_sku: string;
  producto_nombre: string;
  tipo_movimiento: InventoryMovementType;
  signo: '+' | '-';
  cantidad: number;
  stock_anterior: number;
  stock_resultante: number;
  costo_unitario_momento: string;
  motivo_justificacion: string;
  registrado_por_usuario_id: number;
  registrado_por_username: string;
  created_at: string;
}
export type InventoryMovementDto = InventoryMovementItem;

export interface InventoryMovementFilter {
  producto_id?: number;
  tipo_movimiento?: InventoryMovementType;
  limit?: number;
  offset?: number;
}
export type ListInventoryMovementsFilter = InventoryMovementFilter;

export interface RecordInventoryMovementInput {
  producto_id: number;
  tipo_movimiento: 'ENTRADA_AJUSTE' | 'MERMA_DANIO' | 'MERMA_VENCIMIENTO' | 'CONSUMO_PROPIO';
  cantidad: number;
  costo_unitario_momento?: string;
  motivo_justificacion: string;
}
