use crate::errors::AppError;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

// ============================================================================
// ENUMS DE CATÁLOGO E INVENTARIO
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlanType {
    PaseDiario,
    Mensualidad,
    #[serde(alias = "MEMBRESIA_MESES")]
    MembresiaMeses,
}

impl PlanType {
    pub fn as_str(&self) -> &'static str {
        match self {
            PlanType::PaseDiario => "PASE_DIARIO",
            PlanType::Mensualidad | PlanType::MembresiaMeses => "MENSUALIDAD",
        }
    }
}

impl std::fmt::Display for PlanType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for PlanType {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "PASE_DIARIO" => Ok(PlanType::PaseDiario),
            "MENSUALIDAD" | "MEMBRESIA_MESES" => Ok(PlanType::Mensualidad),
            other => Err(AppError::Validation(format!(
                "Tipo de plan inválido: '{}'. Debe ser PASE_DIARIO o MENSUALIDAD.",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProductCategory {
    Bebidas,
    Suplementos,
    Accesorios,
    Snacks,
    Otros,
}

impl ProductCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProductCategory::Bebidas => "BEBIDAS",
            ProductCategory::Suplementos => "SUPLEMENTOS",
            ProductCategory::Accesorios => "ACCESORIOS",
            ProductCategory::Snacks => "SNACKS",
            ProductCategory::Otros => "OTROS",
        }
    }
}

impl std::fmt::Display for ProductCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for ProductCategory {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "BEBIDAS" => Ok(ProductCategory::Bebidas),
            "SUPLEMENTOS" => Ok(ProductCategory::Suplementos),
            "ACCESORIOS" => Ok(ProductCategory::Accesorios),
            "SNACKS" => Ok(ProductCategory::Snacks),
            "OTROS" => Ok(ProductCategory::Otros),
            other => Err(AppError::Validation(format!(
                "Categoría inválida: '{}'. Debe ser BEBIDAS, SUPLEMENTOS, ACCESORIOS, SNACKS u OTROS.",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InventoryMovementType {
    StockInicial,
    EntradaAjuste,
    EntradaCompra,
    SalidaVenta,
    MermaDanio,
    MermaVencimiento,
    ConsumoPropio,
    ReversionTachado,
    // Variantes / alias directos
    Merma,
    ConsumoInterno,
    AjustePositivo,
    AjusteNegativo,
}

impl InventoryMovementType {
    pub fn as_str(&self) -> &'static str {
        match self {
            InventoryMovementType::StockInicial => "STOCK_INICIAL",
            InventoryMovementType::EntradaAjuste => "ENTRADA_AJUSTE",
            InventoryMovementType::EntradaCompra => "ENTRADA_COMPRA",
            InventoryMovementType::SalidaVenta => "SALIDA_VENTA",
            InventoryMovementType::MermaDanio => "MERMA_DANIO",
            InventoryMovementType::MermaVencimiento => "MERMA_VENCIMIENTO",
            InventoryMovementType::ConsumoPropio => "CONSUMO_PROPIO",
            InventoryMovementType::ReversionTachado => "REVERSION_TACHADO",
            InventoryMovementType::Merma => "MERMA",
            InventoryMovementType::ConsumoInterno => "CONSUMO_INTERNO",
            InventoryMovementType::AjustePositivo => "AJUSTE_POSITIVO",
            InventoryMovementType::AjusteNegativo => "AJUSTE_NEGATIVO",
        }
    }

    pub fn default_sign(&self) -> &'static str {
        match self {
            InventoryMovementType::StockInicial
            | InventoryMovementType::EntradaAjuste
            | InventoryMovementType::EntradaCompra
            | InventoryMovementType::ReversionTachado
            | InventoryMovementType::AjustePositivo => "+",
            InventoryMovementType::SalidaVenta
            | InventoryMovementType::MermaDanio
            | InventoryMovementType::MermaVencimiento
            | InventoryMovementType::ConsumoPropio
            | InventoryMovementType::Merma
            | InventoryMovementType::ConsumoInterno
            | InventoryMovementType::AjusteNegativo => "-",
        }
    }
}

impl std::fmt::Display for InventoryMovementType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for InventoryMovementType {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "STOCK_INICIAL" => Ok(InventoryMovementType::StockInicial),
            "ENTRADA_AJUSTE" => Ok(InventoryMovementType::EntradaAjuste),
            "ENTRADA_COMPRA" => Ok(InventoryMovementType::EntradaCompra),
            "SALIDA_VENTA" => Ok(InventoryMovementType::SalidaVenta),
            "MERMA_DANIO" => Ok(InventoryMovementType::MermaDanio),
            "MERMA_VENCIMIENTO" => Ok(InventoryMovementType::MermaVencimiento),
            "CONSUMO_PROPIO" => Ok(InventoryMovementType::ConsumoPropio),
            "REVERSION_TACHADO" => Ok(InventoryMovementType::ReversionTachado),
            "MERMA" => Ok(InventoryMovementType::Merma),
            "CONSUMO_INTERNO" => Ok(InventoryMovementType::ConsumoInterno),
            "AJUSTE_POSITIVO" => Ok(InventoryMovementType::AjustePositivo),
            "AJUSTE_NEGATIVO" => Ok(InventoryMovementType::AjusteNegativo),
            other => Err(AppError::Validation(format!(
                "Tipo de movimiento de inventario inválido: '{}'.",
                other
            ))),
        }
    }
}

// ============================================================================
// DTOs Y MODELOS DE PLANES
// ============================================================================

#[derive(Debug, Clone, Deserialize, Default)]
pub struct PlanFilter {
    pub search: Option<String>,
    #[serde(alias = "busqueda")]
    pub busqueda: Option<String>,
    pub tipo_plan: Option<PlanType>,
    pub solo_activos: Option<bool>,
}

pub type ListPlansFilter = PlanFilter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanListItem {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub tipo_plan: PlanType,
    pub duracion_meses: u32,
    pub precio_base: Decimal,
    pub permite_recuperacion_dias: bool,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub type PlanDto = PlanListItem;

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePlanInput {
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub tipo_plan: PlanType,
    pub duracion_meses: u32,
    #[serde(alias = "precio")]
    pub precio_base: Decimal,
    pub permite_recuperacion_dias: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePlanInput {
    pub nombre: String,
    pub descripcion: Option<String>,
    #[serde(alias = "precio")]
    pub precio_base: Decimal,
    pub permite_recuperacion_dias: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanExpirationPreview {
    pub fecha_inicio: String,
    #[serde(default)]
    pub fecha_inicio_evaluada: Option<String>,
    pub fecha_vencimiento_date: String,
    pub fecha_vencimiento_timestamp: String,
    pub fecha_vencimiento: String,
    pub dias_totales: i64,
    pub hubo_desbordamiento: bool,
    pub dias_desbordamiento: u32,
    #[serde(default)]
    pub dias_overflow_aplicados: Option<u32>,
    pub es_bisiesto_destino: bool,
    pub explicacion: String,
    #[serde(default)]
    pub nota_explicativa: Option<String>,
    pub formula_aplicada: String,
}

pub type PlanExpirationPreviewDto = PlanExpirationPreview;

// ============================================================================
// DTOs Y MODELOS DE PRODUCTOS
// ============================================================================

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ProductFilter {
    pub search: Option<String>,
    #[serde(alias = "busqueda")]
    pub busqueda: Option<String>,
    pub categoria: Option<ProductCategory>,
    pub solo_activos: Option<bool>,
    #[serde(alias = "solo_alerta_stock")]
    pub solo_stock_bajo: Option<bool>,
}

pub type ListProductsFilter = ProductFilter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductListItem {
    pub id: i64,
    pub codigo_sku: String,
    pub nombre: String,
    pub categoria: ProductCategory,
    pub unidad_medida: String,
    pub precio_compra_referencial: Decimal,
    pub precio_venta: Decimal,
    pub stock_actual: i64,
    pub stock_minimo: i64,
    pub alerta_stock_bajo: bool,
    pub proveedor_preferido_id: Option<i64>,
    pub proveedor_nombre: Option<String>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub type ProductDto = ProductListItem;

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProductInput {
    #[serde(alias = "codigo_barras")]
    pub codigo_sku: String,
    pub nombre: String,
    pub categoria: ProductCategory,
    pub unidad_medida: Option<String>,
    #[serde(alias = "costo_referencial")]
    pub precio_compra_referencial: Option<Decimal>,
    #[serde(alias = "costo_unitario")]
    pub costo_unitario: Option<Decimal>,
    #[serde(alias = "precio")]
    pub precio_venta: Decimal,
    #[serde(alias = "stock_actual")]
    pub stock_inicial: Option<i64>,
    pub stock_minimo: Option<i64>,
    pub proveedor_preferido_id: Option<i64>,
}

impl CreateProductInput {
    pub fn costo_referencial(&self) -> Decimal {
        self.costo_unitario
            .or(self.precio_compra_referencial)
            .unwrap_or(Decimal::ZERO)
    }

    pub fn stock_inicial_val(&self) -> i64 {
        self.stock_inicial.unwrap_or(0)
    }

    pub fn stock_minimo_val(&self) -> i64 {
        self.stock_minimo.unwrap_or(5)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProductInput {
    #[serde(alias = "codigo_barras")]
    pub codigo_sku: Option<String>,
    pub nombre: String,
    pub categoria: ProductCategory,
    pub unidad_medida: Option<String>,
    #[serde(alias = "costo_referencial")]
    pub precio_compra_referencial: Option<Decimal>,
    #[serde(alias = "costo_unitario")]
    pub costo_unitario: Option<Decimal>,
    #[serde(alias = "precio")]
    pub precio_venta: Decimal,
    pub stock_minimo: i64,
    pub proveedor_preferido_id: Option<i64>,
}

impl UpdateProductInput {
    pub fn costo_referencial(&self) -> Decimal {
        self.costo_unitario
            .or(self.precio_compra_referencial)
            .unwrap_or(Decimal::ZERO)
    }
}

// ============================================================================
// DTOs Y MODELOS DE MOVIMIENTOS DE INVENTARIO Y MERMAS
// ============================================================================

#[derive(Debug, Clone, Deserialize, Default)]
pub struct InventoryMovementFilter {
    pub producto_id: Option<i64>,
    pub tipo_movimiento: Option<InventoryMovementType>,
    #[serde(alias = "fecha_desde")]
    pub desde: Option<String>,
    #[serde(alias = "fecha_hasta")]
    pub hasta: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub type ListInventoryMovementsFilter = InventoryMovementFilter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryMovementItem {
    pub id: i64,
    pub producto_id: i64,
    pub producto_sku: String,
    pub producto_nombre: String,
    pub tipo_movimiento: InventoryMovementType,
    pub signo: String,
    pub cantidad: i64,
    pub stock_anterior: i64,
    pub stock_resultante: i64,
    pub costo_unitario_momento: Decimal,
    pub motivo_justificacion: String,
    pub registrado_por_usuario_id: i64,
    pub registrado_por_username: String,
    pub created_at: String,
}

pub type InventoryMovementDto = InventoryMovementItem;

#[derive(Debug, Clone, Deserialize)]
pub struct RecordInventoryMovementInput {
    pub producto_id: i64,
    pub tipo_movimiento: InventoryMovementType,
    pub cantidad: i64,
    #[serde(alias = "costo_unitario")]
    pub costo_unitario_momento: Option<Decimal>,
    #[serde(alias = "motivo")]
    #[serde(alias = "justificacion")]
    pub motivo_justificacion: String,
}
