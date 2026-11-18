// ============================================================================
// LÓGICA DE DOMINIO FRONTEND: CONTROL DE ASISTENCIAS (SLICE 5)
// Semáforo Inteligente, Extensión de Días, Validaciones y Audio Feedback
// Ubicación: src/domain/attendance.ts
// ============================================================================

import {
  AttendanceCheckInMode,
  TrafficLightColor,
} from '../types/attendance';

export interface TrafficLightEvaluationParams {
  tieneMembresiaActiva: boolean;
  diasRestantes: number | null;
  deudaTotal: number | string;
  umbralAmarillo?: number;
  fechaVencimientoTexto?: string | null;
}

export interface TrafficLightEvaluationResult {
  color: TrafficLightColor;
  ingresoPermitido: boolean;
  alertaSonora: boolean;
  motivo: string;
}

/**
 * Evalúa determinísticamente el color del semáforo y las alertas asociadas
 */
export function evaluateTrafficLightState(
  params: TrafficLightEvaluationParams
): TrafficLightEvaluationResult {
  const {
    tieneMembresiaActiva,
    diasRestantes,
    deudaTotal,
    umbralAmarillo = 5,
    fechaVencimientoTexto,
  } = params;

  const deudaNum = typeof deudaTotal === 'string' ? parseFloat(deudaTotal) || 0 : deudaTotal || 0;
  const tieneDeuda = deudaNum > 0.001;

  // 1. SEMÁFORO ROJO: Sin membresía activa
  if (!tieneMembresiaActiva || diasRestantes === null || diasRestantes < 0) {
    let motivo = fechaVencimientoTexto
      ? `Membresía vencida el ${fechaVencimientoTexto}`
      : 'Cliente no registra membresía activa';

    if (tieneDeuda) {
      motivo += ` (Deuda pendiente: S/ ${deudaNum.toFixed(2)})`;
    }

    return {
      color: 'ROJO',
      ingresoPermitido: false,
      alertaSonora: true,
      motivo,
    };
  }

  // 2. SEMÁFORO AMARILLO: Por vencer (<= umbral) O con deuda pendiente
  const estaPorVencer = diasRestantes <= umbralAmarillo;

  if (estaPorVencer || tieneDeuda) {
    let motivo = '';
    const textoDias =
      diasRestantes === 0
        ? 'Membresía vence hoy'
        : `Membresía por vencer en ${diasRestantes} día(s)`;

    if (estaPorVencer && tieneDeuda) {
      motivo = `${textoDias} y Deuda pendiente de S/ ${deudaNum.toFixed(2)}`;
    } else if (estaPorVencer) {
      motivo = textoDias;
    } else {
      motivo = `Cliente registra saldo deudor pendiente de S/ ${deudaNum.toFixed(2)}`;
    }

    return {
      color: 'AMARILLO',
      ingresoPermitido: true,
      alertaSonora: true,
      motivo,
    };
  }

  // 3. SEMÁFORO VERDE: Membresía activa con más de 5 días y CERO deuda
  return {
    color: 'VERDE',
    ingresoPermitido: true,
    alertaSonora: false,
    motivo: 'Membresía activa vigente',
  };
}

/**
 * Calcula la nueva fecha de vencimiento añadiendo días calendario y fijando hora a las 23:59:59
 */
export function calculateExtendedExpirationDate(
  fechaBase: string | Date,
  diasOtorgados: number
): string {
  let baseDate: Date;

  if (typeof fechaBase === 'string') {
    // Si viene en formato "YYYY-MM-DD" o "YYYY-MM-DD HH:mm:ss"
    const cleaned = fechaBase.replace(' ', 'T');
    // Para evitar problemas de timezone local con fechas ISO YYYY-MM-DD
    const parts = fechaBase.split(' ')[0].split('-');
    if (parts.length === 3) {
      baseDate = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10)
      );
    } else {
      baseDate = new Date(cleaned);
    }
  } else {
    baseDate = new Date(fechaBase.getTime());
  }

  // Sumar días
  baseDate.setDate(baseDate.getDate() + diasOtorgados);

  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, '0');
  const day = String(baseDate.getDate()).padStart(2, '0');

  return `${year}-${month}-${day} 23:59:59`;
}

