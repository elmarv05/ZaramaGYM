use rust_decimal::Decimal;
use std::str::FromStr;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AuditFilter, CreateCompanyInput, CreatePlanInput, CreateProductInput, CreateSupplierInput,
    CreateUserInput, InventoryMovementFilter, InventoryMovementType, LoginCredentials, PlanFilter,
    PlanType, ProductCategory, ProductFilter, RecordInventoryMovementInput, SupplierType,
    UpdatePlanInput, UpdateProductInput, UserRole,
};
use zarama_gym_lib::services::{audit_service, auth_service, catalog_service, entity_service};
use zarama_gym_lib::state::AppState;

/// Helper para crear un entorno aislado con base de datos en archivo temporal
async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_slice3.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new(pool);
    (state, temp_dir)
}

// ============================================================================
// TEST 1: LOS 7 CASOS CANÓNICOS OBLIGATORIOS DE DAY OVERFLOW (CP-01 A CP-07)
// ============================================================================
#[test]
fn test_day_overflow_canonical_cases_cp01_to_cp07() {
    // CP-01: 2024-01-31 + 1M -> 2024-03-02 23:59:59 (Bisiesto 2024, Feb 29 -> +2 días desborde, 32 días totales)
    let cp01 = catalog_service::calcular_fecha_vencimiento("2024-01-31", "MENSUALIDAD", Some(1))
        .expect("CP-01 falló");
    assert_eq!(cp01.fecha_vencimiento_date, "2024-03-02");
    assert_eq!(cp01.fecha_vencimiento_timestamp, "2024-03-02 23:59:59");
    assert_eq!(cp01.dias_desbordamiento, 2);
    assert!(cp01.hubo_desbordamiento);
    assert_eq!(cp01.dias_totales, 32);
    assert!(cp01.es_bisiesto_destino);

    // CP-02: 2025-01-31 + 1M -> 2025-03-03 23:59:59 (Común 2025, Feb 28 -> +3 días desborde, 32 días totales)
    let cp02 = catalog_service::calcular_fecha_vencimiento("2025-01-31", "MENSUALIDAD", Some(1))
        .expect("CP-02 falló");
    assert_eq!(cp02.fecha_vencimiento_date, "2025-03-03");
    assert_eq!(cp02.fecha_vencimiento_timestamp, "2025-03-03 23:59:59");
    assert_eq!(cp02.dias_desbordamiento, 3);
    assert!(cp02.hubo_desbordamiento);
    assert_eq!(cp02.dias_totales, 32);
    assert!(!cp02.es_bisiesto_destino);

    // CP-03: 2026-01-31 + 2M -> 2026-03-31 23:59:59 (Marzo = 31 -> 0 días desborde, 60 días totales)
    let cp03 = catalog_service::calcular_fecha_vencimiento("2026-01-31", "MENSUALIDAD", Some(2))
        .expect("CP-03 falló");
    assert_eq!(cp03.fecha_vencimiento_date, "2026-03-31");
    assert_eq!(cp03.fecha_vencimiento_timestamp, "2026-03-31 23:59:59");
    assert_eq!(cp03.dias_desbordamiento, 0);
    assert!(!cp03.hubo_desbordamiento);
    assert_eq!(cp03.dias_totales, 60);

    // CP-04: 2026-01-31 + 3M -> 2026-05-01 23:59:59 (Abril = 30 -> +1 día desborde, 91 días totales)
    let cp04 = catalog_service::calcular_fecha_vencimiento("2026-01-31", "MENSUALIDAD", Some(3))
        .expect("CP-04 falló");
    assert_eq!(cp04.fecha_vencimiento_date, "2026-05-01");
    assert_eq!(cp04.fecha_vencimiento_timestamp, "2026-05-01 23:59:59");
    assert_eq!(cp04.dias_desbordamiento, 1);
    assert!(cp04.hubo_desbordamiento);
    assert_eq!(cp04.dias_totales, 91);

    // CP-05: 2026-05-15 + PASE_DIARIO -> 2026-05-15 23:59:59 (0 desborde, 1 día total)
    let cp05 = catalog_service::calcular_fecha_vencimiento("2026-05-15", "PASE_DIARIO", None)
        .expect("CP-05 falló");
    assert_eq!(cp05.fecha_vencimiento_date, "2026-05-15");
    assert_eq!(cp05.fecha_vencimiento_timestamp, "2026-05-15 23:59:59");
    assert_eq!(cp05.dias_desbordamiento, 0);
    assert!(!cp05.hubo_desbordamiento);
    assert_eq!(cp05.dias_totales, 1);

    // CP-06: 2026-08-31 + 1M -> 2026-10-01 23:59:59 (Septiembre = 30 -> +1 día desborde, 32 días totales)
    let cp06 = catalog_service::calcular_fecha_vencimiento("2026-08-31", "MENSUALIDAD", Some(1))
        .expect("CP-06 falló");
    assert_eq!(cp06.fecha_vencimiento_date, "2026-10-01");
    assert_eq!(cp06.fecha_vencimiento_timestamp, "2026-10-01 23:59:59");
    assert_eq!(cp06.dias_desbordamiento, 1);
    assert!(cp06.hubo_desbordamiento);
    assert_eq!(cp06.dias_totales, 32);

    // CP-07: 2024-02-29 + 12M -> 2025-03-01 23:59:59 (Común 2025, Feb 28 -> +1 día desborde, 367 días totales)
    let cp07 = catalog_service::calcular_fecha_vencimiento("2024-02-29", "MENSUALIDAD", Some(12))
        .expect("CP-07 falló");
    assert_eq!(cp07.fecha_vencimiento_date, "2025-03-01");
    assert_eq!(cp07.fecha_vencimiento_timestamp, "2025-03-01 23:59:59");
    assert_eq!(cp07.dias_desbordamiento, 1);
    assert!(cp07.hubo_desbordamiento);
    assert_eq!(cp07.dias_totales, 367);
}

