// ============================================================================
// MODAL: AUTORIZACIÓN DE PASE DIARIO A CRÉDITO DESDE SEMÁFORO ROJO (SLICE 5)
// Registro en creditos_clientes + Pase activo hasta las 23:59:59
// Ubicación: src/features/attendance/AuthorizeRedPassModal.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/primitives/Icon';
import { AuthorizeRedPassInput, CheckInEvaluationDto } from '../../types/attendance';

export interface AuthorizeRedPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluation: CheckInEvaluationDto | null;
  defaultMonto?: string | number;
  onConfirm: (input: AuthorizeRedPassInput) => Promise<void>;
  isLoading?: boolean;
}

export const AuthorizeRedPassModal: React.FC<AuthorizeRedPassModalProps> = ({
  isOpen,
  onClose,
  evaluation,
  defaultMonto = '10.00',
  onConfirm,
  isLoading = false,
}) => {
  const [monto, setMonto] = useState<string>(String(defaultMonto));
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen || !evaluation) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedMonto = parseFloat(monto);
    if (isNaN(parsedMonto) || parsedMonto <= 0) {
      setError('El monto del pase diario debe ser un valor numérico mayor a S/ 0.00');
      return;
    }

    try {
      await onConfirm({
        clienteId: evaluation.clienteId,
        montoPase: parsedMonto.toFixed(2),
        notas: notas.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al autorizar pase diario a crédito';
      setError(msg);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-red-pass-title"
      className="fixed inset-0 z-50 flex justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain zg-modal-backdrop"
    >
      <div className="bg-surface border border-border rounded-2xl max-w-md w-full my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain p-6 shadow-xl flex flex-col gap-5 zg-modal-panel">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-status-danger-bg text-status-danger flex items-center justify-center">
              <Icon name="receipt" className="w-5 h-5" />
            </div>
            <div>
              <h3 id="auth-red-pass-title" className="text-base font-bold text-txt-primary">
                Autorizar Pase Diario a Crédito
              </h3>
              <p className="text-xs text-txt-muted">
                Destrabe de acceso excepcional en Semáforo Rojo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-txt-muted hover:text-txt-primary p-1.5 rounded-lg hover:bg-canvas transition-colors"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200"
          >
            {error}
          </div>
        )}

        <div className="bg-canvas-subtle border border-border rounded-xl p-3.5 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
            Socio Beneficiario
          </span>
          <span className="text-sm font-black text-txt-primary">
            {evaluation.nombreCompleto}
          </span>
          <span className="text-xs text-txt-secondary">
            {evaluation.tipoDocumento}: {evaluation.numeroDocumento}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-monto-red-pass" className="text-xs font-bold text-txt-secondary">
              Monto del Pase Diario a Crédito (S/) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm font-bold text-txt-muted">
                S/
              </span>
              <input
                id="input-monto-red-pass"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="1.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0) {
                    setMonto(v.toFixed(2));
                  }
                }}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-border bg-canvas text-sm font-black text-txt-primary focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <p className="text-[11px] text-txt-muted">
              Se creará automáticamente una cuenta por cobrar en el módulo de créditos del cliente.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-notas-red-pass" className="text-xs font-bold text-txt-secondary">
              Notas u Observación del Operador (Opcional)
            </label>
            <input
              id="input-notas-red-pass"
              type="text"
              placeholder="Ej. Socio regular olvidó billetera"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-canvas text-xs text-txt-primary focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="p-3 bg-status-warning-bg border border-status-warning/30 rounded-xl text-[11px] text-status-warning leading-relaxed flex items-start gap-2">
            <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              El pase otorgado tendrá vigencia hasta las <strong>23:59:59</strong> del día de hoy y se registrará en la bitácora de auditoría inmutable.
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-txt-secondary hover:bg-canvas transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
                  <span>Autorizando...</span>
                </>
              ) : (
                <>
                  <Icon name="check" className="w-3.5 h-3.5" />
                  <span>Confirmar y Desbloquear Puerta</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
