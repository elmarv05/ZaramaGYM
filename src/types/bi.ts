// ============================================================================
// CONTRATOS Y TIPOS DE DOMINIO: MOTOR ANALÍTICO BI (BI-SLICE 2)
// Finanzas y Rentabilidad Multicanal + Comparativos de Periodo Anterior
// Ubicación: src/types/bi.ts
// ============================================================================

export type BiGranularity = 'DIA' | 'SEMANA' | 'MES';

export type BiCashChannel = 'MIXTA' | 'FISICA' | 'DIGITAL';

export interface BiFinanceFilterInput {
  fecha_desde: string;
  fecha_hasta: string;
  granularidad?: BiGranularity | null;
  canal_caja?: BiCashChannel | string | null;
}

export interface BiExportFinanceInput {
  filter: BiFinanceFilterInput;
  format: 'CSV' | 'XLSX';
}

export interface BiKpiComparison {
  actual: string | number;
  anterior: string | number;
  delta_pct: number | null;
}

export interface BiFinanceTimePoint {
  periodo_key: string;
  etiqueta: string;
  ingresos: string | number;
  compras: string | number;
  gastos: string | number;
  egresos: string | number;
  flujo_neto: string | number;
}

export interface BiCategoryAmount {
  clave: string;
  etiqueta: string;
  monto: string | number;
  porcentaje: number;
  cantidad: number;
}

export interface BiFinanceAnalyticsDto {
  fecha_desde: string;
  fecha_hasta: string;
  periodo_anterior_desde: string;
  periodo_anterior_hasta: string;
  granularidad_aplicada: BiGranularity;
  canal_aplicado: string;
  ingresos: BiKpiComparison;
  compras: BiKpiComparison;
  gastos: BiKpiComparison;
  egresos: BiKpiComparison;
  flujo_neto: BiKpiComparison;
  margen_operativo_pct: number;
  margen_operativo_anterior_pct: number;
  ticket_promedio: BiKpiComparison;
  descuentos_totales: BiKpiComparison;
  ventas_count: number;
  ventas_anterior_count: number;
  serie_temporal: BiFinanceTimePoint[];
  mix_lineas: BiCategoryAmount[];
  mix_metodos_pago: BiCategoryAmount[];
  gastos_por_categoria: BiCategoryAmount[];
  generated_at: string;
}

/**
 * Convierte de forma segura un Decimal serializado por Rust (string o number) a number.
 */
export function toDecimalNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const PEN_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formatea un monto monetario en soles peruanos: `S/ 1,234.50`
 */
export function formatPen(value: string | number | null | undefined): string {
  const num = toDecimalNumber(value);
  const absFormatted = PEN_NUMBER_FORMATTER.format(Math.abs(num));
  return num < 0 ? `-S/ ${absFormatted}` : `S/ ${absFormatted}`;
}

// ============================================================================
// BI-SLICE 3: SOCIOS Y RETENCIÓN + ASISTENCIA Y DEMANDA
// ============================================================================

export interface BiCategoryCount {
  clave: string;
  etiqueta: string;
  cantidad: number;
  porcentaje: number;
}

export interface BiSimpleOption {
  id: number;
  label: string;
}

export type BiAgeRange =
  | 'MENOR_18'
  | '18_24'
  | '25_34'
  | '35_44'
  | '45_54'
  | '55_MAS'
  | 'SIN_ESPECIFICAR';

export type BiTrafficLightColor = 'VERDE' | 'AMARILLO' | 'ROJO';

export type BiAccessModeFilter =
  | 'QR_LOCAL'
  | 'QR_MOVIL_LAN'
  | 'MANUAL_OLVIDO_QR'
  | 'PASE_DIARIO_CREDITO_ROJO';

export const BI_AGE_RANGE_OPTIONS: Array<{ value: BiAgeRange; label: string }> = [
  { value: 'MENOR_18', label: 'Menor de 18' },
  { value: '18_24', label: '18–24 años' },
  { value: '25_34', label: '25–34 años' },
  { value: '35_44', label: '35–44 años' },
  { value: '45_54', label: '45–54 años' },
  { value: '55_MAS', label: '55+ años' },
  { value: 'SIN_ESPECIFICAR', label: 'Sin especificar' },
];

