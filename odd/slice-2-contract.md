# 📋 CONTRATO TÉCNICO EJECUTABLE: SLICE 2
**Directorio Segmentado (Personas, Empresas, Clientes con Historial de Peso, Proveedores Polimórficos) y Credencial QR**

---

## 1. Contexto & Objetivos del Slice 2

El **Slice 2** implementa el directorio segmentado y especializado de ZaramaGYM bajo un modelo relacional limpio sin tablas genéricas:
1. **Directorio Segmentado de Personas Naturales (`personas`):** Gestión centralizada de personas humanas con sus respectivos vínculos (`es_cliente: bool`, `es_proveedor: bool`, `rol_usuario: Option<UserRole>`).
2. **Empresas Jurídicas RUC 20 (`empresas`):** Tabla maestra exclusiva para personas jurídicas con validación formal de 11 dígitos iniciando en `'20'`, razón social y nombre comercial.
3. **Módulo de Clientes (`clientes`) & Récord Histórico de Peso (`cliente_pesos_historial`):**
   - Entidad hija 1:1 de `personas` con credencial QR única `ZG-<16 HEX CSPRNG>`.
   - Contactos de emergencia y notas médicas.
   - Historial de peso corporal en `DECIMAL(10,2)` (`rust_decimal`) con cálculo automático de variación ($\Delta \text{ kg} = \text{nuevo\_peso} - \text{peso\_anterior}$) y actualización del `peso_actual_kg` más reciente.
4. **Proveedores Polimórficos Limpios (`proveedores`):** Proveedores asociados a una `persona_id` (Persona Natural con negocio RUC 10/15/17 o DNI) O a una `empresa_id` (Empresa Jurídica RUC 20), asegurados por `CHECK` mutuamente excluyente.
5. **Jerarquía Estricta de 3 Roles y Visibilidad Aislada:**
   $$\text{RECEPCIONISTA} < \text{SUPERVISOR} < \text{ADMINISTRADOR}$$
   - **Regla de Oro:** Ningún operador puede ver ni alterar personas que pertenezcan a usuarios de jerarquía igual o superior a la suya.
6. **Política Zero-Delete & Auditoría Sin Ruido:** Mutaciones registradas en `auditoria_logs` (`modulo = 'DIRECTORIO'`) con `detalles_json < 200 bytes`. Prohibido auditar lecturas (`SELECT`).

---

## 2. Esquema DDL de `src-tauri/migrations/002_entities_directory.sql`

```sql
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
```

---

## 3. Reglas de Negocio, Dominio y RBAC Jerárquico

### 3.1 Regla Estricta de Jerarquía y Visibilidad de Personas

Cada consulta sobre la tabla `personas` calcula sus vínculos mediante `LEFT JOIN` a `clientes`, `proveedores` y `usuarios_sistema`.

```sql
SELECT 
    p.*,
    (c.id IS NOT NULL) AS es_cliente,
    (prov.id IS NOT NULL) AS es_proveedor,
    u.rol_principal AS rol_usuario
FROM personas p
LEFT JOIN clientes c ON c.persona_id = p.id
LEFT JOIN proveedores prov ON prov.persona_id = p.id
LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
```

#### Aislamiento según el Rol del Operador en Sesión:

| Rol del Operador | Regla de Visibilidad en SQL (`WHERE`) | Restricciones de CRUD y Mutación |
| :--- | :--- | :--- |
| **`ADMINISTRADOR`** | **Sin filtro:** Ve a **todas** las personas (`u.id IS NULL`, `RECEPCIONISTA`, `SUPERVISOR`, `ADMINISTRADOR`). | CRUD completo sobre todas las personas. **Defensa:** No puede auto-desactivar la persona de su sesión ni la persona del Administrador Root (`id = 1`). |
| **`SUPERVISOR`** | `WHERE (u.id IS NULL OR u.rol_principal = 'RECEPCIONISTA')` | Ve personas sin rol de sistema y personas con rol `RECEPCIONISTA`. **Invisibilidad y Bloqueo Total:** Las personas con `rol_principal IN ('SUPERVISOR', 'ADMINISTRADOR')` **NO aparecen** en sus listados. Si intenta consultar (`get_person`), modificar (`update_person`) o alternar (`toggle_person_active`) a una de ellas, el backend responde `AppError::Forbidden`. |
| **`RECEPCIONISTA`** | `WHERE u.id IS NULL` | Ve **únicamente** personas **sin ningún rol de usuario** en el sistema (personas independientes, clientes y proveedores personas naturales). **Invisibilidad y Bloqueo Total:** Ninguna persona con usuario del sistema (`RECEPCIONISTA`, `SUPERVISOR`, `ADMINISTRADOR`) es visible. Si intenta interactuar con una de ellas por ID, recibe `AppError::Forbidden`. |

