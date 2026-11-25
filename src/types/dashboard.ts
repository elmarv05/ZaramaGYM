// ============================================================================
// CONTRATOS Y TIPOS DE DOMINIO: HOME DASHBOARD Y EXPORTACIONES CONTABLES
// Fase 2 (Tareas 2.2 y 2.3) - Ubicación: src/types/dashboard.ts
// ============================================================================

export interface HourlyAttendancePoint {
  franja: string;
  hora: number;
  total: number;
}

export interface ExpiringMembershipAlert {
  cliente_id: number;
  nombre_completo: string;
  telefono: string | null;
  nombre_plan: string;
  fecha_vencimiento: string;
  dias_restantes: number;
}

export interface HomeDashboardMetricsDto {
  clientes_activos: number;
  membresias_activas: number;
  asistencias_hoy_total: number;
  deudores_activos_count: number;
  saldo_creditos_pendiente: string;
  ingresos_hoy_fisico: string;
  ingresos_hoy_digital: string;
  ingresos_hoy_total: string;
  ingresos_mes_fisico: string;
  ingresos_mes_digital: string;
  ingresos_mes_total: string;
  can_view_monthly_revenue: boolean;
  afluencia_por_franja: HourlyAttendancePoint[];
  membresias_por_vencer: ExpiringMembershipAlert[];
  generated_at: string;
}

export type ExportFormat = 'CSV' | 'XLSX' | 'PDF';

export interface ExportFileResult {
  filename: string;
  mime_type: string;
  content_base64: string;
  size_bytes: number;
  sha256_hash: string;
  row_count: number;
}

export interface ExportSalesReportRequest {
  fecha_desde?: string | null;
  fecha_hasta?: string | null;
  canal_filtro?: string | null;
  format: ExportFormat;
}

// ============================================================================
// PERMISOS GRANULARES RBAC CONFIGURABLES PARA RECEPCIONISTA (BI-SLICE 1)
// Secure-by-Default: todos en false para Recepcionista; todos en true para Admin
// ============================================================================

export interface ReceptionistPermissionsDto {
  ver_ingresos_mes_operativo: boolean;
  ver_tab_finanzas: boolean;
  ver_dashboard_modulo_finanzas: boolean;
  ver_tab_socios: boolean;
  ver_tab_asistencia: boolean;
  ver_tab_inventario: boolean;
  ver_tab_control: boolean;
  exportar_clientes: boolean;
  exportar_deudores: boolean;
  exportar_ventas_caja: boolean;
  exportar_contextual_bi: boolean;
  exportar_reporte_ejecutivo_pdf: boolean;
}

export const DEFAULT_RECEPTIONIST_PERMISSIONS: ReceptionistPermissionsDto = {
  ver_ingresos_mes_operativo: false,
  ver_tab_finanzas: false,
  ver_dashboard_modulo_finanzas: false,
  ver_tab_socios: false,
  ver_tab_asistencia: false,
  ver_tab_inventario: false,
  ver_tab_control: false,
  exportar_clientes: false,
  exportar_deudores: false,
  exportar_ventas_caja: false,
  exportar_contextual_bi: false,
  exportar_reporte_ejecutivo_pdf: false,
};

export const ADMIN_EFFECTIVE_PERMISSIONS: ReceptionistPermissionsDto = {
  ver_ingresos_mes_operativo: true,
  ver_tab_finanzas: true,
  ver_dashboard_modulo_finanzas: true,
  ver_tab_socios: true,
  ver_tab_asistencia: true,
  ver_tab_inventario: true,
  ver_tab_control: true,
  exportar_clientes: true,
  exportar_deudores: true,
  exportar_ventas_caja: true,
  exportar_contextual_bi: true,
  exportar_reporte_ejecutivo_pdf: true,
};
