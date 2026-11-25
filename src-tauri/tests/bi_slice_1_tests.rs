use rust_decimal::Decimal;
use sqlx::Row;
use std::str::FromStr;
use zarama_gym_lib::db::{init_db, run_migrations};
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AuthSession, CreateClientInput, CreatePersonInput, CreateUserInput, ExportFormat,
    ExportSalesReportRequest, FinancialReportFilter, GenerateFinancialReportPdfRequest,
    LoginCredentials, OpenCashShiftInput, PaymentMethod, PosItemType, PosPaymentInput,
    PosSaleItemInput, ReceptionistPermissionsDto, UpdateClientInput, UpdatePersonInput, UserRole,
};
use zarama_gym_lib::services::{
    auth_service, catalog_service, dashboard_service, entity_service, finance_service,
    permissions_service::{self, ReceptionistPermissionKey},
    pos_service, printing_backup_service,
};
use zarama_gym_lib::state::AppState;

async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_bi_slice_1.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());
    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new(pool);
    (state, temp_dir)
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

async fn create_and_login_recep(state: &AppState, username: &str, dni: &str) -> AuthSession {
    let _ = login_admin(state).await;
    auth_service::create_user(
        &state.pool(),
        state,
        CreateUserInput {
            persona_id: None,
            username: username.into(),
            password: "Password123!".into(),
            tipo_documento: "DNI".into(),
            numero_documento: dni.into(),
            nombres: "Recep".into(),
            apellidos: "Prueba".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .expect("Creación de recepcionista debe ser exitosa");

    auth_service::login(
        &state.pool(),
        state,
        LoginCredentials {
            username: username.into(),
            password: "Password123!".into(),
        },
    )
    .await
    .expect("Login de recepcionista debe ser exitoso")
}

// ============================================================================
// 1. MIGRACIÓN 010: ESQUEMA, ÍNDICES, SEEDS RBAC E IDEMPOTENCIA
// ============================================================================

#[tokio::test]
async fn test_migration_010_schema_indexes_seeds_and_idempotency() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();

    // 1. Verificar PRAGMA user_version == 10
    let version: i64 = sqlx::query_scalar("PRAGMA user_version;")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(version, 10, "PRAGMA user_version debe ser 10");

    // 2. Verificar columnas genero en personas y canal_captacion en clientes
    let persona_cols = sqlx::query("PRAGMA table_info(personas);")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert!(
        persona_cols
            .iter()
            .any(|r| r.get::<String, _>("name").eq_ignore_ascii_case("genero")),
        "Tabla personas debe tener columna genero"
    );

    let cliente_cols = sqlx::query("PRAGMA table_info(clientes);")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert!(
        cliente_cols
            .iter()
            .any(|r| r.get::<String, _>("name").eq_ignore_ascii_case("canal_captacion")),
        "Tabla clientes debe tener columna canal_captacion"
    );

    // 3. Verificar los 4 índices BI en sqlite_master
    let expected_indexes = [
        "idx_venta_detalles_tipo_venta",
        "idx_membresias_cliente_inicio",
        "idx_asistencias_cliente_fecha",
        "idx_turnos_caja_fecha_estado",
    ];
    for idx in expected_indexes {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?",
        )
        .bind(idx)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1, "Debe existir el índice BI '{}'", idx);
    }

    // 4. Verificar seed idempotente de las 12 claves RBAC en '0'
    for key in ReceptionistPermissionKey::ALL {
        let val: String =
            sqlx::query_scalar("SELECT valor FROM configuracion_sistema WHERE clave = ?")
                .bind(key.config_key())
                .fetch_one(&pool)
                .await
                .unwrap_or_else(|_| panic!("Falta clave RBAC {}", key.config_key()));
        assert_eq!(
            val,
            "0",
            "Clave {} debe iniciar en '0' (Secure-by-Default)",
            key.config_key()
        );
    }

    // 5. Verificar restricciones CHECK a nivel de SQLite
    let bad_genero_sql = sqlx::query(
        "INSERT INTO personas (tipo_documento, numero_documento, nombres, apellidos, genero) VALUES ('DNI', '90000001', 'Test', 'Check', 'INVALIDO')",
    )
    .execute(&pool)
    .await;
    assert!(
        bad_genero_sql.is_err(),
        "SQLite CHECK debe rechazar valor de género no permitido"
    );

    sqlx::query(
        "INSERT INTO personas (id, tipo_documento, numero_documento, nombres, apellidos, genero) VALUES (999, 'DNI', '90000002', 'Test', 'Valido', 'FEMENINO')",
    )
    .execute(&pool)
    .await
    .expect("SQLite debe aceptar género FEMENINO");

    let bad_canal_sql = sqlx::query(
        "INSERT INTO clientes (persona_id, codigo_qr_token, canal_captacion) VALUES (999, 'ZG-TESTCHECK01', 'CANAL_INVALIDO')",
    )
    .execute(&pool)
    .await;
    assert!(
        bad_canal_sql.is_err(),
        "SQLite CHECK debe rechazar canal_captacion inválido"
    );

    // 6. Verificar idempotencia real simulando re-ejecución desde versión 9 con un permiso ya activado
    sqlx::query("UPDATE configuracion_sistema SET valor = '1' WHERE clave = 'HOME_RBAC_REC_TAB_SOCIOS'")
        .execute(&pool)
        .await
        .ok();
    sqlx::query(
        "UPDATE configuracion_sistema SET valor = '1' WHERE clave = 'HOME_RBAC_REC_TAB_MEMBERS'",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::raw_sql("PRAGMA user_version = 9;")
        .execute(&pool)
        .await
        .unwrap();

    run_migrations(&pool)
        .await
        .expect("Re-ejecutar run_migrations desde versión 9 debe ser idempotente");

    let version_after: i64 = sqlx::query_scalar("PRAGMA user_version;")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(version_after, 10);

    let preserved_val: String = sqlx::query_scalar(
        "SELECT valor FROM configuracion_sistema WHERE clave = 'HOME_RBAC_REC_TAB_MEMBERS'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        preserved_val, "1",
        "Seed idempotente INSERT OR IGNORE no debe sobrescribir permisos ya configurados"
    );
}

