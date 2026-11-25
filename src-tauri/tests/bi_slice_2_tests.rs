use base64::Engine;
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::str::FromStr;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AuthSession, BiExportFinanceInput, BiFinanceFilterInput, BiGranularity, CreateClientInput,
    CreateCompanyInput, CreateExpenseDto, CreateProductInput, CreateSupplierInput,
    CreateSupplierPurchaseDetailDto, CreateSupplierPurchaseDto, CreateUserInput, ExpenseCategory,
    ExportFileResult, ExportFormat, LoginCredentials, OpenCashShiftInput, PaymentChannel,
    PaymentMethod, PurchaseInvoiceType, ReceptionistPermissionsDto, SupplierType, UserRole,
};
use zarama_gym_lib::services::{
    auth_service, bi_analytics_service, catalog_service, entity_service, finance_service,
    permissions_service, pos_service,
};
use zarama_gym_lib::state::AppState;

async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_bi_slice_2.db");
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
            apellidos: "BI".into(),
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
// 1. RBAC STRICT GUARDS (VER_TAB_FINANZAS + EXPORTAR_CONTEXTUAL_BI)
// ============================================================================

#[tokio::test]
async fn test_bi_finance_rbac_guards() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();

    let recep = create_and_login_recep(&state, "rec_bi2", "80000001").await;
    let admin = login_admin(&state).await;

    let filter = BiFinanceFilterInput {
        fecha_desde: "2026-11-01".into(),
        fecha_hasta: "2026-11-10".into(),
        granularidad: Some(BiGranularity::Dia),
        canal_caja: None,
    };

    // 1. Con todo en OFF, Recepcionista recibe Forbidden en consulta y exportación
    assert!(matches!(
        bi_analytics_service::get_bi_finance_analytics(&pool, &recep, filter.clone()).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        bi_analytics_service::export_bi_finance_analytics(
            &pool,
            &recep,
            BiExportFinanceInput {
                filter: filter.clone(),
                format: ExportFormat::Csv,
            },
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    // 2. Solo ver_tab_finanzas = true -> puede consultar, pero NO exportar
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            ver_tab_finanzas: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert!(bi_analytics_service::get_bi_finance_analytics(&pool, &recep, filter.clone())
        .await
        .is_ok());
    assert!(matches!(
        bi_analytics_service::export_bi_finance_analytics(
            &pool,
            &recep,
            BiExportFinanceInput {
                filter: filter.clone(),
                format: ExportFormat::Csv,
            },
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    // 3. Solo exportar_contextual_bi = true (sin ver_tab_finanzas) -> Forbidden
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            exportar_contextual_bi: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert!(matches!(
        bi_analytics_service::export_bi_finance_analytics(
            &pool,
            &recep,
            BiExportFinanceInput {
                filter: filter.clone(),
                format: ExportFormat::Csv,
            },
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    // 4. Ambos activados -> ambos Ok
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            ver_tab_finanzas: true,
            exportar_contextual_bi: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert!(bi_analytics_service::get_bi_finance_analytics(&pool, &recep, filter.clone())
        .await
        .is_ok());
    assert!(bi_analytics_service::export_bi_finance_analytics(
        &pool,
        &recep,
        BiExportFinanceInput {
            filter: filter.clone(),
            format: ExportFormat::Csv,
        },
    )
    .await
    .is_ok());

    // 5. Admin siempre tiene acceso aunque todo esté OFF para recepcionista
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto::default(),
    )
    .await
    .unwrap();
    assert!(bi_analytics_service::get_bi_finance_analytics(&pool, &admin, filter.clone())
        .await
        .is_ok());
    assert!(bi_analytics_service::export_bi_finance_analytics(
        &pool,
        &admin,
        BiExportFinanceInput {
            filter,
            format: ExportFormat::Xlsx,
        },
    )
    .await
    .is_ok());
}

// ============================================================================
// 2. KPIs EXACTOS, DELTA %, MARGEN, TICKET PROMEDIO, MIXES Y CANAL DE CAJA
// ============================================================================

#[tokio::test]
async fn test_bi_finance_kpis_delta_pct_mixes_and_channels() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();
    let admin = login_admin(&state).await;

    // Setup entidades base
    let shift = pos_service::open_cash_shift(
        &pool,
        &admin,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("100.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let prod = catalog_service::create_product(
        &pool,
        &admin,
        CreateProductInput {
            codigo_sku: "BI2-PROD-1".into(),
            nombre: "Proteina BI2".into(),
            categoria: zarama_gym_lib::models::ProductCategory::Suplementos,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::from_str("40.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("60.00").unwrap(),
            stock_inicial: Some(50),
            stock_minimo: Some(5),
            proveedor_preferido_id: None,
        },
    )
    .await
    .unwrap();

    let supplier = entity_service::create_supplier(
        &pool,
        &admin,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::Empresa,
            persona_id: None,
            empresa_id: None,
            persona_data: None,
            empresa_data: Some(CreateCompanyInput {
                ruc: "20555666777".into(),
                razon_social: "Proveedor BI2 SAC".into(),
                nombre_comercial: None,
                telefono: None,
                email: None,
                direccion: None,
            }),
            rubro_o_categoria: Some("Suplementos".into()),
            contacto_referencia: None,
        },
    )
    .await
    .unwrap();

    let client = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("77889900".into()),
            nombres: Some("Lucia".into()),
            apellidos: Some("Mendoza".into()),
            fecha_nacimiento: None,
            genero: Some("FEMENINO".into()),
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
            canal_captacion: Some("REDES_SOCIALES".into()),
        },
    )
    .await
    .unwrap();

    // Rango actual: 2026-11-10..=2026-11-19 (10 días)
    // Periodo anterior equivalente: 2026-10-31..=2026-11-09 (10 días)

    // --- VENTAS PERIODO ACTUAL ---
    // Venta 1 (2026-11-10): Plan (100.00) + Producto (60.00) - Descuento (10.00) = Total 150.00
    //   Pagos: 90.00 EFECTIVO (FISICA, 60%) + 60.00 YAPE (DIGITAL, 40%)
    let res_v1 = sqlx::query(
        r#"
        INSERT INTO ventas (
            turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, descuento, total_venta,
            monto_pagado_efectivo, monto_pagado_digital, saldo_credito_generado, estado_venta, created_at
        ) VALUES (?, ?, ?, 160.00, 10.00, 150.00, 90.00, 60.00, 0.00, 'COMPLETADA', '2026-11-10 10:00:00')
        "#,
    )
    .bind(shift.id)
    .bind(client.id)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();
    let v1_id = res_v1.last_insert_rowid();

    sqlx::query(
        r#"
        INSERT INTO venta_detalles (venta_id, tipo_item, producto_id, plan_id, credito_id, descripcion, cantidad, precio_unitario, subtotal)
        VALUES
            (?, 'PLAN', NULL, 2, NULL, 'Plan 1M', 1, 100.00, 100.00),
            (?, 'PRODUCTO', ?, NULL, NULL, 'Proteina BI2', 1, 60.00, 60.00)
        "#,
    )
    .bind(v1_id)
    .bind(v1_id)
    .bind(prod.id)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        r#"
        INSERT INTO pagos (venta_id, turno_caja_id, metodo_pago, canal_caja, monto, estado_pago, created_at)
        VALUES
            (?, ?, 'EFECTIVO', 'FISICA', 90.00, 'ACTIVO', '2026-11-10 10:00:00'),
            (?, ?, 'YAPE', 'DIGITAL', 60.00, 'ACTIVO', '2026-11-10 10:00:00')
        "#,
    )
    .bind(v1_id)
    .bind(shift.id)
    .bind(v1_id)
    .bind(shift.id)
    .execute(&pool)
    .await
    .unwrap();

    // Venta 2 (2026-11-15): Producto (150.00), Descuento 0.00, Total 150.00 -> 150.00 TARJETA (DIGITAL)
    let res_v2 = sqlx::query(
        r#"
        INSERT INTO ventas (
            turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, descuento, total_venta,
            monto_pagado_efectivo, monto_pagado_digital, saldo_credito_generado, estado_venta, created_at
        ) VALUES (?, ?, ?, 150.00, 0.00, 150.00, 0.00, 150.00, 0.00, 'COMPLETADA', '2026-11-15 16:00:00')
        "#,
    )
    .bind(shift.id)
    .bind(client.id)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();
    let v2_id = res_v2.last_insert_rowid();

    sqlx::query(
        r#"
        INSERT INTO venta_detalles (venta_id, tipo_item, producto_id, plan_id, credito_id, descripcion, cantidad, precio_unitario, subtotal)
        VALUES (?, 'PRODUCTO', ?, NULL, NULL, 'Proteina BI2', 2, 75.00, 150.00)
        "#,
    )
    .bind(v2_id)
    .bind(prod.id)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        r#"
        INSERT INTO pagos (venta_id, turno_caja_id, metodo_pago, canal_caja, monto, estado_pago, created_at)
        VALUES (?, ?, 'TARJETA', 'DIGITAL', 150.00, 'ACTIVO', '2026-11-15 16:00:00')
        "#,
    )
    .bind(v2_id)
    .bind(shift.id)
    .execute(&pool)
    .await
    .unwrap();

    // Venta 3 (2026-11-18) TACHADA_EN_TURNO -> NO debe sumar
    let res_v3 = sqlx::query(
        r#"
        INSERT INTO ventas (
            turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, descuento, total_venta,
            monto_pagado_efectivo, monto_pagado_digital, saldo_credito_generado, estado_venta, created_at
        ) VALUES (?, ?, ?, 500.00, 0.00, 500.00, 500.00, 0.00, 0.00, 'TACHADA_EN_TURNO', '2026-11-18 12:00:00')
        "#,
    )
    .bind(shift.id)
    .bind(client.id)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();
    let v3_id = res_v3.last_insert_rowid();

    sqlx::query(
        "INSERT INTO pagos (venta_id, turno_caja_id, metodo_pago, canal_caja, monto, estado_pago) VALUES (?, ?, 'EFECTIVO', 'FISICA', 500.00, 'REVERTIDO')",
    )
    .bind(v3_id)
    .bind(shift.id)
    .execute(&pool)
    .await
    .unwrap();

    // --- VENTA PERIODO ANTERIOR (2026-11-05) ---
    // Total 200.00, Descuento 20.00 (subtotal 220.00), 200.00 EFECTIVO (FISICA)
    let res_vp = sqlx::query(
        r#"
        INSERT INTO ventas (
            turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, descuento, total_venta,
            monto_pagado_efectivo, monto_pagado_digital, saldo_credito_generado, estado_venta, created_at
        ) VALUES (?, ?, ?, 220.00, 20.00, 200.00, 200.00, 0.00, 0.00, 'COMPLETADA', '2026-11-05 11:00:00')
        "#,
    )
    .bind(shift.id)
    .bind(client.id)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();
    let vp_id = res_vp.last_insert_rowid();

    sqlx::query(
        "INSERT INTO pagos (venta_id, turno_caja_id, metodo_pago, canal_caja, monto, estado_pago) VALUES (?, ?, 'EFECTIVO', 'FISICA', 200.00, 'ACTIVO')",
    )
    .bind(vp_id)
    .bind(shift.id)
    .execute(&pool)
    .await
    .unwrap();

    // --- COMPRAS PROVEEDORES ---
    // Actual FISICA: 40.00 (2026-11-12), Actual DIGITAL: 20.00 (2026-11-15), Anulada: 999.00 (NO suma)
    finance_service::create_supplier_purchase(
        &pool,
        &admin,
        CreateSupplierPurchaseDto {
            proveedor_id: supplier.id,
            turno_caja_id: Some(shift.id),
            tipo_comprobante: PurchaseInvoiceType::Factura,
            numero_comprobante: Some("F001-10".into()),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("40.00").unwrap(),
            fecha_compra: Some("2026-11-12".into()),
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod.id,
                cantidad: 1,
                costo_unitario: Decimal::from_str("40.00").unwrap(),
                subtotal: Decimal::from_str("40.00").unwrap(),
            }],
        },
    )
    .await
    .unwrap();

    finance_service::create_supplier_purchase(
        &pool,
        &admin,
        CreateSupplierPurchaseDto {
            proveedor_id: supplier.id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Boleta,
            numero_comprobante: Some("B001-11".into()),
            metodo_pago: PaymentMethod::Transferencia,
            canal_caja: PaymentChannel::Digital,
            total_compra: Decimal::from_str("20.00").unwrap(),
            fecha_compra: Some("2026-11-15 14:30:00".into()),
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod.id,
                cantidad: 1,
                costo_unitario: Decimal::from_str("20.00").unwrap(),
                subtotal: Decimal::from_str("20.00").unwrap(),
            }],
        },
    )
    .await
    .unwrap();

    let canceled_purchase = finance_service::create_supplier_purchase(
        &pool,
        &admin,
        CreateSupplierPurchaseDto {
            proveedor_id: supplier.id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Recibo,
            numero_comprobante: None,
            metodo_pago: PaymentMethod::Yape,
            canal_caja: PaymentChannel::Digital,
            total_compra: Decimal::from_str("100.00").unwrap(),
            fecha_compra: Some("2026-11-16".into()),
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod.id,
                cantidad: 1,
                costo_unitario: Decimal::from_str("100.00").unwrap(),
                subtotal: Decimal::from_str("100.00").unwrap(),
            }],
        },
    )
    .await
    .unwrap();
    finance_service::cancel_supplier_purchase(
        &pool,
        &admin,
        canceled_purchase.purchase.id,
        zarama_gym_lib::models::CancelSupplierPurchaseDto {
            motivo_anulacion: "Error de prueba".into(),
        },
    )
    .await
    .unwrap();

    // Compra periodo anterior (2026-11-02): 50.00 FISICA
    finance_service::create_supplier_purchase(
        &pool,
        &admin,
        CreateSupplierPurchaseDto {
            proveedor_id: supplier.id,
            turno_caja_id: Some(shift.id),
            tipo_comprobante: PurchaseInvoiceType::Factura,
            numero_comprobante: Some("F001-01".into()),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("50.00").unwrap(),
            fecha_compra: Some("2026-11-02".into()),
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod.id,
                cantidad: 1,
                costo_unitario: Decimal::from_str("50.00").unwrap(),
                subtotal: Decimal::from_str("50.00").unwrap(),
            }],
        },
    )
    .await
    .unwrap();

    // --- GASTOS OPERATIVOS ---
    // Actual: ALQUILER 80.00 (DIGITAL, 2026-11-10) + LIMPIEZA 20.00 (FISICA, 2026-11-19) + Gasto desactivado 300.00
    finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::Alquiler,
            descripcion: "Alquiler parcial".into(),
            monto: Decimal::from_str("80.00").unwrap(),
            metodo_pago: PaymentMethod::Transferencia,
            canal_caja: PaymentChannel::Digital,
            turno_caja_id: None,
            comprobante_referencia: None,
            fecha_gasto: Some("2026-11-10".into()),
            notas: None,
        },
    )
    .await
    .unwrap();

    finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::LimpiezaInsumos,
            descripcion: "Detergentes".into(),
            monto: Decimal::from_str("20.00").unwrap(),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            turno_caja_id: Some(shift.id),
            comprobante_referencia: None,
            fecha_gasto: Some("2026-11-19 18:00:00".into()),
            notas: None,
        },
    )
    .await
    .unwrap();

    let inactive_exp = finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::Otros,
            descripcion: "Gasto anulado".into(),
            monto: Decimal::from_str("300.00").unwrap(),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            turno_caja_id: Some(shift.id),
            comprobante_referencia: None,
            fecha_gasto: Some("2026-11-14".into()),
            notas: None,
        },
    )
    .await
    .unwrap();
    finance_service::toggle_operational_expense_active(&pool, &admin, inactive_exp.id)
        .await
        .unwrap();

    // Gasto periodo anterior (2026-11-08): 50.00 DIGITAL
    finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::ServiciosBasicos,
            descripcion: "Luz anterior".into(),
            monto: Decimal::from_str("50.00").unwrap(),
            metodo_pago: PaymentMethod::Plin,
            canal_caja: PaymentChannel::Digital,
            turno_caja_id: None,
            comprobante_referencia: None,
            fecha_gasto: Some("2026-11-08".into()),
            notas: None,
        },
    )
    .await
    .unwrap();

    // =========================================================================
    // VERIFICACIÓN MIXTA (2026-11-10 ..= 2026-11-19)
    // =========================================================================
    let dto = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2026-11-10".into(),
            fecha_hasta: "2026-11-19".into(),
            granularidad: None,
            canal_caja: Some("MIXTA".into()),
        },
    )
    .await
    .unwrap();

    assert_eq!(dto.periodo_anterior_desde, "2026-10-31");
    assert_eq!(dto.periodo_anterior_hasta, "2026-11-09");
    assert_eq!(dto.granularidad_aplicada, BiGranularity::Dia);
    assert_eq!(dto.canal_aplicado, "MIXTA");

    // Ingresos: actual = 90 + 60 + 150 = 300.00, anterior = 200.00 -> +50.0%
    assert_eq!(dto.ingresos.actual, Decimal::from_str("300.00").unwrap());
    assert_eq!(dto.ingresos.anterior, Decimal::from_str("200.00").unwrap());
    assert_eq!(dto.ingresos.delta_pct, Some(50.0));

    // Compras: actual = 40 + 20 = 60.00, anterior = 50.00 -> +20.0%
    assert_eq!(dto.compras.actual, Decimal::from_str("60.00").unwrap());
    assert_eq!(dto.compras.anterior, Decimal::from_str("50.00").unwrap());
    assert_eq!(dto.compras.delta_pct, Some(20.0));

    // Gastos: actual = 80 + 20 = 100.00, anterior = 50.00 -> +100.0%
    assert_eq!(dto.gastos.actual, Decimal::from_str("100.00").unwrap());
    assert_eq!(dto.gastos.anterior, Decimal::from_str("50.00").unwrap());
    assert_eq!(dto.gastos.delta_pct, Some(100.0));

    // Egresos: actual = 160.00, anterior = 100.00 -> +60.0%
    assert_eq!(dto.egresos.actual, Decimal::from_str("160.00").unwrap());
    assert_eq!(dto.egresos.anterior, Decimal::from_str("100.00").unwrap());
    assert_eq!(dto.egresos.delta_pct, Some(60.0));

    // Flujo Neto: actual = 300 - 160 = 140.00, anterior = 200 - 100 = 100.00 -> +40.0%
    assert_eq!(dto.flujo_neto.actual, Decimal::from_str("140.00").unwrap());
    assert_eq!(dto.flujo_neto.anterior, Decimal::from_str("100.00").unwrap());
    assert_eq!(dto.flujo_neto.delta_pct, Some(40.0));

    // Margen: actual = 140/300*100 = 46.7%, anterior = 100/200*100 = 50.0%
    assert_eq!(dto.margen_operativo_pct, 46.7);
    assert_eq!(dto.margen_operativo_anterior_pct, 50.0);

    // Ventas count, ticket promedio, descuentos:
    // actual: 2 ventas, 300 / 2 = 150.00, descuentos 10.00
    // anterior: 1 venta, 200 / 1 = 200.00 -> delta -25.0%, descuentos 20.00 -> delta -50.0%
    assert_eq!(dto.ventas_count, 2);
    assert_eq!(dto.ventas_anterior_count, 1);
    assert_eq!(dto.ticket_promedio.actual, Decimal::from_str("150.00").unwrap());
    assert_eq!(dto.ticket_promedio.anterior, Decimal::from_str("200.00").unwrap());
    assert_eq!(dto.ticket_promedio.delta_pct, Some(-25.0));
    assert_eq!(dto.descuentos_totales.actual, Decimal::from_str("10.00").unwrap());
    assert_eq!(dto.descuentos_totales.anterior, Decimal::from_str("20.00").unwrap());
    assert_eq!(dto.descuentos_totales.delta_pct, Some(-50.0));

    // Mix líneas: PLAN 100.00 (1), PRODUCTO 210.00 (3), AMORTIZACION_CREDITO 0.00 (0)
    let plan_mix = dto.mix_lineas.iter().find(|c| c.clave == "PLAN").unwrap();
    let prod_mix = dto.mix_lineas.iter().find(|c| c.clave == "PRODUCTO").unwrap();
    assert_eq!(plan_mix.monto, Decimal::from_str("100.00").unwrap());
    assert_eq!(plan_mix.cantidad, 1);
    assert_eq!(plan_mix.porcentaje, 32.3); // 100/310 = 32.258 -> 32.3
    assert_eq!(prod_mix.monto, Decimal::from_str("210.00").unwrap());
    assert_eq!(prod_mix.cantidad, 3);
    assert_eq!(prod_mix.porcentaje, 67.7);

    // Mix métodos pago: EFECTIVO 90 (30.0%), YAPE 60 (20.0%), TARJETA 150 (50.0%)
    let m_ef = dto.mix_metodos_pago.iter().find(|m| m.clave == "EFECTIVO").unwrap();
    let m_ya = dto.mix_metodos_pago.iter().find(|m| m.clave == "YAPE").unwrap();
    let m_ta = dto.mix_metodos_pago.iter().find(|m| m.clave == "TARJETA").unwrap();
    assert_eq!(m_ef.monto, Decimal::from_str("90.00").unwrap());
    assert_eq!(m_ef.porcentaje, 30.0);
    assert_eq!(m_ya.monto, Decimal::from_str("60.00").unwrap());
    assert_eq!(m_ya.porcentaje, 20.0);
    assert_eq!(m_ta.monto, Decimal::from_str("150.00").unwrap());
    assert_eq!(m_ta.porcentaje, 50.0);

    // Gastos por categoría (descendente: ALQUILER 80.00, LIMPIEZA_INSUMOS 20.00)
    assert_eq!(dto.gastos_por_categoria.len(), 2);
    assert_eq!(dto.gastos_por_categoria[0].clave, "ALQUILER");
    assert_eq!(dto.gastos_por_categoria[0].monto, Decimal::from_str("80.00").unwrap());
    assert_eq!(dto.gastos_por_categoria[0].porcentaje, 80.0);
    assert_eq!(dto.gastos_por_categoria[1].clave, "LIMPIEZA_INSUMOS");
    assert_eq!(dto.gastos_por_categoria[1].monto, Decimal::from_str("20.00").unwrap());
    assert_eq!(dto.gastos_por_categoria[1].porcentaje, 20.0);

    // =========================================================================
    // VERIFICACIÓN FILTRO CANAL: FISICA vs DIGITAL
    // =========================================================================
    let dto_fis = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2026-11-10".into(),
            fecha_hasta: "2026-11-19".into(),
            granularidad: Some(BiGranularity::Dia),
            canal_caja: Some("FISICA".into()),
        },
    )
    .await
    .unwrap();

    // FISICA: ingresos = 90.00 (1 venta), compras = 40.00, gastos = 20.00, flujo_neto = 30.00
    assert_eq!(dto_fis.ingresos.actual, Decimal::from_str("90.00").unwrap());
    assert_eq!(dto_fis.compras.actual, Decimal::from_str("40.00").unwrap());
    assert_eq!(dto_fis.gastos.actual, Decimal::from_str("20.00").unwrap());
    assert_eq!(dto_fis.flujo_neto.actual, Decimal::from_str("30.00").unwrap());
    assert_eq!(dto_fis.ventas_count, 1);
    assert_eq!(dto_fis.ticket_promedio.actual, Decimal::from_str("90.00").unwrap());
    // Venta 1 tenía 60% FISICA: PLAN 100*0.6 = 60.00, PRODUCTO 60*0.6 = 36.00
    assert_eq!(
        dto_fis.mix_lineas.iter().find(|c| c.clave == "PLAN").unwrap().monto,
        Decimal::from_str("60.00").unwrap()
    );
    assert_eq!(
        dto_fis.mix_lineas.iter().find(|c| c.clave == "PRODUCTO").unwrap().monto,
        Decimal::from_str("36.00").unwrap()
    );

    let dto_dig = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2026-11-10".into(),
            fecha_hasta: "2026-11-19".into(),
            granularidad: Some(BiGranularity::Dia),
            canal_caja: Some("DIGITAL".into()),
        },
    )
    .await
    .unwrap();

    // DIGITAL: ingresos = 60 + 150 = 210.00 (2 ventas), compras = 20.00, gastos = 80.00, flujo_neto = 110.00
    // Anterior DIGITAL: ingresos = 0.00 -> delta_pct = Some(100.0); compras = 0.00 -> Some(100.0); gastos = 50.00
    assert_eq!(dto_dig.ingresos.actual, Decimal::from_str("210.00").unwrap());
    assert_eq!(dto_dig.ingresos.anterior, Decimal::ZERO);
    assert_eq!(dto_dig.ingresos.delta_pct, Some(100.0));
    assert_eq!(dto_dig.compras.actual, Decimal::from_str("20.00").unwrap());
    assert_eq!(dto_dig.gastos.actual, Decimal::from_str("80.00").unwrap());
    assert_eq!(dto_dig.flujo_neto.actual, Decimal::from_str("110.00").unwrap());
    assert_eq!(dto_dig.ventas_count, 2);
    assert_eq!(dto_dig.ticket_promedio.actual, Decimal::from_str("105.00").unwrap());

    // Partición exacta entre canales: FISICA + DIGITAL == MIXTA
    assert_eq!(
        dto_fis.ingresos.actual + dto_dig.ingresos.actual,
        dto.ingresos.actual
    );
    assert_eq!(
        dto_fis.compras.actual + dto_dig.compras.actual,
        dto.compras.actual
    );
    assert_eq!(
        dto_fis.gastos.actual + dto_dig.gastos.actual,
        dto.gastos.actual
    );
    assert_eq!(
        dto_fis.mix_lineas.iter().find(|c| c.clave == "PLAN").unwrap().monto
            + dto_dig.mix_lineas.iter().find(|c| c.clave == "PLAN").unwrap().monto,
        plan_mix.monto
    );
    assert_eq!(
        dto_fis.mix_lineas.iter().find(|c| c.clave == "PRODUCTO").unwrap().monto
            + dto_dig.mix_lineas.iter().find(|c| c.clave == "PRODUCTO").unwrap().monto,
        prod_mix.monto
    );

    // Edge case delta_pct: ambos 0 -> None, anterior 0 & actual < 0 -> Some(-100.0)
    let dto_empty = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2025-01-01".into(),
            fecha_hasta: "2025-01-05".into(),
            granularidad: Some(BiGranularity::Dia),
            canal_caja: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(dto_empty.ingresos.delta_pct, None);
    assert_eq!(dto_empty.flujo_neto.delta_pct, None);

    // Gasto negativo en flujo_neto (sin ingresos y anterior en 0) -> delta_pct flujo_neto = Some(-100.0)
    finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::Otros,
            descripcion: "Gasto aislado".into(),
            monto: Decimal::from_str("25.00").unwrap(),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            turno_caja_id: None,
            comprobante_referencia: None,
            fecha_gasto: Some("2025-01-03".into()),
            notas: None,
        },
    )
    .await
    .unwrap();

    let dto_neg = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2025-01-01".into(),
            fecha_hasta: "2025-01-05".into(),
            granularidad: Some(BiGranularity::Dia),
            canal_caja: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(dto_neg.flujo_neto.actual, Decimal::from_str("-25.00").unwrap());
    assert_eq!(dto_neg.flujo_neto.anterior, Decimal::ZERO);
    assert_eq!(dto_neg.flujo_neto.delta_pct, Some(-100.0));
}

