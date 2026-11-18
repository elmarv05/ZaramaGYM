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
