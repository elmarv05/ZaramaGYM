use base64::Engine;
use chrono::{Duration, Local};
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::str::FromStr;
use zarama_gym_lib::commands::entity_commands::validate_external_url;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    CreateClientInput, CreatePosSaleInput, CreateProductInput, CreateUserInput, ExportFormat,
    ExportSalesReportRequest, LoginCredentials, OpenCashShiftInput, PaymentMethod, PosItemType,
    PosPaymentInput, PosSaleItemInput, ProductCategory, UserRole,
};
use zarama_gym_lib::services::{
    auth_service, catalog_service, dashboard_service, entity_service, pos_service,
};
use zarama_gym_lib::state::AppState;

async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_phase2.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());
    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new(pool);
    (state, temp_dir)
}

async fn login_admin(state: &AppState) -> zarama_gym_lib::models::AuthSession {
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

async fn create_and_login_role(
    state: &AppState,
    username: &str,
    dni: &str,
    rol: UserRole,
) -> zarama_gym_lib::models::AuthSession {
    let _ = login_admin(state).await;
    let _ = auth_service::create_user(
        &state.pool(),
        state,
        CreateUserInput {
            persona_id: None,
            username: username.into(),
            password: "Password123!".into(),
            tipo_documento: "DNI".into(),
            numero_documento: dni.into(),
            nombres: format!("Usuario {}", username),
            apellidos: "Prueba".into(),
            telefono: None,
            email: None,
            rol,
            foto_perfil_data_url: None,
        },
    )
    .await
    .expect("Creación de usuario debe ser exitosa");

    auth_service::login(
        &state.pool(),
        state,
        LoginCredentials {
            username: username.into(),
            password: "Password123!".into(),
        },
    )
    .await
    .expect("Login de usuario debe ser exitoso")
}

async fn create_sample_client(
    state: &AppState,
    session: &zarama_gym_lib::models::AuthSession,
    dni: &str,
    nombres: &str,
    apellidos: &str,
    telefono: Option<&str>,
) -> i64 {
    let detail = entity_service::create_client(
        &state.pool(),
        session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some(dni.into()),
            nombres: Some(nombres.into()),
            apellidos: Some(apellidos.into()),
            fecha_nacimiento: None,
            telefono: telefono.map(String::from),
            email: Some(format!("{}@example.com", dni)),
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
        },
    )
    .await
    .expect("Creación de cliente debe ser exitosa");
    detail.id
}

fn verify_sha256_and_decode(res: &zarama_gym_lib::models::ExportFileResult) -> Vec<u8> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&res.content_base64)
        .expect("El contenido exportado debe ser Base64 válido");
    assert_eq!(bytes.len(), res.size_bytes);
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let calc_hash = format!("{:x}", hasher.finalize());
    assert_eq!(calc_hash, res.sha256_hash);
    bytes
}

// ============================================================================
// PARTE A: VALIDACIÓN SEGURA DE ENLACES EXTERNOS (WHATSAPP)
// ============================================================================

#[test]
fn test_validate_external_url_allows_whatsapp_and_https_and_rejects_unsafe() {
    assert_eq!(
        validate_external_url("  https://wa.me/51999888777?text=Hola%20Juan  ").unwrap(),
        "https://wa.me/51999888777?text=Hola%20Juan"
    );
    assert_eq!(
        validate_external_url("https://api.whatsapp.com/send?phone=51999888777&text=Recordatorio")
            .unwrap(),
        "https://api.whatsapp.com/send?phone=51999888777&text=Recordatorio"
    );
    assert_eq!(
        validate_external_url("https://zaramagym.pe/ayuda").unwrap(),
        "https://zaramagym.pe/ayuda"
    );

    let invalid_cases = [
        "",
        "   ",
        "javascript:alert(1)",
        "file:///C:/Windows/System32/cmd.exe",
        "http://wa.me/51999888777",
        "cmd:calc.exe",
        "data:text/html,<script>alert(1)</script>",
        "https://",
        "https:///path",
        "https://wa.me/51999888777?text=hola mundo",
        "https://wa.me/51999888777\nwhoami",
    ];

    for bad in invalid_cases {
        let res = validate_external_url(bad);
        assert!(
            matches!(res, Err(AppError::Validation(_))),
            "Se esperaba AppError::Validation para '{}', obtenido: {:?}",
            bad,
            res
        );
    }
}

