use base64::Engine;
use chrono::{Duration, Local};
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use std::str::FromStr;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AuthSession, BiControlFilterInput, BiExportControlInput, BiExportInventoryInput,
    BiInventoryFilterInput, CreateClientInput, CreateCompanyInput, CreateProductInput,
    CreateSupplierInput, CreateUserInput, ExportFileResult, ExportFormat, InventoryMovementType,
    LoginCredentials, OpenCashShiftInput, ProductCategory, ReceptionistPermissionsDto,
    RecordInventoryMovementInput, SupplierType, UserRole,
};
use zarama_gym_lib::services::{
    auth_service, bi_analytics_service, catalog_service, entity_service, permissions_service,
    pos_service,
};
use zarama_gym_lib::state::AppState;

async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_bi_slice_4.db");
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
            nombres: "Operador".into(),
            apellidos: "BI4".into(),
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
// 1. RBAC Y ESCUDO DE PRIVACIDAD DE COSTOS Y MÁRGENES
// ============================================================================

#[tokio::test]
async fn test_bi_slice4_rbac_and_cost_privacy_shield() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();

    let recep = create_and_login_recep(&state, "rec_bi4", "91000001").await;
    let admin = login_admin(&state).await;

    let prod = catalog_service::create_product(
        &pool,
        &admin,
        CreateProductInput {
            codigo_sku: "PRIV-1".into(),
            nombre: "Creatina Priv".into(),
            categoria: ProductCategory::Suplementos,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::from_str("50.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("90.00").unwrap(),
            stock_inicial: Some(10),
            stock_minimo: Some(2),
            proveedor_preferido_id: None,
        },
    )
    .await
    .unwrap();

    catalog_service::record_inventory_movement(
        &pool,
        &admin,
        RecordInventoryMovementInput {
            producto_id: prod.id,
            tipo_movimiento: InventoryMovementType::MermaDanio,
            cantidad: 1,
            costo_unitario_momento: Some(Decimal::from_str("50.00").unwrap()),
            motivo_justificacion: "Envase roto".into(),
        },
    )
    .await
    .unwrap();

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

    let res_v = sqlx::query(
        r#"
        INSERT INTO ventas (
            turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, descuento, total_venta,
            monto_pagado_efectivo, monto_pagado_digital, saldo_credito_generado, estado_venta
        ) VALUES (?, NULL, ?, 90.00, 0.00, 90.00, 90.00, 0.00, 0.00, 'COMPLETADA')
        "#,
    )
    .bind(shift.id)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();
    let v_id = res_v.last_insert_rowid();

    sqlx::query(
        r#"
        INSERT INTO venta_detalles (venta_id, tipo_item, producto_id, plan_id, credito_id, descripcion, cantidad, precio_unitario, subtotal)
        VALUES (?, 'PRODUCTO', ?, NULL, NULL, 'Creatina Priv', 1, 90.00, 90.00)
        "#,
    )
    .bind(v_id)
    .bind(prod.id)
    .execute(&pool)
    .await
    .unwrap();

    let inv_filter = BiInventoryFilterInput::default();
    let ctrl_filter = BiControlFilterInput::default();

    // 1. Todo OFF -> Forbidden en los 4 endpoints
    assert!(matches!(
        bi_analytics_service::get_bi_inventory_analytics(&pool, &recep, inv_filter.clone()).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        bi_analytics_service::get_bi_control_analytics(&pool, &recep, ctrl_filter.clone()).await,
        Err(AppError::Forbidden(_))
    ));

    // 2. Recepcionista con VerTabInventario = true, ExportarContextualBi = true, pero VerTabFinanzas = false
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            ver_tab_inventario: true,
            exportar_contextual_bi: true,
            ver_tab_finanzas: false,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let rec_inv_masked =
        bi_analytics_service::get_bi_inventory_analytics(&pool, &recep, inv_filter.clone())
            .await
            .unwrap();
    assert!(!rec_inv_masked.puede_ver_costos_y_margenes);
    assert_eq!(rec_inv_masked.margen_bruto_estimado, None);
    assert_eq!(rec_inv_masked.margen_bruto_pct, None);
    assert_eq!(rec_inv_masked.valorizacion_inventario, None);
    assert_eq!(rec_inv_masked.mermas_costo_estimado, None);
    assert_eq!(rec_inv_masked.top_productos.len(), 1);
    assert_eq!(rec_inv_masked.top_productos[0].margen_estimado, None);
    assert_eq!(rec_inv_masked.top_productos[0].margen_pct, None);
    assert_eq!(rec_inv_masked.resumen_mermas.len(), 1);
    assert_eq!(rec_inv_masked.resumen_mermas[0].costo_estimado, None);

    // Exportación sin VerTabFinanzas omite columnas de margen/capital inmovilizado
    let csv_masked = bi_analytics_service::export_bi_inventory_analytics(
        &pool,
        &recep,
        BiExportInventoryInput {
            filter: inv_filter.clone(),
            format: ExportFormat::Csv,
        },
    )
    .await
    .unwrap();
    let csv_masked_txt = String::from_utf8(verify_sha256_and_decode(&csv_masked)).unwrap();
    assert!(!csv_masked_txt.contains("Capital Inmovilizado"));
    assert!(!csv_masked_txt.contains("40.00"));

    // Control sigue Forbidden sin VerTabControl
    assert!(matches!(
        bi_analytics_service::get_bi_control_analytics(&pool, &recep, ctrl_filter.clone()).await,
        Err(AppError::Forbidden(_))
    ));

    // 3. Habilitar VerTabFinanzas y VerTabControl -> costos visibles y Control permitido
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            ver_tab_inventario: true,
            ver_tab_finanzas: true,
            ver_tab_control: true,
            exportar_contextual_bi: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let rec_inv_full =
        bi_analytics_service::get_bi_inventory_analytics(&pool, &recep, inv_filter.clone())
            .await
            .unwrap();
    assert!(rec_inv_full.puede_ver_costos_y_margenes);
    assert!(rec_inv_full.margen_bruto_estimado.is_some());
    assert!(rec_inv_full.valorizacion_inventario.is_some());
    assert!(rec_inv_full.top_productos[0].margen_estimado.is_some());

    let csv_full = bi_analytics_service::export_bi_inventory_analytics(
        &pool,
        &recep,
        BiExportInventoryInput {
            filter: inv_filter.clone(),
            format: ExportFormat::Csv,
        },
    )
    .await
    .unwrap();
    let csv_full_txt = String::from_utf8(verify_sha256_and_decode(&csv_full)).unwrap();
    assert!(csv_full_txt.contains("Margen / Capital Inmovilizado"));

    assert!(bi_analytics_service::get_bi_control_analytics(&pool, &recep, ctrl_filter.clone())
        .await
        .is_ok());
    assert!(bi_analytics_service::export_bi_control_analytics(
        &pool,
        &recep,
        BiExportControlInput {
            filter: ctrl_filter,
            format: ExportFormat::Csv,
        },
    )
    .await
    .is_ok());

    // 4. Admin siempre ve costos aunque todo esté OFF para recepcionista
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto::default(),
    )
    .await
    .unwrap();
    let adm_inv = bi_analytics_service::get_bi_inventory_analytics(&pool, &admin, inv_filter)
        .await
        .unwrap();
    assert!(adm_inv.puede_ver_costos_y_margenes);
}

