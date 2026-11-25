use base64::Engine;
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::path::Path;
use std::sync::LazyLock;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AuthSession, BackupStatus, BackupType, CreatePosSaleInput, CreateProductInput,
    CreateUserInput, GenerateFinancialReportPdfRequest, IssueReceiptRequest, LoginCredentials,
    OpenCashShiftInput, PaymentMethod, PosItemType, PosPaymentInput,
    PosSaleItemInput, PrintTicketRequest, PrinterConnectionMode, ProductCategory, ReceiptType,
    SendReceiptEmailRequest, StrikeSaleInput, UpdatePrintingBackupConfigRequest,
    UpdateReceiptSeriesRequest, UserRole,
};
use zarama_gym_lib::services::{
    auth_service, catalog_service, pos_service, printing_backup_service,
    printing_backup_service::{
        check_sqlite_file_integrity, dispatch_ticket, CASH_DRAWER_PULSE, ESC_INIT, PAPER_CUT,
    },
};
use zarama_gym_lib::state::AppState;

static KEYRING_TEST_MUTEX: LazyLock<tokio::sync::Mutex<()>> =
    LazyLock::new(|| tokio::sync::Mutex::new(()));

struct KeyringRestoreGuard {
    prev_smtp: Option<String>,
    prev_gdrive_token: Option<String>,
    prev_gdrive_secret: Option<String>,
}

impl KeyringRestoreGuard {
    fn capture() -> Self {
        Self {
            prev_smtp: printing_backup_service::KeyringStore::get_secret("SMTP_PASSWORD").unwrap(),
            prev_gdrive_token: printing_backup_service::KeyringStore::get_secret(
                "GDRIVE_ACCESS_TOKEN",
            )
            .unwrap(),
            prev_gdrive_secret: printing_backup_service::KeyringStore::get_secret(
                "GDRIVE_CLIENT_SECRET",
            )
            .unwrap(),
        }
    }
}

impl Drop for KeyringRestoreGuard {
    fn drop(&mut self) {
        match &self.prev_smtp {
            Some(v) => {
                let _ = printing_backup_service::KeyringStore::set_secret("SMTP_PASSWORD", v);
            }
            None => {
                let _ = printing_backup_service::KeyringStore::delete_secret("SMTP_PASSWORD");
            }
        }
        match &self.prev_gdrive_token {
            Some(v) => {
                let _ =
                    printing_backup_service::KeyringStore::set_secret("GDRIVE_ACCESS_TOKEN", v);
            }
            None => {
                let _ = printing_backup_service::KeyringStore::delete_secret("GDRIVE_ACCESS_TOKEN");
            }
        }
        match &self.prev_gdrive_secret {
            Some(v) => {
                let _ =
                    printing_backup_service::KeyringStore::set_secret("GDRIVE_CLIENT_SECRET", v);
            }
            None => {
                let _ =
                    printing_backup_service::KeyringStore::delete_secret("GDRIVE_CLIENT_SECRET");
            }
        }
    }
}

/// Helper para crear un entorno aislado con base de datos en archivo temporal
async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_slice8.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new(pool);
    (state, temp_dir)
}

