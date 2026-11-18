// ============================================================================
// VISTA PRINCIPAL: IMPRESIÓN TÉRMICA, COMPROBANTES Y RESPALDOS (SLICE 8)
// Ubicación: src/features/printing_backup/PrintingBackupView.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Alert } from '../../components/primitives/Alert';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { usePrintingBackup } from '../../hooks/usePrintingBackup';
import { AppError, AuthSession } from '../../types/auth';
import {
  BackupIntegrityReport,
  BackupRecord,
  PrintingBackupConfigDto,
  PrintTicketResult,
  ReceiptSeries,
  RestoreDatabaseRequest,
  RestoreDatabaseResult,
  UpdatePrintingBackupConfigRequest,
  UpdateReceiptSeriesRequest,
} from '../../types/printingBackup';
import { BackupsTab } from './components/BackupsTab';
import { PrinterSmtpConfigTab } from './components/PrinterSmtpConfigTab';
import { ReceiptSeriesTab } from './components/ReceiptSeriesTab';

export type PrintingBackupTab = 'printer' | 'series' | 'backups';

export interface PrintingBackupViewProps {
  currentSession: AuthSession;
  initialTab?: PrintingBackupTab;

  // Inyección opcional para testing desacoplado
  config?: PrintingBackupConfigDto | null;
  series?: ReceiptSeries[];
  backups?: BackupRecord[];
  integrityReports?: Record<number, BackupIntegrityReport>;
  lastTicketResult?: PrintTicketResult | null;
  isLoading?: boolean;
  isActionLoading?: boolean;
  error?: AppError | null;
  onClearError?: () => void;
  onCreateBackup?: () => Promise<BackupRecord>;
  onVerifyBackup?: (backupId: number) => Promise<BackupIntegrityReport>;
  onExportDatabase?: (targetPath: string) => Promise<BackupRecord>;
  onSyncGdrive?: (backupId: number) => Promise<BackupRecord>;
  onUpdateConfig?: (
    req: UpdatePrintingBackupConfigRequest
  ) => Promise<PrintingBackupConfigDto>;
  onUpdateSeries?: (req: UpdateReceiptSeriesRequest) => Promise<ReceiptSeries>;
  onTestPrint?: (
    ventaId: number,
    widthMm?: 58 | 80
  ) => Promise<PrintTicketResult>;
  onRestoreDatabase?: (
    req: RestoreDatabaseRequest
  ) => Promise<RestoreDatabaseResult>;
  onDatabaseRestored?: (result: RestoreDatabaseResult) => void;
}

