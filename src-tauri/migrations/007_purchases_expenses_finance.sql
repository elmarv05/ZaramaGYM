-- ============================================================================
-- MIGRACIÓN 007: COMPRAS A PROVEEDORES, GASTOS OPERATIVOS Y AGREGACIONES FINANCIERAS
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Integridad Referencial Estricta)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABLA: COMPRAS_PROVEEDORES (Cabecera de Adquisición de Inventario y Mercadería)
CREATE TABLE IF NOT EXISTS compras_proveedores (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor_id                INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
    turno_caja_id               INTEGER REFERENCES turnos_caja(id) ON DELETE RESTRICT,
    tipo_comprobante            TEXT NOT NULL DEFAULT 'FACTURA' CHECK(tipo_comprobante IN ('FACTURA', 'BOLETA', 'RECIBO', 'SIN_COMPROBANTE')),
    numero_comprobante          TEXT,
    metodo_pago                 TEXT NOT NULL CHECK(metodo_pago IN ('EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'TARJETA')),
    canal_caja                  TEXT NOT NULL CHECK(canal_caja IN ('FISICA', 'DIGITAL')),
    total_compra                DECIMAL(10,2) NOT NULL CHECK(CAST(total_compra AS REAL) > 0),
    fecha_compra                TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    notas                       TEXT,
    registrado_por_usuario_id   INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    anulado_por_usuario_id      INTEGER REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    motivo_anulacion            TEXT,
    fecha_anulacion             TEXT,
    estado_activo               INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (
        (metodo_pago = 'EFECTIVO' AND canal_caja = 'FISICA') OR
        (metodo_pago IN ('YAPE', 'PLIN', 'TRANSFERENCIA', 'TARJETA') AND canal_caja = 'DIGITAL')
    )
);

CREATE INDEX IF NOT EXISTS idx_compras_fecha ON compras_proveedores(fecha_compra DESC);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras_proveedores(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_canal ON compras_proveedores(canal_caja);
CREATE INDEX IF NOT EXISTS idx_compras_metodo ON compras_proveedores(metodo_pago);
CREATE INDEX IF NOT EXISTS idx_compras_estado ON compras_proveedores(estado_activo);
CREATE INDEX IF NOT EXISTS idx_compras_turno ON compras_proveedores(turno_caja_id);
CREATE INDEX IF NOT EXISTS idx_compras_registrado ON compras_proveedores(registrado_por_usuario_id);


-- 2. TABLA: COMPRA_DETALLES (Líneas de Detalle de Productos e Insumos Comprados)
CREATE TABLE IF NOT EXISTS compra_detalles (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    compra_id                   INTEGER NOT NULL REFERENCES compras_proveedores(id) ON DELETE RESTRICT,
    producto_id                 INTEGER NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad                    INTEGER NOT NULL CHECK(cantidad > 0),
    costo_unitario              DECIMAL(10,2) NOT NULL CHECK(CAST(costo_unitario AS REAL) >= 0),
    subtotal                    DECIMAL(10,2) NOT NULL CHECK(CAST(subtotal AS REAL) >= 0),
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (ROUND(CAST(cantidad AS REAL) * CAST(costo_unitario AS REAL), 2) = CAST(subtotal AS REAL))
);

CREATE INDEX IF NOT EXISTS idx_compra_detalles_compra ON compra_detalles(compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalles_producto ON compra_detalles(producto_id);


-- 3. TABLA: GASTOS_OPERATIVOS (Egresos Operacionales Exclusivos del Administrador)
CREATE TABLE IF NOT EXISTS gastos_operativos (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria                   TEXT NOT NULL CHECK(categoria IN (
        'SERVICIOS_BASICOS',
        'ALQUILER',
        'MANTENIMIENTO_EQUIPOS',
        'LIMPIEZA_INSUMOS',
        'PERSONAL_HONORARIOS',
        'MARKETING',
        'IMPUESTOS_TASAS',
        'OTROS'
    )),
    descripcion                 TEXT NOT NULL,
    monto                       DECIMAL(10,2) NOT NULL CHECK(CAST(monto AS REAL) > 0),
    metodo_pago                 TEXT NOT NULL CHECK(metodo_pago IN ('EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'TARJETA')),
    canal_caja                  TEXT NOT NULL CHECK(canal_caja IN ('FISICA', 'DIGITAL')),
    turno_caja_id               INTEGER REFERENCES turnos_caja(id) ON DELETE RESTRICT,
    comprobante_referencia      TEXT,
    fecha_gasto                 TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    notas                       TEXT,
    registrado_por_usuario_id   INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    estado_activo               INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (
        (metodo_pago = 'EFECTIVO' AND canal_caja = 'FISICA') OR
        (metodo_pago IN ('YAPE', 'PLIN', 'TRANSFERENCIA', 'TARJETA') AND canal_caja = 'DIGITAL')
    )
);

CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos_operativos(fecha_gasto DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos_operativos(categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_canal ON gastos_operativos(canal_caja);
CREATE INDEX IF NOT EXISTS idx_gastos_metodo ON gastos_operativos(metodo_pago);
CREATE INDEX IF NOT EXISTS idx_gastos_estado ON gastos_operativos(estado_activo);
CREATE INDEX IF NOT EXISTS idx_gastos_turno ON gastos_operativos(turno_caja_id);
CREATE INDEX IF NOT EXISTS idx_gastos_registrado ON gastos_operativos(registrado_por_usuario_id);
