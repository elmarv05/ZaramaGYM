// ============================================================================
// COMPONENTE: CENTRO DE COMANDO ANALÍTICO EN VIVO (HOME DASHBOARD)
// Fase 2 (Tarea 2.2): KPIs en vivo, Afluencia por franja, Alertas <= 3 días,
// Centro rápido de exportaciones (CSV/XLSX/PDF) y Atajos de operador
// Ubicación: src/features/home/HomeDashboardView.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Alert } from '../../components/primitives/Alert';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon, IconName } from '../../components/primitives/Icon';
import { Skeleton } from '../../components/primitives/Skeleton';
import { normalizeAppError } from '../../services/ipc/client';
import { useDashboard } from '../../hooks/useDashboard';
import { AppError, AuthSession } from '../../types/auth';
import {
  ExportFileResult,
  ExportFormat,
  HomeDashboardMetricsDto,
  HourlyAttendancePoint,
} from '../../types/dashboard';

export type HomeNavigationTarget =
  | 'home'
  | 'directory'
  | 'users'
  | 'audit'
  | 'reception'
  | 'catalog'
  | 'pos'
  | 'attendance'
  | 'lan'
  | 'finance'
  | 'printing_backup';

export type HomeExportKind = 'clients' | 'debtors' | 'sales';

export interface HomeDashboardViewProps {
  session: AuthSession;
  clientsCount?: number;
  onNavigate: (tab: HomeNavigationTarget) => void;
  onOpenSearch?: () => void;

  // Props opcionales para testing desacoplado e inyección externa
  metrics?: HomeDashboardMetricsDto | null;
  isLoading?: boolean;
  error?: AppError | null;
  onRefreshMetrics?: () => void;
  onExportReport?: (
    kind: HomeExportKind,
    format: ExportFormat
  ) => Promise<ExportFileResult | void> | void;
}

interface ExportFeedbackState {
  variant: 'success' | 'danger';
  title: string;
  message: string;
}

