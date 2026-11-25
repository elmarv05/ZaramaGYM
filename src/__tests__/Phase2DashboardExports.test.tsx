// ============================================================================
// SUITE DE PRUEBAS FRONTEND: FASE 2 (TAREAS 2.2 Y 2.3)
// Home Dashboard Interactivo en Vivo + Exportaciones Contables (CSV / XLSX / PDF)
// Ubicación: src/__tests__/Phase2DashboardExports.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { HomeDashboardView } from '../features/home/HomeDashboardView';
import { EntityDirectoryView } from '../features/entities/EntityDirectoryView';
import { DebtorsTable } from '../features/pos/components/DebtorsTable';
import { FinanceView } from '../features/finance/FinanceView';
import { AuthSession } from '../types/auth';
import { ExportFileResult, HomeDashboardMetricsDto } from '../types/dashboard';
import { ClientListItem } from '../types/entity';
import { ClientCreditDto } from '../types/pos';
import { FinancialDashboardDto } from '../types/finance';

const mockedInvoke = vi.mocked(invoke);

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-17 08:00:00',
};

const recepSession: AuthSession = {
  user_id: 3,
  persona_id: 3,
  username: 'recep1',
  nombre_completo: 'Ana Recepción',
  rol: 'RECEPCIONISTA',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-17 08:30:00',
};

const liveMetricsAdmin: HomeDashboardMetricsDto = {
  clientes_activos: 128,
  membresias_activas: 94,
  asistencias_hoy_total: 47,
  deudores_activos_count: 5,
  saldo_creditos_pendiente: '485.00',
  ingresos_hoy_fisico: '210.00',
  ingresos_hoy_digital: '340.00',
  ingresos_hoy_total: '550.00',
  ingresos_mes_fisico: '3200.00',
  ingresos_mes_digital: '5450.00',
  ingresos_mes_total: '8650.00',
  can_view_monthly_revenue: true,
  afluencia_por_franja: [
    { franja: '06:00', hora: 6, total: 9 },
    { franja: '08:00', hora: 8, total: 14 },
    { franja: '18:00', hora: 18, total: 24 },
  ],
  membresias_por_vencer: [
    {
      cliente_id: 10,
      nombre_completo: 'Lucía Paredes',
      telefono: '999111222',
      nombre_plan: 'Plan Full Mensual',
      fecha_vencimiento: '2026-11-17',
      dias_restantes: 0,
    },
    {
      cliente_id: 11,
      nombre_completo: 'Marco Vega',
      telefono: '988777666',
      nombre_plan: 'Plan Trimestral',
      fecha_vencimiento: '2026-11-19',
      dias_restantes: 2,
    },
  ],
  generated_at: '2026-11-17 18:15:00',
};

const liveMetricsRecep: HomeDashboardMetricsDto = {
  ...liveMetricsAdmin,
  ingresos_mes_fisico: '0.00',
  ingresos_mes_digital: '0.00',
  ingresos_mes_total: '0.00',
  can_view_monthly_revenue: false,
};

function makeExportResult(filename: string, mimeType: string, rowCount = 12): ExportFileResult {
  return {
    filename,
    mime_type: mimeType,
    content_base64: btoa('contenido-reporte-zaramagym'),
    size_bytes: 27,
    sha256_hash: 'abc123',
    row_count: rowCount,
  };
}

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

const mockCredits: ClientCreditDto[] = [
  {
    id: 101,
    cliente_id: 1,
    cliente_nombre_completo: 'Roberto Mendoza',
    cliente_numero_documento: '71234567',
    cliente_telefono: '987654321',
    venta_origen_id: 50,
    origen_credito: 'MEMBRESIA_PAGO_PARCIAL',
    descripcion: 'Saldo pendiente Plan Mensual',
    monto_total: '90.00',
    monto_pagado: '40.00',
    saldo_pendiente: '50.00',
    estado: 'PENDIENTE',
    registrado_por_usuario_id: 1,
    registrado_por_username: 'admin',
    fecha_emision: '2026-11-15 10:00:00',
    fecha_ultimo_pago: null,
    notas: null,
    created_at: '2026-11-15 10:00:00',
  },
];

