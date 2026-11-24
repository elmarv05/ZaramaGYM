use crate::errors::AppError;
use crate::models::{
    AuthSession, CreatePlanInput, CreateProductInput, InventoryMovementFilter,
    InventoryMovementItem, InventoryMovementType, PlanExpirationPreview, PlanFilter,
    PlanListItem, PlanType, ProductFilter, ProductListItem,
    RecordInventoryMovementInput, UpdatePlanInput, UpdateProductInput,
};
use crate::services::audit_service::record_audit;
use chrono::{Datelike, NaiveDate};
use rust_decimal::Decimal;
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};
use std::str::FromStr;

// ============================================================================
// MATEMÁTICA PURA: DAY OVERFLOW
// ============================================================================

/// Determina si un año dado es bisiesto según el calendario gregoriano canónico.
pub fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// Devuelve el número máximo de días del mes en un año específico.
pub fn days_in_target_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

/// Función pura que calcula la fecha de vencimiento con compensación Day Overflow.
pub fn calcular_fecha_vencimiento(
    fecha_inicio: &str,
    tipo_plan: &str,
    duracion_meses: Option<i64>,
) -> Result<PlanExpirationPreview, AppError> {
    let raw_date = fecha_inicio.trim();
    if raw_date.len() < 10 {
        return Err(AppError::Validation(
            "Fecha de inicio inválida. Formato esperado: YYYY-MM-DD".into(),
        ));
    }
    let date_part = &raw_date[0..10];
    let f0 = NaiveDate::parse_from_str(date_part, "%Y-%m-%d").map_err(|_| {
        AppError::Validation(format!(
            "Fecha de inicio inválida '{}'. Formato esperado: YYYY-MM-DD",
            date_part
        ))
    })?;

    let tipo_norm = tipo_plan.trim().to_uppercase();

    if tipo_norm == "PASE_DIARIO" {
        let fecha_vencimiento_date = f0.format("%Y-%m-%d").to_string();
        let timestamp = format!("{} 23:59:59", fecha_vencimiento_date);
        let formula = format!("Pase Diario -> {} 23:59:59", fecha_vencimiento_date);
        let explicacion =
            "Pase diario con vigencia exclusiva hasta las 23:59:59 del día de emisión.".to_string();

        return Ok(PlanExpirationPreview {
            fecha_inicio: date_part.to_string(),
            fecha_inicio_evaluada: Some(date_part.to_string()),
            fecha_vencimiento_date,
            fecha_vencimiento_timestamp: timestamp.clone(),
            fecha_vencimiento: timestamp,
            dias_totales: 1,
            hubo_desbordamiento: false,
            dias_desbordamiento: 0,
            dias_overflow_aplicados: Some(0),
            es_bisiesto_destino: false,
            explicacion: explicacion.clone(),
            nota_explicativa: Some(explicacion),
            formula_aplicada: formula,
        });
    }

    if tipo_norm == "MENSUALIDAD" || tipo_norm == "MEMBRESIA_MESES" {
        let duracion = duracion_meses.unwrap_or(0);
        if duracion < 1 {
            return Err(AppError::Validation(
                "La duración de la membresía debe ser de al menos 1 mes.".into(),
            ));
        }

        let y0 = f0.year();
        let m0 = f0.month() as i64;
        let d0 = f0.day() as i64;

        let total_months = (y0 as i64 * 12 + (m0 - 1)) + duracion;
        let y_target = total_months.div_euclid(12) as i32;
        let m_target = (total_months.rem_euclid(12) + 1) as u32;

        let max_days = days_in_target_month(y_target, m_target);
        let bisiesto_destino = is_leap_year(y_target);

        let (target_date, hubo_desborde, dias_desborde, explicacion, formula) =
            if d0 <= max_days as i64 {
                let target = NaiveDate::from_ymd_opt(y_target, m_target, d0 as u32)
                    .ok_or_else(|| AppError::Internal("Error al construir fecha destino".into()))?;
                let expl = format!(
                    "Membresía regular de {} mes(es) sin desbordamiento. Vence el día {} del mes {:02}/{:04} a las 23:59:59.",
                    duracion, d0, m_target, y_target
                );
                let form = format!(
                    "Regular: {:04}-{:02}-{:02} + {}M -> {}",
                    y0,
                    m0,
                    d0,
                    duracion,
                    target.format("%Y-%m-%d")
                );
                (target, false, 0u32, expl, form)
            } else {
                let overflow = (d0 - max_days as i64) as u32;
                let base = NaiveDate::from_ymd_opt(y_target, m_target, max_days).ok_or_else(
                    || AppError::Internal("Error al construir fecha base destino".into()),
                )?;
                let target = base + chrono::Duration::days(overflow as i64);
                let expl = format!(
                    "El mes destino {:02}/{:04} tiene {} días. Se compensaron {} día(s) desbordando al {:04}-{:02}-{:02} a las 23:59:59.",
                    m_target,
                    y_target,
                    max_days,
                    overflow,
                    target.year(),
                    target.month(),
                    target.day()
                );
                let form = format!(
                    "Day Overflow: {:04}-{:02}-{:02} + {}M (max {}d) + {}d -> {}",
                    y0,
                    m0,
                    d0,
                    duracion,
                    max_days,
                    overflow,
                    target.format("%Y-%m-%d")
                );
                (target, true, overflow, expl, form)
            };

        let target_date_str = target_date.format("%Y-%m-%d").to_string();
        let timestamp = format!("{} 23:59:59", target_date_str);
        let dias_totales = (target_date - f0).num_days() + 1;

        return Ok(PlanExpirationPreview {
            fecha_inicio: date_part.to_string(),
            fecha_inicio_evaluada: Some(date_part.to_string()),
            fecha_vencimiento_date: target_date_str,
            fecha_vencimiento_timestamp: timestamp.clone(),
            fecha_vencimiento: timestamp,
            dias_totales,
            hubo_desbordamiento: hubo_desborde,
            dias_desbordamiento: dias_desborde,
            dias_overflow_aplicados: Some(dias_desborde),
            es_bisiesto_destino: bisiesto_destino,
            explicacion: explicacion.clone(),
            nota_explicativa: Some(explicacion),
            formula_aplicada: formula,
        });
    }

    Err(AppError::Validation(format!(
        "Tipo de plan '{}' desconocido. Use PASE_DIARIO o MENSUALIDAD.",
        tipo_plan
    )))
}

