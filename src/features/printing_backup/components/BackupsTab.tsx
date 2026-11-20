// ============================================================================
// COMPONENTE: PESTAÑA RESPALDOS SQLITE (VACUUM INTO), INTEGRIDAD Y GOOGLE DRIVE
// Ubicación: src/features/printing_backup/components/BackupsTab.tsx
// ============================================================================

import React, { useId, useRef, useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { Input } from '../../../components/primitives/Input';
import { Modal } from '../../../components/primitives/Modal';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/primitives/Table';
import { fileToBase64, formatBytes } from '../../../domain/printingBackup';
import { normalizeAppError } from '../../../services/ipc/client';
import { printingBackupIpc } from '../../../services/ipc/printingBackupIpc';
import { preventEnterKeySubmit, sanitizeIntegerInput } from '../../../utils/formSafety';
import {
  BackupIntegrityReport,
  BackupRecord,
  PrintingBackupConfigDto,
  RestoreDatabaseRequest,
  RestoreDatabaseResult,
  UpdatePrintingBackupConfigRequest,
} from '../../../types/printingBackup';

function extractRestoreErrorMessage(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string' &&
    (err as { message: string }).message.trim().length > 0
  ) {
    return (err as { message: string }).message;
  }
  return normalizeAppError(err).message;
}

export interface BackupsTabProps {
  backups: BackupRecord[];
  integrityReports: Record<number, BackupIntegrityReport>;
  config: PrintingBackupConfigDto | null;
  isAdmin: boolean;
  isLoading: boolean;
  isActionLoading: boolean;
  onCreateBackup: () => Promise<BackupRecord>;
  onVerifyBackup: (backupId: number) => Promise<BackupIntegrityReport>;
  onExportDatabase: (targetPath: string) => Promise<BackupRecord>;
  onSyncGdrive: (backupId: number) => Promise<BackupRecord>;
  onUpdateConfig: (
    req: UpdatePrintingBackupConfigRequest
  ) => Promise<PrintingBackupConfigDto>;
  onRestoreDatabase?: (
    req: RestoreDatabaseRequest
  ) => Promise<RestoreDatabaseResult>;
  onDatabaseRestored?: (result: RestoreDatabaseResult) => void;
  onRefresh: () => void;
}

