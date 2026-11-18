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
