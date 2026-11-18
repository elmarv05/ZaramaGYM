// ============================================================================
// TIPOS E INTERFACES TYPESCRIPT: COMPRAS, GASTOS Y FINANZAS (SLICE 7)
// Ubicación: src/types/finance.ts
// ============================================================================

import { PaymentChannel, PaymentMethod } from './pos';

// ============================================================================
// ENUMS Y TIPOS DE DOMINIO FINANCIERO
// ============================================================================

export type ExpenseCategory =
  | 'SERVICIOS_BASICOS'
  | 'ALQUILER'
  | 'MANTENIMIENTO_EQUIPOS'
  | 'LIMPIEZA_INSUMOS'
  | 'PERSONAL_HONORARIOS'
  | 'MARKETING'
  | 'IMPUESTOS_TASAS'
  | 'OTROS';

export type PurchaseInvoiceType =
  | 'FACTURA'
  | 'BOLETA'
  | 'RECIBO'
  | 'SIN_COMPROBANTE';

export type FinancialViewChannel = 'FISICA' | 'DIGITAL' | 'MIXTA';

// ============================================================================
// COMPRAS A PROVEEDORES
// ============================================================================

export interface CreateSupplierPurchaseDetailDto {
  producto_id: number;
  cantidad: number;
  costo_unitario: string; // Decimal formateado "0.00"
  subtotal: string;       // Decimal formateado "0.00"
}

export interface CreateSupplierPurchaseDto {
  proveedor_id: number;
  turno_caja_id?: number | null;
  tipo_comprobante: PurchaseInvoiceType;
  numero_comprobante?: string | null;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  total_compra: string;
  fecha_compra?: string | null;
  notas?: string | null;
  detalles: CreateSupplierPurchaseDetailDto[];
}

export interface CancelSupplierPurchaseDto {
  motivo_anulacion: string;
}

export interface SupplierPurchaseFilter {
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  proveedor_id?: number | null;
  canal_caja?: PaymentChannel | null;
  estado_activo?: number | null;
}

export interface SupplierPurchaseSummaryDto {
  id: number;
  proveedor_id: number;
  proveedor_nombre: string;
  proveedor_documento: string;
  turno_caja_id?: number | null;
  tipo_comprobante: PurchaseInvoiceType;
  numero_comprobante?: string | null;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  total_compra: string;
  fecha_compra: string;
  registrado_por_username: string;
  estado_activo: number;
  motivo_anulacion?: string | null;
  fecha_anulacion?: string | null;
  created_at: string;
}

export interface SupplierPurchaseItemDetailDto {
  id: number;
  compra_id: number;
  producto_id: number;
  producto_sku: string;
  producto_nombre: string;
  cantidad: number;
  costo_unitario: string;
  subtotal: string;
}

export interface SupplierPurchaseDetailDto {
  purchase: SupplierPurchaseSummaryDto;
  notas?: string | null;
  anulado_por_username?: string | null;
  items: SupplierPurchaseItemDetailDto[];
}

// ============================================================================
// GASTOS OPERATIVOS (ADMIN EXCLUSIVO)
// ============================================================================

export interface CreateExpenseDto {
  categoria: ExpenseCategory;
  descripcion: string;
  monto: string;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  turno_caja_id?: number | null;
  comprobante_referencia?: string | null;
  fecha_gasto?: string | null;
  notas?: string | null;
}

export interface UpdateExpenseDto {
  categoria: ExpenseCategory;
  descripcion: string;
  monto: string;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  turno_caja_id?: number | null;
  comprobante_referencia?: string | null;
  fecha_gasto?: string | null;
  notas?: string | null;
}

export interface ExpenseFilter {
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  categoria?: ExpenseCategory | null;
  canal_caja?: PaymentChannel | null;
  estado_activo?: number | null;
}

export interface OperationalExpenseDto {
  id: number;
  categoria: ExpenseCategory;
  descripcion: string;
  monto: string;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  turno_caja_id?: number | null;
  comprobante_referencia?: string | null;
  fecha_gasto: string;
  notas?: string | null;
  registrado_por_username: string;
  estado_activo: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// BANDEJA GLOBAL DE TACHADOS (PASO 2)
// ============================================================================

export interface StruckSaleFilter {
  estado_venta?: 'TACHADA_EN_TURNO' | 'ANULADA_DEFINITIVA' | null;
  turno_caja_id?: number | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
}

export interface StruckSaleTrayItemDto {
  id: number;
  turno_caja_id: number;
  turno_estado: 'ABIERTO' | 'CERRADO';
  cliente_nombre_completo?: string | null;
  total_venta: string;
  monto_pagado_efectivo: string;
  monto_pagado_digital: string;
  saldo_credito_generado: string;
  estado_venta: 'TACHADA_EN_TURNO' | 'ANULADA_DEFINITIVA';
  usuario_vendedor_username: string;
  tachado_por_username?: string | null;
  fecha_tachado?: string | null;
  motivo_tachado?: string | null;
  resuelto_por_admin_username?: string | null;
  fecha_resolucion_tachado?: string | null;
  nota_resolucion_tachado?: string | null;
  created_at: string;
}

// ============================================================================
// DASHBOARD Y AGREGACIONES FINANCIERAS
// ============================================================================

export interface FinancialReportFilter {
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
}

export interface FinanceDigitalBreakdownDto {
  yape: string;
  plin: string;
  transferencia: string;
  tarjeta: string;
  total: string;
}

// Alias para compatibilidad
export type DigitalBreakdownDto = FinanceDigitalBreakdownDto;

export interface ChannelFinancialSummaryDto {
  canal: 'FISICA' | 'DIGITAL' | 'MIXTA';
  ingresos_ventas: string;
  egresos_compras: string;
  egresos_gastos: string;
  total_egresos: string;
  flujo_neto: string;
}

export interface DomainIncomeBreakdownDto {
  planes: string;
  productos: string;
  amortizaciones: string;
  total: string;
}

export interface ExpenseCategoryBreakdownDto {
  categoria: ExpenseCategory;
  categoria_label: string;
  monto: string;
  porcentaje: string;
}

export interface FinancialControlIndicatorsDto {
  total_creditos_pendientes: string;
  cantidad_creditos_pendientes: number;
  ventas_tachadas_pendientes_count: number;
  monto_tachado_pendiente: string;
  ventas_anuladas_definitivas_count: number;
}

export interface FinancialDashboardDto {
  filtro_aplicado: FinancialReportFilter;
  fisica: ChannelFinancialSummaryDto;
  digital: ChannelFinancialSummaryDto;
  mixta: ChannelFinancialSummaryDto;
  desglose_digital_ingresos: FinanceDigitalBreakdownDto;
  desglose_digital_compras: FinanceDigitalBreakdownDto;
  desglose_digital_gastos: FinanceDigitalBreakdownDto;
  ingresos_por_dominio: DomainIncomeBreakdownDto;
  gastos_por_categoria: ExpenseCategoryBreakdownDto[];
  indicadores_control: FinancialControlIndicatorsDto;
}
