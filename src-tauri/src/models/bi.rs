use crate::models::dashboard::ExportFormat;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum BiGranularity {
    #[serde(alias = "dia", alias = "Dia")]
    Dia,
    #[serde(alias = "semana", alias = "Semana")]
    Semana,
    #[serde(alias = "mes", alias = "Mes")]
    Mes,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BiFinanceFilterInput {
    #[serde(default)]
    pub fecha_desde: String,
    #[serde(default)]
    pub fecha_hasta: String,
    #[serde(default)]
    pub granularidad: Option<BiGranularity>,
    #[serde(default)]
    pub canal_caja: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiExportFinanceInput {
    pub filter: BiFinanceFilterInput,
    pub format: ExportFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiKpiComparison {
    pub actual: Decimal,
    pub anterior: Decimal,
    pub delta_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiFinanceTimePoint {
    pub periodo_key: String,
    pub etiqueta: String,
    pub ingresos: Decimal,
    pub compras: Decimal,
    pub gastos: Decimal,
    pub egresos: Decimal,
    pub flujo_neto: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiCategoryAmount {
    pub clave: String,
    pub etiqueta: String,
    pub monto: Decimal,
    pub porcentaje: f64,
    pub cantidad: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiFinanceAnalyticsDto {
    pub fecha_desde: String,
    pub fecha_hasta: String,
    pub periodo_anterior_desde: String,
    pub periodo_anterior_hasta: String,
    pub granularidad_aplicada: BiGranularity,
    pub canal_aplicado: String,
    pub ingresos: BiKpiComparison,
    pub compras: BiKpiComparison,
    pub gastos: BiKpiComparison,
    pub egresos: BiKpiComparison,
    pub flujo_neto: BiKpiComparison,
    pub margen_operativo_pct: f64,
    pub margen_operativo_anterior_pct: f64,
    pub ticket_promedio: BiKpiComparison,
    pub descuentos_totales: BiKpiComparison,
    pub ventas_count: i64,
    pub ventas_anterior_count: i64,
    pub serie_temporal: Vec<BiFinanceTimePoint>,
    pub mix_lineas: Vec<BiCategoryAmount>,
    pub mix_metodos_pago: Vec<BiCategoryAmount>,
    pub gastos_por_categoria: Vec<BiCategoryAmount>,
    pub generated_at: String,
}

// ============================================================================
// MODELOS BI COMPARTIDOS (SLICE 3+)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiCategoryCount {
    pub clave: String,
    pub etiqueta: String,
    pub cantidad: i64,
    pub porcentaje: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiSimpleOption {
    pub id: i64,
    pub label: String,
}

// ============================================================================
// BI-SLICE 3A: SOCIOS Y RETENCIÓN
// ============================================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BiMembersFilterInput {
    #[serde(default)]
    pub fecha_desde: String,
    #[serde(default)]
    pub fecha_hasta: String,
    #[serde(default)]
    pub granularidad: Option<BiGranularity>,
    #[serde(default)]
    pub rango_edad: Option<String>,
    #[serde(default)]
    pub genero: Option<String>,
    #[serde(default)]
    pub canal_captacion: Option<String>,
    #[serde(default)]
    pub plan_id: Option<i64>,
    #[serde(default)]
    pub dias_inactividad_riesgo: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiExportMembersInput {
    pub filter: BiMembersFilterInput,
    pub format: ExportFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiMembersTimePoint {
    pub periodo_key: String,
    pub etiqueta: String,
    pub altas_nuevas: i64,
    pub renovaciones: i64,
    pub vencimientos: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiPlanPerformanceRow {
    pub plan_id: i64,
    pub codigo: String,
    pub nombre: String,
    pub tipo_plan: String,
    pub unidades_vendidas: i64,
    pub ingresos: Decimal,
    pub porcentaje_ingresos: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiMemberAtRiskRow {
    pub cliente_id: i64,
    pub nombre_completo: String,
    pub telefono: Option<String>,
    pub nombre_plan: String,
    pub fecha_vencimiento: String,
    pub dias_restantes: i64,
    pub ultima_asistencia: Option<String>,
    pub dias_sin_asistir: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiWeightSummaryDto {
    pub socios_con_peso: i64,
    pub socios_con_evolucion: i64,
    pub variacion_promedio_kg: Decimal,
    pub total_registros_peso: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiMembersAnalyticsDto {
    pub fecha_desde: String,
    pub fecha_hasta: String,
    pub periodo_anterior_desde: String,
    pub periodo_anterior_hasta: String,
    pub granularidad_aplicada: BiGranularity,
    pub dias_inactividad_riesgo: i64,
    pub nuevos_socios: BiKpiComparison,
    pub socios_activos_total: i64,
    pub membresias_vigentes_total: i64,
    pub vencimientos_en_periodo: i64,
    pub renovaciones_en_periodo: i64,
    pub tasa_renovacion_pct: f64,
    pub tasa_renovacion_anterior_pct: f64,
    pub tasa_churn_pct: f64,
    pub arpu: BiKpiComparison,
    pub dias_prorroga_otorgados: BiKpiComparison,
    pub serie_movimiento: Vec<BiMembersTimePoint>,
    pub distribucion_edad: Vec<BiCategoryCount>,
    pub distribucion_genero: Vec<BiCategoryCount>,
    pub cobertura_genero_pct: f64,
    pub distribucion_captacion: Vec<BiCategoryCount>,
    pub cobertura_captacion_pct: f64,
    pub rendimiento_planes: Vec<BiPlanPerformanceRow>,
    pub socios_en_riesgo: Vec<BiMemberAtRiskRow>,
    pub resumen_biometrico: BiWeightSummaryDto,
    pub planes_disponibles: Vec<BiSimpleOption>,
    pub generated_at: String,
}

// ============================================================================
// BI-SLICE 3B: ASISTENCIA Y DEMANDA
// ============================================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BiAttendanceFilterInput {
    #[serde(default)]
    pub fecha_desde: String,
    #[serde(default)]
    pub fecha_hasta: String,
    #[serde(default)]
    pub granularidad: Option<BiGranularity>,
    #[serde(default)]
    pub rango_edad: Option<String>,
    #[serde(default)]
    pub genero: Option<String>,
    #[serde(default)]
    pub plan_id: Option<i64>,
    #[serde(default)]
    pub color_semaforo: Option<String>,
    #[serde(default)]
    pub modo_ingreso: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiExportAttendanceInput {
    pub filter: BiAttendanceFilterInput,
    pub format: ExportFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiPeakSlotDto {
    pub dia_semana: i32,
    pub dia_nombre: String,
    pub hora: u32,
    pub franja: String,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiHeatmapCell {
    pub dia_semana: i32,
    pub hora: u32,
    pub total: i64,
    pub promedio_por_jornada: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiAttendanceTimePoint {
    pub periodo_key: String,
    pub etiqueta: String,
    pub total: i64,
    pub socios_unicos: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiTopAttendingMemberRow {
    pub cliente_id: i64,
    pub nombre_completo: String,
    pub total_visitas: i64,
    pub ultima_asistencia: String,
    pub nombre_plan: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiAttendanceAnalyticsDto {
    pub fecha_desde: String,
    pub fecha_hasta: String,
    pub periodo_anterior_desde: String,
    pub periodo_anterior_hasta: String,
    pub granularidad_aplicada: BiGranularity,
    pub total_asistencias: BiKpiComparison,
    pub promedio_diario: f64,
    pub promedio_diario_anterior: f64,
    pub socios_unicos: BiKpiComparison,
    pub frecuencia_semanal_promedio: f64,
    pub dia_hora_pico: Option<BiPeakSlotDto>,
    pub pases_rojo_emitidos: i64,
    pub pases_rojo_cobrados: i64,
    pub pases_rojo_tasa_cobro_pct: f64,
    pub pases_rojo_saldo_pendiente: Decimal,
    pub heatmap: Vec<BiHeatmapCell>,
    pub serie_temporal: Vec<BiAttendanceTimePoint>,
    pub distribucion_semaforo: Vec<BiCategoryCount>,
    pub distribucion_canales: Vec<BiCategoryCount>,
    pub top_socios_constantes: Vec<BiTopAttendingMemberRow>,
    pub planes_disponibles: Vec<BiSimpleOption>,
    pub generated_at: String,
}

// ============================================================================
// BI-SLICE 4A: PRODUCTOS E INVENTARIO
// ============================================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BiInventoryFilterInput {
    #[serde(default)]
    pub fecha_desde: String,
    #[serde(default)]
    pub fecha_hasta: String,
    #[serde(default)]
    pub categoria: Option<String>,
    #[serde(default)]
    pub proveedor_id: Option<i64>,
    #[serde(default)]
    pub dias_stock_muerto: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiExportInventoryInput {
    pub filter: BiInventoryFilterInput,
    pub format: ExportFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiProductPerformanceRow {
    pub producto_id: i64,
    pub codigo_sku: String,
    pub nombre: String,
    pub categoria: String,
    pub unidades_vendidas: i64,
    pub ingresos: Decimal,
    pub margen_estimado: Option<Decimal>,
    pub margen_pct: Option<f64>,
    pub stock_actual: i64,
    pub stock_minimo: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiDeadStockRow {
    pub producto_id: i64,
    pub codigo_sku: String,
    pub nombre: String,
    pub categoria: String,
    pub stock_actual: i64,
    pub precio_venta: Decimal,
    pub capital_inmovilizado: Option<Decimal>,
    pub ultima_venta: Option<String>,
    pub dias_sin_venta: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiShrinkageSummaryRow {
    pub tipo_movimiento: String,
    pub etiqueta: String,
    pub eventos_count: i64,
    pub unidades: i64,
    pub costo_estimado: Option<Decimal>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiInventoryAnalyticsDto {
    pub fecha_desde: String,
    pub fecha_hasta: String,
    pub periodo_anterior_desde: String,
    pub periodo_anterior_hasta: String,
    pub dias_stock_muerto: i64,
    pub puede_ver_costos_y_margenes: bool,
    pub ingresos_productos: BiKpiComparison,
    pub unidades_vendidas: BiKpiComparison,
    pub margen_bruto_estimado: Option<BiKpiComparison>,
    pub margen_bruto_pct: Option<f64>,
    pub valorizacion_inventario: Option<Decimal>,
    pub productos_activos_count: i64,
    pub productos_stock_critico_count: i64,
    pub mermas_unidades: i64,
    pub mermas_costo_estimado: Option<Decimal>,
    pub top_productos: Vec<BiProductPerformanceRow>,
    pub ventas_por_categoria: Vec<BiCategoryAmount>,
    pub stock_muerto: Vec<BiDeadStockRow>,
    pub resumen_mermas: Vec<BiShrinkageSummaryRow>,
    pub proveedores_disponibles: Vec<BiSimpleOption>,
    pub generated_at: String,
}

// ============================================================================
// BI-SLICE 4B: CONTROL, RIESGO Y REPORTES
// ============================================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BiControlFilterInput {
    #[serde(default)]
    pub fecha_desde: String,
    #[serde(default)]
    pub fecha_hasta: String,
    #[serde(default)]
    pub usuario_id: Option<i64>,
    #[serde(default)]
    pub origen_credito: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiExportControlInput {
    pub filter: BiControlFilterInput,
    pub format: ExportFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiOperatorCashAuditRow {
    pub usuario_id: i64,
    pub username: String,
    pub nombre_completo: String,
    pub turnos_cerrados: i64,
    pub turnos_con_diferencia: i64,
    pub sobrante_total: Decimal,
    pub faltante_total: Decimal,
    pub diferencia_neta: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiOperatorStrikeRow {
    pub usuario_id: i64,
    pub username: String,
    pub nombre_completo: String,
    pub ventas_totales: i64,
    pub tachadas_pendientes: i64,
    pub anuladas_definitivas: i64,
    pub monto_anulado_o_tachado: Decimal,
    pub tasa_incidencia_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BiCriticalAuditRow {
    pub id: i64,
    pub created_at: String,
    pub username: String,
    pub modulo: String,
    pub accion: String,
    pub detalles_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BiControlAnalyticsDto {
    pub fecha_desde: String,
    pub fecha_hasta: String,
    pub saldo_pendiente_total: Decimal,
    pub deudores_activos_count: i64,
    pub creditos_pendientes_count: i64,
    pub creditos_emitidos_periodo: Decimal,
    pub creditos_cobrados_periodo: Decimal,
    pub tasa_recuperacion_pct: f64,
    pub aging_cartera: Vec<BiCategoryAmount>,
    pub deuda_por_origen: Vec<BiCategoryAmount>,
    pub turnos_cerrados_count: i64,
    pub turnos_cuadre_exacto_count: i64,
    pub turnos_con_sobrante_count: i64,
    pub turnos_con_faltante_count: i64,
    pub descuadre_neto_acumulado: Decimal,
    pub arqueos_por_operador: Vec<BiOperatorCashAuditRow>,
    pub ventas_totales_periodo: i64,
    pub ventas_tachadas_count: i64,
    pub ventas_anuladas_count: i64,
    pub tasa_anulacion_pct: f64,
    pub tachados_por_operador: Vec<BiOperatorStrikeRow>,
    pub eventos_criticos_auditoria: Vec<BiCriticalAuditRow>,
    pub operadores_disponibles: Vec<BiSimpleOption>,
    pub generated_at: String,
}

// ============================================================================
// BI-SLICE 5: REPORTE EJECUTIVO PDF CONSOLIDADO
// ============================================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BiExecutivePdfInput {
    #[serde(default)]
    pub fecha_desde: String,
    #[serde(default)]
    pub fecha_hasta: String,
    #[serde(default)]
    pub canal_caja: Option<String>,
}
