use base64::Engine;
use sqlx::Row;
use std::path::PathBuf;
use zarama_gym_lib::db::{init_db, verify_pragmas};
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AuthSession, CreatePersonInput, CreateUserInput, LoginCredentials, RestoreDatabaseRequest,
    UserRole,
};
use zarama_gym_lib::services::{auth_service, entity_service, printing_backup_service};
use zarama_gym_lib::state::AppState;

async fn setup_test_env() -> (AppState, tempfile::TempDir, PathBuf) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_restore.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new_with_db_path(pool, db_path.clone());
    (state, temp_dir, db_path)
}

async fn login_admin(state: &AppState) -> AuthSession {
    auth_service::login(
        &state.pool(),
        state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .expect("Login admin debe ser exitoso")
}

#[tokio::test]
async fn test_restore_database_rbac_rejects_receptionist_and_supervisor() {
    let (state, temp_dir, _db_path) = setup_test_env().await;

    // Sin sesión -> Unauthorized
    let unauth_res = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: Some(temp_dir.path().join("dummy.db").to_string_lossy().to_string()),
            file_bytes_base64: None,
            file_name: None,
        },
    )
    .await;
    assert!(
        matches!(unauth_res, Err(AppError::Unauthorized(_))),
        "Sin sesión debe retornar Unauthorized, obtenido: {:?}",
        unauth_res
    );

    // Admin crea Recepcionista y Supervisor
    let _admin = login_admin(&state).await;

    auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "recep_restore".into(),
            password: "Password123!".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "40112233".into(),
            nombres: "Sofia".into(),
            apellidos: "Recep".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "sup_restore".into(),
            password: "Password123!".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "40112234".into(),
            nombres: "Carlos".into(),
            apellidos: "Sup".into(),
            telefono: None,
            email: None,
            rol: UserRole::Supervisor,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // Probar como RECEPCIONISTA
    auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "recep_restore".into(),
            password: "Password123!".into(),
        },
    )
    .await
    .unwrap();

    let recep_res = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: Some(temp_dir.path().join("dummy.db").to_string_lossy().to_string()),
            file_bytes_base64: None,
            file_name: None,
        },
    )
    .await;
    assert!(
        matches!(recep_res, Err(AppError::Forbidden(_))),
        "RECEPCIONISTA debe recibir Forbidden, obtenido: {:?}",
        recep_res
    );

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // Probar como SUPERVISOR
    auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "sup_restore".into(),
            password: "Password123!".into(),
        },
    )
    .await
    .unwrap();

    let sup_res = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: Some(temp_dir.path().join("dummy.db").to_string_lossy().to_string()),
            file_bytes_base64: None,
            file_name: None,
        },
    )
    .await;
    assert!(
        matches!(sup_res, Err(AppError::Forbidden(_))),
        "SUPERVISOR debe recibir Forbidden, obtenido: {:?}",
        sup_res
    );
}

