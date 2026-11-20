use zarama_gym_lib::db::{init_db, verify_pragmas};
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AuditFilter, CreateUserInput, LoginCredentials, UpdateUserPhotoInput, UserRole,
};
use zarama_gym_lib::services::{audit_service, auth_service};
use zarama_gym_lib::state::AppState;

/// Helper para crear un entorno aislado con base de datos en archivo temporal
async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_slice1.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new(pool);
    (state, temp_dir)
}

#[tokio::test]
async fn test_sqlite_pragmas_wal_and_foreign_keys() {
    let (state, _temp_dir) = setup_test_env().await;

    // 1. Verificar pragmas WAL y foreign_keys = ON
    let (journal_mode, fk_enabled) = verify_pragmas(&state.pool())
        .await
        .expect("Error consultando PRAGMAs");

    assert_eq!(journal_mode, "WAL", "El modo de SQLite debe ser WAL");
    assert!(fk_enabled, "foreign_keys debe estar activado");

    // 2. Verificar que una violación de foreign_key sea rechazada
    let res = sqlx::query(
        "INSERT INTO usuarios_sistema (persona_id, username, password_hash, rol_principal) VALUES (99999, 'fantasma', 'hash', 'RECEPCIONISTA')"
    )
    .execute(&state.pool())
    .await;

    assert!(res.is_err(), "Debe fallar por foreign_key inexistente en personas");
}

#[tokio::test]
async fn test_seed_admin_login_success_and_audit() {
    let (state, _temp_dir) = setup_test_env().await;

    let credentials = LoginCredentials {
        username: "admin".to_string(),
        password: "admin123".to_string(),
    };

    let session = auth_service::login(&state.pool(), &state, credentials)
        .await
        .expect("El login del seed admin debe ser exitoso");

    assert_eq!(session.username, "admin");
    assert_eq!(session.rol, UserRole::Administrador);
    assert_eq!(session.persona_id, 1);
    assert!(!session.is_locked);
    assert_eq!(session.nombre_completo, "Administrador Principal");

    let logs = audit_service::get_audit_logs(&state.pool(), &AuditFilter::default())
        .await
        .expect("Error consultando logs");

    let acciones: Vec<String> = logs.iter().map(|l| l.accion.clone()).collect();
    assert!(
        acciones.contains(&"SISTEMA_INICIALIZADO".to_string()),
        "Debe existir log SISTEMA_INICIALIZADO"
    );
    assert!(
        acciones.contains(&"LOGIN_EXITOSO".to_string()),
        "Debe existir log LOGIN_EXITOSO"
    );
}

