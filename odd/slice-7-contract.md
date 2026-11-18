# 📋 CONTRATO TÉCNICO EJECUTABLE: SLICE 7
**Compras a Proveedores, Gastos Operativos, Bandeja de Tachados y Finanzas (Física / Digital / Mixta)**

---

## 1. Contexto, Objetivos & Arquitectura de Finanzas

El **Slice 7** consolida la columna vertebral contable, financiera y de abastecimiento de **ZaramaGYM**. Su propósito es proporcionar al Administrador y Supervisores el control total de los flujos de dinero (ingresos y egresos) divididos de manera estricta y transparente en tres vistas operativas: **Caja Física (Efectivo)**, **Caja Digital (Yape, Plin, Transferencia, Tarjeta)** y **Consolidado Mixto**, integrando compras de mercadería con afectación inmediata al Kardex, gastos operacionales administrativos y la auditoría final de ventas tachadas.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          FLUJO FINANCIERO INTEGRAL DE ZARAMAGYM                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   [ INGRESOS POS ]                               [ EGRESOS DE OPERACIÓN ]              │
│   • Ventas Planes / Membresías                   • Compras a Proveedores               │
│   • Ventas Productos (Minimarket)                • Gastos Operativos Admin             │
│   • Amortizaciones de Crédito                    (Servicios, Alquiler, Personal, etc.) │
│             │                                                │                         │
│             ├───────────────┬────────────────┬───────────────┤                         │
│             ▼               ▼                ▼               ▼                         │
│     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│     │ EFECTIVO     │ │ YAPE / PLIN  │ │ TRANSFERENCIA│ │ TARJETA POS  │                │
│     └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘                │
│            │                │                │                │                        │
│            ▼                └────────────────┴────────────────┘                        │
│     CANAL FÍSICO                          CANAL DIGITAL                                │
│     (Arqueo de Caja)                      (Cuentas / Billeteras)                       │
│            │                                     │                                     │
│            └──────────────────┬──────────────────┘                                     │
│                               ▼                                                        │
│                    DASHBOARD FINANCIERO MIXTO                                          │
│                    • Flujo Neto (Ingresos - Egresos)                                   │
│                    • Desglose por Dominio Operativo                                    │
│                    • Desglose por Categoría de Gastos                                  │
│                    • Indicadores de Riesgo (Deudas & Tachados)                         │
│                                                                                        │
│   [ BANDEJA GLOBAL DE TACHADOS - PASO 2 ]                                              │
│   • Auditoría centralizada de ventas tachadas en turno                                 │
│   • Confirmación definitiva (ANULADA_DEFINITIVA) o reversión por Administrador         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Principios Rectores de Arquitectura:
1. **Segregación Estricta de Canales (Física vs Digital vs Mixta):**
   - El dinero en **Efectivo** pertenece al canal `FISICA` y afecta directamente el arqueo de la gaveta de caja.
   - El dinero en billeteras y bancos (**Yape, Plin, Transferencia, Tarjeta**) pertenece al canal `DIGITAL` y no altera el efectivo físico esperado en caja.
   - La vista `MIXTA` consolida ambos canales sin mezclar los fondos en la conciliación.
2. **Trazabilidad Kardex en Compras (Zero-Discrepancy Stock):**
   - Al registrar una compra (`create_supplier_purchase`):
     - Se incrementa `productos.stock_actual += cantidad`.
     - Si `costo_unitario > 0`, se actualiza `productos.precio_compra_referencial = costo_unitario`.
     - Se inserta un registro inmutable en `inventario_movimientos` con `tipo_movimiento = 'ENTRADA_COMPRA'` y `signo = '+'`.
3. **Invariante de Stock Físico No Negativo en Anulaciones:**
   - La anulación de una compra (`cancel_supplier_purchase`) es **exclusiva del Administrador** (`require_admin`).
   - Antes de anular, el sistema verifica que para **cada producto** del detalle se cumpla:
     $$\text{stock\_actual} \ge \text{cantidad\_comprada}$$
   - Si algún producto fue consumido o vendido y su stock actual es menor a la cantidad comprada, la anulación se **rechaza categóricamente** para prevenir inconsistencias físicas o stock negativo.
   - Al anularse exitosamente, se descuenta el stock (`productos.stock_actual -= cantidad`), se inserta en `inventario_movimientos` con `tipo_movimiento = 'AJUSTE_NEGATIVO'` y `signo = '-'`, y se audita con el motivo obligatorio.
4. **Blindaje RBAC en Gastos Operativos (Exclusivo Administrador):**
   - Los recepcionistas y supervisores no tienen visibilidad ni autorización para registrar, modificar o alternar gastos operativos (`create_operational_expense`, `update_operational_expense`, `toggle_operational_expense_active`, `list_operational_expenses`).
   - Todo intento no autorizado retorna `AppError::Forbidden`.
5. **Bandeja Global de Confirmación Definitiva de Tachados (Paso 2):**
   - Las ventas tachadas por cajeros en turno (`TACHADA_EN_TURNO`) quedan en espera de auditoría definitiva por parte del Administrador.
   - La bandeja `list_struck_sales_tray` permite al Administrador y Supervisor auditar todas las ventas tachadas con la información completa de la caja, vendedor, cliente, motivo de tachado y estado del turno (`ABIERTO` o `CERRADO`), permitiendo ejecutar `resolve_struck_sale` con trazabilidad total.
