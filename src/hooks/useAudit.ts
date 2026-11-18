// ============================================================================
// HOOK DE CONSULTA DE BITÁCORA DE AUDITORÍA
// Ubicación: src/hooks/useAudit.ts
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { AuditFilter, AuditLogItem, AppError } from '../types/auth';
import { auditIpc } from '../services/ipc/auditIpc';
import { normalizeAppError } from '../services/ipc/client';

export interface UseAuditReturn {
  logs: AuditLogItem[];
  filter: AuditFilter;
  isLoading: boolean;
  error: AppError | null;
  setFilter: (filter: AuditFilter | ((prev: AuditFilter) => AuditFilter)) => void;
  fetchLogs: (customFilter?: AuditFilter) => Promise<void>;
  clearError: () => void;
}

export function useAudit(initialFilter: AuditFilter = {}, autoFetch = true): UseAuditReturn {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [filter, setFilter] = useState<AuditFilter>(initialFilter);
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchLogs = useCallback(
    async (customFilter?: AuditFilter) => {
      try {
        setIsLoading(true);
        setError(null);
        const activeFilter = customFilter !== undefined ? customFilter : filter;
        const data = await auditIpc.getAuditLogs(activeFilter);
        setLogs(data);
      } catch (err) {
        setError(normalizeAppError(err));
      } finally {
        setIsLoading(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    if (autoFetch) {
      fetchLogs();
    }
  }, [autoFetch, fetchLogs]);

  return {
    logs,
    filter,
    isLoading,
    error,
    setFilter,
    fetchLogs,
    clearError,
  };
}
