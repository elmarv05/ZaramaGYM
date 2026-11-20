use rust_decimal::Decimal;
use sqlx::Row;
use std::str::FromStr;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AuthSession, CancelSupplierPurchaseDto, CreateClientInput, CreateCompanyInput,
    CreateExpenseDto, CreatePosSaleInput, CreateProductInput, CreateSupplierInput,
    CreateSupplierPurchaseDetailDto, CreateSupplierPurchaseDto, CreateUserInput,
    ExpenseCategory, ExpenseFilter, FinancialReportFilter, OpenCashShiftInput,
    PaymentChannel, PaymentMethod, PosItemType, PosPaymentInput, PosSaleItemInput,
    ProductCategory, PurchaseInvoiceType, StrikeSaleInput, StruckSaleFilter, SupplierType,
    UpdateExpenseDto, UserRole,
};
use zarama_gym_lib::services::{
    auth_service, catalog_service, entity_service, finance_service, pos_service,
};
use zarama_gym_lib::state::AppState;

/// Helper para crear un entorno aislado con base de datos en archivo temporal
async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_slice7.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new(pool);
    (state, temp_dir)
}

/// Helper para crear usuario recepcionista para pruebas de RBAC
async fn create_auxiliary_receptionist(
    state: &AppState,
    _admin_session: &AuthSession,
) -> AuthSession {
    let _ = auth_service::create_user(
        &state.pool(),
        state,
        CreateUserInput {
            persona_id: None,
            username: "recep1".into(),
            password: "Password123!".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "33334444".into(),
            nombres: "Ana".into(),
            apellidos: "Recepción".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    auth_service::login(
        &state.pool(),
        state,
        zarama_gym_lib::models::LoginCredentials {
            username: "recep1".into(),
            password: "Password123!".into(),
        },
    )
    .await
    .unwrap()
}

/// Helper para crear un proveedor polimórfico de tipo EMPRESA
async fn create_test_supplier(state: &AppState, session: &AuthSession) -> i64 {
    let company = entity_service::create_company(
        &state.pool(),
        session,
        CreateCompanyInput {
            ruc: "20601234567".into(),
            razon_social: "Distribuidora Fitness S.A.C.".into(),
            nombre_comercial: Some("FitDist".into()),
            direccion: Some("Av. Deporte 123".into()),
            telefono: Some("987654321".into()),
            email: Some("contacto@fitdist.pe".into()),
        },
    )
    .await
    .unwrap();

    let supplier = entity_service::create_supplier(
        &state.pool(),
        session,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::Empresa,
            persona_id: None,
            empresa_id: Some(company.id),
            persona_data: None,
            empresa_data: None,
            rubro_o_categoria: Some("Suplementos".into()),
            contacto_referencia: Some("Mario".into()),
        },
    )
    .await
    .unwrap();

    supplier.id
}

/// Helper para crear un producto con stock y precio dado
async fn create_test_product(
    state: &AppState,
    session: &AuthSession,
    sku: &str,
    nombre: &str,
    stock_inicial: i64,
    costo_ref: &str,
    precio_venta: &str,
) -> i64 {
    let prod = catalog_service::create_product(
        &state.pool(),
        session,
        CreateProductInput {
            codigo_sku: sku.into(),
            nombre: nombre.into(),
            categoria: ProductCategory::Bebidas,
            unidad_medida: Some("UNIDAD".into()),
            precio_compra_referencial: Some(Decimal::from_str(costo_ref).unwrap()),
            costo_unitario: None,
            precio_venta: Decimal::from_str(precio_venta).unwrap(),
            stock_minimo: Some(2),
            proveedor_preferido_id: None,
            stock_inicial: Some(stock_inicial),
        },
    )
    .await
    .unwrap();

    prod.id
}

// ============================================================================
// CP-FIN-01: CREACIÓN VÁLIDA DE COMPRA A PROVEEDOR
// ============================================================================
#[tokio::test]
async fn test_cp_fin_01_valid_supplier_purchase_creation() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let prov_id = create_test_supplier(&state, &admin_session).await;
    let prod_id = create_test_product(
        &state,
        &admin_session,
        "BEB-ISOTONICA",
        "Bebida Isotónica 500ml",
        10,
        "15.00",
        "25.00",
    )
    .await;

    // Compra de 5 unidades a costo S/ 20.00 en EFECTIVO (Canal FÍSICA) -> Total S/ 100.00
    let purchase = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Factura,
            numero_comprobante: Some("F001-000123".into()),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("100.00").unwrap(),
            fecha_compra: None,
            notas: Some("Compra lote inicial".into()),
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 5,
                costo_unitario: Decimal::from_str("20.00").unwrap(),
                subtotal: Decimal::from_str("100.00").unwrap(),
            }],
        },
    )
    .await
    .expect("La compra debe crearse exitosamente");

    assert_eq!(purchase.purchase.total_compra, Decimal::from_str("100.00").unwrap());
    assert_eq!(purchase.purchase.estado_activo, 1);
    assert_eq!(purchase.items.len(), 1);
    assert_eq!(purchase.items[0].cantidad, 5);

    // 1. Stock se incrementa de 10 a 15
    let prod_row = sqlx::query("SELECT stock_actual, precio_compra_referencial FROM productos WHERE id = ?")
        .bind(prod_id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    let stock_actual: i64 = prod_row.get("stock_actual");
    assert_eq!(stock_actual, 15);

    // 2. Movimiento Kardex ENTRADA_COMPRA con signo '+'
    let mov_row = sqlx::query(
        "SELECT tipo_movimiento, signo, cantidad, stock_anterior, stock_resultante FROM inventario_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1"
    )
    .bind(prod_id)
    .fetch_one(&state.pool())
    .await
    .unwrap();

    let tipo_mov: String = mov_row.get("tipo_movimiento");
    let signo: String = mov_row.get("signo");
    let cantidad: i64 = mov_row.get("cantidad");
    let stock_ant: i64 = mov_row.get("stock_anterior");
    let stock_res: i64 = mov_row.get("stock_resultante");

    assert_eq!(tipo_mov, "ENTRADA_COMPRA");
    assert_eq!(signo, "+");
    assert_eq!(cantidad, 5);
    assert_eq!(stock_ant, 10);
    assert_eq!(stock_res, 15);
}

