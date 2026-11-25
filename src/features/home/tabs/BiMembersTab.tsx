// ============================================================================
// SUB-PESTAÑA 3 BI: SOCIOS Y RETENCIÓN (BI-SLICE 3A)
// Filtros demográficos y de riesgo, KPIs de retención/ARPU, movimiento de base,
// distribución etaria/género/captación, rendimiento por plan, riesgo de abandono
// con acción WhatsApp y resumen biométrico
// Ubicación: src/features/home/tabs/BiMembersTab.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/primitives/Card';
import { Icon } from '../../../components/primitives/Icon';
import { Select } from '../../../components/primitives/Select';
import { Skeleton } from '../../../components/primitives/Skeleton';
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
  BarChart,
  DonutChart,
  MetricKpiCard,
} from '../../../components/primitives/charts';
import {
  CLIENT_ACQUISITION_CHANNEL_OPTIONS,
  PERSON_GENDER_OPTIONS,
} from '../../../domain/entity';
import { useBiMembers } from '../../../hooks/useBiMembers';
import { normalizeAppError } from '../../../services/ipc/client';
import { entityIpc } from '../../../services/ipc/entityIpc';
import {
  BI_AGE_RANGE_OPTIONS,
  BI_INACTIVITY_RISK_OPTIONS,
  BiGranularity,
  BiMemberAtRiskRow,
  BiMembersAnalyticsDto,
  formatPen,
  toDecimalNumber,
} from '../../../types/bi';
import {
  BiDatePreset,
  BiFilterBar,
  BiGranularity as UiGranularity,
} from '../components/BiFilterBar';

export interface BiMembersTabProps {
  canExportContextual: boolean;
  onNavigateToEntities?: () => void;
  // Prop opcional para pruebas desacopladas
  initialData?: BiMembersAnalyticsDto | null;
}

const GENDER_COLORS: Record<string, string> = {
  MASCULINO: 'var(--color-accent-sky)',
  FEMENINO: 'var(--color-brand-primary)',
  OTRO: 'var(--color-accent-indigo)',
  PREFIERO_NO_DECIR: 'var(--color-status-warning)',
  SIN_ESPECIFICAR: 'var(--color-text-muted)',
};

