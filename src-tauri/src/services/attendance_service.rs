use crate::errors::AppError;
use crate::models::{
    AttendanceCheckInMode, AttendanceFilter, AttendanceListItemDto, AttendanceTodaySummaryDto,
    AuthorizeRedPassInput, AuthSession, CheckInEvaluationDto, CheckInInput,
    ExtendMembershipInput, MembershipExtensionDto, MembershipExtensionFilter, SystemConfigDto,
    TrafficLightColor, UpdateSystemConfigInput,
};
use chrono::{Local, NaiveDate};
use rust_decimal::Decimal;
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};
use std::str::FromStr;

// ============================================================================
// HELPERS INTERNOS DE CONFIGURACIÓN Y DEUDA
// ============================================================================

async fn get_config_value_str(pool: &SqlitePool, clave: &str) -> Option<String> {
    sqlx::query("SELECT valor FROM configuracion_sistema WHERE clave = ?")
        .bind(clave)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .and_then(|r| r.get::<Option<String>, _>("valor"))
}

async fn get_client_total_debt(pool: &SqlitePool, cliente_id: i64) -> Result<Decimal, AppError> {
    let rows = sqlx::query(
        "SELECT CAST(saldo_pendiente AS TEXT) as saldo_pendiente FROM creditos_clientes WHERE cliente_id = ? AND estado = 'PENDIENTE'",
    )
    .bind(cliente_id)
    .fetch_all(pool)
    .await?;

    let mut total = Decimal::ZERO;
    for row in rows {
        let saldo_str: Option<String> = row.get("saldo_pendiente");
        if let Some(s) = saldo_str {
            if let Ok(d) = Decimal::from_str(&s) {
                total += d;
            }
        }
    }

    Ok(total)
}

