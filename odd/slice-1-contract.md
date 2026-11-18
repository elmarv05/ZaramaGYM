# 📋 CONTRATO TÉCNICO EJECUTABLE: SLICE 1
**Base Nativa Tauri v2, SQLite 3 (WAL), Migración 001, Login Argon2id, Jerarquía de 3 Roles (Admin/Supervisor/Recepcionista), Foto de Perfil y Auditoría Universal**

---

## 1. Estructura de Carpetas del Proyecto (`ZaramaGYM`)

La solución sigue la arquitectura **Desktop Segregada (Core Nativo Rust + UI Functional-First)**:

```text
ZaramaGYM/
├── src/                                  # FRONTEND (React 19 + TypeScript + Vite)
│   │   # --- CAPA 1: Dominio, Hooks y Servicios IPC ---
│   ├── domain/                           # Reglas de negocio puras y validaciones cliente
│   │   ├── auth.ts                       # Validaciones de login, fortaleza de contraseña
│   │   └── user.ts                       # Validaciones de roles, DNI y formularios de usuario
│   ├── hooks/                            # Custom hooks para desacoplar UI de estado nativo
│   │   ├── useAuth.ts                    # Hook de sesión activa, login, logout, bloqueo y desbloqueo
│   │   ├── useUsers.ts                   # Hook para listado, creación, foto y toggle activo de usuarios
│   │   └── useAudit.ts                   # Hook de consulta y filtrado de registros de auditoría
│   ├── services/
│   │   └── ipc/                          # Invocaciones IPC fuertemente tipadas (@tauri-apps/api/core)
│   │       ├── client.ts                 # Wrapper seguro invoke() con mapeo de AppError
│   │       ├── authIpc.ts                # Invocaciones de login, session, lock, password
│   │       ├── userIpc.ts                # Invocaciones de gestión de usuarios (con jerarquía RBAC)
│   │       └── auditIpc.ts               # Invocaciones de bitácora de auditoría (Admin y Supervisor)
│   ├── types/                            # Tipos e interfaces DTO sincronizados con Backend
│   │   ├── auth.ts                       # Sesión, credenciales, usuarios, roles y AppError
│   │   └── audit.ts                      # Filtros y registros de auditoría
│   │
│   │   # --- CAPA 2: Componentes Primitivos y Features Funcionales (Wireframe Pro) ---
│   ├── components/
│   │   └── primitives/                   # Primitivas accesibles con 4 estados (Loading, Empty, Error, Success)
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Select.tsx
│   │       ├── Modal.tsx
│   │       ├── Badge.tsx
│   │       ├── Table.tsx
│   │       └── Alert.tsx
│   ├── features/
│   │   ├── auth/                         # Vistas y componentes del dominio de Autenticación
│   │   │   ├── LoginForm.tsx             # Pantalla de inicio de sesión
│   │   │   ├── SessionHeader.tsx         # Barra superior con estado de usuario, avatar, bloqueo y salir
│   │   │   ├── LockModal.tsx             # Modal reactivo de desbloqueo de turno
│   │   │   ├── ChangePasswordModal.tsx   # Modal de cambio de contraseña propia
│   │   │   ├── UserProfilePhotoModal.tsx # Modal de carga/recorte de foto de perfil
│   │   │   └── UserManagementTable.tsx   # Módulo Admin/Supervisor: lista filtrada por jerarquía, alta y toggle activo
│   │   └── audit/                        # Vistas del dominio de Auditoría
│   │       └── AuditLogViewer.tsx        # Tabla paginada/filtrable con detalle JSON expandible
│   │
│   │   # --- CAPA 3: Estilos Base (Tokens y tema preliminar) ---
│   ├── styles/
│   │   └── theme.css                     # Variables CSS de layout y Wireframe Pro (pre-Slice 9)
│   ├── App.tsx                           # Enrutador de estados: Autenticado vs No Autenticado vs Bloqueado
│   └── main.tsx                          # Punto de entrada React
│
├── src-tauri/                            # BACKEND NATIVO (Rust + Tauri v2)
│   ├── Cargo.toml                        # Dependencias: tauri, sqlx, argon2, tokio, serde, thiserror
│   ├── tauri.conf.json                   # Configuración del runtime de ventana y capacidades
│   ├── capabilities/
│   │   └── default.json                  # Permisos de comandos IPC seguros para Tauri v2
│   ├── migrations/
│   │   └── 001_core_auth_audit.sql       # DDL y Seed fundacional de personas, usuarios_sistema y auditoría
│   └── src/
│       ├── main.rs                       # Entrypoint binario del proceso nativo
│       ├── lib.rs                        # Inicializador Tauri, plugins y registro de comandos IPC
│       ├── state.rs                      # AppState con SqlitePool y Mutex/RwLock de sesión activa
│       ├── errors.rs                     # AppError serializable hacia Frontend
│       ├── db/
│       │   └── mod.rs                    # Configuración de SQLite (WAL, PRAGMAs) y runner de migraciones
│       ├── models/
│       │   ├── mod.rs
│       │   ├── user.rs                   # Modelos Personas, UsuariosSistema, AuthSession y DTOs
│       │   └── audit.rs                  # AuditoriaLog y DTOs de filtro/registro
│       ├── services/
│       │   ├── mod.rs
│       │   ├── auth_service.rs           # Verificación Argon2id, cambio de contraseña, bloqueo de turno
│       │   └── audit_service.rs          # Inserción universal inmutable y lectura de auditoría
│       └── commands/
│           ├── mod.rs
│           └── auth_commands.rs          # 11 comandos IPC expuestos con Guards de sesión y jerarquía RBAC
```