// ============================================================================
// PARTE B: HOME DASHBOARD ANALYTICS (TAREA 2.1)
// ============================================================================

#[tokio::test]
async fn test_home_dashboard_metrics_aggregations_and_rbac() {
    let (state, _tmp) = setup_test_env().await;
    let supervisor = create_and_login_role(&state, "sup_dash", "22334455", UserRole::Supervisor).await;
    let recep =
        create_and_login_role(&state, "rec_dash", "33445566", UserRole::Recepcionista).await;

    // Reestablecer sesión activa como admin para setup
    let admin = login_admin(&state).await;

    // 1. Crear 4 clientes: 3 activos y 1 inactivo
    let c_hoy = create_sample_client(&state, &admin, "40000001", "Ana", "Vence Hoy", Some("999111222")).await;
    let c_2d = create_sample_client(&state, &admin, "40000002", "Bruno", "Vence Dos", Some("999333444")).await;
    let c_5d = create_sample_client(&state, &admin, "40000003", "Carlos", "Vence Cinco", None).await;
    let c_inactivo = create_sample_client(&state, &admin, "40000004", "Dora", "Inactiva", None).await;

    entity_service::toggle_client_active(&state.pool(), &admin, c_inactivo, false)
        .await
        .unwrap();

    // 2. Insertar membresías con vencimientos controlados: hoy (0d), +2d, +5d, vencida (-2d), y +1d en cliente inactivo
    let today = Local::now().date_naive();
    let d_0 = today.format("%Y-%m-%d").to_string();
    let d_2 = (today + Duration::days(2)).format("%Y-%m-%d").to_string();
    let d_5 = (today + Duration::days(5)).format("%Y-%m-%d").to_string();
    let d_1 = (today + Duration::days(1)).format("%Y-%m-%d").to_string();
    let d_past = (today - Duration::days(2)).format("%Y-%m-%d").to_string();

    for (cid, fv, estado) in [
        (c_hoy, format!("{} 23:59:59", d_0), "ACTIVA"),
        (c_2d, d_2.clone(), "ACTIVA"), // también probamos formato solo fecha YYYY-MM-DD
        (c_5d, format!("{} 23:59:59", d_5), "ACTIVA"),
        (c_5d, format!("{} 23:59:59", d_past), "VENCIDA"),
        (c_inactivo, format!("{} 23:59:59", d_1), "ACTIVA"),
    ] {
        sqlx::query(
            r#"
            INSERT INTO membresias_clientes
                (cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento, precio_pactado, estado, registrado_por_usuario_id)
            VALUES (?, 2, NULL, ?, ?, 80.00, ?, ?)
            "#,
        )
        .bind(cid)
        .bind(&d_past)
        .bind(&fv)
        .bind(estado)
        .bind(admin.user_id)
        .execute(&state.pool())
        .await
        .unwrap();
    }

    // 3. Insertar asistencias hoy en franjas 07:xx (x2) y 18:xx (x1)
    let ts_07a = format!("{} 07:10:00", d_0);
    let ts_07b = format!("{} 07:45:00", d_0);
    let ts_18 = format!("{} 18:20:00", d_0);
    for (cid, ts) in [(c_hoy, ts_07a), (c_2d, ts_07b), (c_5d, ts_18)] {
        sqlx::query(
            r#"
            INSERT INTO asistencias
                (cliente_id, membresia_id, fecha_hora_ingreso, modo_ingreso, color_semaforo, motivo_semaforo, dias_restantes_momento, deuda_pendiente_momento, registrado_por_usuario_id)
            VALUES (?, NULL, ?, 'QR_LOCAL', 'VERDE', 'OK', 5, 0.00, ?)
            "#,
        )
        .bind(cid)
        .bind(&ts)
        .bind(admin.user_id)
        .execute(&state.pool())
        .await
        .unwrap();
    }

    // 4. Abrir caja y registrar ventas hoy (efectivo + digital + crédito + una venta tachada que no debe sumar ingresos)
    let _shift = pos_service::open_cash_shift(
        &state.pool(),
        &admin,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(10000, 2),
            notas_apertura: Some("Turno Dashboard".into()),
        },
    )
    .await
    .unwrap();

    let prod = catalog_service::create_product(
        &state.pool(),
        &admin,
        CreateProductInput {
            codigo_sku: "SKU-DASH-01".into(),
            nombre: "Agua Mineral".into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("BOTELLA".into()),
            precio_compra_referencial: Some(Decimal::new(150, 2)),
            costo_unitario: None,
            precio_venta: Decimal::new(500, 2), // 5.00
            stock_inicial: Some(50),
            stock_minimo: Some(5),
            proveedor_preferido_id: None,
        },
    )
    .await
    .unwrap();

    // Venta 1: 80.00 (50.00 Efectivo + 20.00 Yape + 10.00 Crédito) para c_hoy
    let _v1 = pos_service::create_pos_sale(
        &state.pool(),
        &admin,
        CreatePosSaleInput {
            cliente_id: Some(c_hoy),
            descuento: Some(Decimal::ZERO),
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Plan,
                producto_id: None,
                plan_id: Some(2),
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::new(8000, 2),
                subtotal: Decimal::new(8000, 2),
                fecha_inicio_plan: None,
            }],
            pagos: vec![
                PosPaymentInput {
                    metodo_pago: PaymentMethod::Efectivo,
                    monto: Decimal::new(5000, 2),
                    referencia_operacion: None,
                },
                PosPaymentInput {
                    metodo_pago: PaymentMethod::Yape,
                    monto: Decimal::new(2000, 2),
                    referencia_operacion: Some("YAPE-001".into()),
                },
            ],
            notas: None,
        },
    )
    .await
    .unwrap();

    // Venta 2: 10.00 a crédito completo para c_2d (0 pago hoy, genera otro deudor)
    let _v2 = pos_service::create_pos_sale(
        &state.pool(),
        &admin,
        CreatePosSaleInput {
            cliente_id: Some(c_2d),
            descuento: Some(Decimal::ZERO),
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 2,
                precio_unitario: Decimal::new(500, 2),
                subtotal: Decimal::new(1000, 2),
                fecha_inicio_plan: None,
            }],
            pagos: vec![],
            notas: Some("Fiado".into()),
        },
    )
    .await
    .unwrap();

    // Venta 3: 15.00 Efectivo que luego se tacha (NO debe contarse en ingresos)
    let v3 = pos_service::create_pos_sale(
        &state.pool(),
        &admin,
        CreatePosSaleInput {
            cliente_id: None,
            descuento: Some(Decimal::ZERO),
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 3,
                precio_unitario: Decimal::new(500, 2),
                subtotal: Decimal::new(1500, 2),
                fecha_inicio_plan: None,
            }],
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(1500, 2),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    pos_service::strike_sale(
        &state.pool(),
        &admin,
        v3.id,
        zarama_gym_lib::models::StrikeSaleInput {
            motivo_tachado: "Error de prueba".into(),
        },
    )
    .await
    .unwrap();

    // 5. Insertar también una venta histórica del mes pasado (NO debe sumar en mes actual)
    let prev_month_date = (today - Duration::days(35)).format("%Y-%m-%d 12:00:00").to_string();
    sqlx::query(
        r#"
        INSERT INTO ventas (turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, descuento, total_venta, monto_pagado_efectivo, monto_pagado_digital, saldo_credito_generado, estado_venta, created_at, updated_at)
        VALUES (1, NULL, ?, 100.00, 0.00, 100.00, 100.00, 0.00, 0.00, 'COMPLETADA', ?, ?)
        "#,
    )
    .bind(admin.user_id)
    .bind(&prev_month_date)
    .bind(&prev_month_date)
    .execute(&state.pool())
    .await
    .unwrap();
    let old_venta_id: i64 = sqlx::query_scalar("SELECT last_insert_rowid()")
        .fetch_one(&state.pool())
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO pagos (venta_id, turno_caja_id, metodo_pago, canal_caja, monto, estado_pago, created_at) VALUES (?, 1, 'EFECTIVO', 'FISICA', 100.00, 'ACTIVO', ?)",
    )
    .bind(old_venta_id)
    .bind(&prev_month_date)
    .execute(&state.pool())
    .await
    .unwrap();

    // 6. Consultar dashboard como ADMINISTRADOR
    let metrics_admin = dashboard_service::get_home_dashboard_metrics(&state.pool(), &admin)
        .await
        .expect("Dashboard admin debe ser exitoso");

    assert_eq!(metrics_admin.clientes_activos, 3);
    // 3 membresías insertadas para activos (c_hoy, c_2d, c_5d) + 1 membresía creada por Venta 1 (PLAN 2 para c_hoy) = 4
    assert_eq!(metrics_admin.membresias_activas, 4);
    assert_eq!(metrics_admin.asistencias_hoy_total, 3);
    assert_eq!(metrics_admin.deudores_activos_count, 2);
    assert_eq!(
        metrics_admin.saldo_creditos_pendiente,
        Decimal::from_str("20.00").unwrap()
    );

    assert_eq!(
        metrics_admin.ingresos_hoy_fisico,
        Decimal::from_str("50.00").unwrap()
    );
    assert_eq!(
        metrics_admin.ingresos_hoy_digital,
        Decimal::from_str("20.00").unwrap()
    );
    assert_eq!(
        metrics_admin.ingresos_hoy_total,
        Decimal::from_str("70.00").unwrap()
    );
    assert!(metrics_admin.can_view_monthly_revenue);
    assert_eq!(
        metrics_admin.ingresos_mes_fisico,
        Decimal::from_str("50.00").unwrap()
    );
    assert_eq!(
        metrics_admin.ingresos_mes_digital,
        Decimal::from_str("20.00").unwrap()
    );
    assert_eq!(
        metrics_admin.ingresos_mes_total,
        Decimal::from_str("70.00").unwrap()
    );

    // Verificar franjas horarias 05..=22 (18 puntos)
    assert_eq!(metrics_admin.afluencia_por_franja.len(), 18);
    assert_eq!(metrics_admin.afluencia_por_franja[0].franja, "05:00");
    assert_eq!(metrics_admin.afluencia_por_franja[17].franja, "22:00");
    let h7 = metrics_admin
        .afluencia_por_franja
        .iter()
        .find(|p| p.hora == 7)
        .unwrap();
    let h18 = metrics_admin
        .afluencia_por_franja
        .iter()
        .find(|p| p.hora == 18)
        .unwrap();
    assert_eq!(h7.total, 2);
    assert_eq!(h18.total, 1);

    // Verificar alertas de vencimiento <= 3 días (c_hoy 0d y c_2d 2d; NO c_5d, NO c_inactivo)
    assert_eq!(metrics_admin.membresias_por_vencer.len(), 2);
    assert_eq!(metrics_admin.membresias_por_vencer[0].cliente_id, c_hoy);
    assert_eq!(metrics_admin.membresias_por_vencer[0].dias_restantes, 0);
    assert_eq!(metrics_admin.membresias_por_vencer[1].cliente_id, c_2d);
    assert_eq!(metrics_admin.membresias_por_vencer[1].dias_restantes, 2);

    // 7. Consultar dashboard como SUPERVISOR (ve ingresos del mes)
    let metrics_sup = dashboard_service::get_home_dashboard_metrics(&state.pool(), &supervisor)
        .await
        .expect("Dashboard supervisor debe ser exitoso");
    assert!(metrics_sup.can_view_monthly_revenue);
    assert_eq!(
        metrics_sup.ingresos_mes_total,
        Decimal::from_str("70.00").unwrap()
    );

    // 8. Consultar dashboard como RECEPCIONISTA (ingresos_mes_* ocultos en 0.00)
    let metrics_rec = dashboard_service::get_home_dashboard_metrics(&state.pool(), &recep)
        .await
        .expect("Dashboard recepcionista debe ser exitoso");
    assert!(!metrics_rec.can_view_monthly_revenue);
    assert_eq!(metrics_rec.ingresos_mes_fisico, Decimal::ZERO);
    assert_eq!(metrics_rec.ingresos_mes_digital, Decimal::ZERO);
    assert_eq!(metrics_rec.ingresos_mes_total, Decimal::ZERO);
    // Pero sí ve ingresos de hoy
    assert_eq!(
        metrics_rec.ingresos_hoy_total,
        Decimal::from_str("70.00").unwrap()
    );
}

