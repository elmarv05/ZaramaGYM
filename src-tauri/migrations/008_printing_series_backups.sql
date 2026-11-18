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
