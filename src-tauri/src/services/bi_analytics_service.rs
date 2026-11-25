use crate::errors::AppError;
use crate::models::bi::{
    BiAttendanceAnalyticsDto, BiAttendanceFilterInput, BiAttendanceTimePoint, BiCategoryAmount,
    BiCategoryCount, BiControlAnalyticsDto, BiControlFilterInput, BiCriticalAuditRow,
    BiDeadStockRow, BiExecutivePdfInput, BiExportAttendanceInput, BiExportControlInput,
    BiExportFinanceInput, BiExportInventoryInput, BiExportMembersInput, BiFinanceAnalyticsDto,
    BiFinanceFilterInput, BiFinanceTimePoint, BiGranularity, BiHeatmapCell,
    BiInventoryAnalyticsDto, BiInventoryFilterInput, BiKpiComparison, BiMemberAtRiskRow,
    BiMembersAnalyticsDto, BiMembersFilterInput, BiMembersTimePoint, BiOperatorCashAuditRow,
    BiOperatorStrikeRow, BiPeakSlotDto, BiPlanPerformanceRow, BiProductPerformanceRow,
    BiShrinkageSummaryRow, BiSimpleOption, BiTopAttendingMemberRow, BiWeightSummaryDto,
};
use crate::models::dashboard::{ExportFileResult, ExportFormat};
use crate::models::finance::ExpenseCategory;
use crate::models::user::AuthSession;
use crate::services::dashboard_service::{
    build_csv_bytes, build_xlsx_bytes, finalize_export_and_audit, ExportCell,
};
use crate::services::permissions_service::{self, ReceptionistPermissionKey};
use crate::services::printing_backup_service::{
    escape_pdf, get_printing_backup_config, MinimalPdfDocument,
};
use chrono::{Datelike, Duration, Local, NaiveDate};
use rust_decimal::Decimal;
use sqlx::{Row, SqlitePool};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;

// ============================================================================
// HELPERS INTERNOS DE FECHAS, GRANULARIDAD Y CÁLCULOS
// ============================================================================

fn parse_decimal(s: Option<String>) -> Decimal {
    s.and_then(|val| val.trim().parse::<Decimal>().ok())
        .map(|d| d.round_dp(2))
        .unwrap_or(Decimal::ZERO)
}

fn round_pct(val: Decimal) -> f64 {
    let rounded = val.round_dp(1).to_string().parse::<f64>().unwrap_or(0.0);
    if rounded == 0.0 {
        0.0
    } else {
        rounded
    }
}

fn compute_delta_pct(actual: Decimal, anterior: Decimal) -> Option<f64> {
    if anterior.is_zero() {
        if actual.is_zero() {
            None
        } else if actual > Decimal::ZERO {
            Some(100.0)
        } else {
            Some(-100.0)
        }
    } else {
        let pct = ((actual - anterior) / anterior.abs()) * Decimal::from(100);
        Some(round_pct(pct))
    }
}

fn compute_margin_pct(flujo_neto: Decimal, ingresos: Decimal) -> f64 {
    if ingresos > Decimal::ZERO {
        round_pct((flujo_neto / ingresos) * Decimal::from(100))
    } else {
        0.0
    }
}

fn compute_share_pct(monto: Decimal, total: Decimal) -> f64 {
    if total > Decimal::ZERO {
        round_pct((monto / total) * Decimal::from(100))
    } else {
        0.0
    }
}

fn spanish_month_short(month: u32) -> &'static str {
    match month {
        1 => "Ene",
        2 => "Feb",
        3 => "Mar",
        4 => "Abr",
        5 => "May",
        6 => "Jun",
        7 => "Jul",
        8 => "Ago",
        9 => "Set",
        10 => "Oct",
        11 => "Nov",
        12 => "Dic",
        _ => "---",
    }
}

fn normalize_channel(raw: &Option<String>) -> Result<(&'static str, Option<&'static str>), AppError> {
    let trimmed = raw.as_deref().map(str::trim).filter(|s| !s.is_empty());
    match trimmed {
        None => Ok(("MIXTA", None)),
        Some(val) => match val.to_uppercase().as_str() {
            "MIXTA" | "TODOS" => Ok(("MIXTA", None)),
            "FISICA" => Ok(("FISICA", Some("FISICA"))),
            "DIGITAL" => Ok(("DIGITAL", Some("DIGITAL"))),
            other => Err(AppError::Validation(format!(
                "Canal de caja inválido: '{}'. Permitidos: MIXTA, FISICA, DIGITAL.",
                other
            ))),
        },
    }
}

struct ResolvedDatePeriod {
    desde: NaiveDate,
    hasta: NaiveDate,
    prev_desde: NaiveDate,
    prev_hasta: NaiveDate,
    n_days: i64,
    granularidad: BiGranularity,
}

fn resolve_date_period(
    raw_desde: &str,
    raw_hasta: &str,
    raw_granularity: Option<BiGranularity>,
) -> Result<ResolvedDatePeriod, AppError> {
    let today = Local::now().date_naive();

    let hasta = {
        let t = raw_hasta.trim();
        if t.is_empty() {
            today
        } else {
            NaiveDate::parse_from_str(t, "%Y-%m-%d").map_err(|_| {
                AppError::Validation(format!(
                    "Formato de fecha inválido en 'fecha_hasta': '{}'. Use YYYY-MM-DD.",
                    t
                ))
            })?
        }
    };

    let desde = {
        let t = raw_desde.trim();
        if t.is_empty() {
            hasta.checked_sub_signed(Duration::days(29)).ok_or_else(|| {
                AppError::Validation("Rango de fechas fuera de límite válido.".into())
            })?
        } else {
            NaiveDate::parse_from_str(t, "%Y-%m-%d").map_err(|_| {
                AppError::Validation(format!(
                    "Formato de fecha inválido en 'fecha_desde': '{}'. Use YYYY-MM-DD.",
                    t
                ))
            })?
        }
    };

    if !(1970..=2100).contains(&desde.year()) || !(1970..=2100).contains(&hasta.year()) {
        return Err(AppError::Validation(
            "El año de las fechas debe estar comprendido entre 1970 y 2100.".into(),
        ));
    }

    if hasta < desde {
        return Err(AppError::Validation(
            "La fecha inicial ('fecha_desde') no puede ser posterior a la fecha final ('fecha_hasta')."
                .into(),
        ));
    }

    let n_days = (hasta - desde).num_days() + 1;
    if n_days > 3660 {
        return Err(AppError::Validation(
            "El rango de fechas no puede superar los 10 años (3660 días).".into(),
        ));
    }

    if raw_granularity == Some(BiGranularity::Dia) && n_days > 366 {
        return Err(AppError::Validation(
            "La granularidad diaria admite un máximo de 366 días. Seleccione Semana o Mes.".into(),
        ));
    }

    let prev_hasta = desde.checked_sub_signed(Duration::days(1)).ok_or_else(|| {
        AppError::Validation("El periodo anterior supera el límite de fecha válido.".into())
    })?;
    let prev_desde = desde
        .checked_sub_signed(Duration::days(n_days))
        .ok_or_else(|| {
            AppError::Validation("El periodo anterior supera el límite de fecha válido.".into())
        })?;

    let granularidad = raw_granularity.unwrap_or_else(|| {
        if n_days <= 31 {
            BiGranularity::Dia
        } else if n_days <= 120 {
            BiGranularity::Semana
        } else {
            BiGranularity::Mes
        }
    });

    Ok(ResolvedDatePeriod {
        desde,
        hasta,
        prev_desde,
        prev_hasta,
        n_days,
        granularidad,
    })
}

struct ResolvedFinanceFilter {
    desde: NaiveDate,
    hasta: NaiveDate,
    prev_desde: NaiveDate,
    prev_hasta: NaiveDate,
    granularidad: BiGranularity,
    canal_label: &'static str,
    canal_sql: Option<&'static str>,
}

fn resolve_finance_filter(input: &BiFinanceFilterInput) -> Result<ResolvedFinanceFilter, AppError> {
    let period = resolve_date_period(&input.fecha_desde, &input.fecha_hasta, input.granularidad)?;
    let (canal_label, canal_sql) = normalize_channel(&input.canal_caja)?;

    Ok(ResolvedFinanceFilter {
        desde: period.desde,
        hasta: period.hasta,
        prev_desde: period.prev_desde,
        prev_hasta: period.prev_hasta,
        granularidad: period.granularidad,
        canal_label,
        canal_sql,
    })
}

fn date_bounds(desde: NaiveDate, hasta: NaiveDate) -> (String, String) {
    (
        desde.format("%Y-%m-%d").to_string(),
        format!("{} 23:59:59", hasta.format("%Y-%m-%d")),
    )
}

fn bucket_key_for_date(date: NaiveDate, granularity: BiGranularity) -> String {
    match granularity {
        BiGranularity::Dia => date.format("%Y-%m-%d").to_string(),
        BiGranularity::Semana => {
            let iso = date.iso_week();
            format!("{:04}-W{:02}", iso.year(), iso.week())
        }
        BiGranularity::Mes => date.format("%Y-%m").to_string(),
    }
}

fn build_time_buckets(
    desde: NaiveDate,
    hasta: NaiveDate,
    granularity: BiGranularity,
) -> Vec<(String, String)> {
    let mut buckets = Vec::new();
    match granularity {
        BiGranularity::Dia => {
            let mut d = desde;
            while d <= hasta {
                let key = d.format("%Y-%m-%d").to_string();
                let label = format!("{} {}", d.day(), spanish_month_short(d.month()));
                buckets.push((key, label));
                d += Duration::days(1);
            }
        }
        BiGranularity::Semana => {
            let mut d = desde;
            let mut last_iso: Option<(i32, u32)> = None;
            while d <= hasta {
                let iso = d.iso_week();
                let pair = (iso.year(), iso.week());
                if last_iso != Some(pair) {
                    let key = format!("{:04}-W{:02}", pair.0, pair.1);
                    let label = format!("Sem {}", pair.1);
                    buckets.push((key, label));
                    last_iso = Some(pair);
                }
                d += Duration::days(1);
            }
        }
        BiGranularity::Mes => {
            let mut year = desde.year();
            let mut month = desde.month();
            let end_year = hasta.year();
            let end_month = hasta.month();
            while (year, month) <= (end_year, end_month) {
                let key = format!("{:04}-{:02}", year, month);
                let label = format!("{} {}", spanish_month_short(month), year);
                buckets.push((key, label));
                if month == 12 {
                    year += 1;
                    month = 1;
                } else {
                    month += 1;
                }
            }
        }
    }
    buckets
}

// ============================================================================
// HELPERS SQL POR PERIODO
// ============================================================================

async fn fetch_sales_stats(
    pool: &SqlitePool,
    start: &str,
    end: &str,
    canal_sql: Option<&str>,
) -> Result<(i64, Decimal), AppError> {
    let row = sqlx::query(
        r#"
        SELECT
            COUNT(*) AS ventas_count,
            CAST(COALESCE(SUM(v.descuento), 0) AS TEXT) AS descuentos_totales
        FROM ventas v
        WHERE v.estado_venta = 'COMPLETADA'
          AND v.created_at BETWEEN ? AND ?
          AND (
              ? IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM pagos p
                  WHERE p.venta_id = v.id
                    AND p.estado_pago = 'ACTIVO'
                    AND p.canal_caja = ?
              )
          )
        "#,
    )
    .bind(start)
    .bind(end)
    .bind(canal_sql)
    .bind(canal_sql)
    .fetch_one(pool)
    .await?;

    let ventas_count: i64 = row.get("ventas_count");
    let descuentos = parse_decimal(row.get("descuentos_totales"));
    Ok((ventas_count, descuentos))
}

async fn fetch_scalar_totals(
    pool: &SqlitePool,
    start: &str,
    end: &str,
    canal_sql: Option<&str>,
) -> Result<(Decimal, Decimal, Decimal), AppError> {
    let ingresos_str: Option<String> = sqlx::query_scalar(
        r#"
        SELECT CAST(COALESCE(SUM(p.monto), 0) AS TEXT)
        FROM pagos p
        INNER JOIN ventas v ON v.id = p.venta_id
        WHERE p.estado_pago = 'ACTIVO'
          AND v.estado_venta = 'COMPLETADA'
          AND v.created_at BETWEEN ? AND ?
          AND (? IS NULL OR p.canal_caja = ?)
        "#,
    )
    .bind(start)
    .bind(end)
    .bind(canal_sql)
    .bind(canal_sql)
    .fetch_one(pool)
    .await?;

    let compras_str: Option<String> = sqlx::query_scalar(
        r#"
        SELECT CAST(COALESCE(SUM(total_compra), 0) AS TEXT)
        FROM compras_proveedores
        WHERE estado_activo = 1
          AND fecha_compra BETWEEN ? AND ?
          AND (? IS NULL OR canal_caja = ?)
        "#,
    )
    .bind(start)
    .bind(end)
    .bind(canal_sql)
    .bind(canal_sql)
    .fetch_one(pool)
    .await?;

    let gastos_str: Option<String> = sqlx::query_scalar(
        r#"
        SELECT CAST(COALESCE(SUM(monto), 0) AS TEXT)
        FROM gastos_operativos
        WHERE estado_activo = 1
          AND fecha_gasto BETWEEN ? AND ?
          AND (? IS NULL OR canal_caja = ?)
        "#,
    )
    .bind(start)
    .bind(end)
    .bind(canal_sql)
    .bind(canal_sql)
    .fetch_one(pool)
    .await?;

    Ok((
        parse_decimal(ingresos_str),
        parse_decimal(compras_str),
        parse_decimal(gastos_str),
    ))
}

// ============================================================================
// MOTOR ANALÍTICO BI: FINANZAS Y RENTABILIDAD
// ============================================================================

/// Calcula analítica financiera BI comparativa contra periodo anterior equivalente.
///
/// Regla de Mix por Líneas (`venta_detalles`) cuando `canal_caja` es `FISICA` o `DIGITAL`:
/// Cada línea de detalle de una venta `COMPLETADA` se pondera proporcionalmente según el peso
/// del canal sobre el total de pagos activos de esa venta (`pagos_canal / pagos_totales_venta`),
/// evitando doble conteo en ventas con pago mixto (efectivo + digital). En `MIXTA` se suman
/// directamente los subtotales completos de `venta_detalles`.
pub async fn get_bi_finance_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiFinanceFilterInput,
) -> Result<BiFinanceAnalyticsDto, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabFinanzas,
        "Acceso denegado: no tiene permiso para visualizar analítica financiera BI.",
    )
    .await?;

    compute_bi_finance_analytics(pool, input).await
}

