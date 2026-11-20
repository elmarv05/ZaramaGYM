// ============================================================================
// COMPONENTE: PESTAÑA CONFIGURACIÓN DE IMPRESORA TÉRMICA, EMPRESA Y SMTP
// Ubicación: src/features/printing_backup/components/PrinterSmtpConfigTab.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { Input } from '../../../components/primitives/Input';
import { Modal } from '../../../components/primitives/Modal';
import { Select } from '../../../components/primitives/Select';
import { PRINTER_MODE_LABELS } from '../../../domain/printingBackup';
import {
  PrinterConnectionMode,
  PrintingBackupConfigDto,
  PrintTicketResult,
  UpdatePrintingBackupConfigRequest,
} from '../../../types/printingBackup';
import { ThermalTicketPreview } from './ThermalTicketPreview';
import { preventEnterKeySubmit, sanitizeIntegerInput } from '../../../utils/formSafety';

export interface PrinterSmtpConfigTabProps {
  config: PrintingBackupConfigDto | null;
  isAdmin: boolean;
  isLoading: boolean;
  isActionLoading: boolean;
  lastTicketResult: PrintTicketResult | null;
  onUpdateConfig: (
    req: UpdatePrintingBackupConfigRequest
  ) => Promise<PrintingBackupConfigDto>;
  onTestPrint: (
    ventaId: number,
    widthMm?: 58 | 80
  ) => Promise<PrintTicketResult>;
}