export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({
  session,
  clientsCount = 0,
  onNavigate,
  onOpenSearch,
  metrics: propMetrics,
  isLoading: propIsLoading,
  error: propError,
  onRefreshMetrics,
  onExportReport,
}) => {
  const shouldAutoFetch = propMetrics === undefined;
  const hook = useDashboard({ autoFetch: shouldAutoFetch });

  const rawMetrics = propMetrics !== undefined ? propMetrics : hook.metrics;
  const metrics: HomeDashboardMetricsDto | null =
    rawMetrics && typeof rawMetrics === 'object' && !Array.isArray(rawMetrics)
      ? rawMetrics
      : null;

  const isLoading =
    propIsLoading !== undefined ? propIsLoading : shouldAutoFetch ? hook.isLoading : false;
  const error = propError !== undefined ? propError : shouldAutoFetch ? hook.error : null;

  const [hoveredSlot, setHoveredSlot] = useState<HourlyAttendancePoint | null>(null);
  const [localExportingKey, setLocalExportingKey] = useState<string | null>(null);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedbackState | null>(null);

  const isRecepcionista = session.rol === 'RECEPCIONISTA';
  const directoryTarget: HomeNavigationTarget = isRecepcionista ? 'reception' : 'directory';

  const handleRefresh = () => {
    if (onRefreshMetrics) {
      onRefreshMetrics();
      return;
    }
    void hook.refreshMetrics();
  };

  const handleExport = async (kind: HomeExportKind, format: ExportFormat) => {
    const key = `${kind}-${format}`;
    setLocalExportingKey(key);
    setExportFeedback(null);

    try {
      let result: ExportFileResult | void;
      if (onExportReport) {
        result = await onExportReport(kind, format);
      } else if (kind === 'clients') {
        result = await hook.exportClients(format);
      } else if (kind === 'debtors') {
        result = await hook.exportDebtors(format);
      } else {
        result = await hook.exportSalesCash({ format });
      }

      const fileLabel = result?.filename
        ? `${result.filename} (${result.row_count} registro${result.row_count === 1 ? '' : 's'})`
        : `Reporte ${format}`;

      setExportFeedback({
        variant: 'success',
        title: 'Exportación completada',
        message: `Archivo descargado correctamente: ${fileLabel}.`,
      });
    } catch (err) {
      const normalized = normalizeAppError(err);
      setExportFeedback({
        variant: 'danger',
        title: 'No se pudo generar la exportación',
        message: normalized.message,
      });
    } finally {
      setLocalExportingKey(null);
    }
  };

  const attendanceSlots = useMemo(
    () => (Array.isArray(metrics?.afluencia_por_franja) ? metrics.afluencia_por_franja : []),
    [metrics]
  );

  const expiringMemberships = useMemo(
    () => (Array.isArray(metrics?.membresias_por_vencer) ? metrics.membresias_por_vencer : []),
    [metrics]
  );

  const peakSlot = useMemo(() => {
    if (attendanceSlots.length === 0) return null;
    return attendanceSlots.reduce<HourlyAttendancePoint | null>((best, curr) => {
      if (!best || curr.total > best.total) return curr;
      return best;
    }, null);
  }, [attendanceSlots]);

  const totalAttendanceInChart = useMemo(
    () => attendanceSlots.reduce((sum, p) => sum + (p.total || 0), 0),
    [attendanceSlots]
  );

  const maxSlotTotal = Math.max(peakSlot?.total || 0, 1);

  const canViewMonthly = Boolean(metrics?.can_view_monthly_revenue && !isRecepcionista);

  const shortcuts: {
    label: string;
    keys: string;
    icon: IconName;
    onClick: () => void;
  }[] = [
    {
      label: 'Búsqueda Rápida de Funciones',
      keys: 'Ctrl + K',
      icon: 'search',
      onClick: () => onOpenSearch?.(),
    },
    {
      label: 'Directorio de Clientes',
      keys: 'F2',
      icon: 'directory',
      onClick: () => onNavigate(directoryTarget),
    },
    {
      label: 'Terminal de Asistencias QR',
      keys: 'F4',
      icon: 'qr',
      onClick: () => onNavigate('attendance'),
    },
    {
      label: 'Punto de Venta y Caja',
      keys: 'F9',
      icon: 'pos',
      onClick: () => onNavigate('pos'),
    },
  ];

  const isAnyExporting = hook.isExporting || localExportingKey !== null;

  const activeClientsCount = metrics ? metrics.clientes_activos : clientsCount;

  const exportRows: {
    kind: HomeExportKind;
    title: string;
    subtitle: string;
    icon: IconName;
  }[] = [
    {
      kind: 'clients',
      title: 'Padrón de Clientes',
      subtitle: 'Socios, documentos, contacto y estado de membresía',
      icon: 'users',
    },
    {
      kind: 'debtors',
      title: 'Cartera de Deudores',
      subtitle: 'Créditos pendientes, amortizaciones y saldos por cobrar',
      icon: 'credit-card',
    },
    {
      kind: 'sales',
      title: 'Ventas y Movimientos de Caja',
      subtitle: 'Resumen contable físico vs digital del periodo actual',
      icon: 'receipt',
    },
  ];

  return (
    <div className="w-full flex flex-col gap-6 zg-view-enter">
      {/* Cabecera de Bienvenida y Estado Operativo */}
      <section
        aria-label="Centro de operaciones ZaramaGYM"
        className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" size="sm">
                TERMINAL 01 • ACTIVA
              </Badge>
              <span className="text-xs text-txt-muted font-mono">
                Sesión @{session.username}
              </span>
              {metrics?.generated_at && (
                <span className="text-[11px] text-txt-muted font-mono">
                  Actualizado: {metrics.generated_at}
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-txt-primary">
              Bienvenido, {session.nombre_completo}
            </h2>
            <p className="text-xs text-txt-secondary">
              Centro de Comando Analítico ZaramaGYM — métricas en vivo, alertas de renovación y
              exportación contable.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-status-success-bg text-status-success text-xs font-semibold border border-status-success/20">
              <span className="w-2 h-2 rounded-full bg-status-success" aria-hidden="true" />
              DB SYNC 100% Local
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-status-info-bg text-status-info text-xs font-semibold border border-status-info/20 tabular-nums">
              <span className="w-2 h-2 rounded-full bg-status-info" aria-hidden="true" />
              SOCIOS ACTIVOS: {activeClientsCount}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              isLoading={isLoading}
              leftIcon={<Icon name="refresh" className="w-3.5 h-3.5" />}
            >
              Actualizar
            </Button>
          </div>
        </div>

        {/* Botones de Navegación Directa */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-border/70">
          <Button
            type="button"
            variant="primary"
            size="md"
            leftIcon={<Icon name="qr" className="w-4 h-4" />}
            onClick={() => onNavigate('attendance')}
          >
            Ir a Asistencias QR
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            leftIcon={<Icon name="pos" className="w-4 h-4" />}
            onClick={() => onNavigate('pos')}
          >
            Abrir Caja / POS
          </Button>
          <Button
            type="button"
            variant="outline"
            size="md"
            leftIcon={<Icon name="directory" className="w-4 h-4" />}
            onClick={() => onNavigate(directoryTarget)}
          >
            Explorar Directorio
          </Button>
        </div>
      </section>

      {/* Estado de Error (con reintento) */}
      {error && (
        <Alert
          variant="danger"
          title="No se pudieron cargar las métricas en vivo"
          actionText="Reintentar"
          onAction={handleRefresh}
        >
          {error.message}
        </Alert>
      )}

      {/* Estado Loading / Skeleton (cero saltos de layout CLS) */}
      {isLoading && !metrics ? (
        <div
          role="status"
          aria-label="Cargando métricas del tablero"
          className="flex flex-col gap-6"
        >
          <span className="sr-only">Cargando métricas del Home Dashboard...</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="w-8 h-8 rounded-lg" />
                </div>
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-36" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4">
              <Skeleton className="h-5 w-56" />
              <div className="h-44 flex items-end gap-2 pt-4">
                {Array.from({ length: 12 }).map((_, idx) => (
                  <Skeleton key={idx} className="flex-1 h-24 rounded-t-md" />
                ))}
              </div>
            </div>
            <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          </div>
        </div>
      ) : !metrics ? (
        /* Estado Vacío accionable cuando no hay payload aún */
        <section
          aria-label="Tablero analítico sin datos"
          className="bg-surface border border-dashed border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3"
        >
          <div className="w-12 h-12 rounded-xl bg-canvas-subtle text-txt-muted flex items-center justify-center border border-border">
            <Icon name="bar-chart" className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-txt-primary">
            Métricas en vivo pendientes de sincronización
          </h3>
          <p className="text-xs text-txt-secondary max-w-md">
            Presiona el botón para consultar las asistencias del día, ingresos por canal y
            membresías próximas a vencer en la base local.
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleRefresh}
            leftIcon={<Icon name="refresh" className="w-4 h-4" />}
          >
            Cargar Métricas en Vivo
          </Button>
        </section>
      ) : (
        /* Estado Success / Data State */
        <>
          {/* Fila de 4 Tarjetas KPI Bento en Vivo */}
          <section
            aria-label="Indicadores clave en vivo"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
          >
            {/* KPI 1: Socios & Membresías Activas */}
            <article className="bg-surface border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                  Socios &amp; Membresías Activas
                </span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-status-success bg-status-success-bg">
                  <Icon name="users" className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-txt-primary tabular-nums">
                  {metrics.clientes_activos}
                </span>
                <span className="text-xs font-semibold text-txt-secondary tabular-nums">
                  / {metrics.membresias_activas} vigentes
                </span>
              </div>
              <p className="text-[11px] text-txt-muted">
                {metrics.membresias_activas} membresía(s) activa(s) al día
              </p>
            </article>

            {/* KPI 2: Asistencias Hoy */}
            <article className="bg-surface border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                  Asistencias Hoy
                </span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-status-info bg-status-info-bg">
                  <Icon name="activity" className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-txt-primary tabular-nums">
                {metrics.asistencias_hoy_total}
              </div>
              <p className="text-[11px] text-txt-muted">
                {peakSlot && peakSlot.total > 0
                  ? `Hora pico: ${peakSlot.franja} (${peakSlot.total} ingresos)`
                  : 'Sin registros de acceso en lo que va del día'}
              </p>
            </article>

            {/* KPI 3: Ingresos (RBAC: Mensual Admin/Supervisor vs Diario Recepcionista) */}
            <article className="bg-surface border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                  {canViewMonthly
                    ? 'Ingresos del Mes (Físico vs Digital)'
                    : 'Recaudación del Día (Físico vs Digital)'}
                </span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-brand bg-status-success-bg">
                  <Icon name="cash" className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-txt-primary tabular-nums">
                S/ {canViewMonthly ? metrics.ingresos_mes_total : metrics.ingresos_hoy_total}
              </div>
              <div className="flex flex-col gap-0.5 text-[11px] text-txt-muted tabular-nums">
                <span>
                  Físico: S/{' '}
                  {canViewMonthly ? metrics.ingresos_mes_fisico : metrics.ingresos_hoy_fisico} ·
                  Digital: S/{' '}
                  {canViewMonthly ? metrics.ingresos_mes_digital : metrics.ingresos_hoy_digital}
                </span>
                {canViewMonthly && (
                  <span className="text-txt-secondary font-medium">
                    Hoy: S/ {metrics.ingresos_hoy_total}
                  </span>
                )}
              </div>
            </article>

            {/* KPI 4: Cartera Pendiente */}
            <article className="bg-surface border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
                  Cartera Pendiente
                </span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-status-warning bg-status-warning-bg">
                  <Icon name="credit-card" className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-txt-primary tabular-nums">
                S/ {metrics.saldo_creditos_pendiente}
              </div>
              <p className="text-[11px] text-txt-muted tabular-nums">
                {metrics.deudores_activos_count} socio(s) con deuda por cobrar
              </p>
            </article>
          </section>

          {/* Fila Analítica: Gráfica de Afluencia por Franja + Alertas de Membresías <= 3 días */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfica Visual de Afluencia por Franja Horaria (05:00 - 22:00) */}
            <section
              aria-labelledby="attendance-chart-heading"
              className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Icon name="bar-chart" className="w-4 h-4 text-brand" />
                  <div>
                    <h3
                      id="attendance-chart-heading"
                      className="text-sm font-bold text-txt-primary"
                    >
                      Afluencia de Asistencias por Franja Horaria
                    </h3>
                    <p className="text-[11px] text-txt-muted">
                      Distribución operativa del día (05:00 a 22:00)
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {hoveredSlot ? (
                    <Badge variant="info" size="sm">
                      {hoveredSlot.franja}: {hoveredSlot.total} asistencia(s)
                    </Badge>
                  ) : peakSlot && peakSlot.total > 0 ? (
                    <Badge variant="success" size="sm">
                      Pico {peakSlot.franja} ({peakSlot.total})
                    </Badge>
                  ) : (
                    <Badge variant="default" size="sm">
                      0 asistencias hoy
                    </Badge>
                  )}
                </div>
              </div>

              {attendanceSlots.length === 0 || totalAttendanceInChart === 0 ? (
                <div className="py-10 px-4 rounded-xl border border-dashed border-border bg-canvas-subtle/40 flex flex-col items-center justify-center text-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-txt-muted">
                    <Icon name="clock" className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-txt-primary">
                    Sin asistencias registradas hoy por franja horaria
                  </p>
                  <p className="text-[11px] text-txt-muted max-w-sm">
                    A medida que los socios escaneen su QR en recepción, verás aquí la curva de
                    concurrencia por hora.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate('attendance')}
                    leftIcon={<Icon name="qr" className="w-3.5 h-3.5" />}
                  >
                    Abrir Monitor de Asistencias
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div
                    role="list"
                    aria-label="Barras de afluencia por hora"
                    className="h-48 flex items-end gap-1.5 sm:gap-2 pt-6 pb-1 px-1 overflow-x-auto"
                  >
                    {attendanceSlots.map((point) => {
                      const heightPct =
                        point.total > 0
                          ? Math.max(12, Math.round((point.total / maxSlotTotal) * 100))
                          : 4;
                      const isPeak = peakSlot && point.hora === peakSlot.hora && point.total > 0;
                      const hourLabel = point.franja.slice(0, 2);

                      return (
                        <button
                          key={`${point.hora}-${point.franja}`}
                          type="button"
                          role="listitem"
                          onMouseEnter={() => setHoveredSlot(point)}
                          onMouseLeave={() => setHoveredSlot(null)}
                          onFocus={() => setHoveredSlot(point)}
                          onBlur={() => setHoveredSlot(null)}
                          title={`${point.franja}: ${point.total} asistencia(s)`}
                          aria-label={`Franja ${point.franja}: ${point.total} asistencias`}
                          className="group flex-1 min-w-[20px] h-full flex flex-col items-center justify-end gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                        >
                          <span
                            className={`text-[10px] font-bold tabular-nums transition-colors ${
                              point.total > 0
                                ? isPeak
                                  ? 'text-brand'
                                  : 'text-txt-secondary group-hover:text-txt-primary'
                                : 'text-txt-muted/50'
                            }`}
                          >
                            {point.total}
                          </span>

                          <div className="w-full flex-1 flex items-end">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t-md transition-all duration-200 ${
                                point.total === 0
                                  ? 'bg-border/60'
                                  : isPeak
                                  ? 'bg-brand shadow-xs group-hover:bg-brand-hover'
                                  : 'bg-accent-sky/75 group-hover:bg-accent-sky'
                              }`}
                            />
                          </div>

                          <span className="text-[10px] font-mono text-txt-muted group-hover:text-txt-primary">
                            {hourLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Widget de Alerta: Membresías Próximas a Vencer (<= 3 días) */}
            <section
              aria-labelledby="expiring-memberships-heading"
              className="bg-surface border border-border rounded-2xl p-5 shadow-xs flex flex-col justify-between gap-4"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Icon name="warning" className="w-4 h-4 text-status-warning" />
                  <h3
                    id="expiring-memberships-heading"
                    className="text-sm font-bold text-txt-primary"
                  >
                    Membresías por Vencer
                  </h3>
                </div>
                <Badge
                  variant={expiringMemberships.length > 0 ? 'warning' : 'success'}
                  size="sm"
                >
                  {expiringMemberships.length} {expiringMemberships.length === 1 ? 'alerta' : 'alertas'}
                </Badge>
              </div>

              {expiringMemberships.length === 0 ? (
                <div className="py-8 px-4 rounded-xl border border-dashed border-border bg-canvas-subtle/40 flex flex-col items-center justify-center text-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-status-success-bg text-status-success flex items-center justify-center">
                    <Icon name="check" className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-txt-primary">
                    Sin vencimientos en los próximos 3 días
                  </p>
                  <p className="text-[11px] text-txt-muted">
                    Todos los socios activos mantienen su plan vigente.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {expiringMemberships.map((alert) => {
                    const isUrgentToday = alert.dias_restantes <= 0;
                    const badgeLabel =
                      alert.dias_restantes < 0
                        ? 'Vencida'
                        : alert.dias_restantes === 0
                        ? 'Vence hoy'
                        : alert.dias_restantes === 1
                        ? 'En 1 día'
                        : `En ${alert.dias_restantes} días`;

                    return (
                      <li
                        key={`${alert.cliente_id}-${alert.fecha_vencimiento}`}
                        className="p-3 rounded-xl border border-border bg-canvas-subtle/60 flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-txt-primary truncate">
                              {alert.nombre_completo}
                            </p>
                            <p className="text-[11px] text-txt-secondary truncate">
                              {alert.nombre_plan}
                            </p>
                          </div>
                          <Badge variant={isUrgentToday ? 'danger' : 'warning'} size="sm">
                            {badgeLabel}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11px] text-txt-muted">
                          <span className="font-mono">Vence: {alert.fecha_vencimiento}</span>
                          {alert.telefono && <span className="font-mono">{alert.telefono}</span>}
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onNavigate('pos')}
                            className="flex-1 text-[11px]"
                          >
                            Renovar en POS
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onNavigate(directoryTarget)}
                            className="text-[11px]"
                          >
                            Directorio
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {/* Centro Rápido de Exportaciones (CSV / Excel .xlsx / PDF) */}
      <section
        aria-labelledby="quick-exports-heading"
        className="bg-surface border border-border rounded-2xl p-5 shadow-xs flex flex-col gap-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Icon name="download" className="w-4 h-4 text-brand" />
            <div>
              <h3 id="quick-exports-heading" className="text-sm font-bold text-txt-primary">
                Centro Rápido de Exportaciones Contables
              </h3>
              <p className="text-[11px] text-txt-muted">
                Descarga inmediata en formato universal CSV, Excel (.xlsx) o PDF ejecutivo
              </p>
            </div>
          </div>
        </div>

        {exportFeedback && (
          <Alert
            variant={exportFeedback.variant}
            title={exportFeedback.title}
            onClose={() => setExportFeedback(null)}
          >
            {exportFeedback.message}
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {exportRows.map((row) => (
            <div
              key={row.kind}
              className="p-4 rounded-xl border border-border bg-canvas-subtle/50 flex flex-col justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-brand shrink-0">
                  <Icon name={row.icon} className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-txt-primary">{row.title}</h4>
                  <p className="text-[11px] text-txt-muted leading-snug">{row.subtitle}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(['CSV', 'XLSX', 'PDF'] as ExportFormat[]).map((fmt) => {
                  const key = `${row.kind}-${fmt}`;
                  const label = fmt === 'XLSX' ? 'Excel (.xlsx)' : fmt;
                  return (
                    <Button
                      key={fmt}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isAnyExporting}
                      isLoading={localExportingKey === key}
                      aria-label={`Exportar ${row.title} en ${label}`}
                      onClick={() => void handleExport(row.kind, fmt)}
                      className="text-[11px] flex-1"
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tarjeta de Atajos Rápidos de Operador */}
      <section
        aria-labelledby="operator-fast-keys-heading"
        className="bg-surface border border-border rounded-2xl p-5 shadow-xs flex flex-col gap-4"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Icon name="terminal" className="w-4 h-4 text-brand" />
            <h3 id="operator-fast-keys-heading" className="text-sm font-bold text-txt-primary">
              Atajos Rápidos de Operador (Operator Fast Keys)
            </h3>
          </div>
          <span className="text-[11px] text-txt-muted">Navegación instantánea por teclado</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {shortcuts.map((sc) => (
            <button
              key={sc.keys}
              type="button"
              onClick={sc.onClick}
              className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-canvas-subtle/60 hover:bg-surface-hover hover:border-brand/50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon name={sc.icon} className="w-4 h-4 text-brand shrink-0" />
                <span className="text-xs font-semibold text-txt-primary truncate">{sc.label}</span>
              </div>
              <kbd className="px-2 py-0.5 rounded bg-surface border border-border font-mono text-[11px] font-bold text-txt-secondary shrink-0">
                {sc.keys}
              </kbd>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
