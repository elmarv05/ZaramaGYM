// ============================================================================
// COMPONENTE: PANEL DE RESUMEN FINANCIERO Y 3 VISTAS DE CAJA (SHIFT SUMMARY)
// Desglose de Caja Física, Panel Digital Paralelo y Vista Consolidada
// Ubicación: src/features/pos/components/ShiftSummaryPanel.tsx
// ============================================================================

import React from 'react';
import { Badge, Card, Icon } from '../../../components/primitives';
import { formatMoney } from '../../../domain/pos';
import { CashShiftDto, CashShiftSummaryDto } from '../../../types/pos';
import { ShiftViewMode } from './ShiftStatusHeader';

export interface ShiftSummaryPanelProps {
  shift: CashShiftDto;
  summary?: CashShiftSummaryDto | null;
  activeViewMode: ShiftViewMode;
}

export const ShiftSummaryPanel: React.FC<ShiftSummaryPanelProps> = ({
  shift,
  summary,
  activeViewMode,
}) => {
  const yape = parseFloat(shift.desglose_digital.yape) || 0;
  const plin = parseFloat(shift.desglose_digital.plin) || 0;
  const transfer = parseFloat(shift.desglose_digital.transferencia) || 0;
  const tarjeta = parseFloat(shift.desglose_digital.tarjeta) || 0;

  return (
    <Card padding="md" className="w-full gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-txt-primary text-base flex items-center gap-2">
            <Icon
              name={
                activeViewMode === 'FISICA'
                  ? 'cash'
                  : activeViewMode === 'DIGITAL'
                    ? 'smartphone'
                    : 'bar-chart'
              }
              className="w-4 h-4 text-brand shrink-0"
              aria-hidden="true"
            />
            {activeViewMode === 'FISICA' && 'Panel de Caja Física (Gaveta)'}
            {activeViewMode === 'DIGITAL' && 'Panel de Caja Digital (Vouchers)'}
            {activeViewMode === 'MIXTA' && 'Vista Consolidada y Métricas Financieras'}
          </h3>
          <Badge variant="default" size="sm">
            Turno #{shift.id}
          </Badge>
        </div>
        <span className="text-xs text-txt-muted">
          Apertura: {shift.fecha_apertura}
        </span>
      </div>

      {/* 1. MODO CAJA FÍSICA */}
      {activeViewMode === 'FISICA' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-canvas-subtle p-4 rounded-xl border border-border">
            <span className="text-xs text-txt-muted font-bold uppercase tracking-wider block">
              Fondo de Apertura
            </span>
            <span className="text-xl font-extrabold text-txt-primary mt-1 block">
              S/ {formatMoney(shift.monto_apertura_fisico)}
            </span>
            <span className="text-[11px] text-txt-secondary mt-0.5 block">
              Billetes y monedas iniciales
            </span>
          </div>

          <div className="bg-canvas-subtle p-4 rounded-xl border border-border">
            <span className="text-xs text-txt-muted font-bold uppercase tracking-wider block">
              Ventas en Efectivo
            </span>
            <span className="text-xl font-extrabold text-txt-primary mt-1 block">
              S/ {formatMoney(shift.total_ventas_efectivo)}
            </span>
            <span className="text-[11px] text-txt-secondary mt-0.5 block">
              Neto retenido sin vueltos
            </span>
          </div>

          <div className="bg-status-success-bg p-4 rounded-xl border border-status-success-border">
            <span className="text-xs text-status-success font-bold uppercase tracking-wider block">
              Efectivo Esperado en Gaveta
            </span>
            <span className="text-xl font-black text-status-success mt-1 block">
              S/ {formatMoney(shift.total_efectivo_esperado)}
            </span>
            <span className="text-[11px] text-txt-secondary mt-0.5 block">
              Monto a cotejar en el arqueo
            </span>
          </div>
        </div>
      )}

      {/* 2. MODO CAJA DIGITAL */}
      {activeViewMode === 'DIGITAL' && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-canvas-subtle p-3.5 rounded-xl border border-accent-indigo/35 flex flex-col">
              <span className="text-xs font-bold text-accent-indigo flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-indigo shrink-0" aria-hidden="true" /> Yape
              </span>
              <span className="text-lg font-black text-accent-indigo mt-1">
                S/ {formatMoney(yape)}
              </span>
            </div>

            <div className="bg-status-info-bg/70 p-3.5 rounded-xl border border-status-info-border flex flex-col">
              <span className="text-xs font-bold text-status-info flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-status-info shrink-0" aria-hidden="true" /> Plin
              </span>
              <span className="text-lg font-black text-status-info mt-1">
                S/ {formatMoney(plin)}
              </span>
            </div>

            <div className="bg-status-warning-bg/70 p-3.5 rounded-xl border border-status-warning-border flex flex-col">
              <span className="text-xs font-bold text-status-warning flex items-center gap-1.5">
                <Icon name="bank" className="w-4 h-4 shrink-0" aria-hidden="true" /> Transferencias
              </span>
              <span className="text-lg font-black text-status-warning mt-1">
                S/ {formatMoney(transfer)}
              </span>
            </div>

            <div className="bg-status-info-bg/70 p-3.5 rounded-xl border border-status-info-border flex flex-col">
              <span className="text-xs font-bold text-accent-sky flex items-center gap-1.5">
                <Icon name="credit-card" className="w-4 h-4 shrink-0" aria-hidden="true" /> Tarjetas POS
              </span>
              <span className="text-lg font-black text-accent-sky mt-1">
                S/ {formatMoney(tarjeta)}
              </span>
            </div>
          </div>

          <div className="p-3 bg-canvas-subtle rounded-xl border border-border flex justify-between items-center text-xs">
            <span className="font-bold text-txt-secondary">Total Electrónico Recaudado:</span>
            <span className="font-black text-base text-status-info">
              S/ {formatMoney(shift.total_ventas_digital)}
            </span>
          </div>
        </div>
      )}

      {/* 3. MODO CONSOLIDADO Y MÉTRICAS */}
      {activeViewMode === 'MIXTA' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-canvas-subtle p-3.5 rounded-xl border border-border flex flex-col">
            <span className="text-[11px] font-bold text-txt-muted uppercase">
              Recaudación Físico
            </span>
            <span className="text-base font-extrabold text-txt-primary mt-1">
              S/ {formatMoney(shift.total_ventas_efectivo)}
            </span>
          </div>

          <div className="bg-canvas-subtle p-3.5 rounded-xl border border-border flex flex-col">
            <span className="text-[11px] font-bold text-txt-muted uppercase">
              Recaudación Digital
            </span>
            <span className="text-base font-extrabold text-txt-primary mt-1">
              S/ {formatMoney(shift.total_ventas_digital)}
            </span>
          </div>

          <div className="bg-canvas-subtle p-3.5 rounded-xl border border-border flex flex-col">
            <span className="text-[11px] font-bold text-txt-muted uppercase">
              Total Consolidado
            </span>
            <span className="text-base font-black text-brand mt-1">
              S/ {formatMoney(
                (parseFloat(shift.total_ventas_efectivo) || 0) +
                  (parseFloat(shift.total_ventas_digital) || 0)
              )}
            </span>
          </div>

          <div className="bg-canvas-subtle p-3.5 rounded-xl border border-border flex flex-col">
            <span className="text-[11px] font-bold text-txt-muted uppercase">
              Créditos Emitidos
            </span>
            <span className="text-base font-extrabold text-status-warning mt-1">
              S/ {formatMoney(summary ? summary.total_creditos_emitidos : '0.00')}
            </span>
          </div>

          {summary && (
            <div className="col-span-2 sm:col-span-4 flex items-center justify-between text-xs text-txt-secondary pt-2 border-t border-border">
              <span>Ventas Completadas: <strong className="text-txt-primary">{summary.cantidad_ventas_completadas}</strong></span>
              <span>Ventas Tachadas en Turno: <strong className="text-txt-primary">{summary.cantidad_ventas_tachadas}</strong></span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
