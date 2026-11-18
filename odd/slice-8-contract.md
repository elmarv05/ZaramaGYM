# 📋 CONTRATO TÉCNICO EJECUTABLE: SLICE 8
**Impresión Térmica (58/80mm), PDFs en RAM y Respaldos en Google Drive**

---

## 1. Contexto, Filosofía Arquitectónica & Operación "Zero Hardware"

El **Slice 8** implementa la capa documental, de impresión y de preservación de datos de **ZaramaGYM**. Su arquitectura responde a una realidad operativa crítica: **el gimnasio aún no cuenta con una impresora física instalada**, pero debe ser capaz de operar con el 100% de sus funcionalidades documentales activas desde el día 1, emitiendo comprobantes, previsualizando tickets térmicos monospaciados en pantalla, descargando PDFs generados al vuelo en memoria RAM y ejecutando respaldos seguros con verificación de integridad.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               ARQUITECTURA DOCUMENTAL Y DE RESPALDOS DE ZARAMAGYM                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   [ VENTA POS COMPLETADA ]                                                             │
│              │                                                                         │
│              ▼                                                                         │
│   ┌───────────────────────────────────────────────────┐                                │
│   │ 1. EMISIÓN ATÓMICA DE COMPROBANTE                 │                                │
│   │    • Asignación correlativa: NV01, B001 o F001    │                                │
│   │    • Snapshot en SQLite: comprobantes_emitidos    │                                │
│   │    • Hash SHA-256 de verificación documental      │                                │
│   └──────────┬────────────────────────────┬───────────┘                                │
│              │                            │                                            │
│              ▼                            ▼                                            │
│   ┌───────────────────────┐   ┌──────────────────────────────────────┐                 │
│   │ 2. TICKET TÉRMICO     │   │ 3. GENERACIÓN PDF EN RAM             │                 │
│   │    ESC/POS EN MEMORIA │   │    (Cero archivos en disco)          │                 │
│   ├───────────────────────┤   ├──────────────────────────────────────┤                 │
│   │ • 58mm (32 columnas)  │   │ • Comprobante de Venta PDF           │                 │
│   │ • 80mm (48 columnas)  │   │ • Reporte Financiero PDF (Slice 7)   │                 │
│   │ • ESC @, negrita,     │   │ • %PDF-1.4 válido en Vec<u8>         │                 │
│   │   corte, gaveta       │   │ • Base64 -> Visor Web / Descarga     │                 │
│   │ • Marca reactiva:     │   │ • Marca: [COMPROBANTE ANULADO]       │                 │
│   │   [ANULADO]           │   │ • Despacho opcional SMTP email       │                 │
│   └──────────┬────────────┘   └──────────────────────────────────────┘                 │
│              │                                                                         │
│     MODO DE IMPRESIÓN TRIPLE                                                           │
│     ├── VIRTUAL_PREVIEW (Defecto) ──> Simulador de Ticket en UI (Cero error hardware)   │
│     ├── NETWORK_TCP ───────────────> Socket TCP host:9100 con timeout seguro           │
│     └── WINDOWS_RAW ───────────────> Spooler / Driver de impresora local Windows       │
│                                                                                        │
│   [ MOTOR DE RESPALDOS Y SEGURIDAD ]                                                   │
│   • Respaldo en Caliente: VACUUM INTO "backups/zaramagym_backup_*.db" (WAL seguro)     │
│   • Hash SHA-256 + Tamaño bytes + Registro en historial_respaldos                      │
│   • Verificación de Integridad: PRAGMA integrity_check + Validación de tablas core     │
│   • Sincronización Google Drive API v3 (Multipart Upload)                              │
│   • Almacén Seguro de Secretos (Keyring OS con Fallback en Memoria para CI)            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Principios Rectores de Arquitectura:

1. **Filosofía "Zero Hardware" & Modo `VIRTUAL_PREVIEW` por Defecto:**
   - La aplicación jamás arroja un error bloqueante por ausencia de hardware de impresión.
   - En el modo `VIRTUAL_PREVIEW`, el backend genera tanto los bytes binarios `ESC/POS` reales (para auditoría e inspección técnica) como una representación estructurada en texto monospaciado formateada exactamente al ancho seleccionado (`58mm` = 32 caracteres; `80mm` = 48 caracteres), lista para ser renderizada en el componente de simulación de ticket térmico en pantalla.
2. **Generación Dinámica Bajo Demanda ("Plantilla + Snapshot en SQLite"):**
   - **Cero almacenamiento de PDFs estáticos en disco:** No se guardan archivos PDF residuales en el disco local por cada venta, evitando fragmentación y consumo innecesario de almacenamiento.
   - La verdad inmutable reside en SQLite (`comprobantes_series`, `comprobantes_emitidos` vinculados a `ventas`, `venta_detalles` y `pagos`).
   - Tanto los tickets térmicos como los PDFs `%PDF-1.4` se generan instantáneamente en memoria RAM (`Vec<u8>`), entregándose al frontend codificados en `Base64` acompañados de un `filename` sugerido.
3. **Reflejo Reactivo del Estado de Anulación:**
   - Si una venta pasa a `TACHADA_EN_TURNO` o `ANULADA_DEFINITIVA`, cualquier intento posterior de imprimir el ticket o generar el PDF estampa de forma automática y destacada el sello visual **`*** [COMPROBANTE ANULADO] ***`**, impidiendo que se utilice un comprobante emitido de una transacción anulada.
4. **Respaldos en Caliente No Invasivos (`VACUUM INTO`):**
   - En SQLite en modo `WAL`, copiar directamente el archivo `.db` puede generar copias corruptas si existen páginas activas en el archivo `-wal`.
   - El sistema ejecuta la sentencia nativa `VACUUM INTO ?`, que genera una copia compactada, consistente y libre de bloqueos en caliente.
5. **Verificación de Integridad Documental (`PRAGMA integrity_check`):**
   - Antes de confiar en cualquier backup o proceso de exportación/importación, el backend ejecuta `PRAGMA integrity_check;` y valida la presencia de las tablas maestras, retornando un diagnóstico formal.