// ============================================================================
// 2. CAMPOS DEMOGRÁFICOS OPCIONALES (GENERO & CANAL_CAPTACION)
// ============================================================================

#[tokio::test]
async fn test_demographic_fields_validation_normalization_and_crud() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();
    let admin = login_admin(&state).await;

    // 1. Persona con género válido con espacios y minúsculas -> normalizado a MAYÚSCULAS
    let person = entity_service::create_person(
        &pool,
        &admin,
        CreatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "71112223".into(),
            nombres: "Elena".into(),
            apellidos: "Vargas".into(),
            fecha_nacimiento: Some("1994-05-12".into()),
            genero: Some("  femenino ".into()),
            telefono: None,
            email: None,
            direccion: None,
        },
    )
    .await
    .expect("Debe crear persona con genero normalizado");
    assert_eq!(person.genero.as_deref(), Some("FEMENINO"));

    let persons_list =
        entity_service::list_persons(&pool, &admin, &Default::default())
            .await
            .unwrap();
    let found_person = persons_list.iter().find(|p| p.id == person.id).unwrap();
    assert_eq!(found_person.genero.as_deref(), Some("FEMENINO"));

    // 2. Persona con género vacío -> None
    let updated_person = entity_service::update_person(
        &pool,
        &admin,
        person.id,
        UpdatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "71112223".into(),
            nombres: "Elena".into(),
            apellidos: "Vargas".into(),
            fecha_nacimiento: Some("1994-05-12".into()),
            genero: Some("   ".into()),
            telefono: None,
            email: None,
            direccion: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(updated_person.genero, None);

    // 3. Persona con género inválido -> AppError::Validation
    let bad_person = entity_service::create_person(
        &pool,
        &admin,
        CreatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "71112224".into(),
            nombres: "Error".into(),
            apellidos: "Genero".into(),
            fecha_nacimiento: None,
            genero: Some("NO_BINARIO_INVALIDO".into()),
            telefono: None,
            email: None,
            direccion: None,
        },
    )
    .await;
    assert!(matches!(bad_person, Err(AppError::Validation(_))));

    // 4. Cliente nuevo con género y canal_captacion normalizados
    let client = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("72223334".into()),
            nombres: Some("Diego".into()),
            apellidos: Some("Quispe".into()),
            fecha_nacimiento: None,
            genero: Some(" masculino ".into()),
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
            canal_captacion: Some("  redes_sociales  ".into()),
        },
    )
    .await
    .expect("Debe crear cliente con campos demográficos válidos");

    assert_eq!(client.genero.as_deref(), Some("MASCULINO"));
    assert_eq!(client.canal_captacion.as_deref(), Some("REDES_SOCIALES"));

    let clients_list =
        entity_service::list_clients(&pool, &admin, &Default::default())
            .await
            .unwrap();
    let listed = clients_list.iter().find(|c| c.id == client.id).unwrap();
    assert_eq!(listed.genero.as_deref(), Some("MASCULINO"));
    assert_eq!(listed.canal_captacion.as_deref(), Some("REDES_SOCIALES"));

    // 5. Actualizar cliente cambiando género y canal_captacion
    let updated_client = entity_service::update_client(
        &pool,
        &admin,
        client.id,
        UpdateClientInput {
            tipo_documento: "DNI".into(),
            numero_documento: "72223334".into(),
            nombres: "Diego".into(),
            apellidos: "Quispe".into(),
            fecha_nacimiento: None,
            genero: Some("prefiero_no_decir".into()),
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            canal_captacion: Some("caminante_fachada".into()),
            modificar_datos_personales: Some(true),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        updated_client.genero.as_deref(),
        Some("PREFIERO_NO_DECIR")
    );
    assert_eq!(
        updated_client.canal_captacion.as_deref(),
        Some("CAMINANTE_FACHADA")
    );

    // 6. Probar los 6 canales permitidos y rechazo de inválidos
    for canal in [
        "REDES_SOCIALES",
        "RECOMENDACION",
        "CAMINANTE_FACHADA",
        "PUBLICIDAD_LOCAL",
        "PROMOCION",
        "OTRO",
    ] {
        let upd = entity_service::update_client(
            &pool,
            &admin,
            client.id,
            UpdateClientInput {
                canal_captacion: Some(canal.into()),
                modificar_datos_personales: Some(false),
                ..UpdateClientInput {
                    tipo_documento: String::new(),
                    numero_documento: String::new(),
                    nombres: String::new(),
                    apellidos: String::new(),
                    fecha_nacimiento: None,
                    genero: None,
                    telefono: None,
                    email: None,
                    direccion: None,
                    nombre_contacto_emergencia: None,
                    numero_contacto_emergencia: None,
                    notas_medicas: None,
                    canal_captacion: None,
                    modificar_datos_personales: None,
                }
            },
        )
        .await
        .unwrap();
        assert_eq!(upd.canal_captacion.as_deref(), Some(canal));
        // genero en personas no debe haberse borrado al usar modificar_datos_personales: Some(false)
        assert_eq!(upd.genero.as_deref(), Some("PREFIERO_NO_DECIR"));
    }

    let bad_canal = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("73334445".into()),
            nombres: Some("Mal".into()),
            apellidos: Some("Canal".into()),
            fecha_nacimiento: None,
            genero: Some("OTRO".into()),
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
            canal_captacion: Some("TIKTOK_RANDOM".into()),
        },
    )
    .await;
    assert!(matches!(bad_canal, Err(AppError::Validation(_))));

    let bad_client_genero = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("74445556".into()),
            nombres: Some("Mal".into()),
            apellidos: Some("Genero".into()),
            fecha_nacimiento: None,
            genero: Some("INVALIDO".into()),
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
            canal_captacion: None,
        },
    )
    .await;
    assert!(matches!(bad_client_genero, Err(AppError::Validation(_))));

    // 7. Verificar protección Caso Juan Pérez: recepcionista puede actualizar canal_captacion con modificar_datos_personales=false, pero NO genero
    let admin_client = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: Some(admin.persona_id),
            tipo_documento: None,
            numero_documento: None,
            nombres: None,
            apellidos: None,
            fecha_nacimiento: None,
            genero: Some("MASCULINO".into()),
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
            canal_captacion: Some("OTRO".into()),
        },
    )
    .await
    .unwrap();

    let recep = create_and_login_recep(&state, "rec_demo", "75556667").await;
    let recep_upd_canal = entity_service::update_client(
        &pool,
        &recep,
        admin_client.id,
        UpdateClientInput {
            tipo_documento: String::new(),
            numero_documento: String::new(),
            nombres: String::new(),
            apellidos: String::new(),
            fecha_nacimiento: None,
            genero: None,
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            canal_captacion: Some("PROMOCION".into()),
            modificar_datos_personales: Some(false),
        },
    )
    .await
    .expect("Recepcionista debe poder editar canal_captacion sin tocar personas");
    assert_eq!(recep_upd_canal.canal_captacion.as_deref(), Some("PROMOCION"));
    assert_eq!(recep_upd_canal.genero.as_deref(), Some("MASCULINO"));

    let recep_tamper_genero = entity_service::update_client(
        &pool,
        &recep,
        admin_client.id,
        UpdateClientInput {
            tipo_documento: String::new(),
            numero_documento: String::new(),
            nombres: String::new(),
            apellidos: String::new(),
            fecha_nacimiento: None,
            genero: Some("FEMENINO".into()),
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            canal_captacion: None,
            modificar_datos_personales: None,
        },
    )
    .await;
    assert!(matches!(recep_tamper_genero, Err(AppError::Forbidden(_))));
}

