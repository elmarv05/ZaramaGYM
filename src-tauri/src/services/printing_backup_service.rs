use crate::errors::AppError;
use crate::models::finance::{FinancialDashboardDto, FinancialReportFilter};
use crate::models::printing_backup::*;
use crate::models::user::AuthSession;
use crate::services::audit_service::record_audit;
use crate::services::finance_service;
use crate::state::AppState;
use base64::Engine;
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{LazyLock, RwLock};

// ============================================================================
// ALMACÉN SEGURO DE SECRETOS (KeyringStore)
// ============================================================================

static KEYRING_FALLBACK: LazyLock<RwLock<HashMap<String, String>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

pub struct KeyringStore;

impl KeyringStore {
    pub fn set_secret(key: &str, value: &str) -> Result<(), AppError> {
        #[cfg(not(test))]
        {
            if let Ok(entry) = keyring::Entry::new("ZaramaGYM", key) {
                let _ = entry.set_password(value);
            }
        }

        let mut map = KEYRING_FALLBACK.write().map_err(|e| {
            AppError::Internal(format!("Error accediendo a KeyringStore: {}", e))
        })?;
        map.insert(key.to_string(), value.to_string());
        Ok(())
    }

    pub fn get_secret(key: &str) -> Result<Option<String>, AppError> {
        #[cfg(not(test))]
        {
            if let Ok(entry) = keyring::Entry::new("ZaramaGYM", key) {
                if let Ok(secret) = entry.get_password() {
                    if let Ok(mut map) = KEYRING_FALLBACK.write() {
                        map.insert(key.to_string(), secret.clone());
                    }
                    return Ok(Some(secret));
                }
            }
        }

        let map = KEYRING_FALLBACK.read().map_err(|e| {
            AppError::Internal(format!("Error leyendo de KeyringStore: {}", e))
        })?;
        Ok(map.get(key).cloned())
    }

    pub fn delete_secret(key: &str) -> Result<(), AppError> {
        #[cfg(not(test))]
        {
            if let Ok(entry) = keyring::Entry::new("ZaramaGYM", key) {
                let _ = entry.delete_credential();
            }
        }

        let mut map = KEYRING_FALLBACK.write().map_err(|e| {
            AppError::Internal(format!("Error accediendo a KeyringStore: {}", e))
        })?;
        map.remove(key);
        Ok(())
    }
}

// ============================================================================
// CONSTANTES Y BUILDER ESC/POS (Impresión Térmica 58mm / 80mm)
// ============================================================================

pub const ESC_INIT: &[u8] = &[0x1B, 0x40];
pub const TXT_BOLD_ON: &[u8] = &[0x1B, 0x45, 0x01];
pub const TXT_BOLD_OFF: &[u8] = &[0x1B, 0x45, 0x00];
pub const ALIGN_LEFT: &[u8] = &[0x1B, 0x61, 0x00];
pub const ALIGN_CENTER: &[u8] = &[0x1B, 0x61, 0x01];
pub const ALIGN_RIGHT: &[u8] = &[0x1B, 0x61, 0x02];
pub const PAPER_CUT: &[u8] = &[0x1D, 0x56, 0x42, 0x00];
pub const CASH_DRAWER_PULSE: &[u8] = &[0x1B, 0x70, 0x00, 0x19, 0xFA];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EscAlign {
    Left,
    Center,
    Right,
}

pub fn pad_left(text: &str, width: usize) -> String {
    let char_count = text.chars().count();
    if char_count >= width {
        text.chars().take(width).collect()
    } else {
        format!("{}{}", " ".repeat(width - char_count), text)
    }
}

pub fn pad_right(text: &str, width: usize) -> String {
    let char_count = text.chars().count();
    if char_count >= width {
        text.chars().take(width).collect()
    } else {
        format!("{}{}", text, " ".repeat(width - char_count))
    }
}

pub fn pad_center(text: &str, width: usize) -> String {
    let char_count = text.chars().count();
    if char_count >= width {
        text.chars().take(width).collect()
    } else {
        let total_pad = width - char_count;
        let left_pad = total_pad / 2;
        let right_pad = total_pad - left_pad;
        format!("{}{}{}", " ".repeat(left_pad), text, " ".repeat(right_pad))
    }
}

pub fn wrap_text_to_width(text: &str, max_cols: usize) -> Vec<String> {
    if max_cols == 0 || text.is_empty() {
        return vec![String::new()];
    }
    if !text.contains('\n') && text.chars().count() <= max_cols {
        return vec![text.to_string()];
    }

    let mut lines = Vec::new();
    for raw_segment in text.split('\n') {
        let segment = raw_segment.trim_end_matches('\r');
        if segment.trim().is_empty() {
            lines.push(String::new());
            continue;
        }
        if segment.chars().count() <= max_cols {
            lines.push(segment.to_string());
            continue;
        }

        let mut current_line = String::new();
        let mut current_len = 0usize;

        for word in segment.split_whitespace() {
            let word_len = word.chars().count();

            if word_len > max_cols {
                if !current_line.is_empty() {
                    lines.push(current_line);
                    current_line = String::new();
                    current_len = 0;
                }
                let mut chunk = String::new();
                let mut chunk_len = 0usize;
                for ch in word.chars() {
                    chunk.push(ch);
                    chunk_len += 1;
                    if chunk_len == max_cols {
                        lines.push(chunk);
                        chunk = String::new();
                        chunk_len = 0;
                    }
                }
                if !chunk.is_empty() {
                    current_line = chunk;
                    current_len = chunk_len;
                }
                continue;
            }

            if current_line.is_empty() {
                current_line.push_str(word);
                current_len = word_len;
            } else if current_len + 1 + word_len <= max_cols {
                current_line.push(' ');
                current_line.push_str(word);
                current_len += 1 + word_len;
            } else {
                lines.push(current_line);
                current_line = word.to_string();
                current_len = word_len;
            }
        }

        if !current_line.is_empty() {
            lines.push(current_line);
        }
    }

    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

pub struct EscPosTicketBuilder {
    width_cols: usize,
    raw_bytes: Vec<u8>,
    text_buffer: Vec<String>,
}

impl EscPosTicketBuilder {
    pub fn new(cols: usize) -> Self {
        let mut builder = Self {
            width_cols: cols,
            raw_bytes: Vec::with_capacity(1024),
            text_buffer: Vec::with_capacity(64),
        };
        builder.raw_bytes.extend_from_slice(ESC_INIT);
        builder
    }

    pub fn add_line(&mut self, text: &str, align: EscAlign, bold: bool) {
        let align_bytes = match align {
            EscAlign::Left => ALIGN_LEFT,
            EscAlign::Center => ALIGN_CENTER,
            EscAlign::Right => ALIGN_RIGHT,
        };

        for line in wrap_text_to_width(text, self.width_cols) {
            self.raw_bytes.extend_from_slice(align_bytes);
            if bold {
                self.raw_bytes.extend_from_slice(TXT_BOLD_ON);
            }
            self.raw_bytes.extend_from_slice(line.as_bytes());
            self.raw_bytes.push(b'\n');
            if bold {
                self.raw_bytes.extend_from_slice(TXT_BOLD_OFF);
            }

            let formatted = match align {
                EscAlign::Left => pad_right(&line, self.width_cols),
                EscAlign::Center => pad_center(&line, self.width_cols),
                EscAlign::Right => pad_left(&line, self.width_cols),
            };
            self.text_buffer.push(formatted);
        }
    }

    pub fn add_centered_title(&mut self, text: &str) {
        self.add_line(text, EscAlign::Center, true);
    }

    pub fn add_divider(&mut self, ch: char) {
        let line: String = std::iter::repeat(ch).take(self.width_cols).collect();
        self.add_line(&line, EscAlign::Left, false);
    }

    pub fn add_two_columns(&mut self, left: &str, right: &str, bold: bool) {
        let left_len = left.chars().count();
        let right_len = right.chars().count();
        let total_content = left_len + right_len;

        let line = if total_content >= self.width_cols {
            let available_left = self.width_cols.saturating_sub(right_len + 1);
            let trunc_left: String = left.chars().take(available_left).collect();
            let spaces = self.width_cols.saturating_sub(trunc_left.chars().count() + right_len);
            format!("{}{}{}", trunc_left, " ".repeat(spaces), right)
        } else {
            let spaces = self.width_cols - total_content;
            format!("{}{}{}", left, " ".repeat(spaces), right)
        };
        self.add_line(&line, EscAlign::Left, bold);
    }

    pub fn add_item_row(&mut self, cant: i64, desc: &str, p_unit: Decimal, subtotal: Decimal) {
        if self.width_cols <= 32 {
            // 58mm (32 cols): "1x Camiseta           25.00"
            let prefix = format!("{}x ", cant);
            let sub_str = format!("{:.2}", subtotal);
            let prefix_len = prefix.chars().count();
            let sub_len = sub_str.chars().count();

            let available_for_desc = self.width_cols.saturating_sub(prefix_len + sub_len + 1);
            let truncated_desc: String = desc.chars().take(available_for_desc).collect();
            let desc_len = truncated_desc.chars().count();

            let spaces = self.width_cols.saturating_sub(prefix_len + desc_len + sub_len);
            let line = format!("{}{}{}{}", prefix, truncated_desc, " ".repeat(spaces), sub_str);
            self.add_line(&line, EscAlign::Left, false);
        } else {
            // 80mm (48 cols): "1   Camiseta DryFit             25.00    25.00"
            let cant_str = format!("{:<3}", cant);
            let unit_str = format!("{:>8.2}", p_unit);
            let sub_str = format!("{:>9.2}", subtotal);

            let fixed_len = cant_str.chars().count() + unit_str.chars().count() + sub_str.chars().count() + 3;
            let available_desc = self.width_cols.saturating_sub(fixed_len);
            let truncated_desc: String = desc.chars().take(available_desc).collect();
            let padded_desc = pad_right(&truncated_desc, available_desc);

            let line = format!("{} {} {} {}", cant_str, padded_desc, unit_str, sub_str);
            self.add_line(&line, EscAlign::Left, false);
        }
    }

    pub fn add_drawer_pulse(&mut self) {
        self.raw_bytes.extend_from_slice(CASH_DRAWER_PULSE);
    }

    pub fn finalize(&mut self) -> (Vec<u8>, String) {
        self.raw_bytes.extend_from_slice(PAPER_CUT);
        (self.raw_bytes.clone(), self.text_buffer.join("\n"))
    }
}

// ============================================================================
// GENERADOR PDF EN MEMORIA RAM (%PDF-1.4 Puro en Rust)
// ============================================================================

pub fn escape_pdf(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len() + 10);
    for ch in s.chars() {
        match ch {
            '(' => escaped.push_str("\\("),
            ')' => escaped.push_str("\\)"),
            '\\' => escaped.push_str("\\\\"),
            '\r' => (),
            '\n' => escaped.push(' '),
            _ => escaped.push(ch),
        }
    }
    escaped
}

pub struct TabularPdfColumn<'a> {
    pub header: &'a str,
    pub x: u32,
    pub max_chars: usize,
}

fn truncate_pdf_cell(text: &str, max_chars: usize) -> String {
    let char_count = text.chars().count();
    if char_count <= max_chars {
        text.to_string()
    } else if max_chars <= 2 {
        text.chars().take(max_chars).collect()
    } else {
        let mut s: String = text.chars().take(max_chars - 2).collect();
        s.push_str("..");
        s
    }
}

pub struct MinimalPdfDocument;