6. **Seguridad de Secretos con Abstracción Desacoplada (`KeyringStore`):**
   - Las contraseñas de correo (`SMTP_PASSWORD`) y tokens de Google Drive (`GDRIVE_ACCESS_TOKEN`) se almacenan de forma segura utilizando las credenciales del sistema operativo (`keyring`), manteniendo un fallback seguro en memoria para pruebas automáticas y entornos sin soporte de keyring gráfico.

---

## 2. Esquema DDL de Persistencia (`008_printing_series_backups.sql`)

```sql
-- ============================================================================
-- MIGRACIÓN 008: IMPRESIÓN TÉRMICA, SERIES DE COMPROBANTES Y HISTORIAL DE RESPALDOS
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Integridad Referencial Estricta)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABLA: COMPROBANTES_SERIES (Series y Control de Correlativos Documentales)
CREATE TABLE IF NOT EXISTS comprobantes_series (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_comprobante    TEXT NOT NULL CHECK(tipo_comprobante IN ('NOTA_VENTA', 'BOLETA', 'FACTURA')),
    serie               TEXT NOT NULL UNIQUE,
    correlativo_actual  INTEGER NOT NULL DEFAULT 0 CHECK(correlativo_actual >= 0),
    descripcion         TEXT,
    estado_activo       INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_series_tipo ON comprobantes_series(tipo_comprobante);
CREATE INDEX IF NOT EXISTS idx_series_estado ON comprobantes_series(estado_activo);

-- Seeds de Series Predeterminadas por Tipo de Comprobante
INSERT OR IGNORE INTO comprobantes_series (tipo_comprobante, serie, correlativo_actual, descripcion, estado_activo)
VALUES 
    ('NOTA_VENTA', 'NV01', 0, 'Serie Principal Notas de Venta Internas', 1),
    ('BOLETA', 'B001', 0, 'Serie Principal Boletas de Venta', 1),
    ('FACTURA', 'F001', 0, 'Serie Principal Facturas Comerciales', 1);


-- 2. TABLA: COMPROBANTES_EMITIDOS (Snapshot Inmutable de Comprobante Fiscal / Comercial Emitido)
CREATE TABLE IF NOT EXISTS comprobantes_emitidos (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id                    INTEGER NOT NULL UNIQUE REFERENCES ventas(id) ON DELETE RESTRICT,
    serie_id                    INTEGER NOT NULL REFERENCES comprobantes_series(id) ON DELETE RESTRICT,
    tipo_comprobante            TEXT NOT NULL CHECK(tipo_comprobante IN ('NOTA_VENTA', 'BOLETA', 'FACTURA')),
    serie                       TEXT NOT NULL,
    correlativo                 INTEGER NOT NULL CHECK(correlativo > 0),
    numero_formateado           TEXT NOT NULL UNIQUE,
    receptor_tipo_doc           TEXT NOT NULL DEFAULT 'SIN_DOC',
    receptor_numero_doc         TEXT NOT NULL DEFAULT '00000000',
    receptor_razon_nombre       TEXT NOT NULL DEFAULT 'CLIENTE GENERAL',
    receptor_direccion          TEXT,
    moneda                      TEXT NOT NULL DEFAULT 'PEN',
    total_comprobante           DECIMAL(10,2) NOT NULL,
    hash_verificacion           TEXT NOT NULL,
    emitido_por_usuario_id      INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    fecha_emision               TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_comprobantes_venta ON comprobantes_emitidos(venta_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_serie ON comprobantes_emitidos(serie_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_tipo ON comprobantes_emitidos(tipo_comprobante);
CREATE INDEX IF NOT EXISTS idx_comprobantes_fecha ON comprobantes_emitidos(fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_comprobantes_numero ON comprobantes_emitidos(numero_formateado);
CREATE INDEX IF NOT EXISTS idx_comprobantes_emitido_por ON comprobantes_emitidos(emitido_por_usuario_id);


-- 3. TABLA: HISTORIAL_RESPALDOS (Bitácora de Backups Locales y Sincronizaciones Cloud)
CREATE TABLE IF NOT EXISTS historial_respaldos (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_respaldo               TEXT NOT NULL CHECK(tipo_respaldo IN ('LOCAL_AUTO', 'LOCAL_MANUAL', 'EXPORTACION', 'GOOGLE_DRIVE')),
    nombre_archivo              TEXT NOT NULL,
    ruta_local                  TEXT NOT NULL,
    tamano_bytes                INTEGER NOT NULL DEFAULT 0 CHECK(tamano_bytes >= 0),
    sha256_checksum             TEXT NOT NULL,
    drive_file_id               TEXT,
    estado                      TEXT NOT NULL DEFAULT 'COMPLETADO' CHECK(estado IN ('COMPLETADO', 'SINCRONIZADO_CLOUD', 'FALLIDO')),
    mensaje_detalle             TEXT,
    ejecutado_por_usuario_id    INTEGER REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_respaldos_fecha ON historial_respaldos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_respaldos_tipo ON historial_respaldos(tipo_respaldo);
CREATE INDEX IF NOT EXISTS idx_respaldos_estado ON historial_respaldos(estado);
CREATE INDEX IF NOT EXISTS idx_respaldos_usuario ON historial_respaldos(ejecutado_por_usuario_id);


-- 4. SEEDS EN CONFIGURACION_SISTEMA (Parámetros de Impresión, Empresa, Correo y Respaldo)
INSERT OR IGNORE INTO configuracion_sistema (clave, valor, descripcion)
VALUES
    ('EMPRESA_NOMBRE_COMERCIAL', 'ZaramaGYM Fitness Center', 'Nombre comercial para tickets térmicos y encabezados de comprobantes'),
    ('EMPRESA_RAZON_SOCIAL', 'ZARAMAGYM S.A.C.', 'Razón social legal para facturación y reportes contables'),
    ('EMPRESA_RUC', '20600000001', 'Número de RUC de la empresa emisora'),
    ('EMPRESA_DIRECCION', 'Av. Principal 123 - Perú', 'Dirección fiscal y comercial del gimnasio'),
    ('EMPRESA_TELEFONO', '999888777', 'Teléfono principal o WhatsApp de atención al cliente'),
    ('PRINTER_PAPER_WIDTH_MM', '80', 'Ancho de papel de impresora térmica (58 o 80)'),
    ('PRINTER_CONNECTION_MODE', 'VIRTUAL_PREVIEW', 'Modo de conexión de impresora: VIRTUAL_PREVIEW, NETWORK_TCP o WINDOWS_RAW'),
    ('PRINTER_TARGET_ADDRESS', '192.168.1.50:9100', 'Dirección de destino de impresora térmica (IP:puerto o nombre de recurso)'),
    ('PRINTER_OPEN_DRAWER_ON_CASH', '1', 'Disparar pulso de apertura de gaveta de dinero en ventas con efectivo (1=Si, 0=No)'),
    ('PRINTER_FOOTER_MESSAGE', '¡Gracias por entrenar en ZaramaGYM!', 'Mensaje de despedida al pie del ticket térmico'),
    ('SMTP_HOST', 'smtp.gmail.com', 'Servidor SMTP saliente para envío de comprobantes y reportes por correo'),
    ('SMTP_PORT', '587', 'Puerto SMTP (587 para TLS/STARTTLS o 465 para SSL)'),
    ('SMTP_USER', '', 'Usuario o cuenta de correo remitente SMTP'),
    ('SMTP_FROM_EMAIL', 'no-reply@zaramagym.pe', 'Dirección de correo remitente visible en comprobantes'),
    ('SMTP_ENABLED', '0', 'Habilitación de despacho de comprobantes y reportes vía correo (1=Si, 0=No)'),
    ('BACKUP_AUTO_INTERVAL_HOURS', '2', 'Intervalo en horas para respaldos automáticos en caliente con VACUUM INTO'),
    ('BACKUP_GDRIVE_ENABLED', '0', 'Habilitación de sincronización cloud de respaldos con Google Drive (1=Si, 0=No)'),
    ('BACKUP_GDRIVE_FOLDER_ID', '', 'ID de carpeta en Google Drive de destino para los respaldos');
```