async fn compute_bi_finance_analytics(
    pool: &SqlitePool,
    input: BiFinanceFilterInput,
) -> Result<BiFinanceAnalyticsDto, AppError> {

    let resolved = resolve_finance_filter(&input)?;
    let (cur_start, cur_end) = date_bounds(resolved.desde, resolved.hasta);
    let (prev_start, prev_end) = date_bounds(resolved.prev_desde, resolved.prev_hasta);

    // 1. Serie temporal agrupada por día en SQL y agregada a Dia / Semana / Mes con zero-filling
    let mut bucket_map: HashMap<String, (Decimal, Decimal, Decimal)> = HashMap::new();

    let income_daily_rows = sqlx::query(
        r#"
        SELECT
            substr(v.created_at, 1, 10) AS dia,
            CAST(COALESCE(SUM(p.monto), 0) AS TEXT) AS total
        FROM pagos p
        INNER JOIN ventas v ON v.id = p.venta_id
        WHERE p.estado_pago = 'ACTIVO'
          AND v.estado_venta = 'COMPLETADA'
          AND v.created_at BETWEEN ? AND ?
          AND (? IS NULL OR p.canal_caja = ?)
        GROUP BY substr(v.created_at, 1, 10)
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .bind(resolved.canal_sql)
    .bind(resolved.canal_sql)
    .fetch_all(pool)
    .await?;

    let mut cur_ingresos = Decimal::ZERO;
    for row in income_daily_rows {
        let dia_str: String = row.get("dia");
        let monto = parse_decimal(row.get("total"));
        cur_ingresos += monto;
        if let Ok(d) = NaiveDate::parse_from_str(&dia_str, "%Y-%m-%d") {
            let key = bucket_key_for_date(d, resolved.granularidad);
            let entry = bucket_map
                .entry(key)
                .or_insert((Decimal::ZERO, Decimal::ZERO, Decimal::ZERO));
            entry.0 += monto;
        }
    }

    let purchase_daily_rows = sqlx::query(
        r#"
        SELECT
            substr(fecha_compra, 1, 10) AS dia,
            CAST(COALESCE(SUM(total_compra), 0) AS TEXT) AS total
        FROM compras_proveedores
        WHERE estado_activo = 1
          AND fecha_compra BETWEEN ? AND ?
          AND (? IS NULL OR canal_caja = ?)
        GROUP BY substr(fecha_compra, 1, 10)
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .bind(resolved.canal_sql)
    .bind(resolved.canal_sql)
    .fetch_all(pool)
    .await?;

    let mut cur_compras = Decimal::ZERO;
    for row in purchase_daily_rows {
        let dia_str: String = row.get("dia");
        let monto = parse_decimal(row.get("total"));
        cur_compras += monto;
        if let Ok(d) = NaiveDate::parse_from_str(&dia_str, "%Y-%m-%d") {
            let key = bucket_key_for_date(d, resolved.granularidad);
            let entry = bucket_map
                .entry(key)
                .or_insert((Decimal::ZERO, Decimal::ZERO, Decimal::ZERO));
            entry.1 += monto;
        }
    }

    let expense_daily_rows = sqlx::query(
        r#"
        SELECT
            substr(fecha_gasto, 1, 10) AS dia,
            CAST(COALESCE(SUM(monto), 0) AS TEXT) AS total
        FROM gastos_operativos
        WHERE estado_activo = 1
          AND fecha_gasto BETWEEN ? AND ?
          AND (? IS NULL OR canal_caja = ?)
        GROUP BY substr(fecha_gasto, 1, 10)
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .bind(resolved.canal_sql)
    .bind(resolved.canal_sql)
    .fetch_all(pool)
    .await?;

    let mut cur_gastos = Decimal::ZERO;
    for row in expense_daily_rows {
        let dia_str: String = row.get("dia");
        let monto = parse_decimal(row.get("total"));
        cur_gastos += monto;
        if let Ok(d) = NaiveDate::parse_from_str(&dia_str, "%Y-%m-%d") {
            let key = bucket_key_for_date(d, resolved.granularidad);
            let entry = bucket_map
                .entry(key)
                .or_insert((Decimal::ZERO, Decimal::ZERO, Decimal::ZERO));
            entry.2 += monto;
        }
    }

    let buckets = build_time_buckets(resolved.desde, resolved.hasta, resolved.granularidad);
    let serie_temporal: Vec<BiFinanceTimePoint> = buckets
        .into_iter()
        .map(|(periodo_key, etiqueta)| {
            let (ing, comp, gast) = bucket_map
                .get(&periodo_key)
                .copied()
                .unwrap_or((Decimal::ZERO, Decimal::ZERO, Decimal::ZERO));
            let egresos = comp + gast;
            let flujo_neto = ing - egresos;
            BiFinanceTimePoint {
                periodo_key,
                etiqueta,
                ingresos: ing,
                compras: comp,
                gastos: gast,
                egresos,
                flujo_neto,
            }
        })
        .collect();

    // 2. Periodo anterior equivalente y métricas de ventas (ticket promedio, descuentos)
    let (prev_ingresos, prev_compras, prev_gastos) =
        fetch_scalar_totals(pool, &prev_start, &prev_end, resolved.canal_sql).await?;

    let (ventas_count, cur_descuentos) =
        fetch_sales_stats(pool, &cur_start, &cur_end, resolved.canal_sql).await?;
    let (ventas_anterior_count, prev_descuentos) =
        fetch_sales_stats(pool, &prev_start, &prev_end, resolved.canal_sql).await?;

    let cur_egresos = cur_compras + cur_gastos;
    let prev_egresos = prev_compras + prev_gastos;

    let cur_flujo_neto = cur_ingresos - cur_egresos;
    let prev_flujo_neto = prev_ingresos - prev_egresos;

    let cur_ticket_promedio = if ventas_count > 0 {
        (cur_ingresos / Decimal::from(ventas_count)).round_dp(2)
    } else {
        Decimal::ZERO
    };
    let prev_ticket_promedio = if ventas_anterior_count > 0 {
        (prev_ingresos / Decimal::from(ventas_anterior_count)).round_dp(2)
    } else {
        Decimal::ZERO
    };

    // 3. Mix por líneas (venta_detalles ponderado por canal si aplica)
    let line_rows = sqlx::query(
        r#"
        WITH sale_weights AS (
            SELECT
                v.id AS venta_id,
                CASE
                    WHEN ? IS NULL THEN 1.0
                    ELSE COALESCE(
                        (SELECT SUM(CAST(p2.monto AS REAL))
                         FROM pagos p2
                         WHERE p2.venta_id = v.id AND p2.estado_pago = 'ACTIVO' AND p2.canal_caja = ?),
                        0.0
                    ) / NULLIF(
                        (SELECT SUM(CAST(p3.monto AS REAL))
                         FROM pagos p3
                         WHERE p3.venta_id = v.id AND p3.estado_pago = 'ACTIVO'),
                        0.0
                    )
                END AS weight,
                CASE
                    WHEN ? IS NULL THEN 1
                    WHEN EXISTS (
                        SELECT 1 FROM pagos p4
                        WHERE p4.venta_id = v.id AND p4.estado_pago = 'ACTIVO' AND p4.canal_caja = ?
                    ) THEN 1
                    ELSE 0
                END AS has_channel
            FROM ventas v
            WHERE v.estado_venta = 'COMPLETADA'
              AND v.created_at BETWEEN ? AND ?
        )
        SELECT
            vd.tipo_item,
            CAST(ROUND(COALESCE(SUM(CAST(vd.subtotal AS REAL) * COALESCE(sw.weight, 0.0)), 0.0), 2) AS TEXT) AS total_monto,
            COALESCE(SUM(CASE WHEN sw.has_channel = 1 THEN vd.cantidad ELSE 0 END), 0) AS total_cantidad
        FROM venta_detalles vd
        INNER JOIN sale_weights sw ON sw.venta_id = vd.venta_id
        WHERE sw.has_channel = 1
        GROUP BY vd.tipo_item
        "#,
    )
    .bind(resolved.canal_sql)
    .bind(resolved.canal_sql)
    .bind(resolved.canal_sql)
    .bind(resolved.canal_sql)
    .bind(&cur_start)
    .bind(&cur_end)
    .fetch_all(pool)
    .await?;

    let mut line_map: HashMap<String, (Decimal, i64)> = HashMap::new();
    let mut line_total = Decimal::ZERO;
    for row in line_rows {
        let tipo: String = row.get("tipo_item");
        let monto = parse_decimal(row.get("total_monto"));
        let cantidad: i64 = row.get("total_cantidad");
        line_total += monto;
        line_map.insert(tipo, (monto, cantidad));
    }

    let mix_lineas: Vec<BiCategoryAmount> = [
        ("PLAN", "Planes / Membresías"),
        ("PRODUCTO", "Productos POS"),
        ("AMORTIZACION_CREDITO", "Cobro de Créditos"),
    ]
    .into_iter()
    .map(|(clave, etiqueta)| {
        let (monto, cantidad) = line_map
            .get(clave)
            .copied()
            .unwrap_or((Decimal::ZERO, 0));
        BiCategoryAmount {
            clave: clave.to_string(),
            etiqueta: etiqueta.to_string(),
            monto,
            porcentaje: compute_share_pct(monto, line_total),
            cantidad,
        }
    })
    .collect();

    // 4. Mix por métodos de pago
    let method_rows = sqlx::query(
        r#"
        SELECT
            p.metodo_pago,
            CAST(COALESCE(SUM(p.monto), 0) AS TEXT) AS total_monto,
            COUNT(*) AS cantidad
        FROM pagos p
        INNER JOIN ventas v ON v.id = p.venta_id
        WHERE p.estado_pago = 'ACTIVO'
          AND v.estado_venta = 'COMPLETADA'
          AND v.created_at BETWEEN ? AND ?
          AND (? IS NULL OR p.canal_caja = ?)
        GROUP BY p.metodo_pago
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .bind(resolved.canal_sql)
    .bind(resolved.canal_sql)
    .fetch_all(pool)
    .await?;

    let mut method_map: HashMap<String, (Decimal, i64)> = HashMap::new();
    let mut method_total = Decimal::ZERO;
    for row in method_rows {
        let metodo: String = row.get("metodo_pago");
        let monto = parse_decimal(row.get("total_monto"));
        let cantidad: i64 = row.get("cantidad");
        method_total += monto;
        method_map.insert(metodo, (monto, cantidad));
    }

    let mix_metodos_pago: Vec<BiCategoryAmount> = [
        ("EFECTIVO", "Efectivo"),
        ("YAPE", "Yape"),
        ("PLIN", "Plin"),
        ("TRANSFERENCIA", "Transferencia"),
        ("TARJETA", "Tarjeta"),
    ]
    .into_iter()
    .map(|(clave, etiqueta)| {
        let (monto, cantidad) = method_map
            .get(clave)
            .copied()
            .unwrap_or((Decimal::ZERO, 0));
        BiCategoryAmount {
            clave: clave.to_string(),
            etiqueta: etiqueta.to_string(),
            monto,
            porcentaje: compute_share_pct(monto, method_total),
            cantidad,
        }
    })
    .collect();

    // 5. Gastos por categoría (ordenado descendente por monto)
    let expense_cat_rows = sqlx::query(
        r#"
        SELECT
            categoria,
            CAST(COALESCE(SUM(monto), 0) AS TEXT) AS total_monto,
            COUNT(*) AS cantidad
        FROM gastos_operativos
        WHERE estado_activo = 1
          AND fecha_gasto BETWEEN ? AND ?
          AND (? IS NULL OR canal_caja = ?)
        GROUP BY categoria
        ORDER BY SUM(CAST(monto AS REAL)) DESC, categoria ASC
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .bind(resolved.canal_sql)
    .bind(resolved.canal_sql)
    .fetch_all(pool)
    .await?;

    let gastos_por_categoria: Vec<BiCategoryAmount> = expense_cat_rows
        .into_iter()
        .map(|row| {
            let clave: String = row.get("categoria");
            let monto = parse_decimal(row.get("total_monto"));
            let cantidad: i64 = row.get("cantidad");
            let etiqueta = ExpenseCategory::from_str(&clave)
                .map(|c| c.label().to_string())
                .unwrap_or_else(|_| clave.clone());
            BiCategoryAmount {
                clave,
                etiqueta,
                monto,
                porcentaje: compute_share_pct(monto, cur_gastos),
                cantidad,
            }
        })
        .collect();

    Ok(BiFinanceAnalyticsDto {
        fecha_desde: resolved.desde.format("%Y-%m-%d").to_string(),
        fecha_hasta: resolved.hasta.format("%Y-%m-%d").to_string(),
        periodo_anterior_desde: resolved.prev_desde.format("%Y-%m-%d").to_string(),
        periodo_anterior_hasta: resolved.prev_hasta.format("%Y-%m-%d").to_string(),
        granularidad_aplicada: resolved.granularidad,
        canal_aplicado: resolved.canal_label.to_string(),
        ingresos: BiKpiComparison {
            actual: cur_ingresos,
            anterior: prev_ingresos,
            delta_pct: compute_delta_pct(cur_ingresos, prev_ingresos),
        },
        compras: BiKpiComparison {
            actual: cur_compras,
            anterior: prev_compras,
            delta_pct: compute_delta_pct(cur_compras, prev_compras),
        },
        gastos: BiKpiComparison {
            actual: cur_gastos,
            anterior: prev_gastos,
            delta_pct: compute_delta_pct(cur_gastos, prev_gastos),
        },
        egresos: BiKpiComparison {
            actual: cur_egresos,
            anterior: prev_egresos,
            delta_pct: compute_delta_pct(cur_egresos, prev_egresos),
        },
        flujo_neto: BiKpiComparison {
            actual: cur_flujo_neto,
            anterior: prev_flujo_neto,
            delta_pct: compute_delta_pct(cur_flujo_neto, prev_flujo_neto),
        },
        margen_operativo_pct: compute_margin_pct(cur_flujo_neto, cur_ingresos),
        margen_operativo_anterior_pct: compute_margin_pct(prev_flujo_neto, prev_ingresos),
        ticket_promedio: BiKpiComparison {
            actual: cur_ticket_promedio,
            anterior: prev_ticket_promedio,
            delta_pct: compute_delta_pct(cur_ticket_promedio, prev_ticket_promedio),
        },
        descuentos_totales: BiKpiComparison {
            actual: cur_descuentos,
            anterior: prev_descuentos,
            delta_pct: compute_delta_pct(cur_descuentos, prev_descuentos),
        },
        ventas_count,
        ventas_anterior_count,
        serie_temporal,
        mix_lineas,
        mix_metodos_pago,
        gastos_por_categoria,
        generated_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// Exporta la serie temporal contextual de Finanzas BI en CSV o XLSX con fila de totales y auditoría.
pub async fn export_bi_finance_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiExportFinanceInput,
) -> Result<ExportFileResult, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabFinanzas,
        "Acceso denegado: no tiene permiso para visualizar analítica financiera BI.",
    )
    .await?;
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::ExportarContextualBi,
        "Acceso denegado: no tiene permiso para exportar reportes contextuales de BI.",
    )
    .await?;

    if input.format == ExportFormat::Pdf {
        return Err(AppError::Validation(
            "La exportación contextual de Finanzas BI solo soporta formatos CSV y XLSX.".into(),
        ));
    }

    let dto = get_bi_finance_analytics(pool, session, input.filter).await?;

    let headers = [
        "Periodo",
        "Ingresos",
        "Compras",
        "Gastos",
        "Egresos",
        "Flujo Neto",
    ];

    let mut rows: Vec<Vec<ExportCell>> = Vec::with_capacity(dto.serie_temporal.len() + 1);
    for pt in &dto.serie_temporal {
        rows.push(vec![
            ExportCell::Text(pt.periodo_key.clone()),
            ExportCell::Number(format!("{:.2}", pt.ingresos)),
            ExportCell::Number(format!("{:.2}", pt.compras)),
            ExportCell::Number(format!("{:.2}", pt.gastos)),
            ExportCell::Number(format!("{:.2}", pt.egresos)),
            ExportCell::Number(format!("{:.2}", pt.flujo_neto)),
        ]);
    }

    rows.push(vec![
        ExportCell::Text("TOTAL".to_string()),
        ExportCell::Number(format!("{:.2}", dto.ingresos.actual)),
        ExportCell::Number(format!("{:.2}", dto.compras.actual)),
        ExportCell::Number(format!("{:.2}", dto.gastos.actual)),
        ExportCell::Number(format!("{:.2}", dto.egresos.actual)),
        ExportCell::Number(format!("{:.2}", dto.flujo_neto.actual)),
    ]);

    let bytes = match input.format {
        ExportFormat::Csv => build_csv_bytes(&headers, &rows),
        ExportFormat::Xlsx => build_xlsx_bytes("Finanzas BI", &headers, &rows),
        ExportFormat::Pdf => unreachable!(),
    };

    let filename = format!(
        "bi_finanzas_{}_a_{}_{}.{}",
        dto.fecha_desde,
        dto.fecha_hasta,
        dto.canal_aplicado.to_lowercase(),
        input.format.extension()
    );

    finalize_export_and_audit(
        pool,
        session,
        "BI_FINANZAS_SERIE_TEMPORAL",
        filename,
        input.format,
        bytes,
        rows.len(),
    )
    .await
}

// ============================================================================
// HELPERS COMPARTIDOS DE DEMOGRAFÍA, EDAD, PLANES Y DISTRIBUCIONES (SLICE 3)
// ============================================================================

const AGE_BUCKETS: [(&str, &str); 7] = [
    ("MENOR_18", "Menor de 18"),
    ("18_24", "18 - 24 años"),
    ("25_34", "25 - 34 años"),
    ("35_44", "35 - 44 años"),
    ("45_54", "45 - 54 años"),
    ("55_MAS", "55+ años"),
    ("SIN_ESPECIFICAR", "Sin especificar"),
];

const GENDER_BUCKETS: [(&str, &str); 5] = [
    ("MASCULINO", "Masculino"),
    ("FEMENINO", "Femenino"),
    ("OTRO", "Otro"),
    ("PREFIERO_NO_DECIR", "Prefiero no decir"),
    ("SIN_ESPECIFICAR", "Sin especificar"),
];

const ACQUISITION_BUCKETS: [(&str, &str); 7] = [
    ("REDES_SOCIALES", "Redes Sociales"),
    ("RECOMENDACION", "Recomendación"),
    ("CAMINANTE_FACHADA", "Caminante / Fachada"),
    ("PUBLICIDAD_LOCAL", "Publicidad Local"),
    ("PROMOCION", "Promoción"),
    ("OTRO", "Otro"),
    ("SIN_ESPECIFICAR", "Sin especificar"),
];

fn validate_optional_enum_filter(
    raw: &Option<String>,
    allowed: &[&str],
    field_name: &str,
) -> Result<Option<String>, AppError> {
    let trimmed = raw.as_deref().map(str::trim).filter(|s| !s.is_empty());
    match trimmed {
        None => Ok(None),
        Some(val) => {
            let upper = val.to_uppercase();
            if upper == "TODOS" {
                return Ok(None);
            }
            if allowed.contains(&upper.as_str()) {
                Ok(Some(upper))
            } else {
                Err(AppError::Validation(format!(
                    "Valor inválido en '{}': '{}'. Permitidos: {}.",
                    field_name,
                    upper,
                    allowed.join(", ")
                )))
            }
        }
    }
}

fn parse_naive_date_prefix(raw: &str) -> Option<NaiveDate> {
    let trimmed = raw.trim();
    if trimmed.len() < 10 {
        return None;
    }
    NaiveDate::parse_from_str(&trimmed[..10], "%Y-%m-%d").ok()
}

fn classify_age_bucket(fecha_nacimiento: Option<&str>, ref_date: NaiveDate) -> &'static str {
    let Some(dob) = fecha_nacimiento.and_then(parse_naive_date_prefix) else {
        return "SIN_ESPECIFICAR";
    };
    if dob > ref_date {
        return "SIN_ESPECIFICAR";
    }
    let mut age = ref_date.year() - dob.year();
    if (ref_date.month(), ref_date.day()) < (dob.month(), dob.day()) {
        age -= 1;
    }
    if age < 0 {
        "SIN_ESPECIFICAR"
    } else if age < 18 {
        "MENOR_18"
    } else if age <= 24 {
        "18_24"
    } else if age <= 34 {
        "25_34"
    } else if age <= 44 {
        "35_44"
    } else if age <= 54 {
        "45_54"
    } else {
        "55_MAS"
    }
}

fn normalize_demographic_bucket(raw: Option<&str>) -> String {
    match raw.map(str::trim).filter(|s| !s.is_empty()) {
        Some(v) => v.to_uppercase(),
        None => "SIN_ESPECIFICAR".to_string(),
    }
}

fn build_category_counts(
    buckets: &[(&str, &str)],
    counts: &HashMap<String, i64>,
    total: i64,
) -> Vec<BiCategoryCount> {
    buckets
        .iter()
        .map(|(clave, etiqueta)| {
            let cantidad = *counts.get(*clave).unwrap_or(&0);
            let porcentaje = if total > 0 {
                round_pct((Decimal::from(cantidad) / Decimal::from(total)) * Decimal::from(100))
            } else {
                0.0
            };
            BiCategoryCount {
                clave: (*clave).to_string(),
                etiqueta: (*etiqueta).to_string(),
                cantidad,
                porcentaje,
            }
        })
        .collect()
}

async fn fetch_active_plans_options(pool: &SqlitePool) -> Result<Vec<BiSimpleOption>, AppError> {
    let rows = sqlx::query(
        "SELECT id, nombre FROM planes WHERE estado_activo = 1 ORDER BY tipo_plan ASC, duracion_meses ASC, id ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| BiSimpleOption {
            id: r.get("id"),
            label: r.get("nombre"),
        })
        .collect())
}

fn weekday_name_es(dia_semana: i32) -> &'static str {
    match dia_semana {
        0 => "Lunes",
        1 => "Martes",
        2 => "Miércoles",
        3 => "Jueves",
        4 => "Viernes",
        5 => "Sábado",
        6 => "Domingo",
        _ => "Desconocido",
    }
}