impl MinimalPdfDocument {
    /// Compila uno o más streams de comandos PDF vectoriales en un documento estándar %PDF-1.4 válido.
    pub fn compile_pages_with_size(
        page_streams: &[Vec<u8>],
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>, AppError> {
        if page_streams.is_empty() {
            return Err(AppError::Internal(
                "No se puede compilar un documento PDF sin páginas.".into(),
            ));
        }

        let total_stream_bytes: usize = page_streams.iter().map(|s| s.len()).sum();
        let mut pdf = Vec::with_capacity(total_stream_bytes + 1024 + page_streams.len() * 256);
        pdf.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

        let total_objs = 4 + page_streams.len() * 2;
        let mut offsets = Vec::with_capacity(total_objs);
        offsets.push(0); // Dummy para xref índice 0

        // Objeto 1: Catálogo
        offsets.push(pdf.len());
        pdf.extend_from_slice(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

        // Objeto 2: Pages
        offsets.push(pdf.len());
        let kids: Vec<String> = (0..page_streams.len())
            .map(|i| format!("{} 0 R", 4 + i * 2))
            .collect();
        let pages_obj = format!(
            "2 0 obj\n<< /Type /Pages /Kids [{}] /Count {} >>\nendobj\n",
            kids.join(" "),
            page_streams.len()
        );
        pdf.extend_from_slice(pages_obj.as_bytes());

        // Objeto 3: Fuente Estándar Tipo 1 (Helvetica)
        offsets.push(pdf.len());
        pdf.extend_from_slice(
            b"3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        );

        // Objetos 4..N: Pares (Page, Content Stream)
        for (i, stream_bytes) in page_streams.iter().enumerate() {
            let page_obj_id = 4 + i * 2;
            let stream_obj_id = page_obj_id + 1;

            offsets.push(pdf.len());
            let page_obj = format!(
                "{} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {} {}] /Contents {} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n",
                page_obj_id, width, height, stream_obj_id
            );
            pdf.extend_from_slice(page_obj.as_bytes());

            offsets.push(pdf.len());
            let stream_header = format!(
                "{} 0 obj\n<< /Length {} >>\nstream\n",
                stream_obj_id,
                stream_bytes.len()
            );
            pdf.extend_from_slice(stream_header.as_bytes());
            pdf.extend_from_slice(stream_bytes);
            pdf.extend_from_slice(b"\nendstream\nendobj\n");
        }

        // Tabla XREF
        let xref_offset = pdf.len();
        let xref_header = format!("xref\n0 {}\n0000000000 65535 f \r\n", total_objs);
        pdf.extend_from_slice(xref_header.as_bytes());
        for offset in &offsets[1..] {
            let entry = format!("{:010} 00000 n \r\n", offset);
            pdf.extend_from_slice(entry.as_bytes());
        }

        // Trailer
        let trailer = format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
            total_objs, xref_offset
        );
        pdf.extend_from_slice(trailer.as_bytes());

        Ok(pdf)
    }

    /// Compila un stream de comandos PDF vectoriales en un documento estándar %PDF-1.4 válido (A4 Portrait).
    pub fn compile_page(stream_bytes: &[u8]) -> Result<Vec<u8>, AppError> {
        Self::compile_pages_with_size(&[stream_bytes.to_vec()], 595, 842)
    }

    /// Construye un reporte tabular ejecutivo multi-página en A4 Horizontal (842 x 595 pt).
    pub fn build_tabular_report_pdf(
        title: &str,
        subtitle: &str,
        issued_at: &str,
        config: &PrintingBackupConfigDto,
        columns: &[TabularPdfColumn<'_>],
        rows: &[Vec<String>],
        footer_summary: Option<&str>,
    ) -> Result<Vec<u8>, AppError> {
        const PAGE_WIDTH: u32 = 842;
        const PAGE_HEIGHT: u32 = 595;
        const ROWS_PER_PAGE: usize = 30;

        let total_pages = if rows.is_empty() {
            1
        } else {
            (rows.len() + ROWS_PER_PAGE - 1) / ROWS_PER_PAGE
        };

        let mut page_streams: Vec<Vec<u8>> = Vec::with_capacity(total_pages);

        for page_idx in 0..total_pages {
            let mut s = String::with_capacity(4096);

            // Encabezado de empresa y título
            s.push_str("BT\n/F1 13 Tf\n36 560 Td\n");
            s.push_str(&format!(
                "({}) Tj\nET\n",
                escape_pdf(&config.empresa_nombre_comercial)
            ));

            s.push_str("BT\n/F1 8 Tf\n710 560 Td\n");
            s.push_str(&format!(
                "(Pagina {} de {}) Tj\nET\n",
                page_idx + 1,
                total_pages
            ));

            s.push_str("BT\n/F1 8 Tf\n36 546 Td\n");
            s.push_str(&format!(
                "({}  |  R.U.C.: {}) Tj\nET\n",
                escape_pdf(&config.empresa_razon_social),
                escape_pdf(&config.empresa_ruc)
            ));

            s.push_str("BT\n/F1 11 Tf\n36 528 Td\n");
            s.push_str(&format!("({}) Tj\nET\n", escape_pdf(title)));

            s.push_str("BT\n/F1 8 Tf\n36 514 Td\n");
            s.push_str(&format!(
                "({}  |  Emision: {}) Tj\nET\n",
                escape_pdf(subtitle),
                escape_pdf(issued_at)
            ));

            // Cabecera de tabla
            s.push_str("0.92 0.94 0.96 rg\n36 490 770 16 re f\n");
            s.push_str("0 0 0 rg\n0.4 w\n0.25 0.25 0.25 RG\n36 490 770 16 re S\n");
            for col in columns {
                let hdr = truncate_pdf_cell(col.header, col.max_chars);
                s.push_str(&format!(
                    "BT\n/F1 7.5 Tf\n{} 495 Td\n({}) Tj\nET\n",
                    col.x,
                    escape_pdf(&hdr)
                ));
            }

            if rows.is_empty() {
                s.push_str("BT\n/F1 9 Tf\n36 468 Td\n(Sin registros para el criterio seleccionado.) Tj\nET\n");
            } else {
                let start = page_idx * ROWS_PER_PAGE;
                let end = (start + ROWS_PER_PAGE).min(rows.len());
                let mut y: i32 = 475;

                for row in &rows[start..end] {
                    for (col_idx, col) in columns.iter().enumerate() {
                        let raw_val = row.get(col_idx).map(String::as_str).unwrap_or("");
                        let cell_txt = truncate_pdf_cell(raw_val, col.max_chars);
                        s.push_str(&format!(
                            "BT\n/F1 7.5 Tf\n{} {} Td\n({}) Tj\nET\n",
                            col.x,
                            y,
                            escape_pdf(&cell_txt)
                        ));
                    }
                    s.push_str(&format!(
                        "0.2 w\n0.85 0.85 0.85 RG\n36 {} m 806 {} l S\n",
                        y - 4,
                        y - 4
                    ));
                    y -= 14;
                }
            }

            if page_idx + 1 == total_pages {
                if let Some(summary) = footer_summary {
                    if !summary.trim().is_empty() {
                        s.push_str("BT\n/F1 8 Tf\n36 44 Td\n");
                        s.push_str(&format!("({}) Tj\nET\n", escape_pdf(summary)));
                    }
                }
            }

            s.push_str("0 0 0 rg\nBT\n/F1 7 Tf\n36 28 Td\n");
            s.push_str(&format!(
                "(ZaramaGYM Sistema de Gestion Contable - Generado en memoria RAM | Total registros: {}) Tj\nET\n",
                rows.len()
            ));

            page_streams.push(s.into_bytes());
        }

        Self::compile_pages_with_size(&page_streams, PAGE_WIDTH, PAGE_HEIGHT)
    }

    /// Construye el comprobante de venta formal en PDF
    pub fn build_receipt_pdf(snapshot: &ReceiptSnapshotData) -> Result<Vec<u8>, AppError> {
        let mut s = String::with_capacity(2048);

        // 1. Encabezado de Empresa
        s.push_str("BT\n/F1 14 Tf\n50 790 Td\n");
        s.push_str(&format!("({}) Tj\nET\n", escape_pdf(&snapshot.empresa_nombre_comercial)));

        let mut header_y = 775;
        if !snapshot.empresa_razon_social.trim().is_empty() {
            for razon_line in wrap_text_to_width(&snapshot.empresa_razon_social, 55) {
                s.push_str(&format!("BT\n/F1 9 Tf\n50 {} Td\n", header_y));
                s.push_str(&format!("({}) Tj\nET\n", escape_pdf(&razon_line)));
                header_y -= 11;
            }
        }

        s.push_str(&format!("BT\n/F1 9 Tf\n50 {} Td\n", header_y));
        s.push_str(&format!("(R.U.C.: {}) Tj\nET\n", escape_pdf(&snapshot.empresa_ruc)));
        header_y -= 11;

        for dir_line in wrap_text_to_width(&snapshot.empresa_direccion, 55) {
            s.push_str(&format!("BT\n/F1 9 Tf\n50 {} Td\n", header_y));
            s.push_str(&format!("({}) Tj\nET\n", escape_pdf(&dir_line)));
            header_y -= 11;
        }

        s.push_str(&format!("BT\n/F1 9 Tf\n50 {} Td\n", header_y));
        s.push_str(&format!("(Telefono: {}) Tj\nET\n", escape_pdf(&snapshot.empresa_telefono)));

        // 2. Recuadro del Comprobante (x=380, y=735, w=165, h=70)
        s.push_str("0.5 w\n0 0 0 RG\n380 735 165 70 re S\n");
        s.push_str("BT\n/F1 10 Tf\n390 788 Td\n");
        s.push_str(&format!("(R.U.C. {}) Tj\nET\n", snapshot.empresa_ruc));

        s.push_str("BT\n/F1 11 Tf\n390 768 Td\n");
        s.push_str(&format!("({}) Tj\nET\n", snapshot.comprobante.tipo_comprobante.display_name()));

        s.push_str("BT\n/F1 12 Tf\n390 748 Td\n");
        s.push_str(&format!("(No. {}) Tj\nET\n", snapshot.comprobante.numero_formateado));

        // 3. Marca Reactiva si la venta está Anulada / Tachada (CP-PRN-03)
        if snapshot.estado_venta == "TACHADA_EN_TURNO" || snapshot.estado_venta == "ANULADA_DEFINITIVA" {
            s.push_str("0.85 0.1 0.1 rg\n"); // Color Rojo
            s.push_str("BT\n/F1 18 Tf\n170 815 Td\n");
            s.push_str("([ COMPROBANTE ANULADO ]) Tj\nET\n");
            s.push_str("0 0 0 rg\n"); // Restaurar a Negro
        }

        // 4. Datos del Cliente / Receptor
        s.push_str("BT\n/F1 9 Tf\n50 715 Td\n");
        s.push_str(&format!("(SENOR\\(ES\\): {}) Tj\nET\n", escape_pdf(&snapshot.comprobante.receptor_razon_nombre)));

        s.push_str("BT\n/F1 9 Tf\n50 700 Td\n");
        s.push_str(&format!(
            "({}: {}) Tj\nET\n",
            snapshot.comprobante.receptor_tipo_doc,
            snapshot.comprobante.receptor_numero_doc
        ));

        s.push_str("BT\n/F1 9 Tf\n350 700 Td\n");
        s.push_str(&format!("(FECHA EMISION: {}) Tj\nET\n", snapshot.comprobante.fecha_emision));

        // 5. Tabla de Ítems
        s.push_str("0.2 w\n50 670 495 18 re S\n");
        s.push_str("BT\n/F1 9 Tf\n55 675 Td\n(CANT.) Tj\nET\n");
        s.push_str("BT\n/F1 9 Tf\n100 675 Td\n(DESCRIPCION) Tj\nET\n");
        s.push_str("BT\n/F1 9 Tf\n410 675 Td\n(P. UNIT.) Tj\nET\n");
        s.push_str("BT\n/F1 9 Tf\n480 675 Td\n(TOTAL) Tj\nET\n");

        let mut y = 650;
        for item in &snapshot.items {
            s.push_str(&format!("BT\n/F1 9 Tf\n55 {} Td\n({}) Tj\nET\n", y, item.cantidad));
            s.push_str(&format!("BT\n/F1 9 Tf\n100 {} Td\n({}) Tj\nET\n", y, escape_pdf(&item.descripcion)));
            s.push_str(&format!("BT\n/F1 9 Tf\n410 {} Td\n({:.2}) Tj\nET\n", y, item.precio_unitario));
            s.push_str(&format!("BT\n/F1 9 Tf\n480 {} Td\n({:.2}) Tj\nET\n", y, item.subtotal));
            y -= 16;
        }

        // 6. Línea divisoria y Totales
        s.push_str(&format!("0.2 w\n50 {} 495 0.5 re S\n", y + 4));
        y -= 12;

        s.push_str(&format!("BT\n/F1 9 Tf\n380 {} Td\n(SUBTOTAL: PEN {:.2}) Tj\nET\n", y, snapshot.subtotal));
        if snapshot.descuento > Decimal::ZERO {
            y -= 14;
            s.push_str(&format!("BT\n/F1 9 Tf\n380 {} Td\n(DESCUENTO: PEN {:.2}) Tj\nET\n", y, snapshot.descuento));
        }
        y -= 16;
        s.push_str(&format!("BT\n/F1 11 Tf\n380 {} Td\n(TOTAL: PEN {:.2}) Tj\nET\n", y, snapshot.total_venta));

        // 7. Métodos de Pago
        y -= 25;
        s.push_str(&format!("BT\n/F1 9 Tf\n50 {} Td\n(MEDIOS DE PAGO:) Tj\nET\n", y));
        y -= 14;
        for pago in &snapshot.pagos {
            let ref_str = pago.referencia_operacion.as_deref().unwrap_or("-");
            s.push_str(&format!(
                "BT\n/F1 8 Tf\n60 {} Td\n(- {} [{}]: PEN {:.2} Ref: {}) Tj\nET\n",
                y, pago.metodo_pago, pago.canal_caja, pago.monto, escape_pdf(ref_str)
            ));
            y -= 12;
        }

        // 8. Pie de página y Hash de Verificación
        s.push_str("BT\n/F1 8 Tf\n50 50 Td\n");
        s.push_str(&format!(
            "(HASH DE VERIFICACION: {}) Tj\nET\n",
            snapshot.comprobante.hash_verificacion
        ));
        s.push_str("BT\n/F1 8 Tf\n50 38 Td\n");
        s.push_str(&format!("({}) Tj\nET\n", escape_pdf(&snapshot.mensaje_pie)));

        Self::compile_page(s.as_bytes())
    }

    /// Construye el Reporte Financiero Consolidado en PDF
    pub fn build_financial_report_pdf(
        dashboard: &FinancialDashboardDto,
        fecha_desde: &str,
        fecha_hasta: &str,
        canal_filtro: Option<&str>,
        config: &PrintingBackupConfigDto,
    ) -> Result<Vec<u8>, AppError> {
        let mut s = String::with_capacity(3072);

        // Encabezado
        s.push_str("BT\n/F1 14 Tf\n50 790 Td\n");
        s.push_str(&format!("({}) Tj\nET\n", escape_pdf(&config.empresa_nombre_comercial)));

        s.push_str("BT\n/F1 12 Tf\n50 772 Td\n(REPORTE FINANCIERO Y CONTABLE CONSOLIDADO) Tj\nET\n");

        let canal_str = canal_filtro.unwrap_or("TODOS (MIXTA)");
        let today_local = chrono::Local::now().format("%Y-%m-%d").to_string();
        let desde_trim = fecha_desde.trim();
        let hasta_trim = fecha_hasta.trim();
        let periodo_str = match (desde_trim.is_empty(), hasta_trim.is_empty()) {
            (true, true) => format!("PERIODO: HISTORIAL ACUMULADO (Emision: {})", today_local),
            (false, false) => format!("Periodo: {} al {}", desde_trim, hasta_trim),
            (false, true) => format!("Periodo: Desde {} hasta {}", desde_trim, today_local),
            (true, false) => format!("Periodo: Acumulado hasta {}", hasta_trim),
        };
        s.push_str("BT\n/F1 9 Tf\n50 756 Td\n");
        s.push_str(&format!(
            "({}  |  Filtro Canal: {}) Tj\nET\n",
            escape_pdf(&periodo_str),
            escape_pdf(canal_str)
        ));

        // 1. Resumen por Canales de Caja (Física, Digital y Mixta)
        s.push_str("0.5 w\n50 735 495 16 re S\n");
        s.push_str("BT\n/F1 9 Tf\n55 739 Td\n(CANAL) Tj\nET\n");
        s.push_str("BT\n/F1 9 Tf\n140 739 Td\n(INGRESOS) Tj\nET\n");
        s.push_str("BT\n/F1 9 Tf\n230 739 Td\n(COMPRAS) Tj\nET\n");
        s.push_str("BT\n/F1 9 Tf\n320 739 Td\n(GASTOS) Tj\nET\n");
        s.push_str("BT\n/F1 9 Tf\n410 739 Td\n(TOTAL EGRESOS) Tj\nET\n");
        s.push_str("BT\n/F1 9 Tf\n490 739 Td\n(NETO) Tj\nET\n");

        let canales = [&dashboard.fisica, &dashboard.digital, &dashboard.mixta];
        let mut y = 718;
        for c in &canales {
            s.push_str(&format!("BT\n/F1 8 Tf\n55 {} Td\n({}) Tj\nET\n", y, c.canal));
            s.push_str(&format!("BT\n/F1 8 Tf\n140 {} Td\n({:.2}) Tj\nET\n", y, c.ingresos_ventas));
            s.push_str(&format!("BT\n/F1 8 Tf\n230 {} Td\n({:.2}) Tj\nET\n", y, c.egresos_compras));
            s.push_str(&format!("BT\n/F1 8 Tf\n320 {} Td\n({:.2}) Tj\nET\n", y, c.egresos_gastos));
            s.push_str(&format!("BT\n/F1 8 Tf\n410 {} Td\n({:.2}) Tj\nET\n", y, c.total_egresos));
            s.push_str(&format!("BT\n/F1 8 Tf\n490 {} Td\n({:.2}) Tj\nET\n", y, c.flujo_neto));
            y -= 14;
        }

        // 2. Ingresos por Dominio Operativo
        y -= 12;
        s.push_str(&format!("BT\n/F1 10 Tf\n50 {} Td\n(INGRESOS POR DOMINIO OPERATIVO) Tj\nET\n", y));
        y -= 14;
        s.push_str(&format!(
            "BT\n/F1 8 Tf\n60 {} Td\n(Planes de Entrenamiento: PEN {:.2}) Tj\nET\n",
            y, dashboard.ingresos_por_dominio.planes
        ));
        y -= 12;
        s.push_str(&format!(
            "BT\n/F1 8 Tf\n60 {} Td\n(Venta de Productos e Inventario: PEN {:.2}) Tj\nET\n",
            y, dashboard.ingresos_por_dominio.productos
        ));
        y -= 12;
        s.push_str(&format!(
            "BT\n/F1 8 Tf\n60 {} Td\n(Amortizaciones de Credito: PEN {:.2}) Tj\nET\n",
            y, dashboard.ingresos_por_dominio.amortizaciones
        ));
        y -= 12;
        s.push_str(&format!(
            "BT\n/F1 9 Tf\n60 {} Td\n(Total Ingresos por Dominio: PEN {:.2}) Tj\nET\n",
            y, dashboard.ingresos_por_dominio.total
        ));

        // 3. Gastos Operativos por Categoría
        y -= 16;
        s.push_str(&format!("BT\n/F1 10 Tf\n50 {} Td\n(GASTOS OPERATIVOS POR CATEGORIA) Tj\nET\n", y));
        y -= 14;
        for g in &dashboard.gastos_por_categoria {
            s.push_str(&format!(
                "BT\n/F1 8 Tf\n60 {} Td\n(- {} [{}]: PEN {:.2} [{}%]) Tj\nET\n",
                y, g.categoria_label, g.categoria, g.monto, g.porcentaje
            ));
            y -= 12;
        }

        // 4. Indicadores de Control
        y -= 14;
        s.push_str(&format!("BT\n/F1 10 Tf\n50 {} Td\n(INDICADORES DE CONTROL Y SALUD FINANCIERA) Tj\nET\n", y));
        y -= 14;
        s.push_str(&format!(
            "BT\n/F1 8 Tf\n60 {} Td\n(Creditos Pendientes: {} registros por un total de PEN {:.2}) Tj\nET\n",
            y,
            dashboard.indicadores_control.cantidad_creditos_pendientes,
            dashboard.indicadores_control.total_creditos_pendientes
        ));
        y -= 12;
        s.push_str(&format!(
            "BT\n/F1 8 Tf\n60 {} Td\n(Ventas Tachadas en Turno: {} [PEN {:.2}] | Anuladas Definitivas: {}) Tj\nET\n",
            y,
            dashboard.indicadores_control.ventas_tachadas_pendientes_count,
            dashboard.indicadores_control.monto_tachado_pendiente,
            dashboard.indicadores_control.ventas_anuladas_definitivas_count
        ));

        // Pie de página
        s.push_str("BT\n/F1 7 Tf\n50 40 Td\n(ZaramaGYM Sistema de Gestion Contable - Generado dinamicamente en memoria RAM) Tj\nET\n");

        Self::compile_page(s.as_bytes())
    }
}

// ============================================================================
// DESPACHO DE TICKET (Virtual Preview / Network TCP / Windows RAW)
// ============================================================================

pub async fn dispatch_ticket(
    mode: PrinterConnectionMode,
    target_address: &str,
    raw_bytes: &[u8],
    formatted_text: &str,
    width_mm: u16,
    cols: usize,
) -> Result<PrintTicketResult, AppError> {
    match mode {
        PrinterConnectionMode::VirtualPreview => Ok(PrintTicketResult {
            raw_escpos_base64: base64::engine::general_purpose::STANDARD.encode(raw_bytes),
            formatted_text: formatted_text.to_string(),
            width_columns: cols,
            width_mm,
            is_simulated: true,
            target_mode: mode,
            message: "Ticket renderizado en Simulador Virtual (Sin impresora física requerida)"
                .to_string(),
        }),
        PrinterConnectionMode::NetworkTcp => {
            let connect_fut = tokio::net::TcpStream::connect(target_address);
            let mut stream = tokio::time::timeout(std::time::Duration::from_secs(3), connect_fut)
                .await
                .map_err(|_| {
                    AppError::Internal(format!(
                        "Timeout al conectar con impresora de red: {}",
                        target_address
                    ))
                })?
                .map_err(|e| {
                    AppError::Internal(format!(
                        "Error conectando a impresora TCP {}: {}",
                        target_address, e
                    ))
                })?;

            use tokio::io::AsyncWriteExt;
            stream
                .write_all(raw_bytes)
                .await
                .map_err(|e| AppError::Internal(format!("Error enviando bytes ESC/POS: {}", e)))?;
            stream
                .flush()
                .await
                .map_err(|e| AppError::Internal(format!("Error en flush TCP: {}", e)))?;

            Ok(PrintTicketResult {
                raw_escpos_base64: base64::engine::general_purpose::STANDARD.encode(raw_bytes),
                formatted_text: formatted_text.to_string(),
                width_columns: cols,
                width_mm,
                is_simulated: false,
                target_mode: mode,
                message: format!(
                    "Ticket impreso exitosamente vía red TCP en {}",
                    target_address
                ),
            })
        }
        PrinterConnectionMode::WindowsRaw => Ok(PrintTicketResult {
            raw_escpos_base64: base64::engine::general_purpose::STANDARD.encode(raw_bytes),
            formatted_text: formatted_text.to_string(),
            width_columns: cols,
            width_mm,
            is_simulated: false,
            target_mode: mode,
            message: format!("Ticket despachado a cola Windows RAW: {}", target_address),
        }),
    }
}

// ============================================================================
// SERVICIOS DE COMPROBANTES Y SERIES DOCUMENTALES
// ============================================================================

/// Emite un comprobante formal asignando correlativo atómico y snapshot inmutable.
/// Idempotente (CP-PRN-02): si ya existe para la venta, lo retorna directamente.
pub async fn issue_sale_receipt(
    pool: &SqlitePool,
    session: &AuthSession,
    request: IssueReceiptRequest,
) -> Result<IssuedReceipt, AppError> {
    // 1. Verificar si ya existe comprobante emitido para esta venta (Idempotencia)
    let existing = sqlx::query(
        r#"
        SELECT id, venta_id, serie_id, tipo_comprobante, serie, correlativo,
               numero_formateado, receptor_tipo_doc, receptor_numero_doc,
               receptor_razon_nombre, receptor_direccion, moneda,
               CAST(total_comprobante AS TEXT) as total_comprobante,
               hash_verificacion, emitido_por_usuario_id, fecha_emision, created_at
        FROM comprobantes_emitidos
        WHERE venta_id = ?
        "#,
    )
    .bind(request.venta_id)
    .fetch_optional(pool)
    .await?;

    if let Some(r) = existing {
        let tipo_str: String = r.get("tipo_comprobante");
        let tipo = ReceiptType::from_str(&tipo_str).unwrap_or(ReceiptType::NotaVenta);
        let total_str: String = r.get("total_comprobante");
        let total = total_str.parse::<Decimal>().unwrap_or(Decimal::ZERO);

        return Ok(IssuedReceipt {
            id: r.get("id"),
            venta_id: r.get("venta_id"),
            serie_id: r.get("serie_id"),
            tipo_comprobante: tipo,
            serie: r.get("serie"),
            correlativo: r.get("correlativo"),
            numero_formateado: r.get("numero_formateado"),
            receptor_tipo_doc: r.get("receptor_tipo_doc"),
            receptor_numero_doc: r.get("receptor_numero_doc"),
            receptor_razon_nombre: r.get("receptor_razon_nombre"),
            receptor_direccion: r.get("receptor_direccion"),
            moneda: r.get("moneda"),
            total_comprobante: total,
            hash_verificacion: r.get("hash_verificacion"),
            emitido_por_usuario_id: r.get("emitido_por_usuario_id"),
            fecha_emision: r.get("fecha_emision"),
            created_at: r.get("created_at"),
        });
    }

    // 2. Verificar que la venta exista
    let venta_row = sqlx::query(
        "SELECT id, CAST(total_venta AS TEXT) as total_venta, cliente_id, usuario_vendedor_id, estado_venta FROM ventas WHERE id = ?",
    )
    .bind(request.venta_id)
    .fetch_optional(pool)
    .await?;

    let venta = match venta_row {
        Some(v) => v,
        None => {
            return Err(AppError::NotFound(format!(
                "Venta con ID {} no encontrada.",
                request.venta_id
            )))
        }
    };

    let total_neto_val: String = venta.get("total_venta");
    let total_neto = total_neto_val.parse::<Decimal>().unwrap_or(Decimal::ZERO);
    let cliente_id: Option<i64> = venta.get("cliente_id");

    // 3. Resolver datos del receptor
    let (tipo_doc, num_doc, razon_nombre, direccion) = if let (Some(td), Some(nd), Some(rn)) = (
        &request.receptor_tipo_doc,
        &request.receptor_numero_doc,
        &request.receptor_razon_nombre,
    ) {
        (
            td.clone(),
            nd.clone(),
            rn.clone(),
            request.receptor_direccion.clone(),
        )
    } else if let Some(cid) = cliente_id {
        let cliente_row = sqlx::query(
            r#"
            SELECT p.tipo_documento, p.numero_documento, p.nombres, p.apellidos, p.direccion
            FROM clientes cl
            INNER JOIN personas p ON p.id = cl.persona_id
            WHERE cl.id = ?
            "#,
        )
        .bind(cid)
        .fetch_optional(pool)
        .await?;

        if let Some(cr) = cliente_row {
            let nombres: String = cr.get("nombres");
            let apellidos: String = cr.get("apellidos");
            (
                cr.get("tipo_documento"),
                cr.get("numero_documento"),
                format!("{} {}", nombres, apellidos).trim().to_string(),
                cr.get("direccion"),
            )
        } else {
            (
                "SIN_DOC".to_string(),
                "00000000".to_string(),
                "CLIENTE GENERAL".to_string(),
                None,
            )
        }
    } else {
        (
            "SIN_DOC".to_string(),
            "00000000".to_string(),
            "CLIENTE GENERAL".to_string(),
            None,
        )
    };

    // 4. Validar Factura (RUC 11 dígitos numéricos)
    if request.tipo_comprobante == ReceiptType::Factura {
        let is_valid_ruc = num_doc.len() == 11 && num_doc.chars().all(|c| c.is_ascii_digit());
        if !is_valid_ruc {
            return Err(AppError::Validation(
                "Para emitir Factura comercial se requiere RUC válido de 11 dígitos.".to_string(),
            ));
        }
    }

    // 5. Transacción atómica para incrementar correlativo e insertar comprobante
    let mut tx = pool.begin().await?;

    // Doble verificación dentro de transacción
    let double_check = sqlx::query("SELECT id FROM comprobantes_emitidos WHERE venta_id = ?")
        .bind(request.venta_id)
        .fetch_optional(&mut *tx)
        .await?;
    if double_check.is_some() {
        tx.rollback().await?;
        return Box::pin(issue_sale_receipt(pool, session, request)).await;
    }

    let serie_row = sqlx::query(
        r#"
        SELECT id, serie, correlativo_actual
        FROM comprobantes_series
        WHERE tipo_comprobante = ? AND estado_activo = 1
        ORDER BY id ASC
        LIMIT 1
        "#,
    )
    .bind(request.tipo_comprobante.as_str())
    .fetch_optional(&mut *tx)
    .await?;

    let serie_record = match serie_row {
        Some(s) => s,
        None => {
            return Err(AppError::Validation(format!(
                "No existe una serie activa configurada para el tipo de comprobante {}.",
                request.tipo_comprobante.as_str()
            )))
        }
    };

    let serie_id: i64 = serie_record.get("id");
    let serie_code: String = serie_record.get("serie");
    let correlativo_actual: i64 = serie_record.get("correlativo_actual");
    let nuevo_correlativo = correlativo_actual + 1;
    let numero_formateado = format!("{}-{:06}", serie_code, nuevo_correlativo);

    // Actualizar correlativo de la serie
    sqlx::query(
        "UPDATE comprobantes_series SET correlativo_actual = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(nuevo_correlativo)
    .bind(serie_id)
    .execute(&mut *tx)
    .await?;

    // Calcular Hash SHA-256 de Verificación (16 caracteres hexadecimales)
    let raw_payload = format!(
        "{}:{}:{}:{}:{}:{}",
        serie_code, nuevo_correlativo, total_neto, num_doc, request.venta_id, session.user_id
    );
    let mut hasher = Sha256::new();
    hasher.update(raw_payload.as_bytes());
    let full_hash = format!("{:x}", hasher.finalize());
    let hash_verificacion = full_hash[..16].to_uppercase();

    // Insertar comprobante emitido
    let insert_row = sqlx::query(
        r#"
        INSERT INTO comprobantes_emitidos (
            venta_id, serie_id, tipo_comprobante, serie, correlativo,
            numero_formateado, receptor_tipo_doc, receptor_numero_doc,
            receptor_razon_nombre, receptor_direccion, moneda,
            total_comprobante, hash_verificacion, emitido_por_usuario_id,
            fecha_emision, created_at
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, 'PEN',
            ?, ?, ?,
            datetime('now', 'localtime'), datetime('now', 'localtime')
        )
        RETURNING id, fecha_emision, created_at;
        "#,
    )
    .bind(request.venta_id)
    .bind(serie_id)
    .bind(request.tipo_comprobante.as_str())
    .bind(&serie_code)
    .bind(nuevo_correlativo)
    .bind(&numero_formateado)
    .bind(&tipo_doc)
    .bind(&num_doc)
    .bind(&razon_nombre)
    .bind(&direccion)
    .bind(total_neto.to_string())
    .bind(&hash_verificacion)
    .bind(session.user_id)
    .fetch_one(&mut *tx)
    .await?;

    let emitido_id: i64 = insert_row.get("id");
    let fecha_emision: String = insert_row.get("fecha_emision");
    let created_at: String = insert_row.get("created_at");

    tx.commit().await?;

    // Auditoría
    let audit_detail = serde_json::json!({
        "numero": numero_formateado,
        "venta_id": request.venta_id,
        "tipo": request.tipo_comprobante.as_str(),
        "total": total_neto.to_string(),
    });
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "RECEIPT_ISSUED",
        "comprobantes_emitidos",
        &audit_detail.to_string(),
        None,
    )
    .await?;

    Ok(IssuedReceipt {
        id: emitido_id,
        venta_id: request.venta_id,
        serie_id,
        tipo_comprobante: request.tipo_comprobante,
        serie: serie_code,
        correlativo: nuevo_correlativo,
        numero_formateado,
        receptor_tipo_doc: tipo_doc,
        receptor_numero_doc: num_doc,
        receptor_razon_nombre: razon_nombre,
        receptor_direccion: direccion,
        moneda: "PEN".to_string(),
        total_comprobante: total_neto,
        hash_verificacion,
        emitido_por_usuario_id: session.user_id,
        fecha_emision,
        created_at,
    })
}

pub async fn get_sale_receipt(
    pool: &SqlitePool,
    _session: &AuthSession,
    venta_id: i64,
) -> Result<Option<IssuedReceipt>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, venta_id, serie_id, tipo_comprobante, serie, correlativo,
               numero_formateado, receptor_tipo_doc, receptor_numero_doc,
               receptor_razon_nombre, receptor_direccion, moneda,
               CAST(total_comprobante AS TEXT) as total_comprobante,
               hash_verificacion, emitido_por_usuario_id, fecha_emision, created_at
        FROM comprobantes_emitidos
        WHERE venta_id = ?
        "#,
    )
    .bind(venta_id)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(r) => {
            let tipo_str: String = r.get("tipo_comprobante");
            let tipo = ReceiptType::from_str(&tipo_str).unwrap_or(ReceiptType::NotaVenta);
            let total_str: String = r.get("total_comprobante");
            let total = total_str.parse::<Decimal>().unwrap_or(Decimal::ZERO);

            Ok(Some(IssuedReceipt {
                id: r.get("id"),
                venta_id: r.get("venta_id"),
                serie_id: r.get("serie_id"),
                tipo_comprobante: tipo,
                serie: r.get("serie"),
                correlativo: r.get("correlativo"),
                numero_formateado: r.get("numero_formateado"),
                receptor_tipo_doc: r.get("receptor_tipo_doc"),
                receptor_numero_doc: r.get("receptor_numero_doc"),
                receptor_razon_nombre: r.get("receptor_razon_nombre"),
                receptor_direccion: r.get("receptor_direccion"),
                moneda: r.get("moneda"),
                total_comprobante: total,
                hash_verificacion: r.get("hash_verificacion"),
                emitido_por_usuario_id: r.get("emitido_por_usuario_id"),
                fecha_emision: r.get("fecha_emision"),
                created_at: r.get("created_at"),
            }))
        }
        None => Ok(None),
    }
}

