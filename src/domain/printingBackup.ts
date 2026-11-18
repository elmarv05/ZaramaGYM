// ============================================================================
// FUNCIONES PURAS Y LÓGICA DE DOMINIO: IMPRESIÓN, PDFS Y RESPALDOS (SLICE 8)
// Ubicación: src/domain/printingBackup.ts
// ============================================================================

import {
  IssueReceiptRequest,
  PrinterConnectionMode,
  ReceiptType,
} from '../types/printingBackup';

export const RECEIPT_TYPE_LABELS: Record<ReceiptType, string> = {
  NOTA_VENTA: 'Nota de Venta',
  BOLETA: 'Boleta de Venta',
  FACTURA: 'Factura Comercial',
};

export const PRINTER_MODE_LABELS: Record<PrinterConnectionMode, string> = {
  VIRTUAL_PREVIEW: 'Vista Previa Virtual (Sin Impresora)',
  NETWORK_TCP: 'Red Local TCP/IP (:9100)',
  WINDOWS_RAW: 'Impresora Local Windows (RAW)',
};

/**
 * Valida los datos requeridos para la emisión de un comprobante de pago
 */
export function validateIssueReceiptInput(req: IssueReceiptRequest): {
  isValid: boolean;
  error?: string;
} {
  if (req.tipo_comprobante === 'FACTURA') {
    const ruc = (req.receptor_numero_doc || '').trim();
    const razon = (req.receptor_razon_nombre || '').trim();

    if (!ruc) {
      return {
        isValid: false,
        error: 'Para emitir Factura es obligatorio ingresar el RUC del cliente.',
      };
    }

    if (!/^\d{11}$/.test(ruc)) {
      return {
        isValid: false,
        error: 'El RUC debe contener exactamente 11 dígitos numéricos.',
      };
    }

    if (!ruc.startsWith('10') && !ruc.startsWith('20')) {
      return {
        isValid: false,
        error: 'El RUC debe comenzar con 10 o 20 (persona natural o jurídica).',
      };
    }

    if (!razon) {
      return {
        isValid: false,
        error: 'Para emitir Factura es obligatorio indicar la razón social de la empresa.',
      };
    }
  }

  if (req.tipo_comprobante === 'BOLETA') {
    const docTipo = (req.receptor_tipo_doc || '').toUpperCase();
    const docNum = (req.receptor_numero_doc || '').trim();

    if (docTipo === 'DNI' && docNum && !/^\d{8}$/.test(docNum)) {
      return {
        isValid: false,
        error: 'El DNI debe contener exactamente 8 dígitos numéricos.',
      };
    }
  }

  return { isValid: true };
}

/**
 * Valida formato estándar de dirección de correo electrónico
 */
export function validateEmailDispatchInput(email: string): {
  isValid: boolean;
  error?: string;
} {
  const trimmed = email.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Debe ingresar un correo electrónico destinatario.',
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return {
      isValid: false,
      error: 'El formato del correo electrónico ingresado no es válido.',
    };
  }

  return { isValid: true };
}

/**
 * Formatea un valor en bytes a formato legible para el usuario (B, KB, MB, GB)
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const valor = bytes / Math.pow(k, i);

  return `${valor.toFixed(2)} ${sizes[i]}`;
}

/**
 * Convierte un contenido Base64 (CSV, XLSX, PDF, etc.) a un Blob y dispara su descarga limpia
 */
export function triggerBase64FileDownload(
  base64: string,
  filename: string,
  mimeType: string
): void {
  try {
    if (typeof document === 'undefined' || !document.body) return;
    const cleanBase64 = base64.replace(/\s/g, '');
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 1000);
  } catch (err) {
    console.error('Error al descargar archivo:', err);
  }
}

/**
 * Convierte un contenido PDF en Base64 a un Blob y dispara su descarga limpia en el navegador/Tauri
 */
export function triggerBase64PdfDownload(pdfBase64: string, filename: string): void {
  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  triggerBase64FileDownload(pdfBase64, safeFilename, 'application/pdf');
}

/**
 * Obtiene la fecha calendario local en formato YYYY-MM-DD (sin desfase UTC)
 */
export function getLocalDateISO(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Escapa caracteres HTML especiales para incrustar texto plano de ticket de forma segura
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Imprime un ticket térmico monospaciado usando un iframe oculto con dimensiones de bobina 58/80mm.
 * Incluye fallback seguro para entornos de prueba sin implementación de impresión (jsdom).
 */
export function printThermalTicketText(text: string, widthMm: 58 | 80 = 80): void {
  if (!text || typeof document === 'undefined' || !document.body) return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Ticket Térmico ${widthMm}mm</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 2mm; }
  body { font-family: monospace; white-space: pre; font-size: 11px; line-height: 1.3; margin: 0; color: #000; }
</style>
</head>
<body>${escapeHtml(text)}</body>
</html>`);
      doc.close();
    }

    const win = iframe.contentWindow;
    if (win) {
      if (typeof win.focus === 'function') {
        win.focus();
      }
      if (typeof win.print === 'function') {
        win.print();
      }
    }
  } catch {
    // Fallback silencioso en entornos como jsdom donde contentWindow.print puede lanzar error
  } finally {
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 1000);
  }
}

/**
 * Convierte un archivo binario (.db/.sqlite) a Base64 puro en memoria de forma segura.
 * Soporta File.arrayBuffer() moderno y fallback mediante FileReader.
 */
export async function fileToBase64(file: File): Promise<string> {
  if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    const chunks: string[] = [];

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, i + chunkSize);
      chunks.push(String.fromCharCode(...slice));
    }

    return btoa(chunks.join(''));
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        return;
      }
      if (result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(result);
        const chunkSize = 0x8000;
        const chunks: string[] = [];
        for (let i = 0; i < bytes.length; i += chunkSize) {
          chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
        }
        resolve(btoa(chunks.join('')));
        return;
      }
      reject(new Error('No se pudo leer el contenido binario del archivo seleccionado.'));
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Error al leer el archivo de respaldo en memoria.'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Regla RBAC: Solo el ADMINISTRADOR puede gestionar configuraciones de impresión, respaldos y secretos
 */
export function canManageBackupsAndPrinterConfig(rol?: string): boolean {
  return rol === 'ADMINISTRADOR';
}

/**
 * Regla RBAC: ADMINISTRADOR y SUPERVISOR pueden visualizar el módulo de impresión y respaldos
 */
export function canViewPrintingBackupModule(rol?: string): boolean {
  return rol === 'ADMINISTRADOR' || rol === 'SUPERVISOR';
}
