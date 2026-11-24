// ============================================================================
// HOOK REACTIVO: ALERTAS INTELIGENTES DE NEGOCIO EN EL SIDEBAR
// Vigila necesidades urgentes (stock bajo, deudores pendientes y ventas tachadas
// pendientes de resolución) con reconocimiento al abrir cada módulo.
// Ubicación: src/hooks/useSidebarAlerts.ts
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { catalogIpc } from '../services/ipc/catalogIpc';
import { financeIpc } from '../services/ipc/financeIpc';
import { posIpc } from '../services/ipc/posIpc';
import {
  AcknowledgedAlertsMap,
  SIDEBAR_ALERTS_REFRESH_EVENT,
  SidebarAlertModuleId,
  SidebarAlertsMap,
  acknowledgeModuleAlerts,
  computeVisibleSidebarAlerts,
  reconcileAcknowledgedAlerts,
} from '../utils/sidebarAlerts';

export interface UseSidebarAlertsOptions {
  enabled: boolean;
  sessionUserId: number | null;
  isAdmin: boolean;
  activeTab: string;
}

export interface UseSidebarAlertsResult {
  allAlerts: SidebarAlertsMap;
  visibleAlerts: SidebarAlertsMap;
  acknowledgeModule: (tabId: string) => void;
  refreshAlerts: () => Promise<void>;
}

const ALERT_MODULE_SET = new Set<string>([
  'catalog',
  'pos',
  'finance',
]);

function isSidebarAlertModule(tabId: string): tabId is SidebarAlertModuleId {
  return ALERT_MODULE_SET.has(tabId);
}

export function useSidebarAlerts({
  enabled,
  sessionUserId,
  isAdmin,
  activeTab,
}: UseSidebarAlertsOptions): UseSidebarAlertsResult {
  const [snapshots, setSnapshots] = useState<SidebarAlertsMap>({});
  const [acknowledged, setAcknowledged] = useState<AcknowledgedAlertsMap>({});

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const snapshotsRef = useRef(snapshots);
  snapshotsRef.current = snapshots;

  // Reiniciar estado de alertas reconocidas cuando cambia el usuario / sesión
  useEffect(() => {
    setAcknowledged({});
    if (!enabled) {
      setSnapshots({});
    }
  }, [sessionUserId, enabled]);

  const refreshAlerts = useCallback(async () => {
    if (!enabled) return;

    const [productsRes, creditsRes, struckRes] = await Promise.allSettled([
      catalogIpc.listProducts({ solo_activos: true }),
      posIpc.listClientCredits({ solo_con_deuda: true }),
      isAdmin
        ? financeIpc.listStruckSalesTray({ estado_venta: 'TACHADA_EN_TURNO' })
        : Promise.resolve([]),
    ]);

    const nextSnapshots: SidebarAlertsMap = {};

    // 1. Catálogo e Inventario: productos activos con stock bajo
    if (productsRes.status === 'fulfilled' && Array.isArray(productsRes.value)) {
      const lowStockIds = productsRes.value
        .filter(
          (p) =>
            p &&
            typeof p.id === 'number' &&
            p.estado_activo !== false &&
            (Boolean(p.alerta_stock_bajo) ||
              p.stock_actual <= (p.stock_minimo ?? 0))
        )
        .map((p) => p.id)
        .sort((a, b) => a - b);

      if (lowStockIds.length > 0) {
        nextSnapshots.catalog = {
          ids: lowStockIds,
          count: lowStockIds.length,
          label: `${lowStockIds.length} producto${lowStockIds.length === 1 ? '' : 's'} con stock bajo`,
          variant: 'warning',
        };
      }
    }

    // 2. Caja y POS: clientes con deuda pendiente (Deudores & Créditos)
    if (creditsRes.status === 'fulfilled' && Array.isArray(creditsRes.value)) {
      const debtorClientIds = Array.from(
        new Set(
          creditsRes.value
            .filter(
              (c) =>
                c &&
                typeof c.cliente_id === 'number' &&
                Number(c.saldo_pendiente) > 0 &&
                c.estado === 'PENDIENTE'
            )
            .map((c) => c.cliente_id)
        )
      ).sort((a, b) => a - b);

      if (debtorClientIds.length > 0) {
        nextSnapshots.pos = {
          ids: debtorClientIds,
          count: debtorClientIds.length,
          label: `${debtorClientIds.length} deudor${debtorClientIds.length === 1 ? '' : 'es'} con saldo pendiente`,
          variant: 'warning',
        };
      }
    }

    // 3. Finanzas (Admin): ventas tachadas pendientes de resolución Paso 2
    if (isAdmin && struckRes.status === 'fulfilled' && Array.isArray(struckRes.value)) {
      const pendingStruckIds = struckRes.value
        .filter(
          (s) =>
            s &&
            typeof s.id === 'number' &&
            s.estado_venta === 'TACHADA_EN_TURNO'
        )
        .map((s) => s.id)
        .sort((a, b) => a - b);

      if (pendingStruckIds.length > 0) {
        nextSnapshots.finance = {
          ids: pendingStruckIds,
          count: pendingStruckIds.length,
          label: `${pendingStruckIds.length} venta${pendingStruckIds.length === 1 ? '' : 's'} tachada${pendingStruckIds.length === 1 ? '' : 's'} por resolver`,
          variant: 'warning',
        };
      }
    }

    setSnapshots(nextSnapshots);
    setAcknowledged((prev) =>
      reconcileAcknowledgedAlerts(prev, nextSnapshots, activeTabRef.current)
    );
  }, [enabled, isAdmin]);

  // Re-evaluar al iniciar sesión y al navegar entre módulos
  useEffect(() => {
    if (!enabled) return;
    void refreshAlerts();
  }, [enabled, sessionUserId, activeTab, refreshAlerts]);

  // Escuchar eventos globales disparados por ventas, cobros, compras, mermas o transformaciones
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const handler = () => {
      void refreshAlerts();
    };
    window.addEventListener(SIDEBAR_ALERTS_REFRESH_EVENT, handler);
    return () => {
      window.removeEventListener(SIDEBAR_ALERTS_REFRESH_EVENT, handler);
    };
  }, [enabled, refreshAlerts]);

  const acknowledgeModule = useCallback((tabId: string) => {
    if (!isSidebarAlertModule(tabId)) return;
    setAcknowledged((prev) =>
      acknowledgeModuleAlerts(prev, tabId, snapshotsRef.current[tabId])
    );
  }, []);

  const visibleAlerts = useMemo(
    () => computeVisibleSidebarAlerts(snapshots, acknowledged),
    [snapshots, acknowledged]
  );

  return {
    allAlerts: snapshots,
    visibleAlerts,
    acknowledgeModule,
    refreshAlerts,
  };
}
