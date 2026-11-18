// ============================================================================
// SUITE DE PRUEBAS FRONTEND: SLICE 8 (IMPRESIÓN TÉRMICA, PDFS Y RESPALDOS)
// Verificación integral: Configuración Virtual 58/80mm, SMTP, Series NV01/B001/F001,
// Respaldos VACUUM INTO, Diagnóstico PRAGMA y RBAC Admin vs Supervisor
// Ubicación: src/features/printing_backup/__tests__/PrintingBackupView.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthSession } from '../../../types/auth';
import {
  BackupIntegrityReport,
  BackupRecord,
  PrintingBackupConfigDto,
  ReceiptSeries,
  RestoreDatabaseResult,
} from '../../../types/printingBackup';
import { PrintingBackupView } from '../PrintingBackupView';
import { SaleDetailModal } from '../../pos/components/SaleDetailModal';
import { safeInvoke } from '../../../services/ipc/client';

// Mock de safeInvoke de Tauri IPC
vi.mock('../../../services/ipc/client', () => ({
  safeInvoke: vi.fn(),
  normalizeAppError: (err: unknown) => ({
    code: 'Internal',
    message: String(err),
  }),
}));

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador General',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-15 08:00:00',
};

const supervisorSession: AuthSession = {
  user_id: 2,
  persona_id: 2,
  username: 'supervisor1',
  nombre_completo: 'Carlos Supervisor',
  rol: 'SUPERVISOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-15 08:30:00',
};

const mockConfig: PrintingBackupConfigDto = {
  empresa_nombre_comercial: 'ZaramaGYM Fitness Center',
  empresa_razon_social: 'ZARAMAGYM S.A.C.',
  empresa_ruc: '20600000001',
  empresa_direccion: 'Av. Principal 123 - Lima, Perú',
  empresa_telefono: '999888777',
  printer_paper_width_mm: 80,
  printer_connection_mode: 'VIRTUAL_PREVIEW',
  printer_target_address: '192.168.1.50:9100',
  printer_open_drawer_on_cash: true,
  printer_footer_message: '¡Gracias por entrenar en ZaramaGYM!',
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587,
  smtp_user: 'notificaciones@zaramagym.pe',
  smtp_from_email: 'no-reply@zaramagym.pe',
  smtp_enabled: true,
  backup_auto_interval_hours: 2,
  backup_gdrive_enabled: false,
  backup_gdrive_folder_id: '',
  has_smtp_password_configured: true,
  has_gdrive_token_configured: false,
};

const mockSeries: ReceiptSeries[] = [
  {
    id: 1,
    tipo_comprobante: 'NOTA_VENTA',
    serie: 'NV01',
    correlativo_actual: 12,
    descripcion: 'Serie Notas de Venta Internas',
    estado_activo: true,
    created_at: '2026-11-15 08:00:00',
    updated_at: '2026-11-15 08:00:00',
  },
  {
    id: 2,
    tipo_comprobante: 'BOLETA',
    serie: 'B001',
    correlativo_actual: 54,
    descripcion: 'Serie Boletas de Venta',
    estado_activo: true,
    created_at: '2026-11-15 08:00:00',
    updated_at: '2026-11-15 08:00:00',
  },
  {
    id: 3,
    tipo_comprobante: 'FACTURA',
    serie: 'F001',
    correlativo_actual: 8,
    descripcion: 'Serie Facturas Comerciales',
    estado_activo: true,
    created_at: '2026-11-15 08:00:00',
    updated_at: '2026-11-15 08:00:00',
  },
];

