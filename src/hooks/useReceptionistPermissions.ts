// ============================================================================
// HOOK REACTIVO: PERMISOS RBAC CONFIGURABLES DE RECEPCIONISTA (BI-SLICE 1)
// Lectura de permisos efectivos sin parpadeo + gestión administrativa con eventos
// Ubicación: src/hooks/useReceptionistPermissions.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { normalizeAppError } from '../services/ipc/client';
import { dashboardIpc } from '../services/ipc/dashboardIpc';
import { AppError, UserRole } from '../types/auth';
import {
  ADMIN_EFFECTIVE_PERMISSIONS,
  DEFAULT_RECEPTIONIST_PERMISSIONS,
  ReceptionistPermissionsDto,
} from '../types/dashboard';

export const PERMISSIONS_UPDATED_EVENT = 'zaramagym:permissions-updated';

export function emitReceptionistPermissionsUpdated(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(PERMISSIONS_UPDATED_EVENT));
  }
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
    message: 'Error inesperado al consultar permisos de recepción.',
  };
}

export function isValidPermissionsPayload(
  data: unknown
): data is ReceptionistPermissionsDto {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return (
    typeof record.ver_ingresos_mes_operativo === 'boolean' &&
    typeof record.ver_tab_finanzas === 'boolean' &&
    typeof record.ver_dashboard_modulo_finanzas === 'boolean' &&
    typeof record.ver_tab_socios === 'boolean' &&
    typeof record.ver_tab_asistencia === 'boolean' &&
    typeof record.ver_tab_inventario === 'boolean' &&
    typeof record.ver_tab_control === 'boolean' &&
    typeof record.exportar_clientes === 'boolean' &&
    typeof record.exportar_deudores === 'boolean' &&
    typeof record.exportar_ventas_caja === 'boolean' &&
    typeof record.exportar_contextual_bi === 'boolean' &&
    typeof record.exportar_reporte_ejecutivo_pdf === 'boolean'
  );
}

export function normalizePermissionsPayload(
  data: unknown,
  fallback: ReceptionistPermissionsDto = DEFAULT_RECEPTIONIST_PERMISSIONS
): ReceptionistPermissionsDto {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ...fallback };
  }
  const record = data as Partial<Record<keyof ReceptionistPermissionsDto, unknown>>;
  if (!('ver_dashboard_modulo_finanzas' in record) && !('exportar_clientes' in record)) {
    return { ...fallback };
  }
  return {
    ver_ingresos_mes_operativo: Boolean(record.ver_ingresos_mes_operativo),
    ver_tab_finanzas: Boolean(record.ver_tab_finanzas),
    ver_dashboard_modulo_finanzas: Boolean(record.ver_dashboard_modulo_finanzas),
    ver_tab_socios: Boolean(record.ver_tab_socios),
    ver_tab_asistencia: Boolean(record.ver_tab_asistencia),
    ver_tab_inventario: Boolean(record.ver_tab_inventario),
    ver_tab_control: Boolean(record.ver_tab_control),
    exportar_clientes: Boolean(record.exportar_clientes),
    exportar_deudores: Boolean(record.exportar_deudores),
    exportar_ventas_caja: Boolean(record.exportar_ventas_caja),
    exportar_contextual_bi: Boolean(record.exportar_contextual_bi),
    exportar_reporte_ejecutivo_pdf: Boolean(record.exportar_reporte_ejecutivo_pdf),
  };
}

export function countEnabledPermissions(perms: ReceptionistPermissionsDto): number {
  return (Object.keys(DEFAULT_RECEPTIONIST_PERMISSIONS) as Array<keyof ReceptionistPermissionsDto>).filter(
    (key) => Boolean(perms[key])
  ).length;
}

export function arePermissionsEqual(
  a: ReceptionistPermissionsDto,
  b: ReceptionistPermissionsDto
): boolean {
  return (Object.keys(DEFAULT_RECEPTIONIST_PERMISSIONS) as Array<keyof ReceptionistPermissionsDto>).every(
    (key) => Boolean(a[key]) === Boolean(b[key])
  );
}

export interface UseEffectivePermissionsOptions {
  role?: UserRole | null;
  autoFetch?: boolean;
}

/**
 * Hook para obtener los permisos efectivos del usuario en sesión.
 * - ADMINISTRADOR: inicializa síncronamente con todos los flags en true (sin parpadeo).
 * - RECEPCIONISTA: inicializa Secure-by-Default (todo false) y consulta `getMyEffectivePermissions`.
 */
