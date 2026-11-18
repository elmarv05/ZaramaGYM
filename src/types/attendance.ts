// ============================================================================
// TIPOS E INTERFACES FRONTEND: CONTROL DE ASISTENCIAS (SLICE 5)
// Semáforo Inteligente, Prevención Anti-Rebote y Prórrogas de Días
// Ubicación: src/types/attendance.ts
// ============================================================================

export type TrafficLightColor = 'VERDE' | 'AMARILLO' | 'ROJO';

export type AttendanceCheckInMode =
  | 'QR_LOCAL'
  | 'QR_MOVIL_LAN'
  | 'MANUAL_OLVIDO_QR'
  | 'PASE_DIARIO_CREDITO_ROJO';

export interface CheckInInput {
  qrToken?: string;
  clienteId?: number;
  numeroDocumento?: string;
  modoIngreso?: AttendanceCheckInMode;
  notas?: string;
}

export interface AuthorizeRedPassInput {
  clienteId: number;
  montoPase?: string | number;
  notas?: string;
}

export interface AttendanceFilter {
  fechaDesde?: string;
  fechaHasta?: string;
  colorSemaforo?: TrafficLightColor;
  modoIngreso?: AttendanceCheckInMode;
  clienteId?: number;
  busqueda?: string;
  limit?: number;
  offset?: number;
}

export interface ExtendMembershipInput {
  membresiaId: number;
  diasOtorgados: number;
  motivoJustificacion: string;
}

export interface MembershipExtensionFilter {
  membresiaId?: number;
  clienteId?: number;
  fechaDesde?: string;
  fechaHasta?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateSystemConfigInput {
  diasAlertaAmarillo?: number;
  minutosAntireboteQr?: number;
  precioPaseDiarioCreditoDefault?: string | number;
}

export interface CheckInEvaluationDto {
  asistenciaId: number | null;
  clienteId: number;
  nombreCompleto: string;
  tipoDocumento: string;
  numeroDocumento: string;
  fotoPerfilDataUrl: string | null;
  colorSemaforo: TrafficLightColor;
  ingresoPermitido: boolean;
  alertaSonora: boolean;
  esRebote: boolean;
  motivoSemaforo: string;
  membresiaId: number | null;
  nombrePlan: string | null;
  fechaVencimiento: string | null;
  diasRestantes: number | null;
  deudaTotalPendiente: string;
  modoIngreso: AttendanceCheckInMode;
  fechaHoraIngreso: string;
  creditoGeneradoId: number | null;
}

export interface AttendanceListItemDto {
  id: number;
  clienteId: number;
  nombreCompleto: string;
  tipoDocumento: string;
  numeroDocumento: string;
  membresiaId: number | null;
  nombrePlan: string | null;
  fechaHoraIngreso: string;
  modoIngreso: AttendanceCheckInMode;
  colorSemaforo: TrafficLightColor;
  motivoSemaforo: string;
  diasRestantesMomento: number | null;
  deudaPendienteMomento: string;
  creditoGeneradoId: number | null;
  registradoPorUsuarioId: number;
  registradoPorNombre: string;
  notas: string | null;
  createdAt: string;
}

export interface AttendanceTodaySummaryDto {
  totalIngresosHoy: number;
  totalVerde: number;
  totalAmarillo: number;
  totalRojoAutorizados: number;
  totalQrLocal: number;
  totalManualOlvido: number;
  totalPaseCredito: number;
  totalQrMovil: number;
  ultimoIngresoHora: string | null;
}

export interface MembershipExtensionDto {
  id: number;
  membresiaId: number;
  clienteId: number;
  nombreCliente: string;
  nombrePlan: string;
  diasOtorgados: number;
  fechaVencimientoAnterior: string;
  fechaVencimientoNueva: string;
  motivoJustificacion: string;
  autorizadoPorUsuarioId: number;
  autorizadoPorNombre: string;
  createdAt: string;
}

export interface SystemConfigDto {
  diasAlertaAmarillo: number;
  minutosAntireboteQr: number;
  precioPaseDiarioCreditoDefault: string;
  updatedAt: string;
}
