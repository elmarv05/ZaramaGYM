use rust_decimal::Decimal;
use zarama_gym_lib::db::init_db;
use zarama_gym_lib::errors::AppError;
use zarama_gym_lib::models::{
    CreateClientInput, CreateCompanyInput, CreatePersonInput, CreateSupplierInput,
    CreateUserInput, LoginCredentials, PersonFilter, RecordWeightInput, SupplierFilter,
    SupplierType, UpdateClientInput, UpdateCompanyInput, UpdatePersonInput, UpdateSupplierInput,
    UpdateUserInput, UserRole,
};
use zarama_gym_lib::services::{auth_service, entity_service};
use zarama_gym_lib::state::AppState;

/// Helper para crear un entorno aislado con base de datos en archivo temporal
async fn setup_test_env() -> (AppState, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().expect("Error creando directorio temporal");
    let db_path = temp_dir.path().join("test_zaramagym_slice2.db");
    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    let pool = init_db(&db_url)
        .await
        .expect("Error inicializando SQLite de pruebas");
    let state = AppState::new(pool);
    (state, temp_dir)
}

#[tokio::test]
async fn test_exact_5_persons_scenario_hierarchical_visibility_and_crud() {
    let (state, _temp_dir) = setup_test_env().await;

    // 1. Iniciar sesión como ADMINISTRADOR (Persona 1: Admin, ID 1 creada en el seed)
    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // 2. Crear Persona 2: Supervisor (sup1)
    let sup_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "sup1".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "22222222".into(),
            nombres: "Santiago".into(),
            apellidos: "Supervisor".into(),
            telefono: None,
            email: None,
            rol: UserRole::Supervisor,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    // 3. Crear Persona 3: Recepcionista (rec1)
    let rec_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "rec1".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "33333333".into(),
            nombres: "Rodrigo".into(),
            apellidos: "Recepcionista".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    // 4. Crear Persona 4: Cliente A (sin usuario del sistema)
    let client_a = entity_service::create_client(
        &state.pool(),
        &admin_session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("44444444".into()),
            nombres: Some("Carlos".into()),
            apellidos: Some("Cliente".into()),
            fecha_nacimiento: Some("1995-04-10".into()),
            telefono: Some("987111222".into()),
            email: Some("carlos@gmail.com".into()),
            direccion: Some("Av. Principal 123".into()),
            nombre_contacto_emergencia: Some("Maria Cliente".into()),
            numero_contacto_emergencia: Some("987333444".into()),
            notas_medicas: Some("Ninguna".into()),
            peso_inicial_kg: None,
        },
    )
    .await
    .unwrap();

    // 5. Crear Persona 5: Cliente B (sin usuario del sistema)
    let client_b = entity_service::create_client(
        &state.pool(),
        &admin_session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("55555555".into()),
            nombres: Some("Lucia".into()),
            apellidos: Some("Cliente".into()),
            fecha_nacimiento: Some("1998-08-20".into()),
            telefono: Some("987555666".into()),
            email: Some("lucia@gmail.com".into()),
            direccion: Some("Calle Secundaria 456".into()),
            nombre_contacto_emergencia: Some("Jorge Cliente".into()),
            numero_contacto_emergencia: Some("987777888".into()),
            notas_medicas: Some("Alergia a la penicilina".into()),
            peso_inicial_kg: None,
        },
    )
    .await
    .unwrap();

    // =========================================================================
    // VERIFICACIÓN 1: ADMINISTRADOR VE LAS 5 PERSONAS
    // =========================================================================
    let admin_persons = entity_service::list_persons(&state.pool(), &admin_session, &PersonFilter::default())
        .await
        .unwrap();
    assert_eq!(admin_persons.len(), 5, "Administrador debe ver las 5 personas");

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // =========================================================================
    // VERIFICACIÓN 2: SUPERVISOR VE EXACTAMENTE 3 PERSONAS (2 Clientes + Recepcionista)
    // =========================================================================
    let sup_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "sup1".into(),
            password: "password123".into(),
        },
    )
    .await
    .unwrap();

    let sup_persons = entity_service::list_persons(&state.pool(), &sup_session, &PersonFilter::default())
        .await
        .unwrap();
    assert_eq!(
        sup_persons.len(),
        3,
        "Supervisor debe ver exactamente 3 personas: 2 clientes + 1 recepcionista"
    );

    let sup_doc_list: Vec<String> = sup_persons.iter().map(|p| p.numero_documento.clone()).collect();
    assert!(sup_doc_list.contains(&"33333333".to_string()), "Debe ver al recepcionista");
    assert!(sup_doc_list.contains(&"44444444".to_string()), "Debe ver al cliente A");
    assert!(sup_doc_list.contains(&"55555555".to_string()), "Debe ver al cliente B");
    assert!(!sup_doc_list.contains(&"00000000".to_string()), "NO debe ver al Admin");
    assert!(!sup_doc_list.contains(&"22222222".to_string()), "NO debe ver al Supervisor");

    // Supervisor tiene acceso CRUD sobre la persona del Recepcionista
    let rec_person_detail = entity_service::get_person(&state.pool(), &sup_session, rec_user.persona_id)
        .await
        .expect("Supervisor debe poder consultar al recepcionista");
    assert_eq!(rec_person_detail.numero_documento, "33333333");

    let updated_rec = entity_service::update_person(
        &state.pool(),
        &sup_session,
        rec_user.persona_id,
        UpdatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "33333333".into(),
            nombres: "Rodrigo Editado".into(),
            apellidos: "Recepcionista".into(),
            fecha_nacimiento: None,
            telefono: Some("987000111".into()),
            email: None,
            direccion: None,
        },
    )
    .await;
    assert!(updated_rec.is_ok(), "Supervisor debe poder editar al recepcionista");

    // Supervisor intenta consultar, editar o desactivar al Admin o Supervisor -> Forbidden
    let bad_sup_get_admin = entity_service::get_person(&state.pool(), &sup_session, 1).await;
    assert!(matches!(bad_sup_get_admin.unwrap_err(), AppError::Forbidden(_)));

    let bad_sup_update_admin = entity_service::update_person(
        &state.pool(),
        &sup_session,
        1,
        UpdatePersonInput {
            tipo_documento: "DNI".into(),
            numero_documento: "00000000".into(),
            nombres: "Hacked".into(),
            apellidos: "Admin".into(),
            fecha_nacimiento: None,
            telefono: None,
            email: None,
            direccion: None,
        },
    )
    .await;
    assert!(matches!(bad_sup_update_admin.unwrap_err(), AppError::Forbidden(_)));

    let bad_sup_toggle_admin = entity_service::toggle_person_active(&state.pool(), &sup_session, 1, false).await;
    assert!(matches!(bad_sup_toggle_admin.unwrap_err(), AppError::Forbidden(_)));

    let bad_sup_toggle_sup = entity_service::toggle_person_active(&state.pool(), &sup_session, sup_user.persona_id, false).await;
    assert!(matches!(bad_sup_toggle_sup.unwrap_err(), AppError::Forbidden(_)));

    auth_service::logout(&state.pool(), &state).await.unwrap();

    // =========================================================================
    // VERIFICACIÓN 3: RECEPCIONISTA VE EXACTAMENTE 2 PERSONAS (Solo los 2 Clientes)
    // =========================================================================
    let rec_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "rec1".into(),
            password: "password123".into(),
        },
    )
    .await
    .unwrap();

    let rec_persons = entity_service::list_persons(&state.pool(), &rec_session, &PersonFilter::default())
        .await
        .unwrap();
    assert_eq!(
        rec_persons.len(),
        2,
        "Recepcionista debe ver exactamente 2 personas: únicamente clientes sin rol de sistema"
    );

    let rec_doc_list: Vec<String> = rec_persons.iter().map(|p| p.numero_documento.clone()).collect();
    assert!(rec_doc_list.contains(&"44444444".to_string()));
    assert!(rec_doc_list.contains(&"55555555".to_string()));
    assert!(!rec_doc_list.contains(&"33333333".to_string()), "NO debe ver a recepcionistas");
    assert!(!rec_doc_list.contains(&"22222222".to_string()), "NO debe ver a supervisores");
    assert!(!rec_doc_list.contains(&"00000000".to_string()), "NO debe ver a administradores");

    // Recepcionista intenta consultar a cualquier usuario de sistema -> Forbidden
    let bad_rec_get_rec = entity_service::get_person(&state.pool(), &rec_session, rec_user.persona_id).await;
    assert!(matches!(bad_rec_get_rec.unwrap_err(), AppError::Forbidden(_)));

    let bad_rec_get_sup = entity_service::get_person(&state.pool(), &rec_session, sup_user.persona_id).await;
    assert!(matches!(bad_rec_get_sup.unwrap_err(), AppError::Forbidden(_)));

    let bad_rec_get_admin = entity_service::get_person(&state.pool(), &rec_session, 1).await;
    assert!(matches!(bad_rec_get_admin.unwrap_err(), AppError::Forbidden(_)));

    // Recepcionista SÍ puede consultar a los clientes (personas naturales sin rol de usuario)
    let ok_client_a = entity_service::get_person(&state.pool(), &rec_session, client_a.persona_id).await;
    assert!(ok_client_a.is_ok());
    let ok_client_b = entity_service::get_person(&state.pool(), &rec_session, client_b.persona_id).await;
    assert!(ok_client_b.is_ok());
}

