// ============================================================================
// PRIMITIVA GRÁFICA: MAPA DE CALOR MATRICIAL (HEATMAP GRID) (BI-SLICE 2)
// Matriz 7 días (Lun–Dom) × 18 horas (05:00–22:00) o dimensiones genéricas,
// escala esmeralda ZaramaGYM de 5 intensidades, leyenda Menor -> Mayor,
// inspector accesible por teclado/hover, Skeleton y Dark/Light Mode
// Ubicación: src/components/primitives/charts/HeatmapGrid.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import { cn } from '../../../utils/cn';
import { Icon } from '../Icon';
import { Skeleton } from '../Skeleton';

export const DEFAULT_HEATMAP_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DEFAULT_HEATMAP_HOURS = Array.from({ length: 18 }, (_, i) => {
  const hour = i + 5;
  return `${String(hour).padStart(2, '0')}:00`;
});

export interface HeatmapCellData {
  row: number | string;
  col: number | string;
  value: number;
  detail?: string;
}

export interface HeatmapGridProps {
  rows?: string[];
  cols?: string[];
  cells: HeatmapCellData[];
  title?: string;
  subtitle?: string;
  valueUnit?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

const INTENSITY_OPACITY = [0, 0.24, 0.48, 0.74, 1] as const;

export const HeatmapGrid: React.FC<HeatmapGridProps> = ({
  rows = DEFAULT_HEATMAP_DAYS,
  cols = DEFAULT_HEATMAP_HOURS,
  cells,
  title,
  subtitle,
  valueUnit = 'asistencias',
  emptyTitle = 'Sin actividad registrada en la matriz',
  emptyMessage = 'No existen marcaciones suficientes para construir el mapa de calor.',
  loading = false,
  className,
}) => {
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);

  const { cellMap, maxVal, totalCount } = useMemo(() => {
    const map = new Map<string, HeatmapCellData>();
    let max = 0;
    let total = 0;

    for (const cell of cells) {
      const rowIdx =
        typeof cell.row === 'number' ? cell.row : rows.indexOf(String(cell.row));
      const colIdx =
        typeof cell.col === 'number' ? cell.col : cols.indexOf(String(cell.col));
      if (rowIdx < 0 || rowIdx >= rows.length || colIdx < 0 || colIdx >= cols.length) {
        continue;
      }
      const val = Number.isFinite(cell.value) && cell.value > 0 ? cell.value : 0;
      const key = `${rowIdx}-${colIdx}`;
      map.set(key, { row: rowIdx, col: colIdx, value: val, detail: cell.detail });
      if (val > max) max = val;
      total += val;
    }

    return { cellMap: map, maxVal: max, totalCount: total };
  }, [cells, rows, cols]);

