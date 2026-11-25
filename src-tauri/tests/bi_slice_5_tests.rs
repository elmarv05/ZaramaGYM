use base64::Engine;
use chrono::Local;
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::str::FromStr;
use zarama_gym_lib::db::{init_db, run_migrations};
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AttendanceCheckInMode, AuthSession, BiExecutivePdfInput, BiExportFinanceInput,
    BiFinanceFilterInput, BiGranularity, CheckInInput, ClientMembershipFilter, CreateClientInput,
    CreateExpenseDto, CreatePosSaleInput, CreateProductInput, CreateUserInput, ExpenseCategory,
    ExportFileResult, ExportFormat, LoginCredentials, OpenCashShiftInput, PaymentChannel,
    PaymentMethod, PosItemType, PosPaymentInput, PosSaleItemInput, ProductCategory,
    ReceptionistPermissionsDto, TrafficLightColor, UserRole,
};
use zarama_gym_lib::services::{
    attendance_service, auth_service, bi_analytics_service, catalog_service, dashboard_service,
    entity_service, finance_service, permissions_service, pos_service,
};
use zarama_gym_lib::state::AppState;

async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_bi_slice_5.db");
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
            apellidos: "BI5".into(),
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

fn verify_sha256_and_decode(res: &ExportFileResult) -> Vec<u8> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&res.content_base64)
        .expect("Base64 inválido");
    assert_eq!(bytes.len(), res.size_bytes);
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let calc = format!("{:x}", hasher.finalize());
    assert_eq!(calc, res.sha256_hash);
    bytes
}

// ============================================================================
// 1. REPORTE EJECUTIVO PDF CONSOLIDADO EN RAM (RBAC, CONTENIDO Y AUDITORÍA)
// ============================================================================

