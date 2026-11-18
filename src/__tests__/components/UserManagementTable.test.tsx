import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserManagementTable } from '../../features/auth/UserManagementTable';
import { AuthSession, UserListItem } from '../../types/auth';

const mockAdminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-11 10:00:00',
};

const mockSupervisorSession: AuthSession = {
  user_id: 2,
  persona_id: 2,
  username: 'super1',
  nombre_completo: 'Supervisor Turno Mañana',
  rol: 'SUPERVISOR',
  foto_perfil_data_url: 'data:image/jpeg;base64,mockphoto',
  is_locked: false,
  login_at: '2026-11-11 10:30:00',
};

const mockUsers: UserListItem[] = [
  {
    id: 1,
    persona_id: 1,
    username: 'admin',
    nombres: 'Administrador',
    apellidos: 'Principal',
    numero_documento: '00000000',
    tipo_documento: 'DNI',
    rol: 'ADMINISTRADOR',
    foto_perfil_data_url: null,
    estado_activo: true,
    ultimo_login: '2026-11-11 10:00:00',
    created_at: '2026-11-11 08:00:00',
  },
  {
    id: 3,
    persona_id: 3,
    username: 'recepcion1',
    nombres: 'María',
    apellidos: 'López',
    numero_documento: '72345678',
    tipo_documento: 'DNI',
    rol: 'RECEPCIONISTA',
    foto_perfil_data_url: 'data:image/jpeg;base64,receptionphoto',
    estado_activo: true,
    ultimo_login: null,
    created_at: '2026-11-11 09:00:00',
  },
];

describe('Component: UserManagementTable', () => {
  it('muestra estado vacío cuando no hay usuarios', () => {
    render(
      <UserManagementTable
        currentSession={mockAdminSession}
        users={[]}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onCreateUser={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    expect(screen.getByText(/no hay usuarios registrados/i)).toBeInTheDocument();
  });

  it('muestra estado de error con botón de reintento', () => {
    const handleRefresh = vi.fn();
    render(
      <UserManagementTable
        currentSession={mockAdminSession}
        users={[]}
        isLoading={false}
        isActionLoading={false}
        error={{ code: 'Internal', message: 'Fallo al conectar con base de datos' }}
        onRefresh={handleRefresh}
        onCreateUser={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/fallo al conectar con base de datos/i)).toBeInTheDocument();

    const retryBtn = screen.getByText(/reintentar carga/i);
    retryBtn.click();
    expect(handleRefresh).toHaveBeenCalled();
  });

  it('renderiza la lista de usuarios y deshabilita auto-desactivación para el admin en sesión', () => {
    render(
      <UserManagementTable
        currentSession={mockAdminSession}
        users={mockUsers}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onCreateUser={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    expect(screen.getByText('@admin')).toBeInTheDocument();
    expect(screen.getByText('(Tu cuenta activa)')).toBeInTheDocument();
    expect(screen.getByText('@recepcion1')).toBeInTheDocument();

    // Verificamos los botones de desactivar:
    // El botón del admin en sesión debe estar deshabilitado
    const actionButtons = screen.getAllByRole('button', { name: /desactivar/i });
    expect(actionButtons[0]).toBeDisabled(); // Admin actual
    expect(actionButtons[1]).not.toBeDisabled(); // Recepcionista
  });

  it('permite abrir el modal de creación de usuario para Administrador', async () => {
    const user = userEvent.setup();
    render(
      <UserManagementTable
        currentSession={mockAdminSession}
        users={mockUsers}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onCreateUser={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }));

    expect(
      screen.getByRole('heading', { name: /crear nuevo usuario del sistema/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre de usuario/i)).toBeInTheDocument();
  });

  it('para Supervisor muestra botón Nuevo Recepcionista y restringe el selector de rol', async () => {
    const user = userEvent.setup();
    render(
      <UserManagementTable
        currentSession={mockSupervisorSession}
        users={mockUsers.filter((u) => u.rol === 'RECEPCIONISTA')}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onCreateUser={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    const newBtn = screen.getByRole('button', { name: /nuevo recepcionista/i });
    expect(newBtn).toBeInTheDocument();
    await user.click(newBtn);

    expect(
      screen.getByRole('heading', { name: /crear nuevo recepcionista/i })
    ).toBeInTheDocument();

    const roleSelect = screen.getByLabelText(/rol asignado/i);
    expect(roleSelect).toBeDisabled();
    expect(screen.getByText(/RECEPCIONISTA \(Operativo\)/i)).toBeInTheDocument();
  });

  it('permite crear usuario en 2 Fases seleccionando Persona Existente sin redigitar documento', async () => {
    const user = userEvent.setup();
    const handleCreateUser = vi.fn().mockResolvedValue(true);
    const mockPersonsList = [
      {
        id: 50,
        tipo_documento: 'DNI' as const,
        numero_documento: '45678901',
        nombres: 'Pedro',
        apellidos: 'Picapiedra',
        telefono: '999111222',
        email: 'pedro@gym.com',
        es_cliente: false,
        es_proveedor: false,
        rol_usuario: null, // Persona libre sin usuario
        estado_activo: true,
        created_at: '2026-11-01',
      },
    ];

    render(
      <UserManagementTable
        currentSession={mockAdminSession}
        users={mockUsers}
        persons={mockPersonsList}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onCreateUser={handleCreateUser}
        onToggleActive={vi.fn()}
      />
    );

    // Abrir modal de nuevo usuario
    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }));

    // Clic en pestaña "Elegir Persona Existente"
    await user.click(screen.getByRole('button', { name: /elegir persona existente/i }));

    // Seleccionar Pedro Picapiedra
    expect(screen.getByText('Pedro Picapiedra')).toBeInTheDocument();
    await user.click(screen.getByText('Seleccionar'));

    // Llenar datos de cuenta
    await user.type(screen.getByLabelText(/nombre de usuario/i), 'pedro1');
    await user.type(screen.getByLabelText(/contraseña temporal/i), 'secret123');

    // Enviar
    await user.click(screen.getByRole('button', { name: /registrar usuario/i }));

    expect(handleCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        persona_id: 50,
        username: 'pedro1',
        password: 'secret123',
      })
    );
  });

  it('renderiza botón Editar para Administrador y permite abrir modal de edición dual', async () => {
    const user = userEvent.setup();
    const handleUpdateUser = vi.fn().mockResolvedValue(true);

    render(
      <UserManagementTable
        currentSession={mockAdminSession}
        users={mockUsers}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onCreateUser={vi.fn()}
        onUpdateUser={handleUpdateUser}
        onToggleActive={vi.fn()}
      />
    );

    // Los botones de Editar deben estar presentes
    const editButtons = screen.getAllByRole('button', { name: /editar/i });
    expect(editButtons.length).toBeGreaterThanOrEqual(1);

    // Clic en Editar al primer usuario (admin)
    await user.click(editButtons[0]);

    // Debe abrir modal con título Editar Usuario
    expect(screen.getByText(/editar usuario @admin/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1\. cuenta y permisos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2\. datos de la persona/i })).toBeInTheDocument();
  });

  it('permite abrir el perfil interactivo de un usuario desde la Flash Card', async () => {
    const user = userEvent.setup();
    render(
      <UserManagementTable
        currentSession={mockAdminSession}
        users={mockUsers}
        isLoading={false}
        isActionLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onCreateUser={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', { name: /ver perfil de administrador principal/i })
    );

    expect(
      screen.getByRole('dialog', { name: /perfil de administrador principal/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/cuenta y permisos de acceso/i)).toBeInTheDocument();
  });
});
