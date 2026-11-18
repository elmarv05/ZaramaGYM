// ============================================================================
// SUITE DE PRUEBAS FRONTEND: SLICE 6 (SERVIDOR WI-FI LOCAL Y ESCÁNER MÓVIL)
// Verificación Integral de Componentes, RBAC, Simulador M1/M2 y Semáforo LAN
// Ubicación: src/__tests__/LanSlice6.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LanServerView } from '../features/lan/LanServerView';
import { MobileScannerSimulatorModal } from '../features/lan/MobileScannerSimulatorModal';
import { AuthSession } from '../types/auth';
import { ClientListItem } from '../types/entity';
import {
  CheckInEvaluationDto,
  TrafficLightColor,
} from '../types/attendance';
import {
  LanServerStatusDto,
  MobileDeviceDto,
  MobileDevicePairingDto,
  PairedMobileSessionDto,
} from '../types/lan';

// Mock de safeInvoke de Tauri IPC
vi.mock('../services/ipc/client', () => ({
  safeInvoke: vi.fn(),
}));

import { safeInvoke } from '../services/ipc/client';

const mockSafeInvoke = vi.mocked(safeInvoke);

// Sesiones de prueba para RBAC
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

const recepcionistaSession: AuthSession = {
  user_id: 3,
  persona_id: 3,
  username: 'recep1',
  nombre_completo: 'Operador Recepción',
  rol: 'RECEPCIONISTA',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-15 08:30:00',
};

// Fixture: Estado del servidor LAN en línea
const mockRunningStatus: LanServerStatusDto = {
  isRunning: true,
  port: 3443,
  localIps: ['192.168.1.45'],
  primaryIp: '192.168.1.45',
  httpsUrl: 'https://192.168.1.45:3443/scanner',
  httpUrl: 'http://192.168.1.45:3443/scanner',
  mdnsHostname: 'sistema.local',
  mdnsActive: true,
  caCertPem: '-----BEGIN CERTIFICATE-----\nMIID...TEST\n-----END CERTIFICATE-----',
  caCertFingerprintSha256: '7F4AB902C1E58490DF28391820491029',
  totalDevicesLinked: 2,
  totalDevicesPending: 1,
  totalScansToday: 84,
};

// Fixture: Dispositivos registrados
const mockDevices: MobileDeviceDto[] = [
  {
    id: 10,
    nombreDispositivo: 'iPhone Recepción Puerta 1',
    codigoVinculacion: 'K9M2PX',
    estadoVinculacion: 'VINCULADO',
    ipUltimaConexion: '192.168.1.72',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)',
    ultimoAccesoAt: '2026-11-15 11:20:00',
    totalEscaneos: 52,
    creadoPorUsuarioId: 1,
    creadoPorNombre: 'admin',
    revocadoPorUsuarioId: null,
    revocadoPorNombre: null,
    revocadoAt: null,
    estadoActivo: 1,
    createdAt: '2026-11-15 09:00:00',
  },
  {
    id: 11,
    nombreDispositivo: 'Galaxy S23 Portería Molinete',
    codigoVinculacion: 'ZG4821',
    estadoVinculacion: 'PENDIENTE_VINCULACION',
    ipUltimaConexion: null,
    userAgent: null,
    ultimoAccesoAt: null,
    totalEscaneos: 0,
    creadoPorUsuarioId: 1,
    creadoPorNombre: 'admin',
    revocadoPorUsuarioId: null,
    revocadoPorNombre: null,
    revocadoAt: null,
    estadoActivo: 1,
    createdAt: '2026-11-15 10:15:00',
  },
  {
    id: 12,
    nombreDispositivo: 'Xiaomi Antiguo Turno Noche',
    codigoVinculacion: 'OLD888',
    estadoVinculacion: 'REVOCADO',
    ipUltimaConexion: '192.168.1.99',
    userAgent: 'Mozilla/5.0 (Linux; Android 12)',
    ultimoAccesoAt: '2026-11-14 22:00:00',
    totalEscaneos: 32,
    creadoPorUsuarioId: 1,
    creadoPorNombre: 'admin',
    revocadoPorUsuarioId: 1,
    revocadoPorNombre: 'admin',
    revocadoAt: '2026-11-15 07:00:00',
    estadoActivo: 0,
    createdAt: '2026-11-14 18:00:00',
  },
];