// ============================================================================
// CP-FIN-02: ACTUALIZACIÓN DE PRECIO DE COMPRA REFERENCIAL
// ============================================================================
#[tokio::test]
async fn test_cp_fin_02_update_reference_cost() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let prov_id = create_test_supplier(&state, &admin_session).await;
    let prod_id = create_test_product(
        &state,
        &admin_session,
        "PROT-WHEY",
        "Proteína Whey 1kg",
        5,
        "15.00",
        "40.00",
    )
    .await;

    // Compra con nuevo costo unitario 22.50
    let _ = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Boleta,
            numero_comprobante: Some("B001-998".into()),
            metodo_pago: PaymentMethod::Transferencia,
            canal_caja: PaymentChannel::Digital,
            total_compra: Decimal::from_str("45.00").unwrap(),
            fecha_compra: None,
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 2,
                costo_unitario: Decimal::from_str("22.50").unwrap(),
                subtotal: Decimal::from_str("45.00").unwrap(),
            }],
        },
    )
    .await
    .unwrap();

    let prod_row = sqlx::query("SELECT CAST(precio_compra_referencial AS TEXT) AS costo_ref FROM productos WHERE id = ?")
        .bind(prod_id)
        .fetch_one(&state.pool())
        .await
        .unwrap();

    let costo_ref_str: String = prod_row.get("costo_ref");
    let costo_ref = Decimal::from_str(&costo_ref_str).unwrap();
    assert_eq!(costo_ref, Decimal::from_str("22.50").unwrap());
}

