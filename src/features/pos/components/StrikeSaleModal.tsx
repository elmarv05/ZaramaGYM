// ============================================================================
// COMPONENTE: MODAL DE TACHADO PASO 1 (STRIKE SALE MODAL)
// Anulación operativa en turno abierto con reversión inmediata de caja y stock
// Ubicación: src/features/pos/components/StrikeSaleModal.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Alert, Button, Icon, Modal, Textarea } from '../../../components/primitives';
import { validateStrikeSaleInput } from '../../../domain/pos';
import { CashShiftState, SaleListItemDto, StrikeSaleInput } from '../../../types/pos';
import { preventEnterKeySubmit } from '../../../utils/formSafety';

export interface StrikeSaleModalProps {
  isOpen: boolean;
  sale: SaleListItemDto | null;
  turnoEstado?: CashShiftState;
  onClose: () => void;
  onSubmit: (saleId: number, input: StrikeSaleInput) => Promise<any>;
  isLoading?: boolean;
}

export const StrikeSaleModal: React.FC<StrikeSaleModalProps> = ({
  isOpen,
  sale,
  turnoEstado = 'ABIERTO',
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [motivo, setMotivo] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMotivo('');
      setErrorMsg(null);
    }
  }, [isOpen, sale?.id]);

  if (!sale) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateStrikeSaleInput(motivo, turnoEstado, sale.estado_venta);
    if (!validation.isValid) {
      setErrorMsg(validation.error || 'Motivo inválido');
      return;
    }

    try {
      await onSubmit(sale.id, { motivo_tachado: motivo.trim() });
      setMotivo('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al tachar la venta');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Tachar Venta #${sale.id}`}
      description="Procedimiento operativo de reversión para ventas emitidas por error en el turno activo."
      size="md"
    >
      <form noValidate onSubmit={handleSubmit} onKeyDown={preventEnterKeySubmit} className="flex flex-col gap-4">
        {errorMsg && (
          <Alert variant="danger" title="Validación" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-3 text-xs text-status-warning flex flex-col gap-1.5">
          <div className="flex items-center gap-2 font-bold">
            <Icon name="warning" className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Efectos Inmediatos del Tachado en Caja:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-txt-secondary text-[11px]">
            <li>Resta el dinero pagado (Efectivo y Digital) del arqueo del turno actual en vivo.</li>
            <li>Reingresa el stock físico de productos al almacén (Kardex: REVERSION_TACHADO).</li>
            <li>Anula deudas generadas o cancela la vigencia de membresías asociadas.</li>
            <li>La venta quedará como <strong>TACHADA_EN_TURNO</strong> para revisión del Administrador.</li>
          </ul>
        </div>

        <div className="bg-canvas-subtle p-3 rounded-lg border border-border text-xs flex justify-between">
          <span className="text-txt-secondary">Cliente:</span>
          <span className="font-bold text-txt-primary">{sale.cliente_nombre_completo || 'Público General'}</span>
        </div>

        <div className="bg-canvas-subtle p-3 rounded-lg border border-border text-xs flex justify-between">
          <span className="text-txt-secondary">Total Transacción:</span>
          <span className="font-extrabold text-txt-primary">S/ {sale.total_venta}</span>
        </div>

        <Textarea
          id="strike-reason"
          label="Motivo Obligatorio del Tachado"
          rows={3}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            setErrorMsg(null);
          }}
          placeholder="Describe la razón (mínimo 5 caracteres), ej. Error en medio de pago seleccionado..."
          required
          autoFocus
          hint={`${motivo.trim().length} / 5 caracteres mínimos`}
        />

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={motivo.trim().length < 5 || isLoading}
            isLoading={isLoading}
            leftIcon={<Icon name="scissors" className="w-4 h-4" aria-hidden="true" />}
          >
            Confirmar Tachado
          </Button>
        </div>
      </form>
    </Modal>
  );
};
