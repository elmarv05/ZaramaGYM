use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct AuditFilter {
    pub modulo: Option<String>,
    pub accion: Option<String>,
    pub username: Option<String>,
    pub desde: Option<String>, // ISO-8601
    pub hasta: Option<String>, // ISO-8601
    pub limit: Option<i64>,    // Default 100, Max 500
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct AuditLogItem {
    pub id: i64,
    pub usuario_id: Option<i64>,
    pub username: String,
    pub accion: String,
    pub modulo: String,
    pub detalles_json: String,
    pub ip_o_terminal: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct CloseBlockedPayload {
    pub shift_id: i64,
    pub usuario_apertura_username: String,
    pub usuario_apertura_nombre: String,
    pub fecha_apertura: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct CrashRecoveryNotice {
    pub detected: bool,
    pub had_open_cash_shift: bool,
    pub shift_id: Option<i64>,
    pub shift_opened_by_username: Option<String>,
    pub shift_opened_by_name: Option<String>,
    pub shift_opened_at: Option<String>,
    pub last_active_username: Option<String>,
    pub last_heartbeat_at: Option<String>,
    pub restarted_at: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct SafeUpdatePreparationDto {
    pub current_version: String,
    pub target_version: String,
    pub backup_id: i64,
    pub backup_filename: String,
    pub backup_path: String,
    pub backup_size_bytes: i64,
    pub backup_sha256: String,
    pub integrity_verified: bool,
    pub prepared_at: String,
}
