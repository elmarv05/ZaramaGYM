// ============================================================================
// COMPONENTE: PANEL DE PAGOS MIXTOS Y CRÉDITO AUTOMÁTICO (PAYMENT SPLITTER)
// Desglose de Efectivo con vuelto, Medios Digitales y generación de Deudas
// Ubicación: src/features/pos/components/PaymentSplitter.tsx
// ============================================================================

import React from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon, IconName } from '../../../components/primitives/Icon';
import { formatMoney, PaymentSplitResult } from '../../../domain/pos';
import { PaymentMethod, PosPaymentInput } from '../../../types/pos';
import {
  formatDecimalOnBlur,
  sanitizeDecimalInput,
  selectIfZeroDefault,
} from '../../../utils/formSafety';

export interface PaymentSplitterProps {
  totalVenta: number;
  pagos: PosPaymentInput[];
  splitResult: PaymentSplitResult;
  hasCliente: boolean;
  onUpdatePayment: (metodo: PaymentMethod, monto: string, ref?: string) => void;
  onRemovePayment: (metodo: PaymentMethod) => void;
  onSubmitSale: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const METODOS: {
  id: PaymentMethod;
  label: string;
  icon: IconName;
  iconClassName: string;
  canal: 'FISICA' | 'DIGITAL';
}[] = [
  {
    id: 'EFECTIVO',
    label: 'Efectivo en Gaveta',
    icon: 'cash',
    iconClassName: 'text-status-success',
    canal: 'FISICA',
  },
  {
    id: 'YAPE',
    label: 'Yape Móvil',
    icon: 'smartphone',
    iconClassName: 'text-accent-indigo',
    canal: 'DIGITAL',
  },
  {
    id: 'PLIN',
    label: 'Plin',
    icon: 'smartphone',
    iconClassName: 'text-status-info',
    canal: 'DIGITAL',
  },
  {
    id: 'TRANSFERENCIA',
    label: 'Transferencia Bancaria',
    icon: 'bank',
    iconClassName: 'text-txt-secondary',
    canal: 'DIGITAL',
  },
  {
    id: 'TARJETA',
    label: 'Tarjeta (POS POSnet)',
    icon: 'credit-card',
    iconClassName: 'text-status-warning',
    canal: 'DIGITAL',
  },
];

export const PaymentSplitter: React.FC<PaymentSplitterProps> = ({
  totalVenta,
  pagos,
  splitResult,
  hasCliente,
  onUpdatePayment,
  onRemovePayment,
  onSubmitSale,
  isLoading = false,
  disabled = false,
}) => {
  const getPago = (metodo: PaymentMethod) => {
    return pagos.find((p) => p.metodo_pago === metodo);
  };

  const handleMontoChange = (metodo: PaymentMethod, valStr: string) => {
    const existing = getPago(metodo);
    onUpdatePayment(metodo, valStr, existing?.referencia_operacion);
  };

  const handleRefChange = (metodo: PaymentMethod, refStr: string) => {
    const existing = getPago(metodo);
    onUpdatePayment(metodo, existing ? existing.monto : '', refStr);
  };

  const handlePayFull = (metodo: PaymentMethod) => {
    onUpdatePayment(metodo, totalVenta.toFixed(2));
  };

  const isFormValid =
    totalVenta > 0 &&
    !splitResult.isOverpaidDigital &&
    (!splitResult.isCredito || hasCliente);

  return (
    <div className="w-full bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="font-bold text-txt-primary text-sm sm:text-base flex items-center gap-2">
          <Icon name="credit-card" className="w-4 h-4 text-brand" />
          <span>Medios de Pago y Split</span>
        </h3>
        <span className="text-xs text-txt-muted">
          Total: <strong className="text-txt-primary">S/ {formatMoney(totalVenta)}</strong>
        </span>
      </div>

      {/* Lista de Medios de Pago */}
      <div className="flex flex-col gap-3">
        {METODOS.map((m) => {
          const pago = getPago(m.id);
          const active = Boolean(pago && parseFloat(pago.monto) > 0);

          return (
            <div
              key={m.id}
              className={`p-3 rounded-lg border transition-all flex flex-col gap-2 ${
                active
                  ? 'bg-canvas-subtle border-brand/60 dark:border-brand/40 shadow-xs'
                  : 'bg-surface border-border/70 hover:border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name={m.icon} className={`w-4 h-4 ${m.iconClassName}`} />
                  <span className="font-semibold text-xs text-txt-primary">{m.label}</span>
                  {m.canal === 'DIGITAL' && (
                    <Badge variant="info" size="sm">
                      Digital
                    </Badge>
                  )}
                </div>

                {/* Atajo: Pagar Total y Quitar */}
                <div className="flex items-center gap-2">
                  {active && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemovePayment(m.id)}
                      className="text-[10px] font-semibold text-status-danger hover:underline disabled:opacity-40"
                    >
                      Quitar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={disabled || totalVenta <= 0}
                    onClick={() => handlePayFull(m.id)}
                    className="text-[11px] font-semibold text-brand hover:underline disabled:opacity-40"
                  >
                    Pagar 100%
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Input de Monto */}
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-txt-muted text-xs font-bold">S/</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={disabled}
                    value={pago ? pago.monto : ''}
                    onFocus={selectIfZeroDefault}
                    onChange={(e) => handleMontoChange(m.id, sanitizeDecimalInput(e.target.value))}
                    onBlur={(e) => {
                      const formatted = formatDecimalOnBlur(e.target.value, { min: 0 });
                      const v = parseFloat(formatted);
                      if (!isNaN(v) && v > 0) {
                        handleMontoChange(m.id, formatted);
                      } else {
                        onRemovePayment(m.id);
                      }
                    }}
                    placeholder="0.00"
                    aria-label={`Monto en ${m.label}`}
                    className="w-full text-xs font-bold pl-7 pr-3 py-1.5 rounded-md border border-border bg-surface text-txt-primary focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                {/* Referencia si es Digital */}
                {m.canal === 'DIGITAL' ? (
                  <input
                    type="text"
                    disabled={disabled}
                    value={pago?.referencia_operacion || ''}
                    onChange={(e) => handleRefChange(m.id, e.target.value)}
                    placeholder="Nº Operación / Voucher (Opcional)"
                    aria-label={`Referencia para ${m.label}`}
                    className="w-full text-xs pl-3 pr-3 py-1.5 rounded-md border border-border bg-surface text-txt-primary focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                ) : (
                  <div className="flex items-center text-[11px] text-txt-muted px-2">
                    {splitResult.vueltoEfectivo > 0 && active ? (
                      <span className="text-status-success font-bold">
                        Vuelto: S/ {splitResult.vueltoEfectivoStr}
                      </span>
                    ) : (
                      <span>Efectivo exacto en caja</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Alertas de Validación */}
      {splitResult.isOverpaidDigital && (
        <div className="p-3 bg-status-danger-bg border border-status-danger/30 border-l-4 border-l-status-danger rounded-lg text-xs text-status-danger flex items-start gap-2">
          <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            El pago digital excede el total de la venta. Ajusta el monto transferido o registrado con tarjeta.
          </span>
        </div>
      )}

      {splitResult.isCredito && !hasCliente && (
        <div className="p-3 bg-status-warning-bg border border-status-warning/30 border-l-4 border-l-status-warning rounded-lg text-xs text-status-warning flex items-start gap-2">
          <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            El pago parcial generará una deuda por <strong>S/ {splitResult.saldoCreditoGeneradoStr}</strong>. Debes seleccionar un cliente registrado para emitir el crédito.
          </span>
        </div>
      )}

      {/* Resumen Final de Transacción */}
      <div className="bg-canvas-subtle p-3.5 rounded-lg border border-border flex flex-col gap-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-txt-secondary">Efectivo Recibido:</span>
          <span className="font-semibold text-txt-primary">S/ {splitResult.montoEfectivoEntregadoStr}</span>
        </div>
        {splitResult.vueltoEfectivo > 0 && (
          <div className="flex justify-between font-bold text-status-success">
            <span>Vuelto a Entregar:</span>
            <span>S/ {splitResult.vueltoEfectivoStr}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-txt-secondary">Total Pagos Digitales:</span>
          <span className="font-semibold text-txt-primary">S/ {splitResult.montoPagadoDigitalStr}</span>
        </div>
        {splitResult.isCredito && (
          <div className="flex justify-between font-bold text-status-warning pt-1 border-t border-border">
            <span>Saldo a Crédito (Deuda):</span>
            <span>S/ {splitResult.saldoCreditoGeneradoStr}</span>
          </div>
        )}
      </div>

      {/* Botón de Envío */}
      <Button
        type="button"
        variant="primary"
        onClick={onSubmitSale}
        disabled={disabled || !isFormValid || totalVenta <= 0}
        isLoading={isLoading}
        leftIcon={<Icon name="check" className="w-4 h-4" />}
        className="w-full py-2.5 font-extrabold text-sm shadow-sm"
      >
        Registrar Venta (POS)
      </Button>
    </div>
  );
};
