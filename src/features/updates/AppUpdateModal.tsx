// ============================================================================
// COMPONENTE: MODAL DE ACTUALIZACIÓN REMOTA SEGURA (SLICE R3 - TAURI UPDATER)
// Flujo protegido: Verificación Ed25519 -> Guardia Caja Cerrada ->
// Backup Preventivo VACUUM INTO -> Cierre Limpio -> Descarga/Instalación -> Reinicio
// Ubicación: src/features/updates/AppUpdateModal.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Modal } from '../../components/primitives/Modal';
import { formatBytes } from '../../domain/printingBackup';
import { authIpc } from '../../services/ipc/authIpc';
import {
  AvailableAppUpdate,
  CURRENT_APP_VERSION,
  checkForAppUpdate,
  relaunchAppAfterUpdate,
} from '../../services/updater/appUpdater';
import { SafeUpdatePreparationDto } from '../../types/auth';

export interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUpdate?: AvailableAppUpdate | null;
  onUpdateFound?: (update: AvailableAppUpdate | null) => void;
  onGoToPos?: () => void;
}

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'available'
  | 'preparing_backup'
  | 'downloading'
  | 'installing'
  | 'error';

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  isOpen,
  onClose,
  initialUpdate = null,
  onUpdateFound,
  onGoToPos,
}) => {
  const [phase, setPhase] = useState<UpdatePhase>(initialUpdate ? 'available' : 'idle');
  const [availableUpdate, setAvailableUpdate] = useState<AvailableAppUpdate | null>(initialUpdate);
  const [backupPrep, setBackupPrep] = useState<SafeUpdatePreparationDto | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCashShiftBlocked, setIsCashShiftBlocked] = useState(false);

  const isBusy =
    phase === 'checking' ||
    phase === 'preparing_backup' ||
    phase === 'downloading' ||
    phase === 'installing';

  useEffect(() => {
    if (!isOpen) return;

    if (initialUpdate) {
      setAvailableUpdate(initialUpdate);
      setPhase('available');
      setErrorMessage(null);
      setIsCashShiftBlocked(false);
    } else if (phase === 'idle') {
      void handleCheckUpdates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialUpdate]);

  const handleCheckUpdates = async () => {
    setPhase('checking');
    setErrorMessage(null);
    setIsCashShiftBlocked(false);
    setBackupPrep(null);

    try {
      const found = await checkForAppUpdate();
      setAvailableUpdate(found);
      onUpdateFound?.(found);
      if (found) {
        setPhase('available');
      } else {
        setPhase('up_to_date');
      }
    } catch (err: unknown) {
      const rawMsg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err || '');
      setErrorMessage(
        rawMsg
          ? `No se pudo verificar actualizaciones en este momento (verifica tu conexión a Internet o intenta más tarde). Detalle: ${rawMsg}`
          : 'No se pudo conectar al servidor de actualizaciones. Verifica tu conexión a Internet e intenta nuevamente.'
      );
      setPhase('error');
    }
  };

  const handleInstallUpdate = async () => {
    if (!availableUpdate || isBusy) return;

    setErrorMessage(null);
    setIsCashShiftBlocked(false);
    setDownloadedBytes(0);
    setTotalBytes(null);
    setPhase('preparing_backup');

    let runtimeMarkedClean = false;

    try {
      // 1. Validar caja cerrada + Backup preventivo VACUUM INTO + Cierre limpio (APP_RUNTIME_RUNNING = "0")
      const prep = await authIpc.prepareSafeAppUpdate(availableUpdate.version);
      runtimeMarkedClean = true;
      setBackupPrep(prep);

      // 2. Descargar paquete firmado Ed25519 e instalar en modo pasivo NSIS
      setPhase('downloading');
      await availableUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setTotalBytes(event.data.contentLength ?? null);
          setDownloadedBytes(0);
        } else if (event.event === 'Progress') {
          setDownloadedBytes((prev) => prev + event.data.chunkLength);
        } else if (event.event === 'Finished') {
          setPhase('installing');
        }
      });

      // 3. Reiniciar ZaramaGYM con la nueva versión ya instalada
      setPhase('installing');
      await relaunchAppAfterUpdate();
    } catch (err: unknown) {
      if (runtimeMarkedClean) {
        try {
          await authIpc.restoreRuntimeAfterFailedUpdate();
        } catch {
          // Continuar de forma segura
        }
      }

      const rawMsg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err || 'Error inesperado al preparar o descargar la actualización.');

      const blockedByShift =
        rawMsg.includes('Turno de Caja #') || rawMsg.includes('Arqueo y Cierre de Caja');
      setIsCashShiftBlocked(blockedByShift);
      setErrorMessage(rawMsg);
      setPhase('error');
    }
  };

  const progressPercent =
    totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isBusy) onClose();
      }}
      title="Actualizaciones Remotas de ZaramaGYM"
      description="Sistema oficial de soporte y actualización segura firmada digitalmente."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <span className="text-[11px] font-mono text-txt-muted">
            Versión instalada: v{availableUpdate?.currentVersion || CURRENT_APP_VERSION}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {!isBusy && (
              <Button type="button" variant="secondary" onClick={onClose}>
                Cerrar
              </Button>
            )}

            {isCashShiftBlocked && onGoToPos && (
              <Button
                type="button"
                variant="danger"
                leftIcon={<Icon name="cash" className="w-4 h-4" />}
                onClick={() => {
                  onClose();
                  onGoToPos();
                }}
              >
                Ir a Caja para Arqueo y Cierre
              </Button>
            )}

            {!isBusy && phase !== 'available' && (
              <Button
                type="button"
                variant="primary"
                leftIcon={<Icon name="refresh" className="w-4 h-4" />}
                onClick={handleCheckUpdates}
              >
                Buscar Actualizaciones
              </Button>
            )}

            {phase === 'available' && availableUpdate && (
              <Button
                type="button"
                variant="primary"
                leftIcon={<Icon name="download" className="w-4 h-4" />}
                onClick={handleInstallUpdate}
              >
                Respaldar BD y Actualizar a v{availableUpdate.version}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Garantía permanente de datos, correos y Drive */}
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-status-success-bg/70 border border-status-success/30 text-xs text-txt-primary">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-status-success/15 text-status-success shrink-0">
            <Icon name="shield" className="w-4 h-4" />
          </span>
          <div className="flex flex-col gap-1 leading-relaxed">
            <span className="font-bold text-status-success">
              Tus datos y configuraciones quedan 100% protegidos
            </span>
            <p className="text-txt-secondary">
              Al actualizar se conserva intacta tu base de datos SQLite (clientes, ventas, cajas), tu
              vinculación de <strong>Gmail</strong>, <strong>Google Drive</strong> (llavero de Windows)
              y tus celulares escáneres. Además se crea automáticamente un respaldo preventivo previo.
            </p>
          </div>
        </div>

        {/* Estado: Buscando */}
        {phase === 'checking' && (
          <div className="p-4 rounded-xl bg-canvas-subtle border border-border flex items-center gap-3 text-xs text-txt-primary">
            <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse shrink-0" />
            <span>Consultando versión oficial más reciente en GitHub Releases...</span>
          </div>
        )}

        {/* Estado: Al día */}
        {phase === 'up_to_date' && (
          <div className="p-4 rounded-xl bg-canvas-subtle border border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-status-success-bg text-status-success border border-status-success/30">
                <Icon name="check" className="w-5 h-5" />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-txt-primary">
                  ZaramaGYM está actualizado al día
                </span>
                <span className="text-xs text-txt-muted">
                  Estás ejecutando la versión oficial más reciente (v{CURRENT_APP_VERSION}).
                </span>
              </div>
            </div>
            <Badge variant="success" size="sm">
              Al día
            </Badge>
          </div>
        )}

        {/* Estado: Nueva versión disponible */}
        {phase === 'available' && availableUpdate && (
          <div className="p-4 rounded-xl bg-canvas-subtle border border-brand/40 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon name="sparkles" className="w-4 h-4 text-brand" />
                <span className="text-sm font-bold text-txt-primary">
                  Nueva versión v{availableUpdate.version} disponible
                </span>
              </div>
              <Badge variant="success" size="sm">
                Firma Ed25519 Verificada
              </Badge>
            </div>

            {availableUpdate.date && (
              <span className="text-[11px] font-mono text-txt-muted">
                Publicada: {availableUpdate.date}
              </span>
            )}

            {availableUpdate.body && (
              <div className="p-3 rounded-lg bg-surface border border-border text-xs text-txt-secondary whitespace-pre-wrap max-h-40 overflow-y-auto">
                {availableUpdate.body}
              </div>
            )}

            <p className="text-[11px] text-txt-muted">
              Nota: Asegúrate de haber cerrado el turno de caja actual antes de iniciar. La aplicación
              se reiniciará automáticamente al finalizar.
            </p>
          </div>
        )}

        {/* Estados activos de instalación: Respaldo -> Descarga -> Instalación */}
        {(phase === 'preparing_backup' || phase === 'downloading' || phase === 'installing') && (
          <div className="p-4 rounded-xl bg-canvas-subtle border border-border flex flex-col gap-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-txt-primary flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse" />
                {phase === 'preparing_backup' && 'Paso 1/3: Validando caja cerrada y creando respaldo preventivo...'}
                {phase === 'downloading' && 'Paso 2/3: Descargando paquete oficial firmado...'}
                {phase === 'installing' && 'Paso 3/3: Aplicando actualización y reiniciando ZaramaGYM...'}
              </span>
              {progressPercent !== null && (
                <span className="font-mono font-bold text-brand">{progressPercent}%</span>
              )}
            </div>

            {backupPrep && (
              <div className="flex items-center gap-2 text-[11px] text-status-success bg-status-success-bg/60 border border-status-success/25 rounded-lg px-3 py-2">
                <Icon name="database" className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  Respaldo verificado: <strong>{backupPrep.backup_filename}</strong> (
                  {formatBytes(backupPrep.backup_size_bytes)})
                </span>
              </div>
            )}

            {phase === 'downloading' && (
              <div className="flex flex-col gap-1">
                <div className="w-full h-2.5 rounded-full bg-surface border border-border overflow-hidden">
                  <div
                    className="h-full bg-brand transition-all duration-150"
                    style={{ width: `${progressPercent ?? 35}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono text-txt-muted">
                  {formatBytes(downloadedBytes)}
                  {totalBytes ? ` / ${formatBytes(totalBytes)}` : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Estado: Error o Bloqueo por Caja Abierta */}
        {phase === 'error' && errorMessage && (
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-status-danger-bg border border-status-danger/30 text-xs text-status-danger">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-status-danger/15 shrink-0">
              <Icon name="warning" className="w-4 h-4" />
            </span>
            <div className="flex flex-col gap-1 leading-relaxed">
              <span className="font-bold uppercase tracking-wide">
                {isCashShiftBlocked
                  ? 'Actualización Bloqueada por Caja Abierta'
                  : 'No se pudo completar la actualización'}
              </span>
              <p className="text-txt-primary font-medium">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