6. **Política "CERO Ruido" en Auditoría:**
   - Cero logs de auditoría en operaciones `SELECT` de lectura.
   - Mutaciones críticas auditadas con payloads compactos ($< 200$ bytes): `SUPPLIER_PURCHASE_CREATED`, `SUPPLIER_PURCHASE_CANCELLED`, `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `EXPENSE_STATUS_TOGGLED`.

---

## 2. Esquema DDL de `src-tauri/migrations/007_purchases_expenses_finance.sql`

```sql
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
```

---

## 3. Reglas de Negocio & Algoritmos

### 3.1. Matriz RBAC

| Operación IPC | Rol Recepcionista | Rol Supervisor | Rol Administrador |
|---|:---:|:---:|:---:|
| `create_supplier_purchase` | ❌ `Forbidden` | ✅ Permitido | ✅ Permitido |
| `list_supplier_purchases` | ❌ `Forbidden` | ✅ Permitido | ✅ Permitido |
| `get_supplier_purchase_detail` | ❌ `Forbidden` | ✅ Permitido | ✅ Permitido |
| `cancel_supplier_purchase` | ❌ `Forbidden` | ❌ `Forbidden` | ✅ **Exclusivo Admin** |
| `create_operational_expense` | ❌ `Forbidden` | ❌ `Forbidden` | ✅ **Exclusivo Admin** |
| `update_operational_expense` | ❌ `Forbidden` | ❌ `Forbidden` | ✅ **Exclusivo Admin** |
| `toggle_operational_expense_active` | ❌ `Forbidden` | ❌ `Forbidden` | ✅ **Exclusivo Admin** |
| `list_operational_expenses` | ❌ `Forbidden` | ❌ `Forbidden` | ✅ **Exclusivo Admin** |
| `list_struck_sales_tray` | ❌ `Forbidden` | ✅ Permitido | ✅ Permitido |
| `resolve_struck_sale` *(existente)* | ❌ `Forbidden` | ❌ `Forbidden` | ✅ **Exclusivo Admin** |
| `get_financial_dashboard_summary` | ❌ `Forbidden` | ✅ Permitido | ✅ Permitido |

---

### 3.2. Lógica Transaccional de Compras a Proveedores

#### A. Creación de Compra (`create_supplier_purchase`)
1. **Validación de Sesión:** `require_supervisor_or_admin(session)`.
2. **Validaciones de Entrada:**
   - `proveedor_id`: Debe existir en la tabla `proveedores` con `estado_activo = 1`.
   - `detalles`: Vector no vacío (`!detalles.is_empty()`).
   - Cada detalle debe tener `cantidad > 0`, `costo_unitario >= 0`, `subtotal == cantidad * costo_unitario`.
   - El producto referenciado debe existir en `productos` con `estado_activo = 1`.
   - `total_compra == suma(detalles.subtotal)` y `total_compra > 0`.
   - Compatibilidad de medio de pago: `EFECTIVO` $\to$ `canal_caja = 'FISICA'`; `YAPE | PLIN | TRANSFERENCIA | TARJETA` $\to$ `canal_caja = 'DIGITAL'`.
3. **Ejecución Transaccional ACID (`pool.begin()`):**
   - Insertar cabecera en `compras_proveedores`.
   - Para cada elemento del detalle:
     - Insertar en `compra_detalles`.
     - Obtener el `stock_actual` previo del producto.
     - Calcular `stock_resultante = stock_actual + cantidad`.
     - Actualizar `productos SET stock_actual = stock_resultante, updated_at = now()`.
     - Si `costo_unitario > 0`, actualizar `productos SET precio_compra_referencial = costo_unitario`.
     - Insertar en `inventario_movimientos`:
       - `producto_id = detalle.producto_id`
       - `tipo_movimiento = 'ENTRADA_COMPRA'`
       - `signo = '+'`
       - `cantidad = detalle.cantidad`
       - `stock_anterior = stock_actual`
       - `stock_resultante = stock_resultante`
       - `costo_unitario_momento = detalle.costo_unitario`
       - `motivo_justificacion = "Compra a proveedor #<id> - Comp: <num>"`
       - `registrado_por_usuario_id = session.user_id`
   - Registrar auditoría compacta (`SUPPLIER_PURCHASE_CREATED`, $< 200$ bytes).
   - `tx.commit()`.

#### B. Anulación de Compra (`cancel_supplier_purchase`)
1. **Validación de Sesión:** Exclusivo `require_admin(session)`.
2. **Validaciones de Entrada:**
   - La compra con `id` debe existir y tener `estado_activo = 1`.
   - `motivo_anulacion`: Obligatorio, longitud mínima $\ge 5$ caracteres limpios.
3. **Verificación de Invariante de Stock Físico:**
   - Consultar los detalles de la compra (`compra_detalles`).
   - Por cada producto, consultar su `stock_actual` actual en la tabla `productos`.
   - Si $\text{stock\_actual} < \text{detalle.cantidad}$, abortar la transacción con:
     ```rust
     AppError::Validation(format!(
         "No es posible anular la compra: el producto '{}' cuenta con stock actual de {} unidades, insuficiente para revertir las {} unidades adquiridas.",
         producto.nombre, producto.stock_actual, detalle.cantidad
     ))
     ```
4. **Ejecución Transaccional ACID (`pool.begin()`):**
   - Por cada producto del detalle:
     - Calcular `stock_resultante = stock_actual - detalle.cantidad`.
     - Actualizar `productos SET stock_actual = stock_resultante, updated_at = now()`.
     - Insertar en `inventario_movimientos`:
       - `producto_id = detalle.producto_id`
       - `tipo_movimiento = 'AJUSTE_NEGATIVO'`
       - `signo = '-'`
       - `cantidad = detalle.cantidad`
       - `stock_anterior = stock_actual`
       - `stock_resultante = stock_resultante`
       - `costo_unitario_momento = detalle.costo_unitario`
       - `motivo_justificacion = "Anulación compra #<id> - Motivo: <motivo>"`
       - `registrado_por_usuario_id = session.user_id`
   - Actualizar `compras_proveedores`:
     - `estado_activo = 0`
     - `anulado_por_usuario_id = session.user_id`
     - `motivo_anulacion = input.motivo_anulacion`
     - `fecha_anulacion = datetime('now', 'localtime')`
     - `updated_at = datetime('now', 'localtime')`
   - Registrar auditoría compacta (`SUPPLIER_PURCHASE_CANCELLED`, $< 200$ bytes).
   - `tx.commit()`.

---

### 3.3. Lógica Transaccional de Gastos Operativos (Admin Exclusivo)

1. **Creación (`create_operational_expense`):**
   - RBAC: Exclusivo `require_admin`.
   - Validaciones: `monto > 0`, `descripcion` no vacía ($\ge 3$ caracteres), correspondencia canal/método de pago.
   - Insertar en `gastos_operativos`.
   - Auditar `EXPENSE_CREATED` ($< 200$ bytes).
2. **Actualización (`update_operational_expense`):**
   - RBAC: Exclusivo `require_admin`.
   - Modificar: `categoria`, `descripcion`, `monto`, `metodo_pago`, `canal_caja`, `comprobante_referencia`, `fecha_gasto`, `notas`, `updated_at = now()`.
   - Auditar `EXPENSE_UPDATED` ($< 200$ bytes).
3. **Alternar Estado Activo / Inactivo (`toggle_operational_expense_active`):**
   - RBAC: Exclusivo `require_admin`.
   - Zero-Delete: `estado_activo = 1 - estado_activo`.
   - Auditar `EXPENSE_STATUS_TOGGLED` ($< 200$ bytes).
4. **Listado Filtrado (`list_operational_expenses`):**
   - RBAC: Exclusivo `require_admin`.
   - Filtros: `fecha_desde`, `fecha_hasta`, `categoria`, `canal_caja`, `estado_activo`.
   - Orden cronológico descendente.

---

### 3.4. Bandeja Global de Confirmación Definitiva de Tachados (`list_struck_sales_tray`)

Permite a los administradores y supervisores ver el estado integral de todas las ventas tachadas en cualquier momento, con los siguientes campos enriquecidos obtenidos mediante `LEFT JOIN` a personas, usuarios y turnos:
- Identificador de la venta y del turno de caja.
- Estado del turno (`ABIERTO` o `CERRADO`) donde ocurrió el tachado.
- Nombre completo del cliente (si fue venta nominada) o `'CLIENTE GENERAL'`.
- Montos de la venta: total, pagado en efectivo, pagado digital y saldo de crédito generado.
- Estado de la venta: `TACHADA_EN_TURNO` (pendiente de resolución) o `ANULADA_DEFINITIVA` (ya auditada).
- Username del cajero que vendió.
- Username del cajero que tachó la venta y motivo del tachado.
- Username del Administrador que confirmó/resolvió la anulación, con fecha y notas de resolución.
- Fecha de creación de la transacción original.

---

### 3.5. Algoritmo de Agregaciones Financieras (`get_financial_dashboard_summary`)

El cálculo de agregaciones financieras ejecuta consultas de agregación deterministas sobre el rango de fechas solicitado:

```sql
-- 1. Ingresos por Canal y Método de Pago (Ventas completadas no tachadas)
SELECT 
    p.canal_caja,
    p.metodo_pago,
    COALESCE(SUM(p.monto), 0) AS total_ingresos
