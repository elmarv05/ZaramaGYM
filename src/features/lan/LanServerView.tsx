// ============================================================================
// COMPONENTE: VISTA PRINCIPAL SERVIDOR WI-FI LOCAL Y ESCÁNER MÓVIL (SLICE 6)
// Dashboard de Red Local, Certificado CA, Vinculación QR y Dispositivos
// Ubicación: src/features/lan/LanServerView.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { ModuleSkeleton } from '../../components/primitives/Skeleton';
import QRCode from 'qrcode';
import { Alert } from '../../components/primitives/Alert';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Modal } from '../../components/primitives/Modal';
import {
  canManageLanDevices,
  formatScannerUrl,
  formatSha256Fingerprint,
  getDeviceStatusBadge,
} from '../../domain/lan';
import { useLanServer } from '../../hooks/useLanServer';
import { AuthSession } from '../../types/auth';
import { ClientListItem } from '../../types/entity';
import { DevicePairingStatus } from '../../types/lan';
import { MobileScannerSimulatorModal } from './MobileScannerSimulatorModal';
import { preventEnterKeySubmit } from '../../utils/formSafety';

export interface LanServerViewProps {
  currentSession: AuthSession;
  clients?: ClientListItem[];
}

const FIREWALL_POWERSHELL_CMD =
  'New-NetFirewallRule -DisplayName "ZaramaGYM - Servidor Escaner Movil LAN (TCP 3443)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3443 -RemoteAddress LocalSubnet -Profile Private,Domain,Public -Enabled True; New-NetFirewallRule -DisplayName "ZaramaGYM - Descubrimiento mDNS Local (UDP 5353)" -Direction Inbound -Action Allow -Protocol UDP -LocalPort 5353 -RemoteAddress LocalSubnet -Profile Private,Domain,Public -Enabled True';

