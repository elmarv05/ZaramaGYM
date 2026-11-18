# 📋 CONTRATO TÉCNICO EJECUTABLE: SLICE 3
**Catálogo de Planes (Algoritmo *Day Overflow*), Inventario de Productos y Mermas**

---

## 1. Contexto & Objetivos del Slice 3

El **Slice 3** consolida el núcleo operativo de oferta comercial, control de membresías e inventario físico de **ZaramaGYM**, asegurando que los siguientes slices (Turnos de Caja/POS en el Slice 4 y Semáforo QR de Asistencias en el Slice 5) consuman datos estructurados, inmutables y auditados.

### Componentes Principales:
1. **Catálogo de Planes & Membresías (`planes`):**
   - Soporte para **Pases Diarios** (vigencia exclusiva hasta las `23:59:59` del día de emisión) y **Mensualidades** ($\ge 1$ mes calendario).
   - Configuración de flags de negocio (`permite_recuperacion_dias`) y precios base en `DECIMAL(10,2)` (`rust_decimal`).
   - Algoritmo de calendario canónico con compensación de fin de mes (**_Day Overflow_**) para gestionar meses de 28, 29, 30 y 31 días sin despojar al socio de sus días adquiridos.
2. **Catálogo de Productos (`productos`):**
   - SKU único, categorización cerrada (`BEBIDAS`, `SUPLEMENTOS`, `ACCESORIOS`, `SNACKS`, `OTROS`), precios de compra referencial y venta.
   - Control de `stock_actual`, umbral de alerta `stock_minimo` y vinculación opcional con `proveedores(id)`.
3. **Kardex Inmutable de Movimientos de Inventario (`inventario_movimientos`):**
   - Registro cronológico inmutable de entradas, salidas, mermas por daño, mermas por vencimiento, consumo propio y reversiones de tachado.
   - Invarianza matemática de stock: $\text{stock\_resultante} = \text{stock\_anterior} \pm \text{cantidad}$, impidiendo stocks negativos.
   - Registro obligatorio de justificación ($\ge 5$ caracteres) y trazabilidad del usuario autenticado que autoriza el movimiento.
4. **Jerarquía RBAC & Auditoría Sin Ruido:**
   - `RECEPCIONISTA`: Consulta de catálogo de planes, consulta de productos/precios y uso del simulador de vencimientos. Restringido para mutaciones.
   - `SUPERVISOR` y `ADMINISTRADOR`: Gestión completa de planes, productos y registro manual de mermas/ajustes.
   - Auditoría estricta en mutaciones (`modulo = 'CATALOGO_INVENTARIO'`) con `detalles_json < 200 bytes`. Cero registros en consultas de listado o cálculos matemáticos en memoria.

---

## 2. Esquema DDL de `src-tauri/migrations/003_catalog_plans_inventory.sql`

```sql
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
        'REVERSION_TACHADO'
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
```

---

## 3. Especificación Matemática del Algoritmo *Day Overflow*

### 3.1 Planteamiento y Reglas de Negocio
En los gimnasios tradicionales, si un usuario se inscribe el **31 de enero**, suele recortársele la membresía al último día de febrero (28 o 29), perdiendo 2 o 3 días que pagó en su cuota.

**Regla de Oro ZaramaGYM:** Si el día del mes de inicio ($d$) supera la cantidad máxima de días del mes destino ($D_{\max}$), los días no disponibles en dicho mes se desbordan como días adicionales hacia el mes inmediatamente posterior.

### 3.2 Formalización Matemática

Sea la fecha de inicio $F_0 = (Y_0, m_0, d_0)$ con $Y_0 \in \mathbb{N}$, $m_0 \in [1, 12]$, $d_0 \in [1, 31]$.

1. **Determinación de Año Bisiesto:**
   $$\text{es\_bisiesto}(Y) \iff (Y \pmod 4 = 0 \land Y \pmod{100} \ne 0) \lor (Y \pmod{400} = 0)$$