#[tokio::test]
async fn test_client_creation_emergency_contacts_medical_notes_and_weight_history() {
    let (state, _temp_dir) = setup_test_env().await;

    let session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    let initial_weight = Decimal::new(8000, 2); // 80.00 kg

    // 1. Inscribir Cliente con contacto de emergencia, notas médicas y peso inicial
    let client = entity_service::create_client(
        &state.pool(),
        &session,
        CreateClientInput {
            persona_id: None,
            tipo_documento: Some("DNI".into()),
            numero_documento: Some("76543210".into()),
            nombres: Some("Mateo".into()),
            apellidos: Some("Garrido".into()),
            fecha_nacimiento: Some("1992-11-05".into()),
            telefono: Some("987654321".into()),
            email: Some("mateo@gym.com".into()),
            direccion: Some("Calle Los Alamos 789".into()),
            nombre_contacto_emergencia: Some("Patricia Garrido".into()),
            numero_contacto_emergencia: Some("987112233".into()),
            notas_medicas: Some("Hipertensión controlada, evitar sobreesfuerzo cardiovascular brusco".into()),
            peso_inicial_kg: Some(initial_weight),
        },
    )
    .await
    .expect("Debe crear cliente con salud y peso inicial");

    assert_eq!(client.nombre_contacto_emergencia.as_deref(), Some("Patricia Garrido"));
    assert_eq!(client.numero_contacto_emergencia.as_deref(), Some("987112233"));
    assert_eq!(client.notas_medicas.as_deref(), Some("Hipertensión controlada, evitar sobreesfuerzo cardiovascular brusco"));
    assert_eq!(client.peso_actual_kg, Some(initial_weight));
    assert!(client.codigo_qr_token.starts_with("ZG-"));
    assert_eq!(client.codigo_qr_token.len(), 19);

    // 2. Verificar que se insertó el peso inicial con variación 0.00
    let history_1 = entity_service::get_client_weight_history(&state.pool(), &session, client.id)
        .await
        .unwrap();
    assert_eq!(history_1.len(), 1);
    assert_eq!(history_1[0].peso_kg, initial_weight);
    assert_eq!(history_1[0].variacion_kg, Decimal::ZERO);
    assert_eq!(history_1[0].nota.as_deref(), Some("Peso inicial de inscripción"));

    // 3. Segunda medición: 77.50 kg (Variación: -2.50 kg)
    let weight_2 = Decimal::new(7750, 2);
    let record_2 = entity_service::record_client_weight(
        &state.pool(),
        &session,
        RecordWeightInput {
            cliente_id: client.id,
            peso_kg: weight_2,
            nota: Some("Control semana 4: déficit calórico exitoso".into()),
        },
    )
    .await
    .unwrap();

    let expected_var_2 = Decimal::new(-250, 2); // -2.50
    assert_eq!(record_2.peso_kg, weight_2);
    assert_eq!(record_2.variacion_kg, expected_var_2);

    let client_after_2 = entity_service::get_client(&state.pool(), &session, client.id).await.unwrap();
    assert_eq!(client_after_2.peso_actual_kg, Some(weight_2));

    // 4. Tercera medición: 78.20 kg (Variación: +0.70 kg respecto a 77.50)
    let weight_3 = Decimal::new(7820, 2);
    let record_3 = entity_service::record_client_weight(
        &state.pool(),
        &session,
        RecordWeightInput {
            cliente_id: client.id,
            peso_kg: weight_3,
            nota: Some("Aumento de masa muscular".into()),
        },
    )
    .await
    .unwrap();

    let expected_var_3 = Decimal::new(70, 2); // +0.70
    assert_eq!(record_3.peso_kg, weight_3);
    assert_eq!(record_3.variacion_kg, expected_var_3);

    let client_after_3 = entity_service::get_client(&state.pool(), &session, client.id).await.unwrap();
    assert_eq!(client_after_3.peso_actual_kg, Some(weight_3));

    // 5. Historial completo (3 mediciones ordenadas cronológicamente DESC)
    let full_history = entity_service::get_client_weight_history(&state.pool(), &session, client.id)
        .await
        .unwrap();

    assert_eq!(full_history.len(), 3);
    assert_eq!(full_history[0].peso_kg, weight_3);
    assert_eq!(full_history[0].variacion_kg, expected_var_3);
    assert_eq!(full_history[1].peso_kg, weight_2);
    assert_eq!(full_history[1].variacion_kg, expected_var_2);
    assert_eq!(full_history[2].peso_kg, initial_weight);
    assert_eq!(full_history[2].variacion_kg, Decimal::ZERO);

    // 6. Regenerar token QR
    let prev_token = client.codigo_qr_token.clone();
    let new_token = entity_service::regenerate_client_qr(&state.pool(), &session, client.id)
        .await
        .unwrap();
    assert_ne!(prev_token, new_token);
    assert!(new_token.starts_with("ZG-"));
    assert_eq!(new_token.len(), 19);
}