---

### 3.2 Dominio de Clientes y Récord de Pesos

1. **Credencial QR Local-First:**
   - Token único con formato criptográfico `ZG-<16 HEX CSPRNG>` (ejemplo: `ZG-8A7B4C2D0E1F9A3B`).
   - Comando `regenerate_client_qr` invalida el token previo y genera uno nuevo dejando registro en auditoría.
   - Generación de enlace de WhatsApp Web 1-clic: `https://wa.me/51{telefono}?text={mensaje}`.
2. **Registro de Peso y Variación Automática (`record_client_weight`):**
   - Entrada: `cliente_id`, `peso_kg: Decimal`, `nota: Option<String>`.
   - Lógica Transaccional:
     1. Obtiene el último registro de `cliente_pesos_historial` para ese `cliente_id` ordenado por `fecha_registro DESC`.
     2. Si **no existen registros previos**: `variacion_kg = 0.00`.
     3. Si **existe registro previo**: $\text{variacion\_kg} = \text{nuevo\_peso\_kg} - \text{ultimo\_peso\_kg}$.
     4. Inserta el nuevo registro en `cliente_pesos_historial` vinculando `registrado_por_usuario_id = current_session.user_id`.
     5. Actualiza `clientes.peso_actual_kg = nuevo_peso_kg` y `clientes.updated_at = now`.
     6. Registra auditoría `CLIENT_WEIGHT_RECORDED` con `{"cliente_id": X, "peso_kg": "75.50", "variacion_kg": "-1.20"}`.
3. **Consulta Histórica (`get_client_weight_history`):**
   - Retorna la lista cronológica descendente de pesos, mostrando fecha, peso, variación en kg, nota y username de quien registró.

---

### 3.3 Dominio de Empresas y Proveedores Polimórficos

1. **Empresas Jurídicas RUC 20:**
   - `ruc`: Debe constar de exactamente 11 dígitos numéricos que comiencen con `'20'` (`^20\d{9}$`).
   - `razon_social`: Nombre formal registrado en Sunat.
   - `nombre_comercial`: Nombre de fantasía o marca (opcional).
2. **Proveedores:**
   - `tipo_proveedor = 'PERSONA_NATURAL'`: Requiere `persona_id` y fuerza `empresa_id = NULL`.
   - `tipo_proveedor = 'EMPRESA'`: Requiere `empresa_id` y fuerza `persona_id = NULL`.
   - Garantizado en DB por la restricción `CHECK`.
3. **Acceso RBAC:**
   - Tanto `ADMINISTRADOR`, `SUPERVISOR` como `RECEPCIONISTA` tienen acceso operativo para listar, crear y actualizar clientes y proveedores.
   - Si un cliente o proveedor estuviese vinculado a una `persona` que corresponde a un usuario de nivel superior/invisible, las reglas de jerarquía descritas en la sección 3.1 impiden su acceso o modificación a los roles de menor rango.

---

## 4. Contrato Tipado de Comandos IPC (Rust <-> TypeScript)

### 4.1 Lista de Comandos Tauri v2

