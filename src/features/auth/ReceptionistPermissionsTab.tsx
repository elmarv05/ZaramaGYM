// ============================================================================
// COMPONENTE: CONFIGURACIÓN DE PERMISOS RBAC PARA RECEPCIÓN (BI-SLICE 1)
// Control granular Secure-by-Default con trazabilidad automática en bitácora
// Ubicación: src/features/auth/ReceptionistPermissionsTab.tsx
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  IconName,
  Skeleton,
  Switch,
} from '../../components/primitives';
import {
  arePermissionsEqual,
  countEnabledPermissions,
  useReceptionistPermissions,
} from '../../hooks/useReceptionistPermissions';
import {
  DEFAULT_RECEPTIONIST_PERMISSIONS,
  ReceptionistPermissionsDto,
} from '../../types/dashboard';

interface PermissionItemConfig {
  key: keyof ReceptionistPermissionsDto;
  label: string;
  description: string;
  icon: IconName;
}

interface PermissionGroupConfig {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  items: PermissionItemConfig[];
}

const PERMISSION_GROUPS: PermissionGroupConfig[] = [
  {
    id: 'home-bi',
    title: 'Sub-pestañas y Métricas del Módulo Inicio (BI)',
    subtitle:
      'Controla qué bloques analíticos y métricas mensuales puede visualizar el personal de recepción al iniciar sesión.',
    icon: 'dashboard',
    items: [
      {
        key: 'ver_ingresos_mes_operativo',
        label: 'Ver Ingresos Operativos del Mes',
        description:
          'Muestra los totales mensuales consolidados (Físico y Digital) en lugar de limitar la tarjeta al turno del día.',
        icon: 'cash',
      },
      {
        key: 'ver_tab_finanzas',
        label: 'Ver Pestaña Finanzas en Inicio (BI)',
        description:
          'Habilita la sub-pestaña analítica de Finanzas dentro del tablero ejecutivo de Inicio.',
        icon: 'finance',
      },
      {
        key: 'ver_tab_socios',
        label: 'Ver Pestaña Socios en Inicio (BI)',
        description:
          'Habilita la sub-pestaña de segmentación demográfica, altas y retención de socios en Inicio.',
        icon: 'users',
      },
      {
        key: 'ver_tab_asistencia',
        label: 'Ver Pestaña Asistencia en Inicio (BI)',
        description:
          'Habilita el análisis histórico de afluencia por horarios y días en el tablero de Inicio.',
        icon: 'activity',
      },
      {
        key: 'ver_tab_inventario',
        label: 'Ver Pestaña Inventario en Inicio (BI)',
        description:
          'Habilita la vista analítica de rotación de productos, quiebres de stock y valorización.',
        icon: 'package',
      },
      {
        key: 'ver_tab_control',
        label: 'Ver Pestaña Control en Inicio (BI)',
        description:
          'Habilita los indicadores de control operativo, alertas y trazabilidad de anomalías.',
        icon: 'shield',
      },
    ],
  },
  {
    id: 'finance-module',
    title: 'Módulo Finanzas Operativo',
    subtitle:
      'Restringe la visibilidad contable sensible dentro del módulo de Compras, Gastos y Finanzas.',
    icon: 'finance',
    items: [
      {
        key: 'ver_dashboard_modulo_finanzas',
        label: 'Ver Dashboard Financiero y su PDF',
        description:
          'Controla el acceso a la pestaña Dashboard Financiero (ingresos, egresos, flujo neto) y a su botón Exportar Reporte PDF en el módulo Finanzas.',
        icon: 'bar-chart',
      },
    ],
  },
  {
    id: 'exports-reports',
    title: 'Exportaciones y Reportes',
    subtitle:
      'Define qué descargas en CSV, Excel (.xlsx) o PDF tiene permitido generar el rol Recepcionista.',
    icon: 'download',
    items: [
      {
        key: 'exportar_clientes',
        label: 'Exportar Padrón de Clientes',
        description:
          'Permite descargar el padrón general de socios en CSV, Excel (.xlsx) o PDF desde Inicio.',
        icon: 'users',
      },
      {
        key: 'exportar_deudores',
        label: 'Exportar Cartera de Deudores',
        description:
          'Permite descargar los créditos pendientes y saldos por cobrar desde el Centro de Exportaciones.',
        icon: 'credit-card',
      },
      {
        key: 'exportar_ventas_caja',
        label: 'Exportar Ventas y Caja',
        description:
          'Permite descargar el reporte detallado de ventas y movimientos de caja desde Inicio y Finanzas.',
        icon: 'receipt',
      },
      {
        key: 'exportar_contextual_bi',
        label: 'Exportar Vistas Contextuales BI',
        description:
          'Permite exportar tablas y conjuntos analíticos filtrados desde las sub-pestañas de Inteligencia de Negocio.',
        icon: 'filter',
      },
      {
        key: 'exportar_reporte_ejecutivo_pdf',
        label: 'Exportar Reporte Ejecutivo PDF',
        description:
          'Permite generar el documento PDF ejecutivo consolidado de los 4 bloques BI (los costos y márgenes de inventario solo se incluyen si también está activo Finanzas y Rentabilidad).',
        icon: 'printer',
      },
    ],
  },
];

