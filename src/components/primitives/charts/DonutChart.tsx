// ============================================================================
// PRIMITIVA GRÁFICA: GRÁFICO DONUT INTERACTIVO EN SVG PURO (BI-SLICE 2)
// Segmentos interactivos al hover/focus, valor central dinámico, leyenda tabular
// alineada con monto y porcentaje, estado Skeleton y tema Claro/Oscuro
// Ubicación: src/components/primitives/charts/DonutChart.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import { cn } from '../../../utils/cn';
import { Icon } from '../Icon';
import { Skeleton } from '../Skeleton';

export interface DonutChartItem {
  id: string;
  label: string;
  value: number;
  percentage: number;
  color?: string;
  count?: number;
}

export interface DonutChartProps {
  items: DonutChartItem[];
  title?: string;
  subtitle?: string;
  centerLabel?: string;
  centerValue?: string | number;
  formatValue?: (v: number) => string;
  emptyTitle?: string;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

const DEFAULT_PALETTE = [
  'var(--color-brand-primary)',
  'var(--color-accent-sky)',
  'var(--color-accent-indigo)',
  'var(--color-status-warning)',
  'var(--color-status-danger)',
  'var(--color-text-muted)',
];

const DEFAULT_FORMAT = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toFixed(2);

export const DonutChart: React.FC<DonutChartProps> = ({
  items,
  title,
  subtitle,
  centerLabel = 'Total',
  centerValue,
  formatValue = DEFAULT_FORMAT,
  emptyTitle = 'Sin distribución registrada',
  emptyMessage = 'No existen registros suficientes en el periodo seleccionado.',
  loading = false,
  className,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const normalizedItems = useMemo(() => {
    const positive = items.filter((i) => Number.isFinite(i.value) && i.value > 0);
    const total = positive.reduce((sum, i) => sum + i.value, 0);
    return {
      total,
      list: positive.map((item, idx) => ({
        ...item,
        color: item.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
        computedPct:
          Number.isFinite(item.percentage) && item.percentage >= 0
            ? item.percentage
            : total > 0
            ? (item.value / total) * 100
            : 0,
      })),
    };
  }, [items]);

  if (loading) {
    return (
      <div
        role="status"
        aria-label={title ? `Cargando ${title}` : 'Cargando gráfico donut'}
        className={cn(
          'w-full rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4',
          className
        )}
      >
        <span className="sr-only">Cargando distribución...</span>
        <Skeleton className="h-4 w-44" />
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <Skeleton className="w-36 h-36 rounded-full shrink-0" />
          <div className="flex-1 w-full flex flex-col gap-2.5">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (normalizedItems.list.length === 0 || normalizedItems.total <= 0) {
    return (
      <div
        className={cn(
          'w-full rounded-2xl border border-dashed border-border bg-canvas-subtle/40 p-6 flex flex-col items-center justify-center text-center gap-2',
          className
        )}
      >
        <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-txt-muted">
          <Icon name="bar-chart" className="w-5 h-5" aria-hidden="true" />
        </div>
        <h4 className="text-xs font-bold text-txt-primary">{emptyTitle}</h4>
        <p className="text-[11px] text-txt-muted max-w-xs">{emptyMessage}</p>
      </div>
    );
  }

  const RADIUS = 54;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  let cumulativeFraction = 0;

  const segments = normalizedItems.list.map((item) => {
    const fraction = item.value / normalizedItems.total;
    const dashLength = fraction * CIRCUMFERENCE;
    const dashOffset = -cumulativeFraction * CIRCUMFERENCE;
    cumulativeFraction += fraction;
    return {
      ...item,
      dashLength,
      dashOffset,
    };
  });

  const activeItem = activeId
    ? segments.find((s) => s.id === activeId) ?? null
    : null;

  const displayCenterLabel = activeItem ? activeItem.label : centerLabel;
  const displayCenterValue = activeItem
    ? formatValue(activeItem.value)
    : centerValue !== undefined
    ? String(centerValue)
    : formatValue(normalizedItems.total);

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-xs flex flex-col gap-4',
        className
      )}
    >
      {(title || subtitle) && (
        <div>
          {title && <h4 className="text-sm font-bold text-txt-primary">{title}</h4>}
          {subtitle && <p className="text-[11px] text-txt-muted">{subtitle}</p>}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-5">
        {/* Anillo SVG */}
        <div className="relative w-40 h-40 shrink-0 flex items-center justify-center">
          <svg
            viewBox="0 0 140 140"
            role="img"
            aria-label={title || 'Gráfico de distribución circular'}
            className="w-full h-full -rotate-90 select-none"
            onMouseLeave={() => setActiveId(null)}
          >
            <circle
              cx="70"
              cy="70"
              r={RADIUS}
              fill="none"
              stroke="var(--color-bg-canvas-subtle)"
              strokeWidth="18"
            />
            {segments.map((seg) => {
              const isSelected = activeId === seg.id;
              return (
                <circle
                  key={seg.id}
                  cx="70"
                  cy="70"
                  r={RADIUS}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={isSelected ? 22 : 18}
                  strokeDasharray={`${seg.dashLength} ${CIRCUMFERENCE}`}
                  strokeDashoffset={seg.dashOffset}
                  strokeOpacity={activeId && !isSelected ? 0.45 : 1}
                  role="button"
                  tabIndex={0}
                  aria-label={`${seg.label}: ${formatValue(seg.value)} (${seg.computedPct.toFixed(1)}%)`}
                  className="cursor-pointer transition-[stroke-width,stroke-opacity] duration-150 focus:outline-none"
                  onMouseEnter={() => setActiveId(seg.id)}
                  onFocus={() => setActiveId(seg.id)}
                  onBlur={() => setActiveId(null)}
                  onClick={() => setActiveId((prev) => (prev === seg.id ? null : seg.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveId((prev) => (prev === seg.id ? null : seg.id));
                    }
                  }}
                />
              );
            })}
          </svg>

          {/* Valor y etiqueta central */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-5 pointer-events-none">
            <span className="text-[10px] font-semibold text-txt-muted truncate max-w-full">
              {displayCenterLabel}
            </span>
            <span className="text-sm font-extrabold text-txt-primary tabular-nums truncate max-w-full">
              {displayCenterValue}
            </span>
            {activeItem && (
              <span className="text-[10px] font-mono font-bold text-brand tabular-nums">
                {activeItem.computedPct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Leyenda tabular alineada */}
        <ul className="flex-1 w-full flex flex-col gap-1.5 min-w-0">
          {segments.map((seg) => {
            const isSelected = activeId === seg.id;
            return (
              <li key={seg.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveId(seg.id)}
                  onMouseLeave={() => setActiveId(null)}
                  onFocus={() => setActiveId(seg.id)}
                  onBlur={() => setActiveId(null)}
                  onClick={() => setActiveId((prev) => (prev === seg.id ? null : seg.id))}
                  aria-pressed={isSelected}
                  className={cn(
                    'w-full px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                    isSelected
                      ? 'bg-canvas-subtle border-border-elevated'
                      : 'bg-transparent border-transparent hover:bg-canvas-subtle/60'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="font-medium text-txt-primary truncate">
                      {seg.label}
                    </span>
                    {seg.count !== undefined && (
                      <span className="text-[10px] font-mono text-txt-muted shrink-0">
                        ({seg.count})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 tabular-nums shrink-0">
                    <span className="font-bold text-txt-primary">
                      {formatValue(seg.value)}
                    </span>
                    <span className="font-mono text-[11px] text-txt-muted w-12 text-right">
                      {seg.computedPct.toFixed(1)}%
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
