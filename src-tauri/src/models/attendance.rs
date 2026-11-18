use crate::errors::AppError;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

// ============================================================================
// ENUMS DE DOMINIO DE ASISTENCIAS Y SEMÁFORO
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TrafficLightColor {
    Verde,
    Amarillo,
    Rojo,
}

impl fmt::Display for TrafficLightColor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Verde => write!(f, "VERDE"),
            Self::Amarillo => write!(f, "AMARILLO"),
            Self::Rojo => write!(f, "ROJO"),
        }
    }
}

impl FromStr for TrafficLightColor {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "VERDE" => Ok(Self::Verde),
            "AMARILLO" => Ok(Self::Amarillo),
            "ROJO" => Ok(Self::Rojo),
            other => Err(AppError::Validation(format!(
                "Color de semáforo inválido: {}",
                other
            ))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AttendanceCheckInMode {
    QrLocal,
    QrMovilLan,
    ManualOlvidoQr,
    PaseDiarioCreditoRojo,
}

impl fmt::Display for AttendanceCheckInMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::QrLocal => write!(f, "QR_LOCAL"),
            Self::QrMovilLan => write!(f, "QR_MOVIL_LAN"),
            Self::ManualOlvidoQr => write!(f, "MANUAL_OLVIDO_QR"),
            Self::PaseDiarioCreditoRojo => write!(f, "PASE_DIARIO_CREDITO_ROJO"),
        }
    }
}

impl FromStr for AttendanceCheckInMode {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "QR_LOCAL" => Ok(Self::QrLocal),
            "QR_MOVIL_LAN" => Ok(Self::QrMovilLan),
            "MANUAL_OLVIDO_QR" => Ok(Self::ManualOlvidoQr),
            "PASE_DIARIO_CREDITO_ROJO" => Ok(Self::PaseDiarioCreditoRojo),
            other => Err(AppError::Validation(format!(
                "Modo de ingreso desconocido: {}",
                other
            ))),
        }
    }
}

// ============================================================================
// DTOs DE ENTRADA (INPUTS) CON DUAL-BINDING SERDE
// ============================================================================

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInInput {
    #[serde(alias = "qr_token")]
    pub qr_token: Option<String>,
    #[serde(alias = "cliente_id")]
    pub cliente_id: Option<i64>,
    #[serde(alias = "numero_documento")]
    pub numero_documento: Option<String>,
    #[serde(alias = "modo_ingreso")]
    pub modo_ingreso: Option<AttendanceCheckInMode>,
    #[serde(alias = "dispositivo_id")]
    pub dispositivo_id: Option<i64>,
    pub notas: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizeRedPassInput {
    #[serde(alias = "cliente_id")]
    pub cliente_id: i64,
    #[serde(alias = "monto_pase")]
    pub monto_pase: Option<Decimal>,
    pub notas: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceFilter {
    #[serde(alias = "fecha_desde")]
    pub fecha_desde: Option<String>,
    #[serde(alias = "fecha_hasta")]
    pub fecha_hasta: Option<String>,
    #[serde(alias = "color_semaforo")]
    pub color_semaforo: Option<TrafficLightColor>,
    #[serde(alias = "modo_ingreso")]
    pub modo_ingreso: Option<AttendanceCheckInMode>,
    #[serde(alias = "cliente_id")]
    pub cliente_id: Option<i64>,
    pub busqueda: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtendMembershipInput {
    #[serde(alias = "membresia_id")]
    pub membresia_id: i64,
    #[serde(alias = "dias_otorgados")]
    pub dias_otorgados: i64,
    #[serde(alias = "motivo_justificacion")]
    pub motivo_justificacion: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MembershipExtensionFilter {
    #[serde(alias = "membresia_id")]
    pub membresia_id: Option<i64>,
    #[serde(alias = "cliente_id")]
    pub cliente_id: Option<i64>,
    #[serde(alias = "fecha_desde")]
    pub fecha_desde: Option<String>,
    #[serde(alias = "fecha_hasta")]
    pub fecha_hasta: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSystemConfigInput {
    #[serde(alias = "dias_alerta_amarillo")]
    pub dias_alerta_amarillo: Option<i64>,
    #[serde(alias = "minutos_antirebote_qr")]
    pub minutos_antirebote_qr: Option<i64>,
    #[serde(alias = "precio_pase_diario_credito_default")]
    pub precio_pase_diario_credito_default: Option<Decimal>,
}

// ============================================================================
// DTOs DE SALIDA (RESPONSES) CON DUAL-BINDING CAMELCASE
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInEvaluationDto {
    pub asistencia_id: Option<i64>,
    pub cliente_id: i64,
    pub nombre_completo: String,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub foto_perfil_data_url: Option<String>,
    pub color_semaforo: TrafficLightColor,
    pub ingreso_permitido: bool,
    pub alerta_sonora: bool,
    pub es_rebote: bool,
    pub motivo_semaforo: String,
    pub membresia_id: Option<i64>,
    pub nombre_plan: Option<String>,
    pub fecha_vencimiento: Option<String>,
    pub dias_restantes: Option<i64>,
    pub deuda_total_pendiente: Decimal,
    pub modo_ingreso: AttendanceCheckInMode,
    pub fecha_hora_ingreso: String,
    pub credito_generado_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceListItemDto {
    pub id: i64,
    pub cliente_id: i64,
    pub nombre_completo: String,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub membresia_id: Option<i64>,
    pub nombre_plan: Option<String>,
    pub fecha_hora_ingreso: String,
    pub modo_ingreso: AttendanceCheckInMode,
    pub color_semaforo: TrafficLightColor,
    pub motivo_semaforo: String,
    pub dias_restantes_momento: Option<i64>,
    pub deuda_pendiente_momento: Decimal,
    pub credito_generado_id: Option<i64>,
    pub registrado_por_usuario_id: i64,
    pub registrado_por_nombre: String,
    pub notas: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceTodaySummaryDto {
    pub total_ingresos_hoy: i64,
    pub total_verde: i64,
    pub total_amarillo: i64,
    pub total_rojo_autorizados: i64,
    pub total_qr_local: i64,
    pub total_manual_olvido: i64,
    pub total_pase_credito: i64,
    pub total_qr_movil: i64,
    pub ultimo_ingreso_hora: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MembershipExtensionDto {
    pub id: i64,
    pub membresia_id: i64,
    pub cliente_id: i64,
    pub nombre_cliente: String,
    pub nombre_plan: String,
    pub dias_otorgados: i64,
    pub fecha_vencimiento_anterior: String,
    pub fecha_vencimiento_nueva: String,
    pub motivo_justificacion: String,
    pub autorizado_por_usuario_id: i64,
    pub autorizado_por_nombre: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemConfigDto {
    pub dias_alerta_amarillo: i64,
    pub minutos_antirebote_qr: i64,
    pub precio_pase_diario_credito_default: Decimal,
    pub updated_at: String,
}