2. **Días Máximos del Mes $D_{\max}(Y, m)$:**
   $$D_{\max}(Y, m) = \begin{cases} 
   31 & \text{si } m \in \{1, 3, 5, 7, 8, 10, 12\} \\ 
   30 & \text{si } m \in \{4, 6, 9, 11\} \\ 
   29 & \text{si } m = 2 \land \text{es\_bisiesto}(Y) \\ 
   28 & \text{si } m = 2 \land \neg\text{es\_bisiesto}(Y) 
   \end{cases}$$

3. **Caso A: `PASE_DIARIO` ($M = 0$):**
   - $F_{\text{fin}} = F_0$
   - $\text{timestamp\_fin} = \text{format}("{:04}-{:02}-{:02} 23:59:59", Y_0, m_0, d_0)$
   - $\text{dias\_totales} = 1$
   - $\text{hubo\_desbordamiento} = \text{false}$
   - $\text{dias\_desbordamiento} = 0$
   - $\text{explicacion} = \text{"Pase diario con vigencia exclusiva hasta las 23:59:59 del día de emisión."}$

4. **Caso B: `MENSUALIDAD` ($M \ge 1$ meses):**
   - **Paso 1: Cálculo del Mes y Año Destino:**
     $$\text{idx\_mes} = (m_0 - 1) + M$$
     $$Y_{\text{target}} = Y_0 + \lfloor \text{idx\_mes} / 12 \rfloor$$
     $$m_{\text{target}} = (\text{idx\_mes} \pmod{12}) + 1$$
   - **Paso 2: Evaluación del Desbordamiento:**
     Sea $D_{\max} = D_{\max}(Y_{\text{target}}, m_{\text{target}})$.
     - **Subcaso B.1: Si $d_0 \le D_{\max}$ (Sin desbordamiento):**
       - $F_{\text{fin}} = (Y_{\text{target}}, m_{\text{target}}, d_0)$
       - $\text{hubo\_desbordamiento} = \text{false}$
       - $\text{dias\_desbordamiento} = 0$
       - $\text{explicacion} = \text{format}("Membresía regular de {} mes(es) sin desbordamiento. Vence el día {} del mes {:02}/{:04} a las 23:59:59.", M, d_0, m_{\text{target}}, Y_{\text{target}})$
     - **Subcaso B.2: Si $d_0 > D_{\max}$ (*Day Overflow*):**
       - $\text{hubo\_desbordamiento} = \text{true}$
       - $\text{dias\_desbordamiento} = d_0 - D_{\max}$
       - $F_{\text{base}} = (Y_{\text{target}}, m_{\text{target}}, D_{\max})$
       - $F_{\text{fin}} = F_{\text{base}} + \text{Duration::days}(\text{dias\_desbordamiento})$
       - $\text{explicacion} = \text{format}("El mes destino {:02}/{:04} tiene {} días. Se compensaron {} día(s) desbordando al {:04}-{:02}-{:02} a las 23:59:59.", m_{\text{target}}, Y_{\text{target}}, D_{\max}, \text{dias\_desbordamiento}, F_{\text{fin}}.year, F_{\text{fin}}.month, F_{\text{fin}}.day)$
   - **Paso 3: Timestamp y Conteo de Días Inclusivos:**
     - $\text{timestamp\_fin} = \text{format}("{:04}-{:02}-{:02} 23:59:59", F_{\text{fin}}.year, F_{\text{fin}}.month, F_{\text{fin}}.day)$
     - $\text{dias\_totales} = (F_{\text{fin}} - F_0).\text{num\_days}() + 1$ (cálculo inclusivo de días de entrenamiento).

### 3.3 Casos de Prueba Canónicos Obligatorios

