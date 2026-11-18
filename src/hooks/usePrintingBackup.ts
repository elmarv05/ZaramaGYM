// ============================================================================
// HOOK REACTIVO: IMPRESIÓN TÉRMICA, SERIES, PDFS Y RESPALDOS (SLICE 8)
// Ubicación: src/hooks/usePrintingBackup.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { normalizeAppError } from '../services/ipc/client';
import { printingBackupIpc } from '../services/ipc/printingBackupIpc';
import { AppError } from '../types/auth';
import {
  BackupIntegrityReport,
  BackupRecord,
  GenerateFinancialReportPdfRequest,
  GeneratePdfResult,
  IssuedReceipt,
  IssueReceiptRequest,
  PrintingBackupConfigDto,
  PrintTicketRequest,
  PrintTicketResult,
  ReceiptSeries,
  RestoreDatabaseRequest,
  RestoreDatabaseResult,
  SendEmailResult,
  SendReceiptEmailRequest,
  UpdatePrintingBackupConfigRequest,
  UpdateReceiptSeriesRequest,
} from '../types/printingBackup';

export interface UsePrintingBackupOptions {
  isAdmin?: boolean;
  autoFetch?: boolean;
}

export function usePrintingBackup({
  isAdmin = false,
  autoFetch = true,
}: UsePrintingBackupOptions = {}) {
  const [config, setConfig] = useState<PrintingBackupConfigDto | null>(null);
  const [series, setSeries] = useState<ReceiptSeries[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [integrityReports, setIntegrityReports] = useState<
    Record<number, BackupIntegrityReport>
  >({});
  const [lastTicketResult, setLastTicketResult] =
    useState<PrintTicketResult | null>(null);
  const [lastPdfResult, setLastPdfResult] = useState<GeneratePdfResult | null>(
    null
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Carga la configuración del sistema para impresión y respaldos
   */
  const fetchConfig = useCallback(async () => {
    try {
      const cfg = await printingBackupIpc.getPrintingBackupConfig();
      setConfig(cfg);
    } catch (err) {
      setError(normalizeAppError(err));
    }
  }, []);

  /**
   * Actualiza la configuración global y secretos (Solo Admin)
   */
  const updateConfig = useCallback(
    async (
      req: UpdatePrintingBackupConfigRequest
    ): Promise<PrintingBackupConfigDto> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const updated = await printingBackupIpc.updatePrintingBackupConfig(req);
        setConfig(updated);
        return updated;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  /**
   * Carga el listado de series documentales
   */
  const fetchSeries = useCallback(async () => {
    try {
      const s = await printingBackupIpc.listReceiptSeries();
      setSeries(s);
    } catch (err) {
      setError(normalizeAppError(err));
    }
  }, []);

  /**
   * Actualiza una serie documental activa (Solo Admin)
   */
  const updateSeries = useCallback(
    async (req: UpdateReceiptSeriesRequest): Promise<ReceiptSeries> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const updated = await printingBackupIpc.updateReceiptSeries(req);
        setSeries((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        return updated;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  /**
   * Carga el historial de respaldos de base de datos (Solo Admin)
   */
  const fetchBackups = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const b = await printingBackupIpc.listBackupHistory();
      setBackups(b);
    } catch (err) {
      setError(normalizeAppError(err));
    }
  }, [isAdmin]);

  /**
   * Ejecuta un nuevo respaldo en caliente con VACUUM INTO
   */
  const createBackup = useCallback(async (): Promise<BackupRecord> => {
    setIsActionLoading(true);
    setError(null);
    try {
      const rec = await printingBackupIpc.createLocalBackup();
      setBackups((prev) => [rec, ...prev]);
      return rec;
    } catch (err) {
      const normalized = normalizeAppError(err);
      setError(normalized);
      throw normalized;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  /**
   * Verifica la integridad de un respaldo con PRAGMA integrity_check
   */
  const verifyBackup = useCallback(
    async (backupId: number): Promise<BackupIntegrityReport> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const report = await printingBackupIpc.verifyBackupIntegrity(backupId);
        setIntegrityReports((prev) => ({
          ...prev,
          [backupId]: report,
        }));
        return report;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  /**
   * Exporta una copia limpia de la base de datos a una ruta específica
   */
  const exportDatabase = useCallback(
    async (targetPath: string): Promise<BackupRecord> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const rec = await printingBackupIpc.exportDatabaseFile(targetPath);
        setBackups((prev) => [rec, ...prev]);
        return rec;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  /**
   * Sincroniza un respaldo con Google Drive
   */
  const syncToGdrive = useCallback(
    async (backupId: number): Promise<BackupRecord> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const rec = await printingBackupIpc.syncBackupToGdrive(backupId);
        setBackups((prev) =>
          prev.map((item) => (item.id === rec.id ? rec : item))
        );
        return rec;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  /**
   * Emite comprobante de pago
   */
  const issueReceipt = useCallback(
    async (req: IssueReceiptRequest): Promise<IssuedReceipt> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const receipt = await printingBackupIpc.issueSaleReceipt(req);
        // Refrescar series para reflejar el correlativo consumido
        fetchSeries().catch(() => {});
        return receipt;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchSeries]
  );

  /**
   * Consulta comprobante emitido
   */
  const getReceipt = useCallback(
    async (ventaId: number): Promise<IssuedReceipt | null> => {
      try {
        return await printingBackupIpc.getSaleReceipt(ventaId);
      } catch (err) {
        setError(normalizeAppError(err));
        return null;
      }
    },
    []
  );

  /**
   * Genera o despacha ticket térmico ESC/POS
   */
  const printTicket = useCallback(
    async (req: PrintTicketRequest): Promise<PrintTicketResult> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const res = await printingBackupIpc.printSaleTicket(req);
        setLastTicketResult(res);
        return res;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  /**
   * Genera PDF del comprobante de venta en RAM
   */
  const generateSalePdf = useCallback(
    async (ventaId: number): Promise<GeneratePdfResult> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const res = await printingBackupIpc.generateSaleReceiptPdf(ventaId);
        setLastPdfResult(res);
        return res;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  /**
   * Genera PDF del reporte financiero en RAM
   */
  const generateFinancialPdf = useCallback(
    async (
      req: GenerateFinancialReportPdfRequest
    ): Promise<GeneratePdfResult> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const res = await printingBackupIpc.generateFinancialReportPdf(req);
        setLastPdfResult(res);
        return res;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  /**
   * Envía comprobante por correo electrónico
   */
  const sendReceiptEmail = useCallback(
    async (req: SendReceiptEmailRequest): Promise<SendEmailResult> => {
      setIsActionLoading(true);
      setError(null);
      try {
        return await printingBackupIpc.sendReceiptEmail(req);
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  /**
   * Sincronización general de datos
   */
  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchConfig(),
        fetchSeries(),
        isAdmin ? fetchBackups() : Promise.resolve(),
      ]);
    } catch (err) {
      setError(normalizeAppError(err));
    } finally {
      setIsLoading(false);
    }
  }, [fetchConfig, fetchSeries, fetchBackups, isAdmin]);

  /**
   * Restaura la base de datos SQLite desde un respaldo y refresca el estado del módulo (Solo Admin)
   */
  const restoreDatabase = useCallback(
    async (request: RestoreDatabaseRequest): Promise<RestoreDatabaseResult> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const result = await printingBackupIpc.restoreDatabase(request);
        await refreshAll();
        return result;
      } catch (err) {
        const normalized = normalizeAppError(err);
        setError(normalized);
        throw normalized;
      } finally {
        setIsActionLoading(false);
      }
    },
    [refreshAll]
  );

  useEffect(() => {
    if (autoFetch) {
      refreshAll();
    }
  }, [autoFetch, refreshAll]);

  return {
    config,
    series,
    backups,
    integrityReports,
    lastTicketResult,
    lastPdfResult,
    isLoading,
    isActionLoading,
    error,
    fetchConfig,
    updateConfig,
    fetchSeries,
    updateSeries,
    fetchBackups,
    createBackup,
    verifyBackup,
    exportDatabase,
    syncToGdrive,
    restoreDatabase,
    issueReceipt,
    getReceipt,
    printTicket,
    generateSalePdf,
    generateFinancialPdf,
    sendReceiptEmail,
    refreshAll,
    clearError,
  };
}
