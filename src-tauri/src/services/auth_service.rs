use crate::errors::AppError;
use crate::models::{
    AuthSession, CreateUserInput, LoginCredentials, UpdateUserInput, UpdateUserPhotoInput,
    UserListItem, UserRole,
};
use crate::services::audit_service::record_audit;
use crate::services::crypto::{hash_password, verify_password};
use crate::state::AppState;
use chrono::Utc;
use sqlx::{Row, SqlitePool};

/// Inicia sesión verificando credenciales Argon2id y estado activo.
/// Registra auditoría LOGIN_EXITOSO o LOGIN_FALLIDO.
pub async fn login(
    pool: &SqlitePool,
    state: &AppState,
    credentials: LoginCredentials,
) -> Result<AuthSession, AppError> {
    let username = credentials.username.trim();
    if username.is_empty() || credentials.password.is_empty() {
        return Err(AppError::Validation("Debe ingresar usuario y contraseña.".into()));
    }

    // Buscar credenciales uniendo con la tabla personas
    let user_row = sqlx::query(
        r#"
        SELECT 
            u.id, 
            u.persona_id, 
            u.username, 
            u.password_hash, 
            u.rol_principal, 
            u.foto_perfil_data_url,
            u.estado_activo,
            p.nombres,
            p.apellidos
        FROM usuarios_sistema u
        INNER JOIN personas p ON p.id = u.persona_id
        WHERE u.username = ? COLLATE NOCASE
        "#,
    )
    .bind(username)
    .fetch_optional(pool)
    .await?;

    let row = match user_row {
        Some(r) => r,
        None => {
            let _ = record_audit(
                pool,
                None,
                username,
                "LOGIN_FALLIDO",
                "AUTH",
                r#"{"motivo": "Usuario no encontrado"}"#,
                None,
            )
            .await;
            return Err(AppError::Unauthorized("Credenciales inválidas.".into()));
        }
    };

    let user_id: i64 = row.get("id");
    let persona_id: i64 = row.get("persona_id");
    let db_username: String = row.get("username");
    let password_hash: String = row.get("password_hash");
    let rol_str: String = row.get("rol_principal");
    let foto_perfil_data_url: Option<String> = row.get("foto_perfil_data_url");
    let estado_activo: i64 = row.get("estado_activo");
    let nombres: String = row.get("nombres");
    let apellidos: String = row.get("apellidos");

    // Verificar si la cuenta está activa
    if estado_activo != 1 {
        let _ = record_audit(
            pool,
            Some(user_id),
            &db_username,
            "LOGIN_FALLIDO",
            "AUTH",
            r#"{"motivo": "Usuario inactivo o suspendido"}"#,
            None,
        )
        .await;
        return Err(AppError::Unauthorized(
            "El usuario se encuentra inactivo. Consulte al administrador.".into(),
        ));
    }

    // Verificar la contraseña con Argon2id
    let is_valid = verify_password(&password_hash, &credentials.password)?;
    if !is_valid {
        let _ = record_audit(
            pool,
            Some(user_id),
            &db_username,
            "LOGIN_FALLIDO",
            "AUTH",
            r#"{"motivo": "Contraseña incorrecta"}"#,
            None,
        )
        .await;
        return Err(AppError::Unauthorized("Credenciales inválidas.".into()));
    }

    // Actualizar último login
    let now_str = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE usuarios_sistema SET ultimo_login = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(user_id)
    .execute(pool)
    .await?;

    let rol: UserRole = rol_str.parse()?;
    let nombre_completo = format!("{} {}", nombres.trim(), apellidos.trim());

    let session = AuthSession {
        user_id,
        persona_id,
        username: db_username.clone(),
        nombre_completo,
        rol,
        foto_perfil_data_url,
        is_locked: false,
        login_at: now_str,
    };

    state.set_session(Some(session.clone())).await;

    let _ = record_audit(
        pool,
        Some(user_id),
        &db_username,
        "LOGIN_EXITOSO",
        "AUTH",
        r#"{"mensaje": "Inicio de sesión satisfactorio"}"#,
        None,
    )
    .await;

    Ok(session)
}