---

## 2. DDL Exacto de `src-tauri/migrations/001_core_auth_audit.sql`

```sql
-- ============================================================================
-- MIGRACIÓN 001: NÚCLEO DE PERSONAS, USUARIOS DEL SISTEMA Y AUDITORÍA UNIVERSAL
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Integridad Referencial Estricta)
-- ============================================================================

-- 1. PRAGMAS DE OPERACIÓN EN SESIÓN
PRAGMA foreign_keys = ON;

-- 2. TABLA: PERSONAS (Maestra exclusiva de Personas Naturales)
-- Regla de Dominio: En personas solo existen personas de carne y hueso.
-- Si tipo_documento es 'RUC', únicamente se admiten RUC 10/15/17 (persona natural con negocio).
CREATE TABLE IF NOT EXISTS personas (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_documento      TEXT NOT NULL CHECK(tipo_documento IN ('DNI', 'RUC', 'CE', 'PASAPORTE', 'OTRO')),
    numero_documento    TEXT NOT NULL UNIQUE,
    nombres             TEXT NOT NULL,
    apellidos           TEXT NOT NULL, -- Siempre NOT NULL; no existen empresas en esta tabla
    fecha_nacimiento    TEXT,          -- Formato ISO-8601 (YYYY-MM-DD), Nullable
    telefono            TEXT,
    email               TEXT,
    direccion           TEXT,
    estado_activo       INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_personas_documento ON personas(numero_documento);
CREATE INDEX IF NOT EXISTS idx_personas_apellidos_nombres ON personas(apellidos COLLATE NOCASE, nombres COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_personas_estado ON personas(estado_activo);

-- 3. TABLA: USUARIOS_SISTEMA (Hija 1:1 de personas con Foto de Perfil y 3 niveles de rol)
CREATE TABLE IF NOT EXISTS usuarios_sistema (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id              INTEGER NOT NULL UNIQUE REFERENCES personas(id) ON DELETE RESTRICT,
    username                TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash           TEXT NOT NULL, -- Argon2id
    rol_principal           TEXT NOT NULL CHECK(rol_principal IN ('ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA')),
    foto_perfil_data_url    TEXT,          -- Data URL base64 de imagen de perfil optimizada o avatar
    estado_activo           INTEGER NOT NULL DEFAULT 1 CHECK(estado_activo IN (0, 1)),
    ultimo_login            TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios_sistema(username);
CREATE INDEX IF NOT EXISTS idx_usuarios_persona ON usuarios_sistema(persona_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios_sistema(rol_principal);
CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON usuarios_sistema(estado_activo);

-- 4. TABLA: AUDITORIA_LOGS (Bitácora Inmutable y Universal de Eventos del Sistema)
CREATE TABLE IF NOT EXISTS auditoria_logs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id          INTEGER REFERENCES usuarios_sistema(id) ON DELETE RESTRICT,
    username            TEXT NOT NULL,
    accion              TEXT NOT NULL,
    modulo              TEXT NOT NULL,
    detalles_json       TEXT NOT NULL DEFAULT '{}',
    ip_o_terminal       TEXT NOT NULL DEFAULT 'LOCAL_DESKTOP',
    created_at          TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_logs(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo_accion ON auditoria_logs(modulo, accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria_logs(created_at DESC);

-- ============================================================================
-- SEED INICIAL TRANSACCIONAL (Usuario Root Administrador)
-- Credencial por defecto: admin / admin123
-- Hash Argon2id estándar: $argon2id$v=19$m=19456,t=2,p=1$7AhV4A9lmd6HE8jj3VJ10A$Zudze0xwhg3FW/lumSGBs99yK2NRFelJZGSbXwcXwpc
-- ============================================================================
INSERT OR IGNORE INTO personas (id, tipo_documento, numero_documento, nombres, apellidos, estado_activo)
VALUES (1, 'DNI', '00000000', 'Administrador', 'Principal', 1);

INSERT OR IGNORE INTO usuarios_sistema (id, persona_id, username, password_hash, rol_principal, foto_perfil_data_url, estado_activo)
VALUES (
    1,
    1,
    'admin',
    '$argon2id$v=19$m=19456,t=2,p=1$7AhV4A9lmd6HE8jj3VJ10A$Zudze0xwhg3FW/lumSGBs99yK2NRFelJZGSbXwcXwpc',
    'ADMINISTRADOR',
    NULL,
    1
);

INSERT OR IGNORE INTO auditoria_logs (id, usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
VALUES (
    1,
    1,
    'admin',
    'SISTEMA_INICIALIZADO',
    'AUTH',
    '{"mensaje": "Base de datos inicializada con usuario root administrador"}',
    'LOCAL_DESKTOP'
);
```

