// ============================================================================
// COMPONENTE: TAB DE BANDEJA GLOBAL DE TACHADOS (PASO 2 - AUDITORÍA ADMIN)
// Auditoría centralizada de ventas tachadas en turno y anulación definitiva
// Ubicación: src/features/finance/components/StruckSalesTrayTab.tsx
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { canCancelSupplierPurchase, formatCurrency } from '../../../domain/finance';
import { StruckSaleFilter, StruckSaleTrayItemDto } from '../../../types/finance';
import { ResolveStruckSaleInput } from '../../../types/pos';
import { ResolveStruckTrayModal } from './ResolveStruckTrayModal';

export interface StruckSalesTrayTabProps {
  items: StruckSaleTrayItemDto[];
  isLoading: boolean;
  isActionLoading: boolean;
  filter: StruckSaleFilter;
  onFilterChange: (filter: StruckSaleFilter) => void;
  onRefresh: () => void;
  onResolveStruckSale: (saleId: number, input: ResolveStruckSaleInput) => Promise<any>;
  userRole?: string;
}

export const StruckSalesTrayTab: React.FC<StruckSalesTrayTabProps> = ({
  items,
  isLoading,
  isActionLoading,
  filter,
  onFilterChange,
  onRefresh,
  onResolveStruckSale,
  userRole,
}) => {
  const isAdmin = canCancelSupplierPurchase(userRole); // Mismo privilegio admin
  const [selectedTarget, setSelectedTarget] = useState<StruckSaleTrayItemDto | null>(null);

  const [estadoFilter, setEstadoFilter] = useState<string>(filter.estado_venta || 'TODAS');

  const handleApplyFilter = (newEstado: string) => {
    setEstadoFilter(newEstado);
    onFilterChange({
      ...filter,
      estado_venta: newEstado === 'TODAS' ? undefined : (newEstado as any),
    });
  };

  // 1. Loading State
  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col gap-4 animate-pulse" role="status" aria-label="Cargando bandeja de tachados">
        <div className="h-12 bg-surface rounded-xl border border-border" />
        <div className="h-64 bg-surface rounded-xl border border-border" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Filtros y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-surface rounded-xl border border-border shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-txt-muted font-medium">Estado Auditoría:</span>
            <select
              value={estadoFilter}
              onChange={(e) => handleApplyFilter(e.target.value)}
              aria-label="Filtrar por Estado de Venta"
              className="px-2 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs outline-none"
            >
              <option value="TODAS">Todas las Ventas</option>
              <option value="TACHADA_EN_TURNO">Pendientes de Dictamen (TACHADA_EN_TURNO)</option>
              <option value="ANULADA_DEFINITIVA">Auditadas (ANULADA_DEFINITIVA)</option>
            </select>
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={onRefresh} isLoading={isLoading}>
            Refrescar Bandeja
          </Button>
        </div>

        <div className="text-xs text-txt-secondary flex items-center gap-2">
          <span>Total en Bandeja:</span>
          <Badge variant="info">{items.length}</Badge>
        </div>
      </div>

      {/* 2. Empty State */}
      {items.length === 0 ? (
        <div className="p-10 text-center bg-surface rounded-xl border border-border flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center text-txt-muted">
            <Icon name="shield" className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-bold text-txt-primary">No hay ventas tachadas registradas</h3>
          <p className="text-xs text-txt-muted max-w-sm">
            Las ventas tachadas en cualquier turno de caja aparecerán aquí para revisión del Administrador.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
            Comprobar Nuevos Registros
          </Button>
        </div>
      ) : (
        /* 3. Data State: Tabla de Bandeja */
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas-subtle text-txt-muted border-b border-border">
                <tr>
                  <th className="p-3"># Venta</th>
                  <th className="p-3">Turno Origen</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Vendedor</th>
                  <th className="p-3">Tachado Por / Motivo</th>
                  <th className="p-3 text-right">Efectivo / Digital</th>
                  <th className="p-3 text-right">Total Venta</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3">Resolución Admin</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((it) => {
                  const isPendiente = it.estado_venta === 'TACHADA_EN_TURNO';
                  const isTurnoAbierto = it.turno_estado === 'ABIERTO';

                  return (
                    <tr
                      key={it.id}
                      className={`hover:bg-canvas/50 transition-colors ${
                        isPendiente ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="p-3 font-mono font-bold text-txt-primary">#{it.id}</td>
                      <td className="p-3">
                        <span className="font-semibold text-txt-primary block">
                          Turno #{it.turno_caja_id}
                        </span>
                        <Badge variant={isTurnoAbierto ? 'success' : 'default'} size="sm">
                          {it.turno_estado}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-txt-primary">
                          {it.cliente_nombre_completo || 'Cliente General'}
                        </span>
                      </td>
                      <td className="p-3 text-txt-secondary">@{it.usuario_vendedor_username}</td>
                      <td className="p-3 max-w-xs">
                        <span className="text-txt-primary font-medium block">
                          @{it.tachado_por_username || 'Operador'}
                        </span>
                        <p className="text-[11px] text-amber-800 dark:text-amber-400 italic line-clamp-2">
                          &quot;{it.motivo_tachado || 'Sin motivo especificado'}&quot;
                        </p>
                      </td>
                      <td className="p-3 text-right text-txt-secondary">
                        <div>Ef: {formatCurrency(it.monto_pagado_efectivo)}</div>
                        <div>Dig: {formatCurrency(it.monto_pagado_digital)}</div>
                      </td>
                      <td className="p-3 text-right font-black text-sm text-txt-primary">
                        {formatCurrency(it.total_venta)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={isPendiente ? 'warning' : 'danger'}>
                          {isPendiente ? 'TACHADA EN TURNO' : 'ANULADA DEFINITIVA'}
                        </Badge>
                      </td>
                      <td className="p-3 text-txt-secondary">
                        {it.resuelto_por_admin_username ? (
                          <div>
                            <span className="font-semibold text-txt-primary block">
                              @{it.resuelto_por_admin_username}
                            </span>
                            <span className="text-[10px] text-txt-muted block">
                              {it.fecha_resolucion_tachado}
                            </span>
                            {it.nota_resolucion_tachado && (
                              <p className="text-[11px] italic mt-0.5">
                                {it.nota_resolucion_tachado}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-txt-muted italic">Pendiente Paso 2</span>
                        )}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {isPendiente && isAdmin && (
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => setSelectedTarget(it)}
                            disabled={isActionLoading}
                            leftIcon={<Icon name="shield" className="w-3.5 h-3.5" aria-hidden="true" />}
                          >
                            Resolver (Paso 2)
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Dictamen Paso 2 */}
      <ResolveStruckTrayModal
        isOpen={selectedTarget !== null}
        item={selectedTarget}
        onClose={() => setSelectedTarget(null)}
        onSubmit={onResolveStruckSale}
        isLoading={isActionLoading}
      />
    </div>
  );
};