/// Cierra la sesión activa actual e invalida el estado en memoria.
pub async fn logout(pool: &SqlitePool, state: &AppState) -> Result<(), AppError> {
    let current_session = state.require_session_allow_locked().await?;

    let open_shift = sqlx::query("SELECT id FROM turnos_caja WHERE estado = 'ABIERTO' LIMIT 1")
        .fetch_optional(pool)
        .await?;

    if let Some(row) = open_shift {
        let shift_id: i64 = row.get("id");
        return Err(AppError::Validation(format!(
            "No puedes cerrar sesión mientras el Turno de Caja #{} permanezca ABIERTO. Primero realiza el Cierre y Arqueo de Caja en el módulo POS, o usa 'Proteger Estación / Bloquear Turno' si solo te ausentarás temporalmente.",
            shift_id
        )));
    }

    let _ = record_audit(
        pool,
        Some(current_session.user_id),
        &current_session.username,
        "LOGOUT",
        "AUTH",
        r#"{"mensaje": "Cierre de sesión voluntario"}"#,
        None,
    )
    .await;

    state.set_session(None).await;
    Ok(())
}

/// Devuelve la sesión en memoria si existe.
pub async fn get_current_session(state: &AppState) -> Result<Option<AuthSession>, AppError> {
    Ok(state.get_session().await)
}

/// Bloquea temporalmente la sesión de turno activa.
pub async fn lock_session(pool: &SqlitePool, state: &AppState) -> Result<(), AppError> {
    let mut session = state.require_session_allow_locked().await?;
    if !session.is_locked {
        session.is_locked = true;
        state.set_session(Some(session.clone())).await;

        let _ = record_audit(
            pool,
            Some(session.user_id),
            &session.username,
            "SESSION_LOCKED",
            "AUTH",
            r#"{"mensaje": "Sesión bloqueada por inactividad o solicitud de usuario"}"#,
            None,
        )
        .await;
    }
    Ok(())
}

/// Desbloquea la sesión bloqueada verificando la contraseña del usuario actual.
pub async fn unlock_session(
    pool: &SqlitePool,
    state: &AppState,
    password: &str,
) -> Result<AuthSession, AppError> {
    let mut session = state.require_session_allow_locked().await?;

    if !session.is_locked {
        return Ok(session);
    }

    if password.is_empty() {
        return Err(AppError::Validation("Debe ingresar su contraseña para desbloquear.".into()));
    }

    let row = sqlx::query("SELECT password_hash, estado_activo FROM usuarios_sistema WHERE id = ?")
        .bind(session.user_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Usuario de la sesión no encontrado.".into()))?;

    let estado_activo: i64 = row.get("estado_activo");
    if estado_activo != 1 {
        state.set_session(None).await;
        return Err(AppError::Unauthorized(
            "El usuario ha sido desactivado mientras la sesión estaba bloqueada.".into(),
        ));
    }

    let password_hash: String = row.get("password_hash");
    let is_valid = verify_password(&password_hash, password)?;

    if !is_valid {
        let _ = record_audit(
            pool,
            Some(session.user_id),
            &session.username,
            "SESSION_UNLOCK_FAILED",
            "AUTH",
            r#"{"motivo": "Contraseña incorrecta al desbloquear sesión"}"#,
            None,
        )
        .await;
        return Err(AppError::Unauthorized("Contraseña incorrecta.".into()));
    }

    session.is_locked = false;
    state.set_session(Some(session.clone())).await;

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "SESSION_UNLOCKED",
        "AUTH",
        r#"{"mensaje": "Sesión desbloqueada exitosamente"}"#,
        None,
    )
    .await;

    Ok(session)
}