export const PrinterSmtpConfigTab: React.FC<PrinterSmtpConfigTabProps> = ({
  config,
  isAdmin,
  isLoading,
  isActionLoading,
  lastTicketResult,
  onUpdateConfig,
  onTestPrint,
}) => {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State sincronizado
  const [nombreComercial, setNombreComercial] = useState(
    config?.empresa_nombre_comercial || ''
  );
  const [razonSocial, setRazonSocial] = useState(
    config?.empresa_razon_social || ''
  );
  const [ruc, setRuc] = useState(config?.empresa_ruc || '');
  const [direccion, setDireccion] = useState(config?.empresa_direccion || '');
  const [telefono, setTelefono] = useState(config?.empresa_telefono || '');

  const [widthMm, setWidthMm] = useState<58 | 80>(
    config?.printer_paper_width_mm || 80
  );
  const [connMode, setConnMode] = useState<PrinterConnectionMode>(
    config?.printer_connection_mode || 'VIRTUAL_PREVIEW'
  );
  const [targetAddress, setTargetAddress] = useState(
    config?.printer_target_address || ''
  );
  const [openDrawer, setOpenDrawer] = useState<boolean>(
    config?.printer_open_drawer_on_cash ?? true
  );
  const [footerMessage, setFooterMessage] = useState(
    config?.printer_footer_message || ''
  );

  const [smtpEnabled, setSmtpEnabled] = useState<boolean>(
    config?.smtp_enabled ?? false
  );
  const [smtpHost, setSmtpHost] = useState(config?.smtp_host || '');
  const [smtpPort, setSmtpPort] = useState<number>(config?.smtp_port || 587);
  const [smtpUser, setSmtpUser] = useState(config?.smtp_user || '');
  const [smtpFromEmail, setSmtpFromEmail] = useState(
    config?.smtp_from_email || ''
  );
  const [smtpPassword, setSmtpPassword] = useState('');

  // Simulador Test
  const [testVentaId, setTestVentaId] = useState<string>('1');
  const [simWidth, setSimWidth] = useState<58 | 80>(widthMm);
  const [isSmtpGuideOpen, setIsSmtpGuideOpen] = useState(false);

  const hasUnsavedChanges = React.useMemo(() => {
    if (!config) return false;
    return (
      nombreComercial !== config.empresa_nombre_comercial ||
      razonSocial !== config.empresa_razon_social ||
      ruc !== config.empresa_ruc ||
      direccion !== config.empresa_direccion ||
      telefono !== config.empresa_telefono ||
      widthMm !== config.printer_paper_width_mm ||
      connMode !== config.printer_connection_mode ||
      targetAddress !== config.printer_target_address ||
      openDrawer !== config.printer_open_drawer_on_cash ||
      footerMessage !== config.printer_footer_message ||
      smtpEnabled !== config.smtp_enabled ||
      smtpHost !== config.smtp_host ||
      smtpPort !== config.smtp_port ||
      smtpUser !== config.smtp_user ||
      smtpFromEmail !== config.smtp_from_email ||
      smtpPassword.trim().length > 0
    );
  }, [
    config,
    nombreComercial,
    razonSocial,
    ruc,
    direccion,
    telefono,
    widthMm,
    connMode,
    targetAddress,
    openDrawer,
    footerMessage,
    smtpEnabled,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpFromEmail,
    smtpPassword,
  ]);

  // Actualizar estados locales si config cambia
  React.useEffect(() => {
    if (config) {
      setNombreComercial(config.empresa_nombre_comercial);
      setRazonSocial(config.empresa_razon_social);
      setRuc(config.empresa_ruc);
      setDireccion(config.empresa_direccion);
      setTelefono(config.empresa_telefono);
      setWidthMm(config.printer_paper_width_mm);
      setSimWidth(config.printer_paper_width_mm);
      setConnMode(config.printer_connection_mode);
      setTargetAddress(config.printer_target_address);
      setOpenDrawer(config.printer_open_drawer_on_cash);
      setFooterMessage(config.printer_footer_message);
      setSmtpEnabled(config.smtp_enabled);
      setSmtpHost(config.smtp_host);
      setSmtpPort(config.smtp_port);
      setSmtpUser(config.smtp_user);
      setSmtpFromEmail(config.smtp_from_email);
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      await onUpdateConfig({
        empresa_nombre_comercial: nombreComercial,
        empresa_razon_social: razonSocial,
        empresa_ruc: ruc,
        empresa_direccion: direccion,
        empresa_telefono: telefono,
        printer_paper_width_mm: widthMm,
        printer_connection_mode: connMode,
        printer_target_address: targetAddress,
        printer_open_drawer_on_cash: openDrawer,
        printer_footer_message: footerMessage,
        smtp_enabled: smtpEnabled,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_user: smtpUser,
        smtp_from_email: smtpFromEmail,
        smtp_password: smtpPassword.trim() ? smtpPassword.trim() : null,
      });

      setSuccessMessage('Configuración de impresión y empresa guardada exitosamente.');
      setSmtpPassword('');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch {
      // Error manejado en hook
    }
  };

  const handleRunTestPrint = async () => {
    const id = parseInt(testVentaId, 10);
    if (isNaN(id) || id <= 0) return;
    try {
      await onTestPrint(id, simWidth);
    } catch {
      // Error manejado en hook
    }
  };

  const handleAutofillGmail = () => {
    if (!isAdmin) return;
    setSmtpEnabled(true);
    setSmtpHost('smtp.gmail.com');
    setSmtpPort(587);
  };

  return (
    <div className="flex flex-col gap-6">
      {successMessage && (
        <Alert
          variant="success"
          title="Configuración Actualizada"
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}

      {!isAdmin && (
        <Alert variant="info" title="Modo Visualización" floating={false}>
          Los cambios de configuración de impresión, encabezados y correo del gimnasio son exclusivos del Administrador.
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulario Principal de Configuración */}
        <form
          noValidate
          onSubmit={handleSubmit}
          onKeyDown={preventEnterKeySubmit}
          className="lg:col-span-7 flex flex-col gap-6"
        >
          {/* Barra de Acción Rápida Sticky Arriba */}
          {isAdmin && (
            <div className="sticky top-2 z-10 bg-surface/95 backdrop-blur-sm border border-border rounded-xl px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant={hasUnsavedChanges ? 'warning' : 'success'} size="sm">
                  {hasUnsavedChanges ? 'Cambios pendientes' : 'Sincronizado'}
                </Badge>
                <span className="text-xs text-txt-secondary">
                  {hasUnsavedChanges
                    ? 'Tienes cambios modificados respecto a la configuración guardada.'
                    : 'Configuración al día.'}
                </span>
              </div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isActionLoading}
                disabled={isLoading}
                leftIcon={<Icon name="save" className="w-4 h-4" aria-hidden="true" />}
              >
                Guardar Cambios
              </Button>
            </div>
          )}

          {/* Bloque 1: Datos de la Empresa Emisora */}
          <div className="bg-surface p-5 rounded-xl border border-border flex flex-col gap-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <Icon name="building" className="w-5 h-5 text-brand" aria-hidden="true" />
                <h3 className="font-bold text-sm text-txt-primary">
                  Identidad de la Empresa Emisora
                </h3>
              </div>
              {isAdmin && (
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  isLoading={isActionLoading}
                  disabled={isLoading}
                  leftIcon={<Icon name="save" className="w-3.5 h-3.5" aria-hidden="true" />}
                >
                  Guardar
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Nombre Comercial"
                value={nombreComercial}
                onChange={(e) => setNombreComercial(e.target.value)}
                disabled={!isAdmin || isActionLoading || isLoading}
                placeholder="Ej. ZaramaGYM Fitness Center"
                maxLength={60}
                hint={`${nombreComercial.length}/60 caracteres`}
                required
              />
              <Input
                label="R.U.C. Emisor"
                value={ruc}
                onChange={(e) => setRuc(e.target.value)}
                disabled={!isAdmin || isActionLoading || isLoading}
                placeholder="11 dígitos (ej. 20600000001)"
                maxLength={11}
                required
              />
            </div>

            <Input
              label="Razón Social Legal"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              disabled={!isAdmin || isActionLoading || isLoading}
              placeholder="Ej. ZARAMAGYM S.A.C."
              maxLength={80}
              hint={`${razonSocial.length}/80 caracteres — En tickets de 58mm (32 cols) y 80mm (48 cols) se aplica salto de línea automático sin recortar`}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Dirección Comercial"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                disabled={!isAdmin || isActionLoading || isLoading}
                placeholder="Av. Principal 123"
                maxLength={100}
                hint={`${direccion.length}/100 caracteres`}
              />
              <Input
                label="Teléfono / WhatsApp"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={!isAdmin || isActionLoading || isLoading}
                placeholder="999888777"
              />
            </div>
          </div>

          {/* Bloque 2: Impresora Térmica ESC/POS */}
          <div className="bg-surface p-5 rounded-xl border border-border flex flex-col gap-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <Icon name="printer" className="w-5 h-5 text-brand" aria-hidden="true" />
                <h3 className="font-bold text-sm text-txt-primary">
                  Impresora Térmica (ESC/POS)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={connMode === 'VIRTUAL_PREVIEW' ? 'info' : 'success'}>
                  {PRINTER_MODE_LABELS[connMode]}
                </Badge>
                {isAdmin && (
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    isLoading={isActionLoading}
                    disabled={isLoading}
                    leftIcon={<Icon name="save" className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    Guardar
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Ancho de Papel Térmico"
                value={String(widthMm)}
                onChange={(e) => setWidthMm(Number(e.target.value) as 58 | 80)}
                disabled={!isAdmin || isActionLoading || isLoading}
                options={[
                  { value: '58', label: '58 mm (32 columnas por línea)' },
                  { value: '80', label: '80 mm (48 columnas por línea)' },
                ]}
              />

              <Select
                label="Modo de Conexión"
                value={connMode}
                onChange={(e) =>
                  setConnMode(e.target.value as PrinterConnectionMode)
                }
                disabled={!isAdmin || isActionLoading || isLoading}
                options={[
                  {
                    value: 'VIRTUAL_PREVIEW',
                    label: 'VIRTUAL_PREVIEW (Simulador en pantalla, 0 hardware)',
                  },
                  {
                    value: 'NETWORK_TCP',
                    label: 'NETWORK_TCP (Impresora de Red Local :9100)',
                  },
                  {
                    value: 'WINDOWS_RAW',
                    label: 'WINDOWS_RAW (Cola de impresión Windows)',
                  },
                ]}
              />
            </div>

            <Input
              label="Dirección de Destino / Recurso"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              disabled={
                !isAdmin ||
                connMode === 'VIRTUAL_PREVIEW' ||
                isActionLoading ||
                isLoading
              }
              placeholder={
                connMode === 'NETWORK_TCP'
                  ? '192.168.1.50:9100'
                  : connMode === 'WINDOWS_RAW'
                  ? 'POS-58 o USB001'
                  : 'No requerido en modo virtual'
              }
              hint={
                connMode === 'VIRTUAL_PREVIEW'
                  ? 'En modo virtual el sistema emula la impresión en memoria sin requerir impresora física.'
                  : 'Indica la IP y puerto (ej. 192.168.1.50:9100) o nombre de la impresora local.'
              }
            />

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="drawerCheck"
                checked={openDrawer}
                onChange={(e) => setOpenDrawer(e.target.checked)}
                disabled={!isAdmin || isActionLoading || isLoading}
                className="w-4 h-4 text-brand rounded border-border focus:ring-brand"
              />
              <label
                htmlFor="drawerCheck"
                className="text-xs text-txt-primary font-medium cursor-pointer"
              >
                Disparar pulso de apertura de gaveta de dinero en cobros en efectivo (ESC p)
              </label>
            </div>

            <Input
              label="Mensaje de Pie de Ticket"
              value={footerMessage}
              onChange={(e) => setFooterMessage(e.target.value)}
              disabled={!isAdmin || isActionLoading || isLoading}
              placeholder="Ej. ¡Gracias por entrenar en ZaramaGYM!"
            />
          </div>

          {/* Bloque 3: Configuración SMTP para Correo Electrónico */}
          <div className="bg-surface p-5 rounded-xl border border-border flex flex-col gap-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
              <div className="flex items-center gap-2">
                <Icon name="mail" className="w-5 h-5 text-brand" aria-hidden="true" />
                <h3 className="font-bold text-sm text-txt-primary">
                  Despacho de Comprobantes por Correo (SMTP)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {config?.has_smtp_password_configured && (
                  <Badge variant="success" size="sm">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="lock" className="w-3 h-3" aria-hidden="true" />
                      Contraseña en Keyring
                    </span>
                  </Badge>
                )}
                <Badge variant={smtpEnabled ? 'success' : 'default'} size="sm">
                  {smtpEnabled ? 'SMTP Activo' : 'Desactivado'}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSmtpGuideOpen(true)}
                  leftIcon={<Icon name="info" className="w-3.5 h-3.5" aria-hidden="true" />}
                >
                  Guía Paso a Paso SMTP
                </Button>
                {isAdmin && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAutofillGmail}
                    disabled={isActionLoading || isLoading}
                    leftIcon={<Icon name="sparkles" className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    Autocompletar Gmail
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    isLoading={isActionLoading}
                    disabled={isLoading}
                    leftIcon={<Icon name="save" className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    Guardar
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="smtpCheck"
                checked={smtpEnabled}
                onChange={(e) => setSmtpEnabled(e.target.checked)}
                disabled={!isAdmin || isActionLoading || isLoading}
                className="w-4 h-4 text-brand rounded border-border focus:ring-brand"
              />
              <label
                htmlFor="smtpCheck"
                className="text-xs text-txt-primary font-medium cursor-pointer"
              >
                Habilitar envío automático de comprobantes y reportes vía correo electrónico
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Input
                  label="Servidor SMTP Host"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  disabled={!isAdmin || !smtpEnabled || isActionLoading}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <Input
                label="Puerto"
                type="text"
                inputMode="numeric"
                value={smtpPort === 0 ? '' : String(smtpPort)}
                onChange={(e) => {
                  const clean = sanitizeIntegerInput(e.target.value);
                  setSmtpPort(clean ? Number(clean) : 0);
                }}
                disabled={!isAdmin || !smtpEnabled || isActionLoading}
                placeholder="587"
                required={smtpEnabled}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Usuario SMTP"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                disabled={!isAdmin || !smtpEnabled || isActionLoading}
                placeholder="notificaciones@zaramagym.pe"
              />
              <Input
                label="Correo Remitente (From)"
                type="email"
                value={smtpFromEmail}
                onChange={(e) => setSmtpFromEmail(e.target.value)}
                disabled={!isAdmin || !smtpEnabled || isActionLoading}
                placeholder="no-reply@zaramagym.pe"
              />
            </div>

            <Input
              label="Contraseña de Aplicación SMTP"
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              disabled={!isAdmin || !smtpEnabled || isActionLoading}
              placeholder={
                config?.has_smtp_password_configured
                  ? '•••••••• (Almacenada con cifrado seguro OS Keyring)'
                  : 'Ingresa la contraseña o App Password'
              }
              hint="Las credenciales nunca se guardan en texto plano; se cifran con el almacén seguro del sistema operativo."
            />
          </div>

          {/* Botón de Guardado */}
          {isAdmin && (
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                isLoading={isActionLoading}
                disabled={isLoading}
                leftIcon={<Icon name="save" className="w-4 h-4" aria-hidden="true" />}
              >
                Guardar Configuración de Impresión
              </Button>
            </div>
          )}
        </form>

        {/* Panel Lateral: Simulador de Ticket Térmico en Vivo */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex flex-col gap-3">
            <h4 className="font-bold text-xs uppercase tracking-wider text-txt-primary flex items-center gap-2">
              <Icon name="printer" className="w-4 h-4 text-brand" aria-hidden="true" />
              <span>Probar Emisión de Ticket Térmico</span>
            </h4>
            <p className="text-[11px] text-txt-muted">
              Puedes probar cómo se formatea el ticket monospaciado con los datos de una venta real registrada en el sistema.
            </p>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={testVentaId}
                  onChange={(e) => setTestVentaId(sanitizeIntegerInput(e.target.value))}
                  placeholder="ID de Venta"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-canvas text-txt-primary focus:ring-1 focus:ring-brand outline-none"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRunTestPrint}
                isLoading={isActionLoading}
              >
                Simular Ticket
              </Button>
            </div>

            {lastTicketResult?.message && (
              <div className="text-[10px] p-2 bg-canvas-subtle rounded border border-border text-txt-secondary">
                {lastTicketResult.message}
              </div>
            )}
          </div>

          <ThermalTicketPreview
            formattedText={lastTicketResult?.formatted_text}
            widthMm={simWidth}
            widthColumns={simWidth === 58 ? 32 : 48}
            isSimulated={lastTicketResult?.is_simulated ?? true}
            onWidthChange={setSimWidth}
            title="Vista Previa de Ticket Térmico"
          />
        </div>
      </div>

      {/* Modal: Guía Paso a Paso SMTP (Gmail App Password + Keyring) */}
      <Modal
        isOpen={isSmtpGuideOpen}
        onClose={() => setIsSmtpGuideOpen(false)}
        title="Guía Paso a Paso: Correo SMTP con Gmail"
        description="Configura el envío seguro de comprobantes usando una Contraseña de Aplicación de Google."
        size="lg"
        footer={
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsSmtpGuideOpen(false)}
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
              <span>Activar la Verificación en 2 Pasos en tu Cuenta Google</span>
            </div>
            <p className="text-txt-secondary pl-7">
              Ingresa a la configuración de seguridad de tu cuenta Gmail y habilita la{' '}
              <strong>Verificación en 2 pasos</strong> (requisito obligatorio de Google para emitir contraseñas de aplicación).
            </p>
          </div>

          <div className="p-3 rounded-lg bg-canvas-subtle border border-border flex flex-col gap-1">
            <div className="flex items-center gap-2 font-bold text-txt-primary">
              <span className="w-5 h-5 rounded-full bg-brand text-brand-text flex items-center justify-center text-[11px] shrink-0">
                2
              </span>
              <span>Generar Contraseña de Aplicación de 16 caracteres</span>
            </div>
            <p className="text-txt-secondary pl-7">
              Visita{' '}
              <span className="font-mono font-semibold text-txt-primary">
                myaccount.google.com/apppasswords
              </span>
              , crea una nueva contraseña con el nombre <strong>ZaramaGYM</strong> y copia la{' '}
              <strong>Contraseña de Aplicación de 16 caracteres</strong> generada (sin necesidad de usar tu contraseña personal de Gmail).
            </p>
          </div>

          <div className="p-3 rounded-lg bg-canvas-subtle border border-border flex flex-col gap-1">
            <div className="flex items-center gap-2 font-bold text-txt-primary">
              <span className="w-5 h-5 rounded-full bg-brand text-brand-text flex items-center justify-center text-[11px] shrink-0">
                3
              </span>
              <span>Completar Parámetros SMTP en ZaramaGYM</span>
            </div>
            <p className="text-txt-secondary pl-7">
              Haz clic en <strong>Autocompletar Gmail</strong> para rellenar{' '}
              <span className="font-mono">smtp.gmail.com</span> y puerto{' '}
              <span className="font-mono">587</span>, ingresa tu correo en Usuario SMTP y Remitente, y pega la clave de 16 caracteres en{' '}
              <strong>Contraseña de Aplicación SMTP</strong>.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
            <Icon name="lock" className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">
                Protección en Llavero Nativo de Windows (keyring)
              </span>
              <p className="opacity-90">
                ZaramaGYM nunca almacena tu contraseña SMTP en la base de datos ni en archivos de configuración; se guarda cifrada en el llavero nativo de Windows (<strong>keyring</strong>).
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