export const BI_INACTIVITY_RISK_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 7, label: '7 días o más' },
  { value: 10, label: '10 días o más' },
  { value: 14, label: '14 días o más' },
  { value: 21, label: '21 días o más' },
  { value: 30, label: '30 días o más' },
];

export const BI_TRAFFIC_LIGHT_OPTIONS: Array<{ value: BiTrafficLightColor; label: string }> = [
  { value: 'VERDE', label: 'Verde (Vigente)' },
  { value: 'AMARILLO', label: 'Amarillo (Por vencer)' },
  { value: 'ROJO', label: 'Rojo (Vencido)' },
];

export const BI_ACCESS_CHANNEL_OPTIONS: Array<{ value: BiAccessModeFilter; label: string }> = [
  { value: 'QR_LOCAL', label: 'QR Local' },
  { value: 'QR_MOVIL_LAN', label: 'Escáner Móvil LAN' },
  { value: 'MANUAL_OLVIDO_QR', label: 'Manual (Olvido QR)' },
  { value: 'PASE_DIARIO_CREDITO_ROJO', label: 'Pase Diario Crédito' },
];

export interface BiMembersFilterInput {
  fecha_desde: string;
  fecha_hasta: string;
  granularidad?: BiGranularity | null;
  rango_edad?: BiAgeRange | string | null;
  genero?: string | null;
  canal_captacion?: string | null;
  plan_id?: number | null;
  dias_inactividad_riesgo?: number | null;
}

export interface BiExportMembersInput {
  filter: BiMembersFilterInput;
  format: 'CSV' | 'XLSX';
}

export interface BiMembersTimePoint {
  periodo_key: string;
  etiqueta: string;
  altas_nuevas: number;
  renovaciones: number;
  vencimientos: number;
}

export interface BiPlanPerformanceRow {
  plan_id: number;
  codigo: string;
  nombre: string;
  tipo_plan: string;
  unidades_vendidas: number;
  ingresos: string | number;
  porcentaje_ingresos: number;
}

export interface BiMemberAtRiskRow {
  cliente_id: number;
  nombre_completo: string;
  telefono: string | null;
  nombre_plan: string;
  fecha_vencimiento: string;
  dias_restantes: number;
  ultima_asistencia: string | null;
  dias_sin_asistir: number;
}

export interface BiWeightSummaryDto {
  socios_con_peso: number;
  socios_con_evolucion: number;
  variacion_promedio_kg: string | number;
  total_registros_peso: number;
}

export interface BiMembersAnalyticsDto {
  fecha_desde: string;
  fecha_hasta: string;
  periodo_anterior_desde: string;
  periodo_anterior_hasta: string;
  granularidad_aplicada: BiGranularity;
  dias_inactividad_riesgo: number;
  nuevos_socios: BiKpiComparison;
  socios_activos_total: number;
  membresias_vigentes_total: number;
  vencimientos_en_periodo: number;
  renovaciones_en_periodo: number;
  tasa_renovacion_pct: number;
  tasa_renovacion_anterior_pct: number;
  tasa_churn_pct: number;
  arpu: BiKpiComparison;
  dias_prorroga_otorgados: BiKpiComparison;
  serie_movimiento: BiMembersTimePoint[];
  distribucion_edad: BiCategoryCount[];
  distribucion_genero: BiCategoryCount[];
  cobertura_genero_pct: number;
  distribucion_captacion: BiCategoryCount[];
  cobertura_captacion_pct: number;
  rendimiento_planes: BiPlanPerformanceRow[];
  socios_en_riesgo: BiMemberAtRiskRow[];
  resumen_biometrico: BiWeightSummaryDto;
  planes_disponibles: BiSimpleOption[];
  generated_at: string;
}

export interface BiAttendanceFilterInput {
  fecha_desde: string;
  fecha_hasta: string;
  granularidad?: BiGranularity | null;
  rango_edad?: BiAgeRange | string | null;
  genero?: string | null;
  plan_id?: number | null;
  color_semaforo?: BiTrafficLightColor | string | null;
  modo_ingreso?: BiAccessModeFilter | string | null;
}

