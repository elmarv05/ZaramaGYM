use super::user::UserRole;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct ClientFilter {
    pub search: Option<String>,
    pub solo_activos: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClientListItem {
    pub id: i64, // cliente_id
    pub persona_id: i64,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub codigo_qr_token: String,
    pub nombre_contacto_emergencia: Option<String>,
    pub numero_contacto_emergencia: Option<String>,
    pub notas_medicas: Option<String>,
    pub peso_actual_kg: Option<Decimal>,
    pub persona_rol_usuario: Option<UserRole>,
    pub estado_activo: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClientDetail {
    pub id: i64, // cliente_id
    pub persona_id: i64,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub codigo_qr_token: String,
    pub nombre_contacto_emergencia: Option<String>,
    pub numero_contacto_emergencia: Option<String>,
    pub notas_medicas: Option<String>,
    pub peso_actual_kg: Option<Decimal>,
    pub persona_rol_usuario: Option<UserRole>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateClientInput {
    pub persona_id: Option<i64>, // Si ya existe la persona
    pub tipo_documento: Option<String>,
    pub numero_documento: Option<String>,
    pub nombres: Option<String>,
    pub apellidos: Option<String>,
    pub fecha_nacimiento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub nombre_contacto_emergencia: Option<String>,
    pub numero_contacto_emergencia: Option<String>,
    pub notas_medicas: Option<String>,
    pub peso_inicial_kg: Option<Decimal>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateClientInput {
    #[serde(default)]
    pub tipo_documento: String,
    #[serde(default)]
    pub numero_documento: String,
    #[serde(default)]
    pub nombres: String,
    #[serde(default)]
    pub apellidos: String,
    #[serde(default)]
    pub fecha_nacimiento: Option<String>,
    #[serde(default)]
    pub telefono: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub direccion: Option<String>,
    #[serde(default)]
    pub nombre_contacto_emergencia: Option<String>,
    #[serde(default)]
    pub numero_contacto_emergencia: Option<String>,
    #[serde(default)]
    pub notas_medicas: Option<String>,
    #[serde(default)]
    pub modificar_datos_personales: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RecordWeightInput {
    pub cliente_id: i64,
    pub peso_kg: Decimal,
    pub nota: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClientWeightRecord {
    pub id: i64,
    pub cliente_id: i64,
    pub peso_kg: Decimal,
    pub variacion_kg: Decimal,
    pub nota: Option<String>,
    pub registrado_por_usuario_id: Option<i64>,
    pub registrado_por_username: Option<String>,
    pub fecha_registro: String,
}