const mockFinanceDashboard: FinancialDashboardDto = {
  filtro_aplicado: {},
  fisica: {
    canal: 'FISICA',
    ingresos_ventas: '500.00',
    egresos_compras: '100.00',
    egresos_gastos: '0.00',
    total_egresos: '100.00',
    flujo_neto: '400.00',
  },
  digital: {
    canal: 'DIGITAL',
    ingresos_ventas: '300.00',
    egresos_compras: '0.00',
    egresos_gastos: '50.00',
    total_egresos: '50.00',
    flujo_neto: '250.00',
  },
  mixta: {
    canal: 'MIXTA',
    ingresos_ventas: '800.00',
    egresos_compras: '100.00',
    egresos_gastos: '50.00',
    total_egresos: '150.00',
    flujo_neto: '650.00',
  },
  desglose_digital_ingresos: {
    yape: '200.00',
    plin: '100.00',
    transferencia: '0.00',
    tarjeta: '0.00',
    total: '300.00',
  },
  desglose_digital_compras: {
    yape: '0.00',
    plin: '0.00',
    transferencia: '0.00',
    tarjeta: '0.00',
    total: '0.00',
  },
  desglose_digital_gastos: {
    yape: '50.00',
    plin: '0.00',
    transferencia: '0.00',
    tarjeta: '0.00',
    total: '50.00',
  },
  ingresos_por_dominio: {
    planes: '500.00',
    productos: '200.00',
    amortizaciones: '100.00',
    total: '800.00',
  },
  gastos_por_categoria: [],
  indicadores_control: {
    total_creditos_pendientes: '180.00',
    cantidad_creditos_pendientes: 2,
    ventas_tachadas_pendientes_count: 0,
    monto_tachado_pendiente: '0.00',
    ventas_anuladas_definitivas_count: 0,
  },
};

