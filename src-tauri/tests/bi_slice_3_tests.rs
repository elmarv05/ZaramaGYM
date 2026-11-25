use base64::Engine;
use chrono::{Duration, Local};
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use std::str::FromStr;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    AuthSession, BiAttendanceFilterInput, BiExportAttendanceInput, BiExportMembersInput,
    BiGranularity, BiMembersFilterInput, CreateClientInput, CreateUserInput, ExportFileResult,
    ExportFormat, LoginCredentials, ReceptionistPermissionsDto, RecordWeightInput, UserRole,
};
use zarama_gym_lib::services::{
    auth_service, bi_analytics_service, entity_service, permissions_service,
};
use zarama_gym_lib::state::AppState;

async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_bi_slice_3.db");
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
            apellidos: "BI3".into(),
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

async fn create_demo_client(
    state: &AppState,
    admin: &AuthSession,
    dni: &str,
    nombres: &str,
    apellidos: &str,
    dob: Option<&str>,
    genero: Option<&str>,
    canal: Option<&str>,
    peso_inicial: Option<&str>,
) -> i64 {
    let detail = entity_service::create_client(
        &state.pool(),
        admin,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some(dni.into()),
            nombres: Some(nombres.into()),
            apellidos: Some(apellidos.into()),
            fecha_nacimiento: dob.map(String::from),
            genero: genero.map(String::from),
            telefono: Some(format!("999{}", &dni[..6])),
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            peso_inicial_kg: peso_inicial.map(|p| Decimal::from_str(p).unwrap()),
            canal_captacion: canal.map(String::from),
        },
    )
    .await
    .unwrap();
    detail.id
}

// ============================================================================
// 1. GUARDIAS RBAC (VER_TAB_SOCIOS, VER_TAB_ASISTENCIA, EXPORTAR_CONTEXTUAL_BI)
// ============================================================================

