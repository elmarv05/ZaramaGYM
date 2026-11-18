use crate::errors::AppError;
use crate::models::{
    AuthSession, ClientDetail, ClientFilter, ClientListItem, ClientWeightRecord,
    CompanyDetail, CompanyFilter, CompanyListItem, CreateClientInput, CreateCompanyInput,
    CreatePersonInput, CreateSupplierInput, PersonDetail, PersonFilter, PersonListItem,
    RecordWeightInput, SupplierDetail, SupplierFilter, SupplierListItem, SupplierType,
    UpdateClientInput, UpdateCompanyInput, UpdatePersonInput, UpdateSupplierInput, UserRole,
};
use crate::services::audit_service::record_audit;
use crate::services::crypto::generate_qr_token;
use rust_decimal::Decimal;
use sqlx::{QueryBuilder, Row, Sqlite, SqlitePool};

// ============================================================================
// HELPERS DE CONTROL JERÁRQUICO
// ============================================================================

/// Valida si el operador en sesión tiene autorización para acceder o alterar
/// los datos de una persona, según el rol de sistema que ésta tenga vinculado.
fn check_person_access(session: &AuthSession, target_user_role: Option<UserRole>) -> Result<(), AppError> {
    match session.rol {
        UserRole::Administrador => Ok(()),
        UserRole::Supervisor => {
            if let Some(role) = target_user_role {
                if role == UserRole::Supervisor || role == UserRole::Administrador {
                    return Err(AppError::Forbidden(
                        "No tiene privilegios para acceder o modificar a una persona con rol SUPERVISOR o ADMINISTRADOR.".into(),
                    ));
                }
            }
            Ok(())
        }
        UserRole::Recepcionista => {
            if target_user_role.is_some() {
                return Err(AppError::Forbidden(
                    "Recepcionistas solo pueden interactuar con personas sin cuenta de usuario en el sistema.".into(),
                ));
            }
            Ok(())
        }
    }
}

// ============================================================================
// 1. MÓDULO PERSONAS NATURALES
// ============================================================================

pub async fn list_persons(
    pool: &SqlitePool,
    session: &AuthSession,
    filter: &PersonFilter,
) -> Result<Vec<PersonListItem>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            p.id,
            p.tipo_documento,
            p.numero_documento,
            p.nombres,
            p.apellidos,
            p.telefono,
            p.email,
            p.estado_activo,
            p.created_at,
            (c.id IS NOT NULL) AS es_cliente,
            (prov.id IS NOT NULL) AS es_proveedor,
            u.rol_principal AS rol_usuario
        FROM personas p
        LEFT JOIN clientes c ON c.persona_id = p.id
        LEFT JOIN proveedores prov ON prov.persona_id = p.id
        LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
        WHERE 1=1
        "#,
    );

    // Filtro jerárquico estricto en SQL
    match session.rol {
        UserRole::Administrador => {}
        UserRole::Supervisor => {
            builder.push(" AND (u.id IS NULL OR u.rol_principal = 'RECEPCIONISTA')");
        }
        UserRole::Recepcionista => {
            builder.push(" AND u.id IS NULL");
        }
    }

    if let Some(ref s) = filter.search {
        let pattern = format!("%{}%", s.trim());
        if !s.trim().is_empty() {
            builder.push(" AND (p.nombres LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR p.apellidos LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR p.numero_documento LIKE ");
            builder.push_bind(pattern);
            builder.push(")");
        }
    }

    if let Some(activos) = filter.solo_activos {
        builder.push(" AND p.estado_activo = ");
        builder.push_bind(if activos { 1 } else { 0 });
    }

    builder.push(" ORDER BY p.apellidos COLLATE NOCASE ASC, p.nombres COLLATE NOCASE ASC");

    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        builder.push(" OFFSET ");
        builder.push_bind(offset.max(0));
    }

    let rows = builder.build().fetch_all(pool).await?;

    let mut list = Vec::new();
    for row in rows {
        let rol_str: Option<String> = row.get("rol_usuario");
        let rol_usuario: Option<UserRole> = match rol_str {
            Some(s) => Some(s.parse()?),
            None => None,
        };
        let estado_num: i64 = row.get("estado_activo");
        let es_cliente: i64 = row.get("es_cliente");
        let es_proveedor: i64 = row.get("es_proveedor");

        list.push(PersonListItem {
            id: row.get("id"),
            tipo_documento: row.get("tipo_documento"),
            numero_documento: row.get("numero_documento"),
            nombres: row.get("nombres"),
            apellidos: row.get("apellidos"),
            telefono: row.get("telefono"),
            email: row.get("email"),
            es_cliente: es_cliente == 1,
            es_proveedor: es_proveedor == 1,
            rol_usuario,
            estado_activo: estado_num == 1,
            created_at: row.get("created_at"),
        });
    }

    Ok(list)
}

