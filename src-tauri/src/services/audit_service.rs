use crate::errors::AppError;
use crate::models::{AuditFilter, AuditLogItem};
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};

/// Registra de forma inmutable una entrada en la bitácora de auditoría.
/// Cumple con la regla de CERO DELETE y CERO UPDATE.
pub async fn record_audit(
    pool: &SqlitePool,
    usuario_id: Option<i64>,
    username: &str,
    accion: &str,
    modulo: &str,
    detalles_json: &str,
    ip_o_terminal: Option<&str>,
) -> Result<(), AppError> {
    let terminal = ip_o_terminal.unwrap_or("LOCAL_DESKTOP");
    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(usuario_id)
    .bind(username)
    .bind(accion)
    .bind(modulo)
    .bind(detalles_json)
    .bind(terminal)
    .execute(pool)
    .await?;

    Ok(())
}

/// Consulta registros de auditoría filtrados y paginados, ordenados descendentemente.
pub async fn get_audit_logs(
    pool: &SqlitePool,
    filter: &AuditFilter,
) -> Result<Vec<AuditLogItem>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT id, usuario_id, username, accion, modulo, detalles_json, ip_o_terminal, created_at FROM auditoria_logs WHERE 1=1 ",
    );

    if let Some(ref m) = filter.modulo {
        if !m.trim().is_empty() {
            builder.push(" AND modulo = ");
            builder.push_bind(m.trim());
        }
    }

    if let Some(ref a) = filter.accion {
        if !a.trim().is_empty() {
            builder.push(" AND accion = ");
            builder.push_bind(a.trim());
        }
    }

    if let Some(ref u) = filter.username {
        if !u.trim().is_empty() {
            builder.push(" AND username = ");
            builder.push_bind(u.trim());
        }
    }

    if let Some(ref d) = filter.desde {
        if !d.trim().is_empty() {
            builder.push(" AND created_at >= ");
            builder.push_bind(d.trim());
        }
    }

    if let Some(ref h) = filter.hasta {
        if !h.trim().is_empty() {
            builder.push(" AND created_at <= ");
            builder.push_bind(h.trim());
        }
    }

    builder.push(" ORDER BY created_at DESC, id DESC");

    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    let query = builder.build();
    let rows = query.fetch_all(pool).await?;

    let items = rows
        .into_iter()
        .map(|row| AuditLogItem {
            id: row.get("id"),
            usuario_id: row.get("usuario_id"),
            username: row.get("username"),
            accion: row.get("accion"),
            modulo: row.get("modulo"),
            detalles_json: row.get("detalles_json"),
            ip_o_terminal: row.get("ip_o_terminal"),
            created_at: row.get("created_at"),
        })
        .collect();

    Ok(items)
}