#[tokio::test]
async fn test_executive_bi_report_pdf_rbac_structure_and_audit() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();

    let recep = create_and_login_recep(&state, "rec_exec_pdf", "93000001").await;
    let admin = login_admin(&state).await;

    let today_str = Local::now().date_naive().format("%Y-%m-%d").to_string();

    // Poblar datos representativos en los 4 bloques
    let client = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("44000001".into()),
            nombres: Some("Camila".into()),
            apellidos: Some("Ejecutiva".into()),
            fecha_nacimiento: Some("1995-05-15".into()),
            genero: Some("FEMENINO".into()),
            telefono: Some("999111333".into()),
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: Some(Decimal::from_str("62.00").unwrap()),
            canal_captacion: Some("REDES_SOCIALES".into()),
        },
    )
    .await
    .unwrap();

    let prod = catalog_service::create_product(
        &pool,
        &admin,
        CreateProductInput {
            codigo_sku: "EXEC-SKU-1".into(),
            nombre: "Bebida Energizante".into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::from_str("4.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("9.00").unwrap(),
            stock_inicial: Some(30),
            stock_minimo: Some(5),
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
        CreatePosSaleInput {
            cliente_id: Some(client.id),
            descuento: None,
            items: vec![
                PosSaleItemInput {
                    tipo_item: PosItemType::Plan,
                    producto_id: None,
                    plan_id: Some(2),
                    credito_id: None,
                    cantidad: 1,
                    precio_unitario: Decimal::from_str("80.00").unwrap(),
                    subtotal: Decimal::from_str("80.00").unwrap(),
                    fecha_inicio_plan: None,
                },
                PosSaleItemInput {
                    tipo_item: PosItemType::Producto,
                    producto_id: Some(prod.id),
                    plan_id: None,
                    credito_id: None,
                    cantidad: 2,
                    precio_unitario: Decimal::from_str("9.00").unwrap(),
                    subtotal: Decimal::from_str("18.00").unwrap(),
                    fecha_inicio_plan: None,
                },
            ],
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::from_str("98.00").unwrap(),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::ServiciosBasicos,
            descripcion: "Internet".into(),
            monto: Decimal::from_str("25.00").unwrap(),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            turno_caja_id: None,
            comprobante_referencia: None,
            fecha_gasto: Some(today_str.clone()),
            notas: None,
        },
    )
    .await
    .unwrap();

    attendance_service::check_in_client(
        &pool,
        &admin,
        CheckInInput {
            qr_token: Some(client.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: Some(AttendanceCheckInMode::QrLocal),
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .unwrap();

    let req = BiExecutivePdfInput {
        fecha_desde: today_str.clone(),
        fecha_hasta: today_str.clone(),
        canal_caja: Some("MIXTA".into()),
    };

    // 1. RBAC: Recepcionista con exportar_reporte_ejecutivo_pdf = false -> Forbidden
    let err = bi_analytics_service::generate_executive_bi_report_pdf(&pool, &recep, req.clone())
        .await;
    assert!(matches!(err, Err(AppError::Forbidden(_))));

    // 2. Habilitar SOLO exportar_reporte_ejecutivo_pdf = true para recepcionista -> Ok (y con métricas completas)
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            exportar_reporte_ejecutivo_pdf: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let rec_pdf =
        bi_analytics_service::generate_executive_bi_report_pdf(&pool, &recep, req.clone())
            .await
            .expect("Recepcionista con permiso gerencial debe poder generar PDF ejecutivo");
    assert_eq!(
        rec_pdf.filename,
        format!("Reporte_Ejecutivo_ZaramaGYM_{}_a_{}.pdf", today_str, today_str)
    );
    assert_eq!(rec_pdf.mime_type, "application/pdf");
    let rec_bytes = verify_sha256_and_decode(&rec_pdf);
    assert!(rec_bytes.starts_with(b"%PDF-1.4"));
    let rec_text = String::from_utf8_lossy(&rec_bytes);
    assert!(rec_text.contains("%%EOF"));
    assert!(rec_text.contains("REPORTE EJECUTIVO DE INTELIGENCIA DE NEGOCIO"));
    assert!(rec_text.contains("BLOQUE 1: FINANZAS Y RENTABILIDAD"));
    assert!(rec_text.contains("BLOQUE 2: SOCIOS, DEMOGRAFIA Y RETENCION"));
    assert!(rec_text.contains("BLOQUE 3: ASISTENCIA Y OPERACION"));
    assert!(rec_text.contains("BLOQUE 4: INVENTARIO Y CONTROL DE RIESGO"));
    assert!(rec_text.contains("98.00"));
    assert!(rec_text.contains("Bebida Energizante"));
    // B-01: Recepcionista sin ver_tab_finanzas debe ver costos/márgenes de inventario como Restringido
    assert!(rec_text.contains("Margen Bruto: Restringido"));
    assert!(rec_text.contains("Valorizacion Stock: Restringido"));

    // 3. Admin siempre Ok aunque todo esté OFF para recepcionista
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto::default(),
    )
    .await
    .unwrap();

    let adm_pdf = bi_analytics_service::generate_executive_bi_report_pdf(&pool, &admin, req)
        .await
        .expect("Administrador siempre debe poder generar PDF ejecutivo");
    let adm_bytes = verify_sha256_and_decode(&adm_pdf);
    assert!(adm_bytes.starts_with(b"%PDF-1.4"));
    let adm_text = String::from_utf8_lossy(&adm_bytes);
    assert!(adm_text.contains("%%EOF"));
    assert!(adm_text.contains("Margen Bruto: PEN "));
    assert!(adm_text.contains("Valorizacion Stock: PEN "));

    // 4. Auditoría REPORT_EXPORTED con BI_REPORTE_EJECUTIVO_PDF
    let audit_rows = sqlx::query(
        "SELECT modulo, detalles_json FROM auditoria_logs WHERE accion = 'REPORT_EXPORTED' AND detalles_json LIKE '%BI_REPORTE_EJECUTIVO_PDF%'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(audit_rows.len(), 2);
    assert_eq!(audit_rows[0].get::<String, _>("modulo"), "REPORTES");
}

// ============================================================================
// 2. NORMALIZACIÓN CONSISTENTE DE FECHA_VENCIMIENTO (POS + MIGRACIÓN + CHECK-IN)
// ============================================================================

#[tokio::test]
async fn test_membership_expiration_normalization_in_pos_migration_and_checkin() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();
    let admin = login_admin(&state).await;

    let today_str = Local::now().date_naive().format("%Y-%m-%d").to_string();

    let c_pase = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("45000001".into()),
            nombres: Some("Pase".into()),
            apellidos: Some("Diario".into()),
            fecha_nacimiento: None,
            genero: None,
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
    .await
    .unwrap();

    let c_legacy = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("45000002".into()),
            nombres: Some("Socio".into()),
            apellidos: Some("Legacy".into()),
            fecha_nacimiento: None,
            genero: None,
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
    .await
    .unwrap();

    pos_service::open_cash_shift(
        &pool,
        &admin,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("50.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    // 1. Venta POS de PASE-DIA (plan_id = 1) debe guardar fecha_vencimiento = "YYYY-MM-DD 23:59:59"
    pos_service::create_pos_sale(
        &pool,
        &admin,
        CreatePosSaleInput {
            cliente_id: Some(c_pase.id),
            descuento: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Plan,
                producto_id: None,
                plan_id: Some(1),
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::from_str("10.00").unwrap(),
                subtotal: Decimal::from_str("10.00").unwrap(),
                fecha_inicio_plan: Some(today_str.clone()),
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

    let memberships = pos_service::list_client_memberships(
        &pool,
        &admin,
        &ClientMembershipFilter {
            cliente_id: Some(c_pase.id),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(memberships.len(), 1);
    assert_eq!(
        memberships[0].fecha_vencimiento,
        format!("{} 23:59:59", today_str)
    );

    // 2. El mismo día de vencimiento, el check-in en attendance_service debe PERMITIR el ingreso (no VENCIDA)
    let checkin = attendance_service::check_in_client(
        &pool,
        &admin,
        CheckInInput {
            qr_token: Some(c_pase.codigo_qr_token.clone()),
            cliente_id: None,
            numero_documento: None,
            modo_ingreso: Some(AttendanceCheckInMode::QrLocal),
            dispositivo_id: None,
            notas: None,
        },
    )
    .await
    .unwrap();
    assert!(
        checkin.ingreso_permitido,
        "Un pase/membresía que vence hoy a las 23:59:59 debe permitir ingreso todo el día"
    );
    assert_ne!(checkin.color_semaforo, TrafficLightColor::Rojo);

    // 3. Simular fila legacy con fecha_vencimiento de 10 caracteres ("YYYY-MM-DD") y correr run_migrations
    let res_legacy = sqlx::query(
        r#"
        INSERT INTO membresias_clientes
            (cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento, precio_pactado, estado, registrado_por_usuario_id)
        VALUES (?, 2, NULL, ?, ?, 80.00, 'ACTIVA', ?)
        "#,
    )
    .bind(c_legacy.id)
    .bind(&today_str)
    .bind(&today_str)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();
    let legacy_mem_id = res_legacy.last_insert_rowid();

    run_migrations(&pool)
        .await
        .expect("run_migrations debe normalizar fecha_vencimiento legacy idempotentemente");

    let normalized_fv: String =
        sqlx::query_scalar("SELECT fecha_vencimiento FROM membresias_clientes WHERE id = ?")
            .bind(legacy_mem_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(normalized_fv, format!("{} 23:59:59", today_str));
}

// ============================================================================
// 3. CIERRE DE AUDITORÍA DE SEGURIDAD (M-01 FECHAS Y B-02 CSV INJECTION)
// ============================================================================

#[tokio::test]
async fn test_security_audit_date_bounds_and_csv_formula_injection() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();
    let admin = login_admin(&state).await;

    // M-01.1: Rango > 3660 días rechazado con AppError::Validation
    let err_over_10y = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2010-01-01".into(),
            fecha_hasta: "2025-01-01".into(),
            granularidad: None,
            canal_caja: None,
        },
    )
    .await;
    assert!(matches!(err_over_10y, Err(AppError::Validation(_))));

    // M-01.2: Granularidad DIA con > 366 días rechazada con AppError::Validation
    let err_daily_over_366 = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2025-01-01".into(),
            fecha_hasta: "2026-06-01".into(),
            granularidad: Some(BiGranularity::Dia),
            canal_caja: None,
        },
    )
    .await;
    assert!(matches!(err_daily_over_366, Err(AppError::Validation(_))));

    // M-01.3: Año fuera de rango 1970..=2100 rechazado con AppError::Validation
    let err_bad_year = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "1950-01-01".into(),
            fecha_hasta: "1950-01-10".into(),
            granularidad: None,
            canal_caja: None,
        },
    )
    .await;
    assert!(matches!(err_bad_year, Err(AppError::Validation(_))));

    // B-02: Neutralización de CSV Formula Injection (=SUM(A1:A2) -> '=SUM(A1:A2))
    entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("46000001".into()),
            nombres: Some("=SUM(A1:A2)".into()),
            apellidos: Some("Formula".into()),
            fecha_nacimiento: None,
            genero: None,
            telefono: Some("+51999888777".into()),
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
            canal_captacion: None,
        },
    )
    .await
    .unwrap();

    let csv_clients =
        dashboard_service::export_clients_roster(&pool, &admin, ExportFormat::Csv)
            .await
            .unwrap();
    let csv_clients_txt = String::from_utf8(verify_sha256_and_decode(&csv_clients)).unwrap();
    assert!(
        csv_clients_txt.contains("'=SUM(A1:A2) Formula"),
        "La fórmula en campo de texto debe neutralizarse con apóstrofe inicial"
    );
    assert!(
        csv_clients_txt.contains("'+51999888777"),
        "El prefijo '+' en campo de texto debe neutralizarse con apóstrofe inicial"
    );
    assert!(
        !csv_clients_txt.contains(",=SUM(A1:A2)"),
        "No debe existir fórmula sin neutralizar en el CSV"
    );

    // Verificar que ExportCell::Number negativo NO recibe apóstrofe
    finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::Otros,
            descripcion: "Gasto negativo".into(),
            monto: Decimal::from_str("45.00").unwrap(),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            turno_caja_id: None,
            comprobante_referencia: None,
            fecha_gasto: Some("2026-11-02".into()),
            notas: None,
        },
    )
    .await
    .unwrap();

    let csv_fin = bi_analytics_service::export_bi_finance_analytics(
        &pool,
        &admin,
        BiExportFinanceInput {
            filter: BiFinanceFilterInput {
                fecha_desde: "2026-11-01".into(),
                fecha_hasta: "2026-11-03".into(),
                granularidad: Some(BiGranularity::Dia),
                canal_caja: None,
            },
            format: ExportFormat::Csv,
        },
    )
    .await
    .unwrap();
    let csv_fin_txt = String::from_utf8(verify_sha256_and_decode(&csv_fin)).unwrap();
    assert!(
        csv_fin_txt.contains(",-45.00\r\n"),
        "Los valores numéricos negativos deben mantenerse sin apóstrofe"
    );
}
