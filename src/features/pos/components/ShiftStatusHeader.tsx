// ============================================================================
// COMPONENTE: CABECERA PERMANENTE DE ESTADO DE CAJA (SHIFT STATUS HEADER)
// Muestra estado de turno (Abierto/Cerrado), saldos en vivo y switch de 3 vistas
// Ubicación: src/features/pos/components/ShiftStatusHeader.tsx
// ============================================================================

import React from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { formatMoney } from '../../../domain/pos';
import { CashShiftDto } from '../../../types/pos';

export type ShiftViewMode = 'FISICA' | 'DIGITAL' | 'MIXTA';

export interface ShiftStatusHeaderProps {
  shift: CashShiftDto | null;
  isLoading?: boolean;
  activeViewMode: ShiftViewMode;
  onViewModeChange: (mode: ShiftViewMode) => void;
  onOpenShiftClick: () => void;
  onCloseShiftClick: () => void;
  onRefreshClick?: () => void;
}

export const ShiftStatusHeader: React.FC<ShiftStatusHeaderProps> = ({
  shift,
  isLoading = false,
  activeViewMode,
  onViewModeChange,
  onOpenShiftClick,
  onCloseShiftClick,
  onRefreshClick,
}) => {
  // 1. Estado Loading
  if (isLoading && !shift) {
    return (
      <div className="w-full bg-surface border border-border rounded-xl p-4 flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-700" />
          <span className="text-sm text-txt-secondary">Consultando estado de caja...</span>
        </div>
      </div>
    );
  }

  // 2. Estado Caja Cerrada (Alerta Roja con borde fuerte y fondo sutil)
  if (!shift || shift.estado === 'CERRADO') {
    return (
      <div
        role="region"
        aria-label="Estado de Caja"
        className="w-full bg-rose-500/[0.04] dark:bg-rose-500/[0.06] border-2 border-rose-500/80 dark:border-rose-500/70 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <Icon name="lock" className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-rose-700 dark:text-rose-300 text-sm sm:text-base">
                Caja Cerrada — Abre un turno para operar el Punto de Venta
              </span>
              <Badge variant="danger" size="sm">
                Sin Turno Activo
              </Badge>
            </div>
            <p className="text-xs text-rose-700/85 dark:text-rose-300/85">
              Para registrar ventas de productos, planes o amortizaciones de deuda física y digital, primero debes asignar el fondo inicial en gaveta.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="primary"
          onClick={onOpenShiftClick}
          leftIcon={<Icon name="key" className="w-4 h-4" aria-hidden="true" />}
          className="whitespace-nowrap font-bold shadow-sm"
        >
          Abrir Turno de Caja
        </Button>
      </div>
    );
  }

  // 3. Estado Caja Abierta (Badge Verde y Métricas en Vivo)
  return (
    <div
      role="region"
      aria-label="Estado de Caja Activa"
      className="w-full bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-4"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Identificación de Turno */}
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-status-success shrink-0" aria-hidden="true" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-txt-primary text-base sm:text-lg">
                Turno #{shift.id} Abierto
              </h2>
              <Badge variant="success" size="sm">
                Caja Activa
              </Badge>
            </div>
            <p className="text-xs text-txt-secondary">
              Apertura por <span className="font-semibold text-txt-primary">@{shift.usuario_apertura_username}</span> el {shift.fecha_apertura}
            </p>
          </div>
        </div>

        {/* Selector de 3 Vistas de Caja (Física, Digital, Consolidada) */}
        <div
          role="group"
          aria-label="Vistas de Caja"
          className="flex items-center bg-canvas-subtle p-1 rounded-lg border border-border text-xs font-semibold self-start lg:self-auto"
        >
          <button
            type="button"
            aria-pressed={activeViewMode === 'FISICA'}
            onClick={() => onViewModeChange('FISICA')}
            className={`px-3 py-1.5 rounded-md transition-all inline-flex items-center gap-1.5 ${
              activeViewMode === 'FISICA'
                ? 'bg-surface text-txt-primary shadow-xs font-bold border border-border'
                : 'text-txt-muted hover:text-txt-primary'
            }`}
          >
            <Icon name="cash" className="w-4 h-4" aria-hidden="true" />
            <span>Caja Física</span>
          </button>
          <button
            type="button"
            aria-pressed={activeViewMode === 'DIGITAL'}
            onClick={() => onViewModeChange('DIGITAL')}
            className={`px-3 py-1.5 rounded-md transition-all inline-flex items-center gap-1.5 ${
              activeViewMode === 'DIGITAL'
                ? 'bg-surface text-txt-primary shadow-xs font-bold border border-border'
                : 'text-txt-muted hover:text-txt-primary'
            }`}
          >
            <Icon name="smartphone" className="w-4 h-4" aria-hidden="true" />
            <span>Caja Digital</span>
          </button>
          <button
            type="button"
            aria-pressed={activeViewMode === 'MIXTA'}
            onClick={() => onViewModeChange('MIXTA')}
            className={`px-3 py-1.5 rounded-md transition-all inline-flex items-center gap-1.5 ${
              activeViewMode === 'MIXTA'
                ? 'bg-surface text-txt-primary shadow-xs font-bold border border-border'
                : 'text-txt-muted hover:text-txt-primary'
            }`}
          >
            <Icon name="bar-chart" className="w-4 h-4" aria-hidden="true" />
            <span>Vista Mixta</span>
          </button>
        </div>

        {/* Acciones de Caja */}
        <div className="flex items-center gap-2 self-end lg:self-auto">
          {onRefreshClick && (
            <button
              type="button"
              onClick={onRefreshClick}
              title="Refrescar estado de caja"
              aria-label="Refrescar estado de caja"
              className="p-2 rounded-lg border border-border bg-canvas-subtle hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-secondary hover:text-txt-primary transition-colors text-xs"
            >
              <Icon name="refresh" className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          <Button
            type="button"
            variant="danger"
            onClick={onCloseShiftClick}
            leftIcon={<Icon name="lock" className="w-4 h-4" aria-hidden="true" />}
            className="whitespace-nowrap font-bold"
          >
            Arqueo y Cierre de Caja
          </Button>
        </div>
      </div>

      {/* Tarjetas de Saldos en Vivo según vista */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
        {/* Fondo Inicial */}
        <div className="bg-canvas-subtle p-3 rounded-lg border border-border/60">
          <span className="text-[11px] uppercase tracking-wider text-txt-muted font-bold block">
            Fondo Inicial
          </span>
          <span className="text-sm sm:text-base font-extrabold text-txt-primary">
            S/ {formatMoney(shift.monto_apertura_fisico)}
          </span>
        </div>

        {/* Efectivo Esperado en Gaveta */}
        <div
          className={`p-3 rounded-lg border transition-all ${
            activeViewMode === 'FISICA' || activeViewMode === 'MIXTA'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
              : 'bg-canvas-subtle border-border/60'
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider text-emerald-800 dark:text-emerald-300 font-bold block">
            Efectivo Esperado
          </span>
          <span className="text-sm sm:text-base font-extrabold text-emerald-700 dark:text-emerald-400">
            S/ {formatMoney(shift.total_efectivo_esperado)}
          </span>
        </div>

        {/* Total Digital Recaudado */}
        <div
          className={`p-3 rounded-lg border transition-all ${
            activeViewMode === 'DIGITAL' || activeViewMode === 'MIXTA'
              ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-300 dark:border-sky-800'
              : 'bg-canvas-subtle border-border/60'
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider text-sky-800 dark:text-sky-300 font-bold block">
            Total Digital
          </span>
          <span className="text-sm sm:text-base font-extrabold text-sky-700 dark:text-sky-400">
            S/ {formatMoney(shift.total_ventas_digital)}
          </span>
        </div>

        {/* Recaudación Total Consolidada */}
        <div className="bg-canvas-subtle p-3 rounded-lg border border-border/60">
          <span className="text-[11px] uppercase tracking-wider text-txt-muted font-bold block">
            Ventas Turno
          </span>
          <span className="text-sm sm:text-base font-extrabold text-brand">
            S/ {formatMoney(
              (parseFloat(shift.total_ventas_efectivo) || 0) +
                (parseFloat(shift.total_ventas_digital) || 0)
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
