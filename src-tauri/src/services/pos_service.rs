use crate::errors::AppError;
use crate::models::{
    AuthSession, CashShiftDto, CashShiftFilter, CashShiftSummaryDto, ClientCreditDto,
    ClientCreditFilter, ClientMembershipDto, ClientMembershipFilter, CloseCashShiftInput,
    CreatePosSaleInput, CreditOrigin, DigitalBreakdownDto, OpenCashShiftInput,
    PaymentDetailDto, PaymentMethod, PosItemType, ResolveStruckAction, ResolveStruckSaleInput,
    SaleDetailDto, SaleFilter, SaleItemDetailDto, SaleListItemDto, StrikeSaleInput, UserRole,
};
use crate::services::audit_service::record_audit;
use crate::services::catalog_service::calcular_fecha_vencimiento;
use chrono::{Local, NaiveDate};
use rust_decimal::Decimal;
use serde::Deserialize;
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};

// ============================================================================
// HELPERS RBAC & JSON BREAKDOWN
// ============================================================================

fn require_supervisor_or_admin(session: &AuthSession) -> Result<(), AppError> {
    if session.rol == UserRole::Recepcionista {
        return Err(AppError::Forbidden(
            "Acceso denegado: se requieren privilegios de SUPERVISOR o ADMINISTRADOR.".into(),
        ));
    }
    Ok(())
}

fn parse_digital_breakdown(json_str: &str) -> DigitalBreakdownDto {
    #[derive(Deserialize)]
    #[allow(non_snake_case)]
    struct RawBreakdown {
        #[serde(default)]
        YAPE: Option<String>,
        #[serde(default)]
        PLIN: Option<String>,
        #[serde(default)]
        TRANSFERENCIA: Option<String>,
        #[serde(default)]
        TARJETA: Option<String>,
        #[serde(default)]
        yape: Option<String>,
        #[serde(default)]
        plin: Option<String>,
        #[serde(default)]
        transferencia: Option<String>,
        #[serde(default)]
        tarjeta: Option<String>,
    }

    if let Ok(raw) = serde_json::from_str::<RawBreakdown>(json_str) {
        let yape = raw
            .YAPE
            .or(raw.yape)
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO);
        let plin = raw
            .PLIN
            .or(raw.plin)
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO);
        let transferencia = raw
            .TRANSFERENCIA
            .or(raw.transferencia)
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO);
        let tarjeta = raw
            .TARJETA
            .or(raw.tarjeta)
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO);

        DigitalBreakdownDto {
            yape,
            plin,
            transferencia,
            tarjeta,
        }
    } else {
        DigitalBreakdownDto::default()
    }
}

fn serialize_digital_breakdown(dto: &DigitalBreakdownDto) -> String {
    serde_json::json!({
        "YAPE": dto.yape.to_string(),
        "PLIN": dto.plin.to_string(),
        "TRANSFERENCIA": dto.transferencia.to_string(),
        "TARJETA": dto.tarjeta.to_string(),
    })
    .to_string()
}

// ============================================================================
// 1. GESTIÓN DE TURNOS DE CAJA
// ============================================================================

pub async fn get_active_cash_shift(
    pool: &SqlitePool,
    _session: &AuthSession,
) -> Result<Option<CashShiftDto>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT 
            t.id,
            t.usuario_apertura_id,
            ua.username AS usuario_apertura_username,
            t.usuario_cierre_id,
            uc.username AS usuario_cierre_username,
            t.fecha_apertura,
            t.fecha_cierre,
            CAST(t.monto_apertura_fisico AS TEXT) AS monto_apertura_fisico,
            CAST(t.total_ventas_efectivo AS TEXT) AS total_ventas_efectivo,
            CAST(t.total_efectivo_esperado AS TEXT) AS total_efectivo_esperado,
            CAST(t.monto_cierre_fisico_declarado AS TEXT) AS monto_cierre_fisico_declarado,
            CAST(t.diferencia_arqueo_fisico AS TEXT) AS diferencia_arqueo_fisico,
            CAST(t.total_ventas_digital AS TEXT) AS total_ventas_digital,
            t.desglose_digital_json,
            t.estado,
            t.notas_apertura,
            t.notas_cierre,
            t.created_at,
            t.updated_at
        FROM turnos_caja t
        INNER JOIN usuarios_sistema ua ON ua.id = t.usuario_apertura_id
        LEFT JOIN usuarios_sistema uc ON uc.id = t.usuario_cierre_id
        WHERE t.estado = 'ABIERTO'
        ORDER BY t.id DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await?;

    let row = match row {
        Some(r) => r,
        None => return Ok(None),
    };

    let estado_str: String = row.get("estado");
    let desglose_json: String = row.get("desglose_digital_json");

    Ok(Some(CashShiftDto {
        id: row.get("id"),
        usuario_apertura_id: row.get("usuario_apertura_id"),
        usuario_apertura_username: row.get("usuario_apertura_username"),
        usuario_cierre_id: row.get("usuario_cierre_id"),
        usuario_cierre_username: row.get("usuario_cierre_username"),
        fecha_apertura: row.get("fecha_apertura"),
        fecha_cierre: row.get("fecha_cierre"),
        monto_apertura_fisico: row
            .get::<Option<String>, _>("monto_apertura_fisico")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        total_ventas_efectivo: row
            .get::<Option<String>, _>("total_ventas_efectivo")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        total_efectivo_esperado: row
            .get::<Option<String>, _>("total_efectivo_esperado")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        monto_cierre_fisico_declarado: row
            .get::<Option<String>, _>("monto_cierre_fisico_declarado")
            .and_then(|s| s.parse().ok()),
        diferencia_arqueo_fisico: row
            .get::<Option<String>, _>("diferencia_arqueo_fisico")
            .and_then(|s| s.parse().ok()),
        total_ventas_digital: row
            .get::<Option<String>, _>("total_ventas_digital")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        desglose_digital: parse_digital_breakdown(&desglose_json),
        estado: estado_str.parse()?,
        notas_apertura: row.get("notas_apertura"),
        notas_cierre: row.get("notas_cierre"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }))
}

pub async fn open_cash_shift(
    pool: &SqlitePool,
    session: &AuthSession,
    input: OpenCashShiftInput,
) -> Result<CashShiftDto, AppError> {
    if input.monto_apertura_fisico < Decimal::ZERO {
        return Err(AppError::Validation(
            "El monto de apertura físico no puede ser negativo.".into(),
        ));
    }

    // 1. Verificación previa de turno abierto existente
    let active = get_active_cash_shift(pool, session).await?;
    if active.is_some() {
        return Err(AppError::Conflict(
            "Ya existe un turno de caja abierto. Debe cerrarlo antes de abrir uno nuevo.".into(),
        ));
    }

    let default_breakdown = serialize_digital_breakdown(&DigitalBreakdownDto::default());
    let monto_str = input.monto_apertura_fisico.to_string();

    let res = sqlx::query(
        r#"
        INSERT INTO turnos_caja (
            usuario_apertura_id, fecha_apertura, monto_apertura_fisico,
            total_ventas_efectivo, total_efectivo_esperado, total_ventas_digital,
            desglose_digital_json, estado, notas_apertura
        )
        VALUES (?, datetime('now', 'localtime'), ?, '0.00', ?, '0.00', ?, 'ABIERTO', ?)
        "#,
    )
    .bind(session.user_id)
    .bind(&monto_str)
    .bind(&monto_str)
    .bind(&default_breakdown)
    .bind(&input.notas_apertura)
    .execute(pool)
    .await
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("UNIQUE") || msg.contains("idx_turnos_caja_unico_abierto") {
            AppError::Conflict("Ya existe un turno de caja abierto. Debe cerrarlo antes de abrir uno nuevo.".into())
        } else {
            AppError::from(e)
        }
    })?;

    let shift_id = res.last_insert_rowid();

    // Auditoría compacta (< 200B)
    let audit_details = serde_json::json!({
        "shift_id": shift_id,
        "monto_apertura": input.monto_apertura_fisico.to_string()
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "CASH_SHIFT_OPENED",
        "CAJA_POS",
        &audit_details,
        None,
    )
    .await;

    let shift = get_active_cash_shift(pool, session)
        .await?
        .ok_or_else(|| AppError::Internal("Error recuperando turno recién abierto.".into()))?;

    Ok(shift)
}

