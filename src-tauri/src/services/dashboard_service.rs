use crate::errors::AppError;
use crate::models::dashboard::{
    ExpiringMembershipAlert, ExportFileResult, ExportFormat, ExportSalesReportRequest,
    HomeDashboardMetricsDto, HourlyAttendancePoint,
};
use crate::models::user::{AuthSession, UserRole};
use crate::services::audit_service::record_audit;
use crate::services::printing_backup_service::{
    get_printing_backup_config, MinimalPdfDocument, TabularPdfColumn,
};
use base64::Engine;
use chrono::{Local, NaiveDate};
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};
use std::collections::HashMap;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

fn parse_decimal(s: Option<String>) -> Decimal {
    s.and_then(|val| val.trim().parse::<Decimal>().ok())
        .unwrap_or(Decimal::ZERO)
}

fn compute_days_remaining(fecha_vencimiento: &str, today: NaiveDate) -> Option<i64> {
    let date_part = if fecha_vencimiento.len() >= 10 {
        &fecha_vencimiento[0..10]
    } else {
        fecha_vencimiento
    };
    NaiveDate::parse_from_str(date_part, "%Y-%m-%d")
        .ok()
        .map(|d| (d - today).num_days())
}

fn validate_optional_date(raw: &Option<String>, field_name: &str) -> Result<Option<String>, AppError> {
    let trimmed = raw.as_deref().map(str::trim).filter(|s| !s.is_empty());
    match trimmed {
        None => Ok(None),
        Some(val) => {
            NaiveDate::parse_from_str(val, "%Y-%m-%d").map_err(|_| {
                AppError::Validation(format!(
                    "Formato de fecha inválido en '{}': '{}'. Use YYYY-MM-DD.",
                    field_name, val
                ))
            })?;
            Ok(Some(val.to_string()))
        }
    }
}

fn normalize_channel_filter(raw: &Option<String>) -> Result<Option<String>, AppError> {
    let trimmed = raw.as_deref().map(str::trim).filter(|s| !s.is_empty());
    match trimmed {
        None => Ok(None),
        Some(val) => {
            let upper = val.to_uppercase();
            match upper.as_str() {
                "FISICA" | "DIGITAL" => Ok(Some(upper)),
                "MIXTA" | "TODOS" => Ok(None),
                other => Err(AppError::Validation(format!(
                    "Filtro de canal inválido: '{}'. Permitidos: FISICA, DIGITAL, MIXTA.",
                    other
                ))),
            }
        }
    }
}

// ============================================================================
// TAREA 2.1: HOME DASHBOARD ANALYTICS
// ============================================================================

