// ============================================================================
// COMPONENTE: TAB DE DASHBOARD FINANCIERO (FÍSICA / DIGITAL / MIXTA)
// Selector triple reactivo, KPIs, Desglose Digital, Dominios e Indicadores de Riesgo
// Ubicación: src/features/finance/components/FinancialDashboardTab.tsx
// ============================================================================

import React, { useId, useState } from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Card } from '../../../components/primitives/Card';
import { Icon } from '../../../components/primitives/Icon';
import { Input } from '../../../components/primitives/Input';
import { Label } from '../../../components/primitives/Label';
import { Skeleton } from '../../../components/primitives/Skeleton';
import { EXPENSE_CATEGORY_LABELS, formatCurrency } from '../../../domain/finance';
import {
  FinancialDashboardDto,
  FinancialReportFilter,
  FinancialViewChannel,
} from '../../../types/finance';

export interface FinancialDashboardTabProps {
  dashboard: FinancialDashboardDto | null;
  activeChannelView: FinancialViewChannel;
  onSelectChannelView: (view: FinancialViewChannel) => void;
  reportFilter: FinancialReportFilter;
  onApplyFilter: (filter: FinancialReportFilter) => void;
  isLoading: boolean;
  onNavigateToStruckTray?: () => void;
}

export const FinancialDashboardTab: React.FC<FinancialDashboardTabProps> = ({
  dashboard,
  activeChannelView,
  onSelectChannelView,
  reportFilter,
  onApplyFilter,
  isLoading,
  onNavigateToStruckTray,
}) => {
  const fechaDesdeId = useId();
  const fechaHastaId = useId();
  const [fechaDesde, setFechaDesde] = useState(reportFilter.fecha_desde || '');
  const [fechaHasta, setFechaHasta] = useState(reportFilter.fecha_hasta || '');

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApplyFilter({
      fecha_desde: fechaDesde.trim() || undefined,
      fecha_hasta: fechaHasta.trim() || undefined,
    });
  };

  const handleClearFilter = () => {
    setFechaDesde('');
    setFechaHasta('');
    onApplyFilter({});
  };

  // Selector de resumen activo según vista (FISICA, DIGITAL o MIXTA)
  const currentSummary = dashboard
    ? activeChannelView === 'FISICA'
      ? dashboard.fisica
      : activeChannelView === 'DIGITAL'
      ? dashboard.digital
      : dashboard.mixta
    : null;

  const flujoNetoNum = currentSummary ? parseFloat(currentSummary.flujo_neto) || 0 : 0;
  const isNetoPositivo = flujoNetoNum >= 0;

  // 1. Estado Loading / Skeleton
  if (isLoading && !dashboard) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Cargando panel financiero">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // 2. Estado Empty (sin datos cargados aún)
  if (!dashboard) {
    return (
      <Card className="p-8 text-center items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center text-txt-muted">
          <Icon name="bar-chart" className="w-6 h-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-bold text-txt-primary">Sin información financiera disponible</h3>
        <p className="text-xs text-txt-muted max-w-md">
          No se pudieron cargar los agregados del periodo. Haz clic en actualizar para consultar las métricas contables.
        </p>
        <Button onClick={() => onApplyFilter(reportFilter)} variant="primary" size="sm">
          Recargar Datos
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Selector Triple Reactivo y Barra de Filtro de Fechas */}
      <Card padding="sm" className="lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        {/* Selector Triple Prominente */}
        <div
          role="group"
          aria-label="Selector de canal financiero"
          className="flex flex-wrap items-center gap-1.5 p-1 bg-canvas rounded-lg border border-border"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={activeChannelView === 'FISICA'}
            onClick={() => onSelectChannelView('FISICA')}
            leftIcon={<Icon name="cash" className="w-4 h-4" aria-hidden="true" />}
            className={
              activeChannelView === 'FISICA'
                ? 'bg-status-success-bg text-status-success border border-status-success-border hover:bg-status-success-bg hover:text-status-success font-bold shadow-xs'
                : 'text-txt-secondary hover:text-txt-primary hover:bg-surface/60 font-bold border border-transparent'
            }
          >
            Caja Física
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={activeChannelView === 'DIGITAL'}
            onClick={() => onSelectChannelView('DIGITAL')}
            leftIcon={<Icon name="smartphone" className="w-4 h-4" aria-hidden="true" />}
            className={
              activeChannelView === 'DIGITAL'
                ? 'bg-status-info-bg text-status-info border border-status-info-border hover:bg-status-info-bg hover:text-status-info font-bold shadow-xs'
                : 'text-txt-secondary hover:text-txt-primary hover:bg-surface/60 font-bold border border-transparent'
            }
          >
            Caja Digital
          </Button>

          <Button
            type="button"
            variant={activeChannelView === 'MIXTA' ? 'primary' : 'ghost'}
            size="sm"
            aria-pressed={activeChannelView === 'MIXTA'}
            onClick={() => onSelectChannelView('MIXTA')}
            leftIcon={<Icon name="bank" className="w-4 h-4" aria-hidden="true" />}
            className={
              activeChannelView === 'MIXTA'
                ? 'font-bold shadow-xs'
                : 'text-txt-secondary hover:text-txt-primary hover:bg-surface/60 font-bold border border-transparent'
            }
          >
            Vista Mixta / Consolidada
          </Button>
        </div>

        {/* Formulario de Filtro Rango de Fechas */}
        <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={fechaDesdeId} className="normal-case text-txt-muted font-medium">
              Desde:
            </Label>
            <div className="w-36">
              <Input
                id={fechaDesdeId}
                inputSize="sm"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                aria-label="Fecha Desde"
                className="bg-canvas"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Label htmlFor={fechaHastaId} className="normal-case text-txt-muted font-medium">
              Hasta:
            </Label>
            <div className="w-36">
              <Input
                id={fechaHastaId}
                inputSize="sm"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                aria-label="Fecha Hasta"
                className="bg-canvas"
              />
            </div>
          </div>

          <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
            Filtrar
          </Button>

          {(reportFilter.fecha_desde || reportFilter.fecha_hasta) && (
            <Button type="button" variant="secondary" size="sm" onClick={handleClearFilter}>
              Limpiar
            </Button>
          )}
        </form>
      </Card>

      {/* 2. Tarjetas de KPIs Dinámicas por Canal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: Ingresos por Ventas */}
        <Card padding="sm" className="justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-txt-muted font-medium">
            <span>Ingresos Ventas Cobradas</span>
            <Icon name="finance" className="w-4 h-4 text-status-success" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-status-success">
              {formatCurrency(currentSummary?.ingresos_ventas || '0.00')}
            </div>
            <p className="text-[11px] text-txt-muted mt-1">
              Canal {activeChannelView} en el periodo
            </p>
          </div>
        </Card>

        {/* KPI: Egresos Compras */}
        <Card padding="sm" className="justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-txt-muted font-medium">
            <span>Egresos Compras Mercadería</span>
            <Icon name="package" className="w-4 h-4 text-status-warning" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-status-warning">
              {formatCurrency(currentSummary?.egresos_compras || '0.00')}
            </div>
            <p className="text-[11px] text-txt-muted mt-1">
              Abastecimiento de stock y kardex
            </p>
          </div>
        </Card>

        {/* KPI: Egresos Gastos Operativos */}
        <Card padding="sm" className="justify-between shadow-sm">
          <div className="flex items-center justify-between text-xs text-txt-muted font-medium">
            <span>Egresos Gastos Operativos</span>
            <Icon name="receipt" className="w-4 h-4 text-status-danger" aria-hidden="true" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-status-danger">
              {formatCurrency(currentSummary?.egresos_gastos || '0.00')}
            </div>
            <p className="text-[11px] text-txt-muted mt-1">
              Servicios, alquiler, honorarios, etc.
            </p>
          </div>
        </Card>

        {/* KPI: Flujo Neto / Balance */}
        <Card
          padding="sm"
          className={`justify-between shadow-sm ${
            isNetoPositivo
              ? 'bg-status-success-bg/50 border-status-success-border'
              : 'bg-status-danger-bg/50 border-status-danger-border'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={isNetoPositivo ? 'text-status-success' : 'text-status-danger'}>
              Flujo Neto / Balance
            </span>
            {isNetoPositivo ? (
              <Icon name="activity" className="w-4 h-4 text-status-success" aria-hidden="true" />
            ) : (
              <Icon name="warning" className="w-4 h-4 text-status-danger" aria-hidden="true" />
            )}
          </div>
          <div className="mt-2">
            <div
              className={`text-2xl font-black ${
                isNetoPositivo ? 'text-status-success' : 'text-status-danger'
              }`}
            >
              {formatCurrency(currentSummary?.flujo_neto || '0.00')}
            </div>
            <p className="text-[11px] text-txt-muted mt-1">
              Ingresos ({formatCurrency(currentSummary?.ingresos_ventas || 0)}) - Total Egresos ({formatCurrency(currentSummary?.total_egresos || 0)})
            </p>
          </div>
        </Card>
      </div>

      {/* 3. Desglose Digital (Visible en DIGITAL y MIXTA) */}
      {(activeChannelView === 'DIGITAL' || activeChannelView === 'MIXTA') && (
        <Card padding="sm" className="shadow-sm">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-txt-primary flex items-center gap-2">
              <Icon name="smartphone" className="w-4 h-4 text-brand" aria-hidden="true" />
              <span>Desglose por Billeteras y Medios Digitales</span>
            </h4>
            <Badge variant="info">Cuentas Bancarias & Apps</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Digital Ingresos */}
            <div className="p-3 bg-canvas rounded-lg border border-border">
              <span className="font-semibold text-status-success block mb-2">
                Ingresos por Medio Digital:
              </span>
              <div className="flex flex-col gap-1 text-txt-secondary">
                <div className="flex justify-between">
                  <span>Yape:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_ingresos.yape)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Plin:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_ingresos.plin)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Transferencia:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_ingresos.transferencia)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tarjeta:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_ingresos.tarjeta)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border font-bold text-txt-primary">
                  <span>Total Ingresos Digitales:</span>
                  <span>{formatCurrency(dashboard.desglose_digital_ingresos.total)}</span>
                </div>
              </div>
            </div>

            {/* Digital Compras */}
            <div className="p-3 bg-canvas rounded-lg border border-border">
              <span className="font-semibold text-status-warning block mb-2">
                Compras a Proveedores (Digital):
              </span>
              <div className="flex flex-col gap-1 text-txt-secondary">
                <div className="flex justify-between">
                  <span>Yape:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_compras.yape)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Plin:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_compras.plin)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Transferencia:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_compras.transferencia)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tarjeta:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_compras.tarjeta)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border font-bold text-txt-primary">
                  <span>Total Compras Digitales:</span>
                  <span>{formatCurrency(dashboard.desglose_digital_compras.total)}</span>
                </div>
              </div>
            </div>

            {/* Digital Gastos */}
            <div className="p-3 bg-canvas rounded-lg border border-border">
              <span className="font-semibold text-status-danger block mb-2">
                Gastos Operativos (Digital):
              </span>
              <div className="flex flex-col gap-1 text-txt-secondary">
                <div className="flex justify-between">
                  <span>Yape:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_gastos.yape)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Plin:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_gastos.plin)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Transferencia:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_gastos.transferencia)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tarjeta:</span>
                  <span className="font-medium text-txt-primary">{formatCurrency(dashboard.desglose_digital_gastos.tarjeta)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border font-bold text-txt-primary">
                  <span>Total Gastos Digitales:</span>
                  <span>{formatCurrency(dashboard.desglose_digital_gastos.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 4. Dominios Operativos & Gastos por Categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Desglose de Ingresos por Dominio Operativo */}
        <Card padding="sm" className="shadow-sm">
          <h4 className="text-sm font-bold text-txt-primary flex items-center gap-2">
            <Icon name="dashboard" className="w-4 h-4 text-brand" aria-hidden="true" />
            <span>Ingresos por Dominio Operativo</span>
          </h4>
          <div className="flex flex-col gap-2.5 text-xs">
            <div className="p-2.5 bg-canvas rounded-lg flex items-center justify-between border border-border">
              <div>
                <span className="font-bold text-txt-primary block">Planes y Membresías</span>
                <span className="text-[11px] text-txt-muted">Cuotas de suscripción de socios</span>
              </div>
              <span className="font-bold text-txt-primary">
                {formatCurrency(dashboard.ingresos_por_dominio.planes)}
              </span>
            </div>

            <div className="p-2.5 bg-canvas rounded-lg flex items-center justify-between border border-border">
              <div>
                <span className="font-bold text-txt-primary block">Productos Minimarket</span>
                <span className="text-[11px] text-txt-muted">Bebidas, suplementos y snacks</span>
              </div>
              <span className="font-bold text-txt-primary">
                {formatCurrency(dashboard.ingresos_por_dominio.productos)}
              </span>
            </div>

            <div className="p-2.5 bg-canvas rounded-lg flex items-center justify-between border border-border">
              <div>
                <span className="font-bold text-txt-primary block">Amortizaciones de Crédito</span>
                <span className="text-[11px] text-txt-muted">Cobro de deudas y saldos diferidos</span>
              </div>
              <span className="font-bold text-txt-primary">
                {formatCurrency(dashboard.ingresos_por_dominio.amortizaciones)}
              </span>
            </div>

            <div className="pt-2 border-t border-border flex items-center justify-between font-bold text-sm text-txt-primary">
              <span>Total Dominio Comercial:</span>
              <span>{formatCurrency(dashboard.ingresos_por_dominio.total)}</span>
            </div>
          </div>
        </Card>

        {/* Desglose de Gastos por Categoría */}
        <Card padding="sm" className="shadow-sm">
          <h4 className="text-sm font-bold text-txt-primary flex items-center gap-2">
            <Icon name="bar-chart" className="w-4 h-4 text-brand" aria-hidden="true" />
            <span>Gastos Operativos por Categoría</span>
          </h4>

          {dashboard.gastos_por_categoria.length === 0 ? (
            <div className="p-6 text-center text-txt-muted text-xs bg-canvas rounded-lg border border-dashed border-border">
              No hay gastos operativos registrados en el rango de fechas.
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-xs">
              {dashboard.gastos_por_categoria.map((cat) => (
                <div key={cat.categoria} className="flex flex-col gap-1">
                  <div className="flex justify-between font-medium">
                    <span className="text-txt-primary">
                      {EXPENSE_CATEGORY_LABELS[cat.categoria] || cat.categoria_label}
                    </span>
                    <span className="text-txt-secondary">
                      {formatCurrency(cat.monto)} ({cat.porcentaje}%)
                    </span>
                  </div>
                  <div className="w-full bg-canvas rounded-full h-2 overflow-hidden border border-border/50">
                    <div
                      className="bg-brand h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, parseFloat(cat.porcentaje) || 0))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 5. Panel de Indicadores de Control y Riesgo Operacional */}
      <Card padding="sm" className="shadow-sm">
        <h4 className="text-sm font-bold text-txt-primary flex items-center gap-2">
          <Icon name="shield" className="w-4 h-4 text-brand" aria-hidden="true" />
          <span>Indicadores de Control, Créditos y Riesgo Operacional</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          {/* Cuentas por Cobrar Pendientes */}
          <div className="p-3 bg-canvas rounded-lg border border-border flex flex-col justify-between">
            <div>
              <span className="text-txt-muted font-medium block">Cuentas por Cobrar Pendientes</span>
              <div className="text-xl font-bold text-txt-primary mt-1">
                {formatCurrency(dashboard.indicadores_control.total_creditos_pendientes)}
              </div>
            </div>
            <p className="text-[11px] text-txt-secondary mt-2">
              {dashboard.indicadores_control.cantidad_creditos_pendientes} cliente(s) con deudas activas
            </p>
          </div>

          {/* Ventas Tachadas Pendientes */}
          <div className="p-3 rounded-lg border border-status-warning-border bg-status-warning-bg/35 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-status-warning font-bold block">
                  Tachadas en Espera de Dictamen
                </span>
                {dashboard.indicadores_control.ventas_tachadas_pendientes_count > 0 && (
                  <Badge variant="warning">Requiere Acción</Badge>
                )}
              </div>
              <div className="text-xl font-bold text-status-warning mt-1">
                {dashboard.indicadores_control.ventas_tachadas_pendientes_count} venta(s)
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-txt-secondary">
                Monto: {formatCurrency(dashboard.indicadores_control.monto_tachado_pendiente)}
              </span>
              {onNavigateToStruckTray && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={onNavigateToStruckTray}
                  className="text-[11px] font-bold h-auto p-0 min-h-0"
                >
                  Ir a Bandeja &rarr;
                </Button>
              )}
            </div>
          </div>

          {/* Ventas Anuladas Definitivas */}
          <div className="p-3 bg-canvas rounded-lg border border-border flex flex-col justify-between">
            <div>
              <span className="text-txt-muted font-medium block">Ventas Anuladas Definitivas</span>
              <div className="text-xl font-bold text-txt-primary mt-1">
                {dashboard.indicadores_control.ventas_anuladas_definitivas_count} venta(s)
              </div>
            </div>
            <p className="text-[11px] text-txt-secondary mt-2">
              Auditadas y confirmadas por Administrador
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};