---

## 3. Jerarquía Estricta de 3 Roles y Reglas RBAC

El sistema establece una relación de orden estricta:
$$\text{RECEPCIONISTA} < \text{SUPERVISOR} < \text{ADMINISTRADOR}$$

### 3.1 Matriz de Acceso en el Módulo de Usuarios del Sistema (`usuarios_sistema`)

| Acción / Comando | `RECEPCIONISTA` | `SUPERVISOR` | `ADMINISTRADOR` |
| :--- | :--- | :--- | :--- |
| **`list_users`** | ❌ **Bloqueado** (`Forbidden`) | ✅ **Visible con Filtro:** Ve **únicamente** usuarios con `rol_principal == 'RECEPCIONISTA'`. Los `SUPERVISOR` y `ADMINISTRADOR` son invisibles. | ✅ **Visible Completo:** Ve a todos los usuarios del sistema. |
| **`create_user`** | ❌ **Bloqueado** (`Forbidden`) | ⚠️ **Restringido:** Puede crear **únicamente** usuarios con rol `'RECEPCIONISTA'`. Si intenta enviar `'SUPERVISOR'` o `'ADMINISTRADOR'`, el backend rechaza con `AppError::Forbidden`. | ✅ **Total:** Puede crear usuarios con cualquiera de los 3 roles. |
| **`update_user_photo`** | ⚠️ **Solo Propia:** Puede actualizar únicamente su propia foto de perfil (`user_id == session.user_id`). | ⚠️ **Propia + Recepcionistas:** Puede actualizar su propia foto o la de cualquier usuario con rol `'RECEPCIONISTA'`. | ✅ **Total:** Puede actualizar la foto de cualquier usuario o la propia. |
| **`toggle_user_active`** | ❌ **Bloqueado** (`Forbidden`) | ⚠️ **Solo Recepcionistas:** Puede activar/desactivar únicamente a usuarios con rol `'RECEPCIONISTA'`. Bloqueado para superiores o iguales. | ✅ **Total con Defensas:** Puede alternar a cualquiera, **excepto auto-desactivarse** o desactivar al Administrador Root (`id = 1`). |
| **`get_audit_logs`** | ❌ **Bloqueado** (`Forbidden`) | ✅ **Solo Lectura:** Consulta y filtra la bitácora de auditoría. | ✅ **Solo Lectura:** Consulta y filtra la bitácora de auditoría. |

