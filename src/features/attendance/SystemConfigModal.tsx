// ============================================================================
// MODAL: CONFIGURACIÓN DE PARÁMETROS OPERATIVOS DEL SEMÁFORO (SLICE 5)
// Exclusivo para rol ADMINISTRADOR
// Ubicación: src/features/attendance/SystemConfigModal.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/primitives/Icon';
import { validateSystemConfig } from '../../domain/attendance';
import { SystemConfigDto, UpdateSystemConfigInput } from '../../types/attendance';
import {
  formatDecimalOnBlur,
  preventEnterKeySubmit,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  selectIfZeroDefault,
} from '../../utils/formSafety';

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
  const [diasAmarilloStr, setDiasAmarilloStr] = useState<string>(
    String(config?.diasAlertaAmarillo ?? 5)
  );
  const [minutosReboteStr, setMinutosReboteStr] = useState<string>(
    String(config?.minutosAntireboteQr ?? 3)
  );
  const [precioPase, setPrecioPase] = useState<string>(
    config?.precioPaseDiarioCreditoDefault ?? '10.00'
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!diasAmarilloStr.trim() || !minutosReboteStr.trim() || !precioPase.trim()) {
      setError('Todos los parámetros marcados con * son obligatorios.');
      return;
    }

    const input: UpdateSystemConfigInput = {
      diasAlertaAmarillo: parseInt(diasAmarilloStr, 10),
      minutosAntireboteQr: parseInt(minutosReboteStr, 10),
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

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sysconfig-modal-title"
      className="fixed inset-0 z-50 flex justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain zg-modal-backdrop"
    >
      <div className="bg-surface border border-border rounded-2xl max-w-md w-full my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain p-6 shadow-xl flex flex-col gap-5 zg-modal-panel">
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
                Parámetros operativos globales (Administrador)
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

        <form noValidate onSubmit={handleSubmit} onKeyDown={preventEnterKeySubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-dias-amarillo" className="text-xs font-bold text-txt-secondary">
              Umbral Alerta Semáforo Amarillo (Días restantes) <span className="text-status-danger">*</span>
            </label>
            <input
              id="input-dias-amarillo"
              type="text"
              inputMode="numeric"
              required
              value={diasAmarilloStr}
              onFocus={selectIfZeroDefault}
              onChange={(e) => setDiasAmarilloStr(sanitizeIntegerInput(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-canvas text-sm font-semibold text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <span className="text-[11px] text-txt-muted">
              Si a la membresía le quedan estos días o menos, se activará el semáforo amarillo.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-minutos-rebote" className="text-xs font-bold text-txt-secondary">
              Ventana de Filtro Anti-Rebote (Minutos) <span className="text-status-danger">*</span>
            </label>
            <input
              id="input-minutos-rebote"
              type="text"
              inputMode="numeric"
              required
              value={minutosReboteStr}
              onFocus={selectIfZeroDefault}
              onChange={(e) => setMinutosReboteStr(sanitizeIntegerInput(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-border bg-canvas text-sm font-semibold text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <span className="text-[11px] text-txt-muted">
              Tiempo en el que lecturas consecutivas del mismo socio se ignoran para no duplicar asistencias.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-precio-pase-def" className="text-xs font-bold text-txt-secondary">
              Precio Pase Diario a Crédito por Defecto (S/) <span className="text-status-danger">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2 text-sm font-bold text-txt-muted">
                S/
              </span>
              <input
                id="input-precio-pase-def"
                type="text"
                inputMode="decimal"
                required
                value={precioPase}
                onFocus={selectIfZeroDefault}
                onChange={(e) => setPrecioPase(sanitizeDecimalInput(e.target.value))}
                onBlur={(e) => {
                  setPrecioPase(formatDecimalOnBlur(e.target.value, { min: 0, fallback: '' }));
                }}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-border bg-canvas text-sm font-semibold text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
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

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