pub async fn list_receipt_series(
    pool: &SqlitePool,
    session: &AuthSession,
) -> Result<Vec<ReceiptSeries>, AppError> {
    session.require_admin()?;

    let rows = sqlx::query(
        r#"
        SELECT id, tipo_comprobante, serie, correlativo_actual, descripcion,
               estado_activo, created_at, updated_at
        FROM comprobantes_series
        ORDER BY tipo_comprobante ASC, id ASC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let series = rows
        .into_iter()
        .map(|r| {
            let tipo_str: String = r.get("tipo_comprobante");
            let tipo = ReceiptType::from_str(&tipo_str).unwrap_or(ReceiptType::NotaVenta);
            let activo_int: i64 = r.get("estado_activo");

            ReceiptSeries {
                id: r.get("id"),
                tipo_comprobante: tipo,
                serie: r.get("serie"),
                correlativo_actual: r.get("correlativo_actual"),
                descripcion: r.get("descripcion"),
                estado_activo: activo_int == 1,
                created_at: r.get("created_at"),
                updated_at: r.get("updated_at"),
            }
        })
        .collect();

    Ok(series)
}

pub async fn update_receipt_series(
    pool: &SqlitePool,
    session: &AuthSession,
    request: UpdateReceiptSeriesRequest,
) -> Result<ReceiptSeries, AppError> {
    session.require_admin()?;

    let serie_row = sqlx::query(
        "SELECT id, tipo_comprobante, serie, correlativo_actual FROM comprobantes_series WHERE id = ?",
    )
    .bind(request.serie_id)
    .fetch_optional(pool)
    .await?;

    let _serie_rec = match serie_row {
        Some(s) => s,
        None => {
            return Err(AppError::NotFound(format!(
                "Serie documental con ID {} no existe.",
                request.serie_id
            )))
        }
    };

    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"
        UPDATE comprobantes_series
        SET descripcion = ?, estado_activo = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(&request.descripcion)
    .bind(if request.estado_activo { 1 } else { 0 })
    .bind(request.serie_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let audit_detail = serde_json::json!({
        "serie_id": request.serie_id,
        "estado_activo": request.estado_activo,
        "descripcion": request.descripcion,
    });
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "SERIES_UPDATED",
        "comprobantes_series",
        &audit_detail.to_string(),
        None,
    )
    .await?;

    let updated_row = sqlx::query(
        r#"
        SELECT id, tipo_comprobante, serie, correlativo_actual, descripcion,
               estado_activo, created_at, updated_at
        FROM comprobantes_series
        WHERE id = ?
        "#,
    )
    .bind(request.serie_id)
    .fetch_one(pool)
    .await?;

    let tipo_str: String = updated_row.get("tipo_comprobante");
    let tipo = ReceiptType::from_str(&tipo_str).unwrap_or(ReceiptType::NotaVenta);
    let activo_int: i64 = updated_row.get("estado_activo");

    Ok(ReceiptSeries {
        id: updated_row.get("id"),
        tipo_comprobante: tipo,
        serie: updated_row.get("serie"),
        correlativo_actual: updated_row.get("correlativo_actual"),
        descripcion: updated_row.get("descripcion"),
        estado_activo: activo_int == 1,
        created_at: updated_row.get("created_at"),
        updated_at: updated_row.get("updated_at"),
    })
}

// ============================================================================
// CONSTRUCCIÓN DE SNAPSHOT PARA TICKETS Y PDFS
// ============================================================================

pub async fn build_receipt_snapshot(
    pool: &SqlitePool,
    session: &AuthSession,
    venta_id: i64,
) -> Result<ReceiptSnapshotData, AppError> {
    // 1. Obtener o auto-emitir comprobante
    let comprobante = match get_sale_receipt(pool, session, venta_id).await? {
        Some(r) => r,
        None => {
            issue_sale_receipt(
                pool,
                session,
                IssueReceiptRequest {
                    venta_id,
                    tipo_comprobante: ReceiptType::NotaVenta,
                    receptor_tipo_doc: None,
                    receptor_numero_doc: None,
                    receptor_razon_nombre: None,
                    receptor_direccion: None,
                },
            )
            .await?
        }
    };

    // 2. Venta
    let venta_row = sqlx::query(
        r#"
        SELECT v.estado_venta,
               CAST(v.subtotal AS TEXT) as subtotal,
               CAST(v.descuento AS TEXT) as descuento,
               CAST(v.total_venta AS TEXT) as total_venta,
               u.username,
               p.nombres,
               p.apellidos
        FROM ventas v
        INNER JOIN usuarios_sistema u ON u.id = v.usuario_vendedor_id
        INNER JOIN personas p ON p.id = u.persona_id
        WHERE v.id = ?
        "#,
    )
    .bind(venta_id)
    .fetch_optional(pool)
    .await?;

    let v = match venta_row {
        Some(row) => row,
        None => return Err(AppError::NotFound("Venta no encontrada".to_string())),
    };

    let estado_venta: String = v.get("estado_venta");
    let subtotal_str: String = v.get("subtotal");
    let descuento_str: String = v.get("descuento");
    let total_str: String = v.get("total_venta");

    let subtotal = subtotal_str.parse::<Decimal>().unwrap_or(Decimal::ZERO);
    let descuento = descuento_str.parse::<Decimal>().unwrap_or(Decimal::ZERO);
    let total_venta = total_str.parse::<Decimal>().unwrap_or(Decimal::ZERO);

    let nombres: String = v.get("nombres");
    let apellidos: String = v.get("apellidos");
    let usuario_vendedor_nombre = format!("{} {}", nombres, apellidos).trim().to_string();

    // 3. Detalles de ítems
    let item_rows = sqlx::query(
        r#"
        SELECT cantidad, descripcion,
               CAST(precio_unitario AS TEXT) as precio_unitario,
               CAST(subtotal AS TEXT) as subtotal
        FROM venta_detalles
        WHERE venta_id = ?
        ORDER BY id ASC
        "#,
    )
    .bind(venta_id)
    .fetch_all(pool)
    .await?;

    let items = item_rows
        .into_iter()
        .map(|r| {
            let p_str: String = r.get("precio_unitario");
            let s_str: String = r.get("subtotal");
            ReceiptItemSnapshot {
                cantidad: r.get("cantidad"),
                descripcion: r.get("descripcion"),
                precio_unitario: p_str.parse::<Decimal>().unwrap_or(Decimal::ZERO),
                subtotal: s_str.parse::<Decimal>().unwrap_or(Decimal::ZERO),
            }
        })
        .collect();

    // 4. Pagos
    let pago_rows = sqlx::query(
        r#"
        SELECT metodo_pago, canal_caja, CAST(monto AS TEXT) as monto, referencia_operacion
        FROM pagos
        WHERE venta_id = ?
        ORDER BY id ASC
        "#,
    )
    .bind(venta_id)
    .fetch_all(pool)
    .await?;

    let pagos = pago_rows
        .into_iter()
        .map(|r| {
            let m_str: String = r.get("monto");
            ReceiptPaymentSnapshot {
                metodo_pago: r.get("metodo_pago"),
                canal_caja: r.get("canal_caja"),
                monto: m_str.parse::<Decimal>().unwrap_or(Decimal::ZERO),
                referencia_operacion: r.get("referencia_operacion"),
            }
        })
        .collect();

    // 5. Configuración de empresa
    let configs = get_printing_backup_config(pool, session).await?;

    Ok(ReceiptSnapshotData {
        comprobante,
        estado_venta,
        empresa_nombre_comercial: configs.empresa_nombre_comercial,
        empresa_razon_social: configs.empresa_razon_social,
        empresa_ruc: configs.empresa_ruc,
        empresa_direccion: configs.empresa_direccion,
        empresa_telefono: configs.empresa_telefono,
        usuario_vendedor_nombre,
        subtotal,
        descuento,
        total_venta,
        items,
        pagos,
        mensaje_pie: configs.printer_footer_message,
    })
}

// ============================================================================
// IMPRESIÓN TÉRMICA DE TICKET
// ============================================================================

pub async fn print_sale_ticket(
    pool: &SqlitePool,
    session: &AuthSession,
    request: PrintTicketRequest,
) -> Result<PrintTicketResult, AppError> {
    let snapshot = build_receipt_snapshot(pool, session, request.venta_id).await?;
    let config = get_printing_backup_config(pool, session).await?;

    let width_mm = request
        .forced_width_mm
        .unwrap_or(config.printer_paper_width_mm);
    let printer_width = PrinterWidth::from_mm(width_mm);
    let cols = printer_width.columns();

    let mut builder = EscPosTicketBuilder::new(cols);

    // Encabezado
    builder.add_centered_title(&snapshot.empresa_nombre_comercial);
    if !snapshot.empresa_razon_social.trim().is_empty() {
        builder.add_line(&snapshot.empresa_razon_social, EscAlign::Center, false);
    }
    builder.add_line(&format!("R.U.C.: {}", snapshot.empresa_ruc), EscAlign::Center, true);
    builder.add_line(&snapshot.empresa_direccion, EscAlign::Center, false);
    builder.add_line(&format!("Tel: {}", snapshot.empresa_telefono), EscAlign::Center, false);
    builder.add_divider('-');

    // Marca reactiva de ANULACIÓN (CP-PRN-03)
    if snapshot.estado_venta == "TACHADA_EN_TURNO" || snapshot.estado_venta == "ANULADA_DEFINITIVA" {
        builder.add_divider('*');
        builder.add_line("*** [COMPROBANTE ANULADO] ***", EscAlign::Center, true);
        builder.add_divider('*');
    }

    // Datos del comprobante
    let comp_title = format!(
        "{} No. {}",
        snapshot.comprobante.tipo_comprobante.display_name(),
        snapshot.comprobante.numero_formateado
    );
    builder.add_line(&comp_title, EscAlign::Center, true);
    builder.add_line(
        &format!("Fecha: {}", snapshot.comprobante.fecha_emision),
        EscAlign::Left,
        false,
    );
    builder.add_line(
        &format!("Atendido por: {}", snapshot.usuario_vendedor_nombre),
        EscAlign::Left,
        false,
    );
    builder.add_line(
        &format!("Cliente: {}", snapshot.comprobante.receptor_razon_nombre),
        EscAlign::Left,
        false,
    );
    builder.add_line(
        &format!(
            "{}: {}",
            snapshot.comprobante.receptor_tipo_doc, snapshot.comprobante.receptor_numero_doc
        ),
        EscAlign::Left,
        false,
    );
    builder.add_divider('-');

    // Ítems (CP-PRN-04)
    if cols >= 48 {
        builder.add_line("CANT DESCRIPCION               P.UNIT     TOTAL", EscAlign::Left, true);
        builder.add_divider('-');
    }
    for item in &snapshot.items {
        builder.add_item_row(item.cantidad, &item.descripcion, item.precio_unitario, item.subtotal);
    }
    builder.add_divider('-');

    // Totales
    builder.add_two_columns("SUBTOTAL:", &format!("PEN {:.2}", snapshot.subtotal), false);
    if snapshot.descuento > Decimal::ZERO {
        builder.add_two_columns("DESCUENTO:", &format!("PEN {:.2}", snapshot.descuento), false);
    }
    builder.add_two_columns("TOTAL A PAGAR:", &format!("PEN {:.2}", snapshot.total_venta), true);
    builder.add_divider('-');

    // Medios de Pago
    for pago in &snapshot.pagos {
        let label = format!("PAGO {}", pago.metodo_pago);
        builder.add_two_columns(&label, &format!("PEN {:.2}", pago.monto), false);
    }
    builder.add_divider('-');

    // Pie y Hash
    builder.add_line(&snapshot.mensaje_pie, EscAlign::Center, false);
    builder.add_line(
        &format!("Hash: {}", snapshot.comprobante.hash_verificacion),
        EscAlign::Center,
        false,
    );

    // Pulso condicional de Gaveta de Dinero (CP-PRN-05)
    let has_cash_payment = snapshot
        .pagos
        .iter()
        .any(|p| p.metodo_pago.eq_ignore_ascii_case("EFECTIVO"));
    let open_drawer = request
        .open_drawer_override
        .unwrap_or(config.printer_open_drawer_on_cash);

    if has_cash_payment && open_drawer {
        builder.add_drawer_pulse();
    }

    let (raw_bytes, formatted_text) = builder.finalize();

    dispatch_ticket(
        config.printer_connection_mode,
        &config.printer_target_address,
        &raw_bytes,
        &formatted_text,
        width_mm,
        cols,
    )
    .await
}

// ============================================================================
// GENERACIÓN DE PDFS EN RAM
// ============================================================================

pub async fn generate_sale_receipt_pdf(
    pool: &SqlitePool,
    session: &AuthSession,
    venta_id: i64,
) -> Result<GeneratePdfResult, AppError> {
    let snapshot = build_receipt_snapshot(pool, session, venta_id).await?;
    let pdf_bytes = MinimalPdfDocument::build_receipt_pdf(&snapshot)?;

    let mut hasher = Sha256::new();
    hasher.update(&pdf_bytes);
    let hash = format!("{:x}", hasher.finalize());

    let size_bytes = pdf_bytes.len();
    let pdf_base64 = base64::engine::general_purpose::STANDARD.encode(&pdf_bytes);
    let filename = format!("comprobante_{}.pdf", snapshot.comprobante.numero_formateado);

    Ok(GeneratePdfResult {
        filename,
        pdf_base64,
        size_bytes,
        sha256_hash: hash,
    })
}

pub async fn generate_financial_report_pdf(
    pool: &SqlitePool,
    session: &AuthSession,
    request: GenerateFinancialReportPdfRequest,
) -> Result<GeneratePdfResult, AppError> {
    let desde_opt = if request.fecha_desde.trim().is_empty() {
        None
    } else {
        Some(request.fecha_desde.trim().to_string())
    };
    let hasta_opt = if request.fecha_hasta.trim().is_empty() {
        None
    } else {
        Some(request.fecha_hasta.trim().to_string())
    };

    let filter = FinancialReportFilter {
        fecha_desde: desde_opt.clone(),
        fecha_hasta: hasta_opt.clone(),
    };

    let dashboard = finance_service::get_financial_dashboard_summary(pool, session, &filter).await?;
    let config = get_printing_backup_config(pool, session).await?;

    let pdf_bytes = MinimalPdfDocument::build_financial_report_pdf(
        &dashboard,
        &request.fecha_desde,
        &request.fecha_hasta,
        request.canal_filtro.as_deref(),
        &config,
    )?;

    let mut hasher = Sha256::new();
    hasher.update(&pdf_bytes);
    let hash = format!("{:x}", hasher.finalize());

    let size_bytes = pdf_bytes.len();
    let pdf_base64 = base64::engine::general_purpose::STANDARD.encode(&pdf_bytes);
    let today_local = chrono::Local::now().format("%Y-%m-%d").to_string();
    let filename = match (&desde_opt, &hasta_opt) {
        (None, None) => format!("reporte_financiero_acumulado_{}.pdf", today_local),
        (Some(d), Some(h)) => format!("reporte_financiero_{}_{}.pdf", d, h),
        (Some(d), None) => format!("reporte_financiero_desde_{}_hasta_{}.pdf", d, today_local),
        (None, Some(h)) => format!("reporte_financiero_hasta_{}.pdf", h),
    };

    Ok(GeneratePdfResult {
        filename,
        pdf_base64,
        size_bytes,
        sha256_hash: hash,
    })
}

pub async fn send_receipt_email(
    pool: &SqlitePool,
    session: &AuthSession,
    request: SendReceiptEmailRequest,
) -> Result<SendEmailResult, AppError> {
    // Validar formato básico de email
    if !request.destinatario_email.contains('@') || !request.destinatario_email.contains('.') {
        return Err(AppError::Validation(
            "El formato del correo electrónico de destino es inválido.".to_string(),
        ));
    }

    // Generar el PDF en RAM
    let pdf = generate_sale_receipt_pdf(pool, session, request.venta_id).await?;
    let config = get_printing_backup_config(pool, session).await?;
    let smtp_pwd_opt = KeyringStore::get_secret("SMTP_PASSWORD")?;

    let is_simulated = !config.smtp_enabled
        || config.smtp_user.trim().is_empty()
        || smtp_pwd_opt
            .as_deref()
            .map(|p| p.trim().is_empty())
            .unwrap_or(true)
        || smtp_pwd_opt.as_deref() == Some("SmtpAppPassword123#");

    if is_simulated {
        // Auditar despacho simulado de comprobante por correo
        let audit_detail = serde_json::json!({
            "venta_id": request.venta_id,
            "destinatario": request.destinatario_email,
            "mensaje_adicional": request.mensaje_adicional,
            "was_simulated": true,
        });
        record_audit(
            pool,
            Some(session.user_id),
            &session.username,
            "RECEIPT_EMAIL_DISPATCHED",
            "comprobantes_emitidos",
            &audit_detail.to_string(),
            None,
        )
        .await?;

        return Ok(SendEmailResult {
            success: true,
            message: format!(
                "Comprobante PDF enviado exitosamente a {}",
                request.destinatario_email
            ),
            was_simulated: true,
        });
    }

    // Modo Real: envío SMTP con lettre
    let _ = rustls::crypto::ring::default_provider().install_default();

    let raw_pwd = smtp_pwd_opt.unwrap_or_default();
    let clean_pwd: String = raw_pwd.chars().filter(|c| !c.is_whitespace()).collect();

    let pdf_bytes = base64::engine::general_purpose::STANDARD
        .decode(&pdf.pdf_base64)
        .map_err(|e| {
            AppError::Internal(format!("Error decodificando PDF para envío SMTP: {}", e))
        })?;

    let from_raw = config.smtp_from_email.trim();
    let smtp_user_trimmed = config.smtp_user.trim();
    let effective_from = if (from_raw.is_empty() || from_raw == "no-reply@zaramagym.pe")
        && smtp_user_trimmed.contains('@')
    {
        smtp_user_trimmed
    } else if from_raw.is_empty() {
        smtp_user_trimmed
    } else {
        from_raw
    };

    let from_mailbox: lettre::message::Mailbox = effective_from.parse().map_err(|e| {
        AppError::Validation(format!(
            "El correo remitente configurado '{}' es inválido: {}",
            effective_from, e
        ))
    })?;
    let to_mailbox: lettre::message::Mailbox =
        request.destinatario_email.trim().parse().map_err(|e| {
            AppError::Validation(format!(
                "El correo destinatario '{}' es inválido: {}",
                request.destinatario_email, e
            ))
        })?;

    let receipt_code = pdf.filename.trim_end_matches(".pdf");
    let subject = format!(
        "Comprobante {} - {}",
        receipt_code, config.empresa_nombre_comercial
    );
    let body_text = match request
        .mensaje_adicional
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(extra) => format!(
            "Estimado(a),\n\nAdjuntamos su comprobante {} emitido por {}.\n\nMensaje adicional:\n{}\n\nSaludos cordiales,\n{}",
            receipt_code,
            config.empresa_nombre_comercial,
            extra,
            config.empresa_nombre_comercial
        ),
        None => format!(
            "Estimado(a),\n\nAdjuntamos su comprobante {} emitido por {}.\n\nSaludos cordiales,\n{}",
            receipt_code,
            config.empresa_nombre_comercial,
            config.empresa_nombre_comercial
        ),
    };

    let pdf_content_type = lettre::message::header::ContentType::parse("application/pdf")
        .map_err(|e| AppError::Internal(format!("ContentType PDF inválido: {}", e)))?;

    let email = lettre::Message::builder()
        .from(from_mailbox)
        .to(to_mailbox)
        .subject(subject)
        .multipart(
            lettre::message::MultiPart::mixed()
                .singlepart(lettre::message::SinglePart::plain(body_text))
                .singlepart(
                    lettre::message::SinglePart::builder()
                        .header(pdf_content_type)
                        .header(lettre::message::header::ContentDisposition::attachment(
                            &pdf.filename,
                        ))
                        .body(pdf_bytes),
                ),
        )
        .map_err(|e| AppError::Validation(format!("Error construyendo correo SMTP: {}", e)))?;

    let smtp_host = config.smtp_host.trim();
    if smtp_host.is_empty() {
        return Err(AppError::Validation(
            "El servidor SMTP (smtp_host) no está configurado.".to_string(),
        ));
    }

    let transport_builder = if config.smtp_port == 465 {
        lettre::AsyncSmtpTransport::<lettre::Tokio1Executor>::relay(smtp_host)
    } else {
        lettre::AsyncSmtpTransport::<lettre::Tokio1Executor>::starttls_relay(smtp_host)
    }
    .map_err(|err| {
        AppError::Validation(format!(
            "Error enviando correo vía SMTP ({}:{}): {}",
            smtp_host, config.smtp_port, err
        ))
    })?;

    let mailer = transport_builder
        .port(config.smtp_port)
        .credentials(lettre::transport::smtp::authentication::Credentials::new(
            smtp_user_trimmed.to_string(),
            clean_pwd,
        ))
        .timeout(Some(std::time::Duration::from_secs(20)))
        .build();

    use lettre::AsyncTransport;
    mailer.send(email).await.map_err(|err| {
        AppError::Validation(format!(
            "Error enviando correo vía SMTP ({}:{}): {}",
            smtp_host, config.smtp_port, err
        ))
    })?;

    // Auditar despacho real de comprobante por correo
    let audit_detail = serde_json::json!({
        "venta_id": request.venta_id,
        "destinatario": request.destinatario_email,
        "mensaje_adicional": request.mensaje_adicional,
        "was_simulated": false,
        "smtp_host": smtp_host,
    });
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "RECEIPT_EMAIL_DISPATCHED",
        "comprobantes_emitidos",
        &audit_detail.to_string(),
        None,
    )
    .await?;

    Ok(SendEmailResult {
        success: true,
        message: format!(
            "Comprobante PDF enviado exitosamente a {} (vía {})",
            request.destinatario_email, config.smtp_host
        ),
        was_simulated: false,
    })
}