export interface BiExportAttendanceInput {
  filter: BiAttendanceFilterInput;
  format: 'CSV' | 'XLSX';
}

export interface BiPeakSlotDto {
  dia_semana: number;
  dia_nombre: string;
  hora: number;
  franja: string;
  total: number;
}

export interface BiHeatmapCell {
  dia_semana: number;
  hora: number;
  total: number;
  promedio_por_jornada: number;
}

export interface BiAttendanceTimePoint {
  periodo_key: string;
  etiqueta: string;
  total: number;
  socios_unicos: number;
}

export interface BiTopAttendingMemberRow {
  cliente_id: number;
  nombre_completo: string;
  total_visitas: number;
  ultima_asistencia: string;
  nombre_plan: string | null;
}

export interface BiAttendanceAnalyticsDto {
  fecha_desde: string;
  fecha_hasta: string;
  periodo_anterior_desde: string;
  periodo_anterior_hasta: string;
  granularidad_aplicada: BiGranularity;
  total_asistencias: BiKpiComparison;
  promedio_diario: number;
  promedio_diario_anterior: number;
  socios_unicos: BiKpiComparison;
  frecuencia_semanal_promedio: number;
  dia_hora_pico: BiPeakSlotDto | null;
  pases_rojo_emitidos: number;
  pases_rojo_cobrados: number;
  pases_rojo_tasa_cobro_pct: number;
  pases_rojo_saldo_pendiente: string | number;
  heatmap: BiHeatmapCell[];
  serie_temporal: BiAttendanceTimePoint[];
  distribucion_semaforo: BiCategoryCount[];
  distribucion_canales: BiCategoryCount[];
  top_socios_constantes: BiTopAttendingMemberRow[];
  planes_disponibles: BiSimpleOption[];
  generated_at: string;
}

// ============================================================================
// BI-SLICE 4: PRODUCTOS E INVENTARIO + CONTROL, RIESGO Y REPORTES
// ============================================================================

export type BiProductCategoryFilter =
  | 'BEBIDAS'
  | 'SUPLEMENTOS'
  | 'ACCESORIOS'
  | 'SNACKS'
  | 'OTROS';

export type BiCreditOriginFilter =
  | 'MEMBRESIA_PAGO_PARCIAL'
  | 'PRODUCTO_CREDITO'
  | 'PASE_DIARIO_SEMAFORO_ROJO';

export const BI_PRODUCT_CATEGORY_OPTIONS: Array<{
  value: BiProductCategoryFilter;
  label: string;
}> = [
  { value: 'BEBIDAS', label: 'Bebidas' },
  { value: 'SUPLEMENTOS', label: 'Suplementos' },
  { value: 'ACCESORIOS', label: 'Accesorios' },
  { value: 'SNACKS', label: 'Snacks' },
  { value: 'OTROS', label: 'Otros' },
];

export const BI_DEAD_STOCK_DAYS_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: '15 días o más' },
  { value: 30, label: '30 días o más' },
  { value: 60, label: '60 días o más' },
  { value: 90, label: '90 días o más' },
];

export const BI_CREDIT_ORIGIN_OPTIONS: Array<{
  value: BiCreditOriginFilter;
  label: string;
}> = [
  { value: 'MEMBRESIA_PAGO_PARCIAL', label: 'Membresía Pago Parcial' },
  { value: 'PRODUCTO_CREDITO', label: 'Producto a Crédito' },
  { value: 'PASE_DIARIO_SEMAFORO_ROJO', label: 'Pase Diario Semáforo Rojo' },
];

export interface BiInventoryFilterInput {
  fecha_desde: string;
  fecha_hasta: string;
  categoria?: BiProductCategoryFilter | string | null;
  proveedor_id?: number | null;
  dias_stock_muerto?: number | null;
}

export interface BiExportInventoryInput {
  filter: BiInventoryFilterInput;
  format: 'CSV' | 'XLSX';
}