| # | Fecha Inicio | Tipo Plan | Duración | Año Destino / Bisiesto | $D_{\max}$ | Desborde ($\Delta$) | Fecha Fin (`23:59:59`) | Días Totales |
|---|---|---|---|---|---|---|---|---|
| **CP-01** | `2024-01-31` | `MENSUALIDAD` | 1 mes | 2024 (Bisiesto, Feb = 29) | 29 | **+2 días** ($31 - 29$) | `2024-03-02` | 32 días |
| **CP-02** | `2025-01-31` | `MENSUALIDAD` | 1 mes | 2025 (Común, Feb = 28) | 28 | **+3 días** ($31 - 28$) | `2025-03-03` | 32 días |
| **CP-03** | `2026-01-31` | `MENSUALIDAD` | 2 meses | 2026 (Marzo = 31) | 31 | **0 días** ($31 \le 31$) | `2026-03-31` | 60 días |
| **CP-04** | `2026-01-31` | `MENSUALIDAD` | 3 meses | 2026 (Abril = 30) | 30 | **+1 día** ($31 - 30$) | `2026-05-01` | 91 días |
| **CP-05** | `2026-05-15` | `PASE_DIARIO` | 0 meses | N/A | N/A | **0 días** | `2026-05-15` | 1 día |
| **CP-06** | `2026-08-31` | `MENSUALIDAD` | 1 mes | 2026 (Septiembre = 30) | 30 | **+1 día** ($31 - 30$) | `2026-10-01` | 32 días |
| **CP-07** | `2024-02-29` | `MENSUALIDAD` | 12 meses | 2025 (Común, Feb = 28) | 28 | **+1 día** ($29 - 28$) | `2025-03-01` | 367 días |

---

## 4. Contrato Tipado de Modelos y Comandos IPC

### 4.1 Definiciones Rust (`src-tauri/src/models/catalog.rs`)

```rust
use chrono::{Datelike, Days, NaiveDate};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

// ============================================================================
// ENUMS DE CATÁLOGO E INVENTARIO
// ============================================================================
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlanType {
    PaseDiario,
    Mensualidad,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProductCategory {
    Bebidas,
    Suplementos,
    Accesorios,
    Snacks,
    Otros,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InventoryMovementType {
    StockInicial,
    EntradaAjuste,
    EntradaCompra,
    SalidaVenta,
    MermaDanio,
    MermaVencimiento,
    ConsumoPropio,
    ReversionTachado,
}

// ============================================================================
// DTOs Y MODELOS DE PLANES
// ============================================================================
#[derive(Debug, Deserialize, Default)]
pub struct PlanFilter {
    pub search: Option<String>,
    pub tipo_plan: Option<PlanType>,
    pub solo_activos: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanListItem {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub tipo_plan: PlanType,
    pub duracion_meses: u32,
    pub precio_base: Decimal,
    pub permite_recuperacion_dias: bool,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlanInput {
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub tipo_plan: PlanType,
    pub duracion_meses: u32,
    pub precio_base: Decimal,
    pub permite_recuperacion_dias: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlanInput {
    pub nombre: String,
    pub descripcion: Option<String>,
    pub precio_base: Decimal,
    pub permite_recuperacion_dias: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanExpirationPreview {
    pub fecha_inicio: String,
    pub fecha_vencimiento_date: String,
    pub fecha_vencimiento_timestamp: String,
    pub dias_totales: i64,
    pub hubo_desbordamiento: bool,
    pub dias_desbordamiento: u32,
    pub explicacion: String,
}

// ============================================================================
// DTOs Y MODELOS DE PRODUCTOS
// ============================================================================
#[derive(Debug, Deserialize, Default)]
pub struct ProductFilter {
    pub search: Option<String>,
    pub categoria: Option<ProductCategory>,
    pub solo_activos: Option<bool>,
    pub solo_stock_bajo: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductListItem {
    pub id: i64,
    pub codigo_sku: String,
    pub nombre: String,
    pub categoria: ProductCategory,
    pub unidad_medida: String,
    pub precio_compra_referencial: Decimal,
    pub precio_venta: Decimal,
    pub stock_actual: i64,
    pub stock_minimo: i64,
    pub alerta_stock_bajo: bool,
    pub proveedor_preferido_id: Option<i64>,
    pub proveedor_nombre: Option<String>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateProductInput {
    pub codigo_sku: String,
    pub nombre: String,
    pub categoria: ProductCategory,
    pub unidad_medida: Option<String>,
    pub precio_compra_referencial: Decimal,
    pub precio_venta: Decimal,
    pub stock_inicial: i64,
    pub stock_minimo: i64,
    pub proveedor_preferido_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProductInput {
    pub nombre: String,
    pub categoria: ProductCategory,
    pub unidad_medida: Option<String>,
    pub precio_compra_referencial: Decimal,
    pub precio_venta: Decimal,
    pub stock_minimo: i64,
    pub proveedor_preferido_id: Option<i64>,
}

// ============================================================================
// DTOs Y MODELOS DE MOVIMIENTOS DE INVENTARIO Y MERMAS
// ============================================================================
#[derive(Debug, Deserialize, Default)]
pub struct InventoryMovementFilter {
    pub producto_id: Option<i64>,
    pub tipo_movimiento: Option<InventoryMovementType>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryMovementItem {
    pub id: i64,
    pub producto_id: i64,
    pub producto_sku: String,
    pub producto_nombre: String,
    pub tipo_movimiento: InventoryMovementType,
    pub signo: String,
    pub cantidad: i64,
    pub stock_anterior: i64,
    pub stock_resultante: i64,
    pub costo_unitario_momento: Decimal,
    pub motivo_justificacion: String,
    pub registrado_por_usuario_id: i64,
    pub registrado_por_username: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct RecordInventoryMovementInput {
    pub producto_id: i64,
    pub tipo_movimiento: InventoryMovementType,
    pub cantidad: i64,
    pub costo_unitario_momento: Option<Decimal>,
    pub motivo_justificacion: String,
}
```