pub async fn get_home_dashboard_metrics(
    pool: &SqlitePool,
    session: &AuthSession,
) -> Result<HomeDashboardMetricsDto, AppError> {
    let today = Local::now().date_naive();

    // 1. Clientes activos y membresías activas vigentes
    let clientes_activos: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM clientes WHERE estado_activo = 1")
            .fetch_one(pool)
            .await?;

    let membresias_activas: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM membresias_clientes m
        INNER JOIN clientes c ON c.id = m.cliente_id
        WHERE m.estado = 'ACTIVA'
          AND c.estado_activo = 1
          AND date(substr(m.fecha_vencimiento, 1, 10)) >= date('now', 'localtime')
        "#,
    )
    .fetch_one(pool)
    .await?;

    // 2. Asistencias de hoy
    let asistencias_hoy_total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM asistencias WHERE date(fecha_hora_ingreso) = date('now', 'localtime')",
    )
    .fetch_one(pool)
    .await?;

    // 3. Deudores activos y saldo total pendiente
    let debt_row = sqlx::query(
        r#"
        SELECT
            COUNT(DISTINCT cliente_id) AS deudores_count,
            CAST(COALESCE(SUM(saldo_pendiente), 0) AS TEXT) AS saldo_total
        FROM creditos_clientes
        WHERE estado = 'PENDIENTE' AND CAST(saldo_pendiente AS REAL) > 0
        "#,
    )
    .fetch_one(pool)
    .await?;
    let deudores_activos_count: i64 = debt_row.get("deudores_count");
    let saldo_creditos_pendiente = parse_decimal(debt_row.get("saldo_total"));

    // 4. Ingresos de hoy (pagos ACTIVOS en ventas COMPLETADAS)
    let today_rev_row = sqlx::query(
        r#"
        SELECT
            CAST(COALESCE(SUM(CASE WHEN p.canal_caja = 'FISICA' THEN p.monto ELSE 0 END), 0) AS TEXT) AS hoy_fisico,
            CAST(COALESCE(SUM(CASE WHEN p.canal_caja = 'DIGITAL' THEN p.monto ELSE 0 END), 0) AS TEXT) AS hoy_digital
        FROM pagos p
        INNER JOIN ventas v ON v.id = p.venta_id
        WHERE p.estado_pago = 'ACTIVO'
          AND v.estado_venta = 'COMPLETADA'
          AND date(v.created_at) = date('now', 'localtime')
        "#,
    )
    .fetch_one(pool)
    .await?;
    let ingresos_hoy_fisico = parse_decimal(today_rev_row.get("hoy_fisico"));
    let ingresos_hoy_digital = parse_decimal(today_rev_row.get("hoy_digital"));
    let ingresos_hoy_total = ingresos_hoy_fisico + ingresos_hoy_digital;

    // 5. Ingresos del mes (RBAC: solo SUPERVISOR y ADMINISTRADOR)
    let can_view_monthly_revenue = session.rol != UserRole::Recepcionista;
    let (ingresos_mes_fisico, ingresos_mes_digital, ingresos_mes_total) =
        if can_view_monthly_revenue {
            let month_rev_row = sqlx::query(
                r#"
                SELECT
                    CAST(COALESCE(SUM(CASE WHEN p.canal_caja = 'FISICA' THEN p.monto ELSE 0 END), 0) AS TEXT) AS mes_fisico,
                    CAST(COALESCE(SUM(CASE WHEN p.canal_caja = 'DIGITAL' THEN p.monto ELSE 0 END), 0) AS TEXT) AS mes_digital
                FROM pagos p
                INNER JOIN ventas v ON v.id = p.venta_id
                WHERE p.estado_pago = 'ACTIVO'
                  AND v.estado_venta = 'COMPLETADA'
                  AND strftime('%Y-%m', v.created_at) = strftime('%Y-%m', 'now', 'localtime')
                "#,
            )
            .fetch_one(pool)
            .await?;
            let mf = parse_decimal(month_rev_row.get("mes_fisico"));
            let md = parse_decimal(month_rev_row.get("mes_digital"));
            (mf, md, mf + md)
        } else {
            let zero = Decimal::new(0, 2);
            (zero, zero, zero)
        };

    // 6. Afluencia por franja horaria del día (05:00 a 22:00)
    let hourly_rows = sqlx::query(
        r#"
        SELECT
            CAST(strftime('%H', fecha_hora_ingreso) AS INTEGER) AS hora,
            COUNT(*) AS total
        FROM asistencias
        WHERE date(fecha_hora_ingreso) = date('now', 'localtime')
        GROUP BY CAST(strftime('%H', fecha_hora_ingreso) AS INTEGER)
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut hourly_map: HashMap<u32, i64> = HashMap::new();
    for r in hourly_rows {
        let hora_i64: i64 = r.get("hora");
        let total: i64 = r.get("total");
        if (0..=23).contains(&hora_i64) {
            hourly_map.insert(hora_i64 as u32, total);
        }
    }

    let afluencia_por_franja: Vec<HourlyAttendancePoint> = (5u32..=22u32)
        .map(|hora| HourlyAttendancePoint {
            franja: format!("{:02}:00", hora),
            hora,
            total: *hourly_map.get(&hora).unwrap_or(&0),
        })
        .collect();

    // 7. Membresías próximas a vencer (entre 0 y 3 días desde hoy inclusive)
    let expiring_rows = sqlx::query(
        r#"
        SELECT
            c.id AS cliente_id,
            TRIM(per.nombres || ' ' || per.apellidos) AS nombre_completo,
            per.telefono AS telefono,
            pl.nombre AS nombre_plan,
            m.fecha_vencimiento AS fecha_vencimiento
        FROM membresias_clientes m
        INNER JOIN clientes c ON c.id = m.cliente_id
        INNER JOIN personas per ON per.id = c.persona_id
        INNER JOIN planes pl ON pl.id = m.plan_id
        WHERE m.estado = 'ACTIVA'
          AND c.estado_activo = 1
          AND per.estado_activo = 1
          AND date(substr(m.fecha_vencimiento, 1, 10)) >= date('now', 'localtime')
          AND date(substr(m.fecha_vencimiento, 1, 10)) <= date('now', 'localtime', '+3 days')
        ORDER BY substr(m.fecha_vencimiento, 1, 10) ASC, c.id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut membresias_por_vencer = Vec::with_capacity(expiring_rows.len());
    for row in expiring_rows {
        let fecha_vencimiento: String = row.get("fecha_vencimiento");
        if let Some(dias_restantes) = compute_days_remaining(&fecha_vencimiento, today) {
            if (0..=3).contains(&dias_restantes) {
                membresias_por_vencer.push(ExpiringMembershipAlert {
                    cliente_id: row.get("cliente_id"),
                    nombre_completo: row.get("nombre_completo"),
                    telefono: row.get("telefono"),
                    nombre_plan: row.get("nombre_plan"),
                    fecha_vencimiento,
                    dias_restantes,
                });
            }
        }
    }

    Ok(HomeDashboardMetricsDto {
        clientes_activos,
        membresias_activas,
        asistencias_hoy_total,
        deudores_activos_count,
        saldo_creditos_pendiente,
        ingresos_hoy_fisico,
        ingresos_hoy_digital,
        ingresos_hoy_total,
        ingresos_mes_fisico,
        ingresos_mes_digital,
        ingresos_mes_total,
        can_view_monthly_revenue,
        afluencia_por_franja,
        membresias_por_vencer,
        generated_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

// ============================================================================
// MOTOR PURO EN RAM: CSV (UTF-8 BOM + RFC 4180) & XLSX (ZIP Store + OOXML)
// ============================================================================

#[derive(Debug, Clone)]
enum ExportCell {
    Text(String),
    Number(String),
}

impl ExportCell {
    fn as_str(&self) -> &str {
        match self {
            ExportCell::Text(s) | ExportCell::Number(s) => s.as_str(),
        }
    }
}

fn escape_csv_field(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        let mut out = String::with_capacity(value.len() + 4);
        out.push('"');
        for ch in value.chars() {
            if ch == '"' {
                out.push_str("\"\"");
            } else {
                out.push(ch);
            }
        }
        out.push('"');
        out
    } else {
        value.to_string()
    }
}

fn build_csv_bytes(headers: &[&str], rows: &[Vec<ExportCell>]) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::with_capacity(2048);
    // UTF-8 BOM para apertura correcta en Excel Windows (tildes / ñ)
    out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);

    let header_line: Vec<String> = headers.iter().map(|h| escape_csv_field(h)).collect();
    out.extend_from_slice(header_line.join(",").as_bytes());
    out.extend_from_slice(b"\r\n");

    for row in rows {
        let line: Vec<String> = row
            .iter()
            .map(|c| escape_csv_field(c.as_str()))
            .collect();
        out.extend_from_slice(line.join(",").as_bytes());
        out.extend_from_slice(b"\r\n");
    }

    out
}

fn escape_xml(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 8);
    for ch in value.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            '\t' | '\n' | '\r' => out.push(ch),
            c if (c as u32) < 0x20 => (), // Descartar caracteres de control inválidos en XML 1.0
            c => out.push(c),
        }
    }
    out
}

