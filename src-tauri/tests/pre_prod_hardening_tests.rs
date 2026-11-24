use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    CreateMobileDeviceInput, LoginCredentials, PairMobileDeviceInput,
};
use zarama_gym_lib::services::{auth_service, lan_service, printing_backup_service};
use zarama_gym_lib::state::AppState;

// ============================================================================
// PRE-PROD HARDENING 1: PERSISTENCIA DE CONTRASEÑA ADMIN TRAS REINICIO / MIGRACIONES
// ============================================================================
#[tokio::test]
async fn test_admin_password_persists_across_restarts_and_migrations() {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("pre_prod_admin_pwd.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    // 1. Arranque inicial: admin / admin123 debe funcionar
    let pool1 = init_db(&db_url).await.expect("Error inicializando BD");
    let state1 = AppState::new_with_db_path(pool1.clone(), db_path.clone());
    let _admin = auth_service::login(
        &pool1,
        &state1,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .expect("Login inicial con admin123 debe funcionar");

    // 2. El administrador cambia su contraseña en producción
    auth_service::change_own_password(&pool1, &state1, "admin123", "ClaveProduccion#2026")
        .await
        .expect("Cambio de contraseña debe completarse");

    pool1.close().await;

    // 3. Simular reinicio completo de ZaramaGYM (vuelve a correr init_db + run_migrations + ensure_valid_admin_seed)
    let pool2 = init_db(&db_url).await.expect("Error reabriendo BD tras reinicio");
    let state2 = AppState::new_with_db_path(pool2.clone(), db_path);

    // 4. La vieja contraseña 'admin123' NO debe haber sido restaurada
    let old_login = auth_service::login(
        &pool2,
        &state2,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await;
    assert!(
        matches!(old_login, Err(AppError::Unauthorized(_))),
        "CRÍTICO: ensure_valid_admin_seed NO debe resetear la contraseña cambiada de admin a admin123"
    );

    // 5. La nueva contraseña de producción DEBE seguir funcionando
    let new_login = auth_service::login(
        &pool2,
        &state2,
        LoginCredentials {
            username: "admin".into(),
            password: "ClaveProduccion#2026".into(),
        },
    )
    .await;
    assert!(
        new_login.is_ok(),
        "La contraseña nueva del administrador debe persistir tras reiniciar: {:?}",
        new_login
    );
}

// ============================================================================
// PRE-PROD HARDENING 2: NO FALSO ÉXITO EN GOOGLE DRIVE CUANDO ESTÁ DESACTIVADO
// ============================================================================
#[tokio::test]
async fn test_gdrive_sync_rejects_when_disabled_instead_of_fake_success() {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("pre_prod_gdrive.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url).await.unwrap();
    let state = AppState::new_with_db_path(pool.clone(), db_path);
    let admin = auth_service::login(
        &pool,
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let backup_dir = temp_dir.path().join("backups");
    let rec = printing_backup_service::create_local_backup(&pool, &admin, Some(&backup_dir))
        .await
        .unwrap();

    // Con Google Drive desactivado (valor por defecto), debe devolver AppError::Validation
    let sync_err = printing_backup_service::sync_backup_to_gdrive(&pool, &admin, rec.id).await;
    match sync_err {
        Err(AppError::Validation(msg)) => {
            assert!(
                msg.contains("desactivado"),
                "Debe indicar claramente que Drive está desactivado: {}",
                msg
            );
        }
        other => panic!(
            "NO debe devolver falso éxito cuando Drive está desactivado, obtuvo: {:?}",
            other
        ),
    }
}

// ============================================================================
// PRE-PROD HARDENING 3: EXPIRACIÓN 60 MIN + RATE LIMIT EN VINCULACIÓN LAN
// ============================================================================
#[tokio::test]
async fn test_lan_pairing_enforces_60_min_ttl_and_rate_limit() {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("pre_prod_lan_ttl.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url).await.unwrap();
    let state = AppState::new_with_db_path(pool.clone(), db_path);
    let admin = auth_service::login(
        &pool,
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // 1. Crear código de vinculación y envejecerlo 65 minutos
    let pairing = lan_service::create_mobile_device_pairing(
        &pool,
        &admin,
        &state,
        CreateMobileDeviceInput {
            nombre_dispositivo: "Celular Expirado Test".into(),
        },
    )
    .await
    .unwrap();

    sqlx::query(
        "UPDATE dispositivos_moviles SET created_at = datetime('now', 'localtime', '-65 minutes') WHERE id = ?",
    )
    .bind(pairing.device_id)
    .execute(&pool)
    .await
    .unwrap();

    let expired_err = lan_service::pair_mobile_device(
        &pool,
        PairMobileDeviceInput {
            codigo_vinculacion: pairing.codigo_vinculacion.clone(),
            user_agent: Some("TestAgent/1.0".into()),
            ip_address: Some("192.168.88.10".into()),
        },
    )
    .await;

    match expired_err {
        Err(AppError::Validation(msg)) => {
            assert!(
                msg.contains("expiró") && msg.contains("60"),
                "Debe rechazar códigos con más de 60 minutos: {}",
                msg
            );
        }
        other => panic!("Esperaba rechazo por expiración (60 min), obtuve: {:?}", other),
    }

    // 2. Probar límite anti-fuerza bruta desde una IP dedicada de prueba
    let attacker_ip = "192.168.99.240";
    for _ in 0..10 {
        let res = lan_service::pair_mobile_device(
            &pool,
            PairMobileDeviceInput {
                codigo_vinculacion: "ZZZZZZ".into(),
                user_agent: Some("BruteForceTest".into()),
                ip_address: Some(attacker_ip.into()),
            },
        )
        .await;
        assert!(matches!(res, Err(AppError::NotFound(_))));
    }

    // El intento 11 debe quedar bloqueado por rate-limit antes de consultar BD
    let blocked = lan_service::pair_mobile_device(
        &pool,
        PairMobileDeviceInput {
            codigo_vinculacion: "ZZZZZZ".into(),
            user_agent: Some("BruteForceTest".into()),
            ip_address: Some(attacker_ip.into()),
        },
    )
    .await;

    match blocked {
        Err(AppError::Validation(msg)) => {
            assert!(
                msg.contains("Demasiados intentos"),
                "Debe bloquear por rate-limiting tras 10 intentos fallidos: {}",
                msg
            );
        }
        other => panic!("Esperaba bloqueo por rate-limit, obtuve: {:?}", other),
    }
}