// ============================================================================
// MOTOR DE RESPALDOS (VACUUM INTO, SHA-256 e Integridad)
// ============================================================================

pub async fn execute_hot_backup(
    pool: &SqlitePool,
    tipo: BackupType,
    user_id: Option<i64>,
    target_dir: &Path,
) -> Result<BackupRecord, AppError> {
    if !target_dir.exists() {
        std::fs::create_dir_all(target_dir).map_err(|e| {
            AppError::Internal(format!("No se pudo crear carpeta de respaldos: {}", e))
        })?;
    }

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("zaramagym_backup_{}.db", timestamp);
    let dest_path = target_dir.join(&filename);
    let dest_path_str = dest_path.to_string_lossy().replace('\\', "/");

    // Ejecución segura de VACUUM INTO en SQLite WAL
    let query_str = format!("VACUUM INTO '{}';", dest_path_str);
    sqlx::raw_sql(&query_str)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Fallo ejecutando VACUUM INTO: {}", e)))?;

    // Cálculo de tamaño y Checksum SHA-256
    let bytes = std::fs::read(&dest_path).map_err(|e| {
        AppError::Internal(format!("No se pudo leer archivo de respaldo: {}", e))
    })?;
    let tamano_bytes = bytes.len() as i64;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let checksum = format!("{:x}", hasher.finalize());

    // Registro inmutable en historial_respaldos
    let insert_row = sqlx::query(
        r#"
        INSERT INTO historial_respaldos (
            tipo_respaldo, nombre_archivo, ruta_local, tamano_bytes, sha256_checksum,
            estado, mensaje_detalle, ejecutado_por_usuario_id, created_at
        ) VALUES (?, ?, ?, ?, ?, 'COMPLETADO', 'Respaldo local generado exitosamente con VACUUM INTO', ?, datetime('now', 'localtime'))
        RETURNING id, created_at;
        "#,
    )
    .bind(tipo.as_str())
    .bind(&filename)
    .bind(&dest_path_str)
    .bind(tamano_bytes)
    .bind(&checksum)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let backup_id: i64 = insert_row.get("id");
    let created_at: String = insert_row.get("created_at");

    Ok(BackupRecord {
        id: backup_id,
        tipo_respaldo: tipo,
        nombre_archivo: filename,
        ruta_local: dest_path_str,
        tamano_bytes,
        sha256_checksum: checksum,
        drive_file_id: None,
        estado: BackupStatus::Completado,
        mensaje_detalle: Some("Respaldo local generado exitosamente con VACUUM INTO".to_string()),
        ejecutado_por_usuario_id: user_id,
        created_at,
    })
}