fn excel_col_letter(mut col_idx: usize) -> String {
    let mut chars = Vec::new();
    loop {
        let rem = col_idx % 26;
        chars.push((b'A' + rem as u8) as char);
        if col_idx < 26 {
            break;
        }
        col_idx = col_idx / 26 - 1;
    }
    chars.into_iter().rev().collect()
}

fn crc32_ieee(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

/// Empaqueta archivos en RAM dentro de un archivo ZIP estándar (método Store = 0).
fn build_zip_store(entries: &[(&str, &[u8])]) -> Vec<u8> {
    struct CentralRecord<'a> {
        name: &'a str,
        crc: u32,
        size: u32,
        local_header_offset: u32,
    }

    let total_data: usize = entries.iter().map(|(n, d)| n.len() * 2 + d.len() + 96).sum();
    let mut zip = Vec::with_capacity(total_data + 64);
    let mut central_records = Vec::with_capacity(entries.len());

    const DOS_TIME: u16 = 0x0000;
    const DOS_DATE: u16 = 0x5421; // 2022-01-01
    const UTF8_FLAG: u16 = 0x0800;

    for &(name, data) in entries {
        let local_offset = zip.len() as u32;
        let crc = crc32_ieee(data);
        let size = data.len() as u32;
        let name_bytes = name.as_bytes();
        let name_len = name_bytes.len() as u16;

        // Local file header (30 bytes)
        zip.extend_from_slice(&0x0403_4B50u32.to_le_bytes());
        zip.extend_from_slice(&20u16.to_le_bytes()); // version needed
        zip.extend_from_slice(&UTF8_FLAG.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes()); // compression method 0 (Store)
        zip.extend_from_slice(&DOS_TIME.to_le_bytes());
        zip.extend_from_slice(&DOS_DATE.to_le_bytes());
        zip.extend_from_slice(&crc.to_le_bytes());
        zip.extend_from_slice(&size.to_le_bytes());
        zip.extend_from_slice(&size.to_le_bytes());
        zip.extend_from_slice(&name_len.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes()); // extra len
        zip.extend_from_slice(name_bytes);
        zip.extend_from_slice(data);

        central_records.push(CentralRecord {
            name,
            crc,
            size,
            local_header_offset: local_offset,
        });
    }

    let cd_offset = zip.len() as u32;
    for rec in &central_records {
        let name_bytes = rec.name.as_bytes();
        let name_len = name_bytes.len() as u16;

        // Central directory file header (46 bytes)
        zip.extend_from_slice(&0x0201_4B50u32.to_le_bytes());
        zip.extend_from_slice(&20u16.to_le_bytes()); // version made by
        zip.extend_from_slice(&20u16.to_le_bytes()); // version needed
        zip.extend_from_slice(&UTF8_FLAG.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes()); // compression method 0
        zip.extend_from_slice(&DOS_TIME.to_le_bytes());
        zip.extend_from_slice(&DOS_DATE.to_le_bytes());
        zip.extend_from_slice(&rec.crc.to_le_bytes());
        zip.extend_from_slice(&rec.size.to_le_bytes());
        zip.extend_from_slice(&rec.size.to_le_bytes());
        zip.extend_from_slice(&name_len.to_le_bytes());
        zip.extend_from_slice(&0u16.to_le_bytes()); // extra len
        zip.extend_from_slice(&0u16.to_le_bytes()); // comment len
        zip.extend_from_slice(&0u16.to_le_bytes()); // disk number start
        zip.extend_from_slice(&0u16.to_le_bytes()); // internal attrs
        zip.extend_from_slice(&0u32.to_le_bytes()); // external attrs
        zip.extend_from_slice(&rec.local_header_offset.to_le_bytes());
        zip.extend_from_slice(name_bytes);
    }

    let cd_size = (zip.len() as u32) - cd_offset;
    let count = central_records.len() as u16;

    // End of central directory record (22 bytes)
    zip.extend_from_slice(&0x0605_4B50u32.to_le_bytes());
    zip.extend_from_slice(&0u16.to_le_bytes()); // disk number
    zip.extend_from_slice(&0u16.to_le_bytes()); // cd start disk
    zip.extend_from_slice(&count.to_le_bytes());
    zip.extend_from_slice(&count.to_le_bytes());
    zip.extend_from_slice(&cd_size.to_le_bytes());
    zip.extend_from_slice(&cd_offset.to_le_bytes());
    zip.extend_from_slice(&0u16.to_le_bytes()); // comment len

    zip
}