// ============================================================================
// 1. SERVICIOS DE PLANES Y MEMBRESÍAS
// ============================================================================

pub async fn list_plans(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &PlanFilter,
) -> Result<Vec<PlanListItem>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            id, codigo, nombre, descripcion, tipo_plan, duracion_meses,
            CAST(precio_base AS TEXT) as precio_base,
            permite_recuperacion_dias, estado_activo, created_at, updated_at
        FROM planes
        WHERE 1=1
        "#,
    );

    let search_term = filter
        .search
        .as_ref()
        .or(filter.busqueda.as_ref())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    if let Some(st) = search_term {
        builder.push(" AND (codigo LIKE ");
        builder.push_bind(format!("%{}%", st));
        builder.push(" OR nombre LIKE ");
        builder.push_bind(format!("%{}%", st));
        builder.push(")");
    }

    if let Some(tp) = filter.tipo_plan {
        builder.push(" AND tipo_plan = ");
        builder.push_bind(tp.as_str());
    }

    if let Some(true) = filter.solo_activos {
        builder.push(" AND estado_activo = 1");
    }

    builder.push(" ORDER BY id ASC");

    let rows = builder.build().fetch_all(pool).await?;

    let mut plans = Vec::with_capacity(rows.len());
    for row in rows {
        let precio_str: String = row.get("precio_base");
        let precio_base = Decimal::from_str(&precio_str).unwrap_or(Decimal::ZERO);
        let tipo_str: String = row.get("tipo_plan");
        let tipo_plan: PlanType = tipo_str.parse()?;
        let recup_num: i64 = row.get("permite_recuperacion_dias");
        let activo_num: i64 = row.get("estado_activo");
        let duracion_num: i64 = row.get("duracion_meses");

        plans.push(PlanListItem {
            id: row.get("id"),
            codigo: row.get("codigo"),
            nombre: row.get("nombre"),
            descripcion: row.get("descripcion"),
            tipo_plan,
            duracion_meses: duracion_num as u32,
            precio_base: precio_base.round_dp(2),
            permite_recuperacion_dias: recup_num == 1,
            estado_activo: activo_num == 1,
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    Ok(plans)
}

pub async fn create_plan(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CreatePlanInput,
) -> Result<PlanListItem, AppError> {
    let codigo = input.codigo.trim().to_uppercase();
    if codigo.is_empty() {
        return Err(AppError::Validation(
            "El código del plan no puede estar vacío.".into(),
        ));
    }
    let nombre = input.nombre.trim();
    if nombre.is_empty() {
        return Err(AppError::Validation(
            "El nombre del plan no puede estar vacío.".into(),
        ));
    }
    if input.precio_base < Decimal::ZERO {
        return Err(AppError::Validation(
            "El precio base no puede ser negativo.".into(),
        ));
    }

    let duracion_meses = match input.tipo_plan {
        PlanType::PaseDiario => 0u32,
        PlanType::Mensualidad | PlanType::MembresiaMeses => {
            if input.duracion_meses < 1 {
                return Err(AppError::Validation(
                    "Una membresía mensual debe durar al menos 1 mes.".into(),
                ));
            }
            input.duracion_meses
        }
    };

    let precio_base_str = format!("{:.2}", input.precio_base.round_dp(2));
    let permite_recup = if input.permite_recuperacion_dias {
        1
    } else {
        0
    };

    let res = sqlx::query(
        r#"
        INSERT INTO planes (codigo, nombre, descripcion, tipo_plan, duracion_meses, precio_base, permite_recuperacion_dias, estado_activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&codigo)
    .bind(nombre)
    .bind(input.descripcion.as_deref().map(|s| s.trim()))
    .bind(input.tipo_plan.as_str())
    .bind(duracion_meses as i64)
    .bind(&precio_base_str)
    .bind(permite_recup)
    .execute(pool)
    .await?;

    let plan_id = res.last_insert_rowid();

    // Auditoría compacta (< 200 bytes)
    let detalles_json = format!(
        r#"{{"id":{},"codigo":"{}","tipo":"{}","precio":"{}"}}"#,
        plan_id,
        codigo,
        input.tipo_plan.as_str(),
        precio_base_str
    );
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "CREATE_PLAN",
        "CATALOGO_INVENTARIO",
        &detalles_json,
        None,
    )
    .await?;

    let row = sqlx::query(
        r#"
        SELECT id, codigo, nombre, descripcion, tipo_plan, duracion_meses,
               CAST(precio_base AS TEXT) as precio_base,
               permite_recuperacion_dias, estado_activo, created_at, updated_at
        FROM planes WHERE id = ?
        "#,
    )
    .bind(plan_id)
    .fetch_one(pool)
    .await?;

    let precio_str: String = row.get("precio_base");
    let precio_base = Decimal::from_str(&precio_str).unwrap_or(Decimal::ZERO);
    let tipo_str: String = row.get("tipo_plan");
    let recup_num: i64 = row.get("permite_recuperacion_dias");
    let activo_num: i64 = row.get("estado_activo");

    Ok(PlanListItem {
        id: row.get("id"),
        codigo: row.get("codigo"),
        nombre: row.get("nombre"),
        descripcion: row.get("descripcion"),
        tipo_plan: tipo_str.parse()?,
        duracion_meses: duracion_meses,
        precio_base: precio_base.round_dp(2),
        permite_recuperacion_dias: recup_num == 1,
        estado_activo: activo_num == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn update_plan(
    pool: &SqlitePool,
    session: &AuthSession,
    plan_id: i64,
    input: UpdatePlanInput,
) -> Result<PlanListItem, AppError> {
    session.require_admin()?;

    let nombre = input.nombre.trim();
    if nombre.is_empty() {
        return Err(AppError::Validation(
            "El nombre del plan no puede estar vacío.".into(),
        ));
    }
    if input.precio_base < Decimal::ZERO {
        return Err(AppError::Validation(
            "El precio base no puede ser negativo.".into(),
        ));
    }

    let precio_base_str = format!("{:.2}", input.precio_base.round_dp(2));
    let permite_recup = if input.permite_recuperacion_dias {
        1
    } else {
        0
    };

    let rows_affected = sqlx::query(
        r#"
        UPDATE planes
        SET nombre = ?,
            descripcion = ?,
            precio_base = ?,
            permite_recuperacion_dias = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(nombre)
    .bind(input.descripcion.as_deref().map(|s| s.trim()))
    .bind(&precio_base_str)
    .bind(permite_recup)
    .bind(plan_id)
    .execute(pool)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(AppError::NotFound(format!(
            "Plan con ID {} no encontrado.",
            plan_id
        )));
    }

    // Auditoría compacta (< 200 bytes)
    let detalles_json = format!(r#"{{"id":{},"precio":"{}"}}"#, plan_id, precio_base_str);
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "UPDATE_PLAN",
        "CATALOGO_INVENTARIO",
        &detalles_json,
        None,
    )
    .await?;

    let row = sqlx::query(
        r#"
        SELECT id, codigo, nombre, descripcion, tipo_plan, duracion_meses,
               CAST(precio_base AS TEXT) as precio_base,
               permite_recuperacion_dias, estado_activo, created_at, updated_at
        FROM planes WHERE id = ?
        "#,
    )
    .bind(plan_id)
    .fetch_one(pool)
    .await?;

    let precio_str: String = row.get("precio_base");
    let precio_base = Decimal::from_str(&precio_str).unwrap_or(Decimal::ZERO);
    let tipo_str: String = row.get("tipo_plan");
    let recup_num: i64 = row.get("permite_recuperacion_dias");
    let activo_num: i64 = row.get("estado_activo");
    let duracion_num: i64 = row.get("duracion_meses");

    Ok(PlanListItem {
        id: row.get("id"),
        codigo: row.get("codigo"),
        nombre: row.get("nombre"),
        descripcion: row.get("descripcion"),
        tipo_plan: tipo_str.parse()?,
        duracion_meses: duracion_num as u32,
        precio_base: precio_base.round_dp(2),
        permite_recuperacion_dias: recup_num == 1,
        estado_activo: activo_num == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn toggle_plan_active(
    pool: &SqlitePool,
    session: &AuthSession,
    plan_id: i64,
    active: bool,
) -> Result<(), AppError> {
    session.require_admin()?;

    let nuevo_estado = if active { 1 } else { 0 };
    let rows_affected = sqlx::query(
        r#"
        UPDATE planes
        SET estado_activo = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(nuevo_estado)
    .bind(plan_id)
    .execute(pool)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(AppError::NotFound(format!(
            "Plan con ID {} no encontrado.",
            plan_id
        )));
    }

    let accion = if active {
        "PLAN_ACTIVATED"
    } else {
        "PLAN_DEACTIVATED"
    };
    let detalles_json = format!(r#"{{"id":{},"activo":{}}}"#, plan_id, active);
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        accion,
        "CATALOGO_INVENTARIO",
        &detalles_json,
        None,
    )
    .await?;

    Ok(())
}

pub fn preview_plan_expiration(
    fecha_inicio: &str,
    tipo_plan: &str,
    duracion_meses: u32,
) -> Result<PlanExpirationPreview, AppError> {
    calcular_fecha_vencimiento(fecha_inicio, tipo_plan, Some(duracion_meses as i64))
}

// ============================================================================
// 2. SERVICIOS DE PRODUCTOS E INVENTARIO
// ============================================================================

pub async fn list_products(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &ProductFilter,
) -> Result<Vec<ProductListItem>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            p.id, 
            p.codigo_sku, 
            p.nombre, 
            p.categoria, 
            p.unidad_medida, 
            CAST(p.precio_compra_referencial AS TEXT) as precio_compra_referencial, 
            CAST(p.precio_venta AS TEXT) as precio_venta, 
            p.stock_actual, 
            p.stock_minimo, 
            p.proveedor_preferido_id, 
            COALESCE(e.razon_social, per.nombres || ' ' || per.apellidos) AS proveedor_nombre,
            p.estado_activo, 
            p.created_at, 
            p.updated_at
        FROM productos p
        LEFT JOIN proveedores prov ON p.proveedor_preferido_id = prov.id
        LEFT JOIN empresas e ON prov.empresa_id = e.id
        LEFT JOIN personas per ON prov.persona_id = per.id
        WHERE 1=1
        "#,
    );

    let search_term = filter
        .search
        .as_ref()
        .or(filter.busqueda.as_ref())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());

    if let Some(st) = search_term {
        builder.push(" AND (p.codigo_sku LIKE ");
        builder.push_bind(format!("%{}%", st));
        builder.push(" OR p.nombre LIKE ");
        builder.push_bind(format!("%{}%", st));
        builder.push(")");
    }

    if let Some(cat) = filter.categoria {
        builder.push(" AND p.categoria = ");
        builder.push_bind(cat.as_str());
    }

    if let Some(true) = filter.solo_activos {
        builder.push(" AND p.estado_activo = 1");
    }

    if let Some(true) = filter.solo_stock_bajo {
        builder.push(" AND p.stock_actual <= p.stock_minimo");
    }

    builder.push(" ORDER BY p.nombre ASC");

    let rows = builder.build().fetch_all(pool).await?;

    let mut products = Vec::with_capacity(rows.len());
    for row in rows {
        let precio_compra_str: String = row.get("precio_compra_referencial");
        let precio_venta_str: String = row.get("precio_venta");
        let precio_compra = Decimal::from_str(&precio_compra_str).unwrap_or(Decimal::ZERO);
        let precio_venta = Decimal::from_str(&precio_venta_str).unwrap_or(Decimal::ZERO);
        let cat_str: String = row.get("categoria");
        let stock_actual: i64 = row.get("stock_actual");
        let stock_minimo: i64 = row.get("stock_minimo");
        let activo_num: i64 = row.get("estado_activo");

        products.push(ProductListItem {
            id: row.get("id"),
            codigo_sku: row.get("codigo_sku"),
            nombre: row.get("nombre"),
            categoria: cat_str.parse()?,
            unidad_medida: row.get("unidad_medida"),
            precio_compra_referencial: precio_compra.round_dp(2),
            precio_venta: precio_venta.round_dp(2),
            stock_actual,
            stock_minimo,
            alerta_stock_bajo: stock_actual <= stock_minimo,
            proveedor_preferido_id: row.get("proveedor_preferido_id"),
            proveedor_nombre: row.get("proveedor_nombre"),
            estado_activo: activo_num == 1,
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    Ok(products)
}

pub async fn create_product(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CreateProductInput,
) -> Result<ProductListItem, AppError> {
    let sku = input.codigo_sku.trim().to_uppercase();
    if sku.is_empty() {
        return Err(AppError::Validation(
            "El código SKU del producto no puede estar vacío.".into(),
        ));
    }
    let nombre = input.nombre.trim();
    if nombre.is_empty() {
        return Err(AppError::Validation(
            "El nombre del producto no puede estar vacío.".into(),
        ));
    }

    if input.precio_venta <= Decimal::ZERO {
        return Err(AppError::Validation(
            "El precio de venta debe ser mayor a 0.".into(),
        ));
    }
    let costo_referencial = input.costo_referencial();
    if costo_referencial < Decimal::ZERO {
        return Err(AppError::Validation(
            "El costo unitario o precio de compra no puede ser negativo.".into(),
        ));
    }
    let stock_inicial = input.stock_inicial_val();
    if stock_inicial < 0 {
        return Err(AppError::Validation(
            "El stock inicial no puede ser negativo.".into(),
        ));
    }
    let stock_minimo = input.stock_minimo_val();
    if stock_minimo < 0 {
        return Err(AppError::Validation(
            "El stock mínimo no puede ser negativo.".into(),
        ));
    }

    let unidad_medida = input
        .unidad_medida
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("UNIDAD");

    let precio_compra_str = format!("{:.2}", costo_referencial.round_dp(2));
    let precio_venta_str = format!("{:.2}", input.precio_venta.round_dp(2));

    // Validar proveedor si se especificó
    if let Some(prov_id) = input.proveedor_preferido_id {
        let prov_exists = sqlx::query("SELECT id FROM proveedores WHERE id = ?")
            .bind(prov_id)
            .fetch_optional(pool)
            .await?;
        if prov_exists.is_none() {
            return Err(AppError::Validation(format!(
                "El proveedor con ID {} no existe.",
                prov_id
            )));
        }
    }

    // Transacción atómica
    let mut tx = pool.begin().await?;

    let res = sqlx::query(
        r#"
        INSERT INTO productos (
            codigo_sku, nombre, categoria, unidad_medida,
            precio_compra_referencial, precio_venta, stock_actual,
            stock_minimo, proveedor_preferido_id, estado_activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&sku)
    .bind(nombre)
    .bind(input.categoria.as_str())
    .bind(unidad_medida)
    .bind(&precio_compra_str)
    .bind(&precio_venta_str)
    .bind(stock_inicial)
    .bind(stock_minimo)
    .bind(input.proveedor_preferido_id)
    .execute(&mut *tx)
    .await?;

    let product_id = res.last_insert_rowid();

    // Si hay stock inicial > 0, registrar automáticamente movimiento STOCK_INICIAL en Kardex
    if stock_inicial > 0 {
        sqlx::query(
            r#"
            INSERT INTO inventario_movimientos (
                producto_id, tipo_movimiento, signo, cantidad,
                stock_anterior, stock_resultante, costo_unitario_momento,
                motivo_justificacion, registrado_por_usuario_id
            ) VALUES (?, 'STOCK_INICIAL', '+', ?, 0, ?, ?, 'Inventario inicial al crear producto', ?)
            "#,
        )
        .bind(product_id)
        .bind(stock_inicial)
        .bind(stock_inicial)
        .bind(&precio_compra_str)
        .bind(session.user_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    // Auditoría compacta (< 200 bytes)
    let detalles_json = format!(
        r#"{{"id":{},"sku":"{}","stock":{},"pv":"{}"}}"#,
        product_id, sku, stock_inicial, precio_venta_str
    );
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "CREATE_PRODUCT",
        "CATALOGO_INVENTARIO",
        &detalles_json,
        None,
    )
    .await?;

    // Obtener producto creado con nombre de proveedor si aplica
    let row = sqlx::query(
        r#"
        SELECT 
            p.id, 
            p.codigo_sku, 
            p.nombre, 
            p.categoria, 
            p.unidad_medida, 
            CAST(p.precio_compra_referencial AS TEXT) as precio_compra_referencial, 
            CAST(p.precio_venta AS TEXT) as precio_venta, 
            p.stock_actual, 
            p.stock_minimo, 
            p.proveedor_preferido_id, 
            COALESCE(e.razon_social, per.nombres || ' ' || per.apellidos) AS proveedor_nombre,
            p.estado_activo, 
            p.created_at, 
            p.updated_at
        FROM productos p
        LEFT JOIN proveedores prov ON p.proveedor_preferido_id = prov.id
        LEFT JOIN empresas e ON prov.empresa_id = e.id
        LEFT JOIN personas per ON prov.persona_id = per.id
        WHERE p.id = ?
        "#,
    )
    .bind(product_id)
    .fetch_one(pool)
    .await?;

    let cat_str: String = row.get("categoria");
    let activo_num: i64 = row.get("estado_activo");

    Ok(ProductListItem {
        id: row.get("id"),
        codigo_sku: row.get("codigo_sku"),
        nombre: row.get("nombre"),
        categoria: cat_str.parse()?,
        unidad_medida: row.get("unidad_medida"),
        precio_compra_referencial: costo_referencial.round_dp(2),
        precio_venta: input.precio_venta.round_dp(2),
        stock_actual: stock_inicial,
        stock_minimo,
        alerta_stock_bajo: stock_inicial <= stock_minimo,
        proveedor_preferido_id: row.get("proveedor_preferido_id"),
        proveedor_nombre: row.get("proveedor_nombre"),
        estado_activo: activo_num == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn update_product(
    pool: &SqlitePool,
    session: &AuthSession,
    product_id: i64,
    input: UpdateProductInput,
) -> Result<ProductListItem, AppError> {
    let nombre = input.nombre.trim();
    if nombre.is_empty() {
        return Err(AppError::Validation(
            "El nombre del producto no puede estar vacío.".into(),
        ));
    }
    if input.precio_venta <= Decimal::ZERO {
        return Err(AppError::Validation(
            "El precio de venta debe ser mayor a 0.".into(),
        ));
    }
    let costo_referencial = input.costo_referencial();
    if costo_referencial < Decimal::ZERO {
        return Err(AppError::Validation(
            "El costo unitario o precio de compra no puede ser negativo.".into(),
        ));
    }
    if input.stock_minimo < 0 {
        return Err(AppError::Validation(
            "El stock mínimo no puede ser negativo.".into(),
        ));
    }

    // Validar proveedor si se especificó
    if let Some(prov_id) = input.proveedor_preferido_id {
        let prov_exists = sqlx::query("SELECT id FROM proveedores WHERE id = ?")
            .bind(prov_id)
            .fetch_optional(pool)
            .await?;
        if prov_exists.is_none() {
            return Err(AppError::Validation(format!(
                "El proveedor con ID {} no existe.",
                prov_id
            )));
        }
    }

    // Si viene código SKU nuevo, validar que no colisione con otro producto
    if let Some(ref sku) = input.codigo_sku {
        let sku_clean = sku.trim().to_uppercase();
        if !sku_clean.is_empty() {
            let collision =
                sqlx::query("SELECT id FROM productos WHERE codigo_sku = ? AND id != ?")
                    .bind(&sku_clean)
                    .bind(product_id)
                    .fetch_optional(pool)
                    .await?;
            if collision.is_some() {
                return Err(AppError::Conflict(format!(
                    "El código SKU '{}' ya está asignado a otro producto.",
                    sku_clean
                )));
            }
        }
    }

    let precio_compra_str = format!("{:.2}", costo_referencial.round_dp(2));
    let precio_venta_str = format!("{:.2}", input.precio_venta.round_dp(2));

    let rows_affected = if let Some(ref sku) = input.codigo_sku {
        let sku_clean = sku.trim().to_uppercase();
        sqlx::query(
            r#"
            UPDATE productos
            SET codigo_sku = ?,
                nombre = ?,
                categoria = ?,
                unidad_medida = COALESCE(?, unidad_medida),
                precio_compra_referencial = ?,
                precio_venta = ?,
                stock_minimo = ?,
                proveedor_preferido_id = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
            "#,
        )
        .bind(sku_clean)
        .bind(nombre)
        .bind(input.categoria.as_str())
        .bind(input.unidad_medida.as_deref().map(|s| s.trim()))
        .bind(&precio_compra_str)
        .bind(&precio_venta_str)
        .bind(input.stock_minimo)
        .bind(input.proveedor_preferido_id)
        .bind(product_id)
        .execute(pool)
        .await?
        .rows_affected()
    } else {
        sqlx::query(
            r#"
            UPDATE productos
            SET nombre = ?,
                categoria = ?,
                unidad_medida = COALESCE(?, unidad_medida),
                precio_compra_referencial = ?,
                precio_venta = ?,
                stock_minimo = ?,
                proveedor_preferido_id = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
            "#,
        )
        .bind(nombre)
        .bind(input.categoria.as_str())
        .bind(input.unidad_medida.as_deref().map(|s| s.trim()))
        .bind(&precio_compra_str)
        .bind(&precio_venta_str)
        .bind(input.stock_minimo)
        .bind(input.proveedor_preferido_id)
        .bind(product_id)
        .execute(pool)
        .await?
        .rows_affected()
    };

    if rows_affected == 0 {
        return Err(AppError::NotFound(format!(
            "Producto con ID {} no encontrado.",
            product_id
        )));
    }

    // Auditoría compacta (< 200 bytes)
    let detalles_json = format!(r#"{{"id":{},"pv":"{}"}}"#, product_id, precio_venta_str);
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "UPDATE_PRODUCT",
        "CATALOGO_INVENTARIO",
        &detalles_json,
        None,
    )
    .await?;

    // Recuperar fila actualizada
    let row = sqlx::query(
        r#"
        SELECT 
            p.id, 
            p.codigo_sku, 
            p.nombre, 
            p.categoria, 
            p.unidad_medida, 
            CAST(p.precio_compra_referencial AS TEXT) as precio_compra_referencial, 
            CAST(p.precio_venta AS TEXT) as precio_venta, 
            p.stock_actual, 
            p.stock_minimo, 
            p.proveedor_preferido_id, 
            COALESCE(e.razon_social, per.nombres || ' ' || per.apellidos) AS proveedor_nombre,
            p.estado_activo, 
            p.created_at, 
            p.updated_at
        FROM productos p
        LEFT JOIN proveedores prov ON p.proveedor_preferido_id = prov.id
        LEFT JOIN empresas e ON prov.empresa_id = e.id
        LEFT JOIN personas per ON prov.persona_id = per.id
        WHERE p.id = ?
        "#,
    )
    .bind(product_id)
    .fetch_one(pool)
    .await?;

    let cat_str: String = row.get("categoria");
    let stock_actual: i64 = row.get("stock_actual");
    let stock_minimo: i64 = row.get("stock_minimo");
    let activo_num: i64 = row.get("estado_activo");

    Ok(ProductListItem {
        id: row.get("id"),
        codigo_sku: row.get("codigo_sku"),
        nombre: row.get("nombre"),
        categoria: cat_str.parse()?,
        unidad_medida: row.get("unidad_medida"),
        precio_compra_referencial: costo_referencial.round_dp(2),
        precio_venta: input.precio_venta.round_dp(2),
        stock_actual,
        stock_minimo,
        alerta_stock_bajo: stock_actual <= stock_minimo,
        proveedor_preferido_id: row.get("proveedor_preferido_id"),
        proveedor_nombre: row.get("proveedor_nombre"),
        estado_activo: activo_num == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn toggle_product_active(
    pool: &SqlitePool,
    session: &AuthSession,
    product_id: i64,
    active: bool,
) -> Result<(), AppError> {
    session.require_admin()?;

    let nuevo_estado = if active { 1 } else { 0 };
    let rows_affected = sqlx::query(
        r#"
        UPDATE productos
        SET estado_activo = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(nuevo_estado)
    .bind(product_id)
    .execute(pool)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(AppError::NotFound(format!(
            "Producto con ID {} no encontrado.",
            product_id
        )));
    }

    let accion = if active {
        "PRODUCT_ACTIVATED"
    } else {
        "PRODUCT_DEACTIVATED"
    };
    let detalles_json = format!(r#"{{"id":{},"activo":{}}}"#, product_id, active);
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        accion,
        "CATALOGO_INVENTARIO",
        &detalles_json,
        None,
    )
    .await?;

    Ok(())
}

// ============================================================================
// 3. MOVIMIENTOS DE INVENTARIO Y MERMAS
// ============================================================================

pub async fn record_inventory_movement(
    pool: &SqlitePool,
    session: &AuthSession,
    input: RecordInventoryMovementInput,
) -> Result<InventoryMovementItem, AppError> {
    session.require_admin()?;

    if input.cantidad <= 0 {
        return Err(AppError::Validation(
            "La cantidad del movimiento debe ser estrictamente mayor a 0.".into(),
        ));
    }

    let motivo = input.motivo_justificacion.trim();

    // Determinar signo y reglas según el tipo de movimiento permitido
    let (signo, exige_motivo_5) = match input.tipo_movimiento {
        InventoryMovementType::Merma
        | InventoryMovementType::MermaDanio
        | InventoryMovementType::MermaVencimiento
        | InventoryMovementType::ConsumoInterno
        | InventoryMovementType::ConsumoPropio
        | InventoryMovementType::AjusteNegativo => ("-", true),

        InventoryMovementType::AjustePositivo => ("+", true),

        InventoryMovementType::EntradaAjuste => ("+", false),
        InventoryMovementType::EntradaCompra => ("+", false),

        _ => {
            return Err(AppError::Validation(format!(
                "El tipo de movimiento '{}' no está permitido para registro manual.",
                input.tipo_movimiento.as_str()
            )));
        }
    };

    if exige_motivo_5 && motivo.chars().count() < 5 {
        return Err(AppError::Validation(
            "El motivo o justificación debe contener al menos 5 caracteres.".into(),
        ));
    }

    let motivo_final = if motivo.is_empty() {
        match input.tipo_movimiento {
            InventoryMovementType::EntradaCompra => "Entrada por compra de mercadería",
            InventoryMovementType::EntradaAjuste => "Ajuste de inventario",
            _ => "Ajuste operativo",
        }
    } else {
        motivo
    };

    // Transacción atómica
    let mut tx = pool.begin().await?;

    let prod_row = sqlx::query(
        r#"
        SELECT id, codigo_sku, nombre, stock_actual, CAST(precio_compra_referencial AS TEXT) as costo
        FROM productos
        WHERE id = ?
        "#,
    )
    .bind(input.producto_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| {
        AppError::NotFound(format!(
            "Producto con ID {} no encontrado.",
            input.producto_id
        ))
    })?;

    let sku: String = prod_row.get("codigo_sku");
    let prod_nombre: String = prod_row.get("nombre");
    let stock_anterior: i64 = prod_row.get("stock_actual");
    let costo_db_str: String = prod_row.get("costo");
    let costo_unitario = input
        .costo_unitario_momento
        .unwrap_or_else(|| Decimal::from_str(&costo_db_str).unwrap_or(Decimal::ZERO));
    let costo_str = format!("{:.2}", costo_unitario.round_dp(2));

    let stock_resultante = if signo == "-" {
        if stock_anterior < input.cantidad {
            return Err(AppError::Validation(format!(
                "Stock insuficiente: el stock resultante no puede ser negativo. Stock actual: {}, solicitado: {}.",
                stock_anterior, input.cantidad
            )));
        }
        stock_anterior - input.cantidad
    } else {
        stock_anterior + input.cantidad
    };

    // 1. Actualizar stock físico en productos
    sqlx::query(
        r#"
        UPDATE productos
        SET stock_actual = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(stock_resultante)
    .bind(input.producto_id)
    .execute(&mut *tx)
    .await?;

    // 2. Insertar movimiento inmutable en el Kardex
    let res = sqlx::query(
        r#"
        INSERT INTO inventario_movimientos (
            producto_id, tipo_movimiento, signo, cantidad,
            stock_anterior, stock_resultante, costo_unitario_momento,
            motivo_justificacion, registrado_por_usuario_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(input.producto_id)
    .bind(input.tipo_movimiento.as_str())
    .bind(signo)
    .bind(input.cantidad)
    .bind(stock_anterior)
    .bind(stock_resultante)
    .bind(&costo_str)
    .bind(motivo_final)
    .bind(session.user_id)
    .execute(&mut *tx)
    .await?;

    let mov_id = res.last_insert_rowid();

    tx.commit().await?;

    // Auditoría compacta (< 200 bytes)
    let detalles_json = format!(
        r#"{{"prod_id":{},"tipo":"{}","cant":{},"res":{}}}"#,
        input.producto_id,
        input.tipo_movimiento.as_str(),
        input.cantidad,
        stock_resultante
    );
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "RECORD_INVENTORY_MOVEMENT",
        "CATALOGO_INVENTARIO",
        &detalles_json,
        None,
    )
    .await?;

    // Obtener movimiento registrado para devolver
    let mov_row = sqlx::query(
        r#"
        SELECT created_at FROM inventario_movimientos WHERE id = ?
        "#,
    )
    .bind(mov_id)
    .fetch_one(pool)
    .await?;

    let created_at: String = mov_row.get("created_at");

    Ok(InventoryMovementItem {
        id: mov_id,
        producto_id: input.producto_id,
        producto_sku: sku,
        producto_nombre: prod_nombre,
        tipo_movimiento: input.tipo_movimiento,
        signo: signo.to_string(),
        cantidad: input.cantidad,
        stock_anterior,
        stock_resultante,
        costo_unitario_momento: costo_unitario.round_dp(2),
        motivo_justificacion: motivo_final.to_string(),
        registrado_por_usuario_id: session.user_id,
        registrado_por_username: session.username.clone(),
        created_at,
    })
}

pub async fn list_inventory_movements(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &InventoryMovementFilter,
) -> Result<Vec<InventoryMovementItem>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            im.id, 
            im.producto_id, 
            p.codigo_sku AS producto_sku, 
            p.nombre AS producto_nombre, 
            im.tipo_movimiento, 
            im.signo, 
            im.cantidad, 
            im.stock_anterior, 
            im.stock_resultante, 
            CAST(im.costo_unitario_momento AS TEXT) AS costo_unitario_momento, 
            im.motivo_justificacion, 
            im.registrado_por_usuario_id, 
            u.username AS registrado_por_username, 
            im.created_at
        FROM inventario_movimientos im
        INNER JOIN productos p ON im.producto_id = p.id
        INNER JOIN usuarios_sistema u ON im.registrado_por_usuario_id = u.id
        WHERE 1=1
        "#,
    );

    if let Some(pid) = filter.producto_id {
        builder.push(" AND im.producto_id = ");
        builder.push_bind(pid);
    }

    if let Some(tipo) = filter.tipo_movimiento {
        builder.push(" AND im.tipo_movimiento = ");
        builder.push_bind(tipo.as_str());
    }

    if let Some(ref d) = filter.desde {
        let trimmed = d.trim();
        if !trimmed.is_empty() {
            builder.push(" AND im.created_at >= ");
            builder.push_bind(trimmed);
        }
    }

    if let Some(ref h) = filter.hasta {
        let trimmed = h.trim();
        if !trimmed.is_empty() {
            builder.push(" AND im.created_at <= ");
            builder.push_bind(trimmed);
        }
    }

    builder.push(" ORDER BY im.created_at DESC, im.id DESC");

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

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let costo_str: String = row.get("costo_unitario_momento");
        let costo = Decimal::from_str(&costo_str).unwrap_or(Decimal::ZERO);
        let tipo_str: String = row.get("tipo_movimiento");

        items.push(InventoryMovementItem {
            id: row.get("id"),
            producto_id: row.get("producto_id"),
            producto_sku: row.get("producto_sku"),
            producto_nombre: row.get("producto_nombre"),
            tipo_movimiento: tipo_str.parse()?,
            signo: row.get("signo"),
            cantidad: row.get("cantidad"),
            stock_anterior: row.get("stock_anterior"),
            stock_resultante: row.get("stock_resultante"),
            costo_unitario_momento: costo.round_dp(2),
            motivo_justificacion: row.get("motivo_justificacion"),
            registrado_por_usuario_id: row.get("registrado_por_usuario_id"),
            registrado_por_username: row.get("registrado_por_username"),
            created_at: row.get("created_at"),
        });
    }

    Ok(items)
}
