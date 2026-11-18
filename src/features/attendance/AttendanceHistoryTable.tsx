// ============================================================================
// COMPONENTE: HISTORIAL DE ASISTENCIAS Y AUDITORÍA DE INGRESO (SLICE 5)
// 4 Estados visuales: Skeleton, Empty, Error, Success
// Ubicación: src/features/attendance/AttendanceHistoryTable.tsx
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '../../components/primitives/Badge';
import { Icon } from '../../components/primitives/Icon';
import { formatAttendanceMode } from '../../domain/attendance';
import {
  AttendanceCheckInMode,
  AttendanceFilter,
  AttendanceListItemDto,
  TrafficLightColor,
} from '../../types/attendance';

export interface AttendanceHistoryTableProps {
  attendances: AttendanceListItemDto[];
  isLoading: boolean;
  error: string | null;
  onFilterChange: (filter: AttendanceFilter) => void;
  onRetry: () => void;
  onOpenManualModal?: () => void;
}

export const AttendanceHistoryTable: React.FC<AttendanceHistoryTableProps> = ({
  attendances,
  isLoading,
  error,
  onFilterChange,
  onRetry,
  onOpenManualModal,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [selectedColor, setSelectedColor] = useState<TrafficLightColor | ''>('');
  const [selectedModo, setSelectedModo] = useState<AttendanceCheckInMode | ''>('');

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({
      busqueda: busqueda.trim() || undefined,
      colorSemaforo: selectedColor || undefined,
      modoIngreso: selectedModo || undefined,
    });
  };

  const handleResetFilters = () => {
    setBusqueda('');
    setSelectedColor('');
    setSelectedModo('');
    onFilterChange({});
  };

  // 1. ESTADO DE ERROR
  if (error && !isLoading) {
    return (
      <div
        role="alert"
        className="w-full bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3"
      >
        <Icon name="warning" className="w-8 h-8 text-status-danger" />
        <h4 className="text-base font-bold text-rose-800 dark:text-rose-200">
          No se pudo cargar el historial de asistencias
        </h4>
        <p className="text-xs text-rose-600 dark:text-rose-300 max-w-md">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
        >
          Reintentar Carga
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Barra de Filtros */}
      <form
        onSubmit={handleFilterSubmit}
        className="bg-surface border border-border rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Input de Búsqueda */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Buscar por socio, DNI o plan..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-canvas text-xs text-txt-primary focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
            <Icon
              name="search"
              className="w-3.5 h-3.5 absolute left-3 top-2.5 text-txt-muted pointer-events-none"
            />
          </div>

          {/* Filtro por Color Semáforo */}
          <select
            value={selectedColor}
            onChange={(e) => setSelectedColor(e.target.value as TrafficLightColor | '')}
            className="px-3 py-2 rounded-lg border border-border bg-canvas text-xs font-semibold text-txt-primary focus:outline-hidden focus:ring-2 focus:ring-brand"
          >
            <option value="">Todos los Semáforos</option>
            <option value="VERDE">Verde (Acceso)</option>
            <option value="AMARILLO">Amarillo (Alerta)</option>
            <option value="ROJO">Rojo (Pase Crédito)</option>
          </select>

          {/* Filtro por Modo de Ingreso */}
          <select
            value={selectedModo}
            onChange={(e) => setSelectedModo(e.target.value as AttendanceCheckInMode | '')}
            className="px-3 py-2 rounded-lg border border-border bg-canvas text-xs font-semibold text-txt-primary focus:outline-hidden focus:ring-2 focus:ring-brand"
          >
            <option value="">Todos los Modos</option>
            <option value="QR_LOCAL">Escaneo QR Local</option>
            <option value="MANUAL_OLVIDO_QR">Manual Olvido QR</option>
            <option value="PASE_DIARIO_CREDITO_ROJO">Pase Diario a Crédito</option>
            <option value="QR_MOVIL_LAN">Móvil LAN</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-brand-text text-xs font-bold transition-colors shadow-2xs"
          >
            Filtrar
          </button>
          {(busqueda || selectedColor || selectedModo) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3 py-2 rounded-lg bg-canvas text-txt-muted hover:text-txt-primary text-xs font-medium border border-border transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      </form>

      {/* 2. ESTADO LOADING / SKELETON */}
      {isLoading ? (
        <div data-testid="attendance-history-loading" className="w-full flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 w-full bg-surface border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : attendances.length === 0 ? (
        /* 3. EMPTY STATE ACCIONABLE */
        <div
          data-testid="attendance-history-empty"
          className="w-full bg-surface border border-dashed border-border rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-3"
        >
          <div className="w-14 h-14 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted border border-border">
            <Icon name="audit" className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-txt-primary">No se encontraron asistencias</h4>
          <p className="text-xs text-txt-muted max-w-sm">
            Aún no hay registros que coincidan con los filtros seleccionados o no se han marcado ingresos hoy.
          </p>
          {onOpenManualModal && (
            <button
              type="button"
              onClick={onOpenManualModal}
              className="mt-2 px-4 py-2 bg-brand text-brand-text text-xs font-bold rounded-lg shadow-xs hover:bg-brand-hover transition-colors"
            >
              Registrar Primer Ingreso
            </button>
          )}
        </div>
      ) : (
        /* 4. SUCCESS / DATA STATE */
        <div className="overflow-x-auto border border-border rounded-xl bg-surface shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-canvas-subtle text-txt-secondary font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Fecha / Hora</th>
                <th className="py-3 px-4">Socio / Documento</th>
                <th className="py-3 px-4">Plan Vigente</th>
                <th className="py-3 px-4">Semáforo</th>
                <th className="py-3 px-4">Modo Ingreso</th>
                <th className="py-3 px-4">Motivo / Estado</th>
                <th className="py-3 px-4">Días Restantes</th>
                <th className="py-3 px-4">Deuda</th>
                <th className="py-3 px-4">Operador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attendances.map((item) => (
                <tr key={item.id} className="hover:bg-canvas/50 transition-colors">
                  <td className="py-3 px-4 whitespace-nowrap font-medium text-txt-primary">
                    {item.fechaHoraIngreso || item.createdAt}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-txt-primary">{item.nombreCompleto}</span>
                      <span className="text-[11px] text-txt-muted">
                        {item.tipoDocumento}: {item.numeroDocumento}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-medium text-txt-secondary">
                    {item.nombrePlan || 'Pase Sin Plan'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <Badge
                      variant={
                        item.colorSemaforo === 'VERDE'
                          ? 'success'
                          : item.colorSemaforo === 'AMARILLO'
                          ? 'warning'
                          : 'danger'
                      }
                      size="sm"
                    >
                      {item.colorSemaforo}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-txt-secondary">
                    {formatAttendanceMode(item.modoIngreso)}
                  </td>
                  <td className="py-3 px-4 max-w-xs truncate text-txt-primary" title={item.motivoSemaforo}>
                    {item.motivoSemaforo}
                    {item.creditoGeneradoId && (
                      <span className="block text-[10px] font-bold text-rose-600">
                        Crédito #{item.creditoGeneradoId}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-semibold">
                    {item.diasRestantesMomento !== null && item.diasRestantesMomento !== undefined ? (
                      <span
                        className={
                          item.diasRestantesMomento <= 5 ? 'text-amber-600 font-bold' : 'text-txt-primary'
                        }
                      >
                        {item.diasRestantesMomento} d
                      </span>
                    ) : (
                      <span className="text-txt-muted">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-bold">
                    {parseFloat(item.deudaPendienteMomento) > 0 ? (
                      <span className="text-rose-600">
                        S/ {parseFloat(item.deudaPendienteMomento).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-emerald-600">S/ 0.00</span>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-txt-muted text-[11px]">
                    {item.registradoPorNombre || `Op #${item.registradoPorUsuarioId}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
