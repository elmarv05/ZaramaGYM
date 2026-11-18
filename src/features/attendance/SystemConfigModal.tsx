// ============================================================================
// MODAL: CONFIGURACIÓN DE PARÁMETROS OPERATIVOS DEL SEMÁFORO (SLICE 5)
// Solo para roles ADMINISTRADOR y SUPERVISOR
// Ubicación: src/features/attendance/SystemConfigModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { Icon } from '../../components/primitives/Icon';
import { validateSystemConfig } from '../../domain/attendance';
import { SystemConfigDto, UpdateSystemConfigInput } from '../../types/attendance';

export interface SystemConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfigDto | null;
  onSave: (input: UpdateSystemConfigInput) => Promise<void>;
  isLoading?: boolean;
}

export const SystemConfigModal: React.FC<SystemConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  isLoading = false,
}) => {
  const [diasAmarillo, setDiasAmarillo] = useState<number>(config?.diasAlertaAmarillo ?? 5);
  const [minutosRebote, setMinutosRebote] = useState<number>(config?.minutosAntireboteQr ?? 3);
  const [precioPase, setPrecioPase] = useState<string>(
    config?.precioPaseDiarioCreditoDefault ?? '10.00'
  );
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const input: UpdateSystemConfigInput = {
      diasAlertaAmarillo: Number(diasAmarillo),
      minutosAntireboteQr: Number(minutosRebote),
      precioPaseDiarioCreditoDefault: precioPase,
    };

    const validation = validateSystemConfig(input);
    if (!validation.isValid) {
      setError(validation.error || 'Configuración inválida');
      return;
    }

    try {
      await onSave(input);
      onClose();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al actualizar configuración';
      setError(msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sysconfig-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-xl flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-canvas-subtle text-txt-primary border border-border flex items-center justify-center">
              <Icon name="shield" className="w-5 h-5" />
            </div>
            <div>
              <h3 id="sysconfig-modal-title" className="text-base font-bold text-txt-primary">
                Configuración del Semáforo
              </h3>
              <p className="text-xs text-txt-muted">
                Parámetros operativos globales (Admin / Supervisor)
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-dias-amarillo" className="text-xs font-bold text-txt-secondary">
              Umbral Alerta Semáforo Amarillo (Días restantes) *
            </label>
            <input
              id="input-dias-amarillo"
              type="number"
              min="1"
              max="30"
              value={diasAmarillo}
              onChange={(e) => setDiasAmarillo(parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-canvas text-sm font-semibold text-txt-primary focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
            <span className="text-[11px] text-txt-muted">
              Si a la membresía le quedan estos días o menos, se activará el semáforo amarillo.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-minutos-rebote" className="text-xs font-bold text-txt-secondary">
              Ventana de Filtro Anti-Rebote (Minutos) *
            </label>
            <input
              id="input-minutos-rebote"
              type="number"
              min="0"
              max="60"
              value={minutosRebote}
              onChange={(e) => setMinutosRebote(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-canvas text-sm font-semibold text-txt-primary focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
            <span className="text-[11px] text-txt-muted">
              Tiempo en el que lecturas consecutivas del mismo socio se ignoran para no duplicar asistencias.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-precio-pase-def" className="text-xs font-bold text-txt-secondary">
              Precio Pase Diario a Crédito por Defecto (S/) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2 text-sm font-bold text-txt-muted">
                S/
              </span>
              <input
                id="input-precio-pase-def"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.00"
                value={precioPase}
                onChange={(e) => setPrecioPase(e.target.value)}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v >= 0) {
                    setPrecioPase(v.toFixed(2));
                  }
                }}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-border bg-canvas text-sm font-semibold text-txt-primary focus:outline-hidden focus:ring-2 focus:ring-brand"
              />
            </div>
            <span className="text-[11px] text-txt-muted">
              Monto inicial cargado a la cuenta por cobrar al autorizar el pase desde semáforo rojo.
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
              className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-brand-text font-black text-xs shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? 'Guardando...' : 'Guardar Parámetros'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
