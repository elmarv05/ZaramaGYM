pub mod commands;
pub mod db;
pub mod errors;
pub mod models;
pub mod services;
pub mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // En desarrollo o producción desktop, resolver la ruta del archivo SQLite
            let app_handle = app.handle();
            let app_dir = app_handle
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));

            if !app_dir.exists() {
                let _ = std::fs::create_dir_all(&app_dir);
            }

            let db_path = app_dir.join("zaramagym.db");
            let db_url = format!("sqlite://{}", db_path.to_string_lossy());

            // Bloquear en hilo async de tokio durante el setup para inicializar SQLite y migraciones
            tauri::async_runtime::block_on(async {
                let pool = db::init_db(&db_url)
                    .await
                    .expect("Fallo crítico al inicializar base de datos SQLite");
                let state = AppState::new_with_db_path(pool.clone(), db_path);

                // Auto-arranque del servidor LAN si está habilitado por configuración
                let lan_enabled_row = sqlx::query(
                    "SELECT valor FROM configuracion_sistema WHERE clave = 'LAN_SERVER_ENABLED'",
                )
                .fetch_optional(&pool)
                .await
                .ok()
                .flatten();

                let is_enabled = lan_enabled_row
                    .and_then(|r| sqlx::Row::get::<Option<String>, _>(&r, "valor"))
                    .unwrap_or_else(|| "1".to_string());

                if is_enabled == "1" {
                    let _ = services::lan_service::start_lan_server(&state).await;
                }

                app.manage(state);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Slice 1: Auth & Auditoría
            commands::login,
            commands::logout,
            commands::get_current_session,
            commands::lock_session,
            commands::unlock_session,
            commands::change_own_password,
            commands::list_users,
            commands::create_user,
            commands::update_user,
            commands::update_user_photo,
            commands::toggle_user_active,
            commands::get_audit_logs,
            // Slice 2: Directorio de Personas
            commands::list_persons,
            commands::get_person,
            commands::create_person,
            commands::update_person,
            commands::toggle_person_active,
            // Slice 2: Clientes & Historial de Pesos
            commands::list_clients,
            commands::get_client,
            commands::create_client,
            commands::update_client,
            commands::toggle_client_active,
            commands::regenerate_client_qr,
            commands::record_client_weight,
            commands::get_client_weight_history,
            // Slice 2: Empresas Jurídicas RUC 20 & Proveedores Polimórficos
            commands::list_companies,
            commands::get_company,
            commands::create_company,
            commands::update_company,
            commands::toggle_company_active,
            commands::list_suppliers,
            commands::get_supplier,
            commands::create_supplier,
            commands::update_supplier,
            commands::toggle_supplier_active,
            // Slice 3: Catálogo de Planes (Day Overflow)
            commands::list_plans,
            commands::create_plan,
            commands::update_plan,
            commands::toggle_plan_active,
            commands::preview_plan_expiration,
            // Slice 3: Catálogo de Productos y Kardex / Mermas
            commands::list_products,
            commands::create_product,
            commands::update_product,
            commands::toggle_product_active,
            commands::record_inventory_movement,
            commands::list_inventory_movements,
            // Slice 4: Turnos de Caja, POS, Motor de Créditos y Tachado en 2 Pasos
            commands::get_active_cash_shift,
            commands::open_cash_shift,
            commands::close_cash_shift,
            commands::list_cash_shifts,
            commands::get_cash_shift_summary,
            commands::create_pos_sale,
            commands::list_sales,
            commands::get_sale_detail,
            commands::strike_sale,
            commands::resolve_struck_sale,
            commands::list_client_credits,
            commands::list_client_memberships,
            // Slice 5: Control de Asistencias, Semáforo Inteligente y Recuperación de Días
            commands::check_in_client,
            commands::authorize_red_daily_pass_credit,
            commands::list_attendances,
            commands::get_attendance_summary_today,
            commands::extend_membership_days,
            commands::list_membership_extensions,
            commands::get_system_config,
            commands::update_system_config,
            // Slice 6: Servidor Wi-Fi Local (Axum :3443) y Escáner Móvil (iOS / Android)
            commands::get_lan_server_status,
            commands::toggle_lan_server,
            commands::list_mobile_devices,
            commands::create_mobile_device_pairing,
            commands::pair_mobile_device,
            commands::revoke_mobile_device,
            commands::mobile_scan_qr,
            // Slice 7: Compras a Proveedores, Gastos Operativos y Finanzas
            commands::create_supplier_purchase,
            commands::list_supplier_purchases,
            commands::get_supplier_purchase_detail,
            commands::cancel_supplier_purchase,
            commands::create_operational_expense,
            commands::update_operational_expense,
            commands::toggle_operational_expense_active,
            commands::list_operational_expenses,
            commands::list_struck_sales_tray,
            commands::get_financial_dashboard_summary,
            // Slice 8: Impresión Térmica, PDFs en RAM y Respaldos Cloud
            commands::issue_sale_receipt,
            commands::get_sale_receipt,
            commands::list_receipt_series,
            commands::update_receipt_series,
            commands::print_sale_ticket,
            commands::generate_sale_receipt_pdf,
            commands::generate_financial_report_pdf,
            commands::send_receipt_email,
            commands::create_local_backup,
            commands::list_backup_history,
            commands::verify_backup_integrity,
            commands::export_database_file,
            commands::restore_database,
            commands::sync_backup_to_gdrive,
            commands::get_printing_backup_config,
            commands::update_printing_backup_config,
            // Fase 2: Apertura Segura de Enlaces, Home Dashboard y Exportaciones Contables
            commands::open_external_url,
            commands::get_home_dashboard_metrics,
            commands::export_clients_roster,
            commands::export_debtors_portfolio,
            commands::export_sales_cash_report
        ])
        .run(tauri::generate_context!())
        .expect("Error al ejecutar la aplicación Tauri ZaramaGYM");
}