const mockBackups: BackupRecord[] = [
  {
    id: 1,
    tipo_respaldo: 'LOCAL_MANUAL',
    nombre_archivo: 'zaramagym_backup_20261115_100000.db',
    ruta_local: 'C:/backups/zaramagym_backup_20261115_100000.db',
    tamano_bytes: 1048576,
    sha256_checksum: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
    drive_file_id: null,
    estado: 'COMPLETADO',
    mensaje_detalle: 'Respaldo local generado exitosamente con VACUUM INTO',
    ejecutado_por_usuario_id: 1,
    created_at: '2026-11-15 10:00:00',
  },
  {
    id: 2,
    tipo_respaldo: 'GOOGLE_DRIVE',
    nombre_archivo: 'zaramagym_backup_20261115_080000.db',
    ruta_local: 'C:/backups/zaramagym_backup_20261115_080000.db',
    tamano_bytes: 2097152,
    sha256_checksum: 'f9e8d7c6b5a432101234567890abcdef1234567890abcdef1234567890abcdef',
    drive_file_id: 'gdrive_file_xyz_123',
    estado: 'SINCRONIZADO_CLOUD',
    mensaje_detalle: 'Sincronizado a Google Drive',
    ejecutado_por_usuario_id: 1,
    created_at: '2026-11-15 08:00:00',
  },
];

const mockIntegrityReport: BackupIntegrityReport = {
  is_valid: true,
  integrity_message: 'ok',
  found_tables_count: 8,
  missing_core_tables: [],
  file_size_bytes: 1048576,
  sha256_checksum: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
};