// ============================================================================
// CP-FIN-03: RECHAZO DE COMPRA CON DATOS INCONSISTENTES
// ============================================================================
#[tokio::test]
async fn test_cp_fin_03_reject_inconsistent_purchase_data() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let prov_id = create_test_supplier(&state, &admin_session).await;
    let prod_id = create_test_product(
        &state,
        &admin_session,
        "BAR-ENER",
        "Barra Energética",
        10,
        "5.00",
        "8.00",
    )
    .await;

    // 1. Inconsistencia subtotal != cantidad * costo (2 * 5.00 != 15.00)
    let res1 = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Recibo,
            numero_comprobante: None,
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("15.00").unwrap(),
            fecha_compra: None,
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 2,
                costo_unitario: Decimal::from_str("5.00").unwrap(),
                subtotal: Decimal::from_str("15.00").unwrap(),
            }],
        },
    )
    .await;
    assert!(matches!(res1, Err(AppError::Validation(_))));

    // 2. Vector de detalles vacío
    let res2 = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::SinComprobante,
            numero_comprobante: None,
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("10.00").unwrap(),
            fecha_compra: None,
            notas: None,
            detalles: vec![],
        },
    )
    .await;
    assert!(matches!(res2, Err(AppError::Validation(_))));

    // Stock sigue siendo 10
    let prod_row = sqlx::query("SELECT stock_actual FROM productos WHERE id = ?")
        .bind(prod_id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    let stock: i64 = prod_row.get("stock_actual");
    assert_eq!(stock, 10);
}

// ============================================================================
// CP-FIN-04: RECHAZO POR INCOMPATIBILIDAD CANAL / MÉTODO
// ============================================================================
#[tokio::test]
async fn test_cp_fin_04_reject_channel_payment_method_mismatch() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let prov_id = create_test_supplier(&state, &admin_session).await;
    let prod_id = create_test_product(
        &state,
        &admin_session,
        "PROD-TEST",
        "Producto Test",
        5,
        "10.00",
        "20.00",
    )
    .await;

    // EFECTIVO con canal DIGITAL
    let res1 = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Boleta,
            numero_comprobante: None,
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Digital,
            total_compra: Decimal::from_str("10.00").unwrap(),
            fecha_compra: None,
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 1,
                costo_unitario: Decimal::from_str("10.00").unwrap(),
                subtotal: Decimal::from_str("10.00").unwrap(),
            }],
        },
    )
    .await;
    assert!(matches!(res1, Err(AppError::Validation(_))));

    // YAPE con canal FISICA
    let res2 = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Boleta,
            numero_comprobante: None,
            metodo_pago: PaymentMethod::Yape,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("10.00").unwrap(),
            fecha_compra: None,
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 1,
                costo_unitario: Decimal::from_str("10.00").unwrap(),
                subtotal: Decimal::from_str("10.00").unwrap(),
            }],
        },
    )
    .await;
    assert!(matches!(res2, Err(AppError::Validation(_))));
}

// ============================================================================
// CP-FIN-05: ANULACIÓN DE COMPRA EXITOSA POR ADMIN
// ============================================================================
#[tokio::test]
async fn test_cp_fin_05_admin_cancel_supplier_purchase_success() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let prov_id = create_test_supplier(&state, &admin_session).await;
    let prod_id = create_test_product(
        &state,
        &admin_session,
        "CREATINA",
        "Creatina Monohidratada 300g",
        10,
        "30.00",
        "50.00",
    )
    .await;

    // Compra 5 unidades -> stock sube a 15
    let purchase = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Factura,
            numero_comprobante: Some("F001-55".into()),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("150.00").unwrap(),
            fecha_compra: None,
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 5,
                costo_unitario: Decimal::from_str("30.00").unwrap(),
                subtotal: Decimal::from_str("150.00").unwrap(),
            }],
        },
    )
    .await
    .unwrap();

    // Admin anula la compra con motivo >= 5 caracteres
    let cancelled = finance_service::cancel_supplier_purchase(
        &state.pool(),
        &admin_session,
        purchase.purchase.id,
        CancelSupplierPurchaseDto {
            motivo_anulacion: "Mercadería llegó con empaque dañado".into(),
        },
    )
    .await
    .expect("Anulación debe ser exitosa");

    assert_eq!(cancelled.purchase.estado_activo, 0);
    assert_eq!(
        cancelled.purchase.motivo_anulacion,
        Some("Mercadería llegó con empaque dañado".into())
    );

    // Stock vuelve a ser 10
    let prod_row = sqlx::query("SELECT stock_actual FROM productos WHERE id = ?")
        .bind(prod_id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    let stock: i64 = prod_row.get("stock_actual");
    assert_eq!(stock, 10);

    // Movimiento Kardex de reversión
    let mov_row = sqlx::query(
        "SELECT tipo_movimiento, signo, cantidad, stock_anterior, stock_resultante FROM inventario_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1"
    )
    .bind(prod_id)
    .fetch_one(&state.pool())
    .await
    .unwrap();

    let tipo_mov: String = mov_row.get("tipo_movimiento");
    let signo: String = mov_row.get("signo");
    let cantidad: i64 = mov_row.get("cantidad");
    let stock_ant: i64 = mov_row.get("stock_anterior");
    let stock_res: i64 = mov_row.get("stock_resultante");

    assert_eq!(tipo_mov, "AJUSTE_NEGATIVO");
    assert_eq!(signo, "-");
    assert_eq!(cantidad, 5);
    assert_eq!(stock_ant, 15);
    assert_eq!(stock_res, 10);
}