/// Normaliza tokens QR leídos por cámara móvil o pistolas láser USB (layout US/ES)
fn normalize_qr_token_input(raw: &str) -> String {
    let cleaned = raw
        .trim()
        .replace('\'', "-")
        .replace('’', "-")
        .to_uppercase();

    if let Some(idx) = cleaned.find("ZG-") {
        let candidate: String = cleaned[idx..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
            .collect();
        if candidate.len() >= 10 {
            return candidate;
        }
    }

    cleaned
}

// ============================================================================
// 1. CHECK-IN DE CLIENTE Y EVALUADOR SEMAFÓRICO
// ============================================================================

pub async fn check_in_client(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CheckInInput,
) -> Result<CheckInEvaluationDto, AppError> {
    // Paso 1: Sincronización atómica de membresías vencidas
    sqlx::query(
        r#"
        UPDATE membresias_clientes
        SET estado = 'VENCIDA', updated_at = datetime('now', 'localtime')
        WHERE estado = 'ACTIVA' AND fecha_vencimiento < datetime('now', 'localtime');
        "#,
    )
    .execute(pool)
    .await?;

    // Paso 2: Resolución del cliente
    let qr_token_clean = input
        .qr_token
        .as_deref()
        .map(normalize_qr_token_input)
        .filter(|s| !s.is_empty());
    let doc_clean = input.numero_documento.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let client_id_opt = input.cliente_id;

    if qr_token_clean.is_none() && doc_clean.is_none() && client_id_opt.is_none() {
        return Err(AppError::Validation(
            "Debe proporcionar qr_token, cliente_id o numero_documento para el check-in.".into(),
        ));
    }

    let client_row = if let Some(ref qr) = qr_token_clean {
        sqlx::query(
            r#"
            SELECT 
                c.id as cliente_id,
                c.estado_activo as cliente_activo,
                p.id as persona_id,
                p.tipo_documento,
                p.numero_documento,
                p.nombres,
                p.apellidos,
                p.estado_activo as persona_activo,
                u.foto_perfil_data_url
            FROM clientes c
            INNER JOIN personas p ON p.id = c.persona_id
            LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
            WHERE UPPER(c.codigo_qr_token) = ?
            LIMIT 1;
            "#,
        )
        .bind(qr)
        .fetch_optional(pool)
        .await?
    } else if let Some(cid) = client_id_opt {
        sqlx::query(
            r#"
            SELECT 
                c.id as cliente_id,
                c.estado_activo as cliente_activo,
                p.id as persona_id,
                p.tipo_documento,
                p.numero_documento,
                p.nombres,
                p.apellidos,
                p.estado_activo as persona_activo,
                u.foto_perfil_data_url
            FROM clientes c
            INNER JOIN personas p ON p.id = c.persona_id
            LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
            WHERE c.id = ?
            LIMIT 1;
            "#,
        )
        .bind(cid)
        .fetch_optional(pool)
        .await?
    } else {
        let doc = doc_clean.unwrap();
        sqlx::query(
            r#"
            SELECT 
                c.id as cliente_id,
                c.estado_activo as cliente_activo,
                p.id as persona_id,
                p.tipo_documento,
                p.numero_documento,
                p.nombres,
                p.apellidos,
                p.estado_activo as persona_activo,
                u.foto_perfil_data_url
            FROM clientes c
            INNER JOIN personas p ON p.id = c.persona_id
            LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
            WHERE p.numero_documento = ?
            LIMIT 1;
            "#,
        )
        .bind(doc)
        .fetch_optional(pool)
        .await?
    };

    let client_row = match client_row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Cliente no encontrado con los criterios proporcionados.".into())),
    };

    let cliente_id: i64 = client_row.get("cliente_id");
    let cliente_activo: i64 = client_row.get("cliente_activo");
    let persona_activo: i64 = client_row.get("persona_activo");

    if cliente_activo != 1 || persona_activo != 1 {
        return Err(AppError::Validation("El cliente se encuentra inactivo.".into()));
    }

    let tipo_documento: String = client_row.get("tipo_documento");
    let numero_documento: String = client_row.get("numero_documento");
    let nombres: String = client_row.get("nombres");
    let apellidos: String = client_row.get("apellidos");
    let foto_perfil_data_url: Option<String> = client_row.get("foto_perfil_data_url");
    let nombre_completo = format!("{} {}", nombres.trim(), apellidos.trim()).trim().to_string();

    let modo_ingreso = if let Some(m) = input.modo_ingreso {
        m
    } else if qr_token_clean.is_some() {
        AttendanceCheckInMode::QrLocal
    } else {
        AttendanceCheckInMode::ManualOlvidoQr
    };

    // Paso 3: Lectura de configuración del sistema
    let dias_alerta_amarillo = get_config_value_str(pool, "DIAS_ALERTA_AMARILLO")
        .await
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(5);

    let minutos_antirebote = get_config_value_str(pool, "MINUTOS_ANTIREBOTE_QR")
        .await
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(3);

    // Paso 4: Cálculo de deuda total pendiente
    let deuda_total_pendiente = get_client_total_debt(pool, cliente_id).await?;

    // Paso 5: Búsqueda de membresía ACTIVA con mayor fecha_vencimiento >= datetime('now', 'localtime')
    let active_membership = sqlx::query(
        r#"
        SELECT 
            m.id as membresia_id,
            m.plan_id,
            m.fecha_vencimiento,
            pl.nombre as nombre_plan,
            pl.permite_recuperacion_dias
        FROM membresias_clientes m
        INNER JOIN planes pl ON pl.id = m.plan_id
        WHERE m.cliente_id = ? 
          AND m.estado = 'ACTIVA' 
          AND m.fecha_vencimiento >= datetime('now', 'localtime')
        ORDER BY m.fecha_vencimiento DESC
        LIMIT 1;
        "#,
    )
    .bind(cliente_id)
    .fetch_optional(pool)
    .await?;

    let now_str = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // RAMA 1: NO EXISTE MEMBRESÍA ACTIVA VIGENTE -> SEMÁFORO ROJO BLOQUEADO
    if active_membership.is_none() {
        // Buscar la última membresía para enriquecer el motivo
        let last_membership = sqlx::query(
            r#"
            SELECT fecha_vencimiento, estado
            FROM membresias_clientes
            WHERE cliente_id = ?
            ORDER BY fecha_vencimiento DESC
            LIMIT 1;
            "#,
        )
        .bind(cliente_id)
        .fetch_optional(pool)
        .await?;

        let mut motivo = match last_membership {
            Some(row) => {
                let fv: String = row.get("fecha_vencimiento");
                let fv_corte = if fv.len() >= 10 { &fv[0..10] } else { &fv };
                format!("Membresía vencida el {}", fv_corte)
            }
            None => "Cliente no registra membresía activa".to_string(),
        };

        if deuda_total_pendiente > Decimal::ZERO {
            motivo.push_str(&format!(" (Deuda pendiente: S/ {:.2})", deuda_total_pendiente));
        }

        // CERO inserciones en asistencias ni auditoria_logs
        return Ok(CheckInEvaluationDto {
            asistencia_id: None,
            cliente_id,
            nombre_completo,
            tipo_documento,
            numero_documento,
            foto_perfil_data_url,
            color_semaforo: TrafficLightColor::Rojo,
            ingreso_permitido: false,
            alerta_sonora: true,
            es_rebote: false,
            motivo_semaforo: motivo,
            membresia_id: None,
            nombre_plan: None,
            fecha_vencimiento: None,
            dias_restantes: None,
            deuda_total_pendiente,
            modo_ingreso,
            fecha_hora_ingreso: now_str,
            credito_generado_id: None,
        });
    }

    // RAMA 2: SÍ EXISTE MEMBRESÍA ACTIVA VIGENTE
    let memb_row = active_membership.unwrap();
    let membresia_id: i64 = memb_row.get("membresia_id");
    let nombre_plan: String = memb_row.get("nombre_plan");
    let fecha_vencimiento: String = memb_row.get("fecha_vencimiento");

    // Cálculo calendario de días restantes
    let today = Local::now().date_naive();
    let fv_corte = if fecha_vencimiento.len() >= 10 {
        &fecha_vencimiento[0..10]
    } else {
        &fecha_vencimiento
    };
    let venc_date = NaiveDate::parse_from_str(fv_corte, "%Y-%m-%d").unwrap_or(today);
    let dias_restantes = (venc_date - today).num_days();

    // Filtro Anti-Rebote Dinámico (N minutos)
    if minutos_antirebote > 0 {
        let prev_attendance = sqlx::query(
            r#"
            SELECT 
                id,
                modo_ingreso,
                color_semaforo,
                motivo_semaforo,
                dias_restantes_momento,
                CAST(deuda_pendiente_momento AS TEXT) as deuda_pendiente_momento,
                fecha_hora_ingreso,
                credito_generado_id
            FROM asistencias
            WHERE cliente_id = ? 
              AND fecha_hora_ingreso >= datetime('now', 'localtime', '-' || ? || ' minutes')
            ORDER BY fecha_hora_ingreso DESC
            LIMIT 1;
            "#,
        )
        .bind(cliente_id)
        .bind(minutos_antirebote)
        .fetch_optional(pool)
        .await?;

        if let Some(prev) = prev_attendance {
            let prev_id: i64 = prev.get("id");
            let prev_modo_str: String = prev.get("modo_ingreso");
            let prev_color_str: String = prev.get("color_semaforo");
            let prev_motivo: String = prev.get("motivo_semaforo");
            let prev_dias: Option<i64> = prev.get("dias_restantes_momento");
            let prev_deuda_str: Option<String> = prev.get("deuda_pendiente_momento");
            let prev_fecha: String = prev.get("fecha_hora_ingreso");
            let prev_cred_id: Option<i64> = prev.get("credito_generado_id");

            let color_semaforo = prev_color_str.parse().unwrap_or(TrafficLightColor::Verde);
            let prev_modo = prev_modo_str.parse().unwrap_or(modo_ingreso);
            let prev_deuda = prev_deuda_str
                .and_then(|s| Decimal::from_str(&s).ok())
                .unwrap_or(deuda_total_pendiente);

            // Retorno sin insertar en base de datos
            return Ok(CheckInEvaluationDto {
                asistencia_id: Some(prev_id),
                cliente_id,
                nombre_completo,
                tipo_documento,
                numero_documento,
                foto_perfil_data_url,
                color_semaforo,
                ingreso_permitido: true,
                alerta_sonora: false,
                es_rebote: true,
                motivo_semaforo: prev_motivo,
                membresia_id: Some(membresia_id),
                nombre_plan: Some(nombre_plan),
                fecha_vencimiento: Some(fecha_vencimiento),
                dias_restantes: prev_dias.or(Some(dias_restantes)),
                deuda_total_pendiente: prev_deuda,
                modo_ingreso: prev_modo,
                fecha_hora_ingreso: prev_fecha,
                credito_generado_id: prev_cred_id,
            });
        }
    }

    // Clasificación Semafórica (Sin Rebote)
    let (color_semaforo, alerta_sonora, motivo_semaforo) = if dias_restantes > dias_alerta_amarillo
        && deuda_total_pendiente == Decimal::ZERO
    {
        (
            TrafficLightColor::Verde,
            false,
            "Membresía activa vigente".to_string(),
        )
    } else {
        let dias_msg = if dias_restantes == 0 {
            "Membresía vence hoy".to_string()
        } else {
            format!("Membresía por vencer en {} día(s)", dias_restantes)
        };

        let motivo = if dias_restantes <= dias_alerta_amarillo && deuda_total_pendiente > Decimal::ZERO {
            format!("{} y saldo deudor pendiente de S/ {:.2}", dias_msg, deuda_total_pendiente)
        } else if dias_restantes <= dias_alerta_amarillo {
            dias_msg
        } else {
            format!("Cliente registra saldo deudor pendiente de S/ {:.2}", deuda_total_pendiente)
        };

        (TrafficLightColor::Amarillo, true, motivo)
    };

    let deuda_momento_str = format!("{:.2}", deuda_total_pendiente);
    let modo_str = modo_ingreso.to_string();
    let color_str = color_semaforo.to_string();

    let res = sqlx::query(
        r#"
        INSERT INTO asistencias (
            cliente_id, membresia_id, fecha_hora_ingreso, modo_ingreso,
            color_semaforo, motivo_semaforo, dias_restantes_momento,
            deuda_pendiente_momento, credito_generado_id, registrado_por_usuario_id,
            notas, dispositivo_id, created_at
        ) VALUES (
            ?, ?, datetime('now', 'localtime'), ?,
            ?, ?, ?,
            ?, NULL, ?,
            ?, ?, datetime('now', 'localtime')
        );
        "#,
    )
    .bind(cliente_id)
    .bind(membresia_id)
    .bind(&modo_str)
    .bind(&color_str)
    .bind(&motivo_semaforo)
    .bind(dias_restantes)
    .bind(&deuda_momento_str)
    .bind(session.user_id)
    .bind(&input.notas)
    .bind(input.dispositivo_id)
    .execute(pool)
    .await?;

    let asistencia_id = res.last_insert_rowid();

    let f_row = sqlx::query("SELECT fecha_hora_ingreso FROM asistencias WHERE id = ?")
        .bind(asistencia_id)
        .fetch_one(pool)
        .await?;
    let fecha_hora_ingreso: String = f_row.get("fecha_hora_ingreso");

    // Política CERO RUIDO: Prohibido auditar check-ins rutinarios en auditoria_logs
    Ok(CheckInEvaluationDto {
        asistencia_id: Some(asistencia_id),
        cliente_id,
        nombre_completo,
        tipo_documento,
        numero_documento,
        foto_perfil_data_url,
        color_semaforo,
        ingreso_permitido: true,
        alerta_sonora,
        es_rebote: false,
        motivo_semaforo,
        membresia_id: Some(membresia_id),
        nombre_plan: Some(nombre_plan),
        fecha_vencimiento: Some(fecha_vencimiento),
        dias_restantes: Some(dias_restantes),
        deuda_total_pendiente,
        modo_ingreso,
        fecha_hora_ingreso,
        credito_generado_id: None,
    })
}

