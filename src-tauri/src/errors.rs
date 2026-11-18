use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, thiserror::Error, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("No autenticado: {0}")]
    Unauthorized(String),

    #[error("Acceso denegado: {0}")]
    Forbidden(String),

    #[error("Recurso no encontrado: {0}")]
    NotFound(String),

    #[error("Error de validación: {0}")]
    Validation(String),

    #[error("Conflicto de integridad: {0}")]
    Conflict(String),

    #[error("Sesión bloqueada: {0}")]
    SessionLocked(String),

    #[error("Error interno del servidor: {0}")]
    Internal(String),
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        if let sqlx::Error::Database(ref db_err) = err {
            let msg = db_err.message();
            if msg.contains("UNIQUE") || msg.contains("unique") {
                return AppError::Conflict(format!("Conflicto de unicidad en base de datos: {}", msg));
            }
            if msg.contains("FOREIGN KEY") || msg.contains("foreign key") {
                return AppError::Conflict(format!("Violación de integridad referencial: {}", msg));
            }
            if msg.contains("CHECK constraint") || msg.contains("check constraint") {
                return AppError::Validation(format!("Violación de restricción de datos: {}", msg));
            }
        }
        AppError::Internal(format!("Error en base de datos: {}", err))
    }
}