export const PrintingBackupView: React.FC<PrintingBackupViewProps> = ({
  currentSession,
  initialTab = 'printer',
  config: propConfig,
  series: propSeries,
  backups: propBackups,
  integrityReports: propIntegrityReports,
  lastTicketResult: propLastTicketResult,
  isLoading: propIsLoading,
  isActionLoading: propIsActionLoading,
  error: propError,
  onClearError,
  onCreateBackup,
  onVerifyBackup,
  onExportDatabase,
  onSyncGdrive,
  onUpdateConfig,
  onUpdateSeries,
  onTestPrint,
  onRestoreDatabase,
  onDatabaseRestored,
}) => {
  const isAdmin = currentSession?.rol === 'ADMINISTRADOR';

  const shouldAutoFetch =
    propConfig === undefined &&
    propSeries === undefined &&
    propBackups === undefined;

  const hook = usePrintingBackup({
    isAdmin,
    autoFetch: shouldAutoFetch,
  });

  const [activeTab, setActiveTab] = useState<PrintingBackupTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const config = propConfig !== undefined ? propConfig : hook.config;
  const series = propSeries !== undefined ? propSeries : hook.series;
  const backups = propBackups !== undefined ? propBackups : hook.backups;
  const integrityReports =
    propIntegrityReports !== undefined
      ? propIntegrityReports
      : hook.integrityReports;
  const lastTicketResult =
    propLastTicketResult !== undefined
      ? propLastTicketResult
      : hook.lastTicketResult;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hook.isLoading;
  const isActionLoading =
    propIsActionLoading !== undefined
      ? propIsActionLoading
      : hook.isActionLoading;
  const error = propError !== undefined ? propError : hook.error;

  const handleClearError = () => {
    if (onClearError) onClearError();
    hook.clearError();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado del Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-surface rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
            <Icon name="printer" className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-txt-primary">
              Impresión Térmica, PDFs y Respaldos
            </h2>
            <p className="text-xs text-txt-muted">
              Tickets monospaciados (58/80mm), comprobantes en memoria RAM y respaldos seguros con VACUUM INTO.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={isAdmin ? 'success' : 'info'}>
            Rol: {currentSession.rol}
          </Badge>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={hook.refreshAll}
            isLoading={isLoading}
          >
            Sincronizar
          </Button>
        </div>
      </div>

      {/* Manejo de Errores Globales */}
      {error && (
        <Alert
          variant="danger"
          title="Error en Operación Documental / Respaldo"
          onClose={handleClearError}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>{error.message}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={hook.refreshAll}
            >
              Reintentar
            </Button>
          </div>
        </Alert>
      )}

      {/* Navegación por Sub-Pestañas Accesibles */}
      <nav
        role="tablist"
        aria-label="Pestañas de Impresión y Respaldos"
        className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'printer'}
          onClick={() => setActiveTab('printer')}
          className={`flex items-center gap-2 text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'printer'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="printer" className="w-4 h-4" aria-hidden="true" />
          <span>Impresora Térmica & SMTP</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'series'}
          onClick={() => setActiveTab('series')}
          className={`flex items-center gap-2 text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'series'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="receipt" className="w-4 h-4" aria-hidden="true" />
          <span>Series Documentales</span>
          {series.length > 0 && (
            <Badge variant="default" size="sm">
              {series.length}
            </Badge>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'backups'}
          onClick={() => setActiveTab('backups')}
          className={`flex items-center gap-2 text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'backups'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name={isAdmin ? 'cloud' : 'lock'} className="w-4 h-4" aria-hidden="true" />
          <span>Respaldos SQLite & Drive</span>
          {!isAdmin && (
            <Badge variant="warning" size="sm">
              Solo Admin
            </Badge>
          )}
          {isAdmin && backups.length > 0 && (
            <Badge variant="default" size="sm">
              {backups.length}
            </Badge>
          )}
        </button>
      </nav>

      {/* Contenido de la Sub-Pestaña Activa */}
      <section aria-label="Contenido de pestaña seleccionada">
        {isLoading && !config && (
          <div
            className="flex flex-col gap-6 animate-pulse"
            role="status"
            aria-label="Cargando configuración documental"
          >
            <div className="h-44 bg-surface rounded-xl border border-border" />
            <div className="h-64 bg-surface rounded-xl border border-border" />
          </div>
        )}

        {(!isLoading || config) && (
          <>
            {activeTab === 'printer' && (
              <PrinterSmtpConfigTab
                config={config}
                isAdmin={isAdmin}
                isLoading={isLoading}
                isActionLoading={isActionLoading}
                lastTicketResult={lastTicketResult}
                onUpdateConfig={onUpdateConfig || hook.updateConfig}
                onTestPrint={
                  onTestPrint ||
                  ((vId, wMm) =>
                    hook.printTicket({
                      venta_id: vId,
                      forced_width_mm: wMm,
                    }))
                }
              />
            )}

            {activeTab === 'series' && (
              <ReceiptSeriesTab
                series={series}
                isAdmin={isAdmin}
                isLoading={isLoading}
                isActionLoading={isActionLoading}
                onUpdateSeries={onUpdateSeries || hook.updateSeries}
                onRefresh={hook.fetchSeries}
              />
            )}

            {activeTab === 'backups' && (
              <BackupsTab
                backups={backups}
                integrityReports={integrityReports}
                config={config}
                isAdmin={isAdmin}
                isLoading={isLoading}
                isActionLoading={isActionLoading}
                onCreateBackup={onCreateBackup || hook.createBackup}
                onVerifyBackup={onVerifyBackup || hook.verifyBackup}
                onExportDatabase={onExportDatabase || hook.exportDatabase}
                onSyncGdrive={onSyncGdrive || hook.syncToGdrive}
                onUpdateConfig={onUpdateConfig || hook.updateConfig}
                onRestoreDatabase={onRestoreDatabase || hook.restoreDatabase}
                onDatabaseRestored={onDatabaseRestored}
                onRefresh={hook.fetchBackups}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
};
