// ============================================================================
// HOOK REACTIVO: FINANZAS Y RENTABILIDAD BI (BI-SLICE 2)
// Gestiona filtros reactivos (rango, granularidad, canal), carga y exportación
// Ubicación: src/hooks/useBiFinance.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { triggerBase64FileDownload } from '../domain/printingBackup';
import { computeDatePresetRange } from '../features/home/components/BiFilterBar';
import { biIpc } from '../services/ipc/biIpc';
import { normalizeAppError } from '../services/ipc/client';
import { AppError } from '../types/auth';
import { BiFinanceAnalyticsDto, BiFinanceFilterInput } from '../types/bi';
import { ExportFileResult } from '../types/dashboard';

export interface UseBiFinanceOptions {
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
    message: 'No se pudo consultar el análisis financiero BI.',
  };
}

function isValidBiFinancePayload(data: unknown): data is BiFinanceAnalyticsDto {
  return (
    Boolean(data) &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'ingresos' in (data as Record<string, unknown>) &&
    'serie_temporal' in (data as Record<string, unknown>)
  );
}

export function createDefaultBiFinanceFilter(): BiFinanceFilterInput {
  const range = computeDatePresetRange('30d');
  return {
    fecha_desde: range.fecha_desde,
    fecha_hasta: range.fecha_hasta,
    granularidad: null,
    canal_caja: 'MIXTA',
  };
}

export function useBiFinance(options: UseBiFinanceOptions = {}) {
  const { autoFetch = true, enabled = true } = options;

  const [filter, setFilter] = useState<BiFinanceFilterInput>(() =>
    createDefaultBiFinanceFilter()
  );
  const [data, setData] = useState<BiFinanceAnalyticsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch && enabled);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reload = useCallback(
    async (overrideFilter?: BiFinanceFilterInput): Promise<BiFinanceAnalyticsDto | null> => {
      const targetFilter = overrideFilter ?? filter;
      setLoading(true);
      setError(null);
      try {
        const result = await biIpc.getBiFinanceAnalytics(targetFilter);
        if (isValidBiFinancePayload(result)) {
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
        const result = await biIpc.exportBiFinanceAnalytics({
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