export const BackupsTab: React.FC<BackupsTabProps> = ({
  backups,
  integrityReports,
  config,
  isAdmin,
  isLoading,
  isActionLoading,
  onCreateBackup,
  onVerifyBackup,
  onExportDatabase,
  onSyncGdrive,
  onUpdateConfig,
  onRestoreDatabase,
  onDatabaseRestored,
  onRefresh,
}) => {
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'danger';
    message: string;
  } | null>(null);
  const [restoreSuccess, setRestoreSuccess] =
    useState<RestoreDatabaseResult | null>(null);

  // Form State para Exportación Local
  const [exportPath, setExportPath] = useState('');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  // State para Modal Crítico de Restauración (Semáforo Rojo)
  const restoreFileInputId = useId();
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(
    null
  );
  const [restoreFileBase64, setRestoreFileBase64] = useState<string | null>(
    null
  );
  const [isReadingRestoreFile, setIsReadingRestoreFile] = useState(false);
  const [restoreSourcePath, setRestoreSourcePath] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Form State para Configuración Cloud / Drive
  const [gdriveEnabled, setGdriveEnabled] = useState(
    config?.backup_gdrive_enabled ?? false
  );
  const [gdriveFolderId, setGdriveFolderId] = useState(
    config?.backup_gdrive_folder_id || ''
  );
  const [gdriveClientId, setGdriveClientId] = useState(
    config?.backup_gdrive_client_id || ''
  );
  const [gdriveClientSecret, setGdriveClientSecret] = useState('');
  const [gdriveToken, setGdriveToken] = useState('');
  const [intervalHours, setIntervalHours] = useState(
    config?.backup_auto_interval_hours || 2
  );
  const [isCloudGuideOpen, setIsCloudGuideOpen] = useState(false);

  // Modal para Reporte de Integridad
  const [selectedReportBackupId, setSelectedReportBackupId] = useState<
    number | null
  >(null);

  React.useEffect(() => {
    if (config) {
      setGdriveEnabled(config.backup_gdrive_enabled);
      setGdriveFolderId(config.backup_gdrive_folder_id);
      setGdriveClientId(config.backup_gdrive_client_id || '');
      setIntervalHours(config.backup_auto_interval_hours);
    }
  }, [config]);

  // Si no es Administrador, mostrar banner informativo claro
  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <Alert
          variant="warning"
          title="Módulo Exclusivo del Administrador"
          floating={false}
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs">
              La creación de respaldos SQLite en caliente con VACUUM INTO, la exportación de archivos de base de datos a unidades externas y la sincronización con Google Drive están restringidas por seguridad al rol <strong>ADMINISTRADOR</strong>.
            </p>
            <p className="text-xs text-txt-muted">
              Si requieres generar una copia de seguridad urgente o verificar el estado de los respaldos, contacta al Administrador de ZaramaGYM.
            </p>
          </div>
        </Alert>
      </div>
    );
  }

  const handleCreateHotBackup = async () => {
    try {
      const rec = await onCreateBackup();
      setFeedback({
        type: 'success',
        message: `Respaldo en caliente generado exitosamente: ${rec.nombre_archivo} (${formatBytes(rec.tamano_bytes)}).`,
      });
    } catch {
      // Error manejado en hook
    }
  };

  const handlePickExportFolder = async () => {
    setIsPickingFolder(true);
    try {
      const folder = await printingBackupIpc.pickExportFolder();
      if (folder && folder.trim()) {
        const cleanFolder = folder.trim().replace(/[\\/]+$/, '');
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        setExportPath(`${cleanFolder}\\zaramagym_export_${today}.db`);
      }
    } catch {
      // Ignorar si el usuario cancela o si el entorno de test no abre diálogo
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleExportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportPath.trim()) return;

    try {
      const rec = await onExportDatabase(exportPath.trim());
      setFeedback({
        type: 'success',
        message: `Base de datos exportada correctamente a: ${rec.ruta_local}`,
      });
      setIsExportModalOpen(false);
      setExportPath('');
    } catch {
      // Error manejado en hook
    }
  };

  const handleSaveDriveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onUpdateConfig({
        backup_gdrive_enabled: gdriveEnabled,
        backup_gdrive_folder_id: gdriveFolderId,
        backup_auto_interval_hours: Number(intervalHours) || 2,
        backup_gdrive_client_id: gdriveClientId.trim(),
        backup_gdrive_client_secret: gdriveClientSecret.trim()
          ? gdriveClientSecret.trim()
          : null,
        backup_gdrive_token: gdriveToken.trim() ? gdriveToken.trim() : null,
      });

      setFeedback({
        type: 'success',
        message: 'Configuración de respaldos en Google Drive guardada exitosamente.',
      });
      setGdriveToken('');
      setGdriveClientSecret('');
    } catch {
      // Error manejado en hook
    }
  };

  const handleVerify = async (id: number) => {
    try {
      await onVerifyBackup(id);
      setSelectedReportBackupId(id);
    } catch {
      // Error manejado en hook
    }
  };

  const handleSyncDrive = async (id: number) => {
    try {
      const rec = await onSyncGdrive(id);
      setFeedback({
        type: 'success',
        message: `Respaldo sincronizado con Google Drive exitosamente (ID: ${rec.drive_file_id || 'OK'}).`,
      });
    } catch {
      // Error manejado en hook
    }
  };

  const resetRestoreFormState = () => {
    setSelectedRestoreFile(null);
    setRestoreFileBase64(null);
    setIsReadingRestoreFile(false);
    setRestoreSourcePath('');
    setRestoreError(null);
    if (restoreFileInputRef.current) {
      restoreFileInputRef.current.value = '';
    }
  };

  const handleOpenRestoreModal = () => {
    resetRestoreFormState();
    setIsRestoreModalOpen(true);
  };

  const handleCloseRestoreModal = () => {
    if (isActionLoading || isRestoring || isReadingRestoreFile) return;
    setIsRestoreModalOpen(false);
    resetRestoreFormState();
  };

  const handleClearSelectedRestoreFile = () => {
    setSelectedRestoreFile(null);
    setRestoreFileBase64(null);
    setRestoreError(null);
    if (restoreFileInputRef.current) {
      restoreFileInputRef.current.value = '';
    }
  };

  const handleRestoreFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    setRestoreError(null);

    if (!file) {
      setSelectedRestoreFile(null);
      setRestoreFileBase64(null);
      return;
    }

    setSelectedRestoreFile(file);
    setRestoreFileBase64(null);
    setIsReadingRestoreFile(true);

    try {
      const base64 = await fileToBase64(file);
      setRestoreFileBase64(base64);
    } catch (err) {
      setSelectedRestoreFile(null);
      setRestoreFileBase64(null);
      setRestoreError(extractRestoreErrorMessage(err));
    } finally {
      setIsReadingRestoreFile(false);
    }
  };

  const hasSelectedRestoreFile = Boolean(
    selectedRestoreFile && restoreFileBase64
  );
  const hasRestoreSourcePath = Boolean(restoreSourcePath.trim());
  const isBusyRestoring = isActionLoading || isRestoring;
  const canConfirmRestore =
    (hasSelectedRestoreFile || hasRestoreSourcePath) &&
    !isReadingRestoreFile &&
    !isBusyRestoring;

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirmRestore || !onRestoreDatabase) return;

    setRestoreError(null);
    setIsRestoring(true);

    const request: RestoreDatabaseRequest = hasSelectedRestoreFile
      ? {
          file_bytes_base64: restoreFileBase64,
          file_name: selectedRestoreFile?.name ?? null,
          source_path: null,
        }
      : {
          source_path: restoreSourcePath.trim(),
          file_bytes_base64: null,
          file_name: null,
        };

    try {
      const result = await onRestoreDatabase(request);
      setRestoreSuccess(result);
      setFeedback(null);
      setIsRestoreModalOpen(false);
      resetRestoreFormState();
      onDatabaseRestored?.(result);
    } catch (err) {
      setRestoreError(extractRestoreErrorMessage(err));
    } finally {
      setIsRestoring(false);
    }
  };

  const activeIntegrityReport =
    selectedReportBackupId !== null
      ? integrityReports[selectedReportBackupId]
      : null;

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <Alert
          variant={feedback.type}
          title={feedback.type === 'success' ? 'Operación Exitosa' : 'Aviso'}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {restoreSuccess && (
        <Alert
          variant="success"
          title="Base de Datos Restaurada Exitosamente"
          onClose={() => setRestoreSuccess(null)}
        >
          <div className="flex flex-col gap-1">
            <p className="font-medium">{restoreSuccess.message}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] pt-0.5">
              <span>
                Origen:{' '}
                <strong className="font-mono">{restoreSuccess.restored_from}</strong>
              </span>
              <span>
                Tablas verificadas:{' '}
                <strong>{restoreSuccess.found_tables_count}</strong>
              </span>
              <span>
                SHA-256:{' '}
                <strong className="font-mono">{restoreSuccess.sha256_checksum}</strong>
              </span>
            </div>
            {restoreSuccess.pre_restore_backup_path && (
              <p className="text-[11px] opacity-90">
                Respaldo de seguridad previo:{' '}
                <span className="font-mono">
                  {restoreSuccess.pre_restore_backup_path}
                </span>
              </p>
            )}
          </div>
        </Alert>
      )}

      {/* Panel Superior: Acciones Rápidas de Respaldo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-surface p-5 rounded-xl border border-border shadow-sm flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Icon name="database" className="w-5 h-5 text-brand" aria-hidden="true" />
              <h3 className="font-bold text-sm text-txt-primary">
                Respaldo en Caliente con VACUUM INTO
              </h3>
            </div>
            <p className="text-xs text-txt-muted">
              Genera una copia compactada y 100% consistente de SQLite en modo WAL sin bloquear lectores ni escritores concurrentes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              type="button"
              variant="primary"
              onClick={handleCreateHotBackup}
              isLoading={isActionLoading}
              disabled={isLoading}
              leftIcon={<Icon name="database" className="w-4 h-4" aria-hidden="true" />}
            >
              Crear Respaldo Ahora (VACUUM INTO)
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExportModalOpen(true)}
              disabled={isActionLoading || isLoading}
              leftIcon={<Icon name="upload" className="w-4 h-4" aria-hidden="true" />}
            >
              Exportar .db a Ruta Local / USB
            </Button>

            <Button
              type="button"
              variant="danger"
              onClick={handleOpenRestoreModal}
              disabled={isActionLoading || isLoading}
              leftIcon={<Icon name="warning" className="w-4 h-4" aria-hidden="true" />}
            >
              Restaurar Base de Datos
            </Button>
          </div>
        </div>

        {/* Configuración de Sincronización Google Drive */}
        <form
          noValidate
          onSubmit={handleSaveDriveConfig}
          onKeyDown={preventEnterKeySubmit}
          className="lg:col-span-6 bg-surface p-5 rounded-xl border border-border shadow-sm flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Icon name="cloud" className="w-5 h-5 text-brand" aria-hidden="true" />
              <h3 className="font-bold text-sm text-txt-primary">
                Sincronización Cloud (Google Drive)
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {config?.has_gdrive_client_secret_configured && (
                <Badge variant="success" size="sm">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="lock" className="w-3 h-3" aria-hidden="true" />
                    Secret en Keyring
                  </span>
                </Badge>
              )}
              {config?.has_gdrive_token_configured && (
                <Badge variant="success" size="sm">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="lock" className="w-3 h-3" aria-hidden="true" />
                    Token en Keyring
                  </span>
                </Badge>
              )}
              <Badge variant={gdriveEnabled ? 'success' : 'default'} size="sm">
                {gdriveEnabled ? 'Cloud Activo' : 'Desactivado'}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCloudGuideOpen(true)}
                leftIcon={<Icon name="info" className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Guía Paso a Paso Cloud
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="gdriveCheck"
              checked={gdriveEnabled}
              onChange={(e) => setGdriveEnabled(e.target.checked)}
              disabled={isActionLoading}
              className="w-4 h-4 text-brand rounded border-border focus:ring-brand"
            />
            <label
              htmlFor="gdriveCheck"
              className="text-xs text-txt-primary font-medium cursor-pointer"
            >
              Habilitar subida automática de respaldos a Google Drive API v3
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="ID de Carpeta Google Drive"
              value={gdriveFolderId}
              onChange={(e) => setGdriveFolderId(e.target.value)}
              disabled={!gdriveEnabled || isActionLoading}
              placeholder="1A2B3C4D5E6F..."
              hint="ID alfanumérico visible en la URL de Google Drive"
            />

            <Input
              label="Intervalo Auto-Respaldo (Horas)"
              type="text"
              inputMode="numeric"
              value={intervalHours === 0 ? '' : String(intervalHours)}
              onChange={(e) => {
                const clean = sanitizeIntegerInput(e.target.value);
                setIntervalHours(clean ? Number(clean) : 0);
              }}
              disabled={isActionLoading}
              placeholder="2"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Client ID OAuth (Google Cloud)"
              value={gdriveClientId}
              onChange={(e) => setGdriveClientId(e.target.value)}
              disabled={!gdriveEnabled || isActionLoading}
              placeholder="123456789-abc.apps.googleusercontent.com"
            />

            <Input
              label="Client Secret OAuth (Keyring)"
              type="password"
              value={gdriveClientSecret}
              onChange={(e) => setGdriveClientSecret(e.target.value)}
              disabled={!gdriveEnabled || isActionLoading}
              placeholder={
                config?.has_gdrive_client_secret_configured
                  ? '•••••••• (Secret protegido en OS Keyring)'
                  : 'GOCSPX-...'
              }
            />
          </div>

          <Input
            label="Token de Acceso OAuth / API Key Google Drive"
            type="password"
            value={gdriveToken}
            onChange={(e) => setGdriveToken(e.target.value)}
            disabled={!gdriveEnabled || isActionLoading}
            placeholder={
              config?.has_gdrive_token_configured
                ? '•••••••• (Token protegido en OS Keyring)'
                : 'Ingresa el access token OAuth2'
            }
          />

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              isLoading={isActionLoading}
            >
              Guardar Parámetros Cloud
            </Button>
          </div>
        </form>
      </div>

      {/* Historial de Respaldos */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-txt-primary flex items-center gap-2">
              <Icon name="audit" className="w-4 h-4 text-brand" aria-hidden="true" />
              <span>Historial Cronológico de Respaldos</span>
            </h3>
            <p className="text-xs text-txt-muted">
              Bitácora de respaldos locales generados, exportaciones manuales y estados de sincronización cloud.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            isLoading={isLoading}
          >
            Sincronizar Historial
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha y Hora</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Archivo</TableHead>
              <TableHead>Tamaño</TableHead>
              <TableHead>Checksum SHA-256</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones de Integridad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backups.length === 0 ? (
              <TableEmptyState
                colSpan={7}
                icon={
                  <div className="w-12 h-12 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted mb-1">
                    <Icon name="database" className="w-6 h-6" aria-hidden="true" />
                  </div>
                }
                title="No hay registros de respaldos aún"
                description="Haz clic en 'Crear Respaldo Ahora' para generar una copia consistente de tu base de datos SQLite."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleCreateHotBackup}
                    isLoading={isActionLoading}
                    leftIcon={<Icon name="database" className="w-4 h-4" aria-hidden="true" />}
                  >
                    Crear Primer Respaldo
                  </Button>
                }
              />
            ) : (
              backups.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <span className="text-xs font-medium text-txt-secondary">
                      {b.created_at}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        b.tipo_respaldo === 'GOOGLE_DRIVE'
                          ? 'info'
                          : b.tipo_respaldo === 'EXPORTACION'
                          ? 'warning'
                          : 'default'
                      }
                      size="sm"
                    >
                      {b.tipo_respaldo}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs font-semibold text-txt-primary">
                      {b.nombre_archivo}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-semibold text-txt-primary">
                      {formatBytes(b.tamano_bytes)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="font-mono text-[11px] text-txt-muted"
                      title={b.sha256_checksum}
                    >
                      {b.sha256_checksum.substring(0, 10)}...
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        b.estado === 'SINCRONIZADO_CLOUD'
                          ? 'success'
                          : b.estado === 'COMPLETADO'
                          ? 'default'
                          : 'danger'
                      }
                      size="sm"
                    >
                      {b.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerify(b.id)}
                        isLoading={isActionLoading}
                        title="Verificar integridad SQLite con PRAGMA integrity_check"
                        leftIcon={<Icon name="search" className="w-3.5 h-3.5" aria-hidden="true" />}
                      >
                        Verificar
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSyncDrive(b.id)}
                        isLoading={isActionLoading}
                        title="Subir archivo a Google Drive"
                        leftIcon={<Icon name="cloud" className="w-3.5 h-3.5" aria-hidden="true" />}
                      >
                        Subir a Drive
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal: Exportación a Ruta Local o USB */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Exportar Base de Datos a Ruta Local / USB"
        description="Genera una copia limpia e independiente del archivo SQLite en la carpeta o memoria USB que elijas."
        size="md"
      >
        <form noValidate onSubmit={handleExportSubmit} onKeyDown={preventEnterKeySubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Ruta de Destino (Carpeta o Archivo .db)"
                  value={exportPath}
                  onChange={(e) => setExportPath(e.target.value)}
                  placeholder="Ej. D:\Respaldos_ZaramaGYM\zaramagym_export.db"
                  required
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handlePickExportFolder}
                isLoading={isPickingFolder}
                disabled={isActionLoading}
                leftIcon={<Icon name="directory" className="w-4 h-4" aria-hidden="true" />}
              >
                Examinar Carpeta...
              </Button>
            </div>
            <p className="text-[11px] text-txt-muted">
              Haz clic en <strong>Examinar Carpeta...</strong> para elegir visualmente una carpeta de tu PC o memoria USB, o escribe la ruta directamente.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExportModalOpen(false)}
              disabled={isActionLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isActionLoading}
              leftIcon={<Icon name="upload" className="w-4 h-4" aria-hidden="true" />}
            >
              Iniciar Exportación
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Diagnóstico de Integridad PRAGMA */}
      <Modal
        isOpen={Boolean(activeIntegrityReport)}
        onClose={() => setSelectedReportBackupId(null)}
        title="Informe de Integridad de Base de Datos"
        description="Auditoría forense de páginas SQLite y verificación de tablas maestras"
        size="md"
      >
        {activeIntegrityReport && (
          <div className="flex flex-col gap-4 text-xs">
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between ${
                activeIntegrityReport.is_valid
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon
                  name={activeIntegrityReport.is_valid ? 'check' : 'x'}
                  className="w-5 h-5 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <h4 className="font-bold text-sm">
                    {activeIntegrityReport.is_valid
                      ? 'Base de Datos 100% Integra y Recuperable'
                      : 'Alerta de Corrupción o Incompletitud'}
                  </h4>
                  <p className="text-[11px] opacity-90">
                    PRAGMA integrity_check: {activeIntegrityReport.integrity_message}
                  </p>
                </div>
              </div>
              <Badge variant={activeIntegrityReport.is_valid ? 'success' : 'danger'}>
                {activeIntegrityReport.is_valid ? 'VÁLIDO' : 'FALLIDO'}
              </Badge>
            </div>

            <div className="bg-canvas-subtle p-3.5 rounded-xl border border-border flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="text-txt-secondary">Tablas Encontradas:</span>
                <span className="font-bold text-txt-primary">
                  {activeIntegrityReport.found_tables_count} tablas
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-txt-secondary">Tamaño Auditado:</span>
                <span className="font-semibold text-txt-primary">
                  {formatBytes(activeIntegrityReport.file_size_bytes)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 pt-1 border-t border-border">
                <span className="text-txt-muted text-[10px]">
                  Checksum Criptográfico SHA-256:
                </span>
                <span className="font-mono text-[10px] break-all text-txt-primary">
                  {activeIntegrityReport.sha256_checksum}
                </span>
              </div>
            </div>

            {activeIntegrityReport.missing_core_tables.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                <span className="font-bold inline-flex items-center gap-1.5">
                  <Icon name="warning" className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Tablas maestras ausentes:
                </span>
                <p className="text-[11px] mt-1">
                  {activeIntegrityReport.missing_core_tables.join(', ')}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedReportBackupId(null)}
              >
                Cerrar Informe
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Crítico de Restauración de Base de Datos (Semáforo Rojo) */}
      <Modal
        isOpen={isRestoreModalOpen}
        onClose={handleCloseRestoreModal}
        preventClose={isBusyRestoring || isReadingRestoreFile}
        title="Restaurar Base de Datos"
        description="Recuperación ante desastres (Disaster Recovery) — Exclusivo Administrador"
        size="lg"
      >
        <form noValidate onSubmit={handleRestoreSubmit} onKeyDown={preventEnterKeySubmit} className="flex flex-col gap-4">
          {/* Banner Crítico Semáforo Rojo */}
          <div
            role="region"
            aria-label="Advertencia crítica de restauración"
            className="p-4 rounded-xl border border-status-danger/30 border-l-4 border-l-status-danger bg-status-danger-bg text-status-danger flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-full bg-status-danger shadow-[0_0_8px_var(--color-status-danger)] shrink-0"
                />
                <Icon
                  name="warning"
                  className="w-4 h-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Semáforo Rojo — Reemplazo de Base de Datos
                </span>
              </div>
              <Badge variant="danger" size="sm">
                Riesgo Crítico
              </Badge>
            </div>
            <p className="text-xs leading-relaxed">
              Esta operación reemplazará todos los datos actuales de ZaramaGYM con el respaldo seleccionado. Antes de ejecutar el reemplazo, el sistema validará la integridad estructural con{' '}
              <code className="font-mono font-semibold">PRAGMA integrity_check</code>{' '}
              y generará un respaldo de seguridad automático previo.
            </p>
          </div>

          {restoreError && (
            <Alert
              variant="danger"
              title="No se pudo completar la restauración"
              onClose={() => setRestoreError(null)}
            >
              {restoreError}
            </Alert>
          )}

          {/* Selector de archivo .db desde el equipo */}
          <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-canvas-subtle border border-border">
            <label
              htmlFor={restoreFileInputId}
              className="text-xs font-semibold text-txt-secondary uppercase tracking-wider flex items-center gap-2"
            >
              <Icon
                name="database"
                className="w-4 h-4 text-brand"
                aria-hidden="true"
              />
              <span>
                Seleccionar archivo de respaldo (.db, .sqlite, .sqlite3)
              </span>
            </label>

            <input
              ref={restoreFileInputRef}
              id={restoreFileInputId}
              type="file"
              accept=".db,.sqlite,.sqlite3"
              onChange={handleRestoreFileChange}
              disabled={isBusyRestoring || isReadingRestoreFile}
              className="block w-full text-xs text-txt-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-xs file:font-semibold file:bg-surface file:text-txt-primary hover:file:bg-surface-hover cursor-pointer disabled:opacity-60"
            />

            {isReadingRestoreFile && (
              <p className="text-xs text-txt-muted animate-pulse" role="status">
                Leyendo archivo de respaldo en memoria...
              </p>
            )}

            {selectedRestoreFile && !isReadingRestoreFile && (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-surface border border-border text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    name="check"
                    className="w-4 h-4 text-status-success shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-txt-primary truncate">
                      {selectedRestoreFile.name}
                    </p>
                    <p className="text-[11px] text-txt-muted">
                      Tamaño: {formatBytes(selectedRestoreFile.size)}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelectedRestoreFile}
                  disabled={isBusyRestoring}
                >
                  Quitar
                </Button>
              </div>
            )}
          </div>

          {/* Entrada opcional de ruta local */}
          <Input
            label="O ingresar ruta local del archivo .db (opcional)"
            value={restoreSourcePath}
            onChange={(e) => {
              setRestoreSourcePath(e.target.value);
              if (restoreError) setRestoreError(null);
            }}
            placeholder="Ej. C:\Backups\zaramagym_backup.db"
            disabled={isBusyRestoring || isReadingRestoreFile}
            hint="Si seleccionas un archivo arriba, se utilizará ese respaldo en memoria; de lo contrario, se leerá desde la ruta local indicada."
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseRestoreModal}
              disabled={isBusyRestoring || isReadingRestoreFile}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              isLoading={isBusyRestoring}
              disabled={!canConfirmRestore}
              leftIcon={
                <Icon name="database" className="w-4 h-4" aria-hidden="true" />
              }
            >
              Confirmar Restauración
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Guía Paso a Paso Cloud (Google Drive OAuth & Keyring) */}
      <Modal
        isOpen={isCloudGuideOpen}
        onClose={() => setIsCloudGuideOpen(false)}
        title="Guía Paso a Paso: Google Drive Cloud y OAuth"
        description="Configura tus respaldos automáticos en la nube con almacenamiento cifrado en Windows."
        size="lg"
        footer={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsCloudGuideOpen(false)}
          >
            Entendido
          </Button>
        }
      >
        <div className="flex flex-col gap-3 text-xs">
          <div className="p-3 rounded-lg bg-canvas-subtle border border-border flex flex-col gap-1">
            <div className="flex items-center gap-2 font-bold text-txt-primary">
              <span className="w-5 h-5 rounded-full bg-brand text-brand-text flex items-center justify-center text-[11px] shrink-0">
                1
              </span>
              <span>Obtener el Folder ID en Google Drive</span>
            </div>
            <p className="text-txt-secondary pl-7">
              Abre <span className="font-mono">drive.google.com</span>, crea una carpeta llamada{' '}
              <strong>Backups-ZaramaGYM</strong> y ábrela. Copia el código alfanumérico al final de la URL (después de{' '}
              <span className="font-mono">/folders/</span>) y pégalo en <strong>ID de Carpeta Google Drive</strong>.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-canvas-subtle border border-border flex flex-col gap-1">
            <div className="flex items-center gap-2 font-bold text-txt-primary">
              <span className="w-5 h-5 rounded-full bg-brand text-brand-text flex items-center justify-center text-[11px] shrink-0">
                2
              </span>
              <span>Generar Client ID y Client Secret en Google Cloud</span>
            </div>
            <p className="text-txt-secondary pl-7">
              Ingresa a <span className="font-mono">console.cloud.google.com</span>, crea un proyecto, habilita la{' '}
              <strong>Google Drive API</strong>, configura la pantalla de consentimiento OAuth y crea un{' '}
              <strong>ID de cliente de OAuth</strong> (tipo Aplicación de escritorio o Web). Copia el{' '}
              <strong>Client ID</strong> (<span className="font-mono">...apps.googleusercontent.com</span>) y el{' '}
              <strong>Client Secret</strong> (<span className="font-mono">GOCSPX-...</span>).
            </p>
          </div>

          <div className="p-3 rounded-lg bg-canvas-subtle border border-border flex flex-col gap-1">
            <div className="flex items-center gap-2 font-bold text-txt-primary">
              <span className="w-5 h-5 rounded-full bg-brand text-brand-text flex items-center justify-center text-[11px] shrink-0">
                3
              </span>
              <span>Obtener el Token OAuth2</span>
            </div>
            <p className="text-txt-secondary pl-7">
              Autoriza el permiso <span className="font-mono">https://www.googleapis.com/auth/drive.file</span> usando tus credenciales de cliente (por ejemplo desde Google OAuth 2.0 Playground) y pega el token obtenido en{' '}
              <strong>Token de Acceso OAuth / API Key Google Drive</strong>.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
            <Icon name="lock" className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">
                Paso 4: Cifrado en el Administrador de Credenciales de Windows (keyring)
              </span>
              <p className="opacity-90">
                Tanto el <strong>Client Secret</strong> como el <strong>Token OAuth</strong> nunca se almacenan en texto plano en la base de datos SQLite; ZaramaGYM los cifra y protege en el{' '}
                <strong>Administrador de Credenciales de Windows (keyring)</strong>.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
