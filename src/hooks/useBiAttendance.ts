// ============================================================================
// HOOK REACTIVO: ASISTENCIA Y DEMANDA BI (BI-SLICE 3B)
// Gestiona filtros analíticos, heatmap 7x18, carga y exportación contextual
// Ubicación: src/hooks/useBiAttendance.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { triggerBase64FileDownload } from '../domain/printingBackup';
import { computeDatePresetRange } from '../features/home/components/BiFilterBar';
import { biIpc } from '../services/ipc/biIpc';
import { normalizeAppError } from '../services/ipc/client';
import { AppError } from '../types/auth';
import { BiAttendanceAnalyticsDto, BiAttendanceFilterInput } from '../types/bi';
import { ExportFileResult } from '../types/dashboard';

export interface UseBiAttendanceOptions {
  autoFetch?: boolean;
  enabled?: boolean;
}

function safeNormalizeError(err: unknown): AppError {
  if (typeof normalizeAppError === 'function') {
    return normalizeAppError(err);
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return {
      code: 'Internal',
      message: String((err as { message: unknown }).message),
    };
  }
  return {
    code: 'Internal',
    message: 'No se pudo consultar el análisis de asistencia y demanda.',
  };
}

function isValidBiAttendancePayload(data: unknown): data is BiAttendanceAnalyticsDto {
  return (
    Boolean(data) &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'total_asistencias' in (data as Record<string, unknown>) &&
    'heatmap' in (data as Record<string, unknown>)
  );
}

export function createDefaultBiAttendanceFilter(): BiAttendanceFilterInput {
  const range = computeDatePresetRange('30d');
  return {
    fecha_desde: range.fecha_desde,
    fecha_hasta: range.fecha_hasta,
    granularidad: null,
    rango_edad: null,
    genero: null,
    plan_id: null,
    color_semaforo: null,
    modo_ingreso: null,
  };
}

export function useBiAttendance(options: UseBiAttendanceOptions = {}) {
  const { autoFetch = true, enabled = true } = options;

  const [filter, setFilter] = useState<BiAttendanceFilterInput>(() =>
    createDefaultBiAttendanceFilter()
  );
  const [data, setData] = useState<BiAttendanceAnalyticsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch && enabled);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reload = useCallback(
    async (
      overrideFilter?: BiAttendanceFilterInput
    ): Promise<BiAttendanceAnalyticsDto | null> => {
      const targetFilter = overrideFilter ?? filter;
      setLoading(true);
      setError(null);
      try {
        const result = await biIpc.getBiAttendanceAnalytics(targetFilter);
        if (isValidBiAttendancePayload(result)) {
          setData(result);
          return result;
        }
        setData(null);
        return null;
      } catch (err) {
        setError(safeNormalizeError(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    if (!autoFetch || !enabled) return;
    void reload();
  }, [autoFetch, enabled, reload]);

  const exportReport = useCallback(
    async (format: 'CSV' | 'XLSX'): Promise<ExportFileResult> => {
      setExporting(true);
      setError(null);
      try {
        const result = await biIpc.exportBiAttendanceAnalytics({
          filter,
          format,
        });
        triggerBase64FileDownload(
          result.content_base64,
          result.filename,
          result.mime_type
        );
        return result;
      } catch (err) {
        const normalized = safeNormalizeError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setExporting(false);
      }
    },
    [filter]
  );

  return {
    filter,
    setFilter,
    data,
    loading,
    error,
    exporting,
    clearError,
    reload,
    exportReport,
  };
}
