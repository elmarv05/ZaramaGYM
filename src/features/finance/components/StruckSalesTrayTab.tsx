// ============================================================================
// COMPONENTE: TAB DE BANDEJA GLOBAL DE TACHADOS (PASO 2 - AUDITORÍA ADMIN)
// Auditoría centralizada de ventas tachadas en turno y anulación definitiva
// Ubicación: src/features/finance/components/StruckSalesTrayTab.tsx
// ============================================================================

import React, { useId, useState } from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Card } from '../../../components/primitives/Card';
import { Icon } from '../../../components/primitives/Icon';
import { Label } from '../../../components/primitives/Label';
import { Select, SelectOption } from '../../../components/primitives/Select';
import { Skeleton } from '../../../components/primitives/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/primitives/Table';
import { canResolveStruckSales, formatCurrency } from '../../../domain/finance';
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

const STRUCK_STATUS_OPTIONS: SelectOption[] = [
  { value: 'TODAS', label: 'Todas las Ventas' },
  { value: 'TACHADA_EN_TURNO', label: 'Pendientes de Dictamen (TACHADA_EN_TURNO)' },
  { value: 'ANULADA_DEFINITIVA', label: 'Auditadas (ANULADA_DEFINITIVA)' },
];

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
  const canResolve = canResolveStruckSales(userRole);
  const estadoId = useId();
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
      <div className="flex flex-col gap-4" role="status" aria-label="Cargando bandeja de tachados">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Filtros y Acciones */}
      <Card padding="sm" className="sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div role="search" className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <Label htmlFor={estadoId} className="normal-case text-txt-muted font-medium">
              Estado Auditoría:
            </Label>
            <div className="w-72">
              <Select
                id={estadoId}
                selectSize="sm"
                value={estadoFilter}
                onChange={(e) => handleApplyFilter(e.target.value)}
                aria-label="Filtrar por Estado de Venta"
                options={STRUCK_STATUS_OPTIONS}
                className="bg-canvas"
              />
            </div>
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={onRefresh} isLoading={isLoading}>
            Refrescar Bandeja
          </Button>
        </div>

        <div className="text-xs text-txt-secondary flex items-center gap-2">
          <span>Total en Bandeja:</span>
          <Badge variant="info">{items.length}</Badge>
        </div>
      </Card>

      {/* 2. Empty State */}
      {items.length === 0 ? (
        <Card className="p-10 text-center items-center justify-center gap-3">
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
        </Card>
      ) : (
        /* 3. Data State: Tabla de Bandeja */
        <Table
          containerLabel="Bandeja global de ventas tachadas"
          containerClassName="rounded-xl shadow-sm"
          className="text-xs"
        >
          <TableHeader stickyHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="p-3 normal-case tracking-normal"># Venta</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Turno Origen</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Cliente</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Vendedor</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Tachado Por / Motivo</TableHead>
              <TableHead className="p-3 text-right normal-case tracking-normal">Efectivo / Digital</TableHead>
              <TableHead className="p-3 text-right normal-case tracking-normal">Total Venta</TableHead>
              <TableHead className="p-3 text-center normal-case tracking-normal">Estado</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Resolución Admin</TableHead>
              <TableHead className="p-3 text-right normal-case tracking-normal">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => {
              const isPendiente = it.estado_venta === 'TACHADA_EN_TURNO';
              const isTurnoAbierto = it.turno_estado === 'ABIERTO';

              return (
                <TableRow
                  key={it.id}
                  className={isPendiente ? 'bg-status-warning-bg/30' : undefined}
                >
                  <TableCell className="p-3 font-mono font-bold text-txt-primary">#{it.id}</TableCell>
                  <TableCell className="p-3">
                    <span className="font-semibold text-txt-primary block">
                      Turno #{it.turno_caja_id}
                    </span>
                    <Badge variant={isTurnoAbierto ? 'success' : 'default'} size="sm">
                      {it.turno_estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-3">
                    <span className="font-bold text-txt-primary">
                      {it.cliente_nombre_completo || 'Cliente General'}
                    </span>
                  </TableCell>
                  <TableCell className="p-3 text-txt-secondary">@{it.usuario_vendedor_username}</TableCell>
                  <TableCell className="p-3 max-w-xs">
                    <span className="text-txt-primary font-medium block">
                      @{it.tachado_por_username || 'Operador'}
                    </span>
                    <p className="text-[11px] text-status-warning italic line-clamp-2">
                      &quot;{it.motivo_tachado || 'Sin motivo especificado'}&quot;
                    </p>
                  </TableCell>
                  <TableCell className="p-3 text-right text-txt-secondary">
                    <div>Ef: {formatCurrency(it.monto_pagado_efectivo)}</div>
                    <div>Dig: {formatCurrency(it.monto_pagado_digital)}</div>
                  </TableCell>
                  <TableCell className="p-3 text-right font-black text-sm text-txt-primary">
                    {formatCurrency(it.total_venta)}
                  </TableCell>
                  <TableCell className="p-3 text-center">
                    <Badge variant={isPendiente ? 'warning' : 'danger'}>
                      {isPendiente ? 'TACHADA EN TURNO' : 'ANULADA DEFINITIVA'}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-3 text-txt-secondary">
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
                  </TableCell>
                  <TableCell className="p-3 text-right whitespace-nowrap">
                    {isPendiente && canResolve && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => setSelectedTarget(it)}
                        disabled={isActionLoading}
                        leftIcon={<Icon name="shield" className="w-3.5 h-3.5" aria-hidden="true" />}
                      >
                        Resolver
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Modal de Dictamen Paso 2 */}
      {canResolve && (
        <ResolveStruckTrayModal
          isOpen={selectedTarget !== null}
          item={selectedTarget}
          onClose={() => setSelectedTarget(null)}
          onSubmit={onResolveStruckSale}
          isLoading={isActionLoading}
        />
      )}
    </div>
  );
};