| # | Comando IPC | Parámetros | Retorno | Acceso / RBAC |
|---|-------------|------------|---------|---------------|
| **MÓDULO PERSONAS** | | | | |
| 1 | `list_persons` | `filter: PersonFilter` | `Result<Vec<PersonListItem>, AppError>` | `ADMINISTRADOR`, `SUPERVISOR`, `RECEPCIONISTA` (aplica filtro de jerarquía en SQL). |
| 2 | `get_person` | `person_id: i64` | `Result<PersonDetail, AppError>` | Aplica regla de jerarquía (bloquea superiores/iguales según rol). |
| 3 | `create_person` | `input: CreatePersonInput` | `Result<PersonDetail, AppError>` | `ADMINISTRADOR`, `SUPERVISOR`, `RECEPCIONISTA`. Crea persona natural. |
| 4 | `update_person` | `person_id: i64, input: UpdatePersonInput` | `Result<PersonDetail, AppError>` | Aplica regla de jerarquía (rechaza con `Forbidden` si es superior/igual). |
| 5 | `toggle_person_active` | `person_id: i64, active: bool` | `Result<(), AppError>` | Aplica jerarquía. Impide auto-desactivación de la persona de la sesión o admin root. |
| **MÓDULO CLIENTES** | | | | |
| 6 | `list_clients` | `filter: ClientFilter` | `Result<Vec<ClientListItem>, AppError>` | `ADMINISTRADOR`, `SUPERVISOR`, `RECEPCIONISTA` (aplica filtro jerárquico de persona). |
| 7 | `get_client` | `client_id: i64` | `Result<ClientDetail, AppError>` | Consulta cliente por ID y datos de su persona. |
| 8 | `create_client` | `input: CreateClientInput` | `Result<ClientDetail, AppError>` | Crea o vincula persona, genera token QR `ZG-...`, peso inicial opcional y registra auditoría. |
| 9 | `update_client` | `client_id: i64, input: UpdateClientInput` | `Result<ClientDetail, AppError>` | Actualiza notas médicas, contactos de emergencia y datos personales. |
| 10 | `toggle_client_active` | `client_id: i64, active: bool` | `Result<(), AppError>` | Baja lógica sin borrado físico. |
| 11 | `regenerate_client_qr` | `client_id: i64` | `Result<String, AppError>` | Emite nuevo token `ZG-<16 HEX>` criptográfico. |
| 12 | `record_client_weight` | `input: RecordWeightInput` | `Result<ClientWeightRecord, AppError>` | Registra peso, calcula variación automática y actualiza `peso_actual_kg`. |
| 13 | `get_client_weight_history` | `client_id: i64` | `Result<Vec<ClientWeightRecord>, AppError>` | Récord histórico de pesos ordenado cronológicamente desc. |
| **MÓDULO EMPRESAS & PROVEEDORES** | | | | |
| 14 | `list_companies` | `filter: CompanyFilter` | `Result<Vec<CompanyListItem>, AppError>` | Directorio de empresas jurídicas RUC 20. |
| 15 | `get_company` | `company_id: i64` | `Result<CompanyDetail, AppError>` | Detalle de empresa jurídica. |
| 16 | `create_company` | `input: CreateCompanyInput` | `Result<CompanyDetail, AppError>` | Registra empresa validando RUC 20 de 11 dígitos. |
| 17 | `update_company` | `company_id: i64, input: UpdateCompanyInput` | `Result<CompanyDetail, AppError>` | Modifica razón social, nombre comercial o contacto. |
| 18 | `toggle_company_active` | `company_id: i64, active: bool` | `Result<(), AppError>` | Alterna estado activo de la empresa jurídica. |
| 19 | `list_suppliers` | `filter: SupplierFilter` | `Result<Vec<SupplierListItem>, AppError>` | Proveedores polimórficos (Persona Natural o Empresa). |
| 20 | `get_supplier` | `supplier_id: i64` | `Result<SupplierDetail, AppError>` | Detalle de proveedor unificado. |
| 21 | `create_supplier` | `input: CreateSupplierInput` | `Result<SupplierDetail, AppError>` | Vincula persona o empresa con rubro y contacto de referencia. |
| 22 | `update_supplier` | `supplier_id: i64, input: UpdateSupplierInput` | `Result<SupplierDetail, AppError>` | Actualiza rubro y contacto de referencia del proveedor. |
| 23 | `toggle_supplier_active` | `supplier_id: i64, active: bool` | `Result<(), AppError>` | Alterna estado activo del proveedor. |

---

### 4.2 Definiciones de Modelos y DTOs en Rust (`src-tauri/src/models/`)