---

### 4.2 Lista de Comandos Tauri v2 (`catalog_commands.rs`)

| # | Comando IPC | Parámetros | Retorno | RBAC Guard | Auditoría Log |
|---|---|---|---|---|---|
| **1** | `list_plans` | `filter: Option<PlanFilter>` | `Result<Vec<PlanListItem>, AppError>` | Todos (`RECEPCIONISTA`, `SUPERVISOR`, `ADMINISTRADOR`) | Cero (Sin ruido) |
| **2** | `create_plan` | `input: CreatePlanInput` | `Result<PlanListItem, AppError>` | `require_supervisor_or_admin` | `PLAN_CREATED` (`< 200 B`) |
| **3** | `update_plan` | `plan_id: i64, input: UpdatePlanInput` | `Result<PlanListItem, AppError>` | `require_supervisor_or_admin` | `PLAN_UPDATED` (`< 200 B`) |
| **4** | `toggle_plan_active` | `plan_id: i64, active: bool` | `Result<(), AppError>` | `require_supervisor_or_admin` | `PLAN_ACTIVATED` / `PLAN_DEACTIVATED` |
| **5** | `preview_plan_expiration` | `fecha_inicio: String, tipo_plan: String, duracion_meses: u32` | `Result<PlanExpirationPreview, AppError>` | Todos (`RECEPCIONISTA`, `SUPERVISOR`, `ADMINISTRADOR`) | Cero (Sin ruido) |
| **6** | `list_products` | `filter: Option<ProductFilter>` | `Result<Vec<ProductListItem>, AppError>` | Todos (`RECEPCIONISTA`, `SUPERVISOR`, `ADMINISTRADOR`) | Cero (Sin ruido) |
| **7** | `create_product` | `input: CreateProductInput` | `Result<ProductListItem, AppError>` | `require_supervisor_or_admin` | `PRODUCT_CREATED` (+ `STOCK_INICIAL` en Kardex si stock > 0) |
| **8** | `update_product` | `product_id: i64, input: UpdateProductInput` | `Result<ProductListItem, AppError>` | `require_supervisor_or_admin` | `PRODUCT_UPDATED` (No altera stock físico) |
| **9** | `toggle_product_active` | `product_id: i64, active: bool` | `Result<(), AppError>` | `require_supervisor_or_admin` | `PRODUCT_ACTIVATED` / `PRODUCT_DEACTIVATED` |
| **10** | `record_inventory_movement` | `input: RecordInventoryMovementInput` | `Result<InventoryMovementItem, AppError>` | `require_supervisor_or_admin` | `INVENTORY_MOVEMENT_RECORDED` (`< 200 B`) |
| **11** | `list_inventory_movements` | `filter: Option<InventoryMovementFilter>` | `Result<Vec<InventoryMovementItem>, AppError>` | Todos (`RECEPCIONISTA`, `SUPERVISOR`, `ADMINISTRADOR`) | Cero (Sin ruido) |