export interface BiProductPerformanceRow {
  producto_id: number;
  codigo_sku: string;
  nombre: string;
  categoria: string;
  unidades_vendidas: number;
  ingresos: string | number;
  margen_estimado: string | number | null;
  margen_pct: number | null;
  stock_actual: number;
  stock_minimo: number;
}

export interface BiDeadStockRow {
  producto_id: number;
  codigo_sku: string;
  nombre: string;
  categoria: string;
  stock_actual: number;
  precio_venta: string | number;
  capital_inmovilizado: string | number | null;
  ultima_venta: string | null;
  dias_sin_venta: number | null;
}

export interface BiShrinkageSummaryRow {
  tipo_movimiento: string;
  etiqueta: string;
  eventos_count: number;
  unidades: number;
  costo_estimado: string | number | null;
}

export interface BiInventoryAnalyticsDto {
  fecha_desde: string;
  fecha_hasta: string;
  periodo_anterior_desde: string;
  periodo_anterior_hasta: string;
  dias_stock_muerto: number;
  puede_ver_costos_y_margenes: boolean;
  ingresos_productos: BiKpiComparison;
  unidades_vendidas: BiKpiComparison;
  margen_bruto_estimado: BiKpiComparison | null;
  margen_bruto_pct: number | null;
  valorizacion_inventario: string | number | null;
  productos_activos_count: number;
  productos_stock_critico_count: number;
  mermas_unidades: number;
  mermas_costo_estimado: string | number | null;
  top_productos: BiProductPerformanceRow[];
  ventas_por_categoria: BiCategoryAmount[];
  stock_muerto: BiDeadStockRow[];
  resumen_mermas: BiShrinkageSummaryRow[];
  proveedores_disponibles: BiSimpleOption[];
  generated_at: string;
}

export interface BiControlFilterInput {
  fecha_desde: string;
  fecha_hasta: string;
  usuario_id?: number | null;
  origen_credito?: BiCreditOriginFilter | string | null;
}

export interface BiExportControlInput {
  filter: BiControlFilterInput;
  format: 'CSV' | 'XLSX';
}

export interface BiOperatorCashAuditRow {
  usuario_id: number;
  username: string;
  nombre_completo: string;
  turnos_cerrados: number;
  turnos_con_diferencia: number;
  sobrante_total: string | number;
  faltante_total: string | number;
  diferencia_neta: string | number;
}

export interface BiOperatorStrikeRow {
  usuario_id: number;
  username: string;
  nombre_completo: string;
  ventas_totales: number;
  tachadas_pendientes: number;
  anuladas_definitivas: number;
  monto_anulado_o_tachado: string | number;
  tasa_incidencia_pct: number;
}

export interface BiCriticalAuditRow {
  id: number;
  created_at: string;
  username: string;
  modulo: string;
  accion: string;
  detalles_json: string;
}

export interface BiControlAnalyticsDto {
  fecha_desde: string;
  fecha_hasta: string;
  saldo_pendiente_total: string | number;
  deudores_activos_count: number;
  creditos_pendientes_count: number;
  creditos_emitidos_periodo: string | number;
  creditos_cobrados_periodo: string | number;
  tasa_recuperacion_pct: number;
  aging_cartera: BiCategoryAmount[];
  deuda_por_origen: BiCategoryAmount[];
  turnos_cerrados_count: number;
  turnos_cuadre_exacto_count: number;
  turnos_con_sobrante_count: number;
  turnos_con_faltante_count: number;
  descuadre_neto_acumulado: string | number;
  arqueos_por_operador: BiOperatorCashAuditRow[];
  ventas_totales_periodo: number;
  ventas_tachadas_count: number;
  ventas_anuladas_count: number;
  tasa_anulacion_pct: number;
  tachados_por_operador: BiOperatorStrikeRow[];
  eventos_criticos_auditoria: BiCriticalAuditRow[];
  operadores_disponibles: BiSimpleOption[];
  generated_at: string;
}

// ============================================================================
// BI-SLICE 5: REPORTE EJECUTIVO PDF CONSOLIDADO
// ============================================================================

export interface BiExecutivePdfInput {
  fecha_desde: string;
  fecha_hasta: string;
  canal_caja?: BiCashChannel | null;
}