// ============================================================================
// BI-SLICE 3A: SOCIOS Y RETENCIÓN
// ============================================================================

struct ClientBioRecord {
    estado_activo: bool,
    created_date: Option<NaiveDate>,
    nombre_completo: String,
    telefono: Option<String>,
    peso_actual_kg: Option<Decimal>,
    age_bucket: &'static str,
    genero_bucket: String,
    captacion_bucket: String,
}

struct MembershipRecord {
    id: i64,
    plan_id: i64,
    plan_nombre: String,
    fecha_inicio: NaiveDate,
    fecha_vencimiento: NaiveDate,
    fecha_vencimiento_raw: String,
    precio_pactado: Decimal,
    estado: String,
    is_renewal: bool,
}

pub async fn get_bi_members_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiMembersFilterInput,
) -> Result<BiMembersAnalyticsDto, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabSocios,
        "Acceso denegado: no tiene permiso para visualizar analítica de socios y retención.",
    )
    .await?;

    compute_bi_members_analytics(pool, input).await
}

async fn compute_bi_members_analytics(
    pool: &SqlitePool,
    input: BiMembersFilterInput,
) -> Result<BiMembersAnalyticsDto, AppError> {

    let period = resolve_date_period(&input.fecha_desde, &input.fecha_hasta, input.granularidad)?;
    let filter_age = validate_optional_enum_filter(
        &input.rango_edad,
        &[
            "MENOR_18",
            "18_24",
            "25_34",
            "35_44",
            "45_54",
            "55_MAS",
            "SIN_ESPECIFICAR",
        ],
        "rango_edad",
    )?;
    let filter_genero = validate_optional_enum_filter(
        &input.genero,
        &[
            "MASCULINO",
            "FEMENINO",
            "OTRO",
            "PREFIERO_NO_DECIR",
            "SIN_ESPECIFICAR",
        ],
        "genero",
    )?;
    let filter_canal = validate_optional_enum_filter(
        &input.canal_captacion,
        &[
            "REDES_SOCIALES",
            "RECOMENDACION",
            "CAMINANTE_FACHADA",
            "PUBLICIDAD_LOCAL",
            "PROMOCION",
            "OTRO",
            "SIN_ESPECIFICAR",
        ],
        "canal_captacion",
    )?;
    let dias_inactividad_riesgo = input.dias_inactividad_riesgo.unwrap_or(10).clamp(1, 90);
    let today = Local::now().date_naive();

    // 1. Cargar clientes + demografía
    let client_rows = sqlx::query(
        r#"
        SELECT
            c.id,
            c.estado_activo,
            c.created_at,
            c.canal_captacion,
            CAST(c.peso_actual_kg AS TEXT) AS peso_actual_kg,
            p.fecha_nacimiento,
            p.genero,
            TRIM(p.nombres || ' ' || p.apellidos) AS nombre_completo,
            p.telefono
        FROM clientes c
        INNER JOIN personas p ON p.id = c.persona_id
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut clients_map: HashMap<i64, ClientBioRecord> = HashMap::with_capacity(client_rows.len());
    let mut demo_matched_clients: HashSet<i64> = HashSet::new();

    for row in client_rows {
        let id: i64 = row.get("id");
        let estado_num: i64 = row.get("estado_activo");
        let created_raw: String = row.get("created_at");
        let fecha_nac: Option<String> = row.get("fecha_nacimiento");
        let genero_raw: Option<String> = row.get("genero");
        let canal_raw: Option<String> = row.get("canal_captacion");
        let peso_str: Option<String> = row.get("peso_actual_kg");

        let age_bucket = classify_age_bucket(fecha_nac.as_deref(), period.hasta);
        let genero_bucket = normalize_demographic_bucket(genero_raw.as_deref());
        let captacion_bucket = normalize_demographic_bucket(canal_raw.as_deref());

        let matches_demo = filter_age.as_deref().map_or(true, |f| age_bucket == f)
            && filter_genero.as_deref().map_or(true, |f| genero_bucket == f)
            && filter_canal
                .as_deref()
                .map_or(true, |f| captacion_bucket == f);

        if matches_demo {
            demo_matched_clients.insert(id);
        }

        clients_map.insert(
            id,
            ClientBioRecord {
                estado_activo: estado_num == 1,
                created_date: parse_naive_date_prefix(&created_raw),
                nombre_completo: row.get("nombre_completo"),
                telefono: row.get("telefono"),
                peso_actual_kg: peso_str.and_then(|s| s.trim().parse::<Decimal>().ok()),
                age_bucket,
                genero_bucket,
                captacion_bucket,
            },
        );
    }

    // 2. Cargar planes y membresías no anuladas ordenadas por cliente_id, id
    let plan_rows = sqlx::query(
        "SELECT id, codigo, nombre, tipo_plan, estado_activo FROM planes ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await?;
    struct PlanMeta {
        id: i64,
        codigo: String,
        nombre: String,
        tipo_plan: String,
        estado_activo: bool,
    }
    let mut plans_meta: Vec<PlanMeta> = Vec::with_capacity(plan_rows.len());
    for row in plan_rows {
        plans_meta.push(PlanMeta {
            id: row.get("id"),
            codigo: row.get("codigo"),
            nombre: row.get("nombre"),
            tipo_plan: row.get("tipo_plan"),
            estado_activo: row.get::<i64, _>("estado_activo") == 1,
        });
    }

    let membership_rows = sqlx::query(
        r#"
        SELECT
            m.id,
            m.cliente_id,
            m.plan_id,
            pl.nombre AS plan_nombre,
            m.fecha_inicio,
            m.fecha_vencimiento,
            CAST(m.precio_pactado AS TEXT) AS precio_pactado,
            m.estado
        FROM membresias_clientes m
        INNER JOIN planes pl ON pl.id = m.plan_id
        WHERE m.estado != 'ANULADA'
        ORDER BY m.cliente_id ASC, m.id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut all_memberships_by_client: HashMap<i64, Vec<MembershipRecord>> = HashMap::new();
    let mut seen_client: HashSet<i64> = HashSet::new();
    let mut clients_with_plan: HashSet<i64> = HashSet::new();

    for row in membership_rows {
        let cliente_id: i64 = row.get("cliente_id");
        let plan_id: i64 = row.get("plan_id");
        let fi_raw: String = row.get("fecha_inicio");
        let fv_raw: String = row.get("fecha_vencimiento");
        let (Some(fi), Some(fv)) = (
            parse_naive_date_prefix(&fi_raw),
            parse_naive_date_prefix(&fv_raw),
        ) else {
            continue;
        };
        let is_renewal = !seen_client.insert(cliente_id);
        if input.plan_id == Some(plan_id) {
            clients_with_plan.insert(cliente_id);
        }

        let rec = MembershipRecord {
            id: row.get("id"),
            plan_id,
            plan_nombre: row.get("plan_nombre"),
            fecha_inicio: fi,
            fecha_vencimiento: fv,
            fecha_vencimiento_raw: fv_raw.chars().take(10).collect(),
            precio_pactado: parse_decimal(row.get("precio_pactado")),
            estado: row.get("estado"),
            is_renewal,
        };
        all_memberships_by_client
            .entry(cliente_id)
            .or_default()
            .push(rec);
    }

    let final_matched_clients: HashSet<i64> = if input.plan_id.is_some() {
        demo_matched_clients
            .intersection(&clients_with_plan)
            .copied()
            .collect()
    } else {
        demo_matched_clients.clone()
    };

    // 3. Nuevos socios (actual vs anterior)
    let mut nuevos_actual: i64 = 0;
    let mut nuevos_anterior: i64 = 0;
    let mut socios_activos_total: i64 = 0;

    let mut age_counts: HashMap<String, i64> = HashMap::new();
    let mut gender_counts: HashMap<String, i64> = HashMap::new();
    let mut captacion_counts: HashMap<String, i64> = HashMap::new();
    let mut active_demo_total: i64 = 0;
    let mut active_with_gender: i64 = 0;
    let mut active_with_captacion: i64 = 0;

    for cid in &final_matched_clients {
        if let Some(c) = clients_map.get(cid) {
            if let Some(cd) = c.created_date {
                if cd >= period.desde && cd <= period.hasta {
                    nuevos_actual += 1;
                } else if cd >= period.prev_desde && cd <= period.prev_hasta {
                    nuevos_anterior += 1;
                }
            }
            if c.estado_activo {
                socios_activos_total += 1;
                active_demo_total += 1;
                *age_counts.entry(c.age_bucket.to_string()).or_insert(0) += 1;
                *gender_counts.entry(c.genero_bucket.clone()).or_insert(0) += 1;
                *captacion_counts
                    .entry(c.captacion_bucket.clone())
                    .or_insert(0) += 1;
                if c.genero_bucket != "SIN_ESPECIFICAR" {
                    active_with_gender += 1;
                }
                if c.captacion_bucket != "SIN_ESPECIFICAR" {
                    active_with_captacion += 1;
                }
            }
        }
    }

    let cobertura_genero_pct = if active_demo_total > 0 {
        round_pct(
            (Decimal::from(active_with_gender) / Decimal::from(active_demo_total))
                * Decimal::from(100),
        )
    } else {
        0.0
    };
    let cobertura_captacion_pct = if active_demo_total > 0 {
        round_pct(
            (Decimal::from(active_with_captacion) / Decimal::from(active_demo_total))
                * Decimal::from(100),
        )
    } else {
        0.0
    };

    // 4. Membresías: serie movimiento, vigentes hoy, retención/churn, ARPU, rendimiento de planes
    let mut membresias_vigentes_total: i64 = 0;
    let mut vencimientos_en_periodo: i64 = 0;
    let mut renovaciones_en_periodo: i64 = 0;
    let mut prev_vencimientos: i64 = 0;
    let mut prev_renovaciones: i64 = 0;

    let mut cur_plan_rev = Decimal::ZERO;
    let mut prev_plan_rev = Decimal::ZERO;
    let mut cur_paying_clients: HashSet<i64> = HashSet::new();
    let mut prev_paying_clients: HashSet<i64> = HashSet::new();

    let mut series_map: HashMap<String, (i64, i64, i64)> = HashMap::new();
    let mut plan_perf_map: HashMap<i64, (i64, Decimal)> = HashMap::new();
    let mut active_memberships_today_by_client: HashMap<i64, &MembershipRecord> = HashMap::new();

    for (cid, list) in &all_memberships_by_client {
        if !demo_matched_clients.contains(cid) {
            continue;
        }
        let client_active = clients_map.get(cid).map_or(false, |c| c.estado_activo);

        for m in list {
            if let Some(pid) = input.plan_id {
                if m.plan_id != pid {
                    continue;
                }
            }

            // Vigente hoy
            if client_active && m.estado == "ACTIVA" && m.fecha_vencimiento >= today {
                membresias_vigentes_total += 1;
                active_memberships_today_by_client
                    .entry(*cid)
                    .and_modify(|existing| {
                        if m.fecha_vencimiento > existing.fecha_vencimiento {
                            *existing = m;
                        }
                    })
                    .or_insert(m);
            }

            // Altas / Renovaciones y ARPU / Plan performance en periodo actual
            if m.fecha_inicio >= period.desde && m.fecha_inicio <= period.hasta {
                let key = bucket_key_for_date(m.fecha_inicio, period.granularidad);
                let entry = series_map.entry(key).or_insert((0, 0, 0));
                if m.is_renewal {
                    entry.1 += 1;
                } else {
                    entry.0 += 1;
                }

                cur_plan_rev += m.precio_pactado;
                cur_paying_clients.insert(*cid);

                let p_entry = plan_perf_map.entry(m.plan_id).or_insert((0, Decimal::ZERO));
                p_entry.0 += 1;
                p_entry.1 += m.precio_pactado;
            } else if m.fecha_inicio >= period.prev_desde && m.fecha_inicio <= period.prev_hasta {
                prev_plan_rev += m.precio_pactado;
                prev_paying_clients.insert(*cid);
            }

            // Vencimientos y Tasa de Renovación (ventana -7d .. +15d sobre todas las membresías del cliente)
            let has_renewal_around_exp = || -> bool {
                let win_start = m.fecha_vencimiento - Duration::days(7);
                let win_end = m.fecha_vencimiento + Duration::days(15);
                list.iter().any(|other| {
                    other.id != m.id
                        && other.fecha_inicio >= win_start
                        && other.fecha_inicio <= win_end
                })
            };

            if m.fecha_vencimiento >= period.desde && m.fecha_vencimiento <= period.hasta {
                let key = bucket_key_for_date(m.fecha_vencimiento, period.granularidad);
                let entry = series_map.entry(key).or_insert((0, 0, 0));
                entry.2 += 1;

                vencimientos_en_periodo += 1;
                if has_renewal_around_exp() {
                    renovaciones_en_periodo += 1;
                }
            } else if m.fecha_vencimiento >= period.prev_desde
                && m.fecha_vencimiento <= period.prev_hasta
            {
                prev_vencimientos += 1;
                if has_renewal_around_exp() {
                    prev_renovaciones += 1;
                }
            }
        }
    }

    let tasa_renovacion_pct = if vencimientos_en_periodo > 0 {
        round_pct(
            (Decimal::from(renovaciones_en_periodo) / Decimal::from(vencimientos_en_periodo))
                * Decimal::from(100),
        )
    } else {
        0.0
    };
    let tasa_renovacion_anterior_pct = if prev_vencimientos > 0 {
        round_pct(
            (Decimal::from(prev_renovaciones) / Decimal::from(prev_vencimientos))
                * Decimal::from(100),
        )
    } else {
        0.0
    };
    let tasa_churn_pct = if vencimientos_en_periodo > 0 {
        let churn = ((100.0 - tasa_renovacion_pct) * 10.0).round() / 10.0;
        if churn <= 0.0 {
            0.0
        } else {
            churn
        }
    } else {
        0.0
    };

    let arpu_actual = if !cur_paying_clients.is_empty() {
        (cur_plan_rev / Decimal::from(cur_paying_clients.len() as i64)).round_dp(2)
    } else {
        Decimal::ZERO
    };
    let arpu_anterior = if !prev_paying_clients.is_empty() {
        (prev_plan_rev / Decimal::from(prev_paying_clients.len() as i64)).round_dp(2)
    } else {
        Decimal::ZERO
    };

    let buckets = build_time_buckets(period.desde, period.hasta, period.granularidad);
    let serie_movimiento: Vec<BiMembersTimePoint> = buckets
        .into_iter()
        .map(|(periodo_key, etiqueta)| {
            let (altas_nuevas, renovaciones, vencimientos) =
                series_map.get(&periodo_key).copied().unwrap_or((0, 0, 0));
            BiMembersTimePoint {
                periodo_key,
                etiqueta,
                altas_nuevas,
                renovaciones,
                vencimientos,
            }
        })
        .collect();

    // 5. Días prórroga otorgados (actual vs anterior)
    let ext_rows = sqlx::query(
        r#"
        SELECT
            e.cliente_id,
            e.dias_otorgados,
            substr(e.created_at, 1, 10) AS dia,
            m.plan_id
        FROM extensiones_membresia e
        INNER JOIN membresias_clientes m ON m.id = e.membresia_id
        WHERE substr(e.created_at, 1, 10) BETWEEN ? AND ?
        "#,
    )
    .bind(period.prev_desde.format("%Y-%m-%d").to_string())
    .bind(period.hasta.format("%Y-%m-%d").to_string())
    .fetch_all(pool)
    .await?;

    let mut ext_actual: i64 = 0;
    let mut ext_anterior: i64 = 0;
    for row in ext_rows {
        let cid: i64 = row.get("cliente_id");
        let pid: i64 = row.get("plan_id");
        if !demo_matched_clients.contains(&cid) {
            continue;
        }
        if let Some(filter_pid) = input.plan_id {
            if pid != filter_pid {
                continue;
            }
        }
        let dias: i64 = row.get("dias_otorgados");
        let dia_str: String = row.get("dia");
        if let Some(d) = parse_naive_date_prefix(&dia_str) {
            if d >= period.desde && d <= period.hasta {
                ext_actual += dias;
            } else if d >= period.prev_desde && d <= period.prev_hasta {
                ext_anterior += dias;
            }
        }
    }

    // 6. Rendimiento de planes
    let total_plan_ingresos: Decimal = plan_perf_map.values().map(|(_, rev)| *rev).sum();
    let mut rendimiento_planes: Vec<BiPlanPerformanceRow> = plans_meta
        .into_iter()
        .filter(|pm| {
            let matches_filter = input.plan_id.map_or(true, |pid| pid == pm.id);
            let has_sales = plan_perf_map.contains_key(&pm.id);
            matches_filter && (pm.estado_activo || has_sales)
        })
        .map(|pm| {
            let (unidades_vendidas, ingresos) = plan_perf_map
                .get(&pm.id)
                .copied()
                .unwrap_or((0, Decimal::ZERO));
            BiPlanPerformanceRow {
                plan_id: pm.id,
                codigo: pm.codigo,
                nombre: pm.nombre,
                tipo_plan: pm.tipo_plan,
                unidades_vendidas,
                ingresos,
                porcentaje_ingresos: compute_share_pct(ingresos, total_plan_ingresos),
            }
        })
        .collect();
    rendimiento_planes.sort_by(|a, b| {
        b.ingresos
            .cmp(&a.ingresos)
            .then_with(|| b.unidades_vendidas.cmp(&a.unidades_vendidas))
            .then_with(|| a.plan_id.cmp(&b.plan_id))
    });

    // 7. Socios activos en riesgo de abandono (top 50)
    let last_att_rows = sqlx::query(
        "SELECT cliente_id, MAX(fecha_hora_ingreso) AS ultima FROM asistencias GROUP BY cliente_id",
    )
    .fetch_all(pool)
    .await?;
    let mut last_att_map: HashMap<i64, String> = HashMap::with_capacity(last_att_rows.len());
    for row in last_att_rows {
        let cid: i64 = row.get("cliente_id");
        let ultima: Option<String> = row.get("ultima");
        if let Some(u) = ultima {
            last_att_map.insert(cid, u);
        }
    }

    let mut socios_en_riesgo: Vec<BiMemberAtRiskRow> = Vec::new();
    for (cid, active_mem) in active_memberships_today_by_client {
        let Some(client) = clients_map.get(&cid) else {
            continue;
        };
        let ultima_asistencia = last_att_map.get(&cid).cloned();
        let ref_date_opt = ultima_asistencia
            .as_deref()
            .and_then(parse_naive_date_prefix)
            .or(Some(active_mem.fecha_inicio));

        let dias_sin_asistir = ref_date_opt
            .map(|d| (today - d).num_days().max(0))
            .unwrap_or(0);

        if dias_sin_asistir >= dias_inactividad_riesgo {
            let dias_restantes = (active_mem.fecha_vencimiento - today).num_days();
            socios_en_riesgo.push(BiMemberAtRiskRow {
                cliente_id: cid,
                nombre_completo: client.nombre_completo.clone(),
                telefono: client.telefono.clone(),
                nombre_plan: active_mem.plan_nombre.clone(),
                fecha_vencimiento: active_mem.fecha_vencimiento_raw.clone(),
                dias_restantes,
                ultima_asistencia,
                dias_sin_asistir,
            });
        }
    }
    socios_en_riesgo.sort_by(|a, b| {
        b.dias_sin_asistir
            .cmp(&a.dias_sin_asistir)
            .then_with(|| a.dias_restantes.cmp(&b.dias_restantes))
            .then_with(|| a.cliente_id.cmp(&b.cliente_id))
    });
    socios_en_riesgo.truncate(50);

    // 8. Resumen biométrico (cliente_pesos_historial)
    let weight_rows = sqlx::query(
        r#"
        SELECT cliente_id, CAST(peso_kg AS TEXT) AS peso_kg
        FROM cliente_pesos_historial
        ORDER BY cliente_id ASC, fecha_registro ASC, id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut weights_by_client: HashMap<i64, Vec<Decimal>> = HashMap::new();
    let mut total_registros_peso: i64 = 0;
    for row in weight_rows {
        let cid: i64 = row.get("cliente_id");
        if !final_matched_clients.contains(&cid) {
            continue;
        }
        if let Some(p) = row
            .get::<Option<String>, _>("peso_kg")
            .and_then(|s| s.trim().parse::<Decimal>().ok())
        {
            total_registros_peso += 1;
            weights_by_client.entry(cid).or_default().push(p);
        }
    }

    let mut socios_con_peso: i64 = 0;
    let mut socios_con_evolucion: i64 = 0;
    let mut sum_evolucion = Decimal::ZERO;

    for cid in &final_matched_clients {
        let has_current_weight = clients_map
            .get(cid)
            .and_then(|c| c.peso_actual_kg)
            .is_some();
        let hist = weights_by_client.get(cid);
        if has_current_weight || hist.map_or(false, |v| !v.is_empty()) {
            socios_con_peso += 1;
        }
        if let Some(v) = hist {
            if v.len() >= 2 {
                socios_con_evolucion += 1;
                sum_evolucion += v[v.len() - 1] - v[0];
            }
        }
    }

    let variacion_promedio_kg = if socios_con_evolucion > 0 {
        (sum_evolucion / Decimal::from(socios_con_evolucion)).round_dp(2)
    } else {
        Decimal::ZERO
    };

    let planes_disponibles = fetch_active_plans_options(pool).await?;

    Ok(BiMembersAnalyticsDto {
        fecha_desde: period.desde.format("%Y-%m-%d").to_string(),
        fecha_hasta: period.hasta.format("%Y-%m-%d").to_string(),
        periodo_anterior_desde: period.prev_desde.format("%Y-%m-%d").to_string(),
        periodo_anterior_hasta: period.prev_hasta.format("%Y-%m-%d").to_string(),
        granularidad_aplicada: period.granularidad,
        dias_inactividad_riesgo,
        nuevos_socios: BiKpiComparison {
            actual: Decimal::from(nuevos_actual),
            anterior: Decimal::from(nuevos_anterior),
            delta_pct: compute_delta_pct(
                Decimal::from(nuevos_actual),
                Decimal::from(nuevos_anterior),
            ),
        },
        socios_activos_total,
        membresias_vigentes_total,
        vencimientos_en_periodo,
        renovaciones_en_periodo,
        tasa_renovacion_pct,
        tasa_renovacion_anterior_pct,
        tasa_churn_pct,
        arpu: BiKpiComparison {
            actual: arpu_actual,
            anterior: arpu_anterior,
            delta_pct: compute_delta_pct(arpu_actual, arpu_anterior),
        },
        dias_prorroga_otorgados: BiKpiComparison {
            actual: Decimal::from(ext_actual),
            anterior: Decimal::from(ext_anterior),
            delta_pct: compute_delta_pct(Decimal::from(ext_actual), Decimal::from(ext_anterior)),
        },
        serie_movimiento,
        distribucion_edad: build_category_counts(&AGE_BUCKETS, &age_counts, active_demo_total),
        distribucion_genero: build_category_counts(
            &GENDER_BUCKETS,
            &gender_counts,
            active_demo_total,
        ),
        cobertura_genero_pct,
        distribucion_captacion: build_category_counts(
            &ACQUISITION_BUCKETS,
            &captacion_counts,
            active_demo_total,
        ),
        cobertura_captacion_pct,
        rendimiento_planes,
        socios_en_riesgo,
        resumen_biometrico: BiWeightSummaryDto {
            socios_con_peso,
            socios_con_evolucion,
            variacion_promedio_kg,
            total_registros_peso,
        },
        planes_disponibles,
        generated_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// Exporta socios en riesgo y rendimiento por planes de BI Socios/Retención en CSV o XLSX.
pub async fn export_bi_members_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiExportMembersInput,
) -> Result<ExportFileResult, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabSocios,
        "Acceso denegado: no tiene permiso para visualizar analítica de socios y retención.",
    )
    .await?;
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::ExportarContextualBi,
        "Acceso denegado: no tiene permiso para exportar reportes contextuales de BI.",
    )
    .await?;

    if input.format == ExportFormat::Pdf {
        return Err(AppError::Validation(
            "La exportación contextual de Socios BI solo soporta formatos CSV y XLSX.".into(),
        ));
    }

    let dto = get_bi_members_analytics(pool, session, input.filter).await?;

    let headers = [
        "Seccion",
        "Nombre / Plan",
        "Telefono / Codigo",
        "Plan / Tipo",
        "Fecha / Unidades",
        "Dias Restantes / Ingresos",
        "Dias Sin Asistir / % Ingresos",
    ];

    let mut rows: Vec<Vec<ExportCell>> = Vec::new();

    for r in &dto.socios_en_riesgo {
        rows.push(vec![
            ExportCell::Text("SOCIO_EN_RIESGO".to_string()),
            ExportCell::Text(r.nombre_completo.clone()),
            ExportCell::Text(r.telefono.clone().unwrap_or_else(|| "-".to_string())),
            ExportCell::Text(r.nombre_plan.clone()),
            ExportCell::Text(r.fecha_vencimiento.clone()),
            ExportCell::Number(r.dias_restantes.to_string()),
            ExportCell::Number(r.dias_sin_asistir.to_string()),
        ]);
    }

    for p in &dto.rendimiento_planes {
        rows.push(vec![
            ExportCell::Text("RENDIMIENTO_PLAN".to_string()),
            ExportCell::Text(p.nombre.clone()),
            ExportCell::Text(p.codigo.clone()),
            ExportCell::Text(p.tipo_plan.clone()),
            ExportCell::Number(p.unidades_vendidas.to_string()),
            ExportCell::Number(format!("{:.2}", p.ingresos)),
            ExportCell::Number(format!("{:.1}", p.porcentaje_ingresos)),
        ]);
    }

    rows.push(vec![
        ExportCell::Text("RESUMEN_RETENCION".to_string()),
        ExportCell::Text(format!("{} a {}", dto.fecha_desde, dto.fecha_hasta)),
        ExportCell::Text(format!("Activos: {}", dto.socios_activos_total)),
        ExportCell::Text(format!("Vigentes: {}", dto.membresias_vigentes_total)),
        ExportCell::Number(dto.vencimientos_en_periodo.to_string()),
        ExportCell::Number(dto.renovaciones_en_periodo.to_string()),
        ExportCell::Number(format!("{:.1}", dto.tasa_renovacion_pct)),
    ]);

    let bytes = match input.format {
        ExportFormat::Csv => build_csv_bytes(&headers, &rows),
        ExportFormat::Xlsx => build_xlsx_bytes("Socios y Retencion BI", &headers, &rows),
        ExportFormat::Pdf => unreachable!(),
    };

    let filename = format!(
        "bi_socios_retencion_{}_a_{}.{}",
        dto.fecha_desde,
        dto.fecha_hasta,
        input.format.extension()
    );

    finalize_export_and_audit(
        pool,
        session,
        "BI_SOCIOS_RETENCION",
        filename,
        input.format,
        bytes,
        rows.len(),
    )
    .await
}

// ============================================================================
// BI-SLICE 3B: ASISTENCIA Y DEMANDA
// ============================================================================

const SEMAFORO_BUCKETS: [(&str, &str); 3] = [
    ("VERDE", "Acceso Habilitado"),
    ("AMARILLO", "Alerta / Por Vencer"),
    ("ROJO", "Bloqueado / Pase Crédito"),
];

const INGRESO_BUCKETS: [(&str, &str); 4] = [
    ("QR_LOCAL", "Escáner Local"),
    ("QR_MOVIL_LAN", "App Móvil LAN"),
    ("MANUAL_OLVIDO_QR", "Ingreso Manual"),
    ("PASE_DIARIO_CREDITO_ROJO", "Pase Diario Crédito"),
];

fn extract_hour_from_timestamp(raw: &str) -> Option<u32> {
    let trimmed = raw.trim();
    if trimmed.len() >= 13 {
        if let Ok(h) = trimmed[11..13].parse::<u32>() {
            if h <= 23 {
                return Some(h);
            }
        }
    }
    None
}

pub async fn get_bi_attendance_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiAttendanceFilterInput,
) -> Result<BiAttendanceAnalyticsDto, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabAsistencia,
        "Acceso denegado: no tiene permiso para visualizar analítica de asistencia y demanda.",
    )
    .await?;

    compute_bi_attendance_analytics(pool, input).await
}

