use crate::errors::AppError;
use crate::models::pos::{PaymentChannel, PaymentMethod};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

// ============================================================================
// ENUMS DE DOMINIO FINANCIERO
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExpenseCategory {
    ServiciosBasicos,
    Alquiler,
    MantenimientoEquipos,
    LimpiezaInsumos,
    PersonalHonorarios,
    Marketing,
    ImpuestosTasas,
    Otros,
}

impl ExpenseCategory {
    pub fn all() -> &'static [ExpenseCategory] {
        &[
            Self::ServiciosBasicos,
            Self::Alquiler,
            Self::MantenimientoEquipos,
            Self::LimpiezaInsumos,
            Self::PersonalHonorarios,
            Self::Marketing,
            Self::ImpuestosTasas,
            Self::Otros,
        ]
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::ServiciosBasicos => "Servicios Básicos",
            Self::Alquiler => "Alquiler",
            Self::MantenimientoEquipos => "Mantenimiento de Equipos",
            Self::LimpiezaInsumos => "Limpieza e Insumos",
            Self::PersonalHonorarios => "Personal y Honorarios",
            Self::Marketing => "Marketing y Publicidad",
            Self::ImpuestosTasas => "Impuestos y Tasas",
            Self::Otros => "Otros Gastos",
        }
    }
}

impl fmt::Display for ExpenseCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ServiciosBasicos => write!(f, "SERVICIOS_BASICOS"),
            Self::Alquiler => write!(f, "ALQUILER"),
            Self::MantenimientoEquipos => write!(f, "MANTENIMIENTO_EQUIPOS"),
            Self::LimpiezaInsumos => write!(f, "LIMPIEZA_INSUMOS"),
            Self::PersonalHonorarios => write!(f, "PERSONAL_HONORARIOS"),
            Self::Marketing => write!(f, "MARKETING"),
            Self::ImpuestosTasas => write!(f, "IMPUESTOS_TASAS"),
            Self::Otros => write!(f, "OTROS"),
        }
    }
}

impl FromStr for ExpenseCategory {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "SERVICIOS_BASICOS" => Ok(Self::ServiciosBasicos),
            "ALQUILER" => Ok(Self::Alquiler),
            "MANTENIMIENTO_EQUIPOS" => Ok(Self::MantenimientoEquipos),
            "LIMPIEZA_INSUMOS" => Ok(Self::LimpiezaInsumos),
            "PERSONAL_HONORARIOS" => Ok(Self::PersonalHonorarios),
            "MARKETING" => Ok(Self::Marketing),
            "IMPUESTOS_TASAS" => Ok(Self::ImpuestosTasas),
            "OTROS" => Ok(Self::Otros),
            other => Err(AppError::Validation(format!(
                "Categoría de gasto desconocida: '{}'.",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PurchaseInvoiceType {
    Factura,
    Boleta,
    Recibo,
    SinComprobante,
}

impl fmt::Display for PurchaseInvoiceType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Factura => write!(f, "FACTURA"),
            Self::Boleta => write!(f, "BOLETA"),
            Self::Recibo => write!(f, "RECIBO"),
            Self::SinComprobante => write!(f, "SIN_COMPROBANTE"),
        }
    }
}

impl FromStr for PurchaseInvoiceType {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "FACTURA" => Ok(Self::Factura),
            "BOLETA" => Ok(Self::Boleta),
            "RECIBO" => Ok(Self::Recibo),
            "SIN_COMPROBANTE" => Ok(Self::SinComprobante),
            other => Err(AppError::Validation(format!(
                "Tipo de comprobante de compra desconocido: '{}'.",
                other
            ))),
        }
    }
}