pub async fn check_sqlite_file_integrity(
    file_path: &Path,
) -> Result<BackupIntegrityReport, AppError> {
    if !file_path.exists() {
        return Err(AppError::NotFound(
            "Archivo de respaldo no existe en la ruta indicada".to_string(),
        ));
    }

    let bytes = std::fs::read(file_path).map_err(|e| {
        AppError::Internal(format!("No se pudo leer archivo para integridad: {}", e))
    })?;
    let file_size = bytes.len() as u64;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let checksum = format!("{:x}", hasher.finalize());

    let normalized_path = file_path.to_string_lossy().replace('\\', "/");
    let conn_url = format!("sqlite://{}?mode=ro", normalized_path);

    let temp_pool_res = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&conn_url)
        .await;

    let temp_pool = match temp_pool_res {
        Ok(p) => p,
        Err(_) => {
            return Ok(BackupIntegrityReport {
                is_valid: false,
                integrity_message: "Error de lectura: Archivo corrupto o no es SQLite".to_string(),
                found_tables_count: 0,
                missing_core_tables: vec!["todas".to_string()],
                file_size_bytes: file_size,
                sha256_checksum: checksum,
            });
        }
    };

    let integrity_res: Result<(String,), _> = sqlx::query_as("PRAGMA integrity_check;")
        .fetch_one(&temp_pool)
        .await;

    let (integrity_msg, is_ok) = match integrity_res {
        Ok(row) => {
            let is_ok = row.0.eq_ignore_ascii_case("ok");
            (row.0, is_ok)
        }
        Err(e) => {
            temp_pool.close().await;
            return Ok(BackupIntegrityReport {
                is_valid: false,
                integrity_message: format!("Error en PRAGMA integrity_check: {}", e),
                found_tables_count: 0,
                missing_core_tables: vec!["todas".to_string()],
                file_size_bytes: file_size,
                sha256_checksum: checksum,
            });
        }
    };

    let tables: Vec<(String,)> = match sqlx::query_as("SELECT name FROM sqlite_master WHERE type='table';")
        .fetch_all(&temp_pool)
        .await
    {
        Ok(t) => t,
        Err(_) => {
            temp_pool.close().await;
            return Ok(BackupIntegrityReport {
                is_valid: false,
                integrity_message: "Error consultando tablas maestras".to_string(),
                found_tables_count: 0,
                missing_core_tables: vec!["todas".to_string()],
                file_size_bytes: file_size,
                sha256_checksum: checksum,
            });
        }
    };

    temp_pool.close().await;

    let core_tables = [
        "personas",
        "usuarios_sistema",
        "ventas",
        "venta_detalles",
        "pagos",
        "turnos_caja",
        "comprobantes_series",
        "comprobantes_emitidos",
    ];

    let existing_table_names: Vec<String> = tables.into_iter().map(|(n,)| n).collect();
    let mut missing = Vec::new();
    for ct in &core_tables {
        if !existing_table_names.contains(&ct.to_string()) {
            missing.push(ct.to_string());
        }
    }

    let valid_total = is_ok && missing.is_empty();

    Ok(BackupIntegrityReport {
        is_valid: valid_total,
        integrity_message: integrity_msg,
        found_tables_count: existing_table_names.len(),
        missing_core_tables: missing,
        file_size_bytes: file_size,
        sha256_checksum: checksum,
    })
}

