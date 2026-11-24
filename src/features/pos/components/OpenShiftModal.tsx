// ============================================================================
// COMPONENTE: MODAL DE APERTURA DE TURNO DE CAJA (OPEN SHIFT MODAL)
// Registro de fondo inicial en efectivo y notas de apertura
// Ubicación: src/features/pos/components/OpenShiftModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert, Button, Input, Modal, Textarea } from '../../../components/primitives';
import { OpenCashShiftInput } from '../../../types/pos';
import {
  formatDecimalOnBlur,
  preventEnterKeySubmit,
  roundMonetary,
  sanitizeDecimalInput,
  selectIfZeroDefault,
} from '../../../utils/formSafety';

export interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: OpenCashShiftInput) => Promise<any>;
  isLoading?: boolean;
}

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [monto, setMonto] = useState<string>('50.00');
  const [notas, setNotas] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleShortcut = (val: number) => {
    setMonto(val.toFixed(2));
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(monto);
    if (isNaN(val) || val < 0) {
      setErrorMsg('El fondo inicial debe ser un número válido mayor o igual a 0.00');
      return;
    }

    const formattedMonto = roundMonetary(val).toFixed(2);
    setMonto(formattedMonto);

    try {
      await onSubmit({
        monto_apertura_fisico: formattedMonto,
        notas_apertura: notas.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al abrir el turno de caja');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Apertura de Turno de Caja"
      description="Establece el monto en efectivo físico disponible en gaveta para iniciar operaciones en el Punto de Venta."
      size="md"
    >
      <form noValidate onSubmit={handleSubmit} onKeyDown={preventEnterKeySubmit} className="flex flex-col gap-4">
        {errorMsg && (
          <Alert variant="danger" title="Atención" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="open-shift-amount" className="text-xs font-bold text-txt-primary">
            Fondo Inicial en Efectivo (S/) <span className="text-status-danger">*</span>
          </label>
          <Input
            id="open-shift-amount"
            type="text"
            inputMode="decimal"
            value={monto}
            onFocus={selectIfZeroDefault}
            onChange={(e) => {
              setMonto(sanitizeDecimalInput(e.target.value));
              setErrorMsg(null);
            }}
            onBlur={(e) => {
              setMonto(formatDecimalOnBlur(e.target.value, { min: 0, fallback: '' }));
            }}
            leftIcon={<span className="text-sm font-bold text-txt-muted">S/</span>}
            required
            className="font-bold text-base"
            placeholder="0.00"
            autoFocus
          />

          {/* Atajos Rápidos */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-txt-muted">Frecuentes:</span>
            {[20, 50, 100, 200].map((v) => (
              <Button
                key={v}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleShortcut(v)}
                className="min-h-[28px] px-2.5 py-1 text-xs font-semibold"
              >
                S/ {v}
              </Button>
            ))}
          </div>
        </div>

        <Textarea
          id="open-shift-notes"
          label="Notas u Observaciones (Opcional)"
          rows={2}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej. Billetes fraccionados y monedas de 1, 2 y 5 soles para dar cambio..."
        />

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Confirmar y Abrir Turno
          </Button>
        </div>
      </form>
    </Modal>
  );
};
