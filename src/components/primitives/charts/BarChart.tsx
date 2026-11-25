// ============================================================================
// PRIMITIVA GRÁFICA: GRÁFICO DE BARRAS EN SVG PURO (BI-SLICE 2)
// Soporta orientación vertical/horizontal, 1 o múltiples series agrupadas,
// inspector accesible al hover/focus, Skeleton y Dark/Light Mode
// Ubicación: src/components/primitives/charts/BarChart.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import { cn } from '../../../utils/cn';
import { Icon } from '../Icon';
import { Skeleton } from '../Skeleton';

export interface BarChartSeries {
  id: string;
  label: string;
  color: string;
  data: number[];
}

export interface BarChartClickContext {
  categoryIndex: number;
  categoryLabel: string;
  seriesId: string;
  seriesLabel: string;
  value: number;
}

export interface BarChartProps {
  labels: string[];
  series: BarChartSeries[];
  orientation?: 'vertical' | 'horizontal';
  title?: string;
  subtitle?: string;
  height?: number;
  formatValue?: (v: number) => string;
  emptyTitle?: string;
  emptyMessage?: string;
  loading?: boolean;
  onBarClick?: (ctx: BarChartClickContext) => void;
  className?: string;
}

const DEFAULT_FORMAT = (v: number) =>
  Number.isInteger(v) ? String(v) : v.toFixed(2);