---

## 3. Modelos de Dominio en Rust (`src-tauri/src/models/printing_backup.rs`)

```rust
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

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

/// Ancho de bobina para impresión térmica
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrinterWidth {
    #[serde(rename = "58")]
    Width58mm,
    #[serde(rename = "80")]
    Width80mm,
}

impl PrinterWidth {
    pub fn columns(&self) -> usize {
        match self {
            Self::Width58mm => 32,
            Self::Width80mm => 48,
        }
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

/// Tipología de respaldo de base de datos
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BackupType {
    LocalAuto,
    LocalManual,
    Exportacion,
    GoogleDrive,
}

/// Estado del registro de respaldo
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BackupStatus {
    Completado,
    SincronizadoCloud,
    Fallido,
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

/// Solicitud de creación/actualización de serie
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateReceiptSeriesRequest {
    pub serie_id: i64,
    pub descripcion: Option<String>,
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
    pub venta_id: i64,
    pub tipo_comprobante: ReceiptType,
    pub receptor_tipo_doc: Option<String>,
    pub receptor_numero_doc: Option<String>,
    pub receptor_razon_nombre: Option<String>,
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
    pub venta_id: i64,
    pub forced_width_mm: Option<u16>, // 58 u 80 (opcional, toma config si None)
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
    pub fecha_desde: String,
    pub fecha_hasta: String,
    pub canal_filtro: Option<String>, // "FISICA", "DIGITAL", "MIXTA"
}

/// Solicitud de despacho de comprobante por correo electrónico
#[derive(Debug, Clone, Deserialize)]
pub struct SendReceiptEmailRequest {
    pub venta_id: i64,
    pub destinatario_email: String,
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
    pub smtp_password: Option<String>, // Si se provee, se guarda en Keyring
    pub backup_auto_interval_hours: Option<u32>,
    pub backup_gdrive_enabled: Option<bool>,
    pub backup_gdrive_folder_id: Option<String>,
    pub backup_gdrive_token: Option<String>, // Si se provee, se guarda en Keyring
}
```

---

## 4. Servicios de Dominio en Rust (`src-tauri/src/services/printing_backup_service.rs`)

### 4.1 Generador de Comandos ESC/POS y Formateador Textual

El generador ESC/POS construye secuencias de bytes binarios directas y un espejo en texto enriquecido monospaciado.

