// ============================================================================
// COMPONENTE: VISTA PRINCIPAL SERVIDOR WI-FI LOCAL Y ESCÁNER MÓVIL (SLICE 6)
// Dashboard de Red Local, Certificado CA, Vinculación QR y Dispositivos
// Ubicación: src/features/lan/LanServerView.tsx
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Modal,
  ModuleSkeleton,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/primitives';
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

  const hostSelectOptions = useMemo(() => {
    const opts = availableIps.map((ip) => ({
      value: ip,
      label: `${ip}${
        ip === serverStatus?.primaryIp
          ? ' (IP Wi-Fi / Hotspot Recomendada)'
          : ' (IP Alternativa)'
      }`,
    }));
    if (mdnsHost) {
      opts.push({ value: mdnsHost, label: `${mdnsHost} (mDNS Local - Opcional)` });
    }
    return opts;
  }, [availableIps, serverStatus?.primaryIp, mdnsHost]);

  const deviceStatusFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos los Estados' },
      { value: 'VINCULADO', label: 'Vinculados' },
      { value: 'PENDIENTE_VINCULACION', label: 'Pendientes' },
      { value: 'REVOCADO', label: 'Revocados' },
    ],
    []
  );

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
      <Card
        padding="lg"
        className="gap-5"
        role="region"
        aria-labelledby="lan-server-status-title"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="w-11 h-11 rounded-lg bg-canvas-subtle text-brand flex items-center justify-center font-bold border border-border"
            >
              <Icon name="wifi" className="w-5 h-5" />
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsFirewallGuideOpen(true)}
              leftIcon={<Icon name="shield" className="w-4 h-4 text-brand" />}
            >
              Guía Firewall Windows
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSimulatorInitialCode('');
                setSimulatorOpen(true);
              }}
              leftIcon={<Icon name="smartphone" className="w-4 h-4" />}
              className="text-brand border-brand/40 hover:bg-brand/10"
            >
              Simular Vista Móvil
            </Button>

            {isManager ? (
              serverStatus?.isRunning ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={isActionLoading}
                  onClick={() => toggleServer(false)}
                >
                  {isActionLoading ? 'Deteniendo...' : 'Detener Servidor'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isActionLoading}
                  onClick={() => toggleServer(true)}
                >
                  {isActionLoading ? 'Iniciando...' : 'Iniciar Servidor'}
                </Button>
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
          <Alert variant="danger" floating={false} onClose={clearError}>
            {error}
          </Alert>
        )}

        {/* Grilla de Datos de Conexión LAN */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-canvas-subtle p-3.5 rounded-xl border border-border text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-txt-muted block">IP Primaria & Puerto</span>
            <span className="font-mono font-bold text-txt-primary">
              {primaryIp}:{activePort}
            </span>
            {serverStatus && (
              <div className="mt-1.5">
                <Select
                  selectSize="sm"
                  aria-label="Seleccionar adaptador de red LAN"
                  value={activeTargetHost}
                  onChange={(e) => setSelectedHost(e.target.value)}
                  options={hostSelectOptions}
                  className="text-[11px] font-mono py-1"
                />
              </div>
            )}
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-txt-muted block">Host mDNS Local</span>
            <span className="font-mono font-semibold text-txt-primary block">
              {mdnsHost}:{activePort}
            </span>
            {serverStatus?.mdnsActive && (
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-status-success">
                <span className="w-1.5 h-1.5 rounded-full bg-status-success" aria-hidden="true" />
                <span>Activo (Conserva sesión en Hotspot)</span>
              </span>
            )}
          </div>

          <div className="sm:col-span-2 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-bold text-txt-muted block">URL Escáner Móvil</span>
              {serverStatus && (
                <div className="inline-flex rounded border border-border bg-surface p-0.5 text-[10px] gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={pairingProtocol === 'https' ? 'primary' : 'ghost'}
                    onClick={() => setPairingProtocol('https')}
                    className="min-h-0 h-6 px-2 py-0.5 text-[10px] font-bold"
                  >
                    HTTPS (Cámara)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={pairingProtocol === 'http' ? 'secondary' : 'ghost'}
                    onClick={() => setPairingProtocol('http')}
                    className={
                      pairingProtocol === 'http'
                        ? 'min-h-0 h-6 px-2 py-0.5 text-[10px] font-bold bg-status-warning text-txt-inverse border-transparent hover:opacity-90'
                        : 'min-h-0 h-6 px-2 py-0.5 text-[10px] font-bold'
                    }
                  >
                    HTTP
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-xs text-brand font-medium truncate">
                {mobileScannerDisplayUrl}
              </span>
              {serverStatus && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopyUrl(mobileScannerDisplayUrl)}
                  leftIcon={<Icon name={copiedUrl ? 'check' : 'audit'} className="w-3.5 h-3.5" />}
                  className="shrink-0 min-h-0 h-7 px-2 py-0.5 text-[11px]"
                >
                  {copiedUrl ? '¡Copiado!' : 'Copiar'}
                </Button>
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
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={handleDownloadCaCert}
            disabled={!serverStatus?.caCertPem}
            leftIcon={<Icon name={downloadedCert ? 'check' : 'download'} className="w-4 h-4" />}
            className={
              downloadedCert
                ? 'shrink-0 text-status-success text-xs font-semibold'
                : 'shrink-0 text-brand text-xs font-semibold'
            }
          >
            {downloadedCert
              ? '¡Certificado Descargado!'
              : 'Descargar Certificado zaramagym-root-ca.crt'}
          </Button>
        </div>

        {/* Mini KPIs Operacionales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/60">
          <div className="bg-surface border border-border rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-txt-muted block">Vinculados</span>
            <span className="text-xl font-black text-status-success">
              {serverStatus?.totalDevicesLinked ?? 0}
            </span>
          </div>
          <div className="bg-surface border border-border rounded-lg p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-txt-muted block">Pendientes</span>
            <span className="text-xl font-black text-status-warning">
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
      </Card>

      {/* ==================================================================== */}
      {/* 2. PANEL DE VINCULACIÓN DE NUEVO DISPOSITIVO (SOLO ADMINISTRADOR) */}
      {/* ==================================================================== */}
      {isManager && (
        <Card
          padding="lg"
          className="gap-4"
          role="region"
          aria-labelledby="pair-new-device-title"
        >
          <div>
            <h3 id="pair-new-device-title" className="text-base font-bold text-txt-primary flex items-center gap-2">
              <Icon name="plus" className="w-4 h-4 text-brand" aria-hidden="true" />
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
            className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
          >
            <div className="flex-1 min-w-0">
              <Input
                type="text"
                required
                aria-label="Nombre del dispositivo móvil"
                placeholder="Nombre del dispositivo (ej. iPhone Recepción Puerta 2)"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isActionLoading || newDeviceName.trim().length < 3}
              className="shrink-0"
            >
              {isActionLoading ? 'Generando...' : 'Generar Código de Enlace'}
            </Button>
          </form>

          {/* Tarjeta Destacada de Emparejamiento Generado */}
          {activePairing && (
            <div className="mt-2 p-4 sm:p-5 bg-canvas-subtle border border-brand/40 rounded-lg flex flex-col sm:flex-row items-center gap-5 shadow-xs relative">
              {/* Botón para descartar tarjeta */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearActivePairing}
                aria-label="Cerrar tarjeta de vinculación"
                title="Cerrar tarjeta de vinculación"
                className="absolute top-2 right-2 min-h-[28px] min-w-[28px] p-1"
              >
                <Icon name="x" className="w-4 h-4" />
              </Button>

              {/* Imagen del Código QR */}
              {effectivePairingQrSrc && (
                <div className="bg-white p-2.5 rounded-xl shadow-xs shrink-0 border border-border">
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
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenSimulatorWithCode(activePairing.codigoVinculacion)}
                  >
                    Probar en Simulador Móvil con este Código
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopyUrl(effectivePairingUrl)}
                  >
                    Copiar URL Directa
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ==================================================================== */}
      {/* 3. TABLA DE DISPOSITIVOS MÓVILES REGISTRADOS                         */}
      {/* ==================================================================== */}
      <Card
        padding="lg"
        className="gap-4"
        role="region"
        aria-labelledby="registered-devices-title"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 id="registered-devices-title" className="text-base font-bold text-txt-primary flex items-center gap-2">
              <Icon name="smartphone" className="w-4 h-4 text-brand" aria-hidden="true" />
              <span>Dispositivos Móviles Registrados</span>
            </h3>
            <p className="text-xs text-txt-muted">
              Control de smartphones iOS y Android autorizados para registro QR móvil LAN.
            </p>
          </div>

          {/* Filtros de Tabla */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="w-full sm:w-56">
              <Input
                type="text"
                inputSize="sm"
                aria-label="Buscar dispositivos por nombre, código o IP"
                placeholder="Buscar por nombre, código o IP..."
                value={filter.busqueda || ''}
                onChange={(e) => setFilter((prev) => ({ ...prev, busqueda: e.target.value }))}
              />
            </div>

            <div className="w-full sm:w-40">
              <Select
                selectSize="sm"
                aria-label="Filtrar dispositivos por estado"
                value={filter.estadoVinculacion || ''}
                onChange={(e) =>
                  setFilter((prev) => ({
                    ...prev,
                    estadoVinculacion: (e.target.value || undefined) as
                      | DevicePairingStatus
                      | undefined,
                  }))
                }
                options={deviceStatusFilterOptions}
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                fetchDevices();
                fetchServerStatus();
              }}
              leftIcon={<Icon name="refresh" className="w-3.5 h-3.5" />}
            >
              Actualizar
            </Button>
          </div>
        </div>

        {/* ESTADOS VISUALES OBLIGATORIOS (Loading / Empty / Error / Data) */}
        {isLoading ? (
          <ModuleSkeleton rows={4} label="Cargando dispositivos móviles LAN..." />
        ) : filteredDevices.length === 0 ? (
          <div className="py-12 border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-center p-6 gap-2">
            <Icon name="smartphone" className="w-8 h-8 text-txt-muted" aria-hidden="true" />
            <h4 className="font-bold text-txt-primary text-sm">No se encontraron dispositivos móviles</h4>
            <p className="text-xs text-txt-muted max-w-md">
              {filter.busqueda || filter.estadoVinculacion
                ? 'Ningún dispositivo coincide con los criterios de búsqueda aplicados.'
                : 'Aún no has vinculado ningún teléfono móvil para escaneo LAN. Puedes generar un código arriba.'}
            </p>
          </div>
        ) : (
          <Table
            containerLabel="Dispositivos móviles registrados"
            containerClassName="rounded-lg"
            className="text-xs"
          >
            <TableHeader stickyHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Dispositivo</TableHead>
                <TableHead>Código Enlace</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>IP / User-Agent</TableHead>
                <TableHead>Último Acceso</TableHead>
                <TableHead className="text-center">Escaneos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map((dev) => {
                const badge = getDeviceStatusBadge(dev.estadoVinculacion);
                const isRevoked = dev.estadoVinculacion === 'REVOCADO';

                return (
                  <TableRow key={dev.id}>
                    <TableCell>
                      <div className="font-bold text-txt-primary">{dev.nombreDispositivo}</div>
                      <div className="text-[10px] text-txt-muted">
                        Registrado por {dev.creadoPorNombre} • {dev.createdAt}
                      </div>
                    </TableCell>

                    <TableCell className="font-mono font-bold">
                      {dev.codigoVinculacion}
                    </TableCell>

                    <TableCell>
                      <Badge variant={badge.variant} size="sm">
                        {badge.label}
                      </Badge>
                    </TableCell>

                    <TableCell className="font-mono text-[11px] text-txt-secondary">
                      <div>{dev.ipUltimaConexion || 'Sin conexión'}</div>
                      {dev.userAgent && (
                        <div className="text-[10px] text-txt-muted truncate max-w-xs" title={dev.userAgent}>
                          {dev.userAgent}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-txt-secondary">
                      {dev.ultimoAccesoAt || 'Nunca'}
                    </TableCell>

                    <TableCell className="text-center font-bold">
                      {dev.totalEscaneos}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          onClick={() => handleOpenSimulatorWithCode(dev.codigoVinculacion)}
                          className="text-[11px] font-semibold px-2 py-1"
                          title="Abrir simulador con este dispositivo"
                        >
                          Simular
                        </Button>

                        {isManager && dev.estadoVinculacion === 'VINCULADO' && (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            disabled={isActionLoading}
                            onClick={() => handleReLinkDevice(dev.id, dev.nombreDispositivo)}
                            className="text-[11px] font-semibold text-accent-sky px-2 py-1"
                            title="Revocar sesión previa y generar un nuevo código QR para este celular"
                          >
                            Re-vincular
                          </Button>
                        )}

                        {isManager &&
                          !isRevoked &&
                          (revokeConfirmId === dev.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                disabled={isActionLoading}
                                onClick={() => handleConfirmRevoke(dev.id)}
                                className="min-h-0 h-7 text-[10px] font-bold px-2 py-1"
                              >
                                ¿Confirmar?
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setRevokeConfirmId(null)}
                                aria-label="Cancelar revocación"
                                className="min-h-[28px] min-w-[28px] p-1"
                              >
                                <Icon name="x" className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              onClick={() => setRevokeConfirmId(dev.id)}
                              className="text-[11px] font-bold text-status-danger px-2 py-1"
                            >
                              Revocar
                            </Button>
                          ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

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
