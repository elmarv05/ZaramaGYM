// ============================================================================
// PRUEBAS DE DOMINIO: IMPRESIÓN, PDFS, COMPROBANTES Y RESPALDOS (SLICE 8)
// Ubicación: src/domain/__tests__/printingBackup.test.ts
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import {
  canManageBackupsAndPrinterConfig,
  canViewPrintingBackupModule,
  formatBytes,
  getLocalDateISO,
  PRINTER_MODE_LABELS,
  printThermalTicketText,
  RECEIPT_TYPE_LABELS,
  triggerBase64PdfDownload,
  validateEmailDispatchInput,
  validateIssueReceiptInput,
} from '../printingBackup';

describe('Dominio: Impresión Térmica, Documentos y Respaldos (Slice 8)', () => {
  describe('Etiquetas descriptivas constantes', () => {
    it('mapea correctamente las etiquetas de tipos de comprobante', () => {
      expect(RECEIPT_TYPE_LABELS.NOTA_VENTA).toBe('Nota de Venta');
      expect(RECEIPT_TYPE_LABELS.BOLETA).toBe('Boleta de Venta');
      expect(RECEIPT_TYPE_LABELS.FACTURA).toBe('Factura Comercial');
    });

    it('mapea correctamente los modos de conexión de impresora térmica', () => {
      expect(PRINTER_MODE_LABELS.VIRTUAL_PREVIEW).toBe(
        'Vista Previa Virtual (Sin Impresora)'
      );
      expect(PRINTER_MODE_LABELS.NETWORK_TCP).toBe('Red Local TCP/IP (:9100)');
      expect(PRINTER_MODE_LABELS.WINDOWS_RAW).toBe(
        'Impresora Local Windows (RAW)'
      );
    });
  });

  describe('validateIssueReceiptInput', () => {
    it('permite emitir NOTA_VENTA sin requerir datos de cliente', () => {
      const res = validateIssueReceiptInput({
        venta_id: 1,
        tipo_comprobante: 'NOTA_VENTA',
      });
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('permite emitir BOLETA sin documento para montos menores', () => {
      const res = validateIssueReceiptInput({
        venta_id: 2,
        tipo_comprobante: 'BOLETA',
      });
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('valida DNI en BOLETA si se especifica DNI', () => {
      const resInvalido = validateIssueReceiptInput({
        venta_id: 2,
        tipo_comprobante: 'BOLETA',
        receptor_tipo_doc: 'DNI',
        receptor_numero_doc: '1234', // incompleto
      });
      expect(resInvalido.isValid).toBe(false);
      expect(resInvalido.error).toContain('DNI');

      const resValido = validateIssueReceiptInput({
        venta_id: 2,
        tipo_comprobante: 'BOLETA',
        receptor_tipo_doc: 'DNI',
        receptor_numero_doc: '72345678',
        receptor_razon_nombre: 'Juan Pérez',
      });
      expect(resValido.isValid).toBe(true);
    });

    it('rechaza FACTURA sin RUC o con RUC menor a 11 dígitos', () => {
      const sinRuc = validateIssueReceiptInput({
        venta_id: 3,
        tipo_comprobante: 'FACTURA',
        receptor_razon_nombre: 'Gimnasio Top SAC',
      });
      expect(sinRuc.isValid).toBe(false);
      expect(sinRuc.error).toContain('RUC');

      const rucCorto = validateIssueReceiptInput({
        venta_id: 3,
        tipo_comprobante: 'FACTURA',
        receptor_numero_doc: '2060001',
        receptor_razon_nombre: 'Gimnasio Top SAC',
      });
      expect(rucCorto.isValid).toBe(false);
      expect(rucCorto.error).toContain('11 dígitos');
    });

    it('rechaza FACTURA con RUC que no inicie con 10 o 20', () => {
      const rucInvalido = validateIssueReceiptInput({
        venta_id: 3,
        tipo_comprobante: 'FACTURA',
        receptor_numero_doc: '30123456789',
        receptor_razon_nombre: 'Gimnasio Top SAC',
      });
      expect(rucInvalido.isValid).toBe(false);
      expect(rucInvalido.error).toContain('10 o 20');
    });

    it('rechaza FACTURA sin razón social', () => {
      const sinRazon = validateIssueReceiptInput({
        venta_id: 3,
        tipo_comprobante: 'FACTURA',
        receptor_numero_doc: '20601234567',
        receptor_razon_nombre: '   ',
      });
      expect(sinRazon.isValid).toBe(false);
      expect(sinRazon.error).toContain('razón social');
    });

    it('acepta FACTURA válida con RUC 20 y Razón Social', () => {
      const valida = validateIssueReceiptInput({
        venta_id: 3,
        tipo_comprobante: 'FACTURA',
        receptor_numero_doc: '20601234567',
        receptor_razon_nombre: 'Corporación Deportiva S.A.C.',
      });
      expect(valida.isValid).toBe(true);
      expect(valida.error).toBeUndefined();
    });

    it('acepta FACTURA válida con RUC 10 de persona natural con negocio', () => {
      const valida10 = validateIssueReceiptInput({
        venta_id: 3,
        tipo_comprobante: 'FACTURA',
        receptor_numero_doc: '10456789012',
        receptor_razon_nombre: 'Carlos Zarama Personal Trainer',
      });
      expect(valida10.isValid).toBe(true);
      expect(valida10.error).toBeUndefined();
    });
  });

  describe('validateEmailDispatchInput', () => {
    it('rechaza correos vacíos o mal formados', () => {
      expect(validateEmailDispatchInput('').isValid).toBe(false);
      expect(validateEmailDispatchInput('invalido').isValid).toBe(false);
      expect(validateEmailDispatchInput('usuario@').isValid).toBe(false);
      expect(validateEmailDispatchInput('@dominio.com').isValid).toBe(false);
    });

    it('acepta correos electrónicos válidos', () => {
      expect(validateEmailDispatchInput('cliente@correo.com').isValid).toBe(true);
      expect(validateEmailDispatchInput('admin.zarama@gimnasio.pe').isValid).toBe(
        true
      );
    });
  });

  describe('formatBytes', () => {
    it('formatea tamaños de archivos en bytes, KB, MB y GB', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1536)).toBe('1.50 KB');
      expect(formatBytes(1048576)).toBe('1.00 MB');
      expect(formatBytes(2621440)).toBe('2.50 MB');
      expect(formatBytes(1073741824)).toBe('1.00 GB');
    });
  });

  describe('Permisos RBAC', () => {
    it('canManageBackupsAndPrinterConfig solo permite ADMINISTRADOR', () => {
      expect(canManageBackupsAndPrinterConfig('ADMINISTRADOR')).toBe(true);
      expect(canManageBackupsAndPrinterConfig('SUPERVISOR')).toBe(false);
      expect(canManageBackupsAndPrinterConfig('RECEPCIONISTA')).toBe(false);
      expect(canManageBackupsAndPrinterConfig(undefined)).toBe(false);
    });

    it('canViewPrintingBackupModule permite ADMINISTRADOR y SUPERVISOR', () => {
      expect(canViewPrintingBackupModule('ADMINISTRADOR')).toBe(true);
      expect(canViewPrintingBackupModule('SUPERVISOR')).toBe(true);
      expect(canViewPrintingBackupModule('RECEPCIONISTA')).toBe(false);
      expect(canViewPrintingBackupModule(undefined)).toBe(false);
    });
  });

  describe('triggerBase64PdfDownload', () => {
    it('crea un elemento ancla y dispara la descarga limpiando el objeto URL', () => {
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-uuid');
      const mockRevokeObjectURL = vi.fn();
      globalThis.URL.createObjectURL = mockCreateObjectURL;
      globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      // Base64 simple
      const base64Sample = btoa('%PDF-1.4 sample content');
      triggerBase64PdfDownload(base64Sample, 'recibo_test.pdf');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();

      clickSpy.mockRestore();
    });
  });

  describe('getLocalDateISO', () => {
    it('formatea la fecha local en YYYY-MM-DD sin desfase UTC nocturno', () => {
      // 16 de Noviembre 2026 a las 23:45 hora local (en UTC-5 sería 17 de Noviembre en UTC)
      const lateLocalDate = new Date(2026, 10, 16, 23, 45, 0);
      expect(getLocalDateISO(lateLocalDate)).toBe('2026-11-16');

      const janFirst = new Date(2026, 0, 5, 0, 5, 0);
      expect(getLocalDateISO(janFirst)).toBe('2026-01-05');
    });
  });

  describe('printThermalTicketText', () => {
    it('crea un iframe oculto con reglas @page para bobina térmica y maneja entornos jsdom sin errores', () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      expect(() => printThermalTicketText('=== TICKET ===\nTOTAL: 10.00', 58)).not.toThrow();
      expect(appendSpy).toHaveBeenCalled();
      const createdIframe = appendSpy.mock.calls.find(
        (call) => (call[0] as HTMLElement)?.tagName === 'IFRAME'
      )?.[0] as HTMLIFrameElement | undefined;
      expect(createdIframe).toBeDefined();
      expect(createdIframe?.contentDocument?.head.innerHTML).toContain('58mm auto');
      expect(createdIframe?.contentDocument?.body.textContent).toContain('=== TICKET ===');
      appendSpy.mockRestore();
    });
  });
});