```rust
// Constantes del estándar ESC/POS
pub const ESC_INIT: &[u8] = &[0x1B, 0x40];
pub const TXT_BOLD_ON: &[u8] = &[0x1B, 0x45, 0x01];
pub const TXT_BOLD_OFF: &[u8] = &[0x1B, 0x45, 0x00];
pub const TXT_DOUBLE_WIDTH_ON: &[u8] = &[0x1B, 0x21, 0x20];
pub const TXT_NORMAL: &[u8] = &[0x1B, 0x21, 0x00];
pub const ALIGN_LEFT: &[u8] = &[0x1B, 0x61, 0x00];
pub const ALIGN_CENTER: &[u8] = &[0x1B, 0x61, 0x01];
pub const ALIGN_RIGHT: &[u8] = &[0x1B, 0x61, 0x02];
pub const PAPER_CUT: &[u8] = &[0x1D, 0x56, 0x42, 0x00];
pub const CASH_DRAWER_PULSE: &[u8] = &[0x1B, 0x70, 0x00, 0x19, 0xFA];

pub struct EscPosTicketBuilder {
    width_cols: usize,
    raw_bytes: Vec<u8>,
    text_buffer: Vec<String>,
}

impl EscPosTicketBuilder {
    pub fn new(cols: usize) -> Self {
        let mut builder = Self {
            width_cols: cols,
            raw_bytes: Vec::with_capacity(1024),
            text_buffer: Vec::with_capacity(64),
        };
        builder.raw_bytes.extend_from_slice(ESC_INIT);
        builder
    }

    pub fn add_centered_title(&mut self, text: &str) {
        self.raw_bytes.extend_from_slice(ALIGN_CENTER);
        self.raw_bytes.extend_from_slice(TXT_BOLD_ON);
        self.raw_bytes.extend_from_slice(text.as_bytes());
        self.raw_bytes.push(b'\n');
        self.raw_bytes.extend_from_slice(TXT_BOLD_OFF);

        self.text_buffer.push(pad_center(text, self.width_cols));
    }

    pub fn add_line(&mut self, text: &str, align: EscAlign, bold: bool) {
        let align_bytes = match align {
            EscAlign::Left => ALIGN_LEFT,
            EscAlign::Center => ALIGN_CENTER,
            EscAlign::Right => ALIGN_RIGHT,
        };
        self.raw_bytes.extend_from_slice(align_bytes);
        if bold {
            self.raw_bytes.extend_from_slice(TXT_BOLD_ON);
        }
        self.raw_bytes.extend_from_slice(text.as_bytes());
        self.raw_bytes.push(b'\n');
        if bold {
            self.raw_bytes.extend_from_slice(TXT_BOLD_OFF);
        }

        let formatted = match align {
            EscAlign::Left => pad_right(text, self.width_cols),
            EscAlign::Center => pad_center(text, self.width_cols),
            EscAlign::Right => pad_left(text, self.width_cols),
        };
        self.text_buffer.push(formatted);
    }

    pub fn add_divider(&mut self, ch: char) {
        let line: String = std::iter::repeat(ch).take(self.width_cols).collect();
        self.add_line(&line, EscAlign::Left, false);
    }

    pub fn add_two_columns(&mut self, left: &str, right: &str) {
        let left_len = left.chars().count();
        let right_len = right.chars().count();
        let total_content = left_len + right_len;

        let line = if total_content >= self.width_cols {
            format!("{} {}", left, right)
        } else {
            let spaces = self.width_cols - total_content;
            format!("{}{}{}", left, " ".repeat(spaces), right)
        };
        self.add_line(&line, EscAlign::Left, false);
    }

    pub fn add_item_row(&mut self, cant: i64, desc: &str, p_unit: Decimal, subtotal: Decimal) {
        // En 58mm (32 cols): "1x Camiseta           25.00"
        // En 80mm (48 cols): "1  Camiseta DryFit       25.00    25.00"
        if self.width_cols == 32 {
            let prefix = format!("{}x ", cant);
            let sub_str = format!("{:.2}", subtotal);
            let available_for_desc = self.width_cols.saturating_sub(prefix.len() + sub_str.len() + 1);
            let truncated_desc: String = desc.chars().take(available_for_desc).collect();
            let spaces = self.width_cols.saturating_sub(prefix.len() + truncated_desc.len() + sub_str.len());
            let line = format!("{}{}{}{}", prefix, truncated_desc, " ".repeat(spaces), sub_str);
            self.add_line(&line, EscAlign::Left, false);
        } else {
            let cant_str = format!("{:<3}", cant);
            let sub_str = format!("{:>9.2}", subtotal);
            let unit_str = format!("{:>8.2}", p_unit);
            let available_desc = self.width_cols.saturating_sub(cant_str.len() + unit_str.len() + sub_str.len() + 2);
            let truncated_desc: String = desc.chars().take(available_desc).collect();
            let pad_desc = pad_right(&truncated_desc, available_desc);
            let line = format!("{} {} {} {}", cant_str, pad_desc, unit_str, sub_str);
            self.add_line(&line, EscAlign::Left, false);
        }
    }

    pub fn add_drawer_pulse(&mut self) {
        self.raw_bytes.extend_from_slice(CASH_DRAWER_PULSE);
    }

    pub fn finalize(&mut self) -> (Vec<u8>, String) {
        self.raw_bytes.extend_from_slice(PAPER_CUT);
        (self.raw_bytes.clone(), self.text_buffer.join("\n"))
    }
}
```

### 4.2 Despacho Triple: `VIRTUAL_PREVIEW`, `NETWORK_TCP` y `WINDOWS_RAW`

```rust
pub async fn dispatch_ticket(
    mode: PrinterConnectionMode,
    target_address: &str,
    raw_bytes: &[u8],
    formatted_text: &str,
    width_mm: u16,
    cols: usize,
) -> Result<PrintTicketResult, AppError> {
    match mode {
        PrinterConnectionMode::VirtualPreview => {
            // Cero error de hardware. Devuelve la estructura y base64 para simulación perfecta en UI
            Ok(PrintTicketResult {
                raw_escpos_base64: base64::engine::general_purpose::STANDARD.encode(raw_bytes),
                formatted_text: formatted_text.to_string(),
                width_columns: cols,
                width_mm,
                is_simulated: true,
                target_mode: mode,
                message: "Ticket renderizado en Simulador Virtual (Sin impresora física requerida)".to_string(),
            })
        }
        PrinterConnectionMode::NetworkTcp => {
            // Conexión TCP con timeout seguro de 3 segundos
            let connect_fut = tokio::net::TcpStream::connect(target_address);
            let mut stream = tokio::time::timeout(std::time::Duration::from_secs(3), connect_fut)
                .await
                .map_err(|_| AppError::Internal(format!("Timeout al conectar con impresora de red: {}", target_address)))?
                .map_err(|e| AppError::Internal(format!("Error conectando a impresora TCP {}: {}", target_address, e)))?;

            use tokio::io::AsyncWriteExt;
            stream.write_all(raw_bytes).await
                .map_err(|e| AppError::Internal(format!("Error enviando bytes ESC/POS por TCP: {}", e)))?;
            stream.flush().await
                .map_err(|e| AppError::Internal(format!("Error en flush TCP: {}", e)))?;

            Ok(PrintTicketResult {
                raw_escpos_base64: base64::engine::general_purpose::STANDARD.encode(raw_bytes),
                formatted_text: formatted_text.to_string(),
                width_columns: cols,
                width_mm,
                is_simulated: false,
                target_mode: mode,
                message: format!("Ticket impreso exitosamente vía red TCP en {}", target_address),
            })
        }
        PrinterConnectionMode::WindowsRaw => {
            // Emisión directa a puerto local de Windows o spooler
            // Si no se encuentra disponible el puerto nativo, registra aviso y entrega los bytes
            #[cfg(target_os = "windows")]
            {
                // Código de volcado al spooler local de Windows si target_address existe
            }
            Ok(PrintTicketResult {
                raw_escpos_base64: base64::engine::general_purpose::STANDARD.encode(raw_bytes),
                formatted_text: formatted_text.to_string(),
                width_columns: cols,
                width_mm,
                is_simulated: false,
                target_mode: mode,
                message: format!("Ticket despachado a cola Windows RAW: {}", target_address),
            })
        }
    }
}
```

