-- ============================================================================
-- MIGRACIÓN 005: CONTROL DE ASISTENCIAS, SEMÁFORO, EXTENSIONES Y CONFIGURACIÓN
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Integridad Referencial Estricta)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABLA: CONFIGURACION_SISTEMA (Parámetros Dinámicos Globales del Gimnasio)
CREATE TABLE IF NOT EXISTS configuracion_sistema (
    clave           TEXT PRIMARY KEY,
    valor           TEXT NOT NULL,
    descripcion     TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Seed de Parámetros de Operación por Defecto
INSERT OR IGNORE INTO configuracion_sistema (clave, valor, descripcion)
VALUES
    ('DIAS_ALERTA_AMARILLO', '5', 'Umbral de días calendario para alerta de vencimiento en semáforo amarillo'),
    ('MINUTOS_ANTIREBOTE_QR', '3', 'Ventana de minutos para ignorar lecturas duplicadas consecutivas del mismo cliente'),
    ('PRECIO_PASE_DIARIO_CREDITO_DEFAULT', '10.00', 'Precio por defecto para pase diario a crédito otorgado desde semáforo rojo');


-- 2. TABLA: ASISTENCIAS (Bitácora Operacional de Ingresos al Gimnasio)
CREATE TABLE IF NOT EXISTS asistencias (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id                  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    membresia_id                INTEGER REFERENCES membresias_clientes(id) ON DELETE RESTRICT,
    fecha_hora_ingreso          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    modo_ingreso                TEXT NOT NULL CHECK(modo_ingreso IN (
        'QR_LOCAL',
        'QR_MOVIL_LAN',
        'MANUAL_OLVIDO_QR',
        'PASE_DIARIO_CREDITO_ROJO'
    )),
    color_semaforo              TEXT NOT NULL CHECK(color_semaforo IN ('VERDE', 'AMARILLO', 'ROJO')),
    motivo_semaforo             TEXT NOT NULL,
    dias_restantes_momento      INTEGER,
    deuda_pendiente_momento     DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK(CAST(deuda_pendiente_momento AS REAL) >= 0),
    credito_generado_id         INTEGER REFERENCES creditos_clientes(id) ON DELETE RESTRICT,
    registrado_por_usuario_id   INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    notas                       TEXT,
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_asistencias_cliente ON asistencias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_membresia ON asistencias(membresia_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_color ON asistencias(color_semaforo);
CREATE INDEX IF NOT EXISTS idx_asistencias_modo ON asistencias(modo_ingreso);
CREATE INDEX IF NOT EXISTS idx_asistencias_fecha_hora ON asistencias(fecha_hora_ingreso DESC);
CREATE INDEX IF NOT EXISTS idx_asistencias_rebote ON asistencias(cliente_id, fecha_hora_ingreso DESC);


-- 3. TABLA: EXTENSIONES_MEMBRESIA (Historial de Recuperación Justificada de Días)
CREATE TABLE IF NOT EXISTS extensiones_membresia (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    membresia_id                INTEGER NOT NULL REFERENCES membresias_clientes(id) ON DELETE RESTRICT,
    cliente_id                  INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    dias_otorgados              INTEGER NOT NULL CHECK(dias_otorgados >= 1),
    fecha_vencimiento_anterior  TEXT NOT NULL,
    fecha_vencimiento_nueva     TEXT NOT NULL,
    motivo_justificacion        TEXT NOT NULL,
    autorizado_por_usuario_id   INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_ext_membresia ON extensiones_membresia(membresia_id);
CREATE INDEX IF NOT EXISTS idx_ext_cliente ON extensiones_membresia(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ext_autorizado ON extensiones_membresia(autorizado_por_usuario_id);
CREATE INDEX IF NOT EXISTS idx_ext_created_at ON extensiones_membresia(created_at DESC);
