// ============================================================================
// MODAL: RECUPERACIÓN MANUAL DE DÍAS (PRÓRROGA DE MEMBRESÍA) (SLICE 5)
// Extensión auditada con cálculo en vivo de nueva fecha hasta 23:59:59
// Ubicación: src/features/attendance/ExtendMembershipModal.tsx
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/primitives/Icon';
import {
  calculateExtendedExpirationDate,
  validateExtensionInput,
} from '../../domain/attendance';
import { ExtendMembershipInput } from '../../types/attendance';
import { ClientMembershipDto } from '../../types/pos';
import {
  preventEnterKeySubmit,
  sanitizeIntegerInput,
  selectIfZeroDefault,
} from '../../utils/formSafety';

export interface ExtendMembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberships: ClientMembershipDto[];
  preselectedMembershipId?: number | null;
  onSubmit: (input: ExtendMembershipInput, permiteRecuperacionDias?: boolean) => Promise<void>;
  isLoading?: boolean;
}

export const ExtendMembershipModal: React.FC<ExtendMembershipModalProps> = ({
  isOpen,
  onClose,
  memberships,
  preselectedMembershipId,
  onSubmit,
  isLoading = false,
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(
    preselectedMembershipId || (memberships.length > 0 ? memberships[0].id : null)
  );
  const [diasOtorgadosStr, setDiasOtorgadosStr] = useState<string>('3');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsedDias = parseInt(diasOtorgadosStr, 10);
  const diasOtorgados = isNaN(parsedDias) ? 0 : parsedDias;

  React.useEffect(() => {
    if (selectedId === null && memberships.length > 0) {
      setSelectedId(memberships[0].id);
    }
  }, [memberships, selectedId]);

  const selectedMembership = useMemo(() => {
    return memberships.find((m) => m.id === selectedId) || null;
  }, [memberships, selectedId]);

  // Previsualización reactiva de la fecha nueva
  const projectedExpirationDate = useMemo(() => {
    if (!selectedMembership || !diasOtorgados || diasOtorgados < 1) return null;
    return calculateExtendedExpirationDate(
      selectedMembership.fecha_vencimiento,
      diasOtorgados
    );
  }, [selectedMembership, diasOtorgados]);

  // Chequeo si el plan permite recuperación (vía flag de BD o fallback por convención de nombre)
  const isPaseDiario =
    selectedMembership?.permite_recuperacion_dias !== undefined
      ? !selectedMembership.permite_recuperacion_dias
      : (selectedMembership?.plan_nombre?.toUpperCase().includes('PASE') ||
         selectedMembership?.plan_nombre?.toUpperCase().includes('DIARIO'));

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

    if (!selectedMembership) {
      setError('Seleccione una membresía activa para extender');
      return;
    }

    const validation = validateExtensionInput({
      diasOtorgados,
      motivoJustificacion: motivo,
      permiteRecuperacionDias: !isPaseDiario,
    });

    if (!validation.isValid) {
      setError(validation.error || 'Datos inválidos para la prórroga');
      return;
    }

    try {
      await onSubmit(
        {
          membresiaId: selectedMembership.id,
          diasOtorgados,
          motivoJustificacion: motivo.trim(),
        },
        !isPaseDiario
      );
      setMotivo('');
      onClose();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al otorgar prórroga';
      setError(msg);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extend-membership-title"
      className="fixed inset-0 z-50 flex justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain zg-modal-backdrop"
    >
      <div className="bg-surface border border-border rounded-2xl max-w-lg w-full my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain p-6 shadow-xl flex flex-col gap-5 zg-modal-panel">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-canvas-subtle text-accent-indigo border border-border flex items-center justify-center">
              <Icon name="clock" className="w-5 h-5" />
            </div>
            <div>
              <h3 id="extend-membership-title" className="text-base font-bold text-txt-primary">
                Recuperación Manual de Días
              </h3>
              <p className="text-xs text-txt-muted">
                Prórroga auditada de vencimiento de membresía activa
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
          {/* Selector de Membresía */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="select-membresia-ext" className="text-xs font-bold text-txt-secondary">
              Membresía del Socio <span className="text-status-danger">*</span>
            </label>
            <select
              id="select-membresia-ext"
              required
              value={selectedId ?? ''}
              onChange={(e) => {
                setSelectedId(Number(e.target.value));
                setError(null);
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-canvas text-xs font-semibold text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {memberships.length === 0 && (
                <option value="">No hay membresías activas disponibles</option>
              )}
              {memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.cliente_nombre_completo} — {m.plan_nombre} (Vence: {m.fecha_vencimiento.split(' ')[0]})
                </option>
              ))}
            </select>
          </div>

          {/* Advertencia si es un pase diario */}
          {isPaseDiario && (
            <div className="p-3 rounded-xl bg-status-warning-bg border border-status-warning/30 text-xs text-status-warning flex items-start gap-2">
              <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Atención:</strong> Los pases diarios tienen prohibida la recuperación de días por política comercial del gimnasio.
              </span>
            </div>
          )}

          {/* Días a Otorgar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="input-dias-ext" className="text-xs font-bold text-txt-secondary">
                Días Calendario a Otorgar (+N) <span className="text-status-danger">*</span>
              </label>
              <input
                id="input-dias-ext"
                type="text"
                inputMode="numeric"
                required
                value={diasOtorgadosStr}
                onFocus={selectIfZeroDefault}
                onChange={(e) => {
                  setDiasOtorgadosStr(sanitizeIntegerInput(e.target.value));
                  setError(null);
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!e.target.value.trim()) return;
                  if (!isNaN(n)) {
                    setDiasOtorgadosStr(String(Math.min(90, Math.max(1, n))));
                  }
                }}
                className="w-full px-3.5 py-2 rounded-xl border border-border bg-canvas text-sm font-black text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            {/* Comparativa de Fechas */}
            <div className="bg-canvas-subtle border border-border rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
                Nueva Fecha Proyectada
              </span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                {projectedExpirationDate || 'Calculando...'}
              </span>
            </div>
          </div>

          {/* Motivo Justificación (Mínimo 5 caracteres) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-motivo-ext" className="text-xs font-bold text-txt-secondary">
              Motivo o Justificación Obligatoria (Mínimo 5 caracteres) <span className="text-status-danger">*</span>
            </label>
            <textarea
              id="input-motivo-ext"
              rows={3}
              required
              placeholder="Ej. Descanso médico presentado por el socio o suspensión por viaje justificado..."
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 rounded-xl border border-border bg-canvas text-xs text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <span className="text-[11px] text-txt-muted">
              Caracteres: {motivo.trim().length} / 5 requeridos
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
              disabled={isLoading || isPaseDiario || memberships.length === 0}
              className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-brand-text font-black text-xs shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
                  <span>Aplicando Prórroga...</span>
                </>
              ) : (
                <>
                  <Icon name="check" className="w-3.5 h-3.5" />
                  <span>Confirmar Extensión de Días</span>
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