// ============================================================================
// 2. AUTORIZACIÓN DE PASE DIARIO A CRÉDITO DESDE SEMÁFORO ROJO
// ============================================================================

pub async fn authorize_red_daily_pass_credit(
    pool: &SqlitePool,
    session: &AuthSession,
    input: AuthorizeRedPassInput,
) -> Result<CheckInEvaluationDto, AppError> {
    let mut tx = pool.begin().await?;

    // Validar cliente existente y activo
    let client_row = sqlx::query(
        r#"
        SELECT 
            c.id as cliente_id,
            c.estado_activo as cliente_activo,
            p.id as persona_id,
            p.tipo_documento,
            p.numero_documento,
            p.nombres,
            p.apellidos,
            p.estado_activo as persona_activo,
            u.foto_perfil_data_url
        FROM clientes c
        INNER JOIN personas p ON p.id = c.persona_id
        LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
        WHERE c.id = ?
        LIMIT 1;
        "#,
    )
    .bind(input.cliente_id)
    .fetch_optional(&mut *tx)
    .await?;

    let client_row = match client_row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Cliente no encontrado.".into())),
    };

    let cliente_activo: i64 = client_row.get("cliente_activo");
    let persona_activo: i64 = client_row.get("persona_activo");
    if cliente_activo != 1 || persona_activo != 1 {
        return Err(AppError::Validation("El cliente se encuentra inactivo.".into()));
    }

    let cliente_id: i64 = client_row.get("cliente_id");
    let tipo_documento: String = client_row.get("tipo_documento");
    let numero_documento: String = client_row.get("numero_documento");
    let nombres: String = client_row.get("nombres");
    let apellidos: String = client_row.get("apellidos");
    let foto_perfil_data_url: Option<String> = client_row.get("foto_perfil_data_url");
    let nombre_completo = format!("{} {}", nombres.trim(), apellidos.trim()).trim().to_string();

    // Determinar precio del pase diario
    let precio_pase = if let Some(m) = input.monto_pase {
        if m <= Decimal::ZERO {
            return Err(AppError::Validation("El monto del pase debe ser mayor a 0.".into()));
        }
        m
    } else {
        let conf_val = sqlx::query(
            "SELECT valor FROM configuracion_sistema WHERE clave = 'PRECIO_PASE_DIARIO_CREDITO_DEFAULT'",
        )
        .fetch_optional(&mut *tx)
        .await?
        .and_then(|r| r.get::<Option<String>, _>("valor"))
        .and_then(|s| Decimal::from_str(&s).ok());

        conf_val.unwrap_or_else(|| Decimal::new(1000, 2))
    };

    // Obtener plan PASE-DIA
    let plan_row = sqlx::query(
        "SELECT id, nombre, precio_base FROM planes WHERE codigo = 'PASE-DIA' OR tipo_plan = 'PASE_DIARIO' ORDER BY id ASC LIMIT 1",
    )
    .fetch_optional(&mut *tx)
    .await?;

    let plan_row = match plan_row {
        Some(r) => r,
        None => {
            return Err(AppError::Internal(
                "No existe un plan de pase diario configurado en el sistema.".into(),
            ))
        }
    };

    let plan_id: i64 = plan_row.get("id");
    let plan_nombre: String = plan_row.get("nombre");
    let monto_str = format!("{:.2}", precio_pase);

    // 1. Insertar en creditos_clientes
    let cred_res = sqlx::query(
        r#"
        INSERT INTO creditos_clientes (
            cliente_id, venta_origen_id, origen_credito, descripcion,
            monto_total, monto_pagado, saldo_pendiente, estado,
            registrado_por_usuario_id, fecha_emision
        ) VALUES (
            ?, NULL, 'PASE_DIARIO_SEMAFORO_ROJO', 'Pase Diario autorizado en Semáforo Rojo',
            ?, '0.00', ?, 'PENDIENTE',
            ?, datetime('now', 'localtime')
        );
        "#,
    )
    .bind(cliente_id)
    .bind(&monto_str)
    .bind(&monto_str)
    .bind(session.user_id)
    .execute(&mut *tx)
    .await?;

    let credito_id = cred_res.last_insert_rowid();

    // 2. Insertar en membresias_clientes válida hasta 23:59:59 de hoy
    let memb_res = sqlx::query(
        r#"
        INSERT INTO membresias_clientes (
            cliente_id, plan_id, venta_id, fecha_inicio, fecha_vencimiento,
            precio_pactado, estado, registrado_por_usuario_id
        ) VALUES (
            ?, ?, NULL, datetime('now', 'localtime'), date('now', 'localtime') || ' 23:59:59',
            ?, 'ACTIVA', ?
        );
        "#,
    )
    .bind(cliente_id)
    .bind(plan_id)
    .bind(&monto_str)
    .bind(session.user_id)
    .execute(&mut *tx)
    .await?;

    let membresia_id = memb_res.last_insert_rowid();

    let m_row = sqlx::query("SELECT fecha_vencimiento FROM membresias_clientes WHERE id = ?")
        .bind(membresia_id)
        .fetch_one(&mut *tx)
        .await?;
    let fecha_vencimiento: String = m_row.get("fecha_vencimiento");

    // 3. Calcular deuda total acumulada
    let debt_rows = sqlx::query(
        "SELECT CAST(saldo_pendiente AS TEXT) as saldo_pendiente FROM creditos_clientes WHERE cliente_id = ? AND estado = 'PENDIENTE'",
    )
    .bind(cliente_id)
    .fetch_all(&mut *tx)
    .await?;

    let mut nueva_deuda = Decimal::ZERO;
    for r in debt_rows {
        let s: Option<String> = r.get("saldo_pendiente");
        if let Some(s_val) = s {
            if let Ok(d) = Decimal::from_str(&s_val) {
                nueva_deuda += d;
            }
        }
    }
    let nueva_deuda_str = format!("{:.2}", nueva_deuda);

    // 4. Insertar en asistencias
    let asis_res = sqlx::query(
        r#"
        INSERT INTO asistencias (
            cliente_id, membresia_id, fecha_hora_ingreso, modo_ingreso,
            color_semaforo, motivo_semaforo, dias_restantes_momento,
            deuda_pendiente_momento, credito_generado_id, registrado_por_usuario_id,
            notas, created_at
        ) VALUES (
            ?, ?, datetime('now', 'localtime'), 'PASE_DIARIO_CREDITO_ROJO',
            'ROJO', 'Pase Diario a crédito autorizado por recepción', 0,
            ?, ?, ?,
            ?, datetime('now', 'localtime')
        );
        "#,
    )
    .bind(cliente_id)
    .bind(membresia_id)
    .bind(&nueva_deuda_str)
    .bind(credito_id)
    .bind(session.user_id)
    .bind(&input.notas)
    .execute(&mut *tx)
    .await?;

    let asistencia_id = asis_res.last_insert_rowid();

    let a_row = sqlx::query("SELECT fecha_hora_ingreso FROM asistencias WHERE id = ?")
        .bind(asistencia_id)
        .fetch_one(&mut *tx)
        .await?;
    let fecha_hora_ingreso: String = a_row.get("fecha_hora_ingreso");

    // 5. Auditar evento de alto impacto ATTENDANCE_RED_CREDIT_AUTHORIZED (< 200B)
    let audit_details = serde_json::json!({
        "cliente_id": cliente_id,
        "credito_id": credito_id,
        "monto": monto_str,
        "asistencia_id": asistencia_id
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'ATTENDANCE_RED_CREDIT_AUTHORIZED', 'ASISTENCIAS', ?, 'LOCAL_DESKTOP');
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(CheckInEvaluationDto {
        asistencia_id: Some(asistencia_id),
        cliente_id,
        nombre_completo,
        tipo_documento,
        numero_documento,
        foto_perfil_data_url,
        color_semaforo: TrafficLightColor::Rojo,
        ingreso_permitido: true,
        alerta_sonora: false,
        es_rebote: false,
        motivo_semaforo: "Pase Diario a crédito autorizado por recepción".into(),
        membresia_id: Some(membresia_id),
        nombre_plan: Some(plan_nombre),
        fecha_vencimiento: Some(fecha_vencimiento),
        dias_restantes: Some(0),
        deuda_total_pendiente: nueva_deuda,
        modo_ingreso: AttendanceCheckInMode::PaseDiarioCreditoRojo,
        fecha_hora_ingreso,
        credito_generado_id: Some(credito_id),
    })
}