---

### 4.3 Reglas de Negocio en Comandos

1. **Creación de Producto con Stock Inicial:**
   - Si `input.stock_inicial > 0`, se ejecuta dentro de la misma transacción:
     1. Inserción en `productos` con `stock_actual = input.stock_inicial`.
     2. Inserción en `inventario_movimientos` con:
        - `tipo_movimiento = 'STOCK_INICIAL'`
        - `signo = '+'`
        - `cantidad = input.stock_inicial`
        - `stock_anterior = 0`
        - `stock_resultante = input.stock_inicial`
        - `costo_unitario_momento = input.precio_compra_referencial`
        - `motivo_justificacion = 'Inventario inicial al dar de alta el producto'`
        - `registrado_por_usuario_id = session.user_id`
2. **Edición Segura de Producto (`update_product`):**
   - Modifica metadatos (`nombre`, `categoria`, `unidad_medida`, `precio_compra_referencial`, `precio_venta`, `stock_minimo`, `proveedor_preferido_id`).
   - **Prohibido** alterar `stock_actual` desde este comando. El stock físico solo cambia mediante `record_inventory_movement` o futuras compras/ventas.
3. **Registro Manual de Movimiento / Merma / Consumo Propio:**
   - Tipos autorizados para el comando `record_inventory_movement`:
     - `'ENTRADA_AJUSTE'` $\rightarrow$ signo `+`
     - `'MERMA_DANIO'` $\rightarrow$ signo `-`
     - `'MERMA_VENCIMIENTO'` $\rightarrow$ signo `-`
     - `'CONSUMO_PROPIO'` $\rightarrow$ signo `-`
   - Validación de Justificación: `motivo_justificacion.trim().len() >= 5`.
   - Validación de Cantidad: `cantidad > 0`.
   - Control de No Negatividad: En movimientos de signo `-`, si $\text{stock\_anterior} < \text{cantidad}$, el comando rechaza la operación inmediatamente con:
     `AppError::Validation("Stock insuficiente para aplicar salida. Stock actual: X, solicitado: Y")`.
   - Actualización Transaccional: Actualiza `productos.stock_actual = stock_resultante` y `updated_at = now()`.

---

## 5. Tipos de TypeScript (`src/types/catalog.ts`)

