use crate::errors::AppError;
use crate::models::finance::*;
use crate::models::pos::{PaymentChannel, PaymentMethod};
use crate::models::user::AuthSession;
use crate::services::audit_service::record_audit;
use rust_decimal::Decimal;
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};
use std::str::FromStr;

// ============================================================================
// HELPERS INTERNOS DE PARSEO
// ============================================================================

fn parse_decimal(s: Option<String>) -> Decimal {
    s.and_then(|val| val.parse::<Decimal>().ok())
        .unwrap_or(Decimal::ZERO)
}

// ============================================================================
// 1. COMPRAS A PROVEEDORES
// ============================================================================

/// Registra una nueva compra a proveedor, afectando el stock y el Kardex de forma atómica.
/// RBAC: Exclusivo SUPERVISOR o ADMINISTRADOR.
pub async fn create_supplier_purchase(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CreateSupplierPurchaseDto,
) -> Result<SupplierPurchaseDetailDto, AppError> {
    session.require_supervisor_or_admin()?;

    // 1. Validar vector de detalles no vacío
    if input.detalles.is_empty() {
        return Err(AppError::Validation(
            "Debe incluir al menos un producto en el detalle de la compra.".into(),
        ));
    }

    // 2. Validar cada detalle y calcular subtotales
    let mut sum_subtotales = Decimal::ZERO;
    for detalle in &input.detalles {
        if detalle.cantidad <= 0 {
            return Err(AppError::Validation(format!(
                "La cantidad adquirida para el producto {} debe ser mayor a 0.",
                detalle.producto_id
            )));
        }
        if detalle.costo_unitario < Decimal::ZERO {
            return Err(AppError::Validation(format!(
                "El costo unitario para el producto {} no puede ser negativo.",
                detalle.producto_id
            )));
        }

        let expected_subtotal =
            (Decimal::from(detalle.cantidad) * detalle.costo_unitario).round_dp(2);
        if detalle.subtotal != expected_subtotal {
            return Err(AppError::Validation(format!(
                "Subtotal inconsistente para el producto {}: recibido {}, calculado {}.",
                detalle.producto_id, detalle.subtotal, expected_subtotal
            )));
        }
        sum_subtotales += detalle.subtotal;
    }

    // 3. Validar total de compra
    if input.total_compra <= Decimal::ZERO || input.total_compra != sum_subtotales {
        return Err(AppError::Validation(format!(
            "El total de compra {} no coincide con la suma de subtotales {} o es menor o igual a cero.",
            input.total_compra, sum_subtotales
        )));
    }

    // 4. Validar correspondencia método de pago vs canal
    match (input.metodo_pago, input.canal_caja) {
        (PaymentMethod::Efectivo, PaymentChannel::Fisica) => (),
        (
            PaymentMethod::Yape
            | PaymentMethod::Plin
            | PaymentMethod::Transferencia
            | PaymentMethod::Tarjeta,
            PaymentChannel::Digital,
        ) => (),
        _ => {
            return Err(AppError::Validation(
                "Incompatibilidad entre método de pago y canal de caja. EFECTIVO requiere canal FISICA; métodos digitales requieren canal DIGITAL.".into(),
            ));
        }
    }

    // 5. Validar existencia y vigencia del proveedor
    let prov_row = sqlx::query("SELECT id, estado_activo FROM proveedores WHERE id = ?")
        .bind(input.proveedor_id)
        .fetch_optional(pool)
        .await?;
    let prov = match prov_row {
        Some(r) => r,
        None => {
            return Err(AppError::NotFound(format!(
                "Proveedor con ID {} no existe.",
                input.proveedor_id
            )))
        }
    };
    let prov_activo: i64 = prov.get("estado_activo");
    if prov_activo == 0 {
        return Err(AppError::Validation(
            "El proveedor especificado se encuentra inactivo.".into(),
        ));
    }

    // 6. Validar existencia y vigencia de productos
    for detalle in &input.detalles {
        let prod_row =
            sqlx::query("SELECT id, nombre, estado_activo FROM productos WHERE id = ?")
                .bind(detalle.producto_id)
                .fetch_optional(pool)
                .await?;
        match prod_row {
            Some(r) => {
                let activo: i64 = r.get("estado_activo");
                if activo == 0 {
                    let nombre: String = r.get("nombre");
                    return Err(AppError::Validation(format!(
                        "El producto '{}' se encuentra inactivo.",
                        nombre
                    )));
                }
            }
            None => {
                return Err(AppError::NotFound(format!(
                    "Producto con ID {} no encontrado.",
                    detalle.producto_id
                )))
            }
        }
    }

    // 7. Transacción atómica ACID
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        r#"
        INSERT INTO compras_proveedores (
            proveedor_id, turno_caja_id, tipo_comprobante, numero_comprobante,
            metodo_pago, canal_caja, total_compra, fecha_compra, notas,
            registrado_por_usuario_id, estado_activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now', 'localtime')), ?, ?, 1)
        RETURNING id
        "#,
    )
    .bind(input.proveedor_id)
    .bind(input.turno_caja_id)
    .bind(input.tipo_comprobante.to_string())
    .bind(&input.numero_comprobante)
    .bind(input.metodo_pago.to_string())
    .bind(input.canal_caja.to_string())
    .bind(input.total_compra.round_dp(2).to_string())
    .bind(&input.fecha_compra)
    .bind(&input.notas)
    .bind(session.user_id)
    .fetch_one(&mut *tx)
    .await?;

    let compra_id: i64 = row.get("id");

    for detalle in &input.detalles {
        // Insertar en compra_detalles
        sqlx::query(
            r#"
            INSERT INTO compra_detalles (compra_id, producto_id, cantidad, costo_unitario, subtotal)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(compra_id)
        .bind(detalle.producto_id)
        .bind(detalle.cantidad)
        .bind(detalle.costo_unitario.round_dp(2).to_string())
        .bind(detalle.subtotal.round_dp(2).to_string())
        .execute(&mut *tx)
        .await?;

        // Obtener stock actual
        let p_row = sqlx::query("SELECT stock_actual FROM productos WHERE id = ?")
            .bind(detalle.producto_id)
            .fetch_one(&mut *tx)
            .await?;
        let stock_anterior: i64 = p_row.get("stock_actual");
        let stock_resultante = stock_anterior + detalle.cantidad;

        // Actualizar stock y precio_compra_referencial si costo_unitario > 0
        if detalle.costo_unitario > Decimal::ZERO {
            sqlx::query(
                r#"
                UPDATE productos
                SET stock_actual = stock_actual + ?,
                    precio_compra_referencial = ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
                "#,
            )
            .bind(detalle.cantidad)
            .bind(detalle.costo_unitario.round_dp(2).to_string())
            .bind(detalle.producto_id)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query(
                r#"
                UPDATE productos
                SET stock_actual = stock_actual + ?,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?
                "#,
            )
            .bind(detalle.cantidad)
            .bind(detalle.producto_id)
            .execute(&mut *tx)
            .await?;
        }

        // Kardex inmutable
        let comp_ref = input.numero_comprobante.as_deref().unwrap_or("S/N");
        let motivo = format!("Compra a proveedor #{} - Comp: {}", compra_id, comp_ref);
        sqlx::query(
            r#"
            INSERT INTO inventario_movimientos (
                producto_id, tipo_movimiento, signo, cantidad,
                stock_anterior, stock_resultante, costo_unitario_momento,
                motivo_justificacion, registrado_por_usuario_id
            ) VALUES (?, 'ENTRADA_COMPRA', '+', ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(detalle.producto_id)
        .bind(detalle.cantidad)
        .bind(stock_anterior)
        .bind(stock_resultante)
        .bind(detalle.costo_unitario.round_dp(2).to_string())
        .bind(motivo)
        .bind(session.user_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    // 8. Auditoría compacta (< 200 B)
    let detalles_json = format!(
        r#"{{"compra_id":{},"prov_id":{},"total":"{}","metodo":"{}","canal":"{}"}}"#,
        compra_id,
        input.proveedor_id,
        input.total_compra.round_dp(2),
        input.metodo_pago,
        input.canal_caja
    );
    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "SUPPLIER_PURCHASE_CREATED",
        "FINANZAS",
        &detalles_json,
        None,
    )
    .await;

    get_supplier_purchase_detail(pool, session, compra_id).await
}

/// Consulta el detalle completo de una compra a proveedor, resolviendo la entidad polimórfica.
/// RBAC: Exclusivo SUPERVISOR o ADMINISTRADOR.
pub async fn get_supplier_purchase_detail(
    pool: &SqlitePool,
    session: &AuthSession,
    id: i64,
) -> Result<SupplierPurchaseDetailDto, AppError> {
    session.require_supervisor_or_admin()?;

    let row = sqlx::query(
        r#"
        SELECT 
            cp.id, cp.proveedor_id, cp.turno_caja_id, cp.tipo_comprobante, cp.numero_comprobante,
            cp.metodo_pago, cp.canal_caja, CAST(cp.total_compra AS TEXT) AS total_compra,
            cp.fecha_compra, cp.notas, cp.registrado_por_usuario_id, cp.anulado_por_usuario_id,
            cp.motivo_anulacion, cp.fecha_anulacion, cp.estado_activo, cp.created_at,
            u_reg.username AS registrado_por_username,
            u_anul.username AS anulado_por_username,
            p.tipo_proveedor,
            pers.nombres AS pers_nombres, pers.apellidos AS pers_apellidos, pers.numero_documento AS pers_doc,
            emp.razon_social AS emp_razon_social, emp.ruc AS emp_ruc
        FROM compras_proveedores cp
        INNER JOIN proveedores p ON p.id = cp.proveedor_id
        LEFT JOIN personas pers ON pers.id = p.persona_id
        LEFT JOIN empresas emp ON emp.id = p.empresa_id
        INNER JOIN usuarios_sistema u_reg ON u_reg.id = cp.registrado_por_usuario_id
        LEFT JOIN usuarios_sistema u_anul ON u_anul.id = cp.anulado_por_usuario_id
        WHERE cp.id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    let row = match row {
        Some(r) => r,
        None => {
            return Err(AppError::NotFound(format!(
                "Compra a proveedor con ID {} no encontrada.",
                id
            )))
        }
    };

    let tipo_prov: String = row.get("tipo_proveedor");
    let (proveedor_nombre, proveedor_documento) = if tipo_prov == "PERSONA_NATURAL" {
        let nom: Option<String> = row.get("pers_nombres");
        let ape: Option<String> = row.get("pers_apellidos");
        let doc: Option<String> = row.get("pers_doc");
        (
            format!(
                "{} {}",
                nom.unwrap_or_default(),
                ape.unwrap_or_default()
            )
            .trim()
            .to_string(),
            doc.unwrap_or_default(),
        )
    } else {
        let rz: Option<String> = row.get("emp_razon_social");
        let ruc: Option<String> = row.get("emp_ruc");
        (rz.unwrap_or_default(), ruc.unwrap_or_default())
    };

    let metodo_str: String = row.get("metodo_pago");
    let metodo_pago = PaymentMethod::from_str(&metodo_str)?;
    let canal_str: String = row.get("canal_caja");
    let canal_caja = PaymentChannel::from_str(&canal_str)?;
    let total_compra = parse_decimal(row.get("total_compra"));

    let purchase = SupplierPurchaseSummaryDto {
        id: row.get("id"),
        proveedor_id: row.get("proveedor_id"),
        proveedor_nombre,
        proveedor_documento,
        turno_caja_id: row.get("turno_caja_id"),
        tipo_comprobante: row.get("tipo_comprobante"),
        numero_comprobante: row.get("numero_comprobante"),
        metodo_pago,
        canal_caja,
        total_compra,
        fecha_compra: row.get("fecha_compra"),
        registrado_por_username: row.get("registrado_por_username"),
        estado_activo: row.get("estado_activo"),
        motivo_anulacion: row.get("motivo_anulacion"),
        fecha_anulacion: row.get("fecha_anulacion"),
        created_at: row.get("created_at"),
    };

    let items_rows = sqlx::query(
        r#"
        SELECT 
            cd.id, cd.compra_id, cd.producto_id, cd.cantidad,
            CAST(cd.costo_unitario AS TEXT) AS costo_unitario,
            CAST(cd.subtotal AS TEXT) AS subtotal,
            pr.codigo_sku, pr.nombre AS producto_nombre
        FROM compra_detalles cd
        INNER JOIN productos pr ON pr.id = cd.producto_id
        WHERE cd.compra_id = ?
        ORDER BY cd.id ASC
        "#,
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let items = items_rows
        .into_iter()
        .map(|r| SupplierPurchaseItemDetailDto {
            id: r.get("id"),
            compra_id: r.get("compra_id"),
            producto_id: r.get("producto_id"),
            producto_sku: r.get("codigo_sku"),
            producto_nombre: r.get("producto_nombre"),
            cantidad: r.get("cantidad"),
            costo_unitario: parse_decimal(r.get("costo_unitario")),
            subtotal: parse_decimal(r.get("subtotal")),
        })
        .collect();

    Ok(SupplierPurchaseDetailDto {
        purchase,
        notas: row.get("notas"),
        anulado_por_username: row.get("anulado_por_username"),
        items,
    })
}

/// Lista compras a proveedores con filtros opcionales.
/// RBAC: Exclusivo SUPERVISOR o ADMINISTRADOR.
pub async fn list_supplier_purchases(
    pool: &SqlitePool,
    session: &AuthSession,
    filter: &SupplierPurchaseFilter,
) -> Result<Vec<SupplierPurchaseSummaryDto>, AppError> {
    session.require_supervisor_or_admin()?;

    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            cp.id, cp.proveedor_id, cp.turno_caja_id, cp.tipo_comprobante, cp.numero_comprobante,
            cp.metodo_pago, cp.canal_caja, CAST(cp.total_compra AS TEXT) AS total_compra,
            cp.fecha_compra, cp.estado_activo, cp.motivo_anulacion, cp.fecha_anulacion, cp.created_at,
            u_reg.username AS registrado_por_username,
            p.tipo_proveedor,
            pers.nombres AS pers_nombres, pers.apellidos AS pers_apellidos, pers.numero_documento AS pers_doc,
            emp.razon_social AS emp_razon_social, emp.ruc AS emp_ruc
        FROM compras_proveedores cp
        INNER JOIN proveedores p ON p.id = cp.proveedor_id
        LEFT JOIN personas pers ON pers.id = p.persona_id
        LEFT JOIN empresas emp ON emp.id = p.empresa_id
        INNER JOIN usuarios_sistema u_reg ON u_reg.id = cp.registrado_por_usuario_id
        WHERE 1=1
        "#,
    );

    if let Some(ref desde) = filter.fecha_desde {
        if !desde.trim().is_empty() {
            qb.push(" AND date(cp.fecha_compra) >= date(");
            qb.push_bind(desde.trim());
            qb.push(")");
        }
    }

    if let Some(ref hasta) = filter.fecha_hasta {
        if !hasta.trim().is_empty() {
            qb.push(" AND date(cp.fecha_compra) <= date(");
            qb.push_bind(hasta.trim());
            qb.push(")");
        }
    }

    if let Some(prov_id) = filter.proveedor_id {
        qb.push(" AND cp.proveedor_id = ");
        qb.push_bind(prov_id);
    }

    if let Some(ref canal) = filter.canal_caja {
        qb.push(" AND cp.canal_caja = ");
        qb.push_bind(canal.to_string());
    }

    if let Some(estado) = filter.estado_activo {
        qb.push(" AND cp.estado_activo = ");
        qb.push_bind(estado);
    }

    qb.push(" ORDER BY cp.fecha_compra DESC, cp.id DESC");

    let rows = qb.build().fetch_all(pool).await?;

    let mut list = Vec::with_capacity(rows.len());
    for row in rows {
        let tipo_prov: String = row.get("tipo_proveedor");
        let (proveedor_nombre, proveedor_documento) = if tipo_prov == "PERSONA_NATURAL" {
            let nom: Option<String> = row.get("pers_nombres");
            let ape: Option<String> = row.get("pers_apellidos");
            let doc: Option<String> = row.get("pers_doc");
            (
                format!(
                    "{} {}",
                    nom.unwrap_or_default(),
                    ape.unwrap_or_default()
                )
                .trim()
                .to_string(),
                doc.unwrap_or_default(),
            )
        } else {
            let rz: Option<String> = row.get("emp_razon_social");
            let ruc: Option<String> = row.get("emp_ruc");
            (rz.unwrap_or_default(), ruc.unwrap_or_default())
        };

        let metodo_str: String = row.get("metodo_pago");
        let metodo_pago = PaymentMethod::from_str(&metodo_str)?;
        let canal_str: String = row.get("canal_caja");
        let canal_caja = PaymentChannel::from_str(&canal_str)?;
        let total_compra = parse_decimal(row.get("total_compra"));

        list.push(SupplierPurchaseSummaryDto {
            id: row.get("id"),
            proveedor_id: row.get("proveedor_id"),
            proveedor_nombre,
            proveedor_documento,
            turno_caja_id: row.get("turno_caja_id"),
            tipo_comprobante: row.get("tipo_comprobante"),
            numero_comprobante: row.get("numero_comprobante"),
            metodo_pago,
            canal_caja,
            total_compra,
            fecha_compra: row.get("fecha_compra"),
            registrado_por_username: row.get("registrado_por_username"),
            estado_activo: row.get("estado_activo"),
            motivo_anulacion: row.get("motivo_anulacion"),
            fecha_anulacion: row.get("fecha_anulacion"),
            created_at: row.get("created_at"),
        });
    }

    Ok(list)
}

/// Anula una compra a proveedor, verificando la invariante de stock físico no negativo.
/// RBAC: EXCLUSIVO ADMINISTRADOR.
pub async fn cancel_supplier_purchase(
    pool: &SqlitePool,
    session: &AuthSession,
    id: i64,
    input: CancelSupplierPurchaseDto,
) -> Result<SupplierPurchaseDetailDto, AppError> {
    // Blindaje RBAC exclusivo Administrador
    session.require_admin()?;

    // 1. Validar motivo de anulación
    let motivo = input.motivo_anulacion.trim();
    if motivo.len() < 5 {
        return Err(AppError::Validation(
            "El motivo de anulación es obligatorio y debe tener al menos 5 caracteres.".into(),
        ));
    }

    // 2. Verificar compra existente y activa
    let cp_row = sqlx::query("SELECT id, estado_activo FROM compras_proveedores WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    let cp = match cp_row {
        Some(r) => r,
        None => {
            return Err(AppError::NotFound(format!(
                "Compra a proveedor con ID {} no encontrada.",
                id
            )))
        }
    };
    let estado_activo: i64 = cp.get("estado_activo");
    if estado_activo == 0 {
        return Err(AppError::Validation(
            "La compra ya se encuentra anulada.".into(),
        ));
    }

    // 3. Consultar detalles de la compra y stock actual
    let detalles = sqlx::query(
        r#"
        SELECT 
            cd.producto_id, cd.cantidad, CAST(cd.costo_unitario AS TEXT) AS costo_unitario,
            pr.nombre AS producto_nombre, pr.stock_actual
        FROM compra_detalles cd
        INNER JOIN productos pr ON pr.id = cd.producto_id
        WHERE cd.compra_id = ?
        "#,
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    // 4. Invariante de Stock: verificar que ningún producto quede en negativo
    for row in &detalles {
        let stock_actual: i64 = row.get("stock_actual");
        let cantidad_comprada: i64 = row.get("cantidad");
        let producto_nombre: String = row.get("producto_nombre");

        if stock_actual < cantidad_comprada {
            return Err(AppError::Validation(format!(
                "No es posible anular la compra: el producto '{}' cuenta con stock actual de {} unidades, insuficiente para revertir las {} unidades adquiridas.",
                producto_nombre, stock_actual, cantidad_comprada
            )));
        }
    }

    // 5. Transacción atómica de reversión
    let mut tx = pool.begin().await?;

    for row in &detalles {
        let producto_id: i64 = row.get("producto_id");
        let cantidad_comprada: i64 = row.get("cantidad");
        let stock_anterior: i64 = row.get("stock_actual");
        let stock_resultante = stock_anterior - cantidad_comprada;
        let costo_unitario = parse_decimal(row.get("costo_unitario"));

        // Descontar stock
        sqlx::query(
            r#"
            UPDATE productos
            SET stock_actual = stock_actual - ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
            "#,
        )
        .bind(cantidad_comprada)
        .bind(producto_id)
        .execute(&mut *tx)
        .await?;

        // Movimiento Kardex de reversión
        let motivo_kardex = format!("Anulación compra #{} - Motivo: {}", id, motivo);
        sqlx::query(
            r#"
            INSERT INTO inventario_movimientos (
                producto_id, tipo_movimiento, signo, cantidad,
                stock_anterior, stock_resultante, costo_unitario_momento,
                motivo_justificacion, registrado_por_usuario_id
            ) VALUES (?, 'AJUSTE_NEGATIVO', '-', ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(producto_id)
        .bind(cantidad_comprada)
        .bind(stock_anterior)
        .bind(stock_resultante)
        .bind(costo_unitario.round_dp(2).to_string())
        .bind(motivo_kardex)
        .bind(session.user_id)
        .execute(&mut *tx)
        .await?;
    }

    // Actualizar cabecera a inactivo
    sqlx::query(
        r#"
        UPDATE compras_proveedores
        SET estado_activo = 0,
            anulado_por_usuario_id = ?,
            motivo_anulacion = ?,
            fecha_anulacion = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(session.user_id)
    .bind(motivo)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    // 6. Auditoría compacta (< 200 B)
    let detalles_json = format!(
        r#"{{"compra_id":{},"anulado_por":{},"motivo":"{:.50}"}}"#,
        id, session.user_id, motivo
    );
    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "SUPPLIER_PURCHASE_CANCELLED",
        "FINANZAS",
        &detalles_json,
        None,
    )
    .await;

    get_supplier_purchase_detail(pool, session, id).await
}

// ============================================================================
// 2. GASTOS OPERATIVOS (ADMIN EXCLUSIVO)
// ============================================================================

/// Registra un gasto operativo en el sistema.
/// RBAC: EXCLUSIVO ADMINISTRADOR.
pub async fn create_operational_expense(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CreateExpenseDto,
) -> Result<OperationalExpenseDto, AppError> {
    session.require_admin()?;

    if input.monto <= Decimal::ZERO {
        return Err(AppError::Validation(
            "El monto del gasto debe ser mayor a 0.".into(),
        ));
    }

    let descripcion = input.descripcion.trim();
    if descripcion.len() < 3 {
        return Err(AppError::Validation(
            "La descripción del gasto debe tener al menos 3 caracteres.".into(),
        ));
    }

    match (input.metodo_pago, input.canal_caja) {
        (PaymentMethod::Efectivo, PaymentChannel::Fisica) => (),
        (
            PaymentMethod::Yape
            | PaymentMethod::Plin
            | PaymentMethod::Transferencia
            | PaymentMethod::Tarjeta,
            PaymentChannel::Digital,
        ) => (),
        _ => {
            return Err(AppError::Validation(
                "Incompatibilidad entre método de pago y canal de caja. EFECTIVO requiere canal FISICA; métodos digitales requieren canal DIGITAL.".into(),
            ));
        }
    }

    let row = sqlx::query(
        r#"
        INSERT INTO gastos_operativos (
            categoria, descripcion, monto, metodo_pago, canal_caja,
            turno_caja_id, comprobante_referencia, fecha_gasto, notas,
            registrado_por_usuario_id, estado_activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now', 'localtime')), ?, ?, 1)
        RETURNING id, fecha_gasto, created_at, updated_at
        "#,
    )
    .bind(input.categoria.to_string())
    .bind(descripcion)
    .bind(input.monto.round_dp(2).to_string())
    .bind(input.metodo_pago.to_string())
    .bind(input.canal_caja.to_string())
    .bind(input.turno_caja_id)
    .bind(&input.comprobante_referencia)
    .bind(&input.fecha_gasto)
    .bind(&input.notas)
    .bind(session.user_id)
    .fetch_one(pool)
    .await?;

    let gasto_id: i64 = row.get("id");
    let fecha_gasto: String = row.get("fecha_gasto");
    let created_at: String = row.get("created_at");
    let updated_at: String = row.get("updated_at");

    // Auditoría compacta (< 200 B)
    let detalles_json = format!(
        r#"{{"gasto_id":{},"cat":"{}","monto":"{}","canal":"{}"}}"#,
        gasto_id,
        input.categoria,
        input.monto.round_dp(2),
        input.canal_caja
    );
    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "EXPENSE_CREATED",
        "FINANZAS",
        &detalles_json,
        None,
    )
    .await;

    Ok(OperationalExpenseDto {
        id: gasto_id,
        categoria: input.categoria,
        descripcion: descripcion.to_string(),
        monto: input.monto.round_dp(2),
        metodo_pago: input.metodo_pago,
        canal_caja: input.canal_caja,
        turno_caja_id: input.turno_caja_id,
        comprobante_referencia: input.comprobante_referencia,
        fecha_gasto,
        notas: input.notas,
        registrado_por_username: session.username.clone(),
        estado_activo: 1,
        created_at,
        updated_at,
    })
}

/// Actualiza un gasto operativo existente.
/// RBAC: EXCLUSIVO ADMINISTRADOR.
pub async fn update_operational_expense(
    pool: &SqlitePool,
    session: &AuthSession,
    id: i64,
    input: UpdateExpenseDto,
) -> Result<OperationalExpenseDto, AppError> {
    session.require_admin()?;

    if input.monto <= Decimal::ZERO {
        return Err(AppError::Validation(
            "El monto del gasto debe ser mayor a 0.".into(),
        ));
    }

    let descripcion = input.descripcion.trim();
    if descripcion.len() < 3 {
        return Err(AppError::Validation(
            "La descripción del gasto debe tener al menos 3 caracteres.".into(),
        ));
    }

    match (input.metodo_pago, input.canal_caja) {
        (PaymentMethod::Efectivo, PaymentChannel::Fisica) => (),
        (
            PaymentMethod::Yape
            | PaymentMethod::Plin
            | PaymentMethod::Transferencia
            | PaymentMethod::Tarjeta,
            PaymentChannel::Digital,
        ) => (),
        _ => {
            return Err(AppError::Validation(
                "Incompatibilidad entre método de pago y canal de caja. EFECTIVO requiere canal FISICA; métodos digitales requieren canal DIGITAL.".into(),
            ));
        }
    }

    // Verificar existencia
    let existing = sqlx::query("SELECT id, estado_activo, fecha_gasto, created_at FROM gastos_operativos WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    let existing = match existing {
        Some(r) => r,
        None => {
            return Err(AppError::NotFound(format!(
                "Gasto operativo con ID {} no encontrado.",
                id
            )))
        }
    };
    let estado_activo: i64 = existing.get("estado_activo");
    let current_fecha_gasto: String = existing.get("fecha_gasto");
    let created_at: String = existing.get("created_at");

    let updated = sqlx::query(
        r#"
        UPDATE gastos_operativos
        SET categoria = ?,
            descripcion = ?,
            monto = ?,
            metodo_pago = ?,
            canal_caja = ?,
            turno_caja_id = ?,
            comprobante_referencia = ?,
            fecha_gasto = COALESCE(?, fecha_gasto),
            notas = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        RETURNING fecha_gasto, updated_at
        "#,
    )
    .bind(input.categoria.to_string())
    .bind(descripcion)
    .bind(input.monto.round_dp(2).to_string())
    .bind(input.metodo_pago.to_string())
    .bind(input.canal_caja.to_string())
    .bind(input.turno_caja_id)
    .bind(&input.comprobante_referencia)
    .bind(&input.fecha_gasto)
    .bind(&input.notas)
    .bind(id)
    .fetch_one(pool)
    .await?;

    let fecha_gasto: String = updated
        .get::<Option<String>, _>("fecha_gasto")
        .unwrap_or(current_fecha_gasto);
    let updated_at: String = updated.get("updated_at");

    // Auditoría compacta (< 200 B)
    let detalles_json = format!(
        r#"{{"gasto_id":{},"cat":"{}","monto":"{}"}}"#,
        id,
        input.categoria,
        input.monto.round_dp(2)
    );
    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "EXPENSE_UPDATED",
        "FINANZAS",
        &detalles_json,
        None,
    )
    .await;

    // Obtener username de registro
    let u_row = sqlx::query(
        r#"
        SELECT u.username 
        FROM gastos_operativos go
        INNER JOIN usuarios_sistema u ON u.id = go.registrado_por_usuario_id
        WHERE go.id = ?
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    let registrado_por_username: String = u_row.get("username");

    Ok(OperationalExpenseDto {
        id,
        categoria: input.categoria,
        descripcion: descripcion.to_string(),
        monto: input.monto.round_dp(2),
        metodo_pago: input.metodo_pago,
        canal_caja: input.canal_caja,
        turno_caja_id: input.turno_caja_id,
        comprobante_referencia: input.comprobante_referencia,
        fecha_gasto,
        notas: input.notas,
        registrado_por_username,
        estado_activo,
        created_at,
        updated_at,
    })
}

/// Alterna el estado activo / inactivo de un gasto operativo (Zero-Delete).
/// RBAC: EXCLUSIVO ADMINISTRADOR.
pub async fn toggle_operational_expense_active(
    pool: &SqlitePool,
    session: &AuthSession,
    id: i64,
) -> Result<OperationalExpenseDto, AppError> {
    session.require_admin()?;

    let existing = sqlx::query("SELECT id, estado_activo FROM gastos_operativos WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    if existing.is_none() {
        return Err(AppError::NotFound(format!(
            "Gasto operativo con ID {} no encontrado.",
            id
        )));
    }

    let updated = sqlx::query(
        r#"
        UPDATE gastos_operativos
        SET estado_activo = 1 - estado_activo,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
        RETURNING estado_activo
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    let nuevo_estado: i64 = updated.get("estado_activo");

    // Auditoría compacta (< 200 B)
    let detalles_json = format!(r#"{{"gasto_id":{},"nuevo_estado":{}}}"#, id, nuevo_estado);
    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "EXPENSE_STATUS_TOGGLED",
        "FINANZAS",
        &detalles_json,
        None,
    )
    .await;

    // Obtener entidad completa
    let row = sqlx::query(
        r#"
        SELECT 
            go.id, go.categoria, go.descripcion, CAST(go.monto AS TEXT) AS monto,
            go.metodo_pago, go.canal_caja, go.turno_caja_id, go.comprobante_referencia,
            go.fecha_gasto, go.notas, go.estado_activo, go.created_at, go.updated_at,
            u.username AS registrado_por_username
        FROM gastos_operativos go
        INNER JOIN usuarios_sistema u ON u.id = go.registrado_por_usuario_id
        WHERE go.id = ?
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    let cat_str: String = row.get("categoria");
    let categoria = ExpenseCategory::from_str(&cat_str)?;
    let metodo_str: String = row.get("metodo_pago");
    let metodo_pago = PaymentMethod::from_str(&metodo_str)?;
    let canal_str: String = row.get("canal_caja");
    let canal_caja = PaymentChannel::from_str(&canal_str)?;
    let monto = parse_decimal(row.get("monto"));

    Ok(OperationalExpenseDto {
        id: row.get("id"),
        categoria,
        descripcion: row.get("descripcion"),
        monto,
        metodo_pago,
        canal_caja,
        turno_caja_id: row.get("turno_caja_id"),
        comprobante_referencia: row.get("comprobante_referencia"),
        fecha_gasto: row.get("fecha_gasto"),
        notas: row.get("notas"),
        registrado_por_username: row.get("registrado_por_username"),
        estado_activo: row.get("estado_activo"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

/// Lista gastos operativos con filtros opcionales.
/// RBAC: EXCLUSIVO ADMINISTRADOR.
pub async fn list_operational_expenses(
    pool: &SqlitePool,
    session: &AuthSession,
    filter: &ExpenseFilter,
) -> Result<Vec<OperationalExpenseDto>, AppError> {
    session.require_admin()?;

    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            go.id, go.categoria, go.descripcion, CAST(go.monto AS TEXT) AS monto,
            go.metodo_pago, go.canal_caja, go.turno_caja_id, go.comprobante_referencia,
            go.fecha_gasto, go.notas, go.estado_activo, go.created_at, go.updated_at,
            u.username AS registrado_por_username
        FROM gastos_operativos go
        INNER JOIN usuarios_sistema u ON u.id = go.registrado_por_usuario_id
        WHERE 1=1
        "#,
    );

    if let Some(ref desde) = filter.fecha_desde {
        if !desde.trim().is_empty() {
            qb.push(" AND date(go.fecha_gasto) >= date(");
            qb.push_bind(desde.trim());
            qb.push(")");
        }
    }

    if let Some(ref hasta) = filter.fecha_hasta {
        if !hasta.trim().is_empty() {
            qb.push(" AND date(go.fecha_gasto) <= date(");
            qb.push_bind(hasta.trim());
            qb.push(")");
        }
    }

    if let Some(ref cat) = filter.categoria {
        qb.push(" AND go.categoria = ");
        qb.push_bind(cat.to_string());
    }

    if let Some(ref canal) = filter.canal_caja {
        qb.push(" AND go.canal_caja = ");
        qb.push_bind(canal.to_string());
    }

    if let Some(estado) = filter.estado_activo {
        qb.push(" AND go.estado_activo = ");
        qb.push_bind(estado);
    }

    qb.push(" ORDER BY go.fecha_gasto DESC, go.id DESC");

    let rows = qb.build().fetch_all(pool).await?;

    let mut list = Vec::with_capacity(rows.len());
    for row in rows {
        let cat_str: String = row.get("categoria");
        let categoria = ExpenseCategory::from_str(&cat_str)?;
        let metodo_str: String = row.get("metodo_pago");
        let metodo_pago = PaymentMethod::from_str(&metodo_str)?;
        let canal_str: String = row.get("canal_caja");
        let canal_caja = PaymentChannel::from_str(&canal_str)?;
        let monto = parse_decimal(row.get("monto"));

        list.push(OperationalExpenseDto {
            id: row.get("id"),
            categoria,
            descripcion: row.get("descripcion"),
            monto,
            metodo_pago,
            canal_caja,
            turno_caja_id: row.get("turno_caja_id"),
            comprobante_referencia: row.get("comprobante_referencia"),
            fecha_gasto: row.get("fecha_gasto"),
            notas: row.get("notas"),
            registrado_por_username: row.get("registrado_por_username"),
            estado_activo: row.get("estado_activo"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    Ok(list)
}

// ============================================================================
// 3. BANDEJA GLOBAL DE TACHADOS (PASO 2)
// ============================================================================

/// Consulta la bandeja de ventas tachadas y anuladas para auditoría centralizada.
/// RBAC: Exclusivo SUPERVISOR o ADMINISTRADOR.
pub async fn list_struck_sales_tray(
    pool: &SqlitePool,
    session: &AuthSession,
    filter: &StruckSaleFilter,
) -> Result<Vec<StruckSaleTrayItemDto>, AppError> {
    session.require_supervisor_or_admin()?;

    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            v.id, v.turno_caja_id, tc.estado AS turno_estado,
            v.cliente_id,
            CASE 
                WHEN v.cliente_id IS NULL THEN 'CLIENTE GENERAL'
                ELSE TRIM(pers.nombres || ' ' || pers.apellidos)
            END AS cliente_nombre_completo,
            CAST(v.total_venta AS TEXT) AS total_venta,
            CAST(v.monto_pagado_efectivo AS TEXT) AS monto_pagado_efectivo,
            CAST(v.monto_pagado_digital AS TEXT) AS monto_pagado_digital,
            CAST(v.saldo_credito_generado AS TEXT) AS saldo_credito_generado,
            v.estado_venta,
            uv.username AS usuario_vendedor_username,
            ut.username AS tachado_por_username,
            v.fecha_tachado, v.motivo_tachado,
            ua.username AS resuelto_por_admin_username,
            v.fecha_resolucion_tachado, v.nota_resolucion_tachado,
            v.created_at
        FROM ventas v
        INNER JOIN turnos_caja tc ON tc.id = v.turno_caja_id
        INNER JOIN usuarios_sistema uv ON uv.id = v.usuario_vendedor_id
        LEFT JOIN clientes c ON c.id = v.cliente_id
        LEFT JOIN personas pers ON pers.id = c.persona_id
        LEFT JOIN usuarios_sistema ut ON ut.id = v.tachado_por_usuario_id
        LEFT JOIN usuarios_sistema ua ON ua.id = v.resuelto_por_admin_id
        WHERE 1=1
        "#,
    );

    if let Some(ref estado) = filter.estado_venta {
        if !estado.trim().is_empty() {
            qb.push(" AND v.estado_venta = ");
            qb.push_bind(estado.trim());
        } else {
            qb.push(" AND v.estado_venta IN ('TACHADA_EN_TURNO', 'ANULADA_DEFINITIVA')");
        }
    } else {
        qb.push(" AND v.estado_venta IN ('TACHADA_EN_TURNO', 'ANULADA_DEFINITIVA')");
    }

    if let Some(turno_id) = filter.turno_caja_id {
        qb.push(" AND v.turno_caja_id = ");
        qb.push_bind(turno_id);
    }

    if let Some(ref desde) = filter.fecha_desde {
        if !desde.trim().is_empty() {
            qb.push(" AND date(v.created_at) >= date(");
            qb.push_bind(desde.trim());
            qb.push(")");
        }
    }

    if let Some(ref hasta) = filter.fecha_hasta {
        if !hasta.trim().is_empty() {
            qb.push(" AND date(v.created_at) <= date(");
            qb.push_bind(hasta.trim());
            qb.push(")");
        }
    }

    qb.push(" ORDER BY v.id DESC");

    let rows = qb.build().fetch_all(pool).await?;

    let list = rows
        .into_iter()
        .map(|r| StruckSaleTrayItemDto {
            id: r.get("id"),
            turno_caja_id: r.get("turno_caja_id"),
            turno_estado: r.get("turno_estado"),
            cliente_nombre_completo: r.get("cliente_nombre_completo"),
            total_venta: parse_decimal(r.get("total_venta")),
            monto_pagado_efectivo: parse_decimal(r.get("monto_pagado_efectivo")),
            monto_pagado_digital: parse_decimal(r.get("monto_pagado_digital")),
            saldo_credito_generado: parse_decimal(r.get("saldo_credito_generado")),
            estado_venta: r.get("estado_venta"),
            usuario_vendedor_username: r.get("usuario_vendedor_username"),
            tachado_por_username: r.get("tachado_por_username"),
            fecha_tachado: r.get("fecha_tachado"),
            motivo_tachado: r.get("motivo_tachado"),
            resuelto_por_admin_username: r.get("resuelto_por_admin_username"),
            fecha_resolucion_tachado: r.get("fecha_resolucion_tachado"),
            nota_resolucion_tachado: r.get("nota_resolucion_tachado"),
            created_at: r.get("created_at"),
        })
        .collect();

    Ok(list)
}

// ============================================================================
// 4. AGREGACIONES Y DASHBOARD FINANCIERO (FÍSICA / DIGITAL / MIXTA)
// ============================================================================

/// Calcula el consolidado financiero (Física, Digital y Mixta) con desglose y métricas de control.
/// RBAC: Exclusivo SUPERVISOR o ADMINISTRADOR.
pub async fn get_financial_dashboard_summary(
    pool: &SqlitePool,
    session: &AuthSession,
    filter: &FinancialReportFilter,
) -> Result<FinancialDashboardDto, AppError> {
    session.require_supervisor_or_admin()?;

    let f_desde = filter
        .fecha_desde
        .as_deref()
        .filter(|s| !s.trim().is_empty());
    let f_hasta = filter
        .fecha_hasta
        .as_deref()
        .filter(|s| !s.trim().is_empty());

    // 1. Ingresos por Ventas completadas y pagos activos
    let pagos_rows = sqlx::query(
        r#"
        SELECT 
            p.canal_caja,
            p.metodo_pago,
            CAST(COALESCE(SUM(p.monto), 0) AS TEXT) AS total_ingresos
        FROM pagos p
        INNER JOIN ventas v ON v.id = p.venta_id
        WHERE v.estado_venta = 'COMPLETADA'
          AND p.estado_pago = 'ACTIVO'
          AND (? IS NULL OR date(v.created_at) >= date(?))
          AND (? IS NULL OR date(v.created_at) <= date(?))
        GROUP BY p.canal_caja, p.metodo_pago
        "#,
    )
    .bind(f_desde)
    .bind(f_desde)
    .bind(f_hasta)
    .bind(f_hasta)
    .fetch_all(pool)
    .await?;

    let mut ventas_efectivo = Decimal::ZERO;
    let mut ventas_yape = Decimal::ZERO;
    let mut ventas_plin = Decimal::ZERO;
    let mut ventas_transferencia = Decimal::ZERO;
    let mut ventas_tarjeta = Decimal::ZERO;

    for row in pagos_rows {
        let metodo: String = row.get("metodo_pago");
        let total = parse_decimal(row.get("total_ingresos"));
        match metodo.to_uppercase().as_str() {
            "EFECTIVO" => ventas_efectivo += total,
            "YAPE" => ventas_yape += total,
            "PLIN" => ventas_plin += total,
            "TRANSFERENCIA" => ventas_transferencia += total,
            "TARJETA" => ventas_tarjeta += total,
            _ => (),
        }
    }
    let desglose_digital_ingresos = FinanceDigitalBreakdownDto::new(
        ventas_yape,
        ventas_plin,
        ventas_transferencia,
        ventas_tarjeta,
    );

    // 2. Egresos por Compras de Proveedores activas
    let compras_rows = sqlx::query(
        r#"
        SELECT 
            cp.canal_caja,
            cp.metodo_pago,
            CAST(COALESCE(SUM(cp.total_compra), 0) AS TEXT) AS total_compras
        FROM compras_proveedores cp
        WHERE cp.estado_activo = 1
          AND (? IS NULL OR date(cp.fecha_compra) >= date(?))
          AND (? IS NULL OR date(cp.fecha_compra) <= date(?))
        GROUP BY cp.canal_caja, cp.metodo_pago
        "#,
    )
    .bind(f_desde)
    .bind(f_desde)
    .bind(f_hasta)
    .bind(f_hasta)
    .fetch_all(pool)
    .await?;

    let mut compras_efectivo = Decimal::ZERO;
    let mut compras_yape = Decimal::ZERO;
    let mut compras_plin = Decimal::ZERO;
    let mut compras_transferencia = Decimal::ZERO;
    let mut compras_tarjeta = Decimal::ZERO;

    for row in compras_rows {
        let metodo: String = row.get("metodo_pago");
        let total = parse_decimal(row.get("total_compras"));
        match metodo.to_uppercase().as_str() {
            "EFECTIVO" => compras_efectivo += total,
            "YAPE" => compras_yape += total,
            "PLIN" => compras_plin += total,
            "TRANSFERENCIA" => compras_transferencia += total,
            "TARJETA" => compras_tarjeta += total,
            _ => (),
        }
    }
    let desglose_digital_compras = FinanceDigitalBreakdownDto::new(
        compras_yape,
        compras_plin,
        compras_transferencia,
        compras_tarjeta,
    );

    // 3. Egresos por Gastos Operativos activos
    let gastos_rows = sqlx::query(
        r#"
        SELECT 
            go.canal_caja,
            go.metodo_pago,
            CAST(COALESCE(SUM(go.monto), 0) AS TEXT) AS total_gastos
        FROM gastos_operativos go
        WHERE go.estado_activo = 1
          AND (? IS NULL OR date(go.fecha_gasto) >= date(?))
          AND (? IS NULL OR date(go.fecha_gasto) <= date(?))
        GROUP BY go.canal_caja, go.metodo_pago
        "#,
    )
    .bind(f_desde)
    .bind(f_desde)
    .bind(f_hasta)
    .bind(f_hasta)
    .fetch_all(pool)
    .await?;

    let mut gastos_efectivo = Decimal::ZERO;
    let mut gastos_yape = Decimal::ZERO;
    let mut gastos_plin = Decimal::ZERO;
    let mut gastos_transferencia = Decimal::ZERO;
    let mut gastos_tarjeta = Decimal::ZERO;

    for row in gastos_rows {
        let metodo: String = row.get("metodo_pago");
        let total = parse_decimal(row.get("total_gastos"));
        match metodo.to_uppercase().as_str() {
            "EFECTIVO" => gastos_efectivo += total,
            "YAPE" => gastos_yape += total,
            "PLIN" => gastos_plin += total,
            "TRANSFERENCIA" => gastos_transferencia += total,
            "TARJETA" => gastos_tarjeta += total,
            _ => (),
        }
    }
    let desglose_digital_gastos = FinanceDigitalBreakdownDto::new(
        gastos_yape,
        gastos_plin,
        gastos_transferencia,
        gastos_tarjeta,
    );

    // Construcción de Resúmenes por Canal (Física, Digital y Mixta)
    let fisica_ingresos = ventas_efectivo;
    let fisica_compras = compras_efectivo;
    let fisica_gastos = gastos_efectivo;
    let fisica_total_egresos = fisica_compras + fisica_gastos;
    let fisica_flujo_neto = fisica_ingresos - fisica_total_egresos;

    let fisica = ChannelFinancialSummaryDto {
        canal: "FISICA".to_string(),
        ingresos_ventas: fisica_ingresos,
        egresos_compras: fisica_compras,
        egresos_gastos: fisica_gastos,
        total_egresos: fisica_total_egresos,
        flujo_neto: fisica_flujo_neto,
    };

    let digital_ingresos = desglose_digital_ingresos.total;
    let digital_compras = desglose_digital_compras.total;
    let digital_gastos = desglose_digital_gastos.total;
    let digital_total_egresos = digital_compras + digital_gastos;
    let digital_flujo_neto = digital_ingresos - digital_total_egresos;

    let digital = ChannelFinancialSummaryDto {
        canal: "DIGITAL".to_string(),
        ingresos_ventas: digital_ingresos,
        egresos_compras: digital_compras,
        egresos_gastos: digital_gastos,
        total_egresos: digital_total_egresos,
        flujo_neto: digital_flujo_neto,
    };

    let mixta_ingresos = fisica_ingresos + digital_ingresos;
    let mixta_compras = fisica_compras + digital_compras;
    let mixta_gastos = fisica_gastos + digital_gastos;
    let mixta_total_egresos = mixta_compras + mixta_gastos;
    let mixta_flujo_neto = mixta_ingresos - mixta_total_egresos;

    let mixta = ChannelFinancialSummaryDto {
        canal: "MIXTA".to_string(),
        ingresos_ventas: mixta_ingresos,
        egresos_compras: mixta_compras,
        egresos_gastos: mixta_gastos,
        total_egresos: mixta_total_egresos,
        flujo_neto: mixta_flujo_neto,
    };

    // 4. Ingresos por Dominio Operativo
    let dominio_rows = sqlx::query(
        r#"
        SELECT 
            vd.tipo_item,
            CAST(COALESCE(SUM(vd.subtotal), 0) AS TEXT) AS total_dominio
        FROM venta_detalles vd
        INNER JOIN ventas v ON v.id = vd.venta_id
        WHERE v.estado_venta = 'COMPLETADA'
          AND (? IS NULL OR date(v.created_at) >= date(?))
          AND (? IS NULL OR date(v.created_at) <= date(?))
        GROUP BY vd.tipo_item
        "#,
    )
    .bind(f_desde)
    .bind(f_desde)
    .bind(f_hasta)
    .bind(f_hasta)
    .fetch_all(pool)
    .await?;

    let mut planes = Decimal::ZERO;
    let mut productos = Decimal::ZERO;
    let mut amortizaciones = Decimal::ZERO;

    for row in dominio_rows {
        let tipo: String = row.get("tipo_item");
        let total = parse_decimal(row.get("total_dominio"));
        match tipo.to_uppercase().as_str() {
            "PLAN" => planes += total,
            "PRODUCTO" => productos += total,
            "AMORTIZACION_CREDITO" | "AMORTIZACION" => amortizaciones += total,
            _ => (),
        }
    }
    let ingresos_por_dominio = DomainIncomeBreakdownDto {
        planes,
        productos,
        amortizaciones,
        total: planes + productos + amortizaciones,
    };

    // 5. Gastos por Categoría
    let cat_rows = sqlx::query(
        r#"
        SELECT 
            go.categoria,
            CAST(COALESCE(SUM(go.monto), 0) AS TEXT) AS total_categoria
        FROM gastos_operativos go
        WHERE go.estado_activo = 1
          AND (? IS NULL OR date(go.fecha_gasto) >= date(?))
          AND (? IS NULL OR date(go.fecha_gasto) <= date(?))
        GROUP BY go.categoria
        "#,
    )
    .bind(f_desde)
    .bind(f_desde)
    .bind(f_hasta)
    .bind(f_hasta)
    .fetch_all(pool)
    .await?;

    let mut cat_map = std::collections::HashMap::new();
    let mut total_gastos_operativos = Decimal::ZERO;
    for row in cat_rows {
        let cat_str: String = row.get("categoria");
        let total = parse_decimal(row.get("total_categoria"));
        total_gastos_operativos += total;
        cat_map.insert(cat_str, total);
    }

    let mut gastos_por_categoria = Vec::new();
    for cat in ExpenseCategory::all() {
        let cat_str = cat.to_string();
        let monto = cat_map.get(&cat_str).copied().unwrap_or(Decimal::ZERO);
        let porcentaje = if total_gastos_operativos > Decimal::ZERO {
            ((monto / total_gastos_operativos) * Decimal::from(100)).round_dp(2)
        } else {
            Decimal::ZERO
        };
        gastos_por_categoria.push(ExpenseCategoryBreakdownDto {
            categoria: *cat,
            categoria_label: cat.label().to_string(),
            monto,
            porcentaje,
        });
    }

    // 6. Indicadores de Control y Riesgo
    let creditos_row = sqlx::query(
        r#"
        SELECT 
            COUNT(id) AS cantidad_creditos,
            CAST(COALESCE(SUM(saldo_pendiente), 0) AS TEXT) AS saldo_total_pendiente
        FROM creditos_clientes
        WHERE estado = 'PENDIENTE'
        "#,
    )
    .fetch_one(pool)
    .await?;

    let cantidad_creditos_pendientes: i64 = creditos_row.get("cantidad_creditos");
    let total_creditos_pendientes = parse_decimal(creditos_row.get("saldo_total_pendiente"));

    let tachadas_row = sqlx::query(
        r#"
        SELECT 
            COALESCE(SUM(CASE WHEN estado_venta = 'TACHADA_EN_TURNO' THEN 1 ELSE 0 END), 0) AS tachadas_pendientes_count,
            CAST(COALESCE(SUM(CASE WHEN estado_venta = 'TACHADA_EN_TURNO' THEN total_venta ELSE 0 END), 0) AS TEXT) AS monto_tachado_pendiente,
            COALESCE(SUM(CASE WHEN estado_venta = 'ANULADA_DEFINITIVA' THEN 1 ELSE 0 END), 0) AS anuladas_definitivas_count
        FROM ventas
        WHERE (? IS NULL OR date(created_at) >= date(?))
          AND (? IS NULL OR date(created_at) <= date(?))
        "#,
    )
    .bind(f_desde)
    .bind(f_desde)
    .bind(f_hasta)
    .bind(f_hasta)
    .fetch_one(pool)
    .await?;

    let ventas_tachadas_pendientes_count: i64 =
        tachadas_row.get("tachadas_pendientes_count");
    let monto_tachado_pendiente =
        parse_decimal(tachadas_row.get("monto_tachado_pendiente"));
    let ventas_anuladas_definitivas_count: i64 =
        tachadas_row.get("anuladas_definitivas_count");

    let indicadores_control = FinancialControlIndicatorsDto {
        total_creditos_pendientes,
        cantidad_creditos_pendientes,
        ventas_tachadas_pendientes_count,
        monto_tachado_pendiente,
        ventas_anuladas_definitivas_count,
    };

    Ok(FinancialDashboardDto {
        filtro_aplicado: filter.clone(),
        fisica,
        digital,
        mixta,
        desglose_digital_ingresos,
        desglose_digital_compras,
        desglose_digital_gastos,
        ingresos_por_dominio,
        gastos_por_categoria,
        indicadores_control,
    })
}