pub async fn get_person(
    pool: &SqlitePool,
    session: &AuthSession,
    person_id: i64,
) -> Result<PersonDetail, AppError> {
    let row = sqlx::query(
        r#"
        SELECT 
            p.id,
            p.tipo_documento,
            p.numero_documento,
            p.nombres,
            p.apellidos,
            p.fecha_nacimiento,
            p.telefono,
            p.email,
            p.direccion,
            p.estado_activo,
            p.created_at,
            p.updated_at,
            c.id AS cliente_id,
            prov.id AS proveedor_id,
            u.id AS usuario_id,
            u.rol_principal AS rol_usuario
        FROM personas p
        LEFT JOIN clientes c ON c.persona_id = p.id
        LEFT JOIN proveedores prov ON prov.persona_id = p.id
        LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
        WHERE p.id = ?
        "#,
    )
    .bind(person_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Persona con ID {} no encontrada.", person_id)))?;

    let rol_str: Option<String> = row.get("rol_usuario");
    let target_role: Option<UserRole> = match rol_str {
        Some(ref s) => Some(s.parse()?),
        None => None,
    };

    check_person_access(session, target_role)?;

    let estado_num: i64 = row.get("estado_activo");
    let cliente_id: Option<i64> = row.get("cliente_id");
    let proveedor_id: Option<i64> = row.get("proveedor_id");
    let usuario_id: Option<i64> = row.get("usuario_id");

    Ok(PersonDetail {
        id: row.get("id"),
        tipo_documento: row.get("tipo_documento"),
        numero_documento: row.get("numero_documento"),
        nombres: row.get("nombres"),
        apellidos: row.get("apellidos"),
        fecha_nacimiento: row.get("fecha_nacimiento"),
        telefono: row.get("telefono"),
        email: row.get("email"),
        direccion: row.get("direccion"),
        es_cliente: cliente_id.is_some(),
        cliente_id,
        es_proveedor: proveedor_id.is_some(),
        proveedor_id,
        rol_usuario: target_role,
        usuario_id,
        estado_activo: estado_num == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn create_person(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CreatePersonInput,
) -> Result<PersonDetail, AppError> {
    let tipo_doc = input.tipo_documento.trim().to_uppercase();
    let num_doc = input.numero_documento.trim();
    let nombres = input.nombres.trim();
    let apellidos = input.apellidos.trim();

    if tipo_doc.is_empty() || num_doc.is_empty() || nombres.is_empty() || apellidos.is_empty() {
        return Err(AppError::Validation(
            "Tipo y número de documento, nombres y apellidos son campos obligatorios.".into(),
        ));
    }

    let tipos_validos = ["DNI", "RUC", "CE", "PASAPORTE", "OTRO"];
    if !tipos_validos.contains(&tipo_doc.as_str()) {
        return Err(AppError::Validation(format!(
            "Tipo de documento inválido: {}. Permitidos: {:?}",
            tipo_doc, tipos_validos
        )));
    }

    if tipo_doc == "RUC" {
        if num_doc.len() != 11 || !num_doc.chars().all(|c| c.is_ascii_digit()) {
            return Err(AppError::Validation(
                "El RUC debe constar de exactamente 11 dígitos numéricos.".into(),
            ));
        }
        if num_doc.starts_with("20") {
            return Err(AppError::Validation(
                "RUC con inicio 20 corresponde a Persona Jurídica. Debe registrarse en el módulo de Empresas.".into(),
            ));
        }
        if !num_doc.starts_with("10") && !num_doc.starts_with("15") && !num_doc.starts_with("17") {
            return Err(AppError::Validation(
                "El RUC de persona natural con negocio debe iniciar con 10, 15 o 17.".into(),
            ));
        }
    }

    let res = sqlx::query(
        r#"
        INSERT INTO personas (
            tipo_documento, numero_documento, nombres, apellidos, 
            fecha_nacimiento, telefono, email, direccion, estado_activo
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&tipo_doc)
    .bind(num_doc)
    .bind(nombres)
    .bind(apellidos)
    .bind(&input.fecha_nacimiento)
    .bind(&input.telefono)
    .bind(&input.email)
    .bind(&input.direccion)
    .execute(pool)
    .await?;

    let new_id = res.last_insert_rowid();

    let audit_details = serde_json::json!({
        "person_id": new_id,
        "numero_documento": num_doc,
        "tipo_documento": tipo_doc
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "PERSON_CREATED",
        "DIRECTORIO",
        &audit_details,
        None,
    )
    .await;

    get_person(pool, session, new_id).await
}

pub async fn update_person(
    pool: &SqlitePool,
    session: &AuthSession,
    person_id: i64,
    input: UpdatePersonInput,
) -> Result<PersonDetail, AppError> {
    // Verificar existencia y jerarquía
    let _ = get_person(pool, session, person_id).await?;

    let tipo_doc = input.tipo_documento.trim().to_uppercase();
    let num_doc = input.numero_documento.trim();
    let nombres = input.nombres.trim();
    let apellidos = input.apellidos.trim();

    if tipo_doc.is_empty() || num_doc.is_empty() || nombres.is_empty() || apellidos.is_empty() {
        return Err(AppError::Validation(
            "Tipo y número de documento, nombres y apellidos son campos obligatorios.".into(),
        ));
    }

    if tipo_doc == "RUC" {
        if num_doc.len() != 11 || !num_doc.chars().all(|c| c.is_ascii_digit()) {
            return Err(AppError::Validation(
                "El RUC debe constar de exactamente 11 dígitos numéricos.".into(),
            ));
        }
        if num_doc.starts_with("20") {
            return Err(AppError::Validation(
                "RUC con inicio 20 corresponde a Persona Jurídica. Debe registrarse en el módulo de Empresas.".into(),
            ));
        }
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
    .bind(&tipo_doc)
    .bind(num_doc)
    .bind(nombres)
    .bind(apellidos)
    .bind(&input.fecha_nacimiento)
    .bind(&input.telefono)
    .bind(&input.email)
    .bind(&input.direccion)
    .bind(person_id)
    .execute(pool)
    .await?;

    let audit_details = serde_json::json!({
        "person_id": person_id,
        "numero_documento": num_doc
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "PERSON_UPDATED",
        "DIRECTORIO",
        &audit_details,
        None,
    )
    .await;

    get_person(pool, session, person_id).await
}

pub async fn toggle_person_active(
    pool: &SqlitePool,
    session: &AuthSession,
    person_id: i64,
    active: bool,
) -> Result<(), AppError> {
    // 1. Verificar existencia y jerarquía (Rechaza con Forbidden si no tiene acceso según su rango)
    let _ = get_person(pool, session, person_id).await?;

    // 2. Defensas críticas
    if person_id == session.persona_id && !active {
        return Err(AppError::Validation(
            "No se permite auto-desactivar la persona asociada a la sesión activa.".into(),
        ));
    }

    if person_id == 1 && !active {
        return Err(AppError::Validation(
            "No se permite desactivar a la persona del Administrador Root (ID 1).".into(),
        ));
    }

    let active_num = if active { 1 } else { 0 };

    sqlx::query(
        "UPDATE personas SET estado_activo = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(active_num)
    .bind(person_id)
    .execute(pool)
    .await?;

    let audit_details = serde_json::json!({
        "person_id": person_id,
        "nuevo_estado": active
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "PERSON_TOGGLE_ACTIVE",
        "DIRECTORIO",
        &audit_details,
        None,
    )
    .await;

    Ok(())
}

// ============================================================================
// 2. MÓDULO CLIENTES Y HISTORIAL DE PESOS
// ============================================================================

pub async fn list_clients(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &ClientFilter,
) -> Result<Vec<ClientListItem>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            c.id,
            c.persona_id,
            p.tipo_documento,
            p.numero_documento,
            p.nombres,
            p.apellidos,
            p.fecha_nacimiento,
            p.telefono,
            p.email,
            p.direccion,
            c.codigo_qr_token,
            c.nombre_contacto_emergencia,
            c.numero_contacto_emergencia,
            c.notas_medicas,
            CAST(c.peso_actual_kg AS TEXT) AS peso_actual_kg,
            c.estado_activo,
            c.created_at,
            u.rol_principal AS persona_user_role
        FROM clientes c
        INNER JOIN personas p ON p.id = c.persona_id
        LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
        WHERE 1=1
        "#,
    );

    if let Some(ref s) = filter.search {
        let pattern = format!("%{}%", s.trim());
        if !s.trim().is_empty() {
            builder.push(" AND (p.nombres LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR p.apellidos LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR p.numero_documento LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR c.codigo_qr_token LIKE ");
            builder.push_bind(pattern);
            builder.push(")");
        }
    }

    if let Some(activos) = filter.solo_activos {
        builder.push(" AND c.estado_activo = ");
        builder.push_bind(if activos { 1 } else { 0 });
    }

    builder.push(" ORDER BY p.apellidos COLLATE NOCASE ASC, p.nombres COLLATE NOCASE ASC");

    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        builder.push(" OFFSET ");
        builder.push_bind(offset.max(0));
    }

    let rows = builder.build().fetch_all(pool).await?;

    let mut list = Vec::new();
    for row in rows {
        let estado_num: i64 = row.get("estado_activo");
        let peso_actual_kg: Option<Decimal> = row
            .get::<Option<String>, _>("peso_actual_kg")
            .and_then(|s| s.parse().ok());
        let rol_str: Option<String> = row.get("persona_user_role");
        let persona_rol_usuario: Option<UserRole> = match rol_str {
            Some(ref s) => s.parse().ok(),
            None => None,
        };

        list.push(ClientListItem {
            id: row.get("id"),
            persona_id: row.get("persona_id"),
            tipo_documento: row.get("tipo_documento"),
            numero_documento: row.get("numero_documento"),
            nombres: row.get("nombres"),
            apellidos: row.get("apellidos"),
            fecha_nacimiento: row.get("fecha_nacimiento"),
            telefono: row.get("telefono"),
            email: row.get("email"),
            direccion: row.get("direccion"),
            codigo_qr_token: row.get("codigo_qr_token"),
            nombre_contacto_emergencia: row.get("nombre_contacto_emergencia"),
            numero_contacto_emergencia: row.get("numero_contacto_emergencia"),
            notas_medicas: row.get("notas_medicas"),
            peso_actual_kg,
            persona_rol_usuario,
            estado_activo: estado_num == 1,
            created_at: row.get("created_at"),
        });
    }

    Ok(list)
}

pub async fn get_client(
    pool: &SqlitePool,
    _session: &AuthSession,
    client_id: i64,
) -> Result<ClientDetail, AppError> {
    let row = sqlx::query(
        r#"
        SELECT 
            c.id,
            c.persona_id,
            p.tipo_documento,
            p.numero_documento,
            p.nombres,
            p.apellidos,
            p.fecha_nacimiento,
            p.telefono,
            p.email,
            p.direccion,
            c.codigo_qr_token,
            c.nombre_contacto_emergencia,
            c.numero_contacto_emergencia,
            c.notas_medicas,
            CAST(c.peso_actual_kg AS TEXT) AS peso_actual_kg,
            c.estado_activo,
            c.created_at,
            c.updated_at,
            u.rol_principal AS persona_user_role
        FROM clientes c
        INNER JOIN personas p ON p.id = c.persona_id
        LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
        WHERE c.id = ?
        "#,
    )
    .bind(client_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Cliente con ID {} no encontrado.", client_id)))?;

    let estado_num: i64 = row.get("estado_activo");
    let peso_actual_kg: Option<Decimal> = row
        .get::<Option<String>, _>("peso_actual_kg")
        .and_then(|s| s.parse().ok());
    let rol_str: Option<String> = row.get("persona_user_role");
    let persona_rol_usuario: Option<UserRole> = match rol_str {
        Some(ref s) => s.parse().ok(),
        None => None,
    };

    Ok(ClientDetail {
        id: row.get("id"),
        persona_id: row.get("persona_id"),
        tipo_documento: row.get("tipo_documento"),
        numero_documento: row.get("numero_documento"),
        nombres: row.get("nombres"),
        apellidos: row.get("apellidos"),
        fecha_nacimiento: row.get("fecha_nacimiento"),
        telefono: row.get("telefono"),
        email: row.get("email"),
        direccion: row.get("direccion"),
        codigo_qr_token: row.get("codigo_qr_token"),
        nombre_contacto_emergencia: row.get("nombre_contacto_emergencia"),
        numero_contacto_emergencia: row.get("numero_contacto_emergencia"),
        notas_medicas: row.get("notas_medicas"),
        peso_actual_kg,
        persona_rol_usuario,
        estado_activo: estado_num == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn create_client(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CreateClientInput,
) -> Result<ClientDetail, AppError> {
    let mut tx = pool.begin().await?;

    let persona_id = if let Some(pid) = input.persona_id {
        // Verificar que la persona exista y sea accesible
        let row = sqlx::query(
            r#"
            SELECT p.id, u.rol_principal
            FROM personas p
            LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
            WHERE p.id = ?
            "#,
        )
        .bind(pid)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Persona con ID {} no existe.", pid)))?;

        let rol_str: Option<String> = row.get("rol_principal");
        let target_role: Option<UserRole> = match rol_str {
            Some(ref s) => Some(s.parse()?),
            None => None,
        };
        check_person_access(session, target_role)?;
        pid
    } else {
        // Crear o buscar por numero_documento
        let num_doc = input
            .numero_documento
            .as_deref()
            .unwrap_or("")
            .trim();
        let tipo_doc = input
            .tipo_documento
            .as_deref()
            .unwrap_or("DNI")
            .trim()
            .to_uppercase();
        let nombres = input.nombres.as_deref().unwrap_or("").trim();
        let apellidos = input.apellidos.as_deref().unwrap_or("").trim();

        if num_doc.is_empty() || nombres.is_empty() || apellidos.is_empty() {
            return Err(AppError::Validation(
                "Debe proporcionar número de documento, nombres y apellidos para inscribir al cliente.".into(),
            ));
        }

        let existing_persona = sqlx::query(
            r#"
            SELECT p.id, u.rol_principal
            FROM personas p
            LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
            WHERE p.numero_documento = ?
            "#,
        )
        .bind(num_doc)
        .fetch_optional(&mut *tx)
        .await?;

        match existing_persona {
            Some(row) => {
                let pid: i64 = row.get("id");
                let rol_str: Option<String> = row.get("rol_principal");
                let target_role: Option<UserRole> = match rol_str {
                    Some(ref s) => Some(s.parse()?),
                    None => None,
                };
                check_person_access(session, target_role)?;
                pid
            }
            None => {
                let res = sqlx::query(
                    r#"
                    INSERT INTO personas (
                        tipo_documento, numero_documento, nombres, apellidos,
                        fecha_nacimiento, telefono, email, direccion, estado_activo
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    "#,
                )
                .bind(&tipo_doc)
                .bind(num_doc)
                .bind(nombres)
                .bind(apellidos)
                .bind(&input.fecha_nacimiento)
                .bind(&input.telefono)
                .bind(&input.email)
                .bind(&input.direccion)
                .execute(&mut *tx)
                .await?;

                res.last_insert_rowid()
            }
        }
    };

    // Verificar que la persona no esté ya registrada como cliente
    let client_exists = sqlx::query("SELECT id FROM clientes WHERE persona_id = ?")
        .bind(persona_id)
        .fetch_optional(&mut *tx)
        .await?;

    if client_exists.is_some() {
        return Err(AppError::Conflict(
            "Esta persona ya se encuentra registrada como cliente en el gimnasio.".into(),
        ));
    }

    // Generar token QR criptográfico único
    let qr_token = generate_qr_token();
    let peso_inicial_str = input.peso_inicial_kg.map(|p| p.to_string());

    let client_res = sqlx::query(
        r#"
        INSERT INTO clientes (
            persona_id, codigo_qr_token, nombre_contacto_emergencia,
            numero_contacto_emergencia, notas_medicas, peso_actual_kg, estado_activo
        )
        VALUES (?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(persona_id)
    .bind(&qr_token)
    .bind(&input.nombre_contacto_emergencia)
    .bind(&input.numero_contacto_emergencia)
    .bind(&input.notas_medicas)
    .bind(peso_inicial_str)
    .execute(&mut *tx)
    .await?;

    let new_client_id = client_res.last_insert_rowid();

    // Si se especificó peso inicial > 0, registrarlo en el historial
    if let Some(peso_inicial) = input.peso_inicial_kg {
        if peso_inicial > Decimal::ZERO {
            sqlx::query(
                r#"
                INSERT INTO cliente_pesos_historial (
                    cliente_id, peso_kg, variacion_kg, nota, registrado_por_usuario_id
                )
                VALUES (?, ?, '0.00', 'Peso inicial de inscripción', ?)
                "#,
            )
            .bind(new_client_id)
            .bind(peso_inicial.to_string())
            .bind(session.user_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    let audit_details = serde_json::json!({
        "cliente_id": new_client_id,
        "persona_id": persona_id,
        "codigo_qr_token": qr_token
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'CLIENT_CREATED', 'DIRECTORIO', ?, 'LOCAL_DESKTOP')
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_client(pool, session, new_client_id).await
}

pub async fn update_client(
    pool: &SqlitePool,
    session: &AuthSession,
    client_id: i64,
    input: UpdateClientInput,
) -> Result<ClientDetail, AppError> {
    let current = get_client(pool, session, client_id).await?;

    let user_role_row = sqlx::query("SELECT rol_principal FROM usuarios_sistema WHERE persona_id = ?")
        .bind(current.persona_id)
        .fetch_optional(pool)
        .await?;
    let target_role: Option<UserRole> = match user_role_row {
        Some(r) => {
            let s: String = r.get("rol_principal");
            Some(s.parse()?)
        }
        None => None,
    };

    // Detectar si se pretenden modificar los datos personales de la tabla personas ("Caso Juan Pérez")
    let intencion_explicita = input.modificar_datos_personales;
    let intentar_modificar_personas = match intencion_explicita {
        Some(true) => true,
        Some(false) => false,
        None => {
            let tipo_doc = input.tipo_documento.trim();
            let num_doc = input.numero_documento.trim();
            let nombres = input.nombres.trim();
            let apellidos = input.apellidos.trim();

            if tipo_doc.is_empty() && num_doc.is_empty() && nombres.is_empty() && apellidos.is_empty() {
                false
            } else {
                let difiere = (tipo_doc != current.tipo_documento && !tipo_doc.is_empty())
                    || (num_doc != current.numero_documento && !num_doc.is_empty())
                    || (nombres != current.nombres && !nombres.is_empty())
                    || (apellidos != current.apellidos && !apellidos.is_empty())
                    || (input.telefono.is_some() && input.telefono != current.telefono)
                    || (input.email.is_some() && input.email != current.email)
                    || (input.direccion.is_some() && input.direccion != current.direccion)
                    || (input.fecha_nacimiento.is_some() && input.fecha_nacimiento != current.fecha_nacimiento);

                if difiere {
                    true
                } else {
                    check_person_access(session, target_role).is_ok()
                }
            }
        }
    };

    let mut tx = pool.begin().await?;

    if intentar_modificar_personas {
        // Exige validación jerárquica estricta RBAC
        check_person_access(session, target_role)?;

        let tipo_doc = if input.tipo_documento.trim().is_empty() {
            current.tipo_documento.clone()
        } else {
            input.tipo_documento.trim().to_uppercase()
        };
        let num_doc = if input.numero_documento.trim().is_empty() {
            current.numero_documento.clone()
        } else {
            input.numero_documento.trim().to_string()
        };
        let nombres = if input.nombres.trim().is_empty() {
            current.nombres.clone()
        } else {
            input.nombres.trim().to_string()
        };
        let apellidos = if input.apellidos.trim().is_empty() {
            current.apellidos.clone()
        } else {
            input.apellidos.trim().to_string()
        };

        if tipo_doc.is_empty() || num_doc.is_empty() || nombres.is_empty() || apellidos.is_empty() {
            return Err(AppError::Validation(
                "Tipo y número de documento, nombres y apellidos son campos obligatorios.".into(),
            ));
        }

        // Si cambió el número de documento, validar unicidad
        if num_doc != current.numero_documento {
            let dup = sqlx::query("SELECT id FROM personas WHERE numero_documento = ? AND id != ?")
                .bind(&num_doc)
                .bind(current.persona_id)
                .fetch_optional(&mut *tx)
                .await?;
            if dup.is_some() {
                return Err(AppError::Conflict(
                    "Ya existe otra persona registrada con ese número de documento.".into(),
                ));
            }
        }

        let (fecha_nac, telefono, email, direccion) = if intencion_explicita == Some(true) {
            (
                input
                    .fecha_nacimiento
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string),
                input
                    .telefono
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string),
                input
                    .email
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string),
                input
                    .direccion
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string),
            )
        } else {
            (
                input.fecha_nacimiento.or(current.fecha_nacimiento),
                input.telefono.or(current.telefono),
                input.email.or(current.email),
                input.direccion.or(current.direccion),
            )
        };

        // Actualizar datos personales en la tabla personas
        sqlx::query(
            r#"
            UPDATE personas
            SET tipo_documento = ?, numero_documento = ?, nombres = ?, apellidos = ?,
                fecha_nacimiento = ?, telefono = ?, email = ?, direccion = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
            "#,
        )
        .bind(&tipo_doc)
        .bind(&num_doc)
        .bind(&nombres)
        .bind(&apellidos)
        .bind(&fecha_nac)
        .bind(&telefono)
        .bind(&email)
        .bind(&direccion)
        .bind(current.persona_id)
        .execute(&mut *tx)
        .await?;
    }

    // Actualizar datos médicos y contacto de emergencia en clientes
    sqlx::query(
        r#"
        UPDATE clientes
        SET nombre_contacto_emergencia = ?, numero_contacto_emergencia = ?,
            notas_medicas = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(&input.nombre_contacto_emergencia)
    .bind(&input.numero_contacto_emergencia)
    .bind(&input.notas_medicas)
    .bind(client_id)
    .execute(&mut *tx)
    .await?;

    let audit_details = serde_json::json!({
        "cliente_id": client_id,
        "persona_id": current.persona_id,
        "modifico_personas": intentar_modificar_personas
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'CLIENT_UPDATED', 'DIRECTORIO', ?, 'LOCAL_DESKTOP')
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_client(pool, session, client_id).await
}

pub async fn toggle_client_active(
    pool: &SqlitePool,
    session: &AuthSession,
    client_id: i64,
    active: bool,
) -> Result<(), AppError> {
    let _ = get_client(pool, session, client_id).await?;

    let active_num = if active { 1 } else { 0 };

    sqlx::query(
        "UPDATE clientes SET estado_activo = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(active_num)
    .bind(client_id)
    .execute(pool)
    .await?;

    let audit_details = serde_json::json!({
        "cliente_id": client_id,
        "nuevo_estado": active
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "CLIENT_TOGGLE_ACTIVE",
        "DIRECTORIO",
        &audit_details,
        None,
    )
    .await;

    Ok(())
}

pub async fn regenerate_client_qr(
    pool: &SqlitePool,
    session: &AuthSession,
    client_id: i64,
) -> Result<String, AppError> {
    let _ = get_client(pool, session, client_id).await?;

    let new_token = generate_qr_token();

    sqlx::query(
        "UPDATE clientes SET codigo_qr_token = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(&new_token)
    .bind(client_id)
    .execute(pool)
    .await?;

    let audit_details = serde_json::json!({
        "cliente_id": client_id,
        "nuevo_qr_token": new_token
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "CLIENT_QR_REGENERATED",
        "DIRECTORIO",
        &audit_details,
        None,
    )
    .await;

    Ok(new_token)
}

pub async fn record_client_weight(
    pool: &SqlitePool,
    session: &AuthSession,
    input: RecordWeightInput,
) -> Result<ClientWeightRecord, AppError> {
    if input.peso_kg <= Decimal::ZERO {
        return Err(AppError::Validation(
            "El peso registrado debe ser un número positivo mayor que cero.".into(),
        ));
    }

    // Comprobar existencia y jerarquía
    let _ = get_client(pool, session, input.cliente_id).await?;

    let mut tx = pool.begin().await?;

    // Obtener el último peso registrado para calcular la variación
    let last_weight_row = sqlx::query(
        r#"
        SELECT CAST(peso_kg AS TEXT) AS peso_kg 
        FROM cliente_pesos_historial 
        WHERE cliente_id = ? 
        ORDER BY fecha_registro DESC, id DESC 
        LIMIT 1
        "#,
    )
    .bind(input.cliente_id)
    .fetch_optional(&mut *tx)
    .await?;

    let variacion_kg = match last_weight_row {
        Some(ref row) => {
            let last_peso_str: String = row.get("peso_kg");
            let last_peso = last_peso_str.parse::<Decimal>().unwrap_or(Decimal::ZERO);
            input.peso_kg - last_peso
        }
        None => Decimal::ZERO,
    };

    let insert_res = sqlx::query(
        r#"
        INSERT INTO cliente_pesos_historial (
            cliente_id, peso_kg, variacion_kg, nota, registrado_por_usuario_id
        )
        VALUES (?, ?, ?, ?, ?)
        "#,
    )
    .bind(input.cliente_id)
    .bind(input.peso_kg.to_string())
    .bind(variacion_kg.to_string())
    .bind(&input.nota)
    .bind(session.user_id)
    .execute(&mut *tx)
    .await?;

    let record_id = insert_res.last_insert_rowid();

    // Actualizar peso más reciente en la tabla clientes
    sqlx::query(
        "UPDATE clientes SET peso_actual_kg = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(input.peso_kg.to_string())
    .bind(input.cliente_id)
    .execute(&mut *tx)
    .await?;

    let audit_details = serde_json::json!({
        "cliente_id": input.cliente_id,
        "peso_kg": input.peso_kg.to_string(),
        "variacion_kg": variacion_kg.to_string()
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'CLIENT_WEIGHT_RECORDED', 'DIRECTORIO', ?, 'LOCAL_DESKTOP')
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
            h.id,
            h.cliente_id,
            CAST(h.peso_kg AS TEXT) AS peso_kg,
            CAST(h.variacion_kg AS TEXT) AS variacion_kg,
            h.nota,
            h.registrado_por_usuario_id,
            u.username AS registrado_por_username,
            h.fecha_registro
        FROM cliente_pesos_historial h
        LEFT JOIN usuarios_sistema u ON u.id = h.registrado_por_usuario_id
        WHERE h.id = ?
        "#,
    )
    .bind(record_id)
    .fetch_one(pool)
    .await?;

    let peso_kg_str: String = created_row.get("peso_kg");
    let variacion_kg_str: String = created_row.get("variacion_kg");

    Ok(ClientWeightRecord {
        id: created_row.get("id"),
        cliente_id: created_row.get("cliente_id"),
        peso_kg: peso_kg_str.parse().unwrap_or(Decimal::ZERO),
        variacion_kg: variacion_kg_str.parse().unwrap_or(Decimal::ZERO),
        nota: created_row.get("nota"),
        registrado_por_usuario_id: created_row.get("registrado_por_usuario_id"),
        registrado_por_username: created_row.get("registrado_por_username"),
        fecha_registro: created_row.get("fecha_registro"),
    })
}

pub async fn get_client_weight_history(
    pool: &SqlitePool,
    session: &AuthSession,
    client_id: i64,
) -> Result<Vec<ClientWeightRecord>, AppError> {
    let _ = get_client(pool, session, client_id).await?;

    let rows = sqlx::query(
        r#"
        SELECT 
            h.id,
            h.cliente_id,
            CAST(h.peso_kg AS TEXT) AS peso_kg,
            CAST(h.variacion_kg AS TEXT) AS variacion_kg,
            h.nota,
            h.registrado_por_usuario_id,
            u.username AS registrado_por_username,
            h.fecha_registro
        FROM cliente_pesos_historial h
        LEFT JOIN usuarios_sistema u ON u.id = h.registrado_por_usuario_id
        WHERE h.cliente_id = ?
        ORDER BY h.fecha_registro DESC, h.id DESC
        "#,
    )
    .bind(client_id)
    .fetch_all(pool)
    .await?;

    let mut records = Vec::new();
    for row in rows {
        let peso_kg_str: String = row.get("peso_kg");
        let variacion_kg_str: String = row.get("variacion_kg");

        records.push(ClientWeightRecord {
            id: row.get("id"),
            cliente_id: row.get("cliente_id"),
            peso_kg: peso_kg_str.parse().unwrap_or(Decimal::ZERO),
            variacion_kg: variacion_kg_str.parse().unwrap_or(Decimal::ZERO),
            nota: row.get("nota"),
            registrado_por_usuario_id: row.get("registrado_por_usuario_id"),
            registrado_por_username: row.get("registrado_por_username"),
            fecha_registro: row.get("fecha_registro"),
        });
    }

    Ok(records)
}

// ============================================================================
// 3. MÓDULO EMPRESAS JURÍDICAS RUC 20
// ============================================================================

pub async fn list_companies(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &CompanyFilter,
) -> Result<Vec<CompanyListItem>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT id, ruc, razon_social, nombre_comercial, telefono, email, estado_activo, created_at FROM empresas WHERE 1=1 ",
    );

    if let Some(ref s) = filter.search {
        let pattern = format!("%{}%", s.trim());
        if !s.trim().is_empty() {
            builder.push(" AND (ruc LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR razon_social LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR nombre_comercial LIKE ");
            builder.push_bind(pattern);
            builder.push(")");
        }
    }

    if let Some(activos) = filter.solo_activos {
        builder.push(" AND estado_activo = ");
        builder.push_bind(if activos { 1 } else { 0 });
    }

    builder.push(" ORDER BY razon_social COLLATE NOCASE ASC");

    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        builder.push(" OFFSET ");
        builder.push_bind(offset.max(0));
    }

    let rows = builder.build().fetch_all(pool).await?;

    let mut list = Vec::new();
    for row in rows {
        let estado_num: i64 = row.get("estado_activo");
        list.push(CompanyListItem {
            id: row.get("id"),
            ruc: row.get("ruc"),
            razon_social: row.get("razon_social"),
            nombre_comercial: row.get("nombre_comercial"),
            telefono: row.get("telefono"),
            email: row.get("email"),
            estado_activo: estado_num == 1,
            created_at: row.get("created_at"),
        });
    }

    Ok(list)
}

pub async fn get_company(
    pool: &SqlitePool,
    _session: &AuthSession,
    company_id: i64,
) -> Result<CompanyDetail, AppError> {
    let row = sqlx::query(
        "SELECT id, ruc, razon_social, nombre_comercial, telefono, email, direccion, estado_activo, created_at, updated_at FROM empresas WHERE id = ?",
    )
    .bind(company_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Empresa con ID {} no encontrada.", company_id)))?;

    let estado_num: i64 = row.get("estado_activo");

    Ok(CompanyDetail {
        id: row.get("id"),
        ruc: row.get("ruc"),
        razon_social: row.get("razon_social"),
        nombre_comercial: row.get("nombre_comercial"),
        telefono: row.get("telefono"),
        email: row.get("email"),
        direccion: row.get("direccion"),
        estado_activo: estado_num == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn create_company(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CreateCompanyInput,
) -> Result<CompanyDetail, AppError> {
    let ruc = input.ruc.trim();
    let razon_social = input.razon_social.trim();

    if ruc.len() != 11 || !ruc.starts_with("20") || !ruc.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::Validation(
            "El RUC de la empresa jurídica debe tener exactamente 11 dígitos numéricos e iniciar con '20'.".into(),
        ));
    }

    if razon_social.is_empty() {
        return Err(AppError::Validation(
            "La razón social de la empresa es un campo obligatorio.".into(),
        ));
    }

    let res = sqlx::query(
        r#"
        INSERT INTO empresas (
            ruc, razon_social, nombre_comercial, telefono, email, direccion, estado_activo
        )
        VALUES (?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(ruc)
    .bind(razon_social)
    .bind(&input.nombre_comercial)
    .bind(&input.telefono)
    .bind(&input.email)
    .bind(&input.direccion)
    .execute(pool)
    .await?;

    let new_id = res.last_insert_rowid();

    let audit_details = serde_json::json!({
        "company_id": new_id,
        "ruc": ruc
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "COMPANY_CREATED",
        "DIRECTORIO",
        &audit_details,
        None,
    )
    .await;

    get_company(pool, session, new_id).await
}

pub async fn update_company(
    pool: &SqlitePool,
    session: &AuthSession,
    company_id: i64,
    input: UpdateCompanyInput,
) -> Result<CompanyDetail, AppError> {
    let razon_social = input.razon_social.trim();
    if razon_social.is_empty() {
        return Err(AppError::Validation(
            "La razón social de la empresa es obligatoria.".into(),
        ));
    }

    let _ = get_company(pool, session, company_id).await?;

    sqlx::query(
        r#"
        UPDATE empresas
        SET razon_social = ?, nombre_comercial = ?, telefono = ?, email = ?,
            direccion = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(razon_social)
    .bind(&input.nombre_comercial)
    .bind(&input.telefono)
    .bind(&input.email)
    .bind(&input.direccion)
    .bind(company_id)
    .execute(pool)
    .await?;

    let audit_details = serde_json::json!({
        "company_id": company_id
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "COMPANY_UPDATED",
        "DIRECTORIO",
        &audit_details,
        None,
    )
    .await;

    get_company(pool, session, company_id).await
}

pub async fn toggle_company_active(
    pool: &SqlitePool,
    session: &AuthSession,
    company_id: i64,
    active: bool,
) -> Result<(), AppError> {
    let _ = get_company(pool, session, company_id).await?;

    let active_num = if active { 1 } else { 0 };

    sqlx::query(
        "UPDATE empresas SET estado_activo = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(active_num)
    .bind(company_id)
    .execute(pool)
    .await?;

    let audit_details = serde_json::json!({
        "company_id": company_id,
        "nuevo_estado": active
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "COMPANY_TOGGLE_ACTIVE",
        "DIRECTORIO",
        &audit_details,
        None,
    )
    .await;

    Ok(())
}

// ============================================================================
// 4. MÓDULO PROVEEDORES POLIMÓRFICOS
// ============================================================================

pub async fn list_suppliers(
    pool: &SqlitePool,
    _session: &AuthSession,
    filter: &SupplierFilter,
) -> Result<Vec<SupplierListItem>, AppError> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        r#"
        SELECT 
            pr.id,
            pr.tipo_proveedor,
            pr.persona_id,
            pr.empresa_id,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.tipo_documento ELSE 'RUC' END AS tipo_documento,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.numero_documento ELSE e.ruc END AS numero_documento,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN (p.nombres || ' ' || p.apellidos) ELSE e.razon_social END AS nombre_o_razon_social,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.nombres ELSE NULL END AS nombres,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.apellidos ELSE NULL END AS apellidos,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN NULL ELSE e.nombre_comercial END AS nombre_comercial,
            pr.rubro_o_categoria,
            pr.contacto_referencia,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.telefono ELSE e.telefono END AS telefono,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.email ELSE e.email END AS email,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.direccion ELSE e.direccion END AS direccion,
            pr.estado_activo,
            pr.created_at,
            u.rol_principal AS persona_user_role
        FROM proveedores pr
        LEFT JOIN personas p ON p.id = pr.persona_id
        LEFT JOIN empresas e ON e.id = pr.empresa_id
        LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
        WHERE 1=1
        "#,
    );

    if let Some(tipo) = filter.tipo_proveedor {
        builder.push(" AND pr.tipo_proveedor = ");
        builder.push_bind(tipo.to_string());
    }

    if let Some(ref s) = filter.search {
        let pattern = format!("%{}%", s.trim());
        if !s.trim().is_empty() {
            builder.push(" AND (");
            builder.push("(pr.tipo_proveedor = 'PERSONA_NATURAL' AND (p.nombres LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR p.apellidos LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR p.numero_documento LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(")) OR ");
            builder.push("(pr.tipo_proveedor = 'EMPRESA' AND (e.razon_social LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR e.nombre_comercial LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR e.ruc LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(")) OR pr.rubro_o_categoria LIKE ");
            builder.push_bind(pattern);
            builder.push(")");
        }
    }

    if let Some(activos) = filter.solo_activos {
        builder.push(" AND pr.estado_activo = ");
        builder.push_bind(if activos { 1 } else { 0 });
    }

    builder.push(" ORDER BY pr.id ASC");

    let limit = filter.limit.unwrap_or(100).clamp(1, 500);
    builder.push(" LIMIT ");
    builder.push_bind(limit);

    if let Some(offset) = filter.offset {
        builder.push(" OFFSET ");
        builder.push_bind(offset.max(0));
    }

    let rows = builder.build().fetch_all(pool).await?;

    let mut list = Vec::new();
    for row in rows {
        let tipo_str: String = row.get("tipo_proveedor");
        let tipo: SupplierType = tipo_str.parse()?;
        let estado_num: i64 = row.get("estado_activo");
        let rol_str: Option<String> = row.get("persona_user_role");
        let persona_rol_usuario: Option<UserRole> = match rol_str {
            Some(ref s) => s.parse().ok(),
            None => None,
        };

        list.push(SupplierListItem {
            id: row.get("id"),
            tipo_proveedor: tipo,
            persona_id: row.get("persona_id"),
            empresa_id: row.get("empresa_id"),
            tipo_documento: row.get("tipo_documento"),
            numero_documento: row.get("numero_documento"),
            nombre_o_razon_social: row.get("nombre_o_razon_social"),
            nombres: row.get("nombres"),
            apellidos: row.get("apellidos"),
            nombre_comercial: row.get("nombre_comercial"),
            rubro_o_categoria: row.get("rubro_o_categoria"),
            contacto_referencia: row.get("contacto_referencia"),
            telefono: row.get("telefono"),
            email: row.get("email"),
            direccion: row.get("direccion"),
            persona_rol_usuario,
            estado_activo: estado_num == 1,
            created_at: row.get("created_at"),
        });
    }

    Ok(list)
}

pub async fn get_supplier(
    pool: &SqlitePool,
    _session: &AuthSession,
    supplier_id: i64,
) -> Result<SupplierDetail, AppError> {
    let row = sqlx::query(
        r#"
        SELECT 
            pr.id,
            pr.tipo_proveedor,
            pr.persona_id,
            pr.empresa_id,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.tipo_documento ELSE 'RUC' END AS tipo_documento,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.numero_documento ELSE e.ruc END AS numero_documento,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN (p.nombres || ' ' || p.apellidos) ELSE e.razon_social END AS nombre_o_razon_social,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.nombres ELSE NULL END AS nombres,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.apellidos ELSE NULL END AS apellidos,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN NULL ELSE e.nombre_comercial END AS nombre_comercial,
            pr.rubro_o_categoria,
            pr.contacto_referencia,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.telefono ELSE e.telefono END AS telefono,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.email ELSE e.email END AS email,
            CASE WHEN pr.tipo_proveedor = 'PERSONA_NATURAL' THEN p.direccion ELSE e.direccion END AS direccion,
            pr.estado_activo,
            pr.created_at,
            pr.updated_at,
            u.rol_principal AS persona_user_role
        FROM proveedores pr
        LEFT JOIN personas p ON p.id = pr.persona_id
        LEFT JOIN empresas e ON e.id = pr.empresa_id
        LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
        WHERE pr.id = ?
        "#,
    )
    .bind(supplier_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("Proveedor con ID {} no encontrado.", supplier_id)))?;

    let tipo_str: String = row.get("tipo_proveedor");
    let tipo: SupplierType = tipo_str.parse()?;

    let estado_num: i64 = row.get("estado_activo");
    let rol_str: Option<String> = row.get("persona_user_role");
    let persona_rol_usuario: Option<UserRole> = match rol_str {
        Some(ref s) => s.parse().ok(),
        None => None,
    };

    Ok(SupplierDetail {
        id: row.get("id"),
        tipo_proveedor: tipo,
        persona_id: row.get("persona_id"),
        empresa_id: row.get("empresa_id"),
        tipo_documento: row.get("tipo_documento"),
        numero_documento: row.get("numero_documento"),
        nombre_o_razon_social: row.get("nombre_o_razon_social"),
        nombres: row.get("nombres"),
        apellidos: row.get("apellidos"),
        nombre_comercial: row.get("nombre_comercial"),
        rubro_o_categoria: row.get("rubro_o_categoria"),
        contacto_referencia: row.get("contacto_referencia"),
        telefono: row.get("telefono"),
        email: row.get("email"),
        direccion: row.get("direccion"),
        persona_rol_usuario,
        estado_activo: estado_num == 1,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn create_supplier(
    pool: &SqlitePool,
    session: &AuthSession,
    input: CreateSupplierInput,
) -> Result<SupplierDetail, AppError> {
    let mut tx = pool.begin().await?;

    let (new_supplier_id, audit_tipo, pid_opt, eid_opt) = match input.tipo_proveedor {
        SupplierType::PersonaNatural => {
            if input.empresa_id.is_some() || input.empresa_data.is_some() {
                return Err(AppError::Validation(
                    "Un proveedor de tipo PERSONA_NATURAL no puede tener empresa_id ni empresa_data.".into(),
                ));
            }

            let pid = if let Some(pid_in) = input.persona_id {
                let p_row = sqlx::query(
                    r#"
                    SELECT p.id, u.rol_principal
                    FROM personas p
                    LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
                    WHERE p.id = ?
                    "#,
                )
                .bind(pid_in)
                .fetch_optional(&mut *tx)
                .await?
                .ok_or_else(|| AppError::NotFound(format!("Persona con ID {} no existe.", pid_in)))?;

                let rol_str: Option<String> = p_row.get("rol_principal");
                let target_role: Option<UserRole> = match rol_str {
                    Some(ref s) => Some(s.parse()?),
                    None => None,
                };
                check_person_access(session, target_role)?;
                pid_in
            } else if let Some(pdata) = input.persona_data {
                let num_doc = pdata.numero_documento.trim();
                let tipo_doc = pdata.tipo_documento.trim().to_uppercase();
                let nombres = pdata.nombres.trim();
                let apellidos = pdata.apellidos.trim();

                if num_doc.is_empty() || nombres.is_empty() || apellidos.is_empty() {
                    return Err(AppError::Validation(
                        "Debe proporcionar número de documento, nombres y apellidos para registrar al proveedor.".into(),
                    ));
                }

                let existing = sqlx::query(
                    r#"
                    SELECT p.id, u.rol_principal
                    FROM personas p
                    LEFT JOIN usuarios_sistema u ON u.persona_id = p.id
                    WHERE p.numero_documento = ?
                    "#,
                )
                .bind(num_doc)
                .fetch_optional(&mut *tx)
                .await?;

                match existing {
                    Some(row) => {
                        let existing_id: i64 = row.get("id");
                        let rol_str: Option<String> = row.get("rol_principal");
                        let target_role: Option<UserRole> = match rol_str {
                            Some(ref s) => Some(s.parse()?),
                            None => None,
                        };
                        check_person_access(session, target_role)?;
                        existing_id
                    }
                    None => {
                        let res = sqlx::query(
                            r#"
                            INSERT INTO personas (
                                tipo_documento, numero_documento, nombres, apellidos,
                                fecha_nacimiento, telefono, email, direccion, estado_activo
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                            "#,
                        )
                        .bind(&tipo_doc)
                        .bind(num_doc)
                        .bind(nombres)
                        .bind(apellidos)
                        .bind(&pdata.fecha_nacimiento)
                        .bind(&pdata.telefono)
                        .bind(&pdata.email)
                        .bind(&pdata.direccion)
                        .execute(&mut *tx)
                        .await?;

                        res.last_insert_rowid()
                    }
                }
            } else {
                return Err(AppError::Validation(
                    "Debe seleccionar una persona existente o ingresar los datos de la nueva persona.".into(),
                ));
            };

            let prov_exists = sqlx::query("SELECT id FROM proveedores WHERE persona_id = ?")
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await?;

            if prov_exists.is_some() {
                return Err(AppError::Conflict(
                    "Esta persona ya está registrada como proveedor.".into(),
                ));
            }

            let res = sqlx::query(
                r#"
                INSERT INTO proveedores (
                    tipo_proveedor, persona_id, empresa_id, rubro_o_categoria,
                    contacto_referencia, estado_activo
                )
                VALUES ('PERSONA_NATURAL', ?, NULL, ?, ?, 1)
                "#,
            )
            .bind(pid)
            .bind(&input.rubro_o_categoria)
            .bind(&input.contacto_referencia)
            .execute(&mut *tx)
            .await?;

            (res.last_insert_rowid(), "PERSONA_NATURAL", Some(pid), None)
        }
        SupplierType::Empresa => {
            if input.persona_id.is_some() || input.persona_data.is_some() {
                return Err(AppError::Validation(
                    "Un proveedor de tipo EMPRESA no puede tener persona_id ni persona_data.".into(),
                ));
            }

            let eid = if let Some(eid_in) = input.empresa_id {
                let e_row = sqlx::query("SELECT id FROM empresas WHERE id = ?")
                    .bind(eid_in)
                    .fetch_optional(&mut *tx)
                    .await?
                    .ok_or_else(|| AppError::NotFound(format!("Empresa con ID {} no existe.", eid_in)))?;
                let id: i64 = e_row.get("id");
                id
            } else if let Some(edata) = input.empresa_data {
                let ruc = edata.ruc.trim();
                let razon_social = edata.razon_social.trim();

                if ruc.len() != 11 || !ruc.starts_with("20") || !ruc.chars().all(|c| c.is_ascii_digit()) {
                    return Err(AppError::Validation(
                        "El RUC de la empresa jurídica debe tener exactamente 11 dígitos numéricos e iniciar con '20'.".into(),
                    ));
                }

                if razon_social.is_empty() {
                    return Err(AppError::Validation(
                        "La razón social de la empresa es un campo obligatorio.".into(),
                    ));
                }

                let existing = sqlx::query("SELECT id FROM empresas WHERE ruc = ?")
                    .bind(ruc)
                    .fetch_optional(&mut *tx)
                    .await?;

                match existing {
                    Some(row) => row.get("id"),
                    None => {
                        let res = sqlx::query(
                            r#"
                            INSERT INTO empresas (
                                ruc, razon_social, nombre_comercial, telefono, email, direccion, estado_activo
                            )
                            VALUES (?, ?, ?, ?, ?, ?, 1)
                            "#,
                        )
                        .bind(ruc)
                        .bind(razon_social)
                        .bind(&edata.nombre_comercial)
                        .bind(&edata.telefono)
                        .bind(&edata.email)
                        .bind(&edata.direccion)
                        .execute(&mut *tx)
                        .await?;

                        res.last_insert_rowid()
                    }
                }
            } else {
                return Err(AppError::Validation(
                    "Debe seleccionar una empresa existente o ingresar los datos de la nueva empresa.".into(),
                ));
            };

            let prov_exists = sqlx::query("SELECT id FROM proveedores WHERE empresa_id = ?")
                .bind(eid)
                .fetch_optional(&mut *tx)
                .await?;

            if prov_exists.is_some() {
                return Err(AppError::Conflict(
                    "Esta empresa ya está registrada como proveedor.".into(),
                ));
            }

            let res = sqlx::query(
                r#"
                INSERT INTO proveedores (
                    tipo_proveedor, persona_id, empresa_id, rubro_o_categoria,
                    contacto_referencia, estado_activo
                )
                VALUES ('EMPRESA', NULL, ?, ?, ?, 1)
                "#,
            )
            .bind(eid)
            .bind(&input.rubro_o_categoria)
            .bind(&input.contacto_referencia)
            .execute(&mut *tx)
            .await?;

            (res.last_insert_rowid(), "EMPRESA", None, Some(eid))
        }
    };

    let audit_details = serde_json::json!({
        "supplier_id": new_supplier_id,
        "tipo_proveedor": audit_tipo,
        "persona_id": pid_opt,
        "empresa_id": eid_opt
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'SUPPLIER_CREATED', 'DIRECTORIO', ?, 'LOCAL_DESKTOP')
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_supplier(pool, session, new_supplier_id).await
}

pub async fn update_supplier(
    pool: &SqlitePool,
    session: &AuthSession,
    supplier_id: i64,
    input: UpdateSupplierInput,
) -> Result<SupplierDetail, AppError> {
    let current = get_supplier(pool, session, supplier_id).await?;

    let mut tx = pool.begin().await?;

    // Actualizar campos propios de proveedores
    sqlx::query(
        r#"
        UPDATE proveedores
        SET rubro_o_categoria = ?, contacto_referencia = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
        "#,
    )
    .bind(&input.rubro_o_categoria)
    .bind(&input.contacto_referencia)
    .bind(supplier_id)
    .execute(&mut *tx)
    .await?;

    // Edición dual: si se enviaron datos de persona
    if let Some(ref p_upd) = input.persona_data {
        if current.tipo_proveedor != SupplierType::PersonaNatural {
            return Err(AppError::Validation(
                "No se pueden actualizar datos de persona en un proveedor de tipo EMPRESA.".into(),
            ));
        }

        let pid = current.persona_id.ok_or_else(|| {
            AppError::NotFound("Proveedor no tiene persona_id asociado.".into())
        })?;

        // Protección "Caso Juan Pérez": si la persona tiene rol de sistema
        let user_role_row = sqlx::query("SELECT rol_principal FROM usuarios_sistema WHERE persona_id = ?")
            .bind(pid)
            .fetch_optional(&mut *tx)
            .await?;

        let target_role: Option<UserRole> = match user_role_row {
            Some(r) => {
                let s: String = r.get("rol_principal");
                Some(s.parse()?)
            }
            None => None,
        };
        check_person_access(session, target_role)?;

        let tipo_doc = p_upd.tipo_documento.trim().to_uppercase();
        let num_doc = p_upd.numero_documento.trim();
        let nombres = p_upd.nombres.trim();
        let apellidos = p_upd.apellidos.trim();

        if tipo_doc.is_empty() || num_doc.is_empty() || nombres.is_empty() || apellidos.is_empty() {
            return Err(AppError::Validation(
                "Tipo y número de documento, nombres y apellidos son campos obligatorios.".into(),
            ));
        }

        // Si cambió el número de documento, validar que no choque con otra persona
        if num_doc != current.numero_documento {
            let dup = sqlx::query("SELECT id FROM personas WHERE numero_documento = ? AND id != ?")
                .bind(num_doc)
                .bind(pid)
                .fetch_optional(&mut *tx)
                .await?;
            if dup.is_some() {
                return Err(AppError::Conflict(
                    "Ya existe otra persona registrada con ese número de documento.".into(),
                ));
            }
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
        .bind(&tipo_doc)
        .bind(num_doc)
        .bind(nombres)
        .bind(apellidos)
        .bind(&p_upd.fecha_nacimiento)
        .bind(&p_upd.telefono)
        .bind(&p_upd.email)
        .bind(&p_upd.direccion)
        .bind(pid)
        .execute(&mut *tx)
        .await?;
    }

    // Edición dual: si se enviaron datos de empresa
    if let Some(ref e_upd) = input.empresa_data {
        if current.tipo_proveedor != SupplierType::Empresa {
            return Err(AppError::Validation(
                "No se pueden actualizar datos de empresa en un proveedor de tipo PERSONA_NATURAL.".into(),
            ));
        }

        let eid = current.empresa_id.ok_or_else(|| {
            AppError::NotFound("Proveedor no tiene empresa_id asociado.".into())
        })?;

        let razon_social = e_upd.razon_social.trim();
        if razon_social.is_empty() {
            return Err(AppError::Validation(
                "La razón social de la empresa es obligatoria.".into(),
            ));
        }

        sqlx::query(
            r#"
            UPDATE empresas
            SET razon_social = ?, nombre_comercial = ?, telefono = ?, email = ?,
                direccion = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
            "#,
        )
        .bind(razon_social)
        .bind(&e_upd.nombre_comercial)
        .bind(&e_upd.telefono)
        .bind(&e_upd.email)
        .bind(&e_upd.direccion)
        .bind(eid)
        .execute(&mut *tx)
        .await?;
    }

    let audit_details = serde_json::json!({
        "supplier_id": supplier_id,
        "modifico_persona": input.persona_data.is_some(),
        "modifico_empresa": input.empresa_data.is_some()
    })
    .to_string();

    sqlx::query(
        r#"
        INSERT INTO auditoria_logs (usuario_id, username, accion, modulo, detalles_json, ip_o_terminal)
        VALUES (?, ?, 'SUPPLIER_UPDATED', 'DIRECTORIO', ?, 'LOCAL_DESKTOP')
        "#,
    )
    .bind(session.user_id)
    .bind(&session.username)
    .bind(&audit_details)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    get_supplier(pool, session, supplier_id).await
}

pub async fn toggle_supplier_active(
    pool: &SqlitePool,
    session: &AuthSession,
    supplier_id: i64,
    active: bool,
) -> Result<(), AppError> {
    let _ = get_supplier(pool, session, supplier_id).await?;

    let active_num = if active { 1 } else { 0 };

    sqlx::query(
        "UPDATE proveedores SET estado_activo = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
    )
    .bind(active_num)
    .bind(supplier_id)
    .execute(pool)
    .await?;

    let audit_details = serde_json::json!({
        "supplier_id": supplier_id,
        "nuevo_estado": active
    })
    .to_string();

    let _ = record_audit(
        pool,
        Some(session.user_id),
        &session.username,
        "SUPPLIER_TOGGLE_ACTIVE",
        "DIRECTORIO",
        &audit_details,
        None,
    )
    .await;

    Ok(())
}
