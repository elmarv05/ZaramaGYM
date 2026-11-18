// ============================================================================
// SERVICIOS IPC: IMPRESIÓN TÉRMICA, SERIES, PDFS Y RESPALDOS (SLICE 8)
// Envoltorios tipados para Tauri v2 con dual-binding seguro
// Ubicación: src/services/ipc/printingBackupIpc.ts
// ============================================================================

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
} from '../../types/printingBackup';
import { safeInvoke } from './client';

export const printingBackupIpc = {
  // ==========================================================================
  // 1. EMISIÓN Y CONSULTA DE COMPROBANTES FISCALES / COMERCIALES
  // ==========================================================================

  /**
   * Emite comprobante de pago atómico asignando correlativo inmutable (idempotente)
   */
  async issueSaleReceipt(request: IssueReceiptRequest): Promise<IssuedReceipt> {
    return safeInvoke<IssuedReceipt>('issue_sale_receipt', {
      request,
      input: request,
      venta_id: request.venta_id,
      tipo_comprobante: request.tipo_comprobante,
    });
  },

  /**
   * Consulta el comprobante emitido vinculado a una venta
   */
  async getSaleReceipt(ventaId: number): Promise<IssuedReceipt | null> {
    return safeInvoke<IssuedReceipt | null>('get_sale_receipt', {
      venta_id: ventaId,
      id: ventaId,
      ventaId,
      sale_id: ventaId,
      saleId: ventaId,
    });
  },

  /**
   * Lista todas las series documentales (NV01, B001, F001)
   */
  async listReceiptSeries(): Promise<ReceiptSeries[]> {
    return safeInvoke<ReceiptSeries[]>('list_receipt_series');
  },

  /**
   * Actualiza la descripción o estado activo de una serie (Solo Admin)
   */
  async updateReceiptSeries(
    request: UpdateReceiptSeriesRequest
  ): Promise<ReceiptSeries> {
    return safeInvoke<ReceiptSeries>('update_receipt_series', {
      request,
      input: request,
      serie_id: request.serie_id,
      descripcion: request.descripcion,
      estado_activo: request.estado_activo,
    });
  },

  // ==========================================================================
  // 2. IMPRESIÓN TÉRMICA ESC/POS Y GENERACIÓN DE PDFS EN RAM
  // ==========================================================================

  /**
   * Genera comandos ESC/POS y texto formateado para simulación o despacho físico
   */
  async printSaleTicket(request: PrintTicketRequest): Promise<PrintTicketResult> {
    return safeInvoke<PrintTicketResult>('print_sale_ticket', {
      request,
      input: request,
      venta_id: request.venta_id,
      forced_width_mm: request.forced_width_mm,
      open_drawer_override: request.open_drawer_override,
    });
  },

  /**
   * Genera el PDF del comprobante en RAM codificado en Base64 (%PDF-1.4)
   */
  async generateSaleReceiptPdf(ventaId: number): Promise<GeneratePdfResult> {
    return safeInvoke<GeneratePdfResult>('generate_sale_receipt_pdf', {
      venta_id: ventaId,
      id: ventaId,
      ventaId,
      sale_id: ventaId,
      saleId: ventaId,
    });
  },

  /**
   * Genera el PDF del Reporte Financiero en RAM codificado en Base64 (%PDF-1.4)
   */
  async generateFinancialReportPdf(
    request: GenerateFinancialReportPdfRequest
  ): Promise<GeneratePdfResult> {
    return safeInvoke<GeneratePdfResult>('generate_financial_report_pdf', {
      request,
      input: request,
      fecha_desde: request.fecha_desde,
      fecha_hasta: request.fecha_hasta,
      canal_filtro: request.canal_filtro,
    });
  },

  /**
   * Despacha comprobante adjunto vía correo electrónico SMTP o simulación
   */
  async sendReceiptEmail(
    request: SendReceiptEmailRequest
  ): Promise<SendEmailResult> {
    return safeInvoke<SendEmailResult>('send_receipt_email', {
      request,
      input: request,
      venta_id: request.venta_id,
      destinatario_email: request.destinatario_email,
      mensaje_adicional: request.mensaje_adicional,
    });
  },

  // ==========================================================================
  // 3. RESPALDOS SQLITE (VACUUM INTO), INTEGRIDAD Y GOOGLE DRIVE (ADMIN)
  // ==========================================================================

  /**
   * Ejecuta respaldo local en caliente con sentencia nativa VACUUM INTO
   */
  async createLocalBackup(): Promise<BackupRecord> {
    return safeInvoke<BackupRecord>('create_local_backup');
  },

  /**
   * Lista el historial cronológico de respaldos locales y sincronizaciones cloud
   */
  async listBackupHistory(): Promise<BackupRecord[]> {
    return safeInvoke<BackupRecord[]>('list_backup_history');
  },

  /**
   * Ejecuta PRAGMA integrity_check y chequeo de tablas maestras sobre un respaldo
   */
  async verifyBackupIntegrity(backupId: number): Promise<BackupIntegrityReport> {
    return safeInvoke<BackupIntegrityReport>('verify_backup_integrity', {
      backup_id: backupId,
      id: backupId,
      backupId,
    });
  },

  /**
   * Exporta la base de datos a un directorio o unidad externa USB
   */
  async exportDatabaseFile(targetPath: string): Promise<BackupRecord> {
    return safeInvoke<BackupRecord>('export_database_file', {
      target_path: targetPath,
      targetPath,
      path: targetPath,
    });
  },

  /**
   * Sincroniza un respaldo local existente con Google Drive API v3
   */
  async syncBackupToGdrive(backupId: number): Promise<BackupRecord> {
    return safeInvoke<BackupRecord>('sync_backup_to_gdrive', {
      backup_id: backupId,
      id: backupId,
      backupId,
    });
  },

  /**
   * Restaura la base de datos SQLite desde una ruta local o bytes Base64 (Solo Admin)
   */
  async restoreDatabase(
    request: RestoreDatabaseRequest
  ): Promise<RestoreDatabaseResult> {
    return safeInvoke<RestoreDatabaseResult>('restore_database', {
      request,
      input: request,
    });
  },

  // ==========================================================================
  // 4. CONFIGURACIÓN INTEGRAL DE IMPRESIÓN, EMPRESA Y RESPALDOS
  // ==========================================================================

  /**
   * Consulta los parámetros vigentes de impresión, empresa, SMTP y respaldos
   */
  async getPrintingBackupConfig(): Promise<PrintingBackupConfigDto> {
    return safeInvoke<PrintingBackupConfigDto>('get_printing_backup_config');
  },

  /**
   * Actualiza los parámetros de configuración y almacena secretos en Keyring (Admin)
   */
  async updatePrintingBackupConfig(
    request: UpdatePrintingBackupConfigRequest
  ): Promise<PrintingBackupConfigDto> {
    return safeInvoke<PrintingBackupConfigDto>('update_printing_backup_config', {
      request,
      input: request,
    });
  },
};