export function useEffectivePermissions(
  roleOrOptions?: UserRole | null | UseEffectivePermissionsOptions
) {
  const role =
    roleOrOptions && typeof roleOrOptions === 'object'
      ? roleOrOptions.role
      : roleOrOptions;
  const autoFetch =
    roleOrOptions && typeof roleOrOptions === 'object'
      ? roleOrOptions.autoFetch ?? true
      : true;

  const isAdmin = role === 'ADMINISTRADOR';
  const canFetchRemote =
    autoFetch && !isAdmin && typeof dashboardIpc?.getMyEffectivePermissions === 'function';

  const [permissions, setPermissions] = useState<ReceptionistPermissionsDto>(() =>
    isAdmin ? { ...ADMIN_EFFECTIVE_PERMISSIONS } : { ...DEFAULT_RECEPTIONIST_PERMISSIONS }
  );
  const [isLoading, setIsLoading] = useState<boolean>(canFetchRemote);
  const [error, setError] = useState<AppError | null>(null);

  const refresh = useCallback(async (): Promise<ReceptionistPermissionsDto> => {
    if (isAdmin) {
      const next = { ...ADMIN_EFFECTIVE_PERMISSIONS };
      setPermissions(next);
      setIsLoading(false);
      setError(null);
      return next;
    }

    if (typeof dashboardIpc?.getMyEffectivePermissions !== 'function') {
      const fallback = { ...DEFAULT_RECEPTIONIST_PERMISSIONS };
      setPermissions(fallback);
      setIsLoading(false);
      return fallback;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await dashboardIpc.getMyEffectivePermissions();
      const normalized = isValidPermissionsPayload(result)
        ? result
        : normalizePermissionsPayload(result, DEFAULT_RECEPTIONIST_PERMISSIONS);
      setPermissions(normalized);
      return normalized;
    } catch (err) {
      setError(safeNormalizeError(err));
      const fallback = { ...DEFAULT_RECEPTIONIST_PERMISSIONS };
      setPermissions(fallback);
      return fallback;
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      setPermissions({ ...ADMIN_EFFECTIVE_PERMISSIONS });
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!autoFetch) {
      setIsLoading(false);
      return;
    }

    void refresh();
  }, [isAdmin, autoFetch, refresh]);

  useEffect(() => {
    if (typeof window === 'undefined' || isAdmin) return;
    const handleUpdated = () => {
      void refresh();
    };
    window.addEventListener(PERMISSIONS_UPDATED_EVENT, handleUpdated);
    return () => {
      window.removeEventListener(PERMISSIONS_UPDATED_EVENT, handleUpdated);
    };
  }, [isAdmin, refresh]);

  return {
    permissions,
    isLoading,
    error,
    refresh,
  };
}

export interface UseReceptionistPermissionsOptions {
  autoFetch?: boolean;
}

/**
 * Hook administrativo para leer y actualizar la matriz de permisos de Recepcionista.
 */
export function useReceptionistPermissions(
  options: UseReceptionistPermissionsOptions = {}
) {
  const { autoFetch = true } = options;

  const [permissions, setPermissions] = useState<ReceptionistPermissionsDto>({
    ...DEFAULT_RECEPTIONIST_PERMISSIONS,
  });
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const fetchPermissions = useCallback(async (): Promise<ReceptionistPermissionsDto | null> => {
    if (typeof dashboardIpc?.getReceptionistPermissions !== 'function') {
      setIsLoading(false);
      return { ...DEFAULT_RECEPTIONIST_PERMISSIONS };
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await dashboardIpc.getReceptionistPermissions();
      const normalized = normalizePermissionsPayload(data, DEFAULT_RECEPTIONIST_PERMISSIONS);
      setPermissions(normalized);
      return normalized;
    } catch (err) {
      setError(safeNormalizeError(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePermissions = useCallback(
    async (input: ReceptionistPermissionsDto): Promise<ReceptionistPermissionsDto | null> => {
      setIsSaving(true);
      setError(null);
      try {
        const updated = await dashboardIpc.updateReceptionistPermissions(input);
        const normalized = normalizePermissionsPayload(updated, input);
        setPermissions(normalized);
        emitReceptionistPermissionsUpdated();
        return normalized;
      } catch (err) {
        setError(safeNormalizeError(err));
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!autoFetch) return;
    void fetchPermissions();
  }, [autoFetch, fetchPermissions]);

  return {
    permissions,
    isLoading,
    isSaving,
    error,
    clearError,
    fetchPermissions,
    updatePermissions,
    getReceptionistPermissions: fetchPermissions,
    updateReceptionistPermissions: updatePermissions,
  };
}