// ============================================================================
// CP-FIN-06: RECHAZO DE ANULACIÓN POR STOCK INSUFICIENTE
// ============================================================================
#[tokio::test]
async fn test_cp_fin_06_reject_cancellation_when_stock_insufficient() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let prov_id = create_test_supplier(&state, &admin_session).await;
    let prod_id = create_test_product(
        &state,
        &admin_session,
        "PROT-SNACK",
        "Snack Proteico",
        0,
        "5.00",
        "10.00",
    )
    .await;

    // Compra 10 unidades -> stock 10
    let purchase = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Boleta,
            numero_comprobante: None,
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("50.00").unwrap(),
            fecha_compra: None,
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 10,
                costo_unitario: Decimal::from_str("5.00").unwrap(),
                subtotal: Decimal::from_str("50.00").unwrap(),
            }],
        },
    )
    .await
    .unwrap();

    // Se consumen o venden 6 unidades, quedando solo 4
    sqlx::query("UPDATE productos SET stock_actual = 4 WHERE id = ?")
        .bind(prod_id)
        .execute(&state.pool())
        .await
        .unwrap();

    // Intentar anular la compra de 10 unidades
    let res = finance_service::cancel_supplier_purchase(
        &state.pool(),
        &admin_session,
        purchase.purchase.id,
        CancelSupplierPurchaseDto {
            motivo_anulacion: "Error en registro de compra".into(),
        },
    )
    .await;

    assert!(matches!(res, Err(AppError::Validation(_))));

    // La compra sigue activa
    let cp_row = sqlx::query("SELECT estado_activo FROM compras_proveedores WHERE id = ?")
        .bind(purchase.purchase.id)
        .fetch_one(&state.pool())
        .await
        .unwrap();
    let estado: i64 = cp_row.get("estado_activo");
    assert_eq!(estado, 1);
}

// ============================================================================
// CP-FIN-07: CONTROL DE ACCESO EN ANULACIÓN DE COMPRA
// ============================================================================
#[tokio::test]
async fn test_cp_fin_07_rbac_cancel_purchase_restricted_to_admin() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let recep_session = create_auxiliary_receptionist(&state, &admin_session).await;
    let prov_id = create_test_supplier(&state, &admin_session).await;
    let prod_id = create_test_product(
        &state,
        &admin_session,
        "PROD-RBAC",
        "Producto RBAC",
        10,
        "10.00",
        "20.00",
    )
    .await;

    let purchase = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Boleta,
            numero_comprobante: None,
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("10.00").unwrap(),
            fecha_compra: None,
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 1,
                costo_unitario: Decimal::from_str("10.00").unwrap(),
                subtotal: Decimal::from_str("10.00").unwrap(),
            }],
        },
    )
    .await
    .unwrap();

    // 1. Recepcionista puede consultar/crear compras, pero NO anularlas (Exclusivo Admin)
    let res_recep = finance_service::cancel_supplier_purchase(
        &state.pool(),
        &recep_session,
        purchase.purchase.id,
        CancelSupplierPurchaseDto {
            motivo_anulacion: "Anulación por recepcionista no autorizada".into(),
        },
    )
    .await;
    assert!(matches!(res_recep, Err(AppError::Forbidden(_))));

    let res_recep_detail = finance_service::get_supplier_purchase_detail(
        &state.pool(),
        &recep_session,
        purchase.purchase.id,
    )
    .await;
    assert!(res_recep_detail.is_ok(), "Recepcionista debe poder ver detalle de compras");

    let res_recep_create = finance_service::create_supplier_purchase(
        &state.pool(),
        &recep_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Boleta,
            numero_comprobante: None,
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("10.00").unwrap(),
            fecha_compra: None,
            notas: Some("Compra registrada por recepción".into()),
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 1,
                costo_unitario: Decimal::from_str("10.00").unwrap(),
                subtotal: Decimal::from_str("10.00").unwrap(),
            }],
        },
    )
    .await;
    assert!(res_recep_create.is_ok(), "Recepcionista debe poder crear compras a proveedores");
}

