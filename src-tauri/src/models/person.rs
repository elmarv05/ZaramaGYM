use super::user::UserRole;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct PersonFilter {
    pub search: Option<String>,
    pub solo_activos: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PersonListItem {
    pub id: i64,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub genero: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub es_cliente: bool,
    pub es_proveedor: bool,
    pub rol_usuario: Option<UserRole>,
    pub estado_activo: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PersonDetail {
    pub id: i64,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    pub genero: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub es_cliente: bool,
    pub cliente_id: Option<i64>,
    pub es_proveedor: bool,
    pub proveedor_id: Option<i64>,
    pub rol_usuario: Option<UserRole>,
    pub usuario_id: Option<i64>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreatePersonInput {
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    #[serde(default)]
    pub genero: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdatePersonInput {
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombres: String,
    pub apellidos: String,
    pub fecha_nacimiento: Option<String>,
    #[serde(default)]
    pub genero: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
}
