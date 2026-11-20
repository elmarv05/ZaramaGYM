// ============================================================================
// PRUEBAS FRONTEND: INTEGRIDAD DE CIERRE DE VENTANA (X) Y CRASH RECOVERY
// Ubicación: src/__tests__/CashIntegrityLifecycle.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { App } from '../App';
import { AuditLogViewer } from '../features/audit/AuditLogViewer';
import {
  AuditLogItem,
  AuthSession,
  CloseBlockedPayload,
  CrashRecoveryNotice,
} from '../types/auth';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-19 08:00:00',
};

const sampleBlockedPayload: CloseBlockedPayload = {
  shift_id: 12,
  usuario_apertura_username: 'admin',
  usuario_apertura_nombre: 'Administrador Principal',
  fecha_apertura: '2026-11-19 08:15:00',
  message:
    'No puedes cerrar ZaramaGYM mientras el Turno de Caja #12 (abierto por @admin) permanezca ABIERTO. Realiza primero el Arqueo y Cierre de Caja en el módulo POS.',
};

const sampleCrashNotice: CrashRecoveryNotice = {
  detected: true,
  had_open_cash_shift: true,
  shift_id: 12,
  shift_opened_by_username: 'admin',
  shift_opened_by_name: 'Administrador Principal',
  shift_opened_at: '2026-11-19 08:15:00',
  last_active_username: 'admin',
  last_heartbeat_at: '2026-11-19 11:42:30',
  restarted_at: '2026-11-19 11:50:05',
  message:
    'Se detectó un cierre inesperado o forzado de la aplicación mientras el Turno de Caja #12 (abierto por @admin) permanecía ABIERTO.',
};

describe('Integridad de Cierre de Ventana (X) y Patrón Crash Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el modal preventivo de bloqueo al recibir close-blocked-open-shift en sesión activa y navega a Caja/POS', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return adminSession;
      if (cmd === 'get_crash_recovery_notice') return null;
      if (cmd === 'get_active_cash_shift' || cmd === 'get_cash_shift_summary') return null;
      return [];
    });

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Administrador Principal')).toBeInTheDocument();
    });

    // Simular evento emitido por el backend al presionar la X de Windows con caja abierta
    act(() => {
      window.dispatchEvent(
        new CustomEvent('zaramagym:close-blocked-open-shift', {
          detail: sampleBlockedPayload,
        })
      );
    });

    expect(await screen.findByText(/Cierre de Aplicación Bloqueado/i)).toBeInTheDocument();
    expect(screen.getByText(/Turno #12 ABIERTO/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-11-19 08:15:00/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ir a Caja para Arqueo y Cierre/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Cierre de Aplicación Bloqueado/i)).not.toBeInTheDocument();
      expect(
        screen.getByText(/Caja, Punto de Venta(?:\s*\(POS\))? y Cuentas por Cobrar/i)
      ).toBeInTheDocument();
    });
  });

  it('también muestra el bloqueo de cierre (X) en la pantalla de Login si quedó un turno abierto', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return null;
      return [];
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('zaramagym:close-blocked-open-shift', {
          detail: sampleBlockedPayload,
        })
      );
    });

    expect(await screen.findByText(/Cierre de Aplicación Bloqueado/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Inicia sesión o desbloquea la estación para ingresar/i)
    ).toBeInTheDocument();
  });

  it('muestra el modal de Crash Recovery tras cierre forzado con turno abierto, reconoce el aviso y navega a Caja/POS', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_current_session') return adminSession;
      if (cmd === 'get_crash_recovery_notice') return sampleCrashNotice;
      if (cmd === 'acknowledge_crash_recovery_notice') return undefined;
      if (cmd === 'get_active_cash_shift' || cmd === 'get_cash_shift_summary') return null;
      return [];
    });

    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByText(/Cierre Forzado Detectado — Recuperación de Caja/i)
    ).toBeInTheDocument();
    expect(screen.getByText('CIERRE_FORZADO_DETECTADO')).toBeInTheDocument();
    expect(screen.getByText('2026-11-19 11:42:30')).toBeInTheDocument();
    expect(screen.getByText('2026-11-19 11:50:05')).toBeInTheDocument();
    expect(screen.getByText(/Integridad SQLite verificada/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Ir a Caja \(Retomar o Arquear Turno\)/i })
    );

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('acknowledge_crash_recovery_notice', undefined);
      expect(
        screen.queryByText(/Cierre Forzado Detectado — Recuperación de Caja/i)
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/Caja, Punto de Venta(?:\s*\(POS\))? y Cuentas por Cobrar/i)
      ).toBeInTheDocument();
    });
  });

  it('resalta el evento CIERRE_FORZADO_DETECTADO en AuditLogViewer', () => {
    const logs: AuditLogItem[] = [
      {
        id: 99,
        usuario_id: 1,
        username: 'admin',
        accion: 'CIERRE_FORZADO_DETECTADO',
        modulo: 'CAJA_INTEGRIDAD',
        detalles_json:
          '{"turno_id":12,"ultima_actividad":"2026-11-19 11:42:30","reinicio":"2026-11-19 11:50:05","caja_abierta":true}',
        ip_o_terminal: 'CRASH_RECOVERY',
        created_at: '2026-11-19 11:50:05',
      },
    ];

    render(
      <AuditLogViewer
        logs={logs}
        filter={{ limit: 100 }}
        isLoading={false}
        error={null}
        onFilterChange={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    const badge = screen.getByText('CIERRE_FORZADO_DETECTADO');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('danger');
  });
});