/// Helper para crear usuario Recepcionista
async fn create_receptionist_user(state: &AppState, _admin: &AuthSession) -> AuthSession {
    let _ = auth_service::create_user(
        &state.pool(),
        state,
        CreateUserInput {
            persona_id: None,
            username: "recep_slice8".into(),
            password: "Password123!".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "88776655".into(),
            nombres: "Lucia".into(),
            apellidos: "Cajera".into(),
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
        LoginCredentials {
            username: "recep_slice8".into(),
            password: "Password123!".into(),
        },
    )
    .await
    .unwrap()
}

/// Helper para preparar un producto y una venta POS estándar
async fn create_test_product_and_sale(
    state: &AppState,
    session: &AuthSession,
    pago_efectivo: Decimal,
    pago_digital: Decimal,
) -> (i64, i64) {
    // 1. Abrir turno de caja si no hay uno abierto
    let active_shift = pos_service::get_active_cash_shift(&state.pool(), session).await;
    if active_shift.is_err() || active_shift.unwrap().is_none() {
        let _ = pos_service::open_cash_shift(
            &state.pool(),
            session,
            OpenCashShiftInput {
                monto_apertura_fisico: Decimal::new(10000, 2), // 100.00
                notas_apertura: Some("Apertura para tests Slice 8".into()),
            },
        )
        .await
        .unwrap();
    }

    // 2. Crear producto
    let prod = catalog_service::create_product(
        &state.pool(),
        session,
        CreateProductInput {
            codigo_sku: format!("SKU-PRN-{}", chrono::Local::now().timestamp_nanos_opt().unwrap_or(12345)),
            nombre: "Proteina Whey 1kg".into(),
            categoria: ProductCategory::Suplementos,
            unidad_medida: Some("POTE".into()),
            precio_compra_referencial: Some(Decimal::new(6000, 2)), // 60.00
            costo_unitario: None,
            precio_venta: Decimal::new(10000, 2), // 100.00
            stock_minimo: Some(1),
            proveedor_preferido_id: None,
            stock_inicial: Some(50),
        },
    )
    .await
    .unwrap();

    // 3. Crear pagos según parámetros
    let mut pagos = Vec::new();
    if pago_efectivo > Decimal::ZERO {
        pagos.push(PosPaymentInput {
            metodo_pago: PaymentMethod::Efectivo,
            monto: pago_efectivo,
            referencia_operacion: None,
        });
    }
    if pago_digital > Decimal::ZERO {
        pagos.push(PosPaymentInput {
            metodo_pago: PaymentMethod::Yape,
            monto: pago_digital,
            referencia_operacion: Some("OP-998877".into()),
        });
    }

    // 4. Procesar Venta POS
    let sale = pos_service::create_pos_sale(
        &state.pool(),
        session,
        CreatePosSaleInput {
            cliente_id: None,
            items: vec![PosSaleItemInput {
                tipo_item: PosItemType::Producto,
                producto_id: Some(prod.id),
                plan_id: None,
                credito_id: None,
                cantidad: 1,
                precio_unitario: Decimal::new(10000, 2),
                subtotal: Decimal::new(10000, 2),
                fecha_inicio_plan: None,
            }],
            descuento: None,
            pagos,
            notas: Some("Venta test Slice 8".into()),
        },
    )
    .await
    .expect("Venta POS debe procesarse exitosamente");

    (prod.id, sale.id)
}

// ============================================================================
// CP-PRN-01: EMISIÓN INICIAL ATÓMICA DE COMPROBANTE
// ============================================================================
#[tokio::test]
async fn test_cp_prn_01_initial_atomic_receipt_issuance() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let (_prod_id, venta_id) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::new(10000, 2),
        Decimal::ZERO,
    )
    .await;

    let receipt = printing_backup_service::issue_sale_receipt(
        &state.pool(),
        &admin,
        IssueReceiptRequest {
            venta_id,
            tipo_comprobante: ReceiptType::Boleta,
            receptor_tipo_doc: Some("DNI".into()),
            receptor_numero_doc: Some("77665544".into()),
            receptor_razon_nombre: Some("Juan Perez".into()),
            receptor_direccion: Some("Calle Los Alamos 123".into()),
        },
    )
    .await
    .expect("La emisión de boleta debe ser exitosa");

    assert_eq!(receipt.venta_id, venta_id);
    assert_eq!(receipt.tipo_comprobante, ReceiptType::Boleta);
    assert_eq!(receipt.serie, "B001");
    assert_eq!(receipt.correlativo, 1);
    assert_eq!(receipt.numero_formateado, "B001-000001");
    assert_eq!(receipt.total_comprobante, Decimal::new(10000, 2));
    assert_eq!(receipt.hash_verificacion.len(), 16);

    // Verificar en base de datos que comprobantes_series actualizó el correlativo a 1
    let serie_row = sqlx::query("SELECT correlativo_actual FROM comprobantes_series WHERE serie = 'B001'")
        .fetch_one(&state.pool())
        .await
        .unwrap();
    let correlativo_en_db: i64 = serie_row.get("correlativo_actual");
    assert_eq!(correlativo_en_db, 1);

    // Verificar auditoría
    let audit_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auditoria_logs WHERE accion = 'RECEIPT_ISSUED' AND modulo = 'comprobantes_emitidos'",
    )
    .fetch_one(&state.pool())
    .await
    .unwrap();
    assert!(audit_count >= 1);
}

// ============================================================================
// CP-PRN-02: IDEMPOTENCIA EN EMISIÓN DE COMPROBANTES
// ============================================================================
#[tokio::test]
async fn test_cp_prn_02_idempotent_receipt_issuance() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let (_prod_id, venta_id) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::new(10000, 2),
        Decimal::ZERO,
    )
    .await;

    // 1. Primera emisión: asigna B001-000001
    let receipt1 = printing_backup_service::issue_sale_receipt(
        &state.pool(),
        &admin,
        IssueReceiptRequest {
            venta_id,
            tipo_comprobante: ReceiptType::Boleta,
            receptor_tipo_doc: None,
            receptor_numero_doc: None,
            receptor_razon_nombre: None,
            receptor_direccion: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(receipt1.correlativo, 1);
    assert_eq!(receipt1.numero_formateado, "B001-000001");

    // 2. Segunda emisión para la misma venta (debe ser idempotente)
    let receipt2 = printing_backup_service::issue_sale_receipt(
        &state.pool(),
        &admin,
        IssueReceiptRequest {
            venta_id,
            tipo_comprobante: ReceiptType::Boleta,
            receptor_tipo_doc: None,
            receptor_numero_doc: None,
            receptor_razon_nombre: None,
            receptor_direccion: None,
        },
    )
    .await
    .expect("Re-emisión no debe fallar, debe devolver el comprobante existente");

    assert_eq!(receipt1.id, receipt2.id);
    assert_eq!(receipt1.numero_formateado, receipt2.numero_formateado);
    assert_eq!(receipt1.hash_verificacion, receipt2.hash_verificacion);

    // 3. El correlativo de la serie NO debe haberse incrementado a 2
    let serie_row = sqlx::query("SELECT correlativo_actual FROM comprobantes_series WHERE serie = 'B001'")
        .fetch_one(&state.pool())
        .await
        .unwrap();
    let correlativo_en_db: i64 = serie_row.get("correlativo_actual");
    assert_eq!(correlativo_en_db, 1, "El correlativo de la serie debe mantenerse en 1 por idempotencia");
}

// ============================================================================
// CP-PRN-03: REFLEJO REACTIVO DE ANULACIÓN EN TICKET TÉRMICO Y PDF
// ============================================================================
#[tokio::test]
async fn test_cp_prn_03_reactive_cancellation_stamp_in_ticket_and_pdf() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let (_prod_id, venta_id) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::new(10000, 2),
        Decimal::ZERO,
    )
    .await;

    // Emite comprobante con venta activa
    let _ = printing_backup_service::issue_sale_receipt(
        &state.pool(),
        &admin,
        IssueReceiptRequest {
            venta_id,
            tipo_comprobante: ReceiptType::NotaVenta,
            receptor_tipo_doc: None,
            receptor_numero_doc: None,
            receptor_razon_nombre: None,
            receptor_direccion: None,
        },
    )
    .await
    .unwrap();

    // Tachar la venta en turno
    pos_service::strike_sale(
        &state.pool(),
        &admin,
        venta_id,
        StrikeSaleInput {
            motivo_tachado: "Cliente desistió de la compra".into(),
        },
    )
    .await
    .expect("Tachado de venta debe ser exitoso");

    // 1. Verificar ticket térmico
    let ticket_res = printing_backup_service::print_sale_ticket(
        &state.pool(),
        &admin,
        PrintTicketRequest {
            venta_id,
            forced_width_mm: Some(80),
            open_drawer_override: None,
        },
    )
    .await
    .unwrap();

    assert!(
        ticket_res.formatted_text.contains("*** [COMPROBANTE ANULADO] ***"),
        "El ticket de venta tachada debe exhibir el sello reactivo de anulación"
    );

    // 2. Verificar PDF en RAM
    let pdf_res = printing_backup_service::generate_sale_receipt_pdf(&state.pool(), &admin, venta_id)
        .await
        .unwrap();

    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(&pdf_res.pdf_base64)
        .expect("PDF debe ser base64 válido");
    let pdf_text = String::from_utf8_lossy(&pdf_bytes);

    assert!(
        pdf_text.contains("[ COMPROBANTE ANULADO ]"),
        "El stream del PDF debe incluir el sello [ COMPROBANTE ANULADO ]"
    );
    assert!(
        pdf_text.contains("0.85 0.1 0.1 rg"),
        "El sello de anulación en el PDF debe renderizarse con color rojo de alerta"
    );
}