async fn compute_bi_attendance_analytics(
    pool: &SqlitePool,
    input: BiAttendanceFilterInput,
) -> Result<BiAttendanceAnalyticsDto, AppError> {

    let period = resolve_date_period(&input.fecha_desde, &input.fecha_hasta, input.granularidad)?;
    let filter_age = validate_optional_enum_filter(
        &input.rango_edad,
        &[
            "MENOR_18",
            "18_24",
            "25_34",
            "35_44",
            "45_54",
            "55_MAS",
            "SIN_ESPECIFICAR",
        ],
        "rango_edad",
    )?;
    let filter_genero = validate_optional_enum_filter(
        &input.genero,
        &[
            "MASCULINO",
            "FEMENINO",
            "OTRO",
            "PREFIERO_NO_DECIR",
            "SIN_ESPECIFICAR",
        ],
        "genero",
    )?;
    let filter_semaforo = validate_optional_enum_filter(
        &input.color_semaforo,
        &["VERDE", "AMARILLO", "ROJO"],
        "color_semaforo",
    )?;
    let filter_modo = validate_optional_enum_filter(
        &input.modo_ingreso,
        &[
            "QR_LOCAL",
            "QR_MOVIL_LAN",
            "MANUAL_OLVIDO_QR",
            "PASE_DIARIO_CREDITO_ROJO",
        ],
        "modo_ingreso",
    )?;

    let (full_start, full_end) = date_bounds(period.prev_desde, period.hasta);

    // 1. Cargar asistencias en [prev_desde, hasta]
    let att_rows = sqlx::query(
        r#"
        SELECT
            a.cliente_id,
            a.fecha_hora_ingreso,
            a.modo_ingreso,
            a.color_semaforo,
            m.plan_id,
            pl.nombre AS plan_nombre,
            p.fecha_nacimiento,
            p.genero,
            TRIM(p.nombres || ' ' || p.apellidos) AS nombre_completo
        FROM asistencias a
        INNER JOIN clientes c ON c.id = a.cliente_id
        INNER JOIN personas p ON p.id = c.persona_id
        LEFT JOIN membresias_clientes m ON m.id = a.membresia_id
        LEFT JOIN planes pl ON pl.id = m.plan_id
        WHERE a.fecha_hora_ingreso BETWEEN ? AND ?
        ORDER BY a.fecha_hora_ingreso ASC, a.id ASC
        "#,
    )
    .bind(&full_start)
    .bind(&full_end)
    .fetch_all(pool)
    .await?;

    let mut cur_total: i64 = 0;
    let mut prev_total: i64 = 0;
    let mut cur_unique_clients: HashSet<i64> = HashSet::new();
    let mut prev_unique_clients: HashSet<i64> = HashSet::new();

    let mut heatmap_counts: HashMap<(i32, u32), i64> = HashMap::new();
    let mut series_counts: HashMap<String, (i64, HashSet<i64>)> = HashMap::new();
    let mut semaforo_counts: HashMap<String, i64> = HashMap::new();
    let mut canal_counts: HashMap<String, i64> = HashMap::new();

    struct TopMemberAcc {
        nombre_completo: String,
        total_visitas: i64,
        ultima_asistencia: String,
        nombre_plan: Option<String>,
    }
    let mut top_acc: HashMap<i64, TopMemberAcc> = HashMap::new();

    for row in att_rows {
        let fecha_nac: Option<String> = row.get("fecha_nacimiento");
        let genero_raw: Option<String> = row.get("genero");
        let plan_id: Option<i64> = row.get("plan_id");
        let color_semaforo: String = row.get("color_semaforo");
        let modo_ingreso: String = row.get("modo_ingreso");

        let age_bucket = classify_age_bucket(fecha_nac.as_deref(), period.hasta);
        let genero_bucket = normalize_demographic_bucket(genero_raw.as_deref());

        if let Some(ref f) = filter_age {
            if age_bucket != f {
                continue;
            }
        }
        if let Some(ref f) = filter_genero {
            if &genero_bucket != f {
                continue;
            }
        }
        if let Some(f_pid) = input.plan_id {
            if plan_id != Some(f_pid) {
                continue;
            }
        }
        if let Some(ref f) = filter_semaforo {
            if &color_semaforo != f {
                continue;
            }
        }
        if let Some(ref f) = filter_modo {
            if &modo_ingreso != f {
                continue;
            }
        }

        let ts: String = row.get("fecha_hora_ingreso");
        let Some(d) = parse_naive_date_prefix(&ts) else {
            continue;
        };
        let cliente_id: i64 = row.get("cliente_id");

        if d >= period.desde && d <= period.hasta {
            cur_total += 1;
            cur_unique_clients.insert(cliente_id);

            let key = bucket_key_for_date(d, period.granularidad);
            let s_entry = series_counts
                .entry(key)
                .or_insert_with(|| (0, HashSet::new()));
            s_entry.0 += 1;
            s_entry.1.insert(cliente_id);

            *semaforo_counts.entry(color_semaforo).or_insert(0) += 1;
            *canal_counts.entry(modo_ingreso).or_insert(0) += 1;

            if let Some(hour) = extract_hour_from_timestamp(&ts) {
                if (5..=22).contains(&hour) {
                    let dow = d.weekday().num_days_from_monday() as i32;
                    *heatmap_counts.entry((dow, hour)).or_insert(0) += 1;
                }
            }

            let nombre_completo: String = row.get("nombre_completo");
            let plan_nombre: Option<String> = row.get("plan_nombre");
            top_acc
                .entry(cliente_id)
                .and_modify(|acc| {
                    acc.total_visitas += 1;
                    if ts >= acc.ultima_asistencia {
                        acc.ultima_asistencia = ts.clone();
                        if plan_nombre.is_some() {
                            acc.nombre_plan = plan_nombre.clone();
                        }
                    }
                })
                .or_insert(TopMemberAcc {
                    nombre_completo,
                    total_visitas: 1,
                    ultima_asistencia: ts,
                    nombre_plan: plan_nombre,
                });
        } else if d >= period.prev_desde && d <= period.prev_hasta {
            prev_total += 1;
            prev_unique_clients.insert(cliente_id);
        }
    }

    // 2. Heatmap 7x18 (dia_semana 0..=6, hora 5..=22) y día/hora pico
    let mut weekday_occurrences = [0i64; 7];
    let mut cursor = period.desde;
    while cursor <= period.hasta {
        let dow = cursor.weekday().num_days_from_monday() as usize;
        weekday_occurrences[dow] += 1;
        cursor += Duration::days(1);
    }

    let mut heatmap: Vec<BiHeatmapCell> = Vec::with_capacity(7 * 18);
    let mut best_slot: Option<(i32, u32, i64)> = None;

    for dia_semana in 0..=6i32 {
        let occ = weekday_occurrences[dia_semana as usize].max(1);
        for hora in 5..=22u32 {
            let total = *heatmap_counts.get(&(dia_semana, hora)).unwrap_or(&0);
            let promedio_por_jornada = round_pct(Decimal::from(total) / Decimal::from(occ));
            if total > 0 && best_slot.map_or(true, |(_, _, b_tot)| total > b_tot) {
                best_slot = Some((dia_semana, hora, total));
            }
            heatmap.push(BiHeatmapCell {
                dia_semana,
                hora,
                total,
                promedio_por_jornada,
            });
        }
    }

    let dia_hora_pico = best_slot.map(|(dia_semana, hora, total)| BiPeakSlotDto {
        dia_semana,
        dia_nombre: weekday_name_es(dia_semana).to_string(),
        hora,
        franja: format!("{:02}:00", hora),
        total,
    });

    // 3. Serie temporal con zero-filling
    let buckets = build_time_buckets(period.desde, period.hasta, period.granularidad);
    let serie_temporal: Vec<BiAttendanceTimePoint> = buckets
        .into_iter()
        .map(|(periodo_key, etiqueta)| {
            let (total, socios_unicos) = series_counts
                .get(&periodo_key)
                .map(|(t, set)| (*t, set.len() as i64))
                .unwrap_or((0, 0));
            BiAttendanceTimePoint {
                periodo_key,
                etiqueta,
                total,
                socios_unicos,
            }
        })
        .collect();

    // 4. Top 10 socios constantes
    let mut top_socios_constantes: Vec<BiTopAttendingMemberRow> = top_acc
        .into_iter()
        .map(|(cliente_id, acc)| BiTopAttendingMemberRow {
            cliente_id,
            nombre_completo: acc.nombre_completo,
            total_visitas: acc.total_visitas,
            ultima_asistencia: acc.ultima_asistencia,
            nombre_plan: acc.nombre_plan,
        })
        .collect();
    top_socios_constantes.sort_by(|a, b| {
        b.total_visitas
            .cmp(&a.total_visitas)
            .then_with(|| b.ultima_asistencia.cmp(&a.ultima_asistencia))
            .then_with(|| a.cliente_id.cmp(&b.cliente_id))
    });
    top_socios_constantes.truncate(10);

    // 5. Pases en rojo (creditos_clientes origen PASE_DIARIO_SEMAFORO_ROJO en rango)
    let (cur_start, cur_end) = date_bounds(period.desde, period.hasta);
    let credit_rows = sqlx::query(
        r#"
        SELECT
            cc.estado,
            CAST(cc.saldo_pendiente AS TEXT) AS saldo_pendiente,
            p.fecha_nacimiento,
            p.genero
        FROM creditos_clientes cc
        INNER JOIN clientes c ON c.id = cc.cliente_id
        INNER JOIN personas p ON p.id = c.persona_id
        WHERE cc.origen_credito = 'PASE_DIARIO_SEMAFORO_ROJO'
          AND cc.estado != 'ANULADO'
          AND cc.fecha_emision BETWEEN ? AND ?
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .fetch_all(pool)
    .await?;

    let mut pases_rojo_emitidos: i64 = 0;
    let mut pases_rojo_cobrados: i64 = 0;
    let mut pases_rojo_saldo_pendiente = Decimal::ZERO;

    for row in credit_rows {
        let fecha_nac: Option<String> = row.get("fecha_nacimiento");
        let genero_raw: Option<String> = row.get("genero");
        if let Some(ref f) = filter_age {
            if classify_age_bucket(fecha_nac.as_deref(), period.hasta) != f {
                continue;
            }
        }
        if let Some(ref f) = filter_genero {
            if &normalize_demographic_bucket(genero_raw.as_deref()) != f {
                continue;
            }
        }
        let estado: String = row.get("estado");
        pases_rojo_emitidos += 1;
        if estado == "PAGADO" {
            pases_rojo_cobrados += 1;
        } else if estado == "PENDIENTE" {
            pases_rojo_saldo_pendiente += parse_decimal(row.get("saldo_pendiente"));
        }
    }

    let pases_rojo_tasa_cobro_pct = if pases_rojo_emitidos > 0 {
        round_pct(
            (Decimal::from(pases_rojo_cobrados) / Decimal::from(pases_rojo_emitidos))
                * Decimal::from(100),
        )
    } else {
        0.0
    };

    let cur_unique = cur_unique_clients.len() as i64;
    let prev_unique = prev_unique_clients.len() as i64;

    let promedio_diario = round_pct(Decimal::from(cur_total) / Decimal::from(period.n_days));
    let promedio_diario_anterior =
        round_pct(Decimal::from(prev_total) / Decimal::from(period.n_days));

    let frecuencia_semanal_promedio = if cur_unique > 0 {
        let semanas = Decimal::from(period.n_days) / Decimal::from(7);
        let visits_per_user = Decimal::from(cur_total) / Decimal::from(cur_unique);
        round_pct(visits_per_user / semanas)
    } else {
        0.0
    };

    let planes_disponibles = fetch_active_plans_options(pool).await?;

    Ok(BiAttendanceAnalyticsDto {
        fecha_desde: period.desde.format("%Y-%m-%d").to_string(),
        fecha_hasta: period.hasta.format("%Y-%m-%d").to_string(),
        periodo_anterior_desde: period.prev_desde.format("%Y-%m-%d").to_string(),
        periodo_anterior_hasta: period.prev_hasta.format("%Y-%m-%d").to_string(),
        granularidad_aplicada: period.granularidad,
        total_asistencias: BiKpiComparison {
            actual: Decimal::from(cur_total),
            anterior: Decimal::from(prev_total),
            delta_pct: compute_delta_pct(Decimal::from(cur_total), Decimal::from(prev_total)),
        },
        promedio_diario,
        promedio_diario_anterior,
        socios_unicos: BiKpiComparison {
            actual: Decimal::from(cur_unique),
            anterior: Decimal::from(prev_unique),
            delta_pct: compute_delta_pct(Decimal::from(cur_unique), Decimal::from(prev_unique)),
        },
        frecuencia_semanal_promedio,
        dia_hora_pico,
        pases_rojo_emitidos,
        pases_rojo_cobrados,
        pases_rojo_tasa_cobro_pct,
        pases_rojo_saldo_pendiente,
        heatmap,
        serie_temporal,
        distribucion_semaforo: build_category_counts(
            &SEMAFORO_BUCKETS,
            &semaforo_counts,
            cur_total,
        ),
        distribucion_canales: build_category_counts(&INGRESO_BUCKETS, &canal_counts, cur_total),
        top_socios_constantes,
        planes_disponibles,
        generated_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// Exporta la serie temporal y top socios constantes de Asistencia/Demanda BI en CSV o XLSX.
pub async fn export_bi_attendance_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiExportAttendanceInput,
) -> Result<ExportFileResult, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabAsistencia,
        "Acceso denegado: no tiene permiso para visualizar analítica de asistencia y demanda.",
    )
    .await?;
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::ExportarContextualBi,
        "Acceso denegado: no tiene permiso para exportar reportes contextuales de BI.",
    )
    .await?;

    if input.format == ExportFormat::Pdf {
        return Err(AppError::Validation(
            "La exportación contextual de Asistencia BI solo soporta formatos CSV y XLSX.".into(),
        ));
    }

    let dto = get_bi_attendance_analytics(pool, session, input.filter).await?;

    let headers = [
        "Seccion",
        "Periodo / Socio",
        "Etiqueta / Plan",
        "Total Asistencias / Visitas",
        "Socios Unicos / Ultima Asistencia",
    ];

    let mut rows: Vec<Vec<ExportCell>> = Vec::new();
    for pt in &dto.serie_temporal {
        rows.push(vec![
            ExportCell::Text("SERIE_ASISTENCIA".to_string()),
            ExportCell::Text(pt.periodo_key.clone()),
            ExportCell::Text(pt.etiqueta.clone()),
            ExportCell::Number(pt.total.to_string()),
            ExportCell::Number(pt.socios_unicos.to_string()),
        ]);
    }

    for top in &dto.top_socios_constantes {
        rows.push(vec![
            ExportCell::Text("TOP_CONSTANTE".to_string()),
            ExportCell::Text(top.nombre_completo.clone()),
            ExportCell::Text(top.nombre_plan.clone().unwrap_or_else(|| "-".to_string())),
            ExportCell::Number(top.total_visitas.to_string()),
            ExportCell::Text(top.ultima_asistencia.clone()),
        ]);
    }

    rows.push(vec![
        ExportCell::Text("TOTAL".to_string()),
        ExportCell::Text(format!("{} a {}", dto.fecha_desde, dto.fecha_hasta)),
        ExportCell::Text(format!("Promedio diario: {:.1}", dto.promedio_diario)),
        ExportCell::Number(dto.total_asistencias.actual.to_string()),
        ExportCell::Number(dto.socios_unicos.actual.to_string()),
    ]);

    let bytes = match input.format {
        ExportFormat::Csv => build_csv_bytes(&headers, &rows),
        ExportFormat::Xlsx => build_xlsx_bytes("Asistencia y Demanda BI", &headers, &rows),
        ExportFormat::Pdf => unreachable!(),
    };

    let filename = format!(
        "bi_asistencia_demanda_{}_a_{}.{}",
        dto.fecha_desde,
        dto.fecha_hasta,
        input.format.extension()
    );

    finalize_export_and_audit(
        pool,
        session,
        "BI_ASISTENCIA_DEMANDA",
        filename,
        input.format,
        bytes,
        rows.len(),
    )
    .await
}

