// ============================================================================
// SUITE DE PRUEBAS FRONTEND: BI-SLICE 2 (HOME SHELL 6 TABS + FINANZAS BI)
// Verifica: Shell de 6 sub-pestañas RBAC, acceso directo a Permisos de Recepción,
// BiFinanceTab (KPIs comparativos, gráficos, canal de caja, exportación contextual)
// Ubicación: src/__tests__/BiSlice2HomeFinance.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { HomeDashboardView } from '../features/home/HomeDashboardView';
import { BiFinanceTab } from '../features/home/tabs/BiFinanceTab';
import { PERMISSIONS_UPDATED_EVENT } from '../hooks/useReceptionistPermissions';
import { AuthSession } from '../types/auth';
import { BiFinanceAnalyticsDto } from '../types/bi';
import {
  DEFAULT_RECEPTIONIST_PERMISSIONS,
  HomeDashboardMetricsDto,
} from '../types/dashboard';

const mockedInvoke = vi.mocked(invoke);

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-25 08:00:00',
};

const recepSession: AuthSession = {
  user_id: 2,
  persona_id: 2,
  username: 'recep1',
  nombre_completo: 'Carla Recepción',
  rol: 'RECEPCIONISTA',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-25 08:30:00',
};

const mockMetrics: HomeDashboardMetricsDto = {
  clientes_activos: 80,
  membresias_activas: 72,
  asistencias_hoy_total: 24,
  deudores_activos_count: 2,
  saldo_creditos_pendiente: '180.00',
  ingresos_hoy_fisico: '200.00',
  ingresos_hoy_digital: '350.00',
  ingresos_hoy_total: '550.00',
  ingresos_mes_fisico: '3200.00',
  ingresos_mes_digital: '4800.00',
  ingresos_mes_total: '8000.00',
  can_view_monthly_revenue: true,
  afluencia_por_franja: [{ franja: '08:00', hora: 8, total: 24 }],
  membresias_por_vencer: [],
  generated_at: '2026-11-25 10:00:00',
};

const mockBiFinanceData: BiFinanceAnalyticsDto = {
  fecha_desde: '2026-10-27',
  fecha_hasta: '2026-11-25',
  periodo_anterior_desde: '2026-09-27',
  periodo_anterior_hasta: '2026-10-26',
  granularidad_aplicada: 'DIA',
  canal_aplicado: 'MIXTA',
  ingresos: { actual: '4500.00', anterior: '3600.00', delta_pct: 25.0 },
  compras: { actual: '900.00', anterior: '1000.00', delta_pct: -10.0 },
  gastos: { actual: '600.00', anterior: '600.00', delta_pct: 0.0 },
  egresos: { actual: '1500.00', anterior: '1600.00', delta_pct: -6.25 },
  flujo_neto: { actual: '3000.00', anterior: '2000.00', delta_pct: 50.0 },
  margen_operativo_pct: 66.7,
  margen_operativo_anterior_pct: 55.6,
  ticket_promedio: { actual: '150.00', anterior: '120.00', delta_pct: 25.0 },
  descuentos_totales: { actual: '75.00', anterior: '50.00', delta_pct: 50.0 },
  ventas_count: 30,
  ventas_anterior_count: 30,
  serie_temporal: [
    {
      periodo_key: '2026-11-24',
      etiqueta: '24 Nov',
      ingresos: '2000.00',
      compras: '400.00',
      gastos: '200.00',
      egresos: '600.00',
      flujo_neto: '1400.00',
    },
    {
      periodo_key: '2026-11-25',
      etiqueta: '25 Nov',
      ingresos: '2500.00',
      compras: '500.00',
      gastos: '400.00',
      egresos: '900.00',
      flujo_neto: '1600.00',
    },
  ],
  mix_lineas: [
    {
      clave: 'PLANES',
      etiqueta: 'Planes / Membresías',
      monto: '3000.00',
      porcentaje: 66.7,
      cantidad: 20,
    },
    {
      clave: 'PRODUCTOS',
      etiqueta: 'Productos / Tienda',
      monto: '1000.00',
      porcentaje: 22.2,
      cantidad: 8,
    },
    {
      clave: 'AMORTIZACIONES',
      etiqueta: 'Amortizaciones de Crédito',
      monto: '500.00',
      porcentaje: 11.1,
      cantidad: 2,
    },
  ],
  mix_metodos_pago: [
    { clave: 'EFECTIVO', etiqueta: 'Efectivo', monto: '1500.00', porcentaje: 33.3, cantidad: 10 },
    { clave: 'YAPE', etiqueta: 'Yape', monto: '2000.00', porcentaje: 44.4, cantidad: 14 },
    { clave: 'PLIN', etiqueta: 'Plin', monto: '500.00', porcentaje: 11.1, cantidad: 3 },
    { clave: 'TRANSFERENCIA', etiqueta: 'Transferencia', monto: '300.00', porcentaje: 6.7, cantidad: 2 },
    { clave: 'TARJETA', etiqueta: 'Tarjeta', monto: '200.00', porcentaje: 4.5, cantidad: 1 },
  ],
  gastos_por_categoria: [
    { clave: 'ALQUILER', etiqueta: 'Alquiler de Local', monto: '450.00', porcentaje: 75.0, cantidad: 1 },
    { clave: 'SERVICIOS', etiqueta: 'Servicios Básicos', monto: '150.00', porcentaje: 25.0, cantidad: 1 },
  ],
  generated_at: '2026-11-25 10:05:00',
};