```rust
// ============================================================================
// MODELOS DE PERSONAS (src-tauri/src/models/person.rs)
// ============================================================================
use serde::{Deserialize, Serialize};
use super::user::UserRole;

#[derive(Debug, Deserialize, Default)]
pub struct PersonFilter {
    pub search: Option<String>,
    pub solo_activos: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonListItem {
    pub id: i64,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub es_cliente: bool,
    pub es_proveedor: bool,
    pub rol_usuario: Option<UserRole>,
    pub estado_activo: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonDetail {
    pub id: i64,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub es_cliente: bool,
    pub cliente_id: Option<i64>,
    pub es_proveedor: bool,
    pub proveedor_id: Option<i64>,
    pub rol_usuario: Option<UserRole>,
    pub usuario_id: Option<i64>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePersonInput {
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePersonInput {
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
}

// ============================================================================
// MODELOS DE CLIENTES Y PESOS (src-tauri/src/models/client.rs)
// ============================================================================
use rust_decimal::Decimal;

#[derive(Debug, Deserialize, Default)]
pub struct ClientFilter {
    pub search: Option<String>,
    pub solo_activos: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientListItem {
    pub id: i64, // cliente_id
    pub persona_id: i64,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub codigo_qr_token: String,
    pub peso_actual_kg: Option<Decimal>,
    pub estado_activo: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientDetail {
    pub id: i64, // cliente_id
    pub persona_id: i64,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub codigo_qr_token: String,
    pub nombre_contacto_emergencia: Option<String>,
    pub numero_contacto_emergencia: Option<String>,
    pub notas_medicas: Option<String>,
    pub peso_actual_kg: Option<Decimal>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateClientInput {
    pub persona_id: Option<i64>, // Si ya existe la persona
    pub tipo_documento: Option<String>,
    pub numero_documento: Option<String>,
    pub nombres: Option<String>,
    pub apellidos: Option<String>,
    pub fecha_nacimiento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub nombre_contacto_emergencia: Option<String>,
    pub numero_contacto_emergencia: Option<String>,
    pub notas_medicas: Option<String>,
    pub peso_inicial_kg: Option<Decimal>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateClientInput {
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub nombre_contacto_emergencia: Option<String>,
    pub numero_contacto_emergencia: Option<String>,
    pub notas_medicas: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RecordWeightInput {
    pub cliente_id: i64,
    pub peso_kg: Decimal,
    pub nota: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientWeightRecord {
    pub id: i64,
    pub cliente_id: i64,
    pub peso_kg: Decimal,
    pub variacion_kg: Decimal,
    pub nota: Option<String>,
    pub registrado_por_usuario_id: Option<i64>,
    pub registrado_por_username: Option<String>,
    pub fecha_registro: String,
}

// ============================================================================
// MODELOS DE EMPRESAS Y PROVEEDORES (src-tauri/src/models/supplier.rs)
// ============================================================================
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SupplierType {
    PersonaNatural,
    Empresa,
}

#[derive(Debug, Deserialize, Default)]
pub struct CompanyFilter {
    pub search: Option<String>,
    pub solo_activos: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyListItem {
    pub id: i64,
    pub ruc: String,
    pub razon_social: String,
    pub nombre_comercial: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub estado_activo: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyDetail {
    pub id: i64,
    pub ruc: String,
    pub razon_social: String,
    pub nombre_comercial: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCompanyInput {
    pub ruc: String,
    pub razon_social: String,
    pub nombre_comercial: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCompanyInput {
    pub razon_social: String,
    pub nombre_comercial: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct SupplierFilter {
    pub search: Option<String>,
    pub tipo_proveedor: Option<SupplierType>,
    pub solo_activos: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierListItem {
    pub id: i64,
    pub tipo_proveedor: SupplierType,
    pub persona_id: Option<i64>,
    pub empresa_id: Option<i64>,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombre_o_razon_social: String,
    pub nombre_comercial: Option<String>,
    pub rubro_o_categoria: Option<String>,
    pub contacto_referencia: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub estado_activo: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupplierDetail {
    pub id: i64,
    pub tipo_proveedor: SupplierType,
    pub persona_id: Option<i64>,
    pub empresa_id: Option<i64>,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombre_o_razon_social: String,
    pub nombre_comercial: Option<String>,
    pub rubro_o_categoria: Option<String>,
    pub contacto_referencia: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSupplierInput {
    pub tipo_proveedor: SupplierType,
    pub persona_id: Option<i64>,
    pub empresa_id: Option<i64>,
    pub rubro_o_categoria: Option<String>,
    pub contacto_referencia: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSupplierInput {
    pub rubro_o_categoria: Option<String>,
    pub contacto_referencia: Option<String>,
}
```

---

### 4.3 Definiciones de Tipos en TypeScript (`src/types/`)

#### A. Tipos de Personas (`src/types/person.ts`)
```typescript
import { UserRole } from './auth';

export type PersonDocumentType = 'DNI' | 'RUC' | 'CE' | 'PASAPORTE' | 'OTRO';

export interface PersonListItem {
  id: number;
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  email: string | null;
  es_cliente: boolean;
  es_proveedor: boolean;
  rol_usuario: UserRole | null;
  estado_activo: boolean;
  created_at: string;
}

export interface PersonDetail {
  id: number;
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  es_cliente: boolean;
  cliente_id: number | null;
  es_proveedor: boolean;
  proveedor_id: number | null;
  rol_usuario: UserRole | null;
  usuario_id: number | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonFilter {
  search?: string;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreatePersonInput {
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

export interface UpdatePersonInput {
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}
```