// ============================================================================
// BI-SLICE 4A: PRODUCTOS E INVENTARIO
// ============================================================================

fn product_category_label(cat: &str) -> &'static str {
    match cat {
        "BEBIDAS" => "Bebidas",
        "SUPLEMENTOS" => "Suplementos",
        "ACCESORIOS" => "Accesorios",
        "SNACKS" => "Snacks",
        "OTROS" => "Otros",
        _ => "Otros",
    }
}

fn shrinkage_label(tipo: &str) -> &'static str {
    match tipo {
        "MERMA" => "Merma",
        "MERMA_DANIO" => "Merma por Daño",
        "MERMA_VENCIMIENTO" => "Merma por Vencimiento",
        "CONSUMO_PROPIO" => "Consumo Propio",
        "CONSUMO_INTERNO" => "Consumo Interno",
        _ => "Merma / Consumo",
    }
}

async fn fetch_active_suppliers_options(pool: &SqlitePool) -> Result<Vec<BiSimpleOption>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT
            pr.id,
            CASE
                WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN TRIM(p.nombres || ' ' || p.apellidos)
                ELSE COALESCE(NULLIF(TRIM(e.nombre_comercial), ''), e.razon_social)
            END AS label
        FROM proveedores pr
        LEFT JOIN personas p ON p.id = pr.persona_id
        LEFT JOIN empresas e ON e.id = pr.empresa_id
        WHERE pr.estado_activo = 1
        ORDER BY label COLLATE NOCASE ASC, pr.id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| BiSimpleOption {
            id: r.get("id"),
            label: r.get("label"),
        })
        .collect())
}

pub async fn get_bi_inventory_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiInventoryFilterInput,
) -> Result<BiInventoryAnalyticsDto, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabInventario,
        "Acceso denegado: no tiene permiso para visualizar analítica de productos e inventario.",
    )
    .await?;

    let puede_ver_costos_y_margenes = permissions_service::has_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabFinanzas,
    )
    .await?;

    compute_bi_inventory_analytics(pool, input, puede_ver_costos_y_margenes).await
}

