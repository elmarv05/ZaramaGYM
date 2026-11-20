// ============================================================================
// SERVICIOS IPC: CONTROL DE ASISTENCIAS, SEMÁFORO Y EXTENSIONES (SLICE 5)
// Envoltorios tipados para Tauri v2 con dual-binding camelCase + snake_case
// Ubicación: src/services/ipc/attendanceIpc.ts
// ============================================================================

import {
  AttendanceFilter,
  AttendanceListItemDto,
  AttendanceTodaySummaryDto,
  AuthorizeRedPassInput,
  CheckInEvaluationDto,
  CheckInInput,
  ExtendMembershipInput,
  MembershipExtensionDto,
  MembershipExtensionFilter,
  SystemConfigDto,
  UpdateSystemConfigInput,
} from '../../types/attendance';
import { safeInvoke } from './client';

export const attendanceIpc = {
  /**
   * Ejecuta la evaluación determinista del semáforo y registro de asistencia por QR o DNI
   */
  async checkInClient(input: CheckInInput): Promise<CheckInEvaluationDto> {
    return safeInvoke<CheckInEvaluationDto>('check_in_client', {
      input,
    });
  },

  /**
   * Autoriza el ingreso en semáforo rojo otorgando un Pase Diario a crédito
   */
  async authorizeRedDailyPassCredit(input: AuthorizeRedPassInput): Promise<CheckInEvaluationDto> {
    return safeInvoke<CheckInEvaluationDto>('authorize_red_daily_pass_credit', {
      input,
    });
  },

  /**
   * Lista el historial de asistencias con filtros por fecha, semáforo, modo o cliente
   */
  async listAttendances(filter: AttendanceFilter = {}): Promise<AttendanceListItemDto[]> {
    return safeInvoke<AttendanceListItemDto[]>('list_attendances', {
      filter,
    });
  },

  /**
   * Obtiene las métricas agregadas de aforo y semáforos de la jornada en curso
   */
  async getAttendanceSummaryToday(): Promise<AttendanceTodaySummaryDto> {
    return safeInvoke<AttendanceTodaySummaryDto>('get_attendance_summary_today');
  },

  /**
   * Otorga una extensión manual de días justificada a una membresía activa
   */
  async extendMembershipDays(input: ExtendMembershipInput): Promise<MembershipExtensionDto> {
    return safeInvoke<MembershipExtensionDto>('extend_membership_days', {
      input,
    });
  },

  /**
   * Consulta el historial de prórrogas y recuperación de días otorgadas
   */
  async listMembershipExtensions(
    filter: MembershipExtensionFilter = {}
  ): Promise<MembershipExtensionDto[]> {
    return safeInvoke<MembershipExtensionDto[]>('list_membership_extensions', {
      filter,
    });
  },

  /**
   * Obtiene los parámetros operativos del sistema (umbral amarillo, anti-rebote, precio crédito)
   */
  async getSystemConfig(): Promise<SystemConfigDto> {
    return safeInvoke<SystemConfigDto>('get_system_config');
  },

  /**
   * Modifica los parámetros operativos del sistema (solo Administrador)
   */
  async updateSystemConfig(input: UpdateSystemConfigInput): Promise<SystemConfigDto> {
    return safeInvoke<SystemConfigDto>('update_system_config', {
      input,
    });
  },
};
