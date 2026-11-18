// ============================================================================
// HOOK REACTIVO: HOME DASHBOARD Y EXPORTACIONES CONTABLES (FASE 2)
// Encapsula llamadas IPC de métricas analíticas y descarga automática Base64
// Ubicación: src/hooks/useDashboard.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { triggerBase64FileDownload } from '../domain/printingBackup';
import { normalizeAppError } from '../services/ipc/client';
import { dashboardIpc } from '../services/ipc/dashboardIpc';
import { AppError } from '../types/auth';
import {
  ExportFileResult,
  ExportFormat,
  ExportSalesReportRequest,
  HomeDashboardMetricsDto,
} from '../types/dashboard';

export interface UseDashboardOptions {
  autoFetch?: boolean;
}

function isValidMetricsPayload(data: unknown): data is HomeDashboardMetricsDto {
  return (
    Boolean(data) &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'clientes_activos' in (data as Record<string, unknown>)
  );
}

export function useDashboard(options: UseDashboardOptions = {}) {
  const { autoFetch = true } = options;

  const [metrics, setMetrics] = useState<HomeDashboardMetricsDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshMetrics = useCallback(async (): Promise<HomeDashboardMetricsDto | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await dashboardIpc.getHomeDashboardMetrics();
      if (isValidMetricsPayload(data)) {
        setMetrics(data);
        return data;
      }
      setMetrics(null);
      return null;
    } catch (err) {
      const normalized = normalizeAppError(err);
      setError(normalized);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoFetch) return;
    void refreshMetrics();
  }, [autoFetch, refreshMetrics]);

  const exportClients = useCallback(async (format: ExportFormat): Promise<ExportFileResult> => {
    setIsExporting(true);
    setError(null);
    try {
      const result = await dashboardIpc.exportClientsRoster(format);
      triggerBase64FileDownload(result.content_base64, result.filename, result.mime_type);
      return result;
    } catch (err) {
      const normalized = normalizeAppError(err);
      setError(normalized);
      throw normalized;
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportDebtors = useCallback(async (format: ExportFormat): Promise<ExportFileResult> => {
    setIsExporting(true);
    setError(null);
    try {
      const result = await dashboardIpc.exportDebtorsPortfolio(format);
      triggerBase64FileDownload(result.content_base64, result.filename, result.mime_type);
      return result;
    } catch (err) {
      const normalized = normalizeAppError(err);
      setError(normalized);
      throw normalized;
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportSalesCash = useCallback(
    async (request: ExportSalesReportRequest): Promise<ExportFileResult> => {
      setIsExporting(true);
      setError(null);
      try {
        const result = await dashboardIpc.exportSalesCashReport(request);
        triggerBase64FileDownload(result.content_base64, result.filename, result.mime_type);
        return result;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  return {
    metrics,
    isLoading,
    isExporting,
    error,
    clearError,
    refreshMetrics,
    exportClients,
    exportDebtors,
    exportSalesCash,
  };
}
