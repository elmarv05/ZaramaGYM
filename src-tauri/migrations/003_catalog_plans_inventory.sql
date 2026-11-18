-- ============================================================================
-- MIGRACIÓN 003: CATÁLOGO DE PLANES, PRODUCTOS E INVENTARIO (KARDEX/MERMAS)
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Integridad Referencial Estricta)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABLA: PLANES (Catálogo de Membresías y Pases)
CREATE TABLE IF NOT EXISTS planes (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo                      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nombre                      TEXT NOT NULL,
    descripcion                 TEXT,
    tipo_plan                   TEXT NOT NULL CHECK(tipo_plan IN ('PASE_DIARIO', 'MENSUALIDAD')),
    duracion_meses              INTEGER NOT NULL DEFAULT 0 CHECK(
        (tipo_plan = 'PASE_DIARIO' AND duracion_meses = 0) OR
        (tipo_plan = 'MENSUALIDAD' AND duracion_meses >= 1)
    ),
    precio_base                 DECIMAL(10,2) NOT NULL CHECK(precio_base >= 0),
    permite_recuperacion_dias   INTEGER NOT NULL DEFAULT 1 CHECK(permite_recuperacion_dias IN (0, 1)),
    estado_activo               INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_planes_codigo ON planes(codigo);
CREATE INDEX IF NOT EXISTS idx_planes_tipo ON planes(tipo_plan);
CREATE INDEX IF NOT EXISTS idx_planes_estado ON planes(estado_activo);

-- 2. TABLA: PRODUCTOS (Catálogo Comercial y Stock Físico)
CREATE TABLE IF NOT EXISTS productos (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_sku                  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nombre                      TEXT NOT NULL,
    categoria                   TEXT NOT NULL CHECK(categoria IN ('BEBIDAS', 'SUPLEMENTOS', 'ACCESORIOS', 'SNACKS', 'OTROS')),
    unidad_medida               TEXT NOT NULL DEFAULT 'UNIDAD',
    precio_compra_referencial   DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK(precio_compra_referencial >= 0),
    precio_venta                DECIMAL(10,2) NOT NULL CHECK(precio_venta >= 0),
    stock_actual                INTEGER NOT NULL DEFAULT 0 CHECK(stock_actual >= 0),
    stock_minimo                INTEGER NOT NULL DEFAULT 5 CHECK(stock_minimo >= 0),
    proveedor_preferido_id      INTEGER REFERENCES proveedores(id) ON DELETE RESTRICT,
    estado_activo               INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_productos_sku ON productos(codigo_sku);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria);
CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_preferido_id);
CREATE INDEX IF NOT EXISTS idx_productos_estado ON productos(estado_activo);

-- 3. TABLA: INVENTARIO_MOVIMIENTOS (Kardex Histórico Inmutable)
CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id                 INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    tipo_movimiento             TEXT NOT NULL CHECK(tipo_movimiento IN (
        'STOCK_INICIAL',
        'ENTRADA_AJUSTE',
        'ENTRADA_COMPRA',
        'SALIDA_VENTA',
        'MERMA_DANIO',
        'MERMA_VENCIMIENTO',
        'CONSUMO_PROPIO',
        'REVERSION_TACHADO',
        'MERMA',
        'CONSUMO_INTERNO',
        'AJUSTE_POSITIVO',
        'AJUSTE_NEGATIVO'
    )),
    signo                       TEXT NOT NULL CHECK(signo IN ('+', '-')),
    cantidad                    INTEGER NOT NULL CHECK(cantidad > 0),
    stock_anterior              INTEGER NOT NULL CHECK(stock_anterior >= 0),
    stock_resultante            INTEGER NOT NULL CHECK(stock_resultante >= 0),
    costo_unitario_momento      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    motivo_justificacion        TEXT NOT NULL,
    registrado_por_usuario_id   INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_producto ON inventario_movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_tipo ON inventario_movimientos(tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_inv_mov_created_at ON inventario_movimientos(created_at DESC);

-- ============================================================================
-- SEED INICIAL DE PLANES BASE ZARAMAGYM
-- ============================================================================
INSERT OR IGNORE INTO planes (id, codigo, nombre, descripcion, tipo_plan, duracion_meses, precio_base, permite_recuperacion_dias, estado_activo)
VALUES
    (1, 'PASE-DIA', 'Pase Diario', 'Acceso ilimitado por una jornada de entrenamiento hasta las 23:59:59.', 'PASE_DIARIO', 0, 10.00, 0, 1),
    (2, 'PLAN-1M', 'Membresía Mensual', 'Acceso por 1 mes calendario con recuperación de días justificados.', 'MENSUALIDAD', 1, 80.00, 1, 1),
    (3, 'PLAN-2M', 'Membresía Bimestral', 'Acceso continuo por 2 meses calendario con beneficio de congelamiento.', 'MENSUALIDAD', 2, 150.00, 1, 1),
    (4, 'PLAN-3M', 'Membresía Trimestral', 'Acceso preferencial por 3 meses calendario para entrenamiento continuo.', 'MENSUALIDAD', 3, 210.00, 1, 1);
