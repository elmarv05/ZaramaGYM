// ============================================================================
// SERVICIOS IPC: MOTOR ANALÍTICO BI (BI-SLICE 2)
// Envoltorios tipados para Tauri v2
// Ubicación: src/services/ipc/biIpc.ts
// ============================================================================

import {
  BiAttendanceAnalyticsDto,
  BiAttendanceFilterInput,
  BiControlAnalyticsDto,
  BiControlFilterInput,
  BiExecutivePdfInput,
  BiExportAttendanceInput,
  BiExportControlInput,
  BiExportFinanceInput,
  BiExportInventoryInput,
  BiExportMembersInput,
  BiFinanceAnalyticsDto,
  BiFinanceFilterInput,
  BiInventoryAnalyticsDto,
  BiInventoryFilterInput,
  BiMembersAnalyticsDto,
  BiMembersFilterInput,
} from '../../types/bi';
import { ExportFileResult } from '../../types/dashboard';
import { safeInvoke } from './client';

export const biIpc = {
  /**
   * Consulta analítica integral de Finanzas y Rentabilidad con comparativo de periodo anterior
   */
  async getBiFinanceAnalytics(
    input: BiFinanceFilterInput
  ): Promise<BiFinanceAnalyticsDto> {
    return safeInvoke<BiFinanceAnalyticsDto>('get_bi_finance_analytics', { input });
  },

  /**
   * Exporta la vista contextual de Finanzas BI en CSV o XLSX
   */
  async exportBiFinanceAnalytics(
    input: BiExportFinanceInput
  ): Promise<ExportFileResult> {
    return safeInvoke<ExportFileResult>('export_bi_finance_analytics', { input });
  },

  /**
   * Consulta analítica de Socios, Retención, Demografía y Riesgo de Abandono (BI-Slice 3A)
   */
  async getBiMembersAnalytics(
    input: BiMembersFilterInput
  ): Promise<BiMembersAnalyticsDto> {
    return safeInvoke<BiMembersAnalyticsDto>('get_bi_members_analytics', { input });
  },

  /**
   * Exporta la vista contextual de Socios y Retención en CSV o XLSX
   */
  async exportBiMembersAnalytics(
    input: BiExportMembersInput
  ): Promise<ExportFileResult> {
    return safeInvoke<ExportFileResult>('export_bi_members_analytics', { input });
  },

  /**
   * Consulta analítica de Asistencia, Heatmap 7x18, Semáforo y Canales (BI-Slice 3B)
   */
  async getBiAttendanceAnalytics(
    input: BiAttendanceFilterInput
  ): Promise<BiAttendanceAnalyticsDto> {
    return safeInvoke<BiAttendanceAnalyticsDto>('get_bi_attendance_analytics', { input });
  },

  /**
   * Exporta la vista contextual de Asistencia y Demanda en CSV o XLSX
   */
  async exportBiAttendanceAnalytics(
    input: BiExportAttendanceInput
  ): Promise<ExportFileResult> {
    return safeInvoke<ExportFileResult>('export_bi_attendance_analytics', { input });
  },

  /**
   * Consulta analítica de Productos, Inventario, Stock Muerto y Mermas (BI-Slice 4A)
   */
  async getBiInventoryAnalytics(
    input: BiInventoryFilterInput
  ): Promise<BiInventoryAnalyticsDto> {
    return safeInvoke<BiInventoryAnalyticsDto>('get_bi_inventory_analytics', { input });
  },

  /**
   * Exporta la vista contextual de Productos e Inventario en CSV o XLSX
   */
  async exportBiInventoryAnalytics(
    input: BiExportInventoryInput
  ): Promise<ExportFileResult> {
    return safeInvoke<ExportFileResult>('export_bi_inventory_analytics', { input });
  },

  /**
   * Consulta analítica de Control, Riesgo, Aging de Cartera, Arqueos y Auditoría (BI-Slice 4B)
   */
  async getBiControlAnalytics(
    input: BiControlFilterInput
  ): Promise<BiControlAnalyticsDto> {
    return safeInvoke<BiControlAnalyticsDto>('get_bi_control_analytics', { input });
  },

  /**
   * Exporta la vista contextual de Control y Riesgo en CSV o XLSX
   */
  async exportBiControlAnalytics(
    input: BiExportControlInput
  ): Promise<ExportFileResult> {
    return safeInvoke<ExportFileResult>('export_bi_control_analytics', { input });
  },

  /**
   * Genera el Reporte Ejecutivo PDF Consolidado multipágina de los 4 bloques BI (BI-Slice 5)
   */
  async generateExecutiveBiReportPdf(
    input: BiExecutivePdfInput
  ): Promise<ExportFileResult> {
    return safeInvoke<ExportFileResult>('generate_executive_bi_report_pdf', { input });
  },
};