```typescript
export type PlanType = 'PASE_DIARIO' | 'MENSUALIDAD';

export type ProductCategory = 
  | 'BEBIDAS' 
  | 'SUPLEMENTOS' 
  | 'ACCESORIOS' 
  | 'SNACKS' 
  | 'OTROS';

export type InventoryMovementType =
  | 'STOCK_INICIAL'
  | 'ENTRADA_AJUSTE'
  | 'ENTRADA_COMPRA'
  | 'SALIDA_VENTA'
  | 'MERMA_DANIO'
  | 'MERMA_VENCIMIENTO'
  | 'CONSUMO_PROPIO'
  | 'REVERSION_TACHADO';

// Planes
export interface PlanListItem {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo_plan: PlanType;
  duracion_meses: number;
  precio_base: string; // DECIMAL(10,2) formateado
  permite_recuperacion_dias: boolean;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanFilter {
  search?: string;
  tipo_plan?: PlanType;
  solo_activos?: boolean;
}

export interface CreatePlanInput {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  tipo_plan: PlanType;
  duracion_meses: number;
  precio_base: string;
  permite_recuperacion_dias: boolean;
}

export interface UpdatePlanInput {
  nombre: string;
  descripcion?: string | null;
  precio_base: string;
  permite_recuperacion_dias: boolean;
}

export interface PlanExpirationPreview {
  fecha_inicio: string;
  fecha_vencimiento_date: string;
  fecha_vencimiento_timestamp: string;
  dias_totales: number;
  hubo_desbordamiento: boolean;
  dias_desbordamiento: number;
  explicacion: string;
}

// Productos
export interface ProductListItem {
  id: number;
  codigo_sku: string;
  nombre: string;
  categoria: ProductCategory;
  unidad_medida: string;
  precio_compra_referencial: string;
  precio_venta: string;
  stock_actual: number;
  stock_minimo: number;
  alerta_stock_bajo: boolean;
  proveedor_preferido_id: number | null;
  proveedor_nombre: string | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductFilter {
  search?: string;
  categoria?: ProductCategory;
  solo_activos?: boolean;
  solo_stock_bajo?: boolean;
}

export interface CreateProductInput {
  codigo_sku: string;
  nombre: string;
  categoria: ProductCategory;
  unidad_medida?: string;
  precio_compra_referencial: string;
  precio_venta: string;
  stock_inicial: number;
  stock_minimo: number;
  proveedor_preferido_id?: number | null;
}

export interface UpdateProductInput {
  nombre: string;
  categoria: ProductCategory;
  unidad_medida?: string;
  precio_compra_referencial: string;
  precio_venta: string;
  stock_minimo: number;
  proveedor_preferido_id?: number | null;
}

// Kardex / Movimientos
export interface InventoryMovementItem {
  id: number;
  producto_id: number;
  producto_sku: string;
  producto_nombre: string;
  tipo_movimiento: InventoryMovementType;
  signo: '+' | '-';
  cantidad: number;
  stock_anterior: number;
  stock_resultante: number;
  costo_unitario_momento: string;
  motivo_justificacion: string;
  registrado_por_usuario_id: number;
  registrado_por_username: string;
  created_at: string;
}

export interface InventoryMovementFilter {
  producto_id?: number;
  tipo_movimiento?: InventoryMovementType;
  limit?: number;
  offset?: number;
}

export interface RecordInventoryMovementInput {
  producto_id: number;
  tipo_movimiento: 'ENTRADA_AJUSTE' | 'MERMA_DANIO' | 'MERMA_VENCIMIENTO' | 'CONSUMO_PROPIO';
  cantidad: number;
  costo_unitario_momento?: string;
  motivo_justificacion: string;
}
```

---

## 6. Arquitectura Frontend (Capa 1 y Capa 2)

```
src/
├── types/
│   └── catalog.ts                   # Interfaces TypeScript tipadas
├── domain/
│   └── catalog.ts                   # Validaciones de negocio y algoritmo Day Overflow del cliente
├── services/
│   └── ipc/
│       └── catalogIpc.ts            # Envoltorios Tauri IPC invoke
├── hooks/
│   └── useCatalog.ts                # Hook de estado reactivo y mutaciones
└── features/
    └── catalog/
        ├── CatalogView.tsx          # Vista principal con 3 pestañas
        └── components/
            ├── PlanListTab.tsx      # Listado de Planes + Simulador Day Overflow
            ├── PlanFormModal.tsx    # Modal de alta/edición de plan
            ├── ProductListTab.tsx   # Inventario de Productos + Alertas de Stock Bajo
            ├── ProductFormModal.tsx # Modal de alta/edición de producto
            ├── MovementHistoryTab.tsx # Kardex inmutable de movimientos
            └── InventoryMovementModal.tsx # Modal de registro de mermas/ajustes
```

### 6.1 Matriz de Estados de UI (Frontend Capa 2)

