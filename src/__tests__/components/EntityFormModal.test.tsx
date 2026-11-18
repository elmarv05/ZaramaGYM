import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupplierFormModal } from '../../features/entities/SupplierFormModal';
import { ClientFormModal } from '../../features/entities/ClientFormModal';

describe('Component: SupplierFormModal (Comportamiento Adaptativo Polimórfico)', () => {
  it('renderiza campos de Empresa RUC 20 por defecto sin apellidos ni fecha de nacimiento', () => {
    render(
      <SupplierFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={vi.fn()}
        onSubmitUpdate={vi.fn()}
      />
    );

    // Debe mostrar RUC de Empresa y Razón Social
    expect(screen.getByLabelText(/ruc de empresa/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/razón social/i)).toBeInTheDocument();

    // Apellidos y Fecha de Nacimiento no deben existir en el formulario de Empresa
    expect(screen.queryByLabelText(/^apellidos/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/fecha de nacimiento/i)).not.toBeInTheDocument();
  });

  it('al seleccionar Persona Natural muestra Nombres, Apellidos y Tipo de Documento', async () => {
    const user = userEvent.setup();
    render(
      <SupplierFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={vi.fn()}
        onSubmitUpdate={vi.fn()}
      />
    );

    // Clic en Persona Natural
    const personaBtn = screen.getByRole('button', { name: /persona natural/i });
    await user.click(personaBtn);

    // Ahora deben aparecer Nombres y Apellidos
    expect(screen.getByLabelText(/^nombres/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^apellidos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tipo de documento/i)).toBeInTheDocument();

    // Razón Social desaparece del DOM
    expect(screen.queryByLabelText(/razón social/i)).not.toBeInTheDocument();
  });

  it('al volver a seleccionar Empresa reaparecen RUC 20 y Razón Social y se ocultan los apellidos', async () => {
    const user = userEvent.setup();
    render(
      <SupplierFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={vi.fn()}
        onSubmitUpdate={vi.fn()}
      />
    );

    // Cambiar a Persona Natural
    await user.click(screen.getByRole('button', { name: /persona natural/i }));
    expect(screen.getByLabelText(/^apellidos/i)).toBeInTheDocument();

    // Volver a Empresa
    await user.click(screen.getByRole('button', { name: /empresa \(ruc 20\)/i }));
    expect(screen.queryByLabelText(/^apellidos/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/razón social/i)).toBeInTheDocument();
  });

  it('valida RUC 20 y envía formulario de Empresa correctamente', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockResolvedValue({ id: 1 });

    render(
      <SupplierFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={handleSubmit}
        onSubmitUpdate={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/ruc de empresa/i), '20601234567');
    await user.type(screen.getByLabelText(/razón social/i), 'Distribuidora Fitness SAC');
    await user.type(screen.getByLabelText(/rubro o categoría/i), 'Suplementación deportiva');

    await user.click(screen.getByRole('button', { name: /registrar proveedor/i }));

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_proveedor: 'EMPRESA',
        empresa_data: expect.objectContaining({
          ruc: '20601234567',
          razon_social: 'Distribuidora Fitness SAC',
        }),
      })
    );
  });

  it('permite seleccionar una Empresa Existente en Fase 1 y envía empresa_id sin exigir datos SUNAT', async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn().mockResolvedValue({ id: 2 });
    const mockCompanies = [
      {
        id: 42,
        ruc: '20701234567',
        razon_social: 'Equipos Gym SAC',
        nombre_comercial: 'GymEquip',
        telefono: null,
        email: null,
        estado_activo: true,
        created_at: '2026-11-10',
      },
    ];

    render(
      <SupplierFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={handleSubmit}
        onSubmitUpdate={vi.fn()}
        companies={mockCompanies}
      />
    );

    // Clic en pestaña "Elegir Empresa Existente"
    await user.click(screen.getByRole('button', { name: /elegir empresa existente/i }));

    // Seleccionar la empresa
    expect(screen.getByText('Equipos Gym SAC')).toBeInTheDocument();
    await user.click(screen.getByText(/seleccionar/i));

    // Debe mostrar la tarjeta con la empresa seleccionada
    expect(screen.getByText(/RUC: 20701234567/i)).toBeInTheDocument();

    // Llenar datos de proveedor
    await user.type(screen.getByLabelText(/rubro o categoría/i), 'Maquinaria pesada');

    // Registrar proveedor
    await user.click(screen.getByRole('button', { name: /registrar proveedor/i }));

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_proveedor: 'EMPRESA',
        empresa_id: 42,
        rubro_o_categoria: 'Maquinaria pesada',
      })
    );
  });

  it('en Edición Dual protege datos de persona ante Recepcionista si tiene rol de usuario (Caso Juan Pérez)', async () => {
    const user = userEvent.setup();
    const mockReceptionSession = {
      user_id: 3,
      persona_id: 3,
      username: 'recep1',
      nombre_completo: 'Recepcionista',
      rol: 'RECEPCIONISTA' as const,
      foto_perfil_data_url: null,
      is_locked: false,
      login_at: '2026-11-10',
    };

    const mockEditingSupplier = {
      id: 5,
      tipo_proveedor: 'PERSONA_NATURAL' as const,
      persona_id: 10,
      empresa_id: null,
      tipo_documento: 'DNI',
      numero_documento: '44556677',
      nombre_o_razon_social: 'Juan Pérez',
      nombres: 'Juan',
      apellidos: 'Pérez',
      nombre_comercial: null,
      rubro_o_categoria: 'Mantenimiento',
      contacto_referencia: 'Turno tarde',
      telefono: '999888777',
      email: 'juan@gym.com',
      direccion: 'Av. Siempre Viva 123',
      persona_rol_usuario: 'ADMINISTRADOR' as const, // Vinculado a usuario admin
      estado_activo: true,
      created_at: '2026-11-10',
    };

    render(
      <SupplierFormModal
        isOpen={true}
        onClose={vi.fn()}
        editingSupplier={mockEditingSupplier}
        onSubmitCreate={vi.fn()}
        onSubmitUpdate={vi.fn()}
        currentSession={mockReceptionSession}
      />
    );

    // Cambiar a pestaña 2 de Datos de la Persona
    await user.click(screen.getByRole('button', { name: /datos de la persona/i }));

    // El botón de modificar datos personales debe estar deshabilitado
    const unlockBtn = screen.getByRole('button', { name: /modificar datos personales/i });
    expect(unlockBtn).toBeDisabled();

    // Mensaje de advertencia RBAC presente
    expect(
      screen.getByText(/protegido por jerarquía rbac/i)
    ).toBeInTheDocument();
  });
});