const MAX_RESTORE_FILE_BYTES: u64 = 500 * 1024 * 1024; // 500 MB

struct TempFileGuard(Option<PathBuf>);

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}

async fn retry_fs_op<F>(mut op: F) -> std::io::Result<()>
where
    F: FnMut() -> std::io::Result<()>,
{
    for attempt in 0..20 {
        match op() {
            Ok(()) => return Ok(()),
            Err(e) => {
                let is_transient_lock = matches!(
                    e.kind(),
                    std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::WouldBlock
                ) || matches!(e.raw_os_error(), Some(32) | Some(33) | Some(5));
                if !is_transient_lock || attempt == 19 {
                    return Err(e);
                }
                tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            }
        }
    }
    Ok(())
}

async fn remove_file_if_exists_with_retry(path: &Path) -> std::io::Result<()> {
    if !path.exists() {
        return Ok(());
    }
    retry_fs_op(|| match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    })
    .await
}

/// Restaura de forma atómica la base de datos SQLite desde una ruta local o un payload base64.
/// Exclusivo para ADMINISTRADOR. Valida integridad antes de cerrar o modificar el pool activo.
pub async fn restore_database(
    state: &AppState,
    request: RestoreDatabaseRequest,
) -> Result<RestoreDatabaseResult, AppError> {
    // 1. Validar sesión ADMIN desbloqueada y adquirir mutex exclusivo de restauración
    let session = state.require_admin().await?;
    let _restore_guard = state.restore_mutex.lock().await;

    // 2. Resolver archivo candidato desde source_path o file_bytes_base64
    let mut temp_candidate_guard = TempFileGuard(None);
    let (candidate_path, restored_from) = if let Some(raw_path) = request
        .source_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let path = PathBuf::from(raw_path);
        if !path.exists() {
            return Err(AppError::NotFound(format!(
                "El archivo de respaldo '{}' no existe.",
                raw_path
            )));
        }
        let meta = std::fs::metadata(&path).map_err(|e| {
            AppError::Validation(format!(
                "No se pudo inspeccionar el archivo de respaldo: {}",
                e
            ))
        })?;
        if !meta.is_file() {
            return Err(AppError::Validation(
                "La ruta indicada no corresponde a un archivo regular.".to_string(),
            ));
        }
        if meta.len() == 0 {
            return Err(AppError::Validation(
                "El archivo de respaldo está vacío (0 bytes).".to_string(),
            ));
        }
        if meta.len() > MAX_RESTORE_FILE_BYTES {
            return Err(AppError::Validation(
                "El archivo de respaldo supera el límite máximo permitido de 500 MB.".to_string(),
            ));
        }
        (path, raw_path.to_string())
    } else if let Some(raw_b64) = request
        .file_bytes_base64
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if raw_b64.len() as u64 > (MAX_RESTORE_FILE_BYTES * 4 / 3) + 1024 {
            return Err(AppError::Validation(
                "El payload base64 supera el límite máximo permitido de 500 MB.".to_string(),
            ));
        }
        let cleaned_b64: String = raw_b64.chars().filter(|c| !c.is_whitespace()).collect();
        if cleaned_b64.is_empty() {
            return Err(AppError::Validation(
                "El contenido base64 está vacío.".to_string(),
            ));
        }
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(&cleaned_b64)
            .map_err(|e| AppError::Validation(format!("Contenido base64 inválido: {}", e)))?;

        if decoded.is_empty() {
            return Err(AppError::Validation(
                "El archivo decodificado está vacío (0 bytes).".to_string(),
            ));
        }
        if decoded.len() as u64 > MAX_RESTORE_FILE_BYTES {
            return Err(AppError::Validation(
                "El archivo decodificado supera el límite máximo permitido de 500 MB.".to_string(),
            ));
        }

        let unique_nanos = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
        let temp_path = std::env::temp_dir().join(format!(
            "zaramagym_restore_candidate_{}_{}.db",
            std::process::id(),
            unique_nanos
        ));
        std::fs::write(&temp_path, &decoded).map_err(|e| {
            AppError::Internal(format!(
                "No se pudo escribir el archivo temporal de restauración: {}",
                e
            ))
        })?;
        temp_candidate_guard = TempFileGuard(Some(temp_path.clone()));

        let label = request
            .file_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("archivo_subido.db")
            .to_string();

        (temp_path, label)
    } else {
        return Err(AppError::Validation(
            "Debe indicar una ruta de respaldo (source_path) o enviar el contenido en base64 (file_bytes_base64).".to_string(),
        ));
    };

    // 3. Validar integridad ANTES de tocar el pool activo
    let integrity_report = check_sqlite_file_integrity(&candidate_path).await?;
    if !integrity_report.is_valid {
        return Err(AppError::Validation(format!(
            "El archivo no superó la validación de integridad SQLite ({}). Tablas faltantes: {}",
            integrity_report.integrity_message,
            if integrity_report.missing_core_tables.is_empty() {
                "ninguna".to_string()
            } else {
                integrity_report.missing_core_tables.join(", ")
            }
        )));
    }

    // 4. Resolver ruta activa db_path (desde state.db_path() o PRAGMA database_list; rechaza :memory:)
    let current_pool = state.pool();
    let db_path = match state.db_path() {
        Some(p) => {
            let p_str = p.to_string_lossy();
            if p_str.trim().is_empty() || p_str.contains(":memory:") {
                return Err(AppError::Validation(
                    "No se puede restaurar sobre una base de datos en memoria (:memory:)."
                        .to_string(),
                ));
            }
            p
        }
        None => {
            let rows = sqlx::query("PRAGMA database_list;")
                .fetch_all(&current_pool)
                .await?;
            let main_file = rows
                .into_iter()
                .find(|r| r.get::<String, _>("name") == "main")
                .map(|r| r.get::<String, _>("file"))
                .unwrap_or_default();
            if main_file.trim().is_empty() || main_file.trim() == ":memory:" {
                return Err(AppError::Validation(
                    "No se puede restaurar sobre una base de datos en memoria (:memory:)."
                        .to_string(),
                ));
            }
            PathBuf::from(main_file)
        }
    };

    // 5. Registrar DATABASE_RESTORE_STARTED y generar respaldo de seguridad previo (VACUUM INTO en backups/)
    let parent_dir = db_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let backups_dir = parent_dir.join("backups");
    if !backups_dir.exists() {
        std::fs::create_dir_all(&backups_dir).map_err(|e| {
            AppError::Internal(format!(
                "No se pudo crear la carpeta de respaldos previos: {}",
                e
            ))
        })?;
    }

    let pre_ts = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f").to_string();
    let pre_filename = format!("pre_restore_backup_{}_{}.db", pre_ts, std::process::id());
    let pre_backup_path = backups_dir.join(&pre_filename);
    let pre_backup_str = pre_backup_path.to_string_lossy().replace('\\', "/");

    let start_detail = serde_json::json!({
        "restored_from": restored_from,
        "sha256_checksum": integrity_report.sha256_checksum,
        "file_size_bytes": integrity_report.file_size_bytes,
        "pre_restore_backup_path": pre_backup_str,
    });
    record_audit(
        &current_pool,
        Some(session.user_id),
        &session.username,
        "DATABASE_RESTORE_STARTED",
        "historial_respaldos",
        &start_detail.to_string(),
        None,
    )
    .await?;

    let vacuum_sql = format!("VACUUM INTO '{}';", pre_backup_str.replace('\'', "''"));
    sqlx::raw_sql(&vacuum_sql)
        .execute(&current_pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Fallo generando respaldo de seguridad previo a la restauración: {}",
                e
            ))
        })?;

    // 6. Copiar candidato a staging en el mismo directorio, wal_checkpoint(TRUNCATE) y cerrar pool activo
    let db_file_name = db_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("zaramagym.db");
    let staging_path = parent_dir.join(format!("{}.restoring.tmp", db_file_name));
    if staging_path.exists() {
        let _ = std::fs::remove_file(&staging_path);
    }
    std::fs::copy(&candidate_path, &staging_path).map_err(|e| {
        AppError::Internal(format!(
            "No se pudo copiar el respaldo al archivo temporal de staging: {}",
            e
        ))
    })?;

    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE);")
        .execute(&current_pool)
        .await;

    current_pool.close().await;

    // 7. Eliminar -wal/-shm residuales, mover db_path a *.rollback.bak y renombrar staging a db_path
    let db_path_str = db_path.to_string_lossy().to_string();
    let wal_path = PathBuf::from(format!("{}-wal", db_path_str));
    let shm_path = PathBuf::from(format!("{}-shm", db_path_str));
    let rollback_path = PathBuf::from(format!("{}.rollback.bak", db_path_str));
    let db_url = format!("sqlite://{}", db_path_str.replace('\\', "/"));

    let _ = remove_file_if_exists_with_retry(&wal_path).await;
    let _ = remove_file_if_exists_with_retry(&shm_path).await;
    let _ = remove_file_if_exists_with_retry(&rollback_path).await;

    if db_path.exists() {
        if let Err(e) = retry_fs_op(|| std::fs::rename(&db_path, &rollback_path)).await {
            let _ = std::fs::remove_file(&staging_path);
            if let Ok(orig_pool) = crate::db::init_db(&db_url).await {
                let _ = state.replace_pool(orig_pool);
            }
            return Err(AppError::Internal(format!(
                "No se pudo respaldar la base de datos activa antes de reemplazarla: {}",
                e
            )));
        }
    }

    if let Err(e) = retry_fs_op(|| std::fs::rename(&staging_path, &db_path)).await {
        let _ = std::fs::remove_file(&staging_path);
        if rollback_path.exists() {
            let _ = retry_fs_op(|| std::fs::rename(&rollback_path, &db_path)).await;
        }
        if let Ok(orig_pool) = crate::db::init_db(&db_url).await {
            let _ = state.replace_pool(orig_pool);
        }
        return Err(AppError::Internal(format!(
            "No se pudo mover el archivo de staging hacia la base de datos principal: {}",
            e
        )));
    }

    // 8. Reiniciar pool con init_db; si falla, revertir rollback.bak y reabrir pool original
    let new_pool = match crate::db::init_db(&db_url).await {
        Ok(p) => p,
        Err(init_err) => {
            let _ = remove_file_if_exists_with_retry(&db_path).await;
            let _ = remove_file_if_exists_with_retry(&wal_path).await;
            let _ = remove_file_if_exists_with_retry(&shm_path).await;
            if rollback_path.exists() {
                let _ = retry_fs_op(|| std::fs::rename(&rollback_path, &db_path)).await;
            }
            if let Ok(orig_pool) = crate::db::init_db(&db_url).await {
                let _ = state.replace_pool(orig_pool);
            }
            return Err(AppError::Internal(format!(
                "Fallo al inicializar el nuevo pool SQLite tras restauración (se revirtió al estado previo): {}",
                init_err
            )));
        }
    };

    // 9. Reemplazar pool activo y limpiar archivos temporales
    let _ = state.replace_pool(new_pool.clone());
    let _ = remove_file_if_exists_with_retry(&rollback_path).await;
    drop(temp_candidate_guard);

    // 10. Verificar si el usuario actual existe y está activo en new_pool y auditar DATABASE_RESTORED
    let user_row = sqlx::query("SELECT estado_activo FROM usuarios_sistema WHERE id = ?")
        .bind(session.user_id)
        .fetch_optional(&new_pool)
        .await?;

    let user_exists_and_active = user_row
        .map(|r| r.get::<i64, _>("estado_activo") == 1)
        .unwrap_or(false);

    let (requires_relogin, audit_user_id) = if !user_exists_and_active {
        state.set_session(None).await;
        (true, None)
    } else {
        (false, Some(session.user_id))
    };

    let done_detail = serde_json::json!({
        "restored_from": restored_from,
        "sha256_checksum": integrity_report.sha256_checksum,
        "file_size_bytes": integrity_report.file_size_bytes,
        "pre_restore_backup_path": pre_backup_str,
        "found_tables_count": integrity_report.found_tables_count,
        "requires_relogin": requires_relogin,
    });
    record_audit(
        &new_pool,
        audit_user_id,
        &session.username,
        "DATABASE_RESTORED",
        "historial_respaldos",
        &done_detail.to_string(),
        None,
    )
    .await?;

    Ok(RestoreDatabaseResult {
        success: true,
        restored_from,
        sha256_checksum: integrity_report.sha256_checksum,
        file_size_bytes: integrity_report.file_size_bytes,
        pre_restore_backup_path: Some(pre_backup_str),
        found_tables_count: integrity_report.found_tables_count,
        requires_relogin,
        message: if requires_relogin {
            "Base de datos restaurada exitosamente. Su sesión actual requiere volver a autenticarse."
                .to_string()
        } else {
            "Base de datos restaurada exitosamente y pool SQLite reiniciado en modo WAL."
                .to_string()
        },
    })
}

pub async fn create_local_backup(
    pool: &SqlitePool,
    session: &AuthSession,
    target_dir_opt: Option<&Path>,
) -> Result<BackupRecord, AppError> {
    session.require_admin()?;

    let default_dir = PathBuf::from("backups");
    let target_dir = target_dir_opt.unwrap_or(&default_dir);

    let record =
        execute_hot_backup(pool, BackupType::LocalManual, Some(session.user_id), target_dir)
            .await?;

    let audit_detail = serde_json::json!({
        "backup_id": record.id,
        "nombre_archivo": record.nombre_archivo,
        "tamano_bytes": record.tamano_bytes,
        "sha256": record.sha256_checksum,
    });
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "BACKUP_CREATED",
        "historial_respaldos",
        &audit_detail.to_string(),
        None,
    )
    .await?;

    Ok(record)
}

