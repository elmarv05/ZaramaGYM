// ============================================================================
// HOOK REACTIVO: CONTROL, RIESGO Y REPORTES BI (BI-SLICE 4B)
// Gestiona filtros de operador/origen de crédito, aging, arqueos y exportación
// Ubicación: src/hooks/useBiControl.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { triggerBase64FileDownload } from '../domain/printingBackup';
import { computeDatePresetRange } from '../features/home/components/BiFilterBar';
import { biIpc } from '../services/ipc/biIpc';
import { normalizeAppError } from '../services/ipc/client';
import { AppError } from '../types/auth';
import { BiControlAnalyticsDto, BiControlFilterInput } from '../types/bi';
import { ExportFileResult } from '../types/dashboard';

export interface UseBiControlOptions {
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
    message: 'No se pudo consultar el análisis de control y riesgo.',
  };
}

function isValidBiControlPayload(data: unknown): data is BiControlAnalyticsDto {
  return (
    Boolean(data) &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'saldo_pendiente_total' in (data as Record<string, unknown>) &&
    'aging_cartera' in (data as Record<string, unknown>)
  );
}

export function createDefaultBiControlFilter(): BiControlFilterInput {
  const range = computeDatePresetRange('30d');
  return {
    fecha_desde: range.fecha_desde,
    fecha_hasta: range.fecha_hasta,
    usuario_id: null,
    origen_credito: null,
  };
}

export function useBiControl(options: UseBiControlOptions = {}) {
  const { autoFetch = true, enabled = true } = options;

  const [filter, setFilter] = useState<BiControlFilterInput>(() =>
    createDefaultBiControlFilter()
  );
  const [data, setData] = useState<BiControlAnalyticsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch && enabled);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reload = useCallback(
    async (overrideFilter?: BiControlFilterInput): Promise<BiControlAnalyticsDto | null> => {
      const targetFilter = overrideFilter ?? filter;
      setLoading(true);
      setError(null);
      try {
        const result = await biIpc.getBiControlAnalytics(targetFilter);
        if (isValidBiControlPayload(result)) {
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
        const result = await biIpc.exportBiControlAnalytics({
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