---

## 4. Contrato Tipado de Comandos IPC (Rust <-> TypeScript)

### 4.1 Lista de Comandos Tauri v2

| # | Comando IPC | Parámetros | Retorno | Guard / Seguridad |
|---|-------------|------------|---------|-------------------|
| 1 | `login` | `credentials: LoginCredentials` | `Result<AuthSession, AppError>` | Público. Valida hash Argon2id y `estado_activo = 1`. Registra `LOGIN_EXITOSO` o `LOGIN_FALLIDO`. |
| 2 | `logout` | Ninguno | `Result<(), AppError>` | Requiere sesión activa. Invalida sesión en memoria y registra `LOGOUT`. |
| 3 | `get_current_session` | Ninguno | `Result<Option<AuthSession>, AppError>` | Público. Devuelve la sesión en memoria si existe y su bandera `is_locked`. |
| 4 | `lock_session` | Ninguno | `Result<(), AppError>` | Requiere sesión activa. Marca `is_locked = true` y registra `SESSION_LOCKED`. |
| 5 | `unlock_session` | `password: String` | `Result<AuthSession, AppError>` | Requiere sesión activa y bloqueada. Verifica contraseña contra DB. Si es correcta marca `is_locked = false` y registra `SESSION_UNLOCKED`. |
| 6 | `change_own_password` | `current_password: String, new_password: String` | `Result<(), AppError>` | Requiere sesión activa y no bloqueada. Comprueba contraseña actual, valida longitud $\ge 6$, actualiza hash Argon2id y registra `PASSWORD_CHANGED`. |
| 7 | `list_users` | Ninguno | `Result<Vec<UserListItem>, AppError>` | **Guard: `ADMINISTRADOR` o `SUPERVISOR`**. `SUPERVISOR` ve solo `RECEPCIONISTA`. `RECEPCIONISTA` recibe `Forbidden`. |
| 8 | `create_user` | `input: CreateUserInput` | `Result<UserListItem, AppError>` | **Guard: `ADMINISTRADOR` o `SUPERVISOR`**. Transaccional: crea persona (o reutiliza por documento), usuario con foto opcional y registra `USER_CREATED`. `SUPERVISOR` solo puede crear `RECEPCIONISTA`. |
| 9 | `update_user_photo` | `input: UpdateUserPhotoInput` | `Result<(), AppError>` | Permite a cualquier usuario actualizar su propia foto; `SUPERVISOR` sobre `RECEPCIONISTA`; `ADMINISTRADOR` sobre cualquiera. Registra `USER_PHOTO_UPDATED`. |
| 10 | `toggle_user_active` | `user_id: i64, active: bool` | `Result<(), AppError>` | **Guard: `ADMINISTRADOR` o `SUPERVISOR`**. Impide auto-desactivación y desactivación de root admin `id = 1`. `SUPERVISOR` solo puede alternar `RECEPCIONISTA`. Registra `USER_TOGGLE_ACTIVE`. |
| 11 | `get_audit_logs` | `filter: AuditFilter` | `Result<Vec<AuditLogItem>, AppError>` | **Guard: `ADMINISTRADOR` o `SUPERVISOR`** y sesión no bloqueada. Consulta filtrada con orden descendente por fecha. |

