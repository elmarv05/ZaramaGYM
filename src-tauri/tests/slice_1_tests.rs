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
async fn test_supervisor_and_receptionist_rbac_hierarchy() {
    let (state, _temp_dir) = setup_test_env().await;

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

    // 2. Admin crea SUPERVISOR
    let sup_input = CreateUserInput {
        persona_id: None,
        username: "supervisor1".into(),
        password: "supPassword123".into(),
        tipo_documento: "DNI".into(),
        numero_documento: "44556677".into(),
        nombres: "Carlos".into(),
        apellidos: "Mendoza".into(),
        telefono: Some("987654321".into()),
        email: Some("supervisor@zaramagym.com".into()),
        rol: UserRole::Supervisor,
        foto_perfil_data_url: None,
    };
    let created_sup = auth_service::create_user(&state.pool(), &state, sup_input).await.unwrap();
    assert_eq!(created_sup.rol, UserRole::Supervisor);

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
    let created_rec = auth_service::create_user(&state.pool(), &state, recep_input).await.unwrap();
    assert_eq!(created_rec.rol, UserRole::Recepcionista);

    // Admin ve a todos (3 usuarios: admin, supervisor1, recepcionista1)
    let admin_view = auth_service::list_users(&state.pool(), &state).await.unwrap();
    assert_eq!(admin_view.len(), 3);

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // 4. SUPERVISOR inicia sesión
    auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "supervisor1".into(),
            password: "supPassword123".into(),
        },
    )
    .await
    .unwrap();

    // 4.1 SUPERVISOR lista usuarios: debe ver ÚNICAMENTE a recepcionistas (1 usuario)
    let sup_view = auth_service::list_users(&state.pool(), &state).await.unwrap();
    assert_eq!(sup_view.len(), 1, "Supervisor solo debe ver a los recepcionistas");
    assert_eq!(sup_view[0].username, "recepcionista1");

    // 4.2 SUPERVISOR intenta crear otro SUPERVISOR o ADMINISTRADOR -> Forbidden
    let bad_sup_create = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "otro_supervisor".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "11223344".into(),
            nombres: "Pedro".into(),
            apellidos: "Gomez".into(),
            telefono: None,
            email: None,
            rol: UserRole::Supervisor,
            foto_perfil_data_url: None,
        },
    )
    .await;
    assert!(matches!(bad_sup_create.unwrap_err(), AppError::Forbidden(_)));

    // 4.3 SUPERVISOR puede crear un nuevo RECEPCIONISTA
    let sup_creates_rec = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "recepcionista2".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "22334455".into(),
            nombres: "Ana".into(),
            apellidos: "Ruiz".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .expect("Supervisor debe poder crear un usuario RECEPCIONISTA");
    assert_eq!(sup_creates_rec.username, "recepcionista2");

    // Ahora supervisor ve a los 2 recepcionistas
    let sup_view_2 = auth_service::list_users(&state.pool(), &state).await.unwrap();
    assert_eq!(sup_view_2.len(), 2);

    // 4.4 SUPERVISOR tiene acceso de lectura a get_audit_logs
    let sup_audit_guard = state.require_supervisor_or_admin().await;
    assert!(sup_audit_guard.is_ok(), "Supervisor debe tener acceso a auditoría");

    let audit_logs = audit_service::get_audit_logs(&state.pool(), &AuditFilter::default()).await;
    assert!(audit_logs.is_ok());

    // 4.5 SUPERVISOR intenta toggle_user_active sobre Admin -> Forbidden
    let sup_toggle_admin = auth_service::toggle_user_active(&state.pool(), &state, 1, false).await;
    assert!(matches!(sup_toggle_admin.unwrap_err(), AppError::Forbidden(_)));

    // 4.6 SUPERVISOR desactiva a recepcionista2 -> Éxito
    let sup_toggle_rec = auth_service::toggle_user_active(&state.pool(), &state, sup_creates_rec.id, false).await;
    assert!(sup_toggle_rec.is_ok());

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // 5. RECEPCIONISTA inicia sesión y verifica bloqueos estrictos
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

    // 5.1 list_users -> Forbidden
    let rec_list = auth_service::list_users(&state.pool(), &state).await;
    assert!(matches!(rec_list.unwrap_err(), AppError::Forbidden(_)));

    // 5.2 create_user -> Forbidden
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

    // 5.3 get_audit_logs -> Forbidden
    let rec_audit = state.require_supervisor_or_admin().await;
    assert!(matches!(rec_audit.unwrap_err(), AppError::Forbidden(_)));

    // 5.4 toggle_user_active -> Forbidden
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

    let sup = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "sup_foto".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "33445566".into(),
            nombres: "Esteban".into(),
            apellidos: "Quito".into(),
            telefono: None,
            email: None,
            rol: UserRole::Supervisor,
            foto_perfil_data_url: None,
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

    // Recepcionista intenta actualizar foto de SUPERVISOR -> Forbidden
    let bad_rec_photo = auth_service::update_user_photo(
        &state.pool(),
        &state,
        UpdateUserPhotoInput {
            user_id: sup.id,
            foto_perfil_data_url: Some("data:image/png;base64,hacked".into()),
        },
    )
    .await;
    assert!(matches!(bad_rec_photo.unwrap_err(), AppError::Forbidden(_)));

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // 2. Supervisor actualiza la foto de un RECEPCIONISTA -> Éxito
    auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "sup_foto".into(),
            password: "password123".into(),
        },
    )
    .await
    .unwrap();

    let sup_updates_rec = auth_service::update_user_photo(
        &state.pool(),
        &state,
        UpdateUserPhotoInput {
            user_id: rec.id,
            foto_perfil_data_url: Some("data:image/png;base64,nueva_foto_rec".into()),
        },
    )
    .await;
    assert!(sup_updates_rec.is_ok(), "Supervisor puede actualizar foto de recepcionista");

    // Supervisor intenta actualizar foto de ADMIN -> Forbidden
    let sup_updates_admin = auth_service::update_user_photo(
        &state.pool(),
        &state,
        UpdateUserPhotoInput {
            user_id: 1,
            foto_perfil_data_url: Some("data:image/png;base64,intento".into()),
        },
    )
    .await;
    assert!(matches!(sup_updates_admin.unwrap_err(), AppError::Forbidden(_)));

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // 3. Admin actualiza foto de SUPERVISOR -> Éxito
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

    let admin_updates_sup = auth_service::update_user_photo(
        &state.pool(),
        &state,
        UpdateUserPhotoInput {
            user_id: sup.id,
            foto_perfil_data_url: Some("data:image/png;base64,admin_photo".into()),
        },
    )
    .await;
    assert!(admin_updates_sup.is_ok(), "Admin puede actualizar cualquier foto");
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
