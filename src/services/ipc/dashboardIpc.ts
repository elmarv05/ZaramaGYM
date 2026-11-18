// ============================================================================
// SERVICIOS IPC: HOME DASHBOARD Y EXPORTACIONES CONTABLES (FASE 2)
// Envoltorios tipados para Tauri v2
// Ubicación: src/services/ipc/dashboardIpc.ts
// ============================================================================

import {
  ExportFileResult,
  ExportFormat,
  ExportSalesReportRequest,
  HomeDashboardMetricsDto,
} from '../../types/dashboard';
import { safeInvoke } from './client';

export const dashboardIpc = {
  /**
   * Consulta las métricas consolidadas en vivo para el Home Dashboard
   */
  async getHomeDashboardMetrics(): Promise<HomeDashboardMetricsDto> {
    return safeInvoke<HomeDashboardMetricsDto>('get_home_dashboard_metrics');
  },

  /**
   * Exporta el padrón general de clientes en CSV, XLSX o PDF
   */
  async exportClientsRoster(format: ExportFormat): Promise<ExportFileResult> {
    return safeInvoke<ExportFileResult>('export_clients_roster', { format });
  },

  /**
   * Exporta la cartera de créditos y deudores en CSV, XLSX o PDF
   */
  async exportDebtorsPortfolio(format: ExportFormat): Promise<ExportFileResult> {
    return safeInvoke<ExportFileResult>('export_debtors_portfolio', { format });
  },

  /**
   * Exporta el reporte detallado de ventas y movimientos de caja en CSV, XLSX o PDF
   */
  async exportSalesCashReport(
    request: ExportSalesReportRequest
  ): Promise<ExportFileResult> {
    return safeInvoke<ExportFileResult>('export_sales_cash_report', {
      request,
      input: request,
    });
  },
};