---

### 4.2 Definiciones de Tipos en Rust (`src-tauri/src/models/user.rs`, `audit.rs`, `errors.rs`)

```rust
// ============================================================================
// ERRORES DEL SISTEMA (src-tauri/src/errors.rs)
// ============================================================================
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("No autenticado: {0}")]
    Unauthorized(String),

    #[error("Acceso denegado: {0}")]
    Forbidden(String),

    #[error("Recurso no encontrado: {0}")]
    NotFound(String),

    #[error("Error de validación: {0}")]
    Validation(String),

    #[error("Conflicto de integridad: {0}")]
    Conflict(String),

    #[error("Sesión bloqueada: {0}")]
    SessionLocked(String),

    #[error("Error interno del servidor: {0}")]
    Internal(String),
}

// ============================================================================
// MODELOS Y DTOS DE USUARIOS (src-tauri/src/models/user.rs)
// ============================================================================
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum UserRole {
    Recepcionista,
    Supervisor,
    Administrador,
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::Recepcionista => write!(f, "RECEPCIONISTA"),
            UserRole::Supervisor => write!(f, "SUPERVISOR"),
            UserRole::Administrador => write!(f, "ADMINISTRADOR"),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct LoginCredentials {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub user_id: i64,
    pub persona_id: i64,
    pub username: String,
    pub nombre_completo: String,
    pub rol: UserRole,
    pub foto_perfil_data_url: Option<String>,
    pub is_locked: bool,
    pub login_at: String, // ISO-8601
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserListItem {
    pub id: i64,
    pub persona_id: i64,
    pub username: String,
    pub nombres: String,
    pub apellidos: String,
    pub numero_documento: String,
    pub tipo_documento: String,
    pub rol: UserRole,
    pub foto_perfil_data_url: Option<String>,
    pub estado_activo: bool,
    pub ultimo_login: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserInput {
    pub username: String,
    pub password: String,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub rol: UserRole,
    pub foto_perfil_data_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserPhotoInput {
    pub user_id: i64,
    pub foto_perfil_data_url: Option<String>,
}

// ============================================================================
// MODELOS Y DTOS DE AUDITORÍA (src-tauri/src/models/audit.rs)
// ============================================================================
#[derive(Debug, Deserialize, Default)]
pub struct AuditFilter {
    pub modulo: Option<String>,
    pub accion: Option<String>,
    pub username: Option<String>,
    pub desde: Option<String>, // ISO-8601
    pub hasta: Option<String>, // ISO-8601
    pub limit: Option<i64>,    // Default 100, Max 500
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuditLogItem {
    pub id: i64,
    pub usuario_id: Option<i64>,
    pub username: String,
    pub accion: String,
    pub modulo: String,
    pub detalles_json: String,
    pub ip_o_terminal: String,
    pub created_at: String,
}
```

---

### 4.3 Definiciones de Tipos en TypeScript (`src/types/auth.ts`)

```typescript
// ============================================================================
// TIPOS E INTERFACES DE AUTENTICACIÓN, USUARIOS Y AUDITORÍA
// Ubicación: src/types/auth.ts
// ============================================================================

export type UserRole = 'RECEPCIONISTA' | 'SUPERVISOR' | 'ADMINISTRADOR';

export type AppErrorCode =
  | 'Unauthorized'
  | 'Forbidden'
  | 'NotFound'
  | 'Validation'
  | 'Conflict'
  | 'SessionLocked'
  | 'Internal';

export interface AppError {
  code: AppErrorCode;
  message: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthSession {
  user_id: number;
  persona_id: number;
  username: string;
  nombre_completo: string;
  rol: UserRole;
  foto_perfil_data_url: string | null;
  is_locked: boolean;
  login_at: string;
}

export interface UserListItem {
  id: number;
  persona_id: number;
  username: string;
  nombres: string;
  apellidos: string;
  numero_documento: string;
  tipo_documento: string;
  rol: UserRole;
  foto_perfil_data_url: string | null;
  estado_activo: boolean;
  ultimo_login: string | null;
  created_at: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  tipo_documento: string;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  telefono?: string | null;
  email?: string | null;
  rol: UserRole;
  foto_perfil_data_url?: string | null;
}

export interface UpdateUserPhotoInput {
  user_id: number;
  foto_perfil_data_url: string | null;
}

export interface AuditFilter {
  modulo?: string | null;
  accion?: string | null;
  username?: string | null;
  desde?: string | null;
  hasta?: string | null;
  limit?: number | null;
}

export interface AuditLogItem {
  id: number;
  usuario_id: number | null;
  username: string;
  accion: string;
  modulo: string;
  detalles_json: string;
  ip_o_terminal: string;
  created_at: string;
}
```

