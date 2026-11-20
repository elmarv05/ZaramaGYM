// ============================================================================
// PESTAÑA: CATÁLOGO DE PLANES Y SIMULADOR INTERACTIVO DAY OVERFLOW (SLICE 3)
// 4 Estados: Loading, Empty, Error, Success. Soporta RBAC (Lectura/Edición).
// Ubicación: src/features/catalog/PlanListTab.tsx
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableLoadingSkeleton,
  TableRow,
} from '../../components/primitives/Table';
import {
  calculateDayOverflowPreview,
  canCreatePlans,
  canEditOrDeactivatePlans,
  formatPEN,
} from '../../domain/catalog';
import { getLocalDateISO } from '../../domain/printingBackup';
import {
  CreatePlanInput,
  PlanExpirationPreviewDto,
  PlanListItem,
  TipoPlan,
  UpdatePlanInput,
} from '../../types/catalog';
import { PlanFormModal } from './PlanFormModal';

export interface PlanListTabProps {
  plans: PlanListItem[];
  isLoading: boolean;
  isActionLoading: boolean;
  userRole?: string | null;
  onRefresh?: () => void;
  onCreatePlan?: (input: CreatePlanInput) => Promise<PlanListItem | null>;
  onUpdatePlan?: (planId: number, input: UpdatePlanInput) => Promise<PlanListItem | null>;
  onTogglePlanActive?: (planId: number, currentActive: boolean) => Promise<boolean>;
  onSimulate?: (
    fechaInicio: string,
    tipoPlan: TipoPlan,
    duracionMeses: number | null,
    planId?: number
  ) => Promise<PlanExpirationPreviewDto>;
}

