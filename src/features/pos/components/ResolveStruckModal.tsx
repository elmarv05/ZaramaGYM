// ============================================================================
// COMPONENTE: MODAL DE RESOLUCIÓN DEFINITIVA DE TACHADOS - PASO 2 (ADMIN)
// Dictamen final del Administrador: Confirmar Anulación o Revertir Tachado
// Ubicación: src/features/pos/components/ResolveStruckModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Button } from '../../../components/primitives/Button';
import { Modal } from '../../../components/primitives/Modal';
import { ResolveStruckAction, ResolveStruckSaleInput, SaleDetailDto, SaleListItemDto } from '../../../types/pos';

export interface ResolveStruckModalProps {
  isOpen: boolean;
  sale: SaleListItemDto | SaleDetailDto | null;
  turnoAbierto?: boolean;
  onClose: () => void;
  onSubmit: (saleId: number, input: ResolveStruckSaleInput) => Promise<any>;
  isLoading?: boolean;
}

export const ResolveStruckModal: React.FC<ResolveStruckModalProps> = ({
  isOpen,
  sale,
  turnoAbierto = true,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [accion, setAccion] = useState<ResolveStruckAction>('CONFIRMAR_ANULACION');
  const [nota, setNota] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!sale) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accion === 'REVERTIR_TACHADO' && !turnoAbierto) {
      setErrorMsg('No es posible revertir un tachado si el turno de caja ya fue cerrado');
      return;
    }

    try {
      await onSubmit(sale.id, {
        accion,
        nota_resolucion: nota.trim() || undefined,
      });
      setNota('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al resolver el tachado de la venta');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Bandeja Admin: Resolución de Venta #${sale.id} (Paso 2)`}
      description="Dictamen administrativo definitivo sobre una venta tachada en turno."
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {errorMsg && (
          <Alert variant="danger" title="Error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        <div className="bg-canvas-subtle p-3.5 rounded-lg border border-border text-xs flex flex-col gap-1.5">
          <div className="flex justify-between">
            <span className="text-txt-secondary">Cliente:</span>
            <span className="font-bold text-txt-primary">{sale.cliente_nombre_completo || 'Público General'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-txt-secondary">Monto Venta:</span>
            <span className="font-bold text-txt-primary">S/ {sale.total_venta}</span>
          </div>
          {'motivo_tachado' in sale && sale.motivo_tachado && (
            <div className="mt-1 pt-1 border-t border-border/60">
              <span className="text-txt-muted text-[11px] block">Motivo indicado por el operador:</span>
              <p className="italic text-txt-primary font-medium">{sale.motivo_tachado}</p>
            </div>
          )}
        </div>

        {/* Selector de Acción */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-txt-primary">Selecciona la Decisión Administrativa:</span>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface cursor-pointer hover:border-red-400 transition-colors">
            <input
              type="radio"
              name="resolve_action"
              value="CONFIRMAR_ANULACION"
              checked={accion === 'CONFIRMAR_ANULACION'}
              onChange={() => setAccion('CONFIRMAR_ANULACION')}
              className="mt-0.5"
            />
            <div className="flex flex-col text-xs">
              <span className="font-bold text-txt-primary">Confirmar Anulación Definitiva</span>
              <span className="text-txt-muted text-[11px]">
                Ratifica el tachado. La venta pasa a ANULADA_DEFINITIVA y no se alteran los saldos.
              </span>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-lg border border-border bg-surface cursor-pointer transition-colors ${
              turnoAbierto ? 'hover:border-emerald-400' : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <input
              type="radio"
              name="resolve_action"
              value="REVERTIR_TACHADO"
              disabled={!turnoAbierto}
              checked={accion === 'REVERTIR_TACHADO'}
              onChange={() => setAccion('REVERTIR_TACHADO')}
              className="mt-0.5"
            />
            <div className="flex flex-col text-xs">
              <span className="font-bold text-txt-primary">Revertir Tachado (Reactivar Venta)</span>
              <span className="text-txt-muted text-[11px]">
                Deshace el tachado operativo por error: descuenta nuevamente stock físico y reactiva los cobros en el turno abierto.
                {!turnoAbierto && ' (Inhabilitado: El turno ya fue cerrado)'}
              </span>
            </div>
          </label>
        </div>

        {/* Nota opcional */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="resolve-note" className="text-xs font-bold text-txt-primary">
            Nota de Resolución Administrativa (Opcional)
          </label>
          <textarea
            id="resolve-note"
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Comentarios de auditoría o autorización de gerencia..."
            className="w-full text-xs rounded-lg border border-border bg-surface px-3 py-2 text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant={accion === 'CONFIRMAR_ANULACION' ? 'danger' : 'primary'}
            isLoading={isLoading}
          >
            {accion === 'CONFIRMAR_ANULACION' ? 'Confirmar Anulación' : 'Revertir Tachado'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