// Fixture: Socios del directorio
const mockClients: ClientListItem[] = [
  {
    id: 101,
    persona_id: 10,
    nombres: 'Carlos',
    apellidos: 'Rodríguez Mendoza',
    tipo_documento: 'DNI',
    numero_documento: '72849103',
    telefono: '987654321',
    email: 'carlos@example.com',
    codigo_qr_token: 'ZG-A1B2C3D4E5F67890',
    peso_actual_kg: 74.5,
    estado_activo: true,
    created_at: '2026-11-01 10:00:00',
  },
  {
    id: 102,
    persona_id: 11,
    nombres: 'María Luisa',
    apellidos: 'Torres',
    tipo_documento: 'DNI',
    numero_documento: '44556677',
    telefono: '912345678',
    email: 'maria@example.com',
    codigo_qr_token: 'ZG-F0E1D2C3B4A59687',
    peso_actual_kg: 58.0,
    estado_activo: true,
    created_at: '2026-11-05 10:00:00',
  },
];

describe('Suite Frontend: Slice 6 - Servidor Wi-Fi Local y Escáner Móvil', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSafeInvoke.mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'get_lan_server_status') {
        return mockRunningStatus;
      }
      if (command === 'list_mobile_devices') {
        return mockDevices;
      }
      if (command === 'toggle_lan_server') {
        const payload = args as { enable: boolean };
        return {
          ...mockRunningStatus,
          isRunning: payload.enable,
        };
      }
      if (command === 'create_mobile_device_pairing') {
        const payload = args as { input: { nombreDispositivo: string } };
        const pairing: MobileDevicePairingDto = {
          deviceId: 15,
          nombreDispositivo: payload.input.nombreDispositivo,
          codigoVinculacion: 'ZG9988',
          pairingUrl: 'https://192.168.1.45:3443/scanner?pair=ZG9988',
          qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          expiresInMinutes: 60,
        };
        return pairing;
      }
      if (command === 'pair_mobile_device') {
        const session: PairedMobileSessionDto = {
          tokenSesion: 'tok_csprng_32_hex_mobile_valid_1234',
          deviceId: 15,
          nombreDispositivo: 'iPhone Recepción Puerta 1',
          gymName: 'ZaramaGYM',
        };
        return session;
      }
      if (command === 'revoke_mobile_device') {
        return undefined;
      }
      if (command === 'mobile_scan_qr') {
        const payload = args as { input: { qrToken?: string; numeroDocumento?: string } };
        const isExpired = payload.input.qrToken?.includes('F0E1');
        const isYellow = payload.input.numeroDocumento?.includes('4455');

        const color: TrafficLightColor = isExpired ? 'ROJO' : isYellow ? 'AMARILLO' : 'VERDE';

        const evalResult: CheckInEvaluationDto = {
          asistenciaId: color === 'ROJO' ? null : 901,
          clienteId: 101,
          nombreCompleto: isExpired ? 'María Luisa Torres' : 'Carlos Rodríguez Mendoza',
          tipoDocumento: 'DNI',
          numeroDocumento: isExpired ? '44556677' : '72849103',
          fotoPerfilDataUrl: null,
          colorSemaforo: color,
          ingresoPermitido: color !== 'ROJO',
          alertaSonora: color !== 'VERDE',
          esRebote: false,
          motivoSemaforo:
            color === 'VERDE'
              ? 'Membresía activa vigente'
              : color === 'AMARILLO'
              ? 'Saldo pendiente de S/ 25.00'
              : 'Membresía vencida el 10/11/2026',
          membresiaId: 35,
          nombrePlan: 'Plan Trimestral Full',
          fechaVencimiento: '2026-12-30',
          diasRestantes: color === 'ROJO' ? -5 : 45,
          deudaTotalPendiente: color === 'AMARILLO' ? '25.00' : '0.00',
          modoIngreso: 'QR_MOVIL_LAN',
          fechaHoraIngreso: '2026-11-15 11:30:00',
          creditoGeneradoId: null,
        };
        return evalResult;
      }

      throw new Error(`Comando no mockeado: ${command}`);
    });
  });

  // --------------------------------------------------------------------------
  // CP-1: ESTADO DEL SERVIDOR LAN Y CONTROL DE APAGADO/ENCENDIDO (ADMIN)
  // --------------------------------------------------------------------------
  it('1. Renderiza el estado del Servidor LAN (EN LÍNEA, IP, mDNS, huella SHA-256) y permite detenerlo e iniciarlo', async () => {
    render(<LanServerView currentSession={adminSession} clients={mockClients} />);

    // Verificar indicador visual y datos de conexión
    expect(await screen.findByText('EN LÍNEA')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.45:3443')).toBeInTheDocument();
    expect(screen.getByText('sistema.local:3443')).toBeInTheDocument();
    expect(screen.getByText(/SHA256: 7F:4A:B9:02/i)).toBeInTheDocument();

    // Botón Detener Servidor (visible para Administrador)
    const stopButton = screen.getByRole('button', { name: /Detener Servidor/i });
    expect(stopButton).toBeInTheDocument();

    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith('toggle_lan_server', { enable: false });
    });
  });

  // --------------------------------------------------------------------------
  // CP-2: CONTROL DE ACCESO RBAC PARA RECEPCIONISTA
  // --------------------------------------------------------------------------
  it('2. Oculta controles de apagado/encendido, generación de códigos y revocación para RECEPCIONISTA', async () => {
    render(<LanServerView currentSession={recepcionistaSession} clients={mockClients} />);

    // El recepcionista ve el estado en línea y los dispositivos
    expect(await screen.findByText('EN LÍNEA')).toBeInTheDocument();
    expect(screen.getByText('iPhone Recepción Puerta 1')).toBeInTheDocument();

    // NO debe existir el botón Detener/Iniciar Servidor
    expect(screen.queryByRole('button', { name: /Detener Servidor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Iniciar Servidor/i })).not.toBeInTheDocument();

    // Mensaje RBAC informativo
    expect(
      screen.getByText(/Solo Administrador\/Supervisor pueden apagar o iniciar el servidor/i)
    ).toBeInTheDocument();

    // NO debe existir el panel ni botón de generación de nuevo código
    expect(screen.queryByRole('button', { name: /Generar Código de Enlace/i })).not.toBeInTheDocument();

    // NO debe existir el botón de revocar en la tabla para recepcionista
    expect(screen.queryByRole('button', { name: /^Revocar$/i })).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // CP-3: CREACIÓN DE VINCULACIÓN DE NUEVO DISPOSITIVO MÓVIL
  // --------------------------------------------------------------------------
  it('3. Permite al Administrador generar un nuevo emparejamiento mostrando el código de 6 caracteres y QR', async () => {
    render(<LanServerView currentSession={adminSession} clients={mockClients} />);

    const inputName = await screen.findByPlaceholderText(/Nombre del dispositivo/i);
    fireEvent.change(inputName, { target: { value: 'iPhone Portería Secundaria' } });

    const btnGenerate = screen.getByRole('button', { name: /Generar Código de Enlace/i });
    fireEvent.click(btnGenerate);

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith('create_mobile_device_pairing', {
        input: { nombreDispositivo: 'iPhone Portería Secundaria' },
      });
    });

    // Debe mostrar la tarjeta destacada con el código de 6 caracteres y la imagen QR
    expect(await screen.findByText('ZG9988')).toBeInTheDocument();
    expect(screen.getByText(/¡Vinculación Creada con Éxito!/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Probar en Simulador Móvil con este Código/i })).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // CP-4: VISTA MÓVIL M1 (EMPAREJAMIENTO POR CÓDIGO -> SESIÓN MÓVIL)
  // --------------------------------------------------------------------------
  it('4. En el Simulador Móvil M1 valida el código de vinculación y canjea el token de sesión pasando a M2', async () => {
    render(
      <MobileScannerSimulatorModal
        isOpen={true}
        onClose={vi.fn()}
        initialPairingCode="ZG-9988"
        clients={mockClients}
      />
    );

    // Debe mostrar la pantalla M1 con el input y el código formateado
    const inputCode = screen.getByLabelText(/Código de Vinculación/i);
    expect(inputCode).toHaveValue('ZG9988');

    const btnVincular = screen.getByRole('button', { name: /Vincular este Teléfono/i });
    fireEvent.click(btnVincular);

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith('pair_mobile_device', {
        input: expect.objectContaining({
          codigoVinculacion: 'ZG9988',
        }),
      });
    });

    // Al recibir el token, pasa a la vista M2 mostrando el visor de cámara y el nombre del dispositivo
    expect(await screen.findByText(/ENFOCAR CREDENCIAL QR/i)).toBeInTheDocument();
    expect(screen.getByText(/Wi-Fi LAN :3443 Conectado/i)).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // CP-5: VISTA MÓVIL M2 (EVALUACIÓN SEMAFÓRICA EN TIEMPO REAL: VERDE, AMARILLO Y ROJO)
  // --------------------------------------------------------------------------
  it('5. En la Vista Móvil M2 ejecuta escaneo QR y despliega el Semáforo a Pantalla Completa con sus variantes', async () => {
    render(
      <MobileScannerSimulatorModal
        isOpen={true}
        onClose={vi.fn()}
        initialPairingCode="ZG9988"
        clients={mockClients}
      />
    );

    // Vincular primero para entrar a M2
    fireEvent.click(screen.getByRole('button', { name: /Vincular este Teléfono/i }));
    await screen.findByText(/ENFOCAR CREDENCIAL QR/i);

    // 5.1 Caso Semáforo VERDE (Socio vigente)
    const inputQr = screen.getByPlaceholderText(/Token QR/i);
    fireEvent.change(inputQr, { target: { value: 'ZG-A1B2C3D4E5F67890' } });

    const btnScan = screen.getByRole('button', { name: /^Escanear$/i });
    fireEvent.click(btnScan);

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith('mobile_scan_qr', {
        input: expect.objectContaining({
          qrToken: 'ZG-A1B2C3D4E5F67890',
        }),
      });
    });

    // Debe aparecer el Overlay VERDE con "INGRESO CONCEDIDO"
    expect(await screen.findByText(/INGRESO CONCEDIDO/i)).toBeInTheDocument();
    expect(screen.getByText('Carlos Rodríguez Mendoza')).toBeInTheDocument();
    expect(screen.getByText(/¡Quedan 45 días de vigencia!/i)).toBeInTheDocument();

    // Cerrar overlay para probar siguiente
    const btnContinuar = screen.getByRole('button', { name: /Continuar/i });
    fireEvent.click(btnContinuar);

    // 5.2 Caso Semáforo ROJO (Socio vencido)
    fireEvent.change(inputQr, { target: { value: 'ZG-F0E1D2C3B4A59687' } });
    fireEvent.click(btnScan);

    // Debe aparecer el Overlay ROJO con "ACCESO BLOQUEADO" y advertencia de dirigirse a caja
    expect(await screen.findByText(/ACCESO BLOQUEADO/i)).toBeInTheDocument();
    expect(screen.getByText('María Luisa Torres')).toBeInTheDocument();
    expect(screen.getByText(/POR FAVOR DIRÍJASE A CAJA/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cerrar y Escanear Siguiente/i })).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // CP-6: REVOCACIÓN INMEDIATA DE DISPOSITIVO MÓVIL
  // --------------------------------------------------------------------------
  it('6. Permite al Administrador revocar un dispositivo móvil registrado', async () => {
    render(<LanServerView currentSession={adminSession} clients={mockClients} />);

    // Buscar botón de revocar para el dispositivo con ID 10
    const revokeButtons = await screen.findAllByRole('button', { name: /^Revocar$/i });
    expect(revokeButtons.length).toBeGreaterThan(0);

    // Clic en revocar solicita confirmación
    fireEvent.click(revokeButtons[0]);
    const confirmButton = await screen.findByRole('button', { name: /¿Confirmar\?/i });
    expect(confirmButton).toBeInTheDocument();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith('revoke_mobile_device', {
        deviceId: 10,
        device_id: 10,
      });
    });
  });
});