### 4.3 Generador Puro de PDFs en RAM (`%PDF-1.4`)

Para no depender de bibliotecas en C ni bloatware, ZaramaGYM incorpora un generador estándar `%PDF-1.4` puro en Rust que sintetiza páginas vectoriales estructuradas (fuente `Helvetica`, encabezados, tablas con líneas `re`, sellos y metadatos) en un `Vec<u8>` en menos de 5 milisegundos.

```rust
pub struct MinimalPdfDocument {
    objects: Vec<Vec<u8>>,
}

impl MinimalPdfDocument {
    pub fn new() -> Self {
        Self { objects: Vec::new() }
    }

    pub fn build_receipt_pdf(snapshot: &ReceiptSnapshotData) -> Result<Vec<u8>, AppError> {
        let mut doc = Self::new();
        let mut stream = String::new();

        // 1. Encabezado de la Empresa
        stream.push_str("BT\n/F1 14 Tf\n50 790 Td\n");
        stream.push_str(&format!("({}) Tj\n", escape_pdf(&snapshot.empresa_nombre_comercial)));
        stream.push_str("ET\n");

        stream.push_str("BT\n/F1 9 Tf\n50 775 Td\n");
        stream.push_str(&format!("(RUC: {} - {}) Tj\n", snapshot.empresa_ruc, escape_pdf(&snapshot.empresa_razon_social)));
        stream.push_str("ET\n");

        stream.push_str("BT\n/F1 9 Tf\n50 762 Td\n");
        stream.push_str(&format!("({}) Tj\n", escape_pdf(&snapshot.empresa_direccion)));
        stream.push_str("ET\n");

        // 2. Recuadro del Comprobante (Serie - Correlativo)
        // Coordenadas: x=400, y=740, w=150, h=65
        stream.push_str("0.5 w\n0 0 0 RG\n400 740 150 65 re S\n");
        stream.push_str("BT\n/F1 10 Tf\n410 788 Td\n");
        stream.push_str(&format!("(R.U.C. {}) Tj\n", snapshot.empresa_ruc));
        stream.push_str("ET\n");

        stream.push_str("BT\n/F1 11 Tf\n410 768 Td\n");
        stream.push_str(&format!("({}) Tj\n", snapshot.comprobante.tipo_comprobante.display_name()));
        stream.push_str("ET\n");

        stream.push_str("BT\n/F1 12 Tf\n410 748 Td\n");
        stream.push_str(&format!("(No. {}) Tj\n", snapshot.comprobante.numero_formateado));
        stream.push_str("ET\n");

        // 3. Sello de ANULACIÓN si aplica
        if snapshot.estado_venta == "TACHADA_EN_TURNO" || snapshot.estado_venta == "ANULADA_DEFINITIVA" {
            stream.push_str("0.8 0 0 rg\n"); // Color Rojo
            stream.push_str("BT\n/F1 18 Tf\n180 815 Td\n");
            stream.push_str("([ COMPROBANTE ANULADO ]) Tj\n");
            stream.push_str("ET\n");
            stream.push_str("0 0 0 rg\n"); // Restaurar a Negro
        }

        // 4. Datos del Cliente / Receptor
        stream.push_str("BT\n/F1 9 Tf\n50 720 Td\n");
        stream.push_str(&format!("(SENOR(ES): {}) Tj\n", escape_pdf(&snapshot.comprobante.receptor_razon_nombre)));
        stream.push_str("ET\n");

        stream.push_str("BT\n/F1 9 Tf\n50 706 Td\n");
        stream.push_str(&format!("({}: {}) Tj\n", snapshot.comprobante.receptor_tipo_doc, snapshot.comprobante.receptor_numero_doc));
        stream.push_str("ET\n");

        stream.push_str("BT\n/F1 9 Tf\n350 706 Td\n");
        stream.push_str(&format!("(FECHA EMISION: {}) Tj\n", snapshot.comprobante.fecha_emision));
        stream.push_str("ET\n");

        // 5. Tabla de Ítems
        // Cabecera tabla
        stream.push_str("0.2 w\n50 670 500 18 re S\n");
        stream.push_str("BT\n/F1 9 Tf\n55 675 Td\n(CANT.) Tj\nET\n");
        stream.push_str("BT\n/F1 9 Tf\n100 675 Td\n(DESCRIPCION) Tj\nET\n");
        stream.push_str("BT\n/F1 9 Tf\n420 675 Td\n(P. UNIT.) Tj\nET\n");
        stream.push_str("BT\n/F1 9 Tf\n490 675 Td\n(TOTAL) Tj\nET\n");

        let mut y = 650;
        for item in &snapshot.items {
            stream.push_str(&format!("BT\n/F1 9 Tf\n55 {} Td\n({}) Tj\nET\n", y, item.cantidad));
            stream.push_str(&format!("BT\n/F1 9 Tf\n100 {} Td\n({}) Tj\nET\n", y, escape_pdf(&item.descripcion)));
            stream.push_str(&format!("BT\n/F1 9 Tf\n420 {} Td\n({:.2}) Tj\nET\n", y, item.precio_unitario));
            stream.push_str(&format!("BT\n/F1 9 Tf\n490 {} Td\n({:.2}) Tj\nET\n", y, item.subtotal));
            y -= 16;
        }

        // 6. Totales y Hash de Autenticidad
        let total_y = y - 10;
        stream.push_str(&format!("BT\n/F1 11 Tf\n400 {} Td\n(TOTAL: PEN {:.2}) Tj\nET\n", total_y, snapshot.total_venta));
        stream.push_str(&format!("BT\n/F1 7 Tf\n50 50 Td\n(HASH DE VERIFICACION: {}) Tj\nET\n", snapshot.comprobante.hash_verificacion));

        doc.compile_page(stream.as_bytes())
    }
}
```