// ============================================================================
// TEST 2: SEED DE PLANES, CRUD DE PLANES Y CONTROLES RBAC
// ============================================================================
#[tokio::test]
async fn test_plans_seed_crud_and_rbac_permissions() {
    let (state, _temp_dir) = setup_test_env().await;

    // 1. Iniciar sesión como ADMIN (root)
    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .expect("Login admin falló");

    // 2. Crear usuario RECEPCIONISTA (rec1)
    let _rec_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "recep1".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "33333333".into(),
            nombres: "Recepción".into(),
            apellidos: "Prueba".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .expect("Crear recepcionista falló");

    // Sesión de recepcionista
    let rec_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "recep1".into(),
            password: "password123".into(),
        },
    )
    .await
    .expect("Login recep falló");

    // 4. Verificar los 4 planes semilla de ZaramaGYM
    let planes = catalog_service::list_plans(&state.pool(), &rec_session, &PlanFilter::default())
        .await
        .expect("List plans por recepcionista falló");
    assert_eq!(planes.len(), 4, "Debe haber exactamente 4 planes semilla");

    let p1 = &planes[0];
    assert_eq!(p1.codigo, "PASE-DIA");
    assert_eq!(p1.tipo_plan, PlanType::PaseDiario);
    assert_eq!(p1.duracion_meses, 0);
    assert_eq!(p1.precio_base, Decimal::from_str("10.00").unwrap());
    assert!(!p1.permite_recuperacion_dias);

    let p2 = &planes[1];
    assert_eq!(p2.codigo, "PLAN-1M");
    assert_eq!(p2.tipo_plan, PlanType::Mensualidad);
    assert_eq!(p2.duracion_meses, 1);
    assert_eq!(p2.precio_base, Decimal::from_str("80.00").unwrap());
    assert!(p2.permite_recuperacion_dias);

    let p3 = &planes[2];
    assert_eq!(p3.codigo, "PLAN-2M");
    assert_eq!(p3.duracion_meses, 2);
    assert_eq!(p3.precio_base, Decimal::from_str("150.00").unwrap());

    let p4 = &planes[3];
    assert_eq!(p4.codigo, "PLAN-3M");
    assert_eq!(p4.duracion_meses, 3);
    assert_eq!(p4.precio_base, Decimal::from_str("210.00").unwrap());

    // 5. RBAC: RECEPCIONISTA SÍ puede crear planes nuevos, pero NO modificar ni desactivar
    let plan_rec = catalog_service::create_plan(
        &state.pool(),
        &rec_session,
        CreatePlanInput {
            codigo: "PLAN-RECEP".into(),
            nombre: "Plan Creado Por Recepcionista".into(),
            descripcion: None,
            tipo_plan: PlanType::Mensualidad,
            duracion_meses: 1,
            precio_base: Decimal::from_str("90.00").unwrap(),
            permite_recuperacion_dias: true,
        },
    )
    .await
    .expect("Recepcionista debe poder crear planes nuevos");
    assert_eq!(plan_rec.codigo, "PLAN-RECEP");

    let err_rec_toggle_plan =
        catalog_service::toggle_plan_active(&state.pool(), &rec_session, plan_rec.id, false).await;
    assert!(matches!(err_rec_toggle_plan, Err(AppError::Forbidden(_))));

    // 6. ADMINISTRADOR puede crear planes
    let nuevo_plan = catalog_service::create_plan(
        &state.pool(),
        &admin_session,
        CreatePlanInput {
            codigo: "PLAN-6M".into(),
            nombre: "Membresía Semestral".into(),
            descripcion: Some("Plan para 6 meses con descuento especial".into()),
            tipo_plan: PlanType::Mensualidad,
            duracion_meses: 6,
            precio_base: Decimal::from_str("380.00").unwrap(),
            permite_recuperacion_dias: true,
        },
    )
    .await
    .expect("Admin no pudo crear plan semestral");
    assert_eq!(nuevo_plan.codigo, "PLAN-6M");
    assert_eq!(nuevo_plan.duracion_meses, 6);
    assert_eq!(nuevo_plan.precio_base, Decimal::from_str("380.00").unwrap());

    // 7. ADMINISTRADOR puede editar el plan (y RECEPCIONISTA recibe Forbidden)
    let err_rec_update = catalog_service::update_plan(
        &state.pool(),
        &rec_session,
        nuevo_plan.id,
        UpdatePlanInput {
            nombre: "Intento Recep".into(),
            descripcion: None,
            precio_base: Decimal::from_str("10.00").unwrap(),
            permite_recuperacion_dias: false,
        },
    )
    .await;
    assert!(matches!(err_rec_update, Err(AppError::Forbidden(_))));

    let plan_actualizado = catalog_service::update_plan(
        &state.pool(),
        &admin_session,
        nuevo_plan.id,
        UpdatePlanInput {
            nombre: "Membresía Semestral PRO".into(),
            descripcion: Some("Actualizado con nuevo precio".into()),
            precio_base: Decimal::from_str("395.00").unwrap(),
            permite_recuperacion_dias: true,
        },
    )
    .await
    .expect("Admin no pudo actualizar plan");
    assert_eq!(plan_actualizado.nombre, "Membresía Semestral PRO");
    assert_eq!(plan_actualizado.precio_base, Decimal::from_str("395.00").unwrap());

    // Desactivar plan_rec para mantener conteo de planes semilla + nuevo_plan
    catalog_service::toggle_plan_active(&state.pool(), &admin_session, plan_rec.id, false)
        .await
        .unwrap();

    // 7.1 RECEPCIONISTA sí puede crear y actualizar productos, pero NO desactivarlos ni registrar mermas
    let prod_rec = catalog_service::create_product(
        &state.pool(),
        &rec_session,
        CreateProductInput {
            codigo_sku: "RECEP-AGUA".into(),
            nombre: "Agua Recepcion".into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("BOTELLA".into()),
            precio_compra_referencial: Some(Decimal::from_str("1.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("2.50").unwrap(),
            stock_inicial: Some(5),
            stock_minimo: Some(2),
            proveedor_preferido_id: None,
        },
    )
    .await
    .expect("Recepcionista debe poder registrar productos");

    let prod_rec_upd = catalog_service::update_product(
        &state.pool(),
        &rec_session,
        prod_rec.id,
        UpdateProductInput {
            codigo_sku: None,
            nombre: "Agua Recepcion Editada".into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("BOTELLA".into()),
            precio_compra_referencial: Some(Decimal::from_str("1.10").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("3.00").unwrap(),
            stock_minimo: 2,
            proveedor_preferido_id: None,
        },
    )
    .await
    .expect("Recepcionista debe poder modificar productos");
    assert_eq!(prod_rec_upd.nombre, "Agua Recepcion Editada");

    let err_rec_toggle_prod =
        catalog_service::toggle_product_active(&state.pool(), &rec_session, prod_rec.id, false)
            .await;
    assert!(matches!(err_rec_toggle_prod, Err(AppError::Forbidden(_))));

    let err_rec_merma = catalog_service::record_inventory_movement(
        &state.pool(),
        &rec_session,
        RecordInventoryMovementInput {
            producto_id: prod_rec.id,
            tipo_movimiento: InventoryMovementType::Merma,
            cantidad: 1,
            costo_unitario_momento: None,
            motivo_justificacion: "Prueba recepcionista sin permiso".into(),
        },
    )
    .await;
    assert!(matches!(err_rec_merma, Err(AppError::Forbidden(_))));

    // 8. ADMINISTRADOR puede desactivar y activar plan
    catalog_service::toggle_plan_active(&state.pool(), &admin_session, nuevo_plan.id, false)
        .await
        .expect("Admin no pudo desactivar plan");

    let planes_solo_activos = catalog_service::list_plans(
        &state.pool(),
        &admin_session,
        &PlanFilter {
            solo_activos: Some(true),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(planes_solo_activos.len(), 4, "No debe aparecer el plan desactivado");

    // 9. Simulación de vencimiento por recepcionista
    let preview = catalog_service::preview_plan_expiration("2026-03-31", "MENSUALIDAD", 1)
        .expect("Preview falló");
    assert_eq!(preview.fecha_vencimiento_date, "2026-05-01");
    assert_eq!(preview.dias_desbordamiento, 1);
}

// ============================================================================
// TEST 3: PRODUCTOS, STOCK INICIAL EN KARDEX, MERMAS Y NO NEGATIVIDAD
// ============================================================================
#[tokio::test]
async fn test_products_inventory_initial_stock_and_waste_management() {
    let (state, _temp_dir) = setup_test_env().await;

    // Login ADMIN
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

    // Crear empresa y proveedor para probar vinculación
    let company = entity_service::create_company(
        &state.pool(),
        &admin_session,
        CreateCompanyInput {
            ruc: "20555666777".into(),
            razon_social: "Distribuidora Fitness SAC".into(),
            nombre_comercial: Some("FitDistro".into()),
            telefono: Some("987654321".into()),
            email: Some("ventas@fitdistro.com".into()),
            direccion: Some("Av. Principal 123".into()),
        },
    )
    .await
    .expect("Crear empresa falló");

    let prov = entity_service::create_supplier(
        &state.pool(),
        &admin_session,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::Empresa,
            persona_id: None,
            empresa_id: Some(company.id),
            persona_data: None,
            empresa_data: None,
            rubro_o_categoria: Some("Suplementos".into()),
            contacto_referencia: Some("Pedro Distribuidor".into()),
        },
    )
    .await
    .expect("Crear proveedor falló");

    // 1. Crear producto con stock_inicial > 0 (ej. 20 unidades)
    let prod1 = catalog_service::create_product(
        &state.pool(),
        &admin_session,
        CreateProductInput {
            codigo_sku: "AGUA-500ML".into(),
            nombre: "Agua Mineral 500ml".into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("BOTELLA".into()),
            precio_compra_referencial: Some(Decimal::from_str("1.20").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("2.50").unwrap(),
            stock_inicial: Some(20),
            stock_minimo: Some(5),
            proveedor_preferido_id: Some(prov.id),
        },
    )
    .await
    .expect("Crear producto falló");

    assert_eq!(prod1.stock_actual, 20);
    assert_eq!(prod1.stock_minimo, 5);
    assert!(!prod1.alerta_stock_bajo, "20 > 5, no debe haber alerta");
    assert_eq!(prod1.proveedor_nombre.as_deref(), Some("Distribuidora Fitness SAC"));

    // 2. Verificar que se generó automáticamente el movimiento STOCK_INICIAL en Kardex
    let kardex = catalog_service::list_inventory_movements(
        &state.pool(),
        &admin_session,
        &InventoryMovementFilter {
            producto_id: Some(prod1.id),
            ..Default::default()
        },
    )
    .await
    .expect("Listar kardex falló");

    assert_eq!(kardex.len(), 1, "Debe existir exactamente el movimiento de STOCK_INICIAL");
    let mov_ini = &kardex[0];
    assert_eq!(mov_ini.tipo_movimiento, InventoryMovementType::StockInicial);
    assert_eq!(mov_ini.signo, "+");
    assert_eq!(mov_ini.cantidad, 20);
    assert_eq!(mov_ini.stock_anterior, 0);
    assert_eq!(mov_ini.stock_resultante, 20);
    assert_eq!(mov_ini.costo_unitario_momento, Decimal::from_str("1.20").unwrap());
    assert_eq!(mov_ini.registrado_por_username, "admin");

    // 3. Crear producto con stock_inicial = 0 -> No debe crear movimiento en Kardex
    let prod2 = catalog_service::create_product(
        &state.pool(),
        &admin_session,
        CreateProductInput {
            codigo_sku: "SHAKER-PRO".into(),
            nombre: "Vaso Mezclador Shaker".into(),
            categoria: ProductCategory::Accesorios,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::from_str("8.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("18.00").unwrap(),
            stock_inicial: Some(0),
            stock_minimo: Some(3),
            proveedor_preferido_id: None,
        },
    )
    .await
    .unwrap();

    let kardex2 = catalog_service::list_inventory_movements(
        &state.pool(),
        &admin_session,
        &InventoryMovementFilter {
            producto_id: Some(prod2.id),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(kardex2.len(), 0, "No debe registrar movimiento si stock inicial es 0");

    // 4. Intento de MERMA con justificación corta (< 5 caracteres) -> RECHAZO
    let err_corta = catalog_service::record_inventory_movement(
        &state.pool(),
        &admin_session,
        RecordInventoryMovementInput {
            producto_id: prod1.id,
            tipo_movimiento: InventoryMovementType::Merma,
            cantidad: 2,
            costo_unitario_momento: None,
            motivo_justificacion: "roto".into(), // 4 caracteres
        },
    )
    .await;
    match err_corta {
        Err(AppError::Validation(msg)) => assert!(msg.contains("5 caracteres")),
        other => panic!("Esperaba AppError::Validation por motivo corto, obtuve: {:?}", other),
    }

    // 5. Intento de MERMA que excede el stock actual (stock negativo) -> RECHAZO
    let err_stock_neg = catalog_service::record_inventory_movement(
        &state.pool(),
        &admin_session,
        RecordInventoryMovementInput {
            producto_id: prod1.id,
            tipo_movimiento: InventoryMovementType::MermaDanio,
            cantidad: 25, // stock actual es 20
            costo_unitario_momento: None,
            motivo_justificacion: "Caja aplastada completamente rota".into(),
        },
    )
    .await;
    match err_stock_neg {
        Err(AppError::Validation(msg)) => {
            assert!(msg.contains("Stock insuficiente") || msg.contains("negativo"))
        }
        other => panic!("Esperaba AppError::Validation por stock insuficiente, obtuve: {:?}", other),
    }

    // 6. Registrar MERMA válida de 10 unidades (de 20 baja a 10)
    let mov_merma = catalog_service::record_inventory_movement(
        &state.pool(),
        &admin_session,
        RecordInventoryMovementInput {
            producto_id: prod1.id,
            tipo_movimiento: InventoryMovementType::Merma,
            cantidad: 10,
            costo_unitario_momento: None,
            motivo_justificacion: "10 botellas vencidas en bodega".into(),
        },
    )
    .await
    .expect("Registro de merma válida falló");

    assert_eq!(mov_merma.stock_anterior, 20);
    assert_eq!(mov_merma.stock_resultante, 10);
    assert_eq!(mov_merma.signo, "-");

    // 7. Registrar CONSUMO_INTERNO de 6 unidades (de 10 baja a 4)
    // Esto activa la alerta de stock bajo porque 4 <= stock_minimo (5)
    let mov_consumo = catalog_service::record_inventory_movement(
        &state.pool(),
        &admin_session,
        RecordInventoryMovementInput {
            producto_id: prod1.id,
            tipo_movimiento: InventoryMovementType::ConsumoInterno,
            cantidad: 6,
            costo_unitario_momento: None,
            motivo_justificacion: "Consumo de hidratación en evento aniversario del gym".into(),
        },
    )
    .await
    .expect("Registro de consumo interno falló");

    assert_eq!(mov_consumo.stock_anterior, 10);
    assert_eq!(mov_consumo.stock_resultante, 4);

    // 8. Consultar list_products y verificar alerta_stock_bajo = true
    let prods_alert = catalog_service::list_products(
        &state.pool(),
        &admin_session,
        &ProductFilter {
            solo_stock_bajo: Some(true),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(prods_alert.len(), 2, "Tanto prod1 (4 <= 5) como prod2 (0 <= 3) tienen alerta de stock bajo");
    let p1_alert = prods_alert.iter().find(|p| p.id == prod1.id).expect("prod1 debe estar en alerta");
    assert_eq!(p1_alert.stock_actual, 4);
    assert!(p1_alert.alerta_stock_bajo);
    let p2_alert = prods_alert.iter().find(|p| p.id == prod2.id).expect("prod2 debe estar en alerta");
    assert_eq!(p2_alert.stock_actual, 0);
    assert!(p2_alert.alerta_stock_bajo);

    // 9. Actualización segura de producto (update_product) no debe alterar el stock físico
    let prod_upd = catalog_service::update_product(
        &state.pool(),
        &admin_session,
        prod1.id,
        UpdateProductInput {
            codigo_sku: None,
            nombre: "Agua Mineral San Carlos 500ml".into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("BOTELLA".into()),
            precio_compra_referencial: Some(Decimal::from_str("1.30").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("3.00").unwrap(),
            stock_minimo: 5,
            proveedor_preferido_id: Some(prov.id),
        },
    )
    .await
    .unwrap();

    assert_eq!(prod_upd.nombre, "Agua Mineral San Carlos 500ml");
    assert_eq!(prod_upd.stock_actual, 4, "El stock no debe cambiar con update_product");
    assert_eq!(prod_upd.precio_venta, Decimal::from_str("3.00").unwrap());
}

// ============================================================================
// TEST 4: AUDITORÍA ESTRICTA SIN RUIDO (< 200 BYTES Y CERO AUDIT EN QUERIES)
// ============================================================================
#[tokio::test]
async fn test_slice3_strict_audit_without_noise_and_payload_limits() {
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

    // Contar logs antes de ejecutar consultas
    let logs_iniciales = audit_service::get_audit_logs(&state.pool(), &AuditFilter::default())
        .await
        .unwrap()
        .len();

    // Ejecutar todas las consultas de solo lectura de Slice 3
    let _ = catalog_service::list_plans(&state.pool(), &admin_session, &PlanFilter::default()).await.unwrap();
    let _ = catalog_service::preview_plan_expiration("2024-01-31", "MENSUALIDAD", 1).unwrap();
    let _ = catalog_service::list_products(&state.pool(), &admin_session, &ProductFilter::default()).await.unwrap();
    let _ = catalog_service::list_inventory_movements(&state.pool(), &admin_session, &InventoryMovementFilter::default()).await.unwrap();

    let logs_post_queries = audit_service::get_audit_logs(&state.pool(), &AuditFilter::default())
        .await
        .unwrap()
        .len();

    assert_eq!(
        logs_iniciales, logs_post_queries,
        "Las consultas de listado y cálculos matemáticos no deben generar NINGÚN registro de auditoría"
    );

    // Ejecutar mutaciones del Slice 3
    let plan = catalog_service::create_plan(
        &state.pool(),
        &admin_session,
        CreatePlanInput {
            codigo: "PLAN-AUDIT".into(),
            nombre: "Plan para probar auditoría".into(),
            descripcion: None,
            tipo_plan: PlanType::Mensualidad,
            duracion_meses: 1,
            precio_base: Decimal::from_str("75.00").unwrap(),
            permite_recuperacion_dias: false,
        },
    )
    .await
    .unwrap();

    let _ = catalog_service::update_plan(
        &state.pool(),
        &admin_session,
        plan.id,
        UpdatePlanInput {
            nombre: "Plan para probar auditoría editado".into(),
            descripcion: None,
            precio_base: Decimal::from_str("80.00").unwrap(),
            permite_recuperacion_dias: true,
        },
    )
    .await
    .unwrap();

    let _ = catalog_service::toggle_plan_active(&state.pool(), &admin_session, plan.id, false).await.unwrap();

    let prod = catalog_service::create_product(
        &state.pool(),
        &admin_session,
        CreateProductInput {
            codigo_sku: "PROD-AUDIT".into(),
            nombre: "Producto Auditoría".into(),
            categoria: ProductCategory::Snacks,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::from_str("2.00").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("5.00").unwrap(),
            stock_inicial: Some(10),
            stock_minimo: Some(2),
            proveedor_preferido_id: None,
        },
    )
    .await
    .unwrap();

    let _ = catalog_service::update_product(
        &state.pool(),
        &admin_session,
        prod.id,
        UpdateProductInput {
            codigo_sku: None,
            nombre: "Producto Auditoría Actualizado".into(),
            categoria: ProductCategory::Snacks,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::from_str("2.20").unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str("5.50").unwrap(),
            stock_minimo: 3,
            proveedor_preferido_id: None,
        },
    )
    .await
    .unwrap();

    let _ = catalog_service::toggle_product_active(&state.pool(), &admin_session, prod.id, false).await.unwrap();

    let _ = catalog_service::record_inventory_movement(
        &state.pool(),
        &admin_session,
        RecordInventoryMovementInput {
            producto_id: prod.id,
            tipo_movimiento: InventoryMovementType::Merma,
            cantidad: 2,
            costo_unitario_momento: None,
            motivo_justificacion: "Producto dañado en traslado".into(),
        },
    )
    .await
    .unwrap();

    // Obtener todos los logs del módulo CATALOGO_INVENTARIO
    let audit_logs = audit_service::get_audit_logs(
        &state.pool(),
        &AuditFilter {
            modulo: Some("CATALOGO_INVENTARIO".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert!(
        !audit_logs.is_empty(),
        "Debe haber registros de auditoría para las mutaciones"
    );

    for log in audit_logs {
        let len = log.detalles_json.len();
        assert!(
            len < 200,
            "El tamaño de detalles_json debe ser estrictamente menor a 200 bytes. Encontrado: {} bytes en acción '{}'",
            len,
            log.accion
        );
    }
}
