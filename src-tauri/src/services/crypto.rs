use crate::errors::AppError;
use argon2::{
    password_hash::{
        rand_core::{OsRng, RngCore},
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Argon2,
};

/// Genera un hash PHC seguro usando Argon2id con salt aleatorio
pub fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(format!("Error generando hash Argon2id: {}", e)))?;
    Ok(hash.to_string())
}

/// Verifica si una contraseña en texto plano coincide con el hash PHC
pub fn verify_password(hash: &str, password: &str) -> Result<bool, AppError> {
    let parsed_hash = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(e) => {
            return Err(AppError::Internal(format!("Formato de hash Argon2 inválido: {}", e)));
        }
    };
    Ok(Argon2::default().verify_password(password.as_bytes(), &parsed_hash).is_ok())
}

/// Genera un token QR criptográfico local-first único: 'ZG-' seguido de 16 caracteres hexadecimales en mayúsculas
pub fn generate_qr_token() -> String {
    let mut bytes = [0u8; 8];
    OsRng.fill_bytes(&mut bytes);
    let hex_part: String = bytes.iter().map(|b| format!("{:02X}", b)).collect();
    format!("ZG-{}", hex_part)
}