describe('Suite Frontend: Slice 8 - Impresión Térmica, PDFs y Respaldos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. PESTAÑA 1: CONFIGURACIÓN DE IMPRESORA TÉRMICA, EMPRESA Y SMTP
  // ==========================================================================
  describe('Pestaña 1: Impresora Térmica & SMTP', () => {
    it('renderiza correctamente los parámetros de empresa emisora, impresora y SMTP', () => {
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="printer"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
        />
      );

      // Encabezado
      expect(
        screen.getByText('Impresión Térmica, PDFs y Respaldos')
      ).toBeInTheDocument();

      // Formulario de Empresa
      expect(screen.getByDisplayValue('ZaramaGYM Fitness Center')).toBeInTheDocument();
      expect(screen.getByDisplayValue('20600000001')).toBeInTheDocument();
      expect(screen.getByDisplayValue('ZARAMAGYM S.A.C.')).toBeInTheDocument();

      // Modo de Conexión Virtual Preview
      expect(
        screen.getByText('Vista Previa Virtual (Sin Impresora)')
      ).toBeInTheDocument();

      // SMTP Activo y Badge de Keyring
      expect(screen.getByText('SMTP Activo')).toBeInTheDocument();
      expect(screen.getByText('Contraseña en Keyring')).toBeInTheDocument();

      // Simulador de ticket presente
      expect(screen.getByText('Vista Previa de Ticket Térmico')).toBeInTheDocument();
    });

    it('permite alternar entre bobina de 58mm y 80mm en el simulador térmico', () => {
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="printer"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
        />
      );

      // Botones de ancho en el simulador
      const btn58 = screen.getByRole('button', { name: '58mm (32 cols)' });
      const btn80 = screen.getByRole('button', { name: '80mm (48 cols)' });

      expect(btn58).toBeInTheDocument();
      expect(btn80).toBeInTheDocument();

      fireEvent.click(btn58);
      expect(screen.getByText(/Ancho: 58mm \(32 columnas/)).toBeInTheDocument();
      // Razón Social y RUC en líneas independientes simétricas dentro del <pre>
      expect(screen.getByText(/ZARAMAGYM S\.A\.C\./)).toBeInTheDocument();
      expect(screen.getByText(/R\.U\.C\.: 20600000001/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Imprimir$/i })).toBeInTheDocument();

      fireEvent.click(btn80);
      expect(screen.getByText(/Ancho: 80mm \(48 columnas/)).toBeInTheDocument();
    });

    it('muestra barra sticky arriba con estado de cambios pendientes, botones compactos por tarjeta y contadores de caracteres', () => {
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="printer"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
        />
      );

      // Estado inicial sincronizado y botón prominente arriba
      expect(screen.getByText('Sincronizado')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Guardar Cambios/i })).toBeInTheDocument();

      // 3 botones compactos en cabeceras de tarjeta
      expect(screen.getAllByRole('button', { name: /^Guardar$/ }).length).toBe(3);

      // Contadores de caracteres y maxLength
      const razonInput = screen.getByLabelText(/Razón Social Legal/i) as HTMLInputElement;
      expect(razonInput.maxLength).toBe(80);
      expect(screen.getByText(/16\/80 caracteres/i)).toBeInTheDocument();

      fireEvent.change(razonInput, { target: { value: 'ZARAMAGYM CORPORACION S.A.C.' } });
      expect(screen.getByText('Cambios pendientes')).toBeInTheDocument();
      expect(screen.getByText(/28\/80 caracteres/i)).toBeInTheDocument();
    });

    it('permite al Administrador guardar la configuración de impresión y empresa', async () => {
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="printer"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
        />
      );

      const btnGuardar = screen.getByRole('button', {
        name: /Guardar Configuración de Impresión/i,
      });
      expect(btnGuardar).toBeInTheDocument();

      fireEvent.click(btnGuardar);

      await waitFor(() => {
        expect(
          screen.getByText(/Configuración de impresión y empresa guardada exitosamente/i)
        ).toBeInTheDocument();
      });
    });

    it('bloquea la edición para SUPERVISOR mostrando aviso informativo', () => {
      render(
        <PrintingBackupView
          currentSession={supervisorSession}
          initialTab="printer"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
        />
      );

      expect(screen.getByText('Modo Visualización')).toBeInTheDocument();
      expect(
        screen.getByText(/Como Supervisor tienes acceso de lectura/i)
      ).toBeInTheDocument();

      // No debe existir el botón de guardar
      expect(
        screen.queryByRole('button', {
          name: /Guardar Configuración de Impresión/i,
        })
      ).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 2. PESTAÑA 2: SERIES DOCUMENTALES (NV01, B001, F001)
  // ==========================================================================
  describe('Pestaña 2: Series Documentales', () => {
    it('muestra las 3 series principales con correlativo formateado y badge activa', () => {
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="series"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
        />
      );

      // Tipos de Comprobante
      expect(screen.getByText('Nota de Venta')).toBeInTheDocument();
      expect(screen.getByText('Boleta de Venta')).toBeInTheDocument();
      expect(screen.getByText('Factura Comercial')).toBeInTheDocument();

      // Series
      expect(screen.getByText('NV01')).toBeInTheDocument();
      expect(screen.getByText('B001')).toBeInTheDocument();
      expect(screen.getByText('F001')).toBeInTheDocument();

      // Correlativo actual con formato padded
      expect(screen.getByText('000012')).toBeInTheDocument();
      expect(screen.getByText('000054')).toBeInTheDocument();
      expect(screen.getByText('000008')).toBeInTheDocument();
    });

    it('permite al Administrador abrir el modal de edición de una serie', () => {
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="series"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
        />
      );

      const editButtons = screen.getAllByRole('button', { name: /Editar/i });
      expect(editButtons.length).toBe(3);

      fireEvent.click(editButtons[0]);

      // Modal abierto
      expect(
        screen.getByText(/Editar Serie Documental: NV01/i)
      ).toBeInTheDocument();
      expect(
        screen.getByDisplayValue('Serie Notas de Venta Internas')
      ).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 3. PESTAÑA 3: RESPALDOS SQLITE (VACUUM INTO), INTEGRIDAD Y GOOGLE DRIVE
  // ==========================================================================
  describe('Pestaña 3: Respaldos SQLite & Drive', () => {
    it('muestra panel completo de respaldos en caliente y Google Drive para ADMINISTRADOR', () => {
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="backups"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
        />
      );

      // Botón crear respaldo en caliente
      expect(
        screen.getByRole('button', {
          name: /Crear Respaldo Ahora \(VACUUM INTO\)/i,
        })
      ).toBeInTheDocument();

      // Botón exportar
      expect(
        screen.getByRole('button', {
          name: /Exportar \.db a Ruta Local \/ USB/i,
        })
      ).toBeInTheDocument();

      // Archivos en historial
      expect(
        screen.getByText('zaramagym_backup_20261115_100000.db')
      ).toBeInTheDocument();
      expect(screen.getByText('1.00 MB')).toBeInTheDocument();
      expect(screen.getByText('2.00 MB')).toBeInTheDocument();

      // Acciones por fila
      const verifyButtons = screen.getAllByRole('button', {
        name: /Verificar/i,
      });
      expect(verifyButtons.length).toBe(2);
    });

    it('muestra modal de informe de integridad cuando se verifica un respaldo', async () => {
      const handleVerify = vi.fn().mockResolvedValue(mockIntegrityReport);

      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="backups"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
          integrityReports={{ 1: mockIntegrityReport }}
          onVerifyBackup={handleVerify}
        />
      );

      const verifyButtons = screen.getAllByRole('button', {
        name: /Verificar/i,
      });
      fireEvent.click(verifyButtons[0]);

      await waitFor(() => {
        expect(
          screen.getByText(/Informe de Integridad de Base de Datos/i)
        ).toBeInTheDocument();
        expect(
          screen.getByText(/Base de Datos 100% Integra y Recuperable/i)
        ).toBeInTheDocument();
        expect(
          screen.getByText(/PRAGMA integrity_check: ok/i)
        ).toBeInTheDocument();
        expect(screen.getByText('8 tablas')).toBeInTheDocument();
      });
    });

    it('muestra banner informativo de restricción para rol SUPERVISOR', () => {
      render(
        <PrintingBackupView
          currentSession={supervisorSession}
          initialTab="backups"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
        />
      );

      expect(
        screen.getByText('Módulo Exclusivo del Administrador')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/están restringidas por seguridad al rol/i)
      ).toBeInTheDocument();

      // Botón crear respaldo no debe estar presente
      expect(
        screen.queryByRole('button', {
          name: /Crear Respaldo Ahora \(VACUUM INTO\)/i,
        })
      ).not.toBeInTheDocument();

      // Botón Restaurar Base de Datos tampoco debe mostrarse para SUPERVISOR
      expect(
        screen.queryByRole('button', {
          name: /Restaurar Base de Datos/i,
        })
      ).not.toBeInTheDocument();
    });

    it('muestra botón Restaurar Base de Datos solo para ADMINISTRADOR, abre modal Semáforo Rojo, permite seleccionar .db, invoca onRestoreDatabase y muestra éxito', async () => {
      const mockRestoreResult: RestoreDatabaseResult = {
        success: true,
        restored_from: 'zaramagym_restore_test.db',
        sha256_checksum:
          'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        file_size_bytes: 4096,
        pre_restore_backup_path: 'C:/backups/pre_restore_20261117.db',
        found_tables_count: 14,
        requires_relogin: true,
        message: 'Base de datos restaurada y pool reiniciado correctamente.',
      };
      const handleRestoreDatabase = vi
        .fn()
        .mockResolvedValue(mockRestoreResult);
      const handleDatabaseRestored = vi.fn();

      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="backups"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
          onRestoreDatabase={handleRestoreDatabase}
          onDatabaseRestored={handleDatabaseRestored}
        />
      );

      const restoreBtn = screen.getByRole('button', {
        name: /Restaurar Base de Datos/i,
      });
      expect(restoreBtn).toBeInTheDocument();
      fireEvent.click(restoreBtn);

      // Modal crítico Semáforo Rojo abierto
      expect(
        screen.getByRole('dialog', { name: /Restaurar Base de Datos/i })
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Semáforo Rojo — Reemplazo de Base de Datos/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Riesgo Crítico/i)).toBeInTheDocument();
      expect(screen.getByText(/PRAGMA integrity_check/i)).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', {
        name: /Confirmar Restauración/i,
      });
      expect(confirmBtn).toBeDisabled();

      // Seleccionar archivo .db en memoria
      const fileInput = screen.getByLabelText(
        /Seleccionar archivo de respaldo/i
      ) as HTMLInputElement;
      const dbBytes = new Uint8Array([
        83, 81, 76, 105, 116, 101, 32, 102, 111, 114, 109, 97, 116, 32, 51, 0,
      ]);
      const dbFile = new File([dbBytes], 'zaramagym_restore_test.db', {
        type: 'application/octet-stream',
      });

      fireEvent.change(fileInput, { target: { files: [dbFile] } });

      // Espera lectura Base64 y habilitación del botón
      await waitFor(() => {
        expect(
          screen.getByText('zaramagym_restore_test.db')
        ).toBeInTheDocument();
        expect(screen.getByText(/Tamaño: 16 B/i)).toBeInTheDocument();
        expect(confirmBtn).toBeEnabled();
      });

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(handleRestoreDatabase).toHaveBeenCalledTimes(1);
        expect(handleRestoreDatabase).toHaveBeenCalledWith({
          file_bytes_base64: btoa('SQLite format 3\0'),
          file_name: 'zaramagym_restore_test.db',
          source_path: null,
        });
      });

      // Modal cerrado y alerta de éxito con detalles
      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', { name: /Restaurar Base de Datos/i })
        ).not.toBeInTheDocument();
        expect(
          screen.getByText('Base de Datos Restaurada Exitosamente')
        ).toBeInTheDocument();
        expect(
          screen.getByText('zaramagym_restore_test.db')
        ).toBeInTheDocument();
        expect(screen.getByText('14')).toBeInTheDocument();
        expect(
          screen.getByText(
            'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678'
          )
        ).toBeInTheDocument();
        expect(handleDatabaseRestored).toHaveBeenCalledWith(mockRestoreResult);
      });
    });

    it('permite restaurar por ruta local y muestra AppError claramente si falla la validación sin romper la vista', async () => {
      const handleRestoreDatabase = vi.fn().mockRejectedValue({
        code: 'Validation',
        message:
          'El archivo seleccionado no superó PRAGMA integrity_check o no es SQLite válido.',
      });
      const handleDatabaseRestored = vi.fn();

      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="backups"
          config={mockConfig}
          series={mockSeries}
          backups={mockBackups}
          onRestoreDatabase={handleRestoreDatabase}
          onDatabaseRestored={handleDatabaseRestored}
        />
      );

      fireEvent.click(
        screen.getByRole('button', { name: /Restaurar Base de Datos/i })
      );

      const pathInput = screen.getByLabelText(
        /O ingresar ruta local del archivo \.db/i
      );
      fireEvent.change(pathInput, {
        target: { value: 'C:\\Backups\\corrupto.db' },
      });

      const confirmBtn = screen.getByRole('button', {
        name: /Confirmar Restauración/i,
      });
      expect(confirmBtn).toBeEnabled();

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(handleRestoreDatabase).toHaveBeenCalledWith({
          source_path: 'C:\\Backups\\corrupto.db',
          file_bytes_base64: null,
          file_name: null,
        });
        expect(
          screen.getByText('No se pudo completar la restauración')
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            'El archivo seleccionado no superó PRAGMA integrity_check o no es SQLite válido.'
          )
        ).toBeInTheDocument();
      });

      // La vista y el modal siguen íntegros y no se disparó onDatabaseRestored
      expect(
        screen.getByRole('dialog', { name: /Restaurar Base de Datos/i })
      ).toBeInTheDocument();
      expect(handleDatabaseRestored).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 4. ESTADOS VISUALES OBLIGATORIOS (LOADING, EMPTY, ERROR)
  // ==========================================================================
  describe('Estados visuales obligatorios', () => {
    it('muestra skeleton/loading cuando isLoading es true y no hay config', () => {
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="printer"
          config={null}
          isLoading={true}
        />
      );

      expect(
        screen.getByRole('status', {
          name: 'Cargando configuración documental',
        })
      ).toBeInTheDocument();
    });

    it('muestra estado vacío en tabla de series si no hay series', () => {
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="series"
          config={mockConfig}
          series={[]}
          backups={mockBackups}
        />
      );

      expect(
        screen.getByText('No hay series registradas')
      ).toBeInTheDocument();
    });

    it('muestra alerta de error y permite reintentar', () => {
      const handleClear = vi.fn();
      render(
        <PrintingBackupView
          currentSession={adminSession}
          initialTab="printer"
          config={mockConfig}
          error={{
            code: 'Internal',
            message: 'Error al conectar con el servicio documental',
          }}
          onClearError={handleClear}
        />
      );

      expect(
        screen.getByText('Error en Operación Documental / Respaldo')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Error al conectar con el servicio documental')
      ).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 5. SALE DETAIL MODAL: BOTÓN EXPLÍCITO "Imprimir Ticket Ahora"
  // ==========================================================================
  describe('SaleDetailModal: Previsualización e Impresión de Ticket', () => {
    it('muestra el botón explícito "Imprimir Ticket Ahora" tras generar el ticket', async () => {
      const mockedInvoke = vi.mocked(safeInvoke);
      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_sale_receipt') return null;
        if (cmd === 'issue_sale_receipt') {
          return {
            id: 1,
            venta_id: 99,
            serie_id: 2,
            tipo_comprobante: 'BOLETA',
            serie: 'B001',
            correlativo: 1,
            numero_formateado: 'B001-000001',
            receptor_tipo_doc: 'SIN_DOC',
            receptor_numero_doc: '',
            receptor_razon_nombre: 'CLIENTE GENERAL',
            moneda: 'PEN',
            total_comprobante: '120.00',
            hash_verificacion: 'hash123',
            emitido_por_usuario_id: 1,
            fecha_emision: '2026-11-16 20:00:00',
            created_at: '2026-11-16 20:00:00',
          };
        }
        if (cmd === 'print_sale_ticket') {
          return {
            raw_escpos_base64: '',
            formatted_text: '================================\n        ZARAMAGYM S.A.C.        \n================================',
            width_columns: 32,
            width_mm: 58,
            is_simulated: true,
            target_mode: 'VIRTUAL_PREVIEW',
            message: 'Ticket simulado',
          };
        }
        return null;
      });

      render(
        <SaleDetailModal
          isOpen={true}
          onClose={() => {}}
          sale={{
            id: 99,
            turno_caja_id: 1,
            cliente_id: null,
            cliente_nombre_completo: 'Público General',
            cliente_numero_documento: null,
            usuario_vendedor_id: 1,
            usuario_vendedor_username: 'admin',
            subtotal: '120.00',
            descuento: '0.00',
            total_venta: '120.00',
            monto_pagado_efectivo: '120.00',
            monto_pagado_digital: '0.00',
            saldo_credito_generado: '0.00',
            estado_venta: 'COMPLETADA',
            tachado_por_usuario_id: null,
            tachado_por_username: null,
            fecha_tachado: null,
            motivo_tachado: null,
            resuelto_por_admin_id: null,
            resuelto_por_admin_username: null,
            fecha_resolucion_tachado: null,
            nota_resolucion_tachado: null,
            notas: null,
            created_at: '2026-11-16 20:00:00',
            items: [],
            pagos: [],
          }}
        />
      );

      expect(
        screen.queryByRole('button', { name: /Imprimir Ticket Ahora/i })
      ).not.toBeInTheDocument();

      const emitBtn = screen.getByRole('button', {
        name: /Emitir \/ Ver Ticket/i,
      });
      fireEvent.click(emitBtn);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Imprimir Ticket Ahora/i })
        ).toBeInTheDocument();
      });
    });
  });
});
