import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { ReceptionDashboard } from '../../features/reception/ReceptionDashboard';
import { AuthSession } from '../../types/auth';
import { ClientListItem } from '../../types/entity';

const mockedInvoke = vi.mocked(invoke);

const recepcionistaSession: AuthSession = {
  user_id: 3,
  persona_id: 3,
  username: 'recep1',
  nombre_completo: 'Ana Recepción',
  rol: 'RECEPCIONISTA',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-18 08:00:00',
};

const mockClients: ClientListItem[] = [
  {
    id: 1,
    persona_id: 10,
    codigo_qr_token: 'ZG-0001',
    tipo_documento: 'DNI',
    numero_documento: '72458910',
    nombres: 'Carlos',
    apellidos: 'Mendoza',
    telefono: '987654321',
    email: 'carlos@example.com',
    peso_actual_kg: 74.5,
    estado_activo: true,
    created_at: '2026-11-01 10:00:00',
  },
];

describe('ReceptionDashboard — Hub Unificado de Módulos con Flash Cards Cromáticas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_active_cash_shift') return null;
      if (cmd === 'get_attendance_today_summary') {
        return {
          totalIngresosHoy: 0,
          totalVerde: 0,
          totalAmarillo: 0,
          totalRojoAutorizados: 0,
          totalQrLocal: 0,
          totalManualOlvido: 0,
          totalPaseCredito: 0,
          totalQrMovil: 0,
          ultimoIngresoHora: null,
        };
      }
      if (cmd === 'get_system_config') {
        return {
          diasAlertaAmarillo: 3,
          minutosAntireboteQr: 3,
          precioPaseDiarioCreditoDefault: '10.00',
          updatedAt: '2026-11-18 08:00:00',
        };
      }
      return [];
    });
  });

  it('inicia en el Hub de Módulos del Gimnasio mostrando 6 flash cards para RECEPCIONISTA (sin Red LAN)', () => {
    render(
      <ReceptionDashboard
        session={recepcionistaSession}
        onLockSession={vi.fn()}
        entitiesProps={{
          clients: mockClients,
          suppliers: [],
          persons: [],
          companies: [],
          isLoading: false,
        }}
      />
    );

    expect(
      screen.getByRole('heading', { name: /accesos directos a módulos del gimnasio/i })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: /director[io]+ \(clientes \/ proveedores \/ empresas\)/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /asistencias & semáforo qr/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /caja & punto de venta \(pos\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /turnos y arqueo de caja/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cuentas por cobrar \(deudores\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /catálogo & stock/i })).toBeInTheDocument();

    // Escáner Móvil Wi-Fi LAN y botón Red LAN son exclusivos de ADMINISTRADOR
    expect(screen.queryByRole('button', { name: /escáner móvil wi-fi lan/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^red lan$/i })).not.toBeInTheDocument();

    // La barra superior solo conserva "Módulos del Gimnasio" (sin pestañas redundantes)
    expect(screen.getByRole('button', { name: /módulos del gimnasio/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /directorio de socios & clientes/i })
    ).not.toBeInTheDocument();

    // Contador contextual de socios en la tarjeta de Directorio
    expect(screen.getByText('1 socios')).toBeInTheDocument();
  });

  it('muestra las 7 flash cards incluyendo Escáner Móvil Wi-Fi LAN para ADMINISTRADOR', () => {
    const adminSession: AuthSession = {
      ...recepcionistaSession,
      user_id: 1,
      username: 'admin',
      nombre_completo: 'Administrador Principal',
      rol: 'ADMINISTRADOR',
    };

    render(
      <ReceptionDashboard
        session={adminSession}
        onLockSession={vi.fn()}
        entitiesProps={{
          clients: mockClients,
          suppliers: [],
          persons: [],
          companies: [],
          isLoading: false,
        }}
      />
    );

    expect(screen.getByRole('button', { name: /director[io]+ de socios & entidades/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /escáner móvil wi-fi lan/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^red lan$/i })).toBeInTheDocument();
  });

  it('estandariza Caja & POS in-place sin redirigir fuera del Panel Operativo', async () => {
    const user = userEvent.setup();
    const onNavigateToPos = vi.fn();

    render(
      <ReceptionDashboard
        session={recepcionistaSession}
        onLockSession={vi.fn()}
        onNavigateToPos={onNavigateToPos}
        entitiesProps={{
          clients: mockClients,
          suppliers: [],
          persons: [],
          companies: [],
          isLoading: false,
        }}
      />
    );

    // Clic en la Flash Card de Caja & Punto de Venta (POS)
    await user.click(
      screen.getByRole('button', { name: /caja & punto de venta \(pos\)/i })
    );

    // Debe renderizar PosView in-place y NO llamar redirección externa
    expect(onNavigateToPos).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /punto de venta \(pos\), turnos y cuentas por cobrar/i,
        })
      ).toBeInTheDocument();
    });

    // También debe poder volver al Hub en 1 clic con "Todos los módulos"
    await user.click(screen.getByRole('button', { name: /todos los módulos/i }));
    expect(
      screen.getByRole('heading', { name: /accesos directos a módulos del gimnasio/i })
    ).toBeInTheDocument();
  });

  it('abre Asistencias y Directorio in-place y mantiene sincronizados los botones rápidos del banner', async () => {
    const user = userEvent.setup();
    const onNavigateToAttendance = vi.fn();

    render(
      <ReceptionDashboard
        session={recepcionistaSession}
        onLockSession={vi.fn()}
        onNavigateToAttendance={onNavigateToAttendance}
        entitiesProps={{
          clients: mockClients,
          suppliers: [],
          persons: [],
          companies: [],
          isLoading: false,
        }}
      />
    );

    // Botón rápido del banner superior: Escáner QR -> in-place
    await user.click(screen.getByRole('button', { name: /^escáner qr$/i }));
    expect(onNavigateToAttendance).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /control de asistencias, semáforo y escáner qr/i,
        })
      ).toBeInTheDocument();
    });

    // Regresa al Hub con "Módulos del Gimnasio" y abre Directorio mediante su Flash Card
    await user.click(screen.getByRole('button', { name: /módulos del gimnasio/i }));
    await user.click(
      screen.getByRole('button', { name: /director[io]+ \(clientes \/ proveedores \/ empresas\)/i })
    );
    expect(
      screen.getByRole('heading', {
        name: /director[io]+ \(clientes \/ proveedores \/ empresas\)/i,
      })
    ).toBeInTheDocument();
  });

  it('contempla estado de error con reintento en el Hub de Módulos', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    render(
      <ReceptionDashboard
        session={recepcionistaSession}
        onLockSession={vi.fn()}
        entitiesProps={{
          clients: [],
          suppliers: [],
          persons: [],
          companies: [],
          isLoading: false,
          error: { code: 'Internal', message: 'Error cargando directorio' },
          onRefresh,
        }}
      />
    );

    const retryBtn = screen.getByRole('button', { name: /reintentar carga de socios/i });
    await user.click(retryBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
