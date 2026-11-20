// ============================================================================
// COMPONENTE PRIMITIVO REUTILIZABLE: GRÁFICO LINEAL ESTADÍSTICO INTERACTIVO
// Renderiza series temporales en SVG puro con área degradada, nodos interactivos,
// tooltip/inspector de variaciones (Δ) y estadísticas resumidas (Min/Max/Delta).
// 100% compatible con Kinetic Ledger (Light) y Kinetic Obsidian (Dark).
// Ubicación: src/components/primitives/InteractiveLineChart.tsx
// ============================================================================

import React, { useId, useMemo, useState } from 'react';
import { cn } from '../../utils/cn';
import { Badge } from './Badge';
import { Icon } from './Icon';

export interface LineChartDataPoint {
  id: string | number;
  label: string;
  fullLabel?: string;
  value: number;
  delta?: number | null;
  note?: string | null;
}

export interface InteractiveLineChartProps {
  /** Puntos ordenados cronológicamente (izquierda = más antiguo, derecha = más reciente) */
  data: LineChartDataPoint[];
  unit?: string;
  title?: string;
  subtitle?: string;
  height?: number;
  decimals?: number;
  /** 'down' destaca descensos como éxito (ej. pérdida de peso); 'up' destaca alzas como éxito; 'neutral' usa estilo informativo */
  trendSemantic?: 'neutral' | 'down' | 'up';
  emptyTitle?: string;
  emptyDescription?: string;
  onSelectPoint?: (point: LineChartDataPoint) => void;
  className?: string;
}

interface PlottedPoint {
  point: LineChartDataPoint;
  x: number;
  y: number;
  index: number;
}

