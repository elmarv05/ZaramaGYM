// ============================================================================
// SUITE DE PRUEBAS FRONTEND: BI-SLICE 4 (INVENTARIO Y CONTROL / RIESGO)
// Verifica: BiInventoryTab (escudo RBAC costos/márgenes, métricas Top Productos,
// stock muerto, mermas), BiControlTab (aging, deuda por origen, arqueos,
// tachados, auditoría crítica, Centro Oficial de Reportes) e integración Home
// Ubicación: src/__tests__/BiSlice4InventoryControl.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { HomeDashboardView } from '../features/home/HomeDashboardView';
import { BiControlTab } from '../features/home/tabs/BiControlTab';
import { BiInventoryTab } from '../features/home/tabs/BiInventoryTab';
import { AuthSession } from '../types/auth';
import {
  BiControlAnalyticsDto,
  BiInventoryAnalyticsDto,
} from '../types/bi';
import {
  ADMIN_EFFECTIVE_PERMISSIONS,
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

const mockInventoryWithCosts: BiInventoryAnalyticsDto = {
  fecha_desde: '2026-10-27',
  fecha_hasta: '2026-11-25',
  periodo_anterior_desde: '2026-09-27',
  periodo_anterior_hasta: '2026-10-26',
  dias_stock_muerto: 30,
  puede_ver_costos_y_margenes: true,
  ingresos_productos: { actual: '3400.00', anterior: '2800.00', delta_pct: 21.4 },
  unidades_vendidas: { actual: '215', anterior: '190', delta_pct: 13.2 },
  margen_bruto_estimado: { actual: '1360.00', anterior: '1100.00', delta_pct: 23.6 },
  margen_bruto_pct: 40.0,
  valorizacion_inventario: '12450.00',
  productos_activos_count: 42,
  productos_stock_critico_count: 5,
  mermas_unidades: 6,
  mermas_costo_estimado: '95.00',
  top_productos: [
    {
      producto_id: 1,
      codigo_sku: 'PROT-WHEY-1KG',
      nombre: 'Proteína Whey 1kg',
      categoria: 'SUPLEMENTOS',
      unidades_vendidas: 18,
      ingresos: '2160.00',
      margen_estimado: '720.00',
      margen_pct: 33.3,
      stock_actual: 12,
      stock_minimo: 5,
    },
    {
      producto_id: 2,
      codigo_sku: 'AGUA-600',
      nombre: 'Agua Mineral 600ml',
      categoria: 'BEBIDAS',
      unidades_vendidas: 150,
      ingresos: '450.00',
      margen_estimado: '225.00',
      margen_pct: 50.0,
      stock_actual: 60,
      stock_minimo: 20,
    },
  ],
  ventas_por_categoria: [
    {
      clave: 'SUPLEMENTOS',
      etiqueta: 'Suplementos',
      monto: '2160.00',
      cantidad: 18,
      porcentaje: 63.5,
    },
    {
      clave: 'BEBIDAS',
      etiqueta: 'Bebidas',
      monto: '1240.00',
      cantidad: 197,
      porcentaje: 36.5,
    },
  ],
  stock_muerto: [
    {
      producto_id: 9,
      codigo_sku: 'GUANTES-XL',
      nombre: 'Guantes Pro XL',
      categoria: 'ACCESORIOS',
      stock_actual: 10,
      precio_venta: '55.00',
      capital_inmovilizado: '320.00',
      ultima_venta: '2026-09-10',
      dias_sin_venta: 76,
    },
  ],
  resumen_mermas: [
    {
      tipo_movimiento: 'MERMA_VENCIMIENTO',
      etiqueta: 'Merma por Vencimiento',
      eventos_count: 2,
      unidades: 6,
      costo_estimado: '95.00',
    },
  ],
  proveedores_disponibles: [
    { id: 10, label: 'NutriPeru SAC' },
    { id: 11, label: 'Bebidas Norte EIRL' },
  ],
  generated_at: '2026-11-25 10:30:00',
};

const mockInventoryProtected: BiInventoryAnalyticsDto = {
  ...mockInventoryWithCosts,
  puede_ver_costos_y_margenes: false,
  margen_bruto_estimado: null,
  margen_bruto_pct: null,
  valorizacion_inventario: null,
  mermas_costo_estimado: null,
  top_productos: mockInventoryWithCosts.top_productos.map((p) => ({
    ...p,
    margen_estimado: null,
    margen_pct: null,
  })),
  stock_muerto: mockInventoryWithCosts.stock_muerto.map((s) => ({
    ...s,
    capital_inmovilizado: null,
  })),
  resumen_mermas: mockInventoryWithCosts.resumen_mermas.map((m) => ({
    ...m,
    costo_estimado: null,
  })),
};

const mockControlData: BiControlAnalyticsDto = {
  fecha_desde: '2026-10-27',
  fecha_hasta: '2026-11-25',
  saldo_pendiente_total: '1850.00',
  deudores_activos_count: 11,
  creditos_pendientes_count: 14,
  creditos_emitidos_periodo: '2400.00',
  creditos_cobrados_periodo: '1800.00',
  tasa_recuperacion_pct: 75.0,
  aging_cartera: [
    { clave: '0_7', etiqueta: '0–7 días', monto: '450.00', cantidad: 4, porcentaje: 24.3 },
    { clave: '8_30', etiqueta: '8–30 días', monto: '700.00', cantidad: 5, porcentaje: 37.8 },
    { clave: '31_60', etiqueta: '31–60 días', monto: '500.00', cantidad: 3, porcentaje: 27.0 },
    { clave: 'MAS_60', etiqueta: '> 60 días', monto: '200.00', cantidad: 2, porcentaje: 10.9 },
  ],
  deuda_por_origen: [
    {
      clave: 'MEMBRESIA_PAGO_PARCIAL',
      etiqueta: 'Membresía Pago Parcial',
      monto: '1200.00',
      cantidad: 8,
      porcentaje: 64.9,
    },
    {
      clave: 'PRODUCTO_CREDITO',
      etiqueta: 'Producto a Crédito',
      monto: '650.00',
      cantidad: 6,
      porcentaje: 35.1,
    },
  ],
  turnos_cerrados_count: 28,
  turnos_cuadre_exacto_count: 24,
  turnos_con_sobrante_count: 2,
  turnos_con_faltante_count: 2,
  descuadre_neto_acumulado: '-35.00',
  arqueos_por_operador: [
    {
      usuario_id: 2,
      username: 'recep1',
      nombre_completo: 'Carla Recepción',
      turnos_cerrados: 20,
      turnos_con_diferencia: 3,
      sobrante_total: '15.00',
      faltante_total: '50.00',
      diferencia_neta: '-35.00',
    },
  ],
  ventas_totales_periodo: 250,
  ventas_tachadas_count: 3,
  ventas_anuladas_count: 2,
  tasa_anulacion_pct: 2.0,
  tachados_por_operador: [
    {
      usuario_id: 2,
      username: 'recep1',
      nombre_completo: 'Carla Recepción',
      ventas_totales: 180,
      tachadas_pendientes: 3,
      anuladas_definitivas: 2,
      monto_anulado_o_tachado: '240.00',
      tasa_incidencia_pct: 2.8,
    },
  ],
  eventos_criticos_auditoria: [
    {
      id: 9001,
      created_at: '2026-11-25 09:42:00',
      username: 'admin',
      modulo: 'VENTAS',
      accion: 'VOID_SALE',
      detalles_json: '{"venta_id":44,"motivo":"Error de digitación"}',
    },
  ],
  operadores_disponibles: [
    { id: 1, label: 'admin - Administrador Principal' },
    { id: 2, label: 'recep1 - Carla Recepción' },
  ],
  generated_at: '2026-11-25 10:35:00',
};

describe('BI-Slice 4: Productos e Inventario + Control, Riesgo y Reportes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('BiInventoryTab muestra costos/márgenes/valorización para Admin, cambia métrica de Top Productos y exporta CSV', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    mockedInvoke.mockImplementation(async (cmd, args: unknown) => {
      if (cmd === 'get_bi_inventory_analytics') {
        return mockInventoryWithCosts;
      }
      if (cmd === 'export_bi_inventory_analytics') {
        const fmt = (args as { input: { format: string } }).input.format;
        return {
          filename: `bi_inventario.${fmt.toLowerCase()}`,
          mime_type: 'text/csv',
          content_base64: btoa('sku,nombre\nPROT-WHEY-1KG,Proteina'),
          row_count: 2,
          generated_at: '2026-11-25 10:40:00',
        };
      }
      return null;
    });

    render(<BiInventoryTab canExportContextual={true} />);

    expect(await screen.findByText('Margen Bruto Estimado')).toBeInTheDocument();
    expect(screen.getByText('S/ 1,360.00')).toBeInTheDocument();
    expect(screen.getByText('Valorización de Inventario')).toBeInTheDocument();
    expect(screen.getByText('S/ 12,450.00')).toBeInTheDocument();
    expect(screen.getByText('Capital Inmovilizado')).toBeInTheDocument();
    expect(screen.getByText('S/ 320.00')).toBeInTheDocument();
    expect(screen.getByText('Costo Estimado')).toBeInTheDocument();
    expect(screen.getByText('GUANTES-XL')).toBeInTheDocument();
    expect(screen.getByText('Merma por Vencimiento')).toBeInTheDocument();

    // Cambiar métrica de Top Productos: Unidades y luego Margen (S/)
    await user.click(screen.getByRole('button', { name: 'Unidades' }));
    expect(screen.getAllByText('18 uds').length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('button', { name: 'Margen (S/)' }));
    expect(screen.getAllByText('S/ 720.00').length).toBeGreaterThanOrEqual(1);

    // Cambiar filtro de Categoría y Stock Muerto
    await user.selectOptions(
      screen.getByLabelText(/filtrar por categoría de producto/i),
      'SUPLEMENTOS'
    );
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'get_bi_inventory_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ categoria: 'SUPLEMENTOS' }),
        })
      );
    });

    await user.selectOptions(
      screen.getByLabelText(/umbral de stock muerto en días/i),
      '60'
    );
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'get_bi_inventory_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ dias_stock_muerto: 60 }),
        })
      );
    });

    // Exportar CSV contextual
    await user.click(screen.getByRole('button', { name: /csv/i }));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'export_bi_inventory_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ format: 'CSV' }),
        })
      );
    });
    expect(await screen.findByText(/bi_inventario\.csv/i)).toBeInTheDocument();
    clickSpy.mockRestore();
  }, 15000);

  it('BiInventoryTab oculta costos/márgenes/capital inmovilizado cuando puede_ver_costos_y_margenes es false', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_bi_inventory_analytics') {
        return mockInventoryProtected;
      }
      return null;
    });

    render(<BiInventoryTab canExportContextual={false} />);

    expect(await screen.findByText('Costos y márgenes protegidos')).toBeInTheDocument();
    expect(screen.getByText('Productos Activos')).toBeInTheDocument();
    expect(screen.getByText('Mermas y Consumo')).toBeInTheDocument();
    expect(screen.queryByText('Margen Bruto Estimado')).not.toBeInTheDocument();
    expect(screen.queryByText('Valorización de Inventario')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Margen (S/)' })).not.toBeInTheDocument();
    expect(screen.queryByText('Capital Inmovilizado')).not.toBeInTheDocument();
    expect(screen.queryByText('Costo Estimado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /csv/i })).not.toBeInTheDocument();
  });

  it('BiControlTab renderiza aging, deuda por origen, tablas por operador, auditoría crítica, reportes oficiales y filtros', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    mockedInvoke.mockImplementation(async (cmd, args: unknown) => {
      if (cmd === 'get_bi_control_analytics') {
        return mockControlData;
      }
      if (cmd === 'export_bi_control_analytics') {
        const fmt = (args as { input: { format: string } }).input.format;
        return {
          filename: `bi_control.${fmt.toLowerCase()}`,
          mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          content_base64: btoa('modulo,detalle'),
          row_count: 5,
          generated_at: '2026-11-25 10:45:00',
        };
      }
      return null;
    });

    render(
      <BiControlTab
        canExportContextual={true}
        officialReportsSlot={<div>Centro Oficial de Reportes Contables</div>}
      />
    );

    expect(await screen.findByText('Saldo Pendiente Total')).toBeInTheDocument();
    expect(screen.getAllByText('S/ 1,850.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.getByText('Antigüedad de Cartera Morosa (Aging)')).toBeInTheDocument();
    expect(screen.getAllByText('0–7 días').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('> 60 días').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Deuda Pendiente por Origen')).toBeInTheDocument();
    expect(screen.getByText('Arqueos de Caja por Operador')).toBeInTheDocument();
    expect(screen.getByText('Tachados y Anulaciones por Vendedor')).toBeInTheDocument();
    expect(screen.getByText('VOID_SALE')).toBeInTheDocument();
    expect(screen.getByText('Centro Oficial de Reportes Contables')).toBeInTheDocument();

    // Filtrar por Operador y Origen de Crédito
    await user.selectOptions(screen.getByLabelText(/filtrar por operador/i), '2');
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'get_bi_control_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ usuario_id: 2 }),
        })
      );
    });

    await user.selectOptions(
      screen.getByLabelText(/filtrar por origen de crédito/i),
      'PRODUCTO_CREDITO'
    );
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'get_bi_control_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ origen_credito: 'PRODUCTO_CREDITO' }),
        })
      );
    });

    // Exportar XLSX contextual
    await user.click(screen.getByRole('button', { name: /excel/i }));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'export_bi_control_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ format: 'XLSX' }),
        })
      );
    });
    expect(await screen.findByText(/bi_control\.xlsx/i)).toBeInTheDocument();
    clickSpy.mockRestore();
  }, 15000);

  it('HomeDashboardView integra BiInventoryTab y BiControlTab con Centro Oficial de Reportes', async () => {
    const user = userEvent.setup();
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_my_effective_permissions') {
        return { ...ADMIN_EFFECTIVE_PERMISSIONS };
      }
      if (cmd === 'get_bi_inventory_analytics') {
        return mockInventoryWithCosts;
      }
      if (cmd === 'get_bi_control_analytics') {
        return mockControlData;
      }
      return null;
    });

    render(
      <HomeDashboardView
        session={adminSession}
        metrics={mockMetrics}
        onNavigate={vi.fn()}
      />
    );

    const invTab = await screen.findByRole('tab', { name: /productos e inventario/i });
    await user.click(invTab);
    expect(await screen.findByText('S/ 1,360.00')).toBeInTheDocument();
    expect(screen.getByText('GUANTES-XL')).toBeInTheDocument();

    const ctrlTab = screen.getByRole('tab', { name: /control, riesgo y reportes/i });
    await user.click(ctrlTab);
    expect(await screen.findByText('VOID_SALE')).toBeInTheDocument();
    expect(screen.getByText('Centro Oficial de Reportes Contables')).toBeInTheDocument();
  }, 15000);
});