export const PlanListTab: React.FC<PlanListTabProps> = ({
  plans,
  isLoading,
  isActionLoading,
  userRole,
  onRefresh,
  onCreatePlan,
  onUpdatePlan,
  onTogglePlanActive,
  onSimulate,
}) => {
  const canCreate = canCreatePlans(userRole);
  const canEditOrDeactivate = canEditOrDeactivatePlans(userRole);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanListItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [soloActivos, setSoloActivos] = useState(false);

  // Estado del Simulador Day Overflow
  const todayStr = getLocalDateISO();
  const [simFechaInicio, setSimFechaInicio] = useState(todayStr);
  const [simTipoPlan, setSimTipoPlan] = useState<TipoPlan>('MENSUALIDAD');
  const [simDuracionMeses, setSimDuracionMeses] = useState<number>(1);
  const [simSelectedPlanId, setSimSelectedPlanId] = useState<number | undefined>(undefined);
  const [simPreview, setSimPreview] = useState<PlanExpirationPreviewDto>(() =>
    calculateDayOverflowPreview(todayStr, 'MENSUALIDAD', 1)
  );

  // Ejecutar simulación local / IPC
  const runSimulation = async (
    fecha: string,
    tipo: TipoPlan,
    duracion: number | null,
    planId?: number
  ) => {
    try {
      let res: PlanExpirationPreviewDto | null = null;
      if (onSimulate) {
        res = await onSimulate(fecha, tipo, duracion, planId);
      }
      if (res && typeof res.hubo_desbordamiento === 'boolean') {
        setSimPreview(res);
      } else {
        const local = calculateDayOverflowPreview(fecha, tipo, duracion);
        setSimPreview(local);
      }
    } catch (_err) {
      const fallback = calculateDayOverflowPreview(fecha, tipo, duracion);
      setSimPreview(fallback);
    }
  };

  const handleSimulatePlanClick = (plan: PlanListItem) => {
    setSimSelectedPlanId(plan.id);
    setSimTipoPlan(plan.tipo_plan);
    setSimDuracionMeses(plan.duracion_meses);
    runSimulation(simFechaInicio, plan.tipo_plan, plan.duracion_meses, plan.id);
  };

  const handleQuickDate = (dateStr: string) => {
    setSimFechaInicio(dateStr);
    runSimulation(dateStr, simTipoPlan, simDuracionMeses, simSelectedPlanId);
  };

  const handleQuickDuration = (tipo: TipoPlan, duracion: number) => {
    setSimTipoPlan(tipo);
    setSimDuracionMeses(duracion);
    runSimulation(simFechaInicio, tipo, duracion, simSelectedPlanId);
  };

  // Filtrado de planes
  const filteredPlans = plans.filter((plan) => {
    if (soloActivos && !plan.estado_activo) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      plan.nombre.toLowerCase().includes(term) ||
      plan.codigo.toLowerCase().includes(term) ||
      (plan.descripcion && plan.descripcion.toLowerCase().includes(term))
    );
  });

  return (
    <div className="w-full flex flex-col gap-6">
      {/* ==================================================================== */}
      {/* 1. PANEL INTERACTIVO: SIMULADOR DE VENCIMIENTO (DAY OVERFLOW) */}
      {/* ==================================================================== */}
      <section
        aria-labelledby="simulador-heading"
        className="bg-surface border border-border rounded-xl p-5 shadow-xs flex flex-col gap-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Icon name="calendar" className="w-5 h-5 text-brand shrink-0" aria-hidden="true" />
            <div>
              <h3 id="simulador-heading" className="text-sm font-bold text-txt-primary">
                Simulador Canónico de Vencimientos (*Day Overflow*)
              </h3>
              <p className="text-xs text-txt-muted">
                Calcula con precisión de segundos y compensa días en meses de 28, 29 y 30 días para proteger al socio.
              </p>
            </div>
          </div>
          <Badge variant={simPreview.hubo_desbordamiento ? 'warning' : 'success'} size="md">
            <span className="inline-flex items-center gap-1.5">
              {simPreview.hubo_desbordamiento ? (
                <>
                  <Icon name="clock" className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{`Day Overflow: +${simPreview.dias_desbordamiento} día(s)`}</span>
                </>
              ) : (
                <>
                  <Icon name="check" className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Calendario Regular</span>
                </>
              )}
            </span>
          </Badge>
        </div>

        {/* Controles del Simulador */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {/* Fecha de Inicio */}
          <div className="flex flex-col gap-2">
            <Input
              label="Fecha de Inicio de Membresía"
              type="date"
              value={simFechaInicio}
              onChange={(e) => {
                const val = e.target.value;
                setSimFechaInicio(val);
                if (val) runSimulation(val, simTipoPlan, simDuracionMeses, simSelectedPlanId);
              }}
              required
            />
            {/* Botones rápidos de fechas borde */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-[11px] font-semibold text-txt-muted">Casos borde:</span>
              <button
                type="button"
                onClick={() => handleQuickDate('2024-01-31')}
                className="text-[11px] px-2 py-0.5 rounded bg-canvas-subtle hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-secondary border border-border"
                title="CP-01: Bisiesto Feb=29 (+2 días)"
              >
                31 Ene 2024
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate('2025-01-31')}
                className="text-[11px] px-2 py-0.5 rounded bg-canvas-subtle hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-secondary border border-border"
                title="CP-02: Común Feb=28 (+3 días)"
              >
                31 Ene 2025
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate('2026-01-31')}
                className="text-[11px] px-2 py-0.5 rounded bg-canvas-subtle hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-secondary border border-border"
                title="CP-03/CP-04: Mar/Abr 2026"
              >
                31 Ene 2026
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate('2024-02-29')}
                className="text-[11px] px-2 py-0.5 rounded bg-canvas-subtle hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-secondary border border-border"
                title="CP-07: 29 Feb bisiesto anual"
              >
                29 Feb 2024
              </button>
              <button
                type="button"
                onClick={() => handleQuickDate(todayStr)}
                className="text-[11px] px-2 py-0.5 rounded bg-brand/10 text-brand font-medium border border-brand/20"
              >
                Hoy
              </button>
            </div>
          </div>

          {/* Duración rápida */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider select-none">
              Tipo / Duración a Cotizar
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickDuration('PASE_DIARIO', 0)}
                className={`text-xs py-1.5 px-2 rounded-md font-medium border transition-colors ${
                  simTipoPlan === 'PASE_DIARIO'
                    ? 'bg-brand text-brand-text border-brand shadow-xs'
                    : 'bg-surface hover:bg-canvas-subtle text-txt-secondary border-border'
                }`}
              >
                Pase Día
              </button>
              <button
                type="button"
                onClick={() => handleQuickDuration('MENSUALIDAD', 1)}
                className={`text-xs py-1.5 px-2 rounded-md font-medium border transition-colors ${
                  simTipoPlan === 'MENSUALIDAD' && simDuracionMeses === 1
                    ? 'bg-brand text-brand-text border-brand shadow-xs'
                    : 'bg-surface hover:bg-canvas-subtle text-txt-secondary border-border'
                }`}
              >
                1 Mes
              </button>
              <button
                type="button"
                onClick={() => handleQuickDuration('MENSUALIDAD', 2)}
                className={`text-xs py-1.5 px-2 rounded-md font-medium border transition-colors ${
                  simTipoPlan === 'MENSUALIDAD' && simDuracionMeses === 2
                    ? 'bg-brand text-brand-text border-brand shadow-xs'
                    : 'bg-surface hover:bg-canvas-subtle text-txt-secondary border-border'
                }`}
              >
                2 Meses
              </button>
              <button
                type="button"
                onClick={() => handleQuickDuration('MENSUALIDAD', 3)}
                className={`text-xs py-1.5 px-2 rounded-md font-medium border transition-colors ${
                  simTipoPlan === 'MENSUALIDAD' && simDuracionMeses === 3
                    ? 'bg-brand text-brand-text border-brand shadow-xs'
                    : 'bg-surface hover:bg-canvas-subtle text-txt-secondary border-border'
                }`}
              >
                3 Meses
              </button>
              <button
                type="button"
                onClick={() => handleQuickDuration('MENSUALIDAD', 6)}
                className={`text-xs py-1.5 px-2 rounded-md font-medium border transition-colors ${
                  simTipoPlan === 'MENSUALIDAD' && simDuracionMeses === 6
                    ? 'bg-brand text-brand-text border-brand shadow-xs'
                    : 'bg-surface hover:bg-canvas-subtle text-txt-secondary border-border'
                }`}
              >
                6 Meses
              </button>
              <button
                type="button"
                onClick={() => handleQuickDuration('MENSUALIDAD', 12)}
                className={`text-xs py-1.5 px-2 rounded-md font-medium border transition-colors ${
                  simTipoPlan === 'MENSUALIDAD' && simDuracionMeses === 12
                    ? 'bg-brand text-brand-text border-brand shadow-xs'
                    : 'bg-surface hover:bg-canvas-subtle text-txt-secondary border-border'
                }`}
              >
                12 Meses
              </button>
            </div>
            <span className="text-[11px] text-txt-muted">
              O haz clic en "Simular" en cualquier plan del listado inferior.
            </span>
          </div>

          {/* Tarjeta de Resultado */}
          <div className="bg-canvas-subtle p-3.5 rounded-xl border border-border flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-txt-secondary">
                Vencimiento Oficial
              </span>
              <span className="text-xs font-mono font-bold text-brand">
                {simPreview.dias_totales} días de acceso
              </span>
            </div>

            <div className="flex flex-col">
              <span className="font-mono text-base font-bold text-txt-primary">
                {simPreview.fecha_vencimiento_timestamp}
              </span>
              <span className="text-xs text-txt-secondary mt-0.5">
                {simPreview.explicacion}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 2. CATÁLOGO DE PLANES Y MEMBRESÍAS */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-border">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <Input
            placeholder="Buscar plan por código, nombre o beneficios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Buscar planes"
            leftIcon={
              <svg className="w-4 h-4 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-txt-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soloActivos}
              onChange={(e) => setSoloActivos(e.target.checked)}
              className="rounded border-border text-brand focus:ring-brand"
            />
            <span>Solo activos</span>
          </label>

          {onRefresh && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading || isActionLoading}
            >
              Refrescar
            </Button>
          )}

          {canCreate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingPlan(null);
                setIsModalOpen(true);
              }}
              disabled={isActionLoading}
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Nuevo Plan
            </Button>
          )}
        </div>
      </div>

      {/* Tabla de Planes */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nombre del Plan</TableHead>
            <TableHead>Modalidad</TableHead>
            <TableHead>Duración</TableHead>
            <TableHead>Precio Base</TableHead>
            <TableHead>Recuperación</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <TableLoadingSkeleton colSpan={8} rows={4} />
          ) : filteredPlans.length === 0 ? (
            <TableEmptyState
              colSpan={8}
              title={searchTerm ? 'No se encontraron planes' : 'No hay planes en el catálogo'}
              description={
                searchTerm
                  ? 'Prueba con otro término de búsqueda o limpia los filtros.'
                  : 'Configura las membresías y pases diarios autorizados en el gimnasio.'
              }
              action={
                canCreate ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setEditingPlan(null);
                      setIsModalOpen(true);
                    }}
                  >
                    Nuevo Plan
                  </Button>
                ) : undefined
              }
            />
          ) : (
            filteredPlans.map((plan) => {
              const isPase = plan.tipo_plan === 'PASE_DIARIO';
              return (
                <TableRow key={plan.id}>
                  <TableCell className="font-mono text-xs font-bold text-txt-secondary">
                    {plan.codigo}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-txt-primary">{plan.nombre}</span>
                      {plan.descripcion && (
                        <span className="text-xs text-txt-muted line-clamp-1">
                          {plan.descripcion}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant={isPase ? 'info' : 'default'} size="sm">
                      {isPase ? 'PASE DIARIO' : 'MEMBRESÍA'}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs font-medium text-txt-primary">
                      {isPase ? '1 Jornada' : `${plan.duracion_meses} mes(es)`}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs font-bold text-txt-primary font-mono">
                      {formatPEN(plan.precio_base)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-txt-secondary inline-flex items-center gap-1.5">
                      {plan.permite_recuperacion_dias ? (
                        <>
                          <Icon name="check" className="w-3.5 h-3.5 text-status-success" aria-hidden="true" />
                          <span>Permitida</span>
                        </>
                      ) : (
                        <>
                          <Icon name="x" className="w-3.5 h-3.5 text-status-danger" aria-hidden="true" />
                          <span>No aplica</span>
                        </>
                      )}
                    </span>
                  </TableCell>

                  <TableCell>
                    <Badge variant={plan.estado_activo ? 'success' : 'danger'} size="sm">
                      {plan.estado_activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSimulatePlanClick(plan)}
                        className="text-xs"
                      >
                        Simular
                      </Button>

                      {canEditOrDeactivate && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingPlan(plan);
                              setIsModalOpen(true);
                            }}
                          >
                            Editar
                          </Button>

                          {onTogglePlanActive && (
                            <Button
                              variant={plan.estado_activo ? 'outline' : 'secondary'}
                              size="sm"
                              disabled={isActionLoading}
                              onClick={() => onTogglePlanActive(plan.id, plan.estado_activo)}
                              className={
                                plan.estado_activo
                                  ? 'text-status-danger border-red-300'
                                  : 'text-status-success border-emerald-300'
                              }
                            >
                              {plan.estado_activo ? 'Desactivar' : 'Activar'}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Modal de Plan */}
      {(canCreate || canEditOrDeactivate) && (
        <PlanFormModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingPlan(null);
          }}
          planToEdit={editingPlan}
          isLoading={isActionLoading}
          onSubmit={async (input) => {
            if (editingPlan && canEditOrDeactivate && onUpdatePlan) {
              const res = await onUpdatePlan(editingPlan.id, input as UpdatePlanInput);
              return Boolean(res);
            } else if (!editingPlan && canCreate && onCreatePlan) {
              const res = await onCreatePlan(input as CreatePlanInput);
              return Boolean(res);
            }
            return false;
          }}
        />
      )}
    </div>
  );
};