#[tokio::test]
async fn test_restore_rejects_corrupt_non_sqlite_and_missing_tables_without_touching_pool() {
    let (state, temp_dir, _db_path) = setup_test_env().await;
    let admin = login_admin(&state).await;

    // Crear una persona para verificar que el pool sigue intacto tras rechazos
    let person = entity_service::create_person(
        &state.pool(),
        &admin,
        CreatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "71234567".into(),
            nombres: "Dato".into(),
            apellidos: "Intacto".into(),
            telefono: None,
            email: None,
            direccion: None,
            fecha_nacimiento: None,
        },
    )
    .await
    .unwrap();

    // 1. Archivo no-SQLite (texto plano) por source_path
    let text_file = temp_dir.path().join("not_a_db.db");
    std::fs::write(&text_file, b"Esto no es una base de datos SQLite valida").unwrap();

    let res_text = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: Some(text_file.to_string_lossy().to_string()),
            file_bytes_base64: None,
            file_name: None,
        },
    )
    .await;
    assert!(
        matches!(res_text, Err(AppError::Validation(_))),
        "Archivo no SQLite debe retornar Validation, obtenido: {:?}",
        res_text
    );

    // 2. Archivo SQLite válido pero SIN tablas core (por file_bytes_base64)
    let empty_sqlite_path = temp_dir.path().join("missing_tables.db");
    let empty_sqlite_url = format!("sqlite://{}?mode=rwc", empty_sqlite_path.to_string_lossy().replace('\\', "/"));
    let empty_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&empty_sqlite_url)
        .await
        .unwrap();
    sqlx::query("CREATE TABLE dummy_only (id INTEGER PRIMARY KEY, val TEXT);")
        .execute(&empty_pool)
        .await
        .unwrap();
    empty_pool.close().await;

    let missing_tables_bytes = std::fs::read(&empty_sqlite_path).unwrap();
    let missing_tables_b64 = base64::engine::general_purpose::STANDARD.encode(&missing_tables_bytes);

    let res_missing = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: None,
            file_bytes_base64: Some(missing_tables_b64),
            file_name: Some("missing_tables.db".into()),
        },
    )
    .await;
    assert!(
        matches!(res_missing, Err(AppError::Validation(_))),
        "SQLite sin tablas core debe retornar Validation, obtenido: {:?}",
        res_missing
    );

    // 3. Archivo SQLite corrupto (bytes aleatorios con cabecera rota)
    let corrupt_b64 = base64::engine::general_purpose::STANDARD.encode(b"SQLite format 3\0corrupt_payload_bytes_1234567890");
    let res_corrupt = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: None,
            file_bytes_base64: Some(corrupt_b64),
            file_name: Some("corrupt.db".into()),
        },
    )
    .await;
    assert!(
        matches!(res_corrupt, Err(AppError::Validation(_))),
        "SQLite corrupto debe retornar Validation, obtenido: {:?}",
        res_corrupt
    );

    // Verificar que el pool activo sigue intacto y operativo (lectura y escritura)
    let fetched = entity_service::get_person(&state.pool(), &admin, person.id)
        .await
        .expect("El pool activo debe seguir operativo para lecturas");
    assert_eq!(fetched.numero_documento, "71234567");

    let second_person = entity_service::create_person(
        &state.pool(),
        &admin,
        CreatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "71234568".into(),
            nombres: "Post".into(),
            apellidos: "Rechazo".into(),
            telefono: None,
            email: None,
            direccion: None,
            fecha_nacimiento: None,
        },
    )
    .await
    .expect("El pool activo debe seguir operativo para escrituras");
    assert_eq!(second_person.numero_documento, "71234568");
}

