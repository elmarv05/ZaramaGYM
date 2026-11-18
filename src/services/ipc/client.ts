// ============================================================================
// WRAPPER IPC TIPADO TAURI V2 CON NORMALIZACIÓN DE APPERROR
// Ubicación: src/services/ipc/client.ts
// ============================================================================

import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { AppError, AppErrorCode } from '../../types/auth';

const VALID_ERROR_CODES: Set<AppErrorCode> = new Set([
  'Unauthorized',
  'Forbidden',
  'NotFound',
  'Validation',
  'Conflict',
  'SessionLocked',
  'Internal',
]);

/**
 * Normaliza cualquier error capturado (Rust serde, Tauri IPC o JS Error) a un AppError consistente
 */
export function normalizeAppError(error: unknown): AppError {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;
    if (
      typeof candidate.code === 'string' &&
      VALID_ERROR_CODES.has(candidate.code as AppErrorCode) &&
      typeof candidate.message === 'string'
    ) {
      return {
        code: candidate.code as AppErrorCode,
        message: candidate.message,
      };
    }
  }

  if (typeof error === 'string') {
    return {
      code: 'Internal',
      message: error,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'Internal',
      message: error.message,
    };
  }

  return {
    code: 'Internal',
    message: 'Ha ocurrido un error inesperado en la comunicación con el sistema.',
  };
}

/**
 * Invocador seguro tipado sobre @tauri-apps/api/core
 */
export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    const normalized = normalizeAppError(error);
    throw normalized;
  }
}

/**
 * Abre una URL externa segura (ej. https://wa.me/...) en el navegador del sistema operativo.
 * En Tauri v2 Desktop invoca el comando nativo `open_external_url`; en navegador web usa `window.open`.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const isTauriRuntime =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

  if (isTauriRuntime) {
    await safeInvoke<void>('open_external_url', { url });
    return;
  }

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
