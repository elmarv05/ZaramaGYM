// ============================================================================
// PRIMITIVA GRÁFICA: TARJETA KPI ANALÍTICA CON TENDENCIA (BI-SLICE 2)
// Soporta estado Skeleton (CLS-zero), semántica normal/invertida y Dark/Light Mode
// Ubicación: src/components/primitives/charts/MetricKpiCard.tsx
// ============================================================================

import React from 'react';
import { cn } from '../../../utils/cn';
import { Badge } from '../Badge';
import { Icon, IconName } from '../Icon';
import { Skeleton } from '../Skeleton';

export type MetricKpiAccent = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export interface MetricKpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: IconName;
  deltaPct?: number | null;
  deltaLabel?: string;
  invertTrendColor?: boolean;
  accent?: MetricKpiAccent;
  loading?: boolean;
  className?: string;
}

const ACCENT_CLASSES: Record<MetricKpiAccent, string> = {
  primary: 'border-brand/30 bg-brand/10 text-brand',
  success: 'border-status-success-border/70 bg-status-success-bg/85 text-status-success',
  warning: 'border-status-warning-border/70 bg-status-warning-bg/85 text-status-warning',
  danger: 'border-status-danger-border/70 bg-status-danger-bg/85 text-status-danger',
  neutral: 'border-border bg-canvas-subtle text-txt-secondary',
};

export const MetricKpiCard: React.FC<MetricKpiCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  deltaPct,
  deltaLabel,
  invertTrendColor = false,
  accent = 'primary',
  loading = false,
  className,
}) => {
  if (loading) {
    return (
      <article
        role="status"
        aria-label={`Cargando ${label}`}
        className={cn(
          'bg-surface border border-border/90 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3',
          className
        )}
      >
        <span className="sr-only">Cargando métrica {label}...</span>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3 w-36" />
      </article>
    );
  }

  const renderTrendBadge = () => {
    if (deltaPct === undefined) return null;

    if (deltaPct === null || !Number.isFinite(deltaPct)) {
      return (
        <Badge variant="default" size="sm" className="font-mono text-[10px] shrink-0">
          <Icon name="minus" className="w-3 h-3" aria-hidden="true" />
          <span>{deltaLabel || 'Sin base previa'}</span>
        </Badge>
      );
    }

    if (Math.abs(deltaPct) < 0.05) {
      return (
        <Badge variant="default" size="sm" className="font-mono text-[10px] tabular-nums shrink-0">
          <Icon name="minus" className="w-3 h-3" aria-hidden="true" />
          <span>0.0%{deltaLabel ? ` ${deltaLabel}` : ''}</span>
        </Badge>
      );
    }

    const isPositive = deltaPct > 0;
    const isGood = invertTrendColor ? !isPositive : isPositive;
    const formattedPct = `${isPositive ? '+' : ''}${deltaPct.toFixed(1)}%`;

    return (
      <Badge
        variant={isGood ? 'success' : 'danger'}
        size="sm"
        className="font-mono text-[10px] tabular-nums shrink-0"
      >
        <Icon
          name={isPositive ? 'trending-up' : 'trending-down'}
          className="w-3 h-3"
          aria-hidden="true"
        />
        <span>
          {formattedPct}
          {deltaLabel ? ` ${deltaLabel}` : ''}
        </span>
      </Badge>
    );
  };

  return (
    <article
      className={cn(
        'bg-surface border border-border/90 hover:border-border-elevated rounded-xl p-4 sm:p-5 shadow-xs dark:shadow-[0_1px_2px_0_rgb(0_0_0/0.45),inset_0_1px_0_0_rgba(255,255,255,0.02)] transition-[border-color,box-shadow] duration-150 flex flex-col justify-between gap-3',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-txt-secondary truncate">{label}</span>
        {icon && (
          <div
            className={cn(
              'w-8 h-8 rounded-lg border flex items-center justify-center shrink-0',
              ACCENT_CLASSES[accent]
            )}
          >
            <Icon name={icon} className="w-4 h-4" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-2xl sm:text-[26px] font-bold tracking-tight text-txt-primary tabular-nums">
          {value}
        </span>
        {renderTrendBadge()}
      </div>

      {subtitle && <p className="text-[11px] text-txt-muted leading-snug">{subtitle}</p>}
    </article>
  );
};
