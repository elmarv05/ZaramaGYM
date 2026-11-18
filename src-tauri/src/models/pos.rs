use crate::errors::AppError;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

// ============================================================================
// ENUMS DE DOMINIO POS, TURNOS Y CRÉDITOS
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CashShiftState {
    Abierto,
    Cerrado,
}

impl fmt::Display for CashShiftState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Abierto => write!(f, "ABIERTO"),
            Self::Cerrado => write!(f, "CERRADO"),
        }
    }
}

impl FromStr for CashShiftState {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "ABIERTO" => Ok(Self::Abierto),
            "CERRADO" => Ok(Self::Cerrado),
            other => Err(AppError::Validation(format!(
                "Estado de turno desconocido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SaleState {
    Completada,
    TachadaEnTurno,
    AnuladaDefinitiva,
}

impl fmt::Display for SaleState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Completada => write!(f, "COMPLETADA"),
            Self::TachadaEnTurno => write!(f, "TACHADA_EN_TURNO"),
            Self::AnuladaDefinitiva => write!(f, "ANULADA_DEFINITIVA"),
        }
    }
}

impl FromStr for SaleState {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "COMPLETADA" => Ok(Self::Completada),
            "TACHADA_EN_TURNO" => Ok(Self::TachadaEnTurno),
            "ANULADA_DEFINITIVA" => Ok(Self::AnuladaDefinitiva),
            other => Err(AppError::Validation(format!(
                "Estado de venta desconocido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentMethod {
    Efectivo,
    Yape,
    Plin,
    Transferencia,
    Tarjeta,
}

impl fmt::Display for PaymentMethod {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Efectivo => write!(f, "EFECTIVO"),
            Self::Yape => write!(f, "YAPE"),
            Self::Plin => write!(f, "PLIN"),
            Self::Transferencia => write!(f, "TRANSFERENCIA"),
            Self::Tarjeta => write!(f, "TARJETA"),
        }
    }
}

impl FromStr for PaymentMethod {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "EFECTIVO" => Ok(Self::Efectivo),
            "YAPE" => Ok(Self::Yape),
            "PLIN" => Ok(Self::Plin),
            "TRANSFERENCIA" => Ok(Self::Transferencia),
            "TARJETA" => Ok(Self::Tarjeta),
            other => Err(AppError::Validation(format!(
                "Método de pago desconocido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentChannel {
    Fisica,
    Digital,
}

impl fmt::Display for PaymentChannel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Fisica => write!(f, "FISICA"),
            Self::Digital => write!(f, "DIGITAL"),
        }
    }
}

impl FromStr for PaymentChannel {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "FISICA" => Ok(Self::Fisica),
            "DIGITAL" => Ok(Self::Digital),
            other => Err(AppError::Validation(format!(
                "Canal de caja desconocido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PaymentState {
    Activo,
    Revertido,
}

impl fmt::Display for PaymentState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Activo => write!(f, "ACTIVO"),
            Self::Revertido => write!(f, "REVERTIDO"),
        }
    }
}

impl FromStr for PaymentState {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "ACTIVO" => Ok(Self::Activo),
            "REVERTIDO" => Ok(Self::Revertido),
            other => Err(AppError::Validation(format!(
                "Estado de pago desconocido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PosItemType {
    Producto,
    Plan,
    AmortizacionCredito,
}

impl fmt::Display for PosItemType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Producto => write!(f, "PRODUCTO"),
            Self::Plan => write!(f, "PLAN"),
            Self::AmortizacionCredito => write!(f, "AMORTIZACION_CREDITO"),
        }
    }
}

impl FromStr for PosItemType {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "PRODUCTO" => Ok(Self::Producto),
            "PLAN" => Ok(Self::Plan),
            "AMORTIZACION_CREDITO" => Ok(Self::AmortizacionCredito),
            other => Err(AppError::Validation(format!(
                "Tipo de ítem POS desconocido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CreditOrigin {
    MembresiaPagoParcial,
    ProductoCredito,
    PaseDiarioSemaforoRojo,
}

impl fmt::Display for CreditOrigin {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MembresiaPagoParcial => write!(f, "MEMBRESIA_PAGO_PARCIAL"),
            Self::ProductoCredito => write!(f, "PRODUCTO_CREDITO"),
            Self::PaseDiarioSemaforoRojo => write!(f, "PASE_DIARIO_SEMAFORO_ROJO"),
        }
    }
}

impl FromStr for CreditOrigin {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "MEMBRESIA_PAGO_PARCIAL" => Ok(Self::MembresiaPagoParcial),
            "PRODUCTO_CREDITO" => Ok(Self::ProductoCredito),
            "PASE_DIARIO_SEMAFORO_ROJO" => Ok(Self::PaseDiarioSemaforoRojo),
            other => Err(AppError::Validation(format!(
                "Origen de crédito desconocido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CreditState {
    Pendiente,
    Pagado,
    Anulado,
}

impl fmt::Display for CreditState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pendiente => write!(f, "PENDIENTE"),
            Self::Pagado => write!(f, "PAGADO"),
            Self::Anulado => write!(f, "ANULADO"),
        }
    }
}

impl FromStr for CreditState {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "PENDIENTE" => Ok(Self::Pendiente),
            "PAGADO" => Ok(Self::Pagado),
            "ANULADO" => Ok(Self::Anulado),
            other => Err(AppError::Validation(format!(
                "Estado de crédito desconocido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ClientMembershipState {
    Activa,
    Vencida,
    Anulada,
}

impl fmt::Display for ClientMembershipState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Activa => write!(f, "ACTIVA"),
            Self::Vencida => write!(f, "VENCIDA"),
            Self::Anulada => write!(f, "ANULADA"),
        }
    }
}

impl FromStr for ClientMembershipState {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "ACTIVA" => Ok(Self::Activa),
            "VENCIDA" => Ok(Self::Vencida),
            "ANULADA" => Ok(Self::Anulada),
            other => Err(AppError::Validation(format!(
                "Estado de membresía desconocido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ResolveStruckAction {
    ConfirmarAnulacion,
    RevertirTachado,
}

impl fmt::Display for ResolveStruckAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ConfirmarAnulacion => write!(f, "CONFIRMAR_ANULACION"),
            Self::RevertirTachado => write!(f, "REVERTIR_TACHADO"),
        }
    }
}

impl FromStr for ResolveStruckAction {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "CONFIRMAR_ANULACION" => Ok(Self::ConfirmarAnulacion),
            "REVERTIR_TACHADO" => Ok(Self::RevertirTachado),
            other => Err(AppError::Validation(format!(
                "Acción de resolución de tachado desconocida: {}",
                other
            ))),
        }
    }
}

