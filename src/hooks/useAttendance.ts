// ============================================================================
// HOOK REACTIVO: CONTROL DE ASISTENCIAS, SEMÁFORO Y EXTENSIONES (SLICE 5)
// Gestión integral de estados: Loading, Empty, Error, Success
// Ubicación: src/hooks/useAttendance.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import {
  playTrafficLightSound,
  validateExtensionInput,
  validateSystemConfig,
} from '../domain/attendance';
import { attendanceIpc } from '../services/ipc/attendanceIpc';
import { emitSidebarAlertsRefresh } from '../utils/sidebarAlerts';
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
} from '../types/attendance';

export interface UseAttendanceReturn {
  currentEvaluation: CheckInEvaluationDto | null;
  todaySummary: AttendanceTodaySummaryDto | null;
  attendances: AttendanceListItemDto[];
  extensions: MembershipExtensionDto[];
  systemConfig: SystemConfigDto | null;
  isLoading: boolean;
  isActionLoading: boolean;
  error: string | null;

  // Acciones
  checkIn: (input: CheckInInput) => Promise<CheckInEvaluationDto>;
  authorizeRedPass: (input: AuthorizeRedPassInput) => Promise<CheckInEvaluationDto>;
  extendMembership: (
    input: ExtendMembershipInput,
    permiteRecuperacionDias?: boolean
  ) => Promise<MembershipExtensionDto>;
  fetchSummary: () => Promise<void>;
  fetchAttendances: (filter?: AttendanceFilter) => Promise<void>;
  fetchExtensions: (filter?: MembershipExtensionFilter) => Promise<void>;
  fetchConfig: () => Promise<void>;
  updateConfig: (input: UpdateSystemConfigInput) => Promise<SystemConfigDto>;
  resetCurrentEvaluation: () => void;
  clearError: () => void;
}

export function useAttendance(autoFetch = true): UseAttendanceReturn {
  const [currentEvaluation, setCurrentEvaluation] = useState<CheckInEvaluationDto | null>(null);
  const [todaySummary, setTodaySummary] = useState<AttendanceTodaySummaryDto | null>(null);
  const [attendances, setAttendances] = useState<AttendanceListItemDto[]>([]);
  const [extensions, setExtensions] = useState<MembershipExtensionDto[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfigDto | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const resetCurrentEvaluation = useCallback(() => {
    setCurrentEvaluation(null);
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const summary = await attendanceIpc.getAttendanceSummaryToday();
      setTodaySummary(summary);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al consultar resumen de asistencias de hoy';
      // No bloqueamos toda la pantalla si solo falla el summary
      console.error('fetchSummary error:', msg);
    }
  }, []);

  const fetchAttendances = useCallback(async (filter: AttendanceFilter = {}) => {
    try {
      const list = await attendanceIpc.listAttendances(filter);
      setAttendances(list);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al listar asistencias';
      setError(msg);
    }
  }, []);

  const fetchExtensions = useCallback(async (filter: MembershipExtensionFilter = {}) => {
    try {
      const list = await attendanceIpc.listMembershipExtensions(filter);
      setExtensions(list);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al consultar extensiones de membresía';
      setError(msg);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const config = await attendanceIpc.getSystemConfig();
      setSystemConfig(config);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al consultar configuración del sistema';
      console.error('fetchConfig error:', msg);
    }
  }, []);

  // Check-in por QR o DNI
  const checkIn = useCallback(
    async (input: CheckInInput): Promise<CheckInEvaluationDto> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const evaluation = await attendanceIpc.checkInClient(input);
        setCurrentEvaluation(evaluation);
        playTrafficLightSound(evaluation.colorSemaforo);

        // Si fue exitoso o rebote, refrescar métricas e historial sin bloquear
        void fetchSummary();
        void fetchAttendances();

        return evaluation;
      } catch (err: unknown) {
        const msg = err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al procesar ingreso de cliente';
        setError(msg);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchSummary, fetchAttendances]
  );

  // Autorización de Pase Diario a Crédito desde Semáforo Rojo
  const authorizeRedPass = useCallback(
    async (input: AuthorizeRedPassInput): Promise<CheckInEvaluationDto> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const result = await attendanceIpc.authorizeRedDailyPassCredit(input);
        setCurrentEvaluation(result);
        playTrafficLightSound('VERDE');

        void fetchSummary();
        void fetchAttendances();
        emitSidebarAlertsRefresh();

        return result;
      } catch (err: unknown) {
        const msg = err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al autorizar pase diario a crédito';
        setError(msg);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchSummary, fetchAttendances]
  );

  // Extensión manual justificada de días
  const extendMembership = useCallback(
    async (
      input: ExtendMembershipInput,
      permiteRecuperacionDias = true
    ): Promise<MembershipExtensionDto> => {
      const validation = validateExtensionInput({
        diasOtorgados: input.diasOtorgados,
        motivoJustificacion: input.motivoJustificacion,
        permiteRecuperacionDias,
      });

      if (!validation.isValid) {
        const validationError = validation.error || 'Datos de extensión inválidos';
        setError(validationError);
        throw new Error(validationError);
      }

      setIsActionLoading(true);
      setError(null);
      try {
        const ext = await attendanceIpc.extendMembershipDays(input);
        void fetchExtensions();
        return ext;
      } catch (err: unknown) {
        const msg = err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al otorgar días de membresía';
        setError(msg);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchExtensions]
  );

  // Actualizar parámetros operativos
  const updateConfig = useCallback(
    async (input: UpdateSystemConfigInput): Promise<SystemConfigDto> => {
      const validation = validateSystemConfig(input);
      if (!validation.isValid) {
        const validationError = validation.error || 'Parámetros de configuración inválidos';
        setError(validationError);
        throw new Error(validationError);
      }

      setIsActionLoading(true);
      setError(null);
      try {
        const updated = await attendanceIpc.updateSystemConfig(input);
        setSystemConfig(updated);
        return updated;
      } catch (err: unknown) {
        const msg = err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al actualizar configuración';
        setError(msg);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!autoFetch) return;

    let isMounted = true;
    setIsLoading(true);

    Promise.allSettled([
      attendanceIpc.getAttendanceSummaryToday(),
      attendanceIpc.listAttendances(),
      attendanceIpc.listMembershipExtensions(),
      attendanceIpc.getSystemConfig(),
    ]).then(([summaryRes, listRes, extRes, cfgRes]) => {
      if (!isMounted) return;

      if (summaryRes.status === 'fulfilled') setTodaySummary(summaryRes.value);
      if (listRes.status === 'fulfilled') setAttendances(listRes.value);
      if (extRes.status === 'fulfilled') setExtensions(extRes.value);
      if (cfgRes.status === 'fulfilled') setSystemConfig(cfgRes.value);

      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [autoFetch]);

  return {
    currentEvaluation,
    todaySummary,
    attendances,
    extensions,
    systemConfig,
    isLoading,
    isActionLoading,
    error,
    checkIn,
    authorizeRedPass,
    extendMembership,
    fetchSummary,
    fetchAttendances,
    fetchExtensions,
    fetchConfig,
    updateConfig,
    resetCurrentEvaluation,
    clearError,
  };
}
