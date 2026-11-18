// ============================================================================
// TESTS DE DOMINIO FRONTEND: CONTROL DE ASISTENCIAS (SLICE 5)
// Semáforo Inteligente, Cálculo de Prórrogas y Validaciones
// Ubicación: src/__tests__/domain/attendance.test.ts
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  calculateExtendedExpirationDate,
  evaluateTrafficLightState,
  formatAttendanceMode,
  formatTrafficLightColor,
  playTrafficLightSound,
  validateExtensionInput,
  validateSystemConfig,
} from '../../domain/attendance';

describe('Dominio de Asistencias y Semáforo Inteligente', () => {
  describe('evaluateTrafficLightState', () => {
    it('evalúa como ROJO bloqueado si el cliente no tiene membresía activa', () => {
      const result = evaluateTrafficLightState({
        tieneMembresiaActiva: false,
        diasRestantes: null,
        deudaTotal: 0,
      });

      expect(result.color).toBe('ROJO');
      expect(result.ingresoPermitido).toBe(false);
      expect(result.alertaSonora).toBe(true);
      expect(result.motivo).toContain('no registra membresía activa');
    });

    it('incluye deuda pendiente en motivo cuando es ROJO con saldo deudor', () => {
      const result = evaluateTrafficLightState({
        tieneMembresiaActiva: false,
        diasRestantes: null,
        deudaTotal: '45.00',
      });

      expect(result.color).toBe('ROJO');
      expect(result.ingresoPermitido).toBe(false);
      expect(result.motivo).toContain('Deuda pendiente: S/ 45.00');
    });

    it('evalúa como VERDE si tiene membresía activa con > 5 días y deuda cero', () => {
      const result = evaluateTrafficLightState({
        tieneMembresiaActiva: true,
        diasRestantes: 15,
        deudaTotal: '0.00',
      });

      expect(result.color).toBe('VERDE');
      expect(result.ingresoPermitido).toBe(true);
      expect(result.alertaSonora).toBe(false);
      expect(result.motivo).toContain('Membresía activa vigente');
    });

    it('evalúa como AMARILLO si quedan <= 5 días aunque no tenga deuda', () => {
      const result = evaluateTrafficLightState({
        tieneMembresiaActiva: true,
        diasRestantes: 3,
        deudaTotal: 0,
      });

      expect(result.color).toBe('AMARILLO');
      expect(result.ingresoPermitido).toBe(true);
      expect(result.alertaSonora).toBe(true);
      expect(result.motivo).toContain('Membresía por vencer en 3 día(s)');
    });

    it('evalúa como AMARILLO con mensaje "vence hoy" si diasRestantes es 0', () => {
      const result = evaluateTrafficLightState({
        tieneMembresiaActiva: true,
        diasRestantes: 0,
        deudaTotal: 0,
      });

      expect(result.color).toBe('AMARILLO');
      expect(result.ingresoPermitido).toBe(true);
      expect(result.motivo).toContain('Membresía vence hoy');
    });

    it('evalúa como AMARILLO si tiene días suficientes pero registra deuda pendiente', () => {
      const result = evaluateTrafficLightState({
        tieneMembresiaActiva: true,
        diasRestantes: 25,
        deudaTotal: '50.00',
      });

      expect(result.color).toBe('AMARILLO');
      expect(result.ingresoPermitido).toBe(true);
      expect(result.alertaSonora).toBe(true);
      expect(result.motivo).toContain('saldo deudor pendiente de S/ 50.00');
    });

    it('evalúa como AMARILLO combinando ambos avisos si está por vencer y además debe dinero', () => {
      const result = evaluateTrafficLightState({
        tieneMembresiaActiva: true,
        diasRestantes: 2,
        deudaTotal: '25.00',
      });

      expect(result.color).toBe('AMARILLO');
      expect(result.ingresoPermitido).toBe(true);
      expect(result.motivo).toContain('Membresía por vencer en 2 día(s)');
      expect(result.motivo).toContain('Deuda pendiente de S/ 25.00');
    });

    it('respeta un umbral configurado de días amarillos personalizado', () => {
      const result = evaluateTrafficLightState({
        tieneMembresiaActiva: true,
        diasRestantes: 8,
        deudaTotal: 0,
        umbralAmarillo: 10,
      });

      expect(result.color).toBe('AMARILLO');
    });
  });

  describe('calculateExtendedExpirationDate', () => {
    it('adiciona días calendario manteniendo hora de vencimiento a las 23:59:59', () => {
      const nuevaFecha = calculateExtendedExpirationDate('2026-11-20 23:59:59', 5);
      expect(nuevaFecha).toBe('2026-11-25 23:59:59');
    });

    it('soporta entrada en formato fecha simple YYYY-MM-DD', () => {
      const nuevaFecha = calculateExtendedExpirationDate('2026-11-28', 4);
      expect(nuevaFecha).toBe('2026-12-02 23:59:59');
    });

    it('maneja cambio de año correctamente', () => {
      const nuevaFecha = calculateExtendedExpirationDate('2026-12-30 23:59:59', 3);
      expect(nuevaFecha).toBe('2027-01-02 23:59:59');
    });
  });

  describe('validateExtensionInput', () => {
    it('acepta datos válidos con justificación >= 5 caracteres', () => {
      const result = validateExtensionInput({
        diasOtorgados: 3,
        motivoJustificacion: 'Reposo médico acreditado',
        permiteRecuperacionDias: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rechaza si diasOtorgados es menor a 1', () => {
      const result = validateExtensionInput({
        diasOtorgados: 0,
        motivoJustificacion: 'Viaje laboral',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('al menos 1 día');
    });

    it('rechaza si la justificación tiene menos de 5 caracteres', () => {
      const result = validateExtensionInput({
        diasOtorgados: 5,
        motivoJustificacion: 'hola',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('mínimo 5 caracteres');
    });

    it('rechaza si la membresía pertenece a un plan que prohíbe la recuperación', () => {
      const result = validateExtensionInput({
        diasOtorgados: 1,
        motivoJustificacion: 'Corte de luz',
        permiteRecuperacionDias: false,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('no permite recuperación');
    });
  });

  describe('validateSystemConfig', () => {
    it('aprueba configuración válida', () => {
      const result = validateSystemConfig({
        diasAlertaAmarillo: 5,
        minutosAntireboteQr: 3,
        precioPaseDiarioCreditoDefault: '10.00',
      });

      expect(result.isValid).toBe(true);
    });

    it('rechaza si diasAlertaAmarillo es menor a 1', () => {
      const result = validateSystemConfig({
        diasAlertaAmarillo: 0,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('al menos 1');
    });

    it('rechaza si minutosAntireboteQr es negativo', () => {
      const result = validateSystemConfig({
        minutosAntireboteQr: -1,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('no puede ser negativo');
    });

    it('rechaza si precioPaseDiarioCreditoDefault es negativo', () => {
      const result = validateSystemConfig({
        precioPaseDiarioCreditoDefault: -5,
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('no puede ser negativo');
    });
  });

  describe('formatters y feedback sonoro seguro', () => {
    it('formatea etiquetas de colores y modos de ingreso', () => {
      expect(formatTrafficLightColor('VERDE')).toBe('Verde (Acceso Total)');
      expect(formatTrafficLightColor('AMARILLO')).toBe('Amarillo (Alerta Preventiva)');
      expect(formatTrafficLightColor('ROJO')).toBe('Rojo (Bloqueo de Acceso)');

      expect(formatAttendanceMode('QR_LOCAL')).toBe('Escaneo QR Local');
      expect(formatAttendanceMode('MANUAL_OLVIDO_QR')).toBe('Manual por Olvido de QR');
      expect(formatAttendanceMode('PASE_DIARIO_CREDITO_ROJO')).toBe('Pase Diario a Crédito (Rojo)');
      expect(formatAttendanceMode('QR_MOVIL_LAN')).toBe('Escaneo Móvil LAN');
    });

    it('playTrafficLightSound no explota en entornos sin Web Audio API (ej. jsdom)', () => {
      expect(() => playTrafficLightSound('VERDE')).not.toThrow();
      expect(() => playTrafficLightSound('AMARILLO')).not.toThrow();
      expect(() => playTrafficLightSound('ROJO')).not.toThrow();
    });
  });
});
