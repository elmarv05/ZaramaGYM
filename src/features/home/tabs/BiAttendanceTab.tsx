// ============================================================================
// SUB-PESTAÑA 4 BI: ASISTENCIA Y DEMANDA (BI-SLICE 3B)
// Filtros operativos de acceso, KPIs de asistencia/hora pico/pases en rojo,
// mapa de calor 7x18, tendencia multiserie, semáforo, canales y Top 10 socios
// Ubicación: src/features/home/tabs/BiAttendanceTab.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/primitives/Card';
import { Icon } from '../../../components/primitives/Icon';
import { Select } from '../../../components/primitives/Select';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableLoadingSkeleton,
  TableRow,
} from '../../../components/primitives/Table';
import {
  DEFAULT_HEATMAP_DAYS,
  DEFAULT_HEATMAP_HOURS,
  DonutChart,
  HeatmapGrid,
  MetricKpiCard,
  MultiSeriesLineChart,
} from '../../../components/primitives/charts';
import { PERSON_GENDER_OPTIONS } from '../../../domain/entity';
import { useBiAttendance } from '../../../hooks/useBiAttendance';
import { normalizeAppError } from '../../../services/ipc/client';
import {
  BI_ACCESS_CHANNEL_OPTIONS,
  BI_AGE_RANGE_OPTIONS,
  BI_TRAFFIC_LIGHT_OPTIONS,
  BiAttendanceAnalyticsDto,
  BiGranularity,
  formatPen,
  toDecimalNumber,
} from '../../../types/bi';
import {
  BiDatePreset,
  BiFilterBar,
  BiGranularity as UiGranularity,
} from '../components/BiFilterBar';

export interface BiAttendanceTabProps {
  canExportContextual: boolean;
  // Prop opcional para pruebas desacopladas
  initialData?: BiAttendanceAnalyticsDto | null;
}

const SEMAFORO_COLORS: Record<string, string> = {
  VERDE: 'var(--color-status-success)',
  AMARILLO: 'var(--color-status-warning)',
  ROJO: 'var(--color-status-danger)',
};