// ============================================================================
// PARTE C: EXPORTACIONES CSV / XLSX / PDF Y RBAC (TAREA 2.3)
// ============================================================================

#[tokio::test]
async fn test_exports_clients_debtors_and_sales_in_csv_xlsx_pdf_with_rbac_and_audit() {
    let (state, _tmp) = setup_test_env().await;
    let recep =
        create_and_login_role(&state, "rec_exp", "55667788", UserRole::Recepcionista).await;
    let supervisor =
        create_and_login_role(&state, "sup_exp", "66778899", UserRole::Supervisor).await;
    let admin = login_admin(&state).await;

    // Cliente con tildes, ñ y coma para probar UTF-8 BOM + RFC 4180 + XML escaping
    let c_id = create_sample_client(
        &state,
        &admin,
        "70123456",
        "María José",
        "Peña, Ñañez",
        Some("987654321"),
    )
    .await;

    let _shift = pos_service::open_cash_shift(
        &state.pool(),
        &admin,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(5000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    // Venta con plan (80.00) -> 30.00 efectivo, 25.00 Yape, 25.00 crédito
    let _sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin,
        CreatePosSaleInput {
            cliente_id: Some(c_id),
            descuento: Some(Decimal::ZERO),
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Plan,
                producto_id: None,
                plan_id: Some(2),
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::new(8000, 2),
                subtotal: Decimal::new(8000, 2),
                fecha_inicio_plan: None,
            }],
            pagos: vec![
                PosPaymentInput {
                    metodo_pago: PaymentMethod::Efectivo,
                    monto: Decimal::new(3000, 2),
                    referencia_operacion: None,
                },
                PosPaymentInput {
                    metodo_pago: PaymentMethod::Yape,
                    monto: Decimal::new(2500, 2),
                    referencia_operacion: Some("YP-99".into()),
                },
            ],
            notas: None,
        },
    )
    .await
    .unwrap();

    // 1. Padrón de clientes en CSV, XLSX y PDF (permitido incluso para RECEPCIONISTA)
    let roster_csv =
        dashboard_service::export_clients_roster(&state.pool(), &recep, ExportFormat::Csv)
            .await
            .unwrap();
    let roster_csv_bytes = verify_sha256_and_decode(&roster_csv);
    assert!(roster_csv_bytes.starts_with(&[0xEF, 0xBB, 0xBF]), "CSV debe iniciar con BOM UTF-8");
    let roster_csv_txt = String::from_utf8(roster_csv_bytes).unwrap();
    assert!(roster_csv_txt.contains("\"María José Peña, Ñañez\""));
    assert!(roster_csv_txt.contains("25.00"));
    assert_eq!(roster_csv.row_count, 1);

    let roster_xlsx =
        dashboard_service::export_clients_roster(&state.pool(), &admin, ExportFormat::Xlsx)
            .await
            .unwrap();
    let roster_xlsx_bytes = verify_sha256_and_decode(&roster_xlsx);
    assert!(roster_xlsx_bytes.starts_with(b"PK\x03\x04"), "XLSX debe iniciar con cabecera ZIP PK\\x03\\x04");
    let roster_xlsx_lossy = String::from_utf8_lossy(&roster_xlsx_bytes);
    assert!(roster_xlsx_lossy.contains("[Content_Types].xml"));
    assert!(roster_xlsx_lossy.contains("xl/worksheets/sheet1.xml"));
    assert!(roster_xlsx_lossy.contains("María José Peña, Ñañez"));
    assert!(roster_xlsx_lossy.contains("PK\x01\x02"));
    assert!(roster_xlsx_lossy.contains("PK\x05\x06"));

    let roster_pdf =
        dashboard_service::export_clients_roster(&state.pool(), &admin, ExportFormat::Pdf)
            .await
            .unwrap();
    let roster_pdf_bytes = verify_sha256_and_decode(&roster_pdf);
    assert!(roster_pdf_bytes.starts_with(b"%PDF-1.4"));
    let roster_pdf_txt = String::from_utf8_lossy(&roster_pdf_bytes);
    assert!(roster_pdf_txt.contains("PADRON GENERAL DE CLIENTES"));
    assert!(roster_pdf_txt.contains("%%EOF"));

    // 2. Cartera de deudores en CSV, XLSX y PDF (permitido para RECEPCIONISTA)
    let debtors_csv =
        dashboard_service::export_debtors_portfolio(&state.pool(), &recep, ExportFormat::Csv)
            .await
            .unwrap();
    let debtors_csv_txt = String::from_utf8(verify_sha256_and_decode(&debtors_csv)).unwrap();
    assert!(debtors_csv_txt.starts_with('\u{FEFF}'));
    assert!(debtors_csv_txt.contains("MEMBRESIA_PAGO_PARCIAL"));
    assert!(debtors_csv_txt.contains("25.00"));
    assert_eq!(debtors_csv.row_count, 1);

    let debtors_xlsx =
        dashboard_service::export_debtors_portfolio(&state.pool(), &admin, ExportFormat::Xlsx)
            .await
            .unwrap();
    let debtors_xlsx_bytes = verify_sha256_and_decode(&debtors_xlsx);
    assert!(debtors_xlsx_bytes.starts_with(b"PK\x03\x04"));
    assert!(String::from_utf8_lossy(&debtors_xlsx_bytes).contains("MEMBRESIA_PAGO_PARCIAL"));

    let debtors_pdf =
        dashboard_service::export_debtors_portfolio(&state.pool(), &admin, ExportFormat::Pdf)
            .await
            .unwrap();
    let debtors_pdf_bytes = verify_sha256_and_decode(&debtors_pdf);
    assert!(debtors_pdf_bytes.starts_with(b"%PDF-1.4"));
    assert!(String::from_utf8_lossy(&debtors_pdf_bytes)
        .contains("CARTERA DE CREDITOS Y DEUDORES PENDIENTES"));

    // 3. Reporte de ventas: RBAC Forbidden para RECEPCIONISTA
    let forbidden_res = dashboard_service::export_sales_cash_report(
        &state.pool(),
        &recep,
        ExportSalesReportRequest {
            fecha_desde: None,
            fecha_hasta: None,
            canal_filtro: None,
            format: ExportFormat::Csv,
        },
    )
    .await;
    assert!(
        matches!(forbidden_res, Err(AppError::Forbidden(_))),
        "RECEPCIONISTA debe recibir Forbidden en export_sales_cash_report, obtenido: {:?}",
        forbidden_res
    );

    // 4. Reporte de ventas permitido para SUPERVISOR y ADMINISTRADOR en CSV, XLSX, PDF y filtros
    let sales_csv = dashboard_service::export_sales_cash_report(
        &state.pool(),
        &supervisor,
        ExportSalesReportRequest {
            fecha_desde: None,
            fecha_hasta: None,
            canal_filtro: Some("FISICA".into()),
            format: ExportFormat::Csv,
        },
    )
    .await
    .unwrap();
    assert_eq!(sales_csv.row_count, 1);
    let sales_csv_txt = String::from_utf8(verify_sha256_and_decode(&sales_csv)).unwrap();
    assert!(sales_csv_txt.starts_with('\u{FEFF}'));
    assert!(sales_csv_txt.contains("80.00"));
    assert!(sales_csv_txt.contains("30.00"));

    let sales_xlsx = dashboard_service::export_sales_cash_report(
        &state.pool(),
        &admin,
        ExportSalesReportRequest {
            fecha_desde: None,
            fecha_hasta: None,
            canal_filtro: Some("DIGITAL".into()),
            format: ExportFormat::Xlsx,
        },
    )
    .await
    .unwrap();
    let sales_xlsx_bytes = verify_sha256_and_decode(&sales_xlsx);
    assert!(sales_xlsx_bytes.starts_with(b"PK\x03\x04"));
    assert!(String::from_utf8_lossy(&sales_xlsx_bytes).contains("xl/workbook.xml"));

    let sales_pdf = dashboard_service::export_sales_cash_report(
        &state.pool(),
        &admin,
        ExportSalesReportRequest {
            fecha_desde: None,
            fecha_hasta: None,
            canal_filtro: Some("MIXTA".into()),
            format: ExportFormat::Pdf,
        },
    )
    .await
    .unwrap();
    let sales_pdf_bytes = verify_sha256_and_decode(&sales_pdf);
    assert!(sales_pdf_bytes.starts_with(b"%PDF-1.4"));
    let sales_pdf_txt = String::from_utf8_lossy(&sales_pdf_bytes);
    assert!(sales_pdf_txt.contains("REPORTE DETALLADO DE VENTAS"));
    assert!(sales_pdf_txt.contains("%%EOF"));

    // 5. Verificar bitácora de auditoría REPORT_EXPORTED en modulo REPORTES
    let audit_rows = sqlx::query(
        "SELECT accion, modulo, detalles_json FROM auditoria_logs WHERE accion = 'REPORT_EXPORTED' AND modulo = 'REPORTES'",
    )
    .fetch_all(&state.pool())
    .await
    .unwrap();
    assert_eq!(
        audit_rows.len(),
        9,
        "Cada exportación exitosa debe registrar REPORT_EXPORTED en auditoria_logs"
    );
    let first_detail: String = audit_rows[0].get("detalles_json");
    assert!(first_detail.contains("formato"));
}