---

## 5. Matriz de Estados de UI (Frontend Capa 2)

| Componente | ⏳ Loading | 📭 Empty | ❌ Error | ✅ Success |
|---|---|---|---|---|
| **`LoginForm`** | Botón deshabilitado con spinner "Iniciando sesión..." | N/A (Campos limpios esperando credenciales) | Banner alerta rojo con mensaje de `AppError` (`Unauthorized`, etc.) | Transición fluida a pantalla principal según rol |
| **`LockModal`** | Spinner "Verificando clave..." | Input limpio esperando contraseña | "Contraseña incorrecta" destacado en rojo | Modal cerrado, sesión reactivada |
| **`UserManagementTable`** | Esqueleto o spinner de carga de filas | "No se encontraron usuarios registrados" | Alerta con opción "Reintentar carga" | Listado renderizado con avatar, badges de rol y botones de acción según jerarquía |
| **`UserProfilePhotoModal`** | Spinner "Subiendo y optimizando foto..." | Canvas o selector de archivo vacío | "Error al procesar la imagen (formato no soportado o muy pesada)" | Avatar actualizado de inmediato en cabecera y tabla |
| **`AuditLogViewer`** | Skeleton animado en tabla | "No hay registros para los filtros seleccionados" | Mensaje de error al consultar base de datos | Bitácora ordenada con paginación y visor JSON expandible |

---

## 6. Criterios de Aceptación y Verificación Técnica

1. **Integridad de Base de Datos:** La migración `001_core_auth_audit.sql` corre limpia sobre SQLite 3 con `PRAGMA foreign_keys = ON;`.
2. **Jerarquía Estricta en Listado de Usuarios:**
   - Un `SUPERVISOR` invocando `list_users` recibe únicamente usuarios con `rol_principal == 'RECEPCIONISTA'`. En ningún caso figuran otros supervisores ni administradores.
   - Un `RECEPCIONISTA` invocando `list_users` recibe `AppError::Forbidden`.
3. **Control Jerárquico de Creación de Usuarios:**
   - Si un `SUPERVISOR` intenta crear un usuario con rol `'SUPERVISOR'` o `'ADMINISTRADOR'`, el backend rechaza con `AppError::Forbidden("Supervisores solo pueden crear recepcionistas")`.
4. **Protección de Foto de Perfil:**
   - Cualquier usuario puede actualizar su propia foto (`update_user_photo`).
   - Un `SUPERVISOR` solo puede actualizar la foto de recepcionistas o la propia.
   - Un `RECEPCIONISTA` intentando actualizar la foto de otro usuario recibe `AppError::Forbidden`.
5. **Auto-defensa de Root Admin y Sesión Activa:**
   - El usuario actual no puede desactivarse a sí mismo (`user_id == current_session.user_id`).
   - El root admin (`id = 1`) no puede ser desactivado bajo ninguna circunstancia.
6. **Auditoría Inmutable Sin Ruido:**
   - Todo login, logout, cambio de clave, bloqueo, alta de usuario, cambio de foto y alternancia de estado registra una fila en `auditoria_logs` con `detalles_json < 200 bytes`.
   - Cero logs al ejecutar `list_users` o `get_audit_logs`.