const safeNum = (v: number | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

export const BarChart: React.FC<BarChartProps> = ({
  labels,
  series,
  orientation = 'vertical',
  title,
  subtitle,
  height = 220,
  formatValue = DEFAULT_FORMAT,
  emptyTitle = 'Sin datos para mostrar',
  emptyMessage = 'No se registraron valores en el periodo seleccionado.',
  loading = false,
  onBarClick,
  className,
}) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [activeCategoryIdx, setActiveCategoryIdx] = useState<number | null>(null);

  const categoryCount = labels.length;
  const seriesCount = series.length;

  const maxValue = useMemo(() => {
    let max = 0;
    for (const s of series) {
      for (let i = 0; i < categoryCount; i++) {
        const val = safeNum(s.data[i]);
        if (val > max) {
          max = val;
        }
      }
    }
    return max > 0 ? max : 1;
  }, [series, categoryCount]);

  const hasData = useMemo(
    () =>
      categoryCount > 0 &&
      series.some((s) => s.data.some((v) => Number.isFinite(v) && v > 0)),
    [categoryCount, series]
  );

  if (loading) {
    return (
      <div
        role="status"
        aria-label={title ? `Cargando ${title}` : 'Cargando gráfico de barras'}
        className={cn(
          'w-full rounded-2xl border border-border bg-surface p-5 flex flex-col gap-4',
          className
        )}
      >
        <span className="sr-only">Cargando gráfico de barras...</span>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div
          className="flex items-end gap-3 pt-2"
          style={{ height: `${height}px` }}
        >
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} className="flex-1 h-full rounded-t-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!hasData) {
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
        <p className="text-[11px] text-txt-muted max-w-sm">{emptyMessage}</p>
      </div>
    );
  }

  const resolvedCategoryIdx =
    activeCategoryIdx !== null &&
    activeCategoryIdx >= 0 &&
    activeCategoryIdx < categoryCount
      ? activeCategoryIdx
      : 0;

  // Renderizado Horizontal
  if (orientation === 'horizontal') {
    const ROW_H = seriesCount > 1 ? Math.max(36, seriesCount * 16 + 14) : 34;
    const SVG_W = 620;
    const LABEL_W = 148;
    const PAD_RIGHT = 64;
    const PAD_TOP = 10;
    const PAD_BOTTOM = 16;
    const BAR_AREA_W = SVG_W - LABEL_W - PAD_RIGHT;
    const SVG_H = PAD_TOP + categoryCount * ROW_H + PAD_BOTTOM;

    return (
      <div
        className={cn(
          'w-full rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-xs flex flex-col gap-3.5',
          className
        )}
      >
        {(title || subtitle || seriesCount > 1) && (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              {title && <h4 className="text-sm font-bold text-txt-primary">{title}</h4>}
              {subtitle && <p className="text-[11px] text-txt-muted">{subtitle}</p>}
            </div>
            {seriesCount > 1 && (
              <div className="flex flex-wrap items-center gap-2.5">
                {series.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-txt-secondary"
                  >
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span>{s.label}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inspector del ítem activo */}
        <div
          aria-live="polite"
          className="rounded-xl border border-border bg-canvas-subtle/60 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span className="font-semibold text-txt-primary truncate">
            {labels[resolvedCategoryIdx]}
          </span>
          <div className="flex flex-wrap items-center gap-3 tabular-nums">
            {series.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-[11px] text-txt-secondary">{s.label}:</span>
                <span className="font-bold text-txt-primary">
                  {formatValue(safeNum(s.data[resolvedCategoryIdx]))}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            role="img"
            aria-label={title || 'Gráfico de barras horizontal'}
            className="w-full h-auto select-none"
            style={{ minHeight: `${Math.min(height, SVG_H)}px` }}
          >
            {labels.map((catLabel, catIdx) => {
              const rowTop = PAD_TOP + catIdx * ROW_H;
              const barH = Math.max(8, Math.floor((ROW_H - 12) / Math.max(seriesCount, 1)));
              const truncated =
                catLabel.length > 20 ? `${catLabel.slice(0, 18)}...` : catLabel;

              return (
                <g key={`${catIdx}-${catLabel}`}>
                  <text
                    x={LABEL_W - 10}
                    y={rowTop + ROW_H / 2 + 3}
                    textAnchor="end"
                    fill={
                      resolvedCategoryIdx === catIdx
                        ? 'var(--color-text-primary)'
                        : 'var(--color-text-secondary)'
                    }
                    fontWeight={resolvedCategoryIdx === catIdx ? '700' : '500'}
                    fontSize="11"
                  >
                    {truncated}
                  </text>

                  {series.map((s, sIdx) => {
                    const val = Math.max(0, safeNum(s.data[catIdx]));
                    const barW = Math.max(val > 0 ? 4 : 0, (val / maxValue) * BAR_AREA_W);
                    const y = rowTop + 5 + sIdx * (barH + 2);
                    const barKey = `${catIdx}-${s.id}`;
                    const isHovered = hoveredKey === barKey;

                    return (
                      <g
                        key={barKey}
                        role="button"
                        tabIndex={0}
                        aria-label={`${catLabel} — ${s.label}: ${formatValue(val)}`}
                        className="cursor-pointer focus:outline-none"
                        onMouseEnter={() => {
                          setHoveredKey(barKey);
                          setActiveCategoryIdx(catIdx);
                        }}
                        onMouseLeave={() => setHoveredKey(null)}
                        onFocus={() => {
                          setHoveredKey(barKey);
                          setActiveCategoryIdx(catIdx);
                        }}
                        onBlur={() => setHoveredKey(null)}
                        onClick={() => {
                          setActiveCategoryIdx(catIdx);
                          onBarClick?.({
                            categoryIndex: catIdx,
                            categoryLabel: catLabel,
                            seriesId: s.id,
                            seriesLabel: s.label,
                            value: val,
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActiveCategoryIdx(catIdx);
                            onBarClick?.({
                              categoryIndex: catIdx,
                              categoryLabel: catLabel,
                              seriesId: s.id,
                              seriesLabel: s.label,
                              value: val,
                            });
                          }
                        }}
                      >
                        <rect
                          x={LABEL_W}
                          y={y}
                          width={BAR_AREA_W}
                          height={barH}
                          rx={4}
                          fill="var(--color-bg-canvas-subtle)"
                        />
                        <rect
                          x={LABEL_W}
                          y={y}
                          width={barW}
                          height={barH}
                          rx={4}
                          fill={s.color}
                          fillOpacity={isHovered ? 1 : 0.88}
                        />
                        <text
                          x={LABEL_W + barW + 6}
                          y={y + barH / 2 + 3.5}
                          fill="var(--color-text-secondary)"
                          fontSize="10"
                          fontFamily="monospace"
                          fontWeight="600"
                        >
                          {formatValue(val)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  }

  // Renderizado Vertical (por defecto)
  const SVG_W = 640;
  const SVG_H = 220;
  const PAD_LEFT = 56;
  const PAD_RIGHT = 18;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 34;
  const PLOT_W = SVG_W - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = SVG_H - PAD_TOP - PAD_BOTTOM;

  const groupWidth = PLOT_W / Math.max(categoryCount, 1);
  const innerGroupWidth = Math.min(groupWidth * 0.72, 64);
  const singleBarWidth = Math.max(
    6,
    (innerGroupWidth - (seriesCount - 1) * 4) / Math.max(seriesCount, 1)
  );
  const yTicks = [0, 0.5, 1];
  const xStep = categoryCount <= 8 ? 1 : Math.ceil(categoryCount / 7);

  return (
    <div
      className={cn(
        'w-full rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-xs flex flex-col gap-3.5',
        className
      )}
    >
      {(title || subtitle || seriesCount > 1) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h4 className="text-sm font-bold text-txt-primary">{title}</h4>}
            {subtitle && <p className="text-[11px] text-txt-muted">{subtitle}</p>}
          </div>
          {seriesCount > 1 && (
            <div className="flex flex-wrap items-center gap-2.5">
              {series.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-txt-secondary"
                >
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>{s.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inspector de categoría activa */}
      <div
        aria-live="polite"
        className="rounded-xl border border-border bg-canvas-subtle/60 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
      >
        <span className="font-mono text-[11px] font-bold text-txt-primary">
          {labels[resolvedCategoryIdx]}
        </span>
        <div className="flex flex-wrap items-center gap-3 tabular-nums">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[11px] text-txt-secondary">{s.label}:</span>
              <span className="font-bold text-txt-primary">
                {formatValue(safeNum(s.data[resolvedCategoryIdx]))}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="w-full relative" style={{ minHeight: `${height}px` }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          role="img"
          aria-label={title || 'Gráfico de barras vertical'}
          className="w-full h-auto overflow-visible select-none"
        >
          {/* Cuadrícula horizontal */}
          {yTicks.map((ratio, idx) => {
            const y = PAD_TOP + PLOT_H - ratio * PLOT_H;
            const val = ratio * maxValue;
            return (
              <g key={idx}>
                <line
                  x1={PAD_LEFT}
                  y1={y}
                  x2={SVG_W - PAD_RIGHT}
                  y2={y}
                  stroke="var(--color-border-subtle)"
                  strokeDasharray={idx === 0 ? undefined : '4 4'}
                  strokeWidth="1"
                />
                <text
                  x={PAD_LEFT - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill="var(--color-text-muted)"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {formatValue(val)}
                </text>
              </g>
            );
          })}

          {/* Grupos de barras */}
          {labels.map((catLabel, catIdx) => {
            const groupCenterX = PAD_LEFT + groupWidth * (catIdx + 0.5);
            const totalBarsWidth =
              seriesCount * singleBarWidth + Math.max(0, seriesCount - 1) * 4;
            const groupStartX = groupCenterX - totalBarsWidth / 2;
            const showLabel =
              catIdx === 0 || catIdx === categoryCount - 1 || catIdx % xStep === 0;
            const shortLabel =
              catLabel.length > 10 ? `${catLabel.slice(0, 9)}..` : catLabel;

            return (
              <g key={`${catIdx}-${catLabel}`}>
                {series.map((s, sIdx) => {
                  const val = Math.max(0, safeNum(s.data[catIdx]));
                  const barH = val > 0 ? Math.max(4, (val / maxValue) * PLOT_H) : 0;
                  const x = groupStartX + sIdx * (singleBarWidth + 4);
                  const y = PAD_TOP + PLOT_H - barH;
                  const barKey = `${catIdx}-${s.id}`;
                  const isHovered = hoveredKey === barKey;

                  return (
                    <g
                      key={barKey}
                      role="button"
                      tabIndex={0}
                      aria-label={`${catLabel} — ${s.label}: ${formatValue(val)}`}
                      className="cursor-pointer focus:outline-none"
                      onMouseEnter={() => {
                        setHoveredKey(barKey);
                        setActiveCategoryIdx(catIdx);
                      }}
                      onMouseLeave={() => setHoveredKey(null)}
                      onFocus={() => {
                        setHoveredKey(barKey);
                        setActiveCategoryIdx(catIdx);
                      }}
                      onBlur={() => setHoveredKey(null)}
                      onClick={() => {
                        setActiveCategoryIdx(catIdx);
                        onBarClick?.({
                          categoryIndex: catIdx,
                          categoryLabel: catLabel,
                          seriesId: s.id,
                          seriesLabel: s.label,
                          value: val,
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveCategoryIdx(catIdx);
                          onBarClick?.({
                            categoryIndex: catIdx,
                            categoryLabel: catLabel,
                            seriesId: s.id,
                            seriesLabel: s.label,
                            value: val,
                          });
                        }
                      }}
                    >
                      <rect
                        x={x}
                        y={PAD_TOP}
                        width={singleBarWidth}
                        height={PLOT_H}
                        fill="transparent"
                      />
                      <rect
                        x={x}
                        y={y}
                        width={singleBarWidth}
                        height={barH}
                        rx={4}
                        fill={s.color}
                        fillOpacity={isHovered ? 1 : 0.88}
                      />
                    </g>
                  );
                })}

                {showLabel && (
                  <text
                    x={groupCenterX}
                    y={SVG_H - 10}
                    textAnchor="middle"
                    fill={
                      resolvedCategoryIdx === catIdx
                        ? 'var(--color-text-primary)'
                        : 'var(--color-text-muted)'
                    }
                    fontWeight={resolvedCategoryIdx === catIdx ? '700' : '400'}
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {shortLabel}
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