#### B. Tipos de Clientes y Pesos (`src/types/client.ts`)
```typescript
import { PersonDocumentType } from './person';

export interface ClientListItem {
  id: number;
  persona_id: number;
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  email: string | null;
  codigo_qr_token: string;
  peso_actual_kg: string | null; // Mapeado de DECIMAL(10,2)
  estado_activo: boolean;
  created_at: string;
}

export interface ClientDetail {
  id: number;
  persona_id: number;
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  codigo_qr_token: string;
  nombre_contacto_emergencia: string | null;
  numero_contacto_emergencia: string | null;
  notas_medicas: string | null;
  peso_actual_kg: string | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientFilter {
  search?: string;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateClientInput {
  persona_id?: number | null;
  tipo_documento?: PersonDocumentType;
  numero_documento?: string;
  nombres?: string;
  apellidos?: string;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  nombre_contacto_emergencia?: string | null;
  numero_contacto_emergencia?: string | null;
  notas_medicas?: string | null;
  peso_inicial_kg?: string | null;
}

export interface UpdateClientInput {
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  nombre_contacto_emergencia?: string | null;
  numero_contacto_emergencia?: string | null;
  notas_medicas?: string | null;
}

export interface RecordWeightInput {
  cliente_id: number;
  peso_kg: string; // Formato "72.50"
  nota?: string | null;
}

export interface ClientWeightRecord {
  id: number;
  cliente_id: number;
  peso_kg: string;
  variacion_kg: string;
  nota: string | null;
  registrado_por_usuario_id: number | null;
  registrado_por_username: string | null;
  fecha_registro: string;
}
```

#### C. Tipos de Empresas y Proveedores (`src/types/supplier.ts`)
```typescript
export type SupplierType = 'PERSONA_NATURAL' | 'EMPRESA';

export interface CompanyListItem {
  id: number;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  telefono: string | null;
  email: string | null;
  estado_activo: boolean;
  created_at: string;
}

export interface CompanyDetail {
  id: number;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyFilter {
  search?: string;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateCompanyInput {
  ruc: string;
  razon_social: string;
  nombre_comercial?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

export interface UpdateCompanyInput {
  razon_social: string;
  nombre_comercial?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

export interface SupplierListItem {
  id: number;
  tipo_proveedor: SupplierType;
  persona_id: number | null;
  empresa_id: number | null;
  tipo_documento: string;
  numero_documento: string;
  nombre_o_razon_social: string;
  nombre_comercial: string | null;
  rubro_o_categoria: string | null;
  contacto_referencia: string | null;
  telefono: string | null;
  email: string | null;
  estado_activo: boolean;
  created_at: string;
}

export interface SupplierDetail {
  id: number;
  tipo_proveedor: SupplierType;
  persona_id: number | null;
  empresa_id: number | null;
  tipo_documento: string;
  numero_documento: string;
  nombre_o_razon_social: string;
  nombre_comercial: string | null;
  rubro_o_categoria: string | null;
  contacto_referencia: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierFilter {
  search?: string;
  tipo_proveedor?: SupplierType;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateSupplierInput {
  tipo_proveedor: SupplierType;
  persona_id?: number | null;
  empresa_id?: number | null;
  rubro_o_categoria?: string | null;
  contacto_referencia?: string | null;
}

export interface UpdateSupplierInput {
  rubro_o_categoria?: string | null;
  contacto_referencia?: string | null;
}
```

---

## 5. Matriz de Estados de UI (Frontend Capa 2)

