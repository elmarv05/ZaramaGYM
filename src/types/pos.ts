// ============================================================================
// TIPOS E INTERFACES TYPESCRIPT: PUNTO DE VENTA (POS), CAJA Y CRÉDITOS (SLICE 4)
// Ubicación: src/types/pos.ts
// ============================================================================

// ============================================================================
// ENUMS Y TIPOS BASE DE POS Y TURNOS
// ============================================================================

export type CashShiftState = 'ABIERTO' | 'CERRADO';
export type SaleState = 'COMPLETADA' | 'TACHADA_EN_TURNO' | 'ANULADA_DEFINITIVA';
export type PaymentMethod = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA' | 'TARJETA';
export type PaymentChannel = 'FISICA' | 'DIGITAL';
export type PaymentState = 'ACTIVO' | 'REVERTIDO';
export type PosItemType = 'PRODUCTO' | 'PLAN' | 'AMORTIZACION_CREDITO';
export type CreditOrigin = 'MEMBRESIA_PAGO_PARCIAL' | 'PRODUCTO_CREDITO' | 'PASE_DIARIO_SEMAFORO_ROJO';
export type CreditState = 'PENDIENTE' | 'PAGADO' | 'ANULADO';
export type ClientMembershipState = 'ACTIVA' | 'VENCIDA' | 'ANULADA';
export type ResolveStruckAction = 'CONFIRMAR_ANULACION' | 'REVERTIR_TACHADO';

// ============================================================================
// TURNOS DE CAJA
// ============================================================================

export interface DigitalBreakdownDto {
  yape: string;
  plin: string;
  transferencia: string;
  tarjeta: string;
}

export interface CashShiftDto {
  id: number;
  usuario_apertura_id: number;
  usuario_apertura_username: string;
  usuario_cierre_id: number | null;
  usuario_cierre_username: string | null;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_apertura_fisico: string;
  total_ventas_efectivo: string;
  total_efectivo_esperado: string;
  monto_cierre_fisico_declarado: string | null;
  diferencia_arqueo_fisico: string | null;
  total_ventas_digital: string;
  desglose_digital: DigitalBreakdownDto;
  estado: CashShiftState;
  notas_apertura: string | null;
  notas_cierre: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashShiftSummaryDto {
  shift: CashShiftDto;
  cantidad_ventas_completadas: number;
  cantidad_ventas_tachadas: number;
  total_creditos_emitidos: string;
  total_consolidado_recaudado: string;
}

export interface OpenCashShiftInput {
  monto_apertura_fisico: string;
  notas_apertura?: string;
}

export interface CloseCashShiftInput {
  monto_cierre_fisico_declarado: string;
  notas_cierre?: string;
}

export interface CashShiftFilter {
  estado?: CashShiftState;
  fecha_desde?: string;
  fecha_hasta?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// CARRITO POS Y VENTAS
// ============================================================================

export interface PosSaleItemInput {
  tipo_item: PosItemType;
  producto_id?: number;
  plan_id?: number;
  credito_id?: number;
  cantidad: number;
  precio_unitario: string;
  subtotal: string;
  fecha_inicio_plan?: string;
}

export interface PosPaymentInput {
  metodo_pago: PaymentMethod;
  monto: string;
  referencia_operacion?: string;
}

export interface CreatePosSaleInput {
  cliente_id?: number | null;
  items: PosSaleItemInput[];
  descuento?: string;
  pagos: PosPaymentInput[];
  notas?: string;
}

export interface SaleItemDetailDto {
  id: number;
  tipo_item: PosItemType;
  producto_id: number | null;
  producto_sku: string | null;
  plan_id: number | null;
  plan_codigo: string | null;
  credito_id: number | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: string;
  subtotal: string;
  fecha_inicio_plan: string | null;
  fecha_fin_plan: string | null;
}

export interface PaymentDetailDto {
  id: number;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  monto: string;
  referencia_operacion: string | null;
  estado_pago: PaymentState;
  created_at: string;
}

export interface SaleDetailDto {
  id: number;
  turno_caja_id: number;
  cliente_id: number | null;
  cliente_nombre_completo: string | null;
  cliente_numero_documento: string | null;
  usuario_vendedor_id: number;
  usuario_vendedor_username: string;
  subtotal: string;
  descuento: string;
  total_venta: string;
  monto_pagado_efectivo: string;
  monto_pagado_digital: string;
  saldo_credito_generado: string;
  estado_venta: SaleState;
  tachado_por_usuario_id: number | null;
  tachado_por_username: string | null;
  fecha_tachado: string | null;
  motivo_tachado: string | null;
  resuelto_por_admin_id: number | null;
  resuelto_por_admin_username: string | null;
  fecha_resolucion_tachado: string | null;
  nota_resolucion_tachado: string | null;
  notas: string | null;
  created_at: string;
  items: SaleItemDetailDto[];
  pagos: PaymentDetailDto[];
}

export interface SaleListItemDto {
  id: number;
  turno_caja_id: number;
  cliente_nombre_completo: string | null;
  total_venta: string;
  monto_pagado_efectivo: string;
  monto_pagado_digital: string;
  saldo_credito_generado: string;
  estado_venta: SaleState;
  usuario_vendedor_username: string;
  created_at: string;
}

export interface SaleFilter {
  turno_caja_id?: number;
  cliente_id?: number;
  cliente_busqueda?: string;
  usuario_vendedor_id?: number;
  usuario_vendedor_username?: string;
  estado_venta?: SaleState;
  fecha_desde?: string;
  fecha_hasta?: string;
  limit?: number;
  offset?: number;
}

export interface StrikeSaleInput {
  motivo_tachado: string;
}

export interface ResolveStruckSaleInput {
  accion: ResolveStruckAction;
  nota_resolucion?: string;
}

// ============================================================================
// CRÉDITOS Y MEMBRESÍAS
// ============================================================================

export interface ClientCreditDto {
  id: number;
  cliente_id: number;
  cliente_nombre_completo: string;
  cliente_numero_documento: string;
  cliente_telefono: string | null;
  venta_origen_id: number | null;
  origen_credito: CreditOrigin;
  descripcion: string;
  monto_total: string;
  monto_pagado: string;
  saldo_pendiente: string;
  estado: CreditState;
  registrado_por_usuario_id: number;
  registrado_por_username: string;
  fecha_emision: string;
  fecha_ultimo_pago: string | null;
  notas: string | null;
  created_at: string;
}

export interface ClientCreditFilter {
  cliente_id?: number;
  estado?: CreditState;
  origen_credito?: CreditOrigin;
  solo_con_deuda?: boolean;
  limit?: number;
  offset?: number;
}

export interface ClientMembershipDto {
  id: number;
  cliente_id: number;
  cliente_nombre_completo: string;
  plan_id: number;
  plan_nombre: string;
  venta_id: number | null;
  fecha_inicio: string;
  fecha_vencimiento: string;
  precio_pactado: string;
  estado: ClientMembershipState;
  dias_restantes: number;
  permite_recuperacion_dias?: boolean;
  registrado_por_usuario_id: number;
  registrado_por_username: string;
  created_at: string;
}

export interface ClientMembershipFilter {
  cliente_id?: number;
  plan_id?: number;
  estado?: ClientMembershipState;
  solo_activas?: boolean;
  limit?: number;
  offset?: number;
}