/**
 * Validador para otorgamiento manual de prórroga / recuperación de días
 */
export function validateExtensionInput(input: {
  diasOtorgados: number;
  motivoJustificacion: string;
  permiteRecuperacionDias?: boolean;
}): { isValid: boolean; error?: string } {
  if (input.permiteRecuperacionDias === false) {
    return {
      isValid: false,
      error: 'El plan vinculado a esta membresía no permite recuperación o prórroga de días (ej. Pase Diario).',
    };
  }

  if (!input.diasOtorgados || input.diasOtorgados < 1) {
    return {
      isValid: false,
      error: 'Debe otorgar al menos 1 día de prórroga.',
    };
  }

  if (!input.motivoJustificacion || input.motivoJustificacion.trim().length < 5) {
    return {
      isValid: false,
      error: 'El motivo de justificación es obligatorio y debe tener como mínimo 5 caracteres.',
    };
  }

  return { isValid: true };
}

/**
 * Validador de configuración del sistema
 */
export function validateSystemConfig(input: {
  diasAlertaAmarillo?: number;
  minutosAntireboteQr?: number;
  precioPaseDiarioCreditoDefault?: number | string;
}): { isValid: boolean; error?: string } {
  if (input.diasAlertaAmarillo !== undefined && input.diasAlertaAmarillo < 1) {
    return {
      isValid: false,
      error: 'El umbral de alerta amarilla debe ser de al menos 1 día.',
    };
  }

  if (input.minutosAntireboteQr !== undefined && input.minutosAntireboteQr < 0) {
    return {
      isValid: false,
      error: 'La ventana de minutos anti-rebote no puede ser negativo.',
    };
  }

  if (input.precioPaseDiarioCreditoDefault !== undefined) {
    const val =
      typeof input.precioPaseDiarioCreditoDefault === 'string'
        ? parseFloat(input.precioPaseDiarioCreditoDefault)
        : input.precioPaseDiarioCreditoDefault;
    if (isNaN(val) || val < 0) {
      return {
        isValid: false,
        error: 'El precio por defecto para pase diario a crédito no puede ser negativo.',
      };
    }
  }

  return { isValid: true };
}

/**
 * Formateadores visuales
 */
export function formatTrafficLightColor(color: TrafficLightColor): string {
  switch (color) {
    case 'VERDE':
      return 'Verde (Acceso Total)';
    case 'AMARILLO':
      return 'Amarillo (Alerta Preventiva)';
    case 'ROJO':
      return 'Rojo (Bloqueo de Acceso)';
    default:
      return color;
  }
}

export function formatAttendanceMode(mode: AttendanceCheckInMode): string {
  switch (mode) {
    case 'QR_LOCAL':
      return 'Escaneo QR Local';
    case 'MANUAL_OLVIDO_QR':
      return 'Manual por Olvido de QR';
    case 'PASE_DIARIO_CREDITO_ROJO':
      return 'Pase Diario a Crédito (Rojo)';
    case 'QR_MOVIL_LAN':
      return 'Escaneo Móvil LAN';
    default:
      return mode;
  }
}

/**
 * Reproducción de sonido con Web Audio API ligero sin requerir archivos de audio externos
 * Totalmente seguro contra fallos en entornos sin navegador / sin soporte de audio.
 */
export function playTrafficLightSound(color: TrafficLightColor): void {
  try {
    if (typeof window === 'undefined') return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (color === 'VERDE') {
      // Tono armónico doble ascendente (520Hz -> 660Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(660, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (color === 'AMARILLO') {
      // Campana de advertencia (440Hz y 880Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (color === 'ROJO') {
      // Zumbido grave de rechazo (140Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.3);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch {
    // Fallback silencioso sin interrumpir la experiencia de usuario
  }
}
