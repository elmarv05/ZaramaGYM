import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityDirectoryView } from '../../features/entities/EntityDirectoryView';
import { QrCredentialModal } from '../../features/entities/QrCredentialModal';
import { ClientWeightHistoryModal } from '../../features/entities/ClientWeightHistoryModal';
import { entityIpc } from '../../services/ipc/entityIpc';
import { AuthSession } from '../../types/auth';
import { ClientListItem, PersonListItem, SupplierListItem } from '../../types/entity';

const mockSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-11 10:00:00',
};

const mockClients: ClientListItem[] = [
  {
    id: 1,
    persona_id: 2,
    tipo_documento: 'DNI',
    numero_documento: '71234567',
    nombres: 'Roberto',
    apellidos: 'Mendoza',
    telefono: '987654321',
    email: 'beto@gmail.com',
    codigo_qr_token: 'ZG-8A7B4C2D0E1F9A3B',
    peso_actual_kg: '78.50',
    estado_activo: true,
    created_at: '2026-11-11 09:00:00',
  },
];

const mockSuppliers: SupplierListItem[] = [
  {
    id: 1,
    tipo_proveedor: 'EMPRESA',
    persona_id: null,
    empresa_id: 1,
    tipo_documento: 'RUC',
    numero_documento: '20601234567',
    nombre_o_razon_social: 'Distribuidora Fit SAC',
    nombre_comercial: 'FitSupps',
    rubro_o_categoria: 'Suplementos',
    contacto_referencia: 'Ventas Corp',
    telefono: '912345678',
    email: 'ventas@fitsupps.com',
    estado_activo: true,
    created_at: '2026-11-11 09:30:00',
  },
];

const mockPersons: PersonListItem[] = [
  {
    id: 1,
    tipo_documento: 'DNI',
    numero_documento: '00000000',
    nombres: 'Administrador',
    apellidos: 'Principal',
    telefono: null,
    email: null,
    es_cliente: false,
    es_proveedor: false,
    rol_usuario: 'ADMINISTRADOR',
    estado_activo: true,
    created_at: '2026-11-11 08:00:00',
  },
  {
    id: 2,
    tipo_documento: 'DNI',
    numero_documento: '71234567',
    nombres: 'Roberto',
    apellidos: 'Mendoza',
    telefono: '987654321',
    email: 'beto@gmail.com',
    es_cliente: true,
    es_proveedor: false,
    rol_usuario: null,
    estado_activo: true,
    created_at: '2026-11-11 09:00:00',
  },
];