| Componente | ⏳ Loading | 📭 Empty | ❌ Error | ✅ Success |
|---|---|---|---|---|
| **`PersonDirectoryView`** | Skeleton animado en tabla durante carga o búsqueda. | "No se encontraron personas registradas" + botón "Registrar Persona". | Alerta roja con botón "Reintentar búsqueda". | Tabla con badges de roles vinculados (`Cliente`, `Proveedor`, `Usuario: SUPERVISOR`), status activo y acciones según jerarquía. |
| **`ClientDirectoryView`** | Skeleton de tarjetas o filas de socios. | "No hay clientes registrados" + botón "Inscribir Cliente". | Mensaje de error de conexión o base de datos. | Listado completo con token QR legible, último peso registrado y botones rápidos de acción. |
| **`ClientWeightModal`** | Spinner "Guardando registro de peso..." | "Sin récords de peso previos. Registra el peso inicial." | "Error al registrar peso (valor fuera de rango o inválido)" | Historial cronológico con badge de variación (+0.8 kg verde/rojo) y peso actual actualizado. |
| **`QrCredentialModal`** | Skeleton de tarjeta credencial. | "El cliente no cuenta con credencial válida". | Fallo de regeneración con botón "Reintentar". | Renderizado nítido de QR SVG/Canvas, descarga PNG y botón "Enviar por WhatsApp". |
| **`SupplierManagementView`** | Skeleton en tabla de proveedores. | "No se encontraron proveedores registrados". | Alerta con opción de reintento. | Listado unificado discriminando Persona Natural vs Empresa RUC 20. |

---

## 6. Generador de Credencial QR e Integración WhatsApp

1. **Local-First sin Internet:**
   - La credencial se dibuja en el navegador usando un elemento `<canvas>` o `<svg>` a partir del string `codigo_qr_token`.
   - Permite descargar la imagen `.png` sin consultar ningún servicio web externo.
2. **Generador de Enlace WhatsApp:**
   ```typescript
   export function buildWhatsAppWelcomeLink(
     telefono: string | null | undefined,
     nombreCompleto: string,
     codigoQrToken: string
   ): string | null {
     if (!telefono) return null;
     const digits = telefono.replace(/\D/g, '');
     if (digits.length < 9) return null;
     const phoneFormatted = digits.length === 9 ? `51${digits}` : digits;

     const message = encodeURIComponent(
       `¡Hola, ${nombreCompleto}! 👋 Te damos la bienvenida a ZaramaGYM.\n\n` +
       `Tu credencial digital de socio es: *${codigoQrToken}*\n\n` +
       `Preséntala en recepción desde tu celular o indícala para ingresar al gimnasio. ¡Nos vemos en el entrenamiento! 🏋️‍♂️`
     );

     return `https://wa.me/${phoneFormatted}?text=${message}`;
   }
   ```

---

## 7. Criterios de Aceptación y Verificación Técnica

1. **Integridad Referencial y DDL Limpio:**
   - Las 4 tablas (`empresas`, `clientes`, `cliente_pesos_historial`, `proveedores`) se crean con `PRAGMA foreign_keys = ON;` sin depender de ninguna tabla de entidades genéricas.
2. **Validación Sunat RUC 20 vs Persona Natural:**
   - En `empresas`, solo se aceptan RUCs de 11 dígitos que inicien con `'20'`.
   - En `personas`, el campo `apellidos` es estrictamente obligatorio (`NOT NULL`). Si se registra RUC, debe iniciar en `'10'`, `'15'` o `'17'`.
3. **Aislamiento Estricto de Jerarquía de Roles:**
   - En `list_persons`, un `SUPERVISOR` no recibe en los resultados a otros supervisores ni administradores.
   - En `list_persons`, un `RECEPCIONISTA` no recibe a ningún usuario del sistema (`RECEPCIONISTA`, `SUPERVISOR`, `ADMINISTRADOR`).
   - Todo intento de `get_person`, `update_person` o `toggle_person_active` sobre un usuario de jerarquía igual o superior devuelve `AppError::Forbidden`.
4. **Cálculo Preciso de Variación de Peso:**
   - El primer registro de peso para un cliente establece automáticamente `variacion_kg = 0.00`.
   - Cada registro subsecuente calcula exactamente la diferencia: `variacion_kg = nuevo_peso - ultimo_peso`.
   - El campo `clientes.peso_actual_kg` refleja siempre el último valor registrado.
5. **Polimorfismo Seguro en Proveedores:**
   - No se permite insertar un proveedor que tenga `persona_id` y `empresa_id` simultáneamente, ni uno que no tenga ninguno de los dos (garantizado por el `CHECK` relacional).
6. **Auditoría Sin Ruido:**
   - Mutaciones (`CLIENT_CREATED`, `CLIENT_UPDATED`, `CLIENT_WEIGHT_RECORDED`, `CLIENT_QR_REGENERATED`, `SUPPLIER_CREATED`, `COMPANY_CREATED`) generan filas en `auditoria_logs` con `detalles_json < 200 bytes`.
   - Consultas de listado o lectura no generan registros en `auditoria_logs`.
