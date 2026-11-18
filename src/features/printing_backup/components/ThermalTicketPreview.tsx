// ============================================================================
// COMPONENTE: SIMULADOR DE TICKET TÉRMICO ESC/POS (58mm / 80mm)
// Renderizado monospaciado con aspecto de ticket térmico realista
// Ubicación: src/features/printing_backup/components/ThermalTicketPreview.tsx
// ============================================================================

import React from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { printThermalTicketText } from '../../../domain/printingBackup';

export interface ThermalTicketPreviewProps {
  formattedText?: string;
  widthMm?: 58 | 80;
  widthColumns?: number;
  isSimulated?: boolean;
  onWidthChange?: (width: 58 | 80) => void;
  onPrintClick?: () => void;
  title?: string;
  className?: string;
}

export const ThermalTicketPreview: React.FC<ThermalTicketPreviewProps> = ({
  formattedText = '',
  widthMm = 80,
  widthColumns = 48,
  isSimulated = true,
  onWidthChange,
  onPrintClick,
  title = 'Simulador de Ticket Térmico',
  className = '',
}) => {
  const [copied, setCopied] = React.useState(false);

  const sampleTicketText58 = [
    '================================',
    '    ZARAMAGYM FITNESS CENTER    ',
    '        ZARAMAGYM S.A.C.        ',
    '      R.U.C.: 20600000001       ',
    '================================',
    'TICKET / BOLETA: B001-000001    ',
    'FECHA: 2026-11-15 10:30         ',
    '--------------------------------',
    '1x Plan Mensual           120.00',
    '1x Proteina Whey           85.00',
    '--------------------------------',
    'TOTAL:                PEN 205.00',
    'PAGO: EFECTIVO        PEN 205.00',
    '================================',
    '    ¡Gracias por entrenar en    ',
    '           ZaramaGYM!           ',
  ].join('\n');

  const sampleTicketText80 = [
    '================================================',
    '            ZARAMAGYM FITNESS CENTER            ',
    '                ZARAMAGYM S.A.C.                ',
    '              R.U.C.: 20600000001               ',
    '         Av. Principal 123 - Lima, Peru         ',
    '================================================',
    'COMPROBANTE: BOLETA DE VENTA B001-000001        ',
    'FECHA EMISIÓN: 2026-11-15 10:30:00              ',
    'CLIENTE: JUAN PÉREZ (DNI: 72345678)             ',
    '------------------------------------------------',
    'CANT DESCRIPCION               P.UNIT   SUBTOTAL',
    '------------------------------------------------',
    '1    Membresia Mensual VIP     120.00     120.00',
    '1    Proteina Whey Isolate 1kg  85.00      85.00',
    '------------------------------------------------',
    'SUBTOTAL:                             PEN 205.00',
    'TOTAL A PAGAR:                        PEN 205.00',
    'MEDIO DE PAGO: EFECTIVO               PEN 205.00',
    '================================================',
    '      ¡Gracias por entrenar en ZaramaGYM!       ',
  ].join('\n');

  const displayText =
    formattedText.trim() ||
    (widthMm === 58 ? sampleTicketText58 : sampleTicketText80);

  const handleCopy = () => {
    if (!displayText) return;
    navigator.clipboard?.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBrowserPrintTicket = () => {
    if (onPrintClick) {
      onPrintClick();
      return;
    }
    printThermalTicketText(displayText, widthMm);
  };

  return (
    <div
      className={`flex flex-col bg-canvas-subtle p-4 rounded-xl border border-border ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border mb-3">
        <div className="flex items-center gap-2">
          <Icon name="printer" className="w-4 h-4 text-brand" aria-hidden="true" />
          <span className="font-bold text-xs uppercase tracking-wider text-txt-primary">
            {title}
          </span>
          <Badge variant={isSimulated ? 'info' : 'success'} size="sm">
            {isSimulated ? 'Modo Virtual' : 'Impresión Física'}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onWidthChange && (
            <div className="inline-flex rounded-md shadow-sm border border-border p-0.5 bg-canvas">
              <button
                type="button"
                onClick={() => onWidthChange(58)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                  widthMm === 58
                    ? 'bg-brand text-brand-text'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                58mm (32 cols)
              </button>
              <button
                type="button"
                onClick={() => onWidthChange(80)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                  widthMm === 80
                    ? 'bg-brand text-brand-text'
                    : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >
                80mm (48 cols)
              </button>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            leftIcon={
              <Icon
                name={copied ? 'check' : 'audit'}
                className="w-3.5 h-3.5"
                aria-hidden="true"
              />
            }
            className="text-xs"
          >
            {copied ? 'Copiado' : 'Copiar'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleBrowserPrintTicket}
            leftIcon={<Icon name="printer" className="w-3.5 h-3.5" aria-hidden="true" />}
            className="text-xs"
          >
            Imprimir
          </Button>
        </div>
      </div>

      {/* Papel térmico con estilo visual simétrico */}
      <div className="flex justify-center p-2 bg-canvas/60 rounded-lg overflow-x-auto">
        <pre className="w-fit max-w-full mx-auto my-0 px-4 py-4 font-mono text-[11px] leading-snug bg-white text-zinc-900 shadow-md rounded border border-zinc-300 whitespace-pre overflow-x-auto select-all">
          {displayText}
        </pre>
      </div>

      <div className="mt-2 text-[10px] text-txt-muted flex items-center justify-between">
        <span>Ancho: {widthMm}mm ({widthColumns} columnas de caracteres)</span>
        <span>Cero consumo de papel en simulación</span>
      </div>
    </div>
  );
};