// ============================================================================
// 3. CONSULTA Y LISTADO DE ASISTENCIAS
// ============================================================================

pub async fn list_attendances(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &AttendanceFilter,
) -> Result<Vec<AttendanceListItemDto>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            a.id,
            a.cliente_id,
            p.tipo_documento,
            p.numero_documento,
            p.nombres,
            p.apellidos,
            a.membresia_id,
            pl.nombre as nombre_plan,
            a.fecha_hora_ingreso,
            a.modo_ingreso,
            a.color_semaforo,
            a.motivo_semaforo,
            a.dias_restantes_momento,
            CAST(a.deuda_pendiente_momento AS TEXT) as deuda_pendiente_momento,
            a.credito_generado_id,
            a.registrado_por_usuario_id,
            u.username as registrado_por_nombre,
            a.notas,
            a.created_at
        FROM asistencias a
        INNER JOIN clientes c ON c.id = a.cliente_id
        INNER JOIN personas p ON p.id = c.persona_id
        LEFT JOIN membresias_clientes m ON m.id = a.membresia_id
        LEFT JOIN planes pl ON pl.id = m.plan_id
        INNER JOIN usuarios_sistema u ON u.id = a.registrado_por_usuario_id
        WHERE 1=1
        "#,
    );

    if let Some(cid) = filter.cliente_id {
        builder.push(" AND a.cliente_id = ");
        builder.push_bind(cid);
    }

    if let Some(ref fd) = filter.fecha_desde {
        if !fd.trim().is_empty() {
            builder.push(" AND a.fecha_hora_ingreso >= ");
            builder.push_bind(fd.trim());
        }
    }

    if let Some(ref fh) = filter.fecha_hasta {
        if !fh.trim().is_empty() {
            builder.push(" AND a.fecha_hora_ingreso <= ");
            builder.push_bind(fh.trim());
        }
    }

    if let Some(ref col) = filter.color_semaforo {
        builder.push(" AND a.color_semaforo = ");
        builder.push_bind(col.to_string());
    }

    if let Some(ref modo) = filter.modo_ingreso {
        builder.push(" AND a.modo_ingreso = ");
        builder.push_bind(modo.to_string());
    }

    if let Some(ref b) = filter.busqueda {
        let term = format!("%{}%", b.trim());
        builder.push(" AND (p.nombres LIKE ");
        builder.push_bind(term.clone());
        builder.push(" OR p.apellidos LIKE ");
        builder.push_bind(term.clone());
        builder.push(" OR p.numero_documento LIKE ");
        builder.push_bind(term);
        builder.push(")");
    }

    builder.push(" ORDER BY a.fecha_hora_ingreso DESC, a.id DESC");

    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        if offset > 0 {
            builder.push(" OFFSET ");
            builder.push_bind(offset);
        }
    }

    let rows = builder.build().fetch_all(pool).await?;

    let items = rows
        .into_iter()
        .map(|row| {
            let nombres: String = row.get("nombres");
            let apellidos: String = row.get("apellidos");
            let modo_str: String = row.get("modo_ingreso");
            let color_str: String = row.get("color_semaforo");
            let deuda_str: Option<String> = row.get("deuda_pendiente_momento");
            let deuda_dec = deuda_str
                .and_then(|s| Decimal::from_str(&s).ok())
                .unwrap_or(Decimal::ZERO);

            AttendanceListItemDto {
                id: row.get("id"),
                cliente_id: row.get("cliente_id"),
                nombre_completo: format!("{} {}", nombres.trim(), apellidos.trim()).trim().to_string(),
                tipo_documento: row.get("tipo_documento"),
                numero_documento: row.get("numero_documento"),
                membresia_id: row.get("membresia_id"),
                nombre_plan: row.get("nombre_plan"),
                fecha_hora_ingreso: row.get("fecha_hora_ingreso"),
                modo_ingreso: modo_str.parse().unwrap_or(AttendanceCheckInMode::QrLocal),
                color_semaforo: color_str.parse().unwrap_or(TrafficLightColor::Verde),
                motivo_semaforo: row.get("motivo_semaforo"),
                dias_restantes_momento: row.get("dias_restantes_momento"),
                deuda_pendiente_momento: deuda_dec,
                credito_generado_id: row.get("credito_generado_id"),
                registrado_por_usuario_id: row.get("registrado_por_usuario_id"),
                registrado_por_nombre: row.get("registrado_por_nombre"),
                notas: row.get("notas"),
                created_at: row.get("created_at"),
            }
        })
        .collect();

    Ok(items)
}