#[tokio::test]
async fn test_login_failed_wrong_password_and_user_not_found() {
    let (state, _temp_dir) = setup_test_env().await;

    // 1. Clave errónea
    let res_bad_pw = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "password_incorrecta".into(),
        },
    )
    .await;
    assert!(matches!(res_bad_pw.unwrap_err(), AppError::Unauthorized(_)));

    // 2. Usuario inexistente
    let res_no_user = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "no_existo".into(),
            password: "admin123".into(),
        },
    )
    .await;
    assert!(matches!(res_no_user.unwrap_err(), AppError::Unauthorized(_)));

    let logs = audit_service::get_audit_logs(
        &state.pool(),
        &AuditFilter {
            accion: Some("LOGIN_FALLIDO".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(logs.len(), 2, "Debe haber 2 registros de LOGIN_FALLIDO");
}

#[tokio::test]
async fn test_session_lock_and_unlock_lifecycle() {
    let (state, _temp_dir) = setup_test_env().await;

    // Login inicial
    auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // Bloquear sesión
    auth_service::lock_session(&state.pool(), &state).await.unwrap();

    let sess = auth_service::get_current_session(&state)
        .await
        .unwrap()
        .expect("Debe existir sesión");
    assert!(sess.is_locked);

    // Intentar invocar acción protegida mientras está bloqueado: debe fallar con SessionLocked
    let list_res = auth_service::list_users(&state.pool(), &state).await;
    assert!(matches!(list_res.unwrap_err(), AppError::SessionLocked(_)));

    // Desbloquear con clave incorrecta: falla con Unauthorized
    let unlock_bad = auth_service::unlock_session(&state.pool(), &state, "clave_mala").await;
    assert!(matches!(unlock_bad.unwrap_err(), AppError::Unauthorized(_)));

    // Desbloquear con clave correcta
    let unlock_ok = auth_service::unlock_session(&state.pool(), &state, "admin123").await;
    assert!(unlock_ok.is_ok());
    assert!(!unlock_ok.unwrap().is_locked);

    let users = auth_service::list_users(&state.pool(), &state).await.unwrap();
    assert!(!users.is_empty());
}

#[tokio::test]
async fn test_admin_and_receptionist_rbac_hierarchy() {
    let (state, _temp_dir) = setup_test_env().await;

    // Verificar que "SUPERVISOR" es rechazado por UserRole::from_str
    let invalid_role = "SUPERVISOR".parse::<UserRole>();
    assert!(matches!(invalid_role, Err(AppError::Validation(_))));

    // 1. Admin login
    auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // 2. Admin crea otro ADMINISTRADOR
    let admin2_input = CreateUserInput {
        persona_id: None,
        username: "admin2".into(),
        password: "admPassword123".into(),
        tipo_documento: "DNI".into(),
        numero_documento: "44556677".into(),
        nombres: "Carlos".into(),
        apellidos: "Mendoza".into(),
        telefono: Some("987654321".into()),
        email: Some("admin2@zaramagym.com".into()),
        rol: UserRole::Administrador,
        foto_perfil_data_url: None,
    };
    let created_adm2 = auth_service::create_user(&state.pool(), &state, admin2_input)
        .await
        .unwrap();
    assert_eq!(created_adm2.rol, UserRole::Administrador);

    // 3. Admin crea RECEPCIONISTA 1
    let recep_input = CreateUserInput {
        persona_id: None,
        username: "recepcionista1".into(),
        password: "recPassword123".into(),
        tipo_documento: "DNI".into(),
        numero_documento: "88776655".into(),
        nombres: "Mariana".into(),
        apellidos: "Lopez".into(),
        telefono: None,
        email: None,
        rol: UserRole::Recepcionista,
        foto_perfil_data_url: None,
    };
    let created_rec = auth_service::create_user(&state.pool(), &state, recep_input)
        .await
        .unwrap();
    assert_eq!(created_rec.rol, UserRole::Recepcionista);

    // Admin ve a todos (3 usuarios: admin, admin2, recepcionista1)
    let admin_view = auth_service::list_users(&state.pool(), &state).await.unwrap();
    assert_eq!(admin_view.len(), 3);

    // Admin tiene acceso a auditoría
    let adm_audit_guard = state.require_admin().await;
    assert!(adm_audit_guard.is_ok(), "Admin debe tener acceso a auditoría");
    let audit_logs = audit_service::get_audit_logs(&state.pool(), &AuditFilter::default()).await;
    assert!(audit_logs.is_ok());

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // 4. RECEPCIONISTA inicia sesión y verifica bloqueos estrictos
    auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "recepcionista1".into(),
            password: "recPassword123".into(),
        },
    )
    .await
    .unwrap();

    // 4.1 list_users -> Forbidden
    let rec_list = auth_service::list_users(&state.pool(), &state).await;
    assert!(matches!(rec_list.unwrap_err(), AppError::Forbidden(_)));

    // 4.2 create_user -> Forbidden
    let rec_create = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "hacker".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "99998888".into(),
            nombres: "Hack".into(),
            apellidos: "Er".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await;
    assert!(matches!(rec_create.unwrap_err(), AppError::Forbidden(_)));

    // 4.3 get_audit_logs / require_admin -> Forbidden
    let rec_audit = state.require_admin().await;
    assert!(matches!(rec_audit.unwrap_err(), AppError::Forbidden(_)));

    // 4.4 toggle_user_active -> Forbidden
    let rec_toggle = auth_service::toggle_user_active(&state.pool(), &state, 1, false).await;
    assert!(matches!(rec_toggle.unwrap_err(), AppError::Forbidden(_)));
}

