// ============================================================================
// SUB-PESTAÑA 2 BI: FINANZAS Y RENTABILIDAD MULTICANAL (BI-SLICE 2)
// KPIs comparativos vs periodo anterior, evolución multiserie, mix por línea,
// métodos de pago, gastos por categoría y exportación contextual CSV/XLSX
// Ubicación: src/features/home/tabs/BiFinanceTab.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Select } from '../../../components/primitives/Select';
import {
  BarChart,
  DonutChart,
  MetricKpiCard,
  MultiSeriesLineChart,
} from '../../../components/primitives/charts';
import { useBiFinance } from '../../../hooks/useBiFinance';
import { normalizeAppError } from '../../../services/ipc/client';
import {
  BiCashChannel,
  BiFinanceAnalyticsDto,
  BiGranularity,
  formatPen,
  toDecimalNumber,
} from '../../../types/bi';
import { BiDatePreset, BiFilterBar, BiGranularity as UiGranularity } from '../components/BiFilterBar';

export interface BiFinanceTabProps {
  canExportContextual: boolean;
  // Prop opcional para pruebas desacopladas
  initialData?: BiFinanceAnalyticsDto | null;
}

const CASH_CHANNEL_OPTIONS: ReadonlyArray<{ value: BiCashChannel; label: string }> = [
  { value: 'MIXTA', label: 'Mixta / Consolidada' },
  { value: 'FISICA', label: 'Caja Física (Efectivo)' },
  { value: 'DIGITAL', label: 'Caja Digital' },
];

const LINE_COLORS: Record<string, string> = {
  PLANES: 'var(--color-brand-primary)',
  PRODUCTOS: 'var(--color-accent-sky)',
  AMORTIZACIONES: 'var(--color-accent-indigo)',
};

function toUiGranularity(g: BiGranularity | null | undefined): UiGranularity {
  if (g === 'DIA') return 'day';
  if (g === 'SEMANA') return 'week';
  if (g === 'MES') return 'month';
  return 'auto';
}

function toApiGranularity(g: UiGranularity): BiGranularity | null {
  if (g === 'day') return 'DIA';
  if (g === 'week') return 'SEMANA';
  if (g === 'month') return 'MES';
  return null;
}