fn build_xlsx_bytes(sheet_name: &str, headers: &[&str], rows: &[Vec<ExportCell>]) -> Vec<u8> {
    let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"#;

    let root_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#;

    let clean_sheet_name: String = sheet_name
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | '?' | '*' | '[' | ']' | ':'))
        .take(31)
        .collect();
    let workbook_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="{}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>"#,
        escape_xml(if clean_sheet_name.is_empty() {
            "Reporte"
        } else {
            &clean_sheet_name
        })
    );

    let workbook_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#;

    let styles_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>"#;

    let mut sheet_xml = String::with_capacity(4096 + rows.len() * 256);
    sheet_xml.push_str(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
"#,
    );

    // Fila 1: Cabeceras en negrita (s="1")
    sheet_xml.push_str("    <row r=\"1\">\n");
    for (col_idx, header) in headers.iter().enumerate() {
        let cell_ref = format!("{}1", excel_col_letter(col_idx));
        sheet_xml.push_str(&format!(
            "      <c r=\"{}\" t=\"inlineStr\" s=\"1\"><is><t>{}</t></is></c>\n",
            cell_ref,
            escape_xml(header)
        ));
    }
    sheet_xml.push_str("    </row>\n");

    // Filas de datos
    for (row_idx, row) in rows.iter().enumerate() {
        let excel_row = row_idx + 2;
        sheet_xml.push_str(&format!("    <row r=\"{}\">\n", excel_row));
        for (col_idx, cell) in row.iter().enumerate() {
            let cell_ref = format!("{}{}", excel_col_letter(col_idx), excel_row);
            match cell {
                ExportCell::Number(num_str) if num_str.trim().parse::<f64>().is_ok() => {
                    sheet_xml.push_str(&format!(
                        "      <c r=\"{}\" t=\"n\"><v>{}</v></c>\n",
                        cell_ref,
                        num_str.trim()
                    ));
                }
                ExportCell::Text(txt) | ExportCell::Number(txt) => {
                    sheet_xml.push_str(&format!(
                        "      <c r=\"{}\" t=\"inlineStr\"><is><t>{}</t></is></c>\n",
                        cell_ref,
                        escape_xml(txt)
                    ));
                }
            }
        }
        sheet_xml.push_str("    </row>\n");
    }

    sheet_xml.push_str("  </sheetData>\n</worksheet>");

    build_zip_store(&[
        ("[Content_Types].xml", content_types.as_bytes()),
        ("_rels/.rels", root_rels.as_bytes()),
        ("xl/workbook.xml", workbook_xml.as_bytes()),
        ("xl/_rels/workbook.xml.rels", workbook_rels.as_bytes()),
        ("xl/styles.xml", styles_xml.as_bytes()),
        ("xl/worksheets/sheet1.xml", sheet_xml.as_bytes()),
    ])
}

async fn finalize_export_and_audit(
    pool: &SqlitePool,
    session: &AuthSession,
    report_type: &str,
    filename: String,
    format: ExportFormat,
    bytes: Vec<u8>,
    row_count: usize,
) -> Result<ExportFileResult, AppError> {
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256_hash = format!("{:x}", hasher.finalize());

    let size_bytes = bytes.len();
    let content_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let details = serde_json::json!({
        "reporte": report_type,
        "formato": format.as_str(),
        "filename": filename,
        "row_count": row_count,
        "size_bytes": size_bytes,
    })
    .to_string();

    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "REPORT_EXPORTED",
        "REPORTES",
        &details,
        None,
    )
    .await?;

    Ok(ExportFileResult {
        filename,
        mime_type: format.mime_type().to_string(),
        content_base64,
        size_bytes,
        sha256_hash,
        row_count,
    })
}

// ============================================================================
// TAREA 2.3: 3 REPORTES EXPORTABLES (CSV / XLSX / PDF)
// ============================================================================