FROM pagos p
INNER JOIN ventas v ON v.id = p.venta_id
WHERE v.estado_venta = 'COMPLETADA'
  AND p.estado_pago = 'ACTIVO'
  AND (:fecha_desde IS NULL OR date(v.created_at) >= date(:fecha_desde))
  AND (:fecha_hasta IS NULL OR date(v.created_at) <= date(:fecha_hasta))
GROUP BY p.canal_caja, p.metodo_pago;

-- 2. Egresos por Compras de Proveedores (Activas)
SELECT 
    cp.canal_caja,
    cp.metodo_pago,
    COALESCE(SUM(cp.total_compra), 0) AS total_compras
FROM compras_proveedores cp
WHERE cp.estado_activo = 1
  AND (:fecha_desde IS NULL OR date(cp.fecha_compra) >= date(:fecha_desde))
  AND (:fecha_hasta IS NULL OR date(cp.fecha_compra) <= date(:fecha_hasta))
GROUP BY cp.canal_caja, cp.metodo_pago;

-- 3. Egresos por Gastos Operativos (Activos)
SELECT 
    go.canal_caja,
    go.metodo_pago,
    COALESCE(SUM(go.monto), 0) AS total_gastos
FROM gastos_operativos go
WHERE go.estado_activo = 1
  AND (:fecha_desde IS NULL OR date(go.fecha_gasto) >= date(:fecha_desde))
  AND (:fecha_hasta IS NULL OR date(go.fecha_gasto) <= date(:fecha_hasta))
GROUP BY go.canal_caja, go.metodo_pago;

-- 4. Ingresos por Dominio Operativo (Ventas completadas)
SELECT 
    vd.tipo_item,
    COALESCE(SUM(vd.subtotal), 0) AS total_dominio
FROM venta_detalles vd
INNER JOIN ventas v ON v.id = vd.venta_id
WHERE v.estado_venta = 'COMPLETADA'
  AND (:fecha_desde IS NULL OR date(v.created_at) >= date(:fecha_desde))
  AND (:fecha_hasta IS NULL OR date(v.created_at) <= date(:fecha_hasta))