// ============================================================================
// CP-PRN-04: FORMATEO ESC/POS EXACTO EN 58MM (32 COLS) Y 80MM (48 COLS)
// ============================================================================
#[tokio::test]
async fn test_cp_prn_04_exact_column_formatting_58mm_and_80mm() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let (_prod_id, venta_id) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::new(6000, 2),
        Decimal::new(4000, 2),
    )
    .await;

    // Caso 58mm: 32 columnas
    let res_58 = printing_backup_service::print_sale_ticket(
        &state.pool(),
        &admin,
        PrintTicketRequest {
            venta_id,
            forced_width_mm: Some(58),
            open_drawer_override: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(res_58.width_columns, 32);
    assert_eq!(res_58.width_mm, 58);
    for (idx, line) in res_58.formatted_text.lines().enumerate() {
        assert!(
            line.chars().count() <= 32,
            "Línea {} supera las 32 columnas en 58mm: '{}' (len={})",
            idx,
            line,
            line.chars().count()
        );
    }

    // Caso 80mm: 48 columnas
    let res_80 = printing_backup_service::print_sale_ticket(
        &state.pool(),
        &admin,
        PrintTicketRequest {
            venta_id,
            forced_width_mm: Some(80),
            open_drawer_override: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(res_80.width_columns, 48);
    assert_eq!(res_80.width_mm, 80);
    for (idx, line) in res_80.formatted_text.lines().enumerate() {
        assert!(
            line.chars().count() <= 48,
            "Línea {} supera las 48 columnas en 80mm: '{}' (len={})",
            idx,
            line,
            line.chars().count()
        );
    }

    // Verificar corte de papel (PAPER_CUT) al final del binario ESC/POS
    let raw_58 = base64::engine::general_purpose::STANDARD.decode(&res_58.raw_escpos_base64).unwrap();
    assert!(raw_58.windows(PAPER_CUT.len()).any(|w| w == PAPER_CUT));
}

// ============================================================================
// CP-PRN-05: PULSO CONDICIONAL DE GAVETA DE DINERO
// ============================================================================
#[tokio::test]
async fn test_cp_prn_05_conditional_cash_drawer_pulse() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // 1. Venta con pago en EFECTIVO
    let (_p1, venta_efectivo) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::new(10000, 2),
        Decimal::ZERO,
    )
    .await;

    let res_efectivo = printing_backup_service::print_sale_ticket(
        &state.pool(),
        &admin,
        PrintTicketRequest {
            venta_id: venta_efectivo,
            forced_width_mm: Some(80),
            open_drawer_override: None,
        },
    )
    .await
    .unwrap();

    let bytes_efectivo = base64::engine::general_purpose::STANDARD
        .decode(&res_efectivo.raw_escpos_base64)
        .unwrap();
    assert!(
        bytes_efectivo
            .windows(CASH_DRAWER_PULSE.len())
            .any(|w| w == CASH_DRAWER_PULSE),
        "Venta en efectivo debe incluir la secuencia ESC p de apertura de gaveta"
    );

    // 2. Venta 100% DIGITAL (Yape)
    let (_p2, venta_digital) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::ZERO,
        Decimal::new(10000, 2),
    )
    .await;

    let res_digital = printing_backup_service::print_sale_ticket(
        &state.pool(),
        &admin,
        PrintTicketRequest {
            venta_id: venta_digital,
            forced_width_mm: Some(80),
            open_drawer_override: None,
        },
    )
    .await
    .unwrap();

    let bytes_digital = base64::engine::general_purpose::STANDARD
        .decode(&res_digital.raw_escpos_base64)
        .unwrap();
    assert!(
        !bytes_digital
            .windows(CASH_DRAWER_PULSE.len())
            .any(|w| w == CASH_DRAWER_PULSE),
        "Venta 100% digital NO debe incluir el pulso de apertura de gaveta"
    );
}

