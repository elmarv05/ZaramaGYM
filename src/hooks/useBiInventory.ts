// ============================================================================
// HOOK REACTIVO: PRODUCTOS E INVENTARIO BI (BI-SLICE 4A)
// Gestiona filtros de categoría/proveedor/stock muerto, carga y exportación
// Ubicación: src/hooks/useBiInventory.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { triggerBase64FileDownload } from '../domain/printingBackup';
import { computeDatePresetRange } from '../features/home/components/BiFilterBar';
import { biIpc } from '../services/ipc/biIpc';
import { normalizeAppError } from '../services/ipc/client';
import { AppError } from '../types/auth';
import { BiInventoryAnalyticsDto, BiInventoryFilterInput } from '../types/bi';
import { ExportFileResult } from '../types/dashboard';

export interface UseBiInventoryOptions {
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
    message: 'No se pudo consultar el análisis de productos e inventario.',
  };
}

function isValidBiInventoryPayload(data: unknown): data is BiInventoryAnalyticsDto {
  return (
    Boolean(data) &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'ingresos_productos' in (data as Record<string, unknown>) &&
    'top_productos' in (data as Record<string, unknown>)
  );
}

export function createDefaultBiInventoryFilter(): BiInventoryFilterInput {
  const range = computeDatePresetRange('30d');
  return {
    fecha_desde: range.fecha_desde,
    fecha_hasta: range.fecha_hasta,
    categoria: null,
    proveedor_id: null,
    dias_stock_muerto: 30,
  };
}

export function useBiInventory(options: UseBiInventoryOptions = {}) {
  const { autoFetch = true, enabled = true } = options;

  const [filter, setFilter] = useState<BiInventoryFilterInput>(() =>
    createDefaultBiInventoryFilter()
  );
  const [data, setData] = useState<BiInventoryAnalyticsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch && enabled);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reload = useCallback(
    async (
      overrideFilter?: BiInventoryFilterInput
    ): Promise<BiInventoryAnalyticsDto | null> => {
      const targetFilter = overrideFilter ?? filter;
      setLoading(true);
      setError(null);
      try {
        const result = await biIpc.getBiInventoryAnalytics(targetFilter);
        if (isValidBiInventoryPayload(result)) {
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
        const result = await biIpc.exportBiInventoryAnalytics({
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
