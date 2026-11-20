use crate::errors::AppError;
use super::person::UpdatePersonInput;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum UserRole {
    Recepcionista,
    Administrador,
}

impl UserRole {
    pub fn hierarchy_level(&self) -> u8 {
        match self {
            UserRole::Recepcionista => 1,
            UserRole::Administrador => 2,
        }
    }
}

impl std::fmt::Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserRole::Recepcionista => write!(f, "RECEPCIONISTA"),
            UserRole::Administrador => write!(f, "ADMINISTRADOR"),
        }
    }
}

impl std::str::FromStr for UserRole {
    type Err = AppError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_uppercase().as_str() {
            "RECEPCIONISTA" => Ok(UserRole::Recepcionista),
            "ADMINISTRADOR" => Ok(UserRole::Administrador),
            other => Err(AppError::Validation(format!("Rol inválido: '{}'. Debe ser RECEPCIONISTA o ADMINISTRADOR.", other))),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LoginCredentials {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthSession {
    pub user_id: i64,
    pub persona_id: i64,
    pub username: String,
    pub nombre_completo: String,
    pub rol: UserRole,
    pub foto_perfil_data_url: Option<String>,
    pub is_locked: bool,
    pub login_at: String, // ISO-8601
}

impl AuthSession {
    pub fn require_admin(&self) -> Result<(), AppError> {
        if self.rol != UserRole::Administrador {
            return Err(AppError::Forbidden(
                "Acceso denegado: se requieren privilegios de ADMINISTRADOR.".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UserListItem {
    pub id: i64,
    pub persona_id: i64,
    pub username: String,
    pub nombres: String,
    pub apellidos: String,
    pub numero_documento: String,
    pub tipo_documento: String,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub rol: UserRole,
    pub foto_perfil_data_url: Option<String>,
    pub estado_activo: bool,
    pub ultimo_login: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateUserInput {
    #[serde(default)]
    pub persona_id: Option<i64>,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub tipo_documento: String,
    #[serde(default)]
    pub numero_documento: String,
    #[serde(default)]
    pub nombres: String,
    #[serde(default)]
    pub apellidos: String,
    #[serde(default)]
    pub telefono: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    pub rol: UserRole,
    #[serde(default)]
    pub foto_perfil_data_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateUserInput {
    pub user_id: i64,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub new_password: Option<String>,
    #[serde(default)]
    pub rol: Option<UserRole>,
    #[serde(default)]
    pub foto_perfil_data_url: Option<String>,
    #[serde(default)]
    pub persona_data: Option<UpdatePersonInput>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateUserPhotoInput {
    pub user_id: i64,
    pub foto_perfil_data_url: Option<String>,
}
