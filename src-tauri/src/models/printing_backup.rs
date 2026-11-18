use rust_decimal::Decimal;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;
use std::str::FromStr;

/// Tipo formal de comprobante emitido
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReceiptType {
    NotaVenta,
    Boleta,
    Factura,
}

impl ReceiptType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotaVenta => "NOTA_VENTA",
            Self::Boleta => "BOLETA",
            Self::Factura => "FACTURA",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::NotaVenta => "NOTA DE VENTA",
            Self::Boleta => "BOLETA DE VENTA",
            Self::Factura => "FACTURA COMERCIAL",
        }
    }
}

impl FromStr for ReceiptType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "NOTA_VENTA" | "NOTA DE VENTA" | "NV" => Ok(Self::NotaVenta),
            "BOLETA" | "BOLETA DE VENTA" | "BOL" => Ok(Self::Boleta),
            "FACTURA" | "FACTURA COMERCIAL" | "FAC" => Ok(Self::Factura),
            other => Err(format!("Tipo de comprobante inválido: {}", other)),
        }
    }
}

impl fmt::Display for ReceiptType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Ancho de bobina para impresión térmica (58mm = 32 cols, 80mm = 48 cols)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrinterWidth {
    Width58mm,
    Width80mm,
}

impl PrinterWidth {
    pub fn columns(&self) -> usize {
        match self {
            Self::Width58mm => 32,
            Self::Width80mm => 48,
        }
    }

    pub fn mm(&self) -> u16 {
        match self {
            Self::Width58mm => 58,
            Self::Width80mm => 80,
        }
    }

    pub fn from_mm(mm: u16) -> Self {
        if mm == 58 {
            Self::Width58mm
        } else {
            Self::Width80mm
        }
    }
}

impl Serialize for PrinterWidth {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Width58mm => serializer.serialize_u16(58),
            Self::Width80mm => serializer.serialize_u16(80),
        }
    }
}

impl<'de> Deserialize<'de> for PrinterWidth {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = PrinterWidth;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("un entero (58 o 80) o una cadena ('58' o '80')")
            }

            fn visit_u64<E>(self, value: u64) -> Result<PrinterWidth, E>
            where
                E: serde::de::Error,
            {
                match value {
                    58 => Ok(PrinterWidth::Width58mm),
                    80 => Ok(PrinterWidth::Width80mm),
                    _ => Err(E::custom(format!("Ancho de papel no soportado: {}mm. Use 58 o 80", value))),
                }
            }

            fn visit_i64<E>(self, value: i64) -> Result<PrinterWidth, E>
            where
                E: serde::de::Error,
            {
                self.visit_u64(value as u64)
            }

            fn visit_str<E>(self, value: &str) -> Result<PrinterWidth, E>
            where
                E: serde::de::Error,
            {
                match value.trim() {
                    "58" => Ok(PrinterWidth::Width58mm),
                    "80" => Ok(PrinterWidth::Width80mm),
                    _ => Err(E::custom(format!("Ancho de papel no soportado: '{}'. Use '58' o '80'", value))),
                }
            }
        }

        deserializer.deserialize_any(Visitor)
    }
}

/// Modo de despacho o conexión con la impresora
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PrinterConnectionMode {
    VirtualPreview,
    NetworkTcp,
    WindowsRaw,
}

impl FromStr for PrinterConnectionMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "VIRTUAL_PREVIEW" | "PREVIEW" | "VIRTUAL" => Ok(Self::VirtualPreview),
            "NETWORK_TCP" | "TCP" | "NETWORK" => Ok(Self::NetworkTcp),
            "WINDOWS_RAW" | "RAW" | "SPOOLER" => Ok(Self::WindowsRaw),
            other => Err(format!("Modo de conexión de impresora desconocido: {}", other)),
        }
    }
}

impl PrinterConnectionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::VirtualPreview => "VIRTUAL_PREVIEW",
            Self::NetworkTcp => "NETWORK_TCP",
            Self::WindowsRaw => "WINDOWS_RAW",
        }
    }
}

/// Tipología de respaldo de base de datos
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BackupType {
    LocalAuto,
    LocalManual,
    Exportacion,
    GoogleDrive,
}

impl FromStr for BackupType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "LOCAL_AUTO" => Ok(Self::LocalAuto),
            "LOCAL_MANUAL" => Ok(Self::LocalManual),
            "EXPORTACION" => Ok(Self::Exportacion),
            "GOOGLE_DRIVE" => Ok(Self::GoogleDrive),
            other => Err(format!("Tipo de respaldo desconocido: {}", other)),
        }
    }
}

impl BackupType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::LocalAuto => "LOCAL_AUTO",
            Self::LocalManual => "LOCAL_MANUAL",
            Self::Exportacion => "EXPORTACION",
            Self::GoogleDrive => "GOOGLE_DRIVE",
        }
    }
}