describe('Fase 2: Home Dashboard Interactivo y Exportaciones CSV / XLSX / PDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/export');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  describe('Tarea 2.2 — HomeDashboardView en Vivo', () => {
    it('renderiza los 4 KPIs en vivo (Físico vs Digital), gráfica de franjas, alertas <= 3 días y atajos rápidos', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      const onOpenSearch = vi.fn();

      render(
        <HomeDashboardView
          session={adminSession}
          metrics={liveMetricsAdmin}
          onNavigate={onNavigate}
          onOpenSearch={onOpenSearch}
        />
      );

      // KPIs en vivo
      expect(screen.getByText('128')).toBeInTheDocument();
      expect(screen.getByText(/\/ 94 vigentes/i)).toBeInTheDocument();
      expect(screen.getByText('47')).toBeInTheDocument();
      expect(screen.getByText('Ingresos del Mes (Físico vs Digital)')).toBeInTheDocument();
      expect(screen.getByText('S/ 8650.00')).toBeInTheDocument();
      expect(screen.getByText(/Físico: S\/ 3200\.00 · Digital: S\/ 5450\.00/i)).toBeInTheDocument();
      expect(screen.getByText('S/ 485.00')).toBeInTheDocument();
      expect(screen.getByText(/5 socio\(s\) con deuda por cobrar/i)).toBeInTheDocument();

      // Gráfica de franjas horarias y pico
      expect(screen.getByText(/Pico 18:00 \(24\)/i)).toBeInTheDocument();
      expect(screen.getByRole('listitem', { name: /Franja 06:00: 9 asistencias/i })).toBeInTheDocument();
      expect(screen.getByRole('listitem', { name: /Franja 18:00: 24 asistencias/i })).toBeInTheDocument();

      // Alertas de membresías <= 3 días con semáforo
      expect(screen.getByText('Lucía Paredes')).toBeInTheDocument();
      expect(screen.getByText('Vence hoy')).toBeInTheDocument();
      expect(screen.getByText('Marco Vega')).toBeInTheDocument();
      expect(screen.getByText('En 2 días')).toBeInTheDocument();

      // Acciones desde alerta y atajos rápidos
      const posButtons = screen.getAllByRole('button', { name: /Renovar en POS/i });
      await user.click(posButtons[0]);
      expect(onNavigate).toHaveBeenCalledWith('pos');

      await user.click(screen.getByRole('button', { name: /Búsqueda Rápida de Funciones/i }));
      expect(onOpenSearch).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: /Terminal de Asistencias QR/i }));
      expect(onNavigate).toHaveBeenCalledWith('attendance');
    });

    it('aplica RBAC para RECEPCIONISTA mostrando Recaudación del Día y ocultando totales mensuales', () => {
      render(
        <HomeDashboardView
          session={recepSession}
          metrics={liveMetricsRecep}
          onNavigate={vi.fn()}
        />
      );

      expect(screen.getByText('Recaudación del Día (Físico vs Digital)')).toBeInTheDocument();
      expect(screen.getByText('S/ 550.00')).toBeInTheDocument();
      expect(screen.getByText(/Físico: S\/ 210\.00 · Digital: S\/ 340\.00/i)).toBeInTheDocument();
      expect(screen.queryByText(/Ingresos del Mes/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/8650\.00/)).not.toBeInTheDocument();
    });

    it('contempla estados Loading (Skeleton), Empty y Error con botón Reintentar', async () => {
      const user = userEvent.setup();
      const onRefresh = vi.fn();

      const { rerender } = render(
        <HomeDashboardView
          session={adminSession}
          metrics={null}
          isLoading={true}
          onNavigate={vi.fn()}
          onRefreshMetrics={onRefresh}
        />
      );
      expect(screen.getByRole('status', { name: /Cargando métricas del tablero/i })).toBeInTheDocument();

      rerender(
        <HomeDashboardView
          session={adminSession}
          metrics={null}
          isLoading={false}
          error={{ code: 'Internal', message: 'Fallo al consultar métricas SQLite' }}
          onNavigate={vi.fn()}
          onRefreshMetrics={onRefresh}
        />
      );
      expect(screen.getByRole('alert')).toHaveTextContent(/Fallo al consultar métricas SQLite/i);
      await user.click(screen.getByRole('button', { name: /Reintentar/i }));
      expect(onRefresh).toHaveBeenCalledTimes(1);

      rerender(
        <HomeDashboardView
          session={adminSession}
          metrics={{
            ...liveMetricsAdmin,
            asistencias_hoy_total: 0,
            afluencia_por_franja: [{ franja: '06:00', hora: 6, total: 0 }],
            membresias_por_vencer: [],
          }}
          isLoading={false}
          error={null}
          onNavigate={vi.fn()}
        />
      );
      expect(screen.getByText(/Sin asistencias registradas hoy por franja horaria/i)).toBeInTheDocument();
      expect(screen.getByText(/Sin vencimientos en los próximos 3 días/i)).toBeInTheDocument();
    });

    it('dispara descargas CSV, XLSX y PDF desde el Centro Rápido de Exportaciones del Home', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      mockedInvoke.mockImplementation(async (cmd, args: any) => {
        if (cmd === 'get_home_dashboard_metrics') return liveMetricsAdmin;
        if (cmd === 'export_clients_roster') {
          return makeExportResult(`padron.${args.format.toLowerCase()}`, 'text/csv', 15);
        }
        if (cmd === 'export_debtors_portfolio') {
          return makeExportResult('deudores.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 5);
        }
        if (cmd === 'export_sales_cash_report') {
          return makeExportResult('ventas_caja.pdf', 'application/pdf', 20);
        }
        return null;
      });

      render(<HomeDashboardView session={adminSession} onNavigate={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('S/ 8650.00')).toBeInTheDocument();
      });

      // Para ADMINISTRADOR, el Centro Oficial de Reportes Contables vive en la pestaña 6
      await user.click(screen.getByRole('tab', { name: /control, riesgo y reportes/i }));

      await user.click(screen.getByRole('button', { name: /Exportar Padrón de Clientes en CSV/i }));
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('export_clients_roster', { format: 'CSV' });
      });
      expect(screen.getByText(/padron\.csv/i)).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: /Exportar Cartera de Deudores en Excel \(\.xlsx\)/i })
      );
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('export_debtors_portfolio', { format: 'XLSX' });
      });
      expect(screen.getByText(/deudores\.xlsx/i)).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: /Exportar Ventas y Movimientos de Caja en PDF/i })
      );
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith(
          'export_sales_cash_report',
          expect.objectContaining({
            request: { format: 'PDF' },
          })
        );
      });
      expect(clickSpy).toHaveBeenCalledTimes(3);
      clickSpy.mockRestore();
    });

    it('muestra la hora de inicio de sesión y actualización en lenguaje natural en la tarjeta superior', () => {
      const rfcSession: AuthSession = {
        ...adminSession,
        login_at: '2026-11-21T13:21:01.053754100+00:00',
      };

      render(
        <HomeDashboardView
          session={rfcSession}
          metrics={{
            ...liveMetricsAdmin,
            generated_at: '2026-11-21T13:35:00.123456+00:00',
          }}
          isLoading={false}
          error={null}
          onNavigate={vi.fn()}
        />
      );

      expect(screen.getByText(/Iniciada /i)).toBeInTheDocument();
      expect(screen.getByText(/Actualizado /i)).toBeInTheDocument();
      expect(screen.queryByText(/053754100/)).not.toBeInTheDocument();
    });
  });

  describe('Tarea 2.3 — Exportaciones en Vistas Operativas (Directorio, Deudores y Finanzas)', () => {
    it('exporta el Padrón de Clientes en CSV, XLSX y PDF desde EntityDirectoryView manteniendo Ver QR', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      mockedInvoke.mockImplementation(async (cmd, args: any) => {
        if (cmd === 'export_clients_roster') {
          return makeExportResult(
            `clientes.${args.format.toLowerCase()}`,
            args.format === 'CSV'
              ? 'text/csv'
              : args.format === 'XLSX'
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'application/pdf',
            1
          );
        }
        return [];
      });

      render(
        <EntityDirectoryView
          currentSession={adminSession}
          clients={mockClients}
          suppliers={[]}
          persons={[]}
          isLoading={false}
          isActionLoading={false}
          error={null}
          onRefresh={vi.fn()}
        />
      );

      // Ver QR sigue intacto
      expect(
        screen.getByRole('button', { name: /ver credencial qr de roberto/i })
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Exportar Padrón de Clientes en CSV/i }));
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('export_clients_roster', { format: 'CSV' });
      });

      await user.click(
        screen.getByRole('button', { name: /Exportar Padrón de Clientes en Excel \(\.xlsx\)/i })
      );
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('export_clients_roster', { format: 'XLSX' });
      });

      await user.click(screen.getByRole('button', { name: /Exportar Padrón de Clientes en PDF/i }));
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('export_clients_roster', { format: 'PDF' });
      });

      expect(clickSpy).toHaveBeenCalledTimes(3);
      expect(screen.getByText(/clientes\.pdf/i)).toBeInTheDocument();
      clickSpy.mockRestore();
    });

    it('exporta la Cartera de Deudores en CSV, XLSX y PDF desde DebtorsTable', async () => {
      const user = userEvent.setup();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      mockedInvoke.mockImplementation(async (cmd, args: any) => {
        if (cmd === 'export_debtors_portfolio') {
          return makeExportResult(`cartera.${args.format.toLowerCase()}`, 'application/octet-stream', 1);
        }
        return null;
      });

      render(<DebtorsTable credits={mockCredits} onAmortizeInPos={vi.fn()} />);

      await user.click(
        screen.getByRole('button', { name: /Exportar Cartera de Deudores en CSV/i })
      );
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('export_debtors_portfolio', { format: 'CSV' });
      });

      await user.click(
        screen.getByRole('button', { name: /Exportar Cartera de Deudores en Excel \(\.xlsx\)/i })
      );
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('export_debtors_portfolio', { format: 'XLSX' });
      });

      await user.click(
        screen.getByRole('button', { name: /Exportar Cartera de Deudores en PDF/i })
      );
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('export_debtors_portfolio', { format: 'PDF' });
      });

      expect(clickSpy).toHaveBeenCalledTimes(3);
      clickSpy.mockRestore();
    });

    it('exporta Ventas y Movimientos de Caja en CSV y XLSX desde FinanceView respetando filtro y canal activo', async () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      mockedInvoke.mockImplementation(async (cmd, args: any) => {
        if (cmd === 'export_sales_cash_report') {
          const fmt = args?.request?.format || 'CSV';
          return makeExportResult(`ventas_caja.${fmt.toLowerCase()}`, 'text/csv', 8);
        }
        if (cmd === 'get_financial_dashboard_summary') return mockFinanceDashboard;
        return [];
      });

      render(
        <FinanceView
          currentSession={adminSession}
          dashboard={mockFinanceDashboard}
          purchases={[]}
          expenses={[]}
          struckSalesTray={[]}
          suppliers={[]}
          products={[]}
        />
      );

      // Cambiar canal a DIGITAL
      fireEvent.click(screen.getByRole('button', { name: /Caja Digital/i }));

      // Exportar CSV
      fireEvent.click(screen.getByRole('button', { name: /Exportar Ventas y Caja en CSV/i }));
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith(
          'export_sales_cash_report',
          expect.objectContaining({
            request: {
              fecha_desde: null,
              fecha_hasta: null,
              canal_filtro: 'DIGITAL',
              format: 'CSV',
            },
          })
        );
      });

      // Exportar XLSX
      fireEvent.click(
        screen.getByRole('button', { name: /Exportar Ventas y Caja en Excel \(\.xlsx\)/i })
      );
      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith(
          'export_sales_cash_report',
          expect.objectContaining({
            request: {
              fecha_desde: null,
              fecha_hasta: null,
              canal_filtro: 'DIGITAL',
              format: 'XLSX',
            },
          })
        );
      });

      expect(clickSpy).toHaveBeenCalledTimes(2);
      clickSpy.mockRestore();
    });
  });
});
