// ============================================================================
// UTILIDADES PURAS: NOTIFICACIONES INTELIGENTES DEL SIDEBAR (UNSEEN / ACK)
// Controla alertas urgentes de negocio en botones del Sidebar:
//   - Aparecen al iniciar sesión o cuando surge un NUEVO ítem urgente (ej. venta
//     que baja un producto bajo el mínimo o crea un nuevo deudor).
//   - Desaparecen del Sidebar al entrar al módulo (quedan en el tab interno).
//   - No vuelven a aparecer si el usuario sale sin resolverlo, hasta que surja
//     una nueva alerta distinta o se resuelvan todas y ocurra otra.
// Ubicación: src/utils/sidebarAlerts.ts
// ============================================================================

export type SidebarAlertModuleId =
  | 'catalog'
  | 'pos'
  | 'finance';

export interface ModuleAlertSnapshot {
  /** IDs estables y ordenados de los ítems en alerta (productos, clientes deudores, ventas tachadas) */
  ids: number[];
  /** Cantidad total de alertas activas en el módulo */
  count: number;
  /** Descripción legible para tooltip / accesibilidad */
  label: string;
  /** Severidad visual de la insignia circular */
  variant: 'warning' | 'danger';
}

export type SidebarAlertsMap = Partial<Record<SidebarAlertModuleId, ModuleAlertSnapshot>>;
export type AcknowledgedAlertsMap = Partial<Record<SidebarAlertModuleId, number[]>>;

export const SIDEBAR_ALERTS_REFRESH_EVENT = 'zaramagym:alerts-refresh';

/**
 * Emite un evento global ligero para que el Sidebar re-evalúe alertas de negocio
 * inmediatamente después de una venta, cobro de crédito, compra, merma o transformación.
 */
export function emitSidebarAlertsRefresh(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(SIDEBAR_ALERTS_REFRESH_EVENT));
  }
}

/**
 * Determina si un módulo debe mostrar la insignia circular de notificación en el Sidebar.
 * Retorna true solo si existen alertas activas y al menos un ID aún no ha sido reconocido
 * por el usuario al ingresar al módulo.
 */
export function hasUnseenModuleAlert(
  snapshot: ModuleAlertSnapshot | undefined,
  acknowledgedIds: number[] | undefined
): boolean {
  if (!snapshot || snapshot.count <= 0 || snapshot.ids.length === 0) {
    return false;
  }
  if (acknowledgedIds === undefined) {
    return true;
  }
  const ackSet = new Set(acknowledgedIds);
  return snapshot.ids.some((id) => !ackSet.has(id));
}

/**
 * Calcula las alertas actualmente visibles en el Sidebar cruzando los snapshots vivos
 * contra los IDs ya vistos/reconocidos por módulo.
 */
export function computeVisibleSidebarAlerts(
  snapshots: SidebarAlertsMap,
  acknowledged: AcknowledgedAlertsMap
): SidebarAlertsMap {
  const visible: SidebarAlertsMap = {};
  const modules: SidebarAlertModuleId[] = [
    'catalog',
    'pos',
    'finance',
  ];

  for (const mod of modules) {
    const snap = snapshots[mod];
    if (snap && hasUnseenModuleAlert(snap, acknowledged[mod])) {
      visible[mod] = snap;
    }
  }

  return visible;
}

/**
 * Marca todos los IDs actualmente en alerta de un módulo como "vistos" al hacer clic en él.
 */
export function acknowledgeModuleAlerts(
  prev: AcknowledgedAlertsMap,
  moduleId: SidebarAlertModuleId,
  snapshot: ModuleAlertSnapshot | undefined
): AcknowledgedAlertsMap {
  if (!snapshot || snapshot.ids.length === 0) {
    return prev;
  }
  const merged = Array.from(new Set([...(prev[moduleId] ?? []), ...snapshot.ids])).sort(
    (a, b) => a - b
  );
  return {
    ...prev,
    [moduleId]: merged,
  };
}

/**
 * Limpia el reconocimiento de cualquier módulo que haya vuelto a 0 alertas
 * (para que vuelva a notificar si en el futuro vuelve a caer en alerta),
 * y auto-reconoce el módulo que el usuario tiene abierto actualmente.
 */
export function reconcileAcknowledgedAlerts(
  prev: AcknowledgedAlertsMap,
  snapshots: SidebarAlertsMap,
  activeModule: string
): AcknowledgedAlertsMap {
  let changed = false;
  const next: AcknowledgedAlertsMap = { ...prev };
  const modules: SidebarAlertModuleId[] = [
    'catalog',
    'pos',
    'finance',
  ];

  for (const mod of modules) {
    const snap = snapshots[mod];
    if (!snap || snap.count === 0) {
      if (next[mod] !== undefined) {
        delete next[mod];
        changed = true;
      }
      continue;
    }

    if (activeModule === mod) {
      const merged = Array.from(new Set([...(next[mod] ?? []), ...snap.ids])).sort(
        (a, b) => a - b
      );
      const prevArr = next[mod] ?? [];
      if (
        merged.length !== prevArr.length ||
        merged.some((v, idx) => v !== prevArr[idx])
      ) {
        next[mod] = merged;
        changed = true;
      }
    }
  }

  return changed ? next : prev;
}