  const getIntensityLevel = (value: number): 0 | 1 | 2 | 3 | 4 => {
    if (value <= 0 || maxVal <= 0) return 0;
    const ratio = value / maxVal;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  if (loading) {
    return (
      <div
        role="status"
        aria-label={title ? `Cargando ${title}` : 'Cargando mapa de calor'}
        className={cn(
          'w-full rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4',
          className
        )}
      >
        <span className="sr-only">Cargando mapa de calor horario...</span>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 7 }).map((_, r) => (
            <Skeleton key={r} className="h-6 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0 || cols.length === 0 || totalCount === 0) {
    return (
      <div
        className={cn(
          'w-full rounded-2xl border border-dashed border-border bg-canvas-subtle/40 p-6 flex flex-col items-center justify-center text-center gap-2',
          className
        )}
      >
        <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-txt-muted">
          <Icon name="calendar" className="w-5 h-5" aria-hidden="true" />
        </div>
        <h4 className="text-xs font-bold text-txt-primary">{emptyTitle}</h4>
        <p className="text-[11px] text-txt-muted max-w-sm">{emptyMessage}</p>
      </div>
    );
  }

  const activeParts = activeCellKey ? activeCellKey.split('-').map(Number) : null;
  const activeRowLabel =
    activeParts && rows[activeParts[0]] !== undefined ? rows[activeParts[0]] : null;
  const activeColLabel =
    activeParts && cols[activeParts[1]] !== undefined ? cols[activeParts[1]] : null;
  const activeData = activeCellKey ? cellMap.get(activeCellKey) : undefined;

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-xs flex flex-col gap-3.5',
        className
      )}
    >
      {/* Cabecera y Leyenda Menor -> Mayor */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          {title && <h4 className="text-sm font-bold text-txt-primary">{title}</h4>}
          {subtitle && <p className="text-[11px] text-txt-muted">{subtitle}</p>}
        </div>

        <div
          aria-label="Escala de intensidad de menor a mayor"
          className="inline-flex items-center gap-1.5 text-[11px] text-txt-muted shrink-0"
        >
          <span>Menor</span>
          <div className="inline-flex items-center gap-1">
            {([0, 1, 2, 3, 4] as const).map((lvl) => (
              <span
                key={lvl}
                aria-hidden="true"
                className="relative w-3.5 h-3.5 rounded-[4px] border border-border/80 bg-canvas-subtle overflow-hidden"
              >
                {lvl > 0 && (
                  <span
                    className="absolute inset-0 bg-brand"
                    style={{ opacity: INTENSITY_OPACITY[lvl] }}
                  />
                )}
              </span>
            ))}
          </div>
          <span>Mayor</span>
        </div>
      </div>

      {/* Inspector accesible del cuadrante enfocado/hover */}
      <div
        aria-live="polite"
        className="rounded-xl border border-border bg-canvas-subtle/60 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs min-h-[36px]"
      >
        {activeRowLabel && activeColLabel ? (
          <>
            <div className="flex items-center gap-2">
              <span className="font-bold text-txt-primary">{activeRowLabel}</span>
              <span className="font-mono text-[11px] text-txt-secondary">
                {activeColLabel}
              </span>
              {activeData?.detail && (
                <span className="text-[11px] text-txt-muted">— {activeData.detail}</span>
              )}
            </div>
            <span className="font-mono font-bold text-brand tabular-nums">
              {activeData?.value ?? 0} {valueUnit}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-txt-muted">
            Pasa el cursor o navega con teclado sobre una celda para inspeccionar el detalle horario.
          </span>
        )}
      </div>

      {/* Matriz */}
      <div className="w-full overflow-x-auto pb-1">
        <div
          role="grid"
          aria-label={title || 'Mapa de calor por día y hora'}
          className="min-w-[540px] flex flex-col gap-1"
        >
          {/* Cabecera de columnas */}
          <div
            role="row"
            className="grid items-center gap-1"
            style={{
              gridTemplateColumns: `44px repeat(${cols.length}, minmax(0, 1fr))`,
            }}
          >
            <span role="columnheader" className="text-[10px] font-semibold text-txt-muted" />
            {cols.map((col, colIdx) => (
              <span
                key={`${colIdx}-${col}`}
                role="columnheader"
                className="text-center font-mono text-[10px] text-txt-muted truncate"
              >
                {col.endsWith(':00') ? col.slice(0, 2) : col}
              </span>
            ))}
          </div>

          {/* Filas de días */}
          {rows.map((rowLabel, rowIdx) => (
            <div
              key={`${rowIdx}-${rowLabel}`}
              role="row"
              className="grid items-center gap-1"
              style={{
                gridTemplateColumns: `44px repeat(${cols.length}, minmax(0, 1fr))`,
              }}
            >
              <span
                role="rowheader"
                className="text-[11px] font-semibold text-txt-secondary pr-1 truncate"
              >
                {rowLabel}
              </span>

              {cols.map((colLabel, colIdx) => {
                const key = `${rowIdx}-${colIdx}`;
                const data = cellMap.get(key);
                const val = data?.value ?? 0;
                const level = getIntensityLevel(val);
                const isActive = activeCellKey === key;
                const ariaDesc = `${rowLabel} ${colLabel}: ${val} ${valueUnit}${
                  data?.detail ? ` (${data.detail})` : ''
                }`;

                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    aria-label={ariaDesc}
                    title={ariaDesc}
                    onMouseEnter={() => setActiveCellKey(key)}
                    onMouseLeave={() => setActiveCellKey(null)}
                    onFocus={() => setActiveCellKey(key)}
                    onBlur={() => setActiveCellKey(null)}
                    className={cn(
                      'relative h-6 rounded-[4px] border bg-canvas-subtle overflow-hidden transition-transform duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                      isActive
                        ? 'border-txt-primary scale-[1.06] z-10'
                        : 'border-border/70 hover:border-border-strong'
                    )}
                  >
                    {level > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-brand"
                        style={{ opacity: INTENSITY_OPACITY[level] }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