// ============================================================================
// CP-FIN-08: CRUD Y TOGGLE DE GASTO OPERATIVO POR ADMIN
// ============================================================================
#[tokio::test]
async fn test_cp_fin_08_crud_and_toggle_operational_expense_by_admin() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // 1. Crear Gasto Operativo
    let expense = finance_service::create_operational_expense(
        &state.pool(),
        &admin_session,
        CreateExpenseDto {
            categoria: ExpenseCategory::Alquiler,
            descripcion: "Pago de Alquiler de Local Principal - Noviembre".into(),
            monto: Decimal::from_str("350.00").unwrap(),
            metodo_pago: PaymentMethod::Transferencia,
            canal_caja: PaymentChannel::Digital,
            turno_caja_id: None,
            comprobante_referencia: Some("TR-998877".into()),
            fecha_gasto: None,
            notas: Some("Pago puntual".into()),
        },
    )
    .await
    .expect("Gasto operativo creado por admin");

    assert_eq!(expense.categoria, ExpenseCategory::Alquiler);
    assert_eq!(expense.monto, Decimal::from_str("350.00").unwrap());
    assert_eq!(expense.estado_activo, 1);

    // 2. Actualizar Gasto Operativo
    let updated = finance_service::update_operational_expense(
        &state.pool(),
        &admin_session,
        expense.id,
        UpdateExpenseDto {
            categoria: ExpenseCategory::Alquiler,
            descripcion: "Pago de Alquiler Local Principal - Noviembre Ajustado".into(),
            monto: Decimal::from_str("380.00").unwrap(),
            metodo_pago: PaymentMethod::Transferencia,
            canal_caja: PaymentChannel::Digital,
            turno_caja_id: None,
            comprobante_referencia: Some("TR-998877-B".into()),
            fecha_gasto: None,
            notas: Some("Ajuste por cochera".into()),
        },
    )
    .await
    .unwrap();

    assert_eq!(updated.monto, Decimal::from_str("380.00").unwrap());
    assert_eq!(
        updated.descripcion,
        "Pago de Alquiler Local Principal - Noviembre Ajustado"
    );

    // 3. Alternar estado activo (1 -> 0 -> 1)
    let toggled_off = finance_service::toggle_operational_expense_active(
        &state.pool(),
        &admin_session,
        expense.id,
    )
    .await
    .unwrap();
    assert_eq!(toggled_off.estado_activo, 0);

    let toggled_on = finance_service::toggle_operational_expense_active(
        &state.pool(),
        &admin_session,
        expense.id,
    )
    .await
    .unwrap();
    assert_eq!(toggled_on.estado_activo, 1);
}