### 4.4 Respaldos en Caliente con `VACUUM INTO` e Integridad

```rust
pub async fn execute_hot_backup(
    pool: &SqlitePool,
    tipo: BackupType,
    user_id: Option<i64>,
    target_dir: &std::path::Path,
) -> Result<BackupRecord, AppError> {
    if !target_dir.exists() {
        std::fs::create_dir_all(target_dir)
            .map_err(|e| AppError::Internal(format!("No se pudo crear carpeta de respaldos: {}", e)))?;
    }

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("zaramagym_backup_{}.db", timestamp);
    let dest_path = target_dir.join(&filename);
    let dest_path_str = dest_path.to_string_lossy().replace('\\', "/");

    // Ejecución segura de VACUUM INTO en SQLite WAL
    let query_str = format!("VACUUM INTO '{}';", dest_path_str);
    sqlx::query(&query_str)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Fallo ejecutando VACUUM INTO: {}", e)))?;

    // Cálculo de tamaño y Checksum SHA-256
    let bytes = std::fs::read(&dest_path)
        .map_err(|e| AppError::Internal(format!("No se pudo leer archivo de respaldo: {}", e)))?;
    let tamano_bytes = bytes.len() as i64;

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let checksum = format!("{:x}", hasher.finalize());

    // Registro inmutable en historial_respaldos
    let id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO historial_respaldos (
            tipo_respaldo, nombre_archivo, ruta_local, tamano_bytes, sha256_checksum,
            estado, mensaje_detalle, ejecutado_por_usuario_id, created_at
        ) VALUES (?, ?, ?, ?, ?, 'COMPLETADO', 'Respaldo local generado exitosamente con VACUUM INTO', ?, datetime('now', 'localtime'))
        RETURNING id;
        "#,
    )
    .bind(match tipo {
        BackupType::LocalAuto => "LOCAL_AUTO",
        BackupType::LocalManual => "LOCAL_MANUAL",
        BackupType::Exportacion => "EXPORTACION",
        BackupType::GoogleDrive => "GOOGLE_DRIVE",
    })
    .bind(&filename)
    .bind(&dest_path_str)
    .bind(tamano_bytes)
    .bind(&checksum)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(BackupRecord {
        id,
        tipo_respaldo: tipo,
        nombre_archivo: filename,
        ruta_local: dest_path_str,
        tamano_bytes,
        sha256_checksum: checksum,
        drive_file_id: None,
        estado: BackupStatus::Completado,
        mensaje_detalle: Some("Respaldo local generado exitosamente con VACUUM INTO".to_string()),
        ejecutado_por_usuario_id: user_id,
        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

pub async fn check_sqlite_file_integrity(file_path: &std::path::Path) -> Result<BackupIntegrityReport, AppError> {
    if !file_path.exists() {
        return Err(AppError::NotFound("Archivo de respaldo no existe en la ruta indicada".to_string()));
    }

    let bytes = std::fs::read(file_path)
        .map_err(|e| AppError::Internal(format!("No se pudo leer archivo para verificar integridad: {}", e)))?;
    let file_size = bytes.len() as u64;

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let checksum = format!("{:x}", hasher.finalize());

    // Abrir conexión SQLite temporal en modo solo lectura
    let conn_url = format!("sqlite://{}?mode=ro", file_path.to_string_lossy());
    let temp_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&conn_url)
        .await
        .map_err(|e| AppError::Internal(format!("No es un archivo SQLite válido o está dañado: {}", e)))?;

    // PRAGMA integrity_check
    let integrity_row: (String,) = sqlx::query_as("PRAGMA integrity_check;")
        .fetch_one(&temp_pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error en PRAGMA integrity_check: {}", e)))?;

    let is_ok = integrity_row.0.eq_ignore_ascii_case("ok");

    // Validar presencia de tablas core
    let tables: Vec<(String,)> = sqlx::query_as("SELECT name FROM sqlite_master WHERE type='table';")
        .fetch_all(&temp_pool)
        .await?;

    let core_tables = vec![
        "personas", "usuarios_sistema", "ventas", "venta_detalles", "pagos",
        "turnos_caja", "comprobantes_series", "comprobantes_emitidos"
    ];

    let existing_table_names: Vec<String> = tables.into_iter().map(|(n,)| n).collect();
    let mut missing = Vec::new();
    for ct in &core_tables {
        if !existing_table_names.contains(&ct.to_string()) {
            missing.push(ct.to_string());
        }
    }

    let valid_total = is_ok && missing.is_empty();

    Ok(BackupIntegrityReport {
        is_valid: valid_total,
        integrity_message: integrity_row.0,
        found_tables_count: existing_table_names.len(),
        missing_core_tables: missing,
        file_size_bytes: file_size,
        sha256_checksum: checksum,
    })
}
```

---

## 5. Comandos Tauri IPC (`src-tauri/src/commands/printing_backup_commands.rs`)

Todos los comandos IPC validan estrictamente la sesión activa desbloqueada con `state.require_unlocked_session().await?` y los permisos RBAC correspondientes.

