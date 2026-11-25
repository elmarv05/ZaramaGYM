// ============================================================================
// SUB-PESTAÑA 6 BI: CONTROL, RIESGO Y REPORTES (BI-SLICE 4B)
// Morosidad por antigüedad (aging), deuda por origen, arqueos por operador,
// tachados/anulaciones, auditoría crítica y Centro Oficial de Reportes
// Ubicación: src/features/home/tabs/BiControlTab.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
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
  BarChart,
  DonutChart,
  MetricKpiCard,
} from '../../../components/primitives/charts';
import { triggerBase64FileDownload } from '../../../domain/printingBackup';
import { useBiControl } from '../../../hooks/useBiControl';
import { biIpc } from '../../../services/ipc/biIpc';
import { normalizeAppError } from '../../../services/ipc/client';
import {
  BI_CREDIT_ORIGIN_OPTIONS,
  BiCashChannel,
  BiControlAnalyticsDto,
  formatPen,
  toDecimalNumber,
} from '../../../types/bi';
import { BiDatePreset, BiFilterBar } from '../components/BiFilterBar';

export interface BiControlTabProps {
  canExportContextual: boolean;
  canExportExecutivePdf?: boolean;
  officialReportsSlot?: React.ReactNode;
  // Prop opcional para pruebas desacopladas
  initialData?: BiControlAnalyticsDto | null;
}

const PDF_CHANNEL_OPTIONS: ReadonlyArray<{ value: BiCashChannel; label: string }> = [
  { value: 'MIXTA', label: 'Mixta / Consolidada' },
  { value: 'FISICA', label: 'Caja Física' },
  { value: 'DIGITAL', label: 'Caja Digital' },
];

const ORIGIN_COLORS: Record<string, string> = {
  MEMBRESIA_PAGO_PARCIAL: 'var(--color-brand-primary)',
  PRODUCTO_CREDITO: 'var(--color-accent-sky)',
  PASE_DIARIO_SEMAFORO_ROJO: 'var(--color-status-danger)',
};