GROUP BY vd.tipo_item;

-- 5. Gastos por Categoría
SELECT 
    go.categoria,
    COALESCE(SUM(go.monto), 0) AS total_categoria
FROM gastos_operativos go
WHERE go.estado_activo = 1
  AND (:fecha_desde IS NULL OR date(go.fecha_gasto) >= date(:fecha_desde))
  AND (:fecha_hasta IS NULL OR date(go.fecha_gasto) <= date(:fecha_hasta))
GROUP BY go.categoria;

-- 6. Indicadores de Control y Riesgo
-- Cuentas por cobrar pendientes:
SELECT 
    COUNT(id) AS cantidad_creditos,
    COALESCE(SUM(saldo_pendiente), 0) AS saldo_total_pendiente
FROM creditos_clientes
WHERE estado = 'PENDIENTE';

-- Ventas tachadas y anuladas:
SELECT 
    SUM(CASE WHEN estado_venta = 'TACHADA_EN_TURNO' THEN 1 ELSE 0 END) AS tachadas_pendientes_count,
    COALESCE(SUM(CASE WHEN estado_venta = 'TACHADA_EN_TURNO' THEN total_venta ELSE 0 END), 0) AS monto_tachado_pendiente,
    SUM(CASE WHEN estado_venta = 'ANULADA_DEFINITIVA' THEN 1 ELSE 0 END) AS anuladas_definitivas_count
FROM ventas
WHERE (:fecha_desde IS NULL OR date(created_at) >= date(:fecha_desde))
  AND (:fecha_hasta IS NULL OR date(created_at) <= date(:fecha_hasta));
```

---

## 4. Modelos Rust (`src-tauri/src/models/finance.rs`)

```rust
use crate::errors::AppError;
use crate::models::pos::{PaymentChannel, PaymentMethod};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

// ============================================================================
// ENUMS DE DOMINIO FINANCIERO
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExpenseCategory {
    ServiciosBasicos,
    Alquiler,
    MantenimientoEquipos,
    LimpiezaInsumos,
    PersonalHonorarios,
    Marketing,
    ImpuestosTasas,
    Otros,
}

impl fmt::Display for ExpenseCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ServiciosBasicos => write!(f, "SERVICIOS_BASICOS"),
            Self::Alquiler => write!(f, "ALQUILER"),
            Self::MantenimientoEquipos => write!(f, "MANTENIMIENTO_EQUIPOS"),
            Self::LimpiezaInsumos => write!(f, "LIMPIEZA_INSUMOS"),
            Self::PersonalHonorarios => write!(f, "PERSONAL_HONORARIOS"),
            Self::Marketing => write!(f, "MARKETING"),
            Self::ImpuestosTasas => write!(f, "IMPUESTOS_TASAS"),
            Self::Otros => write!(f, "OTROS"),
        }
    }
}

impl FromStr for ExpenseCategory {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "SERVICIOS_BASICOS" => Ok(Self::ServiciosBasicos),
            "ALQUILER" => Ok(Self::Alquiler),
            "MANTENIMIENTO_EQUIPOS" => Ok(Self::MantenimientoEquipos),
            "LIMPIEZA_INSUMOS" => Ok(Self::LimpiezaInsumos),
            "PERSONAL_HONORARIOS" => Ok(Self::PersonalHonorarios),
            "MARKETING" => Ok(Self::Marketing),
            "IMPUESTOS_TASAS" => Ok(Self::ImpuestosTasas),
            "OTROS" => Ok(Self::Otros),
            other => Err(AppError::Validation(format!(
                "Categoría de gasto desconocida: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PurchaseInvoiceType {
    Factura,
    Boleta,
    Recibo,
    SinComprobante,
}

impl fmt::Display for PurchaseInvoiceType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Factura => write!(f, "FACTURA"),
            Self::Boleta => write!(f, "BOLETA"),
            Self::Recibo => write!(f, "RECIBO"),
            Self::SinComprobante => write!(f, "SIN_COMPROBANTE"),
        }
    }
}

impl FromStr for PurchaseInvoiceType {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "FACTURA" => Ok(Self::Factura),
            "BOLETA" => Ok(Self::Boleta),
            "RECIBO" => Ok(Self::Recibo),
            "SIN_COMPROBANTE" => Ok(Self::SinComprobante),
            other => Err(AppError::Validation(format!(
                "Tipo de comprobante de compra desconocido: {}",
                other
            ))),
        }
    }
}

