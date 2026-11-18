import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLogViewer } from '../../features/audit/AuditLogViewer';
import { AuditLogItem } from '../../types/auth';

const mockLogs: AuditLogItem[] = [
  {
    id: 1,
    usuario_id: 1,
    username: 'admin',
    modulo: 'AUTH',
    accion: 'LOGIN_EXITOSO',
    detalles_json: '{"ip": "127.0.0.1", "navegador": "Desktop Native"}',
    ip_o_terminal: 'LOCAL_DESKTOP',
    created_at: '2026-11-11 10:15:00',
  },
];

describe('Component: AuditLogViewer', () => {
  it('muestra estado vacío si no hay registros', () => {
    render(
      <AuditLogViewer
        logs={[]}
        filter={{}}
        isLoading={false}
        error={null}
        onFilterChange={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(
      screen.getByText(/no se encontraron registros de auditoría/i)
    ).toBeInTheDocument();
  });

  it('muestra estado de error con alerta y reintento', () => {
    const handleRefresh = vi.fn();
    render(
      <AuditLogViewer
        logs={[]}
        filter={{}}
        isLoading={false}
        error={{ code: 'Forbidden', message: 'Acceso no autorizado a bitácora' }}
        onFilterChange={vi.fn()}
        onRefresh={handleRefresh}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/acceso no autorizado a bitácora/i)).toBeInTheDocument();
  });

  it('renderiza logs con badges y permite abrir el inspector JSON', async () => {
    const user = userEvent.setup();
    render(
      <AuditLogViewer
        logs={mockLogs}
        filter={{}}
        isLoading={false}
        error={null}
        onFilterChange={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('AUTH')).toBeInTheDocument();
    expect(screen.getByText('LOGIN_EXITOSO')).toBeInTheDocument();

    // Ver Detalle
    await user.click(screen.getByRole('button', { name: /ver detalle/i }));

    expect(
      screen.getByRole('heading', { name: /detalle de evento #1/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/"ip": "127.0.0.1"/i)).toBeInTheDocument();
  });
});