/// Permite al usuario en sesión cambiar su propia contraseña.
pub async fn change_own_password(
    pool: &SqlitePool,
    state: &AppState,
    current_password: &str,
    new_password: &str,
) -> Result<(), AppError> {
    let session = state.require_unlocked_session().await?;

    if new_password.trim().len() < 6 {
        return Err(AppError::Validation(
            "La nueva contraseña debe tener al menos 6 caracteres.".into(),
        ));
    }

    let row = sqlx::query("SELECT password_hash FROM usuarios_sistema WHERE id = ?")
        .bind(session.user_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Usuario no encontrado.".into()))?;

    let current_hash: String = row.get("password_hash");
    let is_valid = verify_password(&current_hash, current_password)?;
    if !is_valid {
        return Err(AppError::Unauthorized("La contraseña actual es incorrecta.".into()));
    }

    let new_hash = hash_password(new_password)?;

    sqlx::query(
        "UPDATE usuarios_sistema SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(new_hash)
    .bind(session.user_id)
    .execute(pool)
    .await?;

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "PASSWORD_CHANGED",
        "AUTH",
        r#"{"mensaje": "Contraseña propia actualizada exitosamente"}"#,
        None,
    )
    .await;

    Ok(())
}

/// Lista usuarios registrados según la jerarquía del operador.
/// - ADMINISTRADOR: ve todos los usuarios.
/// - SUPERVISOR: ve únicamente RECEPCIONISTA (filtrado en SQL).
/// - RECEPCIONISTA: AppError::Forbidden.
pub async fn list_users(pool: &SqlitePool, state: &AppState) -> Result<Vec<UserListItem>, AppError> {
    let session = state.require_supervisor_or_admin().await?;

    let rows = if session.rol == UserRole::Administrador {
        sqlx::query(
            r#"
            SELECT 
                u.id, 
                u.persona_id, 
                u.username, 
                p.nombres, 
                p.apellidos, 
                p.numero_documento, 
                p.tipo_documento, 
                p.telefono,
                p.email,
                p.direccion,
                u.rol_principal, 
                u.foto_perfil_data_url,
                u.estado_activo, 
                u.ultimo_login, 
                u.created_at
            FROM usuarios_sistema u
            INNER JOIN personas p ON p.id = u.persona_id
            ORDER BY u.id ASC
            "#,
        )
        .fetch_all(pool)
        .await?
    } else {
        // SUPERVISOR ve exclusivamente a RECEPCIONISTA
        sqlx::query(
            r#"
            SELECT 
                u.id, 
                u.persona_id, 
                u.username, 
                p.nombres, 
                p.apellidos, 
                p.numero_documento, 
                p.tipo_documento, 
                p.telefono,
                p.email,
                p.direccion,
                u.rol_principal, 
                u.foto_perfil_data_url,
                u.estado_activo, 
                u.ultimo_login, 
                u.created_at
            FROM usuarios_sistema u
            INNER JOIN personas p ON p.id = u.persona_id
            WHERE u.rol_principal = 'RECEPCIONISTA'
            ORDER BY u.id ASC
            "#,
        )
        .fetch_all(pool)
        .await?
    };

    let mut users = Vec::new();
    for row in rows {
        let rol_str: String = row.get("rol_principal");
        let rol: UserRole = rol_str.parse()?;
        let estado_num: i64 = row.get("estado_activo");

        users.push(UserListItem {
            id: row.get("id"),
            persona_id: row.get("persona_id"),
            username: row.get("username"),
            nombres: row.get("nombres"),
            apellidos: row.get("apellidos"),
            numero_documento: row.get("numero_documento"),
            tipo_documento: row.get("tipo_documento"),
            telefono: row.get("telefono"),
            email: row.get("email"),
            direccion: row.get("direccion"),
            rol,
            foto_perfil_data_url: row.get("foto_perfil_data_url"),
            estado_activo: estado_num == 1,
            ultimo_login: row.get("ultimo_login"),
            created_at: row.get("created_at"),
        });
    }

    Ok(users)
}

/// Crea un nuevo usuario y su respectiva persona dentro de una transacción.
/// - ADMINISTRADOR: puede crear cualquier rol.
/// - SUPERVISOR: SOLO puede crear RECEPCIONISTA.
/// - RECEPCIONISTA: AppError::Forbidden.
pub async fn create_user(
    pool: &SqlitePool,
    state: &AppState,
    input: CreateUserInput,
) -> Result<UserListItem, AppError> {
    let session = state.require_supervisor_or_admin().await?;

    if session.rol == UserRole::Supervisor && input.rol != UserRole::Recepcionista {
        return Err(AppError::Forbidden(
            "Supervisores solo pueden crear usuarios con rol RECEPCIONISTA.".into(),
        ));
    }

    // Validaciones de esquema de entrada
    let username = input.username.trim();
    if username.len() < 3 {
        return Err(AppError::Validation(
            "El nombre de usuario debe tener al menos 3 caracteres.".into(),
        ));
    }

    if input.password.len() < 6 {
        return Err(AppError::Validation(
            "La contraseña debe tener al menos 6 caracteres.".into(),
        ));
    }

    let mut tx = pool.begin().await?;

    // 1. Verificar si el username ya está en uso
    let existing_user = sqlx::query("SELECT id FROM usuarios_sistema WHERE username = ? COLLATE NOCASE")
        .bind(username)
        .fetch_optional(&mut *tx)
        .await?;

    if existing_user.is_some() {
        return Err(AppError::Conflict(format!(
            "El nombre de usuario '{}' ya se encuentra registrado.",
            username
        )));
    }

    // 2. Persona vinculada o nueva
    let persona_id = if let Some(pid) = input.persona_id {
        let persona_row = sqlx::query(
            r#"
            SELECT p.id, u.id AS user_id
            FROM personas p
            LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
            WHERE p.id = ?
            "#,
        )
        .bind(pid)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Persona con ID {} no existe.", pid)))?;

        let existing_uid: Option<i64> = persona_row.get("user_id");
        if existing_uid.is_some() {
            return Err(AppError::Conflict(
                "Esta persona ya tiene un usuario de sistema asignado.".into(),
            ));
        }
        pid
    } else {
        let numero_documento = input.numero_documento.trim();
        if numero_documento.is_empty() {
            return Err(AppError::Validation(
                "El número de documento no puede estar vacío.".into(),
            ));
        }

        let nombres = input.nombres.trim();
        if nombres.is_empty() {
            return Err(AppError::Validation("El nombre no puede estar vacío.".into()));
        }

        let apellidos = input.apellidos.trim();
        if apellidos.is_empty() {
            return Err(AppError::Validation("Los apellidos no pueden estar vacíos.".into()));
        }

        let tipo_doc = input.tipo_documento.trim().to_uppercase();
        let tipos_validos = ["DNI", "RUC", "CE", "PASAPORTE", "OTRO"];
        if !tipos_validos.contains(&tipo_doc.as_str()) {
            return Err(AppError::Validation(format!(
                "Tipo de documento inválido: {}. Debe ser uno de: {:?}",
                tipo_doc, tipos_validos
            )));
        }

        let persona_row = sqlx::query(
            r#"
            SELECT p.id, u.id AS user_id, u.rol_principal
            FROM personas p
            LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
            WHERE p.numero_documento = ?
            "#,
        )
        .bind(numero_documento)
        .fetch_optional(&mut *tx)
        .await?;

        match persona_row {
            Some(row) => {
                let pid: i64 = row.get("id");
                let existing_uid: Option<i64> = row.get("user_id");
                if existing_uid.is_some() {
                    return Err(AppError::Conflict(
                        "Esta persona ya tiene un usuario de sistema asignado.".into(),
                    ));
                }
                pid
            }
            None => {
                let res = sqlx::query(
                    r#"
                    INSERT INTO personas (
                        tipo_documento, numero_documento, nombres, apellidos, 
                        telefono, email, estado_activo
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                    "#,
                )
                .bind(&tipo_doc)
                .bind(numero_documento)
                .bind(nombres)
                .bind(apellidos)
                .bind(&input.telefono)
                .bind(&input.email)
                .execute(&mut *tx)
                .await?;

                res.last_insert_rowid()
            }
        }
    };

    // 3. Hashear contraseña
    let hashed_pw = hash_password(&input.password)?;
    let rol_str = input.rol.to_string();

    // 4. Insertar usuario de sistema
    let user_res = sqlx::query(
        r#"
        INSERT INTO usuarios_sistema (persona_id, username, password_hash, rol_principal, foto_perfil_data_url, estado_activo)
        VALUES (?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(persona_id)
    .bind(username)
    .bind(hashed_pw)
    .bind(&rol_str)
    .bind(&input.foto_perfil_data_url)
    .execute(&mut *tx)
    .await?;

    let new_user_id = user_res.last_insert_rowid();

    // 5. Registrar auditoría inmutable
    let audit_details = serde_json::json!({
        "nuevo_user_id": new_user_id,
        "username": username,
        "rol": rol_str,
        "persona_id": persona_id
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'USER_CREATED', 'AUTH', ?, 'LOCAL_DESKTOP')
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let created_row = sqlx::query(
        r#"
        SELECT 
            u.id, 
            u.persona_id, 
            u.username, 
            p.nombres, 
            p.apellidos, 
            p.numero_documento, 
            p.tipo_documento, 
            p.telefono,
            p.email,
            p.direccion,
            u.rol_principal, 
            u.foto_perfil_data_url,
            u.estado_activo, 
            u.ultimo_login, 
            u.created_at
        FROM usuarios_sistema u
        INNER JOIN personas p ON p.id = u.persona_id
        WHERE u.id = ?
        "#,
    )
    .bind(new_user_id)
    .fetch_one(pool)
    .await?;

    let final_rol_str: String = created_row.get("rol_principal");
    let final_rol: UserRole = final_rol_str.parse()?;

    Ok(UserListItem {
        id: created_row.get("id"),
        persona_id: created_row.get("persona_id"),
        username: created_row.get("username"),
        nombres: created_row.get("nombres"),
        apellidos: created_row.get("apellidos"),
        numero_documento: created_row.get("numero_documento"),
        tipo_documento: created_row.get("tipo_documento"),
        telefono: created_row.get("telefono"),
        email: created_row.get("email"),
        direccion: created_row.get("direccion"),
        rol: final_rol,
        foto_perfil_data_url: created_row.get("foto_perfil_data_url"),
        estado_activo: true,
        ultimo_login: created_row.get("ultimo_login"),
        created_at: created_row.get("created_at"),
    })
}

/// Actualiza los datos de un usuario del sistema y/o de su persona asociada.
/// Control jerárquico:
/// - SUPERVISOR solo puede editar RECEPCIONISTA y no puede promoverlos a SUPERVISOR o ADMINISTRADOR.
/// - ADMINISTRADOR puede editar a cualquiera (salvo alterar rol del Admin Root ID 1).
pub async fn update_user(
    pool: &SqlitePool,
    state: &AppState,
    input: UpdateUserInput,
) -> Result<UserListItem, AppError> {
    let session = state.require_supervisor_or_admin().await?;

    let target_user = sqlx::query(
        r#"
        SELECT u.id, u.persona_id, u.username, u.rol_principal, u.estado_activo,
               p.tipo_documento, p.numero_documento, p.nombres, p.apellidos,
               p.telefono, p.email, p.direccion
        FROM usuarios_sistema u
        INNER JOIN personas p ON p.id = u.persona_id
        WHERE u.id = ?
        "#,
    )
    .bind(input.user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Usuario con ID {} no encontrado.", input.user_id)))?;

    let target_role_str: String = target_user.get("rol_principal");
    let target_role: UserRole = target_role_str.parse()?;
    let persona_id: i64 = target_user.get("persona_id");

    // Control jerárquico RBAC estricto
    if session.rol == UserRole::Supervisor {
        if target_role != UserRole::Recepcionista {
            return Err(AppError::Forbidden(
                "Supervisores solo pueden modificar usuarios con rol RECEPCIONISTA.".into(),
            ));
        }
        if let Some(new_rol) = input.rol {
            if new_rol != UserRole::Recepcionista {
                return Err(AppError::Forbidden(
                    "Supervisores no pueden promover usuarios a SUPERVISOR o ADMINISTRADOR.".into(),
                ));
            }
        }
    }

    if session.rol == UserRole::Administrador && input.user_id == 1 {
        if let Some(new_rol) = input.rol {
            if new_rol != UserRole::Administrador {
                return Err(AppError::Validation(
                    "No se permite cambiar el rol del Administrador Root (ID 1).".into(),
                ));
            }
        }
    }

    let mut tx = pool.begin().await?;

    // 1. Username
    if let Some(ref new_uname) = input.username {
        let u_trimmed = new_uname.trim();
        if u_trimmed.len() < 3 {
            return Err(AppError::Validation(
                "El nombre de usuario debe tener al menos 3 caracteres.".into(),
            ));
        }
        let dup = sqlx::query(
            "SELECT id FROM usuarios_sistema WHERE username = ? COLLATE NOCASE AND id != ?",
        )
        .bind(u_trimmed)
        .bind(input.user_id)
        .fetch_optional(&mut *tx)
        .await?;
        if dup.is_some() {
            return Err(AppError::Conflict(format!(
                "El nombre de usuario '{}' ya está en uso.",
                u_trimmed
            )));
        }
        sqlx::query("UPDATE usuarios_sistema SET username = ? WHERE id = ?")
            .bind(u_trimmed)
            .bind(input.user_id)
            .execute(&mut *tx)
            .await?;
    }

    // 2. Password
    if let Some(ref new_pw) = input.new_password {
        if new_pw.trim().len() < 6 {
            return Err(AppError::Validation(
                "La contraseña debe tener al menos 6 caracteres.".into(),
            ));
        }
        let hashed = hash_password(new_pw)?;
        sqlx::query("UPDATE usuarios_sistema SET password_hash = ? WHERE id = ?")
            .bind(hashed)
            .bind(input.user_id)
            .execute(&mut *tx)
            .await?;
    }

    // 3. Rol
    if let Some(new_rol) = input.rol {
        let r_str = new_rol.to_string();
        sqlx::query("UPDATE usuarios_sistema SET rol_principal = ? WHERE id = ?")
            .bind(&r_str)
            .bind(input.user_id)
            .execute(&mut *tx)
            .await?;
    }

    // 4. Foto de perfil
    if let Some(ref photo) = input.foto_perfil_data_url {
        sqlx::query("UPDATE usuarios_sistema SET foto_perfil_data_url = ? WHERE id = ?")
            .bind(photo)
            .bind(input.user_id)
            .execute(&mut *tx)
            .await?;
    }

    // 5. Persona Data
    if let Some(ref p_upd) = input.persona_data {
        let t_doc = p_upd.tipo_documento.trim().to_uppercase();
        let n_doc = p_upd.numero_documento.trim();
        let nom = p_upd.nombres.trim();
        let ape = p_upd.apellidos.trim();

        if t_doc.is_empty() || n_doc.is_empty() || nom.is_empty() || ape.is_empty() {
            return Err(AppError::Validation(
                "Tipo y número de documento, nombres y apellidos son campos obligatorios.".into(),
            ));
        }

        let dup_doc = sqlx::query("SELECT id FROM personas WHERE numero_documento = ? AND id != ?")
            .bind(n_doc)
            .bind(persona_id)
            .fetch_optional(&mut *tx)
            .await?;
        if dup_doc.is_some() {
            return Err(AppError::Conflict(
                "Ya existe otra persona registrada con ese número de documento.".into(),
            ));
        }

        sqlx::query(
            r#"
            UPDATE personas
            SET tipo_documento = ?, numero_documento = ?, nombres = ?, apellidos = ?,
                fecha_nacimiento = ?, telefono = ?, email = ?, direccion = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
            "#,
        )
        .bind(&t_doc)
        .bind(n_doc)
        .bind(nom)
        .bind(ape)
        .bind(&p_upd.fecha_nacimiento)
        .bind(&p_upd.telefono)
        .bind(&p_upd.email)
        .bind(&p_upd.direccion)
        .bind(persona_id)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("UPDATE usuarios_sistema SET updated_at = datetime('now', 'localtime') WHERE id = ?")
        .bind(input.user_id)
        .execute(&mut *tx)
        .await?;

    let audit_details = serde_json::json!({
        "target_user_id": input.user_id,
        "persona_id": persona_id,
        "cambio_username": input.username.is_some(),
        "cambio_password": input.new_password.is_some(),
        "cambio_rol": input.rol.map(|r| r.to_string()),
        "cambio_persona": input.persona_data.is_some()
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'USER_UPDATED', 'AUTH', ?, 'LOCAL_DESKTOP')
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let row = sqlx::query(
        r#"
        SELECT 
            u.id, 
            u.persona_id, 
            u.username, 
            p.nombres, 
            p.apellidos, 
            p.numero_documento, 
            p.tipo_documento, 
            p.telefono,
            p.email,
            p.direccion,
            u.rol_principal, 
            u.foto_perfil_data_url,
            u.estado_activo, 
            u.ultimo_login, 
            u.created_at
        FROM usuarios_sistema u
        INNER JOIN personas p ON p.id = u.persona_id
        WHERE u.id = ?
        "#,
    )
    .bind(input.user_id)
    .fetch_one(pool)
    .await?;

    let r_str: String = row.get("rol_principal");
    let rol: UserRole = r_str.parse()?;
    let est_num: i64 = row.get("estado_activo");

    Ok(UserListItem {
        id: row.get("id"),
        persona_id: row.get("persona_id"),
        username: row.get("username"),
        nombres: row.get("nombres"),
        apellidos: row.get("apellidos"),
        numero_documento: row.get("numero_documento"),
        tipo_documento: row.get("tipo_documento"),
        telefono: row.get("telefono"),
        email: row.get("email"),
        direccion: row.get("direccion"),
        rol,
        foto_perfil_data_url: row.get("foto_perfil_data_url"),
        estado_activo: est_num == 1,
        ultimo_login: row.get("ultimo_login"),
        created_at: row.get("created_at"),
    })
}

/// Actualiza la foto de perfil de un usuario con control jerárquico.
/// - Un usuario puede actualizar su propia foto.
/// - SUPERVISOR puede actualizar su foto o la de un RECEPCIONISTA.
/// - ADMINISTRADOR puede actualizar la de cualquiera.
pub async fn update_user_photo(
    pool: &SqlitePool,
    state: &AppState,
    input: UpdateUserPhotoInput,
) -> Result<(), AppError> {
    let mut session = state.require_unlocked_session().await?;

    let target_row = sqlx::query("SELECT id, username, rol_principal FROM usuarios_sistema WHERE id = ?")
        .bind(input.user_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Usuario con ID {} no encontrado.", input.user_id)))?;

    let target_username: String = target_row.get("username");
    let target_rol_str: String = target_row.get("rol_principal");
    let target_rol: UserRole = target_rol_str.parse()?;

    let is_self = session.user_id == input.user_id;

    if !is_self {
        match session.rol {
            UserRole::Administrador => {
                // Permitido sobre cualquiera
            }
            UserRole::Supervisor => {
                if target_rol != UserRole::Recepcionista {
                    return Err(AppError::Forbidden(
                        "Supervisores solo pueden actualizar la foto de recepcionistas o la propia.".into(),
                    ));
                }
            }
            UserRole::Recepcionista => {
                return Err(AppError::Forbidden(
                    "Recepcionistas solo pueden actualizar su propia foto de perfil.".into(),
                ));
            }
        }
    }

    sqlx::query(
        "UPDATE usuarios_sistema SET foto_perfil_data_url = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(&input.foto_perfil_data_url)
    .bind(input.user_id)
    .execute(pool)
    .await?;

    // Si actualizó su propia foto, refrescar la sesión en memoria
    if is_self {
        session.foto_perfil_data_url = input.foto_perfil_data_url.clone();
        state.set_session(Some(session.clone())).await;
    }

    let audit_details = serde_json::json!({
        "target_user_id": input.user_id,
        "target_username": target_username,
        "has_photo": input.foto_perfil_data_url.is_some()
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "USER_PHOTO_UPDATED",
        "AUTH",
        &audit_details,
        None,
    )
    .await;

    Ok(())
}

/// Activa o desactiva un usuario del sistema con control jerárquico.
/// - ADMINISTRADOR: puede cambiar a cualquiera, salvo auto-desactivarse o ID 1.
/// - SUPERVISOR: SOLO puede cambiar a RECEPCIONISTA (bloqueado para igual o superior).
/// - RECEPCIONISTA: AppError::Forbidden.
pub async fn toggle_user_active(
    pool: &SqlitePool,
    state: &AppState,
    user_id: i64,
    active: bool,
) -> Result<(), AppError> {
    let session = state.require_supervisor_or_admin().await?;

    let target_row = sqlx::query("SELECT username, rol_principal, estado_activo FROM usuarios_sistema WHERE id = ?")
        .bind(user_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Usuario con ID {} no encontrado.", user_id)))?;

    let target_username: String = target_row.get("username");
    let target_rol_str: String = target_row.get("rol_principal");
    let target_rol: UserRole = target_rol_str.parse()?;

    // Control jerárquico estricto: SUPERVISOR solo puede activar/desactivar RECEPCIONISTA
    if session.rol == UserRole::Supervisor && target_rol != UserRole::Recepcionista {
        return Err(AppError::Forbidden(
            "Supervisores solo pueden activar o desactivar usuarios con rol RECEPCIONISTA.".into(),
        ));
    }

    // Defensa crítica: Prohibido auto-desactivarse
    if user_id == session.user_id && !active {
        return Err(AppError::Validation(
            "No se permite auto-desactivar la propia cuenta en sesión activa.".into(),
        ));
    }

    // Defensa crítica: Prohibido desactivar Administrador Root
    if user_id == 1 && !active {
        return Err(AppError::Validation(
            "No se permite desactivar la cuenta del Administrador Root (ID 1).".into(),
        ));
    }

    let active_num = if active { 1 } else { 0 };

    sqlx::query(
        "UPDATE usuarios_sistema SET estado_activo = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(active_num)
    .bind(user_id)
    .execute(pool)
    .await?;

    let audit_details = serde_json::json!({
        "target_user_id": user_id,
        "target_username": target_username,
        "nuevo_estado": active
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "USER_TOGGLE_ACTIVE",
        "AUTH",
        &audit_details,
        None,
    )
    .await;

    Ok(())
}