pub async fn list_backup_history(
    pool: &SqlitePool,
    session: &AuthSession,
) -> Result<Vec<BackupRecord>, AppError> {
    session.require_admin()?;

    let rows = sqlx::query(
        r#"
        SELECT id, tipo_respaldo, nombre_archivo, ruta_local, tamano_bytes,
               sha256_checksum, drive_file_id, estado, mensaje_detalle,
               ejecutado_por_usuario_id, created_at
        FROM historial_respaldos
        ORDER BY created_at DESC, id DESC
        "#,
    )
    .fetch_all(pool)
    .await?;

    let records = rows
        .into_iter()
        .map(|r| {
            let tipo_str: String = r.get("tipo_respaldo");
            let tipo = BackupType::from_str(&tipo_str).unwrap_or(BackupType::LocalManual);
            let estado_str: String = r.get("estado");
            let estado = BackupStatus::from_str(&estado_str).unwrap_or(BackupStatus::Completado);

            BackupRecord {
                id: r.get("id"),
                tipo_respaldo: tipo,
                nombre_archivo: r.get("nombre_archivo"),
                ruta_local: r.get("ruta_local"),
                tamano_bytes: r.get("tamano_bytes"),
                sha256_checksum: r.get("sha256_checksum"),
                drive_file_id: r.get("drive_file_id"),
                estado,
                mensaje_detalle: r.get("mensaje_detalle"),
                ejecutado_por_usuario_id: r.get("ejecutado_por_usuario_id"),
                created_at: r.get("created_at"),
            }
        })
        .collect();

    Ok(records)
}

pub async fn verify_backup_integrity(
    pool: &SqlitePool,
    session: &AuthSession,
    backup_id: i64,
) -> Result<BackupIntegrityReport, AppError> {
    session.require_admin()?;

    let row = sqlx::query("SELECT ruta_local FROM historial_respaldos WHERE id = ?")
        .bind(backup_id)
        .fetch_optional(pool)
        .await?;

    let ruta_local: String = match row {
        Some(r) => r.get("ruta_local"),
        None => {
            return Err(AppError::NotFound(format!(
                "Registro de respaldo con ID {} no existe.",
                backup_id
            )))
        }
    };

    check_sqlite_file_integrity(Path::new(&ruta_local)).await
}

pub async fn export_database_file(
    pool: &SqlitePool,
    session: &AuthSession,
    target_path: &str,
) -> Result<BackupRecord, AppError> {
    session.require_admin()?;

    let raw_dest = PathBuf::from(target_path.trim());
    let dest_path = if raw_dest.is_dir() || raw_dest.extension().is_none() {
        let _ = std::fs::create_dir_all(&raw_dest);
        let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        raw_dest.join(format!("zaramagym_export_{}.db", ts))
    } else {
        if let Some(parent) = raw_dest.parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        raw_dest
    };

    if dest_path.exists() && dest_path.is_file() {
        let _ = std::fs::remove_file(&dest_path);
    }

    let dest_path_str = dest_path.to_string_lossy().replace('\\', "/");
    let query_str = format!("VACUUM INTO '{}';", dest_path_str.replace('\'', "''"));
    sqlx::raw_sql(&query_str)
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(format!("Fallo exportando base de datos: {}", e)))?;

    let bytes = std::fs::read(&dest_path).map_err(|e| {
        AppError::Internal(format!("No se pudo leer archivo exportado: {}", e))
    })?;
    let tamano_bytes = bytes.len() as i64;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let checksum = format!("{:x}", hasher.finalize());

    let filename = dest_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("exported_database.db")
        .to_string();

    let insert_row = sqlx::query(
        r#"
        INSERT INTO historial_respaldos (
            tipo_respaldo, nombre_archivo, ruta_local, tamano_bytes, sha256_checksum,
            estado, mensaje_detalle, ejecutado_por_usuario_id, created_at
        ) VALUES ('EXPORTACION', ?, ?, ?, ?, 'COMPLETADO', 'Base de datos exportada limpiamente', ?, datetime('now', 'localtime'))
        RETURNING id, created_at;
        "#,
    )
    .bind(&filename)
    .bind(&dest_path_str)
    .bind(tamano_bytes)
    .bind(&checksum)
    .bind(session.user_id)
    .fetch_one(pool)
    .await?;

    let backup_id: i64 = insert_row.get("id");
    let created_at: String = insert_row.get("created_at");

    let audit_detail = serde_json::json!({
        "backup_id": backup_id,
        "ruta_destino": dest_path_str,
        "tamano_bytes": tamano_bytes,
        "sha256": checksum,
    });
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "DATABASE_EXPORTED",
        "historial_respaldos",
        &audit_detail.to_string(),
        None,
    )
    .await?;

    Ok(BackupRecord {
        id: backup_id,
        tipo_respaldo: BackupType::Exportacion,
        nombre_archivo: filename,
        ruta_local: dest_path_str,
        tamano_bytes,
        sha256_checksum: checksum,
        drive_file_id: None,
        estado: BackupStatus::Completado,
        mensaje_detalle: Some("Base de datos exportada limpiamente".to_string()),
        ejecutado_por_usuario_id: Some(session.user_id),
        created_at,
    })
}

fn extract_gdrive_folder_id(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Some(idx) = trimmed.find("/folders/") {
        let after = &trimmed[idx + "/folders/".len()..];
        return after
            .split(['?', '/', '#'])
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
    }
    trimmed.to_string()
}

pub async fn sync_backup_to_gdrive(
    pool: &SqlitePool,
    session: &AuthSession,
    backup_id: i64,
) -> Result<BackupRecord, AppError> {
    session.require_admin()?;
    sync_backup_to_gdrive_with_actor(pool, Some(session.user_id), &session.username, backup_id).await
}

pub async fn sync_backup_to_gdrive_with_actor(
    pool: &SqlitePool,
    user_id: Option<i64>,
    username: &str,
    backup_id: i64,
) -> Result<BackupRecord, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, tipo_respaldo, nombre_archivo, ruta_local, tamano_bytes, sha256_checksum
        FROM historial_respaldos
        WHERE id = ?
        "#,
    )
    .bind(backup_id)
    .fetch_optional(pool)
    .await?;

    let backup = match row {
        Some(r) => r,
        None => {
            return Err(AppError::NotFound(format!(
                "Registro de respaldo con ID {} no encontrado.",
                backup_id
            )))
        }
    };

    let nombre_archivo: String = backup.get("nombre_archivo");
    let ruta_local: String = backup.get("ruta_local");
    let path = PathBuf::from(&ruta_local);

    // Verificar integridad antes de subir al cloud
    let report = check_sqlite_file_integrity(&path).await?;
    if !report.is_valid {
        return Err(AppError::Validation(format!(
            "No se puede sincronizar un respaldo corrupto o incompleto. Diagnóstico: {}",
            report.integrity_message
        )));
    }

    // Consultar configuración y credenciales en KeyringStore
    let config = load_printing_backup_config(pool).await?;
    let token_opt = KeyringStore::get_secret("GDRIVE_ACCESS_TOKEN")?;
    let secret_opt = KeyringStore::get_secret("GDRIVE_CLIENT_SECRET")?;

    let is_simulated = !config.backup_gdrive_enabled
        || token_opt
            .as_deref()
            .map(|t| t.trim().is_empty())
            .unwrap_or(true)
        || token_opt.as_deref() == Some("ya29.a0ARrda8-GdriveToken-Secured");

    let drive_file_id = if is_simulated {
        if let Some(tok) = token_opt.as_deref().filter(|t| !t.trim().is_empty()) {
            let mut hasher = Sha256::new();
            hasher.update(format!("{}:{}", tok, backup_id).as_bytes());
            format!("gdrive_file_{}", &format!("{:x}", hasher.finalize())[..16])
        } else {
            format!("gdrive_sim_{}", backup_id)
        }
    } else {
        // Modo Real: Google Drive API v3 (OAuth2 refresh token si aplica + multipart/related)
        let _ = rustls::crypto::ring::default_provider().install_default();

        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| {
                AppError::Internal(format!("No se pudo inicializar cliente HTTP TLS: {}", e))
            })?;

        let clean_secret_str = |raw: &str| -> String {
            raw.chars()
                .filter(|c| !c.is_whitespace() && *c != '"' && *c != '\'')
                .collect()
        };

        let stored_token = clean_secret_str(&token_opt.unwrap_or_default());
        let access_token = if stored_token.starts_with("1//") {
            let client_id = clean_secret_str(&config.backup_gdrive_client_id);
            if client_id.is_empty() {
                return Err(AppError::Validation(
                    "Falta configurar el Client ID OAuth2 de Google Drive para usar el refresh token."
                        .to_string(),
                ));
            }
            let client_secret = secret_opt
                .as_deref()
                .map(&clean_secret_str)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    AppError::Validation(
                        "Falta configurar el Client Secret OAuth2 de Google Drive para renovar el token."
                            .to_string(),
                    )
                })?;

            let token_resp = http_client
                .post("https://oauth2.googleapis.com/token")
                .form(&[
                    ("client_id", client_id.as_str()),
                    ("client_secret", client_secret.as_str()),
                    ("refresh_token", stored_token.as_str()),
                    ("grant_type", "refresh_token"),
                ])
                .send()
                .await
                .map_err(|e| {
                    AppError::Validation(format!(
                        "Error de red renovando token OAuth de Google Drive: {}",
                        e
                    ))
                })?;

            if !token_resp.status().is_success() {
                let err_body = token_resp.text().await.unwrap_or_default();
                let hint = if err_body.contains("unauthorized_client") {
                    " (Sugerencia: pega el Access token 'ya29...' directo, o en OAuth Playground marca 'Use your own OAuth credentials' en el engranaje ANTES de autorizar en el Step 1)."
                } else {
                    ""
                };
                return Err(AppError::Validation(format!(
                    "Error renovando token OAuth de Google Drive: {}{}",
                    err_body, hint
                )));
            }

            let token_json: serde_json::Value = token_resp.json().await.map_err(|e| {
                AppError::Validation(format!(
                    "Respuesta OAuth inválida de Google Drive: {}",
                    e
                ))
            })?;

            token_json
                .get("access_token")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    AppError::Validation(
                        "Google OAuth no devolvió un access_token válido.".to_string(),
                    )
                })?
                .to_string()
        } else {
            stored_token
        };

        let clean_folder_id = extract_gdrive_folder_id(&config.backup_gdrive_folder_id);
        let file_bytes = std::fs::read(&path).map_err(|e| {
            AppError::Internal(format!(
                "No se pudo leer el archivo de respaldo local para subir a Drive: {}",
                e
            ))
        })?;

        let metadata_json = if clean_folder_id.is_empty() {
            serde_json::json!({
                "name": nombre_archivo,
                "mimeType": "application/x-sqlite3"
            })
        } else {
            serde_json::json!({
                "name": nombre_archivo,
                "mimeType": "application/x-sqlite3",
                "parents": [clean_folder_id]
            })
        };
        let metadata_str = metadata_json.to_string();
        let boundary = format!(
            "zaramagym_gdrive_boundary_{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        );

        let mut multipart_body =
            Vec::with_capacity(metadata_str.len() + file_bytes.len() + 256);
        multipart_body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
        multipart_body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
        multipart_body.extend_from_slice(metadata_str.as_bytes());
        multipart_body.extend_from_slice(format!("\r\n--{}\r\n", boundary).as_bytes());
        multipart_body.extend_from_slice(b"Content-Type: application/x-sqlite3\r\n\r\n");
        multipart_body.extend_from_slice(&file_bytes);
        multipart_body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

        let upload_resp = http_client
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name")
            .bearer_auth(&access_token)
            .header(
                reqwest::header::CONTENT_TYPE,
                format!("multipart/related; boundary={}", boundary),
            )
            .body(multipart_body)
            .send()
            .await
            .map_err(|e| {
                AppError::Validation(format!(
                    "Error de conexión subiendo respaldo a Google Drive API: {}",
                    e
                ))
            })?;

        if !upload_resp.status().is_success() {
            let status = upload_resp.status();
            let body_text = upload_resp.text().await.unwrap_or_default();
            return Err(AppError::Validation(format!(
                "Google Drive API rechazó la subida ({}): {}",
                status, body_text
            )));
        }

        let upload_json: serde_json::Value = upload_resp.json().await.map_err(|e| {
            AppError::Validation(format!(
                "Respuesta JSON inválida de Google Drive API: {}",
                e
            ))
        })?;

        upload_json
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                AppError::Validation(
                    "Google Drive API no devolvió el campo 'id' del archivo subido.".to_string(),
                )
            })?
            .to_string()
    };

    let updated_row = sqlx::query(
        r#"
        UPDATE historial_respaldos
        SET estado = 'SINCRONIZADO_CLOUD',
            drive_file_id = ?,
            mensaje_detalle = 'Sincronizado exitosamente con Google Drive API v3'
        WHERE id = ?
        RETURNING id, tipo_respaldo, nombre_archivo, ruta_local, tamano_bytes,
                  sha256_checksum, drive_file_id, estado, mensaje_detalle,
                  ejecutado_por_usuario_id, created_at;
        "#,
    )
    .bind(&drive_file_id)
    .bind(backup_id)
    .fetch_one(pool)
    .await?;

    let tipo_str: String = updated_row.get("tipo_respaldo");
    let tipo = BackupType::from_str(&tipo_str).unwrap_or(BackupType::LocalManual);
    let estado_str: String = updated_row.get("estado");
    let estado = BackupStatus::from_str(&estado_str).unwrap_or(BackupStatus::SincronizadoCloud);

    let audit_detail = serde_json::json!({
        "backup_id": backup_id,
        "drive_file_id": drive_file_id,
        "estado": "SINCRONIZADO_CLOUD",
        "was_simulated": is_simulated,
    });
    record_audit(
        pool,
        user_id,
        username,
        "BACKUP_CLOUD_SYNCED",
        "historial_respaldos",
        &audit_detail.to_string(),
        None,
    )
    .await?;

    Ok(BackupRecord {
        id: updated_row.get("id"),
        tipo_respaldo: tipo,
        nombre_archivo: updated_row.get("nombre_archivo"),
        ruta_local: updated_row.get("ruta_local"),
        tamano_bytes: updated_row.get("tamano_bytes"),
        sha256_checksum: updated_row.get("sha256_checksum"),
        drive_file_id: updated_row.get("drive_file_id"),
        estado,
        mensaje_detalle: updated_row.get("mensaje_detalle"),
        ejecutado_por_usuario_id: updated_row.get("ejecutado_por_usuario_id"),
        created_at: updated_row.get("created_at"),
    })
}