describe('Component: ClientFormModal (Socio con Salud y Peso Inicial)', () => {
  it('renderiza campos de persona, contactos de emergencia y peso inicial', () => {
    render(
      <ClientFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={vi.fn()}
        onSubmitUpdate={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/tipo de documento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número de documento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^nombres/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^apellidos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contacto de emergencia/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/peso inicial/i)).toBeInTheDocument();
  });

  it('valida campos obligatorios y envía el formulario de cliente correctamente', async () => {
    const user = userEvent.setup();
    const handleCreate = vi.fn().mockResolvedValue({ id: 5 });

    render(
      <ClientFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={handleCreate}
        onSubmitUpdate={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/número de documento/i), '71234567');
    await user.type(screen.getByLabelText(/^nombres/i), 'Andrés');
    await user.type(screen.getByLabelText(/^apellidos/i), 'Zarama Gómez');
    await user.type(screen.getByLabelText(/peso inicial/i), '74.50');

    await user.click(screen.getByRole('button', { name: /registrar cliente/i }));

    expect(handleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_documento: 'DNI',
        numero_documento: '71234567',
        nombres: 'Andrés',
        apellidos: 'Zarama Gómez',
        peso_inicial_kg: '74.50',
      })
    );
  });

  it('permite inscribir cliente seleccionando Persona Existente sin redigitar nombres', async () => {
    const user = userEvent.setup();
    const handleCreate = vi.fn().mockResolvedValue({ id: 8 });
    const mockPersons = [
      {
        id: 77,
        tipo_documento: 'DNI' as const,
        numero_documento: '40112233',
        nombres: 'Carlos',
        apellidos: 'Mendoza',
        telefono: '987111222',
        email: 'carlos@gym.com',
        es_cliente: false,
        es_proveedor: true,
        rol_usuario: null,
        estado_activo: true,
        created_at: '2026-11-01',
      },
    ];

    render(
      <ClientFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={handleCreate}
        onSubmitUpdate={vi.fn()}
        persons={mockPersons}
      />
    );

    // Clic en pestaña "Elegir Persona Existente"
    await user.click(screen.getByRole('button', { name: /elegir persona existente/i }));

    // Seleccionar Carlos Mendoza
    expect(screen.getByText('Carlos Mendoza')).toBeInTheDocument();
    await user.click(screen.getByText(/seleccionar/i));

    // Llenar datos de emergencia y registrar
    await user.type(screen.getByLabelText(/nombre de contacto de emergencia/i), 'Hermano');
    await user.click(screen.getByRole('button', { name: /registrar cliente/i }));

    expect(handleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        persona_id: 77,
        nombre_contacto_emergencia: 'Hermano',
      })
    );
  });

  it('en Edición Dual de Cliente, Recepcionista guarda salud sin modificar_datos_personales (Caso Juan Pérez)', async () => {
    const user = userEvent.setup();
    const handleUpdate = vi.fn().mockResolvedValue({ id: 10 });

    const mockReceptionSession = {
      user_id: 4,
      persona_id: 4,
      username: 'recep2',
      nombre_completo: 'Operador Recepción',
      rol: 'RECEPCIONISTA' as const,
      foto_perfil_data_url: null,
      is_locked: false,
      login_at: '2026-11-10',
    };

    const mockClientJuanPerez = {
      id: 10,
      persona_id: 99,
      tipo_documento: 'DNI' as const,
      numero_documento: '77889900',
      nombres: 'Juan',
      apellidos: 'Pérez Administrador',
      telefono: '999000111',
      email: 'juan.admin@gym.com',
      direccion: 'Jr. Principal 100',
      codigo_qr_token: 'ZG-JUANPEREZ123',
      nombre_contacto_emergencia: 'Esposa',
      numero_contacto_emergencia: '999000222',
      notas_medicas: 'Alergia al polvo',
      peso_actual_kg: '80.00',
      persona_rol_usuario: 'ADMINISTRADOR' as const, // Vinculado a usuario administrador
      estado_activo: true,
      created_at: '2026-11-05',
    };

    render(
      <ClientFormModal
        isOpen={true}
        onClose={vi.fn()}
        editingClient={mockClientJuanPerez}
        onSubmitCreate={vi.fn()}
        onSubmitUpdate={handleUpdate}
        currentSession={mockReceptionSession}
      />
    );

    // Modificar únicamente notas médicas
    const notasInput = screen.getByLabelText(/notas médicas/i);
    await user.clear(notasInput);
    await user.type(notasInput, 'Alergia al polvo y cafeína');

    // Guardar cambios
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(handleUpdate).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        modificar_datos_personales: false,
        notas_medicas: 'Alergia al polvo y cafeína',
      })
    );
  });
});