#[tokio::test]
async fn test_restore_database_full_cycle_via_source_path_and_base64() {
    let (state, temp_dir, _db_path) = setup_test_env().await;
    let admin = login_admin(&state).await;

    // 1. Insertar dato inicial ANTES del backup
    let initial_person = entity_service::create_person(
        &state.pool(),
        &admin,
        CreatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "70000001".into(),
            nombres: "Socio".into(),
            apellidos: "Original".into(),
            telefono: None,
            email: None,
            direccion: None,
            fecha_nacimiento: None,
        },
    )
    .await
    .unwrap();

    // 2. Generar backup de este estado limpio
    let backup_dir = temp_dir.path().join("external_backups");
    let backup_record = printing_backup_service::create_local_backup(
        &state.pool(),
        &admin,
        Some(&backup_dir),
    )
    .await
    .unwrap();
    let backup_path = PathBuf::from(&backup_record.ruta_local);
    assert!(backup_path.exists(), "El backup debe existir en disco");

    // 3. Insertar dato NUEVO después del backup
    let post_backup_person = entity_service::create_person(
        &state.pool(),
        &admin,
        CreatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "70000002".into(),
            nombres: "Socio".into(),
            apellidos: "Temporal".into(),
            telefono: None,
            email: None,
            direccion: None,
            fecha_nacimiento: None,
        },
    )
    .await
    .unwrap();

    let count_before: i64 = sqlx::query("SELECT COUNT(*) as c FROM personas WHERE numero_documento = '70000002'")
        .fetch_one(&state.pool())
        .await
        .unwrap()
        .get("c");
    assert_eq!(count_before, 1);

    // 4. Restaurar por source_path
    let restore_res = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: Some(backup_path.to_string_lossy().to_string()),
            file_bytes_base64: None,
            file_name: None,
        },
    )
    .await
    .expect("La restauración por source_path debe tener éxito");

    assert!(restore_res.success);
    assert!(!restore_res.requires_relogin);
    assert_eq!(restore_res.sha256_checksum, backup_record.sha256_checksum);
    assert!(restore_res.found_tables_count >= 8);
    let pre_backup_path = restore_res
        .pre_restore_backup_path
        .as_ref()
        .expect("Debe generarse un respaldo de seguridad previo");
    assert!(PathBuf::from(pre_backup_path).exists());

    // 5. Verificar que el dato nuevo desapareció y el original permanece
    let count_after: i64 = sqlx::query("SELECT COUNT(*) as c FROM personas WHERE numero_documento = '70000002'")
        .fetch_one(&state.pool())
        .await
        .unwrap()
        .get("c");
    assert_eq!(count_after, 0, "El dato posterior al backup debe haber desaparecido");

    let orig_check = entity_service::get_person(&state.pool(), &admin, initial_person.id)
        .await
        .expect("El dato anterior al backup debe existir");
    assert_eq!(orig_check.numero_documento, "70000001");

    // 6. Verificar modo WAL y operatividad de lecturas/escrituras tras restauración
    let (journal_mode, fk_enabled) = verify_pragmas(&state.pool()).await.unwrap();
    assert_eq!(journal_mode, "WAL");
    assert!(fk_enabled);

    // 7. Verificar auditoría DATABASE_RESTORED en auditoria_logs
    let audit_count: i64 = sqlx::query("SELECT COUNT(*) as c FROM auditoria_logs WHERE accion = 'DATABASE_RESTORED'")
        .fetch_one(&state.pool())
        .await
        .unwrap()
        .get("c");
    assert_eq!(audit_count, 1, "Debe existir DATABASE_RESTORED en auditoria_logs");

    // 8. Ahora insertar otro dato nuevo, y restaurar usando file_bytes_base64
    let another_person = entity_service::create_person(
        &state.pool(),
        &admin,
        CreatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "70000003".into(),
            nombres: "Otro".into(),
            apellidos: "Nuevo".into(),
            telefono: None,
            email: None,
            direccion: None,
            fecha_nacimiento: None,
        },
    )
    .await
    .unwrap();
    assert_ne!(another_person.id, post_backup_person.id - 99999);

    let backup_bytes = std::fs::read(&backup_path).unwrap();
    let backup_b64 = base64::engine::general_purpose::STANDARD.encode(&backup_bytes);

    let restore_b64_res = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: None,
            file_bytes_base64: Some(backup_b64),
            file_name: Some("cloud_backup.db".into()),
        },
    )
    .await
    .expect("La restauración por file_bytes_base64 debe tener éxito");

    assert!(restore_b64_res.success);
    assert_eq!(restore_b64_res.restored_from, "cloud_backup.db");

    let count_after_b64: i64 = sqlx::query("SELECT COUNT(*) as c FROM personas WHERE numero_documento = '70000003'")
        .fetch_one(&state.pool())
        .await
        .unwrap()
        .get("c");
    assert_eq!(count_after_b64, 0, "El dato insertado antes de restaurar por base64 debe desaparecer");

    let audit_count_2: i64 = sqlx::query("SELECT COUNT(*) as c FROM auditoria_logs WHERE accion = 'DATABASE_RESTORED'")
        .fetch_one(&state.pool())
        .await
        .unwrap()
        .get("c");
    assert_eq!(audit_count_2, 1, "El backup restaurado reemplaza el historial anterior, así que debe tener el nuevo DATABASE_RESTORED");
}

