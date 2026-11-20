-- ============================================================================
-- MIGRACIÓN 001: NÚCLEO DE PERSONAS, USUARIOS DEL SISTEMA Y AUDITORÍA UNIVERSAL
-- Motor: SQLite 3 (WAL Mode, Zero-Delete, Integridad Referencial Estricta)
-- ============================================================================

-- 1. PRAGMAS DE OPERACIÓN EN SESIÓN
PRAGMA foreign_keys = ON;

-- 2. TABLA: PERSONAS (Maestra exclusiva de Personas Naturales)
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

-- 3. TABLA: USUARIOS_SISTEMA (Hija 1:1 de personas con Foto de Perfil y 2 niveles de rol)
CREATE TABLE IF NOT EXISTS usuarios_sistema (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id              INTEGER NOT NULL UNIQUE REFERENCES personas(id) ON DELETE RESTRICT,
    username                TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash           TEXT NOT NULL, -- Argon2id
    rol_principal           TEXT NOT NULL CHECK(rol_principal IN ('ADMINISTRADOR', 'RECEPCIONISTA')),
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