pub async fn close_cash_shift(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CloseCashShiftInput,
) -> Result<CashShiftDto, AppError> {
    if input.monto_cierre_fisico_declarado < Decimal::ZERO {
        return Err(AppError::Validation(
            "El monto de cierre físico declarado no puede ser negativo.".into(),
        ));
    }

    let active_shift = get_active_cash_shift(pool, session)
        .await?
        .ok_or_else(|| AppError::Validation("No hay un turno de caja abierto para cerrar.".into()))?;

    let diferencia = input.monto_cierre_fisico_declarado - active_shift.total_efectivo_esperado;

    sqlx::query(
        r#"
        UPDATE turnos_caja
        SET usuario_cierre_id = ?,
            fecha_cierre = datetime('now', 'localtime'),
            monto_cierre_fisico_declarado = ?,
            diferencia_arqueo_fisico = ?,
            estado = 'CERRADO',
            notas_cierre = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(session.user_id)
    .bind(input.monto_cierre_fisico_declarado.to_string())
    .bind(diferencia.to_string())
    .bind(&input.notas_cierre)
    .bind(active_shift.id)
    .execute(pool)
    .await?;

    // Auditoría compacta (< 200B)
    let audit_details = serde_json::json!({
        "shift_id": active_shift.id,
        "declarado": input.monto_cierre_fisico_declarado.to_string(),
        "diferencia": diferencia.to_string()
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "CASH_SHIFT_CLOSED",
        "CAJA_POS",
        &audit_details,
        None,
    )
    .await;

    // Recuperar el turno cerrado recién actualizado
    let row = sqlx::query(
        r#"
        SELECT 
            t.id,
            t.usuario_apertura_id,
            ua.username AS usuario_apertura_username,
            t.usuario_cierre_id,
            uc.username AS usuario_cierre_username,
            t.fecha_apertura,
            t.fecha_cierre,
            CAST(t.monto_apertura_fisico AS TEXT) AS monto_apertura_fisico,
            CAST(t.total_ventas_efectivo AS TEXT) AS total_ventas_efectivo,
            CAST(t.total_efectivo_esperado AS TEXT) AS total_efectivo_esperado,
            CAST(t.monto_cierre_fisico_declarado AS TEXT) AS monto_cierre_fisico_declarado,
            CAST(t.diferencia_arqueo_fisico AS TEXT) AS diferencia_arqueo_fisico,
            CAST(t.total_ventas_digital AS TEXT) AS total_ventas_digital,
            t.desglose_digital_json,
            t.estado,
            t.notas_apertura,
            t.notas_cierre,
            t.created_at,
            t.updated_at
        FROM turnos_caja t
        INNER JOIN usuarios_sistema ua ON ua.id = t.usuario_apertura_id
        LEFT JOIN usuarios_sistema uc ON uc.id = t.usuario_cierre_id
        WHERE t.id = ?
        "#,
    )
    .bind(active_shift.id)
    .fetch_one(pool)
    .await?;

    let estado_str: String = row.get("estado");
    let desglose_json: String = row.get("desglose_digital_json");

    Ok(CashShiftDto {
        id: row.get("id"),
        usuario_apertura_id: row.get("usuario_apertura_id"),
        usuario_apertura_username: row.get("usuario_apertura_username"),
        usuario_cierre_id: row.get("usuario_cierre_id"),
        usuario_cierre_username: row.get("usuario_cierre_username"),
        fecha_apertura: row.get("fecha_apertura"),
        fecha_cierre: row.get("fecha_cierre"),
        monto_apertura_fisico: row
            .get::<Option<String>, _>("monto_apertura_fisico")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        total_ventas_efectivo: row
            .get::<Option<String>, _>("total_ventas_efectivo")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        total_efectivo_esperado: row
            .get::<Option<String>, _>("total_efectivo_esperado")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        monto_cierre_fisico_declarado: row
            .get::<Option<String>, _>("monto_cierre_fisico_declarado")
            .and_then(|s| s.parse().ok()),
        diferencia_arqueo_fisico: row
            .get::<Option<String>, _>("diferencia_arqueo_fisico")
            .and_then(|s| s.parse().ok()),
        total_ventas_digital: row
            .get::<Option<String>, _>("total_ventas_digital")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        desglose_digital: parse_digital_breakdown(&desglose_json),
        estado: estado_str.parse()?,
        notas_apertura: row.get("notas_apertura"),
        notas_cierre: row.get("notas_cierre"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn list_cash_shifts(
    pool: &SqlitePool,
    session: &AuthSession,
    filter: &CashShiftFilter,
) -> Result<Vec<CashShiftDto>, AppError> {
    require_supervisor_or_admin(session)?;

    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            t.id,
            t.usuario_apertura_id,
            ua.username AS usuario_apertura_username,
            t.usuario_cierre_id,
            uc.username AS usuario_cierre_username,
            t.fecha_apertura,
            t.fecha_cierre,
            CAST(t.monto_apertura_fisico AS TEXT) AS monto_apertura_fisico,
            CAST(t.total_ventas_efectivo AS TEXT) AS total_ventas_efectivo,
            CAST(t.total_efectivo_esperado AS TEXT) AS total_efectivo_esperado,
            CAST(t.monto_cierre_fisico_declarado AS TEXT) AS monto_cierre_fisico_declarado,
            CAST(t.diferencia_arqueo_fisico AS TEXT) AS diferencia_arqueo_fisico,
            CAST(t.total_ventas_digital AS TEXT) AS total_ventas_digital,
            t.desglose_digital_json,
            t.estado,
            t.notas_apertura,
            t.notas_cierre,
            t.created_at,
            t.updated_at
        FROM turnos_caja t
        INNER JOIN usuarios_sistema ua ON ua.id = t.usuario_apertura_id
        LEFT JOIN usuarios_sistema uc ON uc.id = t.usuario_cierre_id
        WHERE 1=1
        "#,
    );

    if let Some(st) = filter.estado {
        builder.push(" AND t.estado = ");
        builder.push_bind(st.to_string());
    }

    if let Some(ref desde) = filter.fecha_desde {
        builder.push(" AND t.fecha_apertura >= ");
        builder.push_bind(desde.clone());
    }

    if let Some(ref hasta) = filter.fecha_hasta {
        builder.push(" AND t.fecha_apertura <= ");
        builder.push_bind(hasta.clone());
    }

    builder.push(" ORDER BY t.id DESC");

    let limit = filter.limit.unwrap_or(50).clamp(1, 200);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        builder.push(" OFFSET ");
        builder.push_bind(offset.max(0));
    }

    let rows = builder.build().fetch_all(pool).await?;

    let mut result = Vec::new();
    for row in rows {
        let estado_str: String = row.get("estado");
        let desglose_json: String = row.get("desglose_digital_json");

        result.push(CashShiftDto {
            id: row.get("id"),
            usuario_apertura_id: row.get("usuario_apertura_id"),
            usuario_apertura_username: row.get("usuario_apertura_username"),
            usuario_cierre_id: row.get("usuario_cierre_id"),
            usuario_cierre_username: row.get("usuario_cierre_username"),
            fecha_apertura: row.get("fecha_apertura"),
            fecha_cierre: row.get("fecha_cierre"),
            monto_apertura_fisico: row
                .get::<Option<String>, _>("monto_apertura_fisico")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            total_ventas_efectivo: row
                .get::<Option<String>, _>("total_ventas_efectivo")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            total_efectivo_esperado: row
                .get::<Option<String>, _>("total_efectivo_esperado")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            monto_cierre_fisico_declarado: row
                .get::<Option<String>, _>("monto_cierre_fisico_declarado")
                .and_then(|s| s.parse().ok()),
            diferencia_arqueo_fisico: row
                .get::<Option<String>, _>("diferencia_arqueo_fisico")
                .and_then(|s| s.parse().ok()),
            total_ventas_digital: row
                .get::<Option<String>, _>("total_ventas_digital")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            desglose_digital: parse_digital_breakdown(&desglose_json),
            estado: estado_str.parse()?,
            notas_apertura: row.get("notas_apertura"),
            notas_cierre: row.get("notas_cierre"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    Ok(result)
}

pub async fn get_cash_shift_summary(
    pool: &SqlitePool,
    session: &AuthSession,
    shift_id: Option<i64>,
) -> Result<CashShiftSummaryDto, AppError> {
    // Si shift_id es None, intentar con el turno abierto actual
    let shift_opt = match shift_id {
        Some(id) => {
            let row = sqlx::query(
                r#"
                SELECT 
                    t.id,
                    t.usuario_apertura_id,
                    ua.username AS usuario_apertura_username,
                    t.usuario_cierre_id,
                    uc.username AS usuario_cierre_username,
                    t.fecha_apertura,
                    t.fecha_cierre,
                    CAST(t.monto_apertura_fisico AS TEXT) AS monto_apertura_fisico,
                    CAST(t.total_ventas_efectivo AS TEXT) AS total_ventas_efectivo,
                    CAST(t.total_efectivo_esperado AS TEXT) AS total_efectivo_esperado,
                    CAST(t.monto_cierre_fisico_declarado AS TEXT) AS monto_cierre_fisico_declarado,
                    CAST(t.diferencia_arqueo_fisico AS TEXT) AS diferencia_arqueo_fisico,
                    CAST(t.total_ventas_digital AS TEXT) AS total_ventas_digital,
                    t.desglose_digital_json,
                    t.estado,
                    t.notas_apertura,
                    t.notas_cierre,
                    t.created_at,
                    t.updated_at
                FROM turnos_caja t
                INNER JOIN usuarios_sistema ua ON ua.id = t.usuario_apertura_id
                LEFT JOIN usuarios_sistema uc ON uc.id = t.usuario_cierre_id
                WHERE t.id = ?
                "#,
            )
            .bind(id)
            .fetch_optional(pool)
            .await?;

            if let Some(r) = row {
                let estado_str: String = r.get("estado");
                let desglose_json: String = r.get("desglose_digital_json");
                Some(CashShiftDto {
                    id: r.get("id"),
                    usuario_apertura_id: r.get("usuario_apertura_id"),
                    usuario_apertura_username: r.get("usuario_apertura_username"),
                    usuario_cierre_id: r.get("usuario_cierre_id"),
                    usuario_cierre_username: r.get("usuario_cierre_username"),
                    fecha_apertura: r.get("fecha_apertura"),
                    fecha_cierre: r.get("fecha_cierre"),
                    monto_apertura_fisico: r
                        .get::<Option<String>, _>("monto_apertura_fisico")
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(Decimal::ZERO),
                    total_ventas_efectivo: r
                        .get::<Option<String>, _>("total_ventas_efectivo")
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(Decimal::ZERO),
                    total_efectivo_esperado: r
                        .get::<Option<String>, _>("total_efectivo_esperado")
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(Decimal::ZERO),
                    monto_cierre_fisico_declarado: r
                        .get::<Option<String>, _>("monto_cierre_fisico_declarado")
                        .and_then(|s| s.parse().ok()),
                    diferencia_arqueo_fisico: r
                        .get::<Option<String>, _>("diferencia_arqueo_fisico")
                        .and_then(|s| s.parse().ok()),
                    total_ventas_digital: r
                        .get::<Option<String>, _>("total_ventas_digital")
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(Decimal::ZERO),
                    desglose_digital: parse_digital_breakdown(&desglose_json),
                    estado: estado_str.parse()?,
                    notas_apertura: r.get("notas_apertura"),
                    notas_cierre: r.get("notas_cierre"),
                    created_at: r.get("created_at"),
                    updated_at: r.get("updated_at"),
                })
            } else {
                None
            }
        }
        None => {
            let active = get_active_cash_shift(pool, session).await?;
            if active.is_some() {
                active
            } else {
                // Si no hay activo, traer el último
                let filter = CashShiftFilter {
                    limit: Some(1),
                    ..Default::default()
                };
                let mut list = list_cash_shifts_unrestricted(pool, &filter).await?;
                list.pop()
            }
        }
    };

    let shift = shift_opt.ok_or_else(|| AppError::NotFound("No se encontró ningún turno de caja.".into()))?;

    // Cantidad ventas completadas en el turno
    let completadas_row = sqlx::query(
        "SELECT COUNT(*) AS total FROM ventas WHERE turno_caja_id = ? AND estado_venta = 'COMPLETADA'",
    )
    .bind(shift.id)
    .fetch_one(pool)
    .await?;
    let cantidad_ventas_completadas: i64 = completadas_row.get("total");

    // Cantidad ventas tachadas
    let tachadas_row = sqlx::query(
        "SELECT COUNT(*) AS total FROM ventas WHERE turno_caja_id = ? AND estado_venta IN ('TACHADA_EN_TURNO', 'ANULADA_DEFINITIVA')",
    )
    .bind(shift.id)
    .fetch_one(pool)
    .await?;
    let cantidad_ventas_tachadas: i64 = tachadas_row.get("total");

    // Total créditos emitidos en el turno para ventas completadas
    let creditos_row = sqlx::query(
        "SELECT CAST(COALESCE(SUM(saldo_credito_generado), 0.00) AS TEXT) AS total FROM ventas WHERE turno_caja_id = ? AND estado_venta = 'COMPLETADA'",
    )
    .bind(shift.id)
    .fetch_one(pool)
    .await?;
    let total_creditos_emitidos_str: String = creditos_row.get("total");
    let total_creditos_emitidos: Decimal = total_creditos_emitidos_str.parse().unwrap_or(Decimal::ZERO);

    let total_consolidado_recaudado = shift.total_ventas_efectivo + shift.total_ventas_digital;

    Ok(CashShiftSummaryDto {
        shift,
        cantidad_ventas_completadas,
        cantidad_ventas_tachadas,
        total_creditos_emitidos,
        total_consolidado_recaudado,
    })
}

/// Helper interno no restringido por RBAC para encontrar el último turno si no hay ninguno abierto
async fn list_cash_shifts_unrestricted(
    pool: &SqlitePool,
    filter: &CashShiftFilter,
) -> Result<Vec<CashShiftDto>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            t.id,
            t.usuario_apertura_id,
            ua.username AS usuario_apertura_username,
            t.usuario_cierre_id,
            uc.username AS usuario_cierre_username,
            t.fecha_apertura,
            t.fecha_cierre,
            CAST(t.monto_apertura_fisico AS TEXT) AS monto_apertura_fisico,
            CAST(t.total_ventas_efectivo AS TEXT) AS total_ventas_efectivo,
            CAST(t.total_efectivo_esperado AS TEXT) AS total_efectivo_esperado,
            CAST(t.monto_cierre_fisico_declarado AS TEXT) AS monto_cierre_fisico_declarado,
            CAST(t.diferencia_arqueo_fisico AS TEXT) AS diferencia_arqueo_fisico,
            CAST(t.total_ventas_digital AS TEXT) AS total_ventas_digital,
            t.desglose_digital_json,
            t.estado,
            t.notas_apertura,
            t.notas_cierre,
            t.created_at,
            t.updated_at
        FROM turnos_caja t
        INNER JOIN usuarios_sistema ua ON ua.id = t.usuario_apertura_id
        LEFT JOIN usuarios_sistema uc ON uc.id = t.usuario_cierre_id
        WHERE 1=1
        "#,
    );

    builder.push(" ORDER BY t.id DESC");
    let limit = filter.limit.unwrap_or(50).clamp(1, 200);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    let rows = builder.build().fetch_all(pool).await?;

    let mut result = Vec::new();
    for row in rows {
        let estado_str: String = row.get("estado");
        let desglose_json: String = row.get("desglose_digital_json");

        result.push(CashShiftDto {
            id: row.get("id"),
            usuario_apertura_id: row.get("usuario_apertura_id"),
            usuario_apertura_username: row.get("usuario_apertura_username"),
            usuario_cierre_id: row.get("usuario_cierre_id"),
            usuario_cierre_username: row.get("usuario_cierre_username"),
            fecha_apertura: row.get("fecha_apertura"),
            fecha_cierre: row.get("fecha_cierre"),
            monto_apertura_fisico: row
                .get::<Option<String>, _>("monto_apertura_fisico")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            total_ventas_efectivo: row
                .get::<Option<String>, _>("total_ventas_efectivo")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            total_efectivo_esperado: row
                .get::<Option<String>, _>("total_efectivo_esperado")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            monto_cierre_fisico_declarado: row
                .get::<Option<String>, _>("monto_cierre_fisico_declarado")
                .and_then(|s| s.parse().ok()),
            diferencia_arqueo_fisico: row
                .get::<Option<String>, _>("diferencia_arqueo_fisico")
                .and_then(|s| s.parse().ok()),
            total_ventas_digital: row
                .get::<Option<String>, _>("total_ventas_digital")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            desglose_digital: parse_digital_breakdown(&desglose_json),
            estado: estado_str.parse()?,
            notas_apertura: row.get("notas_apertura"),
            notas_cierre: row.get("notas_cierre"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    Ok(result)
}

// ============================================================================
// 2. PUNTO DE VENTA (POS): VENTA MULTIDOMINIO
// ============================================================================

pub async fn create_pos_sale(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CreatePosSaleInput,
) -> Result<SaleDetailDto, AppError> {
    // 1. Exige turno abierto
    let active_shift = get_active_cash_shift(pool, session)
        .await?
        .ok_or_else(|| AppError::Validation("No hay ningún turno de caja abierto para registrar ventas.".into()))?;

    // 2. Carrito no vacío
    if input.items.is_empty() {
        return Err(AppError::Validation(
            "El carrito de venta no puede estar vacío.".into(),
        ));
    }

    // 3. Cálculos de ítems y subtotal
    let mut subtotal_acumulado = Decimal::ZERO;
    let mut contiene_plan = false;
    let mut contiene_amortizacion = false;

    for item in &input.items {
        if item.cantidad < 1 {
            return Err(AppError::Validation(
                "La cantidad de cada ítem debe ser al menos 1.".into(),
            ));
        }
        if item.precio_unitario < Decimal::ZERO {
            return Err(AppError::Validation(
                "El precio unitario no puede ser negativo.".into(),
            ));
        }
        let item_calc = Decimal::from(item.cantidad) * item.precio_unitario;
        if item.subtotal != item_calc {
            return Err(AppError::Validation(format!(
                "Inconsistencia en subtotal del ítem: calculado {} vs recibido {}",
                item_calc, item.subtotal
            )));
        }
        subtotal_acumulado += item.subtotal;

        match item.tipo_item {
            PosItemType::Plan => contiene_plan = true,
            PosItemType::AmortizacionCredito => contiene_amortizacion = true,
            PosItemType::Producto => {}
        }
    }

    let descuento = input.descuento.unwrap_or(Decimal::ZERO);
    if descuento < Decimal::ZERO {
        return Err(AppError::Validation(
            "El descuento no puede ser negativo.".into(),
        ));
    }
    if descuento > subtotal_acumulado {
        return Err(AppError::Validation(
            "El descuento no puede superar el subtotal de la venta.".into(),
        ));
    }

    let total_venta = subtotal_acumulado - descuento;

    // 4. Procesamiento y validación de medios de pago
    let mut total_digital = Decimal::ZERO;
    let mut total_efectivo_entregado = Decimal::ZERO;
    let mut digital_delta = DigitalBreakdownDto::default();

    for p in &input.pagos {
        if p.monto <= Decimal::ZERO {
            return Err(AppError::Validation(
                "El monto de cada pago debe ser mayor a 0.".into(),
            ));
        }
        match p.metodo_pago {
            PaymentMethod::Efectivo => {
                total_efectivo_entregado += p.monto;
            }
            PaymentMethod::Yape => {
                total_digital += p.monto;
                digital_delta.yape += p.monto;
            }
            PaymentMethod::Plin => {
                total_digital += p.monto;
                digital_delta.plin += p.monto;
            }
            PaymentMethod::Transferencia => {
                total_digital += p.monto;
                digital_delta.transferencia += p.monto;
            }
            PaymentMethod::Tarjeta => {
                total_digital += p.monto;
                digital_delta.tarjeta += p.monto;
            }
        }
    }

    if total_digital > total_venta {
        return Err(AppError::Validation(
            "El monto pagado con medios digitales no puede superar el total de la venta.".into(),
        ));
    }

    // Efectivo neto retenido para la venta (el exceso es devuelto como vuelto)
    let remanente_tras_digital = total_venta - total_digital;
    let efectivo_neto = if total_efectivo_entregado >= remanente_tras_digital {
        remanente_tras_digital
    } else {
        total_efectivo_entregado
    };

    let total_pagado_retenido = efectivo_neto + total_digital;
    let saldo_credito_generado = total_venta - total_pagado_retenido;

    if saldo_credito_generado > Decimal::ZERO {
        if input.cliente_id.is_none() {
            return Err(AppError::Validation(
                "Para compras a crédito o pagos parciales es obligatorio asociar un cliente.".into(),
            ));
        }
        if contiene_amortizacion {
            return Err(AppError::Validation(
                "No se puede pagar a crédito una amortización de deuda.".into(),
            ));
        }
    }

    // 5. Transacción atómica SQLite
    let mut tx = pool.begin().await?;

    // Inserción cabecera ventas
    let insert_venta = sqlx::query(
        r#"
        INSERT INTO ventas (
            turno_caja_id, cliente_id, usuario_vendedor_id, subtotal, descuento,
            total_venta, monto_pagado_efectivo, monto_pagado_digital,
            saldo_credito_generado, estado_venta, notas
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETADA', ?)
        "#,
    )
    .bind(active_shift.id)
    .bind(input.cliente_id)
    .bind(session.user_id)
    .bind(subtotal_acumulado.to_string())
    .bind(descuento.to_string())
    .bind(total_venta.to_string())
    .bind(efectivo_neto.to_string())
    .bind(total_digital.to_string())
    .bind(saldo_credito_generado.to_string())
    .bind(&input.notas)
    .execute(&mut *tx)
    .await?;

    let venta_id = insert_venta.last_insert_rowid();

    // 6. Procesar cada ítem del carrito
    let hoy_fecha = Local::now().format("%Y-%m-%d").to_string();

    for item in &input.items {
        match item.tipo_item {
            PosItemType::Producto => {
                let prod_id = item.producto_id.ok_or_else(|| {
                    AppError::Validation("El ítem de tipo PRODUCTO exige producto_id.".into())
                })?;

                let prod_row = sqlx::query(
                    r#"
                    SELECT id, codigo_sku, nombre, CAST(precio_compra_referencial AS TEXT) AS precio_compra_referencial, stock_actual, estado_activo
                    FROM productos WHERE id = ?
                    "#,
                )
                .bind(prod_id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(|| AppError::NotFound(format!("Producto con ID {} no existe.", prod_id)))?;

                let estado_activo: i64 = prod_row.get("estado_activo");
                if estado_activo != 1 {
                    let nombre: String = prod_row.get("nombre");
                    return Err(AppError::Validation(format!(
                        "El producto '{}' está inactivo.",
                        nombre
                    )));
                }

                let stock_actual: i64 = prod_row.get("stock_actual");
                if stock_actual < item.cantidad {
                    let nombre: String = prod_row.get("nombre");
                    return Err(AppError::Validation(format!(
                        "Stock insuficiente para el producto '{}'. Disponible: {}, Solicitado: {}",
                        nombre, stock_actual, item.cantidad
                    )));
                }

                let nuevo_stock = stock_actual - item.cantidad;
                let costo_ref: Decimal = prod_row
                    .get::<Option<String>, _>("precio_compra_referencial")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(Decimal::ZERO);
                let nombre_prod: String = prod_row.get("nombre");

                // Descontar stock
                sqlx::query(
                    "UPDATE productos SET stock_actual = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
                )
                .bind(nuevo_stock)
                .bind(prod_id)
                .execute(&mut *tx)
                .await?;

                // Kardex inmutable
                sqlx::query(
                    r#"
                    INSERT INTO inventario_movimientos (
                        producto_id, tipo_movimiento, signo, cantidad,
                        stock_anterior, stock_resultante, costo_unitario_momento,
                        motivo_justificacion, registrado_por_usuario_id
                    )
                    VALUES (?, 'SALIDA_VENTA', '-', ?, ?, ?, ?, ?, ?)
                    "#,
                )
                .bind(prod_id)
                .bind(item.cantidad)
                .bind(stock_actual)
                .bind(nuevo_stock)
                .bind(costo_ref.to_string())
                .bind(format!("Venta POS #{} al público/cliente", venta_id))
                .bind(session.user_id)
                .execute(&mut *tx)
                .await?;

                // Detalle venta
                sqlx::query(
                    r#"
                    INSERT INTO venta_detalles (
                        venta_id, tipo_item, producto_id, plan_id, credito_id,
                        descripcion, cantidad, precio_unitario, subtotal
                    )
                    VALUES (?, 'PRODUCTO', ?, NULL, NULL, ?, ?, ?, ?)
                    "#,
                )
                .bind(venta_id)
                .bind(prod_id)
                .bind(&nombre_prod)
                .bind(item.cantidad)
                .bind(item.precio_unitario.to_string())
                .bind(item.subtotal.to_string())
                .execute(&mut *tx)
                .await?;
            }
            PosItemType::Plan => {
                let cliente_id = input.cliente_id.ok_or_else(|| {
                    AppError::Validation(
                        "La venta de un plan de membresía requiere un cliente registrado.".into(),
                    )
                })?;

                let plan_id = item.plan_id.ok_or_else(|| {
                    AppError::Validation("El ítem de tipo PLAN exige plan_id.".into())
                })?;

                let plan_row = sqlx::query(
                    r#"
                    SELECT id, codigo, nombre, tipo_plan, duracion_meses, precio_base, estado_activo
                    FROM planes WHERE id = ?
                    "#,
                )
                .bind(plan_id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(|| AppError::NotFound(format!("Plan con ID {} no existe.", plan_id)))?;

                let estado_activo: i64 = plan_row.get("estado_activo");
                if estado_activo != 1 {
                    let nombre: String = plan_row.get("nombre");
                    return Err(AppError::Validation(format!(
                        "El plan '{}' está inactivo.",
                        nombre
                    )));
                }

                let tipo_plan: String = plan_row.get("tipo_plan");
                let duracion_meses: i64 = plan_row.get("duracion_meses");
                let plan_nombre: String = plan_row.get("nombre");

                let fecha_inicio = item
                    .fecha_inicio_plan
                    .clone()
                    .unwrap_or_else(|| hoy_fecha.clone());

                let preview = calcular_fecha_vencimiento(
                    &fecha_inicio,
                    &tipo_plan,
                    Some(duracion_meses),
                )?;

                // Registrar en membresias_clientes
                sqlx::query(
                    r#"
                    INSERT INTO membresias_clientes (
                        cliente_id, plan_id, venta_id, fecha_inicio,
                        fecha_vencimiento, precio_pactado, estado, registrado_por_usuario_id
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'ACTIVA', ?)
                    "#,
                )
                .bind(cliente_id)
                .bind(plan_id)
                .bind(venta_id)
                .bind(&fecha_inicio)
                .bind(&preview.fecha_vencimiento_date)
                .bind(item.subtotal.to_string())
                .bind(session.user_id)
                .execute(&mut *tx)
                .await?;

                // Detalle venta
                sqlx::query(
                    r#"
                    INSERT INTO venta_detalles (
                        venta_id, tipo_item, producto_id, plan_id, credito_id,
                        descripcion, cantidad, precio_unitario, subtotal,
                        fecha_inicio_plan, fecha_fin_plan
                    )
                    VALUES (?, 'PLAN', NULL, ?, NULL, ?, ?, ?, ?, ?, ?)
                    "#,
                )
                .bind(venta_id)
                .bind(plan_id)
                .bind(&plan_nombre)
                .bind(item.cantidad)
                .bind(item.precio_unitario.to_string())
                .bind(item.subtotal.to_string())
                .bind(&fecha_inicio)
                .bind(&preview.fecha_vencimiento_date)
                .execute(&mut *tx)
                .await?;
            }
            PosItemType::AmortizacionCredito => {
                let cliente_id = input.cliente_id.ok_or_else(|| {
                    AppError::Validation(
                        "La amortización de deuda requiere asociar el cliente deudor.".into(),
                    )
                })?;

                let credito_id = item.credito_id.ok_or_else(|| {
                    AppError::Validation(
                        "El ítem AMORTIZACION_CREDITO exige credito_id.".into(),
                    )
                })?;

                let cred_row = sqlx::query(
                    r#"
                    SELECT id, cliente_id, descripcion, CAST(saldo_pendiente AS TEXT) AS saldo_pendiente, estado
                    FROM creditos_clientes WHERE id = ?
                    "#,
                )
                .bind(credito_id)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(|| AppError::NotFound(format!("Crédito con ID {} no existe.", credito_id)))?;

                let cred_cliente_id: i64 = cred_row.get("cliente_id");
                if cred_cliente_id != cliente_id {
                    return Err(AppError::Validation(
                        "El crédito especificado no pertenece al cliente seleccionado.".into(),
                    ));
                }

                let cred_estado: String = cred_row.get("estado");
                if cred_estado != "PENDIENTE" {
                    return Err(AppError::Validation(
                        "El crédito no se encuentra en estado PENDIENTE de cobro.".into(),
                    ));
                }

                let saldo_pendiente: Decimal = cred_row
                    .get::<Option<String>, _>("saldo_pendiente")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(Decimal::ZERO);

                if item.subtotal > saldo_pendiente {
                    return Err(AppError::Validation(format!(
                        "El monto a amortizar ({}) supera el saldo pendiente del crédito ({}).",
                        item.subtotal, saldo_pendiente
                    )));
                }

                let nuevo_saldo = saldo_pendiente - item.subtotal;
                let nuevo_estado = if nuevo_saldo == Decimal::ZERO {
                    "PAGADO"
                } else {
                    "PENDIENTE"
                };

                let desc: String = cred_row.get("descripcion");

                // Actualizar cuenta por cobrar
                sqlx::query(
                    r#"
                    UPDATE creditos_clientes
                    SET monto_pagado = monto_pagado + ?,
                        saldo_pendiente = ?,
                        estado = ?,
                        fecha_ultimo_pago = datetime('now', 'localtime'),
                        updated_at = datetime('now', 'localtime')
                    WHERE id = ?
                    "#,
                )
                .bind(item.subtotal.to_string())
                .bind(nuevo_saldo.to_string())
                .bind(nuevo_estado)
                .bind(credito_id)
                .execute(&mut *tx)
                .await?;

                // Detalle venta
                sqlx::query(
                    r#"
                    INSERT INTO venta_detalles (
                        venta_id, tipo_item, producto_id, plan_id, credito_id,
                        descripcion, cantidad, precio_unitario, subtotal
                    )
                    VALUES (?, 'AMORTIZACION_CREDITO', NULL, NULL, ?, ?, ?, ?, ?)
                    "#,
                )
                .bind(venta_id)
                .bind(credito_id)
                .bind(format!("Amortización: {}", desc))
                .bind(item.cantidad)
                .bind(item.precio_unitario.to_string())
                .bind(item.subtotal.to_string())
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    // 7. Si hay saldo pendiente a crédito, registrar en creditos_clientes
    if saldo_credito_generado > Decimal::ZERO {
        let cliente_id = input.cliente_id.unwrap();
        let origen = if contiene_plan {
            CreditOrigin::MembresiaPagoParcial
        } else {
            CreditOrigin::ProductoCredito
        };

        let desc = format!("Crédito generado en Venta POS #{}", venta_id);

        sqlx::query(
            r#"
            INSERT INTO creditos_clientes (
                cliente_id, venta_origen_id, origen_credito, descripcion,
                monto_total, monto_pagado, saldo_pendiente, estado,
                registrado_por_usuario_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)
            "#,
        )
        .bind(cliente_id)
        .bind(venta_id)
        .bind(origen.to_string())
        .bind(desc)
        .bind(total_venta.to_string())
        .bind(total_pagado_retenido.to_string())
        .bind(saldo_credito_generado.to_string())
        .bind(session.user_id)
        .execute(&mut *tx)
        .await?;
    }

    // 8. Registrar pagos en tabla pagos
    if efectivo_neto > Decimal::ZERO {
        sqlx::query(
            r#"
            INSERT INTO pagos (
                venta_id, turno_caja_id, metodo_pago, canal_caja, monto, estado_pago
            )
            VALUES (?, ?, 'EFECTIVO', 'FISICA', ?, 'ACTIVO')
            "#,
        )
        .bind(venta_id)
        .bind(active_shift.id)
        .bind(efectivo_neto.to_string())
        .execute(&mut *tx)
        .await?;
    }

    for p in &input.pagos {
        if p.metodo_pago != PaymentMethod::Efectivo {
            sqlx::query(
                r#"
                INSERT INTO pagos (
                    venta_id, turno_caja_id, metodo_pago, canal_caja, monto,
                    referencia_operacion, estado_pago
                )
                VALUES (?, ?, ?, 'DIGITAL', ?, ?, 'ACTIVO')
                "#,
            )
            .bind(venta_id)
            .bind(active_shift.id)
            .bind(p.metodo_pago.to_string())
            .bind(p.monto.to_string())
            .bind(&p.referencia_operacion)
            .execute(&mut *tx)
            .await?;
        }
    }

    // 9. Actualizar acumulados de turnos_caja
    let mut nuevo_desglose = active_shift.desglose_digital.clone();
    nuevo_desglose.yape += digital_delta.yape;
    nuevo_desglose.plin += digital_delta.plin;
    nuevo_desglose.transferencia += digital_delta.transferencia;
    nuevo_desglose.tarjeta += digital_delta.tarjeta;

    let nuevo_desglose_json = serialize_digital_breakdown(&nuevo_desglose);

    sqlx::query(
        r#"
        UPDATE turnos_caja
        SET total_ventas_efectivo = total_ventas_efectivo + ?,
            total_efectivo_esperado = total_efectivo_esperado + ?,
            total_ventas_digital = total_ventas_digital + ?,
            desglose_digital_json = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(efectivo_neto.to_string())
    .bind(efectivo_neto.to_string())
    .bind(total_digital.to_string())
    .bind(&nuevo_desglose_json)
    .bind(active_shift.id)
    .execute(&mut *tx)
    .await?;

    // 10. Auditoría compacta (< 200B)
    let audit_details = serde_json::json!({
        "sale_id": venta_id,
        "total": total_venta.to_string(),
        "efectivo": efectivo_neto.to_string(),
        "digital": total_digital.to_string(),
        "credito": saldo_credito_generado.to_string()
    })
    .to_string();

    tx.commit().await?;

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "POS_SALE_CREATED",
        "CAJA_POS",
        &audit_details,
        None,
    )
    .await;

    get_sale_detail(pool, session, venta_id).await
}

// ============================================================================
// 3. FLUJO DE TACHADO EN 2 PASOS
// ============================================================================

/// Paso 1: Tachado en Turno Abierto (Operadores: Recepcionista, Supervisor, Administrador)
pub async fn strike_sale(
    pool: &SqlitePool,
    session: &AuthSession,
    sale_id: i64,
    input: StrikeSaleInput,
) -> Result<SaleDetailDto, AppError> {
    let motivo = input.motivo_tachado.trim();
    if motivo.chars().count() < 5 {
        return Err(AppError::Validation(
            "El motivo del tachado debe tener al menos 5 caracteres.".into(),
        ));
    }

    // Consultar venta y estado de su turno
    let row = sqlx::query(
        r#"
        SELECT 
            v.id,
            v.turno_caja_id,
            v.estado_venta,
            CAST(v.monto_pagado_efectivo AS TEXT) AS monto_pagado_efectivo,
            CAST(v.monto_pagado_digital AS TEXT) AS monto_pagado_digital,
            t.estado AS turno_estado
        FROM ventas v
        INNER JOIN turnos_caja t ON t.id = v.turno_caja_id
        WHERE v.id = ?
        "#,
    )
    .bind(sale_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Venta con ID {} no encontrada.", sale_id)))?;

    let estado_venta: String = row.get("estado_venta");
    let turno_estado: String = row.get("turno_estado");

    if estado_venta != "COMPLETADA" {
        return Err(AppError::Validation(
            "Solo se pueden tachar ventas que se encuentren en estado COMPLETADA.".into(),
        ));
    }

    if turno_estado != "ABIERTO" {
        return Err(AppError::Validation(
            "No se puede tachar una venta de un turno ya cerrado.".into(),
        ));
    }

    let efectivo_venta: Decimal = row
        .get::<Option<String>, _>("monto_pagado_efectivo")
        .and_then(|s| s.parse().ok())
        .unwrap_or(Decimal::ZERO);
    let digital_venta: Decimal = row
        .get::<Option<String>, _>("monto_pagado_digital")
        .and_then(|s| s.parse().ok())
        .unwrap_or(Decimal::ZERO);
    let turno_id: i64 = row.get("turno_caja_id");

    // Verificar si originó crédito y si tiene amortizaciones posteriores
    let cred_opt = sqlx::query(
        r#"
        SELECT id, CAST(monto_pagado AS TEXT) AS monto_pagado
        FROM creditos_clientes WHERE venta_origen_id = ?
        "#,
    )
    .bind(sale_id)
    .fetch_optional(pool)
    .await?;

    if let Some(cr) = cred_opt {
        let cred_pagado: Decimal = cr
            .get::<Option<String>, _>("monto_pagado")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO);
        let venta_pagado_inicial = efectivo_venta + digital_venta;
        if cred_pagado > venta_pagado_inicial {
            return Err(AppError::Conflict(
                "No se puede tachar la venta original mientras existan amortizaciones posteriores no tachadas.".into(),
            ));
        }
    }

    let mut tx = pool.begin().await?;

    // 1. Marcar venta como TACHADA_EN_TURNO
    sqlx::query(
        r#"
        UPDATE ventas
        SET estado_venta = 'TACHADA_EN_TURNO',
            tachado_por_usuario_id = ?,
            fecha_tachado = datetime('now', 'localtime'),
            motivo_tachado = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(session.user_id)
    .bind(motivo)
    .bind(sale_id)
    .execute(&mut *tx)
    .await?;

    // 2. Marcar pagos de la venta como REVERTIDO
    sqlx::query(
        "UPDATE pagos SET estado_pago = 'REVERTIDO' WHERE venta_id = ? AND estado_pago = 'ACTIVO'",
    )
    .bind(sale_id)
    .execute(&mut *tx)
    .await?;

    // 3. Revertir stock de productos y registrar REVERSION_TACHADO en inventario
    let detalles = sqlx::query(
        r#"
        SELECT id, tipo_item, producto_id, plan_id, credito_id, cantidad,
               CAST(subtotal AS TEXT) AS subtotal
        FROM venta_detalles WHERE venta_id = ?
        "#,
    )
    .bind(sale_id)
    .fetch_all(&mut *tx)
    .await?;

    for det in &detalles {
        let tipo_item: String = det.get("tipo_item");
        if tipo_item == "PRODUCTO" {
            let prod_id: i64 = det.get("producto_id");
            let cant: i64 = det.get("cantidad");

            let prod_row = sqlx::query(
                "SELECT stock_actual, CAST(precio_compra_referencial AS TEXT) AS precio_compra_referencial FROM productos WHERE id = ?",
            )
            .bind(prod_id)
            .fetch_one(&mut *tx)
            .await?;

            let stock_ant: i64 = prod_row.get("stock_actual");
            let costo_ref: Decimal = prod_row
                .get::<Option<String>, _>("precio_compra_referencial")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO);
            let stock_res = stock_ant + cant;

            sqlx::query(
                "UPDATE productos SET stock_actual = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            )
            .bind(stock_res)
            .bind(prod_id)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                r#"
                INSERT INTO inventario_movimientos (
                    producto_id, tipo_movimiento, signo, cantidad,
                    stock_anterior, stock_resultante, costo_unitario_momento,
                    motivo_justificacion, registrado_por_usuario_id
                )
                VALUES (?, 'REVERSION_TACHADO', '+', ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(prod_id)
            .bind(cant)
            .bind(stock_ant)
            .bind(stock_res)
            .bind(costo_ref.to_string())
            .bind(format!("Reversión por tachado de Venta #{}", sale_id))
            .bind(session.user_id)
            .execute(&mut *tx)
            .await?;
        } else if tipo_item == "AMORTIZACION_CREDITO" {
            let cred_id: i64 = det.get("credito_id");
            let subtotal: Decimal = det
                .get::<Option<String>, _>("subtotal")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO);

            // Restaurar crédito original
            sqlx::query(
                r#"
                UPDATE creditos_clientes
                SET monto_pagado = monto_pagado - ?,
                    saldo_pendiente = saldo_pendiente + ?,
                    estado = 'PENDIENTE',
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
                "#,
            )
            .bind(subtotal.to_string())
            .bind(subtotal.to_string())
            .bind(cred_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    // 4. Marcar membresías de esa venta como ANULADA
    sqlx::query(
        "UPDATE membresias_clientes SET estado = 'ANULADA', updated_at = datetime('now', 'localtime') WHERE venta_id = ? AND estado = 'ACTIVA'",
    )
    .bind(sale_id)
    .execute(&mut *tx)
    .await?;

    // 5. Anular crédito originado por la venta si lo hubiera
    sqlx::query(
        "UPDATE creditos_clientes SET estado = 'ANULADO', saldo_pendiente = 0.00, updated_at = datetime('now', 'localtime') WHERE venta_origen_id = ?",
    )
    .bind(sale_id)
    .execute(&mut *tx)
    .await?;

    // 6. Descontar del turno abierto el efectivo y digital
    let shift_row = sqlx::query("SELECT desglose_digital_json FROM turnos_caja WHERE id = ?")
        .bind(turno_id)
        .fetch_one(&mut *tx)
        .await?;
    let mut current_breakdown = parse_digital_breakdown(&shift_row.get::<String, _>("desglose_digital_json"));

    // Descontar cada medio digital que se pagó en esta venta
    let pagos_venta = sqlx::query("SELECT metodo_pago, CAST(monto AS TEXT) AS monto FROM pagos WHERE venta_id = ?")
        .bind(sale_id)
        .fetch_all(&mut *tx)
        .await?;

    for pv in pagos_venta {
        let metodo: String = pv.get("metodo_pago");
        let monto: Decimal = pv
            .get::<Option<String>, _>("monto")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO);
        match metodo.as_str() {
            "YAPE" => current_breakdown.yape = (current_breakdown.yape - monto).max(Decimal::ZERO),
            "PLIN" => current_breakdown.plin = (current_breakdown.plin - monto).max(Decimal::ZERO),
            "TRANSFERENCIA" => {
                current_breakdown.transferencia =
                    (current_breakdown.transferencia - monto).max(Decimal::ZERO)
            }
            "TARJETA" => {
                current_breakdown.tarjeta =
                    (current_breakdown.tarjeta - monto).max(Decimal::ZERO)
            }
            _ => {}
        }
    }

    let nuevo_desglose_json = serialize_digital_breakdown(&current_breakdown);

    sqlx::query(
        r#"
        UPDATE turnos_caja
        SET total_ventas_efectivo = total_ventas_efectivo - ?,
            total_efectivo_esperado = total_efectivo_esperado - ?,
            total_ventas_digital = total_ventas_digital - ?,
            desglose_digital_json = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(efectivo_venta.to_string())
    .bind(efectivo_venta.to_string())
    .bind(digital_venta.to_string())
    .bind(&nuevo_desglose_json)
    .bind(turno_id)
    .execute(&mut *tx)
    .await?;

    // 7. Auditoría compacta (< 200B)
    let audit_details = serde_json::json!({
        "sale_id": sale_id,
        "motivo": motivo
    })
    .to_string();

    tx.commit().await?;

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "POS_SALE_STRUCK",
        "CAJA_POS",
        &audit_details,
        None,
    )
    .await;

    get_sale_detail(pool, session, sale_id).await
}

/// Paso 2: Resolución Definitiva (Confirmar Anulación o Revertir Tachado) — Exclusivo Administrador
pub async fn resolve_struck_sale(
    pool: &SqlitePool,
    session: &AuthSession,
    sale_id: i64,
    input: ResolveStruckSaleInput,
) -> Result<SaleDetailDto, AppError> {
    if session.rol != UserRole::Administrador {
        return Err(AppError::Forbidden(
            "Acceso denegado: solo un ADMINISTRADOR puede resolver ventas tachadas.".into(),
        ));
    }

    let row = sqlx::query(
        r#"
        SELECT 
            v.id,
            v.turno_caja_id,
            v.estado_venta,
            CAST(v.monto_pagado_efectivo AS TEXT) AS monto_pagado_efectivo,
            CAST(v.monto_pagado_digital AS TEXT) AS monto_pagado_digital,
            t.estado AS turno_estado
        FROM ventas v
        INNER JOIN turnos_caja t ON t.id = v.turno_caja_id
        WHERE v.id = ?
        "#,
    )
    .bind(sale_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Venta con ID {} no encontrada.", sale_id)))?;

    let estado_venta: String = row.get("estado_venta");
    let turno_estado: String = row.get("turno_estado");
    let turno_id: i64 = row.get("turno_caja_id");

    if estado_venta != "TACHADA_EN_TURNO" {
        return Err(AppError::Validation(
            "Solo se pueden resolver ventas que se encuentren en estado TACHADA_EN_TURNO.".into(),
        ));
    }

    match input.accion {
        ResolveStruckAction::ConfirmarAnulacion => {
            // Confirmación definitiva: funciona con turno abierto o cerrado
            let mut tx = pool.begin().await?;

            sqlx::query(
                r#"
                UPDATE ventas
                SET estado_venta = 'ANULADA_DEFINITIVA',
                    resuelto_por_admin_id = ?,
                    fecha_resolucion_tachado = datetime('now', 'localtime'),
                    nota_resolucion_tachado = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
                "#,
            )
            .bind(session.user_id)
            .bind(&input.nota_resolucion)
            .bind(sale_id)
            .execute(&mut *tx)
            .await?;

            let audit_details = serde_json::json!({
                "sale_id": sale_id,
                "accion": "CONFIRMAR_ANULACION"
            })
            .to_string();

            tx.commit().await?;

            let _ = record_audit(
                pool,
                Some(session.user_id),
                &session.username,
                "POS_SALE_STRUCK_RESOLVED",
                "CAJA_POS",
                &audit_details,
                None,
            )
            .await;
        }
        ResolveStruckAction::RevertirTachado => {
            // Exige obligatoriamente que el turno siga ABIERTO
            if turno_estado != "ABIERTO" {
                return Err(AppError::Validation(
                    "No es posible revertir un tachado si el turno de caja ya fue cerrado.".into(),
                ));
            }

            let mut tx = pool.begin().await?;

            // 1. Verificar stock actual de los productos
            let detalles = sqlx::query(
                r#"
                SELECT id, tipo_item, producto_id, plan_id, credito_id, cantidad,
                       CAST(subtotal AS TEXT) AS subtotal
                FROM venta_detalles WHERE venta_id = ?
                "#,
            )
            .bind(sale_id)
            .fetch_all(&mut *tx)
            .await?;

            for det in &detalles {
                let tipo: String = det.get("tipo_item");
                if tipo == "PRODUCTO" {
                    let prod_id: i64 = det.get("producto_id");
                    let cant: i64 = det.get("cantidad");

                    let p_row = sqlx::query("SELECT stock_actual, nombre FROM productos WHERE id = ?")
                        .bind(prod_id)
                        .fetch_one(&mut *tx)
                        .await?;

                    let stock: i64 = p_row.get("stock_actual");
                    if stock < cant {
                        let nom: String = p_row.get("nombre");
                        return Err(AppError::Validation(format!(
                            "No se puede revertir el tachado: stock insuficiente para '{}'. Disponible: {}, Requerido: {}",
                            nom, stock, cant
                        )));
                    }
                }
            }

            // 2. Volver a descontar stock e insertar SALIDA_VENTA
            for det in &detalles {
                let tipo: String = det.get("tipo_item");
                if tipo == "PRODUCTO" {
                    let prod_id: i64 = det.get("producto_id");
                    let cant: i64 = det.get("cantidad");

                    let p_row = sqlx::query(
                        "SELECT stock_actual, CAST(precio_compra_referencial AS TEXT) AS precio_compra_referencial FROM productos WHERE id = ?",
                    )
                    .bind(prod_id)
                    .fetch_one(&mut *tx)
                    .await?;

                    let stock_ant: i64 = p_row.get("stock_actual");
                    let stock_res = stock_ant - cant;
                    let costo_ref: Decimal = p_row
                        .get::<Option<String>, _>("precio_compra_referencial")
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(Decimal::ZERO);

                    sqlx::query("UPDATE productos SET stock_actual = ? WHERE id = ?")
                        .bind(stock_res)
                        .bind(prod_id)
                        .execute(&mut *tx)
                        .await?;

                    sqlx::query(
                        r#"
                        INSERT INTO inventario_movimientos (
                            producto_id, tipo_movimiento, signo, cantidad,
                            stock_anterior, stock_resultante, costo_unitario_momento,
                            motivo_justificacion, registrado_por_usuario_id
                        )
                        VALUES (?, 'SALIDA_VENTA', '-', ?, ?, ?, ?, ?, ?)
                        "#,
                    )
                    .bind(prod_id)
                    .bind(cant)
                    .bind(stock_ant)
                    .bind(stock_res)
                    .bind(costo_ref.to_string())
                    .bind(format!("Reactivación por reversión de tachado Venta #{}", sale_id))
                    .bind(session.user_id)
                    .execute(&mut *tx)
                    .await?;
                } else if tipo == "AMORTIZACION_CREDITO" {
                    let cred_id: i64 = det.get("credito_id");
                    let subtotal: Decimal = det
                        .get::<Option<String>, _>("subtotal")
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(Decimal::ZERO);

                    // Reaplica amortización
                    sqlx::query(
                        r#"
                        UPDATE creditos_clientes
                        SET monto_pagado = monto_pagado + ?,
                            saldo_pendiente = saldo_pendiente - ?,
                            estado = CASE WHEN (saldo_pendiente - ?) = 0 THEN 'PAGADO' ELSE 'PENDIENTE' END,
                            updated_at = datetime('now', 'localtime')
                        WHERE id = ?
                        "#,
                    )
                    .bind(subtotal.to_string())
                    .bind(subtotal.to_string())
                    .bind(subtotal.to_string())
                    .bind(cred_id)
                    .execute(&mut *tx)
                    .await?;
                }
            }

            // 3. Reactivar membresías
            sqlx::query(
                "UPDATE membresias_clientes SET estado = 'ACTIVA', updated_at = datetime('now', 'localtime') WHERE venta_id = ?",
            )
            .bind(sale_id)
            .execute(&mut *tx)
            .await?;

            // 4. Reactivar crédito originado si lo hubiera
            sqlx::query(
                r#"
                UPDATE creditos_clientes
                SET estado = 'PENDIENTE',
                    saldo_pendiente = ROUND(CAST(monto_total AS REAL) - CAST(monto_pagado AS REAL), 2),
                    updated_at = datetime('now', 'localtime')
                WHERE venta_origen_id = ?
                "#,
            )
            .bind(sale_id)
            .execute(&mut *tx)
            .await?;

            // 5. Reactivar pagos de la venta
            sqlx::query(
                "UPDATE pagos SET estado_pago = 'ACTIVO' WHERE venta_id = ?",
            )
            .bind(sale_id)
            .execute(&mut *tx)
            .await?;

            // 6. Sumar al turno abierto nuevamente
            let efectivo_venta: Decimal = row
                .get::<Option<String>, _>("monto_pagado_efectivo")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO);
            let digital_venta: Decimal = row
                .get::<Option<String>, _>("monto_pagado_digital")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO);

            let shift_row = sqlx::query("SELECT desglose_digital_json FROM turnos_caja WHERE id = ?")
                .bind(turno_id)
                .fetch_one(&mut *tx)
                .await?;
            let mut current_breakdown = parse_digital_breakdown(&shift_row.get::<String, _>("desglose_digital_json"));

            let pagos_venta = sqlx::query("SELECT metodo_pago, CAST(monto AS TEXT) AS monto FROM pagos WHERE venta_id = ?")
                .bind(sale_id)
                .fetch_all(&mut *tx)
                .await?;

            for pv in pagos_venta {
                let metodo: String = pv.get("metodo_pago");
                let monto: Decimal = pv
                    .get::<Option<String>, _>("monto")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(Decimal::ZERO);
                match metodo.as_str() {
                    "YAPE" => current_breakdown.yape += monto,
                    "PLIN" => current_breakdown.plin += monto,
                    "TRANSFERENCIA" => current_breakdown.transferencia += monto,
                    "TARJETA" => current_breakdown.tarjeta += monto,
                    _ => {}
                }
            }

            let nuevo_desglose_json = serialize_digital_breakdown(&current_breakdown);

            sqlx::query(
                r#"
                UPDATE turnos_caja
                SET total_ventas_efectivo = total_ventas_efectivo + ?,
                    total_efectivo_esperado = total_efectivo_esperado + ?,
                    total_ventas_digital = total_ventas_digital + ?,
                    desglose_digital_json = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
                "#,
            )
            .bind(efectivo_venta.to_string())
            .bind(efectivo_venta.to_string())
            .bind(digital_venta.to_string())
            .bind(&nuevo_desglose_json)
            .bind(turno_id)
            .execute(&mut *tx)
            .await?;

            // 7. Actualizar cabecera de la venta a COMPLETADA
            sqlx::query(
                r#"
                UPDATE ventas
                SET estado_venta = 'COMPLETADA',
                    resuelto_por_admin_id = ?,
                    fecha_resolucion_tachado = datetime('now', 'localtime'),
                    nota_resolucion_tachado = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
                "#,
            )
            .bind(session.user_id)
            .bind(&input.nota_resolucion)
            .bind(sale_id)
            .execute(&mut *tx)
            .await?;

            let audit_details = serde_json::json!({
                "sale_id": sale_id,
                "accion": "REVERTIR_TACHADO"
            })
            .to_string();

            tx.commit().await?;

            let _ = record_audit(
                pool,
                Some(session.user_id),
                &session.username,
                "POS_SALE_STRUCK_RESOLVED",
                "CAJA_POS",
                &audit_details,
                None,
            )
            .await;
        }
    }

    get_sale_detail(pool, session, sale_id).await
}

// ============================================================================
// 4. CONSULTAS DE VENTAS, CRÉDITOS Y MEMBRESÍAS (CERO AUDITORÍA)
// ============================================================================

pub async fn list_sales(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &SaleFilter,
) -> Result<Vec<SaleListItemDto>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            v.id,
            v.turno_caja_id,
            CASE 
                WHEN c.id IS NOT NULL THEN (p.nombres || ' ' || p.apellidos)
                ELSE NULL 
            END AS cliente_nombre_completo,
            CAST(v.total_venta AS TEXT) AS total_venta,
            CAST(v.monto_pagado_efectivo AS TEXT) AS monto_pagado_efectivo,
            CAST(v.monto_pagado_digital AS TEXT) AS monto_pagado_digital,
            CAST(v.saldo_credito_generado AS TEXT) AS saldo_credito_generado,
            v.estado_venta,
            uv.username AS usuario_vendedor_username,
            v.created_at
        FROM ventas v
        INNER JOIN usuarios_sistema uv ON uv.id = v.usuario_vendedor_id
        LEFT JOIN clientes c ON c.id = v.cliente_id
        LEFT JOIN personas p ON p.id = c.persona_id
        WHERE 1=1
        "#,
    );

    if let Some(tid) = filter.turno_caja_id {
        builder.push(" AND v.turno_caja_id = ");
        builder.push_bind(tid);
    }

    if let Some(cid) = filter.cliente_id {
        builder.push(" AND v.cliente_id = ");
        builder.push_bind(cid);
    }

    if let Some(st) = filter.estado_venta {
        builder.push(" AND v.estado_venta = ");
        builder.push_bind(st.to_string());
    }

    if let Some(ref desde) = filter.fecha_desde {
        builder.push(" AND v.created_at >= ");
        builder.push_bind(desde.clone());
    }

    if let Some(ref hasta) = filter.fecha_hasta {
        builder.push(" AND v.created_at <= ");
        builder.push_bind(hasta.clone());
    }

    builder.push(" ORDER BY v.id DESC");

    let limit = filter.limit.unwrap_or(50).clamp(1, 200);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        builder.push(" OFFSET ");
        builder.push_bind(offset.max(0));
    }

    let rows = builder.build().fetch_all(pool).await?;

    let mut list = Vec::new();
    for row in rows {
        let estado_str: String = row.get("estado_venta");
        list.push(SaleListItemDto {
            id: row.get("id"),
            turno_caja_id: row.get("turno_caja_id"),
            cliente_nombre_completo: row.get("cliente_nombre_completo"),
            total_venta: row
                .get::<Option<String>, _>("total_venta")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            monto_pagado_efectivo: row
                .get::<Option<String>, _>("monto_pagado_efectivo")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            monto_pagado_digital: row
                .get::<Option<String>, _>("monto_pagado_digital")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            saldo_credito_generado: row
                .get::<Option<String>, _>("saldo_credito_generado")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            estado_venta: estado_str.parse()?,
            usuario_vendedor_username: row.get("usuario_vendedor_username"),
            created_at: row.get("created_at"),
        });
    }

    Ok(list)
}

pub async fn get_sale_detail(
    pool: &SqlitePool,
    _session: &AuthSession,
    sale_id: i64,
) -> Result<SaleDetailDto, AppError> {
    let row = sqlx::query(
        r#"
        SELECT 
            v.id,
            v.turno_caja_id,
            v.cliente_id,
            CASE 
                WHEN c.id IS NOT NULL THEN (p.nombres || ' ' || p.apellidos)
                ELSE NULL 
            END AS cliente_nombre_completo,
            CASE 
                WHEN c.id IS NOT NULL THEN p.numero_documento
                ELSE NULL 
            END AS cliente_numero_documento,
            v.usuario_vendedor_id,
            uv.username AS usuario_vendedor_username,
            CAST(v.subtotal AS TEXT) AS subtotal,
            CAST(v.descuento AS TEXT) AS descuento,
            CAST(v.total_venta AS TEXT) AS total_venta,
            CAST(v.monto_pagado_efectivo AS TEXT) AS monto_pagado_efectivo,
            CAST(v.monto_pagado_digital AS TEXT) AS monto_pagado_digital,
            CAST(v.saldo_credito_generado AS TEXT) AS saldo_credito_generado,
            v.estado_venta,
            v.tachado_por_usuario_id,
            ut.username AS tachado_por_username,
            v.fecha_tachado,
            v.motivo_tachado,
            v.resuelto_por_admin_id,
            ur.username AS resuelto_por_admin_username,
            v.fecha_resolucion_tachado,
            v.nota_resolucion_tachado,
            v.notas,
            v.created_at
        FROM ventas v
        INNER JOIN usuarios_sistema uv ON uv.id = v.usuario_vendedor_id
        LEFT JOIN clientes c ON c.id = v.cliente_id
        LEFT JOIN personas p ON p.id = c.persona_id
        LEFT JOIN usuarios_sistema ut ON ut.id = v.tachado_por_usuario_id
        LEFT JOIN usuarios_sistema ur ON ur.id = v.resuelto_por_admin_id
        WHERE v.id = ?
        "#,
    )
    .bind(sale_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Venta con ID {} no encontrada.", sale_id)))?;

    let estado_str: String = row.get("estado_venta");

    // Obtener ítems del detalle
    let item_rows = sqlx::query(
        r#"
        SELECT 
            vd.id,
            vd.tipo_item,
            vd.producto_id,
            pr.codigo_sku AS producto_sku,
            vd.plan_id,
            pl.codigo AS plan_codigo,
            vd.credito_id,
            vd.descripcion,
            vd.cantidad,
            CAST(vd.precio_unitario AS TEXT) AS precio_unitario,
            CAST(vd.subtotal AS TEXT) AS subtotal,
            vd.fecha_inicio_plan,
            vd.fecha_fin_plan
        FROM venta_detalles vd
        LEFT JOIN productos pr ON pr.id = vd.producto_id
        LEFT JOIN planes pl ON pl.id = vd.plan_id
        WHERE vd.venta_id = ?
        ORDER BY vd.id ASC
        "#,
    )
    .bind(sale_id)
    .fetch_all(pool)
    .await?;

    let mut items = Vec::new();
    for ir in item_rows {
        let t_item: String = ir.get("tipo_item");
        items.push(SaleItemDetailDto {
            id: ir.get("id"),
            tipo_item: t_item.parse()?,
            producto_id: ir.get("producto_id"),
            producto_sku: ir.get("producto_sku"),
            plan_id: ir.get("plan_id"),
            plan_codigo: ir.get("plan_codigo"),
            credito_id: ir.get("credito_id"),
            descripcion: ir.get("descripcion"),
            cantidad: ir.get("cantidad"),
            precio_unitario: ir
                .get::<Option<String>, _>("precio_unitario")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            subtotal: ir
                .get::<Option<String>, _>("subtotal")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            fecha_inicio_plan: ir.get("fecha_inicio_plan"),
            fecha_fin_plan: ir.get("fecha_fin_plan"),
        });
    }

    // Obtener pagos
    let pago_rows = sqlx::query(
        r#"
        SELECT 
            p.id,
            p.metodo_pago,
            p.canal_caja,
            CAST(p.monto AS TEXT) AS monto,
            p.referencia_operacion,
            p.estado_pago,
            p.created_at
        FROM pagos p
        WHERE p.venta_id = ?
        ORDER BY p.id ASC
        "#,
    )
    .bind(sale_id)
    .fetch_all(pool)
    .await?;

    let mut pagos = Vec::new();
    for pr in pago_rows {
        let m_pago: String = pr.get("metodo_pago");
        let c_caja: String = pr.get("canal_caja");
        let e_pago: String = pr.get("estado_pago");

        pagos.push(PaymentDetailDto {
            id: pr.get("id"),
            metodo_pago: m_pago.parse()?,
            canal_caja: c_caja.parse()?,
            monto: pr
                .get::<Option<String>, _>("monto")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            referencia_operacion: pr.get("referencia_operacion"),
            estado_pago: e_pago.parse()?,
            created_at: pr.get("created_at"),
        });
    }

    Ok(SaleDetailDto {
        id: row.get("id"),
        turno_caja_id: row.get("turno_caja_id"),
        cliente_id: row.get("cliente_id"),
        cliente_nombre_completo: row.get("cliente_nombre_completo"),
        cliente_numero_documento: row.get("cliente_numero_documento"),
        usuario_vendedor_id: row.get("usuario_vendedor_id"),
        usuario_vendedor_username: row.get("usuario_vendedor_username"),
        subtotal: row
            .get::<Option<String>, _>("subtotal")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        descuento: row
            .get::<Option<String>, _>("descuento")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        total_venta: row
            .get::<Option<String>, _>("total_venta")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        monto_pagado_efectivo: row
            .get::<Option<String>, _>("monto_pagado_efectivo")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        monto_pagado_digital: row
            .get::<Option<String>, _>("monto_pagado_digital")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        saldo_credito_generado: row
            .get::<Option<String>, _>("saldo_credito_generado")
            .and_then(|s| s.parse().ok())
            .unwrap_or(Decimal::ZERO),
        estado_venta: estado_str.parse()?,
        tachado_por_usuario_id: row.get("tachado_por_usuario_id"),
        tachado_por_username: row.get("tachado_por_username"),
        fecha_tachado: row.get("fecha_tachado"),
        motivo_tachado: row.get("motivo_tachado"),
        resuelto_por_admin_id: row.get("resuelto_por_admin_id"),
        resuelto_por_admin_username: row.get("resuelto_por_admin_username"),
        fecha_resolucion_tachado: row.get("fecha_resolucion_tachado"),
        nota_resolucion_tachado: row.get("nota_resolucion_tachado"),
        notas: row.get("notas"),
        created_at: row.get("created_at"),
        items,
        pagos,
    })
}

pub async fn list_client_credits(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &ClientCreditFilter,
) -> Result<Vec<ClientCreditDto>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            cr.id,
            cr.cliente_id,
            (p.nombres || ' ' || p.apellidos) AS cliente_nombre_completo,
            p.numero_documento AS cliente_numero_documento,
            p.telefono AS cliente_telefono,
            cr.venta_origen_id,
            cr.origen_credito,
            cr.descripcion,
            CAST(cr.monto_total AS TEXT) AS monto_total,
            CAST(cr.monto_pagado AS TEXT) AS monto_pagado,
            CAST(cr.saldo_pendiente AS TEXT) AS saldo_pendiente,
            cr.estado,
            cr.registrado_por_usuario_id,
            u.username AS registrado_por_username,
            cr.fecha_emision,
            cr.fecha_ultimo_pago,
            cr.notas,
            cr.created_at
        FROM creditos_clientes cr
        INNER JOIN clientes c ON c.id = cr.cliente_id
        INNER JOIN personas p ON p.id = c.persona_id
        INNER JOIN usuarios_sistema u ON u.id = cr.registrado_por_usuario_id
        WHERE 1=1
        "#,
    );

    if let Some(cid) = filter.cliente_id {
        builder.push(" AND cr.cliente_id = ");
        builder.push_bind(cid);
    }

    if let Some(st) = filter.estado {
        builder.push(" AND cr.estado = ");
        builder.push_bind(st.to_string());
    }

    if let Some(orig) = filter.origen_credito {
        builder.push(" AND cr.origen_credito = ");
        builder.push_bind(orig.to_string());
    }

    if let Some(solo_deuda) = filter.solo_con_deuda {
        if solo_deuda {
            builder.push(" AND CAST(cr.saldo_pendiente AS REAL) > 0 AND cr.estado = 'PENDIENTE'");
        }
    }

    builder.push(" ORDER BY cr.id DESC");

    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        builder.push(" OFFSET ");
        builder.push_bind(offset.max(0));
    }

    let rows = builder.build().fetch_all(pool).await?;

    let mut list = Vec::new();
    for row in rows {
        let origen_str: String = row.get("origen_credito");
        let estado_str: String = row.get("estado");

        list.push(ClientCreditDto {
            id: row.get("id"),
            cliente_id: row.get("cliente_id"),
            cliente_nombre_completo: row.get("cliente_nombre_completo"),
            cliente_numero_documento: row.get("cliente_numero_documento"),
            cliente_telefono: row.get("cliente_telefono"),
            venta_origen_id: row.get("venta_origen_id"),
            origen_credito: origen_str.parse()?,
            descripcion: row.get("descripcion"),
            monto_total: row
                .get::<Option<String>, _>("monto_total")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            monto_pagado: row
                .get::<Option<String>, _>("monto_pagado")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            saldo_pendiente: row
                .get::<Option<String>, _>("saldo_pendiente")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            estado: estado_str.parse()?,
            registrado_por_usuario_id: row.get("registrado_por_usuario_id"),
            registrado_por_username: row.get("registrado_por_username"),
            fecha_emision: row.get("fecha_emision"),
            fecha_ultimo_pago: row.get("fecha_ultimo_pago"),
            notas: row.get("notas"),
            created_at: row.get("created_at"),
        });
    }

    Ok(list)
}

pub async fn list_client_memberships(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &ClientMembershipFilter,
) -> Result<Vec<ClientMembershipDto>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            m.id,
            m.cliente_id,
            (p.nombres || ' ' || p.apellidos) AS cliente_nombre_completo,
            m.plan_id,
            pl.nombre AS plan_nombre,
            pl.permite_recuperacion_dias,
            m.venta_id,
            m.fecha_inicio,
            m.fecha_vencimiento,
            CAST(m.precio_pactado AS TEXT) AS precio_pactado,
            m.estado,
            m.registrado_por_usuario_id,
            u.username AS registrado_por_username,
            m.created_at
        FROM membresias_clientes m
        INNER JOIN clientes c ON c.id = m.cliente_id
        INNER JOIN personas p ON p.id = c.persona_id
        INNER JOIN planes pl ON pl.id = m.plan_id
        INNER JOIN usuarios_sistema u ON u.id = m.registrado_por_usuario_id
        WHERE 1=1
        "#,
    );

    if let Some(cid) = filter.cliente_id {
        builder.push(" AND m.cliente_id = ");
        builder.push_bind(cid);
    }

    if let Some(pid) = filter.plan_id {
        builder.push(" AND m.plan_id = ");
        builder.push_bind(pid);
    }

    if let Some(st) = filter.estado {
        builder.push(" AND m.estado = ");
        builder.push_bind(st.to_string());
    }

    if let Some(solo_act) = filter.solo_activas {
        if solo_act {
            builder.push(" AND m.estado = 'ACTIVA'");
        }
    }

    builder.push(" ORDER BY m.id DESC");

    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        builder.push(" OFFSET ");
        builder.push_bind(offset.max(0));
    }

    let rows = builder.build().fetch_all(pool).await?;
    let hoy = Local::now().naive_local().date();

    let mut list = Vec::new();
    for row in rows {
        let estado_str: String = row.get("estado");
        let vencimiento_str: String = row.get("fecha_vencimiento");

        let dias_restantes = if let Ok(venc_date) =
            NaiveDate::parse_from_str(&vencimiento_str[0..10.min(vencimiento_str.len())], "%Y-%m-%d")
        {
            (venc_date - hoy).num_days()
        } else {
            0
        };

        let permite_rec_raw: i64 = row.get("permite_recuperacion_dias");
        let permite_recuperacion_dias = permite_rec_raw == 1;

        list.push(ClientMembershipDto {
            id: row.get("id"),
            cliente_id: row.get("cliente_id"),
            cliente_nombre_completo: row.get("cliente_nombre_completo"),
            plan_id: row.get("plan_id"),
            plan_nombre: row.get("plan_nombre"),
            venta_id: row.get("venta_id"),
            fecha_inicio: row.get("fecha_inicio"),
            fecha_vencimiento: vencimiento_str,
            precio_pactado: row
                .get::<Option<String>, _>("precio_pactado")
                .and_then(|s| s.parse().ok())
                .unwrap_or(Decimal::ZERO),
            estado: estado_str.parse()?,
            dias_restantes,
            permite_recuperacion_dias,
            registrado_por_usuario_id: row.get("registrado_por_usuario_id"),
            registrado_por_username: row.get("registrado_por_username"),
            created_at: row.get("created_at"),
        });
    }

    Ok(list)
}