export const BiFinanceTab: React.FC<BiFinanceTabProps> = ({
  canExportContextual,
  initialData,
}) => {
  const shouldAutoFetch = initialData === undefined;
  const hook = useBiFinance({ autoFetch: shouldAutoFetch });
  const data = initialData !== undefined ? initialData : hook.data;
  const isLoading = shouldAutoFetch ? hook.loading : false;
  const error = shouldAutoFetch ? hook.error : null;

  const [preset, setPreset] = useState<BiDatePreset>('30d');
  const [exportFeedback, setExportFeedback] = useState<{
    variant: 'success' | 'danger';
    title: string;
    message: string;
  } | null>(null);

  const handleExport = async (format: 'CSV' | 'XLSX') => {
    setExportFeedback(null);
    try {
      const res = await hook.exportReport(format);
      setExportFeedback({
        variant: 'success',
        title: 'Exportación contextual completada',
        message: `Archivo descargado: ${res.filename} (${res.row_count} registro${
          res.row_count === 1 ? '' : 's'
        }).`,
      });
    } catch (err) {
      const normalized = normalizeAppError(err);
      setExportFeedback({
        variant: 'danger',
        title: 'Error al exportar Finanzas BI',
        message: normalized.message,
      });
    }
  };

  const lineChartLabels = useMemo(
    () => (data?.serie_temporal ?? []).map((p) => p.etiqueta),
    [data]
  );

  const lineChartSeries = useMemo(() => {
    const pts = data?.serie_temporal ?? [];
    return [
      {
        id: 'ingresos',
        label: 'Ingresos',
        color: 'var(--color-brand-primary)',
        data: pts.map((p) => toDecimalNumber(p.ingresos)),
        fillArea: true,
      },
      {
        id: 'egresos',
        label: 'Egresos',
        color: 'var(--color-status-danger)',
        data: pts.map((p) => toDecimalNumber(p.egresos)),
      },
      {
        id: 'flujo_neto',
        label: 'Flujo Neto',
        color: 'var(--color-accent-indigo)',
        data: pts.map((p) => toDecimalNumber(p.flujo_neto)),
        dashed: true,
      },
    ];
  }, [data]);

  const donutMixLineas = useMemo(
    () =>
      (data?.mix_lineas ?? []).map((item) => ({
        id: item.clave,
        label: item.etiqueta,
        value: toDecimalNumber(item.monto),
        percentage: item.porcentaje,
        count: item.cantidad,
        color: LINE_COLORS[item.clave] || 'var(--color-brand-primary)',
      })),
    [data]
  );

  const paymentMethodsData = useMemo(() => {
    const list = data?.mix_metodos_pago ?? [];
    return {
      labels: list.map((m) => m.etiqueta),
      values: list.map((m) => toDecimalNumber(m.monto)),
    };
  }, [data]);

  const expensesByCategoryData = useMemo(() => {
    const sorted = [...(data?.gastos_por_categoria ?? [])].sort(
      (a, b) => toDecimalNumber(b.monto) - toDecimalNumber(a.monto)
    );
    return {
      labels: sorted.map((c) => c.etiqueta),
      values: sorted.map((c) => toDecimalNumber(c.monto)),
    };
  }, [data]);

  const previousPeriodLabel = data
    ? `Ant. (${data.periodo_anterior_desde} a ${data.periodo_anterior_hasta})`
    : 'Periodo anterior';

  const isInitialLoading = isLoading && !data;

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Barra de Filtros Analíticos */}
      <BiFilterBar
        preset={preset}
        fechaDesde={hook.filter.fecha_desde}
        fechaHasta={hook.filter.fecha_hasta}
        onPresetChange={(nextPreset, range) => {
          setPreset(nextPreset);
          hook.setFilter((prev) => ({
            ...prev,
            fecha_desde: range.fecha_desde,
            fecha_hasta: range.fecha_hasta,
          }));
        }}
        onDateRangeChange={(range) => {
          hook.setFilter((prev) => ({
            ...prev,
            fecha_desde: range.fecha_desde,
            fecha_hasta: range.fecha_hasta,
          }));
        }}
        showGranularity={true}
        granularity={toUiGranularity(hook.filter.granularidad)}
        onGranularityChange={(nextG) => {
          hook.setFilter((prev) => ({
            ...prev,
            granularidad: toApiGranularity(nextG),
          }));
        }}
        canExport={canExportContextual}
        exporting={hook.exporting}
        onExport={(fmt) => void handleExport(fmt)}
        disabled={isLoading}
      >
        <div className="min-w-[190px] flex-1">
          <Select
            label="Canal de Caja"
            selectSize="sm"
            value={(hook.filter.canal_caja as BiCashChannel) || 'MIXTA'}
            disabled={isLoading}
            options={[...CASH_CHANNEL_OPTIONS]}
            onChange={(e) => {
              const nextChannel = e.target.value as BiCashChannel;
              hook.setFilter((prev) => ({
                ...prev,
                canal_caja: nextChannel,
              }));
            }}
          />
        </div>
      </BiFilterBar>

      {/* Feedback de Exportación Contextual */}
      {exportFeedback && (
        <Alert
          variant={exportFeedback.variant}
          title={exportFeedback.title}
          onClose={() => setExportFeedback(null)}
        >
          {exportFeedback.message}
        </Alert>
      )}

      {/* Estado de Error con Reintento */}
      {error && (
        <Alert
          variant="danger"
          title="No se pudo cargar Finanzas y Rentabilidad BI"
          actionText="Reintentar"
          onAction={() => void hook.reload()}
          onClose={hook.clearError}
        >
          {error.message}
        </Alert>
      )}

      {/* Metadatos del periodo comparado */}
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-txt-muted">
          <span>
            Analizando <strong className="text-txt-primary font-mono">{data.fecha_desde}</strong> a{' '}
            <strong className="text-txt-primary font-mono">{data.fecha_hasta}</strong> vs{' '}
            <span className="font-mono">{data.periodo_anterior_desde}</span> a{' '}
            <span className="font-mono">{data.periodo_anterior_hasta}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <Badge variant="default" size="sm">
              Canal: {data.canal_aplicado}
            </Badge>
            <Badge variant="info" size="sm">
              Granularidad: {data.granularidad_aplicada}
            </Badge>
          </div>
        </div>
      )}

      {/* Fila 1: 4 MetricKpiCard principales */}
      <section
        aria-label="Indicadores financieros comparativos"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <MetricKpiCard
          label="Ingresos Cobrados"
          value={data ? formatPen(data.ingresos.actual) : 'S/ 0.00'}
          icon="cash"
          accent="success"
          deltaPct={data ? data.ingresos.delta_pct : undefined}
          subtitle={
            data
              ? `${previousPeriodLabel}: ${formatPen(data.ingresos.anterior)}`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Egresos Totales"
          value={data ? formatPen(data.egresos.actual) : 'S/ 0.00'}
          icon="receipt"
          accent="danger"
          invertTrendColor={true}
          deltaPct={data ? data.egresos.delta_pct : undefined}
          subtitle={
            data
              ? `Compras: ${formatPen(data.compras.actual)} • Gastos: ${formatPen(
                  data.gastos.actual
                )}`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Flujo Neto / Utilidad"
          value={data ? formatPen(data.flujo_neto.actual) : 'S/ 0.00'}
          icon="trending-up"
          accent="primary"
          deltaPct={data ? data.flujo_neto.delta_pct : undefined}
          subtitle={
            data
              ? `Margen operativo: ${data.margen_operativo_pct.toFixed(1)}% (Ant: ${data.margen_operativo_anterior_pct.toFixed(1)}%)`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Ticket Promedio"
          value={data ? formatPen(data.ticket_promedio.actual) : 'S/ 0.00'}
          icon="pos"
          accent="neutral"
          deltaPct={data ? data.ticket_promedio.delta_pct : undefined}
          subtitle={
            data
              ? `${data.ventas_count} venta${
                  data.ventas_count === 1 ? '' : 's'
                } • Descuentos: ${formatPen(data.descuentos_totales.actual)}`
              : undefined
          }
          loading={isInitialLoading}
        />
      </section>

      {/* Fila 2: Evolución Multiserie */}
      <MultiSeriesLineChart
        title="Evolución de Ingresos vs Egresos y Flujo Neto"
        subtitle="Comparativo temporal continuo según granularidad y canal seleccionados"
        labels={lineChartLabels}
        series={lineChartSeries}
        formatValue={(v) => formatPen(v)}
        loading={isInitialLoading}
        emptyTitle="Sin movimientos en la serie temporal"
        emptyMessage="No se registraron ingresos ni egresos para el rango y canal seleccionados."
      />

      {/* Fila 3: Mix de Líneas (Donut) + Mix por Método de Pago (Barras Horizontales) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DonutChart
          title="Mix de Ingresos por Línea de Negocio"
          subtitle="Distribución entre Planes / Membresías, Productos / Tienda y Amortizaciones"
          centerLabel="Ingresos"
          centerValue={data ? formatPen(data.ingresos.actual) : 'S/ 0.00'}
          items={donutMixLineas}
          formatValue={(v) => formatPen(v)}
          loading={isInitialLoading}
          emptyTitle="Sin ingresos clasificados por línea"
          emptyMessage="Aún no hay cobros en el periodo filtrado."
        />

        <BarChart
          orientation="horizontal"
          title="Mix por Método de Pago"
          subtitle="Desglose por Efectivo, Yape, Plin, Transferencia y Tarjeta"
          labels={paymentMethodsData.labels}
          series={[
            {
              id: 'metodos_pago',
              label: 'Recaudado',
              color: 'var(--color-accent-sky)',
              data: paymentMethodsData.values,
            },
          ]}
          formatValue={(v) => formatPen(v)}
          loading={isInitialLoading}
          emptyTitle="Sin cobros registrados por método"
          emptyMessage="No existen pagos registrados en el periodo seleccionado."
        />
      </div>

      {/* Fila 4: Gastos Operativos por Categoría */}
      <BarChart
        orientation="horizontal"
        title="Gastos Operativos por Categoría"
        subtitle="Ordenados de mayor a menor impacto en el periodo seleccionado"
        labels={expensesByCategoryData.labels}
        series={[
          {
            id: 'gastos_categoria',
            label: 'Monto Egresado',
            color: 'var(--color-status-warning)',
            data: expensesByCategoryData.values,
          },
        ]}
        formatValue={(v) => formatPen(v)}
        loading={isInitialLoading}
        emptyTitle="Sin gastos operativos registrados"
        emptyMessage="No se registraron gastos operativos en este rango de fechas y canal de caja."
      />
    </div>
  );
};