// ============================================================================
// 4. RESUMEN DE ASISTENCIAS DE LA JORNADA (HOY)
// ============================================================================

pub async fn get_attendance_summary_today(
    pool: &SqlitePool,
    _session: &AuthSession,
) -> Result<AttendanceTodaySummaryDto, AppError> {
    let row = sqlx::query(
        r#"
        SELECT 
            COUNT(*) as total_ingresos_hoy,
            COALESCE(SUM(CASE WHEN color_semaforo = 'VERDE' THEN 1 ELSE 0 END), 0) as total_verde,
            COALESCE(SUM(CASE WHEN color_semaforo = 'AMARILLO' THEN 1 ELSE 0 END), 0) as total_amarillo,
            COALESCE(SUM(CASE WHEN color_semaforo = 'ROJO' THEN 1 ELSE 0 END), 0) as total_rojo_autorizados,
            COALESCE(SUM(CASE WHEN modo_ingreso = 'QR_LOCAL' THEN 1 ELSE 0 END), 0) as total_qr_local,
            COALESCE(SUM(CASE WHEN modo_ingreso = 'MANUAL_OLVIDO_QR' THEN 1 ELSE 0 END), 0) as total_manual_olvido,
            COALESCE(SUM(CASE WHEN modo_ingreso = 'PASE_DIARIO_CREDITO_ROJO' THEN 1 ELSE 0 END), 0) as total_pase_credito,
            COALESCE(SUM(CASE WHEN modo_ingreso = 'QR_MOVIL_LAN' THEN 1 ELSE 0 END), 0) as total_qr_movil,
            MAX(fecha_hora_ingreso) as ultimo_ingreso_hora
        FROM asistencias
        WHERE date(fecha_hora_ingreso) = date('now', 'localtime');
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(AttendanceTodaySummaryDto {
        total_ingresos_hoy: row.get("total_ingresos_hoy"),
        total_verde: row.get("total_verde"),
        total_amarillo: row.get("total_amarillo"),
        total_rojo_autorizados: row.get("total_rojo_autorizados"),
        total_qr_local: row.get("total_qr_local"),
        total_manual_olvido: row.get("total_manual_olvido"),
        total_pase_credito: row.get("total_pase_credito"),
        total_qr_movil: row.get("total_qr_movil"),
        ultimo_ingreso_hora: row.get("ultimo_ingreso_hora"),
    })
}

// ============================================================================
// 5. EXTENSIÓN Y RECUPERACIÓN MANUAL DE DÍAS DE MEMBRESÍA
// ============================================================================

pub async fn extend_membership_days(
    pool: &SqlitePool,
    session: &AuthSession,
    input: ExtendMembershipInput,
) -> Result<MembershipExtensionDto, AppError> {
    if input.dias_otorgados < 1 {
        return Err(AppError::Validation(
            "La cantidad de días a otorgar debe ser al menos 1.".into(),
        ));
    }

    let justificacion = input.motivo_justificacion.trim();
    if justificacion.chars().count() < 5 {
        return Err(AppError::Validation(
            "El motivo de justificación debe contener al menos 5 caracteres.".into(),
        ));
    }

    let row = sqlx::query(
        r#"
        SELECT 
            m.id as membresia_id,
            m.cliente_id,
            m.estado,
            m.fecha_vencimiento,
            pl.nombre as nombre_plan,
            pl.permite_recuperacion_dias,
            p.nombres,
            p.apellidos
        FROM membresias_clientes m
        INNER JOIN planes pl ON pl.id = m.plan_id
        INNER JOIN clientes c ON c.id = m.cliente_id
        INNER JOIN personas p ON p.id = c.persona_id
        WHERE m.id = ?;
        "#,
    )
    .bind(input.membresia_id)
    .fetch_optional(pool)
    .await?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Membresía no encontrada.".into())),
    };

    let estado: String = row.get("estado");
    if estado != "ACTIVA" {
        return Err(AppError::Validation(
            "Solo se pueden prorrogar o recuperar días en membresías con estado ACTIVA.".into(),
        ));
    }

    let permite_rec: i64 = row.get("permite_recuperacion_dias");
    if permite_rec == 0 {
        return Err(AppError::Validation(
            "El plan de esta membresía no permite recuperación o prórroga de días".into(),
        ));
    }

    let cliente_id: i64 = row.get("cliente_id");
    let nombre_plan: String = row.get("nombre_plan");
    let nombres: String = row.get("nombres");
    let apellidos: String = row.get("apellidos");
    let nombre_cliente = format!("{} {}", nombres.trim(), apellidos.trim()).trim().to_string();
    let fecha_vencimiento_anterior: String = row.get("fecha_vencimiento");

    // Cálculo calendario de la nueva fecha de vencimiento manteniendo 23:59:59
    let base_date_str = if fecha_vencimiento_anterior.len() >= 10 {
        &fecha_vencimiento_anterior[0..10]
    } else {
        &fecha_vencimiento_anterior
    };

    let base_date = NaiveDate::parse_from_str(base_date_str, "%Y-%m-%d").map_err(|e| {
        AppError::Internal(format!("Error parseando fecha de vencimiento anterior: {}", e))
    })?;

    let new_date = base_date + chrono::Duration::days(input.dias_otorgados);
    let fecha_vencimiento_nueva = format!("{} 23:59:59", new_date.format("%Y-%m-%d"));

    let mut tx = pool.begin().await?;

    // 1. Actualizar membresias_clientes
    sqlx::query(
        r#"
        UPDATE membresias_clientes
        SET fecha_vencimiento = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?;
        "#,
    )
    .bind(&fecha_vencimiento_nueva)
    .bind(input.membresia_id)
    .execute(&mut *tx)
    .await?;

    // 2. Insertar en extensiones_membresia
    let ext_res = sqlx::query(
        r#"
        INSERT INTO extensiones_membresia (
            membresia_id, cliente_id, dias_otorgados, fecha_vencimiento_anterior,
            fecha_vencimiento_nueva, motivo_justificacion, autorizado_por_usuario_id,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'));
        "#,
    )
    .bind(input.membresia_id)
    .bind(cliente_id)
    .bind(input.dias_otorgados)
    .bind(&fecha_vencimiento_anterior)
    .bind(&fecha_vencimiento_nueva)
    .bind(justificacion)
    .bind(session.user_id)
    .execute(&mut *tx)
    .await?;

    let ext_id = ext_res.last_insert_rowid();

    // 3. Auditar evento de alto impacto MEMBERSHIP_DAYS_EXTENDED (< 200B)
    let audit_details = serde_json::json!({
        "membresia_id": input.membresia_id,
        "dias": input.dias_otorgados,
        "nueva_fecha": fecha_vencimiento_nueva
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'MEMBERSHIP_DAYS_EXTENDED', 'MEMBRESIAS', ?, 'LOCAL_DESKTOP');
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let c_row = sqlx::query("SELECT created_at FROM extensiones_membresia WHERE id = ?")
        .bind(ext_id)
        .fetch_one(pool)
        .await?;
    let created_at: String = c_row.get("created_at");

    Ok(MembershipExtensionDto {
        id: ext_id,
        membresia_id: input.membresia_id,
        cliente_id,
        nombre_cliente,
        nombre_plan,
        dias_otorgados: input.dias_otorgados,
        fecha_vencimiento_anterior,
        fecha_vencimiento_nueva,
        motivo_justificacion: justificacion.to_string(),
        autorizado_por_usuario_id: session.user_id,
        autorizado_por_nombre: session.username.clone(),
        created_at,
    })
}

// ============================================================================
// 6. HISTORIAL DE EXTENSIONES DE MEMBRESÍA
// ============================================================================

pub async fn list_membership_extensions(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &MembershipExtensionFilter,
) -> Result<Vec<MembershipExtensionDto>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            e.id,
            e.membresia_id,
            e.cliente_id,
            p.nombres,
            p.apellidos,
            pl.nombre as nombre_plan,
            e.dias_otorgados,
            e.fecha_vencimiento_anterior,
            e.fecha_vencimiento_nueva,
            e.motivo_justificacion,
            e.autorizado_por_usuario_id,
            u.username as autorizado_por_nombre,
            e.created_at
        FROM extensiones_membresia e
        INNER JOIN clientes c ON c.id = e.cliente_id
        INNER JOIN personas p ON p.id = c.persona_id
        INNER JOIN membresias_clientes m ON m.id = e.membresia_id
        INNER JOIN planes pl ON pl.id = m.plan_id
        INNER JOIN usuarios_sistema u ON u.id = e.autorizado_por_usuario_id
        WHERE 1=1
        "#,
    );

    if let Some(mid) = filter.membresia_id {
        builder.push(" AND e.membresia_id = ");
        builder.push_bind(mid);
    }

    if let Some(cid) = filter.cliente_id {
        builder.push(" AND e.cliente_id = ");
        builder.push_bind(cid);
    }

    if let Some(ref fd) = filter.fecha_desde {
        if !fd.trim().is_empty() {
            builder.push(" AND e.created_at >= ");
            builder.push_bind(fd.trim());
        }
    }

    if let Some(ref fh) = filter.fecha_hasta {
        if !fh.trim().is_empty() {
            builder.push(" AND e.created_at <= ");
            builder.push_bind(fh.trim());
        }
    }

    builder.push(" ORDER BY e.created_at DESC, e.id DESC");

    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        if offset > 0 {
            builder.push(" OFFSET ");
            builder.push_bind(offset);
        }
    }

    let rows = builder.build().fetch_all(pool).await?;

    let items = rows
        .into_iter()
        .map(|row| {
            let nombres: String = row.get("nombres");
            let apellidos: String = row.get("apellidos");

            MembershipExtensionDto {
                id: row.get("id"),
                membresia_id: row.get("membresia_id"),
                cliente_id: row.get("cliente_id"),
                nombre_cliente: format!("{} {}", nombres.trim(), apellidos.trim()).trim().to_string(),
                nombre_plan: row.get("nombre_plan"),
                dias_otorgados: row.get("dias_otorgados"),
                fecha_vencimiento_anterior: row.get("fecha_vencimiento_anterior"),
                fecha_vencimiento_nueva: row.get("fecha_vencimiento_nueva"),
                motivo_justificacion: row.get("motivo_justificacion"),
                autorizado_por_usuario_id: row.get("autorizado_por_usuario_id"),
                autorizado_por_nombre: row.get("autorizado_por_nombre"),
                created_at: row.get("created_at"),
            }
        })
        .collect();

    Ok(items)
}

