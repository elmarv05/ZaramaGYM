import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { invoke } from '@tauri-apps/api/core';
import { AuthSession } from '../../types/auth';

const mockedInvoke = vi.mocked(invoke);

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-11 10:00:00',
};

const supervisorSession: AuthSession = {
  user_id: 2,
  persona_id: 2,
  username: 'super1',
  nombre_completo: 'Supervisor Central',
  rol: 'SUPERVISOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-11 10:30:00',
};

const recepcionistaSession: AuthSession = {
  user_id: 3,
  persona_id: 3,
  username: 'recepcion1',
  nombre_completo: 'Laura Recepcionista',
  rol: 'RECEPCIONISTA',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-11 11:00:00',
};

describe('Integration: App Session & RBAC (3 Roles)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el LoginForm cuando get_current_session retorna null', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return null;
      return null;
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /iniciar sesión/i })
      ).toBeInTheDocument();
    });
  });

  it('para rol ADMINISTRADOR muestra pestañas completas de navegación', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return adminSession;
      if (cmd === 'list_users') return [];
      if (cmd === 'get_audit_logs') return [];
      if (cmd === 'list_clients') return [];
      if (cmd === 'list_suppliers') return [];
      if (cmd === 'list_persons') return [];
      if (cmd === 'list_companies') return [];
      return [];
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Administrador Principal')).toBeInTheDocument();
    });

    expect(screen.getAllByText('ADMINISTRADOR').length).toBeGreaterThanOrEqual(1);

    // Pestañas administrativas visibles
    expect(
      screen.getByRole('button', { name: /directorio \(clientes \/ proveedores \/ personas\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /gestión de usuarios/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /bitácora de auditoría/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /panel operativo/i })
    ).toBeInTheDocument();
  });

  it('para rol SUPERVISOR muestra Gestión de Recepcionistas y Auditoría', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return supervisorSession;
      if (cmd === 'list_users') return [];
      if (cmd === 'get_audit_logs') return [];
      if (cmd === 'list_clients') return [];
      if (cmd === 'list_suppliers') return [];
      if (cmd === 'list_persons') return [];
      if (cmd === 'list_companies') return [];
      return [];
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Supervisor Central')).toBeInTheDocument();
    });

    expect(screen.getAllByText('SUPERVISOR').length).toBeGreaterThanOrEqual(1);

    // Debe mostrar Gestión de Recepcionistas en vez de Gestión de Usuarios
    expect(
      screen.getByRole('button', { name: /gestión de recepcionistas/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /bitácora de auditoría/i })
    ).toBeInTheDocument();
  });

  it('para rol RECEPCIONISTA oculta las pestañas administrativas y muestra el dashboard operativo', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return recepcionistaSession;
      if (cmd === 'list_clients') return [];
      if (cmd === 'list_suppliers') return [];
      if (cmd === 'list_persons') return [];
      if (cmd === 'list_companies') return [];
      return [];
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Laura Recepcionista')).toBeInTheDocument();
    });

    expect(screen.getAllByText('RECEPCIONISTA').length).toBeGreaterThanOrEqual(1);

    // Módulos administrativos ausentes por RBAC
    expect(
      screen.queryByRole('button', { name: /gestión de usuarios/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /gestión de recepcionistas/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /bitácora de auditoría/i })
    ).not.toBeInTheDocument();

    // Dashboard operativo presente
    expect(screen.getByText(/¡Hola, Laura Recepcionista!/i)).toBeInTheDocument();
    expect(screen.getByText(/Turno Activo/i)).toBeInTheDocument();
  });

  it('muestra el modal de bloqueo reactivo cuando is_locked es true y permite desbloqueo', async () => {
    const lockedSession: AuthSession = {
      ...adminSession,
      is_locked: true,
    };

    mockedInvoke.mockImplementation(async (cmd, args) => {
      if (cmd === 'get_current_session') return lockedSession;
      if (cmd === 'list_users') return [];
      if (cmd === 'get_audit_logs') return [];
      if (cmd === 'list_clients') return [];
      if (cmd === 'list_suppliers') return [];
      if (cmd === 'list_persons') return [];
      if (cmd === 'list_companies') return [];
      if (cmd === 'unlock_session') {
        const pass = (args as { password?: string })?.password;
        if (pass === 'admin123') {
          return { ...lockedSession, is_locked: false };
        }
        throw { code: 'Unauthorized', message: 'Clave errónea' };
      }
      return [];
    });

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /turno de operación bloqueado/i })
      ).toBeInTheDocument();
    });

    // Ingresar clave incorrecta
    const passwordInput = screen.getByLabelText(/ingresa tu contraseña/i);
    await user.type(passwordInput, 'wrongpass');
    await user.click(screen.getByRole('button', { name: /desbloquear turno/i }));

    await waitFor(() => {
      expect(screen.getByText(/la contraseña ingresada es incorrecta/i)).toBeInTheDocument();
    });

    // Ingresar clave correcta
    await user.clear(passwordInput);
    await user.type(passwordInput, 'admin123');
    await user.click(screen.getByRole('button', { name: /desbloquear turno/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /turno de operación bloqueado/i })
      ).not.toBeInTheDocument();
    });
  });

  it('muestra alerta visible con acciones rápidas cuando Cerrar Sesión se bloquea por turno de caja abierto', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return adminSession;
      if (cmd === 'get_active_cash_shift') return null;
      if (cmd === 'get_cash_shift_summary') return null;
      if (cmd === 'logout') {
        throw {
          code: 'Validation',
          message: 'No puedes cerrar sesión mientras tengas un turno de caja ABIERTO.',
        };
      }
      if (cmd === 'lock_session') {
        return { ...adminSession, is_locked: true };
      }
      return [];
    });

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Administrador Principal')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText('No se puede cerrar la sesión')).toBeInTheDocument();
      expect(
        screen.getByText(/tengas un turno de caja ABIERTO/i)
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /Ir a Caja \/ POS para cerrar turno/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Solo Bloquear Estación/i })
    ).toBeInTheDocument();

    // Probar botón de navegación rápida a Caja / POS
    await user.click(
      screen.getByRole('button', { name: /Ir a Caja \/ POS para cerrar turno/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Caja, Punto de Venta \(POS\) y Cuentas por Cobrar/i)
      ).toBeInTheDocument();
    });
  });
});