// ============================================================================
// CP-PRN-06: MODO VIRTUAL_PREVIEW SIN HARDWARE FÍSICO
// ============================================================================
#[tokio::test]
async fn test_cp_prn_06_virtual_preview_mode_without_hardware() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let (_prod_id, venta_id) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::new(10000, 2),
        Decimal::ZERO,
    )
    .await;

    let ticket = printing_backup_service::print_sale_ticket(
        &state.pool(),
        &admin,
        PrintTicketRequest {
            venta_id,
            forced_width_mm: None, // usa config por defecto (80mm)
            open_drawer_override: None,
        },
    )
    .await
    .expect("El modo VIRTUAL_PREVIEW debe ejecutarse sin errores aunque no haya hardware");

    assert!(ticket.is_simulated);
    assert_eq!(ticket.target_mode, PrinterConnectionMode::VirtualPreview);
    assert!(ticket.message.contains("Simulador Virtual"));
    assert!(!ticket.raw_escpos_base64.is_empty());
    assert!(!ticket.formatted_text.is_empty());

    // Validar encabezado ESC/POS en el payload simulado
    let raw = base64::engine::general_purpose::STANDARD
        .decode(&ticket.raw_escpos_base64)
        .unwrap();
    assert_eq!(&raw[..2], ESC_INIT);
}

// ============================================================================
// CP-PRN-07: MODO NETWORK_TCP CON TIMEOUT SEGURO
// ============================================================================
#[tokio::test]
async fn test_cp_prn_07_network_tcp_mode_with_safe_timeout() {
    // 192.0.2.1 es dirección reservada TEST-NET-1 inalcanzable
    let dummy_raw = b"\x1B@Test TCP\n\x1DV\x42\x00";
    let dummy_text = "Test TCP";

    let start = tokio::time::Instant::now();
    let result = dispatch_ticket(
        PrinterConnectionMode::NetworkTcp,
        "192.0.2.1:9100",
        dummy_raw,
        dummy_text,
        80,
        48,
    )
    .await;
    let elapsed = start.elapsed();

    assert!(
        result.is_err(),
        "Debe retornar error de red al intentar conectar a IP no enrutada"
    );
    assert!(
        elapsed.as_secs() <= 5,
        "El timeout seguro debe responder en <= 5 segundos (tomó {:?})",
        elapsed
    );
}

// ============================================================================
// CP-PRN-08: GENERACIÓN EN RAM DE PDF DE COMPROBANTE (%PDF-1.4)
// ============================================================================
#[tokio::test]
async fn test_cp_prn_08_dynamic_sale_receipt_pdf_in_ram() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let (_prod_id, venta_id) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::new(10000, 2),
        Decimal::ZERO,
    )
    .await;

    let pdf_result = printing_backup_service::generate_sale_receipt_pdf(&state.pool(), &admin, venta_id)
        .await
        .expect("Generación de PDF en RAM debe ser exitosa");

    assert!(pdf_result.size_bytes > 500, "El PDF generado debe tener al menos 500 bytes");
    assert!(!pdf_result.filename.is_empty());

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&pdf_result.pdf_base64)
        .expect("El base64 entregado debe ser decodificable");

    // Verificar estándar %PDF-1.4 y %%EOF
    assert!(bytes.starts_with(b"%PDF-1.4"));
    let pdf_str = String::from_utf8_lossy(&bytes);
    assert!(pdf_str.contains("%%EOF"));
    assert!(pdf_str.contains("xref"));
    assert!(pdf_str.contains("trailer"));

    // Verificar consistencia del hash SHA-256
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let calculated_hash = format!("{:x}", hasher.finalize());
    assert_eq!(pdf_result.sha256_hash, calculated_hash);

    // Sin SMTP configurado, debe rechazar con Validation en lugar de devolver falso éxito
    let unconfigured_err = printing_backup_service::send_receipt_email(
        &state.pool(),
        &admin,
        SendReceiptEmailRequest {
            venta_id,
            destinatario_email: "cliente@zaramagym.pe".into(),
            mensaje_adicional: Some("¡Gracias por su compra!".into()),
        },
    )
    .await;
    assert!(
        matches!(unconfigured_err, Err(AppError::Validation(_))),
        "Sin SMTP habilitado/configurado NO debe devolver falso éxito: {:?}",
        unconfigured_err
    );

    // Configurar SMTP con clave centinela de pruebas (protegido por mutex y restore guard)
    let _keyring_lock = KEYRING_TEST_MUTEX.lock().await;
    let _keyring_restore = KeyringRestoreGuard::capture();
    printing_backup_service::update_printing_backup_config(
        &state.pool(),
        &admin,
        UpdatePrintingBackupConfigRequest {
            smtp_enabled: Some(true),
            smtp_host: Some("smtp.gmail.com".into()),
            smtp_port: Some(587),
            smtp_user: Some("notificaciones@zaramagym.pe".into()),
            smtp_from_email: Some("notificaciones@zaramagym.pe".into()),
            smtp_password: Some("SmtpAppPassword123#".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    // Despacho de comprobante por correo electrónico con centinela de pruebas
    let email_res = printing_backup_service::send_receipt_email(
        &state.pool(),
        &admin,
        SendReceiptEmailRequest {
            venta_id,
            destinatario_email: "cliente@zaramagym.pe".into(),
            mensaje_adicional: Some("¡Gracias por su compra!".into()),
        },
    )
    .await
    .expect("Despacho de comprobante por email debe ejecutarse");

    assert!(email_res.success);
    assert!(email_res.was_simulated);
}

// ============================================================================
// CP-PRN-09: GENERACIÓN EN RAM DE PDF DE REPORTE FINANCIERO
// ============================================================================
#[tokio::test]
async fn test_cp_prn_09_financial_report_pdf_in_ram() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // Crear una venta previa para que haya datos en el dashboard
    let (_prod_id, _venta_id) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::new(10000, 2),
        Decimal::ZERO,
    )
    .await;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let pdf_result = printing_backup_service::generate_financial_report_pdf(
        &state.pool(),
        &admin,
        GenerateFinancialReportPdfRequest {
            fecha_desde: today.clone(),
            fecha_hasta: today.clone(),
            canal_filtro: Some("MIXTA".into()),
        },
    )
    .await
    .expect("Generación de PDF de reporte financiero debe ser exitosa");

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&pdf_result.pdf_base64)
        .expect("Base64 de reporte financiero debe ser válido");

    assert!(bytes.starts_with(b"%PDF-1.4"));
    let pdf_text = String::from_utf8_lossy(&bytes);
    assert!(pdf_text.contains("REPORTE FINANCIERO Y CONTABLE CONSOLIDADO"));
    assert!(pdf_text.contains("CANAL"));
    assert!(pdf_text.contains("INGRESOS POR DOMINIO OPERATIVO"));
    assert!(pdf_text.contains("INDICADORES DE CONTROL"));
    assert!(pdf_text.contains("%%EOF"));
}

