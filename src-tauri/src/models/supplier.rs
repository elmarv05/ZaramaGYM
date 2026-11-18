use crate::errors::AppError;
use super::person::{CreatePersonInput, UpdatePersonInput};
use super::user::UserRole;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SupplierType {
    PersonaNatural,
    Empresa,
}

impl std::fmt::Display for SupplierType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SupplierType::PersonaNatural => write!(f, "PERSONA_NATURAL"),
            SupplierType::Empresa => write!(f, "EMPRESA"),
        }
    }
}

impl std::str::FromStr for SupplierType {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "PERSONA_NATURAL" => Ok(SupplierType::PersonaNatural),
            "EMPRESA" => Ok(SupplierType::Empresa),
            other => Err(AppError::Validation(format!(
                "Tipo de proveedor inválido: '{}'. Debe ser PERSONA_NATURAL o EMPRESA.",
                other
            ))),
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct CompanyFilter {
    pub search: Option<String>,
    pub solo_activos: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CompanyListItem {
    pub id: i64,
    pub ruc: String,
    pub razon_social: String,
    pub nombre_comercial: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub estado_activo: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CompanyDetail {
    pub id: i64,
    pub ruc: String,
    pub razon_social: String,
    pub nombre_comercial: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateCompanyInput {
    pub ruc: String,
    pub razon_social: String,
    pub nombre_comercial: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateCompanyInput {
    pub razon_social: String,
    pub nombre_comercial: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
pub struct SupplierFilter {
    pub search: Option<String>,
    pub tipo_proveedor: Option<SupplierType>,
    pub solo_activos: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SupplierListItem {
    pub id: i64,
    pub tipo_proveedor: SupplierType,
    pub persona_id: Option<i64>,
    pub empresa_id: Option<i64>,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombre_o_razon_social: String,
    pub nombres: Option<String>,
    pub apellidos: Option<String>,
    pub nombre_comercial: Option<String>,
    pub rubro_o_categoria: Option<String>,
    pub contacto_referencia: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub persona_rol_usuario: Option<UserRole>,
    pub estado_activo: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SupplierDetail {
    pub id: i64,
    pub tipo_proveedor: SupplierType,
    pub persona_id: Option<i64>,
    pub empresa_id: Option<i64>,
    pub tipo_documento: String,
    pub numero_documento: String,
    pub nombre_o_razon_social: String,
    pub nombres: Option<String>,
    pub apellidos: Option<String>,
    pub nombre_comercial: Option<String>,
    pub rubro_o_categoria: Option<String>,
    pub contacto_referencia: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub persona_rol_usuario: Option<UserRole>,
    pub estado_activo: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateSupplierInput {
    pub tipo_proveedor: SupplierType,
    #[serde(default)]
    pub persona_id: Option<i64>,
    #[serde(default)]
    pub empresa_id: Option<i64>,
    #[serde(default)]
    pub persona_data: Option<CreatePersonInput>,
    #[serde(default)]
    pub empresa_data: Option<CreateCompanyInput>,
    #[serde(default)]
    pub rubro_o_categoria: Option<String>,
    #[serde(default)]
    pub contacto_referencia: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateSupplierInput {
    #[serde(default)]
    pub rubro_o_categoria: Option<String>,
    #[serde(default)]
    pub contacto_referencia: Option<String>,
    #[serde(default)]
    pub persona_data: Option<UpdatePersonInput>,
    #[serde(default)]
    pub empresa_data: Option<UpdateCompanyInput>,
}