#[tokio::test]
async fn test_user_profile_photo_hierarchical_permissions() {
    let (state, _temp_dir) = setup_test_env().await;

    // Login Admin
    auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let rec = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "rec_foto".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "55667788".into(),
            nombres: "Rosa".into(),
            apellidos: "Flores".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // 1. Recepcionista actualiza su PROPIA foto -> Éxito
    let rec_sess = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "rec_foto".into(),
            password: "password123".into(),
        },
    )
    .await
    .unwrap();

    let own_photo_res = auth_service::update_user_photo(
        &state.pool(),
        &state,
        UpdateUserPhotoInput {
            user_id: rec_sess.user_id,
            foto_perfil_data_url: Some("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...".into()),
        },
    )
    .await;
    assert!(own_photo_res.is_ok(), "Recepcionista debe poder actualizar su propia foto");

    // Recepcionista intenta actualizar foto de ADMIN -> Forbidden
    let bad_rec_photo = auth_service::update_user_photo(
        &state.pool(),
        &state,
        UpdateUserPhotoInput {
            user_id: 1,
            foto_perfil_data_url: Some("data:image/png;base64,hacked".into()),
        },
    )
    .await;
    assert!(matches!(bad_rec_photo.unwrap_err(), AppError::Forbidden(_)));

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // 2. Admin actualiza foto de RECEPCIONISTA -> Éxito
    auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let admin_updates_rec = auth_service::update_user_photo(
        &state.pool(),
        &state,
        UpdateUserPhotoInput {
            user_id: rec.id,
            foto_perfil_data_url: Some("data:image/png;base64,admin_photo".into()),
        },
    )
    .await;
    assert!(admin_updates_rec.is_ok(), "Admin puede actualizar cualquier foto");
}

#[tokio::test]
async fn test_change_own_password_and_defenses() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // Auto-desactivación impedida
    let auto_toggle = auth_service::toggle_user_active(&state.pool(), &state, admin_session.user_id, false).await;
    assert!(matches!(auto_toggle.unwrap_err(), AppError::Validation(_)));

    // Desactivar ID 1 impedido
    let root_toggle = auth_service::toggle_user_active(&state.pool(), &state, 1, false).await;
    assert!(matches!(root_toggle.unwrap_err(), AppError::Validation(_)));

    // Cambio de contraseña propia
    let change_ok = auth_service::change_own_password(&state.pool(), &state, "admin123", "nuevaSuperClave999").await;
    assert!(change_ok.is_ok());

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // Comprobar login con nueva contraseña
    let new_login = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "nuevaSuperClave999".into(),
        },
    )
    .await;
    assert!(new_login.is_ok());
}

#[tokio::test]
async fn test_legacy_supervisor_role_migrates_to_receptionist_and_check_constraint() {
    use sqlx::Row;

    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_legacy_supervisor.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    // 1. Simular base de datos heredada con constraint antiguo y un usuario SUPERVISOR
    {
        let opts = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);
        let legacy_pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();

        sqlx::raw_sql(
            r#"
            CREATE TABLE personas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo_documento TEXT NOT NULL,
                numero_documento TEXT NOT NULL UNIQUE,
                nombres TEXT NOT NULL,
                apellidos TEXT NOT NULL,
                fecha_nacimiento TEXT,
                telefono TEXT,
                email TEXT,
                direccion TEXT,
                estado_activo INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE usuarios_sistema (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                persona_id INTEGER NOT NULL UNIQUE REFERENCES personas(id) ON DELETE RESTRICT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                rol_principal TEXT NOT NULL CHECK(rol_principal IN ('ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA')),
                foto_perfil_data_url TEXT,
                estado_activo INTEGER NOT NULL DEFAULT 1,
                ultimo_login TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            INSERT INTO personas (id, tipo_documento, numero_documento, nombres, apellidos) VALUES (2, 'DNI', '55443322', 'Legacy', 'Supervisor');
            INSERT INTO usuarios_sistema (id, persona_id, username, password_hash, rol_principal) VALUES (2, 2, 'legacy_sup', 'hash', 'SUPERVISOR');
            "#,
        )
        .execute(&legacy_pool)
        .await
        .unwrap();
        legacy_pool.close().await;
    }

    // 2. Ejecutar init_db / run_migrations sobre la DB heredada
    let pool = init_db(&db_url).await.expect("init_db debe migrar BD heredada");
    let row = sqlx::query("SELECT rol_principal FROM usuarios_sistema WHERE id = 2")
        .fetch_one(&pool)
        .await
        .unwrap();
    let migrated_role: String = row.get("rol_principal");
    assert_eq!(migrated_role, "RECEPCIONISTA");

    // 3. En una BD fresca, el CHECK constraint debe rechazar 'SUPERVISOR'
    let (fresh_state, _fresh_dir) = setup_test_env().await;
    let insert_sup = sqlx::query(
        "INSERT INTO usuarios_sistema (persona_id, username, password_hash, rol_principal) VALUES (1, 'bad_sup', 'hash', 'SUPERVISOR')",
    )
    .execute(&fresh_state.pool())
    .await;
    assert!(insert_sup.is_err(), "CHECK constraint debe rechazar SUPERVISOR");
}