// ============================================================================
// CP-FIN-09: BLINDAJE RBAC DE GASTOS OPERATIVOS
// ============================================================================
#[tokio::test]
async fn test_cp_fin_09_rbac_shield_operational_expenses() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let recep_session = create_auxiliary_receptionist(&state, &admin_session).await;

    // Crear un gasto previo por Admin
    let expense = finance_service::create_operational_expense(
        &state.pool(),
        &admin_session,
        CreateExpenseDto {
            categoria: ExpenseCategory::LimpiezaInsumos,
            descripcion: "Detergentes y desinfectantes".into(),
            monto: Decimal::from_str("60.00").unwrap(),
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            turno_caja_id: None,
            comprobante_referencia: None,
            fecha_gasto: None,
            notas: None,
        },
    )
    .await
    .unwrap();

    // Gastos operativos 100% exclusivos de ADMINISTRADOR; bandeja de tachados y dashboard financiero habilitados para RECEPCIONISTA
    assert!(matches!(
        finance_service::create_operational_expense(
            &state.pool(),
            &recep_session,
            CreateExpenseDto {
                categoria: ExpenseCategory::Otros,
                descripcion: "Gasto no permitido".into(),
                monto: Decimal::from_str("20.00").unwrap(),
                metodo_pago: PaymentMethod::Efectivo,
                canal_caja: PaymentChannel::Fisica,
                turno_caja_id: None,
                comprobante_referencia: None,
                fecha_gasto: None,
                notas: None,
            }
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    assert!(matches!(
        finance_service::list_operational_expenses(
            &state.pool(),
            &recep_session,
            &ExpenseFilter::default()
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    assert!(matches!(
        finance_service::update_operational_expense(
            &state.pool(),
            &recep_session,
            expense.id,
            UpdateExpenseDto {
                categoria: ExpenseCategory::LimpiezaInsumos,
                descripcion: "Intento update".into(),
                monto: Decimal::from_str("60.00").unwrap(),
                metodo_pago: PaymentMethod::Efectivo,
                canal_caja: PaymentChannel::Fisica,
                turno_caja_id: None,
                comprobante_referencia: None,
                fecha_gasto: None,
                notas: None,
            }
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    assert!(matches!(
        finance_service::toggle_operational_expense_active(
            &state.pool(),
            &recep_session,
            expense.id
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    assert!(
        finance_service::list_struck_sales_tray(
            &state.pool(),
            &recep_session,
            &StruckSaleFilter::default()
        )
        .await
        .is_ok(),
        "Recepcionista debe poder visualizar la bandeja global de tachados"
    );

    assert!(
        finance_service::get_financial_dashboard_summary(
            &state.pool(),
            &recep_session,
            &FinancialReportFilter::default()
        )
        .await
        .is_ok(),
        "Recepcionista debe poder consultar el dashboard financiero"
    );
}

// ============================================================================
// CP-FIN-10: BANDEJA DE CONFIRMACIÓN DEFINITIVA DE TACHADOS
// ============================================================================
#[tokio::test]
async fn test_cp_fin_10_struck_sales_tray() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let prod_id = create_test_product(
        &state,
        &admin_session,
        "PROD-POS",
        "Producto POS",
        20,
        "10.00",
        "25.00",
    )
    .await;

    // Abrir turno
    let shift = pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("100.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    // Crear venta POS
    let sale = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: None,
            descuento: None,
            notas: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod_id),
                plan_id: None,
                credito_id: None,
                cantidad: 2,
                precio_unitario: Decimal::from_str("25.00").unwrap(),
                subtotal: Decimal::from_str("50.00").unwrap(),
                fecha_inicio_plan: None,
            }],
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::from_str("50.00").unwrap(),
                referencia_operacion: None,
            }],
        },
    )
    .await
    .unwrap();

    // Tachar la venta en turno
    let _ = pos_service::strike_sale(
        &state.pool(),
        &admin_session,
        sale.id,
        StrikeSaleInput {
            motivo_tachado: "Cliente se equivocó de producto".into(),
        },
    )
    .await
    .unwrap();

    // Consultar bandeja de tachados
    let tray = finance_service::list_struck_sales_tray(
        &state.pool(),
        &admin_session,
        &StruckSaleFilter::default(),
    )
    .await
    .unwrap();

    assert!(!tray.is_empty());
    let item = tray.iter().find(|t| t.id == sale.id).expect("Venta debe estar en bandeja");
    assert_eq!(item.turno_caja_id, shift.id);
    assert_eq!(item.turno_estado, "ABIERTO");
    assert_eq!(item.estado_venta, "TACHADA_EN_TURNO");
    assert_eq!(item.usuario_vendedor_username, "admin");
    assert_eq!(item.tachado_por_username, Some("admin".into()));
    assert_eq!(item.motivo_tachado, Some("Cliente se equivocó de producto".into()));
    assert_eq!(item.cliente_nombre_completo, Some("CLIENTE GENERAL".into()));
}

// ============================================================================
// CP-FIN-11: AGREGACIONES FINANCIERAS: FÍSICA VS DIGITAL VS MIXTA
// ============================================================================
#[tokio::test]
async fn test_cp_fin_11_financial_dashboard_aggregations_fisica_digital_mixta() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let prov_id = create_test_supplier(&state, &admin_session).await;
    let prod_id = create_test_product(
        &state,
        &admin_session,
        "PROD-FIN",
        "Producto Finanzas",
        100,
        "10.00",
        "20.00",
    )
    .await;

    // 1. Abrir turno
    let _ = pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("100.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    // 2. Venta 1: EFECTIVO S/ 500.00
    let _ = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: None,
            descuento: None,
            notas: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod_id),
                plan_id: None,
                credito_id: None,
                cantidad: 25,
                precio_unitario: Decimal::from_str("20.00").unwrap(),
                subtotal: Decimal::from_str("500.00").unwrap(),
                fecha_inicio_plan: None,
            }],
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Efectivo,
                monto: Decimal::from_str("500.00").unwrap(),
                referencia_operacion: None,
            }],
        },
    )
    .await
    .unwrap();

    // 3. Venta 2: YAPE S/ 300.00
    let _ = pos_service::create_pos_sale(
        &state.pool(),
        &admin_session,
        CreatePosSaleInput {
            cliente_id: None,
            descuento: None,
            notas: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod_id),
                plan_id: None,
                credito_id: None,
                cantidad: 15,
                precio_unitario: Decimal::from_str("20.00").unwrap(),
                subtotal: Decimal::from_str("300.00").unwrap(),
                fecha_inicio_plan: None,
            }],
            pagos: vec![PosPaymentInput {
                metodo_pago: PaymentMethod::Yape,
                monto: Decimal::from_str("300.00").unwrap(),
                referencia_operacion: Some("OP-YAPE-300".into()),
            }],
        },
    )
    .await
    .unwrap();

    // 4. Compra a proveedor: EFECTIVO S/ 100.00
    let _ = finance_service::create_supplier_purchase(
        &state.pool(),
        &admin_session,
        CreateSupplierPurchaseDto {
            proveedor_id: prov_id,
            turno_caja_id: None,
            tipo_comprobante: PurchaseInvoiceType::Boleta,
            numero_comprobante: None,
            metodo_pago: PaymentMethod::Efectivo,
            canal_caja: PaymentChannel::Fisica,
            total_compra: Decimal::from_str("100.00").unwrap(),
            fecha_compra: None,
            notas: None,
            detalles: vec![CreateSupplierPurchaseDetailDto {
                producto_id: prod_id,
                cantidad: 10,
                costo_unitario: Decimal::from_str("10.00").unwrap(),
                subtotal: Decimal::from_str("100.00").unwrap(),
            }],
        },
    )
    .await
    .unwrap();

    // 5. Gasto operativo: YAPE S/ 50.00 (SERVICIOS_BASICOS)
    let _ = finance_service::create_operational_expense(
        &state.pool(),
        &admin_session,
        CreateExpenseDto {
            categoria: ExpenseCategory::ServiciosBasicos,
            descripcion: "Pago de internet fibra".into(),
            monto: Decimal::from_str("50.00").unwrap(),
            metodo_pago: PaymentMethod::Yape,
            canal_caja: PaymentChannel::Digital,
            turno_caja_id: None,
            comprobante_referencia: None,
            fecha_gasto: None,
            notas: None,
        },
    )
    .await
    .unwrap();

    // 6. Consultar resumen financiero
    let dashboard = finance_service::get_financial_dashboard_summary(
        &state.pool(),
        &admin_session,
        &FinancialReportFilter::default(),
    )
    .await
    .unwrap();

    // FÍSICA: Ingresos 500, Compras 100, Gastos 0, Total Egresos 100, Flujo Neto +400
    assert_eq!(dashboard.fisica.ingresos_ventas, Decimal::from_str("500.00").unwrap());
    assert_eq!(dashboard.fisica.egresos_compras, Decimal::from_str("100.00").unwrap());
    assert_eq!(dashboard.fisica.egresos_gastos, Decimal::ZERO);
    assert_eq!(dashboard.fisica.total_egresos, Decimal::from_str("100.00").unwrap());
    assert_eq!(dashboard.fisica.flujo_neto, Decimal::from_str("400.00").unwrap());

    // DIGITAL: Ingresos 300, Compras 0, Gastos 50, Total Egresos 50, Flujo Neto +250
    assert_eq!(dashboard.digital.ingresos_ventas, Decimal::from_str("300.00").unwrap());
    assert_eq!(dashboard.digital.egresos_compras, Decimal::ZERO);
    assert_eq!(dashboard.digital.egresos_gastos, Decimal::from_str("50.00").unwrap());
    assert_eq!(dashboard.digital.total_egresos, Decimal::from_str("50.00").unwrap());
    assert_eq!(dashboard.digital.flujo_neto, Decimal::from_str("250.00").unwrap());

    // MIXTA: Ingresos 800, Compras 100, Gastos 50, Total Egresos 150, Flujo Neto +650
    assert_eq!(dashboard.mixta.ingresos_ventas, Decimal::from_str("800.00").unwrap());
    assert_eq!(dashboard.mixta.egresos_compras, Decimal::from_str("100.00").unwrap());
    assert_eq!(dashboard.mixta.egresos_gastos, Decimal::from_str("50.00").unwrap());
    assert_eq!(dashboard.mixta.total_egresos, Decimal::from_str("150.00").unwrap());
    assert_eq!(dashboard.mixta.flujo_neto, Decimal::from_str("650.00").unwrap());

    // Desgloses digitales
    assert_eq!(dashboard.desglose_digital_ingresos.yape, Decimal::from_str("300.00").unwrap());
    assert_eq!(dashboard.desglose_digital_ingresos.total, Decimal::from_str("300.00").unwrap());
    assert_eq!(dashboard.desglose_digital_gastos.yape, Decimal::from_str("50.00").unwrap());
    assert_eq!(dashboard.desglose_digital_gastos.total, Decimal::from_str("50.00").unwrap());
}

