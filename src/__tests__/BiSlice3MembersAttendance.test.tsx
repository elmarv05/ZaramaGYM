// ============================================================================
// SUITE DE PRUEBAS FRONTEND: BI-SLICE 3 (SOCIOS Y RETENCIÓN + ASISTENCIA Y DEMANDA)
// Verifica: BiMembersTab, BiAttendanceTab, filtros, acciones WhatsApp/Directorio,
// heatmap 7x18, exportación contextual RBAC, estados de error y HomeDashboardView
// Ubicación: src/__tests__/BiSlice3MembersAttendance.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { HomeDashboardView } from '../features/home/HomeDashboardView';
import { BiAttendanceTab } from '../features/home/tabs/BiAttendanceTab';
import { BiMembersTab } from '../features/home/tabs/BiMembersTab';
import { AuthSession } from '../types/auth';
import {
  BiAttendanceAnalyticsDto,
  BiMembersAnalyticsDto,
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

const mockBiMembersData: BiMembersAnalyticsDto = {
  fecha_desde: '2026-10-27',
  fecha_hasta: '2026-11-25',
  periodo_anterior_desde: '2026-09-27',
  periodo_anterior_hasta: '2026-10-26',
  granularidad_aplicada: 'DIA',
  dias_inactividad_riesgo: 14,
  nuevos_socios: { actual: '18', anterior: '12', delta_pct: 50.0 },
  socios_activos_total: 120,
  membresias_vigentes_total: 98,
  vencimientos_en_periodo: 20,
  renovaciones_en_periodo: 15,
  tasa_renovacion_pct: 75.0,
  tasa_renovacion_anterior_pct: 65.0,
  tasa_churn_pct: 25.0,
  arpu: { actual: '142.50', anterior: '130.00', delta_pct: 9.6 },
  dias_prorroga_otorgados: { actual: '12', anterior: '16', delta_pct: -25.0 },
  serie_movimiento: [
    {
      periodo_key: '2026-11-24',
      etiqueta: '24 Nov',
      altas_nuevas: 4,
      renovaciones: 3,
      vencimientos: 2,
    },
    {
      periodo_key: '2026-11-25',
      etiqueta: '25 Nov',
      altas_nuevas: 6,
      renovaciones: 5,
      vencimientos: 1,
    },
  ],
  distribucion_edad: [
    { clave: '18_24', etiqueta: '18-24', cantidad: 34, porcentaje: 28.3 },
    { clave: '25_34', etiqueta: '25-34', cantidad: 52, porcentaje: 43.3 },
  ],
  distribucion_genero: [
    { clave: 'MASCULINO', etiqueta: 'Masculino', cantidad: 65, porcentaje: 54.2 },
    { clave: 'FEMENINO', etiqueta: 'Femenino', cantidad: 45, porcentaje: 37.5 },
    { clave: 'SIN_ESPECIFICAR', etiqueta: 'Sin especificar', cantidad: 10, porcentaje: 8.3 },
  ],
  cobertura_genero_pct: 91.7,
  distribucion_captacion: [
    { clave: 'REDES_SOCIALES', etiqueta: 'Redes Sociales', cantidad: 50, porcentaje: 41.7 },
    { clave: 'RECOMENDACION', etiqueta: 'Recomendación', cantidad: 40, porcentaje: 33.3 },
  ],
  cobertura_captacion_pct: 75.0,
  rendimiento_planes: [
    {
      plan_id: 1,
      codigo: 'MENSUAL-PRO',
      nombre: 'Mensual Full',
      tipo_plan: 'TIEMPO',
      unidades_vendidas: 42,
      ingresos: '6300.00',
      porcentaje_ingresos: 70.0,
    },
  ],
  socios_en_riesgo: [
    {
      cliente_id: 101,
      nombre_completo: 'Lucía Paredes',
      telefono: '987654321',
      nombre_plan: 'Mensual Full',
      fecha_vencimiento: '2026-12-10',
      dias_restantes: 15,
      ultima_asistencia: '2026-11-04',
      dias_sin_asistir: 21,
    },
    {
      cliente_id: 102,
      nombre_completo: 'Mario Quispe',
      telefono: null,
      nombre_plan: 'Trimestral VIP',
      fecha_vencimiento: '2026-12-28',
      dias_restantes: 33,
      ultima_asistencia: null,
      dias_sin_asistir: 16,
    },
  ],
  resumen_biometrico: {
    socios_con_peso: 74,
    socios_con_evolucion: 31,
    variacion_promedio_kg: '-1.8',
    total_registros_peso: 148,
  },
  planes_disponibles: [
    { id: 1, label: 'Mensual Full' },
    { id: 2, label: 'Trimestral VIP' },
  ],
  generated_at: '2026-11-25 10:05:00',
};

const mockBiAttendanceData: BiAttendanceAnalyticsDto = {
  fecha_desde: '2026-10-27',
  fecha_hasta: '2026-11-25',
  periodo_anterior_desde: '2026-09-27',
  periodo_anterior_hasta: '2026-10-26',
  granularidad_aplicada: 'DIA',
  total_asistencias: { actual: '920', anterior: '800', delta_pct: 15.0 },
  promedio_diario: 30.7,
  promedio_diario_anterior: 26.7,
  socios_unicos: { actual: '115', anterior: '100', delta_pct: 15.0 },
  frecuencia_semanal_promedio: 3.4,
  dia_hora_pico: {
    dia_semana: 0,
    dia_nombre: 'Lunes',
    hora: 19,
    franja: '19:00',
    total: 48,
  },
  pases_rojo_emitidos: 12,
  pases_rojo_cobrados: 9,
  pases_rojo_tasa_cobro_pct: 75.0,
  pases_rojo_saldo_pendiente: '45.00',
  heatmap: [
    { dia_semana: 0, hora: 19, total: 48, promedio_por_jornada: 12.0 },
    { dia_semana: 2, hora: 8, total: 24, promedio_por_jornada: 6.0 },
  ],
  serie_temporal: [
    { periodo_key: '2026-11-24', etiqueta: '24 Nov', total: 42, socios_unicos: 38 },
    { periodo_key: '2026-11-25', etiqueta: '25 Nov', total: 50, socios_unicos: 44 },
  ],
  distribucion_semaforo: [
    { clave: 'VERDE', etiqueta: 'Verde', cantidad: 780, porcentaje: 84.8 },
    { clave: 'AMARILLO', etiqueta: 'Amarillo', cantidad: 110, porcentaje: 12.0 },
    { clave: 'ROJO', etiqueta: 'Rojo', cantidad: 30, porcentaje: 3.2 },
  ],
  distribucion_canales: [
    { clave: 'QR_LOCAL', etiqueta: 'QR Local', cantidad: 610, porcentaje: 66.3 },
    { clave: 'QR_MOVIL_LAN', etiqueta: 'Escáner Móvil LAN', cantidad: 260, porcentaje: 28.3 },
  ],
  top_socios_constantes: [
    {
      cliente_id: 201,
      nombre_completo: 'Andrea Soto',
      total_visitas: 26,
      ultima_asistencia: '2026-11-25 19:10:00',
      nombre_plan: 'Mensual Full',
    },
    {
      cliente_id: 202,
      nombre_completo: 'Carlos Vega',
      total_visitas: 22,
      ultima_asistencia: '2026-11-25 07:45:00',
      nombre_plan: 'Trimestral VIP',
    },
  ],
  planes_disponibles: [
    { id: 1, label: 'Mensual Full' },
    { id: 2, label: 'Trimestral VIP' },
  ],
  generated_at: '2026-11-25 10:10:00',
};

describe('BI-Slice 3: Socios y Retención + Asistencia y Demanda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('BiMembersTab renderiza KPIs, demografía, rendimiento por plan, riesgo con WhatsApp/Directorio y filtros reactivos', async () => {
    const user = userEvent.setup();
    const onNavigateToEntities = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    mockedInvoke.mockImplementation(async (cmd, args: unknown) => {
      if (cmd === 'get_bi_members_analytics') {
        const input = (args as { input: { dias_inactividad_riesgo?: number } }).input;
        return {
          ...mockBiMembersData,
          dias_inactividad_riesgo: input.dias_inactividad_riesgo ?? 14,
        };
      }
      if (cmd === 'open_external_url') {
        return null;
      }
      if (cmd === 'export_bi_members_analytics') {
        const fmt = (args as { input: { format: string } }).input.format;
        return {
          filename: `bi_socios.${fmt.toLowerCase()}`,
          mime_type: 'text/csv',
          content_base64: btoa('socio,plan\nLucia,Mensual'),
          row_count: 2,
          generated_at: '2026-11-25 10:15:00',
        };
      }
      return null;
    });

    render(
      <BiMembersTab
        canExportContextual={true}
        onNavigateToEntities={onNavigateToEntities}
      />
    );

    expect(await screen.findByText('Socios Nuevos')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.getByText('S/ 142.50')).toBeInTheDocument();
    expect(screen.getByText('92% cobertura')).toBeInTheDocument();
    expect(screen.getByText('75% cobertura')).toBeInTheDocument();
    expect(screen.getByText('MENSUAL-PRO')).toBeInTheDocument();
    expect(screen.getByText('Lucía Paredes')).toBeInTheDocument();
    expect(screen.getByText('21 días')).toBeInTheDocument();
    expect(screen.getByText('-1.8 kg')).toBeInTheDocument();

    // Filtros reactivos: cambiar género y umbral de riesgo
    await user.selectOptions(
      screen.getByLabelText(/filtrar por género/i),
      'FEMENINO'
    );
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'get_bi_members_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ genero: 'FEMENINO' }),
        })
      );
    });

    await user.selectOptions(
      screen.getByLabelText(/umbral de riesgo por inactividad/i),
      '21'
    );
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'get_bi_members_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ dias_inactividad_riesgo: 21 }),
        })
      );
    });

    // Acción WhatsApp para Lucía Paredes (tiene teléfono válido)
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const waButtons = screen.getAllByRole('button', { name: /whatsapp/i });
    expect(waButtons[0]).toBeEnabled();
    expect(waButtons[1]).toBeDisabled();
    await user.click(waButtons[0]);

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/wa\.me\/51987654321\?text=/),
        '_blank',
        'noopener,noreferrer'
      );
    });
    openSpy.mockRestore();

    // Botón Ver Directorio
    await user.click(screen.getByRole('button', { name: /ver directorio/i }));
    expect(onNavigateToEntities).toHaveBeenCalledTimes(1);

    // Exportación contextual XLSX
    await user.click(screen.getByRole('button', { name: /excel/i }));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'export_bi_members_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ format: 'XLSX' }),
        })
      );
    });
    expect(await screen.findByText(/bi_socios\.xlsx/i)).toBeInTheDocument();
    clickSpy.mockRestore();
  }, 15000);

  it('BiMembersTab oculta exportación sin permiso y permite reintentar ante error', async () => {
    const user = userEvent.setup();
    let shouldFail = true;
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_bi_members_analytics') {
        if (shouldFail) {
          throw { code: 'Internal', message: 'Error SQL simulado en socios' };
        }
        return mockBiMembersData;
      }
      return null;
    });

    render(<BiMembersTab canExportContextual={false} />);

    expect(screen.queryByRole('button', { name: /csv/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/Error SQL simulado en socios/i)).toBeInTheDocument();

    shouldFail = false;
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('Lucía Paredes')).toBeInTheDocument();
  });

  it('BiAttendanceTab renderiza KPIs, heatmap 7x18, tendencia, semáforo, canales, Top 10 y filtros', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    mockedInvoke.mockImplementation(async (cmd, args: unknown) => {
      if (cmd === 'get_bi_attendance_analytics') {
        return mockBiAttendanceData;
      }
      if (cmd === 'export_bi_attendance_analytics') {
        const fmt = (args as { input: { format: string } }).input.format;
        return {
          filename: `bi_asistencia.${fmt.toLowerCase()}`,
          mime_type: 'text/csv',
          content_base64: btoa('fecha,total\n2026-11-25,50'),
          row_count: 1,
          generated_at: '2026-11-25 10:20:00',
        };
      }
      return null;
    });

    render(<BiAttendanceTab canExportContextual={true} />);

    expect(await screen.findByText('Lunes 19:00')).toBeInTheDocument();
    expect(screen.getAllByText('Total Asistencias').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('920').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Mapa de Calor de Afluencia/i)).toBeInTheDocument();
    expect(screen.getByText('Tendencia de Asistencias vs Socios Únicos')).toBeInTheDocument();
    expect(screen.getByText('Distribución por Semáforo')).toBeInTheDocument();
    expect(screen.getByText('Canales de Acceso')).toBeInTheDocument();
    expect(screen.getByText('Andrea Soto')).toBeInTheDocument();
    expect(screen.getByText('26 visitas')).toBeInTheDocument();

    // Filtros por Semáforo y Canal de Ingreso
    await user.selectOptions(
      screen.getByLabelText(/filtrar por color de semáforo/i),
      'ROJO'
    );
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'get_bi_attendance_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ color_semaforo: 'ROJO' }),
        })
      );
    });

    await user.selectOptions(
      screen.getByLabelText(/filtrar por canal de ingreso/i),
      'QR_MOVIL_LAN'
    );
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'get_bi_attendance_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ modo_ingreso: 'QR_MOVIL_LAN' }),
        })
      );
    });

    // Exportación contextual CSV
    await user.click(screen.getByRole('button', { name: /csv/i }));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith(
        'export_bi_attendance_analytics',
        expect.objectContaining({
          input: expect.objectContaining({ format: 'CSV' }),
        })
      );
    });
    expect(await screen.findByText(/bi_asistencia\.csv/i)).toBeInTheDocument();
    clickSpy.mockRestore();
  }, 15000);

  it('HomeDashboardView integra BiMembersTab y BiAttendanceTab en sus sub-pestañas', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_my_effective_permissions') {
        return { ...ADMIN_EFFECTIVE_PERMISSIONS };
      }
      if (cmd === 'get_bi_members_analytics') {
        return mockBiMembersData;
      }
      if (cmd === 'get_bi_attendance_analytics') {
        return mockBiAttendanceData;
      }
      return null;
    });

    render(
      <HomeDashboardView
        session={adminSession}
        metrics={mockMetrics}
        onNavigate={onNavigate}
      />
    );

    const sociosTab = await screen.findByRole('tab', { name: /socios y retención/i });
    await user.click(sociosTab);
    expect(await screen.findByText('Lucía Paredes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ver directorio/i }));
    expect(onNavigate).toHaveBeenCalledWith('directory');

    const asistenciaTab = screen.getByRole('tab', { name: /asistencia y demanda/i });
    await user.click(asistenciaTab);
    expect(await screen.findByText('Lunes 19:00')).toBeInTheDocument();
    expect(screen.getByText('Andrea Soto')).toBeInTheDocument();
  }, 15000);
});
