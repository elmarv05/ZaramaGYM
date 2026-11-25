// ============================================================================
// PRIMITIVA GRÁFICA: GRÁFICO LINEAL MULTISERIE EN SVG PURO (BI-SLICE 2)
// Soporta 1..4 series simultáneas, leyenda interactiva, guía vertical sincronizada,
// inspector accesible, estado Skeleton y tema Claro/Oscuro
// Ubicación: src/components/primitives/charts/MultiSeriesLineChart.tsx
// ============================================================================

import React, { useId, useMemo, useState } from 'react';
import { cn } from '../../../utils/cn';
import { Icon } from '../Icon';
import { Skeleton } from '../Skeleton';

export interface MultiSeriesLineSeries {
  id: string;
  label: string;
  color: string;
  data: number[];
  dashed?: boolean;
  fillArea?: boolean;
}

export interface MultiSeriesLineChartProps {
  labels: string[];
  series: MultiSeriesLineSeries[];
  title?: string;
  subtitle?: string;
  height?: number;
  formatValue?: (v: number) => string;
  emptyTitle?: string;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

const DEFAULT_FORMAT = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toFixed(2);

export const MultiSeriesLineChart: React.FC<MultiSeriesLineChartProps> = ({
  labels,
  series,
  title,
  subtitle,
  height = 220,
  formatValue = DEFAULT_FORMAT,
  emptyTitle = 'Sin datos suficientes en el periodo',
  emptyMessage = 'Ajusta el rango de fechas o registra operaciones para visualizar la tendencia.',
  loading = false,
  className,
}) => {
  const uid = useId().replace(/:/g, '');
  const [hiddenIds, setHiddenIds] = useState<Record<string, boolean>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleSeries = (id: string) => {
    setHiddenIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const visibleSeries = useMemo(
    () => series.filter((s) => !hiddenIds[s.id]),
    [series, hiddenIds]
  );

  const pointCount = labels.length;

  const SVG_W = 640;
  const SVG_H = 220;
  const PAD_LEFT = 58;
  const PAD_RIGHT = 24;
  const PAD_TOP = 18;
  const PAD_BOTTOM = 32;
  const PLOT_W = SVG_W - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = SVG_H - PAD_TOP - PAD_BOTTOM;

  const geometry = useMemo(() => {
    if (pointCount === 0 || series.length === 0) return null;

    const allValues: number[] = [];
    for (const s of visibleSeries) {
      for (let i = 0; i < pointCount; i++) {
        const val = s.data[i];
        if (typeof val === 'number' && Number.isFinite(val)) {
          allValues.push(val);
        }
      }
    }

    const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
    const maxVal = allValues.length > 0 ? Math.max(...allValues) : 10;
    const rawSpan = maxVal - minVal;
    const pad = rawSpan > 0 ? rawSpan * 0.16 : Math.max(Math.abs(maxVal) * 0.15, 1);
    const yMin = minVal >= 0 ? Math.max(0, minVal - pad) : minVal - pad;
    const yMax = maxVal + pad;
    const ySpan = Math.max(yMax - yMin, 0.01);

    const xCoords = labels.map((_, idx) =>
      pointCount === 1
        ? PAD_LEFT + PLOT_W / 2
        : PAD_LEFT + (idx / (pointCount - 1)) * PLOT_W
    );

    const yTicks = [0, 0.5, 1].map((ratio) => ({
      value: yMin + ratio * ySpan,
      y: PAD_TOP + PLOT_H - ratio * PLOT_H,
    }));

    const plottedSeries = visibleSeries.map((s) => {
      const points = labels.map((label, idx) => {
        const raw = s.data[idx] ?? 0;
        const val = Number.isFinite(raw) ? raw : 0;
        const norm = (val - yMin) / ySpan;
        const y = PAD_TOP + PLOT_H - norm * PLOT_H;
        return { x: xCoords[idx], y, value: val, label, idx };
      });

      const linePath = points
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ');

      const baselineY = (PAD_TOP + PLOT_H).toFixed(2);
      const areaPath =
        s.fillArea && points.length > 1
          ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baselineY} L ${points[0].x.toFixed(2)} ${baselineY} Z`
          : '';

      return {
        series: s,
        points,
        linePath,
        areaPath,
      };
    });

    return {
      xCoords,
      yTicks,
      plottedSeries,
    };
  }, [labels, series.length, visibleSeries, pointCount, PLOT_W, PLOT_H]);

  const resolvedIndex = useMemo(() => {
    if (pointCount === 0) return null;
    if (activeIndex !== null && activeIndex >= 0 && activeIndex < pointCount) {
      return activeIndex;
    }
    return pointCount - 1;
  }, [pointCount, activeIndex]);

  if (loading) {
    return (
      <div
        role="status"
        aria-label={title ? `Cargando ${title}` : 'Cargando gráfico lineal'}
        className={cn(
          'w-full rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4',
          className
        )}
      >
        <span className="sr-only">Cargando gráfico de series...</span>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-48" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <Skeleton className="w-full rounded-xl" style={{ height: `${height}px` }} />
      </div>
    );
  }

  const hasAnyData =
    pointCount > 0 &&
    series.some((s) => s.data.some((v) => typeof v === 'number' && Number.isFinite(v)));

  if (!hasAnyData || !geometry) {
    return (
      <div
        className={cn(
          'w-full rounded-2xl border border-dashed border-border bg-canvas-subtle/40 p-6 flex flex-col items-center justify-center text-center gap-2',
          className
        )}
      >
        <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-txt-muted">
          <Icon name="activity" className="w-5 h-5" aria-hidden="true" />
        </div>
        <h4 className="text-xs font-bold text-txt-primary">{emptyTitle}</h4>
        <p className="text-[11px] text-txt-muted max-w-sm">{emptyMessage}</p>
      </div>
    );
  }

  const xLabelStep = pointCount <= 7 ? 1 : Math.ceil(pointCount / 6);

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-xs flex flex-col gap-3.5',
        className
      )}
    >
      {/* Cabecera + Leyenda Interactiva */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {(title || subtitle) && (
          <div className="min-w-0">
            {title && (
              <h4 className="text-sm font-bold text-txt-primary truncate">{title}</h4>
            )}
            {subtitle && (
              <p className="text-[11px] text-txt-muted">{subtitle}</p>
            )}
          </div>
        )}

        <div
          role="group"
          aria-label="Series visibles en el gráfico"
          className="flex flex-wrap items-center gap-1.5"
        >
          {series.map((s) => {
            const isVisible = !hiddenIds[s.id];
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={isVisible}
                onClick={() => toggleSeries(s.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                  isVisible
                    ? 'bg-canvas-subtle border-border-elevated text-txt-primary shadow-2xs'
                    : 'bg-transparent border-border text-txt-muted opacity-55 line-through'
                )}
              >
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Inspector / Panel Tooltip Sincronizado */}
      {resolvedIndex !== null && (
        <div
          aria-live="polite"
          className="rounded-xl border border-border bg-canvas-subtle/60 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span className="font-mono text-[11px] font-bold text-txt-primary">
            {labels[resolvedIndex]}
          </span>
          {visibleSeries.length === 0 ? (
            <span className="text-[11px] text-txt-muted">
              Activa al menos una serie en la leyenda superior.
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
              {visibleSeries.map((s) => {
                const rawVal = s.data[resolvedIndex] ?? 0;
                return (
                  <div key={s.id} className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-[11px] text-txt-secondary">{s.label}:</span>
                    <span className="text-xs font-bold text-txt-primary">
                      {formatValue(Number.isFinite(rawVal) ? rawVal : 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Lienzo SVG */}
      <div className="w-full relative" style={{ minHeight: `${height}px` }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          role="img"
          aria-label={title || 'Gráfico de líneas multiserie'}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            {geometry.plottedSeries.map((item) => (
              <linearGradient
                key={item.series.id}
                id={`${uid}-grad-${item.series.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={item.series.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={item.series.color} stopOpacity="0.01" />
              </linearGradient>
            ))}
          </defs>

          {/* Cuadrícula horizontal y Eje Y */}
          {geometry.yTicks.map((tick, idx) => (
            <g key={idx}>
              <line
                x1={PAD_LEFT}
                y1={tick.y}
                x2={SVG_W - PAD_RIGHT}
                y2={tick.y}
                stroke="var(--color-border-subtle)"
                strokeDasharray={idx === 0 ? undefined : '4 4'}
                strokeWidth="1"
              />
              <text
                x={PAD_LEFT - 8}
                y={tick.y + 3.5}
                textAnchor="end"
                fill="var(--color-text-muted)"
                fontSize="10"
                fontFamily="monospace"
              >
                {formatValue(tick.value)}
              </text>
            </g>
          ))}

          {/* Áreas sombreadas */}
          {geometry.plottedSeries.map((item) =>
            item.areaPath ? (
              <path
                key={`area-${item.series.id}`}
                d={item.areaPath}
                fill={`url(#${uid}-grad-${item.series.id})`}
              />
            ) : null
          )}

          {/* Líneas de cada serie */}
          {geometry.plottedSeries.map((item) =>
            item.points.length > 1 ? (
              <path
                key={`line-${item.series.id}`}
                d={item.linePath}
                fill="none"
                stroke={item.series.color}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={item.series.dashed ? '6 4' : undefined}
              />
            ) : null
          )}

          {/* Guía vertical sincronizada */}
          {resolvedIndex !== null && geometry.xCoords[resolvedIndex] !== undefined && (
            <line
              x1={geometry.xCoords[resolvedIndex]}
              y1={PAD_TOP}
              x2={geometry.xCoords[resolvedIndex]}
              y2={PAD_TOP + PLOT_H}
              stroke="var(--color-border-strong)"
              strokeOpacity="0.7"
              strokeDasharray="3 3"
              strokeWidth="1.2"
            />
          )}

          {/* Nodos de cada serie */}
          {geometry.plottedSeries.map((item) =>
            item.points.map((pt) => {
              const isSelected = resolvedIndex === pt.idx;
              return (
                <g key={`pt-${item.series.id}-${pt.idx}`}>
                  {isSelected && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={7}
                      fill={item.series.color}
                      fillOpacity="0.22"
                    />
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 4.5 : 3}
                    fill={isSelected ? item.series.color : 'var(--color-bg-surface)'}
                    stroke={item.series.color}
                    strokeWidth="2"
                  />
                </g>
              );
            })
          )}

          {/* Columnas interactivas accesibles + Etiquetas Eje X */}
          {labels.map((label, idx) => {
            const x = geometry.xCoords[idx];
            const colWidth =
              pointCount > 1 ? Math.max(PLOT_W / pointCount, 18) : PLOT_W;
            const isSelected = resolvedIndex === idx;
            const showLabel =
              idx === 0 || idx === pointCount - 1 || idx % xLabelStep === 0;

            const pointSummary = visibleSeries
              .map((s) => `${s.label}: ${formatValue(s.data[idx] ?? 0)}`)
              .join(', ');

            return (
              <g
                key={`col-${idx}-${label}`}
                role="button"
                tabIndex={0}
                aria-label={`${label}${pointSummary ? ` — ${pointSummary}` : ''}`}
                className="cursor-pointer focus:outline-none"
                onMouseEnter={() => setActiveIndex(idx)}
                onFocus={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveIndex(idx);
                  }
                }}
              >
                <rect
                  x={x - colWidth / 2}
                  y={PAD_TOP}
                  width={colWidth}
                  height={PLOT_H}
                  fill="transparent"
                />

                {showLabel && (
                  <text
                    x={x}
                    y={SVG_H - 8}
                    textAnchor={
                      pointCount > 1 && idx === 0
                        ? 'start'
                        : pointCount > 1 && idx === pointCount - 1
                        ? 'end'
                        : 'middle'
                    }
                    fill={isSelected ? 'var(--color-text-primary)' : 'var(--color-text-muted)'}
                    fontWeight={isSelected ? '700' : '400'}
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
