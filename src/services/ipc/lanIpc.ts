// ============================================================================
// SERVICIOS IPC: SERVIDOR WI-FI LOCAL Y ESCÁNER MÓVIL (SLICE 6)
// Envoltorios tipados para Tauri v2 con estricta serialización camelCase
// Ubicación: src/services/ipc/lanIpc.ts
// ============================================================================

import { CheckInEvaluationDto } from '../../types/attendance';
import {
  CreateMobileDeviceInput,
  LanServerStatusDto,
  MobileDeviceDto,
  MobileDeviceFilter,
  MobileDevicePairingDto,
  MobileScanInput,
  PairMobileDeviceInput,
  PairedMobileSessionDto,
} from '../../types/lan';
import { safeInvoke } from './client';

export const lanIpc = {
  /**
   * Obtiene el estado del servidor LAN Axum (:3443), IPs locales, mDNS y métricas
   */
  async getLanServerStatus(): Promise<LanServerStatusDto> {
    return safeInvoke<LanServerStatusDto>('get_lan_server_status');
  },

  /**
   * Inicia o detiene el servidor Axum en caliente (Solo ADMINISTRADOR y SUPERVISOR)
   */
  async toggleLanServer(enable: boolean): Promise<LanServerStatusDto> {
    return safeInvoke<LanServerStatusDto>('toggle_lan_server', { enable });
  },

  /**
   * Lista los dispositivos móviles registrados con filtros opcionales
   * NOTA: 'filter' se envía únicamente con propiedades camelCase para evitar duplicados en Serde
   */
  async listMobileDevices(filter: MobileDeviceFilter = {}): Promise<MobileDeviceDto[]> {
    return safeInvoke<MobileDeviceDto[]>('list_mobile_devices', { filter });
  },

  /**
   * Genera una nueva vinculación con código de 6 caracteres y QR (Solo ADMINISTRADOR y SUPERVISOR)
   * NOTA: 'input' se envía únicamente con propiedades camelCase
   */
  async createMobileDevicePairing(
    input: CreateMobileDeviceInput
  ): Promise<MobileDevicePairingDto> {
    return safeInvoke<MobileDevicePairingDto>('create_mobile_device_pairing', { input });
  },

  /**
   * Canjea el código de vinculación de 6 caracteres por el token Bearer persistente
   * NOTA: 'input' se envía únicamente con propiedades camelCase
   */
  async pairMobileDevice(input: PairMobileDeviceInput): Promise<PairedMobileSessionDto> {
    return safeInvoke<PairedMobileSessionDto>('pair_mobile_device', { input });
  },

  /**
   * Revoca inmediatamente un dispositivo móvil invalidando su token en memoria y BD
   * NOTA: 'deviceId' y 'device_id' se envían en el nivel raíz de argumentos para compatibilidad absoluta
   */
  async revokeMobileDevice(deviceId: number): Promise<void> {
    return safeInvoke<void>('revoke_mobile_device', {
      deviceId,
      device_id: deviceId,
    });
  },

  /**
   * Evalúa la credencial QR o documento desde un smartphone móvil vinculado
   * NOTA: 'input' se envía únicamente con propiedades camelCase
   */
  async mobileScanQr(input: MobileScanInput): Promise<CheckInEvaluationDto> {
    return safeInvoke<CheckInEvaluationDto>('mobile_scan_qr', { input });
  },
};
