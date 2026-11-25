// ============================================================================
// SUB-PESTAÑA 5 BI: PRODUCTOS E INVENTARIO (BI-SLICE 4A)
// Filtros por categoría/proveedor/stock muerto, escudo RBAC de costos/márgenes,
// Top Productos con selector de métrica, ventas por categoría, stock muerto y mermas
// Ubicación: src/features/home/tabs/BiInventoryTab.tsx
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
import { useBiInventory } from '../../../hooks/useBiInventory';
import { normalizeAppError } from '../../../services/ipc/client';
import {
  BI_DEAD_STOCK_DAYS_OPTIONS,
  BI_PRODUCT_CATEGORY_OPTIONS,
  BiInventoryAnalyticsDto,
  formatPen,
  toDecimalNumber,
} from '../../../types/bi';
import { BiDatePreset, BiFilterBar } from '../components/BiFilterBar';

export interface BiInventoryTabProps {
  canExportContextual: boolean;
  // Prop opcional para pruebas desacopladas
  initialData?: BiInventoryAnalyticsDto | null;
}

type TopProductMetric = 'ingresos' | 'unidades' | 'margen';

const CATEGORY_COLORS: Record<string, string> = {
  BEBIDAS: 'var(--color-accent-sky)',
  SUPLEMENTOS: 'var(--color-brand-primary)',
  ACCESORIOS: 'var(--color-accent-indigo)',
  SNACKS: 'var(--color-status-warning)',
  OTROS: 'var(--color-text-muted)',
};

