// ============================================================================
// SERVICIO: ACTUALIZADOR AUTOMÁTICO NATIVO TAURI V2 (OTA + RELAUNCH)
// Encapsula @tauri-apps/plugin-updater y @tauri-apps/plugin-process con
// degradación segura en entornos offline o sin runtime Tauri (tests/browser).
// Ubicación: src/services/updater/appUpdater.ts
// ============================================================================

import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export const CURRENT_APP_VERSION = '0.1.0';

export interface AvailableAppUpdate {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  downloadAndInstall: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
}

export function isTauriDesktopRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

/**
 * Consulta GitHub Releases (`latest.json`) usando el plugin nativo de Tauri v2.
 * Retorna `null` si la app ya está actualizada.
 */
export async function checkForAppUpdate(): Promise<AvailableAppUpdate | null> {
  if (!isTauriDesktopRuntime()) {
    return null;
  }

  const update: Update | null = await check();
  if (!update) {
    return null;
  }

  return {
    version: update.version,
    currentVersion: update.currentVersion || CURRENT_APP_VERSION,
    date: update.date,
    body: update.body,
    downloadAndInstall: async (onEvent) => {
      await update.downloadAndInstall(onEvent);
    },
  };
}

/**
 * Reinicia limpiamente el proceso desktop tras completar la instalación OTA.
 */
export async function relaunchAppAfterUpdate(): Promise<void> {
  if (!isTauriDesktopRuntime()) {
    return;
  }
  await relaunch();
}
