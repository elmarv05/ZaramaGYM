// ============================================================================
// COMPONENTE: CABECERA PERMANENTE DE ESTADO DE CAJA (SHIFT STATUS HEADER)
// Muestra estado de turno (Abierto/Cerrado), saldos en vivo y switch de 3 vistas
// Ubicación: src/features/pos/components/ShiftStatusHeader.tsx
// ============================================================================

import React from 'react';
import { Badge, Button, Card, Icon, Skeleton } from '../../../components/primitives';
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
  hideClosedAction?: boolean;
}

export const ShiftStatusHeader: React.FC<ShiftStatusHeaderProps> = ({
  shift,
  isLoading = false,
  activeViewMode,
  onViewModeChange,
  onOpenShiftClick,
  onCloseShiftClick,
  onRefreshClick,
  hideClosedAction = false,
}) => {
  // 1. Estado Loading
  if (isLoading && !shift) {
    return (
      <Card
        padding="sm"
        role="status"
        aria-label="Consultando estado de caja"
        className="w-full flex-row items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="w-4 h-4 rounded-full" />
          <span className="text-sm text-txt-secondary">Consultando estado de caja...</span>
        </div>
      </Card>
    );
  }

  // 2. Estado Caja Cerrada (Alerta Roja con borde fuerte y fondo sutil)
  if (!shift || shift.estado === 'CERRADO') {
    return (
      <Card
        role="region"
        aria-label="Estado de Caja"
        className="w-full bg-status-danger-bg/40 border-2 border-status-danger/80 p-4 sm:p-5 sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="mt-0.5 p-2 rounded-lg bg-status-danger-bg text-status-danger border border-status-danger-border"
          >
            <Icon name="lock" className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-status-danger text-sm sm:text-base">
                Caja Cerrada — Abre un turno para operar el Punto de Venta
              </span>
              <Badge variant="danger" size="sm">
                Sin Turno Activo
              </Badge>
            </div>
            <p className="text-xs text-txt-secondary">
              Para registrar ventas de productos, planes o amortizaciones de deuda física y digital, primero debes asignar el fondo inicial en gaveta.
            </p>
          </div>
        </div>

        {!hideClosedAction && (
          <Button
            type="button"
            variant="primary"
            onClick={onOpenShiftClick}
            leftIcon={<Icon name="key" className="w-4 h-4" aria-hidden="true" />}
            className="whitespace-nowrap font-bold shadow-sm"
          >
            Abrir Turno de Caja
          </Button>
        )}
      </Card>
    );
  }

  // 3. Estado Caja Abierta (Badge Verde y Métricas en Vivo)
  return (
    <Card
      role="region"
      aria-label="Estado de Caja Activa"
      padding="md"
      className="w-full gap-4"
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
          className="flex items-center bg-canvas-subtle p-1 rounded-lg border border-border text-xs font-semibold self-start lg:self-auto gap-1"
        >
          <Button
            type="button"
            size="sm"
            variant={activeViewMode === 'FISICA' ? 'secondary' : 'ghost'}
            aria-pressed={activeViewMode === 'FISICA'}
            onClick={() => onViewModeChange('FISICA')}
            leftIcon={<Icon name="cash" className="w-4 h-4" aria-hidden="true" />}
            className="min-h-[30px] py-1"
          >
            Caja Física
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeViewMode === 'DIGITAL' ? 'secondary' : 'ghost'}
            aria-pressed={activeViewMode === 'DIGITAL'}
            onClick={() => onViewModeChange('DIGITAL')}
            leftIcon={<Icon name="smartphone" className="w-4 h-4" aria-hidden="true" />}
            className="min-h-[30px] py-1"
          >
            Caja Digital
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeViewMode === 'MIXTA' ? 'secondary' : 'ghost'}
            aria-pressed={activeViewMode === 'MIXTA'}
            onClick={() => onViewModeChange('MIXTA')}
            leftIcon={<Icon name="bar-chart" className="w-4 h-4" aria-hidden="true" />}
            className="min-h-[30px] py-1"
          >
            Vista Mixta
          </Button>
        </div>

        {/* Acciones de Caja */}
        <div className="flex items-center gap-2 self-end lg:self-auto">
          {onRefreshClick && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onRefreshClick}
              title="Refrescar estado de caja"
              aria-label="Refrescar estado de caja"
            >
              <Icon name="refresh" className="w-4 h-4" aria-hidden="true" />
            </Button>
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
        <div className="bg-canvas-subtle p-3 rounded-lg border border-border/60">
          <span className="text-[11px] uppercase tracking-wider text-txt-muted font-bold block">
            Fondo Inicial
          </span>
          <span className="text-sm sm:text-base font-extrabold text-txt-primary">
            S/ {formatMoney(shift.monto_apertura_fisico)}
          </span>
        </div>

        <div
          className={`p-3 rounded-lg border transition-all ${
            activeViewMode === 'FISICA' || activeViewMode === 'MIXTA'
              ? 'bg-status-success-bg border-status-success-border'
              : 'bg-canvas-subtle border-border/60'
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider text-status-success font-bold block">
            Efectivo Esperado
          </span>
          <span className="text-sm sm:text-base font-extrabold text-status-success">
            S/ {formatMoney(shift.total_efectivo_esperado)}
          </span>
        </div>

        <div
          className={`p-3 rounded-lg border transition-all ${
            activeViewMode === 'DIGITAL' || activeViewMode === 'MIXTA'
              ? 'bg-status-info-bg border-status-info-border'
              : 'bg-canvas-subtle border-border/60'
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider text-status-info font-bold block">
            Total Digital
          </span>
          <span className="text-sm sm:text-base font-extrabold text-status-info">
            S/ {formatMoney(shift.total_ventas_digital)}
          </span>
        </div>

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
    </Card>
  );
};
