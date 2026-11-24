// ============================================================================
// COMPONENTE: MODAL DE DETALLE DE VENTA POS (SALE DETAIL MODAL)
// Comprobante detallado con ítems, medios de pago, emisión de comprobantes,
// ticket térmico ESC/POS y PDF en RAM (Slice 8)
// Ubicación: src/features/pos/components/SaleDetailModal.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { Input } from '../../../components/primitives/Input';
import { Modal } from '../../../components/primitives/Modal';
import { Select } from '../../../components/primitives/Select';
import { formatMoney } from '../../../domain/pos';
import {
  printThermalTicketText,
  triggerBase64PdfDownload,
  validateEmailDispatchInput,
  validateIssueReceiptInput,
} from '../../../domain/printingBackup';
import { ThermalTicketPreview } from '../../printing_backup/components/ThermalTicketPreview';
import { entityIpc } from '../../../services/ipc/entityIpc';
import { printingBackupIpc } from '../../../services/ipc/printingBackupIpc';
import { SaleDetailDto } from '../../../types/pos';
import {
  IssuedReceipt,
  PrintTicketResult,
  ReceiptType,
} from '../../../types/printingBackup';
import { preventEnterKeySubmit } from '../../../utils/formSafety';

export interface SaleDetailModalProps {
  isOpen: boolean;
  sale: SaleDetailDto | null;
  onClose: () => void;
  onStrikeClick?: (sale: SaleDetailDto) => void;
  canStrike?: boolean;
}

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({
  isOpen,
  sale,
  onClose,
  onStrikeClick,
  canStrike = false,
}) => {
  // Estado documental
  const [issuedReceipt, setIssuedReceipt] = useState<IssuedReceipt | null>(null);
  const [tipoComprobante, setTipoComprobante] = useState<ReceiptType>('BOLETA');
  const [receptorRuc, setReceptorRuc] = useState('');
  const [receptorRazonSocial, setReceptorRazonSocial] = useState('');
  const [receptorDni, setReceptorDni] = useState('');
  const [ticketWidth, setTicketWidth] = useState<58 | 80>(80);
  const [ticketResult, setTicketResult] = useState<PrintTicketResult | null>(null);
  const [showThermalPreview, setShowThermalPreview] = useState(false);

  // Email state
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');

  // Loading & Feedback
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docSuccess, setDocSuccess] = useState<string | null>(null);

  // Consultar comprobante emitido previo si existe
  useEffect(() => {
    if (isOpen && sale) {
      setDocError(null);
      setDocSuccess(null);
      setTicketResult(null);
      setShowThermalPreview(false);
      setEmailOpen(false);

      printingBackupIpc
        .getSaleReceipt(sale.id)
        .then((res) => {
          if (res) {
            setIssuedReceipt(res);
            setTipoComprobante(res.tipo_comprobante);
          } else {
            setIssuedReceipt(null);
          }
        })
        .catch(() => {
          setIssuedReceipt(null);
        });
    }
  }, [isOpen, sale]);

  if (!sale) return null;

  const getStatusBadge = () => {
    switch (sale.estado_venta) {
      case 'COMPLETADA':
        return <Badge variant="success">Completada</Badge>;
      case 'TACHADA_EN_TURNO':
        return <Badge variant="warning">Tachada en Turno</Badge>;
      case 'ANULADA_DEFINITIVA':
        return <Badge variant="danger">Anulada Definitiva</Badge>;
      default:
        return null;
    }
  };

  // Handler: Emitir Comprobante y Ver Ticket Térmico
  const handlePrintOrPreviewTicket = async () => {
    setDocError(null);
    setDocSuccess(null);
    setDocLoading(true);

    try {
      // 1. Validar si es Factura
      const validation = validateIssueReceiptInput({
        venta_id: sale.id,
        tipo_comprobante: tipoComprobante,
        receptor_tipo_doc:
          tipoComprobante === 'FACTURA'
            ? 'RUC'
            : tipoComprobante === 'BOLETA' && receptorDni.trim()
            ? 'DNI'
            : 'SIN_DOC',
        receptor_numero_doc:
          tipoComprobante === 'FACTURA'
            ? receptorRuc.trim()
            : tipoComprobante === 'BOLETA'
            ? receptorDni.trim()
            : undefined,
        receptor_razon_nombre:
          tipoComprobante === 'FACTURA'
            ? receptorRazonSocial.trim()
            : sale.cliente_nombre_completo || 'CLIENTE GENERAL',
      });

      if (!validation.isValid) {
        setDocError(validation.error || 'Datos de comprobante inválidos');
        setDocLoading(false);
        return;
      }

      // 2. Emitir comprobante si no existe aún
      const receipt = await printingBackupIpc.issueSaleReceipt({
        venta_id: sale.id,
        tipo_comprobante: tipoComprobante,
        receptor_tipo_doc:
          tipoComprobante === 'FACTURA'
            ? 'RUC'
            : tipoComprobante === 'BOLETA' && receptorDni.trim()
            ? 'DNI'
            : 'SIN_DOC',
        receptor_numero_doc:
          tipoComprobante === 'FACTURA'
            ? receptorRuc.trim()
            : tipoComprobante === 'BOLETA'
            ? receptorDni.trim()
            : undefined,
        receptor_razon_nombre:
          tipoComprobante === 'FACTURA'
            ? receptorRazonSocial.trim()
            : sale.cliente_nombre_completo || 'CLIENTE GENERAL',
      });

      setIssuedReceipt(receipt);

      // 3. Generar / Despachar Ticket Térmico
      const ticketRes = await printingBackupIpc.printSaleTicket({
        venta_id: sale.id,
        forced_width_mm: ticketWidth,
      });

      setTicketResult(ticketRes);
      setShowThermalPreview(true);
      setDocSuccess(`Comprobante ${receipt.numero_formateado} emitido y ticket generado.`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al emitir o imprimir comprobante.';
      setDocError(msg);
    } finally {
      setDocLoading(false);
    }
  };

  // Handler: Descargar PDF en RAM
  const handleDownloadPdf = async () => {
    setDocError(null);
    setDocSuccess(null);
    setDocLoading(true);

    try {
      // Si no tiene comprobante emitido, emitirlo por defecto con el tipo seleccionado
      if (!issuedReceipt) {
        const receipt = await printingBackupIpc.issueSaleReceipt({
          venta_id: sale.id,
          tipo_comprobante: tipoComprobante,
          receptor_tipo_doc:
            tipoComprobante === 'FACTURA'
              ? 'RUC'
              : tipoComprobante === 'BOLETA' && receptorDni.trim()
              ? 'DNI'
              : 'SIN_DOC',
          receptor_numero_doc:
            tipoComprobante === 'FACTURA'
              ? receptorRuc.trim()
              : tipoComprobante === 'BOLETA'
              ? receptorDni.trim()
              : undefined,
          receptor_razon_nombre:
            tipoComprobante === 'FACTURA'
              ? receptorRazonSocial.trim()
              : sale.cliente_nombre_completo || 'CLIENTE GENERAL',
        });
        setIssuedReceipt(receipt);
      }

      const pdfRes = await printingBackupIpc.generateSaleReceiptPdf(sale.id);
      triggerBase64PdfDownload(pdfRes.pdf_base64, pdfRes.filename);
      setDocSuccess(`PDF ${pdfRes.filename} descargado exitosamente en RAM.`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error generando PDF en RAM.';
      setDocError(msg);
    } finally {
      setDocLoading(false);
    }
  };

  // Handler: Enviar Comprobante por Correo Electrónico
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setDocError(null);
    setDocSuccess(null);

    const valEmail = validateEmailDispatchInput(emailInput);
    if (!valEmail.isValid) {
      setDocError(valEmail.error || 'Correo no válido');
      return;
    }

    setDocLoading(true);
    try {
      const emailRes = await printingBackupIpc.sendReceiptEmail({
        venta_id: sale.id,
        destinatario_email: emailInput.trim(),
      });

      setDocSuccess(emailRes.message || 'Comprobante despachado por correo.');
      setEmailOpen(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al enviar comprobante por correo.';
      setDocError(msg);
    } finally {
      setDocLoading(false);
    }
  };

  // Handler: Enviar resumen de venta/comprobante por WhatsApp en 1 clic
  const handleSendWhatsApp = async () => {
    setDocError(null);
    setDocSuccess(null);
    const comprobanteLabel = issuedReceipt
      ? `${issuedReceipt.tipo_comprobante} ${issuedReceipt.numero_formateado}`
      : `Venta #${sale.id}`;
    const clienteLabel = sale.cliente_nombre_completo || 'Cliente';
    const itemsText =
      sale.items && sale.items.length > 0
        ? sale.items
            .map((it) => `- ${it.cantidad}x ${it.descripcion} (S/ ${formatMoney(it.subtotal)})`)
            .join('\n')
        : '';
    const summaryLines = [
      `Hola ${clienteLabel}, gracias por tu compra en *ZaramaGYM*.`,
      `Comprobante: *${comprobanteLabel}*`,
      `Fecha: ${sale.created_at}`,
      ...(itemsText ? [`Detalle:\n${itemsText}`] : []),
      `Total: *S/ ${formatMoney(sale.total_venta)}*`,
      ...(parseFloat(sale.saldo_credito_generado) > 0
        ? [`Saldo pendiente: S/ ${formatMoney(sale.saldo_credito_generado)}`]
        : []),
    ];
    const url = `https://wa.me/?text=${encodeURIComponent(summaryLines.join('\n'))}`;

    try {
      await entityIpc.openExternalUrl(url);
      setDocSuccess('Resumen de compra abierto en WhatsApp.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'No se pudo abrir WhatsApp.';
      setDocError(msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Detalle de Venta #${sale.id}`}
      description={`Registrada el ${sale.created_at} por @${sale.usuario_vendedor_username}`}
      size="xl"
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Cabecera de Estado y Turno */}
        <div className="bg-canvas-subtle p-3.5 rounded-xl border border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-txt-secondary">Estado:</span>
            {getStatusBadge()}
          </div>
          <div>
            <span className="text-txt-muted">Turno de Caja: </span>
            <strong className="text-txt-primary">#{sale.turno_caja_id}</strong>
          </div>
          <div>
            <span className="text-txt-muted">Cliente: </span>
            <strong className="text-txt-primary">
              {sale.cliente_nombre_completo || 'Público General'}
            </strong>
          </div>
          {issuedReceipt && (
            <div>
              <span className="text-txt-muted">Comprobante: </span>
              <strong className="text-brand font-mono font-bold">
                {issuedReceipt.numero_formateado}
              </strong>
            </div>
          )}
        </div>

        {/* Sección de Ítems */}
        <div className="flex flex-col gap-1.5">
          <h4 className="font-bold text-txt-primary text-xs uppercase tracking-wider">
            Ítems de la Venta
          </h4>
          <div
            tabIndex={0}
            className="border border-border rounded-lg overflow-x-auto overscroll-x-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <table className="w-full min-w-[440px] text-left">
              <thead className="bg-canvas-subtle text-[11px] text-txt-muted uppercase font-bold border-b border-border">
                <tr>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-2 py-2 text-center">Cant.</th>
                  <th className="px-3 py-2 text-right">P. Unitario</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sale.items?.map((item) => (
                  <tr key={item.id} className="hover:bg-canvas-subtle/30">
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-semibold text-txt-primary">{item.descripcion}</span>
                        {item.tipo_item === 'PLAN' && item.fecha_inicio_plan && (
                          <span className="text-[10px] text-txt-muted">
                            Vigencia: {item.fecha_inicio_plan} a {item.fecha_fin_plan}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center text-txt-primary">{item.cantidad}</td>
                    <td className="px-3 py-2 text-right text-txt-secondary">S/ {formatMoney(item.precio_unitario)}</td>
                    <td className="px-3 py-2 text-right font-bold text-txt-primary">S/ {formatMoney(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Desglose de Pagos */}
        <div className="flex flex-col gap-1.5">
          <h4 className="font-bold text-txt-primary text-xs uppercase tracking-wider">
            Medios de Pago Aplicados
          </h4>
          <div
            tabIndex={0}
            className="border border-border rounded-lg overflow-x-auto overscroll-x-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <table className="w-full min-w-[420px] text-left">
              <thead className="bg-canvas-subtle text-[11px] text-txt-muted uppercase font-bold border-b border-border">
                <tr>
                  <th className="px-3 py-2">Método</th>
                  <th className="px-2 py-2">Canal</th>
                  <th className="px-3 py-2">Referencia</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sale.pagos?.map((pago) => (
                  <tr key={pago.id}>
                    <td className="px-3 py-2 font-semibold text-txt-primary">{pago.metodo_pago}</td>
                    <td className="px-2 py-2 text-txt-muted">{pago.canal_caja}</td>
                    <td className="px-3 py-2 text-txt-secondary">{pago.referencia_operacion || '-'}</td>
                    <td className="px-3 py-2 text-right font-bold text-txt-primary">S/ {formatMoney(pago.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totales */}
        <div className="bg-canvas-subtle p-3 rounded-xl border border-border flex flex-col gap-1.5">
          <div className="flex justify-between">
            <span className="text-txt-secondary">Subtotal:</span>
            <span className="font-semibold text-txt-primary">S/ {formatMoney(sale.subtotal)}</span>
          </div>
          {parseFloat(sale.descuento) > 0 && (
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>Descuento Aplicado:</span>
              <span>- S/ {formatMoney(sale.descuento)}</span>
            </div>
          )}
          <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-border">
            <span>Total Venta:</span>
            <span className="text-emerald-700 dark:text-emerald-400">S/ {formatMoney(sale.total_venta)}</span>
          </div>
          {parseFloat(sale.saldo_credito_generado) > 0 && (
            <div className="flex justify-between text-amber-700 dark:text-amber-400 font-bold">
              <span>Saldo a Crédito Generado:</span>
              <span>S/ {formatMoney(sale.saldo_credito_generado)}</span>
            </div>
          )}
        </div>

        {/* Trazabilidad de Tachado si aplica */}
        {sale.estado_venta !== 'COMPLETADA' && (
          <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-900 flex flex-col gap-1">
            <span className="font-bold text-amber-900 dark:text-amber-200 inline-flex items-center gap-1.5">
              <Icon name="scissors" className="w-4 h-4" aria-hidden="true" />
              Registro de Tachado:
            </span>
            <p className="text-[11px] text-txt-secondary">
              Tachado por @{sale.tachado_por_username} el {sale.fecha_tachado}: "{sale.motivo_tachado}"
            </p>
            {sale.resuelto_por_admin_username && (
              <p className="text-[11px] text-txt-primary font-medium pt-1 border-t border-amber-200 dark:border-amber-800">
                Resuelto por @{sale.resuelto_por_admin_username} el {sale.fecha_resolucion_tachado}: "{sale.nota_resolucion_tachado || 'Sin nota adicional'}"
              </p>
            )}
          </div>
        )}

        {/* SECCIÓN DOCUMENTAL: COMPROBANTES, TICKET TÉRMICO Y PDF EN RAM (SLICE 8) */}
        <div className="bg-surface p-4 rounded-xl border border-border flex flex-col gap-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Icon name="receipt" className="w-4 h-4 text-brand" aria-hidden="true" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-txt-primary">
                Comprobante Fiscal, Ticket Térmico y PDF en RAM
              </h4>
            </div>
            {issuedReceipt && (
              <Badge variant="success" size="sm">
                Emitido: {issuedReceipt.numero_formateado}
              </Badge>
            )}
          </div>

          {docError && (
            <Alert variant="danger" title="Error Documental" onClose={() => setDocError(null)}>
              {docError}
            </Alert>
          )}

          {docSuccess && (
            <Alert variant="success" title="Operación Exitosa" onClose={() => setDocSuccess(null)}>
              {docSuccess}
            </Alert>
          )}

          {/* Selector de Comprobante si aún no se ha emitido */}
          {!issuedReceipt && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Select
                  label="Tipo de Comprobante"
                  value={tipoComprobante}
                  onChange={(e) => setTipoComprobante(e.target.value as ReceiptType)}
                  options={[
                    { value: 'BOLETA', label: 'Boleta de Venta (B001)' },
                    { value: 'NOTA_VENTA', label: 'Nota de Venta (NV01)' },
                    { value: 'FACTURA', label: 'Factura Comercial (F001)' },
                  ]}
                  disabled={docLoading}
                />

                {tipoComprobante === 'BOLETA' && (
                  <div className="sm:col-span-2">
                    <Input
                      label="DNI del Cliente (Opcional)"
                      value={receptorDni}
                      onChange={(e) => setReceptorDni(e.target.value)}
                      placeholder="8 dígitos numéricos"
                      maxLength={8}
                      disabled={docLoading}
                    />
                  </div>
                )}

                {tipoComprobante === 'FACTURA' && (
                  <>
                    <Input
                      label="RUC de Empresa (Obligatorio)"
                      value={receptorRuc}
                      onChange={(e) => setReceptorRuc(e.target.value)}
                      placeholder="11 dígitos (10... o 20...)"
                      maxLength={11}
                      disabled={docLoading}
                      required
                    />
                    <Input
                      label="Razón Social Legal (Obligatorio)"
                      value={receptorRazonSocial}
                      onChange={(e) => setReceptorRazonSocial(e.target.value)}
                      placeholder="Ej. Empresa S.A.C."
                      disabled={docLoading}
                      required
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Barra de Acciones de Documentos */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handlePrintOrPreviewTicket}
              isLoading={docLoading}
              leftIcon={<Icon name="receipt" className="w-4 h-4" aria-hidden="true" />}
            >
              Emitir / Ver Ticket (58/80mm)
            </Button>

            {showThermalPreview && ticketResult && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  printThermalTicketText(ticketResult.formatted_text, ticketWidth)
                }
                leftIcon={<Icon name="printer" className="w-4 h-4" aria-hidden="true" />}
              >
                Imprimir Ticket Ahora
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDownloadPdf}
              isLoading={docLoading}
              leftIcon={<Icon name="download" className="w-4 h-4" aria-hidden="true" />}
            >
              Descargar PDF en RAM
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEmailOpen(!emailOpen)}
              leftIcon={<Icon name="mail" className="w-4 h-4" aria-hidden="true" />}
            >
              Enviar PDF por Correo
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSendWhatsApp()}
              leftIcon={<Icon name="smartphone" className="w-4 h-4 text-status-success" aria-hidden="true" />}
            >
              Enviar por WhatsApp
            </Button>
          </div>

          {/* Formulario rápido de Envío de Email */}
          {emailOpen && (
            <form
              noValidate
              onSubmit={handleSendEmail}
              onKeyDown={preventEnterKeySubmit}
              className="p-3 bg-canvas-subtle rounded-lg border border-border flex flex-col sm:flex-row items-center gap-2"
            >
              <div className="flex-1 w-full">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="cliente@correo.com"
                  className="w-full px-3 py-1.5 text-xs rounded-md border border-border bg-canvas text-txt-primary outline-none focus:ring-1 focus:ring-brand"
                  required
                />
              </div>
              <Button type="submit" variant="primary" size="sm" isLoading={docLoading}>
                Enviar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEmailOpen(false)}
              >
                Cancelar
              </Button>
            </form>
          )}

          {/* Simulador de Ticket Térmico en Pantalla */}
          {showThermalPreview && ticketResult && (
            <div className="pt-2">
              <ThermalTicketPreview
                formattedText={ticketResult.formatted_text}
                widthMm={ticketWidth}
                widthColumns={ticketResult.width_columns}
                isSimulated={ticketResult.is_simulated}
                onWidthChange={(w) => {
                  setTicketWidth(w);
                  printingBackupIpc
                    .printSaleTicket({
                      venta_id: sale.id,
                      forced_width_mm: w,
                    })
                    .then(setTicketResult)
                    .catch(() => {});
                }}
                title={`Ticket de Venta #${sale.id}`}
              />
            </div>
          )}
        </div>

        {/* Footer del Modal */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          {canStrike && sale.estado_venta === 'COMPLETADA' && onStrikeClick ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => onStrikeClick(sale)}
              leftIcon={<Icon name="scissors" className="w-4 h-4" aria-hidden="true" />}
            >
              Tachar Venta
            </Button>
          ) : <div />}

          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
};
