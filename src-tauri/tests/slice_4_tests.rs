use rust_decimal::Decimal;
use sqlx::Row;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    CashShiftState, ClientCreditFilter, ClientFilter, ClientMembershipFilter,
    ClientMembershipState, CloseCashShiftInput, CreateClientInput, CreatePosSaleInput,
    CreateProductInput, CreateUserInput, CreditOrigin, CreditState, LoginCredentials,
    OpenCashShiftInput, PaymentMethod, PosItemType, PosPaymentInput, PosSaleItemInput,
    ProductCategory, ResolveStruckAction, ResolveStruckSaleInput, SaleState, StrikeSaleInput,
    UserRole,
};
use zarama_gym_lib::services::{
    auth_service, catalog_service, entity_service, pos_service,
};
use zarama_gym_lib::state::AppState;

/// Helper para crear un entorno aislado con base de datos en archivo temporal
async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_slice4.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new(pool);
    (state, temp_dir)
}

async fn get_product_stock(pool: &sqlx::SqlitePool, prod_id: i64) -> i64 {
    let row = sqlx::query("SELECT stock_actual FROM productos WHERE id = ?")
        .bind(prod_id)
        .fetch_one(pool)
        .await
        .unwrap();
    row.get("stock_actual")
}

// ============================================================================
// CP-POS-01: APERTURA DE TURNO Y RESTRICCIÓN DE CONCURRENCIA
// ============================================================================
#[tokio::test]
async fn test_cp_pos_01_shift_opening_and_concurrency_lock() {
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

    // 1. Abrir primer turno con fondo 100.00
    let shift = pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(10000, 2), // 100.00
            notas_apertura: Some("Apertura mañana".into()),
        },
    )
    .await
    .expect("Apertura de turno debe ser exitosa");

    assert_eq!(shift.estado, CashShiftState::Abierto);
    assert_eq!(shift.monto_apertura_fisico, Decimal::new(10000, 2));
    assert_eq!(shift.total_efectivo_esperado, Decimal::new(10000, 2));
    assert_eq!(shift.total_ventas_efectivo, Decimal::ZERO);

    // 2. Segundo intento concurrente debe fallar con Conflict
    let second_shift_err = pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(5000, 2),
            notas_apertura: None,
        },
    )
    .await
    .expect_err("Debe rechazar segundo turno abierto concurrente");

    assert!(
        matches!(second_shift_err, AppError::Conflict(_)),
        "El error debe ser AppError::Conflict"
    );
}