// ============================================================================
// 7. CONSULTA Y ACTUALIZACIÓN DE PARÁMETROS GLOBALES DEL SISTEMA
// ============================================================================

pub async fn get_system_config(
    pool: &SqlitePool,
    _session: &AuthSession,
) -> Result<SystemConfigDto, AppError> {
    let rows = sqlx::query("SELECT clave, valor, updated_at FROM configuracion_sistema")
        .fetch_all(pool)
        .await?;

    let mut dias_alerta_amarillo = 5i64;
    let mut minutos_antirebote_qr = 3i64;
    let mut precio_pase_diario_credito_default = Decimal::new(1000, 2);
    let mut last_updated_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    for r in rows {
        let clave: String = r.get("clave");
        let valor: String = r.get("valor");
        let updated_at: String = r.get("updated_at");
        if updated_at > last_updated_at {
            last_updated_at = updated_at.clone();
        }

        match clave.as_str() {
            "DIAS_ALERTA_AMARILLO" => {
                if let Ok(v) = valor.parse::<i64>() {
                    dias_alerta_amarillo = v;
                }
            }
            "MINUTOS_ANTIREBOTE_QR" => {
                if let Ok(v) = valor.parse::<i64>() {
                    minutos_antirebote_qr = v;
                }
            }
            "PRECIO_PASE_DIARIO_CREDITO_DEFAULT" => {
                if let Ok(d) = Decimal::from_str(&valor) {
                    precio_pase_diario_credito_default = d;
                }
            }
            _ => {}
        }
    }

    Ok(SystemConfigDto {
        dias_alerta_amarillo,
        minutos_antirebote_qr,
        precio_pase_diario_credito_default,
        updated_at: last_updated_at,
    })
}