function formatAuditDetails(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '{}') return 'Sin detalles adicionales';
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117)}...`;
}

export const BiControlTab: React.FC<BiControlTabProps> = ({
  canExportContextual,
  canExportExecutivePdf = false,
  officialReportsSlot,
  initialData,
}) => {
  const shouldAutoFetch = initialData === undefined;
  const hook = useBiControl({ autoFetch: shouldAutoFetch });
  const data = initialData !== undefined ? initialData : hook.data;
  const isLoading = shouldAutoFetch ? hook.loading : false;
  const error = shouldAutoFetch ? hook.error : null;

  const [preset, setPreset] = useState<BiDatePreset>('30d');
  const [pdfChannel, setPdfChannel] = useState<BiCashChannel>('MIXTA');
  const [generatingPdf, setGeneratingPdf] = useState<boolean>(false);
  const [pdfFeedback, setPdfFeedback] = useState<{
    variant: 'success' | 'danger';
    title: string;
    message: string;
  } | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{
    variant: 'success' | 'danger';
    title: string;
    message: string;
  } | null>(null);

  const handleGenerateExecutivePdf = async () => {
    setPdfFeedback(null);
    setGeneratingPdf(true);
    try {
      const res = await biIpc.generateExecutiveBiReportPdf({
        fecha_desde: hook.filter.fecha_desde,
        fecha_hasta: hook.filter.fecha_hasta,
        canal_caja: pdfChannel,
      });
      triggerBase64FileDownload(res.content_base64, res.filename, res.mime_type);
      setPdfFeedback({
        variant: 'success',
        title: 'Reporte Ejecutivo PDF generado',
        message: `Archivo descargado: ${res.filename}.`,
      });
    } catch (err) {
      const normalized =
        typeof normalizeAppError === 'function'
          ? normalizeAppError(err)
          : {
              code: 'Internal' as const,
              message:
                err instanceof Error
                  ? err.message
                  : 'No se pudo generar el Reporte Ejecutivo PDF.',
            };
      setPdfFeedback({
        variant: 'danger',
        title: 'Error al generar Reporte Ejecutivo PDF',
        message: normalized.message,
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

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
        title: 'Error al exportar Control y Riesgo',
        message: normalized.message,
      });
    }
  };

  const operatorOptions = useMemo(
    () => [
      { value: '', label: 'Todos los operadores' },
      ...(data?.operadores_disponibles ?? []).map((o) => ({
        value: String(o.id),
        label: o.label,
      })),
    ],
    [data?.operadores_disponibles]
  );

  const originOptions = useMemo(
    () => [
      { value: '', label: 'Todos los orígenes' },
      ...BI_CREDIT_ORIGIN_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    ],
    []
  );

  const agingLabels = useMemo(
    () => (data?.aging_cartera ?? []).map((item) => item.etiqueta),
    [data]
  );

  const agingSeries = useMemo(() => {
    const items = data?.aging_cartera ?? [];
    return [
      {
        id: 'aging_cartera',
        label: 'Saldo Moroso (S/)',
        color: 'var(--color-status-danger)',
        data: items.map((item) => toDecimalNumber(item.monto)),
      },
    ];
  }, [data]);

  const originDonutItems = useMemo(
    () =>
      (data?.deuda_por_origen ?? []).map((item) => ({
        id: item.clave,
        label: item.etiqueta,
        value: toDecimalNumber(item.monto),
        percentage: item.porcentaje,
        count: item.cantidad,
        color: ORIGIN_COLORS[item.clave] || 'var(--color-accent-indigo)',
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
        showGranularity={false}
        canExport={canExportContextual}
        exporting={hook.exporting}
        onExport={handleExport}
      >
        <div className="min-w-[175px]">
          <Select
            label="Operador"
            aria-label="Filtrar por operador"
            value={hook.filter.usuario_id ? String(hook.filter.usuario_id) : ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                usuario_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
            options={operatorOptions}
            className="h-9 text-xs"
          />
        </div>

        <div className="min-w-[185px]">
          <Select
            label="Origen de Crédito"
            aria-label="Filtrar por origen de crédito"
            value={hook.filter.origen_credito ?? ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                origen_credito: e.target.value || null,
              }))
            }
            options={originOptions}
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
          title="No se pudo cargar Control, Riesgo y Reportes"
          actionText="Reintentar"
          onAction={() => void hook.reload()}
        >
          {error.message}
        </Alert>
      )}

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-txt-muted">
          <span>
            Auditoría del <strong className="text-txt-primary font-mono">{data.fecha_desde}</strong>{' '}
            al <strong className="text-txt-primary font-mono">{data.fecha_hasta}</strong>
          </span>
          <Badge variant="info" size="sm">
            {data.eventos_criticos_auditoria.length} evento
            {data.eventos_criticos_auditoria.length === 1 ? '' : 's'} crítico
            {data.eventos_criticos_auditoria.length === 1 ? '' : 's'}
          </Badge>
        </div>
      )}

      {/* Fila 1: 4 MetricKpiCard */}
      <section
        aria-label="Indicadores de riesgo y control interno"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <MetricKpiCard
          label="Saldo Pendiente Total"
          value={data ? formatPen(data.saldo_pendiente_total) : 'S/ 0.00'}
          icon="credit-card"
          accent="danger"
          subtitle={
            data
              ? `${data.deudores_activos_count} deudores • ${data.creditos_pendientes_count} créditos`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Tasa de Recuperación"
          value={data ? `${data.tasa_recuperacion_pct.toFixed(1)}%` : '0.0%'}
          icon="check"
          accent="success"
          subtitle={
            data
              ? `Cobrado ${formatPen(data.creditos_cobrados_periodo)} de ${formatPen(
                  data.creditos_emitidos_periodo
                )} emitidos`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Descuadre Neto en Arqueos"
          value={data ? formatPen(data.descuadre_neto_acumulado) : 'S/ 0.00'}
          icon="cash"
          accent="warning"
          subtitle={
            data
              ? `${data.turnos_cerrados_count} cerrados • Exactos: ${data.turnos_cuadre_exacto_count} • Sob/Falt: ${data.turnos_con_sobrante_count}/${data.turnos_con_faltante_count}`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Tasa de Anulación / Tachados"
          value={data ? `${data.tasa_anulacion_pct.toFixed(1)}%` : '0.0%'}
          icon="shield"
          accent="danger"
          invertTrendColor={true}
          subtitle={
            data
              ? `Tachadas: ${data.ventas_tachadas_count} • Anuladas: ${data.ventas_anuladas_count} de ${data.ventas_totales_periodo}`
              : undefined
          }
          loading={isInitialLoading}
        />
      </section>

      {/* Fila 2: Aging de Cartera + Deuda por Origen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarChart
          title="Antigüedad de Cartera Morosa (Aging)"
          subtitle="Distribución de saldo pendiente por días desde su emisión"
          labels={agingLabels}
          series={agingSeries}
          orientation="vertical"
          height={280}
          formatValue={(v) => formatPen(v)}
          emptyTitle="Sin cartera morosa pendiente"
          emptyMessage="No existen créditos pendientes bajo los filtros seleccionados."
          loading={isInitialLoading}
        />

        <DonutChart
          title="Deuda Pendiente por Origen"
          subtitle="Concentración de créditos según modalidad de origen"
          items={originDonutItems}
          centerLabel="Deuda Total"
          centerValue={data ? formatPen(data.saldo_pendiente_total) : 'S/ 0.00'}
          formatValue={(v) => formatPen(v)}
          emptyTitle="Sin deuda por origen"
          emptyMessage="No hay créditos pendientes registrados."
          loading={isInitialLoading}
        />
      </div>

      {/* Fila 3: Control Interno por Operador */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="default">
          <CardHeader>
            <CardTitle className="text-base font-bold text-txt-primary">
              Arqueos de Caja por Operador
            </CardTitle>
            <p className="text-xs text-txt-muted">
              Turnos cerrados, sobrantes, faltantes y diferencia neta por cajero
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Cerrados</TableHead>
                  <TableHead className="text-right">Con Dif.</TableHead>
                  <TableHead className="text-right">Sobrante</TableHead>
                  <TableHead className="text-right">Faltante</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isInitialLoading ? (
                  <TableLoadingSkeleton colSpan={6} rows={4} />
                ) : !data || data.arqueos_por_operador.length === 0 ? (
                  <TableEmptyState
                    colSpan={6}
                    title="Sin arqueos cerrados"
                    description="No se registraron cierres de caja en este periodo."
                    icon={<Icon name="cash" className="w-8 h-8 text-txt-muted" />}
                  />
                ) : (
                  data.arqueos_por_operador.map((row) => {
                    const net = toDecimalNumber(row.diferencia_neta);
                    const badgeVariant =
                      Math.abs(net) < 0.005 ? 'success' : net > 0 ? 'warning' : 'danger';
                    return (
                      <TableRow key={row.usuario_id}>
                        <TableCell>
                          <div className="font-medium text-txt-primary">
                            {row.nombre_completo}
                          </div>
                          <div className="text-[11px] font-mono text-txt-muted">
                            @{row.username}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {row.turnos_cerrados}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {row.turnos_con_diferencia}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-status-warning">
                          {formatPen(row.sobrante_total)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-status-danger">
                          {formatPen(row.faltante_total)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={badgeVariant} size="sm">
                            {formatPen(row.diferencia_neta)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card variant="default">
          <CardHeader>
            <CardTitle className="text-base font-bold text-txt-primary">
              Tachados y Anulaciones por Vendedor
            </CardTitle>
            <p className="text-xs text-txt-muted">
              Incidencia antifraude de boletas tachadas y anuladas por usuario
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Tachadas</TableHead>
                  <TableHead className="text-right">Anuladas</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Incidencia %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isInitialLoading ? (
                  <TableLoadingSkeleton colSpan={6} rows={4} />
                ) : !data || data.tachados_por_operador.length === 0 ? (
                  <TableEmptyState
                    colSpan={6}
                    title="Sin ventas en el periodo"
                    description="No se registraron transacciones para evaluar tachados."
                    icon={<Icon name="shield" className="w-8 h-8 text-txt-muted" />}
                  />
                ) : (
                  data.tachados_por_operador.map((row) => (
                    <TableRow key={row.usuario_id}>
                      <TableCell>
                        <div className="font-medium text-txt-primary">
                          {row.nombre_completo}
                        </div>
                        <div className="text-[11px] font-mono text-txt-muted">
                          @{row.username}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {row.ventas_totales}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {row.tachadas_pendientes}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {row.anuladas_definitivas}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-txt-secondary">
                        {formatPen(row.monto_anulado_o_tachado)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            row.tasa_incidencia_pct >= 10
                              ? 'danger'
                              : row.tasa_incidencia_pct > 0
                              ? 'warning'
                              : 'success'
                          }
                          size="sm"
                        >
                          {row.tasa_incidencia_pct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Fila 4: Eventos Críticos de Auditoría */}
      <Card variant="default">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-txt-primary">
                Eventos Críticos de Auditoría
              </CardTitle>
              <p className="text-xs text-txt-muted">
                Trazabilidad de acciones sensibles (anulaciones, pases en rojo, permisos, restauraciones)
              </p>
            </div>
            {data && (
              <Badge variant="default" size="sm">
                {data.eventos_criticos_auditoria.length} registro
                {data.eventos_criticos_auditoria.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                <TableLoadingSkeleton colSpan={5} rows={4} />
              ) : !data || data.eventos_criticos_auditoria.length === 0 ? (
                <TableEmptyState
                  colSpan={5}
                  title="Sin eventos críticos en el rango"
                  description="No se registraron alertas ni eventos sensibles bajo los filtros activos."
                  icon={<Icon name="audit" className="w-8 h-8 text-txt-muted" />}
                />
              ) : (
                data.eventos_criticos_auditoria.map((evt) => (
                  <TableRow key={evt.id}>
                    <TableCell className="font-mono text-xs text-txt-muted whitespace-nowrap">
                      {evt.created_at}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium text-txt-primary">
                      @{evt.username}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" size="sm">
                        {evt.modulo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning" size="sm">
                        {evt.accion}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-txt-secondary max-w-[360px] truncate">
                      {formatAuditDetails(evt.detalles_json)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Fila 5: Reporte Ejecutivo PDF Consolidado + Centro Oficial de Reportes Contables */}
      <div className="space-y-4">
        {canExportExecutivePdf && (
          <Card variant="elevated">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-brand/10 border border-brand/25 text-brand flex items-center justify-center shrink-0">
                    <Icon name="printer" className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-txt-primary">
                      Reporte Ejecutivo PDF Consolidado
                    </CardTitle>
                    <p className="text-xs text-txt-muted">
                      Consolida en un PDF multipágina los 4 bloques del periodo: Finanzas, Socios/Retención, Asistencia e Inventario/Control de Riesgo.
                    </p>
                  </div>
                </div>
                <Badge variant="info" size="sm">
                  {hook.filter.fecha_desde} a {hook.filter.fecha_hasta}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {pdfFeedback && (
                <Alert
                  floating={false}
                  variant={pdfFeedback.variant}
                  title={pdfFeedback.title}
                  onClose={() => setPdfFeedback(null)}
                >
                  {pdfFeedback.message}
                </Alert>
              )}

              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="w-full sm:w-56">
                  <Select
                    label="Canal de Caja para Reporte"
                    aria-label="Canal de caja para reporte ejecutivo PDF"
                    value={pdfChannel}
                    onChange={(e) => setPdfChannel(e.target.value as BiCashChannel)}
                    options={PDF_CHANNEL_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                    className="h-9 text-xs"
                  />
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  isLoading={generatingPdf}
                  disabled={generatingPdf}
                  leftIcon={<Icon name="download" className="w-4 h-4" />}
                  onClick={() => void handleGenerateExecutivePdf()}
                >
                  Generar Reporte Ejecutivo (PDF)
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {officialReportsSlot}
      </div>
    </div>
  );
};