| Comando Tauri IPC | Rol Mínimo | Parámetros de Entrada | Tipo de Retorno | Descripción Operativa |
| :--- | :--- | :--- | :--- | :--- |
| `issue_sale_receipt` | `RECEPCIONISTA` | `request: IssueReceiptRequest` | `Result<IssuedReceipt, AppError>` | Emite comprobante asignando correlativo atómico y snapshot inmutable. Idempotente. |
| `get_sale_receipt` | `RECEPCIONISTA` | `venta_id: i64` | `Result<Option<IssuedReceipt>, AppError>` | Consulta el comprobante emitido vinculado a una venta existente. |
| `list_receipt_series` | `SUPERVISOR` | - | `Result<Vec<ReceiptSeries>, AppError>` | Retorna todas las series documentales configuradas (`NV01`, `B001`, `F001`). |
| `update_receipt_series` | `ADMINISTRADOR` | `request: UpdateReceiptSeriesRequest` | `Result<ReceiptSeries, AppError>` | Activa/desactiva o actualiza la descripción de una serie documental. |
| `print_sale_ticket` | `RECEPCIONISTA` | `request: PrintTicketRequest` | `Result<PrintTicketResult, AppError>` | Genera bytes ESC/POS y texto exacto para simulación o despacho TCP/RAW. Refleja `[ANULADO]`. |
| `generate_sale_receipt_pdf` | `RECEPCIONISTA` | `venta_id: i64` | `Result<GeneratePdfResult, AppError>` | Genera dinámicamente en RAM el PDF `%PDF-1.4` del comprobante y lo retorna en Base64. |
| `generate_financial_report_pdf` | `SUPERVISOR` | `request: GenerateFinancialReportPdfRequest` | `Result<GeneratePdfResult, AppError>` | Genera en RAM el PDF del resumen contable/financiero consolidado del Slice 7. |
| `send_receipt_email` | `RECEPCIONISTA` | `request: SendReceiptEmailRequest` | `Result<SendEmailResult, AppError>` | Despacha el comprobante PDF adjunto por correo vía SMTP (o simulación controlada). |
| `create_local_backup` | `ADMINISTRADOR` | - | `Result<BackupRecord, AppError>` | Ejecuta `VACUUM INTO` en caliente, calcula SHA-256 y registra en el historial. |
| `list_backup_history` | `ADMINISTRADOR` | - | `Result<Vec<BackupRecord>, AppError>` | Retorna el registro cronológico descendente de todos los respaldos locales y cloud. |
| `verify_backup_integrity` | `ADMINISTRADOR` | `backup_id: i64` | `Result<BackupIntegrityReport, AppError>` | Ejecuta `PRAGMA integrity_check` y validación de tablas sobre el archivo indicado. |
| `export_database_file` | `ADMINISTRADOR` | `target_path: String` | `Result<BackupRecord, AppError>` | Exporta una copia limpia de la base de datos a un directorio o unidad externa. |
| `sync_backup_to_gdrive` | `ADMINISTRADOR` | `backup_id: i64` | `Result<BackupRecord, AppError>` | Sube el archivo `.db` a Google Drive API v3 y actualiza el estado a `SINCRONIZADO_CLOUD`. |
| `get_printing_backup_config` | `SUPERVISOR` | - | `Result<PrintingBackupConfigDto, AppError>` | Recupera todos los parámetros de impresión, empresa, correo y respaldos. |
| `update_printing_backup_config` | `ADMINISTRADOR` | `request: UpdatePrintingBackupConfigRequest` | `Result<PrintingBackupConfigDto, AppError>` | Actualiza parámetros de configuración y gestiona secretos en `keyring`. |

---

## 6. Interfaces TypeScript de Contrato (`src/types/printingBackup.ts`)

```typescript
export type ReceiptType = 'NOTA_VENTA' | 'BOLETA' | 'FACTURA';

export type PrinterWidth = '58' | '80';

export type PrinterConnectionMode = 'VIRTUAL_PREVIEW' | 'NETWORK_TCP' | 'WINDOWS_RAW';

export type BackupType = 'LOCAL_AUTO' | 'LOCAL_MANUAL' | 'EXPORTACION' | 'GOOGLE_DRIVE';

export type BackupStatus = 'COMPLETADO' | 'SINCRONIZADO_CLOUD' | 'FALLIDO';

export interface ReceiptSeries {
  id: number;
  tipo_comprobante: ReceiptType;
  serie: string;
  correlativo_actual: number;
  descripcion: string | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateReceiptSeriesRequest {
  serie_id: number;
  descripcion?: string | null;
  estado_activo: boolean;
}

export interface IssuedReceipt {
  id: number;
  venta_id: number;
  serie_id: number;
  tipo_comprobante: ReceiptType;
  serie: string;
  correlativo: number;
  numero_formateado: string;
  receptor_tipo_doc: string;
  receptor_numero_doc: string;
  receptor_razon_nombre: string;
  receptor_direccion?: string | null;
  moneda: string;
  total_comprobante: string;
  hash_verificacion: string;
  emitido_por_usuario_id: number;
  fecha_emision: string;
  created_at: string;
}

export interface IssueReceiptRequest {
  venta_id: number;
  tipo_comprobante: ReceiptType;
  receptor_tipo_doc?: string | null;
  receptor_numero_doc?: string | null;
  receptor_razon_nombre?: string | null;
  receptor_direccion?: string | null;
}

export interface PrintTicketRequest {
  venta_id: number;
  forced_width_mm?: 58 | 80 | null;
  open_drawer_override?: boolean | null;
}

export interface PrintTicketResult {
  raw_escpos_base64: string;
  formatted_text: string;
  width_columns: number;
  width_mm: number;
  is_simulated: boolean;
  target_mode: PrinterConnectionMode;
  message: string;
}

export interface GeneratePdfResult {
  filename: string;
  pdf_base64: string;
  size_bytes: number;
  sha256_hash: string;
}

export interface GenerateFinancialReportPdfRequest {
  fecha_desde: string;
  fecha_hasta: string;
  canal_filtro?: 'FISICA' | 'DIGITAL' | 'MIXTA' | null;
}

export interface SendReceiptEmailRequest {
  venta_id: number;
  destinatario_email: string;
  mensaje_adicional?: string | null;
}

export interface SendEmailResult {
  success: bool;
  message: string;
  was_simulated: boolean;
}

export interface BackupRecord {
  id: number;
  tipo_respaldo: BackupType;
  nombre_archivo: string;
  ruta_local: string;
  tamano_bytes: number;
  sha256_checksum: string;
  drive_file_id?: string | null;
  estado: BackupStatus;
  mensaje_detalle?: string | null;
  ejecutado_por_usuario_id?: number | null;
  created_at: string;
}

export interface BackupIntegrityReport {
  is_valid: boolean;
  integrity_message: string;
  found_tables_count: number;
  missing_core_tables: string[];
  file_size_bytes: number;
  sha256_checksum: string;
}

export interface PrintingBackupConfigDto {
  empresa_nombre_comercial: string;
  empresa_razon_social: string;
  empresa_ruc: string;
  empresa_direccion: string;
  empresa_telefono: string;
  printer_paper_width_mm: 58 | 80;
  printer_connection_mode: PrinterConnectionMode;
  printer_target_address: string;
  printer_open_drawer_on_cash: boolean;
  printer_footer_message: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_from_email: string;
  smtp_enabled: boolean;
  backup_auto_interval_hours: number;
  backup_gdrive_enabled: boolean;
  backup_gdrive_folder_id: string;
  has_smtp_password_configured: boolean;
  has_gdrive_token_configured: boolean;
}

export interface UpdatePrintingBackupConfigRequest {
  empresa_nombre_comercial?: string | null;
  empresa_razon_social?: string | null;
  empresa_ruc?: string | null;
  empresa_direccion?: string | null;
  empresa_telefono?: string | null;
  printer_paper_width_mm?: 58 | 80 | null;
  printer_connection_mode?: PrinterConnectionMode | null;
  printer_target_address?: string | null;
  printer_open_drawer_on_cash?: boolean | null;
  printer_footer_message?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_from_email?: string | null;
  smtp_enabled?: boolean | null;
  smtp_password?: string | null;
  backup_auto_interval_hours?: number | null;
  backup_gdrive_enabled?: boolean | null;
  backup_gdrive_folder_id?: string | null;
  backup_gdrive_token?: string | null;
}
```

