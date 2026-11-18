// ============================================================================
// HOOK REACTIVO: SERVIDOR WI-FI LOCAL Y DISPOSITIVOS MÓVILES (SLICE 6)
// Gestión de estados Loading, Empty, Error, Success para Desktop
// Ubicación: src/hooks/useLanServer.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { validateDeviceName } from '../domain/lan';
import { lanIpc } from '../services/ipc/lanIpc';
import {
  LanServerStatusDto,
  MobileDeviceDto,
  MobileDeviceFilter,
  MobileDevicePairingDto,
} from '../types/lan';

export interface UseLanServerReturn {
  serverStatus: LanServerStatusDto | null;
  devices: MobileDeviceDto[];
  activePairing: MobileDevicePairingDto | null;
  filter: MobileDeviceFilter;
  isLoading: boolean;
  isActionLoading: boolean;
  error: string | null;

  // Acciones
  fetchServerStatus: () => Promise<void>;
  toggleServer: (enable: boolean) => Promise<void>;
  fetchDevices: (newFilter?: MobileDeviceFilter) => Promise<void>;
  createPairing: (deviceName: string) => Promise<MobileDevicePairingDto>;
  revokeDevice: (deviceId: number) => Promise<void>;
  setFilter: React.Dispatch<React.SetStateAction<MobileDeviceFilter>>;
  clearActivePairing: () => void;
  clearError: () => void;
}

export function useLanServer(enabled = true): UseLanServerReturn {
  const [serverStatus, setServerStatus] = useState<LanServerStatusDto | null>(null);
  const [devices, setDevices] = useState<MobileDeviceDto[]>([]);
  const [activePairing, setActivePairing] = useState<MobileDevicePairingDto | null>(null);
  const [filter, setFilter] = useState<MobileDeviceFilter>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const clearActivePairing = useCallback(() => setActivePairing(null), []);

  const fetchServerStatus = useCallback(async () => {
    try {
      const status = await lanIpc.getLanServerStatus();
      setServerStatus(status);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al consultar estado del servidor Wi-Fi local.';
      setError(msg);
    }
  }, []);

  const fetchDevices = useCallback(async (currentFilter: MobileDeviceFilter = filter) => {
    try {
      const list = await lanIpc.listMobileDevices(currentFilter);
      setDevices(list);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al cargar dispositivos móviles vinculados.';
      setError(msg);
    }
  }, [filter]);

  const toggleServer = useCallback(async (enable: boolean) => {
    setIsActionLoading(true);
    setError(null);
    try {
      const updated = await lanIpc.toggleLanServer(enable);
      setServerStatus(updated);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : `Error al ${enable ? 'iniciar' : 'detener'} el servidor LAN.`;
      setError(msg);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const createPairing = useCallback(async (deviceName: string): Promise<MobileDevicePairingDto> => {
    const valError = validateDeviceName(deviceName);
    if (valError) {
      setError(valError);
      throw new Error(valError);
    }

    setIsActionLoading(true);
    setError(null);
    try {
      const pairing = await lanIpc.createMobileDevicePairing({
        nombreDispositivo: deviceName.trim(),
      });
      setActivePairing(pairing);
      // Refrescar lista de dispositivos y estado
      await Promise.all([fetchDevices(), fetchServerStatus()]);
      return pairing;
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al generar código de vinculación móvil.';
      setError(msg);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, [fetchDevices, fetchServerStatus]);

  const revokeDevice = useCallback(async (deviceId: number) => {
    setIsActionLoading(true);
    setError(null);
    try {
      await lanIpc.revokeMobileDevice(deviceId);
      await Promise.all([fetchDevices(), fetchServerStatus()]);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al revocar el dispositivo móvil.';
      setError(msg);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, [fetchDevices, fetchServerStatus]);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    setIsLoading(true);

    Promise.all([
      lanIpc.getLanServerStatus().catch(() => null),
      lanIpc.listMobileDevices(filter).catch(() => []),
    ]).then(([status, list]) => {
      if (!mounted) return;
      if (status) setServerStatus(status);
      if (list) setDevices(list);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [enabled, filter]);

  return {
    serverStatus,
    devices,
    activePairing,
    filter,
    isLoading,
    isActionLoading,
    error,
    fetchServerStatus,
    toggleServer,
    fetchDevices,
    createPairing,
    revokeDevice,
    setFilter,
    clearActivePairing,
    clearError,
  };
}
