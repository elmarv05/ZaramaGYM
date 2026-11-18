// ============================================================================
// LÓGICA PURA DE DOMINIO: SERVIDOR LAN Y ESCÁNER MÓVIL (SLICE 6)
// Ubicación: src/domain/lan.ts
// ============================================================================

import { DevicePairingStatus, LanServerStatusDto } from '../types/lan';

/**
 * Valida el nombre asignado al dispositivo móvil (ej. "iPhone Recepción Puerta 1")
 * Debe tener entre 3 y 60 caracteres.
 */
export function validateDeviceName(name: string): string | null {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return 'El nombre del dispositivo es obligatorio.';
  }
  if (trimmed.length < 3) {
    return 'El nombre del dispositivo debe tener al menos 3 caracteres.';
  }
  if (trimmed.length > 60) {
    return 'El nombre del dispositivo no puede exceder los 60 caracteres.';
  }
  return null;
}

/**
 * Normaliza un código de vinculación:
 * Elimina espacios, guiones u otros símbolos no alfanuméricos y convierte a mayúsculas.
 * Ej: "zg - 8472" -> "ZG8472", "k9-m2-px" -> "K9M2PX".
 */
export function normalizePairingCode(raw: string): string {
  if (!raw) return '';
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
}

/**
 * Valida que el código de vinculación cumpla con la longitud exacta de 6 caracteres alfanuméricos.
 */
export function validatePairingCode(code: string): string | null {
  const normalized = normalizePairingCode(code);
  if (!normalized) {
    return 'El código de vinculación es requerido.';
  }
  if (normalized.length !== 6) {
    return 'El código de vinculación debe contener exactamente 6 caracteres alfanuméricos.';
  }
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return 'El código de vinculación solo puede contener letras y números.';
  }
  return null;
}

/**
 * Retorna la configuración visual de etiqueta y color para el estado de un dispositivo móvil
 */
export function getDeviceStatusBadge(status: DevicePairingStatus): {
  label: string;
  colorClass: string;
  variant: 'success' | 'warning' | 'danger' | 'default';
} {
  switch (status) {
    case 'VINCULADO':
      return {
        label: 'VINCULADO',
        colorClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
        variant: 'success',
      };
    case 'PENDIENTE_VINCULACION':
      return {
        label: 'PENDIENTE',
        colorClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700',
        variant: 'warning',
      };
    case 'REVOCADO':
      return {
        label: 'REVOCADO',
        colorClass: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-300 dark:border-red-700',
        variant: 'danger',
      };
    default:
      return {
        label: 'DESCONOCIDO',
        colorClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300',
        variant: 'default',
      };
  }
}

/**
 * Regla RBAC: Solo ADMINISTRADOR y SUPERVISOR pueden gestionar dispositivos LAN
 * (encender/apagar el servidor, crear códigos de vinculación, revocar dispositivos).
 * RECEPCIONISTA solo tiene acceso de consulta y operación de escáner.
 */
export function canManageLanDevices(role?: string | null): boolean {
  if (!role) return false;
  const upper = role.toUpperCase();
  return upper === 'ADMINISTRADOR' || upper === 'SUPERVISOR';
}

/**
 * Construye la URL completa del escáner móvil para abrir en el navegador del teléfono,
 * incorporando opcionalmente el código de vinculación como parámetro `?pair=XXXXXX`.
 */
export function formatScannerUrl(status: LanServerStatusDto, pairingCode?: string): string {
  const base = status.httpsUrl || status.httpUrl || `https://${status.primaryIp || '127.0.0.1'}:${status.port || 3443}/scanner`;
  if (!pairingCode) {
    return base;
  }
  const cleanCode = normalizePairingCode(pairingCode);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}pair=${encodeURIComponent(cleanCode)}`;
}

/**
 * Formatea una huella digital SHA-256 en bloques de 2 caracteres separados por dos puntos
 * Ej: 7F4AB9... -> 7F:4A:B9:...
 */
export function formatSha256Fingerprint(raw: string): string {
  if (!raw) return 'No disponible';
  const clean = raw.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (!clean) return raw;
  const chunks = clean.match(/.{1,2}/g);
  return chunks ? chunks.join(':') : clean;
}

/**
 * Genera feedback sonoro mediante la Web Audio API estándar
 * No arroja error si el navegador bloquea la reproducción de audio.
 */
export function playWebAudioTone(
  frequency: number,
  durationSeconds: number,
  type: OscillatorType = 'sine'
): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSeconds);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationSeconds);
  } catch {
    // Silencio seguro si Web Audio API no está disponible en el entorno
  }
}