#[tokio::test]
async fn test_suppliers_polymorphism_and_ruc20_company_validations() {
    let (state, _temp_dir) = setup_test_env().await;

    let session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // 1. Crear Empresa Jurídica RUC 20 válida
    let company = entity_service::create_company(
        &state.pool(),
        &session,
        CreateCompanyInput {
            ruc: "20608889991".into(),
            razon_social: "Distribuidora de Suplementos Lima S.A.C.".into(),
            nombre_comercial: Some("LimaSupplements".into()),
            telefono: Some("014567890".into()),
            email: Some("ventas@limasupplements.pe".into()),
            direccion: Some("Av. Industrial 404".into()),
        },
    )
    .await
    .expect("Debe crear empresa con RUC 20");

    assert_eq!(company.ruc, "20608889991");
    assert_eq!(company.razon_social, "Distribuidora de Suplementos Lima S.A.C.");

    // Intentar registrar empresa con RUC 10 -> Validation error
    let bad_company = entity_service::create_company(
        &state.pool(),
        &session,
        CreateCompanyInput {
            ruc: "10712345678".into(),
            razon_social: "Empresa Invalida S.A.C.".into(),
            nombre_comercial: None,
            telefono: None,
            email: None,
            direccion: None,
        },
    )
    .await;
    assert!(matches!(bad_company.unwrap_err(), AppError::Validation(_)));

    // 2. Crear Proveedor Polimórfico tipo EMPRESA
    let supplier_empresa = entity_service::create_supplier(
        &state.pool(),
        &session,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::Empresa,
            persona_id: None,
            empresa_id: Some(company.id),
            persona_data: None,
            empresa_data: None,
            rubro_o_categoria: Some("Nutrición y Suplementación Deportiva".into()),
            contacto_referencia: Some("Gerente de Cuentas: Juan Valdivia".into()),
        },
    )
    .await
    .expect("Debe crear proveedor tipo EMPRESA");

    assert_eq!(supplier_empresa.tipo_proveedor, SupplierType::Empresa);
    assert_eq!(supplier_empresa.empresa_id, Some(company.id));
    assert_eq!(supplier_empresa.persona_id, None);
    assert_eq!(supplier_empresa.numero_documento, "20608889991");
    assert_eq!(supplier_empresa.nombre_o_razon_social, "Distribuidora de Suplementos Lima S.A.C.");

    // 3. Crear Persona Natural para Proveedor
    let person_prov = entity_service::create_person(
        &state.pool(),
        &session,
        CreatePersonInput {
            tipo_documento: "RUC".into(),
            numero_documento: "10445566778".into(), // RUC 10 válido para persona natural con negocio
            nombres: "Alberto".into(),
            apellidos: "Mantenimiento".into(),
            fecha_nacimiento: None,
            telefono: Some("987998877".into()),
            email: Some("alberto@servicios.pe".into()),
            direccion: Some("Jr. Las Maquinas 102".into()),
        },
    )
    .await
    .expect("Debe crear persona natural con RUC 10");

    // 4. Crear Proveedor Polimórfico tipo PERSONA_NATURAL
    let supplier_persona = entity_service::create_supplier(
        &state.pool(),
        &session,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::PersonaNatural,
            persona_id: Some(person_prov.id),
            empresa_id: None,
            persona_data: None,
            empresa_data: None,
            rubro_o_categoria: Some("Servicio Técnico de Máquinas de Cardio y Fuerza".into()),
            contacto_referencia: Some("Contacto directo por WhatsApp".into()),
        },
    )
    .await
    .expect("Debe crear proveedor tipo PERSONA_NATURAL");

    assert_eq!(supplier_persona.tipo_proveedor, SupplierType::PersonaNatural);
    assert_eq!(supplier_persona.persona_id, Some(person_prov.id));
    assert_eq!(supplier_persona.empresa_id, None);
    assert_eq!(supplier_persona.numero_documento, "10445566778");
    assert_eq!(supplier_persona.nombre_o_razon_social, "Alberto Mantenimiento");

    // 5. Validar que la exclusión mutua de proveedor impida tener ambos o ninguno
    let bad_supplier_both = entity_service::create_supplier(
        &state.pool(),
        &session,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::PersonaNatural,
            persona_id: Some(person_prov.id),
            empresa_id: Some(company.id),
            persona_data: None,
            empresa_data: None,
            rubro_o_categoria: None,
            contacto_referencia: None,
        },
    )
    .await;
    assert!(bad_supplier_both.is_err());

    // 6. Listar proveedores y filtrar por tipo
    let all_suppliers = entity_service::list_suppliers(&state.pool(), &session, &SupplierFilter::default())
        .await
        .unwrap();
    assert_eq!(all_suppliers.len(), 2);

    let company_suppliers = entity_service::list_suppliers(
        &state.pool(),
        &session,
        &SupplierFilter {
            tipo_proveedor: Some(SupplierType::Empresa),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(company_suppliers.len(), 1);
    assert_eq!(company_suppliers[0].numero_documento, "20608889991");
}

#[tokio::test]
async fn test_slice2_two_phase_entities_dual_edit_and_juan_perez_case() {
    let (state, _temp_dir) = setup_test_env().await;

    // Login como Admin
    let admin_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "admin".into(),
            password: "admin123".into(),
        },
    )
    .await
    .unwrap();

    // 1. Proveedor Polimórfico - Creación en 1 paso con persona_data
    let prov_pdata = entity_service::create_supplier(
        &state.pool(),
        &admin_session,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::PersonaNatural,
            persona_id: None,
            empresa_id: None,
            persona_data: Some(CreatePersonInput {
                tipo_documento: "DNI".into(),
                numero_documento: "12345678".into(),
                nombres: "Juan".into(),
                apellidos: "Ferretero".into(),
                fecha_nacimiento: Some("1988-03-15".into()),
                telefono: Some("987111222".into()),
                email: Some("juan@ferreteria.pe".into()),
                direccion: Some("Calle Los Hierros 100".into()),
            }),
            empresa_data: None,
            rubro_o_categoria: Some("Mantenimiento y Ferretería".into()),
            contacto_referencia: Some("Atención directa".into()),
        },
    )
    .await
    .expect("Debe crear proveedor con persona_data en 1 paso");

    assert_eq!(prov_pdata.tipo_proveedor, SupplierType::PersonaNatural);
    assert_eq!(prov_pdata.numero_documento, "12345678");
    assert_eq!(prov_pdata.nombre_o_razon_social, "Juan Ferretero");
    assert_eq!(prov_pdata.nombres.as_deref(), Some("Juan"));
    assert_eq!(prov_pdata.apellidos.as_deref(), Some("Ferretero"));
    assert_eq!(prov_pdata.direccion.as_deref(), Some("Calle Los Hierros 100"));
    assert!(prov_pdata.persona_id.is_some());

    // 2. Intentar registrar de nuevo con el mismo persona_id -> Conflict
    let dup_prov = entity_service::create_supplier(
        &state.pool(),
        &admin_session,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::PersonaNatural,
            persona_id: prov_pdata.persona_id,
            empresa_id: None,
            persona_data: None,
            empresa_data: None,
            rubro_o_categoria: None,
            contacto_referencia: None,
        },
    )
    .await;
    assert!(matches!(dup_prov.unwrap_err(), AppError::Conflict(_)));

    // 3. Proveedor Polimórfico - Creación en 1 paso con empresa_data (RUC 20)
    let prov_edata = entity_service::create_supplier(
        &state.pool(),
        &admin_session,
        CreateSupplierInput {
            tipo_proveedor: SupplierType::Empresa,
            persona_id: None,
            empresa_id: None,
            persona_data: None,
            empresa_data: Some(CreateCompanyInput {
                ruc: "20778899001".into(),
                razon_social: "Equipos Fitness del Perú S.A.C.".into(),
                nombre_comercial: Some("FitPeru".into()),
                telefono: Some("015554433".into()),
                email: Some("contacto@fitperu.pe".into()),
                direccion: Some("Av. Deporte 555".into()),
            }),
            rubro_o_categoria: Some("Maquinaria Pesada de Gimnasio".into()),
            contacto_referencia: Some("Dpto. Ventas Corporativas".into()),
        },
    )
    .await
    .expect("Debe crear proveedor con empresa_data en 1 paso");

    assert_eq!(prov_edata.tipo_proveedor, SupplierType::Empresa);
    assert_eq!(prov_edata.numero_documento, "20778899001");
    assert_eq!(prov_edata.nombre_o_razon_social, "Equipos Fitness del Perú S.A.C.");
    assert_eq!(prov_edata.nombre_comercial.as_deref(), Some("FitPeru"));
    assert!(prov_edata.empresa_id.is_some());

    // 4. Edición Dual de Proveedor tipo Empresa (modificar razon social y rubro)
    let updated_prov_e = entity_service::update_supplier(
        &state.pool(),
        &admin_session,
        prov_edata.id,
        UpdateSupplierInput {
            rubro_o_categoria: Some("Equipamiento y Mantenimiento Integral".into()),
            contacto_referencia: Some("Nuevo Gerente Comercial".into()),
            persona_data: None,
            empresa_data: Some(UpdateCompanyInput {
                razon_social: "Equipos Fitness Global S.A.C.".into(),
                nombre_comercial: Some("FitPeru Global".into()),
                telefono: Some("015559999".into()),
                email: Some("ventas@fitperuglobal.pe".into()),
                direccion: Some("Av. Deporte 777".into()),
            }),
        },
    )
    .await
    .expect("Debe actualizar proveedor y empresa transaccionalmente");

    assert_eq!(updated_prov_e.nombre_o_razon_social, "Equipos Fitness Global S.A.C.");
    assert_eq!(updated_prov_e.rubro_o_categoria.as_deref(), Some("Equipamiento y Mantenimiento Integral"));

    // 5. Edición Dual de Proveedor tipo Persona Natural
    let updated_prov_p = entity_service::update_supplier(
        &state.pool(),
        &admin_session,
        prov_pdata.id,
        UpdateSupplierInput {
            rubro_o_categoria: Some("Ferretería Industrial".into()),
            contacto_referencia: Some("WhatsApp exclusivo pedidos".into()),
            persona_data: Some(UpdatePersonInput {
                tipo_documento: "DNI".into(),
                numero_documento: "12345678".into(),
                nombres: "Juan Carlos".into(),
                apellidos: "Ferretero Actualizado".into(),
                fecha_nacimiento: Some("1988-03-15".into()),
                telefono: Some("987999888".into()),
                email: Some("juancarlos@ferreteria.pe".into()),
                direccion: Some("Jr. Las Herramientas 200".into()),
            }),
            empresa_data: None,
        },
    )
    .await
    .expect("Debe actualizar proveedor y persona transaccionalmente");

    assert_eq!(updated_prov_p.nombre_o_razon_social, "Juan Carlos Ferretero Actualizado");
    assert_eq!(updated_prov_p.nombres.as_deref(), Some("Juan Carlos"));

    // 6. Crear Usuario enlazando persona_id existente (Flujo 2 fases)
    let new_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: prov_pdata.persona_id, // Vinculamos al proveedor que es persona natural
            username: "juan_ferretero_usr".into(),
            password: "Password123!".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "12345678".into(),
            nombres: "Juan Carlos".into(),
            apellidos: "Ferretero Actualizado".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .expect("Debe crear usuario enlazando persona_id existente");

    assert_eq!(new_user.username, "juan_ferretero_usr");
    assert_eq!(new_user.persona_id, prov_pdata.persona_id.unwrap());

    // Intentar crear otro usuario con la misma persona -> Conflict
    let bad_dup_user = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: prov_pdata.persona_id,
            username: "otro_juan".into(),
            password: "Password123!".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "12345678".into(),
            nombres: "Juan".into(),
            apellidos: "Ferretero".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await;
    assert!(matches!(bad_dup_user.unwrap_err(), AppError::Conflict(_)));

    // 7. Modificar usuario con auth_service::update_user y verificar edición dual de persona
    let updated_user = auth_service::update_user(
        &state.pool(),
        &state,
        UpdateUserInput {
            user_id: new_user.id,
            username: Some("juan_operador".into()),
            new_password: Some("NuevoPass123!".into()),
            rol: Some(UserRole::Recepcionista),
            foto_perfil_data_url: None,
            persona_data: Some(UpdatePersonInput {
                tipo_documento: "DNI".into(),
                numero_documento: "12345678".into(),
                nombres: "Juan Carlos Editado".into(),
                apellidos: "Ferretero Operador".into(),
                fecha_nacimiento: Some("1988-03-15".into()),
                telefono: Some("987000333".into()),
                email: Some("juan_op@zaramagym.com".into()),
                direccion: Some("Av. Central 999".into()),
            }),
        },
    )
    .await
    .expect("Debe actualizar usuario y persona");

    assert_eq!(updated_user.username, "juan_operador");
    assert_eq!(updated_user.nombres, "Juan Carlos Editado");
    assert_eq!(updated_user.apellidos, "Ferretero Operador");
    assert_eq!(updated_user.telefono.as_deref(), Some("987000333"));
    assert_eq!(updated_user.email.as_deref(), Some("juan_op@zaramagym.com"));

    // 8. Inscribir a Juan como Cliente en el gimnasio ("Caso Juan Pérez")
    let juan_client = entity_service::create_client(
        &state.pool(),
        &admin_session,
        CreateClientInput {
            persona_id: Some(new_user.persona_id),
            tipo_documento: None,
            numero_documento: None,
            nombres: None,
            apellidos: None,
            fecha_nacimiento: None,
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: Some("Esposa de Juan".into()),
            numero_contacto_emergencia: Some("999888777".into()),
            notas_medicas: Some("Sin lesiones previas".into()),
            peso_inicial_kg: None,
        },
    )
    .await
    .expect("Debe inscribir a Juan como cliente");

    assert_eq!(juan_client.persona_rol_usuario, Some(UserRole::Recepcionista));

    // Promover a Juan a SUPERVISOR
    auth_service::update_user(
        &state.pool(),
        &state,
        UpdateUserInput {
            user_id: new_user.id,
            username: None,
            new_password: None,
            rol: Some(UserRole::Supervisor),
            foto_perfil_data_url: None,
            persona_data: None,
        },
    )
    .await
    .unwrap();

    // Crear un Recepcionista independiente (rec_op)
    let _rec_op = auth_service::create_user(
        &state.pool(),
        &state,
        CreateUserInput {
            persona_id: None,
            username: "rec_juan_case".into(),
            password: "password123".into(),
            tipo_documento: "DNI".into(),
            numero_documento: "88887777".into(),
            nombres: "Mariana".into(),
            apellidos: "Cajera".into(),
            telefono: None,
            email: None,
            rol: UserRole::Recepcionista,
            foto_perfil_data_url: None,
        },
    )
    .await
    .unwrap();

    // Login como Recepcionista
    auth_service::logout(&state.pool(), &state).await.unwrap();
    let rec_session = auth_service::login(
        &state.pool(),
        &state,
        LoginCredentials {
            username: "rec_juan_case".into(),
            password: "password123".into(),
        },
    )
    .await
    .unwrap();

    // 8.1 Recepcionista edita a Juan (Cliente que es SUPERVISOR):
    // Solo edita notas médicas y contacto de emergencia (modificar_datos_personales: Some(false))
    // -> ¡DEBE PERMITIRSE!
    let juan_updated_by_rec = entity_service::update_client(
        &state.pool(),
        &rec_session,
        juan_client.id,
        UpdateClientInput {
            tipo_documento: "".into(),
            numero_documento: "".into(),
            nombres: "".into(),
            apellidos: "".into(),
            fecha_nacimiento: None,
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: Some("Hermano de Juan".into()),
            numero_contacto_emergencia: Some("999111000".into()),
            notas_medicas: Some("Esguince leve en tobillo derecho".into()),
            modificar_datos_personales: Some(false),
        },
    )
    .await
    .expect("Recepcionista DEBE poder actualizar los datos de cliente de Juan sin tocar personas");

    assert_eq!(juan_updated_by_rec.notas_medicas.as_deref(), Some("Esguince leve en tobillo derecho"));
    assert_eq!(juan_updated_by_rec.nombre_contacto_emergencia.as_deref(), Some("Hermano de Juan"));
    // Los datos personales permanecen intactos
    assert_eq!(juan_updated_by_rec.nombres, "Juan Carlos Editado");

    // 8.2 Recepcionista intenta forzar la modificación de los datos personales de Juan -> Forbidden
    let bad_rec_tamper_juan = entity_service::update_client(
        &state.pool(),
        &rec_session,
        juan_client.id,
        UpdateClientInput {
            tipo_documento: "DNI".into(),
            numero_documento: "12345678".into(),
            nombres: "Juan Hacked".into(),
            apellidos: "Ferretero".into(),
            fecha_nacimiento: None,
            telefono: None,
            email: None,
            direccion: None,
            nombre_contacto_emergencia: None,
            numero_contacto_emergencia: None,
            notas_medicas: None,
            modificar_datos_personales: Some(true),
        },
    )
    .await;

    assert!(matches!(bad_rec_tamper_juan.unwrap_err(), AppError::Forbidden(_)));

    // 8.3 Recepcionista intenta modificar los datos personales en update_supplier de Juan -> Forbidden
    let bad_rec_tamper_supplier = entity_service::update_supplier(
        &state.pool(),
        &rec_session,
        prov_pdata.id,
        UpdateSupplierInput {
            rubro_o_categoria: Some("Herramientas".into()),
            contacto_referencia: None,
            persona_data: Some(UpdatePersonInput {
                tipo_documento: "DNI".into(),
                numero_documento: "12345678".into(),
                nombres: "Hacked".into(),
                apellidos: "Hacked".into(),
                fecha_nacimiento: None,
                telefono: None,
                email: None,
                direccion: None,
            }),
            empresa_data: None,
        },
    )
    .await;

    assert!(matches!(bad_rec_tamper_supplier.unwrap_err(), AppError::Forbidden(_)));
}