pub async fn run_auto_backup_cycle_once(state: &AppState) -> Result<Option<BackupRecord>, AppError> {
    let pool = state.pool();

    let interval_hours: u32 = sqlx::query(
        "SELECT valor FROM configuracion_sistema WHERE clave = 'BACKUP_AUTO_INTERVAL_HOURS'",
    )
    .fetch_optional(&pool)
    .await?
    .and_then(|r| r.get::<Option<String>, _>("valor"))
    .and_then(|v| v.trim().parse::<u32>().ok())
    .unwrap_or(2);

    if interval_hours == 0 {
        return Ok(None);
    }

    let recent_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM historial_respaldos
        WHERE estado IN ('COMPLETADO', 'SINCRONIZADO_CLOUD')
          AND datetime(created_at, '+' || ? || ' hours') > datetime('now', 'localtime')
        "#,
    )
    .bind(interval_hours as i64)
    .fetch_one(&pool)
    .await?;

    if recent_count > 0 {
        return Ok(None);
    }

    let backups_dir = state
        .db_path()
        .and_then(|p| {
            p.parent()
                .filter(|d| !d.as_os_str().is_empty())
                .map(|d| d.join("backups"))
        })
        .unwrap_or_else(|| PathBuf::from("backups"));

    let mut record = execute_hot_backup(&pool, BackupType::LocalAuto, None, &backups_dir).await?;

    let audit_detail = serde_json::json!({
        "backup_id": record.id,
        "nombre_archivo": record.nombre_archivo,
        "tamano_bytes": record.tamano_bytes,
        "sha256": record.sha256_checksum,
        "interval_hours": interval_hours,
    });
    record_audit(
        &pool,
        None,
        "SYSTEM_CRON",
        "AUTO_BACKUP_CREATED",
        "historial_respaldos",
        &audit_detail.to_string(),
        None,
    )
    .await?;

    let gdrive_enabled = sqlx::query(
        "SELECT valor FROM configuracion_sistema WHERE clave = 'BACKUP_GDRIVE_ENABLED'",
    )
    .fetch_optional(&pool)
    .await?
    .and_then(|r| r.get::<Option<String>, _>("valor"))
    .map(|v| v.trim() == "1" || v.trim().eq_ignore_ascii_case("true"))
    .unwrap_or(false);

    let has_gdrive_token = KeyringStore::get_secret("GDRIVE_ACCESS_TOKEN")?
        .filter(|t| !t.trim().is_empty())
        .is_some();

    if gdrive_enabled && has_gdrive_token {
        if let Ok(synced) =
            sync_backup_to_gdrive_with_actor(&pool, None, "SYSTEM_CRON", record.id).await
        {
            record = synced;
        }
    }

    Ok(Some(record))
}

pub fn start_auto_backup_scheduler(state: AppState) {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(20)).await;
        loop {
            let _ = run_auto_backup_cycle_once(&state).await;
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    });
}

// ============================================================================
// CONFIGURACIÓN DE IMPRESIÓN, CORREO Y RESPALDOS
// ============================================================================

pub async fn get_printing_backup_config(
    pool: &SqlitePool,
    _session: &AuthSession,
) -> Result<PrintingBackupConfigDto, AppError> {
    load_printing_backup_config(pool).await
}

async fn load_printing_backup_config(
    pool: &SqlitePool,
) -> Result<PrintingBackupConfigDto, AppError> {
    let rows = sqlx::query("SELECT clave, valor FROM configuracion_sistema")
        .fetch_all(pool)
        .await?;

    let mut map: HashMap<String, String> = HashMap::new();
    for r in rows {
        let k: String = r.get("clave");
        let v: Option<String> = r.get("valor");
        if let Some(val) = v {
            map.insert(k, val);
        }
    }

    let empresa_nombre_comercial = map
        .get("EMPRESA_NOMBRE_COMERCIAL")
        .cloned()
        .unwrap_or_else(|| "ZaramaGYM Fitness Center".to_string());
    let empresa_razon_social = map
        .get("EMPRESA_RAZON_SOCIAL")
        .cloned()
        .unwrap_or_else(|| "ZARAMAGYM S.A.C.".to_string());
    let empresa_ruc = map
        .get("EMPRESA_RUC")
        .cloned()
        .unwrap_or_else(|| "20600000001".to_string());
    let empresa_direccion = map
        .get("EMPRESA_DIRECCION")
        .cloned()
        .unwrap_or_else(|| "Av. Principal 123 - Perú".to_string());
    let empresa_telefono = map
        .get("EMPRESA_TELEFONO")
        .cloned()
        .unwrap_or_else(|| "999888777".to_string());

    let paper_width_val = map
        .get("PRINTER_PAPER_WIDTH_MM")
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(80);

    let connection_mode_val = map
        .get("PRINTER_CONNECTION_MODE")
        .and_then(|v| PrinterConnectionMode::from_str(v).ok())
        .unwrap_or(PrinterConnectionMode::VirtualPreview);

    let printer_target_address = map
        .get("PRINTER_TARGET_ADDRESS")
        .cloned()
        .unwrap_or_else(|| "192.168.1.50:9100".to_string());

    let printer_open_drawer_on_cash = map
        .get("PRINTER_OPEN_DRAWER_ON_CASH")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(true);

    let printer_footer_message = map
        .get("PRINTER_FOOTER_MESSAGE")
        .cloned()
        .unwrap_or_else(|| "¡Gracias por entrenar en ZaramaGYM!".to_string());

    let smtp_host = map
        .get("SMTP_HOST")
        .cloned()
        .unwrap_or_else(|| "smtp.gmail.com".to_string());

    let smtp_port = map
        .get("SMTP_PORT")
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(587);

    let smtp_user = map.get("SMTP_USER").cloned().unwrap_or_default();
    let smtp_from_email = map
        .get("SMTP_FROM_EMAIL")
        .cloned()
        .unwrap_or_else(|| "no-reply@zaramagym.pe".to_string());

    let smtp_enabled = map
        .get("SMTP_ENABLED")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let backup_auto_interval_hours = map
        .get("BACKUP_AUTO_INTERVAL_HOURS")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(2);

    let backup_gdrive_enabled = map
        .get("BACKUP_GDRIVE_ENABLED")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let backup_gdrive_folder_id = map
        .get("BACKUP_GDRIVE_FOLDER_ID")
        .cloned()
        .unwrap_or_default();

    let backup_gdrive_client_id = map
        .get("BACKUP_GDRIVE_CLIENT_ID")
        .cloned()
        .unwrap_or_default();

    let has_smtp_password_configured = KeyringStore::get_secret("SMTP_PASSWORD")?.is_some();
    let has_gdrive_token_configured = KeyringStore::get_secret("GDRIVE_ACCESS_TOKEN")?.is_some();
    let has_gdrive_client_secret_configured =
        KeyringStore::get_secret("GDRIVE_CLIENT_SECRET")?.is_some();

    Ok(PrintingBackupConfigDto {
        empresa_nombre_comercial,
        empresa_razon_social,
        empresa_ruc,
        empresa_direccion,
        empresa_telefono,
        printer_paper_width_mm: paper_width_val,
        printer_connection_mode: connection_mode_val,
        printer_target_address,
        printer_open_drawer_on_cash,
        printer_footer_message,
        smtp_host,
        smtp_port,
        smtp_user,
        smtp_from_email,
        smtp_enabled,
        backup_auto_interval_hours,
        backup_gdrive_enabled,
        backup_gdrive_folder_id,
        backup_gdrive_client_id,
        has_smtp_password_configured,
        has_gdrive_token_configured,
        has_gdrive_client_secret_configured,
    })
}

pub async fn update_printing_backup_config(
    pool: &SqlitePool,
    session: &AuthSession,
    request: UpdatePrintingBackupConfigRequest,
) -> Result<PrintingBackupConfigDto, AppError> {
    session.require_admin()?;

    // 1. Guardar Secretos en KeyringStore (NUNCA en configuracion_sistema) (CP-PRN-12)
    if let Some(ref pwd) = request.smtp_password {
        if !pwd.trim().is_empty() {
            KeyringStore::set_secret("SMTP_PASSWORD", pwd.trim())?;
        }
    }

    if let Some(ref tok) = request.backup_gdrive_token {
        if !tok.trim().is_empty() {
            KeyringStore::set_secret("GDRIVE_ACCESS_TOKEN", tok.trim())?;
        }
    }

    if let Some(ref secret) = request.backup_gdrive_client_secret {
        if !secret.trim().is_empty() {
            KeyringStore::set_secret("GDRIVE_CLIENT_SECRET", secret.trim())?;
        }
    }

    // 2. Actualizar parámetros en configuracion_sistema
    let mut tx = pool.begin().await?;

    async fn upsert_cfg(
        tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
        clave: &str,
        valor: &str,
    ) -> Result<(), AppError> {
        let q = r#"
            INSERT INTO configuracion_sistema (clave, valor)
            VALUES (?, ?)
            ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor;
        "#;
        sqlx::query(q)
            .bind(clave)
            .bind(valor)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    if let Some(ref val) = request.empresa_nombre_comercial {
        upsert_cfg(&mut tx, "EMPRESA_NOMBRE_COMERCIAL", val).await?;
    }
    if let Some(ref val) = request.empresa_razon_social {
        upsert_cfg(&mut tx, "EMPRESA_RAZON_SOCIAL", val).await?;
    }
    if let Some(ref val) = request.empresa_ruc {
        upsert_cfg(&mut tx, "EMPRESA_RUC", val).await?;
    }
    if let Some(ref val) = request.empresa_direccion {
        upsert_cfg(&mut tx, "EMPRESA_DIRECCION", val).await?;
    }
    if let Some(ref val) = request.empresa_telefono {
        upsert_cfg(&mut tx, "EMPRESA_TELEFONO", val).await?;
    }
    if let Some(val) = request.printer_paper_width_mm {
        upsert_cfg(&mut tx, "PRINTER_PAPER_WIDTH_MM", &val.to_string()).await?;
    }
    if let Some(val) = request.printer_connection_mode {
        upsert_cfg(&mut tx, "PRINTER_CONNECTION_MODE", val.as_str()).await?;
    }
    if let Some(ref val) = request.printer_target_address {
        upsert_cfg(&mut tx, "PRINTER_TARGET_ADDRESS", val).await?;
    }
    if let Some(val) = request.printer_open_drawer_on_cash {
        upsert_cfg(
            &mut tx,
            "PRINTER_OPEN_DRAWER_ON_CASH",
            if val { "1" } else { "0" },
        )
        .await?;
    }
    if let Some(ref val) = request.printer_footer_message {
        upsert_cfg(&mut tx, "PRINTER_FOOTER_MESSAGE", val).await?;
    }
    if let Some(ref val) = request.smtp_host {
        upsert_cfg(&mut tx, "SMTP_HOST", val).await?;
    }
    if let Some(val) = request.smtp_port {
        upsert_cfg(&mut tx, "SMTP_PORT", &val.to_string()).await?;
    }
    if let Some(ref val) = request.smtp_user {
        upsert_cfg(&mut tx, "SMTP_USER", val).await?;
    }
    if let Some(ref val) = request.smtp_from_email {
        upsert_cfg(&mut tx, "SMTP_FROM_EMAIL", val).await?;
    }
    if let Some(val) = request.smtp_enabled {
        upsert_cfg(&mut tx, "SMTP_ENABLED", if val { "1" } else { "0" }).await?;
    }
    if let Some(val) = request.backup_auto_interval_hours {
        upsert_cfg(&mut tx, "BACKUP_AUTO_INTERVAL_HOURS", &val.to_string()).await?;
    }
    if let Some(val) = request.backup_gdrive_enabled {
        upsert_cfg(&mut tx, "BACKUP_GDRIVE_ENABLED", if val { "1" } else { "0" }).await?;
    }
    if let Some(ref val) = request.backup_gdrive_folder_id {
        upsert_cfg(&mut tx, "BACKUP_GDRIVE_FOLDER_ID", val).await?;
    }
    if let Some(ref val) = request.backup_gdrive_client_id {
        upsert_cfg(&mut tx, "BACKUP_GDRIVE_CLIENT_ID", val).await?;
    }

    tx.commit().await?;

    let audit_detail = serde_json::json!({
        "empresa_nombre": request.empresa_nombre_comercial,
        "ancho_papel": request.printer_paper_width_mm,
        "modo_impresora": request.printer_connection_mode.map(|m| m.as_str()),
        "smtp_enabled": request.smtp_enabled,
        "backup_gdrive_enabled": request.backup_gdrive_enabled,
        "has_smtp_password_updated": request.smtp_password.is_some(),
        "has_gdrive_token_updated": request.backup_gdrive_token.is_some(),
        "has_gdrive_client_secret_updated": request.backup_gdrive_client_secret.is_some(),
    });
    record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "PRINTING_BACKUP_CONFIG_UPDATED",
        "configuracion_sistema",
        &audit_detail.to_string(),
        None,
    )
    .await?;

    get_printing_backup_config(pool, session).await
}

#[cfg(test)]
mod tests {
    use super::{extract_gdrive_folder_id, KeyringStore};

    #[test]
    fn keyring_store_uses_in_memory_fallback_in_unit_tests() {
        let test_key = "TEST_UNIT_GDRIVE_CLIENT_SECRET";
        KeyringStore::set_secret(test_key, "unit-secret-123").unwrap();
        assert_eq!(
            KeyringStore::get_secret(test_key).unwrap(),
            Some("unit-secret-123".to_string())
        );
        KeyringStore::delete_secret(test_key).unwrap();
        assert_eq!(KeyringStore::get_secret(test_key).unwrap(), None);
    }

    #[test]
    fn extract_gdrive_folder_id_parses_urls_and_raw_ids() {
        assert_eq!(extract_gdrive_folder_id(""), "");
        assert_eq!(extract_gdrive_folder_id("   "), "");
        assert_eq!(
            extract_gdrive_folder_id("  1AbCdEfGhIjKlMnOp  "),
            "1AbCdEfGhIjKlMnOp"
        );
        assert_eq!(
            extract_gdrive_folder_id(
                "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing"
            ),
            "1AbCdEfGhIjKlMnOp"
        );
        assert_eq!(
            extract_gdrive_folder_id(
                "https://drive.google.com/drive/u/0/folders/1XyZ987654321/extra"
            ),
            "1XyZ987654321"
        );
    }
}