pub async fn update_system_config(
    pool: &SqlitePool,
    session: &AuthSession,
    input: UpdateSystemConfigInput,
) -> Result<SystemConfigDto, AppError> {
    if let Some(dias) = input.dias_alerta_amarillo {
        if dias < 1 {
            return Err(AppError::Validation(
                "Los días de alerta amarilla deben ser al menos 1.".into(),
            ));
        }
    }

    if let Some(rebote) = input.minutos_antirebote_qr {
        if rebote < 0 {
            return Err(AppError::Validation(
                "Los minutos anti-rebote no pueden ser negativos.".into(),
            ));
        }
    }

    if let Some(precio) = input.precio_pase_diario_credito_default {
        if precio <= Decimal::ZERO {
            return Err(AppError::Validation(
                "El precio por defecto del pase diario a crédito debe ser mayor a 0.".into(),
            ));
        }
    }

    let mut tx = pool.begin().await?;

    if let Some(dias) = input.dias_alerta_amarillo {
        let val_str = dias.to_string();
        sqlx::query(
            r#"
            INSERT INTO configuracion_sistema (clave, valor, updated_at)
            VALUES ('DIAS_ALERTA_AMARILLO', ?, datetime('now', 'localtime'))
            ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at;
            "#,
        )
        .bind(&val_str)
        .execute(&mut *tx)
        .await?;
    }

    if let Some(rebote) = input.minutos_antirebote_qr {
        let val_str = rebote.to_string();
        sqlx::query(
            r#"
            INSERT INTO configuracion_sistema (clave, valor, updated_at)
            VALUES ('MINUTOS_ANTIREBOTE_QR', ?, datetime('now', 'localtime'))
            ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at;
            "#,
        )
        .bind(&val_str)
        .execute(&mut *tx)
        .await?;
    }

    if let Some(precio) = input.precio_pase_diario_credito_default {
        let val_str = format!("{:.2}", precio);
        sqlx::query(
            r#"
            INSERT INTO configuracion_sistema (clave, valor, updated_at)
            VALUES ('PRECIO_PASE_DIARIO_CREDITO_DEFAULT', ?, datetime('now', 'localtime'))
            ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at;
            "#,
        )
        .bind(&val_str)
        .execute(&mut *tx)
        .await?;
    }

    // Auditar cambio de configuración
    let audit_details = serde_json::json!({
        "dias_alerta_amarillo": input.dias_alerta_amarillo,
        "minutos_antirebote_qr": input.minutos_antirebote_qr,
        "precio_pase_diario_credito_default": input.precio_pase_diario_credito_default.map(|d| d.to_string())
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'SYSTEM_CONFIG_UPDATED', 'CONFIGURACION', ?, 'LOCAL_DESKTOP');
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_system_config(pool, session).await
}
