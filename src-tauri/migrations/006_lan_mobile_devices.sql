-- ============================================================================
-- MIGRACIÓN 006: SERVIDOR WI-FI LOCAL Y DISPOSITIVOS MÓVILES VINCULADOS
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Integridad Referencial Estricta)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABLA: DISPOSITIVOS_MOVILES (Teléfonos iOS / Android emparejados para escaneo LAN)
CREATE TABLE IF NOT EXISTS dispositivos_moviles (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_dispositivo          TEXT NOT NULL,
    codigo_vinculacion          TEXT NOT NULL UNIQUE,
    token_sesion                TEXT UNIQUE,
    estado_vinculacion          TEXT NOT NULL DEFAULT 'PENDIENTE_VINCULACION' CHECK(estado_vinculacion IN (
        'PENDIENTE_VINCULACION',
        'VINCULADO',
        'REVOCADO'
    )),
    ip_ultima_conexion          TEXT,
    user_agent                  TEXT,
    ultimo_acceso_at            TEXT,
    total_escaneos              INTEGER NOT NULL DEFAULT 0 CHECK(total_escaneos >= 0),
    creado_por_usuario_id       INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    revocado_por_usuario_id     INTEGER REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    revocado_at                 TEXT,
    estado_activo               INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_disp_codigo ON dispositivos_moviles(codigo_vinculacion);
CREATE UNIQUE INDEX IF NOT EXISTS idx_disp_token ON dispositivos_moviles(token_sesion);
CREATE INDEX IF NOT EXISTS idx_disp_estado ON dispositivos_moviles(estado_vinculacion, estado_activo);
CREATE INDEX IF NOT EXISTS idx_disp_creado_por ON dispositivos_moviles(creado_por_usuario_id);

-- 2. EXTENSIÓN DE ASISTENCIAS: VINCULACIÓN AL DISPOSITIVO ESCÁNER MÓVIL
-- Permite rastrear qué teléfono móvil específico registró cada asistencia LAN
-- NOTA: Manejado programáticamente de forma idempotente en src-tauri/src/db/mod.rs
-- ALTER TABLE asistencias ADD COLUMN dispositivo_id INTEGER REFERENCES dispositivos_moviles(id) ON DELETE RESTRICT;
-- CREATE INDEX IF NOT EXISTS idx_asistencias_dispositivo ON asistencias(dispositivo_id);

-- 3. SEED DE CONFIGURACIÓN DEL SERVIDOR LAN EN CONFIGURACION_SISTEMA
INSERT OR IGNORE INTO configuracion_sistema (clave, valor, descripcion)
VALUES
    ('LAN_SERVER_PORT', '3443', 'Puerto TCP para el servidor Wi-Fi local de escáneres móviles'),
    ('LAN_MDNS_HOSTNAME', 'sistema.local', 'Nombre de host mDNS anunciado en la red Wi-Fi local'),
    ('LAN_SERVER_ENABLED', '1', 'Estado habilitado por defecto del servidor LAN al iniciar');