export interface ReceptionistPermissionsTabProps {
  // Inyección opcional para tests desacoplados
  initialPermissions?: ReceptionistPermissionsDto;
}

export const ReceptionistPermissionsTab: React.FC<ReceptionistPermissionsTabProps> = ({
  initialPermissions,
}) => {
  const shouldAutoFetch = initialPermissions === undefined;
  const {
    permissions: savedPermissions,
    isLoading,
    isSaving,
    error,
    clearError,
    fetchPermissions,
    updatePermissions,
  } = useReceptionistPermissions({ autoFetch: shouldAutoFetch });

  const effectiveSaved = initialPermissions ?? savedPermissions;
  const [draft, setDraft] = useState<ReceptionistPermissionsDto>(() => ({
    ...effectiveSaved,
  }));
  const [feedback, setFeedback] = useState<{
    variant: 'success' | 'info' | 'danger';
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    setDraft({ ...effectiveSaved });
  }, [effectiveSaved]);

  const enabledCount = useMemo(() => countEnabledPermissions(draft), [draft]);
  const hasChanges = useMemo(
    () => !arePermissionsEqual(draft, effectiveSaved),
    [draft, effectiveSaved]
  );

  const handleToggle = (key: keyof ReceptionistPermissionsDto, nextValue: boolean) => {
    setFeedback(null);
    if (error) clearError();
    setDraft((prev) => ({
      ...prev,
      [key]: nextValue,
    }));
  };

  const handleResetAllLocked = () => {
    setFeedback(null);
    if (error) clearError();
    setDraft({ ...DEFAULT_RECEPTIONIST_PERMISSIONS });
  };

  const handleSaveChanges = async () => {
    setFeedback(null);
    if (error) clearError();
    const updated = await updatePermissions(draft);
    if (updated) {
      const activeTotal = countEnabledPermissions(updated);
      setFeedback({
        variant: 'success',
        title: 'Permisos de recepción actualizados',
        message: `Configuración guardada (${activeTotal} de 12 permisos habilitados) y registrada en la bitácora de auditoría.`,
      });
    }
  };

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Encabezado explicativo Secure-by-Default + Contador */}
      <Card variant="default" padding="md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-brand/10 border border-brand/25 text-brand flex items-center justify-center shrink-0">
              <Icon name="shield" className="w-5 h-5" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-txt-primary">
                  Matriz de Permisos del Rol Recepcionista
                </h3>
                <Badge
                  variant={enabledCount === 0 ? 'info' : 'success'}
                  size="sm"
                  aria-label={`${enabledCount} de 12 habilitados`}
                >
                  {enabledCount} de 12 habilitados
                </Badge>
                {hasChanges && (
                  <Badge variant="warning" size="sm">
                    Cambios sin guardar
                  </Badge>
                )}
              </div>
              <p className="text-xs text-txt-secondary leading-relaxed">
                Política <strong className="text-txt-primary">Secure-by-Default</strong>: todo
                permiso analítico o de exportación inicia bloqueado por defecto hasta que un
                Administrador lo habilite explícitamente. Cada modificación genera un evento de{' '}
                <strong className="text-txt-primary">auditoría automática</strong> en la bitácora
                del sistema.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetAllLocked}
              disabled={isLoading || isSaving || enabledCount === 0}
              leftIcon={<Icon name="lock" className="w-3.5 h-3.5" />}
            >
              Restablecer Todo Bloqueado
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleSaveChanges()}
              disabled={!hasChanges || isLoading || isSaving}
              isLoading={isSaving}
              leftIcon={<Icon name="save" className="w-3.5 h-3.5" />}
            >
              Guardar Cambios
            </Button>
          </div>
        </div>
      </Card>

      {/* Estado de Error con Reintento */}
      {error && (
        <Alert
          variant="danger"
          title="Error al gestionar permisos de recepción"
          actionText="Reintentar"
          onAction={() => void fetchPermissions()}
          onClose={clearError}
        >
          {error.message}
        </Alert>
      )}

      {/* Feedback de Guardado Exitoso */}
      {feedback && (
        <Alert
          variant={feedback.variant}
          title={feedback.title}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {/* Estado Loading / Skeleton */}
      {isLoading ? (
        <div
          role="status"
          aria-label="Cargando configuración de permisos de recepción"
          className="flex flex-col gap-4"
        >
          <span className="sr-only">Cargando matriz de permisos...</span>
          {Array.from({ length: 3 }).map((_, idx) => (
            <Card key={idx} variant="default" padding="md">
              <div className="flex flex-col gap-3">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-3 w-96 max-w-full" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* 3 Grupos de Tarjetas con Switch Accesible */
        <div className="flex flex-col gap-5">
          {PERMISSION_GROUPS.map((group) => {
            const groupEnabledCount = group.items.filter((item) => draft[item.key]).length;
            return (
              <Card key={group.id} variant="default">
                <CardHeader>
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-canvas-subtle border border-border flex items-center justify-center text-brand shrink-0">
                      <Icon name={group.icon} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle>{group.title}</CardTitle>
                      <CardDescription>{group.subtitle}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={groupEnabledCount > 0 ? 'success' : 'default'}
                    size="sm"
                    className="shrink-0"
                  >
                    {groupEnabledCount}/{group.items.length}
                  </Badge>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.items.map((item) => {
                      const switchId = `perm-switch-${item.key}`;
                      const descId = `perm-desc-${item.key}`;
                      const checked = Boolean(draft[item.key]);

                      return (
                        <div
                          key={item.key}
                          className={`p-3.5 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                            checked
                              ? 'bg-status-success-bg/35 border-status-success-border/70'
                              : 'bg-canvas-subtle/60 border-border'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                                checked
                                  ? 'bg-surface border-status-success-border text-status-success'
                                  : 'bg-surface border-border text-txt-muted'
                              }`}
                            >
                              <Icon name={item.icon} className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex flex-col gap-0.5">
                              <label
                                htmlFor={switchId}
                                className="text-xs font-bold text-txt-primary cursor-pointer leading-snug"
                              >
                                {item.label}
                              </label>
                              <p
                                id={descId}
                                className="text-[11px] text-txt-muted leading-snug"
                              >
                                {item.description}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                            <Switch
                              id={switchId}
                              checked={checked}
                              disabled={isSaving}
                              aria-describedby={descId}
                              onCheckedChange={(next) => handleToggle(item.key, next)}
                            />
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wider ${
                                checked ? 'text-status-success' : 'text-txt-muted'
                              }`}
                            >
                              {checked ? 'Activo' : 'Bloqueado'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
