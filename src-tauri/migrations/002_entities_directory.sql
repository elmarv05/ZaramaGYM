-- ============================================================================
-- MIGRACIÓN 002: EMPRESAS, CLIENTES, HISTORIAL DE PESOS Y PROVEEDORES
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Integridad Referencial Estricta)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABLA: EMPRESAS (Maestra exclusiva de Personas Jurídicas RUC 20)
CREATE TABLE IF NOT EXISTS empresas (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ruc                 TEXT NOT NULL UNIQUE, -- Validado: 11 dígitos numéricos que inician con '20'
    razon_social        TEXT NOT NULL,
    nombre_comercial    TEXT,
    telefono            TEXT,
    email               TEXT,
    direccion           TEXT,
    estado_activo       INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_empresas_ruc ON empresas(ruc);
CREATE INDEX IF NOT EXISTS idx_empresas_razon_social ON empresas(razon_social COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_empresas_nombre_comercial ON empresas(nombre_comercial COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_empresas_estado ON empresas(estado_activo);

-- 2. TABLA: CLIENTES (Hija 1:1 de personas con credencial QR y salud)
CREATE TABLE IF NOT EXISTS clientes (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id                      INTEGER NOT NULL UNIQUE REFERENCES personas(id) ON DELETE RESTRICT,
    codigo_qr_token                 TEXT NOT NULL UNIQUE, -- 'ZG-' || 16 HEX CSPRNG
    nombre_contacto_emergencia      TEXT,
    numero_contacto_emergencia      TEXT,
    notas_medicas                   TEXT,
    peso_actual_kg                  DECIMAL(10,2), -- Nullable; peso más reciente registrado
    estado_activo                   INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_clientes_persona ON clientes(persona_id);
CREATE INDEX IF NOT EXISTS idx_clientes_qr ON clientes(codigo_qr_token);
CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes(estado_activo);

-- 3. TABLA: CLIENTE_PESOS_HISTORIAL (Récord histórico de peso y variación en kg)
CREATE TABLE IF NOT EXISTS cliente_pesos_historial (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id                      INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    peso_kg                         DECIMAL(10,2) NOT NULL,
    variacion_kg                    DECIMAL(10,2) NOT NULL DEFAULT 0.00, -- nuevo_peso - peso_anterior (0.00 en peso inicial)
    nota                            TEXT,                                -- Ej. 'Peso inicial de inscripción', 'Control mensual'
    registrado_por_usuario_id       INTEGER REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    fecha_registro                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_pesos_cliente ON cliente_pesos_historial(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pesos_fecha ON cliente_pesos_historial(fecha_registro DESC);

-- 4. TABLA: PROVEEDORES (Polimorfismo limpio: hereda de personas O de empresas)
CREATE TABLE IF NOT EXISTS proveedores (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_proveedor      TEXT NOT NULL CHECK(tipo_proveedor IN ('PERSONA_NATURAL', 'EMPRESA')),
    persona_id          INTEGER UNIQUE REFERENCES personas(id) ON DELETE RESTRICT,
    empresa_id          INTEGER UNIQUE REFERENCES empresas(id) ON DELETE RESTRICT,
    rubro_o_categoria   TEXT,
    contacto_referencia TEXT,
    estado_activo       INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (
        (tipo_proveedor = 'PERSONA_NATURAL' AND persona_id IS NOT NULL AND empresa_id IS NULL) OR
        (tipo_proveedor = 'EMPRESA' AND empresa_id IS NOT NULL AND persona_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_proveedores_tipo ON proveedores(tipo_proveedor);
CREATE INDEX IF NOT EXISTS idx_proveedores_persona ON proveedores(persona_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa ON proveedores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_estado ON proveedores(estado_activo);