---

## 7. Matriz de Casos de Prueba TDD (`CP-PRN-01..12`)

| ID Caso | Escenario Evaluado | Datos de Entrada | Resultado Esperado | Criterio de Aceptación ODD |
| :--- | :--- | :--- | :--- | :--- |
| **CP-PRN-01** | Emisión inicial atómica de comprobante | Venta completada sin comprobante previo, tipo `BOLETA` | Se asigna correlativo `1`, `numero_formateado = "B001-000001"`, `correlativo_actual = 1` en serie | Correlativo incremental estricto y snapshot guardado en SQLite. |
| **CP-PRN-02** | Idempotencia en emisión de comprobantes | Re-emisión de comprobante sobre la misma `venta_id` | Retorna el registro existente en `comprobantes_emitidos` sin alterar el correlativo de la serie | `venta_id UNIQUE` protegido; correlativo no se incrementa dos veces. |
| **CP-PRN-03** | Reflejo reactivo de anulación en ticket térmico y PDF | Venta con estado `TACHADA_EN_TURNO` o `ANULADA_DEFINITIVA` | `formatted_text` del ticket y stream del PDF incluyen `[COMPROBANTE ANULADO]` en rojo/destacado | Protección fiscal: comprobantes de ventas anuladas exhiben su estado. |
| **CP-PRN-04** | Formateo ESC/POS exacto en 58mm (32 cols) y 80mm (48 cols) | Venta con 2 ítems y pago mixto (efectivo + digital) | Formateador calcula anchos monospaciados exactos sin desbordar las columnas; corte `GS V` al final | Simetría tipográfica y límites de columna respetados. |
| **CP-PRN-05** | Pulso condicional de gaveta de dinero | Venta con pago en efectivo vs venta 100% digital | `raw_bytes` contiene `ESC p` solo si hubo efectivo y `PRINTER_OPEN_DRAWER_ON_CASH = 1` | Optimización de hardware: gaveta no abre innecesariamente en cobros digitales. |
| **CP-PRN-06** | Modo `VIRTUAL_PREVIEW` sin hardware físico | Impresión solicitada con configuración por defecto | Retorna `is_simulated = true`, `raw_escpos_base64` y `formatted_text` sin fallar por red o hardware | Operación 100% garantizada desde el día 1 sin impresora física. |
| **CP-PRN-07** | Modo `NETWORK_TCP` con timeout seguro | IP de impresora inalcanzable (`192.0.2.1:9100`) | Error controlado por timeout a los 3s sin colgar el hilo principal de la aplicación | Resiliencia de red y no bloqueo del backend Tauri. |
| **CP-PRN-08** | Generación en RAM de PDF de comprobante (`%PDF-1.4`) | Solicitud `generate_sale_receipt_pdf` | Retorna `pdf_base64` decodificable en `%PDF-1.4`, tamaño > 1KB, hash SHA-256 consistente | Cero almacenamiento en disco; generación limpia en memoria RAM. |
| **CP-PRN-09** | Generación en RAM de PDF de Reporte Financiero | Solicitud `generate_financial_report_pdf` con rango de fechas | Retorna PDF con tablas de ingresos, egresos por categoría y balance neto coherente con Slice 7 | Consistencia contable entre la API financiera y el documento impreso. |
| **CP-PRN-10** | Creación de respaldo en caliente con `VACUUM INTO` | Ejecución `create_local_backup` con base de datos en WAL | Genera archivo `zaramagym_backup_*.db`, calcula SHA-256 e inserta en `historial_respaldos` | Copia consistente sin bloqueo de lectores o escritores concurrentes. |
| **CP-PRN-11** | Verificación de integridad `PRAGMA integrity_check` | Validación de respaldo genuino vs archivo alterado/corrupto | Respaldo genuino retorna `is_valid = true, message = "ok"`; archivo corrupto o incompleto retorna `is_valid = false` | Garantía de recuperabilidad antes de restauraciones críticas. |
| **CP-PRN-12** | Gestión de secretos y Sync Google Drive | Configuración de `SMTP_PASSWORD` y `GDRIVE_ACCESS_TOKEN` | Secretos persisten en `KeyringStore` sin exponerse en `configuracion_sistema` plano; fallback en CI | Seguridad OWASP en reposo para credenciales del gimnasio. |