#[tokio::test]
async fn test_bi_slice3_rbac_guards() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();

    let recep = create_and_login_recep(&state, "rec_bi3", "90000011").await;
    let admin = login_admin(&state).await;

    let mem_filter = BiMembersFilterInput {
        fecha_desde: "2026-11-01".into(),
        fecha_hasta: "2026-11-10".into(),
        ..Default::default()
    };
    let att_filter = BiAttendanceFilterInput {
        fecha_desde: "2026-11-01".into(),
        fecha_hasta: "2026-11-10".into(),
        ..Default::default()
    };

    // 1. Todo OFF -> 4 endpoints Forbidden para Recepcionista
    assert!(matches!(
        bi_analytics_service::get_bi_members_analytics(&pool, &recep, mem_filter.clone()).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        bi_analytics_service::export_bi_members_analytics(
            &pool,
            &recep,
            BiExportMembersInput {
                filter: mem_filter.clone(),
                format: ExportFormat::Csv,
            },
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        bi_analytics_service::get_bi_attendance_analytics(&pool, &recep, att_filter.clone()).await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        bi_analytics_service::export_bi_attendance_analytics(
            &pool,
            &recep,
            BiExportAttendanceInput {
                filter: att_filter.clone(),
                format: ExportFormat::Csv,
            },
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    // 2. Solo ver_tab_socios = true -> consulta socios Ok, export socios Forbidden, asistencia Forbidden
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            ver_tab_socios: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert!(bi_analytics_service::get_bi_members_analytics(&pool, &recep, mem_filter.clone())
        .await
        .is_ok());
    assert!(matches!(
        bi_analytics_service::export_bi_members_analytics(
            &pool,
            &recep,
            BiExportMembersInput {
                filter: mem_filter.clone(),
                format: ExportFormat::Csv,
            },
        )
        .await,
        Err(AppError::Forbidden(_))
    ));
    assert!(matches!(
        bi_analytics_service::get_bi_attendance_analytics(&pool, &recep, att_filter.clone()).await,
        Err(AppError::Forbidden(_))
    ));

    // 3. Solo ver_tab_asistencia = true -> consulta asistencia Ok, export asistencia Forbidden
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            ver_tab_asistencia: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert!(bi_analytics_service::get_bi_attendance_analytics(&pool, &recep, att_filter.clone())
        .await
        .is_ok());
    assert!(matches!(
        bi_analytics_service::export_bi_attendance_analytics(
            &pool,
            &recep,
            BiExportAttendanceInput {
                filter: att_filter.clone(),
                format: ExportFormat::Csv,
            },
        )
        .await,
        Err(AppError::Forbidden(_))
    ));

    // 4. Ambos tabs + exportar_contextual_bi -> los 4 Ok
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto {
            ver_tab_socios: true,
            ver_tab_asistencia: true,
            exportar_contextual_bi: true,
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert!(bi_analytics_service::export_bi_members_analytics(
        &pool,
        &recep,
        BiExportMembersInput {
            filter: mem_filter.clone(),
            format: ExportFormat::Csv,
        },
    )
    .await
    .is_ok());
    assert!(bi_analytics_service::export_bi_attendance_analytics(
        &pool,
        &recep,
        BiExportAttendanceInput {
            filter: att_filter.clone(),
            format: ExportFormat::Xlsx,
        },
    )
    .await
    .is_ok());

    // 5. Admin siempre Ok
    permissions_service::update_receptionist_permissions(
        &pool,
        &admin,
        ReceptionistPermissionsDto::default(),
    )
    .await
    .unwrap();
    assert!(bi_analytics_service::get_bi_members_analytics(&pool, &admin, mem_filter)
        .await
        .is_ok());
    assert!(bi_analytics_service::get_bi_attendance_analytics(&pool, &admin, att_filter)
        .await
        .is_ok());
}

// ============================================================================
// 2. SOCIOS Y RETENCIÓN: DEMOGRAFÍA, RENOVACIÓN/CHURN, RIESGO, BIOMETRÍA, EXPORT
// ============================================================================

#[tokio::test]
async fn test_bi_members_demographics_retention_churn_risk_biometrics_and_filters() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();
    let admin = login_admin(&state).await;

    let today = Local::now().date_naive();
    let d_desde = today - Duration::days(20);
    let d_hasta = today;
    let desde_str = d_desde.format("%Y-%m-%d").to_string();
    let hasta_str = d_hasta.format("%Y-%m-%d").to_string();

    // Fechas de nacimiento exactas para buckets etarios respecto a `today`
    let dob_16 = (today - Duration::days(16 * 365 + 10)).format("%Y-%m-%d").to_string();
    let dob_28 = (today - Duration::days(28 * 365 + 10)).format("%Y-%m-%d").to_string();
    let dob_48 = (today - Duration::days(48 * 365 + 10)).format("%Y-%m-%d").to_string();

    // 4 clientes activos + 1 inactivo
    // C1: 28 años (25_34), FEMENINO, REDES_SOCIALES, peso 70 -> 67 (-3.00 kg)
    let c1 = create_demo_client(
        &state,
        &admin,
        "41000001",
        "Ana",
        "Renovadora",
        Some(&dob_28),
        Some("FEMENINO"),
        Some("REDES_SOCIALES"),
        Some("70.00"),
    )
    .await;
    entity_service::record_client_weight(
        &pool,
        &admin,
        RecordWeightInput {
            cliente_id: c1,
            peso_kg: Decimal::from_str("67.00").unwrap(),
            nota: Some("Control".into()),
        },
    )
    .await
    .unwrap();

    // C2: 16 años (MENOR_18), MASCULINO, RECOMENDACION, peso 60 -> 62 (+2.00 kg)
    let c2 = create_demo_client(
        &state,
        &admin,
        "41000002",
        "Bruno",
        "RiesgoSinAsistencia",
        Some(&dob_16),
        Some("MASCULINO"),
        Some("RECOMENDACION"),
        Some("60.00"),
    )
    .await;
    entity_service::record_client_weight(
        &pool,
        &admin,
        RecordWeightInput {
            cliente_id: c2,
            peso_kg: Decimal::from_str("62.00").unwrap(),
            nota: Some("Control".into()),
        },
    )
    .await
    .unwrap();

    // C3: 48 años (45_54), sin género (None), sin canal (None) -> SIN_ESPECIFICAR
    let c3 = create_demo_client(
        &state,
        &admin,
        "41000003",
        "Carlos",
        "RiesgoAsistenciaVieja",
        Some(&dob_48),
        None,
        None,
        None,
    )
    .await;

    // C4: sin fecha_nacimiento (SIN_ESPECIFICAR), FEMENINO, PROMOCION
    let c4 = create_demo_client(
        &state,
        &admin,
        "41000004",
        "Diana",
        "Constante",
        None,
        Some("FEMENINO"),
        Some("PROMOCION"),
        None,
    )
    .await;

    // C5: Inactivo (creado en periodo anterior, no debe contar en activos ni demografía activa)
    let c5 = create_demo_client(
        &state,
        &admin,
        "41000005",
        "Elena",
        "Inactiva",
        Some(&dob_28),
        Some("FEMENINO"),
        Some("OTRO"),
        None,
    )
    .await;
    entity_service::toggle_client_active(&pool, &admin, c5, false)
        .await
        .unwrap();

    // Ajustar created_at de C4 al periodo anterior para probar nuevos_socios delta_pct (3 actual vs 1 anterior)
    let prev_mid = (d_desde - Duration::days(5)).format("%Y-%m-%d 10:00:00").to_string();
    sqlx::query("UPDATE clientes SET created_at = ? WHERE id IN (?, ?)")
        .bind(&prev_mid)
        .bind(c4)
        .bind(c5)
        .execute(&pool)
        .await
        .unwrap();

    // Membresías:
    // C1: m1 venció hace 5 días (en periodo) -> renovó con m2 (Plan 3, 150.00) iniciando hace 4 días y vigente hasta +26d
    let m1_start = (today - Duration::days(35)).format("%Y-%m-%d").to_string();
    let m1_end = (today - Duration::days(5)).format("%Y-%m-%d").to_string();
    let m2_start = (today - Duration::days(4)).format("%Y-%m-%d").to_string();
    let m2_end = (today + Duration::days(26)).format("%Y-%m-%d").to_string();

    // C2: m3 (Plan 2, 80.00) inició hace 12 días y vence en +18d (0 asistencias => 12d sin asistir -> en riesgo)
    let c2_start = (today - Duration::days(12)).format("%Y-%m-%d").to_string();
    let c2_end = (today + Duration::days(18)).format("%Y-%m-%d").to_string();

    // C3: m4 (Plan 2, 80.00) inició hace 25 días y vence en +5d; última asistencia hace 16 días -> en riesgo (mayor días sin asistir)
    let c3_start = (today - Duration::days(25)).format("%Y-%m-%d").to_string();
    let c3_end = (today + Duration::days(5)).format("%Y-%m-%d").to_string();

    // C4: m5 (Plan 2, 80.00) venció hace 2 días (en periodo) y NO renovó -> cuenta como churn!
    let c4_old_start = (today - Duration::days(32)).format("%Y-%m-%d").to_string();
    let c4_old_end = (today - Duration::days(2)).format("%Y-%m-%d").to_string();

    // C4: además tiene una membresía ANULADA que NO debe contarse
    let mut c1_m2_id: i64 = 0;
    for (idx, (cid, pid, fi, fv, precio, estado)) in [
        (c1, 2i64, m1_start.as_str(), m1_end.as_str(), "80.00", "VENCIDA"),
        (c1, 3i64, m2_start.as_str(), m2_end.as_str(), "150.00", "ACTIVA"),
        (c2, 2i64, c2_start.as_str(), c2_end.as_str(), "80.00", "ACTIVA"),
        (c3, 2i64, c3_start.as_str(), c3_end.as_str(), "80.00", "ACTIVA"),
        (c4, 2i64, c4_old_start.as_str(), c4_old_end.as_str(), "80.00", "VENCIDA"),
        (c4, 4i64, m2_start.as_str(), m2_end.as_str(), "210.00", "ANULADA"),
    ]
    .into_iter()
    .enumerate()
    {
        let res = sqlx::query(
            r#"
            INSERT INTO membresias_clientes
                (cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento, precio_pactado, estado, registrado_por_usuario_id)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(cid)
        .bind(pid)
        .bind(fi)
        .bind(format!("{} 23:59:59", fv))
        .bind(precio)
        .bind(estado)
        .bind(admin.user_id)
        .execute(&pool)
        .await
        .unwrap();
        if idx == 1 {
            c1_m2_id = res.last_insert_rowid();
        }
    }

    // Asistencias:
    // C1 asistió ayer (1 día sin asistir -> NO está en riesgo)
    // C3 asistió hace 16 días -> EN RIESGO (16 >= 10)
    // C2 tiene 0 asistencias y fecha_inicio hace 12 días -> EN RIESGO (12 >= 10)
    let att_c1 = (today - Duration::days(1)).format("%Y-%m-%d 09:00:00").to_string();
    let att_c3 = (today - Duration::days(16)).format("%Y-%m-%d 18:00:00").to_string();
    for (cid, ts) in [(c1, att_c1), (c3, att_c3)] {
        sqlx::query(
            r#"
            INSERT INTO asistencias
                (cliente_id, membresia_id, fecha_hora_ingreso, modo_ingreso, color_semaforo, motivo_semaforo, dias_restantes_momento, deuda_pendiente_momento, registrado_por_usuario_id)
            VALUES (?, NULL, ?, 'QR_LOCAL', 'VERDE', 'OK', 10, 0.00, ?)
            "#,
        )
        .bind(cid)
        .bind(&ts)
        .bind(admin.user_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    // Prórroga de 4 días en periodo actual sobre C1 m2
    sqlx::query(
        r#"
        INSERT INTO extensiones_membresia
            (membresia_id, cliente_id, dias_otorgados, fecha_vencimiento_anterior, fecha_vencimiento_nueva, motivo_justificacion, autorizado_por_usuario_id)
        VALUES (?, ?, 4, ?, ?, 'Viaje de trabajo', ?)
        "#,
    )
    .bind(c1_m2_id)
    .bind(c1)
    .bind(&m2_end)
    .bind((today + Duration::days(30)).format("%Y-%m-%d").to_string())
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();

    // =========================================================================
    // CONSULTA SIN FILTROS DEMOGRÁFICOS
    // =========================================================================
    let dto = bi_analytics_service::get_bi_members_analytics(
        &pool,
        &admin,
        BiMembersFilterInput {
            fecha_desde: desde_str.clone(),
            fecha_hasta: hasta_str.clone(),
            granularidad: Some(BiGranularity::Dia),
            dias_inactividad_riesgo: Some(10),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(dto.socios_activos_total, 4);
    assert_eq!(dto.membresias_vigentes_total, 3); // C1, C2, C3 (C4 vencida + anulada)
    assert_eq!(dto.nuevos_socios.actual, Decimal::from(3)); // C1, C2, C3
    assert_eq!(dto.nuevos_socios.anterior, Decimal::from(2)); // C4, C5
    assert_eq!(dto.nuevos_socios.delta_pct, Some(50.0));

    // Retención y Churn: m1 (C1) venció y renovó con m2; m5 (C4) venció y NO renovó -> 1/2 = 50.0%
    assert_eq!(dto.vencimientos_en_periodo, 2);
    assert_eq!(dto.renovaciones_en_periodo, 1);
    assert_eq!(dto.tasa_renovacion_pct, 50.0);
    assert_eq!(dto.tasa_churn_pct, 50.0);

    // ARPU en periodo actual: m2 (150) + m3 (80) = 230 / 2 socios = 115.00
    // Anterior: m1 (80) + m5 (80) = 160 / 2 socios = 80.00 -> +43.8% (43.75 -> 43.8)
    assert_eq!(dto.arpu.actual, Decimal::from_str("115.00").unwrap());
    assert_eq!(dto.arpu.anterior, Decimal::from_str("80.00").unwrap());
    assert_eq!(dto.arpu.delta_pct, Some(43.8));

    // Prórrogas
    assert_eq!(dto.dias_prorroga_otorgados.actual, Decimal::from(4));
    assert_eq!(dto.dias_prorroga_otorgados.anterior, Decimal::ZERO);
    assert_eq!(dto.dias_prorroga_otorgados.delta_pct, Some(100.0));

    // Serie movimiento zero-filled (21 días)
    assert_eq!(dto.serie_movimiento.len(), 21);
    let total_altas: i64 = dto.serie_movimiento.iter().map(|p| p.altas_nuevas).sum();
    let total_ren: i64 = dto.serie_movimiento.iter().map(|p| p.renovaciones).sum();
    let total_ven: i64 = dto.serie_movimiento.iter().map(|p| p.vencimientos).sum();
    assert_eq!(total_altas, 1); // C2 m3 (C3 m4 inició hace 25d, fuera de los últimos 20d)
    assert_eq!(total_ren, 1); // C1 m2
    assert_eq!(total_ven, 2); // C1 m1 + C4 m5

    // Distribución edad (7 buckets siempre)
    assert_eq!(dto.distribucion_edad.len(), 7);
    assert_eq!(dto.distribucion_edad[0].clave, "MENOR_18");
    assert_eq!(dto.distribucion_edad[0].cantidad, 1);
    assert_eq!(dto.distribucion_edad[2].clave, "25_34");
    assert_eq!(dto.distribucion_edad[2].cantidad, 1);
    assert_eq!(dto.distribucion_edad[4].clave, "45_54");
    assert_eq!(dto.distribucion_edad[4].cantidad, 1);
    assert_eq!(dto.distribucion_edad[6].clave, "SIN_ESPECIFICAR");
    assert_eq!(dto.distribucion_edad[6].cantidad, 1);

    // Cobertura de género y captación: 3 de 4 activos = 75.0%
    assert_eq!(dto.cobertura_genero_pct, 75.0);
    assert_eq!(dto.cobertura_captacion_pct, 75.0);

    // Socios en riesgo: C3 (16d) primero, C2 (12d) segundo
    assert_eq!(dto.socios_en_riesgo.len(), 2);
    assert_eq!(dto.socios_en_riesgo[0].cliente_id, c3);
    assert_eq!(dto.socios_en_riesgo[0].dias_sin_asistir, 16);
    assert_eq!(dto.socios_en_riesgo[1].cliente_id, c2);
    assert_eq!(dto.socios_en_riesgo[1].dias_sin_asistir, 12);
    assert_eq!(dto.socios_en_riesgo[1].ultima_asistencia, None);

    // Resumen biométrico: C1 (-3kg) + C2 (+2kg) -> promedio -0.50 kg, 4 registros
    assert_eq!(dto.resumen_biometrico.socios_con_peso, 2);
    assert_eq!(dto.resumen_biometrico.socios_con_evolucion, 2);
    assert_eq!(
        dto.resumen_biometrico.variacion_promedio_kg,
        Decimal::from_str("-0.50").unwrap()
    );
    assert_eq!(dto.resumen_biometrico.total_registros_peso, 4);

    // =========================================================================
    // FILTROS CRUZADOS (GENERO + RANGO_EDAD + PLAN_ID)
    // =========================================================================
    let filtered = bi_analytics_service::get_bi_members_analytics(
        &pool,
        &admin,
        BiMembersFilterInput {
            fecha_desde: desde_str.clone(),
            fecha_hasta: hasta_str.clone(),
            rango_edad: Some("25_34".into()),
            genero: Some("FEMENINO".into()),
            plan_id: Some(3),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(filtered.socios_activos_total, 1);
    assert_eq!(filtered.membresias_vigentes_total, 1);
    assert_eq!(filtered.rendimiento_planes.len(), 1);
    assert_eq!(filtered.rendimiento_planes[0].plan_id, 3);
    assert_eq!(
        filtered.rendimiento_planes[0].ingresos,
        Decimal::from_str("150.00").unwrap()
    );

    // Validación de filtro inválido
    let bad_age = bi_analytics_service::get_bi_members_analytics(
        &pool,
        &admin,
        BiMembersFilterInput {
            rango_edad: Some("EDAD_INVALIDA".into()),
            ..Default::default()
        },
    )
    .await;
    assert!(matches!(bad_age, Err(AppError::Validation(_))));

    // Exportación CSV y XLSX + auditoría BI_SOCIOS_RETENCION
    let csv = bi_analytics_service::export_bi_members_analytics(
        &pool,
        &admin,
        BiExportMembersInput {
            filter: BiMembersFilterInput {
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
    assert!(csv_txt.contains("SOCIO_EN_RIESGO"));
    assert!(csv_txt.contains("Carlos RiesgoAsistenciaVieja"));
    assert!(csv_txt.contains("RENDIMIENTO_PLAN"));

    let xlsx = bi_analytics_service::export_bi_members_analytics(
        &pool,
        &admin,
        BiExportMembersInput {
            filter: BiMembersFilterInput {
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
        "SELECT COUNT(*) FROM auditoria_logs WHERE accion = 'REPORT_EXPORTED' AND detalles_json LIKE '%BI_SOCIOS_RETENCION%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_cnt, 2);
}

// ============================================================================
// 3. ASISTENCIA Y DEMANDA: HEATMAP 7x18, PICO, PASES ROJOS, TOP Y EXPORT
// ============================================================================

#[tokio::test]
async fn test_bi_attendance_heatmap_peaks_red_passes_top_members_and_exports() {
    let (state, _tmp) = setup_test_env().await;
    let pool = state.pool();
    let admin = login_admin(&state).await;

    // Rango fijo de 14 días (2 semanas exactas: Lunes 2026-11-02 ..= Domingo 2026-11-15)
    // Cada día de la semana ocurre exactamente 2 veces en este rango.
    // Periodo anterior equivalente: 2026-10-19 ..= 2026-11-01 (14 días).
    let c1 = create_demo_client(
        &state,
        &admin,
        "42000001",
        "Mateo",
        "Constante",
        Some("1995-03-10"),
        Some("MASCULINO"),
        Some("REDES_SOCIALES"),
        None,
    )
    .await;
    let c2 = create_demo_client(
        &state,
        &admin,
        "42000002",
        "Sofia",
        "Mañanera",
        Some("1998-07-20"),
        Some("FEMENINO"),
        Some("RECOMENDACION"),
        None,
    )
    .await;

    // Membresías para asociar plan_id = 2 (c1) y plan_id = 3 (c2)
    let m1_res = sqlx::query(
        r#"
        INSERT INTO membresias_clientes
            (cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento, precio_pactado, estado, registrado_por_usuario_id)
        VALUES (?, 2, NULL, '2026-10-01', '2026-12-01', 80.00, 'ACTIVA', ?)
        "#,
    )
    .bind(c1)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();
    let m1_id = m1_res.last_insert_rowid();

    let m2_res = sqlx::query(
        r#"
        INSERT INTO membresias_clientes
            (cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento, precio_pactado, estado, registrado_por_usuario_id)
        VALUES (?, 3, NULL, '2026-10-01', '2026-12-01', 150.00, 'ACTIVA', ?)
        "#,
    )
    .bind(c2)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();
    let m2_id = m2_res.last_insert_rowid();

    // Asistencias en periodo actual (total = 6):
    // - Lunes 07:00 (2026-11-02 x2, 2026-11-09 x1) => 3 visitas en (Lunes=0, hora=7) -> promedio_por_jornada = 3 / 2 = 1.5
    // - Miércoles 19:00 (2026-11-04 x1, 2026-11-11 x1) => 2 visitas en (Miércoles=2, hora=19) -> promedio = 1.0
    // - Domingo 10:00 (2026-11-15 x1) => 1 visita en (Domingo=6, hora=10) -> promedio = 0.5
    let current_atts = [
        (c1, Some(m1_id), "2026-11-02 07:10:00", "QR_LOCAL", "VERDE"),
        (c2, Some(m2_id), "2026-11-02 07:35:00", "QR_MOVIL_LAN", "VERDE"),
        (c1, Some(m1_id), "2026-11-09 07:20:00", "QR_LOCAL", "VERDE"),
        (c1, Some(m1_id), "2026-11-04 19:05:00", "MANUAL_OLVIDO_QR", "AMARILLO"),
        (c1, Some(m1_id), "2026-11-11 19:40:00", "QR_LOCAL", "VERDE"),
        (c2, None, "2026-11-15 10:15:00", "PASE_DIARIO_CREDITO_ROJO", "ROJO"),
    ];
    for (cid, mid, ts, modo, color) in current_atts {
        sqlx::query(
            r#"
            INSERT INTO asistencias
                (cliente_id, membresia_id, fecha_hora_ingreso, modo_ingreso, color_semaforo, motivo_semaforo, dias_restantes_momento, deuda_pendiente_momento, registrado_por_usuario_id)
            VALUES (?, ?, ?, ?, ?, 'Test BI3', 5, 0.00, ?)
            "#,
        )
        .bind(cid)
        .bind(mid)
        .bind(ts)
        .bind(modo)
        .bind(color)
        .bind(admin.user_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    // Asistencias periodo anterior (total = 3, 1 socio único c1): +100.0% en asistencias y +100.0% en socios únicos
    for ts in [
        "2026-10-20 08:00:00",
        "2026-10-24 08:00:00",
        "2026-10-28 08:00:00",
    ] {
        sqlx::query(
            r#"
            INSERT INTO asistencias
                (cliente_id, membresia_id, fecha_hora_ingreso, modo_ingreso, color_semaforo, motivo_semaforo, dias_restantes_momento, deuda_pendiente_momento, registrado_por_usuario_id)
            VALUES (?, ?, ?, 'QR_LOCAL', 'VERDE', 'Test prev', 10, 0.00, ?)
            "#,
        )
        .bind(c1)
        .bind(m1_id)
        .bind(ts)
        .bind(admin.user_id)
        .execute(&pool)
        .await
        .unwrap();
    }

    // Pases en rojo en creditos_clientes:
    // 1 PAGADO (c2), 1 PENDIENTE 12.50 (c1), 1 ANULADO (no cuenta)
    sqlx::query(
        r#"
        INSERT INTO creditos_clientes
            (cliente_id, origen_credito, descripcion, monto_total, monto_pagado, saldo_pendiente, estado, fecha_emision, registrado_por_usuario_id)
        VALUES
            (?, 'PASE_DIARIO_SEMAFORO_ROJO', 'Pase pagado', 12.50, 12.50, 0.00, 'PAGADO', '2026-11-15 10:15:00', ?),
            (?, 'PASE_DIARIO_SEMAFORO_ROJO', 'Pase pendiente', 12.50, 0.00, 12.50, 'PENDIENTE', '2026-11-10 08:00:00', ?),
            (?, 'PASE_DIARIO_SEMAFORO_ROJO', 'Pase anulado', 10.00, 0.00, 10.00, 'ANULADO', '2026-11-12 08:00:00', ?)
        "#,
    )
    .bind(c2)
    .bind(admin.user_id)
    .bind(c1)
    .bind(admin.user_id)
    .bind(c1)
    .bind(admin.user_id)
    .execute(&pool)
    .await
    .unwrap();

    // =========================================================================
    // VERIFICACIÓN GLOBAL ASISTENCIA Y DEMANDA
    // =========================================================================
    let dto = bi_analytics_service::get_bi_attendance_analytics(
        &pool,
        &admin,
        BiAttendanceFilterInput {
            fecha_desde: "2026-11-02".into(),
            fecha_hasta: "2026-11-15".into(),
            granularidad: Some(BiGranularity::Dia),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(dto.total_asistencias.actual, Decimal::from(6));
    assert_eq!(dto.total_asistencias.anterior, Decimal::from(3));
    assert_eq!(dto.total_asistencias.delta_pct, Some(100.0));
    assert_eq!(dto.promedio_diario, 0.4); // 6 / 14 = 0.428 -> 0.4
    assert_eq!(dto.promedio_diario_anterior, 0.2); // 3 / 14 = 0.214 -> 0.2
    assert_eq!(dto.socios_unicos.actual, Decimal::from(2));
    assert_eq!(dto.socios_unicos.anterior, Decimal::from(1));
    assert_eq!(dto.socios_unicos.delta_pct, Some(100.0));
    assert_eq!(dto.frecuencia_semanal_promedio, 1.5); // (6 / 2) / 2 semanas = 1.5

    // Heatmap 7x18 = 126 celdas
    assert_eq!(dto.heatmap.len(), 126);
    assert_eq!(dto.heatmap[0].dia_semana, 0);
    assert_eq!(dto.heatmap[0].hora, 5);
    let mon_7 = dto
        .heatmap
        .iter()
        .find(|h| h.dia_semana == 0 && h.hora == 7)
        .unwrap();
    assert_eq!(mon_7.total, 3);
    assert_eq!(mon_7.promedio_por_jornada, 1.5);
    let sun_10 = dto
        .heatmap
        .iter()
        .find(|h| h.dia_semana == 6 && h.hora == 10)
        .unwrap();
    assert_eq!(sun_10.total, 1);
    assert_eq!(sun_10.promedio_por_jornada, 0.5);

    // Día/Hora pico: Lunes 07:00
    let pico = dto.dia_hora_pico.as_ref().unwrap();
    assert_eq!(pico.dia_semana, 0);
    assert_eq!(pico.dia_nombre, "Lunes");
    assert_eq!(pico.hora, 7);
    assert_eq!(pico.franja, "07:00");
    assert_eq!(pico.total, 3);

    // Serie temporal zero-filled (14 días)
    assert_eq!(dto.serie_temporal.len(), 14);
    assert_eq!(dto.serie_temporal[0].total, 2); // 2026-11-02
    assert_eq!(dto.serie_temporal[0].socios_unicos, 2);
    assert_eq!(dto.serie_temporal[1].total, 0); // 2026-11-03 zero-filled

    // Distribución semáforo: VERDE 4 (66.7%), AMARILLO 1 (16.7%), ROJO 1 (16.7%)
    assert_eq!(dto.distribucion_semaforo[0].clave, "VERDE");
    assert_eq!(dto.distribucion_semaforo[0].cantidad, 4);
    assert_eq!(dto.distribucion_semaforo[0].porcentaje, 66.7);
    assert_eq!(dto.distribucion_semaforo[1].cantidad, 1);
    assert_eq!(dto.distribucion_semaforo[2].cantidad, 1);

    // Distribución canales: QR_LOCAL 3, QR_MOVIL_LAN 1, MANUAL_OLVIDO_QR 1, PASE_DIARIO_CREDITO_ROJO 1
    assert_eq!(dto.distribucion_canales[0].cantidad, 3);
    assert_eq!(dto.distribucion_canales[0].porcentaje, 50.0);

    // Pases en rojo: 2 emitidos, 1 cobrado (50.0%), 12.50 pendiente
    assert_eq!(dto.pases_rojo_emitidos, 2);
    assert_eq!(dto.pases_rojo_cobrados, 1);
    assert_eq!(dto.pases_rojo_tasa_cobro_pct, 50.0);
    assert_eq!(
        dto.pases_rojo_saldo_pendiente,
        Decimal::from_str("12.50").unwrap()
    );

    // Top constantes: c1 (4 visitas) primero, c2 (2 visitas) segundo
    assert_eq!(dto.top_socios_constantes.len(), 2);
    assert_eq!(dto.top_socios_constantes[0].cliente_id, c1);
    assert_eq!(dto.top_socios_constantes[0].total_visitas, 4);
    assert_eq!(dto.top_socios_constantes[1].cliente_id, c2);
    assert_eq!(dto.top_socios_constantes[1].total_visitas, 2);

    // Filtros cruzados: color_semaforo = AMARILLO
    let yellow_only = bi_analytics_service::get_bi_attendance_analytics(
        &pool,
        &admin,
        BiAttendanceFilterInput {
            fecha_desde: "2026-11-02".into(),
            fecha_hasta: "2026-11-15".into(),
            color_semaforo: Some("AMARILLO".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(yellow_only.total_asistencias.actual, Decimal::from(1));
    assert_eq!(yellow_only.socios_unicos.actual, Decimal::from(1));

    // Exportación CSV & XLSX + auditoría BI_ASISTENCIA_DEMANDA
    let csv = bi_analytics_service::export_bi_attendance_analytics(
        &pool,
        &admin,
        BiExportAttendanceInput {
            filter: BiAttendanceFilterInput {
                fecha_desde: "2026-11-02".into(),
                fecha_hasta: "2026-11-15".into(),
                ..Default::default()
            },
            format: ExportFormat::Csv,
        },
    )
    .await
    .unwrap();
    let csv_txt = String::from_utf8(verify_sha256_and_decode(&csv)).unwrap();
    assert!(csv_txt.contains("SERIE_ASISTENCIA"));
    assert!(csv_txt.contains("TOP_CONSTANTE"));
    assert!(csv_txt.contains("Mateo Constante"));

    let xlsx = bi_analytics_service::export_bi_attendance_analytics(
        &pool,
        &admin,
        BiExportAttendanceInput {
            filter: BiAttendanceFilterInput {
                fecha_desde: "2026-11-02".into(),
                fecha_hasta: "2026-11-15".into(),
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
        "SELECT COUNT(*) FROM auditoria_logs WHERE accion = 'REPORT_EXPORTED' AND detalles_json LIKE '%BI_ASISTENCIA_DEMANDA%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audit_cnt, 2);
}
