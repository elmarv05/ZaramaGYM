use crate::errors::AppError;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

// ============================================================================
// HOME DASHBOARD METRICS (TAREA 2.1)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HourlyAttendancePoint {
    pub franja: String,
    pub hora: u32,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExpiringMembershipAlert {
    pub cliente_id: i64,
    pub nombre_completo: String,
    pub telefono: Option<String>,
    pub nombre_plan: String,
    pub fecha_vencimiento: String,
    pub dias_restantes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HomeDashboardMetricsDto {
    pub clientes_activos: i64,
    pub membresias_activas: i64,
    pub asistencias_hoy_total: i64,
    pub deudores_activos_count: i64,
    pub saldo_creditos_pendiente: Decimal,
    pub ingresos_hoy_fisico: Decimal,
    pub ingresos_hoy_digital: Decimal,
    pub ingresos_hoy_total: Decimal,
    pub ingresos_mes_fisico: Decimal,
    pub ingresos_mes_digital: Decimal,
    pub ingresos_mes_total: Decimal,
    pub can_view_monthly_revenue: bool,
    pub afluencia_por_franja: Vec<HourlyAttendancePoint>,
    pub membresias_por_vencer: Vec<ExpiringMembershipAlert>,
    pub generated_at: String,
}

// ============================================================================
// MOTOR DE EXPORTACIÓN CONTABLE Y LISTADOS (TAREA 2.3)
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ExportFormat {
    #[serde(alias = "csv", alias = "Csv")]
    Csv,
    #[serde(alias = "xlsx", alias = "Xlsx")]
    Xlsx,
    #[serde(alias = "pdf", alias = "Pdf")]
    Pdf,
}

impl ExportFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            ExportFormat::Csv => "CSV",
            ExportFormat::Xlsx => "XLSX",
            ExportFormat::Pdf => "PDF",
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            ExportFormat::Csv => "csv",
            ExportFormat::Xlsx => "xlsx",
            ExportFormat::Pdf => "pdf",
        }
    }

    pub fn mime_type(&self) -> &'static str {
        match self {
            ExportFormat::Csv => "text/csv;charset=utf-8",
            ExportFormat::Xlsx => {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }
            ExportFormat::Pdf => "application/pdf",
        }
    }
}

impl std::fmt::Display for ExportFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for ExportFormat {
    type Err = AppError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "CSV" => Ok(ExportFormat::Csv),
            "XLSX" => Ok(ExportFormat::Xlsx),
            "PDF" => Ok(ExportFormat::Pdf),
            other => Err(AppError::Validation(format!(
                "Formato de exportación inválido: '{}'. Permitidos: CSV, XLSX, PDF.",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExportFileResult {
    pub filename: String,
    pub mime_type: String,
    pub content_base64: String,
    pub size_bytes: usize,
    pub sha256_hash: String,
    pub row_count: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ExportSalesReportRequest {
    #[serde(default)]
    pub fecha_desde: Option<String>,
    #[serde(default)]
    pub fecha_hasta: Option<String>,
    #[serde(default)]
    pub canal_filtro: Option<String>,
    pub format: ExportFormat,
}
