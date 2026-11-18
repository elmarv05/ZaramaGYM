use serde::{Deserialize, Serialize};

// ============================================================================
// DTOs Y MODELOS PARA EL SERVIDOR WI-FI LOCAL Y ESCÁNER MÓVIL (SLICE 6)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanServerStatusDto {
    pub is_running: bool,
    pub port: u16,
    pub local_ips: Vec<String>,
    pub primary_ip: String,
    pub https_url: String,
    pub http_url: String,
    pub mdns_hostname: String,
    pub mdns_active: bool,
    pub ca_cert_pem: String,
    pub ca_cert_fingerprint_sha256: String,
    pub total_devices_linked: i64,
    pub total_devices_pending: i64,
    pub total_scans_today: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileDeviceDto {
    pub id: i64,
    pub nombre_dispositivo: String,
    pub codigo_vinculacion: String,
    pub estado_vinculacion: String, // "PENDIENTE_VINCULACION", "VINCULADO", "REVOCADO"
    pub ip_ultima_conexion: Option<String>,
    pub user_agent: Option<String>,
    pub ultimo_acceso_at: Option<String>,
    pub total_escaneos: i64,
    pub creado_por_usuario_id: i64,
    pub creado_por_nombre: String,
    pub revocado_por_usuario_id: Option<i64>,
    pub revocado_por_nombre: Option<String>,
    pub revocado_at: Option<String>,
    pub estado_activo: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileDeviceFilter {
    #[serde(alias = "estado_vinculacion")]
    pub estado_vinculacion: Option<String>,
    #[serde(alias = "estado_activo")]
    pub estado_activo: Option<i64>,
    pub busqueda: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMobileDeviceInput {
    #[serde(alias = "nombre_dispositivo")]
    pub nombre_dispositivo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileDevicePairingDto {
    pub device_id: i64,
    pub nombre_dispositivo: String,
    pub codigo_vinculacion: String, // Ej: "ZG-4821" o "K9M2PX"
    pub pairing_url: String,         // https://192.168.1.45:3443/scanner?pair=K9M2PX
    pub qr_data_url: String,         // Imagen QR base64 en memoria para escaneo rápido
    pub expires_in_minutes: i64,     // 60 minutos o permanente hasta vinculación
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairMobileDeviceInput {
    #[serde(alias = "codigo_vinculacion")]
    pub codigo_vinculacion: String,
    #[serde(alias = "user_agent")]
    pub user_agent: Option<String>,
    #[serde(alias = "ip_address")]
    pub ip_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedMobileSessionDto {
    pub token_sesion: String, // Token CSPRNG 32 hex
    pub device_id: i64,
    pub nombre_dispositivo: String,
    pub gym_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileScanInput {
    #[serde(alias = "token_sesion")]
    pub token_sesion: Option<String>,
    #[serde(alias = "qr_token")]
    pub qr_token: Option<String>,
    #[serde(alias = "numero_documento")]
    pub numero_documento: Option<String>,
}
