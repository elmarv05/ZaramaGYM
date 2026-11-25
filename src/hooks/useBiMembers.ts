// ============================================================================
// HOOK REACTIVO: SOCIOS Y RETENCIÓN BI (BI-SLICE 3A)
// Gestiona filtros analíticos, carga y exportación contextual de socios
// Ubicación: src/hooks/useBiMembers.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { triggerBase64FileDownload } from '../domain/printingBackup';
import { computeDatePresetRange } from '../features/home/components/BiFilterBar';
import { biIpc } from '../services/ipc/biIpc';
import { normalizeAppError } from '../services/ipc/client';
import { AppError } from '../types/auth';
import { BiMembersAnalyticsDto, BiMembersFilterInput } from '../types/bi';
import { ExportFileResult } from '../types/dashboard';

export interface UseBiMembersOptions {
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
    message: 'No se pudo consultar el análisis de socios y retención.',
  };
}

function isValidBiMembersPayload(data: unknown): data is BiMembersAnalyticsDto {
  return (
    Boolean(data) &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'nuevos_socios' in (data as Record<string, unknown>) &&
    'serie_movimiento' in (data as Record<string, unknown>)
  );
}

export function createDefaultBiMembersFilter(): BiMembersFilterInput {
  const range = computeDatePresetRange('30d');
  return {
    fecha_desde: range.fecha_desde,
    fecha_hasta: range.fecha_hasta,
    granularidad: null,
    rango_edad: null,
    genero: null,
    canal_captacion: null,
    plan_id: null,
    dias_inactividad_riesgo: 14,
  };
}

export function useBiMembers(options: UseBiMembersOptions = {}) {
  const { autoFetch = true, enabled = true } = options;

  const [filter, setFilter] = useState<BiMembersFilterInput>(() =>
    createDefaultBiMembersFilter()
  );
  const [data, setData] = useState<BiMembersAnalyticsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch && enabled);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reload = useCallback(
    async (overrideFilter?: BiMembersFilterInput): Promise<BiMembersAnalyticsDto | null> => {
      const targetFilter = overrideFilter ?? filter;
      setLoading(true);
      setError(null);
      try {
        const result = await biIpc.getBiMembersAnalytics(targetFilter);
        if (isValidBiMembersPayload(result)) {
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
        const result = await biIpc.exportBiMembersAnalytics({
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