#[tokio::test]
async fn test_restore_database_clears_session_when_current_admin_missing_in_backup() {
    let (state, temp_dir, _db_path) = setup_test_env().await;
    let admin = login_admin(&state).await;

    // 1. Tomar backup cuando solo existe el usuario root admin (id=1)
    let backup_dir = temp_dir.path().join("backups_relogin");
    let backup_record = printing_backup_service::create_local_backup(
        &state.pool(),
        &admin,
        Some(&backup_dir),
    )
    .await
    .unwrap();

    // 2. Crear segundo administrador admin2 después del backup y loguearse con él
    auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "admin2".into(),
            password: "Password123!".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "40998877".into(),
            nombres: "Segundo".into(),
            apellidos: "Admin".into(),
            telefono: None,
            email: None,
            rol: UserRole::Administrador,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    auth_service::logout(&state.pool(), &state).await.unwrap();
    let admin2 = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin2".into(),
            password: "Password123!".into(),
        },
    )
    .await
    .unwrap();
    assert!(admin2.user_id > 1);

    // 3. admin2 restaura el backup donde admin2 aún NO existe
    let res = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: Some(backup_record.ruta_local),
            file_bytes_base64: None,
            file_name: None,
        },
    )
    .await
    .expect("La restauración debe completarse limpiando sesión si el usuario ya no existe");

    assert!(res.success);
    assert!(res.requires_relogin, "Debe requerir relogin si el usuario actual no existe en el backup");
    assert!(state.get_session().await.is_none(), "La sesión activa debe limpiarse");

    let row = sqlx::query(
        "SELECT usuario_id, username FROM auditoria_logs WHERE accion = 'DATABASE_RESTORED' ORDER BY id DESC LIMIT 1",
    )
    .fetch_one(&state.pool())
    .await
    .unwrap();
    let usuario_id: Option<i64> = row.get("usuario_id");
    let username: String = row.get("username");
    assert!(usuario_id.is_none(), "usuario_id debe ser NULL para respetar FK ON DELETE RESTRICT");
    assert_eq!(username, "admin2");
}

#[tokio::test]
async fn test_restore_database_pragma_database_list_fallback_and_edge_validations() {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("fallback_zaramagym.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url).await.unwrap();
    // Usar AppState::new(pool) SIN db_path explícito para probar PRAGMA database_list
    let state = AppState::new(pool);
    assert!(state.db_path().is_none());

    let admin = login_admin(&state).await;

    // 1. Payload vacío -> Validation
    let empty_res = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: None,
            file_bytes_base64: Some("   ".into()),
            file_name: None,
        },
    )
    .await;
    assert!(matches!(empty_res, Err(AppError::Validation(_))));

    // 2. Ruta a un directorio (no archivo regular) -> Validation
    let dir_res = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: Some(temp_dir.path().to_string_lossy().to_string()),
            file_bytes_base64: None,
            file_name: None,
        },
    )
    .await;
    assert!(matches!(dir_res, Err(AppError::Validation(_))));

    // 3. Crear backup y restaurar usando PRAGMA database_list fallback
    let backup_dir = temp_dir.path().join("fb_backups");
    let backup = printing_backup_service::create_local_backup(
        &state.pool(),
        &admin,
        Some(&backup_dir),
    )
    .await
    .unwrap();

    let restore_ok = printing_backup_service::restore_database(
        &state,
        RestoreDatabaseRequest {
            source_path: Some(backup.ruta_local),
            file_bytes_base64: None,
            file_name: None,
        },
    )
    .await
    .expect("Debe resolver db_path vía PRAGMA database_list y restaurar");
    assert!(restore_ok.success);

    // 4. Base de datos :memory: -> Validation
    let mem_pool = init_db("sqlite::memory:").await.unwrap();
    let mem_state = AppState::new(mem_pool);
    let _mem_admin = login_admin(&mem_state).await;
    let mem_res = printing_backup_service::restore_database(
        &mem_state,
        RestoreDatabaseRequest {
            source_path: restore_ok.pre_restore_backup_path.clone(),
            file_bytes_base64: None,
            file_name: None,
        },
    )
    .await;
    assert!(
        matches!(mem_res, Err(AppError::Validation(_))),
        "Restaurar sobre :memory: debe rechazarse con Validation, obtenido: {:?}",
        mem_res
    );
}