// ============================================================================
// DTOs Y STRUCTS: COMPRAS A PROVEEDORES
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSupplierPurchaseDetailDto {
    #[serde(alias = "productoId")]
    pub producto_id: i64,
    pub cantidad: i64,
    #[serde(alias = "costoUnitario")]
    pub costo_unitario: Decimal,
    pub subtotal: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSupplierPurchaseDto {
    #[serde(alias = "proveedorId")]
    pub proveedor_id: i64,
    #[serde(default, alias = "turnoCajaId")]
    pub turno_caja_id: Option<i64>,
    #[serde(alias = "tipoComprobante")]
    pub tipo_comprobante: PurchaseInvoiceType,
    #[serde(default, alias = "numeroComprobante")]
    pub numero_comprobante: Option<String>,
    #[serde(alias = "metodoPago")]
    pub metodo_pago: PaymentMethod,
    #[serde(alias = "canalCaja")]
    pub canal_caja: PaymentChannel,
    #[serde(alias = "totalCompra")]
    pub total_compra: Decimal,
    #[serde(default, alias = "fechaCompra")]
    pub fecha_compra: Option<String>,
    #[serde(default)]
    pub notas: Option<String>,
    pub detalles: Vec<CreateSupplierPurchaseDetailDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelSupplierPurchaseDto {
    #[serde(alias = "motivoAnulacion")]
    pub motivo_anulacion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SupplierPurchaseFilter {
    #[serde(default, alias = "fechaDesde")]
    pub fecha_desde: Option<String>,
    #[serde(default, alias = "fechaHasta")]
    pub fecha_hasta: Option<String>,
    #[serde(default, alias = "proveedorId")]
    pub proveedor_id: Option<i64>,
    #[serde(default, alias = "canalCaja")]
    pub canal_caja: Option<PaymentChannel>,
    #[serde(default, alias = "estadoActivo")]
    pub estado_activo: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierPurchaseSummaryDto {
    pub id: i64,
    pub proveedor_id: i64,
    pub proveedor_nombre: String,
    pub proveedor_documento: String,
    pub turno_caja_id: Option<i64>,
    pub tipo_comprobante: String,
    pub numero_comprobante: Option<String>,
    pub metodo_pago: PaymentMethod,
    pub canal_caja: PaymentChannel,
    pub total_compra: Decimal,
    pub fecha_compra: String,
    pub registrado_por_username: String,
    pub estado_activo: i64,
    pub motivo_anulacion: Option<String>,
    pub fecha_anulacion: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierPurchaseItemDetailDto {
    pub id: i64,
    pub compra_id: i64,
    pub producto_id: i64,
    pub producto_sku: String,
    pub producto_nombre: String,
    pub cantidad: i64,
    pub costo_unitario: Decimal,
    pub subtotal: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierPurchaseDetailDto {
    pub purchase: SupplierPurchaseSummaryDto,
    pub notas: Option<String>,
    pub anulado_por_username: Option<String>,
    pub items: Vec<SupplierPurchaseItemDetailDto>,
}

// ============================================================================
// DTOs Y STRUCTS: GASTOS OPERATIVOS (ADMIN EXCLUSIVO)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateExpenseDto {
    pub categoria: ExpenseCategory,
    pub descripcion: String,
    pub monto: Decimal,
    #[serde(alias = "metodoPago")]
    pub metodo_pago: PaymentMethod,
    #[serde(alias = "canalCaja")]
    pub canal_caja: PaymentChannel,
    #[serde(default, alias = "turnoCajaId")]
    pub turno_caja_id: Option<i64>,
    #[serde(default, alias = "comprobanteReferencia")]
    pub comprobante_referencia: Option<String>,
    #[serde(default, alias = "fechaGasto")]
    pub fecha_gasto: Option<String>,
    #[serde(default)]
    pub notas: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateExpenseDto {
    pub categoria: ExpenseCategory,
    pub descripcion: String,
    pub monto: Decimal,
    #[serde(alias = "metodoPago")]
    pub metodo_pago: PaymentMethod,
    #[serde(alias = "canalCaja")]
    pub canal_caja: PaymentChannel,
    #[serde(default, alias = "turnoCajaId")]
    pub turno_caja_id: Option<i64>,
    #[serde(default, alias = "comprobanteReferencia")]
    pub comprobante_referencia: Option<String>,
    #[serde(default, alias = "fechaGasto")]
    pub fecha_gasto: Option<String>,
    #[serde(default)]
    pub notas: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExpenseFilter {
    #[serde(default, alias = "fechaDesde")]
    pub fecha_desde: Option<String>,
    #[serde(default, alias = "fechaHasta")]
    pub fecha_hasta: Option<String>,
    #[serde(default)]
    pub categoria: Option<ExpenseCategory>,
    #[serde(default, alias = "canalCaja")]
    pub canal_caja: Option<PaymentChannel>,
    #[serde(default, alias = "estadoActivo")]
    pub estado_activo: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationalExpenseDto {
    pub id: i64,
    pub categoria: ExpenseCategory,
    pub descripcion: String,
    pub monto: Decimal,
    pub metodo_pago: PaymentMethod,
    pub canal_caja: PaymentChannel,
    pub turno_caja_id: Option<i64>,
    pub comprobante_referencia: Option<String>,
    pub fecha_gasto: String,
    pub notas: Option<String>,
    pub registrado_por_username: String,
    pub estado_activo: i64,
    pub created_at: String,
    pub updated_at: String,
}

// ============================================================================
// DTOs Y STRUCTS: BANDEJA GLOBAL DE TACHADOS (PASO 2)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StruckSaleFilter {
    #[serde(default, alias = "estadoVenta")]
    pub estado_venta: Option<String>, // 'TACHADA_EN_TURNO' o 'ANULADA_DEFINITIVA'
    #[serde(default, alias = "turnoCajaId")]
    pub turno_caja_id: Option<i64>,
    #[serde(default, alias = "fechaDesde")]
    pub fecha_desde: Option<String>,
    #[serde(default, alias = "fechaHasta")]
    pub fecha_hasta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StruckSaleTrayItemDto {
    pub id: i64,
    pub turno_caja_id: i64,
    pub turno_estado: String,
    pub cliente_nombre_completo: Option<String>,
    pub total_venta: Decimal,
    pub monto_pagado_efectivo: Decimal,
    pub monto_pagado_digital: Decimal,
    pub saldo_credito_generado: Decimal,
    pub estado_venta: String,
    pub usuario_vendedor_username: String,
    pub tachado_por_username: Option<String>,
    pub fecha_tachado: Option<String>,
    pub motivo_tachado: Option<String>,
    pub resuelto_por_admin_username: Option<String>,
    pub fecha_resolucion_tachado: Option<String>,
    pub nota_resolucion_tachado: Option<String>,
    pub created_at: String,
}

// ============================================================================
// DTOs Y STRUCTS: DASHBOARD Y AGREGACIONES FINANCIERAS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FinancialReportFilter {
    #[serde(default, alias = "fechaDesde")]
    pub fecha_desde: Option<String>,
    #[serde(default, alias = "fechaHasta")]
    pub fecha_hasta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct FinanceDigitalBreakdownDto {
    pub yape: Decimal,
    pub plin: Decimal,
    pub transferencia: Decimal,
    pub tarjeta: Decimal,
    pub total: Decimal,
}

impl FinanceDigitalBreakdownDto {
    pub fn new(yape: Decimal, plin: Decimal, transferencia: Decimal, tarjeta: Decimal) -> Self {
        let total = yape + plin + transferencia + tarjeta;
        Self {
            yape,
            plin,
            transferencia,
            tarjeta,
            total,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct ChannelFinancialSummaryDto {
    pub canal: String, // 'FISICA' | 'DIGITAL' | 'MIXTA'
    pub ingresos_ventas: Decimal,
    pub egresos_compras: Decimal,
    pub egresos_gastos: Decimal,
    pub total_egresos: Decimal,
    pub flujo_neto: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct DomainIncomeBreakdownDto {
    pub planes: Decimal,
    pub productos: Decimal,
    pub amortizaciones: Decimal,
    pub total: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExpenseCategoryBreakdownDto {
    pub categoria: ExpenseCategory,
    pub categoria_label: String,
    pub monto: Decimal,
    pub porcentaje: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct FinancialControlIndicatorsDto {
    pub total_creditos_pendientes: Decimal,
    pub cantidad_creditos_pendientes: i64,
    pub ventas_tachadas_pendientes_count: i64,
    pub monto_tachado_pendiente: Decimal,
    pub ventas_anuladas_definitivas_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialDashboardDto {
    pub filtro_aplicado: FinancialReportFilter,
    pub fisica: ChannelFinancialSummaryDto,
    pub digital: ChannelFinancialSummaryDto,
    pub mixta: ChannelFinancialSummaryDto,
    pub desglose_digital_ingresos: FinanceDigitalBreakdownDto,
    pub desglose_digital_compras: FinanceDigitalBreakdownDto,
    pub desglose_digital_gastos: FinanceDigitalBreakdownDto,
    pub ingresos_por_dominio: DomainIncomeBreakdownDto,
    pub gastos_por_categoria: Vec<ExpenseCategoryBreakdownDto>,
    pub indicadores_control: FinancialControlIndicatorsDto,
}
