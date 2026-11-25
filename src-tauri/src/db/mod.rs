use crate::errors::AppError;
use crate::services::crypto::{hash_password, is_valid_password_hash, verify_password};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Row, SqlitePool};
use std::str::FromStr;
use std::time::Duration;

/// Inicializa el pool de SQLite asegurando WAL, foreign_keys = ON, synchronous = NORMAL y busy_timeout = 5000.
pub async fn init_db(database_url: &str) -> Result<SqlitePool, AppError> {
    let options = SqliteConnectOptions::from_str(database_url)
        .map_err(|e| AppError::Internal(format!("Error en URL de base de datos SQLite: {}", e)))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_millis(5000))
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("PRAGMA journal_mode = WAL;")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA foreign_keys = ON;")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA synchronous = NORMAL;")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA busy_timeout = 5000;")
                    .execute(&mut *conn)
                    .await?;
                Ok(())
            })
        })
        .connect_with(options)
        .await
        .map_err(|e| AppError::Internal(format!("Error conectando a SQLite: {}", e)))?;

    run_migrations(&pool).await?;

    Ok(pool)
}

/// Versión actual del esquema SQLite (PRAGMA user_version) para arranque ultra-rápido en frío.
const CURRENT_SCHEMA_VERSION: i64 = 10;