| Componente | ⏳ Loading | 📭 Empty | ❌ Error | ✅ Success |
|---|---|---|---|---|
| **`PlanListTab`** | Skeletons de tarjetas o filas de planes. | "No hay planes configurados en el catálogo" + botón nuevo plan. | Banner de error con botón "Reintentar". | Cards/Filas con badge de duración, precio `S/ XX.XX`, switch activo y botón simular. |
| **Simulador _Day Overflow_** | Cálculo síncrono instantáneo. | "Selecciona una fecha y un plan para simular vencimiento". | Mensaje "Fecha de inicio inválida". | Tarjeta destacada con fecha fin `YYYY-MM-DD 23:59:59`, tag de desbordamiento (+X días) y explicación clara. |
| **`ProductListTab`** | Skeleton animado en tabla de inventario. | "No hay productos registrados en el inventario". | Alerta con opción de reintento. | Tabla con stock actual, badge rojo de "STOCK BAJO" si $\le \text{min}$, filtro rápido por categoría y switch activo. |
| **`MovementHistoryTab`** | Spinner "Cargando movimientos del kardex..." | "No se registran movimientos en el historial". | Error al cargar bitácora de kardex. | Tabla inmutable con badges de colores (+ Verde, - Naranja/Rojo para mermas), stock antes/después y motivo. |
| **`InventoryMovementModal`** | Botón "Asentando movimiento..." (disabled). | N/A | Alerta de validación (ej. motivo < 5 caracteres o stock insuficiente). | Cierre de modal, toast de confirmación y recarga del stock y kardex. |

### 6.2 Adaptación Ergonómica por Rol (RBAC Frontend)
- **`RECEPCIONISTA`:**
  - Puede explorar todas las pestañas, buscar planes y simular vencimientos de membresías para cotizar a clientes.
  - En la pestaña de productos, consulta precios de venta y disponibilidad de stock en tiempo real.
  - Los botones `[+ Nuevo Plan]`, `[Editar Plan]`, `[+ Nuevo Producto]`, `[Editar Producto]` y `[Registrar Merma/Ajuste]` se muestran ocultos o deshabilitados con tooltip *"Acción reservada para Supervisores y Administradores"*.
- **`SUPERVISOR` y `ADMINISTRADOR`:**
  - Acceso total para crear/modificar planes, crear/editar productos y registrar mermas o consumos propios.

---

## 7. Criterios de Aceptación y Verificación Técnica

1. **Integridad de Migración DDL:**
   - La migración `003_catalog_plans_inventory.sql` se ejecuta limpiamente con `PRAGMA foreign_keys = ON;`.
   - Se insertan los 4 planes semilla (`PASE-DIA`, `PLAN-1M`, `PLAN-2M`, `PLAN-3M`).
2. **Precisión Matemática del Algoritmo *Day Overflow*:**
   - Los 7 casos de prueba canónicos obligatorios (**CP-01** a **CP-07**) se evalúan y pasan en verde tanto en las pruebas unitarias de Rust (`tests/plan_overflow_test.rs`) como en el frontend de TypeScript.
   - El Pase Diario siempre expira a las `23:59:59` de la misma fecha de inicio (`dias_totales = 1`).
3. **Invarianza del Kardex y Control de Stock:**
   - Todo alta de producto con `stock_inicial > 0` genera automáticamente el movimiento `STOCK_INICIAL` en `inventario_movimientos`.
   - Ningún movimiento de tipo merma o salida puede dejar el `stock_actual` por debajo de 0.
   - La edición de metadatos de producto no altera el stock físico.
4. **Auditoría Sin Ruido:**
   - Mutaciones de planes, productos y mermas generan filas en `auditoria_logs` con `detalles_json < 200 bytes`.
   - Las consultas de listado (`list_plans`, `list_products`, `list_inventory_movements`) y la simulación `preview_plan_expiration` generan estrictamente **cero** registros en `auditoria_logs`.
5. **Compilación y Cohesión:**
   - `cargo test` y `cargo check` compilan sin errores ni warnings.
   - `npm run build` y `npm run test` ejecutan limpiamente en el frontend.