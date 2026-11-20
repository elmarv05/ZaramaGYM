// ============================================================================
// PRUEBAS UNITARIAS E INTEGRACIÓN: REPARACIÓN DE ESCANEO QR Y MULTI-IP LAN
// Verifica normalización HID (teclado ES), renderizado de QR real y adaptadores
// Ubicación: src/__tests__/QrScannerFix.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { normalizeQrTokenClient } from '../utils/qrScanner';
import { LanServerView } from '../features/lan/LanServerView';
import { AttendanceView } from '../features/attendance/AttendanceView';
import { AuthSession } from '../types/auth';
import { LanServerStatusDto, MobileDevicePairingDto } from '../types/lan';

vi.mock('../services/ipc/client', () => ({
  safeInvoke: vi.fn(),
}));

import { safeInvoke } from '../services/ipc/client';

const mockSafeInvoke = vi.mocked(safeInvoke);

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Zarama',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-15 08:00:00',
};

describe('Reparación QR & Red LAN Multi-NIC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Normaliza lecturas de pistola láser HID (apóstrofe -> guion y mayúsculas) y URLs con token ZG-', () => {
    expect(normalizeQrTokenClient("  zg'a1b2c3d4e5f6  ")).toBe('ZG-A1B2C3D4E5F6');
    expect(normalizeQrTokenClient('https://zaramagym.local/check?token=ZG-99AABBCC')).toBe('ZG-99AABBCC');
    expect(normalizeQrTokenClient("zg’112233")).toBe('ZG-112233');
    expect(normalizeQrTokenClient('QR-LEGACY-01')).toBe('QR-LEGACY-01');
  });

  it('2. LanServerView usa mDNS (zaramagym.local) por defecto y permite cambiar a IPs de respaldo y HTTP actualizando URL y QR', async () => {
    const multiNicStatus: LanServerStatusDto = {
      isRunning: true,
      port: 3443,
      localIps: ['192.168.100.6', '192.168.100.9'],
      primaryIp: '192.168.100.6',
      httpsUrl: 'https://zaramagym.local:3443/scanner',
      httpUrl: 'http://zaramagym.local:3443/scanner',
      mdnsHostname: 'zaramagym.local',
      mdnsActive: true,
      caCertPem: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
      caCertFingerprintSha256: 'AA:BB:CC:DD',
      totalDevicesLinked: 0,
      totalDevicesPending: 1,
      totalScansToday: 0,
    };

    const pairingResponse: MobileDevicePairingDto = {
      deviceId: 50,
      nombreDispositivo: 'Android Recepción',
      codigoVinculacion: 'V7HAJ7',
      pairingUrl: 'https://zaramagym.local:3443/scanner?pair=V7HAJ7',
      qrDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      expiresInMinutes: 60,
    };

    mockSafeInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_lan_server_status') return multiNicStatus;
      if (cmd === 'list_mobile_devices') return [];
      if (cmd === 'create_mobile_device_pairing') return pairingResponse;
      return null;
    });

    render(<LanServerView currentSession={adminSession} clients={[]} />);

    const ipSelect = await screen.findByLabelText(/Seleccionar adaptador de red LAN/i);
    expect(ipSelect).toHaveValue('zaramagym.local');
    expect(screen.getByText('https://zaramagym.local:3443/scanner')).toBeInTheDocument();

    // Generar código de vinculación -> usa mDNS por defecto
    fireEvent.change(screen.getByPlaceholderText(/Nombre del dispositivo/i), {
      target: { value: 'Android Recepción' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Generar Código de Enlace/i }));

    expect(await screen.findByText('V7HAJ7')).toBeInTheDocument();
    expect(screen.getByText('https://zaramagym.local:3443/scanner?pair=V7HAJ7')).toBeInTheDocument();

    // Cambiar a IP de respaldo Ethernet (192.168.100.9)
    fireEvent.change(ipSelect, { target: { value: '192.168.100.9' } });
    expect(screen.getByText('https://192.168.100.9:3443/scanner')).toBeInTheDocument();
    expect(screen.getByText('https://192.168.100.9:3443/scanner?pair=V7HAJ7')).toBeInTheDocument();

    // Cambiar protocolo a HTTP
    fireEvent.click(screen.getByRole('button', { name: /^HTTP$/i }));
    expect(screen.getByText('http://192.168.100.9:3443/scanner')).toBeInTheDocument();
  });

  it('3. AttendanceView normaliza entrada de pistola láser con apóstrofe (zg\'...) antes de invocar check_in_client', async () => {
    mockSafeInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_today_attendance_summary') {
        return {
          totalIngresosHoy: 0,
          totalVerde: 0,
          totalAmarillo: 0,
          totalRojoAutorizados: 0,
          totalQrLocal: 0,
          totalManualOlvido: 0,
          totalPaseCredito: 0,
          totalQrMovil: 0,
          ultimoIngresoHora: null,
        };
      }
      if (cmd === 'list_attendances' || cmd === 'list_membership_extensions' || cmd === 'list_client_memberships') {
        return [];
      }
      if (cmd === 'get_system_config') {
        return {
          diasAlertaAmarillo: 5,
          minutosAntireboteQr: 3,
          precioPaseDiarioCreditoDefault: '10.00',
          updatedAt: '2026-11-15 08:00:00',
        };
      }
      if (cmd === 'check_in_client') {
        return {
          attendanceId: 1,
          clienteId: 1,
          nombreCompleto: 'Socio Prueba',
          tipoDocumento: 'DNI',
          numeroDocumento: '12345678',
          fotoPerfilDataUrl: null,
          colorSemaforo: 'VERDE',
          estadoAcceso: 'AUTORIZADO',
          motivo: 'OK',
          membresiaId: 1,
          nombrePlan: 'Plan Mensual',
          fechaVencimiento: '2026-12-15',
          diasRestantes: 30,
          deudaPendiente: '0.00',
          esReboteDuplicado: false,
          modoIngreso: 'QR_LOCAL',
          fechaHoraIngreso: '2026-11-15 10:00:00',
          puedeAutorizarRojo: false,
        };
      }
      return null;
    });

    render(<AttendanceView currentSession={adminSession} clients={[]} />);

    const qrInput = await screen.findByTestId('scanner-qr-input');
    fireEvent.change(qrInput, { target: { value: "zg'abcd1234" } });
    fireEvent.submit(qrInput.closest('form')!);

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith('check_in_client', {
        input: {
          qrToken: 'ZG-ABCD1234',
          modoIngreso: 'QR_LOCAL',
        },
      });
    });
  });

  it('4. Abrir Simulador M1/M2 desde LanServerView (isOpen false -> true -> M2 -> cerrar) no rompe el orden de Hooks ni pone la pantalla en blanco', async () => {
    const statusDto: LanServerStatusDto = {
      isRunning: true,
      port: 3443,
      localIps: ['192.168.100.6'],
      primaryIp: '192.168.100.6',
      httpsUrl: 'https://192.168.100.6:3443/scanner',
      httpUrl: 'http://192.168.100.6:3443/scanner',
      mdnsHostname: 'sistema.local',
      mdnsActive: true,
      caCertPem: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
      caCertFingerprintSha256: 'AA:BB:CC:DD',
      totalDevicesLinked: 0,
      totalDevicesPending: 1,
      totalScansToday: 0,
    };

    mockSafeInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_lan_server_status') return statusDto;
      if (cmd === 'list_mobile_devices') return [];
      if (cmd === 'pair_mobile_device') {
        return {
          tokenSesion: 'tok_sim_m2',
          deviceId: 50,
          nombreDispositivo: 'Android Recepción',
          gymName: 'ZaramaGYM',
        };
      }
      return null;
    });

    render(<LanServerView currentSession={adminSession} clients={[]} />);

    // Transición isOpen: false -> true al pulsar Simular Vista Móvil (M1 / M2)
    const openSimBtn = await screen.findByRole('button', { name: /Simular Vista Móvil \(M1 \/ M2\)/i });
    fireEvent.click(openSimBtn);

    const codeInput = await screen.findByLabelText(/Código de Vinculación/i);
    fireEvent.change(codeInput, { target: { value: 'V7HAJ7' } });
    fireEvent.click(screen.getByRole('button', { name: /Vincular este Teléfono/i }));

    // Verificar llegada sin errores a Vista M2
    expect(await screen.findByText(/ENFOCAR CREDENCIAL QR/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Usar Cámara PC/i })).toBeInTheDocument();

    // Cerrar y volver a abrir (true -> false -> true)
    fireEvent.click(screen.getByRole('button', { name: /Cerrar Simulador/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Simular Vista Móvil \(M1 \/ M2\)/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