export const InteractiveLineChart: React.FC<InteractiveLineChartProps> = ({
  data,
  unit = '',
  title,
  subtitle,
  height = 200,
  decimals = 2,
  trendSemantic = 'neutral',
  emptyTitle = 'Sin datos estadísticos suficientes',
  emptyDescription = 'Registra mediciones para visualizar la evolución lineal.',
  onSelectPoint,
  className,
}) => {
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const validData = useMemo(
    () => data.filter((item) => Number.isFinite(item.value)),
    [data]
  );

  // Dimensiones internas del SVG (coordenadas lógicas)
  const SVG_W = 620;
  const SVG_H = 210;
  const PAD_LEFT = 54;
  const PAD_RIGHT = 24;
  const PAD_TOP = 20;
  const PAD_BOTTOM = 32;
  const PLOT_W = SVG_W - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = SVG_H - PAD_TOP - PAD_BOTTOM;

  const stats = useMemo(() => {
    if (validData.length === 0) return null;
    const values = validData.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const firstVal = values[0];
    const lastVal = values[values.length - 1];
    const totalDelta = lastVal - firstVal;

    const rawSpan = maxVal - minVal;
    const padding = rawSpan > 0 ? rawSpan * 0.2 : Math.max(Math.abs(lastVal) * 0.08, 1);
    const yMin = Math.max(0, minVal - padding);
    const yMax = maxVal + padding;
    const ySpan = Math.max(yMax - yMin, 0.01);

    const plotted: PlottedPoint[] = validData.map((point, index) => {
      const x =
        validData.length === 1
          ? PAD_LEFT + PLOT_W / 2
          : PAD_LEFT + (index / (validData.length - 1)) * PLOT_W;
      const normalized = (point.value - yMin) / ySpan;
      const y = PAD_TOP + PLOT_H - normalized * PLOT_H;
      return { point, x, y, index };
    });

    const yTicks = [0, 0.5, 1].map((ratio) => {
      const value = yMin + ratio * ySpan;
      const y = PAD_TOP + PLOT_H - ratio * PLOT_H;
      return { value, y };
    });

    const linePath = plotted
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');

    const baselineY = (PAD_TOP + PLOT_H).toFixed(2);
    const areaPath =
      plotted.length > 1
        ? `${linePath} L ${plotted[plotted.length - 1].x.toFixed(2)} ${baselineY} L ${plotted[0].x.toFixed(2)} ${baselineY} Z`
        : '';

    return {
      minVal,
      maxVal,
      firstVal,
      lastVal,
      totalDelta,
      plotted,
      yTicks,
      linePath,
      areaPath,
    };
  }, [validData, PLOT_W, PLOT_H]);

  const resolvedIndex = useMemo(() => {
    if (!stats || stats.plotted.length === 0) return null;
    if (activeIndex !== null && activeIndex >= 0 && activeIndex < stats.plotted.length) {
      return activeIndex;
    }
    return stats.plotted.length - 1;
  }, [stats, activeIndex]);

  const activePlotted =
    stats && resolvedIndex !== null ? stats.plotted[resolvedIndex] : null;

  const unitSuffix = unit ? ` ${unit}` : '';

  const getDeltaVariant = (delta: number): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
    if (Math.abs(delta) < 0.005) return 'default';
    if (trendSemantic === 'down') {
      return delta < 0 ? 'success' : 'warning';
    }
    if (trendSemantic === 'up') {
      return delta > 0 ? 'success' : 'warning';
    }
    return delta > 0 ? 'info' : 'success';
  };

  const formatSignedDelta = (delta: number): string => {
    if (Math.abs(delta) < 0.005) return `0.${'0'.repeat(decimals)}${unitSuffix}`;
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(decimals)}${unitSuffix}`;
  };

  if (!stats || validData.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-border bg-canvas-subtle/40 p-5 flex flex-col items-center justify-center text-center gap-2',
          className
        )}
      >
        <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-txt-muted">
          <Icon name="activity" className="w-5 h-5" aria-hidden="true" />
        </div>
        <h4 className="text-xs font-bold text-txt-primary">{emptyTitle}</h4>
        <p className="text-[11px] text-txt-muted max-w-xs">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-full rounded-xl border border-border bg-canvas-subtle/30 p-3.5 sm:p-4 flex flex-col gap-3',
        className
      )}
    >
      {/* Cabecera con título y métricas resumidas */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {title && (
            <h4 className="text-xs font-bold text-txt-primary flex items-center gap-1.5">
              <Icon name="activity" className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
              <span>{title}</span>
            </h4>
          )}
          {subtitle && (
            <p className="text-[11px] text-txt-muted">{subtitle}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 tabular-nums">
          <Badge variant="default" size="sm">
            Mín: {stats.minVal.toFixed(decimals)}{unitSuffix}
          </Badge>
          <Badge variant="default" size="sm">
            Máx: {stats.maxVal.toFixed(decimals)}{unitSuffix}
          </Badge>
          <Badge variant={getDeltaVariant(stats.totalDelta)} size="sm">
            Balance: {formatSignedDelta(stats.totalDelta)}
          </Badge>
        </div>
      </div>

      {/* Inspector interactivo del punto seleccionado o bajo el cursor */}
      {activePlotted && (
        <div
          aria-live="polite"
          className="bg-surface border border-border rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shadow-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-brand shrink-0" aria-hidden="true" />
            <span className="font-mono text-[11px] text-txt-muted">
              {activePlotted.point.fullLabel || activePlotted.point.label}
            </span>
            {activePlotted.point.note && (
              <span className="text-[11px] text-txt-secondary truncate max-w-[220px]">
                — {activePlotted.point.note}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 tabular-nums">
            <span className="font-extrabold text-txt-primary">
              {activePlotted.point.value.toFixed(decimals)}{unitSuffix}
            </span>
            {activePlotted.point.delta !== undefined && activePlotted.point.delta !== null ? (
              <Badge variant={getDeltaVariant(activePlotted.point.delta)} size="sm">
                {formatSignedDelta(activePlotted.point.delta)}
              </Badge>
            ) : (
              <Badge variant="default" size="sm">
                Inicial
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Lienzo SVG Interactivo */}
      <div className="w-full relative" style={{ minHeight: `${height}px` }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          role="img"
          aria-label={title || 'Gráfico estadístico lineal interactivo'}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Cuadrícula horizontal y etiquetas Eje Y */}
          {stats.yTicks.map((tick, idx) => (
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
                {tick.value.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Línea de referencia horizontal para punto único */}
          {stats.plotted.length === 1 && (
            <line
              x1={PAD_LEFT}
              y1={stats.plotted[0].y}
              x2={SVG_W - PAD_RIGHT}
              y2={stats.plotted[0].y}
              stroke="var(--color-brand-primary)"
              strokeOpacity="0.45"
              strokeDasharray="5 5"
              strokeWidth="1.5"
            />
          )}

          {/* Área sombreada bajo la curva */}
          {stats.areaPath && (
            <path d={stats.areaPath} fill={`url(#${gradientId})`} />
          )}

          {/* Línea continua de tendencia */}
          {stats.plotted.length > 1 && (
            <path
              d={stats.linePath}
              fill="none"
              stroke="var(--color-brand-primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Guía vertical del nodo activo */}
          {activePlotted && (
            <line
              x1={activePlotted.x}
              y1={PAD_TOP}
              x2={activePlotted.x}
              y2={PAD_TOP + PLOT_H}
              stroke="var(--color-brand-primary)"
              strokeOpacity="0.45"
              strokeDasharray="3 3"
              strokeWidth="1.25"
            />
          )}

          {/* Puntos interactivos y etiquetas de eje X */}
          {stats.plotted.map((item) => {
            const isSelected = resolvedIndex === item.index;
            const showXLabel =
              stats.plotted.length <= 6 ||
              item.index === 0 ||
              item.index === stats.plotted.length - 1 ||
              item.index === Math.floor(stats.plotted.length / 2);

            return (
              <g
                key={item.point.id}
                role="button"
                tabIndex={0}
                aria-label={`Control ${item.point.fullLabel || item.point.label}: ${item.point.value.toFixed(decimals)}${unitSuffix}`}
                className="cursor-pointer focus:outline-none"
                onMouseEnter={() => setActiveIndex(item.index)}
                onFocus={() => setActiveIndex(item.index)}
                onClick={() => {
                  setActiveIndex(item.index);
                  onSelectPoint?.(item.point);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveIndex(item.index);
                    onSelectPoint?.(item.point);
                  }
                }}
              >
                {/* Área táctil/hover amplia alrededor del nodo */}
                <circle cx={item.x} cy={item.y} r={16} fill="transparent" />

                {/* Halo animado cuando el nodo está activo */}
                {isSelected && (
                  <circle
                    cx={item.x}
                    cy={item.y}
                    r={9}
                    fill="var(--color-brand-primary)"
                    fillOpacity="0.2"
                  />
                )}

                {/* Nodo visible */}
                <circle
                  cx={item.x}
                  cy={item.y}
                  r={isSelected ? 5.5 : 4}
                  fill={isSelected ? 'var(--color-brand-primary)' : 'var(--color-bg-surface)'}
                  stroke="var(--color-brand-primary)"
                  strokeWidth="2.2"
                />

                {/* Etiqueta Eje X */}
                {showXLabel && (
                  <text
                    x={item.x}
                    y={SVG_H - 8}
                    textAnchor={
                      stats.plotted.length > 1 && item.index === 0
                        ? 'start'
                        : stats.plotted.length > 1 && item.index === stats.plotted.length - 1
                        ? 'end'
                        : 'middle'
                    }
                    fill={isSelected ? 'var(--color-text-primary)' : 'var(--color-text-muted)'}
                    fontWeight={isSelected ? '700' : '400'}
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {item.point.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {validData.length === 1 && (
        <p className="text-[11px] text-txt-muted text-center">
          Registra al menos 1 medición más para trazar la curva de aumento o disminución de peso.
        </p>
      )}
    </div>
  );
};