// ============================================================================
// 2. PRODUCTOS E INVENTARIO: MÁRGENES, CATEGORÍAS, STOCK MUERTO, MERMAS, EXPORT
// ============================================================================

#[tokio::test]
async fn test_bi_inventory_performance_dead_stock_shrinkage_and_valuation() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();
    let admin = login_admin(&state).await;

    let supplier = entity_service::create_supplier(
        &pool,
        &admin,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::Empresa,
            persona_id: None,
            empresa_id: None,
            persona_data: None,
            empresa_data: Some(CreateCompanyInput {
                ruc: "20444555666".into(),
                razon_social: "Distribuidora BI4 SAC".into(),
                nombre_comercial: Some("DistriBI4".into()),
                telefono: None,
                email: None,
                direccion: None,
            }),
            rubro_o_categoria: None,
            contacto_referencia: None,
        },
    )
    .await
    .unwrap();

    // P1: BEBIDAS, costo 2.00, venta 5.00, stock 20, min 5, con proveedor
    let p1 = catalog_service::create_product(
        &pool,
        &admin,
        CreateProductInput {
            codigo_sku: "BEB-01".into(),
            nombre: "Agua Isotónica".into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("BOTELLA".into()),
            precio_compra_referencial: Some(Decimal::from_str("2.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("5.00").unwrap(),
            stock_inicial: Some(20),
            stock_minimo: Some(5),
            proveedor_preferido_id: Some(supplier.id),
        },
    )
    .await
    .unwrap();

    // P2: SUPLEMENTOS, costo 40.00, venta 70.00, stock 10, min 15 (CRÍTICO), con proveedor (solo venta hace 45d => stock muerto)
    let p2 = catalog_service::create_product(
        &pool,
        &admin,
        CreateProductInput {
            codigo_sku: "SUP-01".into(),
            nombre: "Pre-Entreno Lento".into(),
            categoria: ProductCategory::Suplementos,
            unidad_medida: Some("FRASCO".into()),
            precio_compra_referencial: Some(Decimal::from_str("40.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("70.00").unwrap(),
            stock_inicial: Some(10),
            stock_minimo: Some(15),
            proveedor_preferido_id: Some(supplier.id),
        },
    )
    .await
    .unwrap();

    // P3: ACCESORIOS, costo 10.00, venta 20.00, stock 5, min 2, sin proveedor (0 ventas jamás => stock muerto)
    let _p3 = catalog_service::create_product(
        &pool,
        &admin,
        CreateProductInput {
            codigo_sku: "ACC-01".into(),
            nombre: "Guantes Cuero".into(),
            categoria: ProductCategory::Accesorios,
            unidad_medida: Some("PAR".into()),
            precio_compra_referencial: Some(Decimal::from_str("10.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("20.00").unwrap(),
            stock_inicial: Some(5),
            stock_minimo: Some(2),
            proveedor_preferido_id: None,
        },
    )
    .await
    .unwrap();

    // Mermas sobre P1: 2 MERMA_DANIO + 1 CONSUMO_PROPIO (quedan 17 unid en stock)
    catalog_service::record_inventory_movement(
        &pool,
        &admin,
        RecordInventoryMovementInput {
            producto_id: p1.id,
            tipo_movimiento: InventoryMovementType::MermaDanio,
            cantidad: 2,
            costo_unitario_momento: Some(Decimal::from_str("2.00").unwrap()),
            motivo_justificacion: "Botellas aplastadas".into(),
        },
    )
    .await
    .unwrap();
    catalog_service::record_inventory_movement(
        &pool,
        &admin,
        RecordInventoryMovementInput {
            producto_id: p1.id,
            tipo_movimiento: InventoryMovementType::ConsumoPropio,
            cantidad: 1,
            costo_unitario_momento: Some(Decimal::from_str("2.00").unwrap()),
            motivo_justificacion: "Staff".into(),
        },
    )
    .await
    .unwrap();

    let today = Local::now().date_naive();
    let d_desde = today - Duration::days(9);
    let d_hasta = today;
    let d_prev = today - Duration::days(15);
    let d_old = today - Duration::days(45);

    let shift = pos_service::open_cash_shift(
        &pool,
        &admin,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("50.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    // Venta actual P1: 10 unid * 5.00 = 50.00 (margen 50 - 20 = 30.00)
    // Venta anterior P1: 5 unid * 5.00 = 25.00 (margen 25 - 10 = 15.00)
    // Venta antigua P2 (hace 45d): 1 unid * 70.00 = 70.00
    for (prod_id, qty, unit, sub, ts) in [
        (p1.id, 10i64, "5.00", "50.00", format!("{} 11:00:00", d_hasta.format("%Y-%m-%d"))),
        (p1.id, 5i64, "5.00", "25.00", format!("{} 11:00:00", d_prev.format("%Y-%m-%d"))),
        (p2.id, 1i64, "70.00", "70.00", format!("{} 11:00:00", d_old.format("%Y-%m-%d"))),
    ] {
        let rv = sqlx::query(
            r#"
            INSERT INTO ventas (
                turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, descuento, total_venta,
                monto_pagado_efectivo, monto_pagado_digital, saldo_credito_generado, estado_venta, created_at
            ) VALUES (?, NULL, ?, ?, 0.00, ?, ?, 0.00, 0.00, 'COMPLETADA', ?)
            "#,
        )
        .bind(shift.id)
        .bind(admin.user_id)
        .bind(sub)
        .bind(sub)
        .bind(sub)
        .bind(&ts)
        .execute(&pool)
        .await
        .unwrap();
        let vid = rv.last_insert_rowid();

        sqlx::query(
            "INSERT INTO venta_detalles (venta_id, tipo_item, producto_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, 'PRODUCTO', ?, 'Item', ?, ?, ?)",
        )
        .bind(vid)
        .bind(prod_id)
        .bind(qty)
        .bind(unit)
        .bind(sub)
        .execute(&pool)
        .await
        .unwrap();
    }

    let dto = bi_analytics_service::get_bi_inventory_analytics(
        &pool,
        &admin,
        BiInventoryFilterInput {
            fecha_desde: d_desde.format("%Y-%m-%d").to_string(),
            fecha_hasta: d_hasta.format("%Y-%m-%d").to_string(),
            categoria: None,
            proveedor_id: None,
            dias_stock_muerto: Some(30),
        },
    )
    .await
    .unwrap();

    assert!(dto.puede_ver_costos_y_margenes);
    assert_eq!(dto.productos_activos_count, 3);
    assert_eq!(dto.productos_stock_critico_count, 1); // P2 (10 <= 15)

    // Valorización inventario: P1 (17*2=34) + P2 (10*40=400) + P3 (5*10=50) = 484.00
    assert_eq!(
        dto.valorizacion_inventario,
        Some(Decimal::from_str("484.00").unwrap())
    );

    // Ingresos y unidades vs anterior
    assert_eq!(
        dto.ingresos_productos.actual,
        Decimal::from_str("50.00").unwrap()
    );
    assert_eq!(
        dto.ingresos_productos.anterior,
        Decimal::from_str("25.00").unwrap()
    );
    assert_eq!(dto.ingresos_productos.delta_pct, Some(100.0));
    assert_eq!(dto.unidades_vendidas.actual, Decimal::from(10));
    assert_eq!(dto.unidades_vendidas.anterior, Decimal::from(5));
    assert_eq!(dto.unidades_vendidas.delta_pct, Some(100.0));

    // Margen bruto estimado: actual 30.00 (60.0%), anterior 15.00 (+100.0%)
    let mb = dto.margen_bruto_estimado.as_ref().unwrap();
    assert_eq!(mb.actual, Decimal::from_str("30.00").unwrap());
    assert_eq!(mb.anterior, Decimal::from_str("15.00").unwrap());
    assert_eq!(mb.delta_pct, Some(100.0));
    assert_eq!(dto.margen_bruto_pct, Some(60.0));

    // Mermas: 3 unid, 6.00 costo
    assert_eq!(dto.mermas_unidades, 3);
    assert_eq!(
        dto.mermas_costo_estimado,
        Some(Decimal::from_str("6.00").unwrap())
    );
    assert_eq!(dto.resumen_mermas.len(), 2);

    // Top productos: solo P1 tuvo ventas en últimos 10d
    assert_eq!(dto.top_productos.len(), 1);
    assert_eq!(dto.top_productos[0].producto_id, p1.id);
    assert_eq!(
        dto.top_productos[0].margen_estimado,
        Some(Decimal::from_str("30.00").unwrap())
    );
    assert_eq!(dto.top_productos[0].margen_pct, Some(60.0));

    // Stock muerto (30d): P2 (stock 10, cap 400, 45d sin venta) y P3 (stock 5, cap 50, None)
    assert_eq!(dto.stock_muerto.len(), 2);
    assert_eq!(dto.stock_muerto[0].producto_id, p2.id);
    assert_eq!(
        dto.stock_muerto[0].capital_inmovilizado,
        Some(Decimal::from_str("400.00").unwrap())
    );
    assert_eq!(dto.stock_muerto[0].dias_sin_venta, Some(45));
    assert_eq!(dto.stock_muerto[1].ultima_venta, None);
    assert_eq!(dto.stock_muerto[1].dias_sin_venta, None);

    // Filtro por proveedor_id excluye P3
    let by_prov = bi_analytics_service::get_bi_inventory_analytics(
        &pool,
        &admin,
        BiInventoryFilterInput {
            fecha_desde: d_desde.format("%Y-%m-%d").to_string(),
            fecha_hasta: d_hasta.format("%Y-%m-%d").to_string(),
            categoria: None,
            proveedor_id: Some(supplier.id),
            dias_stock_muerto: Some(30),
        },
    )
    .await
    .unwrap();
    assert_eq!(by_prov.productos_activos_count, 2);
    assert_eq!(by_prov.stock_muerto.len(), 1);

    // Exportación XLSX + auditoría
    let xlsx = bi_analytics_service::export_bi_inventory_analytics(
        &pool,
        &admin,
        BiExportInventoryInput {
            filter: BiInventoryFilterInput {
                fecha_desde: d_desde.format("%Y-%m-%d").to_string(),
                fecha_hasta: d_hasta.format("%Y-%m-%d").to_string(),
                ..Default::default()
            },
            format: ExportFormat::Xlsx,
        },
    )
    .await
    .unwrap();
    let bytes = verify_sha256_and_decode(&xlsx);
    assert!(bytes.starts_with(b"PK\x03\x04"));
    let audit_cnt: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auditoria_logs WHERE accion = 'REPORT_EXPORTED' AND detalles_json LIKE '%BI_PRODUCTOS_INVENTARIO%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_cnt, 1);
}

// ============================================================================
// 3. CONTROL Y RIESGO: AGING CARTERA, ARQUEOS, TACHADOS Y AUDITORÍA CRÍTICA
// ============================================================================

#[tokio::test]
async fn test_bi_control_aging_cash_audits_strikes_and_critical_audit() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();

    let recep = create_and_login_recep(&state, "rec_ctrl", "92000001").await;
    let admin = login_admin(&state).await;

    let today = Local::now().date_naive();
    let d_desde = today - Duration::days(29);
    let desde_str = d_desde.format("%Y-%m-%d").to_string();
    let hasta_str = today.format("%Y-%m-%d").to_string();

    let c1 = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("43000001".into()),
            nombres: Some("Deudor".into()),
            apellidos: Some("Uno".into()),
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
    .unwrap()
    .id;

    let c2 = entity_service::create_client(
        &pool,
        &admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("43000002".into()),
            nombres: Some("Deudor".into()),
            apellidos: Some("Dos".into()),
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
    .unwrap()
    .id;

    // Créditos PENDIENTE en los 4 buckets de aging:
    // - 3 días: MEMBRESIA_PAGO_PARCIAL (50.00)
    // - 15 días: PRODUCTO_CREDITO (100.00)
    // - 45 días: PASE_DIARIO_SEMAFORO_ROJO (20.00)
    // - 75 días: MEMBRESIA_PAGO_PARCIAL (80.00)
    // + 1 PAGADO hace 2 días (40.00) emitido en el periodo
    for (cid, origen, total, pagado, saldo, estado, days_ago, paid_at) in [
        (c1, "MEMBRESIA_PAGO_PARCIAL", "50.00", "0.00", "50.00", "PENDIENTE", 3i64, None),
        (c1, "PRODUCTO_CREDITO", "100.00", "0.00", "100.00", "PENDIENTE", 15, None),
        (c2, "PASE_DIARIO_SEMAFORO_ROJO", "20.00", "0.00", "20.00", "PENDIENTE", 45, None),
        (c2, "MEMBRESIA_PAGO_PARCIAL", "80.00", "0.00", "80.00", "PENDIENTE", 75, None),
        (
            c1,
            "PRODUCTO_CREDITO",
            "40.00",
            "40.00",
            "0.00",
            "PAGADO",
            2,
            Some(format!("{} 12:00:00", today.format("%Y-%m-%d"))),
        ),
    ] {
        let em = (today - Duration::days(days_ago))
            .format("%Y-%m-%d 10:00:00")
            .to_string();
        sqlx::query(
            r#"
            INSERT INTO creditos_clientes
                (cliente_id, origen_credito, descripcion, monto_total, monto_pagado, saldo_pendiente, estado, fecha_emision, fecha_ultimo_pago, registrado_por_usuario_id)
            VALUES (?, ?, 'Credito test', ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(cid)
        .bind(origen)
        .bind(total)
        .bind(pagado)
        .bind(saldo)
        .bind(estado)
        .bind(&em)
        .bind(paid_at)
        .bind(admin.user_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    // Turnos cerrados en el periodo:
    // - Admin: 1 exacto (0.00), 1 sobrante (+15.00)
    // - Recep: 1 faltante (-5.00)
    let fc_today = format!("{} 20:00:00", today.format("%Y-%m-%d"));
    let fc_yest = format!(
        "{} 20:00:00",
        (today - Duration::days(1)).format("%Y-%m-%d")
    );
    let fc_2d = format!(
        "{} 20:00:00",
        (today - Duration::days(2)).format("%Y-%m-%d")
    );

    for (uid, diff, fc) in [
        (admin.user_id, "0.00", &fc_2d),
        (admin.user_id, "15.00", &fc_yest),
        (recep.user_id, "-5.00", &fc_today),
    ] {
        sqlx::query(
            r#"
            INSERT INTO turnos_caja
                (usuario_apertura_id, usuario_cierre_id, fecha_apertura, fecha_cierre, monto_apertura_fisico, total_efectivo_esperado, monto_cierre_fisico_declarado, diferencia_arqueo_fisico, estado)
            VALUES (?, ?, ?, ?, 100.00, 100.00, 100.00, ?, 'CERRADO')
            "#,
        )
        .bind(uid)
        .bind(uid)
        .bind(fc)
        .bind(fc)
        .bind(diff)
        .execute(&pool)
        .await
        .unwrap();
    }

    // Abrir un turno para asociar ventas (2 COMPLETADA, 1 TACHADA_EN_TURNO por recep, 1 ANULADA_DEFINITIVA por admin)
    let open_shift = pos_service::open_cash_shift(
        &pool,
        &admin,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("50.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    for (uid, estado, total) in [
        (admin.user_id, "COMPLETADA", "100.00"),
        (recep.user_id, "COMPLETADA", "50.00"),
        (recep.user_id, "TACHADA_EN_TURNO", "40.00"),
        (admin.user_id, "ANULADA_DEFINITIVA", "60.00"),
    ] {
        sqlx::query(
            r#"
            INSERT INTO ventas (
                turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, descuento, total_venta,
                monto_pagado_efectivo, monto_pagado_digital, saldo_credito_generado, estado_venta
            ) VALUES (?, ?, ?, ?, 0.00, ?, 0.00, 0.00, 0.00, ?)
            "#,
        )
        .bind(open_shift.id)
        .bind(c1)
        .bind(uid)
        .bind(total)
        .bind(total)
        .bind(estado)
        .execute(&pool)
        .await
        .unwrap();
    }

    // Evento crítico adicional en auditoría
    sqlx::query(
        "INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json) VALUES (?, ?, 'SALE_STRUCK', 'POS', '{\"venta_id\":99}')",
    )
    .bind(recep.user_id)
    .bind(&recep.username)
    .execute(&pool)
    .await
    .unwrap();

    // =========================================================================
    // VERIFICACIÓN GLOBAL CONTROL Y RIESGO
    // =========================================================================
    let dto = bi_analytics_service::get_bi_control_analytics(
        &pool,
        &admin,
        BiControlFilterInput {
            fecha_desde: desde_str.clone(),
            fecha_hasta: hasta_str.clone(),
            usuario_id: None,
            origen_credito: None,
        },
    )
    .await
    .unwrap();

    // Cartera pendiente: 50 + 100 + 20 + 80 = 250.00, 2 deudores, 4 créditos pendientes
    assert_eq!(
        dto.saldo_pendiente_total,
        Decimal::from_str("250.00").unwrap()
    );
    assert_eq!(dto.deudores_activos_count, 2);
    assert_eq!(dto.creditos_pendientes_count, 4);

    // Emitidos en últimos 30d: 50 (3d) + 100 (15d) + 40 (2d) = 190.00; cobrados: 40.00 -> 21.1%
    assert_eq!(
        dto.creditos_emitidos_periodo,
        Decimal::from_str("190.00").unwrap()
    );
    assert_eq!(
        dto.creditos_cobrados_periodo,
        Decimal::from_str("40.00").unwrap()
    );
    assert_eq!(dto.tasa_recuperacion_pct, 21.1);

    // Aging 4 buckets ordenados
    assert_eq!(dto.aging_cartera.len(), 4);
    assert_eq!(dto.aging_cartera[0].clave, "0_7_DIAS");
    assert_eq!(dto.aging_cartera[0].monto, Decimal::from_str("50.00").unwrap());
    assert_eq!(dto.aging_cartera[1].clave, "8_30_DIAS");
    assert_eq!(dto.aging_cartera[1].monto, Decimal::from_str("100.00").unwrap());
    assert_eq!(dto.aging_cartera[2].clave, "31_60_DIAS");
    assert_eq!(dto.aging_cartera[2].monto, Decimal::from_str("20.00").unwrap());
    assert_eq!(dto.aging_cartera[3].clave, "MAS_60_DIAS");
    assert_eq!(dto.aging_cartera[3].monto, Decimal::from_str("80.00").unwrap());

    // Deuda por origen
    assert_eq!(dto.deuda_por_origen.len(), 3);
    assert_eq!(
        dto.deuda_por_origen[0].monto,
        Decimal::from_str("130.00").unwrap()
    );

    // Arqueos
    assert_eq!(dto.turnos_cerrados_count, 3);
    assert_eq!(dto.turnos_cuadre_exacto_count, 1);
    assert_eq!(dto.turnos_con_sobrante_count, 1);
    assert_eq!(dto.turnos_con_faltante_count, 1);
    assert_eq!(
        dto.descuadre_neto_acumulado,
        Decimal::from_str("10.00").unwrap()
    );
    assert_eq!(dto.arqueos_por_operador.len(), 2);
    let adm_aq = dto
        .arqueos_por_operador
        .iter()
        .find(|a| a.usuario_id == admin.user_id)
        .unwrap();
    assert_eq!(adm_aq.sobrante_total, Decimal::from_str("15.00").unwrap());
    assert_eq!(adm_aq.diferencia_neta, Decimal::from_str("15.00").unwrap());
    let rec_aq = dto
        .arqueos_por_operador
        .iter()
        .find(|a| a.usuario_id == recep.user_id)
        .unwrap();
    assert_eq!(rec_aq.faltante_total, Decimal::from_str("5.00").unwrap());
    assert_eq!(rec_aq.diferencia_neta, Decimal::from_str("-5.00").unwrap());

    // Tachados / anulaciones
    assert_eq!(dto.ventas_totales_periodo, 4);
    assert_eq!(dto.ventas_tachadas_count, 1);
    assert_eq!(dto.ventas_anuladas_count, 1);
    assert_eq!(dto.tasa_anulacion_pct, 50.0);
    assert_eq!(dto.tachados_por_operador.len(), 2);

    // Auditoría crítica
    assert!(dto
        .eventos_criticos_auditoria
        .iter()
        .any(|e| e.accion == "SALE_STRUCK"));

    // Filtro por usuario_id = recep.user_id
    let by_rec = bi_analytics_service::get_bi_control_analytics(
        &pool,
        &admin,
        BiControlFilterInput {
            fecha_desde: desde_str.clone(),
            fecha_hasta: hasta_str.clone(),
            usuario_id: Some(recep.user_id),
            origen_credito: Some("PRODUCTO_CREDITO".into()),
        },
    )
    .await
    .unwrap();
    assert_eq!(by_rec.turnos_cerrados_count, 1);
    assert_eq!(by_rec.ventas_totales_periodo, 2);
    assert_eq!(
        by_rec.saldo_pendiente_total,
        Decimal::from_str("100.00").unwrap()
    );

    // Exportación CSV y XLSX + auditoría BI_CONTROL_RIESGO
    let csv = bi_analytics_service::export_bi_control_analytics(
        &pool,
        &admin,
        BiExportControlInput {
            filter: BiControlFilterInput {
                fecha_desde: desde_str.clone(),
                fecha_hasta: hasta_str.clone(),
                ..Default::default()
            },
            format: ExportFormat::Csv,
        },
    )
    .await
    .unwrap();
    let csv_txt = String::from_utf8(verify_sha256_and_decode(&csv)).unwrap();
    assert!(csv_txt.contains("AGING_CARTERA"));
    assert!(csv_txt.contains("ARQUEO_OPERADOR"));
    assert!(csv_txt.contains("TACHADOS_OPERADOR"));

    let xlsx = bi_analytics_service::export_bi_control_analytics(
        &pool,
        &admin,
        BiExportControlInput {
            filter: BiControlFilterInput {
                fecha_desde: desde_str,
                fecha_hasta: hasta_str,
                ..Default::default()
            },
            format: ExportFormat::Xlsx,
        },
    )
    .await
    .unwrap();
    let xlsx_bytes = verify_sha256_and_decode(&xlsx);
    assert!(xlsx_bytes.starts_with(b"PK\x03\x04"));

    let audit_cnt: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auditoria_logs WHERE accion = 'REPORT_EXPORTED' AND detalles_json LIKE '%BI_CONTROL_RIESGO%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_cnt, 2);
}
