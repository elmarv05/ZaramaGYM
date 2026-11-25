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
  ReceptionistPermissionsDto,
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
   * Consulta la configuración actual de permisos del rol Recepcionista (Admin)
   */
  async getReceptionistPermissions(): Promise<ReceptionistPermissionsDto> {
    return safeInvoke<ReceptionistPermissionsDto>('get_receptionist_permissions');
  },

  /**
   * Consulta los permisos efectivos del usuario en sesión
   */
  async getMyEffectivePermissions(): Promise<ReceptionistPermissionsDto> {
    return safeInvoke<ReceptionistPermissionsDto>('get_my_effective_permissions');
  },

  /**
   * Actualiza la matriz de permisos del rol Recepcionista (solo Admin)
   */
  async updateReceptionistPermissions(
    input: ReceptionistPermissionsDto
  ): Promise<ReceptionistPermissionsDto> {
    return safeInvoke<ReceptionistPermissionsDto>('update_receptionist_permissions', {
      input,
    });
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