const ACCESS_CHANNEL_COLORS: Record<string, string> = {
  QR_LOCAL: 'var(--color-brand-primary)',
  QR_MOVIL_LAN: 'var(--color-accent-sky)',
  MANUAL_OLVIDO_QR: 'var(--color-status-warning)',
  PASE_DIARIO_CREDITO_ROJO: 'var(--color-status-danger)',
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

export const BiAttendanceTab: React.FC<BiAttendanceTabProps> = ({
  canExportContextual,
  initialData,
}) => {
  const shouldAutoFetch = initialData === undefined;
  const hook = useBiAttendance({ autoFetch: shouldAutoFetch });
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
        title: 'Error al exportar Asistencia y Demanda',
        message: normalized.message,
      });
    }
  };

  const ageSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todas' },
      ...BI_AGE_RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    ],
    []
  );

  const genderSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...PERSON_GENDER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      { value: 'SIN_ESPECIFICAR', label: 'Sin especificar' },
    ],
    []
  );

  const planSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos los planes' },
      ...(data?.planes_disponibles ?? []).map((p) => ({
        value: String(p.id),
        label: p.label,
      })),
    ],
    [data?.planes_disponibles]
  );

  const trafficLightSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...BI_TRAFFIC_LIGHT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    ],
    []
  );

  const accessChannelSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...BI_ACCESS_CHANNEL_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    ],
    []
  );

  const heatmapCells = useMemo(
    () =>
      (data?.heatmap ?? [])
        .filter((c) => c.dia_semana >= 0 && c.dia_semana <= 6 && c.hora >= 5 && c.hora <= 22)
        .map((c) => ({
          row: c.dia_semana,
          col: c.hora - 5,
          value: c.total,
          detail: `${c.total} ingresos • Promedio: ${c.promedio_por_jornada.toFixed(
            1
          )} por jornada`,
        })),
    [data]
  );

  const trendLabels = useMemo(
    () => (data?.serie_temporal ?? []).map((p) => p.etiqueta),
    [data]
  );

  const trendSeries = useMemo(() => {
    const pts = data?.serie_temporal ?? [];
    return [
      {
        id: 'total_asistencias',
        label: 'Total Asistencias',
        color: 'var(--color-brand-primary)',
        data: pts.map((p) => p.total),
        fillArea: true,
      },
      {
        id: 'socios_unicos',
        label: 'Socios Únicos',
        color: 'var(--color-accent-sky)',
        data: pts.map((p) => p.socios_unicos),
        dashed: true,
      },
    ];
  }, [data]);

  const semaforoItems = useMemo(
    () =>
      (data?.distribucion_semaforo ?? []).map((item) => ({
        id: item.clave,
        label: item.etiqueta,
        value: item.cantidad,
        percentage: item.porcentaje,
        count: item.cantidad,
        color: SEMAFORO_COLORS[item.clave] || 'var(--color-brand-primary)',
      })),
    [data]
  );

  const channelItems = useMemo(
    () =>
      (data?.distribucion_canales ?? []).map((item) => ({
        id: item.clave,
        label: item.etiqueta,
        value: item.cantidad,
        percentage: item.porcentaje,
        count: item.cantidad,
        color: ACCESS_CHANNEL_COLORS[item.clave] || 'var(--color-accent-indigo)',
      })),
    [data]
  );

  const isInitialLoading = isLoading && !data;

  return (
    <div className="space-y-5">
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
          setPreset('custom');
          hook.setFilter((prev) => ({
            ...prev,
            fecha_desde: range.fecha_desde,
            fecha_hasta: range.fecha_hasta,
          }));
        }}
        showGranularity={true}
        granularity={toUiGranularity(hook.filter.granularidad)}
        onGranularityChange={(nextG) =>
          hook.setFilter((prev) => ({
            ...prev,
            granularidad: toApiGranularity(nextG),
          }))
        }
        canExport={canExportContextual}
        exporting={hook.exporting}
        onExport={handleExport}
      >
        <div className="min-w-[130px]">
          <Select
            label="Edad"
            aria-label="Filtrar asistencia por edad"
            value={hook.filter.rango_edad ?? ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                rango_edad: e.target.value || null,
              }))
            }
            options={ageSelectOptions}
            className="h-9 text-xs"
          />
        </div>

        <div className="min-w-[135px]">
          <Select
            label="Género"
            aria-label="Filtrar asistencia por género"
            value={hook.filter.genero ?? ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                genero: e.target.value || null,
              }))
            }
            options={genderSelectOptions}
            className="h-9 text-xs"
          />
        </div>

        <div className="min-w-[155px]">
          <Select
            label="Plan"
            aria-label="Filtrar asistencia por plan"
            value={hook.filter.plan_id ? String(hook.filter.plan_id) : ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                plan_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
            options={planSelectOptions}
            className="h-9 text-xs"
          />
        </div>

        <div className="min-w-[150px]">
          <Select
            label="Semáforo"
            aria-label="Filtrar por color de semáforo"
            value={hook.filter.color_semaforo ?? ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                color_semaforo: e.target.value || null,
              }))
            }
            options={trafficLightSelectOptions}
            className="h-9 text-xs"
          />
        </div>

        <div className="min-w-[165px]">
          <Select
            label="Canal de Ingreso"
            aria-label="Filtrar por canal de ingreso"
            value={hook.filter.modo_ingreso ?? ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                modo_ingreso: e.target.value || null,
              }))
            }
            options={accessChannelSelectOptions}
            className="h-9 text-xs"
          />
        </div>
      </BiFilterBar>

      {exportFeedback && (
        <Alert
          floating={false}
          variant={exportFeedback.variant}
          title={exportFeedback.title}
          onClose={() => setExportFeedback(null)}
        >
          {exportFeedback.message}
        </Alert>
      )}

      {error && (
        <Alert
          floating={false}
          variant="danger"
          title="No se pudo cargar Asistencia y Demanda"
          actionText="Reintentar"
          onAction={() => void hook.reload()}
        >
          {error.message}
        </Alert>
      )}

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-txt-muted">
          <span>
            Analizando <strong className="text-txt-primary font-mono">{data.fecha_desde}</strong> a{' '}
            <strong className="text-txt-primary font-mono">{data.fecha_hasta}</strong> vs{' '}
            <span className="font-mono">{data.periodo_anterior_desde}</span> a{' '}
            <span className="font-mono">{data.periodo_anterior_hasta}</span>
          </span>
          <Badge variant="info" size="sm">
            Granularidad: {data.granularidad_aplicada}
          </Badge>
        </div>
      )}

      {/* Fila 1: 4 MetricKpiCard */}
      <section
        aria-label="Indicadores de asistencia y demanda"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <MetricKpiCard
          label="Total Asistencias"
          value={
            data
              ? String(Math.round(toDecimalNumber(data.total_asistencias.actual)))
              : '0'
          }
          icon="qr"
          accent="primary"
          deltaPct={data ? data.total_asistencias.delta_pct : undefined}
          subtitle={
            data
              ? `Prom. diario: ${data.promedio_diario.toFixed(1)} (Ant: ${data.promedio_diario_anterior.toFixed(
                  1
                )})`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Socios Únicos"
          value={
            data ? String(Math.round(toDecimalNumber(data.socios_unicos.actual))) : '0'
          }
          icon="users"
          accent="success"
          deltaPct={data ? data.socios_unicos.delta_pct : undefined}
          subtitle={
            data
              ? `Frecuencia: ${data.frecuencia_semanal_promedio.toFixed(1)} visitas/sem`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Día y Hora Pico"
          value={
            data?.dia_hora_pico
              ? `${data.dia_hora_pico.dia_nombre} ${data.dia_hora_pico.franja}`
              : 'Sin datos'
          }
          icon="clock"
          accent="warning"
          subtitle={
            data?.dia_hora_pico
              ? `${data.dia_hora_pico.total} ingresos en franja pico`
              : 'Sin ingresos en el rango'
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Pases en Rojo"
          value={data ? String(data.pases_rojo_emitidos) : '0'}
          icon="warning"
          accent="danger"
          subtitle={
            data
              ? `Cobrados: ${data.pases_rojo_cobrados} (${data.pases_rojo_tasa_cobro_pct.toFixed(
                  0
                )}%) • Saldo: ${formatPen(data.pases_rojo_saldo_pendiente)}`
              : undefined
          }
          loading={isInitialLoading}
        />
      </section>

      {/* Fila 2: Heatmap 7x18 */}
      <HeatmapGrid
        title="Mapa de Calor de Afluencia (Día × Hora)"
        subtitle="Concentración de ingresos de Lun–Dom entre 05:00 y 22:00 con promedio por jornada"
        rows={DEFAULT_HEATMAP_DAYS}
        cols={DEFAULT_HEATMAP_HOURS}
        cells={heatmapCells}
        valueUnit="ingresos"
        emptyTitle="Sin actividad horaria registrada"
        emptyMessage="No hay registros de ingreso en el horario de 05:00 a 22:00 para los filtros actuales."
        loading={isInitialLoading}
      />

      {/* Fila 3: Tendencia Asistencias vs Socios Únicos */}
      <MultiSeriesLineChart
        title="Tendencia de Asistencias vs Socios Únicos"
        subtitle="Evolución de entradas totales comparada con socios distintos por periodo"
        labels={trendLabels}
        series={trendSeries}
        height={290}
        formatValue={(v) => `${Math.round(v)}`}
        emptyTitle="Sin serie de asistencias"
        emptyMessage="No hay ingresos registrados en el rango de fechas seleccionado."
        loading={isInitialLoading}
      />

      {/* Fila 4: Semáforo + Canales de Acceso */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutChart
          title="Distribución por Semáforo"
          subtitle="Estado de la membresía al momento del ingreso"
          items={semaforoItems}
          centerLabel="Ingresos"
          centerValue={
            data
              ? String(Math.round(toDecimalNumber(data.total_asistencias.actual)))
              : '0'
          }
          formatValue={(v) => `${Math.round(v)} ingresos`}
          emptyTitle="Sin ingresos por semáforo"
          emptyMessage="No hay registros para desglosar por estado de semáforo."
          loading={isInitialLoading}
        />

        <DonutChart
          title="Canales de Acceso"
          subtitle="Origen del registro en recepción o torniquete LAN"
          items={channelItems}
          centerLabel="Canales"
          centerValue={String(channelItems.length)}
          formatValue={(v) => `${Math.round(v)} ingresos`}
          emptyTitle="Sin datos de canales"
          emptyMessage="No se registraron accesos por QR local, móvil o manual."
          loading={isInitialLoading}
        />
      </div>

      {/* Fila 5: Top 10 Socios Más Constantes */}
      <Card variant="default">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-txt-primary">
                Top 10 Socios Más Constantes
              </CardTitle>
              <p className="text-xs text-txt-muted">
                Ranking de mayor frecuencia de asistencia en el periodo filtrado
              </p>
            </div>
            {data && (
              <Badge variant="success" size="sm">
                Top {data.top_socios_constantes.length}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Socio</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Visitas</TableHead>
                <TableHead>Última Asistencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                <TableLoadingSkeleton colSpan={5} rows={5} />
              ) : !data || data.top_socios_constantes.length === 0 ? (
                <TableEmptyState
                  colSpan={5}
                  title="Sin ranking de asistencia"
                  description="No se encontraron socios con asistencias en el periodo seleccionado."
                  icon={<Icon name="users" className="w-8 h-8 text-txt-muted" />}
                />
              ) : (
                data.top_socios_constantes.map((row, idx) => (
                  <TableRow key={row.cliente_id}>
                    <TableCell className="font-mono font-bold text-txt-muted">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium text-txt-primary">
                      {row.nombre_completo}
                    </TableCell>
                    <TableCell className="text-txt-secondary">
                      {row.nombre_plan ?? 'Sin plan activo'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={idx < 3 ? 'success' : 'default'} size="sm">
                        {row.total_visitas} visitas
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-txt-muted">
                      {row.ultima_asistencia}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
