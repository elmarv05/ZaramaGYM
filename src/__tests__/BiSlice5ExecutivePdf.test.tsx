// ============================================================================
// SUITE DE PRUEBAS FRONTEND: BI-SLICE 5 (REPORTE EJECUTIVO PDF CONSOLIDADO)
// Verifica: Visibilidad RBAC (canExportExecutivePdf), selector de canal,
// invocación generate_executive_bi_report_pdf, descarga Base64, manejo de error
// y fallback en Operativo (Hoy) cuando ver_tab_control === false
// Ubicación: src/__tests__/BiSlice5ExecutivePdf.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import * as printingBackupDomain from '../domain/printingBackup';
import { HomeDashboardView } from '../features/home/HomeDashboardView';
import { BiControlTab } from '../features/home/tabs/BiControlTab';
import { AuthSession } from '../types/auth';
import { BiControlAnalyticsDto } from '../types/bi';
import {
  DEFAULT_RECEPTIONIST_PERMISSIONS,
  HomeDashboardMetricsDto,
} from '../types/dashboard';

const mockedInvoke = vi.mocked(invoke);

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

const mockControlData: BiControlAnalyticsDto = {
  fecha_desde: '2026-10-27',
  fecha_hasta: '2026-11-25',
  saldo_pendiente_total: '950.00',
  deudores_activos_count: 5,
  creditos_pendientes_count: 6,
  creditos_emitidos_periodo: '1200.00',
  creditos_cobrados_periodo: '900.00',
  tasa_recuperacion_pct: 75.0,
  aging_cartera: [
    { clave: '0_7', etiqueta: '0–7 días', monto: '450.00', cantidad: 3, porcentaje: 47.4 },
  ],
  deuda_por_origen: [
    {
      clave: 'MEMBRESIA_PAGO_PARCIAL',
      etiqueta: 'Membresía Pago Parcial',
      monto: '950.00',
      cantidad: 6,
      porcentaje: 100.0,
    },
  ],
  turnos_cerrados_count: 10,
  turnos_cuadre_exacto_count: 10,
  turnos_con_sobrante_count: 0,
  turnos_con_faltante_count: 0,
  descuadre_neto_acumulado: '0.00',
  arqueos_por_operador: [],
  ventas_totales_periodo: 100,
  ventas_tachadas_count: 0,
  ventas_anuladas_count: 0,
  tasa_anulacion_pct: 0.0,
  tachados_por_operador: [],
  eventos_criticos_auditoria: [],
  operadores_disponibles: [],
  generated_at: '2026-11-25 10:35:00',
};

describe('BI-Slice 5: Reporte Ejecutivo PDF Consolidado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('oculta Reporte Ejecutivo PDF Consolidado cuando canExportExecutivePdf es false', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_bi_control_analytics') return mockControlData;
      return null;
    });

    render(
      <BiControlTab
        canExportContextual={false}
        canExportExecutivePdf={false}
      />
    );

    expect(await screen.findByText('Saldo Pendiente Total')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /generar reporte ejecutivo \(pdf\)/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Reporte Ejecutivo PDF Consolidado')
    ).not.toBeInTheDocument();
  });

  it('permite seleccionar canal, invoca generate_executive_bi_report_pdf, descarga el PDF y maneja error', async () => {
    const user = userEvent.setup();
    const downloadSpy = vi
      .spyOn(printingBackupDomain, 'triggerBase64FileDownload')
      .mockImplementation(() => {});

    let shouldFailPdf = false;
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_bi_control_analytics') return mockControlData;
      if (cmd === 'generate_executive_bi_report_pdf') {
        if (shouldFailPdf) {
          throw { code: 'Forbidden', message: 'Permiso revocado para PDF ejecutivo.' };
        }
        return {
          filename: 'reporte_ejecutivo_zaramagym_2026-11-25.pdf',
          mime_type: 'application/pdf',
          content_base64: btoa('%PDF-1.4\n'),
          size_bytes: 2048,
          sha256_hash: 'abc123',
          row_count: 4,
          generated_at: '2026-11-25 11:00:00',
        };
      }
      return null;
    });

    render(
      <BiControlTab
        canExportContextual={true}
        canExportExecutivePdf={true}
      />
    );

    expect(
      await screen.findByText('Reporte Ejecutivo PDF Consolidado')
    ).toBeInTheDocument();

    const channelSelect = screen.getByLabelText(
      /canal de caja para reporte ejecutivo pdf/i
    );
    await user.selectOptions(channelSelect, 'FISICA');

    await user.click(
      screen.getByRole('button', { name: /generar reporte ejecutivo \(pdf\)/i })
    );

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('generate_executive_bi_report_pdf', {
        input: expect.objectContaining({
          fecha_desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          fecha_hasta: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          canal_caja: 'FISICA',
        }),
      });
    });

    expect(downloadSpy).toHaveBeenCalledWith(
      btoa('%PDF-1.4\n'),
      'reporte_ejecutivo_zaramagym_2026-11-25.pdf',
      'application/pdf'
    );
    expect(
      await screen.findByText(/reporte_ejecutivo_zaramagym_2026-11-25\.pdf/i)
    ).toBeInTheDocument();

    // Manejo de error
    shouldFailPdf = true;
    await user.selectOptions(channelSelect, 'DIGITAL');
    await user.click(
      screen.getByRole('button', { name: /generar reporte ejecutivo \(pdf\)/i })
    );
    expect(
      await screen.findByText(/Permiso revocado para PDF ejecutivo\./i)
    ).toBeInTheDocument();

    downloadSpy.mockRestore();
  }, 15000);

  it('HomeDashboardView muestra acceso rápido en Operativo (Hoy) si exportar_reporte_ejecutivo_pdf es true y ver_tab_control es false', async () => {
    const user = userEvent.setup();
    const downloadSpy = vi
      .spyOn(printingBackupDomain, 'triggerBase64FileDownload')
      .mockImplementation(() => {});

    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_my_effective_permissions') {
        return {
          ...DEFAULT_RECEPTIONIST_PERMISSIONS,
          exportar_reporte_ejecutivo_pdf: true,
        };
      }
      if (cmd === 'generate_executive_bi_report_pdf') {
        return {
          filename: 'ejecutivo_fallback.pdf',
          mime_type: 'application/pdf',
          content_base64: btoa('%PDF-1.4\n'),
          size_bytes: 1024,
          sha256_hash: 'def456',
          row_count: 4,
          generated_at: '2026-11-25 11:05:00',
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

    const pdfButton = await screen.findByRole('button', {
      name: /generar reporte ejecutivo \(pdf\)/i,
    });
    expect(
      screen.queryByRole('tab', { name: /control, riesgo y reportes/i })
    ).not.toBeInTheDocument();

    await user.click(pdfButton);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('generate_executive_bi_report_pdf', {
        input: expect.objectContaining({
          fecha_desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          fecha_hasta: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          canal_caja: 'MIXTA',
        }),
      });
    });
    expect(downloadSpy).toHaveBeenCalledWith(
      btoa('%PDF-1.4\n'),
      'ejecutivo_fallback.pdf',
      'application/pdf'
    );
    expect(await screen.findByText(/ejecutivo_fallback\.pdf/i)).toBeInTheDocument();

    downloadSpy.mockRestore();
  }, 15000);
});
