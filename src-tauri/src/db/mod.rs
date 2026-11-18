use crate::errors::AppError;
use crate::services::crypto::{hash_password, verify_password};
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

/// Ejecuta las sentencias DDL fundacionales y asegura el seed del usuario root con hash válido.
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), AppError> {
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

    Ok(())
}

/// Verifica críticamente que el usuario 'admin' exista y que su contraseña 'admin123' sea verificable con Argon2id.
pub async fn ensure_valid_admin_seed(pool: &SqlitePool) -> Result<(), AppError> {
    let row = sqlx::query("SELECT id, password_hash FROM usuarios_sistema WHERE username = 'admin'")
        .fetch_optional(pool)
        .await?;

    match row {
        Some(r) => {
            let admin_id: i64 = r.get("id");
            let hash: String = r.get("password_hash");

            // Validar si el hash actual verifica con "admin123"
            let is_valid = verify_password(&hash, "admin123").unwrap_or(false);
            if !is_valid {
                // Si el hash no coincide o tiene parámetros incompatibles, actualizamos con uno fresco y válido
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