// ============================================================================
// CP-PRN-10: CREACIÓN DE RESPALDO EN CALIENTE CON VACUUM INTO
// ============================================================================
#[tokio::test]
async fn test_cp_prn_10_hot_backup_with_vacuum_into() {
    let (state, temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let backup_dir = temp_dir.path().join("backups_isolated");

    let record = printing_backup_service::create_local_backup(
        &state.pool(),
        &admin,
        Some(&backup_dir),
    )
    .await
    .expect("El respaldo local en caliente debe completarse exitosamente");

    assert_eq!(record.tipo_respaldo, BackupType::LocalManual);
    assert_eq!(record.estado, BackupStatus::Completado);
    assert!(record.tamano_bytes > 0);
    assert_eq!(record.sha256_checksum.len(), 64);

    let backup_file = Path::new(&record.ruta_local);
    assert!(backup_file.exists(), "El archivo de respaldo debe existir físicamente en disco");

    // Validar hash recalculado en disco
    let disk_bytes = std::fs::read(backup_file).unwrap();
    let mut hasher = Sha256::new();
    hasher.update(&disk_bytes);
    assert_eq!(format!("{:x}", hasher.finalize()), record.sha256_checksum);

    // Listar historial
    let history = printing_backup_service::list_backup_history(&state.pool(), &admin)
        .await
        .unwrap();
    assert!(!history.is_empty());
    assert_eq!(history[0].id, record.id);
}

// ============================================================================
// CP-PRN-11: VERIFICACIÓN DE INTEGRIDAD PRAGMA integrity_check
// ============================================================================
#[tokio::test]
async fn test_cp_prn_11_backup_integrity_verification() {
    let (state, temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let backup_dir = temp_dir.path().join("integrity_test");
    let record = printing_backup_service::create_local_backup(
        &state.pool(),
        &admin,
        Some(&backup_dir),
    )
    .await
    .unwrap();

    // 1. Verificación del archivo genuino recién generado
    let valid_report = printing_backup_service::verify_backup_integrity(
        &state.pool(),
        &admin,
        record.id,
    )
    .await
    .expect("Verificación de integridad debe ejecutarse");

    assert!(valid_report.is_valid, "El respaldo genuino debe ser válido");
    assert_eq!(valid_report.integrity_message.to_lowercase(), "ok");
    assert!(valid_report.missing_core_tables.is_empty());
    assert!(valid_report.found_tables_count >= 8);

    // 2. Verificación de archivo corrupto / alterado
    let corrupted_path = temp_dir.path().join("corrupted.db");
    std::fs::write(&corrupted_path, b"ESTE NO ES UN ARCHIVO SQLITE VALIDO SINO TEXTO BASURA").unwrap();

    let corrupt_report = check_sqlite_file_integrity(&corrupted_path)
        .await
        .unwrap();

    assert!(
        !corrupt_report.is_valid,
        "Un archivo no SQLite debe ser reportado como no válido"
    );
}

// ============================================================================
// CP-PRN-12: GESTIÓN DE SECRETOS Y SYNC GOOGLE DRIVE
// ============================================================================
#[tokio::test]
async fn test_cp_prn_12_secrets_keyring_and_gdrive_sync() {
    let _keyring_lock = KEYRING_TEST_MUTEX.lock().await;
    let _keyring_restore = KeyringRestoreGuard::capture();

    let (state, temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // 1. Actualizar configuración y guardar credenciales secretas
    let secret_smtp = "SmtpAppPassword123#";
    let secret_gdrive = "ya29.a0ARrda8-GdriveToken-Secured";
    let gdrive_client_id = "1234567890-zaramagym.apps.googleusercontent.com";
    let secret_gdrive_client = "GOCSPX-TestClientSecret987";

    let cfg_updated = printing_backup_service::update_printing_backup_config(
        &state.pool(),
        &admin,
        UpdatePrintingBackupConfigRequest {
            empresa_nombre_comercial: Some("ZaramaGYM Central".into()),
            empresa_razon_social: None,
            empresa_ruc: None,
            empresa_direccion: None,
            empresa_telefono: None,
            printer_paper_width_mm: Some(80),
            printer_connection_mode: Some(PrinterConnectionMode::VirtualPreview),
            printer_target_address: None,
            printer_open_drawer_on_cash: Some(true),
            printer_footer_message: None,
            smtp_host: Some("smtp.office365.com".into()),
            smtp_port: Some(587),
            smtp_user: Some("notificaciones@zaramagym.pe".into()),
            smtp_from_email: Some("notificaciones@zaramagym.pe".into()),
            smtp_enabled: Some(true),
            smtp_password: Some(secret_smtp.into()),
            backup_auto_interval_hours: Some(4),
            backup_gdrive_enabled: Some(true),
            backup_gdrive_folder_id: Some("1AbCdEfGhIjKlMnOpQrStUvWxYz".into()),
            backup_gdrive_token: Some(secret_gdrive.into()),
            backup_gdrive_client_id: Some(gdrive_client_id.into()),
            backup_gdrive_client_secret: Some(secret_gdrive_client.into()),
        },
    )
    .await
    .expect("Actualización de configuración con secretos debe ser exitosa");

    assert!(cfg_updated.has_smtp_password_configured);
    assert!(cfg_updated.has_gdrive_token_configured);
    assert!(cfg_updated.has_gdrive_client_secret_configured);
    assert_eq!(cfg_updated.backup_gdrive_client_id, gdrive_client_id);
    assert_eq!(
        printing_backup_service::KeyringStore::get_secret("GDRIVE_CLIENT_SECRET").unwrap(),
        Some(secret_gdrive_client.to_string())
    );

    // 2. Verificar que los secretos NUNCA se guardaron en configuracion_sistema
    let db_pass_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM configuracion_sistema WHERE valor = ? OR valor = ? OR valor = ? OR clave LIKE '%PASSWORD%' OR clave LIKE '%TOKEN%' OR clave LIKE '%SECRET%'",
    )
    .bind(secret_smtp)
    .bind(secret_gdrive)
    .bind(secret_gdrive_client)
    .fetch_one(&state.pool())
    .await
    .unwrap();
    assert_eq!(db_pass_count, 0, "Las contraseñas, tokens o client secrets nunca deben almacenarse en plano en la base de datos");

    // 3. Crear backup y sincronizarlo con Google Drive
    let backup_dir = temp_dir.path().join("gdrive_backups");
    let backup_rec = printing_backup_service::create_local_backup(
        &state.pool(),
        &admin,
        Some(&backup_dir),
    )
    .await
    .unwrap();

    let synced_rec = printing_backup_service::sync_backup_to_gdrive(
        &state.pool(),
        &admin,
        backup_rec.id,
    )
    .await
    .expect("Sincronización cloud con Google Drive debe ser exitosa");

    assert_eq!(synced_rec.estado, BackupStatus::SincronizadoCloud);
    assert!(synced_rec.drive_file_id.is_some());
    let drive_id = synced_rec.drive_file_id.unwrap();
    assert!(drive_id.starts_with("gdrive_file_"));

    // 4. Test de RBAC: Recepcionista no puede ejecutar backups ni actualizar series
    let recep = create_receptionist_user(&state, &admin).await;
    let rbac_backup_err = printing_backup_service::create_local_backup(&state.pool(), &recep, None).await;
    assert!(
        matches!(rbac_backup_err, Err(AppError::Forbidden(_))),
        "Recepcionista no debe tener permiso para crear backups"
    );

    let rbac_series_err = printing_backup_service::update_receipt_series(
        &state.pool(),
        &recep,
        UpdateReceiptSeriesRequest {
            serie_id: 1,
            descripcion: Some("Hack".into()),
            estado_activo: false,
        },
    )
    .await;
    assert!(
        matches!(rbac_series_err, Err(AppError::Forbidden(_))),
        "Recepcionista no debe tener permiso para modificar series de comprobantes"
    );

    // Secure-by-Default: sin permiso ver_dashboard_modulo_finanzas, RECEPCIONISTA recibe Forbidden
    let recep_fin_pdf_denied = printing_backup_service::generate_financial_report_pdf(
        &state.pool(),
        &recep,
        GenerateFinancialReportPdfRequest {
            fecha_desde: "2026-01-01".into(),
            fecha_hasta: "2026-12-31".into(),
            canal_filtro: None,
        },
    )
    .await;
    assert!(
        matches!(recep_fin_pdf_denied, Err(AppError::Forbidden(_))),
        "Recepcionista sin permiso ver_dashboard_modulo_finanzas debe recibir Forbidden al generar PDF financiero"
    );

    // Admin habilita ver_dashboard_modulo_finanzas
    zarama_gym_lib::services::permissions_service::update_receptionist_permissions(
        &state.pool(),
        &admin,
        zarama_gym_lib::models::ReceptionistPermissionsDto {
            ver_dashboard_modulo_finanzas: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let recep_fin_pdf = printing_backup_service::generate_financial_report_pdf(
        &state.pool(),
        &recep,
        GenerateFinancialReportPdfRequest {
            fecha_desde: "2026-01-01".into(),
            fecha_hasta: "2026-12-31".into(),
            canal_filtro: None,
        },
    )
    .await;
    assert!(
        recep_fin_pdf.is_ok(),
        "Recepcionista debe poder generar el reporte financiero PDF tras habilitar el permiso"
    );
    // 5. KeyringRestoreGuard restaura automáticamente los secretos previos al salir del bloque
}

// ============================================================================
// WORD-WRAP 58MM, SEPARACIÓN RUC/RAZÓN SOCIAL Y PDF ACUMULADO SIN FILTRO
// ============================================================================
#[tokio::test]
async fn test_ticket_word_wrap_separated_ruc_and_accumulated_financial_pdf() {
    let (state, _temp_dir) = setup_test_env().await;

    let admin = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // Configurar Razón Social y Dirección largas (> 32 caracteres)
    let long_razon = "ZARAMA FITNESS & PERFORMANCE CENTER SOCIEDAD ANONIMA CERRADA";
    let long_dir = "Av. Jose Larco 1234 Interior 502 Miraflores Lima Peru";
    printing_backup_service::update_printing_backup_config(
        &state.pool(),
        &admin,
        UpdatePrintingBackupConfigRequest {
            empresa_nombre_comercial: Some("ZaramaGYM".into()),
            empresa_razon_social: Some(long_razon.into()),
            empresa_ruc: Some("20601234567".into()),
            empresa_direccion: Some(long_dir.into()),
            empresa_telefono: Some("999888777".into()),
            printer_paper_width_mm: Some(58),
            printer_connection_mode: None,
            printer_target_address: None,
            printer_open_drawer_on_cash: None,
            printer_footer_message: None,
            smtp_host: None,
            smtp_port: None,
            smtp_user: None,
            smtp_from_email: None,
            smtp_enabled: None,
            smtp_password: None,
            backup_auto_interval_hours: None,
            backup_gdrive_enabled: None,
            backup_gdrive_folder_id: None,
            backup_gdrive_token: None,
            backup_gdrive_client_id: None,
            backup_gdrive_client_secret: None,
        },
    )
    .await
    .unwrap();

    let (_prod_id, venta_id) = create_test_product_and_sale(
        &state,
        &admin,
        Decimal::new(10000, 2),
        Decimal::ZERO,
    )
    .await;

    // 1. Verificar ticket 58mm (32 columnas): ninguna línea > 32 chars y sin pérdida de texto
    let ticket_58 = printing_backup_service::print_sale_ticket(
        &state.pool(),
        &admin,
        PrintTicketRequest {
            venta_id,
            forced_width_mm: Some(58),
            open_drawer_override: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(ticket_58.width_columns, 32);
    for (idx, line) in ticket_58.formatted_text.lines().enumerate() {
        assert!(
            line.chars().count() <= 32,
            "Línea {} supera 32 columnas en 58mm: '{}' (len={})",
            idx,
            line,
            line.chars().count()
        );
    }

    // Reconstruir palabras del ticket para verificar que NADA fue truncado ni perdido
    let normalized_ticket: String = ticket_58
        .formatted_text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    assert!(
        normalized_ticket.contains(long_razon),
        "La razón social completa debe preservarse mediante word-wrap en 58mm"
    );
    assert!(
        normalized_ticket.contains(long_dir),
        "La dirección completa debe preservarse mediante word-wrap en 58mm"
    );
    assert!(
        ticket_58
            .formatted_text
            .lines()
            .any(|l| l.trim() == "R.U.C.: 20601234567"),
        "El RUC debe ir en su propia línea separada de la Razón Social"
    );

    // 2. Verificar PDF del comprobante separa Razón Social y R.U.C.
    let receipt_pdf = printing_backup_service::generate_sale_receipt_pdf(&state.pool(), &admin, venta_id)
        .await
        .unwrap();
    let receipt_pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(&receipt_pdf.pdf_base64)
        .unwrap();
    let receipt_pdf_str = String::from_utf8_lossy(&receipt_pdf_bytes);
    assert!(receipt_pdf_str.contains("(R.U.C.: 20601234567)"));
    assert!(!receipt_pdf_str.contains("RUC: 20601234567 - "));

    // 3. Verificar PDF de reporte financiero sin filtro de fechas (acumulado histórico)
    let today_local = chrono::Local::now().format("%Y-%m-%d").to_string();
    let acc_pdf = printing_backup_service::generate_financial_report_pdf(
        &state.pool(),
        &admin,
        GenerateFinancialReportPdfRequest {
            fecha_desde: "".into(),
            fecha_hasta: "".into(),
            canal_filtro: None,
        },
    )
    .await
    .expect("PDF de reporte financiero acumulado sin fechas debe generarse");

    assert_eq!(
        acc_pdf.filename,
        format!("reporte_financiero_acumulado_{}.pdf", today_local)
    );
    let acc_bytes = base64::engine::general_purpose::STANDARD
        .decode(&acc_pdf.pdf_base64)
        .unwrap();
    let acc_str = String::from_utf8_lossy(&acc_bytes);
    let expected_periodo_pdf = format!(
        "PERIODO: HISTORIAL ACUMULADO \\(Emision: {}\\)",
        today_local
    );
    assert!(
        acc_str.contains(&expected_periodo_pdf),
        "El PDF acumulado debe mostrar PERIODO: HISTORIAL ACUMULADO con fecha local de emisión"
    );
    assert!(
        acc_str.contains("100.00"),
        "El PDF acumulado debe incluir el ingreso histórico de la venta registrada"
    );
}

// ============================================================================
// AUTO-RESPALDO PROGRAMADO (run_auto_backup_cycle_once)
// ============================================================================
#[tokio::test]
async fn test_auto_backup_cycle_once_creates_and_skips_within_interval() {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_auto_backup.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new_with_db_path(pool.clone(), db_path);

    // 1. Sin respaldos recientes, debe crear un auto-respaldo LocalAuto en temp_dir/backups
    let first_run = printing_backup_service::run_auto_backup_cycle_once(&state)
        .await
        .expect("El primer ciclo de auto-respaldo no debe fallar");
    let record = first_run.expect("Debe crear un auto-respaldo cuando no hay respaldos recientes");

    assert_eq!(record.tipo_respaldo, BackupType::LocalAuto);
    assert_eq!(record.estado, BackupStatus::Completado);
    assert_eq!(record.ejecutado_por_usuario_id, None);
    assert!(
        Path::new(&record.ruta_local).exists(),
        "El archivo de auto-respaldo debe existir en disco"
    );
    assert!(
        Path::new(&record.ruta_local).starts_with(temp_dir.path().join("backups")),
        "El auto-respaldo debe guardarse dentro de <db_dir>/backups"
    );

    let audit_cron_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM auditoria_logs WHERE accion = 'AUTO_BACKUP_CREATED' AND username = 'SYSTEM_CRON'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_cron_count, 1);

    // 2. Al llamarlo inmediatamente de nuevo antes de cumplirse el intervalo, debe retornar None
    let second_run = printing_backup_service::run_auto_backup_cycle_once(&state)
        .await
        .expect("El segundo ciclo de auto-respaldo no debe fallar");
    assert!(
        second_run.is_none(),
        "No debe generar un segundo respaldo antes de cumplirse BACKUP_AUTO_INTERVAL_HOURS"
    );
}


#[tokio::test]
async fn test_auto_backup_2h_syncs_local_and_cloud_and_handles_misplaced_tokens_safely() {
    let _keyring_lock = KEYRING_TEST_MUTEX.lock().await;
    let _keyring_restore = KeyringRestoreGuard::capture();

    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_auto_backup_cloud_2h.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
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

    // 1. Verificar que el intervalo por defecto es exactamente 2 horas
    let cfg_default = printing_backup_service::get_printing_backup_config(&pool, &admin)
        .await
        .unwrap();
    assert_eq!(cfg_default.backup_auto_interval_hours, 2);

    // 2. Habilitar Google Drive (modo seguro con token simulado de pruebas) + intervalo 2 horas
    let _ = printing_backup_service::update_printing_backup_config(
        &pool,
        &admin,
        UpdatePrintingBackupConfigRequest {
            backup_gdrive_enabled: Some(true),
            backup_gdrive_folder_id: Some(
                "https://drive.google.com/drive/folders/1FolderAuto2hTest?usp=sharing".into(),
            ),
            backup_auto_interval_hours: Some(2),
            backup_gdrive_token: Some("Bearer ya29.a0ARrda8-GdriveToken-Secured".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let cfg_updated = printing_backup_service::get_printing_backup_config(&pool, &admin)
        .await
        .unwrap();
    assert_eq!(
        cfg_updated.backup_gdrive_folder_id, "1FolderAuto2hTest",
        "Debe extraer limpiamente el Folder ID aunque se pegue la URL completa"
    );

    // 3. Ejecutar ciclo automático: debe crear el respaldo local Y sincronizarlo a la nube
    let auto_rec = printing_backup_service::run_auto_backup_cycle_once(&state)
        .await
        .expect("El ciclo automático local + nube no debe fallar")
        .expect("Debe generar respaldo automático");

    assert_eq!(auto_rec.tipo_respaldo, BackupType::LocalAuto);
    assert_eq!(auto_rec.estado, BackupStatus::SincronizadoCloud);
    assert!(auto_rec.drive_file_id.is_some());
    assert!(Path::new(&auto_rec.ruta_local).exists());

    // 4. Probar validación preventiva y resiliencia si el usuario pega un Client Secret (GOCSPX-...) en la casilla de Token
    let _ = printing_backup_service::update_printing_backup_config(
        &pool,
        &admin,
        UpdatePrintingBackupConfigRequest {
            backup_gdrive_token: Some("GOCSPX-equivocado-en-token".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let err_secret_in_token =
        printing_backup_service::sync_backup_to_gdrive(&pool, &admin, auto_rec.id).await;
    match err_secret_in_token {
        Err(AppError::Validation(msg)) => {
            assert!(
                msg.contains("Client Secret") && msg.contains("1//"),
                "Debe dar explicación clara en español cuando se pega GOCSPX en Token: {}",
                msg
            );
        }
        other => panic!("Esperaba AppError::Validation, obtuve: {:?}", other),
    }

    // 5. En ciclo automático, si falla Drive por token inválido (ej. Authorization Code 4/...),
    //    el respaldo LOCAL debe quedar COMPLETADO intacto con mensaje_detalle explicativo
    let _ = printing_backup_service::update_printing_backup_config(
        &pool,
        &admin,
        UpdatePrintingBackupConfigRequest {
            backup_gdrive_token: Some("4/0A-codigo-de-un-solo-uso".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    // Envejecer el respaldo anterior > 2h para disparar un nuevo ciclo automático
    sqlx::query(
        "UPDATE historial_respaldos SET created_at = datetime('now', 'localtime', '-3 hours')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let resilient_rec = printing_backup_service::run_auto_backup_cycle_once(&state)
        .await
        .expect("Un fallo en la nube NO debe tumbar el ciclo automático ni perder el respaldo local")
        .expect("Debe crear la nueva copia local tras pasar 2 horas");

    assert_eq!(resilient_rec.tipo_respaldo, BackupType::LocalAuto);
    assert_eq!(
        resilient_rec.estado,
        BackupStatus::Completado,
        "El respaldo local debe mantenerse COMPLETADO y restaurable aunque falle la nube"
    );
    assert!(Path::new(&resilient_rec.ruta_local).exists());
    let detail = resilient_rec.mensaje_detalle.unwrap_or_default();
    assert!(
        detail.contains("Respaldo local OK") && detail.contains("Authorization Code"),
        "Debe dejar trazabilidad clara del motivo pendiente en nube: {}",
        detail
    );
}