const ACQUISITION_COLORS: Record<string, string> = {
  REDES_SOCIALES: 'var(--color-brand-primary)',
  RECOMENDACION: 'var(--color-accent-sky)',
  CAMINANTE_FACHADA: 'var(--color-accent-indigo)',
  PUBLICIDAD_LOCAL: 'var(--color-status-warning)',
  PROMOCION: 'var(--color-status-success)',
  OTRO: 'var(--color-text-secondary)',
  SIN_ESPECIFICAR: 'var(--color-text-muted)',
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

function buildRiskFollowUpWhatsAppUrl(row: BiMemberAtRiskRow): string | null {
  if (!row.telefono) return null;
  const digits = row.telefono.replace(/\D/g, '');
  if (digits.length < 9) return null;
  const phoneFormatted = digits.length === 9 ? `51${digits}` : digits;
  const message = encodeURIComponent(
    `Hola ${row.nombre_completo}, te saludamos de ZaramaGYM. ` +
      `Notamos que llevas ${row.dias_sin_asistir} días sin entrenar y tu plan ${row.nombre_plan} sigue activo (${row.dias_restantes} días restantes). ` +
      `Te esperamos hoy para continuar con tu rutina.`
  );
  return `https://wa.me/${phoneFormatted}?text=${message}`;
}

export const BiMembersTab: React.FC<BiMembersTabProps> = ({
  canExportContextual,
  onNavigateToEntities,
  initialData,
}) => {
  const shouldAutoFetch = initialData === undefined;
  const hook = useBiMembers({ autoFetch: shouldAutoFetch });
  const data = initialData !== undefined ? initialData : hook.data;
  const isLoading = shouldAutoFetch ? hook.loading : false;
  const error = shouldAutoFetch ? hook.error : null;

  const [preset, setPreset] = useState<BiDatePreset>('30d');
  const [actionFeedback, setActionFeedback] = useState<{
    variant: 'success' | 'danger';
    title: string;
    message: string;
  } | null>(null);

  const handleExport = async (format: 'CSV' | 'XLSX') => {
    setActionFeedback(null);
    try {
      const res = await hook.exportReport(format);
      setActionFeedback({
        variant: 'success',
        title: 'Exportación contextual completada',
        message: `Archivo descargado: ${res.filename} (${res.row_count} registro${
          res.row_count === 1 ? '' : 's'
        }).`,
      });
    } catch (err) {
      const normalized = normalizeAppError(err);
      setActionFeedback({
        variant: 'danger',
        title: 'Error al exportar Socios y Retención',
        message: normalized.message,
      });
    }
  };

  const handleOpenWhatsApp = async (row: BiMemberAtRiskRow) => {
    const url = buildRiskFollowUpWhatsAppUrl(row);
    if (!url) return;
    setActionFeedback(null);
    try {
      await entityIpc.openExternalUrl(url);
    } catch (err) {
      const normalized = normalizeAppError(err);
      setActionFeedback({
        variant: 'danger',
        title: 'No se pudo abrir WhatsApp',
        message: normalized.message,
      });
    }
  };

  const genderSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...PERSON_GENDER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      { value: 'SIN_ESPECIFICAR', label: 'Sin especificar' },
    ],
    []
  );

  const acquisitionSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todos' },
      ...CLIENT_ACQUISITION_CHANNEL_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      })),
      { value: 'SIN_ESPECIFICAR', label: 'Sin especificar' },
    ],
    []
  );

  const ageSelectOptions = useMemo(
    () => [
      { value: '', label: 'Todas' },
      ...BI_AGE_RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
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

  const riskDaysSelectOptions = useMemo(
    () =>
      BI_INACTIVITY_RISK_OPTIONS.map((o) => ({
        value: String(o.value),
        label: o.label,
      })),
    []
  );

  const movementLabels = useMemo(
    () => (data?.serie_movimiento ?? []).map((p) => p.etiqueta),
    [data]
  );

  const movementSeries = useMemo(() => {
    const pts = data?.serie_movimiento ?? [];
    return [
      {
        id: 'altas_nuevas',
        label: 'Altas Nuevas',
        color: 'var(--color-brand-primary)',
        data: pts.map((p) => p.altas_nuevas),
      },
      {
        id: 'renovaciones',
        label: 'Renovaciones',
        color: 'var(--color-accent-sky)',
        data: pts.map((p) => p.renovaciones),
      },
      {
        id: 'vencimientos',
        label: 'Vencimientos',
        color: 'var(--color-status-danger)',
        data: pts.map((p) => p.vencimientos),
      },
    ];
  }, [data]);

  const ageLabels = useMemo(
    () => (data?.distribucion_edad ?? []).map((item) => item.etiqueta),
    [data]
  );

  const ageSeries = useMemo(() => {
    const items = data?.distribucion_edad ?? [];
    return [
      {
        id: 'edad',
        label: 'Socios',
        color: 'var(--color-accent-indigo)',
        data: items.map((item) => item.cantidad),
      },
    ];
  }, [data]);

  const genderDonutItems = useMemo(
    () =>
      (data?.distribucion_genero ?? []).map((item) => ({
        id: item.clave,
        label: item.etiqueta,
        value: item.cantidad,
        percentage: item.porcentaje,
        count: item.cantidad,
        color: GENDER_COLORS[item.clave] || 'var(--color-brand-primary)',
      })),
    [data]
  );

  const acquisitionDonutItems = useMemo(
    () =>
      (data?.distribucion_captacion ?? []).map((item) => ({
        id: item.clave,
        label: item.etiqueta,
        value: item.cantidad,
        percentage: item.porcentaje,
        count: item.cantidad,
        color: ACQUISITION_COLORS[item.clave] || 'var(--color-accent-sky)',
      })),
    [data]
  );

  const renewalDeltaPp = useMemo(() => {
    if (!data) return null;
    if (data.tasa_renovacion_anterior_pct === 0 && data.tasa_renovacion_pct === 0) {
      return null;
    }
    return Number(
      (data.tasa_renovacion_pct - data.tasa_renovacion_anterior_pct).toFixed(1)
    );
  }, [data]);

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
            aria-label="Filtrar por rango de edad"
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
            aria-label="Filtrar por género"
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
            label="Captación"
            aria-label="Filtrar por canal de captación"
            value={hook.filter.canal_captacion ?? ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                canal_captacion: e.target.value || null,
              }))
            }
            options={acquisitionSelectOptions}
            className="h-9 text-xs"
          />
        </div>

        <div className="min-w-[155px]">
          <Select
            label="Plan"
            aria-label="Filtrar por plan"
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

        <div className="min-w-[140px]">
          <Select
            label="Riesgo inactividad"
            aria-label="Umbral de riesgo por inactividad"
            value={String(hook.filter.dias_inactividad_riesgo ?? 14)}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                dias_inactividad_riesgo: Number(e.target.value) || 14,
              }))
            }
            options={riskDaysSelectOptions}
            className="h-9 text-xs"
          />
        </div>
      </BiFilterBar>

      {actionFeedback && (
        <Alert
          floating={false}
          variant={actionFeedback.variant}
          title={actionFeedback.title}
          onClose={() => setActionFeedback(null)}
        >
          {actionFeedback.message}
        </Alert>
      )}

      {error && (
        <Alert
          floating={false}
          variant="danger"
          title="No se pudo cargar Socios y Retención"
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
          <div className="flex items-center gap-1.5">
            <Badge variant="default" size="sm">
              Umbral riesgo: {data.dias_inactividad_riesgo}d
            </Badge>
            <Badge variant="info" size="sm">
              Granularidad: {data.granularidad_aplicada}
            </Badge>
          </div>
        </div>
      )}

      {/* Fila 1: 4 MetricKpiCard */}
      <section
        aria-label="Indicadores de socios y retención"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <MetricKpiCard
          label="Socios Nuevos"
          value={data ? String(Math.round(toDecimalNumber(data.nuevos_socios.actual))) : '0'}
          icon="users"
          accent="primary"
          deltaPct={data ? data.nuevos_socios.delta_pct : undefined}
          subtitle={
            data
              ? `Activos: ${data.socios_activos_total} • Vigentes: ${data.membresias_vigentes_total}`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Tasa de Renovación"
          value={data ? `${data.tasa_renovacion_pct.toFixed(1)}%` : '0.0%'}
          icon="refresh"
          accent="success"
          deltaPct={renewalDeltaPp}
          deltaLabel="pp vs ant."
          subtitle={
            data
              ? `Churn: ${data.tasa_churn_pct.toFixed(1)}% • R/V: ${data.renovaciones_en_periodo}/${data.vencimientos_en_periodo}`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="ARPU (Ingreso / Socio)"
          value={data ? formatPen(data.arpu.actual) : 'S/ 0.00'}
          icon="cash"
          accent="neutral"
          deltaPct={data ? data.arpu.delta_pct : undefined}
          subtitle={data ? `Ant: ${formatPen(data.arpu.anterior)}` : undefined}
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Días en Prórrogas"
          value={
            data
              ? String(Math.round(toDecimalNumber(data.dias_prorroga_otorgados.actual)))
              : '0'
          }
          icon="calendar"
          accent="warning"
          invertTrendColor={true}
          deltaPct={data ? data.dias_prorroga_otorgados.delta_pct : undefined}
          subtitle={
            data
              ? `Ant: ${Math.round(toDecimalNumber(data.dias_prorroga_otorgados.anterior))} días`
              : undefined
          }
          loading={isInitialLoading}
        />
      </section>

      {/* Fila 2: Movimiento de Base */}
      <BarChart
        title="Movimiento de Base"
        subtitle="Altas nuevas, renovaciones y vencimientos registrados en el periodo"
        labels={movementLabels}
        series={movementSeries}
        orientation="vertical"
        height={290}
        formatValue={(v) => `${Math.round(v)} socios`}
        emptyTitle="Sin movimiento de socios"
        emptyMessage="No se registraron altas, renovaciones ni vencimientos con los filtros seleccionados."
        loading={isInitialLoading}
      />

      {/* Fila 3: Distribución Etaria + Género & Captación */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarChart
          title="Distribución Etaria"
          subtitle="Composición de socios por rango de edad"
          labels={ageLabels}
          series={ageSeries}
          orientation="vertical"
          height={280}
          formatValue={(v) => `${Math.round(v)} socios`}
          emptyTitle="Sin datos etarios"
          emptyMessage="No hay socios que coincidan con el criterio demográfico actual."
          loading={isInitialLoading}
        />

        <Card variant="default">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold text-txt-primary">
              Perfil Demográfico y Captación
            </CardTitle>
            <p className="text-xs text-txt-muted">
              Cobertura de datos capturados en ficha de socios
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-txt-primary">
                  Distribución por Género
                </span>
                {data && (
                  <Badge variant="info" size="sm">
                    {data.cobertura_genero_pct.toFixed(0)}% cobertura
                  </Badge>
                )}
              </div>
              <DonutChart
                items={genderDonutItems}
                centerLabel="Género"
                centerValue={
                  data ? `${data.cobertura_genero_pct.toFixed(0)}%` : '0%'
                }
                formatValue={(v) => `${Math.round(v)} socios`}
                emptyTitle="Sin datos de género"
                emptyMessage="Registra el género en la ficha del socio."
                loading={isInitialLoading}
                className="border-0 shadow-none p-0 bg-transparent"
              />
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-txt-primary">
                  Canal de Captación
                </span>
                {data && (
                  <Badge variant="success" size="sm">
                    {data.cobertura_captacion_pct.toFixed(0)}% cobertura
                  </Badge>
                )}
              </div>
              <DonutChart
                items={acquisitionDonutItems}
                centerLabel="Captación"
                centerValue={
                  data ? `${data.cobertura_captacion_pct.toFixed(0)}%` : '0%'
                }
                formatValue={(v) => `${Math.round(v)} socios`}
                emptyTitle="Sin datos de captación"
                emptyMessage="Registra cómo nos conoció el socio."
                loading={isInitialLoading}
                className="border-0 shadow-none p-0 bg-transparent"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fila 4: Rendimiento por Plan */}
      <Card variant="default">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-txt-primary">
                Rendimiento por Plan
              </CardTitle>
              <p className="text-xs text-txt-muted">
                Unidades vendidas e ingresos generados por cada plan de membresía
              </p>
            </div>
            {data && (
              <Badge variant="default" size="sm">
                {data.rendimiento_planes.length} plan
                {data.rendimiento_planes.length === 1 ? '' : 'es'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Vendidos</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="w-[180px]">% Ingresos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                <TableLoadingSkeleton colSpan={6} rows={4} />
              ) : !data || data.rendimiento_planes.length === 0 ? (
                <TableEmptyState
                  colSpan={6}
                  title="Sin ventas de planes en el rango"
                  description="Ajusta las fechas o filtros para analizar el desempeño por plan."
                  icon={<Icon name="catalog" className="w-8 h-8 text-txt-muted" />}
                />
              ) : (
                data.rendimiento_planes.map((plan) => (
                  <TableRow key={plan.plan_id}>
                    <TableCell className="font-mono text-xs text-txt-muted">
                      {plan.codigo}
                    </TableCell>
                    <TableCell className="font-medium text-txt-primary">
                      {plan.nombre}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" size="sm">
                        {plan.tipo_plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {plan.unidades_vendidas}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-txt-primary tabular-nums">
                      {formatPen(plan.ingresos)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-canvas-subtle overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand transition-all duration-300"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  Number.isFinite(plan.porcentaje_ingresos)
                                    ? plan.porcentaje_ingresos
                                    : 0
                                )
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="w-11 text-right text-xs font-mono text-txt-secondary tabular-nums">
                          {(Number.isFinite(plan.porcentaje_ingresos)
                            ? plan.porcentaje_ingresos
                            : 0
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Fila 5: Socios Activos en Riesgo de Abandono */}
      <Card variant="default">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-txt-primary">
                Socios Activos en Riesgo de Abandono
              </CardTitle>
              <p className="text-xs text-txt-muted">
                Membresías vigentes con al menos {data?.dias_inactividad_riesgo ?? hook.filter.dias_inactividad_riesgo ?? 14} días sin registrar asistencia
              </p>
            </div>
            <div className="flex items-center gap-2">
              {data && (
                <Badge
                  variant={data.socios_en_riesgo.length > 0 ? 'warning' : 'success'}
                  size="sm"
                >
                  {data.socios_en_riesgo.length} en riesgo
                </Badge>
              )}
              {onNavigateToEntities && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Icon name="directory" className="w-3.5 h-3.5" />}
                  onClick={onNavigateToEntities}
                >
                  Ver Directorio
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Socio</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Días sin asistir</TableHead>
                <TableHead className="text-right">Días restantes</TableHead>
                <TableHead>Última visita</TableHead>
                <TableHead className="text-right">Seguimiento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                <TableLoadingSkeleton colSpan={6} rows={4} />
              ) : !data || data.socios_en_riesgo.length === 0 ? (
                <TableEmptyState
                  colSpan={6}
                  title="Sin socios activos en riesgo"
                  description="Ningún socio vigente supera el umbral de inactividad seleccionado."
                  icon={<Icon name="check" className="w-8 h-8 text-status-success" />}
                />
              ) : (
                data.socios_en_riesgo.map((row) => {
                  const whatsappUrl = buildRiskFollowUpWhatsAppUrl(row);
                  const isCritical = row.dias_sin_asistir >= 21;
                  return (
                    <TableRow key={row.cliente_id}>
                      <TableCell>
                        <div className="font-medium text-txt-primary">
                          {row.nombre_completo}
                        </div>
                        {row.telefono && (
                          <div className="text-[11px] font-mono text-txt-muted">
                            {row.telefono}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-txt-secondary">
                        {row.nombre_plan}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isCritical ? 'danger' : 'warning'}
                          size="sm"
                        >
                          {row.dias_sin_asistir} días
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-txt-secondary">
                        {row.dias_restantes}d
                      </TableCell>
                      <TableCell className="font-mono text-xs text-txt-muted">
                        {row.ultima_asistencia ?? 'Sin visitas'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!whatsappUrl}
                          title={
                            whatsappUrl
                              ? `Enviar seguimiento por WhatsApp a ${row.nombre_completo}`
                              : 'Sin teléfono válido registrado'
                          }
                          leftIcon={<Icon name="smartphone" className="w-3.5 h-3.5" />}
                          onClick={() => void handleOpenWhatsApp(row)}
                        >
                          WhatsApp
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Footer compacto: Resumen Biométrico (Control de Peso) */}
      <Card variant="subtle">
        <CardContent className="p-4">
          {isInitialLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
                  <Icon name="activity" className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-txt-primary">
                    Resumen Biométrico (Control de Peso)
                  </h3>
                  <p className="text-xs text-txt-muted">
                    Seguimiento histórico de pesajes registrados en el directorio
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-left sm:text-right">
                <div>
                  <div className="text-[11px] text-txt-muted">Socios con peso</div>
                  <div className="text-sm font-bold font-mono text-txt-primary tabular-nums">
                    {data?.resumen_biometrico.socios_con_peso ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-txt-muted">Con evolución</div>
                  <div className="text-sm font-bold font-mono text-txt-primary tabular-nums">
                    {data?.resumen_biometrico.socios_con_evolucion ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-txt-muted">Variación prom.</div>
                  <div className="text-sm font-bold font-mono text-txt-primary tabular-nums">
                    {`${toDecimalNumber(data?.resumen_biometrico.variacion_promedio_kg).toFixed(1)} kg`}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-txt-muted">Registros totales</div>
                  <div className="text-sm font-bold font-mono text-txt-primary tabular-nums">
                    {data?.resumen_biometrico.total_registros_peso ?? 0}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
