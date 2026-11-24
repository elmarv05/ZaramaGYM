import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

describe('Integration: App Session & RBAC (2 Roles)', () => {
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
      screen.getByRole('button', { name: /^directorio$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /gestión de usuarios/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /bitácora de auditoría/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /panel operativo/i })
    ).not.toBeInTheDocument();
  });

  it('para rol RECEPCIONISTA muestra sus 6 módulos habilitados, oculta los 4 exclusivos de Admin y silencia Forbidden en Personas', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return recepcionistaSession;
      if (cmd === 'list_clients') return [];
      if (cmd === 'list_suppliers' || cmd === 'list_companies') return [];
      if (cmd === 'list_persons') {
        throw { code: 'Forbidden', message: 'Solo ADMINISTRADOR' };
      }
      return [];
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Laura Recepcionista')).toBeInTheDocument();
    });

    expect(screen.getAllByText('RECEPCIONISTA').length).toBeGreaterThanOrEqual(1);

    // 6 módulos habilitados para RECEPCIONISTA en Sidebar (Panel Operativo eliminado)
    const sidebar = within(screen.getByLabelText(/navegación lateral zaramagym/i));
    expect(sidebar.getByRole('button', { name: /^Inicio$/i })).toBeInTheDocument();
    expect(sidebar.queryByRole('button', { name: /panel operativo/i })).not.toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: /asistencias y semáforo/i })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: /caja y pos/i })).toBeInTheDocument();
    expect(
      sidebar.getByRole('button', { name: /^directorio$/i })
    ).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: /catálogo e inventario/i })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: /compras, gastos y finanzas/i })).toBeInTheDocument();

    // 4 módulos exclusivos de ADMINISTRADOR ausentes por RBAC
    expect(sidebar.queryByRole('button', { name: /impresión, pdfs y backups/i })).not.toBeInTheDocument();
    expect(sidebar.queryByRole('button', { name: /gestión de usuarios/i })).not.toBeInTheDocument();
    expect(sidebar.queryByRole('button', { name: /bitácora de auditoría/i })).not.toBeInTheDocument();
    expect(sidebar.queryByRole('button', { name: /wi-fi & escáner móvil/i })).not.toBeInTheDocument();

    // No debe mostrarse alerta roja de Forbidden al cargar entidades
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Botón unificado de bloqueo en Header (no duplicado en Sidebar ni Panel Operativo)
    expect(
      screen.getByRole('button', { name: /proteger estación/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /bloquear turno/i })
    ).not.toBeInTheDocument();

    // Inicia directamente en Inicio (HomeDashboardView)
    expect(screen.getByText(/Bienvenido, Laura Recepcionista/i)).toBeInTheDocument();
    expect(screen.getByText(/TERMINAL 01 • ACTIVA/i)).toBeInTheDocument();
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
      screen.getByRole('button', { name: /Ir a Caja(?: \/ POS)? para cerrar turno/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Solo Bloquear Estación/i })
    ).toBeInTheDocument();

    // Probar botón de navegación rápida a Caja / POS
    await user.click(
      screen.getByRole('button', { name: /Ir a Caja(?: \/ POS)? para cerrar turno/i })
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Caja, Punto de Venta(?:\s*\(POS\))? y Cuentas por Cobrar/i)
      ).toBeInTheDocument();
    });
  });

  it('abre el modal Información de Contacto al hacer clic en Max Rios en el footer', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return adminSession;
      return [];
    });

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /max rios/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /max rios/i }));

    const dialog = screen.getByRole('dialog', { name: /información de contacto/i });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText(/consultor y desarrollador freelance/i)
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/ingeniería de sistemas/i)).toBeInTheDocument();
    expect(within(dialog).getByText('+51 967 231 461')).toBeInTheDocument();
    expect(within(dialog).queryByText(/pucallpa/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /copiar/i })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/código qr de contacto directo/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/enlace verificado de whatsapp/i)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('img', { name: /código qr de whatsapp de max rios/i })
    ).toHaveAttribute('src', '/max-rios-whatsapp-qr.png');

    await user.click(screen.getByRole('button', { name: /^cerrar$/i }));
    expect(
      screen.queryByRole('dialog', { name: /información de contacto/i })
    ).not.toBeInTheDocument();
  });
});
