// ============================================================================
// COMPONENTE: MODAL DE ARQUEO FÍSICO Y CIERRE DE TURNO (CLOSE SHIFT MODAL)
// Comparativa en vivo de conteo físico vs efectivo esperado y segregación digital
// Ubicación: src/features/pos/components/CloseShiftModal.tsx
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { Input } from '../../../components/primitives/Input';
import { Modal } from '../../../components/primitives/Modal';
import { calculateCashDifference, formatMoney } from '../../../domain/pos';
import { CashShiftDto, CloseCashShiftInput } from '../../../types/pos';
import {
  formatDecimalOnBlur,
  preventEnterKeySubmit,
  roundMonetary,
  sanitizeDecimalInput,
  selectIfZeroDefault,
} from '../../../utils/formSafety';

export interface CloseShiftModalProps {
  isOpen: boolean;
  shift: CashShiftDto | null;
  onClose: () => void;
  onSubmit: (input: CloseCashShiftInput) => Promise<any>;
  isLoading?: boolean;
}

export const CloseShiftModal: React.FC<CloseShiftModalProps> = ({
  isOpen,
  shift,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [declarado, setDeclarado] = useState<string>(
    shift ? shift.total_efectivo_esperado : '0.00'
  );
  const [notas, setNotas] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDeclarado(shift ? shift.total_efectivo_esperado : '0.00');
      setErrorMsg(null);
    }
  }, [shift, isOpen]);

  const esperado = shift ? parseFloat(shift.total_efectivo_esperado) || 0 : 0;

  const arqueo = useMemo(() => {
    return calculateCashDifference(declarado, esperado);
  }, [declarado, esperado]);

  if (!shift) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(declarado);
    if (isNaN(val) || val < 0) {
      setErrorMsg('El monto físico declarado no puede ser negativo o inválido');
      return;
    }

    const formattedDeclarado = roundMonetary(val).toFixed(2);
    setDeclarado(formattedDeclarado);

    try {
      await onSubmit({
        monto_cierre_fisico_declarado: formattedDeclarado,
        notas_cierre: notas.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al cerrar el turno de caja');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Arqueo Físico y Cierre de Turno de Caja"
      description={`Cierre de operaciones para el Turno #${shift.id}. Declara el efectivo físico contado en gaveta.`}
      size="lg"
    >
      <form noValidate onSubmit={handleSubmit} onKeyDown={preventEnterKeySubmit} className="flex flex-col gap-4">
        {errorMsg && (
          <Alert variant="danger" title="Error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        {/* Resumen del Turno y Cuadratura */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-canvas-subtle p-3.5 rounded-xl border border-border">
          <div className="flex flex-col gap-1 text-xs">
            <span className="text-txt-muted font-bold uppercase tracking-wider text-[10px] inline-flex items-center gap-1.5">
              <Icon name="cash" className="w-3.5 h-3.5" aria-hidden="true" />
              Caja Física (Gaveta)
            </span>
            <div className="flex justify-between py-0.5">
              <span className="text-txt-secondary">Fondo Inicial:</span>
              <span className="font-semibold text-txt-primary">S/ {formatMoney(shift.monto_apertura_fisico)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-txt-secondary">Ventas Efectivo:</span>
              <span className="font-semibold text-txt-primary">S/ {formatMoney(shift.total_ventas_efectivo)}</span>
            </div>
            <div className="flex justify-between py-0.5 pt-1 border-t border-border font-bold">
              <span className="text-emerald-700 dark:text-emerald-400">Total Esperado:</span>
              <span className="text-emerald-700 dark:text-emerald-400 text-sm">
                S/ {formatMoney(shift.total_efectivo_esperado)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs sm:border-l sm:border-border sm:pl-3">
            <span className="text-txt-muted font-bold uppercase tracking-wider text-[10px] inline-flex items-center gap-1.5">
              <Icon name="smartphone" className="w-3.5 h-3.5" aria-hidden="true" />
              Caja Digital (Vouchers Electrónicos)
            </span>
            <div className="flex justify-between py-0.5">
              <span className="text-txt-secondary">Yape / Plin:</span>
              <span className="font-semibold text-txt-primary">
                S/ {formatMoney(
                  (parseFloat(shift.desglose_digital.yape) || 0) +
                    (parseFloat(shift.desglose_digital.plin) || 0)
                )}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-txt-secondary">Transf. / Tarjetas:</span>
              <span className="font-semibold text-txt-primary">
                S/ {formatMoney(
                  (parseFloat(shift.desglose_digital.transferencia) || 0) +
                    (parseFloat(shift.desglose_digital.tarjeta) || 0)
                )}
              </span>
            </div>
            <div className="flex justify-between py-0.5 pt-1 border-t border-border font-bold">
              <span className="text-sky-700 dark:text-sky-400">Total Digital:</span>
              <span className="text-sky-700 dark:text-sky-400 text-sm">
                S/ {formatMoney(shift.total_ventas_digital)}
              </span>
            </div>
          </div>
        </div>

        {/* Declaración de Conteo Físico */}
        <div className="flex flex-col gap-2 p-3 bg-surface border border-border rounded-xl">
          <label htmlFor="declared-amount-input" className="text-xs font-bold text-txt-primary">
            Efectivo Físico Contado en Gaveta (Declarado) <span className="text-status-danger">*</span>
          </label>
          <Input
            id="declared-amount-input"
            type="text"
            inputMode="decimal"
            value={declarado}
            onFocus={selectIfZeroDefault}
            onChange={(e) => {
              setDeclarado(sanitizeDecimalInput(e.target.value));
              setErrorMsg(null);
            }}
            onBlur={(e) => {
              setDeclarado(formatDecimalOnBlur(e.target.value, { min: 0, fallback: '' }));
            }}
            leftIcon={<span className="text-sm font-bold text-txt-muted">S/</span>}
            required
            className="font-extrabold text-base text-txt-primary"
            placeholder="0.00"
            autoFocus
          />

          {/* Resultado del Arqueo en Vivo */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-txt-secondary font-medium">Estado del Arqueo:</span>
            {arqueo.estado === 'CUADRE_EXACTO' && (
              <Badge variant="success" size="md">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="check" className="w-3.5 h-3.5" aria-hidden="true" />
                  Cuadre Exacto (S/ 0.00)
                </span>
              </Badge>
            )}
            {arqueo.estado === 'SOBRANTE' && (
              <Badge variant="info" size="md">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-status-success" aria-hidden="true" />
                  Sobrante: +S/ {arqueo.diferenciaStr}
                </span>
              </Badge>
            )}
            {arqueo.estado === 'FALTANTE' && (
              <Badge variant="danger" size="md">
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="warning" className="w-3.5 h-3.5" aria-hidden="true" />
                  Faltante: S/ {arqueo.diferenciaStr}
                </span>
              </Badge>
            )}
          </div>
        </div>

        {/* Observaciones de Cierre */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="close-shift-notes" className="text-xs font-bold text-txt-primary">
            Notas de Cierre y Justificación de Arqueo
          </label>
          <textarea
            id="close-shift-notes"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observaciones de caja, conteo de billetes, justificativo si hubo faltante..."
            className="w-full text-xs rounded-lg border border-border bg-surface px-3 py-2 text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="danger"
            isLoading={isLoading}
            leftIcon={<Icon name="lock" className="w-4 h-4" aria-hidden="true" />}
          >
            Confirmar y Cerrar Turno
          </Button>
        </div>
      </form>
    </Modal>
  );
};
