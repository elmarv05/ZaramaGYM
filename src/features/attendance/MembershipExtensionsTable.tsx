// ============================================================================
// COMPONENTE: HISTORIAL DE EXTENSIONES Y RECUPERACIÓN DE DÍAS (SLICE 5)
// Bitácora auditada de prórrogas manuales concedidas
// Ubicación: src/features/attendance/MembershipExtensionsTable.tsx
// ============================================================================

import React from 'react';
import { Icon } from '../../components/primitives/Icon';
import { MembershipExtensionDto } from '../../types/attendance';

export interface MembershipExtensionsTableProps {
  extensions: MembershipExtensionDto[];
  isLoading: boolean;
  error: string | null;
  onOpenExtendModal: () => void;
  onRetry: () => void;
}

export const MembershipExtensionsTable: React.FC<MembershipExtensionsTableProps> = ({
  extensions,
  isLoading,
  error,
  onOpenExtendModal,
  onRetry,
}) => {
  // 1. ESTADO DE ERROR
  if (error && !isLoading) {
    return (
      <div
        role="alert"
        className="w-full bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3"
      >
        <Icon name="warning" className="w-8 h-8 text-status-danger" />
        <h4 className="text-base font-bold text-rose-800 dark:text-rose-200">
          Error al cargar prórrogas de membresía
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-txt-primary">
            Registro Histórico de Prórrogas y Recuperación de Días
          </h3>
          <p className="text-xs text-txt-muted">
            Todas las extensiones manuales de membresía son auditadas de forma inmutable.
          </p>
        </div>
        <button
          type="button"
          data-testid="btn-open-extend-modal"
          onClick={onOpenExtendModal}
          className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-brand-text text-xs font-black shadow-xs transition-colors flex items-center gap-2"
        >
          <Icon name="plus" className="w-4 h-4" />
          <span>Otorgar Días de Membresía</span>
        </button>
      </div>

      {/* 2. LOADING / SKELETON */}
      {isLoading ? (
        <div data-testid="extensions-loading" className="w-full flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 w-full bg-surface border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : extensions.length === 0 ? (
        /* 3. EMPTY STATE */
        <div
          data-testid="extensions-empty"
          className="w-full bg-surface border border-dashed border-border rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-3"
        >
          <div className="w-14 h-14 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted border border-border">
            <Icon name="calendar" className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-txt-primary">
            No se han registrado extensiones de membresía
          </h4>
          <p className="text-xs text-txt-muted max-w-sm">
            Cuando un socio justifique inasistencia médica o viaje, use el botón superior para extender sus días válidos.
          </p>
          <button
            type="button"
            onClick={onOpenExtendModal}
            className="mt-2 px-4 py-2 bg-brand text-brand-text text-xs font-bold rounded-lg shadow-xs hover:bg-brand-hover transition-colors"
          >
            Otorgar Primera Prórroga
          </button>
        </div>
      ) : (
        /* 4. SUCCESS / DATA STATE */
        <div className="overflow-x-auto border border-border rounded-xl bg-surface shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-canvas-subtle text-txt-secondary font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Fecha Registro</th>
                <th className="py-3 px-4">Socio Beneficiario</th>
                <th className="py-3 px-4">Plan Vigente</th>
                <th className="py-3 px-4">Días Otorgados</th>
                <th className="py-3 px-4">Vigencia Anterior</th>
                <th className="py-3 px-4">Nueva Vigencia</th>
                <th className="py-3 px-4">Motivo / Justificación</th>
                <th className="py-3 px-4">Autorizado Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {extensions.map((ext) => (
                <tr key={ext.id} className="hover:bg-canvas/50 transition-colors">
                  <td className="py-3 px-4 whitespace-nowrap text-txt-muted font-medium">
                    {ext.createdAt}
                  </td>
                  <td className="py-3 px-4 font-bold text-txt-primary">
                    {ext.nombreCliente}
                  </td>
                  <td className="py-3 px-4 text-txt-secondary font-medium">
                    {ext.nombrePlan}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800">
                      +{ext.diasOtorgados} días
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-txt-muted">
                    {ext.fechaVencimientoAnterior.split(' ')[0]}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">
                    {ext.fechaVencimientoNueva.split(' ')[0]} 23:59
                  </td>
                  <td className="py-3 px-4 max-w-xs truncate text-txt-primary" title={ext.motivoJustificacion}>
                    {ext.motivoJustificacion}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-txt-secondary text-[11px]">
                    {ext.autorizadoPorNombre || `Usuario #${ext.autorizadoPorUsuarioId}`}
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