// ============================================================================
// 3. ZERO-FILLING EN DIA, SEMANA, MES Y AUTO-GRANULARIDAD
// ============================================================================

#[tokio::test]
async fn test_bi_finance_time_series_zero_filling_dia_semana_mes_and_auto_granularity() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();
    let admin = login_admin(&state).await;

    // Insertar un gasto en 2025-12-28 y otro en 2026-01-05 para probar cruce de año ISO
    finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::Otros,
            descripcion: "Fin año".into(),
            monto: Decimal::from_str("15.00").unwrap(),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            turno_caja_id: None,
            comprobante_referencia: None,
            fecha_gasto: Some("2025-12-28".into()),
            notas: None,
        },
    )
    .await
    .unwrap();
    finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::Alquiler,
            descripcion: "Inicio año".into(),
            monto: Decimal::from_str("45.00").unwrap(),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            turno_caja_id: None,
            comprobante_referencia: None,
            fecha_gasto: Some("2026-01-05".into()),
            notas: None,
        },
    )
    .await
    .unwrap();

    // 1. Auto-granularidad DIA (31 días exactos: 2026-01-01..=2026-01-31)
    let dto_day = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2026-01-01".into(),
            fecha_hasta: "2026-01-31".into(),
            granularidad: None,
            canal_caja: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(dto_day.granularidad_aplicada, BiGranularity::Dia);
    assert_eq!(dto_day.serie_temporal.len(), 31);
    assert_eq!(dto_day.serie_temporal[0].periodo_key, "2026-01-01");
    assert_eq!(dto_day.serie_temporal[4].gastos, Decimal::from_str("45.00").unwrap());
    assert_eq!(dto_day.serie_temporal[5].gastos, Decimal::ZERO);
    assert_eq!(dto_day.serie_temporal[30].periodo_key, "2026-01-31");

    // 2. Auto-granularidad SEMANA (60 días: 2025-12-15..=2026-02-12) + cruce ISO 2025-W52 / 2026-W01 / 2026-W02
    let dto_week = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2025-12-15".into(),
            fecha_hasta: "2026-02-12".into(),
            granularidad: None,
            canal_caja: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(dto_week.granularidad_aplicada, BiGranularity::Semana);
    assert_eq!(dto_week.serie_temporal.len(), 9); // W51, W52, W01..W07
    assert_eq!(dto_week.serie_temporal[0].periodo_key, "2025-W51");
    assert_eq!(dto_week.serie_temporal[1].periodo_key, "2025-W52");
    assert_eq!(
        dto_week.serie_temporal[1].gastos,
        Decimal::from_str("15.00").unwrap()
    );
    assert_eq!(dto_week.serie_temporal[2].periodo_key, "2026-W01");
    assert_eq!(dto_week.serie_temporal[2].gastos, Decimal::ZERO);
    assert_eq!(dto_week.serie_temporal[3].periodo_key, "2026-W02");
    assert_eq!(
        dto_week.serie_temporal[3].gastos,
        Decimal::from_str("45.00").unwrap()
    );
    let sum_gastos_week: Decimal = dto_week.serie_temporal.iter().map(|p| p.gastos).sum();
    assert_eq!(sum_gastos_week, dto_week.gastos.actual);

    // 3. Auto-granularidad MES (> 120 días: 2025-11-01..=2026-04-30 = 181 días -> 6 meses)
    let dto_month = bi_analytics_service::get_bi_finance_analytics(
        &pool,
        &admin,
        BiFinanceFilterInput {
            fecha_desde: "2025-11-01".into(),
            fecha_hasta: "2026-04-30".into(),
            granularidad: None,
            canal_caja: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(dto_month.granularidad_aplicada, BiGranularity::Mes);
    assert_eq!(dto_month.serie_temporal.len(), 6);
    assert_eq!(dto_month.serie_temporal[0].periodo_key, "2025-11");
    assert_eq!(dto_month.serie_temporal[1].periodo_key, "2025-12");
    assert_eq!(
        dto_month.serie_temporal[1].gastos,
        Decimal::from_str("15.00").unwrap()
    );
    assert_eq!(dto_month.serie_temporal[2].periodo_key, "2026-01");
    assert_eq!(
        dto_month.serie_temporal[2].gastos,
        Decimal::from_str("45.00").unwrap()
    );
    assert_eq!(dto_month.serie_temporal[5].periodo_key, "2026-04");
}

// ============================================================================
// 4. EXPORTACIÓN CONTEXTUAL CSV / XLSX Y AUDITORÍA
// ============================================================================

#[tokio::test]
async fn test_bi_finance_contextual_export_csv_xlsx_and_audit() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();
    let admin = login_admin(&state).await;

    finance_service::create_operational_expense(
        &pool,
        &admin,
        CreateExpenseDto {
            categoria: ExpenseCategory::Alquiler,
            descripcion: "Alquiler prueba export".into(),
            monto: Decimal::from_str("120.50").unwrap(),
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

    let filter = BiFinanceFilterInput {
        fecha_desde: "2026-11-01".into(),
        fecha_hasta: "2026-11-03".into(),
        granularidad: Some(BiGranularity::Dia),
        canal_caja: Some("MIXTA".into()),
    };

    // 1. Exportar CSV (3 días + 1 fila TOTAL = 4 filas)
    let csv_res = bi_analytics_service::export_bi_finance_analytics(
        &pool,
        &admin,
        BiExportFinanceInput {
            filter: filter.clone(),
            format: ExportFormat::Csv,
        },
    )
    .await
    .unwrap();
    assert_eq!(csv_res.row_count, 4);
    assert!(csv_res.filename.ends_with(".csv"));
    let csv_bytes = verify_sha256_and_decode(&csv_res);
    assert!(csv_bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
    let csv_txt = String::from_utf8(csv_bytes).unwrap();
    assert!(csv_txt.contains("Periodo,Ingresos,Compras,Gastos,Egresos,Flujo Neto"));
    assert!(csv_txt.contains("2026-11-02,0.00,0.00,120.50,120.50,-120.50"));
    assert!(csv_txt.contains("TOTAL,0.00,0.00,120.50,120.50,-120.50"));

    // 2. Exportar XLSX
    let xlsx_res = bi_analytics_service::export_bi_finance_analytics(
        &pool,
        &admin,
        BiExportFinanceInput {
            filter: filter.clone(),
            format: ExportFormat::Xlsx,
        },
    )
    .await
    .unwrap();
    assert_eq!(xlsx_res.row_count, 4);
    assert!(xlsx_res.filename.ends_with(".xlsx"));
    let xlsx_bytes = verify_sha256_and_decode(&xlsx_res);
    assert!(xlsx_bytes.starts_with(b"PK\x03\x04"));
    let xlsx_lossy = String::from_utf8_lossy(&xlsx_bytes);
    assert!(xlsx_lossy.contains("xl/worksheets/sheet1.xml"));
    assert!(xlsx_lossy.contains("TOTAL"));
    assert!(xlsx_lossy.contains("120.50"));

    // 3. Rechazar PDF en exportación contextual
    let pdf_err = bi_analytics_service::export_bi_finance_analytics(
        &pool,
        &admin,
        BiExportFinanceInput {
            filter,
            format: ExportFormat::Pdf,
        },
    )
    .await;
    assert!(matches!(pdf_err, Err(AppError::Validation(_))));

    // 4. Verificar auditoría REPORT_EXPORTED
    let audit_rows = sqlx::query(
        "SELECT detalles_json FROM auditoria_logs WHERE accion = 'REPORT_EXPORTED' AND modulo = 'REPORTES'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(audit_rows.len(), 2);
    let first: String = audit_rows[0].get("detalles_json");
    assert!(first.contains("BI_FINANZAS_SERIE_TEMPORAL"));
}