// ============================================================================
// CP-FIN-12: INDICADORES DE CONTROL DE CUENTAS POR COBRAR Y TACHADOS
// ============================================================================
#[tokio::test]
async fn test_cp_fin_12_financial_control_indicators_credits_and_struck_sales() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        zarama_gym_lib::models::LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // Crear cliente directamente con CreateClientInput
    let client = entity_service::create_client(
        &state.pool(),
        &admin_session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("99887766".into()),
            nombres: Some("Luis".into()),
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

    // Insertar 2 créditos pendientes: S/ 100 y S/ 80
    sqlx::query(
        r#"
        INSERT INTO creditos_clientes (
            cliente_id, origen_credito, descripcion, monto_total, monto_pagado, saldo_pendiente, estado, registrado_por_usuario_id
        ) VALUES 
            (?, 'PRODUCTO_CREDITO', 'Crédito suplementos', 100.00, 0.00, 100.00, 'PENDIENTE', ?),
            (?, 'PRODUCTO_CREDITO', 'Crédito bebidas', 80.00, 0.00, 80.00, 'PENDIENTE', ?)
        "#,
    )
    .bind(client.id)
    .bind(admin_session.user_id)
    .bind(client.id)
    .bind(admin_session.user_id)
    .execute(&state.pool())
    .await
    .unwrap();

    // Abrir turno para asociar ventas
    let shift = pos_service::open_cash_shift(
        &state.pool(),
        &admin_session,
        OpenCashShiftInput {
            monto_apertura_fisico: Decimal::from_str("50.00").unwrap(),
            notas_apertura: None,
        },
    )
    .await
    .unwrap();

    // Insertar 1 venta tachada pendiente (S/ 60.00) y 1 venta anulada definitiva (S/ 40.00)
    sqlx::query(
        r#"
        INSERT INTO ventas (turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, total_venta, estado_venta, motivo_tachado)
        VALUES (?, ?, ?, 60.00, 60.00, 'TACHADA_EN_TURNO', 'Error cajero'),
               (?, ?, ?, 40.00, 40.00, 'ANULADA_DEFINITIVA', 'Confirmado por admin')
        "#,
    )
    .bind(shift.id)
    .bind(client.id)
    .bind(admin_session.user_id)
    .bind(shift.id)
    .bind(client.id)
    .bind(admin_session.user_id)
    .execute(&state.pool())
    .await
    .unwrap();

    // Consultar dashboard
    let dashboard = finance_service::get_financial_dashboard_summary(
        &state.pool(),
        &admin_session,
        &FinancialReportFilter::default(),
    )
    .await
    .unwrap();

    let ind = dashboard.indicadores_control;
    assert_eq!(ind.cantidad_creditos_pendientes, 2);
    assert_eq!(ind.total_creditos_pendientes, Decimal::from_str("180.00").unwrap());
    assert_eq!(ind.ventas_tachadas_pendientes_count, 1);
    assert_eq!(ind.monto_tachado_pendiente, Decimal::from_str("60.00").unwrap());
    assert_eq!(ind.ventas_anuladas_definitivas_count, 1);
}