/// Estado del registro de respaldo
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BackupStatus {
    Completado,
    SincronizadoCloud,
    Fallido,
}

impl FromStr for BackupStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "COMPLETADO" => Ok(Self::Completado),
            "SINCRONIZADO_CLOUD" => Ok(Self::SincronizadoCloud),
            "FALLIDO" => Ok(Self::Fallido),
            other => Err(format!("Estado de respaldo desconocido: {}", other)),
        }
    }
}

impl BackupStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Completado => "COMPLETADO",
            Self::SincronizadoCloud => "SINCRONIZADO_CLOUD",
            Self::Fallido => "FALLIDO",
        }
    }
}

/// Registro de serie documental activa
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptSeries {
    pub id: i64,
    pub tipo_comprobante: ReceiptType,
    pub serie: String,
    pub correlativo_actual: i64,
    pub descripcion: Option<String>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Solicitud de actualización de serie
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReceiptSeriesRequest {
    #[serde(alias = "serieId", alias = "id")]
    pub serie_id: i64,
    pub descripcion: Option<String>,
    #[serde(alias = "estadoActivo")]
    pub estado_activo: bool,
}

/// Comprobante formal emitido en base de datos
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssuedReceipt {
    pub id: i64,
    pub venta_id: i64,
    pub serie_id: i64,
    pub tipo_comprobante: ReceiptType,
    pub serie: String,
    pub correlativo: i64,
    pub numero_formateado: String,
    pub receptor_tipo_doc: String,
    pub receptor_numero_doc: String,
    pub receptor_razon_nombre: String,
    pub receptor_direccion: Option<String>,
    pub moneda: String,
    pub total_comprobante: Decimal,
    pub hash_verificacion: String,
    pub emitido_por_usuario_id: i64,
    pub fecha_emision: String,
    pub created_at: String,
}

/// Petición para emitir un comprobante formal a partir de una venta POS
#[derive(Debug, Clone, Deserialize)]
pub struct IssueReceiptRequest {
    #[serde(alias = "ventaId", alias = "sale_id", alias = "saleId")]
    pub venta_id: i64,
    #[serde(alias = "tipoComprobante", alias = "receipt_type")]
    pub tipo_comprobante: ReceiptType,
    #[serde(default, alias = "receptorTipoDoc")]
    pub receptor_tipo_doc: Option<String>,
    #[serde(default, alias = "receptorNumeroDoc")]
    pub receptor_numero_doc: Option<String>,
    #[serde(default, alias = "receptorRazonNombre")]
    pub receptor_razon_nombre: Option<String>,
    #[serde(default, alias = "receptorDireccion")]
    pub receptor_direccion: Option<String>,
}

/// Snapshot completo de datos necesarios para renderizar un comprobante
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptSnapshotData {
    pub comprobante: IssuedReceipt,
    pub estado_venta: String, // "COMPLETADA", "TACHADA_EN_TURNO", "ANULADA_DEFINITIVA"
    pub empresa_nombre_comercial: String,
    pub empresa_razon_social: String,
    pub empresa_ruc: String,
    pub empresa_direccion: String,
    pub empresa_telefono: String,
    pub usuario_vendedor_nombre: String,
    pub subtotal: Decimal,
    pub descuento: Decimal,
    pub total_venta: Decimal,
    pub items: Vec<ReceiptItemSnapshot>,
    pub pagos: Vec<ReceiptPaymentSnapshot>,
    pub mensaje_pie: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptItemSnapshot {
    pub cantidad: i64,
    pub descripcion: String,
    pub precio_unitario: Decimal,
    pub subtotal: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptPaymentSnapshot {
    pub metodo_pago: String,
    pub canal_caja: String,
    pub monto: Decimal,
    pub referencia_operacion: Option<String>,
}

/// Solicitud de impresión o vista previa de ticket térmico
#[derive(Debug, Clone, Deserialize)]
pub struct PrintTicketRequest {
    #[serde(alias = "ventaId", alias = "sale_id", alias = "saleId")]
    pub venta_id: i64,
    #[serde(default, alias = "forcedWidthMm")]
    pub forced_width_mm: Option<u16>, // 58 u 80
    #[serde(default, alias = "openDrawerOverride")]
    pub open_drawer_override: Option<bool>,
}

/// Resultado de la operación de ticket térmico
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintTicketResult {
    pub raw_escpos_base64: String,
    pub formatted_text: String,
    pub width_columns: usize,
    pub width_mm: u16,
    pub is_simulated: bool,
    pub target_mode: PrinterConnectionMode,
    pub message: String,
}

/// Resultado genérico de PDF generado dinámicamente en RAM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratePdfResult {
    pub filename: String,
    pub pdf_base64: String,
    pub size_bytes: usize,
    pub sha256_hash: String,
}

/// Solicitud de PDF para Reporte Financiero (Slice 7)
#[derive(Debug, Clone, Deserialize)]
pub struct GenerateFinancialReportPdfRequest {
    #[serde(default, alias = "fechaDesde", alias = "start_date", alias = "startDate")]
    pub fecha_desde: String,
    #[serde(default, alias = "fechaHasta", alias = "end_date", alias = "endDate")]
    pub fecha_hasta: String,
    #[serde(default, alias = "canalFiltro", alias = "channel_filter")]
    pub canal_filtro: Option<String>, // "FISICA", "DIGITAL", "MIXTA"
}

/// Solicitud de despacho de comprobante por correo electrónico
#[derive(Debug, Clone, Deserialize)]
pub struct SendReceiptEmailRequest {
    #[serde(alias = "ventaId", alias = "sale_id", alias = "saleId")]
    pub venta_id: i64,
    #[serde(alias = "destinatarioEmail", alias = "email")]
    pub destinatario_email: String,
    #[serde(default, alias = "mensajeAdicional")]
    pub mensaje_adicional: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendEmailResult {
    pub success: bool,
    pub message: String,
    pub was_simulated: bool,
}

/// Registro de auditoría del historial de respaldos
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecord {
    pub id: i64,
    pub tipo_respaldo: BackupType,
    pub nombre_archivo: String,
    pub ruta_local: String,
    pub tamano_bytes: i64,
    pub sha256_checksum: String,
    pub drive_file_id: Option<String>,
    pub estado: BackupStatus,
    pub mensaje_detalle: Option<String>,
    pub ejecutado_por_usuario_id: Option<i64>,
    pub created_at: String,
}

/// Resultado del análisis de integridad de un archivo de base de datos
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupIntegrityReport {
    pub is_valid: bool,
    pub integrity_message: String,
    pub found_tables_count: usize,
    pub missing_core_tables: Vec<String>,
    pub file_size_bytes: u64,
    pub sha256_checksum: String,
}

/// Solicitud de restauración de base de datos desde ruta local o bytes base64
#[derive(Debug, Clone, Default, Deserialize)]
pub struct RestoreDatabaseRequest {
    #[serde(default, alias = "sourcePath")]
    pub source_path: Option<String>,
    #[serde(default, alias = "fileBytesBase64")]
    pub file_bytes_base64: Option<String>,
    #[serde(default, alias = "fileName")]
    pub file_name: Option<String>,
}

/// Resultado de la restauración atómica de base de datos
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreDatabaseResult {
    pub success: bool,
    pub restored_from: String,
    pub sha256_checksum: String,
    pub file_size_bytes: u64,
    pub pre_restore_backup_path: Option<String>,
    pub found_tables_count: usize,
    pub requires_relogin: bool,
    pub message: String,
}

/// Configuración integral de impresión y respaldos para la interfaz de usuario
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintingBackupConfigDto {
    pub empresa_nombre_comercial: String,
    pub empresa_razon_social: String,
    pub empresa_ruc: String,
    pub empresa_direccion: String,
    pub empresa_telefono: String,
    pub printer_paper_width_mm: u16,
    pub printer_connection_mode: PrinterConnectionMode,
    pub printer_target_address: String,
    pub printer_open_drawer_on_cash: bool,
    pub printer_footer_message: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_from_email: String,
    pub smtp_enabled: bool,
    pub backup_auto_interval_hours: u32,
    pub backup_gdrive_enabled: bool,
    pub backup_gdrive_folder_id: String,
    pub has_smtp_password_configured: bool,
    pub has_gdrive_token_configured: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePrintingBackupConfigRequest {
    pub empresa_nombre_comercial: Option<String>,
    pub empresa_razon_social: Option<String>,
    pub empresa_ruc: Option<String>,
    pub empresa_direccion: Option<String>,
    pub empresa_telefono: Option<String>,
    pub printer_paper_width_mm: Option<u16>,
    pub printer_connection_mode: Option<PrinterConnectionMode>,
    pub printer_target_address: Option<String>,
    pub printer_open_drawer_on_cash: Option<bool>,
    pub printer_footer_message: Option<String>,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<u16>,
    pub smtp_user: Option<String>,
    pub smtp_from_email: Option<String>,
    pub smtp_enabled: Option<bool>,
    pub smtp_password: Option<String>,
    pub backup_auto_interval_hours: Option<u32>,
    pub backup_gdrive_enabled: Option<bool>,
    pub backup_gdrive_folder_id: Option<String>,
    pub backup_gdrive_token: Option<String>,
}