// ============================================================================
// DTOs Y MODELOS DE TURNOS DE CAJA
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DigitalBreakdownDto {
    pub yape: Decimal,
    pub plin: Decimal,
    pub transferencia: Decimal,
    pub tarjeta: Decimal,
}

impl Default for DigitalBreakdownDto {
    fn default() -> Self {
        Self {
            yape: Decimal::ZERO,
            plin: Decimal::ZERO,
            transferencia: Decimal::ZERO,
            tarjeta: Decimal::ZERO,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashShiftDto {
    pub id: i64,
    pub usuario_apertura_id: i64,
    pub usuario_apertura_username: String,
    pub usuario_cierre_id: Option<i64>,
    pub usuario_cierre_username: Option<String>,
    pub fecha_apertura: String,
    pub fecha_cierre: Option<String>,
    pub monto_apertura_fisico: Decimal,
    pub total_ventas_efectivo: Decimal,
    pub total_efectivo_esperado: Decimal,
    pub monto_cierre_fisico_declarado: Option<Decimal>,
    pub diferencia_arqueo_fisico: Option<Decimal>,
    pub total_ventas_digital: Decimal,
    pub desglose_digital: DigitalBreakdownDto,
    pub estado: CashShiftState,
    pub notas_apertura: Option<String>,
    pub notas_cierre: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CashShiftSummaryDto {
    pub shift: CashShiftDto,
    pub cantidad_ventas_completadas: i64,
    pub cantidad_ventas_tachadas: i64,
    pub total_creditos_emitidos: Decimal,
    pub total_consolidado_recaudado: Decimal, // efectivo + digital
}

#[derive(Debug, Deserialize)]
pub struct OpenCashShiftInput {
    #[serde(alias = "montoAperturaFisico")]
    pub monto_apertura_fisico: Decimal,
    #[serde(alias = "notasApertura")]
    pub notas_apertura: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CloseCashShiftInput {
    #[serde(alias = "montoCierreFisicoDeclarado")]
    pub monto_cierre_fisico_declarado: Decimal,
    #[serde(alias = "notasCierre")]
    pub notas_cierre: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct CashShiftFilter {
    pub estado: Option<CashShiftState>,
    #[serde(alias = "fechaDesde")]
    pub fecha_desde: Option<String>,
    #[serde(alias = "fechaHasta")]
    pub fecha_hasta: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ============================================================================
// DTOs Y MODELOS DE PUNTO DE VENTA (POS)
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
pub struct PosSaleItemInput {
    #[serde(alias = "tipoItem")]
    pub tipo_item: PosItemType,
    #[serde(alias = "productoId")]
    pub producto_id: Option<i64>,
    #[serde(alias = "planId")]
    pub plan_id: Option<i64>,
    #[serde(alias = "creditoId")]
    pub credito_id: Option<i64>,
    pub cantidad: i64,
    #[serde(alias = "precioUnitario")]
    pub precio_unitario: Decimal,
    pub subtotal: Decimal,
    #[serde(alias = "fechaInicioPlan")]
    pub fecha_inicio_plan: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PosPaymentInput {
    #[serde(alias = "metodoPago")]
    pub metodo_pago: PaymentMethod,
    pub monto: Decimal,
    #[serde(alias = "referenciaOperacion")]
    pub referencia_operacion: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePosSaleInput {
    #[serde(alias = "clienteId")]
    pub cliente_id: Option<i64>,
    pub items: Vec<PosSaleItemInput>,
    pub descuento: Option<Decimal>,
    pub pagos: Vec<PosPaymentInput>,
    pub notas: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleItemDetailDto {
    pub id: i64,
    pub tipo_item: PosItemType,
    pub producto_id: Option<i64>,
    pub producto_sku: Option<String>,
    pub plan_id: Option<i64>,
    pub plan_codigo: Option<String>,
    pub credito_id: Option<i64>,
    pub descripcion: String,
    pub cantidad: i64,
    pub precio_unitario: Decimal,
    pub subtotal: Decimal,
    pub fecha_inicio_plan: Option<String>,
    pub fecha_fin_plan: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentDetailDto {
    pub id: i64,
    pub metodo_pago: PaymentMethod,
    pub canal_caja: PaymentChannel,
    pub monto: Decimal,
    pub referencia_operacion: Option<String>,
    pub estado_pago: PaymentState,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleDetailDto {
    pub id: i64,
    pub turno_caja_id: i64,
    pub cliente_id: Option<i64>,
    pub cliente_nombre_completo: Option<String>,
    pub cliente_numero_documento: Option<String>,
    pub usuario_vendedor_id: i64,
    pub usuario_vendedor_username: String,
    pub subtotal: Decimal,
    pub descuento: Decimal,
    pub total_venta: Decimal,
    pub monto_pagado_efectivo: Decimal,
    pub monto_pagado_digital: Decimal,
    pub saldo_credito_generado: Decimal,
    pub estado_venta: SaleState,
    pub tachado_por_usuario_id: Option<i64>,
    pub tachado_por_username: Option<String>,
    pub fecha_tachado: Option<String>,
    pub motivo_tachado: Option<String>,
    pub resuelto_por_admin_id: Option<i64>,
    pub resuelto_por_admin_username: Option<String>,
    pub fecha_resolucion_tachado: Option<String>,
    pub nota_resolucion_tachado: Option<String>,
    pub notas: Option<String>,
    pub created_at: String,
    pub items: Vec<SaleItemDetailDto>,
    pub pagos: Vec<PaymentDetailDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleListItemDto {
    pub id: i64,
    pub turno_caja_id: i64,
    pub cliente_nombre_completo: Option<String>,
    pub total_venta: Decimal,
    pub monto_pagado_efectivo: Decimal,
    pub monto_pagado_digital: Decimal,
    pub saldo_credito_generado: Decimal,
    pub estado_venta: SaleState,
    pub usuario_vendedor_username: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct SaleFilter {
    #[serde(alias = "turnoCajaId")]
    pub turno_caja_id: Option<i64>,
    #[serde(alias = "clienteId")]
    pub cliente_id: Option<i64>,
    #[serde(alias = "estadoVenta")]
    pub estado_venta: Option<SaleState>,
    #[serde(alias = "fechaDesde")]
    pub fecha_desde: Option<String>,
    #[serde(alias = "fechaHasta")]
    pub fecha_hasta: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct StrikeSaleInput {
    #[serde(alias = "motivoTachado")]
    pub motivo_tachado: String,
}

#[derive(Debug, Deserialize)]
pub struct ResolveStruckSaleInput {
    pub accion: ResolveStruckAction,
    #[serde(alias = "notaResolucion")]
    pub nota_resolucion: Option<String>,
}

// ============================================================================
// DTOs Y MODELOS DE CRÉDITOS Y MEMBRESÍAS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientCreditDto {
    pub id: i64,
    pub cliente_id: i64,
    pub cliente_nombre_completo: String,
    pub cliente_numero_documento: String,
    pub cliente_telefono: Option<String>,
    pub venta_origen_id: Option<i64>,
    pub origen_credito: CreditOrigin,
    pub descripcion: String,
    pub monto_total: Decimal,
    pub monto_pagado: Decimal,
    pub saldo_pendiente: Decimal,
    pub estado: CreditState,
    pub registrado_por_usuario_id: i64,
    pub registrado_por_username: String,
    pub fecha_emision: String,
    pub fecha_ultimo_pago: Option<String>,
    pub notas: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct ClientCreditFilter {
    #[serde(alias = "clienteId")]
    pub cliente_id: Option<i64>,
    pub estado: Option<CreditState>,
    #[serde(alias = "origenCredito")]
    pub origen_credito: Option<CreditOrigin>,
    #[serde(alias = "soloConDeuda")]
    pub solo_con_deuda: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientMembershipDto {
    pub id: i64,
    pub cliente_id: i64,
    pub cliente_nombre_completo: String,
    pub plan_id: i64,
    pub plan_nombre: String,
    pub venta_id: Option<i64>,
    pub fecha_inicio: String,
    pub fecha_vencimiento: String,
    pub precio_pactado: Decimal,
    pub estado: ClientMembershipState,
    pub dias_restantes: i64,
    pub permite_recuperacion_dias: bool,
    pub registrado_por_usuario_id: i64,
    pub registrado_por_username: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize, Default)]
pub struct ClientMembershipFilter {
    #[serde(alias = "clienteId")]
    pub cliente_id: Option<i64>,
    #[serde(alias = "planId")]
    pub plan_id: Option<i64>,
    pub estado: Option<ClientMembershipState>,
    #[serde(alias = "soloActivas")]
    pub solo_activas: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}