// ============================================================================
// DTOs Y STRUCTS: COMPRAS A PROVEEDORES
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSupplierPurchaseDetailDto {
    pub producto_id: i64,
    pub cantidad: i64,
    pub costo_unitario: Decimal,
    pub subtotal: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSupplierPurchaseDto {
    pub proveedor_id: i64,
    pub turno_caja_id: Option<i64>,
    pub tipo_comprobante: PurchaseInvoiceType,
    pub numero_comprobante: Option<String>,
    pub metodo_pago: PaymentMethod,
    pub canal_caja: PaymentChannel,
    pub total_compra: Decimal,
    pub fecha_compra: Option<String>,
    pub notas: Option<String>,
    pub detalles: Vec<CreateSupplierPurchaseDetailDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelSupplierPurchaseDto {
    pub motivo_anulacion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SupplierPurchaseFilter {
    pub fecha_desde: Option<String>,
    pub fecha_hasta: Option<String>,
    pub proveedor_id: Option<i64>,
    pub canal_caja: Option<PaymentChannel>,
    pub estado_activo: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierPurchaseSummaryDto {
    pub id: i64,
    pub proveedor_id: i64,
    pub proveedor_nombre: String,
    pub proveedor_documento: String,
    pub turno_caja_id: Option<i64>,
    pub tipo_comprobante: String,
    pub numero_comprobante: Option<String>,
    pub metodo_pago: PaymentMethod,
    pub canal_caja: PaymentChannel,
    pub total_compra: Decimal,
    pub fecha_compra: String,
    pub registrado_por_username: String,
    pub estado_activo: i64,
    pub motivo_anulacion: Option<String>,
    pub fecha_anulacion: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierPurchaseItemDetailDto {
    pub id: i64,
    pub compra_id: i64,
    pub producto_id: i64,
    pub producto_sku: String,
    pub producto_nombre: String,
    pub cantidad: i64,
    pub costo_unitario: Decimal,
    pub subtotal: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierPurchaseDetailDto {
    pub purchase: SupplierPurchaseSummaryDto,
    pub notas: Option<String>,
    pub anulado_por_username: Option<String>,
    pub items: Vec<SupplierPurchaseItemDetailDto>,
}

// ============================================================================
// DTOs Y STRUCTS: GASTOS OPERATIVOS (ADMIN EXCLUSIVO)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateExpenseDto {
    pub categoria: ExpenseCategory,
    pub descripcion: String,
    pub monto: Decimal,
    pub metodo_pago: PaymentMethod,
    pub canal_caja: PaymentChannel,
    pub turno_caja_id: Option<i64>,
    pub comprobante_referencia: Option<String>,
    pub fecha_gasto: Option<String>,
    pub notas: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateExpenseDto {
    pub categoria: ExpenseCategory,
    pub descripcion: String,
    pub monto: Decimal,
    pub metodo_pago: PaymentMethod,
    pub canal_caja: PaymentChannel,
    pub turno_caja_id: Option<i64>,
    pub comprobante_referencia: Option<String>,
    pub fecha_gasto: Option<String>,
    pub notas: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExpenseFilter {
    pub fecha_desde: Option<String>,
    pub fecha_hasta: Option<String>,
    pub categoria: Option<ExpenseCategory>,
    pub canal_caja: Option<PaymentChannel>,
    pub estado_activo: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationalExpenseDto {
    pub id: i64,
    pub categoria: ExpenseCategory,
    pub descripcion: String,
    pub monto: Decimal,
    pub metodo_pago: PaymentMethod,
    pub canal_caja: PaymentChannel,
    pub turno_caja_id: Option<i64>,
    pub comprobante_referencia: Option<String>,
    pub fecha_gasto: String,
    pub notas: Option<String>,
    pub registrado_por_username: String,
    pub estado_activo: i64,
    pub created_at: String,
    pub updated_at: String,
}

// ============================================================================
// DTOs Y STRUCTS: BANDEJA GLOBAL DE TACHADOS (PASO 2)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StruckSaleFilter {
    pub estado_venta: Option<String>, // 'TACHADA_EN_TURNO' o 'ANULADA_DEFINITIVA'
    pub turno_caja_id: Option<i64>,
    pub fecha_desde: Option<String>,
    pub fecha_hasta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StruckSaleTrayItemDto {
    pub id: i64,
    pub turno_caja_id: i64,
    pub turno_estado: String,
    pub cliente_nombre_completo: Option<String>,
    pub total_venta: Decimal,
    pub monto_pagado_efectivo: Decimal,
    pub monto_pagado_digital: Decimal,
    pub saldo_credito_generado: Decimal,
    pub estado_venta: String,
    pub usuario_vendedor_username: String,
    pub tachado_por_username: Option<String>,
    pub fecha_tachado: Option<String>,
    pub motivo_tachado: Option<String>,
    pub resuelto_por_admin_username: Option<String>,
    pub fecha_resolucion_tachado: Option<String>,
    pub nota_resolucion_tachado: Option<String>,
    pub created_at: String,
}

// ============================================================================
// DTOs Y STRUCTS: DASHBOARD Y AGREGACIONES FINANCIERAS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FinancialReportFilter {
    pub fecha_desde: Option<String>,
    pub fecha_hasta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DigitalBreakdownDto {
    pub yape: Decimal,
    pub plin: Decimal,
    pub transferencia: Decimal,
    pub tarjeta: Decimal,
    pub total: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelFinancialSummaryDto {
    pub canal: String,
    pub ingresos_ventas: Decimal,
    pub egresos_compras: Decimal,
    pub egresos_gastos: Decimal,
    pub total_egresos: Decimal,
    pub flujo_neto: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainIncomeBreakdownDto {
    pub planes: Decimal,
    pub productos: Decimal,
    pub amortizaciones: Decimal,
    pub total: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpenseCategoryBreakdownDto {
    pub categoria: ExpenseCategory,
    pub categoria_label: String,
    pub monto: Decimal,
    pub porcentaje: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialControlIndicatorsDto {
    pub total_creditos_pendientes: Decimal,
    pub cantidad_creditos_pendientes: i64,
    pub ventas_tachadas_pendientes_count: i64,
    pub monto_tachado_pendiente: Decimal,
    pub ventas_anuladas_definitivas_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialDashboardDto {
    pub filtro_aplicado: FinancialReportFilter,
    pub fisica: ChannelFinancialSummaryDto,
    pub digital: ChannelFinancialSummaryDto,
    pub mixta: ChannelFinancialSummaryDto,
    pub desglose_digital_ingresos: DigitalBreakdownDto,
    pub desglose_digital_compras: DigitalBreakdownDto,
    pub desglose_digital_gastos: DigitalBreakdownDto,
    pub ingresos_por_dominio: DomainIncomeBreakdownDto,
    pub gastos_por_categoria: Vec<ExpenseCategoryBreakdownDto>,
    pub indicadores_control: FinancialControlIndicatorsDto,
}
```

---

## 5. Comandos IPC de Tauri v2 (`src-tauri/src/commands/finance_commands.rs`)

```rust
use crate::auth::session::AuthSession;
use crate::errors::AppError;
use crate::models::finance::*;
use crate::services::finance_service;
use crate::AppState;
use tauri::State;

// ============================================================================
// COMANDOS IPC: COMPRAS A PROVEEDORES
// ============================================================================

#[tauri::command]
pub async fn create_supplier_purchase(
    state: State<'_, AppState>,
    session: AuthSession,
    input: CreateSupplierPurchaseDto,
) -> Result<SupplierPurchaseDetailDto, AppError> {
    finance_service::create_supplier_purchase(&state.pool, &session, input).await
}

#[tauri::command]
pub async fn list_supplier_purchases(
    state: State<'_, AppState>,
    session: AuthSession,
    filter: SupplierPurchaseFilter,
) -> Result<Vec<SupplierPurchaseSummaryDto>, AppError> {
    finance_service::list_supplier_purchases(&state.pool, &session, filter).await
}

#[tauri::command]
pub async fn get_supplier_purchase_detail(
    state: State<'_, AppState>,
    session: AuthSession,
    id: i64,
) -> Result<SupplierPurchaseDetailDto, AppError> {
    finance_service::get_supplier_purchase_detail(&state.pool, &session, id).await
}

#[tauri::command]
pub async fn cancel_supplier_purchase(
    state: State<'_, AppState>,
    session: AuthSession,
    id: i64,
    input: CancelSupplierPurchaseDto,
) -> Result<SupplierPurchaseDetailDto, AppError> {
    finance_service::cancel_supplier_purchase(&state.pool, &session, id, input).await
}

// ============================================================================
// COMANDOS IPC: GASTOS OPERATIVOS (EXCLUSIVOS ADMINISTRADOR)
// ============================================================================

#[tauri::command]
pub async fn create_operational_expense(
    state: State<'_, AppState>,
    session: AuthSession,
    input: CreateExpenseDto,
) -> Result<OperationalExpenseDto, AppError> {
    finance_service::create_operational_expense(&state.pool, &session, input).await
}

#[tauri::command]
pub async fn update_operational_expense(
    state: State<'_, AppState>,
    session: AuthSession,
    id: i64,
    input: UpdateExpenseDto,
) -> Result<OperationalExpenseDto, AppError> {
    finance_service::update_operational_expense(&state.pool, &session, id, input).await
}

#[tauri::command]
pub async fn toggle_operational_expense_active(
    state: State<'_, AppState>,
    session: AuthSession,
    id: i64,
) -> Result<OperationalExpenseDto, AppError> {
    finance_service::toggle_operational_expense_active(&state.pool, &session, id).await
}

#[tauri::command]
pub async fn list_operational_expenses(
    state: State<'_, AppState>,
    session: AuthSession,
    filter: ExpenseFilter,
) -> Result<Vec<OperationalExpenseDto>, AppError> {
    finance_service::list_operational_expenses(&state.pool, &session, filter).await
}

// ============================================================================
// COMANDOS IPC: BANDEJA GLOBAL DE TACHADOS (PASO 2)
// ============================================================================

#[tauri::command]
pub async fn list_struck_sales_tray(
    state: State<'_, AppState>,
    session: AuthSession,
    filter: StruckSaleFilter,
) -> Result<Vec<StruckSaleTrayItemDto>, AppError> {
    finance_service::list_struck_sales_tray(&state.pool, &session, filter).await
}

// ============================================================================
// COMANDOS IPC: AGREGACIONES Y DASHBOARD FINANCIERO
// ============================================================================

#[tauri::command]
pub async fn get_financial_dashboard_summary(
    state: State<'_, AppState>,
    session: AuthSession,
    filter: FinancialReportFilter,
) -> Result<FinancialDashboardDto, AppError> {
    finance_service::get_financial_dashboard_summary(&state.pool, &session, filter).await
}
```

---

## 6. Interfaces TypeScript (`src/types/finance.ts`)

```typescript
// ============================================================================
// TIPOS E INTERFACES TYPESCRIPT: COMPRAS, GASTOS Y FINANZAS (SLICE 7)
// Ubicación: src/types/finance.ts
// ============================================================================

import { PaymentChannel, PaymentMethod } from './pos';

// ============================================================================
// ENUMS DE DOMINIO FINANCIERO
// ============================================================================

export type ExpenseCategory =
  | 'SERVICIOS_BASICOS'
  | 'ALQUILER'
  | 'MANTENIMIENTO_EQUIPOS'
  | 'LIMPIEZA_INSUMOS'
  | 'PERSONAL_HONORARIOS'
  | 'MARKETING'
  | 'IMPUESTOS_TASAS'
  | 'OTROS';

export type PurchaseInvoiceType =
  | 'FACTURA'
  | 'BOLETA'
  | 'RECIBO'
  | 'SIN_COMPROBANTE';

// ============================================================================
// COMPRAS A PROVEEDORES
// ============================================================================

export interface CreateSupplierPurchaseDetailDto {
  producto_id: number;
  cantidad: number;
  costo_unitario: string; // Decimal formateado "0.00"
  subtotal: string;       // Decimal formateado "0.00"
}

export interface CreateSupplierPurchaseDto {
  proveedor_id: number;
  turno_caja_id?: number | null;
  tipo_comprobante: PurchaseInvoiceType;
  numero_comprobante?: string | null;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  total_compra: string;
  fecha_compra?: string | null;
  notas?: string | null;
  detalles: CreateSupplierPurchaseDetailDto[];
}

export interface CancelSupplierPurchaseDto {
  motivo_anulacion: string;
}

export interface SupplierPurchaseFilter {
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  proveedor_id?: number | null;
  canal_caja?: PaymentChannel | null;
  estado_activo?: number | null;
}

export interface SupplierPurchaseSummaryDto {
  id: number;
  proveedor_id: number;
  proveedor_nombre: string;
  proveedor_documento: string;
  turno_caja_id?: number | null;
  tipo_comprobante: PurchaseInvoiceType;
  numero_comprobante?: string | null;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  total_compra: string;
  fecha_compra: string;
  registrado_por_username: string;
  estado_activo: number;
  motivo_anulacion?: string | null;
  fecha_anulacion?: string | null;
  created_at: string;
}

export interface SupplierPurchaseItemDetailDto {
  id: number;
  compra_id: number;
  producto_id: number;
  producto_sku: string;
  producto_nombre: string;
  cantidad: number;
  costo_unitario: string;
  subtotal: string;
}

export interface SupplierPurchaseDetailDto {
  purchase: SupplierPurchaseSummaryDto;
  notas?: string | null;
  anulado_por_username?: string | null;
  items: SupplierPurchaseItemDetailDto[];
}

// ============================================================================
// GASTOS OPERATIVOS (ADMIN EXCLUSIVO)
// ============================================================================

export interface CreateExpenseDto {
  categoria: ExpenseCategory;
  descripcion: string;
  monto: string;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  turno_caja_id?: number | null;
  comprobante_referencia?: string | null;
  fecha_gasto?: string | null;
  notas?: string | null;
}

export interface UpdateExpenseDto {
  categoria: ExpenseCategory;
  descripcion: string;
  monto: string;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  turno_caja_id?: number | null;
  comprobante_referencia?: string | null;
  fecha_gasto?: string | null;
  notas?: string | null;
}

export interface ExpenseFilter {
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  categoria?: ExpenseCategory | null;
  canal_caja?: PaymentChannel | null;
  estado_activo?: number | null;
}

export interface OperationalExpenseDto {
  id: number;
  categoria: ExpenseCategory;
  descripcion: string;
  monto: string;
  metodo_pago: PaymentMethod;
  canal_caja: PaymentChannel;
  turno_caja_id?: number | null;
  comprobante_referencia?: string | null;
  fecha_gasto: string;
  notas?: string | null;
  registrado_por_username: string;
  estado_activo: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// BANDEJA GLOBAL DE TACHADOS (PASO 2)
// ============================================================================

export interface StruckSaleFilter {
  estado_venta?: 'TACHADA_EN_TURNO' | 'ANULADA_DEFINITIVA' | null;
  turno_caja_id?: number | null;
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
}

export interface StruckSaleTrayItemDto {
  id: number;
  turno_caja_id: number;
  turno_estado: 'ABIERTO' | 'CERRADO';
  cliente_nombre_completo?: string | null;
  total_venta: string;
  monto_pagado_efectivo: string;
  monto_pagado_digital: string;
  saldo_credito_generado: string;
  estado_venta: 'TACHADA_EN_TURNO' | 'ANULADA_DEFINITIVA';
  usuario_vendedor_username: string;
  tachado_por_username?: string | null;
  fecha_tachado?: string | null;
  motivo_tachado?: string | null;
  resuelto_por_admin_username?: string | null;
  fecha_resolucion_tachado?: string | null;
  nota_resolucion_tachado?: string | null;
  created_at: string;
}

// ============================================================================
// DASHBOARD Y AGREGACIONES FINANCIERAS
// ============================================================================

export interface FinancialReportFilter {
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
}

export interface DigitalBreakdownDto {
  yape: string;
  plin: string;
  transferencia: string;
  tarjeta: string;
  total: string;
}

export interface ChannelFinancialSummaryDto {
  canal: 'FISICA' | 'DIGITAL' | 'MIXTA';
  ingresos_ventas: string;
  egresos_compras: string;
  egresos_gastos: string;
  total_egresos: string;
  flujo_neto: string;
}

export interface DomainIncomeBreakdownDto {
  planes: string;
  productos: string;
  amortizaciones: string;
  total: string;
}

export interface ExpenseCategoryBreakdownDto {
  categoria: ExpenseCategory;
  categoria_label: string;
  monto: string;
  porcentaje: string;
}

export interface FinancialControlIndicatorsDto {
  total_creditos_pendientes: string;
  cantidad_creditos_pendientes: number;
  ventas_tachadas_pendientes_count: number;
  monto_tachado_pendiente: string;
  ventas_anuladas_definitivas_count: number;
}

export interface FinancialDashboardDto {
  filtro_aplicado: FinancialReportFilter;
  fisica: ChannelFinancialSummaryDto;
  digital: ChannelFinancialSummaryDto;
  mixta: ChannelFinancialSummaryDto;
  desglose_digital_ingresos: DigitalBreakdownDto;
  desglose_digital_compras: DigitalBreakdownDto;
  desglose_digital_gastos: DigitalBreakdownDto;
  ingresos_por_dominio: DomainIncomeBreakdownDto;
  gastos_por_categoria: ExpenseCategoryBreakdownDto[];
  indicadores_control: FinancialControlIndicatorsDto;
}
```

---

## 7. Matriz de Pruebas TDD (`CP-FIN-01..12`)

| Código | Objetivo de la Prueba | Entrada / Precondición | Comportamiento Esperado | Criterio de Éxito |
|---|---|---|---|---|
| **CP-FIN-01** | Creación válida de compra a proveedor | Proveedor activo, producto con stock 10, costo S/ 20.00, compra 5 unidades en EFECTIVO | Stock se incrementa a 15, movimiento Kardex `ENTRADA_COMPRA` con signo `+`, compra registrada en BD | `productos.stock_actual == 15` y `inventario_movimientos` contiene registro `+5` |
| **CP-FIN-02** | Actualización de precio de compra referencial | Producto con `precio_compra_referencial = 15.00`. Compra ingresa con `costo_unitario = 22.50` | Se actualiza `precio_compra_referencial` al nuevo valor | `producto.precio_compra_referencial == 22.50` |
| **CP-FIN-03** | Rechazo de compra con datos inconsistentes | Subtotal no coincide con `cantidad * costo_unitario` o vector de detalles vacío | Retorna `AppError::Validation` y aborta la transacción | No se crea registro en BD ni se altera el stock |
| **CP-FIN-04** | Rechazo por incompatibilidad canal / método | `metodo_pago = 'EFECTIVO'` con `canal_caja = 'DIGITAL'` o `metodo_pago = 'YAPE'` con `canal_caja = 'FISICA'` | Violación de `CHECK` a nivel de SQLite o validación previa en Rust | Retorna `AppError::Validation` |
| **CP-FIN-05** | Anulación de compra exitosa por Admin | Compra activa con 5 unidades de producto (stock actual 15). Admin envía motivo $\ge 5$ chars | Stock se reduce a 10, Kardex registra `AJUSTE_NEGATIVO` con signo `-`, compra marcada `estado_activo = 0` | `stock_actual == 10`, `compra.estado_activo == 0` |
| **CP-FIN-06** | Rechazo de anulación por stock insuficiente | Compra adquirió 10 unidades, pero el producto ya se vendió y su stock actual es 4 | Sistema detecta `stock_actual < cantidad_comprada` y rechaza la anulación | Retorna `AppError::Validation` descriptivo y no altera BD |
| **CP-FIN-07** | Control de acceso en anulación de compra | Usuario con rol `Recepcionista` o `Supervisor` intenta anular compra | Sistema rechaza por RBAC | Retorna `AppError::Forbidden` |
| **CP-FIN-08** | CRUD y Toggle de Gasto Operativo por Admin | Admin crea gasto de S/ 350.00 en `ALQUILER` (Transferencia/Digital), edita nota y alterna estado | Transacciones exitosas, estado cambia entre 1 y 0 | Registro creado y actualizado con auditoría |
| **CP-FIN-09** | Blindaje RBAC de Gastos Operativos | Recepcionista o Supervisor intenta invocar `create_operational_expense` o `list_operational_expenses` | Sistema deniega acceso en el acto | Retorna `AppError::Forbidden` en todas las operaciones |
| **CP-FIN-10** | Bandeja de confirmación definitiva de tachados | Venta tachada en turno `TACHADA_EN_TURNO`. Se consulta `list_struck_sales_tray` | Devuelve fila enriquecida con estado de turno, cajero, cliente y motivo de tachado | Lista contiene la venta con todos sus metadatos |
| **CP-FIN-11** | Agregaciones Financieras: FÍSICA vs DIGITAL vs MIXTA | Ventas en efectivo S/ 500, Yape S/ 300; compras efectivo S/ 100; gastos Yape S/ 50 | FÍSICA neto: +400; DIGITAL neto: +250; MIXTO neto: +650 | Cálculo exacto coincidente con las fórmulas |
| **CP-FIN-12** | Indicadores de control de cuentas por cobrar y tachados | 2 créditos pendientes por S/ 180, 1 venta tachada pendiente por S/ 60 | Devuelve conteos y montos pendientes consolidados | Dashboard expone los indicadores de riesgo sin error |

---

## 8. Directrices de Auditoría y Seguridad Zero-Noise

Para cumplir con la política corporativa de **Auditoría Sin Ruido** y optimización de espacio en SQLite:
1. **Ninguna consulta `SELECT` genera registros en `auditoria_logs`.**
2. **Cargas útiles de auditoría strictly compactas ($< 200$ bytes):**

```rust
// Ejemplo para SUPPLIER_PURCHASE_CREATED:
let detalles_json = format!(
    r#"{{"compra_id":{},"prov_id":{},"total":"{}","metodo":"{}","canal":"{}"}}"#,
    compra_id, input.proveedor_id, input.total_compra, input.metodo_pago, input.canal_caja
);

// Ejemplo para SUPPLIER_PURCHASE_CANCELLED:
let detalles_json = format!(
    r#"{{"compra_id":{},"anulado_por":{},"motivo":"{:.50}"}}"#,
    id, session.user_id, input.motivo_anulacion
);

// Ejemplo para EXPENSE_CREATED:
let detalles_json = format!(
    r#"{{"gasto_id":{},"cat":"{}","monto":"{}","canal":"{}"}}"#,
    gasto_id, input.categoria, input.monto, input.canal_caja
);

// Ejemplo para EXPENSE_UPDATED:
let detalles_json = format!(
    r#"{{"gasto_id":{},"cat":"{}","monto":"{}"}}"#,
    id, input.categoria, input.monto
);

// Ejemplo para EXPENSE_STATUS_TOGGLED:
let detalles_json = format!(
    r#"{{"gasto_id":{},"nuevo_estado":{}}}"#,
    id, nuevo_estado
);
```