async fn compute_bi_inventory_analytics(
    pool: &SqlitePool,
    input: BiInventoryFilterInput,
    puede_ver_costos_y_margenes: bool,
) -> Result<BiInventoryAnalyticsDto, AppError> {

    let period = resolve_date_period(&input.fecha_desde, &input.fecha_hasta, None)?;
    let filter_categoria = validate_optional_enum_filter(
        &input.categoria,
        &["BEBIDAS", "SUPLEMENTOS", "ACCESORIOS", "SNACKS", "OTROS"],
        "categoria",
    )?;
    let dias_stock_muerto = input.dias_stock_muerto.unwrap_or(30).clamp(7, 365);

    let (cur_start, cur_end) = date_bounds(period.desde, period.hasta);
    let (prev_start, _) = date_bounds(period.prev_desde, period.prev_hasta);

    // 1. Catálogo de productos (activos y totales para joins)
    let product_rows = sqlx::query(
        r#"
        SELECT
            id, codigo_sku, nombre, categoria,
            CAST(precio_compra_referencial AS TEXT) AS precio_compra_referencial,
            CAST(precio_venta AS TEXT) AS precio_venta,
            stock_actual, stock_minimo, proveedor_preferido_id, estado_activo
        FROM productos
        "#,
    )
    .fetch_all(pool)
    .await?;

    struct ProdMeta {
        id: i64,
        codigo_sku: String,
        nombre: String,
        categoria: String,
        precio_compra: Decimal,
        precio_venta: Decimal,
        stock_actual: i64,
        stock_minimo: i64,
        estado_activo: bool,
        matches_filter: bool,
    }

    let mut prod_map: HashMap<i64, ProdMeta> = HashMap::with_capacity(product_rows.len());
    let mut productos_activos_count: i64 = 0;
    let mut productos_stock_critico_count: i64 = 0;
    let mut valorizacion = Decimal::ZERO;

    for row in product_rows {
        let id: i64 = row.get("id");
        let categoria: String = row.get("categoria");
        let proveedor_id: Option<i64> = row.get("proveedor_preferido_id");
        let estado_activo = row.get::<i64, _>("estado_activo") == 1;
        let stock_actual: i64 = row.get("stock_actual");
        let stock_minimo: i64 = row.get("stock_minimo");
        let precio_compra = parse_decimal(row.get("precio_compra_referencial"));
        let precio_venta = parse_decimal(row.get("precio_venta"));

        let matches_filter = filter_categoria.as_deref().map_or(true, |c| c == categoria)
            && input.proveedor_id.map_or(true, |pid| proveedor_id == Some(pid));

        if matches_filter && estado_activo {
            productos_activos_count += 1;
            if stock_actual <= stock_minimo {
                productos_stock_critico_count += 1;
            }
            valorizacion += (Decimal::from(stock_actual) * precio_compra).round_dp(2);
        }

        prod_map.insert(
            id,
            ProdMeta {
                id,
                codigo_sku: row.get("codigo_sku"),
                nombre: row.get("nombre"),
                categoria,
                precio_compra,
                precio_venta,
                stock_actual,
                stock_minimo,
                estado_activo,
                matches_filter,
            },
        );
    }

    // 2. Ventas de productos en periodo actual y periodo anterior
    let sale_rows = sqlx::query(
        r#"
        SELECT
            vd.producto_id,
            vd.cantidad,
            CAST(vd.subtotal AS TEXT) AS subtotal,
            v.created_at
        FROM venta_detalles vd
        INNER JOIN ventas v ON v.id = vd.venta_id
        WHERE vd.tipo_item = 'PRODUCTO'
          AND v.estado_venta = 'COMPLETADA'
          AND v.created_at BETWEEN ? AND ?
        "#,
    )
    .bind(&prev_start)
    .bind(&cur_end)
    .fetch_all(pool)
    .await?;

    let mut cur_ingresos = Decimal::ZERO;
    let mut prev_ingresos = Decimal::ZERO;
    let mut cur_unidades: i64 = 0;
    let mut prev_unidades: i64 = 0;
    let mut cur_margen = Decimal::ZERO;
    let mut prev_margen = Decimal::ZERO;

    let mut prod_sales_map: HashMap<i64, (i64, Decimal, Decimal)> = HashMap::new();
    let mut cat_sales_map: HashMap<String, (Decimal, i64)> = HashMap::new();

    for row in sale_rows {
        let Some(prod_id) = row.get::<Option<i64>, _>("producto_id") else {
            continue;
        };
        let Some(pm) = prod_map.get(&prod_id) else {
            continue;
        };
        if !pm.matches_filter {
            continue;
        }
        let created_at: String = row.get("created_at");
        let Some(d) = parse_naive_date_prefix(&created_at) else {
            continue;
        };
        let qty: i64 = row.get("cantidad");
        let subtotal = parse_decimal(row.get("subtotal"));
        let line_margin = (subtotal - (Decimal::from(qty) * pm.precio_compra)).round_dp(2);

        if d >= period.desde && d <= period.hasta {
            cur_ingresos += subtotal;
            cur_unidades += qty;
            cur_margen += line_margin;

            let p_entry = prod_sales_map
                .entry(prod_id)
                .or_insert((0, Decimal::ZERO, Decimal::ZERO));
            p_entry.0 += qty;
            p_entry.1 += subtotal;
            p_entry.2 += line_margin;

            let c_entry = cat_sales_map
                .entry(pm.categoria.clone())
                .or_insert((Decimal::ZERO, 0));
            c_entry.0 += subtotal;
            c_entry.1 += qty;
        } else if d >= period.prev_desde && d <= period.prev_hasta {
            prev_ingresos += subtotal;
            prev_unidades += qty;
            prev_margen += line_margin;
        }
    }

    // Top 15 productos por ingresos DESC
    let mut top_productos: Vec<BiProductPerformanceRow> = prod_sales_map
        .into_iter()
        .filter_map(|(prod_id, (unidades_vendidas, ingresos, margen))| {
            let pm = prod_map.get(&prod_id)?;
            let (margen_estimado, margen_pct) = if puede_ver_costos_y_margenes {
                let pct = if ingresos > Decimal::ZERO {
                    round_pct((margen / ingresos) * Decimal::from(100))
                } else {
                    0.0
                };
                (Some(margen), Some(pct))
            } else {
                (None, None)
            };
            Some(BiProductPerformanceRow {
                producto_id: prod_id,
                codigo_sku: pm.codigo_sku.clone(),
                nombre: pm.nombre.clone(),
                categoria: pm.categoria.clone(),
                unidades_vendidas,
                ingresos,
                margen_estimado,
                margen_pct,
                stock_actual: pm.stock_actual,
                stock_minimo: pm.stock_minimo,
            })
        })
        .collect();
    top_productos.sort_by(|a, b| {
        b.ingresos
            .cmp(&a.ingresos)
            .then_with(|| b.unidades_vendidas.cmp(&a.unidades_vendidas))
            .then_with(|| a.producto_id.cmp(&b.producto_id))
    });
    top_productos.truncate(15);

    // Ventas por categoría
    let mut ventas_por_categoria: Vec<BiCategoryAmount> =
        ["BEBIDAS", "SUPLEMENTOS", "ACCESORIOS", "SNACKS", "OTROS"]
            .into_iter()
            .map(|clave| {
                let (monto, cantidad) = cat_sales_map
                    .get(clave)
                    .copied()
                    .unwrap_or((Decimal::ZERO, 0));
                BiCategoryAmount {
                    clave: clave.to_string(),
                    etiqueta: product_category_label(clave).to_string(),
                    monto,
                    porcentaje: compute_share_pct(monto, cur_ingresos),
                    cantidad,
                }
            })
            .collect();
    ventas_por_categoria.sort_by(|a, b| {
        b.monto
            .cmp(&a.monto)
            .then_with(|| a.clave.cmp(&b.clave))
    });

    // 3. Stock muerto: productos activos con stock > 0 y 0 ventas en [hasta - dias_stock_muerto + 1 ..= hasta]
    let dead_cutoff = period.hasta - Duration::days(dias_stock_muerto - 1);
    let (_, dead_end) = date_bounds(dead_cutoff, period.hasta);
    let last_sale_rows = sqlx::query(
        r#"
        SELECT
            vd.producto_id,
            MAX(v.created_at) AS ultima_venta
        FROM venta_detalles vd
        INNER JOIN ventas v ON v.id = vd.venta_id
        WHERE vd.tipo_item = 'PRODUCTO'
          AND v.estado_venta = 'COMPLETADA'
          AND v.created_at <= ?
        GROUP BY vd.producto_id
        "#,
    )
    .bind(&dead_end)
    .fetch_all(pool)
    .await?;

    let mut last_sale_map: HashMap<i64, String> = HashMap::with_capacity(last_sale_rows.len());
    for row in last_sale_rows {
        if let (Some(pid), Some(uv)) = (
            row.get::<Option<i64>, _>("producto_id"),
            row.get::<Option<String>, _>("ultima_venta"),
        ) {
            last_sale_map.insert(pid, uv);
        }
    }

    let mut stock_muerto: Vec<BiDeadStockRow> = Vec::new();
    for pm in prod_map.values() {
        if !pm.matches_filter || !pm.estado_activo || pm.stock_actual <= 0 {
            continue;
        }
        let ultima_venta = last_sale_map.get(&pm.id).cloned();
        let sold_recently = ultima_venta
            .as_deref()
            .and_then(parse_naive_date_prefix)
            .map_or(false, |d| d >= dead_cutoff && d <= period.hasta);

        if sold_recently {
            continue;
        }

        let dias_sin_venta = ultima_venta
            .as_deref()
            .and_then(parse_naive_date_prefix)
            .map(|d| (period.hasta - d).num_days().max(0));

        let capital_inmovilizado = if puede_ver_costos_y_margenes {
            Some((Decimal::from(pm.stock_actual) * pm.precio_compra).round_dp(2))
        } else {
            None
        };

        stock_muerto.push(BiDeadStockRow {
            producto_id: pm.id,
            codigo_sku: pm.codigo_sku.clone(),
            nombre: pm.nombre.clone(),
            categoria: pm.categoria.clone(),
            stock_actual: pm.stock_actual,
            precio_venta: pm.precio_venta,
            capital_inmovilizado,
            ultima_venta,
            dias_sin_venta,
        });
    }
    stock_muerto.sort_by(|a, b| {
        b.stock_actual
            .cmp(&a.stock_actual)
            .then_with(|| a.producto_id.cmp(&b.producto_id))
    });
    stock_muerto.truncate(50);

    // 4. Mermas y consumos internos en el rango
    let shrinkage_rows = sqlx::query(
        r#"
        SELECT
            im.producto_id,
            im.tipo_movimiento,
            im.cantidad,
            CAST(im.costo_unitario_momento AS TEXT) AS costo_unitario_momento
        FROM inventario_movimientos im
        WHERE im.tipo_movimiento IN (
            'MERMA', 'MERMA_DANIO', 'MERMA_VENCIMIENTO', 'CONSUMO_PROPIO', 'CONSUMO_INTERNO'
        )
          AND im.created_at BETWEEN ? AND ?
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .fetch_all(pool)
    .await?;

    let mut shrink_acc: HashMap<String, (i64, i64, Decimal)> = HashMap::new();
    let mut mermas_unidades: i64 = 0;
    let mut mermas_costo_total = Decimal::ZERO;

    for row in shrinkage_rows {
        let prod_id: i64 = row.get("producto_id");
        let Some(pm) = prod_map.get(&prod_id) else {
            continue;
        };
        if !pm.matches_filter {
            continue;
        }
        let tipo: String = row.get("tipo_movimiento");
        let cantidad: i64 = row.get("cantidad");
        let unit_cost_momento = parse_decimal(row.get("costo_unitario_momento"));
        let unit_cost = if unit_cost_momento > Decimal::ZERO {
            unit_cost_momento
        } else {
            pm.precio_compra
        };
        let costo = (unit_cost * Decimal::from(cantidad)).round_dp(2);

        mermas_unidades += cantidad;
        mermas_costo_total += costo;

        let entry = shrink_acc.entry(tipo).or_insert((0, 0, Decimal::ZERO));
        entry.0 += 1;
        entry.1 += cantidad;
        entry.2 += costo;
    }

    let mut resumen_mermas: Vec<BiShrinkageSummaryRow> = shrink_acc
        .into_iter()
        .map(
            |(tipo_movimiento, (eventos_count, unidades, costo))| BiShrinkageSummaryRow {
                etiqueta: shrinkage_label(&tipo_movimiento).to_string(),
                tipo_movimiento,
                eventos_count,
                unidades,
                costo_estimado: if puede_ver_costos_y_margenes {
                    Some(costo)
                } else {
                    None
                },
            },
        )
        .collect();
    resumen_mermas.sort_by(|a, b| {
        b.unidades
            .cmp(&a.unidades)
            .then_with(|| a.tipo_movimiento.cmp(&b.tipo_movimiento))
    });

    let (margen_bruto_estimado, margen_bruto_pct, valorizacion_inventario, mermas_costo_estimado) =
        if puede_ver_costos_y_margenes {
            let pct = if cur_ingresos > Decimal::ZERO {
                round_pct((cur_margen / cur_ingresos) * Decimal::from(100))
            } else {
                0.0
            };
            (
                Some(BiKpiComparison {
                    actual: cur_margen,
                    anterior: prev_margen,
                    delta_pct: compute_delta_pct(cur_margen, prev_margen),
                }),
                Some(pct),
                Some(valorizacion),
                Some(mermas_costo_total),
            )
        } else {
            (None, None, None, None)
        };

    let proveedores_disponibles = fetch_active_suppliers_options(pool).await?;

    Ok(BiInventoryAnalyticsDto {
        fecha_desde: period.desde.format("%Y-%m-%d").to_string(),
        fecha_hasta: period.hasta.format("%Y-%m-%d").to_string(),
        periodo_anterior_desde: period.prev_desde.format("%Y-%m-%d").to_string(),
        periodo_anterior_hasta: period.prev_hasta.format("%Y-%m-%d").to_string(),
        dias_stock_muerto,
        puede_ver_costos_y_margenes,
        ingresos_productos: BiKpiComparison {
            actual: cur_ingresos,
            anterior: prev_ingresos,
            delta_pct: compute_delta_pct(cur_ingresos, prev_ingresos),
        },
        unidades_vendidas: BiKpiComparison {
            actual: Decimal::from(cur_unidades),
            anterior: Decimal::from(prev_unidades),
            delta_pct: compute_delta_pct(Decimal::from(cur_unidades), Decimal::from(prev_unidades)),
        },
        margen_bruto_estimado,
        margen_bruto_pct,
        valorizacion_inventario,
        productos_activos_count,
        productos_stock_critico_count,
        mermas_unidades,
        mermas_costo_estimado,
        top_productos,
        ventas_por_categoria,
        stock_muerto,
        resumen_mermas,
        proveedores_disponibles,
        generated_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// Exporta rendimiento de productos y stock muerto en CSV o XLSX, ocultando costos/márgenes si `!puede_ver_costos_y_margenes`.
pub async fn export_bi_inventory_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiExportInventoryInput,
) -> Result<ExportFileResult, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabInventario,
        "Acceso denegado: no tiene permiso para visualizar analítica de productos e inventario.",
    )
    .await?;
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::ExportarContextualBi,
        "Acceso denegado: no tiene permiso para exportar reportes contextuales de BI.",
    )
    .await?;

    if input.format == ExportFormat::Pdf {
        return Err(AppError::Validation(
            "La exportación contextual de Inventario BI solo soporta formatos CSV y XLSX.".into(),
        ));
    }

    let dto = get_bi_inventory_analytics(pool, session, input.filter).await?;

    let mut rows: Vec<Vec<ExportCell>> = Vec::new();
    let bytes = if dto.puede_ver_costos_y_margenes {
        let headers = [
            "Seccion",
            "SKU",
            "Producto / Tipo",
            "Categoria",
            "Unidades / Stock",
            "Ingresos / Precio",
            "Margen / Capital Inmovilizado",
            "Margen % / Dias Sin Venta",
        ];

        for p in &dto.top_productos {
            rows.push(vec![
                ExportCell::Text("TOP_PRODUCTO".to_string()),
                ExportCell::Text(p.codigo_sku.clone()),
                ExportCell::Text(p.nombre.clone()),
                ExportCell::Text(p.categoria.clone()),
                ExportCell::Number(p.unidades_vendidas.to_string()),
                ExportCell::Number(format!("{:.2}", p.ingresos)),
                ExportCell::Number(format!(
                    "{:.2}",
                    p.margen_estimado.unwrap_or(Decimal::ZERO)
                )),
                ExportCell::Number(format!("{:.1}", p.margen_pct.unwrap_or(0.0))),
            ]);
        }
        for s in &dto.stock_muerto {
            rows.push(vec![
                ExportCell::Text("STOCK_MUERTO".to_string()),
                ExportCell::Text(s.codigo_sku.clone()),
                ExportCell::Text(s.nombre.clone()),
                ExportCell::Text(s.categoria.clone()),
                ExportCell::Number(s.stock_actual.to_string()),
                ExportCell::Number(format!("{:.2}", s.precio_venta)),
                ExportCell::Number(format!(
                    "{:.2}",
                    s.capital_inmovilizado.unwrap_or(Decimal::ZERO)
                )),
                ExportCell::Text(
                    s.dias_sin_venta
                        .map(|d| d.to_string())
                        .unwrap_or_else(|| "SIN_VENTAS".to_string()),
                ),
            ]);
        }
        match input.format {
            ExportFormat::Csv => build_csv_bytes(&headers, &rows),
            ExportFormat::Xlsx => build_xlsx_bytes("Inventario BI", &headers, &rows),
            ExportFormat::Pdf => unreachable!(),
        }
    } else {
        // Sin permiso financiero: omite columnas de margen, costos y capital inmovilizado
        let headers = [
            "Seccion",
            "SKU",
            "Producto / Tipo",
            "Categoria",
            "Unidades / Stock",
            "Ingresos / Precio",
            "Stock Min / Dias Sin Venta",
        ];

        for p in &dto.top_productos {
            rows.push(vec![
                ExportCell::Text("TOP_PRODUCTO".to_string()),
                ExportCell::Text(p.codigo_sku.clone()),
                ExportCell::Text(p.nombre.clone()),
                ExportCell::Text(p.categoria.clone()),
                ExportCell::Number(p.unidades_vendidas.to_string()),
                ExportCell::Number(format!("{:.2}", p.ingresos)),
                ExportCell::Number(p.stock_minimo.to_string()),
            ]);
        }
        for s in &dto.stock_muerto {
            rows.push(vec![
                ExportCell::Text("STOCK_MUERTO".to_string()),
                ExportCell::Text(s.codigo_sku.clone()),
                ExportCell::Text(s.nombre.clone()),
                ExportCell::Text(s.categoria.clone()),
                ExportCell::Number(s.stock_actual.to_string()),
                ExportCell::Number(format!("{:.2}", s.precio_venta)),
                ExportCell::Text(
                    s.dias_sin_venta
                        .map(|d| d.to_string())
                        .unwrap_or_else(|| "SIN_VENTAS".to_string()),
                ),
            ]);
        }
        match input.format {
            ExportFormat::Csv => build_csv_bytes(&headers, &rows),
            ExportFormat::Xlsx => build_xlsx_bytes("Inventario BI", &headers, &rows),
            ExportFormat::Pdf => unreachable!(),
        }
    };

    let filename = format!(
        "bi_productos_inventario_{}_a_{}.{}",
        dto.fecha_desde,
        dto.fecha_hasta,
        input.format.extension()
    );

    finalize_export_and_audit(
        pool,
        session,
        "BI_PRODUCTOS_INVENTARIO",
        filename,
        input.format,
        bytes,
        rows.len(),
    )
    .await
}

// ============================================================================
// BI-SLICE 4B: CONTROL, RIESGO Y REPORTES
// ============================================================================

fn credit_origin_label(origin: &str) -> &'static str {
    match origin {
        "MEMBRESIA_PAGO_PARCIAL" => "Membresía Pago Parcial",
        "PRODUCTO_CREDITO" => "Producto a Crédito",
        "PASE_DIARIO_SEMAFORO_ROJO" => "Pase Diario Semáforo Rojo",
        _ => "Otro Crédito",
    }
}

pub async fn get_bi_control_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiControlFilterInput,
) -> Result<BiControlAnalyticsDto, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabControl,
        "Acceso denegado: no tiene permiso para visualizar analítica de control y riesgo.",
    )
    .await?;

    compute_bi_control_analytics(pool, input).await
}

