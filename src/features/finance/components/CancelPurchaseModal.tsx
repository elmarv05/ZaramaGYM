// ============================================================================
// COMPONENTE: MODAL DE ANULACIÓN DE COMPRA A PROVEEDOR (EXCLUSIVO ADMIN)
// Invariante de Stock Físico: Alerta explícita de reversión y justificación obligatoria
// Ubicación: src/features/finance/components/CancelPurchaseModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { Modal } from '../../../components/primitives/Modal';
import { validateCancelPurchaseInput } from '../../../domain/finance';
import { CancelSupplierPurchaseDto } from '../../../types/finance';
import { preventEnterKeySubmit } from '../../../utils/formSafety';

export interface CancelPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  compraId: number | null;
  onSubmit: (id: number, input: CancelSupplierPurchaseDto) => Promise<any>;
  isLoading?: boolean;
}

export const CancelPurchaseModal: React.FC<CancelPurchaseModalProps> = ({
  isOpen,
  onClose,
  compraId,
  onSubmit,
  isLoading = false,
}) => {
  const [motivo, setMotivo] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!compraId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const validation = validateCancelPurchaseInput(motivo);
    if (!validation.isValid) {
      setErrorMsg(validation.error || 'El motivo es inválido.');
      return;
    }

    try {
      await onSubmit(compraId, { motivo_anulacion: motivo.trim() });
      setMotivo('');
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          'No se pudo anular la compra. Verifique que exista stock suficiente para revertir las unidades adquiridas.'
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Anular Compra a Proveedor #${compraId}`}
      description="Operación administrativa irreversible sobre inventario y Kardex."
      size="md"
    >
      <form noValidate onSubmit={handleSubmit} onKeyDown={preventEnterKeySubmit} className="flex flex-col gap-4 text-xs">
        {errorMsg && (
          <Alert variant="danger" title="Error en anulación" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-900 rounded-lg text-rose-800 dark:text-rose-300">
          <span className="font-bold flex items-center gap-1.5 mb-1">
            <Icon name="danger" className="w-4 h-4 shrink-0" aria-hidden="true" />
            ADVERTENCIA DE CONTROL DE STOCK:
          </span>
          <p className="text-[11px] leading-relaxed">
            Al anular esta compra, el sistema descontará del almacén todas las unidades ingresadas
            originalmente mediante un movimiento <strong>AJUSTE_NEGATIVO (-)</strong>.
          </p>
          <p className="text-[11px] mt-1 font-semibold">
            Si algún producto ya fue consumido o vendido y no cuenta con suficiente stock físico actual,
            la anulación será rechazada por el servidor para impedir stock negativo.
          </p>
        </div>

        <div>
          <label className="font-bold text-txt-primary block mb-1">
            Motivo de Anulación: <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Indique detalladamente el motivo (mínimo 5 caracteres: error de factura, devolución de mercadería al proveedor, etc.)..."
            rows={3}
            required
            aria-label="Motivo de Anulación"
            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
          />
          <span className="text-[11px] text-txt-muted mt-1 block">
            Mínimo 5 caracteres. Este motivo quedará registrado inmutablemente en la bitácora de auditoría.
          </span>
        </div>

        <div className="flex justify-end items-center gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="sm"
            isLoading={isLoading}
            disabled={motivo.trim().length < 5}
          >
            Confirmar Anulación de Compra
          </Button>
        </div>
      </form>
    </Modal>
  );
};