export const LanServerView: React.FC<LanServerViewProps> = ({
  currentSession,
  clients = [],
}) => {
  const isManager = canManageLanDevices(currentSession.rol);
  const {
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
  } = useLanServer(true);

  // Estados locales para formularios y modales
  const [newDeviceName, setNewDeviceName] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulatorInitialCode, setSimulatorInitialCode] = useState('');
  const [revokeConfirmId, setRevokeConfirmId] = useState<number | null>(null);
  const [selectedHost, setSelectedHost] = useState('');
  const [pairingProtocol, setPairingProtocol] = useState<'https' | 'http'>('https');
  const [overrideQrDataUrl, setOverrideQrDataUrl] = useState<string>('');
  const [isFirewallGuideOpen, setIsFirewallGuideOpen] = useState(false);
  const [copiedFirewallCmd, setCopiedFirewallCmd] = useState(false);
  const [downloadedCert, setDownloadedCert] = useState(false);
  const [lanToast, setLanToast] = useState<{
    variant: 'success' | 'info';
    title: string;
    message: string;
  } | null>(null);

  // Copiar comando PowerShell al portapapeles
  const handleCopyFirewallCmd = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(FIREWALL_POWERSHELL_CMD);
      }
      setCopiedFirewallCmd(true);
      setLanToast({
        variant: 'success',
        title: 'Comando PowerShell copiado',
        message: 'Pégalo en una consola PowerShell como Administrador para habilitar el puerto TCP 3443.',
      });
      setTimeout(() => setCopiedFirewallCmd(false), 2000);
    } catch {
      // Ignorar si clipboard no está disponible
    }
  };

  // Copiar URL al portapapeles
  const handleCopyUrl = async (url: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      setCopiedUrl(true);
      setLanToast({
        variant: 'success',
        title: 'Dirección URL copiada',
        message: `Se copió ${url} al portapapeles.`,
      });
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignorar si clipboard no está disponible
    }
  };

  // Descargar Certificado Raíz CA
  const handleDownloadCaCert = () => {
    if (!serverStatus?.caCertPem) return;
    try {
      const blob = new Blob([serverStatus.caCertPem], { type: 'application/x-x509-ca-cert' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'zaramagym-root-ca.crt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadedCert(true);
      setLanToast({
        variant: 'success',
        title: 'Certificado Raíz CA descargado',
        message: 'El archivo zaramagym-root-ca.crt se guardó en tu carpeta de Descargas.',
      });
      setTimeout(() => setDownloadedCert(false), 3000);
    } catch {
      // Fallback
    }
  };

  // Generar vinculación de nuevo dispositivo
  const handleCreatePairingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;
    try {
      await createPairing(newDeviceName);
      setNewDeviceName('');
    } catch {
      // Error manejado en el hook
    }
  };

  // Abrir simulador con código de dispositivo
  const handleOpenSimulatorWithCode = (code: string) => {
    setSimulatorInitialCode(code);
    setSimulatorOpen(true);
  };

  // Confirmar revocación
  const handleConfirmRevoke = async (id: number) => {
    try {
      await revokeDevice(id);
      setRevokeConfirmId(null);
    } catch {
      // Error manejado en el hook
    }
  };

  // Re-vincular en 1 clic: revoca la sesión anterior perdida y emite un nuevo código/QR
  const handleReLinkDevice = async (id: number, deviceName: string) => {
    if (!isManager) return;
    try {
      await revokeDevice(id);
      await createPairing(deviceName);
      setRevokeConfirmId(null);
    } catch {
      // Error manejado en el hook
    }
  };

  // Filtrado de dispositivos
  const filteredDevices = devices.filter((d) => {
    if (filter.estadoVinculacion && d.estadoVinculacion !== filter.estadoVinculacion) {
      return false;
    }
    if (filter.busqueda) {
      const q = filter.busqueda.toLowerCase();
      const matchName = d.nombreDispositivo.toLowerCase().includes(q);
      const matchCode = d.codigoVinculacion.toLowerCase().includes(q);
      const matchIp = (d.ipUltimaConexion || '').toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchIp) return false;
    }
    return true;
  });

  const availableIps = serverStatus?.localIps?.length ? serverStatus.localIps : [];
  const mdnsHost = (serverStatus?.mdnsHostname || 'zaramagym.local').trim();
  const primaryIp = serverStatus?.primaryIp || '127.0.0.1';
  const defaultTargetHost = primaryIp;
  const activeTargetHost =
    selectedHost && (selectedHost === mdnsHost || availableIps.includes(selectedHost))
      ? selectedHost
      : defaultTargetHost;
  const activePort = serverStatus?.port || 3443;
  const usesCustomNetworkTarget =
    Boolean(serverStatus) &&
    (activeTargetHost !== defaultTargetHost || pairingProtocol !== 'https');

  const mobileScannerDisplayUrl = serverStatus
    ? usesCustomNetworkTarget
      ? `${pairingProtocol}://${activeTargetHost}:${activePort}/scanner`
      : formatScannerUrl(serverStatus)
    : 'Servidor no iniciado';

  const effectivePairingUrl = activePairing
    ? usesCustomNetworkTarget
      ? `${pairingProtocol}://${activeTargetHost}:${activePort}/scanner?pair=${encodeURIComponent(activePairing.codigoVinculacion)}`
      : activePairing.pairingUrl
    : '';

  // Si el usuario cambia de adaptador de red (Wi-Fi/Ethernet) o protocolo (HTTPS/HTTP),
  // regenerar un código QR real de alta legibilidad para esa URL exacta.
  useEffect(() => {
    let cancelled = false;
    if (!activePairing || !usesCustomNetworkTarget || !effectivePairingUrl) {
      setOverrideQrDataUrl('');
      return;
    }

    (async () => {
      try {
        const dataUrl = await QRCode.toDataURL(effectivePairingUrl, {
          width: 280,
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        if (!cancelled) {
          setOverrideQrDataUrl(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setOverrideQrDataUrl('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePairing, usesCustomNetworkTarget, effectivePairingUrl]);

  const effectivePairingQrSrc =
    usesCustomNetworkTarget && overrideQrDataUrl
      ? overrideQrDataUrl
      : activePairing?.qrDataUrl || '';

  return (
    <div className="w-full flex flex-col gap-6">
      {lanToast && (
        <Alert
          variant={lanToast.variant}
          title={lanToast.title}
          onClose={() => setLanToast(null)}
        >
          {lanToast.message}
        </Alert>
      )}

      {/* ==================================================================== */}
      {/* 1. BANNER DE ESTADO DEL SERVIDOR LAN (:3443 + mDNS)                 */}
      {/* ==================================================================== */}
      <section
        aria-labelledby="lan-server-status-title"
        className="bg-surface border border-border rounded-xl p-6 shadow-xs flex flex-col gap-5"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center font-bold border border-indigo-200 dark:border-indigo-800">
              <Icon name="wifi" className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="lan-server-status-title" className="text-xl font-bold text-txt-primary">
                  Servidor Wi-Fi Local & Escáner Móvil
                </h2>
                {serverStatus?.isRunning ? (
                  <Badge variant="success" size="sm">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-status-success" aria-hidden="true" />
                      <span>EN LÍNEA</span>
                    </span>
                  </Badge>
                ) : (
                  <Badge variant="danger" size="sm">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-status-danger" aria-hidden="true" />
                      <span>DETENIDO</span>
                    </span>
                  </Badge>
                )}
              </div>
              <p className="text-xs text-txt-secondary mt-0.5">
                Convierte cualquier smartphone iPhone o Android en la misma red Wi-Fi en un escáner móvil QR sin Internet.
              </p>
            </div>
          </div>

          {/* Botones de Acción Rápida de Servidor */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFirewallGuideOpen(true)}
              className="text-xs font-bold text-txt-primary bg-canvas-subtle hover:bg-surface-hover border border-border px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Icon name="shield" className="w-4 h-4 text-brand" />
              <span>Guía Firewall Windows</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSimulatorInitialCode('');
                setSimulatorOpen(true);
              }}
              className="text-xs font-bold text-brand bg-brand/10 hover:bg-brand/20 border border-brand/30 px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Icon name="smartphone" className="w-4 h-4" />
              <span>Simular Vista Móvil</span>
            </button>

            {isManager ? (
              serverStatus?.isRunning ? (
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={() => toggleServer(false)}
                  className="text-xs font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-300 dark:border-red-800 px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isActionLoading ? 'Deteniendo...' : 'Detener Servidor'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={() => toggleServer(true)}
                  className="text-xs font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-800 px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isActionLoading ? 'Iniciando...' : 'Iniciar Servidor'}
                </button>
              )
            ) : (
              <span className="text-[11px] text-txt-muted bg-canvas-subtle px-2.5 py-1.5 rounded border border-border">
                Solo el Administrador puede apagar o iniciar el servidor
              </span>
            )}
          </div>
        </div>

        {/* Notificación de Error Global */}
        {error && (
          <div
            role="alert"
            className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center justify-between"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="font-bold hover:underline text-xs"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Grilla de Datos de Conexión LAN */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-canvas-subtle p-3.5 rounded-xl border border-border text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-txt-muted block">IP Primaria & Puerto</span>
            <span className="font-mono font-bold text-txt-primary">
              {primaryIp}:{activePort}
            </span>
            {serverStatus && (
              <select
                aria-label="Seleccionar adaptador de red LAN"
                value={activeTargetHost}
                onChange={(e) => setSelectedHost(e.target.value)}
                className="mt-1.5 w-full bg-surface border border-border rounded px-2 py-1 text-[11px] font-mono text-txt-primary"
              >
                {availableIps.map((ip) => (
                  <option key={ip} value={ip}>
                    {ip}{ip === serverStatus.primaryIp ? ' (IP Wi-Fi / Hotspot Recomendada)' : ' (IP Alternativa)'}
                  </option>
                ))}
                {mdnsHost && (
                  <option value={mdnsHost}>
                    {mdnsHost} (mDNS Local - Opcional)
                  </option>
                )}
              </select>
            )}
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-txt-muted block">Host mDNS Local</span>
            <span className="font-mono font-semibold text-txt-primary block">
              {mdnsHost}:{activePort}
            </span>
            {serverStatus?.mdnsActive && (
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>Activo (Conserva sesión en Hotspot)</span>
              </span>
            )}
          </div>

          <div className="sm:col-span-2 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-bold text-txt-muted block">URL Escáner Móvil</span>
              {serverStatus && (
                <div className="inline-flex rounded border border-border bg-surface p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPairingProtocol('https')}
                    className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                      pairingProtocol === 'https'
                        ? 'bg-emerald-600 text-white'
                        : 'text-txt-secondary hover:text-txt-primary'
                    }`}
                  >
                    HTTPS (Cámara)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPairingProtocol('http')}
                    className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                      pairingProtocol === 'http'
                        ? 'bg-amber-600 text-white'
                        : 'text-txt-secondary hover:text-txt-primary'
                    }`}
                  >
                    HTTP
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-xs text-brand font-medium truncate">
                {mobileScannerDisplayUrl}
              </span>
              {serverStatus && (
                <button
                  type="button"
                  onClick={() => handleCopyUrl(mobileScannerDisplayUrl)}
                  className="shrink-0 text-[11px] bg-surface hover:bg-slate-200 dark:hover:bg-slate-700 border border-border px-2 py-0.5 rounded transition-colors inline-flex items-center gap-1"
                >
                  <Icon name={copiedUrl ? 'check' : 'audit'} className="w-3.5 h-3.5" />
                  <span>{copiedUrl ? '¡Copiado!' : 'Copiar'}</span>
                </button>
              )}
            </div>
            {serverStatus && (
              <span className="text-[10px] text-txt-muted mt-1">
                Para activar cámara en iOS/Android usa HTTPS (acepta la advertencia local o instala el CA). Permite el puerto TCP {activePort} en tu Firewall de Windows (Red Privada).
              </span>
            )}
          </div>
        </div>

        {/* Certificado Raíz CA y Huella SHA-256 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-border/60 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="font-semibold text-txt-secondary">Certificado CA Raíz:</span>
            <span className="font-mono text-[11px] text-txt-muted truncate">
              SHA256: {formatSha256Fingerprint(serverStatus?.caCertFingerprintSha256 || '')}
            </span>
          </div>
          <button
            type="button"
            onClick={handleDownloadCaCert}
            disabled={!serverStatus?.caCertPem}
            className={`text-xs font-semibold flex items-center gap-1 shrink-0 disabled:opacity-50 ${
              downloadedCert
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-indigo-700 dark:text-indigo-300 hover:underline'
            }`}
          >
            <Icon name={downloadedCert ? 'check' : 'download'} className="w-4 h-4" />
            <span>
              {downloadedCert
                ? '¡Certificado Descargado!'
                : 'Descargar Certificado zaramagym-root-ca.crt'}
            </span>
          </button>
        </div>

        {/* Mini KPIs Operacionales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/60">
          <div className="bg-surface border border-border rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-txt-muted block">Vinculados</span>
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
              {serverStatus?.totalDevicesLinked ?? 0}
            </span>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-txt-muted block">Pendientes</span>
            <span className="text-xl font-black text-amber-600 dark:text-amber-400">
              {serverStatus?.totalDevicesPending ?? 0}
            </span>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-txt-muted block">Escaneos Hoy</span>
            <span className="text-xl font-black text-brand">
              {serverStatus?.totalScansToday ?? 0}
            </span>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 2. PANEL DE VINCULACIÓN DE NUEVO DISPOSITIVO (SOLO ADMINISTRADOR) */}
      {/* ==================================================================== */}
      {isManager && (
        <section
          aria-labelledby="pair-new-device-title"
          className="bg-surface border border-border rounded-xl p-6 shadow-xs flex flex-col gap-4"
        >
          <div>
            <h3 id="pair-new-device-title" className="text-base font-bold text-txt-primary flex items-center gap-2">
              <Icon name="plus" className="w-4 h-4 text-brand" />
              <span>Vincular Nuevo Dispositivo Móvil</span>
            </h3>
            <p className="text-xs text-txt-muted">
              Genera un código de enlace de 6 caracteres y código QR para emparejar un nuevo celular a la LAN.
            </p>
          </div>

          <form
            noValidate
            onSubmit={handleCreatePairingSubmit}
            onKeyDown={preventEnterKeySubmit}
            className="flex flex-col sm:flex-row gap-3"
          >
            <input
              type="text"
              required
              placeholder="Nombre del dispositivo (ej. iPhone Recepción Puerta 2)"
              value={newDeviceName}
              onChange={(e) => setNewDeviceName(e.target.value)}
              className="flex-1 bg-canvas border border-border rounded-lg px-3.5 py-2 text-sm text-txt-primary focus:outline-hidden focus:border-brand"
            />
            <button
              type="submit"
              disabled={isActionLoading || newDeviceName.trim().length < 3}
              className="bg-brand hover:bg-brand/90 text-brand-text font-bold text-xs px-5 py-2 rounded-lg transition-colors shadow-xs disabled:opacity-50 shrink-0"
            >
              {isActionLoading ? 'Generando...' : 'Generar Código de Enlace'}
            </button>
          </form>

          {/* Tarjeta Destacada de Emparejamiento Generado */}
          {activePairing && (
            <div className="mt-2 p-5 bg-gradient-to-r from-indigo-50 to-emerald-50 dark:from-indigo-950/30 dark:to-emerald-950/30 border-2 border-brand/50 rounded-xl flex flex-col sm:flex-row items-center gap-6 shadow-md relative">
              {/* Botón para descartar tarjeta */}
              <button
                type="button"
                onClick={clearActivePairing}
                aria-label="Cerrar tarjeta de vinculación"
                className="absolute top-2 right-2 text-txt-muted hover:text-txt-primary text-xs p-1"
                title="Cerrar tarjeta de vinculación"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>

              {/* Imagen del Código QR */}
              {effectivePairingQrSrc && (
                <div className="bg-white p-2.5 rounded-xl shadow-xs shrink-0 border border-slate-200">
                  <img
                    src={effectivePairingQrSrc}
                    alt={`QR de Vinculación para ${activePairing.nombreDispositivo}`}
                    className="w-40 h-40 object-contain"
                  />
                </div>
              )}

              {/* Información y Código Grande */}
              <div className="flex-1 flex flex-col gap-2 text-center sm:text-left">
                <span className="text-xs font-bold text-brand uppercase tracking-wider">
                  ¡Vinculación Creada con Éxito!
                </span>
                <h4 className="text-base font-extrabold text-txt-primary">
                  {activePairing.nombreDispositivo}
                </h4>

                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <span className="text-xs text-txt-secondary">Código Manual:</span>
                  <span className="font-mono text-2xl font-black text-txt-primary tracking-widest bg-surface px-3 py-1 rounded-lg border border-border shadow-xs">
                    {activePairing.codigoVinculacion}
                  </span>
                </div>

                <p className="text-xs text-txt-muted leading-relaxed">
                  Escanea este QR con la cámara de tu smartphone conectado al Wi-Fi del gimnasio (<span className="font-mono">{effectivePairingUrl}</span>) o ingresa el código manual en el navegador del teléfono. Válido por {activePairing.expiresInMinutes || 60} minutos.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenSimulatorWithCode(activePairing.codigoVinculacion)}
                    className="text-xs font-bold bg-brand text-brand-text px-3.5 py-1.5 rounded-lg hover:bg-brand/90 transition-colors shadow-xs"
                  >
                    Probar en Simulador Móvil con este Código
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(effectivePairingUrl)}
                    className="text-xs font-semibold bg-surface hover:bg-canvas-subtle border border-border px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Copiar URL Directa
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ==================================================================== */}
      {/* 3. TABLA DE DISPOSITIVOS MÓVILES REGISTRADOS                         */}
      {/* ==================================================================== */}
      <section
        aria-labelledby="registered-devices-title"
        className="bg-surface border border-border rounded-xl p-6 shadow-xs flex flex-col gap-4"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 id="registered-devices-title" className="text-base font-bold text-txt-primary flex items-center gap-2">
              <Icon name="smartphone" className="w-4 h-4 text-brand" />
              <span>Dispositivos Móviles Registrados</span>
            </h3>
            <p className="text-xs text-txt-muted">
              Control de smartphones iOS y Android autorizados para registro QR móvil LAN.
            </p>
          </div>

          {/* Filtros de Tabla */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Buscar por nombre, código o IP..."
              value={filter.busqueda || ''}
              onChange={(e) => setFilter((prev) => ({ ...prev, busqueda: e.target.value }))}
              className="bg-canvas border border-border rounded-lg px-3 py-1.5 text-xs text-txt-primary focus:outline-hidden focus:border-brand w-full sm:w-56"
            />

            <select
              value={filter.estadoVinculacion || ''}
              onChange={(e) =>
                setFilter((prev) => ({
                  ...prev,
                  estadoVinculacion: (e.target.value || undefined) as DevicePairingStatus | undefined,
                }))
              }
              className="bg-canvas border border-border rounded-lg px-2.5 py-1.5 text-xs text-txt-primary focus:outline-hidden"
            >
              <option value="">Todos los Estados</option>
              <option value="VINCULADO">Vinculados</option>
              <option value="PENDIENTE_VINCULACION">Pendientes</option>
              <option value="REVOCADO">Revocados</option>
            </select>

            <button
              type="button"
              onClick={() => {
                fetchDevices();
                fetchServerStatus();
              }}
              className="text-xs bg-canvas-subtle hover:bg-slate-200 dark:hover:bg-slate-700 border border-border px-3 py-1.5 rounded-lg transition-colors text-txt-primary font-medium inline-flex items-center gap-1.5"
            >
              <Icon name="refresh" className="w-3.5 h-3.5" />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* ESTADOS VISUALES OBLIGATORIOS (Loading / Empty / Error / Data) */}
        {isLoading ? (
          <ModuleSkeleton rows={4} label="Cargando dispositivos móviles LAN..." />
        ) : filteredDevices.length === 0 ? (
          <div className="py-12 border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-center p-6 gap-2">
            <Icon name="smartphone" className="w-8 h-8 text-txt-muted" />
            <h4 className="font-bold text-txt-primary text-sm">No se encontraron dispositivos móviles</h4>
            <p className="text-xs text-txt-muted max-w-md">
              {filter.busqueda || filter.estadoVinculacion
                ? 'Ningún dispositivo coincide con los criterios de búsqueda aplicados.'
                : 'Aún no has vinculado ningún teléfono móvil para escaneo LAN. Puedes generar un código arriba.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas-subtle text-txt-secondary uppercase tracking-wider font-bold border-b border-border">
                <tr>
                  <th className="py-3 px-4">Dispositivo</th>
                  <th className="py-3 px-4">Código Enlace</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">IP / User-Agent</th>
                  <th className="py-3 px-4">Último Acceso</th>
                  <th className="py-3 px-4 text-center">Escaneos</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDevices.map((dev) => {
                  const badge = getDeviceStatusBadge(dev.estadoVinculacion);
                  const isRevoked = dev.estadoVinculacion === 'REVOCADO';

                  return (
                    <tr key={dev.id} className="hover:bg-canvas-subtle/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-txt-primary">{dev.nombreDispositivo}</div>
                        <div className="text-[10px] text-txt-muted">
                          Registrado por {dev.creadoPorNombre} • {dev.createdAt}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-txt-primary">
                        {dev.codigoVinculacion}
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant={badge.variant} size="sm">
                          {badge.label}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-txt-secondary">
                        <div>{dev.ipUltimaConexion || 'Sin conexión'}</div>
                        {dev.userAgent && (
                          <div className="text-[10px] text-txt-muted truncate max-w-xs" title={dev.userAgent}>
                            {dev.userAgent}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-txt-secondary">
                        {dev.ultimoAccesoAt || 'Nunca'}
                      </td>

                      <td className="py-3 px-4 text-center font-bold text-txt-primary">
                        {dev.totalEscaneos}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botón para abrir simulador con este código si está pendiente */}
                          <button
                            type="button"
                            onClick={() => handleOpenSimulatorWithCode(dev.codigoVinculacion)}
                            className="text-[11px] font-semibold text-brand hover:underline px-2 py-1"
                            title="Abrir simulador con este dispositivo"
                          >
                            Simular
                          </button>

                          {/* Botón de Re-vinculación rápida cuando se perdió sesión en el móvil */}
                          {isManager && dev.estadoVinculacion === 'VINCULADO' && (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => handleReLinkDevice(dev.id, dev.nombreDispositivo)}
                              className="text-[11px] font-semibold text-accent-sky hover:underline px-2 py-1"
                              title="Revocar sesión previa y generar un nuevo código QR para este celular"
                            >
                              Re-vincular
                            </button>
                          )}

                          {/* Botón de Revocación (Solo Administrador) */}
                          {isManager && !isRevoked && (
                            revokeConfirmId === dev.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={isActionLoading}
                                  onClick={() => handleConfirmRevoke(dev.id)}
                                  className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-300 px-2 py-1 rounded"
                                >
                                  ¿Confirmar?
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRevokeConfirmId(null)}
                                  aria-label="Cancelar revocación"
                                  className="text-[10px] text-txt-muted hover:text-txt-primary px-1 py-1"
                                >
                                  <Icon name="x" className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRevokeConfirmId(dev.id)}
                                className="text-[11px] font-bold text-red-600 hover:text-red-700 hover:underline px-2 py-1"
                              >
                                Revocar
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ==================================================================== */}
      {/* 4. MODAL DEL SIMULADOR MÓVIL INTERACTIVO                             */}
      {/* ==================================================================== */}
      <MobileScannerSimulatorModal
        isOpen={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
        initialPairingCode={simulatorInitialCode}
        clients={clients}
      />

      {/* ==================================================================== */}
      {/* 5. MODAL DIDÁCTICO: GUÍA FIREWALL WINDOWS (:3443)                    */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isFirewallGuideOpen}
        onClose={() => setIsFirewallGuideOpen(false)}
        title="Guía Firewall Windows (:3443)"
        description="Habilita el tráfico TCP entrante en tu red local para que los celulares puedan conectarse al escáner móvil."
        size="lg"
        footer={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsFirewallGuideOpen(false)}
          >
            Cerrar Guía
          </Button>
        }
      >
        <div className="flex flex-col gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-canvas-subtle border border-border flex flex-col gap-1.5">
            <div className="flex items-center gap-2 font-bold text-txt-primary">
              <Icon name="terminal" className="w-4 h-4 text-brand" aria-hidden="true" />
              <span>Opción 1 (Automática en 1 clic)</span>
            </div>
            <p className="text-txt-secondary leading-relaxed">
              Ejecuta como Administrador el archivo{' '}
              <code className="font-mono font-semibold text-txt-primary bg-surface px-1.5 py-0.5 rounded border border-border">
                scripts/Instalar-Regla-Firewall-LAN.bat
              </code>{' '}
              incluido en la carpeta del proyecto para crear automáticamente la regla de entrada en el Firewall de Windows.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-canvas-subtle border border-border flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 font-bold text-txt-primary">
                <Icon name="shield" className="w-4 h-4 text-brand" aria-hidden="true" />
                <span>Opción 2 (Comando PowerShell como Administrador)</span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyFirewallCmd}
                leftIcon={
                  <Icon
                    name={copiedFirewallCmd ? 'check' : 'terminal'}
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  />
                }
              >
                {copiedFirewallCmd ? 'Comando Copiado' : 'Copiar Comando PowerShell'}
              </Button>
            </div>
            <pre className="p-3 rounded-lg bg-surface border border-border font-mono text-[11px] text-txt-primary whitespace-pre-wrap break-all select-all">
              {FIREWALL_POWERSHELL_CMD}
            </pre>
            <p className="text-[11px] text-txt-muted">
              Abre PowerShell como Administrador, pega el comando anterior y presiona Enter. Esto habilita únicamente el puerto TCP 3443 para tu subred local.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