async fn compute_bi_control_analytics(
    pool: &SqlitePool,
    input: BiControlFilterInput,
) -> Result<BiControlAnalyticsDto, AppError> {

    let period = resolve_date_period(&input.fecha_desde, &input.fecha_hasta, None)?;
    let filter_origen = validate_optional_enum_filter(
        &input.origen_credito,
        &[
            "MEMBRESIA_PAGO_PARCIAL",
            "PRODUCTO_CREDITO",
            "PASE_DIARIO_SEMAFORO_ROJO",
        ],
        "origen_credito",
    )?;
    let (cur_start, cur_end) = date_bounds(period.desde, period.hasta);
    let today = Local::now().date_naive();

    // 1. Operadores disponibles
    let op_rows = sqlx::query(
        r#"
        SELECT
            u.id,
            u.username,
            TRIM(p.nombres || ' ' || p.apellidos) AS nombre_completo
        FROM usuarios_sistema u
        INNER JOIN personas p ON p.id = u.persona_id
        ORDER BY u.id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut user_meta_map: HashMap<i64, (String, String)> = HashMap::with_capacity(op_rows.len());
    let mut operadores_disponibles: Vec<BiSimpleOption> = Vec::with_capacity(op_rows.len());
    for row in op_rows {
        let uid: i64 = row.get("id");
        let username: String = row.get("username");
        let nombre_completo: String = row.get("nombre_completo");
        operadores_disponibles.push(BiSimpleOption {
            id: uid,
            label: format!("{} — {}", username, nombre_completo),
        });
        user_meta_map.insert(uid, (username, nombre_completo));
    }

    // 2. Cartera de créditos: pendientes (aging + origen) y emitidos/cobrados en rango
    let credit_rows = sqlx::query(
        r#"
        SELECT
            cc.id,
            cc.cliente_id,
            cc.origen_credito,
            CAST(cc.monto_total AS TEXT) AS monto_total,
            CAST(cc.monto_pagado AS TEXT) AS monto_pagado,
            CAST(cc.saldo_pendiente AS TEXT) AS saldo_pendiente,
            cc.estado,
            cc.fecha_emision,
            cc.fecha_ultimo_pago,
            EXISTS (
                SELECT 1
                FROM venta_detalles vd
                INNER JOIN ventas v ON v.id = vd.venta_id
                WHERE vd.credito_id = cc.id
                  AND vd.tipo_item = 'AMORTIZACION_CREDITO'
                  AND v.estado_venta = 'COMPLETADA'
            ) AS tiene_amort_pos
        FROM creditos_clientes cc
        WHERE cc.estado != 'ANULADO'
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut saldo_pendiente_total = Decimal::ZERO;
    let mut debtors_set: HashSet<i64> = HashSet::new();
    let mut creditos_pendientes_count: i64 = 0;
    let mut creditos_emitidos_periodo = Decimal::ZERO;
    let mut direct_paid_no_pos = Decimal::ZERO;

    let mut aging_acc: HashMap<&'static str, (Decimal, i64)> = HashMap::new();
    let mut origin_acc: HashMap<String, (Decimal, i64)> = HashMap::new();

    for row in credit_rows {
        let origen: String = row.get("origen_credito");
        if let Some(ref f_orig) = filter_origen {
            if &origen != f_orig {
                continue;
            }
        }
        let estado: String = row.get("estado");
        let monto_total = parse_decimal(row.get("monto_total"));
        let monto_pagado = parse_decimal(row.get("monto_pagado"));
        let saldo_pendiente = parse_decimal(row.get("saldo_pendiente"));
        let fecha_emision: String = row.get("fecha_emision");
        let fecha_ultimo_pago: Option<String> = row.get("fecha_ultimo_pago");
        let tiene_amort_pos = row.get::<i64, _>("tiene_amort_pos") == 1;

        if let Some(d_em) = parse_naive_date_prefix(&fecha_emision) {
            if d_em >= period.desde && d_em <= period.hasta {
                creditos_emitidos_periodo += monto_total;
            }
        }

        if !tiene_amort_pos && monto_pagado > Decimal::ZERO {
            if let Some(d_pay) = fecha_ultimo_pago.as_deref().and_then(parse_naive_date_prefix) {
                if d_pay >= period.desde && d_pay <= period.hasta {
                    direct_paid_no_pos += monto_pagado;
                }
            }
        }

        if estado == "PENDIENTE" && saldo_pendiente > Decimal::ZERO {
            saldo_pendiente_total += saldo_pendiente;
            debtors_set.insert(row.get("cliente_id"));
            creditos_pendientes_count += 1;

            let age_days = parse_naive_date_prefix(&fecha_emision)
                .map(|d| (today - d).num_days().max(0))
                .unwrap_or(0);
            let aging_key = if age_days <= 7 {
                "0_7_DIAS"
            } else if age_days <= 30 {
                "8_30_DIAS"
            } else if age_days <= 60 {
                "31_60_DIAS"
            } else {
                "MAS_60_DIAS"
            };
            let a_entry = aging_acc.entry(aging_key).or_insert((Decimal::ZERO, 0));
            a_entry.0 += saldo_pendiente;
            a_entry.1 += 1;

            let o_entry = origin_acc.entry(origen).or_insert((Decimal::ZERO, 0));
            o_entry.0 += saldo_pendiente;
            o_entry.1 += 1;
        }
    }

    let pos_amort_str: Option<String> = sqlx::query_scalar(
        r#"
        SELECT CAST(COALESCE(SUM(vd.subtotal), 0) AS TEXT)
        FROM venta_detalles vd
        INNER JOIN ventas v ON v.id = vd.venta_id
        INNER JOIN creditos_clientes cc ON cc.id = vd.credito_id
        WHERE vd.tipo_item = 'AMORTIZACION_CREDITO'
          AND v.estado_venta = 'COMPLETADA'
          AND v.created_at BETWEEN ? AND ?
          AND cc.estado != 'ANULADO'
          AND (? IS NULL OR cc.origen_credito = ?)
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .bind(filter_origen.as_deref())
    .bind(filter_origen.as_deref())
    .fetch_one(pool)
    .await?;

    let creditos_cobrados_periodo = parse_decimal(pos_amort_str) + direct_paid_no_pos;
    let tasa_recuperacion_pct = if creditos_emitidos_periodo > Decimal::ZERO {
        round_pct((creditos_cobrados_periodo / creditos_emitidos_periodo) * Decimal::from(100))
    } else {
        0.0
    };

    let aging_cartera: Vec<BiCategoryAmount> = [
        ("0_7_DIAS", "0 - 7 días"),
        ("8_30_DIAS", "8 - 30 días"),
        ("31_60_DIAS", "31 - 60 días"),
        ("MAS_60_DIAS", "Más de 60 días"),
    ]
    .into_iter()
    .map(|(clave, etiqueta)| {
        let (monto, cantidad) = aging_acc
            .get(clave)
            .copied()
            .unwrap_or((Decimal::ZERO, 0));
        BiCategoryAmount {
            clave: clave.to_string(),
            etiqueta: etiqueta.to_string(),
            monto,
            porcentaje: compute_share_pct(monto, saldo_pendiente_total),
            cantidad,
        }
    })
    .collect();

    let deuda_por_origen: Vec<BiCategoryAmount> = [
        "MEMBRESIA_PAGO_PARCIAL",
        "PRODUCTO_CREDITO",
        "PASE_DIARIO_SEMAFORO_ROJO",
    ]
    .into_iter()
    .map(|clave| {
        let (monto, cantidad) = origin_acc
            .get(clave)
            .copied()
            .unwrap_or((Decimal::ZERO, 0));
        BiCategoryAmount {
            clave: clave.to_string(),
            etiqueta: credit_origin_label(clave).to_string(),
            monto,
            porcentaje: compute_share_pct(monto, saldo_pendiente_total),
            cantidad,
        }
    })
    .collect();

    // 3. Arqueos de caja (turnos cerrados en el rango)
    let shift_rows = sqlx::query(
        r#"
        SELECT
            COALESCE(usuario_cierre_id, usuario_apertura_id) AS operador_id,
            CAST(COALESCE(diferencia_arqueo_fisico, 0) AS TEXT) AS diferencia
        FROM turnos_caja
        WHERE estado = 'CERRADO'
          AND fecha_cierre BETWEEN ? AND ?
          AND (? IS NULL OR COALESCE(usuario_cierre_id, usuario_apertura_id) = ?)
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .bind(input.usuario_id)
    .bind(input.usuario_id)
    .fetch_all(pool)
    .await?;

    let mut turnos_cerrados_count: i64 = 0;
    let mut turnos_cuadre_exacto_count: i64 = 0;
    let mut turnos_con_sobrante_count: i64 = 0;
    let mut turnos_con_faltante_count: i64 = 0;
    let mut descuadre_neto_acumulado = Decimal::ZERO;

    // (cerrados, con_diferencia, sobrante, faltante, neta)
    let mut cash_op_map: HashMap<i64, (i64, i64, Decimal, Decimal, Decimal)> = HashMap::new();

    for row in shift_rows {
        let op_id: i64 = row.get("operador_id");
        let diff = parse_decimal(row.get("diferencia"));

        turnos_cerrados_count += 1;
        descuadre_neto_acumulado += diff;

        let entry = cash_op_map.entry(op_id).or_insert((
            0,
            0,
            Decimal::ZERO,
            Decimal::ZERO,
            Decimal::ZERO,
        ));
        entry.0 += 1;
        entry.4 += diff;

        if diff == Decimal::ZERO {
            turnos_cuadre_exacto_count += 1;
        } else if diff > Decimal::ZERO {
            turnos_con_sobrante_count += 1;
            entry.1 += 1;
            entry.2 += diff;
        } else {
            turnos_con_faltante_count += 1;
            entry.1 += 1;
            entry.3 += diff.abs();
        }
    }

    let mut arqueos_por_operador: Vec<BiOperatorCashAuditRow> = cash_op_map
        .into_iter()
        .map(
            |(usuario_id, (turnos_cerrados, turnos_con_diferencia, sobrante_total, faltante_total, diferencia_neta))| {
                let (username, nombre_completo) = user_meta_map
                    .get(&usuario_id)
                    .cloned()
                    .unwrap_or_else(|| (format!("usr_{}", usuario_id), "Usuario".to_string()));
                BiOperatorCashAuditRow {
                    usuario_id,
                    username,
                    nombre_completo,
                    turnos_cerrados,
                    turnos_con_diferencia,
                    sobrante_total,
                    faltante_total,
                    diferencia_neta,
                }
            },
        )
        .collect();
    arqueos_por_operador.sort_by(|a, b| {
        b.turnos_con_diferencia
            .cmp(&a.turnos_con_diferencia)
            .then_with(|| b.diferencia_neta.abs().cmp(&a.diferencia_neta.abs()))
            .then_with(|| a.usuario_id.cmp(&b.usuario_id))
    });

    // 4. Tachados y anulaciones en ventas del periodo
    let strike_rows = sqlx::query(
        r#"
        SELECT
            usuario_vendedor_id,
            estado_venta,
            CAST(total_venta AS TEXT) AS total_venta
        FROM ventas
        WHERE created_at BETWEEN ? AND ?
          AND (? IS NULL OR usuario_vendedor_id = ?)
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .bind(input.usuario_id)
    .bind(input.usuario_id)
    .fetch_all(pool)
    .await?;

    let mut ventas_totales_periodo: i64 = 0;
    let mut ventas_tachadas_count: i64 = 0;
    let mut ventas_anuladas_count: i64 = 0;
    // (totales, tachadas, anuladas, monto_anulado_o_tachado)
    let mut strike_op_map: HashMap<i64, (i64, i64, i64, Decimal)> = HashMap::new();

    for row in strike_rows {
        let uid: i64 = row.get("usuario_vendedor_id");
        let estado: String = row.get("estado_venta");
        let total = parse_decimal(row.get("total_venta"));

        ventas_totales_periodo += 1;
        let entry = strike_op_map.entry(uid).or_insert((0, 0, 0, Decimal::ZERO));
        entry.0 += 1;

        if estado == "TACHADA_EN_TURNO" {
            ventas_tachadas_count += 1;
            entry.1 += 1;
            entry.3 += total;
        } else if estado == "ANULADA_DEFINITIVA" {
            ventas_anuladas_count += 1;
            entry.2 += 1;
            entry.3 += total;
        }
    }

    let tasa_anulacion_pct = if ventas_totales_periodo > 0 {
        round_pct(
            (Decimal::from(ventas_tachadas_count + ventas_anuladas_count)
                / Decimal::from(ventas_totales_periodo))
                * Decimal::from(100),
        )
    } else {
        0.0
    };

    let mut tachados_por_operador: Vec<BiOperatorStrikeRow> = strike_op_map
        .into_iter()
        .map(
            |(usuario_id, (ventas_totales, tachadas_pendientes, anuladas_definitivas, monto_anulado_o_tachado))| {
                let (username, nombre_completo) = user_meta_map
                    .get(&usuario_id)
                    .cloned()
                    .unwrap_or_else(|| (format!("usr_{}", usuario_id), "Usuario".to_string()));
                let tasa_incidencia_pct = if ventas_totales > 0 {
                    round_pct(
                        (Decimal::from(tachadas_pendientes + anuladas_definitivas)
                            / Decimal::from(ventas_totales))
                            * Decimal::from(100),
                    )
                } else {
                    0.0
                };
                BiOperatorStrikeRow {
                    usuario_id,
                    username,
                    nombre_completo,
                    ventas_totales,
                    tachadas_pendientes,
                    anuladas_definitivas,
                    monto_anulado_o_tachado,
                    tasa_incidencia_pct,
                }
            },
        )
        .collect();
    tachados_por_operador.sort_by(|a, b| {
        (b.tachadas_pendientes + b.anuladas_definitivas)
            .cmp(&(a.tachadas_pendientes + a.anuladas_definitivas))
            .then_with(|| b.monto_anulado_o_tachado.cmp(&a.monto_anulado_o_tachado))
            .then_with(|| a.usuario_id.cmp(&b.usuario_id))
    });

    // 5. Últimos 25 eventos críticos en auditoria_logs del periodo
    let audit_rows = sqlx::query(
        r#"
        SELECT id, created_at, username, modulo, accion, detalles_json
        FROM auditoria_logs
        WHERE created_at BETWEEN ? AND ?
          AND (? IS NULL OR usuario_id = ?)
          AND accion IN (
              'CIERRE_FORZADO_DETECTADO',
              'HOME_PERMISSIONS_UPDATED',
              'SALE_STRUCK',
              'SALE_STRIKE_RESOLVED',
              'PURCHASE_CANCELLED',
              'DATABASE_RESTORED',
              'ATTENDANCE_RED_CREDIT_AUTHORIZED',
              'LOGIN_FALLIDO',
              'INVENTORY_MOVEMENT_RECORDED',
              'USER_DEACTIVATED',
              'PLAN_DEACTIVATED',
              'PRODUCT_DEACTIVATED'
          )
        ORDER BY created_at DESC, id DESC
        LIMIT 25
        "#,
    )
    .bind(&cur_start)
    .bind(&cur_end)
    .bind(input.usuario_id)
    .bind(input.usuario_id)
    .fetch_all(pool)
    .await?;

    let eventos_criticos_auditoria: Vec<BiCriticalAuditRow> = audit_rows
        .into_iter()
        .map(|row| BiCriticalAuditRow {
            id: row.get("id"),
            created_at: row.get("created_at"),
            username: row.get("username"),
            modulo: row.get("modulo"),
            accion: row.get("accion"),
            detalles_json: row.get("detalles_json"),
        })
        .collect();

    Ok(BiControlAnalyticsDto {
        fecha_desde: period.desde.format("%Y-%m-%d").to_string(),
        fecha_hasta: period.hasta.format("%Y-%m-%d").to_string(),
        saldo_pendiente_total,
        deudores_activos_count: debtors_set.len() as i64,
        creditos_pendientes_count,
        creditos_emitidos_periodo,
        creditos_cobrados_periodo,
        tasa_recuperacion_pct,
        aging_cartera,
        deuda_por_origen,
        turnos_cerrados_count,
        turnos_cuadre_exacto_count,
        turnos_con_sobrante_count,
        turnos_con_faltante_count,
        descuadre_neto_acumulado,
        arqueos_por_operador,
        ventas_totales_periodo,
        ventas_tachadas_count,
        ventas_anuladas_count,
        tasa_anulacion_pct,
        tachados_por_operador,
        eventos_criticos_auditoria,
        operadores_disponibles,
        generated_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// Exporta aging de cartera y resumen de arqueos/tachados por operador en CSV o XLSX.
pub async fn export_bi_control_analytics(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiExportControlInput,
) -> Result<ExportFileResult, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabControl,
        "Acceso denegado: no tiene permiso para visualizar analítica de control y riesgo.",
    )
    .await?;
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::ExportarContextualBi,
        "Acceso denegado: no tiene permiso para exportar reportes contextuales de BI.",
    )
    .await?;

    if input.format == ExportFormat::Pdf {
        return Err(AppError::Validation(
            "La exportación contextual de Control BI solo soporta formatos CSV y XLSX.".into(),
        ));
    }

    let dto = get_bi_control_analytics(pool, session, input.filter).await?;

    let headers = [
        "Seccion",
        "Clave / Operador",
        "Detalle / Nombre",
        "Cantidad / Turnos / Ventas",
        "Incidencias / Tachados",
        "Monto / Diferencia Neta",
        "Porcentaje / Tasa %",
    ];

    let mut rows: Vec<Vec<ExportCell>> = Vec::new();

    for ag in &dto.aging_cartera {
        rows.push(vec![
            ExportCell::Text("AGING_CARTERA".to_string()),
            ExportCell::Text(ag.clave.clone()),
            ExportCell::Text(ag.etiqueta.clone()),
            ExportCell::Number(ag.cantidad.to_string()),
            ExportCell::Number("0".to_string()),
            ExportCell::Number(format!("{:.2}", ag.monto)),
            ExportCell::Number(format!("{:.1}", ag.porcentaje)),
        ]);
    }

    for aq in &dto.arqueos_por_operador {
        rows.push(vec![
            ExportCell::Text("ARQUEO_OPERADOR".to_string()),
            ExportCell::Text(aq.username.clone()),
            ExportCell::Text(aq.nombre_completo.clone()),
            ExportCell::Number(aq.turnos_cerrados.to_string()),
            ExportCell::Number(aq.turnos_con_diferencia.to_string()),
            ExportCell::Number(format!("{:.2}", aq.diferencia_neta)),
            ExportCell::Number("0.0".to_string()),
        ]);
    }

    for st in &dto.tachados_por_operador {
        rows.push(vec![
            ExportCell::Text("TACHADOS_OPERADOR".to_string()),
            ExportCell::Text(st.username.clone()),
            ExportCell::Text(st.nombre_completo.clone()),
            ExportCell::Number(st.ventas_totales.to_string()),
            ExportCell::Number((st.tachadas_pendientes + st.anuladas_definitivas).to_string()),
            ExportCell::Number(format!("{:.2}", st.monto_anulado_o_tachado)),
            ExportCell::Number(format!("{:.1}", st.tasa_incidencia_pct)),
        ]);
    }

    let bytes = match input.format {
        ExportFormat::Csv => build_csv_bytes(&headers, &rows),
        ExportFormat::Xlsx => build_xlsx_bytes("Control y Riesgo BI", &headers, &rows),
        ExportFormat::Pdf => unreachable!(),
    };

    let filename = format!(
        "bi_control_riesgo_{}_a_{}.{}",
        dto.fecha_desde,
        dto.fecha_hasta,
        input.format.extension()
    );

    finalize_export_and_audit(
        pool,
        session,
        "BI_CONTROL_RIESGO",
        filename,
        input.format,
        bytes,
        rows.len(),
    )
    .await
}

// ============================================================================
// BI-SLICE 5: REPORTE EJECUTIVO PDF CONSOLIDADO EN RAM
// ============================================================================

fn to_pdf_ascii(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            'á' | 'à' | 'ä' | 'â' => out.push('a'),
            'Á' | 'À' | 'Ä' | 'Â' => out.push('A'),
            'é' | 'è' | 'ë' | 'ê' => out.push('e'),
            'É' | 'È' | 'Ë' | 'Ê' => out.push('E'),
            'í' | 'ì' | 'ï' | 'î' => out.push('i'),
            'Í' | 'Ì' | 'Ï' | 'Î' => out.push('I'),
            'ó' | 'ò' | 'ö' | 'ô' => out.push('o'),
            'Ó' | 'Ò' | 'Ö' | 'Ô' => out.push('O'),
            'ú' | 'ù' | 'ü' | 'û' => out.push('u'),
            'Ú' | 'Ù' | 'Ü' | 'Û' => out.push('U'),
            'ñ' => out.push('n'),
            'Ñ' => out.push('N'),
            '—' | '–' => out.push('-'),
            c if c.is_ascii() => out.push(c),
            _ => out.push(' '),
        }
    }
    out
}

fn fmt_delta_opt(delta: Option<f64>) -> String {
    match delta {
        Some(v) if v > 0.0 => format!("+{:.1}%", v),
        Some(v) => format!("{:.1}%", v),
        None => "N/A".to_string(),
    }
}

struct ExecutivePdfBuilder {
    pages: Vec<String>,
    current: String,
    y: i32,
    header_empresa: String,
    header_sub: String,
    line_count: usize,
}

impl ExecutivePdfBuilder {
    fn new(
        empresa_nombre: &str,
        empresa_ruc: &str,
        empresa_dir: &str,
        empresa_tel: &str,
        periodo_line: &str,
        comparativo_line: &str,
        emision_line: &str,
    ) -> Self {
        let mut b = Self {
            pages: Vec::new(),
            current: String::with_capacity(4096),
            y: 790,
            header_empresa: to_pdf_ascii(empresa_nombre),
            header_sub: to_pdf_ascii(&format!("R.U.C.: {} | {}", empresa_ruc, empresa_dir)),
            line_count: 0,
        };
        b.start_first_page(empresa_tel, periodo_line, comparativo_line, emision_line);
        b
    }

    fn start_first_page(
        &mut self,
        empresa_tel: &str,
        periodo_line: &str,
        comparativo_line: &str,
        emision_line: &str,
    ) {
        self.current.clear();
        self.current
            .push_str("0.12 0.22 0.36 rg\n42 752 511 58 re f\n");
        self.current.push_str(&format!(
            "1 1 1 rg\nBT\n/F1 14 Tf\n52 790 Td\n({}) Tj\nET\n",
            escape_pdf(&self.header_empresa)
        ));
        self.current.push_str(
            "BT\n/F1 10 Tf\n52 773 Td\n(REPORTE EJECUTIVO DE INTELIGENCIA DE NEGOCIO) Tj\nET\n",
        );
        self.current.push_str(&format!(
            "BT\n/F1 7.5 Tf\n52 760 Td\n({} | Tel: {}) Tj\nET\n",
            escape_pdf(&self.header_sub),
            escape_pdf(&to_pdf_ascii(empresa_tel))
        ));

        self.current.push_str("0 0 0 rg\n");
        self.current.push_str(&format!(
            "BT\n/F1 8 Tf\n42 736 Td\n({}) Tj\nET\n",
            escape_pdf(&to_pdf_ascii(periodo_line))
        ));
        self.current.push_str(&format!(
            "BT\n/F1 8 Tf\n42 724 Td\n({}  |  {}) Tj\nET\n",
            escape_pdf(&to_pdf_ascii(comparativo_line)),
            escape_pdf(&to_pdf_ascii(emision_line))
        ));
        self.current
            .push_str("0.4 w\n0.75 0.78 0.82 RG\n42 716 m 553 716 l S\n");
        self.y = 700;
    }

    fn push_continuation_page(&mut self) {
        let finished = std::mem::take(&mut self.current);
        self.pages.push(finished);
        self.current = String::with_capacity(4096);
        self.current.push_str(&format!(
            "0.35 0.35 0.35 rg\nBT\n/F1 8 Tf\n42 806 Td\n({} - REPORTE EJECUTIVO BI \\(Continuacion\\)) Tj\nET\n0 0 0 rg\n",
            escape_pdf(&self.header_empresa)
        ));
        self.current
            .push_str("0.3 w\n0.8 0.8 0.8 RG\n42 798 m 553 798 l S\n");
        self.y = 780;
    }

    fn ensure_space(&mut self, needed_pt: i32) {
        if self.y - needed_pt < 52 {
            self.push_continuation_page();
        }
    }

    fn section(&mut self, title: &str) {
        self.ensure_space(40);
        self.current.push_str(&format!(
            "0.92 0.94 0.97 rg\n42 {} 511 16 re f\n",
            self.y - 4
        ));
        self.current.push_str(&format!(
            "0.10 0.18 0.30 rg\nBT\n/F1 9.5 Tf\n48 {} Td\n({}) Tj\nET\n0 0 0 rg\n",
            self.y,
            escape_pdf(&to_pdf_ascii(title))
        ));
        self.y -= 20;
        self.line_count += 1;
    }

    fn line(&mut self, text: &str) {
        self.ensure_space(14);
        self.current.push_str(&format!(
            "BT\n/F1 8 Tf\n48 {} Td\n({}) Tj\nET\n",
            self.y,
            escape_pdf(&to_pdf_ascii(text))
        ));
        self.y -= 13;
        self.line_count += 1;
    }

    fn subline(&mut self, text: &str) {
        self.ensure_space(13);
        self.current.push_str(&format!(
            "0.18 0.18 0.18 rg\nBT\n/F1 7.5 Tf\n58 {} Td\n({}) Tj\nET\n0 0 0 rg\n",
            self.y,
            escape_pdf(&to_pdf_ascii(text))
        ));
        self.y -= 12;
        self.line_count += 1;
    }

    fn gap(&mut self, pts: i32) {
        self.y -= pts;
    }

    fn finish(mut self) -> Result<(Vec<u8>, usize), AppError> {
        if !self.current.is_empty() {
            self.pages.push(self.current);
        }
        let total_pages = self.pages.len();
        let mut streams: Vec<Vec<u8>> = Vec::with_capacity(total_pages);
        for (idx, mut p) in self.pages.into_iter().enumerate() {
            p.push_str(&format!(
                "0.4 0.4 0.4 rg\nBT\n/F1 7 Tf\n42 28 Td\n(ZaramaGYM Business Intelligence - Generado en memoria RAM) Tj\nET\nBT\n/F1 7 Tf\n490 28 Td\n(Pagina {} de {}) Tj\nET\n",
                idx + 1,
                total_pages
            ));
            streams.push(p.into_bytes());
        }
        let bytes = MinimalPdfDocument::compile_pages_with_size(&streams, 595, 842)?;
        Ok((bytes, self.line_count))
    }
}

/// Genera el Reporte Ejecutivo BI Consolidado multi-página en RAM (%PDF-1.4).
/// Exige permiso gerencial `ExportarReporteEjecutivoPdf`.
pub async fn generate_executive_bi_report_pdf(
    pool: &SqlitePool,
    session: &AuthSession,
    input: BiExecutivePdfInput,
) -> Result<ExportFileResult, AppError> {
    permissions_service::require_permission(
        pool,
        session,
        ReceptionistPermissionKey::ExportarReporteEjecutivoPdf,
        "No cuenta con permisos para generar el Reporte Ejecutivo PDF consolidado.",
    )
    .await?;

    let config = get_printing_backup_config(pool, session).await?;

    let finance = compute_bi_finance_analytics(
        pool,
        BiFinanceFilterInput {
            fecha_desde: input.fecha_desde.clone(),
            fecha_hasta: input.fecha_hasta.clone(),
            granularidad: None,
            canal_caja: input.canal_caja.clone(),
        },
    )
    .await?;

    let members = compute_bi_members_analytics(
        pool,
        BiMembersFilterInput {
            fecha_desde: finance.fecha_desde.clone(),
            fecha_hasta: finance.fecha_hasta.clone(),
            ..Default::default()
        },
    )
    .await?;

    let attendance = compute_bi_attendance_analytics(
        pool,
        BiAttendanceFilterInput {
            fecha_desde: finance.fecha_desde.clone(),
            fecha_hasta: finance.fecha_hasta.clone(),
            ..Default::default()
        },
    )
    .await?;

    // Escudo de costos/márgenes: Administrador siempre true; Recepcionista requiere VerTabFinanzas
    let puede_ver_costos = permissions_service::has_permission(
        pool,
        session,
        ReceptionistPermissionKey::VerTabFinanzas,
    )
    .await?;

    let inventory = compute_bi_inventory_analytics(
        pool,
        BiInventoryFilterInput {
            fecha_desde: finance.fecha_desde.clone(),
            fecha_hasta: finance.fecha_hasta.clone(),
            ..Default::default()
        },
        puede_ver_costos,
    )
    .await?;

    let control = compute_bi_control_analytics(
        pool,
        BiControlFilterInput {
            fecha_desde: finance.fecha_desde.clone(),
            fecha_hasta: finance.fecha_hasta.clone(),
            ..Default::default()
        },
    )
    .await?;

    let periodo_line = format!(
        "Periodo analizado: {} al {} | Canal: {}",
        finance.fecha_desde, finance.fecha_hasta, finance.canal_aplicado
    );
    let comparativo_line = format!(
        "Periodo comparativo: {} al {}",
        finance.periodo_anterior_desde, finance.periodo_anterior_hasta
    );
    let emision_line = format!("Emitido: {}", finance.generated_at);

    let mut pdf = ExecutivePdfBuilder::new(
        &config.empresa_nombre_comercial,
        &config.empresa_ruc,
        &config.empresa_direccion,
        &config.empresa_telefono,
        &periodo_line,
        &comparativo_line,
        &emision_line,
    );

    // BLOQUE 1 — FINANZAS Y RENTABILIDAD
    pdf.section("BLOQUE 1: FINANZAS Y RENTABILIDAD");
    pdf.line(&format!(
        "Ingresos: PEN {:.2} (Prev: {:.2} | Var: {})   |   Compras: PEN {:.2} (Prev: {:.2} | Var: {})",
        finance.ingresos.actual,
        finance.ingresos.anterior,
        fmt_delta_opt(finance.ingresos.delta_pct),
        finance.compras.actual,
        finance.compras.anterior,
        fmt_delta_opt(finance.compras.delta_pct),
    ));
    pdf.line(&format!(
        "Gastos Operativos: PEN {:.2} (Prev: {:.2} | Var: {})   |   Egresos Totales: PEN {:.2} (Var: {})",
        finance.gastos.actual,
        finance.gastos.anterior,
        fmt_delta_opt(finance.gastos.delta_pct),
        finance.egresos.actual,
        fmt_delta_opt(finance.egresos.delta_pct),
    ));
    pdf.line(&format!(
        "Flujo Neto: PEN {:.2} (Prev: {:.2} | Var: {})   |   Margen Operativo: {:.1}% (Prev: {:.1}%)",
        finance.flujo_neto.actual,
        finance.flujo_neto.anterior,
        fmt_delta_opt(finance.flujo_neto.delta_pct),
        finance.margen_operativo_pct,
        finance.margen_operativo_anterior_pct,
    ));
    pdf.line(&format!(
        "Ticket Promedio: PEN {:.2} (Var: {})   |   Descuentos: PEN {:.2} (Var: {})   |   Ventas: {}",
        finance.ticket_promedio.actual,
        fmt_delta_opt(finance.ticket_promedio.delta_pct),
        finance.descuentos_totales.actual,
        fmt_delta_opt(finance.descuentos_totales.delta_pct),
        finance.ventas_count,
    ));

    let mix_lineas_txt: Vec<String> = finance
        .mix_lineas
        .iter()
        .map(|m| format!("{}: PEN {:.2} ({:.1}%)", m.etiqueta, m.monto, m.porcentaje))
        .collect();
    pdf.subline(&format!("Mix por Linea: {}", mix_lineas_txt.join(" | ")));

    let mix_metodos_txt: Vec<String> = finance
        .mix_metodos_pago
        .iter()
        .map(|m| format!("{}: PEN {:.2} ({:.1}%)", m.etiqueta, m.monto, m.porcentaje))
        .collect();
    pdf.subline(&format!("Metodos de Pago: {}", mix_metodos_txt.join(" | ")));
    pdf.gap(6);

    // BLOQUE 2 — SOCIOS, DEMOGRAFÍA Y RETENCIÓN
    pdf.section("BLOQUE 2: SOCIOS, DEMOGRAFIA Y RETENCION");
    pdf.line(&format!(
        "Socios Activos: {}   |   Membresias Vigentes: {}   |   Nuevos Inscritos: {} (Prev: {} | Var: {})",
        members.socios_activos_total,
        members.membresias_vigentes_total,
        members.nuevos_socios.actual,
        members.nuevos_socios.anterior,
        fmt_delta_opt(members.nuevos_socios.delta_pct),
    ));
    pdf.line(&format!(
        "Vencimientos: {}   |   Renovaciones: {}   |   Tasa Renovacion: {:.1}%   |   Churn: {:.1}%   |   ARPU: PEN {:.2} ({})",
        members.vencimientos_en_periodo,
        members.renovaciones_en_periodo,
        members.tasa_renovacion_pct,
        members.tasa_churn_pct,
        members.arpu.actual,
        fmt_delta_opt(members.arpu.delta_pct),
    ));
    if members.rendimiento_planes.is_empty() {
        pdf.subline("Top Planes: Sin ventas de planes en el periodo.");
    } else {
        let top_plans: Vec<String> = members
            .rendimiento_planes
            .iter()
            .take(5)
            .map(|p| {
                format!(
                    "{} ({}u - PEN {:.2} / {:.1}%)",
                    p.nombre, p.unidades_vendidas, p.ingresos, p.porcentaje_ingresos
                )
            })
            .collect();
        pdf.subline(&format!("Top 5 Planes: {}", top_plans.join(" | ")));
    }
    let age_txt: Vec<String> = members
        .distribucion_edad
        .iter()
        .filter(|c| c.cantidad > 0)
        .map(|c| format!("{}: {} ({:.1}%)", c.etiqueta, c.cantidad, c.porcentaje))
        .collect();
    pdf.subline(&format!(
        "Edad: {}",
        if age_txt.is_empty() {
            "Sin datos".to_string()
        } else {
            age_txt.join(" | ")
        }
    ));
    let gen_txt: Vec<String> = members
        .distribucion_genero
        .iter()
        .filter(|c| c.cantidad > 0)
        .map(|c| format!("{}: {} ({:.1}%)", c.etiqueta, c.cantidad, c.porcentaje))
        .collect();
    pdf.subline(&format!(
        "Genero (Cob. {:.1}%): {}",
        members.cobertura_genero_pct,
        if gen_txt.is_empty() {
            "Sin datos".to_string()
        } else {
            gen_txt.join(" | ")
        }
    ));
    let cap_txt: Vec<String> = members
        .distribucion_captacion
        .iter()
        .filter(|c| c.cantidad > 0)
        .map(|c| format!("{}: {} ({:.1}%)", c.etiqueta, c.cantidad, c.porcentaje))
        .collect();
    pdf.subline(&format!(
        "Captacion (Cob. {:.1}%): {}",
        members.cobertura_captacion_pct,
        if cap_txt.is_empty() {
            "Sin datos".to_string()
        } else {
            cap_txt.join(" | ")
        }
    ));
    pdf.gap(6);

    // BLOQUE 3 — ASISTENCIA Y OPERACIÓN
    pdf.section("BLOQUE 3: ASISTENCIA Y OPERACION");
    let pico_txt = attendance
        .dia_hora_pico
        .as_ref()
        .map(|p| format!("{} {} ({} ingresos)", p.dia_nombre, p.franja, p.total))
        .unwrap_or_else(|| "Sin registros".to_string());
    pdf.line(&format!(
        "Total Asistencias: {} (Prev: {} | Var: {})   |   Promedio Diario: {:.1}   |   Socios Unicos: {} (Var: {})",
        attendance.total_asistencias.actual,
        attendance.total_asistencias.anterior,
        fmt_delta_opt(attendance.total_asistencias.delta_pct),
        attendance.promedio_diario,
        attendance.socios_unicos.actual,
        fmt_delta_opt(attendance.socios_unicos.delta_pct),
    ));
    pdf.line(&format!(
        "Frecuencia Semanal Promedio: {:.1} vis/sem   |   Dia y Hora Pico: {}",
        attendance.frecuencia_semanal_promedio, pico_txt
    ));
    let sem_txt: Vec<String> = attendance
        .distribucion_semaforo
        .iter()
        .map(|s| format!("{}: {} ({:.1}%)", s.clave, s.cantidad, s.porcentaje))
        .collect();
    pdf.subline(&format!("Semaforo: {}", sem_txt.join(" | ")));
    pdf.subline(&format!(
        "Pases Diario en Rojo: Emitidos {} | Cobrados {} | Tasa Cobro: {:.1}% | Saldo Pendiente: PEN {:.2}",
        attendance.pases_rojo_emitidos,
        attendance.pases_rojo_cobrados,
        attendance.pases_rojo_tasa_cobro_pct,
        attendance.pases_rojo_saldo_pendiente,
    ));
    pdf.gap(6);

    // BLOQUE 4 — INVENTARIO Y CONTROL DE RIESGO
    pdf.section("BLOQUE 4: INVENTARIO Y CONTROL DE RIESGO");
    if inventory.puede_ver_costos_y_margenes {
        pdf.line(&format!(
            "Ingresos Tienda: PEN {:.2} (Var: {})   |   Margen Bruto: PEN {:.2} ({:.1}%)   |   Valorizacion Stock: PEN {:.2}",
            inventory.ingresos_productos.actual,
            fmt_delta_opt(inventory.ingresos_productos.delta_pct),
            inventory
                .margen_bruto_estimado
                .as_ref()
                .map(|m| m.actual)
                .unwrap_or(Decimal::ZERO),
            inventory.margen_bruto_pct.unwrap_or(0.0),
            inventory.valorizacion_inventario.unwrap_or(Decimal::ZERO),
        ));
        pdf.line(&format!(
            "Productos Activos: {}   |   Stock Critico: {}   |   Mermas/Consumo: {} unid (PEN {:.2})",
            inventory.productos_activos_count,
            inventory.productos_stock_critico_count,
            inventory.mermas_unidades,
            inventory.mermas_costo_estimado.unwrap_or(Decimal::ZERO),
        ));
    } else {
        pdf.line(&format!(
            "Ingresos Tienda: PEN {:.2} (Var: {})   |   Margen Bruto: Restringido   |   Valorizacion Stock: Restringido",
            inventory.ingresos_productos.actual,
            fmt_delta_opt(inventory.ingresos_productos.delta_pct),
        ));
        pdf.line(&format!(
            "Productos Activos: {}   |   Stock Critico: {}   |   Mermas/Consumo: {} unid (Costo: Restringido)",
            inventory.productos_activos_count,
            inventory.productos_stock_critico_count,
            inventory.mermas_unidades,
        ));
    }
    if inventory.top_productos.is_empty() {
        pdf.subline("Top 5 Productos: Sin ventas de productos en el periodo.");
    } else {
        let top_prods: Vec<String> = inventory
            .top_productos
            .iter()
            .take(5)
            .map(|p| {
                format!(
                    "{} ({}u - PEN {:.2})",
                    p.nombre, p.unidades_vendidas, p.ingresos
                )
            })
            .collect();
        pdf.subline(&format!("Top 5 Productos: {}", top_prods.join(" | ")));
    }
    let aging_txt: Vec<String> = control
        .aging_cartera
        .iter()
        .map(|a| format!("{}: PEN {:.2} ({})", a.etiqueta, a.monto, a.cantidad))
        .collect();
    pdf.line(&format!(
        "Cartera Morosa: PEN {:.2} ({} deudores / {} creditos)   |   Recuperacion Periodo: {:.1}%",
        control.saldo_pendiente_total,
        control.deudores_activos_count,
        control.creditos_pendientes_count,
        control.tasa_recuperacion_pct,
    ));
    pdf.subline(&format!("Aging Cartera: {}", aging_txt.join(" | ")));
    pdf.line(&format!(
        "Arqueos Cerrados: {} (Exactos: {} | Sobrante: {} | Faltante: {} | Descuadre Neto: PEN {:.2})",
        control.turnos_cerrados_count,
        control.turnos_cuadre_exacto_count,
        control.turnos_con_sobrante_count,
        control.turnos_con_faltante_count,
        control.descuadre_neto_acumulado,
    ));
    pdf.line(&format!(
        "Control Ventas: {} totales | Tachadas: {} | Anuladas: {} | Tasa Incidencia: {:.1}%",
        control.ventas_totales_periodo,
        control.ventas_tachadas_count,
        control.ventas_anuladas_count,
        control.tasa_anulacion_pct,
    ));

    let (pdf_bytes, line_count) = pdf.finish()?;
    let filename = format!(
        "Reporte_Ejecutivo_ZaramaGYM_{}_a_{}.pdf",
        finance.fecha_desde, finance.fecha_hasta
    );

    finalize_export_and_audit(
        pool,
        session,
        "BI_REPORTE_EJECUTIVO_PDF",
        filename,
        ExportFormat::Pdf,
        pdf_bytes,
        line_count,
    )
    .await
}