export const BiInventoryTab: React.FC<BiInventoryTabProps> = ({
  canExportContextual,
  initialData,
}) => {
  const shouldAutoFetch = initialData === undefined;
  const hook = useBiInventory({ autoFetch: shouldAutoFetch });
  const data = initialData !== undefined ? initialData : hook.data;
  const isLoading = shouldAutoFetch ? hook.loading : false;
  const error = shouldAutoFetch ? hook.error : null;

  const [preset, setPreset] = useState<BiDatePreset>('30d');
  const [topMetric, setTopMetric] = useState<TopProductMetric>('ingresos');
  const [exportFeedback, setExportFeedback] = useState<{
    variant: 'success' | 'danger';
    title: string;
    message: string;
  } | null>(null);

  const canSeeCosts = data?.puede_ver_costos_y_margenes === true;
  const effectiveTopMetric: TopProductMetric =
    topMetric === 'margen' && !canSeeCosts ? 'ingresos' : topMetric;

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
        title: 'Error al exportar Productos e Inventario',
        message: normalized.message,
      });
    }
  };

  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'Todas' },
      ...BI_PRODUCT_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    ],
    []
  );

  const supplierOptions = useMemo(
    () => [
      { value: '', label: 'Todos los proveedores' },
      ...(data?.proveedores_disponibles ?? []).map((s) => ({
        value: String(s.id),
        label: s.label,
      })),
    ],
    [data?.proveedores_disponibles]
  );

  const deadStockDaysOptions = useMemo(
    () =>
      BI_DEAD_STOCK_DAYS_OPTIONS.map((o) => ({
        value: String(o.value),
        label: o.label,
      })),
    []
  );

  const topProductsLabels = useMemo(
    () => (data?.top_productos ?? []).map((p) => p.nombre),
    [data]
  );

  const topProductsSeries = useMemo(() => {
    const rows = data?.top_productos ?? [];
    if (effectiveTopMetric === 'unidades') {
      return [
        {
          id: 'unidades',
          label: 'Unidades Vendidas',
          color: 'var(--color-accent-sky)',
          data: rows.map((p) => p.unidades_vendidas),
        },
      ];
    }
    if (effectiveTopMetric === 'margen') {
      return [
        {
          id: 'margen',
          label: 'Margen Estimado (S/)',
          color: 'var(--color-status-success)',
          data: rows.map((p) => toDecimalNumber(p.margen_estimado)),
        },
      ];
    }
    return [
      {
        id: 'ingresos',
        label: 'Ingresos (S/)',
        color: 'var(--color-brand-primary)',
        data: rows.map((p) => toDecimalNumber(p.ingresos)),
      },
    ];
  }, [data, effectiveTopMetric]);

  const categoryDonutItems = useMemo(
    () =>
      (data?.ventas_por_categoria ?? []).map((item) => ({
        id: item.clave,
        label: item.etiqueta,
        value: toDecimalNumber(item.monto),
        percentage: item.porcentaje,
        count: item.cantidad,
        color: CATEGORY_COLORS[item.clave] || 'var(--color-brand-primary)',
      })),
    [data]
  );

  const isInitialLoading = isLoading && !data;
  const deadStockColSpan = canSeeCosts ? 7 : 6;
  const shrinkageColSpan = canSeeCosts ? 4 : 3;

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
        <div className="min-w-[140px]">
          <Select
            label="Categoría"
            aria-label="Filtrar por categoría de producto"
            value={hook.filter.categoria ?? ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                categoria: e.target.value || null,
              }))
            }
            options={categoryOptions}
            className="h-9 text-xs"
          />
        </div>

        <div className="min-w-[175px]">
          <Select
            label="Proveedor"
            aria-label="Filtrar por proveedor"
            value={hook.filter.proveedor_id ? String(hook.filter.proveedor_id) : ''}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                proveedor_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
            options={supplierOptions}
            className="h-9 text-xs"
          />
        </div>

        <div className="min-w-[145px]">
          <Select
            label="Stock Muerto (días)"
            aria-label="Umbral de stock muerto en días"
            value={String(hook.filter.dias_stock_muerto ?? 30)}
            onChange={(e) =>
              hook.setFilter((prev) => ({
                ...prev,
                dias_stock_muerto: Number(e.target.value) || 30,
              }))
            }
            options={deadStockDaysOptions}
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
          title="No se pudo cargar Productos e Inventario"
          actionText="Reintentar"
          onAction={() => void hook.reload()}
        >
          {error.message}
        </Alert>
      )}

      {data && !data.puede_ver_costos_y_margenes && (
        <Alert
          floating={false}
          variant="info"
          title="Costos y márgenes protegidos"
        >
          Los costos de compra, márgenes brutos y valorización de inventario están protegidos
          por permisos financieros.
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
              Stock muerto: {data.dias_stock_muerto}d+
            </Badge>
            <Badge
              variant={data.productos_stock_critico_count > 0 ? 'warning' : 'success'}
              size="sm"
            >
              Stock crítico: {data.productos_stock_critico_count}
            </Badge>
          </div>
        </div>
      )}

      {/* Fila 1: 4 MetricKpiCard */}
      <section
        aria-label="Indicadores de productos e inventario"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <MetricKpiCard
          label="Ingresos en Productos"
          value={data ? formatPen(data.ingresos_productos.actual) : 'S/ 0.00'}
          icon="cash"
          accent="success"
          deltaPct={data ? data.ingresos_productos.delta_pct : undefined}
          subtitle={
            data
              ? `Ant: ${formatPen(data.ingresos_productos.anterior)}`
              : undefined
          }
          loading={isInitialLoading}
        />

        <MetricKpiCard
          label="Unidades Vendidas"
          value={
            data
              ? String(Math.round(toDecimalNumber(data.unidades_vendidas.actual)))
              : '0'
          }
          icon="package"
          accent="primary"
          deltaPct={data ? data.unidades_vendidas.delta_pct : undefined}
          subtitle={
            data
              ? `Ant: ${Math.round(toDecimalNumber(data.unidades_vendidas.anterior))} uds`
              : undefined
          }
          loading={isInitialLoading}
        />

        {canSeeCosts ? (
          <MetricKpiCard
            label="Margen Bruto Estimado"
            value={
              data ? formatPen(data.margen_bruto_estimado?.actual ?? 0) : 'S/ 0.00'
            }
            icon="trending-up"
            accent="primary"
            deltaPct={data?.margen_bruto_estimado?.delta_pct}
            subtitle={
              data
                ? `Margen: ${(data.margen_bruto_pct ?? 0).toFixed(1)}% • s/ costo ref.`
                : undefined
            }
            loading={isInitialLoading}
          />
        ) : (
          <MetricKpiCard
            label="Productos Activos"
            value={data ? String(data.productos_activos_count) : '0'}
            icon="catalog"
            accent="neutral"
            subtitle={
              data
                ? `En stock crítico: ${data.productos_stock_critico_count}`
                : undefined
            }
            loading={isInitialLoading}
          />
        )}

        {canSeeCosts ? (
          <MetricKpiCard
            label="Valorización de Inventario"
            value={
              data ? formatPen(data.valorizacion_inventario ?? 0) : 'S/ 0.00'
            }
            icon="database"
            accent="neutral"
            subtitle={
              data
                ? `Crítico: ${data.productos_stock_critico_count} • Mermas: ${data.mermas_unidades} uds (${formatPen(
                    data.mermas_costo_estimado ?? 0
                  )})`
                : undefined
            }
            loading={isInitialLoading}
          />
        ) : (
          <MetricKpiCard
            label="Mermas y Consumo"
            value={data ? `${data.mermas_unidades} uds` : '0 uds'}
            icon="warning"
            accent="warning"
            subtitle={
              data
                ? `Stock crítico: ${data.productos_stock_critico_count} productos`
                : undefined
            }
            loading={isInitialLoading}
          />
        )}
      </section>

      {/* Fila 2: Top Productos + Ventas por Categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="default">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold text-txt-primary">
                  Top Productos
                </CardTitle>
                <p className="text-xs text-txt-muted">
                  Ranking de rotación en el periodo seleccionado
                </p>
              </div>
              <div
                role="group"
                aria-label="Métrica de ranking de productos"
                className="inline-flex items-center gap-1 rounded-lg bg-canvas-subtle p-1 border border-border"
              >
                <Button
                  size="sm"
                  variant={effectiveTopMetric === 'ingresos' ? 'primary' : 'ghost'}
                  onClick={() => setTopMetric('ingresos')}
                >
                  Ingresos (S/)
                </Button>
                <Button
                  size="sm"
                  variant={effectiveTopMetric === 'unidades' ? 'primary' : 'ghost'}
                  onClick={() => setTopMetric('unidades')}
                >
                  Unidades
                </Button>
                {canSeeCosts && (
                  <Button
                    size="sm"
                    variant={effectiveTopMetric === 'margen' ? 'primary' : 'ghost'}
                    onClick={() => setTopMetric('margen')}
                  >
                    Margen (S/)
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <BarChart
              labels={topProductsLabels}
              series={topProductsSeries}
              orientation="horizontal"
              height={280}
              formatValue={(v) =>
                effectiveTopMetric === 'unidades' ? `${Math.round(v)} uds` : formatPen(v)
              }
              emptyTitle="Sin ventas de productos"
              emptyMessage="No se registraron salidas por venta con los filtros aplicados."
              loading={isInitialLoading}
              className="border-0 shadow-none p-0 bg-transparent"
            />
          </CardContent>
        </Card>

        <DonutChart
          title="Ventas por Categoría"
          subtitle="Participación de ingresos por familia de producto"
          items={categoryDonutItems}
          centerLabel="Productos"
          centerValue={
            data ? formatPen(data.ingresos_productos.actual) : 'S/ 0.00'
          }
          formatValue={(v) => formatPen(v)}
          emptyTitle="Sin ventas por categoría"
          emptyMessage="No existen ventas de inventario en el rango de fechas."
          loading={isInitialLoading}
        />
      </div>

      {/* Fila 3: Stock Sin Rotación ("Stock Muerto") */}
      <Card variant="default">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-txt-primary">
                Stock Sin Rotación (&ldquo;Stock Muerto&rdquo;)
              </CardTitle>
              <p className="text-xs text-txt-muted">
                Productos con existencias sin ventas en los últimos{' '}
                {data?.dias_stock_muerto ?? hook.filter.dias_stock_muerto ?? 30} días
              </p>
            </div>
            {data && (
              <Badge
                variant={data.stock_muerto.length > 0 ? 'warning' : 'success'}
                size="sm"
              >
                {data.stock_muerto.length} producto
                {data.stock_muerto.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Stock Actual</TableHead>
                <TableHead className="text-right">Precio Venta</TableHead>
                {canSeeCosts && (
                  <TableHead className="text-right">Capital Inmovilizado</TableHead>
                )}
                <TableHead>Última Venta / Días</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                <TableLoadingSkeleton colSpan={deadStockColSpan} rows={4} />
              ) : !data || data.stock_muerto.length === 0 ? (
                <TableEmptyState
                  colSpan={deadStockColSpan}
                  title="Sin stock inmovilizado"
                  description="Todos los productos con inventario positivo registraron rotación reciente."
                  icon={<Icon name="check" className="w-8 h-8 text-status-success" />}
                />
              ) : (
                data.stock_muerto.map((row) => (
                  <TableRow key={row.producto_id}>
                    <TableCell className="font-mono text-xs text-txt-muted">
                      {row.codigo_sku}
                    </TableCell>
                    <TableCell className="font-medium text-txt-primary">
                      {row.nombre}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" size="sm">
                        {row.categoria}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.stock_actual}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-txt-secondary">
                      {formatPen(row.precio_venta)}
                    </TableCell>
                    {canSeeCosts && (
                      <TableCell className="text-right font-mono font-semibold text-txt-primary tabular-nums">
                        {formatPen(row.capital_inmovilizado ?? 0)}
                      </TableCell>
                    )}
                    <TableCell className="text-xs font-mono text-txt-muted">
                      {row.ultima_venta
                        ? `${row.ultima_venta} (${row.dias_sin_venta ?? 0}d)`
                        : 'Sin ventas históricas'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Fila 4: Resumen de Mermas y Consumo Interno */}
      <Card variant="default">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-txt-primary">
                Resumen de Mermas y Consumo Interno
              </CardTitle>
              <p className="text-xs text-txt-muted">
                Salidas no facturadas registradas en Kardex durante el periodo
              </p>
            </div>
            {data && (
              <Badge variant="default" size="sm">
                {data.mermas_unidades} uds acumuladas
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Eventos</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                {canSeeCosts && (
                  <TableHead className="text-right">Costo Estimado</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                <TableLoadingSkeleton colSpan={shrinkageColSpan} rows={3} />
              ) : !data || data.resumen_mermas.length === 0 ? (
                <TableEmptyState
                  colSpan={shrinkageColSpan}
                  title="Sin mermas ni consumos registrados"
                  description="No se registraron movimientos de merma o consumo interno en este rango."
                  icon={<Icon name="package" className="w-8 h-8 text-txt-muted" />}
                />
              ) : (
                data.resumen_mermas.map((row) => (
                  <TableRow key={row.tipo_movimiento}>
                    <TableCell className="font-medium text-txt-primary">
                      {row.etiqueta}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.eventos_count}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {row.unidades}
                    </TableCell>
                    {canSeeCosts && (
                      <TableCell className="text-right font-mono font-semibold text-status-danger tabular-nums">
                        {formatPen(row.costo_estimado ?? 0)}
                      </TableCell>
                    )}
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