// ============================================================================
// CP-POS-02: VENTA DE PRODUCTO EN EFECTIVO + KARDEX
// ============================================================================
#[tokio::test]
async fn test_cp_pos_02_cash_product_sale_and_kardex() {
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

    // Apertura de turno con 50.00
    pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(5000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    // Crear producto con stock inicial 10 a precio venta 3.00 y costo 1.50
    let prod = catalog_service::create_product(
        &state.pool(),
        &admin_session,
        CreateProductInput {
            codigo_sku: "AGUA-500".into(),
            nombre: "Agua Mineral 500ml".into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::new(150, 2)),
            costo_unitario: None,
            precio_venta: Decimal::new(300, 2),
            stock_minimo: Some(2),
            proveedor_preferido_id: None,
            stock_inicial: Some(10),
        },
    )
    .await
    .unwrap();

    // Venta de 2 botellas de agua: subtotal 6.00, pagado con billete de 10.00 (vuelto 4.00, retenido 6.00)
    let sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 2,
                precio_unitario: Decimal::new(300, 2),
                subtotal: Decimal::new(600, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(1000, 2), // paga con 10
                referencia_operacion: None,
            }],
            notas: Some("Venta rápida en mostrador".into()),
        },
    )
    .await
    .expect("Venta POS en efectivo debe procesarse");

    assert_eq!(sale.total_venta, Decimal::new(600, 2));
    assert_eq!(sale.monto_pagado_efectivo, Decimal::new(600, 2));
    assert_eq!(sale.monto_pagado_digital, Decimal::ZERO);
    assert_eq!(sale.saldo_credito_generado, Decimal::ZERO);
    assert_eq!(sale.estado_venta, SaleState::Completada);

    // Verificar stock descontado
    let stock_actual = get_product_stock(&state.pool(), prod.id).await;
    assert_eq!(stock_actual, 8, "Stock debe reducirse a 8");

    // Verificar kardex
    let movs = catalog_service::list_inventory_movements(
        &state.pool(),
        &admin_session,
        &zarama_gym_lib::models::InventoryMovementFilter {
            producto_id: Some(prod.id),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(movs.len(), 2);
    let salida = &movs[0]; // ordenado DESC
    assert_eq!(salida.tipo_movimiento, zarama_gym_lib::models::InventoryMovementType::SalidaVenta);
    assert_eq!(salida.signo, "-");
    assert_eq!(salida.cantidad, 2);
    assert_eq!(salida.stock_resultante, 8);

    // Verificar acumulados del turno
    let shift_act = pos_service::get_active_cash_shift(&state.pool(), &admin_session)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(shift_act.total_ventas_efectivo, Decimal::new(600, 2));
    assert_eq!(shift_act.total_efectivo_esperado, Decimal::new(5600, 2)); // 50 + 6
}

// ============================================================================
// CP-POS-03: VENTA CON MEDIO DIGITAL (YAPE) AISLADA DEL EFECTIVO
// ============================================================================
#[tokio::test]
async fn test_cp_pos_03_digital_sale_isolated_from_cash() {
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

    pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(5000, 2), // 50.00
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let prod = catalog_service::create_product(
        &state.pool(),
        &admin_session,
        CreateProductInput {
            codigo_sku: "BAR-PROT".into(),
            nombre: "Barra Proteica".into(),
            categoria: ProductCategory::Snacks,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::new(800, 2)),
            costo_unitario: None,
            precio_venta: Decimal::new(1500, 2),
            stock_minimo: Some(1),
            proveedor_preferido_id: None,
            stock_inicial: Some(5),
        },
    )
    .await
    .unwrap();

    // Venta de 1 barra por 15.00 con YAPE
    let sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::new(1500, 2),
                subtotal: Decimal::new(1500, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Yape,
                monto: Decimal::new(1500, 2),
                referencia_operacion: Some("OP-998877".into()),
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(sale.total_venta, Decimal::new(1500, 2));
    assert_eq!(sale.monto_pagado_efectivo, Decimal::ZERO);
    assert_eq!(sale.monto_pagado_digital, Decimal::new(1500, 2));

    // Turno de caja: total ventas digital = 15.00, desglose YAPE = 15.00, total_efectivo_esperado = 50.00 (INTACTO)
    let shift = pos_service::get_active_cash_shift(&state.pool(), &admin_session)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(shift.total_ventas_digital, Decimal::new(1500, 2));
    assert_eq!(shift.desglose_digital.yape, Decimal::new(1500, 2));
    assert_eq!(shift.total_efectivo_esperado, Decimal::new(5000, 2));
    assert_eq!(shift.total_ventas_efectivo, Decimal::ZERO);
}

// ============================================================================
// CP-POS-04: VENTA DE PLAN MENSUAL CON DAY OVERFLOW EN MEMBRESIAS_CLIENTES
// ============================================================================
#[tokio::test]
async fn test_cp_pos_04_membership_sale_day_overflow_active() {
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

    pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(2000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    // Crear cliente
    let client = entity_service::create_client(
        &state.pool(),
        &admin_session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("77665544".into()),
            nombres: Some("Mateo".into()),
            apellidos: Some("Gómez".into()),
            fecha_nacimiento: None,
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
        },
    )
    .await
    .unwrap();

    // Vender Membresía Mensual (Plan 2 de seed: 'PLAN-1M', duración 1 mes, precio 80.00)
    // Usamos fecha_inicio = '2024-01-31' para verificar Day Overflow canónico a '2024-03-02'
    let sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: Some(client.id),
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Plan,
                producto_id: None,
                plan_id: Some(2), // PLAN-1M mensualidad
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::new(8000, 2),
                subtotal: Decimal::new(8000, 2),
                fecha_inicio_plan: Some("2024-01-31".into()),
            }],
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(8000, 2),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(sale.total_venta, Decimal::new(8000, 2));

    // Verificar inserción en membresias_clientes
    let memberships = pos_service::list_client_memberships(
        &state.pool(),
        &admin_session,
        &ClientMembershipFilter {
            cliente_id: Some(client.id),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(memberships.len(), 1);
    let m = &memberships[0];
    assert_eq!(m.estado, ClientMembershipState::Activa);
    assert_eq!(m.fecha_inicio, "2024-01-31");
    assert_eq!(m.fecha_vencimiento, "2024-03-02", "Day Overflow debe proyectar al 2024-03-02");
    assert_eq!(m.precio_pactado, Decimal::new(8000, 2));
}

// ============================================================================
// CP-POS-05: PAGO PARCIAL Y GENERACIÓN AUTOMÁTICA DE CRÉDITO
// ============================================================================
#[tokio::test]
async fn test_cp_pos_05_partial_payment_automatic_credit_generation() {
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

    pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(2000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let client = entity_service::create_client(
        &state.pool(),
        &admin_session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("11223388".into()),
            nombres: Some("Valeria".into()),
            apellidos: Some("Deudora".into()),
            fecha_nacimiento: None,
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
        },
    )
    .await
    .unwrap();

    // Venta de plan de 80.00 pagando solo 50.00 en efectivo (falta 30.00 a crédito)
    let sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: Some(client.id),
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
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(5000, 2),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(sale.total_venta, Decimal::new(8000, 2));
    assert_eq!(sale.monto_pagado_efectivo, Decimal::new(5000, 2));
    assert_eq!(sale.saldo_credito_generado, Decimal::new(3000, 2));

    // Verificar en creditos_clientes
    let credits = pos_service::list_client_credits(
        &state.pool(),
        &admin_session,
        &ClientCreditFilter {
            cliente_id: Some(client.id),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(credits.len(), 1);
    let cred = &credits[0];
    assert_eq!(cred.origen_credito, CreditOrigin::MembresiaPagoParcial);
    assert_eq!(cred.monto_total, Decimal::new(8000, 2));
    assert_eq!(cred.monto_pagado, Decimal::new(5000, 2));
    assert_eq!(cred.saldo_pendiente, Decimal::new(3000, 2));
    assert_eq!(cred.estado, CreditState::Pendiente);
}

// ============================================================================
// CP-POS-06: AMORTIZACIÓN DE CRÉDITO EN POS
// ============================================================================
#[tokio::test]
async fn test_cp_pos_06_debt_amortization_in_pos() {
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

    pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(2000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let client = entity_service::create_client(
        &state.pool(),
        &admin_session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("99881122".into()),
            nombres: Some("Marcos".into()),
            apellidos: Some("Pérez".into()),
            fecha_nacimiento: None,
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: None,
        },
    )
    .await
    .unwrap();

    // 1. Generar venta parcial (crédito de 30.00)
    let _ = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: Some(client.id),
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
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(5000, 2),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    let creds = pos_service::list_client_credits(
        &state.pool(),
        &admin_session,
        &ClientCreditFilter {
            cliente_id: Some(client.id),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let cred_id = creds[0].id;

    // 2. Amortización del 100% de la deuda (30.00) en el POS
    let amort_sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: Some(client.id),
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::AmortizacionCredito,
                producto_id: None,
                plan_id: None,
                credito_id: Some(cred_id),
                cantidad: 1,
                precio_unitario: Decimal::new(3000, 2),
                subtotal: Decimal::new(3000, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(3000, 2),
                referencia_operacion: None,
            }],
            notas: Some("Pago total de deuda".into()),
        },
    )
    .await
    .expect("Amortización debe procesarse");

    assert_eq!(amort_sale.total_venta, Decimal::new(3000, 2));

    // 3. Verificar estado PAGADO y saldo 0.00
    let updated_creds = pos_service::list_client_credits(
        &state.pool(),
        &admin_session,
        &ClientCreditFilter {
            cliente_id: Some(client.id),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let c = &updated_creds[0];
    assert_eq!(c.estado, CreditState::Pagado);
    assert_eq!(c.saldo_pendiente, Decimal::ZERO);
    assert_eq!(c.monto_pagado, Decimal::new(8000, 2));

    // 4. Intentar amortizar a crédito debe fallar tajantemente
    let bad_amort_sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: Some(client.id),
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::AmortizacionCredito,
                producto_id: None,
                plan_id: None,
                credito_id: Some(cred_id),
                cantidad: 1,
                precio_unitario: Decimal::new(1000, 2),
                subtotal: Decimal::new(1000, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos: vec![], // sin pagos -> saldo a crédito
            notas: None,
        },
    )
    .await;

    assert!(bad_amort_sale.is_err(), "No se puede pagar a crédito una amortización");
}

// ============================================================================
// CP-POS-07: TACHADO PASO 1 EN TURNO ABIERTO (STRIKE_SALE)
// ============================================================================
#[tokio::test]
async fn test_cp_pos_07_strike_sale_step1_in_open_shift_reverts_all() {
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

    // Crear Recepcionista para verificar que tiene permiso de tachar en turno abierto
    let rec_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "recep1".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "44556677".into(),
            nombres: "Raquel".into(),
            apellidos: "Cajera".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    let rec_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "recep1".into(),
            password: "password123".into(),
        },
    )
    .await
    .unwrap();

    // Abrir turno con 100.00
    pos_service::open_cash_shift(
        &state.pool(),
        &rec_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(10000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let prod = catalog_service::create_product(
        &state.pool(),
        &admin_session,
        CreateProductInput {
            codigo_sku: "GATORADE".into(),
            nombre: "Gatorade Blue".into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::new(300, 2)),
            costo_unitario: None,
            precio_venta: Decimal::new(600, 2),
            stock_minimo: Some(1),
            proveedor_preferido_id: None,
            stock_inicial: Some(10),
        },
    )
    .await
    .unwrap();

    // Venta de 2 botellas por 12.00 en efectivo
    let sale = pos_service::create_pos_sale(
        &state.pool(),
        &rec_session,
        CreatePosSaleInput {
            cliente_id: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 2,
                precio_unitario: Decimal::new(600, 2),
                subtotal: Decimal::new(1200, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(1200, 2),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    // Verificar estado intermedio: stock en 8 y caja esperada en 112.00
    let p_mid_stock = get_product_stock(&state.pool(), prod.id).await;
    assert_eq!(p_mid_stock, 8);
    let s_mid = pos_service::get_active_cash_shift(&state.pool(), &rec_session).await.unwrap().unwrap();
    assert_eq!(s_mid.total_efectivo_esperado, Decimal::new(11200, 2));

    // Recepcionista ejecuta strike_sale con motivo >= 5 letras
    let struck = pos_service::strike_sale(
        &state.pool(),
        &rec_session,
        sale.id,
        StrikeSaleInput {
            motivo_tachado: "Error de cobro por parte de recepcionista".into(),
        },
    )
    .await
    .expect("Tachado en turno abierto debe permitirse");

    assert_eq!(struck.estado_venta, SaleState::TachadaEnTurno);
    assert_eq!(struck.tachado_por_usuario_id, Some(rec_user.id));
    assert!(struck.fecha_tachado.is_some());

    // Verificar reversión de stock a 10
    let p_rev_stock = get_product_stock(&state.pool(), prod.id).await;
    assert_eq!(p_rev_stock, 10, "Stock debe devolverse a 10");

    // Verificar movimiento REVERSION_TACHADO en kardex
    let movs = catalog_service::list_inventory_movements(
        &state.pool(),
        &admin_session,
        &zarama_gym_lib::models::InventoryMovementFilter {
            producto_id: Some(prod.id),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let rev_mov = &movs[0];
    assert_eq!(rev_mov.tipo_movimiento, zarama_gym_lib::models::InventoryMovementType::ReversionTachado);
    assert_eq!(rev_mov.signo, "+");
    assert_eq!(rev_mov.cantidad, 2);
    assert_eq!(rev_mov.stock_resultante, 10);

    // Verificar que la caja en vivo descontó el efectivo revertido
    let s_rev = pos_service::get_active_cash_shift(&state.pool(), &rec_session).await.unwrap().unwrap();
    assert_eq!(s_rev.total_efectivo_esperado, Decimal::new(10000, 2)); // volvió a 100
    assert_eq!(s_rev.total_ventas_efectivo, Decimal::ZERO);
}

// ============================================================================
// CP-POS-08: INTENTO DE TACHADO EN TURNO YA CERRADO BLOQUEADO
// ============================================================================
#[tokio::test]
async fn test_cp_pos_08_strike_sale_blocked_in_closed_shift() {
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

    pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(10000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let prod = catalog_service::create_product(
        &state.pool(),
        &admin_session,
        CreateProductInput {
            codigo_sku: "TOALLA".into(),
            nombre: "Toalla Entrenamiento".into(),
            categoria: ProductCategory::Accesorios,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::new(500, 2)),
            costo_unitario: None,
            precio_venta: Decimal::new(1000, 2),
            stock_minimo: Some(1),
            proveedor_preferido_id: None,
            stock_inicial: Some(5),
        },
    )
    .await
    .unwrap();

    let sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::new(1000, 2),
                subtotal: Decimal::new(1000, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(1000, 2),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    // Cerrar el turno de caja
    pos_service::close_cash_shift(
        &state.pool(),
        &admin_session,
        CloseCashShiftInput {
            monto_cierre_fisico_declarado: Decimal::new(11000, 2),
            notas_cierre: Some("Cierre correcto".into()),
        },
    )
    .await
    .unwrap();

    // Intentar tachar la venta del turno cerrado -> Rechazo tajante
    let err = pos_service::strike_sale(
        &state.pool(),
        &admin_session,
        sale.id,
        StrikeSaleInput {
            motivo_tachado: "Cliente solicita anulación tardía".into(),
        },
    )
    .await
    .expect_err("Debe rechazar tachado en turno cerrado");

    assert!(matches!(err, AppError::Validation(_)));
}

// ============================================================================
// CP-POS-09: TACHADO PASO 2: ADMIN CONFIRMACIÓN, RBAC Y REVERSIÓN
// ============================================================================
#[tokio::test]
async fn test_cp_pos_09_strike_step2_admin_confirm_rbac_and_revert() {
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

    // Crear Recepcionista
    let _rec_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "rec_pos".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "88990011".into(),
            nombres: "Sergio".into(),
            apellidos: "Recepcionista".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    let rec_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "rec_pos".into(),
            password: "password123".into(),
        },
    )
    .await
    .unwrap();

    pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(10000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let prod = catalog_service::create_product(
        &state.pool(),
        &admin_session,
        CreateProductInput {
            codigo_sku: "SHAKER".into(),
            nombre: "Shaker Zarama".into(),
            categoria: ProductCategory::Accesorios,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::new(1000, 2)),
            costo_unitario: None,
            precio_venta: Decimal::new(2000, 2),
            stock_minimo: Some(1),
            proveedor_preferido_id: None,
            stock_inicial: Some(5),
        },
    )
    .await
    .unwrap();

    let sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::new(2000, 2),
                subtotal: Decimal::new(2000, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(2000, 2),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    // Tachado Paso 1
    pos_service::strike_sale(
        &state.pool(),
        &admin_session,
        sale.id,
        StrikeSaleInput {
            motivo_tachado: "Venta por error de color".into(),
        },
    )
    .await
    .unwrap();

    // CP-POS-09B: Restricción RBAC -> Recepcionista intenta resolver tachado -> Forbidden
    let rec_err = pos_service::resolve_struck_sale(
        &state.pool(),
        &rec_session,
        sale.id,
        ResolveStruckSaleInput {
            accion: ResolveStruckAction::ConfirmarAnulacion,
            nota_resolucion: Some("Intento no autorizado".into()),
        },
    )
    .await
    .expect_err("Recepcionista no puede resolver tachados");
    assert!(matches!(rec_err, AppError::Forbidden(_)));

    // CP-POS-09C: Reversión de tachado por el Administrador (con turno abierto)
    let reverted_sale = pos_service::resolve_struck_sale(
        &state.pool(),
        &admin_session,
        sale.id,
        ResolveStruckSaleInput {
            accion: ResolveStruckAction::RevertirTachado,
            nota_resolucion: Some("Error subsanado, se reactiva venta".into()),
        },
    )
    .await
    .expect("Reversión de tachado por Admin debe completarse");

    assert_eq!(reverted_sale.estado_venta, SaleState::Completada);

    // Verificar que stock se descontó nuevamente a 4
    let p_rev_stock = get_product_stock(&state.pool(), prod.id).await;
    assert_eq!(p_rev_stock, 4);

    // Volver a tachar para probar Confirmación Definitiva (CP-POS-09A)
    pos_service::strike_sale(
        &state.pool(),
        &admin_session,
        sale.id,
        StrikeSaleInput {
            motivo_tachado: "Devolución definitiva por falla de fábrica".into(),
        },
    )
    .await
    .unwrap();

    // CP-POS-09A: Admin confirma anulación definitiva
    let confirmed_sale = pos_service::resolve_struck_sale(
        &state.pool(),
        &admin_session,
        sale.id,
        ResolveStruckSaleInput {
            accion: ResolveStruckAction::ConfirmarAnulacion,
            nota_resolucion: Some("Anulación auditada y aprobada por gerencia".into()),
        },
    )
    .await
    .expect("Confirmación definitiva debe completarse");

    assert_eq!(confirmed_sale.estado_venta, SaleState::AnuladaDefinitiva);
}

// ============================================================================
// CP-POS-10: CIERRE DE CAJA CON ARQUEO FÍSICO
// ============================================================================
#[tokio::test]
async fn test_cp_pos_10_shift_close_with_physical_audit_calculation() {
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

    // Apertura con 100.00
    pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(10000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let prod = catalog_service::create_product(
        &state.pool(),
        &admin_session,
        CreateProductInput {
            codigo_sku: "PROD-ARQUEO".into(),
            nombre: "Producto Arqueo".into(),
            categoria: ProductCategory::Otros,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::new(1000, 2)),
            costo_unitario: None,
            precio_venta: Decimal::new(5000, 2),
            stock_minimo: Some(1),
            proveedor_preferido_id: None,
            stock_inicial: Some(5),
        },
    )
    .await
    .unwrap();

    // Venta efectivo de 50.00 -> total esperado = 150.00
    pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::new(5000, 2),
                subtotal: Decimal::new(5000, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(5000, 2),
                referencia_operacion: None,
            }],
            notas: None,
        },
    )
    .await
    .unwrap();

    // Cierre declarando 140.00 (Faltante de 10.00)
    let closed_shift = pos_service::close_cash_shift(
        &state.pool(),
        &admin_session,
        CloseCashShiftInput {
            monto_cierre_fisico_declarado: Decimal::new(14000, 2),
            notas_cierre: Some("Faltante justificado por cambio".into()),
        },
    )
    .await
    .unwrap();

    assert_eq!(closed_shift.estado, CashShiftState::Cerrado);
    assert_eq!(closed_shift.total_efectivo_esperado, Decimal::new(15000, 2));
    assert_eq!(closed_shift.monto_cierre_fisico_declarado, Some(Decimal::new(14000, 2)));
    assert_eq!(
        closed_shift.diferencia_arqueo_fisico,
        Some(Decimal::new(-1000, 2)),
        "Diferencia debe ser -10.00 (faltante)"
    );
}

// ============================================================================
// CP-POS-11: VISIBILIDAD "CASO JUAN PÉREZ" EN POS
// ============================================================================
#[tokio::test]
async fn test_cp_pos_11_juan_perez_case_visibility_in_pos() {
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

    // 1. Crear al trabajador Juan Pérez con rol ADMINISTRADOR
    let juan_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "juan_admin".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "77889900".into(),
            nombres: "Juan".into(),
            apellidos: "Pérez".into(),
            telefono: Some("999111222".into()),
            email: Some("juan@gimnasio.com".into()),
            rol: UserRole::Administrador,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    // 2. Administrador inscribe a Juan Pérez en el catálogo de clientes
    let juan_client = entity_service::create_client(
        &state.pool(),
        &admin_session,
        CreateClientInput {
            persona_id: Some(juan_user.persona_id),
            tipo_documento: None,
            numero_documento: None,
            nombres: None,
            apellidos: None,
            fecha_nacimiento: None,
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: Some("Entrenamiento funcional".into()),
            peso_inicial_kg: None,
        },
    )
    .await
    .unwrap();

    // 3. Crear Recepcionista
    let _rec_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "recep_turno".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "66778899".into(),
            nombres: "Carla".into(),
            apellidos: "Recepcionista".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    let rec_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "recep_turno".into(),
            password: "password123".into(),
        },
    )
    .await
    .unwrap();

    // 4. Recepcionista lista clientes: Juan Pérez DEBE SER VISIBLE
    let clients = entity_service::list_clients(
        &state.pool(),
        &rec_session,
        &ClientFilter {
            search: Some("Pérez".into()),
            ..Default::default()
        },
    )
    .await
    .expect("Recepcionista debe poder listar clientes");

    assert!(
        clients.iter().any(|c| c.id == juan_client.id),
        "Juan Pérez (Administrador) debe aparecer en el listado de clientes para la recepcionista"
    );

    // 5. Recepcionista consulta detalle de Juan Pérez como cliente
    let client_detail = entity_service::get_client(&state.pool(), &rec_session, juan_client.id)
        .await
        .expect("Recepcionista debe poder consultar a Juan Pérez como cliente");
    assert_eq!(client_detail.numero_documento, "77889900");

    // 6. Recepcionista abre caja y realiza una venta en POS a nombre de Juan Pérez
    pos_service::open_cash_shift(
        &state.pool(),
        &rec_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(5000, 2),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    let sale_juan = pos_service::create_pos_sale(
        &state.pool(),
        &rec_session,
        CreatePosSaleInput {
            cliente_id: Some(juan_client.id),
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Plan,
                producto_id: None,
                plan_id: Some(1), // Pase Diario
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::new(1000, 2),
                subtotal: Decimal::new(1000, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::new(1000, 2),
                referencia_operacion: None,
            }],
            notas: Some("Pase diario para administrador que entrena".into()),
        },
    )
    .await
    .expect("Recepcionista debe poder procesar venta en POS a Juan Pérez");

    assert_eq!(sale_juan.cliente_id, Some(juan_client.id));
    assert_eq!(sale_juan.total_venta, Decimal::new(1000, 2));

    // 7. Verificación de blindaje RBAC: En el módulo maestro de Personas, Recepcionista NO puede ver los datos de Juan
    let person_check = entity_service::get_person(&state.pool(), &rec_session, juan_user.persona_id).await;
    assert!(
        matches!(person_check.unwrap_err(), AppError::Forbidden(_)),
        "Recepcionista NO debe tener acceso a Juan Pérez en el módulo maestro de Personas"
    );
}

// ============================================================================
// BLOQUEO DE LOGOUT CON TURNO DE CAJA ABIERTO (LOCK_SESSION PERMITIDO)
// ============================================================================
#[tokio::test]
async fn test_logout_blocked_with_open_cash_shift_and_lock_allowed() {
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

    // 1. Abrir turno de caja
    let shift = pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::new(10000, 2),
            notas_apertura: Some("Turno de prueba para bloqueo de logout".into()),
        },
    )
    .await
    .expect("Apertura de turno debe ser exitosa");

    // 2. Intentar cerrar sesión con turno abierto -> debe fallar con Validation
    let logout_err = auth_service::logout(&state.pool(), &state)
        .await
        .expect_err("Logout debe ser rechazado mientras exista un turno de caja ABIERTO");

    match logout_err {
        AppError::Validation(msg) => {
            assert!(
                msg.contains(&format!("#{}", shift.id)),
                "El mensaje debe mencionar el ID del turno abierto: {}",
                msg
            );
            assert!(
                msg.contains("ABIERTO"),
                "El mensaje debe indicar estado ABIERTO: {}",
                msg
            );
        }
        other => panic!("Se esperaba AppError::Validation, se obtuvo: {:?}", other),
    }

    // La sesión debe continuar activa en memoria
    assert!(
        auth_service::get_current_session(&state)
            .await
            .unwrap()
            .is_some()
    );

    // 3. Bloquear sesión temporalmente (lock_session) SÍ debe estar permitido
    auth_service::lock_session(&state.pool(), &state)
        .await
        .expect("lock_session debe estar permitido aunque haya un turno de caja abierto");

    let locked_session = auth_service::get_current_session(&state)
        .await
        .unwrap()
        .expect("La sesión bloqueada debe permanecer en memoria");
    assert!(locked_session.is_locked);

    // Incluso bloqueada, logout sigue bloqueado mientras el turno esté abierto
    let logout_while_locked_err = auth_service::logout(&state.pool(), &state)
        .await
        .expect_err("Logout bloqueado también si la sesión está bloqueada con turno abierto");
    assert!(matches!(logout_while_locked_err, AppError::Validation(_)));

    // 4. Desbloquear, cerrar turno de caja y luego cerrar sesión -> éxito
    let unlocked = auth_service::unlock_session(&state.pool(), &state, "admin123")
        .await
        .expect("Desbloqueo con contraseña correcta debe funcionar");
    assert!(!unlocked.is_locked);

    pos_service::close_cash_shift(
        &state.pool(),
        &unlocked,
        CloseCashShiftInput {
            monto_cierre_fisico_declarado: Decimal::new(10000, 2),
            notas_cierre: Some("Cierre previo a logout".into()),
        },
    )
    .await
    .expect("Cierre de turno debe ser exitoso");

    auth_service::logout(&state.pool(), &state)
        .await
        .expect("Logout debe permitirse después de cerrar el turno de caja");

    assert!(
        auth_service::get_current_session(&state)
            .await
            .unwrap()
            .is_none(),
        "La sesión en memoria debe quedar vacía tras logout exitoso"
    );
}