/// 1. Padrón general de clientes activos/inactivos, membresía y deuda pendiente.
pub async fn export_clients_roster(
    pool: &SqlitePool,
    session: &AuthSession,
    format: ExportFormat,
) -> Result<ExportFileResult, AppError> {
    let today = Local::now().date_naive();
    let today_str = today.format("%Y-%m-%d").to_string();
    let issued_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let db_rows = sqlx::query(
        r#"
        WITH ranked_membresias AS (
            SELECT
                m.cliente_id,
                pl.nombre AS nombre_plan,
                m.estado AS estado_membresia,
                m.fecha_vencimiento,
                ROW_NUMBER() OVER (
                    PARTITION BY m.cliente_id
                    ORDER BY
                        CASE WHEN m.estado = 'ACTIVA' THEN 0 ELSE 1 END ASC,
                        substr(m.fecha_vencimiento, 1, 10) DESC,
                        m.id DESC
                ) AS rn
            FROM membresias_clientes m
            INNER JOIN planes pl ON pl.id = m.plan_id
        ),
        deudas_clientes AS (
            SELECT
                cliente_id,
                CAST(COALESCE(SUM(saldo_pendiente), 0) AS TEXT) AS deuda_pendiente
            FROM creditos_clientes
            WHERE estado = 'PENDIENTE'
            GROUP BY cliente_id
        )
        SELECT
            c.id AS cliente_id,
            p.tipo_documento,
            p.numero_documento,
            TRIM(p.nombres || ' ' || p.apellidos) AS nombre_completo,
            COALESCE(p.telefono, '') AS telefono,
            COALESCE(p.email, '') AS email,
            c.codigo_qr_token,
            c.estado_activo,
            rm.nombre_plan,
            rm.estado_membresia,
            rm.fecha_vencimiento,
            COALESCE(dc.deuda_pendiente, '0.00') AS deuda_pendiente
        FROM clientes c
        INNER JOIN personas p ON p.id = c.persona_id
        LEFT JOIN ranked_membresias rm ON rm.cliente_id = c.id AND rm.rn = 1
        LEFT JOIN deudas_clientes dc ON dc.cliente_id = c.id
        ORDER BY p.apellidos COLLATE NOCASE ASC, p.nombres COLLATE NOCASE ASC, c.id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let headers = [
        "ID",
        "Tipo Doc.",
        "N° Documento",
        "Nombre Completo",
        "Teléfono",
        "Email",
        "Código QR",
        "Estado Cliente",
        "Plan Membresía",
        "Estado Membresía",
        "Vencimiento",
        "Días Rest.",
        "Deuda (PEN)",
    ];

    let mut rows: Vec<Vec<ExportCell>> = Vec::with_capacity(db_rows.len());
    let mut total_deuda = Decimal::ZERO;

    for r in db_rows {
        let cliente_id: i64 = r.get("cliente_id");
        let tipo_doc: String = r.get("tipo_documento");
        let num_doc: String = r.get("numero_documento");
        let nombre_completo: String = r.get("nombre_completo");
        let telefono: String = r.get("telefono");
        let email: String = r.get("email");
        let qr: String = r.get("codigo_qr_token");
        let activo_num: i64 = r.get("estado_activo");
        let estado_cliente = if activo_num == 1 { "ACTIVO" } else { "INACTIVO" };

        let nombre_plan: Option<String> = r.get("nombre_plan");
        let estado_membresia: Option<String> = r.get("estado_membresia");
        let fecha_vencimiento: Option<String> = r.get("fecha_vencimiento");
        let deuda_dec = parse_decimal(r.get("deuda_pendiente"));
        total_deuda += deuda_dec;

        let dias_rest_cell = match fecha_vencimiento.as_deref() {
            Some(fv) => match compute_days_remaining(fv, today) {
                Some(d) => ExportCell::Number(d.to_string()),
                None => ExportCell::Text("-".into()),
            },
            None => ExportCell::Text("-".into()),
        };

        let venc_display = fecha_vencimiento
            .as_deref()
            .map(|s| if s.len() >= 10 { &s[0..10] } else { s })
            .unwrap_or("-")
            .to_string();

        rows.push(vec![
            ExportCell::Number(cliente_id.to_string()),
            ExportCell::Text(tipo_doc),
            ExportCell::Text(num_doc),
            ExportCell::Text(nombre_completo),
            ExportCell::Text(if telefono.is_empty() { "-".into() } else { telefono }),
            ExportCell::Text(if email.is_empty() { "-".into() } else { email }),
            ExportCell::Text(qr),
            ExportCell::Text(estado_cliente.into()),
            ExportCell::Text(nombre_plan.unwrap_or_else(|| "Sin membresía".into())),
            ExportCell::Text(estado_membresia.unwrap_or_else(|| "-".into())),
            ExportCell::Text(venc_display),
            dias_rest_cell,
            ExportCell::Number(format!("{:.2}", deuda_dec)),
        ]);
    }

    let row_count = rows.len();
    let bytes = match format {
        ExportFormat::Csv => build_csv_bytes(&headers, &rows),
        ExportFormat::Xlsx => build_xlsx_bytes("Padron Clientes", &headers, &rows),
        ExportFormat::Pdf => {
            let config = get_printing_backup_config(pool, session).await?;
            // Selección de columnas clave para A4 horizontal legible
            let pdf_cols = [
                TabularPdfColumn { header: "ID", x: 38, max_chars: 5 },
                TabularPdfColumn { header: "Doc.", x: 68, max_chars: 14 },
                TabularPdfColumn { header: "Nombre Completo", x: 140, max_chars: 28 },
                TabularPdfColumn { header: "Telefono", x: 295, max_chars: 13 },
                TabularPdfColumn { header: "Estado", x: 365, max_chars: 9 },
                TabularPdfColumn { header: "Plan Membresia", x: 420, max_chars: 22 },
                TabularPdfColumn { header: "Est. Memb.", x: 540, max_chars: 10 },
                TabularPdfColumn { header: "Vencimiento", x: 605, max_chars: 12 },
                TabularPdfColumn { header: "Dias", x: 675, max_chars: 6 },
                TabularPdfColumn { header: "Deuda PEN", x: 725, max_chars: 12 },
            ];
            let pdf_rows: Vec<Vec<String>> = rows
                .iter()
                .map(|r| {
                    vec![
                        r[0].as_str().to_string(),
                        format!("{} {}", r[1].as_str(), r[2].as_str()),
                        r[3].as_str().to_string(),
                        r[4].as_str().to_string(),
                        r[7].as_str().to_string(),
                        r[8].as_str().to_string(),
                        r[9].as_str().to_string(),
                        r[10].as_str().to_string(),
                        r[11].as_str().to_string(),
                        r[12].as_str().to_string(),
                    ]
                })
                .collect();
            let summary = format!("Deuda total acumulada en padron: PEN {:.2}", total_deuda);
            MinimalPdfDocument::build_tabular_report_pdf(
                "PADRON GENERAL DE CLIENTES Y MEMBRESIAS",
                "Incluye socios activos, inactivos y saldo pendiente",
                &issued_at,
                &config,
                &pdf_cols,
                &pdf_rows,
                Some(&summary),
            )?
        }
    };

    let filename = format!("padron_clientes_{}.{}", today_str, format.extension());
    finalize_export_and_audit(
        pool,
        session,
        "CLIENTS_ROSTER",
        filename,
        format,
        bytes,
        row_count,
    )
    .await
}

/// 2. Cartera de créditos y deudores pendientes (`creditos_clientes` `PENDIENTE`).
pub async fn export_debtors_portfolio(
    pool: &SqlitePool,
    session: &AuthSession,
    format: ExportFormat,
) -> Result<ExportFileResult, AppError> {
    let today_str = Local::now().format("%Y-%m-%d").to_string();
    let issued_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let db_rows = sqlx::query(
        r#"
        SELECT
            cc.id AS credito_id,
            cc.cliente_id,
            p.tipo_documento,
            p.numero_documento,
            TRIM(p.nombres || ' ' || p.apellidos) AS nombre_completo,
            COALESCE(p.telefono, '') AS telefono,
            cc.origen_credito,
            cc.descripcion,
            cc.fecha_emision,
            CAST(cc.monto_total AS TEXT) AS monto_total,
            CAST(cc.monto_pagado AS TEXT) AS monto_pagado,
            CAST(cc.saldo_pendiente AS TEXT) AS saldo_pendiente,
            COALESCE(cc.fecha_ultimo_pago, '-') AS fecha_ultimo_pago
        FROM creditos_clientes cc
        INNER JOIN clientes c ON c.id = cc.cliente_id
        INNER JOIN personas p ON p.id = c.persona_id
        WHERE cc.estado = 'PENDIENTE'
        ORDER BY CAST(cc.saldo_pendiente AS REAL) DESC, cc.fecha_emision ASC, cc.id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let headers = [
        "ID Crédito",
        "ID Cliente",
        "Documento",
        "Cliente",
        "Teléfono",
        "Origen Crédito",
        "Descripción",
        "Fecha Emisión",
        "Monto Total (PEN)",
        "Pagado (PEN)",
        "Saldo Pendiente (PEN)",
        "Último Pago",
    ];

    let mut rows: Vec<Vec<ExportCell>> = Vec::with_capacity(db_rows.len());
    let mut total_pendiente = Decimal::ZERO;

    for r in db_rows {
        let credito_id: i64 = r.get("credito_id");
        let cliente_id: i64 = r.get("cliente_id");
        let tipo_doc: String = r.get("tipo_documento");
        let num_doc: String = r.get("numero_documento");
        let nombre_completo: String = r.get("nombre_completo");
        let telefono: String = r.get("telefono");
        let origen: String = r.get("origen_credito");
        let descripcion: String = r.get("descripcion");
        let fecha_emision: String = r.get("fecha_emision");
        let monto_total = parse_decimal(r.get("monto_total"));
        let monto_pagado = parse_decimal(r.get("monto_pagado"));
        let saldo_pendiente = parse_decimal(r.get("saldo_pendiente"));
        let fecha_ultimo_pago: String = r.get("fecha_ultimo_pago");

        total_pendiente += saldo_pendiente;

        rows.push(vec![
            ExportCell::Number(credito_id.to_string()),
            ExportCell::Number(cliente_id.to_string()),
            ExportCell::Text(format!("{} {}", tipo_doc, num_doc)),
            ExportCell::Text(nombre_completo),
            ExportCell::Text(if telefono.is_empty() { "-".into() } else { telefono }),
            ExportCell::Text(origen),
            ExportCell::Text(descripcion),
            ExportCell::Text(fecha_emision),
            ExportCell::Number(format!("{:.2}", monto_total)),
            ExportCell::Number(format!("{:.2}", monto_pagado)),
            ExportCell::Number(format!("{:.2}", saldo_pendiente)),
            ExportCell::Text(fecha_ultimo_pago),
        ]);
    }

    let row_count = rows.len();
    let bytes = match format {
        ExportFormat::Csv => build_csv_bytes(&headers, &rows),
        ExportFormat::Xlsx => build_xlsx_bytes("Cartera Deudores", &headers, &rows),
        ExportFormat::Pdf => {
            let config = get_printing_backup_config(pool, session).await?;
            let pdf_cols = [
                TabularPdfColumn { header: "Cred.", x: 38, max_chars: 6 },
                TabularPdfColumn { header: "Documento", x: 72, max_chars: 14 },
                TabularPdfColumn { header: "Cliente", x: 145, max_chars: 25 },
                TabularPdfColumn { header: "Telefono", x: 278, max_chars: 12 },
                TabularPdfColumn { header: "Origen", x: 342, max_chars: 18 },
                TabularPdfColumn { header: "Descripcion", x: 438, max_chars: 24 },
                TabularPdfColumn { header: "Emision", x: 568, max_chars: 10 },
                TabularPdfColumn { header: "Total", x: 632, max_chars: 9 },
                TabularPdfColumn { header: "Pagado", x: 685, max_chars: 9 },
                TabularPdfColumn { header: "Pendiente", x: 740, max_chars: 11 },
            ];
            let pdf_rows: Vec<Vec<String>> = rows
                .iter()
                .map(|r| {
                    let emision_short = if r[7].as_str().len() >= 10 {
                        r[7].as_str()[0..10].to_string()
                    } else {
                        r[7].as_str().to_string()
                    };
                    vec![
                        r[0].as_str().to_string(),
                        r[2].as_str().to_string(),
                        r[3].as_str().to_string(),
                        r[4].as_str().to_string(),
                        r[5].as_str().to_string(),
                        r[6].as_str().to_string(),
                        emision_short,
                        r[8].as_str().to_string(),
                        r[9].as_str().to_string(),
                        r[10].as_str().to_string(),
                    ]
                })
                .collect();
            let summary = format!("Saldo total pendiente por cobrar: PEN {:.2}", total_pendiente);
            MinimalPdfDocument::build_tabular_report_pdf(
                "CARTERA DE CREDITOS Y DEUDORES PENDIENTES",
                "Creditos activos en estado PENDIENTE",
                &issued_at,
                &config,
                &pdf_cols,
                &pdf_rows,
                Some(&summary),
            )?
        }
    };

    let filename = format!("cartera_deudores_{}.{}", today_str, format.extension());
    finalize_export_and_audit(
        pool,
        session,
        "DEBTORS_PORTFOLIO",
        filename,
        format,
        bytes,
        row_count,
    )
    .await
}

/// 3. Reporte detallado de ventas y movimientos de caja (solo SUPERVISOR o ADMINISTRADOR).
pub async fn export_sales_cash_report(
    pool: &SqlitePool,
    session: &AuthSession,
    request: ExportSalesReportRequest,
) -> Result<ExportFileResult, AppError> {
    session.require_supervisor_or_admin()?;

    let desde_opt = validate_optional_date(&request.fecha_desde, "fecha_desde")?;
    let hasta_opt = validate_optional_date(&request.fecha_hasta, "fecha_hasta")?;
    if let (Some(ref d), Some(ref h)) = (&desde_opt, &hasta_opt) {
        if d > h {
            return Err(AppError::Validation(
                "La fecha inicial no puede ser posterior a la fecha final.".into(),
            ));
        }
    }
    let canal_opt = normalize_channel_filter(&request.canal_filtro)?;

    let today_str = Local::now().format("%Y-%m-%d").to_string();
    let issued_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT
            v.id AS venta_id,
            v.created_at,
            v.turno_caja_id,
            uv.username AS vendedor_username,
            COALESCE(TRIM(per.nombres || ' ' || per.apellidos), 'PÚBLICO GENERAL') AS cliente_nombre,
            CAST(v.subtotal AS TEXT) AS subtotal,
            CAST(v.descuento AS TEXT) AS descuento,
            CAST(v.total_venta AS TEXT) AS total_venta,
            CAST(v.monto_pagado_efectivo AS TEXT) AS monto_efectivo,
            CAST(v.monto_pagado_digital AS TEXT) AS monto_digital,
            CAST(v.saldo_credito_generado AS TEXT) AS saldo_credito,
            v.estado_venta
        FROM ventas v
        INNER JOIN usuarios_sistema uv ON uv.id = v.usuario_vendedor_id
        LEFT JOIN clientes c ON c.id = v.cliente_id
        LEFT JOIN personas per ON per.id = c.persona_id
        WHERE 1=1
        "#,
    );

    if let Some(ref d) = desde_opt {
        builder.push(" AND date(v.created_at) >= date(");
        builder.push_bind(d);
        builder.push(")");
    }

    if let Some(ref h) = hasta_opt {
        builder.push(" AND date(v.created_at) <= date(");
        builder.push_bind(h);
        builder.push(")");
    }

    if let Some(ref canal) = canal_opt {
        if canal == "FISICA" {
            builder.push(" AND CAST(v.monto_pagado_efectivo AS REAL) > 0");
        } else if canal == "DIGITAL" {
            builder.push(" AND CAST(v.monto_pagado_digital AS REAL) > 0");
        }
    }

    builder.push(" ORDER BY v.created_at DESC, v.id DESC");

    let db_rows = builder.build().fetch_all(pool).await?;

    let headers = [
        "ID Venta",
        "Fecha / Hora",
        "Turno",
        "Vendedor",
        "Cliente",
        "Subtotal (PEN)",
        "Descuento (PEN)",
        "Total Venta (PEN)",
        "Efectivo (PEN)",
        "Digital (PEN)",
        "Crédito (PEN)",
        "Estado",
    ];

    let mut rows: Vec<Vec<ExportCell>> = Vec::with_capacity(db_rows.len());
    let mut sum_completadas_total = Decimal::ZERO;
    let mut sum_completadas_efectivo = Decimal::ZERO;
    let mut sum_completadas_digital = Decimal::ZERO;

    for r in db_rows {
        let venta_id: i64 = r.get("venta_id");
        let created_at: String = r.get("created_at");
        let turno_caja_id: i64 = r.get("turno_caja_id");
        let vendedor: String = r.get("vendedor_username");
        let cliente: String = r.get("cliente_nombre");
        let subtotal = parse_decimal(r.get("subtotal"));
        let descuento = parse_decimal(r.get("descuento"));
        let total_venta = parse_decimal(r.get("total_venta"));
        let efectivo = parse_decimal(r.get("monto_efectivo"));
        let digital = parse_decimal(r.get("monto_digital"));
        let credito = parse_decimal(r.get("saldo_credito"));
        let estado: String = r.get("estado_venta");

        if estado == "COMPLETADA" {
            sum_completadas_total += total_venta;
            sum_completadas_efectivo += efectivo;
            sum_completadas_digital += digital;
        }

        rows.push(vec![
            ExportCell::Number(venta_id.to_string()),
            ExportCell::Text(created_at),
            ExportCell::Number(turno_caja_id.to_string()),
            ExportCell::Text(vendedor),
            ExportCell::Text(cliente),
            ExportCell::Number(format!("{:.2}", subtotal)),
            ExportCell::Number(format!("{:.2}", descuento)),
            ExportCell::Number(format!("{:.2}", total_venta)),
            ExportCell::Number(format!("{:.2}", efectivo)),
            ExportCell::Number(format!("{:.2}", digital)),
            ExportCell::Number(format!("{:.2}", credito)),
            ExportCell::Text(estado),
        ]);
    }

    let row_count = rows.len();
    let bytes = match request.format {
        ExportFormat::Csv => build_csv_bytes(&headers, &rows),
        ExportFormat::Xlsx => build_xlsx_bytes("Reporte Ventas", &headers, &rows),
        ExportFormat::Pdf => {
            let config = get_printing_backup_config(pool, session).await?;
            let periodo_label = match (&desde_opt, &hasta_opt) {
                (None, None) => "Historial acumulado".to_string(),
                (Some(d), Some(h)) => format!("Del {} al {}", d, h),
                (Some(d), None) => format!("Desde {}", d),
                (None, Some(h)) => format!("Hasta {}", h),
            };
            let canal_label = canal_opt.as_deref().unwrap_or("MIXTA (TODOS)");
            let subtitle = format!("Periodo: {} | Canal: {}", periodo_label, canal_label);

            let pdf_cols = [
                TabularPdfColumn { header: "ID", x: 38, max_chars: 5 },
                TabularPdfColumn { header: "Fecha/Hora", x: 68, max_chars: 19 },
                TabularPdfColumn { header: "Turno", x: 165, max_chars: 6 },
                TabularPdfColumn { header: "Vendedor", x: 202, max_chars: 14 },
                TabularPdfColumn { header: "Cliente", x: 278, max_chars: 24 },
                TabularPdfColumn { header: "Total", x: 405, max_chars: 10 },
                TabularPdfColumn { header: "Efectivo", x: 465, max_chars: 10 },
                TabularPdfColumn { header: "Digital", x: 525, max_chars: 10 },
                TabularPdfColumn { header: "Credito", x: 585, max_chars: 10 },
                TabularPdfColumn { header: "Estado", x: 645, max_chars: 20 },
            ];
            let pdf_rows: Vec<Vec<String>> = rows
                .iter()
                .map(|r| {
                    vec![
                        r[0].as_str().to_string(),
                        r[1].as_str().to_string(),
                        format!("#{}", r[2].as_str()),
                        r[3].as_str().to_string(),
                        r[4].as_str().to_string(),
                        r[7].as_str().to_string(),
                        r[8].as_str().to_string(),
                        r[9].as_str().to_string(),
                        r[10].as_str().to_string(),
                        r[11].as_str().to_string(),
                    ]
                })
                .collect();
            let summary = format!(
                "Ventas Completadas -> Total: PEN {:.2} | Efectivo: PEN {:.2} | Digital: PEN {:.2}",
                sum_completadas_total, sum_completadas_efectivo, sum_completadas_digital
            );
            MinimalPdfDocument::build_tabular_report_pdf(
                "REPORTE DETALLADO DE VENTAS Y MOVIMIENTOS DE CAJA",
                &subtitle,
                &issued_at,
                &config,
                &pdf_cols,
                &pdf_rows,
                Some(&summary),
            )?
        }
    };

    let filename = match (&desde_opt, &hasta_opt) {
        (None, None) => format!("reporte_ventas_{}.{}", today_str, request.format.extension()),
        (Some(d), Some(h)) => format!("reporte_ventas_{}_{}.{}", d, h, request.format.extension()),
        (Some(d), None) => format!("reporte_ventas_desde_{}.{}", d, request.format.extension()),
        (None, Some(h)) => format!("reporte_ventas_hasta_{}.{}", h, request.format.extension()),
    };

    finalize_export_and_audit(
        pool,
        session,
        "SALES_CASH_REPORT",
        filename,
        request.format,
        bytes,
        row_count,
    )
    .await
}
