// ============================================================================
// TIPOS Y CONTRATOS DTO: SERVIDOR WI-FI LOCAL Y ESCÁNER MÓVIL (SLICE 6)
// Ubicación: src/types/lan.ts
// ============================================================================

export type DevicePairingStatus = 'PENDIENTE_VINCULACION' | 'VINCULADO' | 'REVOCADO';

export interface LanServerStatusDto {
  isRunning: boolean;
  port: number;
  localIps: string[];
  primaryIp: string;
  httpsUrl: string;
  httpUrl: string;
  mdnsHostname: string;
  mdnsActive: boolean;
  caCertPem: string;
  caCertFingerprintSha256: string;
  totalDevicesLinked: number;
  totalDevicesPending: number;
  totalScansToday: number;
}

export interface MobileDeviceDto {
  id: number;
  nombreDispositivo: string;
  codigoVinculacion: string;
  estadoVinculacion: DevicePairingStatus;
  ipUltimaConexion: string | null;
  userAgent: string | null;
  ultimoAccesoAt: string | null;
  totalEscaneos: number;
  creadoPorUsuarioId: number;
  creadoPorNombre: string;
  revocadoPorUsuarioId: number | null;
  revocadoPorNombre: string | null;
  revocadoAt: string | null;
  estadoActivo: number;
  createdAt: string;
}

export interface MobileDeviceFilter {
  estadoVinculacion?: DevicePairingStatus;
  estadoActivo?: number;
  busqueda?: string;
}

export interface CreateMobileDeviceInput {
  nombreDispositivo: string;
}

export interface MobileDevicePairingDto {
  deviceId: number;
  nombreDispositivo: string;
  codigoVinculacion: string;
  pairingUrl: string;
  qrDataUrl: string;
  expiresInMinutes: number;
}

export interface PairMobileDeviceInput {
  codigoVinculacion: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface PairedMobileSessionDto {
  tokenSesion: string;
  deviceId: number;
  nombreDispositivo: string;
  gymName: string;
}

export interface MobileScanInput {
  tokenSesion?: string;
  qrToken?: string;
  numeroDocumento?: string;
}
