-- ============================================================================
-- MIGRACIÓN 004: TURNOS DE CAJA, VENTAS POS, PAGOS, CRÉDITOS Y MEMBRESÍAS
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Integridad Referencial Estricta)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABLA: TURNOS_CAJA (Control de Arqueo Físico y Caja Digital Paralela)
CREATE TABLE IF NOT EXISTS turnos_caja (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_apertura_id             INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    usuario_cierre_id               INTEGER REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    fecha_apertura                  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_cierre                    TEXT,
    monto_apertura_fisico           DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK(CAST(monto_apertura_fisico AS REAL) >= 0),
    total_ventas_efectivo           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_efectivo_esperado         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    monto_cierre_fisico_declarado   DECIMAL(10,2),
    diferencia_arqueo_fisico        DECIMAL(10,2),
    total_ventas_digital            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    desglose_digital_json           TEXT NOT NULL DEFAULT '{"YAPE":"0.00","PLIN":"0.00","TRANSFERENCIA":"0.00","TARJETA":"0.00"}',
    estado                          TEXT NOT NULL DEFAULT 'ABIERTO' CHECK(estado IN ('ABIERTO', 'CERRADO')),
    notas_apertura                  TEXT,
    notas_cierre                    TEXT,
    created_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_turnos_caja_usuario_ap ON turnos_caja(usuario_apertura_id);
CREATE INDEX IF NOT EXISTS idx_turnos_caja_usuario_ci ON turnos_caja(usuario_cierre_id);
CREATE INDEX IF NOT EXISTS idx_turnos_caja_estado ON turnos_caja(estado);
CREATE INDEX IF NOT EXISTS idx_turnos_caja_fecha_ap ON turnos_caja(fecha_apertura DESC);

-- Restricción única parcial: Garantiza a nivel de motor SQLite que jamás existan 2 turnos abiertos simultáneamente
CREATE UNIQUE INDEX IF NOT EXISTS idx_turnos_caja_unico_abierto 
ON turnos_caja(estado) 
WHERE estado = 'ABIERTO';


-- 2. TABLA: VENTAS (Cabecera de Transacciones en Punto de Venta)
CREATE TABLE IF NOT EXISTS ventas (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    turno_caja_id                   INTEGER NOT NULL REFERENCES turnos_caja(id) ON DELETE RESTRICT,
    cliente_id                      INTEGER REFERENCES clientes(id) ON DELETE RESTRICT,
    usuario_vendedor_id             INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    subtotal                        DECIMAL(10,2) NOT NULL CHECK(CAST(subtotal AS REAL) >= 0),
    descuento                       DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK(CAST(descuento AS REAL) >= 0),
    total_venta                     DECIMAL(10,2) NOT NULL CHECK(CAST(total_venta AS REAL) >= 0),
    monto_pagado_efectivo           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    monto_pagado_digital            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    saldo_credito_generado          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    estado_venta                    TEXT NOT NULL DEFAULT 'COMPLETADA' CHECK(estado_venta IN ('COMPLETADA', 'TACHADA_EN_TURNO', 'ANULADA_DEFINITIVA')),
    tachado_por_usuario_id          INTEGER REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    fecha_tachado                   TEXT,
    motivo_tachado                  TEXT,
    resuelto_por_admin_id           INTEGER REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    fecha_resolucion_tachado        TEXT,
    nota_resolucion_tachado         TEXT,
    notas                           TEXT,
    created_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (CAST(total_venta AS REAL) = ROUND(CAST(subtotal AS REAL) - CAST(descuento AS REAL), 2))
);

CREATE INDEX IF NOT EXISTS idx_ventas_turno ON ventas(turno_caja_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedor ON ventas(usuario_vendedor_id);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(estado_venta);
CREATE INDEX IF NOT EXISTS idx_ventas_created_at ON ventas(created_at DESC);


-- 3. TABLA: CREDITOS_CLIENTES (Motor Centralizado de Cuentas por Cobrar)
CREATE TABLE IF NOT EXISTS creditos_clientes (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id                      INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    venta_origen_id                 INTEGER REFERENCES ventas(id) ON DELETE RESTRICT,
    origen_credito                  TEXT NOT NULL CHECK(origen_credito IN (
        'MEMBRESIA_PAGO_PARCIAL',
        'PRODUCTO_CREDITO',
        'PASE_DIARIO_SEMAFORO_ROJO'
    )),
    descripcion                     TEXT NOT NULL,
    monto_total                     DECIMAL(10,2) NOT NULL CHECK(CAST(monto_total AS REAL) > 0),
    monto_pagado                    DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK(CAST(monto_pagado AS REAL) >= 0),
    saldo_pendiente                 DECIMAL(10,2) NOT NULL CHECK(CAST(saldo_pendiente AS REAL) >= 0),
    estado                          TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE', 'PAGADO', 'ANULADO')),
    registrado_por_usuario_id       INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    fecha_emision                   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_ultimo_pago               TEXT,
    notas                           TEXT,
    created_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (ROUND(CAST(monto_total AS REAL) - CAST(monto_pagado AS REAL), 2) = CAST(saldo_pendiente AS REAL))
);

CREATE INDEX IF NOT EXISTS idx_creditos_cliente ON creditos_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_creditos_venta_origen ON creditos_clientes(venta_origen_id);
CREATE INDEX IF NOT EXISTS idx_creditos_estado ON creditos_clientes(estado);
CREATE INDEX IF NOT EXISTS idx_creditos_origen ON creditos_clientes(origen_credito);


-- 4. TABLA: VENTA_DETALLES (Ítems de Venta Multidominio)
CREATE TABLE IF NOT EXISTS venta_detalles (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id                        INTEGER NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
    tipo_item                       TEXT NOT NULL CHECK(tipo_item IN ('PRODUCTO', 'PLAN', 'AMORTIZACION_CREDITO')),
    producto_id                     INTEGER REFERENCES productos(id) ON DELETE RESTRICT,
    plan_id                         INTEGER REFERENCES planes(id) ON DELETE RESTRICT,
    credito_id                      INTEGER REFERENCES creditos_clientes(id) ON DELETE RESTRICT,
    descripcion                     TEXT NOT NULL,
    cantidad                        INTEGER NOT NULL DEFAULT 1 CHECK(cantidad >= 1),
    precio_unitario                 DECIMAL(10,2) NOT NULL CHECK(CAST(precio_unitario AS REAL) >= 0),
    subtotal                        DECIMAL(10,2) NOT NULL CHECK(CAST(subtotal AS REAL) >= 0),
    fecha_inicio_plan               TEXT,
    fecha_fin_plan                  TEXT,
    created_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (
        (tipo_item = 'PRODUCTO' AND producto_id IS NOT NULL AND plan_id IS NULL AND credito_id IS NULL) OR
        (tipo_item = 'PLAN' AND plan_id IS NOT NULL AND producto_id IS NULL AND credito_id IS NULL) OR
        (tipo_item = 'AMORTIZACION_CREDITO' AND credito_id IS NOT NULL AND producto_id IS NULL AND plan_id IS NULL)
    ),
    CHECK (ROUND(CAST(cantidad AS REAL) * CAST(precio_unitario AS REAL), 2) = CAST(subtotal AS REAL))
);

CREATE INDEX IF NOT EXISTS idx_detalles_venta ON venta_detalles(venta_id);
CREATE INDEX IF NOT EXISTS idx_detalles_producto ON venta_detalles(producto_id);
CREATE INDEX IF NOT EXISTS idx_detalles_plan ON venta_detalles(plan_id);
CREATE INDEX IF NOT EXISTS idx_detalles_credito ON venta_detalles(credito_id);


-- 5. TABLA: PAGOS (Desglose Atómico de Medios de Pago por Venta)
CREATE TABLE IF NOT EXISTS pagos (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id                        INTEGER NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
    turno_caja_id                   INTEGER NOT NULL REFERENCES turnos_caja(id) ON DELETE RESTRICT,
    metodo_pago                     TEXT NOT NULL CHECK(metodo_pago IN ('EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'TARJETA')),
    canal_caja                      TEXT NOT NULL CHECK(canal_caja IN ('FISICA', 'DIGITAL')),
    monto                           DECIMAL(10,2) NOT NULL CHECK(CAST(monto AS REAL) > 0),
    referencia_operacion            TEXT,
    estado_pago                     TEXT NOT NULL DEFAULT 'ACTIVO' CHECK(estado_pago IN ('ACTIVO', 'REVERTIDO')),
    created_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (
        (metodo_pago = 'EFECTIVO' AND canal_caja = 'FISICA') OR
        (metodo_pago IN ('YAPE', 'PLIN', 'TRANSFERENCIA', 'TARJETA') AND canal_caja = 'DIGITAL')
    )
);

CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);
CREATE INDEX IF NOT EXISTS idx_pagos_turno ON pagos(turno_caja_id);
CREATE INDEX IF NOT EXISTS idx_pagos_metodo ON pagos(metodo_pago);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON pagos(estado_pago);


-- 6. TABLA: MEMBRESIAS_CLIENTES (Vínculo Operativo POS - Membresías Activas para Asistencias)
CREATE TABLE IF NOT EXISTS membresias_clientes (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id                      INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    plan_id                         INTEGER NOT NULL REFERENCES planes(id) ON DELETE RESTRICT,
    venta_id                        INTEGER REFERENCES ventas(id) ON DELETE RESTRICT,
    fecha_inicio                    TEXT NOT NULL,
    fecha_vencimiento               TEXT NOT NULL,
    precio_pactado                  DECIMAL(10,2) NOT NULL CHECK(CAST(precio_pactado AS REAL) >= 0),
    estado                          TEXT NOT NULL DEFAULT 'ACTIVA' CHECK(estado IN ('ACTIVA', 'VENCIDA', 'ANULADA')),
    registrado_por_usuario_id       INTEGER NOT NULL REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    created_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at                      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_membresias_cliente ON membresias_clientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_membresias_plan ON membresias_clientes(plan_id);
CREATE INDEX IF NOT EXISTS idx_membresias_venta ON membresias_clientes(venta_id);
CREATE INDEX IF NOT EXISTS idx_membresias_estado ON membresias_clientes(estado);
CREATE INDEX IF NOT EXISTS idx_membresias_vencimiento ON membresias_clientes(fecha_vencimiento);
