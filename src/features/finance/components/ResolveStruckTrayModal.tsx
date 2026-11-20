// ============================================================================
// COMPONENTE: MODAL DE RESOLUCIÓN DEFINITIVA DE TACHADOS EN BANDEJA (PASO 2)
// Dictamen del Administrador: Confirmar Anulación o Revertir Tachado (solo si Turno Abierto)
// Ubicación: src/features/finance/components/ResolveStruckTrayModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Modal } from '../../../components/primitives/Modal';
import { formatCurrency } from '../../../domain/finance';
import { StruckSaleTrayItemDto } from '../../../types/finance';
import { ResolveStruckAction, ResolveStruckSaleInput } from '../../../types/pos';
import { preventEnterKeySubmit } from '../../../utils/formSafety';

export interface ResolveStruckTrayModalProps {
  isOpen: boolean;
  item: StruckSaleTrayItemDto | null;
  onClose: () => void;
  onSubmit: (saleId: number, input: ResolveStruckSaleInput) => Promise<any>;
  isLoading?: boolean;
}

export const ResolveStruckTrayModal: React.FC<ResolveStruckTrayModalProps> = ({
  isOpen,
  item,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const [accion, setAccion] = useState<ResolveStruckAction>('CONFIRMAR_ANULACION');
  const [nota, setNota] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!item) return null;

  const isTurnoAbierto = item.turno_estado === 'ABIERTO';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (accion === 'REVERTIR_TACHADO' && !isTurnoAbierto) {
      setErrorMsg('No es posible revertir una venta tachada si el turno de caja ya fue cerrado.');
      return;
    }

    try {
      await onSubmit(item.id, {
        accion,
        nota_resolucion: nota.trim() || undefined,
      });
      setNota('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al procesar la resolución de la venta tachada');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resolución Definitiva de Venta Tachada #${item.id} (Paso 2)`}
      description="Dictamen administrativo definitivo con trazabilidad contable inmutable."
      size="md"
    >
      <form noValidate onSubmit={handleSubmit} onKeyDown={preventEnterKeySubmit} className="flex flex-col gap-4 text-xs">
        {errorMsg && (
          <Alert variant="danger" title="Error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        {/* Resumen de la Venta */}
        <div className="p-3 bg-canvas rounded-lg border border-border flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-txt-muted">Turno de Origen:</span>
            <div className="flex items-center gap-1.5 font-bold text-txt-primary">
              <span>Turno #{item.turno_caja_id}</span>
              <Badge variant={isTurnoAbierto ? 'success' : 'default'} size="sm">
                {item.turno_estado}
              </Badge>
            </div>
          </div>

          <div className="flex justify-between">
            <span className="text-txt-muted">Cliente:</span>
            <span className="font-bold text-txt-primary">
              {item.cliente_nombre_completo || 'Cliente General'}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-txt-muted">Vendedor / Cajero:</span>
            <span className="text-txt-primary font-medium">@{item.usuario_vendedor_username}</span>
          </div>

          <div className="flex justify-between pt-1 border-t border-border">
            <span className="text-txt-muted">Monto Total de Venta:</span>
            <span className="font-black text-sm text-txt-primary">
              {formatCurrency(item.total_venta)}
            </span>
          </div>

          {item.motivo_tachado && (
            <div className="p-2 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-900/50 mt-1">
              <span className="text-amber-800 dark:text-amber-300 font-bold block text-[11px]">
                Motivo declarado por el operador (@{item.tachado_por_username || 'Cajero'}):
              </span>
              <p className="italic text-amber-900 dark:text-amber-200 mt-0.5">
                &quot;{item.motivo_tachado}&quot;
              </p>
            </div>
          )}
        </div>

        {/* Selector de Dictamen Administrativo */}
        <div className="flex flex-col gap-2">
          <span className="font-bold text-txt-primary">Selecciona la Decisión del Administrador:</span>

          {/* Opción 1: Confirmar Anulación */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface cursor-pointer hover:border-rose-400 transition-colors">
            <input
              type="radio"
              name="resolve_action_tray"
              value="CONFIRMAR_ANULACION"
              checked={accion === 'CONFIRMAR_ANULACION'}
              onChange={() => setAccion('CONFIRMAR_ANULACION')}
              className="mt-0.5"
            />
            <div className="flex flex-col">
              <span className="font-bold text-rose-600 dark:text-rose-400">
                Confirmar Anulación Definitiva (Ratificar Tachado)
              </span>
              <span className="text-[11px] text-txt-muted mt-0.5">
                La venta pasa al estado ANULADA_DEFINITIVA. No afecta la recaudación de caja ni el stock (se mantiene la reversión del Paso 1).
              </span>
            </div>
          </label>

          {/* Opción 2: Revertir Tachado */}
          <label
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
              !isTurnoAbierto
                ? 'opacity-50 cursor-not-allowed bg-canvas border-border'
                : 'cursor-pointer hover:border-emerald-400 bg-surface border-border'
            }`}
          >
            <input
              type="radio"
              name="resolve_action_tray"
              value="REVERTIR_TACHADO"
              disabled={!isTurnoAbierto}
              checked={accion === 'REVERTIR_TACHADO'}
              onChange={() => isTurnoAbierto && setAccion('REVERTIR_TACHADO')}
              className="mt-0.5"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Revertir Tachado (Restaurar Venta a COMPLETADA)
                </span>
                {!isTurnoAbierto && (
                  <Badge variant="danger" size="sm">
                    Bloqueado (Turno Cerrado)
                  </Badge>
                )}
              </div>
              <span className="text-[11px] text-txt-muted mt-0.5">
                Restaura los montos a la caja del turno y descuenta nuevamente el stock. Solo disponible si el turno aún está ABIERTO.
              </span>
            </div>
          </label>
        </div>

        {/* Nota de Resolución */}
        <div>
          <label className="font-bold text-txt-primary block mb-1">
            Nota de Resolución Administrativa (Opcional):
          </label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Observaciones de auditoría o sustento de la decisión..."
            rows={2}
            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
          />
        </div>

        {/* Botones */}
        <div className="flex justify-end items-center gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant={accion === 'CONFIRMAR_ANULACION' ? 'danger' : 'primary'}
            size="sm"
            isLoading={isLoading}
          >
            {accion === 'CONFIRMAR_ANULACION'
              ? 'Confirmar Anulación Definitiva'
              : 'Revertir Tachado y Restaurar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