describe('Suite Frontend BI-Slice 2: Shell 6 Pestañas Home + Finanzas y Rentabilidad BI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:bi-export');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  it('renderiza las 6 sub-pestañas para ADMINISTRADOR y dispara onOpenReceptionistPermissions desde el botón de cabecera', async () => {
    const user = userEvent.setup();
    const onOpenPerms = vi.fn();

    render(
      <HomeDashboardView
        session={adminSession}
        metrics={mockMetrics}
        onNavigate={vi.fn()}
        onOpenReceptionistPermissions={onOpenPerms}
      />
    );

    expect(screen.getByRole('tab', { name: /operativo \(hoy\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /finanzas y rentabilidad/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /socios y retención/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /asistencia y demanda/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /productos e inventario/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /control, riesgo y reportes/i })).toBeInTheDocument();

    // En Admin, el Centro Oficial de Reportes Contables vive en la Tab 6 (no en Operativo)
    expect(
      screen.queryByText(/centro rápido de exportaciones contables/i)
    ).not.toBeInTheDocument();

    const permsBtn = screen.getByRole('button', { name: /permisos de recepción/i });
    await user.click(permsBtn);
    expect(onOpenPerms).toHaveBeenCalledTimes(1);
  });

  it('para RECEPCIONISTA oculta el botón Permisos de Recepción, muestra solo sub-pestañas habilitadas y hace fallback a Operativo si se revoca la activa', async () => {
    const user = userEvent.setup();
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_my_effective_permissions') {
        return {
          ...DEFAULT_RECEPTIONIST_PERMISSIONS,
          ver_tab_socios: true,
        };
      }
      return null;
    });

    render(
      <HomeDashboardView
        session={recepSession}
        metrics={mockMetrics}
        onNavigate={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: /permisos de recepción/i })
    ).not.toBeInTheDocument();

    const sociosTab = await screen.findByRole('tab', { name: /socios y retención/i });
    expect(sociosTab).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /finanzas y rentabilidad/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /asistencia y demanda/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /productos e inventario/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /control, riesgo y reportes/i })).not.toBeInTheDocument();

    await user.click(sociosTab);
    expect(
      screen.getByText(/Socios Activos en Riesgo de Abandono/i)
    ).toBeInTheDocument();

    // Simular revocación en vivo -> vuelve automáticamente a Operativo (Hoy)
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_my_effective_permissions') {
        return { ...DEFAULT_RECEPTIONIST_PERMISSIONS };
      }
      return null;
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent(PERMISSIONS_UPDATED_EVENT));
    });

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: /socios y retención/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /operativo \(hoy\)/i })).toHaveAttribute(
      'data-state',
      'active'
    );
  });

  it('BiFinanceTab carga KPIs comparativos, gráficos, cambia Canal de Caja y exporta CSV/XLSX solo con permiso', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    mockedInvoke.mockImplementation(async (cmd, args: unknown) => {
      if (cmd === 'get_bi_finance_analytics') {
        const input = (args as { input: { canal_caja?: string } }).input;
        return {
          ...mockBiFinanceData,
          canal_aplicado: input.canal_caja || 'MIXTA',
        };
      }
      if (cmd === 'export_bi_finance_analytics') {
        const fmt = (args as { input: { format: string } }).input.format;
        return {
          filename: `bi_finanzas.${fmt.toLowerCase()}`,
          mime_type: 'text/csv',
          content_base64: btoa('fecha,ingresos\n2026-11-25,2500.00'),
          size_bytes: 32,
          sha256_hash: 'hash-bi',
          row_count: 2,
        };
      }
      return null;
    });

    const { rerender } = render(<BiFinanceTab canExportContextual={false} />);

    expect((await screen.findAllByText('S/ 4,500.00')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('S/ 1,500.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('S/ 3,000.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('S/ 150.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Margen operativo: 66\.7%/i)).toBeInTheDocument();
    expect(screen.getByText(/30 ventas • Descuentos: S\/ 75\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/\+50\.0%/i)).toBeInTheDocument();

    // Gráficos renderizados
    expect(
      screen.getByRole('img', { name: /evolución de ingresos vs egresos y flujo neto/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /mix de ingresos por línea de negocio/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /mix por método de pago/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /gastos operativos por categoría/i })
    ).toBeInTheDocument();

    // Sin permiso exportar_contextual_bi, los botones CSV / Excel no aparecen
    expect(screen.queryByRole('button', { name: /exportar vista en csv/i })).not.toBeInTheDocument();

    // Cambiar Canal de Caja a FISICA
    await user.selectOptions(screen.getByLabelText(/canal de caja/i), 'FISICA');
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('get_bi_finance_analytics', {
        input: expect.objectContaining({
          canal_caja: 'FISICA',
        }),
      });
    });

    // Habilitar exportación contextual
    rerender(<BiFinanceTab canExportContextual={true} />);

    await user.click(screen.getByRole('button', { name: /exportar vista en csv/i }));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('export_bi_finance_analytics', {
        input: expect.objectContaining({
          format: 'CSV',
          filter: expect.objectContaining({ canal_caja: 'FISICA' }),
        }),
      });
    });
    expect(await screen.findByText(/bi_finanzas\.csv/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /exportar vista en excel/i }));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('export_bi_finance_analytics', {
        input: expect.objectContaining({
          format: 'XLSX',
        }),
      });
    });

    expect(clickSpy).toHaveBeenCalledTimes(2);
    clickSpy.mockRestore();
  });

  it('BiFinanceTab muestra estado de error con Reintentar cuando falla IPC', async () => {
    const user = userEvent.setup();
    mockedInvoke.mockRejectedValueOnce({
      code: 'Forbidden',
      message: 'No tienes permisos para ver Finanzas BI.',
    });

    render(<BiFinanceTab canExportContextual={false} />);

    expect(
      await screen.findByText(/no tienes permisos para ver finanzas bi/i)
    ).toBeInTheDocument();

    mockedInvoke.mockResolvedValueOnce(mockBiFinanceData);
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect((await screen.findAllByText('S/ 4,500.00')).length).toBeGreaterThanOrEqual(1);
  });
});