// ============================================================================
// 3. PERMISOS RBAC CONFIGURABLES (12 CLAVES), AUDITORÍA Y ENFORCEMENT
// ============================================================================

#[tokio::test]
async fn test_configurable_rbac_permissions_crud_audit_and_enforcement() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();

    let recep = create_and_login_recep(&state, "rec_rbac", "76667778").await;
    let admin = login_admin(&state).await;

    // 1. Estado por defecto (Secure-by-Default)
    let default_rec = permissions_service::get_receptionist_permissions(&pool)
        .await
        .unwrap();
    assert_eq!(default_rec, ReceptionistPermissionsDto::default());

    let eff_rec = permissions_service::get_effective_permissions(&pool, &recep)
        .await
        .unwrap();
    assert_eq!(eff_rec, ReceptionistPermissionsDto::default());

    let eff_admin = permissions_service::get_effective_permissions(&pool, &admin)
        .await
        .unwrap();
    for key in ReceptionistPermissionKey::ALL {
        assert!(
            key.get_flag(&eff_admin),
            "Administrador debe tener efectivo = true para {:?}",
            key
        );
        assert!(
            permissions_service::has_permission(&pool, &admin, key)
                .await
                .unwrap(),
            "has_permission debe ser true para Administrador en {:?}",
            key
        );
        assert!(
            !permissions_service::has_permission(&pool, &recep, key)
                .await
                .unwrap(),
            "has_permission debe ser false por defecto para Recepcionista en {:?}",
            key
        );
    }

    // 2. Recepcionista NO puede actualizar permisos
    let forbidden_upd = permissions_service::update_receptionist_permissions(
        &pool,
        &recep,
        ReceptionistPermissionsDto {
            ver_tab_socios: true,
            ..Default::default()
        },
    )
    .await;
    assert!(matches!(forbidden_upd, Err(AppError::Forbidden(_))));

    // 3. Probar activación individual de cada uno de los 12 permisos + auditoría compacta
    for (idx, key) in ReceptionistPermissionKey::ALL.iter().enumerate() {
        let mut dto = ReceptionistPermissionsDto::default();
        key.set_flag(&mut dto, true);

        let saved = permissions_service::update_receptionist_permissions(&pool, &admin, dto.clone())
            .await
            .unwrap();
        assert_eq!(saved, dto);

        for check_key in ReceptionistPermissionKey::ALL {
            let expected = check_key == *key;
            assert_eq!(
                permissions_service::has_permission(&pool, &recep, check_key)
                    .await
                    .unwrap(),
                expected,
                "Iteración {}: permiso {:?} debe ser {}",
                idx,
                check_key,
                expected
            );
        }
    }

    // Verificar auditoría HOME_PERMISSIONS_UPDATED en modulo USUARIOS y detalles < 200 bytes
    let audit_rows = sqlx::query(
        "SELECT modulo, accion, detalles_json FROM auditoria_logs WHERE modulo = 'USUARIOS' AND accion = 'HOME_PERMISSIONS_UPDATED' ORDER BY id DESC",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(audit_rows.len(), 12);
    for row in &audit_rows {
        let details: String = row.get("detalles_json");
        assert!(
            details.len() < 200,
            "detalles_json debe ser compacto (< 200 bytes), actual: {} bytes",
            details.len()
        );
    }

    // 4. Si falta una clave en configuracion_sistema, se interpreta como false
    sqlx::query("DELETE FROM configuracion_sistema WHERE clave = 'HOME_RBAC_REC_EXPORT_EXEC_PDF'")
        .execute(&pool)
        .await
        .unwrap();
    let after_delete = permissions_service::get_receptionist_permissions(&pool)
        .await
        .unwrap();
    assert!(!after_delete.exportar_reporte_ejecutivo_pdf);
    assert!(!permissions_service::has_permission(
        &pool,
        &recep,
        ReceptionistPermissionKey::ExportarReporteEjecutivoPdf
    )
    .await
    .unwrap());

    // 5. Reset a todo OFF y verificar enforcement completo en endpoints protegidos
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto::default(),
    )
    .await
    .unwrap();

    // Crear venta para tener ingresos del mes reales
    let _prod = catalog_service::create_product(
        &pool,
        &admin,
        zarama_gym_lib::models::CreateProductInput {
            codigo_sku: "SKU-BI-1".into(),
            nombre: "Agua BI".into(),
            categoria: zarama_gym_lib::models::ProductCategory::Bebidas,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::from_str("2.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("5.00").unwrap(),
            stock_inicial: Some(20),
            stock_minimo: Some(2),
            proveedor_preferido_id: None,
        },
    )
    .await
    .unwrap();

    pos_service::open_cash_shift(
        &pool,
        &admin,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("100.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    pos_service::create_pos_sale(
        &pool,
        &admin,
        zarama_gym_lib::models::CreatePosSaleInput {
            cliente_id: None,
            descuento: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(_prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 2,
                precio_unitario: Decimal::from_str("5.00").unwrap(),
                subtotal: Decimal::from_str("10.00").unwrap(),
                fecha_inicio_plan: None,
            }],
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::from_str("10.00").unwrap(),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    // Admin siempre tiene acceso aunque todo esté OFF para recepcionista
    let admin_dash = dashboard_service::get_home_dashboard_metrics(&pool, &admin)
        .await
        .unwrap();
    assert!(admin_dash.can_view_monthly_revenue);
    assert_eq!(
        admin_dash.ingresos_mes_total,
        Decimal::from_str("10.00").unwrap()
    );
    assert!(dashboard_service::export_clients_roster(&pool, &admin, ExportFormat::Csv)
        .await
        .is_ok());
    assert!(dashboard_service::export_debtors_portfolio(&pool, &admin, ExportFormat::Csv)
        .await
        .is_ok());
    assert!(dashboard_service::export_sales_cash_report(
        &pool,
        &admin,
        ExportSalesReportRequest {
            fecha_desde: None,
            fecha_hasta: None,
            canal_filtro: None,
            format: ExportFormat::Csv,
        },
    )
    .await
    .is_ok());
    assert!(finance_service::get_financial_dashboard_summary(
        &pool,
        &admin,
        &FinancialReportFilter::default(),
    )
    .await
    .is_ok());
    assert!(printing_backup_service::generate_financial_report_pdf(
        &pool,
        &admin,
        GenerateFinancialReportPdfRequest {
            fecha_desde: "".into(),
            fecha_hasta: "".into(),
            canal_filtro: None,
        },
    )
    .await
    .is_ok());

    // Recepcionista con todo OFF: ingresos del mes ocultos y 5 endpoints denegados con Forbidden
    let rec_dash_off = dashboard_service::get_home_dashboard_metrics(&pool, &recep)
        .await
        .unwrap();
    assert!(!rec_dash_off.can_view_monthly_revenue);
    assert_eq!(rec_dash_off.ingresos_mes_total, Decimal::ZERO);

    assert!(matches!(
        dashboard_service::export_clients_roster(&pool, &recep, ExportFormat::Csv).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        dashboard_service::export_debtors_portfolio(&pool, &recep, ExportFormat::Csv).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        dashboard_service::export_sales_cash_report(
            &pool,
            &recep,
            ExportSalesReportRequest {
                fecha_desde: None,
                fecha_hasta: None,
                canal_filtro: None,
                format: ExportFormat::Csv,
            },
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        finance_service::get_financial_dashboard_summary(
            &pool,
            &recep,
            &FinancialReportFilter::default(),
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        printing_backup_service::generate_financial_report_pdf(
            &pool,
            &recep,
            GenerateFinancialReportPdfRequest {
                fecha_desde: "".into(),
                fecha_hasta: "".into(),
                canal_filtro: None,
            },
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    // Habilitar los permisos para Recepcionista -> todos deben pasar a Ok y ver ingresos del mes
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            ver_ingresos_mes_operativo: true,
            ver_dashboard_modulo_finanzas: true,
            exportar_clientes: true,
            exportar_deudores: true,
            exportar_ventas_caja: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let rec_dash_on = dashboard_service::get_home_dashboard_metrics(&pool, &recep)
        .await
        .unwrap();
    assert!(rec_dash_on.can_view_monthly_revenue);
    assert_eq!(
        rec_dash_on.ingresos_mes_total,
        Decimal::from_str("10.00").unwrap()
    );

    assert!(dashboard_service::export_clients_roster(&pool, &recep, ExportFormat::Csv)
        .await
        .is_ok());
    assert!(dashboard_service::export_debtors_portfolio(&pool, &recep, ExportFormat::Csv)
        .await
        .is_ok());
    assert!(dashboard_service::export_sales_cash_report(
        &pool,
        &recep,
        ExportSalesReportRequest {
            fecha_desde: None,
            fecha_hasta: None,
            canal_filtro: None,
            format: ExportFormat::Csv,
        },
    )
    .await
    .is_ok());
    assert!(finance_service::get_financial_dashboard_summary(
        &pool,
        &recep,
        &FinancialReportFilter::default(),
    )
    .await
    .is_ok());
    assert!(printing_backup_service::generate_financial_report_pdf(
        &pool,
        &recep,
        GenerateFinancialReportPdfRequest {
            fecha_desde: "".into(),
            fecha_hasta: "".into(),
            canal_filtro: None,
        },
    )
    .await
    .is_ok());
}