/// Ejecuta las sentencias DDL fundacionales y asegura el seed del usuario root con hash válido.
/// Si la BD ya está en `CURRENT_SCHEMA_VERSION`, retorna al instante (< 1ms).
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), AppError> {
    let current_version: i64 = sqlx::query_scalar("PRAGMA user_version;")
        .fetch_one(pool)
        .await
        .unwrap_or(0);
    if current_version >= CURRENT_SCHEMA_VERSION {
        // Verificaciones idempotentes ultrarrápidas (< 1ms total, omitiendo los 8 scripts DDL)
        ensure_valid_admin_seed(pool).await?;
        sqlx::query(
            "UPDATE configuracion_sistema SET valor = 'zaramagym.local', updated_at = datetime('now', 'localtime') WHERE clave = 'LAN_MDNS_HOSTNAME' AND valor = 'sistema.local';",
        )
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error actualizando LAN_MDNS_HOSTNAME a zaramagym.local: {}", e)))?;
        normalize_membership_expiration_timestamps(pool).await?;
        return Ok(());
    }

    // 1. Migración fundacional 001: Núcleo de personas, usuarios y auditoría
    let migration_001_sql = include_str!("../../migrations/001_core_auth_audit.sql");
    sqlx::raw_sql(migration_001_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error ejecutando migración 001: {}", e)))?;

    // 2. Verificación del Seed del root admin
    ensure_valid_admin_seed(pool).await?;

    // 3. Migración 002: Directorio de Empresas, Clientes, Historial de Pesos y Proveedores
    let migration_002_sql = include_str!("../../migrations/002_entities_directory.sql");
    sqlx::raw_sql(migration_002_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error ejecutando migración 002: {}", e)))?;

    // 4. Migración 003: Catálogo de Planes, Productos e Inventario (Kardex/Mermas)
    let migration_003_sql = include_str!("../../migrations/003_catalog_plans_inventory.sql");
    sqlx::raw_sql(migration_003_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error ejecutando migración 003: {}", e)))?;

    // 5. Migración 004: Turnos de caja, ventas POS, pagos, créditos y membresías
    let migration_004_sql = include_str!("../../migrations/004_cash_pos_credits.sql");
    sqlx::raw_sql(migration_004_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error ejecutando migración 004: {}", e)))?;

    // 6. Migración 005: Control de Asistencias, Semáforo, Extensiones y Configuración
    let migration_005_sql = include_str!("../../migrations/005_attendance_extensions.sql");
    sqlx::raw_sql(migration_005_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error ejecutando migración 005: {}", e)))?;

    // 7. Migración 006: Servidor Wi-Fi Local y Dispositivos Móviles Vinculados
    let migration_006_sql = include_str!("../../migrations/006_lan_mobile_devices.sql");
    sqlx::raw_sql(migration_006_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error ejecutando migración 006: {}", e)))?;

    // Idempotencia: Verificar si la columna 'dispositivo_id' ya existe en 'asistencias'
    let asistencias_cols = sqlx::query("PRAGMA table_info(asistencias);")
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error verificando columnas de asistencias: {}", e)))?;

    let has_dispositivo_id = asistencias_cols.iter().any(|row| {
        let col_name: String = row.get("name");
        col_name.eq_ignore_ascii_case("dispositivo_id")
    });

    if !has_dispositivo_id {
        sqlx::query(
            "ALTER TABLE asistencias ADD COLUMN dispositivo_id INTEGER REFERENCES dispositivos_moviles(id) ON DELETE RESTRICT;",
        )
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error agregando columna dispositivo_id a asistencias: {}", e)))?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_asistencias_dispositivo ON asistencias(dispositivo_id);")
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error creando índice idx_asistencias_dispositivo: {}", e)))?;
    }

    // 8. Migración 007: Compras a Proveedores, Gastos Operativos y Finanzas
    let migration_007_sql = include_str!("../../migrations/007_purchases_expenses_finance.sql");
    sqlx::raw_sql(migration_007_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error ejecutando migración 007: {}", e)))?;

    // 9. Migración 008: Impresión Térmica, Series de Comprobantes y Respaldos
    let migration_008_sql = include_str!("../../migrations/008_printing_series_backups.sql");
    sqlx::raw_sql(migration_008_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error ejecutando migración 008: {}", e)))?;

    // 10. Normalización idempotente de roles a 2 niveles (SUPERVISOR -> RECEPCIONISTA)
    sqlx::query("UPDATE usuarios_sistema SET rol_principal = 'RECEPCIONISTA' WHERE rol_principal = 'SUPERVISOR';")
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error normalizando roles a 2 niveles: {}", e)))?;

    // 11. Migración idempotente de hostname mDNS por defecto (sistema.local -> zaramagym.local)
    sqlx::query(
        "UPDATE configuracion_sistema SET valor = 'zaramagym.local', updated_at = datetime('now', 'localtime') WHERE clave = 'LAN_MDNS_HOSTNAME' AND valor = 'sistema.local';",
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::Internal(format!("Error actualizando LAN_MDNS_HOSTNAME a zaramagym.local: {}", e)))?;

    // 12. Índices compuestos de alto rendimiento para Dashboard, POS, Créditos, Asistencias y Auditoría
    let perf_indexes_sql = r#"
        CREATE INDEX IF NOT EXISTS idx_pagos_estado_venta_canal
            ON pagos(estado_pago, venta_id, canal_caja);
        CREATE INDEX IF NOT EXISTS idx_membresias_estado_vencimiento
            ON membresias_clientes(estado, fecha_vencimiento);
        CREATE INDEX IF NOT EXISTS idx_creditos_estado_id
            ON creditos_clientes(estado, id DESC);
        CREATE INDEX IF NOT EXISTS idx_auditoria_modulo_fecha
            ON auditoria_logs(modulo, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_asistencias_color_fecha
            ON asistencias(color_semaforo, fecha_hora_ingreso DESC);
        CREATE INDEX IF NOT EXISTS idx_productos_nombre_nocase
            ON productos(nombre COLLATE NOCASE);
    "#;
    sqlx::raw_sql(perf_indexes_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error creando índices de rendimiento SQLite: {}", e)))?;

    // 13. Migración 010: Demografía BI (genero, canal_captacion), índices BI y seeds RBAC
    if current_version < 10 {
        let personas_cols = sqlx::query("PRAGMA table_info(personas);")
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error verificando columnas de personas: {}", e)))?;

        let has_genero = personas_cols.iter().any(|row| {
            let col_name: String = row.get("name");
            col_name.eq_ignore_ascii_case("genero")
        });

        if !has_genero {
            sqlx::query(
                "ALTER TABLE personas ADD COLUMN genero TEXT CHECK (genero IS NULL OR genero IN ('MASCULINO', 'FEMENINO', 'OTRO', 'PREFIERO_NO_DECIR'));",
            )
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error agregando columna genero a personas: {}", e)))?;
        }

        let clientes_cols = sqlx::query("PRAGMA table_info(clientes);")
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error verificando columnas de clientes: {}", e)))?;

        let has_canal_captacion = clientes_cols.iter().any(|row| {
            let col_name: String = row.get("name");
            col_name.eq_ignore_ascii_case("canal_captacion")
        });

        if !has_canal_captacion {
            sqlx::query(
                "ALTER TABLE clientes ADD COLUMN canal_captacion TEXT CHECK (canal_captacion IS NULL OR canal_captacion IN ('REDES_SOCIALES', 'RECOMENDACION', 'CAMINANTE_FACHADA', 'PUBLICIDAD_LOCAL', 'PROMOCION', 'OTRO'));",
            )
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error agregando columna canal_captacion a clientes: {}", e)))?;
        }

        let migration_010_sql = include_str!("../../migrations/010_bi_demographics_and_rbac.sql");
        sqlx::raw_sql(migration_010_sql)
            .execute(pool)
            .await
            .map_err(|e| AppError::Internal(format!("Error ejecutando migración 010: {}", e)))?;
    }

    // Normalizar fechas de vencimiento sin hora (YYYY-MM-DD -> YYYY-MM-DD 23:59:59)
    normalize_membership_expiration_timestamps(pool).await?;

    // Marcar versión de esquema para arranque instantáneo en reinicios posteriores
    let set_version_sql = format!("PRAGMA user_version = {};", CURRENT_SCHEMA_VERSION);
    sqlx::raw_sql(&set_version_sql)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Error actualizando PRAGMA user_version: {}", e)))?;

    Ok(())
}

async fn normalize_membership_expiration_timestamps(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query(
        "UPDATE membresias_clientes SET fecha_vencimiento = trim(fecha_vencimiento) || ' 23:59:59' WHERE length(trim(fecha_vencimiento)) = 10;",
    )
    .execute(pool)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Error normalizando fecha_vencimiento en membresias_clientes: {}",
            e
        ))
    })?;
    Ok(())
}

/// Hash heredado del script SQL 001 (solo se repara si quedó de la migración inicial sin coincidir).
const LEGACY_SEED_ADMIN_HASH: &str =
    "$argon2id$v=19$m=19456,t=2,p=1$7AhV4A9lmd6HE8jj3VJ10A$Zudze0xwhg3FW/lumSGBs99yK2NRFelJZGSbXwcXwpc";

/// Garantiza que el usuario 'admin' exista en una BD nueva sin sobrescribir jamás
/// una contraseña válida cambiada por el administrador en producción.
pub async fn ensure_valid_admin_seed(pool: &SqlitePool) -> Result<(), AppError> {
    let row = sqlx::query("SELECT id, password_hash FROM usuarios_sistema WHERE username = 'admin'")
        .fetch_optional(pool)
        .await?;

    match row {
        Some(r) => {
            let admin_id: i64 = r.get("id");
            let hash: String = r.get("password_hash");

            // Solo reparar si el hash está corrupto/no parseable o es el placeholder heredado de 001
            // que no verifica con "admin123". Cualquier contraseña válida cambiada por el usuario se conserva intacta.
            let is_broken_legacy_seed =
                hash == LEGACY_SEED_ADMIN_HASH && !verify_password(&hash, "admin123").unwrap_or(false);
            let needs_repair = !is_valid_password_hash(&hash) || is_broken_legacy_seed;

            if needs_repair {
                let new_valid_hash = hash_password("admin123")?;
                sqlx::query("UPDATE usuarios_sistema SET password_hash = ? WHERE id = ?")
                    .bind(new_valid_hash)
                    .bind(admin_id)
                    .execute(pool)
                    .await?;
            }
        }
        None => {
            // Si no existiera, lo insertamos asegurando persona y usuario
            let mut tx = pool.begin().await?;

            sqlx::query(
                r#"
                INSERT OR IGNORE INTO personas (id, tipo_documento, numero_documento, nombres, apellidos, estado_activo)
                VALUES (1, 'DNI', '00000000', 'Administrador', 'Principal', 1)
                "#,
            )
            .execute(&mut *tx)
            .await?;

            let admin_hash = hash_password("admin123")?;
            sqlx::query(
                r#"
                INSERT OR IGNORE INTO usuarios_sistema (id, persona_id, username, password_hash, rol_principal, foto_perfil_data_url, estado_activo)
                VALUES (1, 1, 'admin', ?, 'ADMINISTRADOR', NULL, 1)
                "#,
            )
            .bind(admin_hash)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;
        }
    }

    Ok(())
}

/// Helper para verificar PRAGMAs activos en la conexión actual
pub async fn verify_pragmas(pool: &SqlitePool) -> Result<(String, bool), AppError> {
    let j_row = sqlx::query("PRAGMA journal_mode;").fetch_one(pool).await?;
    let journal_mode: String = j_row.get(0);

    let fk_row = sqlx::query("PRAGMA foreign_keys;").fetch_one(pool).await?;
    let foreign_keys_num: i64 = fk_row.get(0);

    Ok((journal_mode.to_uppercase(), foreign_keys_num == 1))
}
