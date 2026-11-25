// ============================================================================
// COMPONENTE: BARRA DE FILTROS ANALÍTICOS REUTILIZABLE BI (BI-SLICE 2)
// Presets rápidos de fechas locales, granularidad, slot de filtros específicos
// y exportación contextual CSV / Excel (.xlsx) controlada por RBAC
// Ubicación: src/features/home/components/BiFilterBar.tsx
// ============================================================================

import React from 'react';
import { cn } from '../../../utils/cn';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { Input } from '../../../components/primitives/Input';
import { Select } from '../../../components/primitives/Select';

export type BiDatePreset =
  | 'today'
  | '7d'
  | '30d'
  | 'current_month'
  | 'previous_month'
  | '90d'
  | 'ytd'
  | 'custom';

export type BiGranularity = 'auto' | 'day' | 'week' | 'month';

export interface BiDateRange {
  fecha_desde: string;
  fecha_hasta: string;
}

export const BI_DATE_PRESET_OPTIONS: ReadonlyArray<{
  id: Exclude<BiDatePreset, 'custom'>;
  label: string;
}> = [
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'current_month', label: 'Mes actual' },
  { id: 'previous_month', label: 'Mes anterior' },
  { id: '90d', label: '90 días' },
  { id: 'ytd', label: 'Año (YTD)' },
];

export const BI_GRANULARITY_OPTIONS: ReadonlyArray<{
  value: BiGranularity;
  label: string;
}> = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

/**
 * Formatea una fecha local en YYYY-MM-DD sin desplazamientos UTC.
 */
export function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calcula el rango local (YYYY-MM-DD) para un preset analítico.
 */
export function computeDatePresetRange(
  preset: Exclude<BiDatePreset, 'custom'>,
  now: Date = new Date()
): BiDateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = formatLocalYmd(today);

  switch (preset) {
    case 'today':
      return { fecha_desde: todayStr, fecha_hasta: todayStr };
    case '7d': {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      return { fecha_desde: formatLocalYmd(start), fecha_hasta: todayStr };
    }
    case '30d': {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      return { fecha_desde: formatLocalYmd(start), fecha_hasta: todayStr };
    }
    case 'current_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { fecha_desde: formatLocalYmd(start), fecha_hasta: todayStr };
    }
    case 'previous_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        fecha_desde: formatLocalYmd(start),
        fecha_hasta: formatLocalYmd(end),
      };
    }
    case '90d': {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89);
      return { fecha_desde: formatLocalYmd(start), fecha_hasta: todayStr };
    }
    case 'ytd': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { fecha_desde: formatLocalYmd(start), fecha_hasta: todayStr };
    }
  }
}

export interface BiFilterBarProps {
  preset: BiDatePreset;
  fechaDesde: string;
  fechaHasta: string;
  onPresetChange: (preset: BiDatePreset, range: BiDateRange) => void;
  onDateRangeChange: (range: BiDateRange) => void;
  showGranularity?: boolean;
  granularity?: BiGranularity;
  onGranularityChange?: (granularity: BiGranularity) => void;
  canExport?: boolean;
  exporting?: boolean;
  onExport?: (format: 'CSV' | 'XLSX') => void;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export const BiFilterBar: React.FC<BiFilterBarProps> = ({
  preset,
  fechaDesde,
  fechaHasta,
  onPresetChange,
  onDateRangeChange,
  showGranularity = false,
  granularity = 'auto',
  onGranularityChange,
  canExport = false,
  exporting = false,
  onExport,
  disabled = false,
  children,
  className,
}) => {
  const handleSelectPreset = (nextPreset: Exclude<BiDatePreset, 'custom'>) => {
    const range = computeDatePresetRange(nextPreset);
    onPresetChange(nextPreset, range);
    onDateRangeChange(range);
  };

  const handleCustomDateChange = (field: 'fecha_desde' | 'fecha_hasta', value: string) => {
    const nextRange: BiDateRange = {
      fecha_desde: field === 'fecha_desde' ? value : fechaDesde,
      fecha_hasta: field === 'fecha_hasta' ? value : fechaHasta,
    };
    onPresetChange('custom', nextRange);
    onDateRangeChange(nextRange);
  };

  return (
    <section
      aria-label="Filtros analíticos"
      className={cn(
        'w-full bg-surface border border-border/90 rounded-2xl p-4 shadow-xs flex flex-col gap-3.5',
        className
      )}
    >
      {/* Fila 1: Presets rápidos + Botones opcionales de Exportación Contextual */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Presets de rango de fechas"
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-txt-muted mr-1">
            <Icon name="calendar" className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
            <span>Periodo:</span>
          </span>

          {BI_DATE_PRESET_OPTIONS.map((opt) => {
            const isActive = preset === opt.id;
            return (
              <Button
                key={opt.id}
                type="button"
                variant={isActive ? 'primary' : 'outline'}
                size="sm"
                aria-pressed={isActive}
                disabled={disabled}
                onClick={() => handleSelectPreset(opt.id)}
                className="h-7 px-2.5 text-[11px]"
              >
                {opt.label}
              </Button>
            );
          })}

          {preset === 'custom' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-status-info-bg text-status-info border border-status-info-border text-[10px] font-semibold">
              Personalizado
            </span>
          )}
        </div>

        {canExport && onExport && (
          <div
            role="group"
            aria-label="Exportación contextual de la vista"
            className="flex items-center gap-1.5 shrink-0"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || exporting}
              isLoading={exporting}
              onClick={() => onExport('CSV')}
              aria-label="Exportar vista en CSV"
              leftIcon={<Icon name="download" className="w-3.5 h-3.5" aria-hidden="true" />}
              className="h-8 text-xs"
            >
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || exporting}
              isLoading={exporting}
              onClick={() => onExport('XLSX')}
              aria-label="Exportar vista en Excel (.xlsx)"
              leftIcon={<Icon name="download" className="w-3.5 h-3.5" aria-hidden="true" />}
              className="h-8 text-xs"
            >
              Excel (.xlsx)
            </Button>
          </div>
        )}
      </div>

      {/* Fila 2: Rango de fechas manual + Granularidad */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end pt-2 border-t border-border/70">
        <div className="lg:col-span-4">
          <Input
            label="Desde"
            type="date"
            inputSize="sm"
            value={fechaDesde}
            disabled={disabled}
            onChange={(e) => handleCustomDateChange('fecha_desde', e.target.value)}
          />
        </div>

        <div className="lg:col-span-4">
          <Input
            label="Hasta"
            type="date"
            inputSize="sm"
            value={fechaHasta}
            disabled={disabled}
            onChange={(e) => handleCustomDateChange('fecha_hasta', e.target.value)}
          />
        </div>

        {showGranularity && onGranularityChange && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Select
              label="Granularidad"
              selectSize="sm"
              value={granularity}
              disabled={disabled}
              options={[...BI_GRANULARITY_OPTIONS]}
              onChange={(e) => onGranularityChange(e.target.value as BiGranularity)}
            />
          </div>
        )}
      </div>

      {/* Fila 3 (opcional): Slot de filtros específicos del tablero */}
      {children && (
        <div className="flex flex-wrap items-end gap-3 pt-2.5 border-t border-border/60">
          {children}
        </div>
      )}
    </section>
  );
};
