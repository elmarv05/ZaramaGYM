// ============================================================================
// PRUEBAS UNITARIAS DE DOMINIO: SERVIDOR LAN Y ESCÁNER MÓVIL (SLICE 6)
// Ubicación: src/__tests__/domain/lan.test.ts
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import {
  canManageLanDevices,
  formatScannerUrl,
  formatSha256Fingerprint,
  getDeviceStatusBadge,
  normalizePairingCode,
  playWebAudioTone,
  validateDeviceName,
  validatePairingCode,
} from '../../domain/lan';
import { LanServerStatusDto } from '../../types/lan';

describe('Dominio LAN: Validaciones, Normalizaciones y Reglas de Negocio', () => {
  describe('validateDeviceName', () => {
    it('rechaza nombres vacíos o solo espacios', () => {
      expect(validateDeviceName('')).toBe('El nombre del dispositivo es obligatorio.');
      expect(validateDeviceName('   ')).toBe('El nombre del dispositivo es obligatorio.');
    });

    it('rechaza nombres menores a 3 caracteres', () => {
      expect(validateDeviceName('AB')).toBe('El nombre del dispositivo debe tener al menos 3 caracteres.');
    });

    it('rechaza nombres mayores a 60 caracteres', () => {
      const longName = 'A'.repeat(61);
      expect(validateDeviceName(longName)).toBe('El nombre del dispositivo no puede exceder los 60 caracteres.');
    });

    it('acepta nombres válidos entre 3 y 60 caracteres', () => {
      expect(validateDeviceName('iPhone Mostrador 1')).toBeNull();
      expect(validateDeviceName('Galaxy A54 Entrada Molinete')).toBeNull();
      expect(validateDeviceName('iPad Mini 6')).toBeNull();
    });
  });

  describe('normalizePairingCode', () => {
    it('elimina guiones, espacios y convierte a mayúsculas', () => {
      expect(normalizePairingCode('zg-4821')).toBe('ZG4821');
      expect(normalizePairingCode(' k9 - m2 - px ')).toBe('K9M2PX');
      expect(normalizePairingCode('ab_12.cd')).toBe('AB12CD');
    });

    it('maneja strings vacíos de forma segura', () => {
      expect(normalizePairingCode('')).toBe('');
    });
  });

  describe('validatePairingCode', () => {
    it('rechaza códigos vacíos', () => {
      expect(validatePairingCode('')).toBe('El código de vinculación es requerido.');
    });

    it('rechaza códigos con longitud distinta a 6 caracteres alfanuméricos', () => {
      expect(validatePairingCode('ABC12')).toBe(
        'El código de vinculación debe contener exactamente 6 caracteres alfanuméricos.'
      );
      expect(validatePairingCode('ABC1234')).toBe(
        'El código de vinculación debe contener exactamente 6 caracteres alfanuméricos.'
      );
    });

    it('acepta códigos de 6 caracteres limpios o con guiones que resulten en 6', () => {
      expect(validatePairingCode('ZG4821')).toBeNull();
      expect(validatePairingCode('zg-4821')).toBeNull();
      expect(validatePairingCode('K9M2PX')).toBeNull();
    });
  });

  describe('getDeviceStatusBadge', () => {
    it('retorna badge verde para VINCULADO', () => {
      const badge = getDeviceStatusBadge('VINCULADO');
      expect(badge.label).toBe('VINCULADO');
      expect(badge.variant).toBe('success');
      expect(badge.colorClass).toContain('emerald');
    });

    it('retorna badge ámbar para PENDIENTE_VINCULACION', () => {
      const badge = getDeviceStatusBadge('PENDIENTE_VINCULACION');
      expect(badge.label).toBe('PENDIENTE');
      expect(badge.variant).toBe('warning');
      expect(badge.colorClass).toContain('amber');
    });

    it('retorna badge rojo para REVOCADO', () => {
      const badge = getDeviceStatusBadge('REVOCADO');
      expect(badge.label).toBe('REVOCADO');
      expect(badge.variant).toBe('danger');
      expect(badge.colorClass).toContain('red');
    });

    it('retorna default para estados desconocidos', () => {
      // @ts-expect-error probando fallback defensivo
      const badge = getDeviceStatusBadge('OTRO');
      expect(badge.variant).toBe('default');
    });
  });

  describe('canManageLanDevices (RBAC)', () => {
    it('permite a ADMINISTRADOR y SUPERVISOR gestionar servidor y dispositivos LAN', () => {
      expect(canManageLanDevices('ADMINISTRADOR')).toBe(true);
      expect(canManageLanDevices('SUPERVISOR')).toBe(true);
      expect(canManageLanDevices('administrador')).toBe(true);
    });

    it('deniega gestión a RECEPCIONISTA y usuarios no autorizados', () => {
      expect(canManageLanDevices('RECEPCIONISTA')).toBe(false);
      expect(canManageLanDevices(null)).toBe(false);
      expect(canManageLanDevices(undefined)).toBe(false);
    });
  });

  describe('formatScannerUrl', () => {
    const mockStatus: LanServerStatusDto = {
      isRunning: true,
      port: 3443,
      localIps: ['192.168.1.45'],
      primaryIp: '192.168.1.45',
      httpsUrl: 'https://192.168.1.45:3443/scanner',
      httpUrl: 'http://192.168.1.45:3443/scanner',
      mdnsHostname: 'sistema.local',
      mdnsActive: true,
      caCertPem: '---CERT---',
      caCertFingerprintSha256: 'ABCD1234',
      totalDevicesLinked: 2,
      totalDevicesPending: 1,
      totalScansToday: 45,
    };

    it('retorna la URL base cuando no se proporciona código de emparejamiento', () => {
      expect(formatScannerUrl(mockStatus)).toBe('https://192.168.1.45:3443/scanner');
    });

    it('agrega el parámetro ?pair= con el código normalizado', () => {
      expect(formatScannerUrl(mockStatus, 'zg-4821')).toBe(
        'https://192.168.1.45:3443/scanner?pair=ZG4821'
      );
    });

    it('usa & si la URL ya contiene query parameters', () => {
      const statusWithQuery = {
        ...mockStatus,
        httpsUrl: 'https://192.168.1.45:3443/scanner?mode=kiosk',
      };
      expect(formatScannerUrl(statusWithQuery, 'K9M2PX')).toBe(
        'https://192.168.1.45:3443/scanner?mode=kiosk&pair=K9M2PX'
      );
    });
  });

  describe('formatSha256Fingerprint', () => {
    it('formatea la huella en pares separados por dos puntos', () => {
      expect(formatSha256Fingerprint('A1B2C3D4')).toBe('A1:B2:C3:D4');
    });

    it('maneja strings vacíos retornando mensaje accesible', () => {
      expect(formatSha256Fingerprint('')).toBe('No disponible');
    });
  });

  describe('playWebAudioTone', () => {
    it('no arroja error al ejecutarse en el entorno de pruebas', () => {
      expect(() => playWebAudioTone(880, 0.15)).not.toThrow();
    });

    it('invoca el contexto de audio simulado cuando está definido en window', () => {
      const mockOscillator = {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockGain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      const mockContext = {
        currentTime: 0,
        createOscillator: vi.fn(() => mockOscillator),
        createGain: vi.fn(() => mockGain),
        destination: {},
      };

      // @ts-expect-error Mock parcial de AudioContext
      window.AudioContext = vi.fn(() => mockContext);

      playWebAudioTone(440, 0.2);

      expect(mockContext.createOscillator).toHaveBeenCalled();
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
      expect(mockOscillator.start).toHaveBeenCalled();
    });
  });
});