describe('Component: EntityDirectoryView & Modales Especializados (Slice 2)', () => {
  it('muestra estado vacío con botón para inscribir cliente', () => {
    render(
      <EntityDirectoryView
        currentSession={mockSession}
        clients={[]}
        suppliers={[]}
        persons={[]}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText(/no hay clientes registrados/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /inscribir cliente/i }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('muestra alerta de error con botón de reintento si falla la consulta', () => {
    const handleRefresh = vi.fn();
    render(
      <EntityDirectoryView
        currentSession={mockSession}
        clients={[]}
        suppliers={[]}
        persons={[]}
        isLoading={false}
        isActionLoading={false}
        error={{ code: 'Internal', message: 'Error de conexión SQLite' }}
        onRefresh={handleRefresh}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/error de conexión sqlite/i)).toBeInTheDocument();

    const retryBtn = screen.getByText(/reintentar/i);
    retryBtn.click();
    expect(handleRefresh).toHaveBeenCalled();
  });

  it('renderiza la lista de clientes con peso actual, token QR y permite abrir historial', async () => {
    const user = userEvent.setup();
    render(
      <EntityDirectoryView
        currentSession={mockSession}
        clients={mockClients}
        suppliers={mockSuppliers}
        persons={mockPersons}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText('Roberto Mendoza')).toBeInTheDocument();
    expect(screen.getByText('78.50 kg')).toBeInTheDocument();
    expect(screen.getByText('ZG-8A7B4C2D0E1F9A3B')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ver credencial qr de roberto/i })
    ).toBeInTheDocument();

    // Cambiar a sub-pestaña de Proveedores
    await user.click(screen.getByRole('button', { name: /proveedores \(/i }));
    expect(screen.getByText('Distribuidora Fit SAC')).toBeInTheDocument();
    expect(screen.getByText(/20601234567/)).toBeInTheDocument();

    // Cambiar a sub-pestaña de Personas
    await user.click(screen.getByRole('button', { name: /personas \(/i }));
    expect(screen.getByText('(Persona de tu sesión activa)')).toBeInTheDocument();

    // Cambiar a la 4ta sub-pestaña de Empresas (RUC 20)
    await user.click(screen.getByRole('button', { name: /empresas \(/i }));
    expect(
      screen.getAllByRole('button', { name: /registrar empresa/i }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('para RECEPCIONISTA oculta Personas, habilita crear Proveedores/Empresas sin editar/desactivar y oculta Desactivar cliente', async () => {
    const user = userEvent.setup();
    const recepSession: AuthSession = {
      ...mockSession,
      user_id: 3,
      persona_id: 99,
      username: 'recep1',
      nombre_completo: 'Ana Recepción',
      rol: 'RECEPCIONISTA',
    };

    render(
      <EntityDirectoryView
        currentSession={recepSession}
        initialSubTab="persons"
        clients={mockClients}
        suppliers={mockSuppliers}
        persons={mockPersons}
        companies={[
          {
            id: 10,
            ruc: '20609876543',
            razon_social: 'Nutrición Total Perú SAC',
            nombre_comercial: 'NutriTotal',
            telefono: '01 5554321',
            email: 'contacto@nutritotal.pe',
            estado_activo: true,
            created_at: '2026-11-12 10:00:00',
          },
        ]}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
      />
    );

    // Sub-pestaña Personas oculta; Clientes, Proveedores y Empresas visibles (initialSubTab="persons" cae a clients)
    expect(screen.queryByRole('button', { name: /personas \(/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clientes & qr \(/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /proveedores \(/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /empresas \(/i })).toBeInTheDocument();

    // Clientes visibles con Inscribir, Editar, Ver QR, Historial y Exportar Padrón; sin Desactivar
    expect(screen.getByText('Roberto Mendoza')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /inscribir cliente/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver credencial qr de roberto/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^editar$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exportar Padrón de Clientes en CSV/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^desactivar$/i })).not.toBeInTheDocument();

    // Proveedores: puede crear ("Nuevo Proveedor") y ver perfil en solo lectura, sin Editar ni Desactivar
    await user.click(screen.getByRole('button', { name: /proveedores \(/i }));
    expect(screen.getByText('Distribuidora Fit SAC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo proveedor/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^editar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^desactivar$/i })).not.toBeInTheDocument();

    // Perfil de Proveedor en solo lectura
    await user.click(screen.getByRole('button', { name: /ver perfil/i }));
    expect(screen.getByText(/solo lectura/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar perfil/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^desactivar$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cerrar$/i }));

    // Empresas RUC 20: puede crear ("Registrar Empresa") y ver perfil en solo lectura, sin Editar ni Desactivar
    await user.click(screen.getByRole('button', { name: /empresas \(/i }));
    expect(screen.getByText('Nutrición Total Perú SAC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /registrar empresa/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^editar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^desactivar$/i })).not.toBeInTheDocument();
  });

  it('renderiza la 4ta sub-pestaña Empresas (RUC 20) con datos y permite alternar estado', async () => {
    const user = userEvent.setup();
    const handleToggleCompany = vi.fn().mockResolvedValue(true);
    const mockCompanies = [
      {
        id: 10,
        ruc: '20609876543',
        razon_social: 'Nutrición Total Perú SAC',
        nombre_comercial: 'NutriTotal',
        telefono: '01 5554321',
        email: 'contacto@nutritotal.pe',
        estado_activo: true,
        created_at: '2026-11-12 10:00:00',
      },
    ];

    render(
      <EntityDirectoryView
        currentSession={mockSession}
        clients={mockClients}
        suppliers={mockSuppliers}
        persons={mockPersons}
        companies={mockCompanies}
        initialSubTab="companies"
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onToggleCompanyActive={handleToggleCompany}
      />
    );

    // Debe mostrar la tabla de empresas con RUC 20 y Razón Social
    expect(screen.getByText('20609876543')).toBeInTheDocument();
    expect(screen.getByText('Nutrición Total Perú SAC')).toBeInTheDocument();
    expect(screen.getByText('NutriTotal')).toBeInTheDocument();

    // Alternar activación
    const toggleBtn = screen.getByRole('button', { name: /desactivar/i });
    await user.click(toggleBtn);
    expect(handleToggleCompany).toHaveBeenCalledWith(10, true);
  });

  it('en QrCredentialModal muestra el token, genera enlace a WhatsApp y permite regeneración', async () => {
    const user = userEvent.setup();
    const handleRegenerate = vi.fn().mockResolvedValue('ZG-NEWTOKEN123456');

    render(
      <QrCredentialModal
        isOpen={true}
        onClose={vi.fn()}
        client={mockClients[0]}
        onRegenerateQr={handleRegenerate}
      />
    );

    expect(screen.getByText('ZG-8A7B4C2D0E1F9A3B')).toBeInTheDocument();
    expect(screen.getByText('Roberto Mendoza')).toBeInTheDocument();

    const waLink = screen.getByRole('link', { name: /enviar whatsapp/i });
    expect(waLink).toBeInTheDocument();
    expect(waLink).toHaveAttribute('href', expect.stringContaining('https://wa.me/51987654321'));

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    await user.click(waLink);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/51987654321'),
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();

    await user.click(screen.getByText(/regenerar nuevo token qr.../i));
    expect(screen.getByText(/el código actual será invalidado de inmediato/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /sí, regenerar qr/i }));
    await waitFor(() => {
      expect(handleRegenerate).toHaveBeenCalledWith(1);
    });
  });

  it('en ClientWeightHistoryModal muestra el peso actual y permite registrar nuevo peso', async () => {
    const user = userEvent.setup();
    const handleRecordWeight = vi.fn().mockResolvedValue({
      id: 10,
      cliente_id: 1,
      peso_kg: '79.20',
      variacion_kg: '0.70',
      nota: 'Seguimiento mensual',
      registrado_por_usuario_id: 1,
      registrado_por_username: 'admin',
      fecha_registro: '2026-11-13 10:00:00',
    });
    const handleGetHistory = vi.fn().mockResolvedValue([
      {
        id: 9,
        cliente_id: 1,
        peso_kg: '78.50',
        variacion_kg: '0.00',
        nota: 'Peso inicial',
        registrado_por_usuario_id: 1,
        registrado_por_username: 'admin',
        fecha_registro: '2026-11-11 09:00:00',
      },
    ]);

    render(
      <ClientWeightHistoryModal
        isOpen={true}
        onClose={vi.fn()}
        client={mockClients[0]}
        onRecordWeight={handleRecordWeight}
        fetchWeightHistory={handleGetHistory}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('78.50 kg')).toBeInTheDocument();
    });

    // Llenar formulario de nuevo peso
    const pesoInput = screen.getByLabelText(/peso \(kg\)/i);
    await user.type(pesoInput, '79.20');
    await user.click(screen.getByRole('button', { name: /guardar peso/i }));

    await waitFor(() => {
      expect(handleRecordWeight).toHaveBeenCalledWith(
        expect.objectContaining({
          cliente_id: 1,
          peso_kg: '79.20',
        })
      );
    });
  });

  it('actualiza reactivamente el enlace de WhatsApp en QrCredentialModal cuando cambia el teléfono del cliente', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <EntityDirectoryView
        currentSession={mockSession}
        clients={mockClients}
        suppliers={mockSuppliers}
        persons={mockPersons}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
      />
    );

    // Abrir visor QR con el teléfono inicial
    await user.click(screen.getByRole('button', { name: /ver credencial qr de roberto/i }));
    expect(screen.getByRole('link', { name: /enviar whatsapp/i })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/51987654321')
    );

    // Simular actualización del cliente en la lista (nuevo número)
    const updatedClients = [{ ...mockClients[0], telefono: '911223344' }];
    rerender(
      <EntityDirectoryView
        currentSession={mockSession}
        clients={updatedClients}
        suppliers={mockSuppliers}
        persons={mockPersons}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getAllByText('911223344').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('link', { name: /enviar whatsapp/i })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/51911223344')
    );
  });

  it('permite abrir el perfil interactivo desde la Flash Card, editar datos inline y alternar entre Tarjetas y Tabla', async () => {
    const user = userEvent.setup();
    const handleUpdateClient = vi.fn().mockResolvedValue({
      ...mockClients[0],
      nombres: 'Roberto Carlos',
    });

    render(
      <EntityDirectoryView
        currentSession={mockSession}
        clients={mockClients}
        suppliers={mockSuppliers}
        persons={mockPersons}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onUpdateClient={handleUpdateClient}
      />
    );

    // Por defecto está en vista Tarjetas (Flash Cards)
    expect(screen.getByRole('button', { name: /^tarjetas$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Abrir el perfil completo desde la Flash Card
    await user.click(screen.getByRole('button', { name: /ver perfil de roberto mendoza/i }));

    expect(
      screen.getByRole('dialog', { name: /perfil de roberto mendoza/i })
    ).toBeInTheDocument();

    // Activar modo edición inline dentro del perfil
    await user.click(screen.getByRole('button', { name: /editar perfil/i }));
    const nombresInput = screen.getByLabelText(/^nombres/i);
    await user.clear(nombresInput);
    await user.type(nombresInput, 'Roberto Carlos');

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await waitFor(() => {
      expect(handleUpdateClient).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          nombres: 'Roberto Carlos',
        })
      );
    });

    // Alternar a vista Tabla
    await user.click(screen.getByRole('button', { name: /^tabla$/i }));
    expect(screen.getByRole('button', { name: /^tabla$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('hidrata fecha_nacimiento y direccion al abrir el perfil de una Persona desde el listado resumido', async () => {
    const user = userEvent.setup();
    const getPersonSpy = vi.spyOn(entityIpc, 'getPerson').mockResolvedValue({
      ...mockPersons[1],
      fecha_nacimiento: '1995-04-20',
      direccion: 'Av. Los Pinos 456, Lima',
      cliente_id: 1,
      proveedor_id: null,
      usuario_id: null,
      updated_at: '2026-11-18 11:00:00',
    });

    render(
      <EntityDirectoryView
        currentSession={mockSession}
        clients={mockClients}
        suppliers={mockSuppliers}
        persons={mockPersons}
        initialSubTab="persons"
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /ver perfil de roberto mendoza/i }));

    await waitFor(() => {
      expect(getPersonSpy).toHaveBeenCalledWith(2);
      expect(screen.getByText('1995-04-20')).toBeInTheDocument();
      expect(screen.getByText('Av. Los Pinos 456, Lima')).toBeInTheDocument();
    });

    getPersonSpy.mockRestore();
  });

  it('renderiza el gráfico estadístico lineal interactivo en la pestaña Historial de Peso e inspecciona puntos', async () => {
    const user = userEvent.setup();
    const handleGetHistory = vi.fn().mockResolvedValue([
      {
        id: 2,
        cliente_id: 1,
        peso_kg: '83.50',
        variacion_kg: '-1.50',
        nota: 'Control mes 1',
        registrado_por_usuario_id: 1,
        registrado_por_username: 'admin',
        fecha_registro: '2026-11-18 13:30:58',
      },
      {
        id: 1,
        cliente_id: 1,
        peso_kg: '85.00',
        variacion_kg: '0.00',
        nota: 'Peso inicial de inscripción',
        registrado_por_usuario_id: 1,
        registrado_por_username: 'admin',
        fecha_registro: '2026-10-18 13:30:58',
      },
    ]);

    render(
      <EntityDirectoryView
        currentSession={mockSession}
        clients={mockClients}
        suppliers={mockSuppliers}
        persons={mockPersons}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onGetClientWeightHistory={handleGetHistory}
      />
    );

    await user.click(screen.getByRole('button', { name: /ver perfil de roberto mendoza/i }));
    await user.click(screen.getByRole('button', { name: /3\. historial de peso/i }));

    expect(await screen.findByText(/evolución lineal de peso corporal/i)).toBeInTheDocument();
    expect(screen.getByText(/mín: 83\.50 kg/i)).toBeInTheDocument();
    expect(screen.getByText(/máx: 85\.00 kg/i)).toBeInTheDocument();
    expect(screen.getByText(/balance: -1\.50 kg/i)).toBeInTheDocument();

    // Seleccionar el nodo inicial en el gráfico SVG actualiza el inspector interactivo
    expect(screen.getAllByText(/— peso inicial de inscripción/i)).toHaveLength(1);
    const initialNode = screen.getByRole('button', { name: /control 2026-10-18 13:30:58: 85\.00 kg/i });
    await user.click(initialNode);
    expect(screen.getAllByText(/— peso inicial de inscripción/i).length).toBeGreaterThanOrEqual(2);
  });
});
