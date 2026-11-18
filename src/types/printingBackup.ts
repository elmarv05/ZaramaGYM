// ============================================================================
// TIPOS Y CONTRATOS: IMPRESIÓN TÉRMICA, COMPROBANTES Y RESPALDOS (SLICE 8)
// Ubicación: src/types/printingBackup.ts
// ============================================================================

export type ReceiptType = 'NOTA_VENTA' | 'BOLETA' | 'FACTURA';

export type PrinterWidth = '58' | '80';

export type PrinterConnectionMode = 'VIRTUAL_PREVIEW' | 'NETWORK_TCP' | 'WINDOWS_RAW';

export type BackupType = 'LOCAL_AUTO' | 'LOCAL_MANUAL' | 'EXPORTACION' | 'GOOGLE_DRIVE';

export type BackupStatus = 'COMPLETADO' | 'SINCRONIZADO_CLOUD' | 'FALLIDO';

export interface ReceiptSeries {
  id: number;
  tipo_comprobante: ReceiptType;
  serie: string;
  correlativo_actual: number;
  descripcion: string | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateReceiptSeriesRequest {
  serie_id: number;
  descripcion?: string | null;
  estado_activo: boolean;
}

export interface IssuedReceipt {
  id: number;
  venta_id: number;
  serie_id: number;
  tipo_comprobante: ReceiptType;
  serie: string;
  correlativo: number;
  numero_formateado: string;
  receptor_tipo_doc: string;
  receptor_numero_doc: string;
  receptor_razon_nombre: string;
  receptor_direccion?: string | null;
  moneda: string;
  total_comprobante: string;
  hash_verificacion: string;
  emitido_por_usuario_id: number;
  fecha_emision: string;
  created_at: string;
}

export interface IssueReceiptRequest {
  venta_id: number;
  tipo_comprobante: ReceiptType;
  receptor_tipo_doc?: string | null;
  receptor_numero_doc?: string | null;
  receptor_razon_nombre?: string | null;
  receptor_direccion?: string | null;
}

export interface PrintTicketRequest {
  venta_id: number;
  forced_width_mm?: 58 | 80 | null;
  open_drawer_override?: boolean | null;
}

export interface PrintTicketResult {
  raw_escpos_base64: string;
  formatted_text: string;
  width_columns: number;
  width_mm: number;
  is_simulated: boolean;
  target_mode: PrinterConnectionMode;
  message: string;
}

export interface GeneratePdfResult {
  filename: string;
  pdf_base64: string;
  size_bytes: number;
  sha256_hash: string;
}

export interface GenerateFinancialReportPdfRequest {
  fecha_desde: string;
  fecha_hasta: string;
  canal_filtro?: 'FISICA' | 'DIGITAL' | 'MIXTA' | null;
}

export interface SendReceiptEmailRequest {
  venta_id: number;
  destinatario_email: string;
  mensaje_adicional?: string | null;
}

export interface SendEmailResult {
  success: boolean;
  message: string;
  was_simulated: boolean;
}

export interface BackupRecord {
  id: number;
  tipo_respaldo: BackupType;
  nombre_archivo: string;
  ruta_local: string;
  tamano_bytes: number;
  sha256_checksum: string;
  drive_file_id?: string | null;
  estado: BackupStatus;
  mensaje_detalle?: string | null;
  ejecutado_por_usuario_id?: number | null;
  created_at: string;
}

export interface BackupIntegrityReport {
  is_valid: boolean;
  integrity_message: string;
  found_tables_count: number;
  missing_core_tables: string[];
  file_size_bytes: number;
  sha256_checksum: string;
}

export interface RestoreDatabaseRequest {
  source_path?: string | null;
  file_bytes_base64?: string | null;
  file_name?: string | null;
}

export interface RestoreDatabaseResult {
  success: boolean;
  restored_from: string;
  sha256_checksum: string;
  file_size_bytes: number;
  pre_restore_backup_path: string | null;
  found_tables_count: number;
  requires_relogin: boolean;
  message: string;
}

export interface PrintingBackupConfigDto {
  empresa_nombre_comercial: string;
  empresa_razon_social: string;
  empresa_ruc: string;
  empresa_direccion: string;
  empresa_telefono: string;
  printer_paper_width_mm: 58 | 80;
  printer_connection_mode: PrinterConnectionMode;
  printer_target_address: string;
  printer_open_drawer_on_cash: boolean;
  printer_footer_message: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_from_email: string;
  smtp_enabled: boolean;
  backup_auto_interval_hours: number;
  backup_gdrive_enabled: boolean;
  backup_gdrive_folder_id: string;
  backup_gdrive_client_id?: string;
  has_smtp_password_configured: boolean;
  has_gdrive_token_configured: boolean;
  has_gdrive_client_secret_configured?: boolean;
}

export interface UpdatePrintingBackupConfigRequest {
  empresa_nombre_comercial?: string | null;
  empresa_razon_social?: string | null;
  empresa_ruc?: string | null;
  empresa_direccion?: string | null;
  empresa_telefono?: string | null;
  printer_paper_width_mm?: 58 | 80 | null;
  printer_connection_mode?: PrinterConnectionMode | null;
  printer_target_address?: string | null;
  printer_open_drawer_on_cash?: boolean | null;
  printer_footer_message?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_from_email?: string | null;
  smtp_enabled?: boolean | null;
  smtp_password?: string | null;
  backup_auto_interval_hours?: number | null;
  backup_gdrive_enabled?: boolean | null;
  backup_gdrive_folder_id?: string | null;
  backup_gdrive_client_id?: string | null;
  backup_gdrive_client_secret?: string | null;
  backup_gdrive_token?: string | null;
}
