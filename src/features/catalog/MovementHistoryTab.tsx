// ============================================================================
// PESTAÑA: HISTORIAL INMUTABLE DE KARDEX Y MERMAS (SLICE 3)
// 4 Estados: Loading, Empty, Error, Success.
// Ubicación: src/features/catalog/MovementHistoryTab.tsx
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';
import { Select } from '../../components/primitives/Select';
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
  canRecordInventoryMovement,
  getMovementTypeBadge,
} from '../../domain/catalog';
import {
  InventoryMovementItem,
  ProductListItem,
  RecordInventoryMovementInput,
} from '../../types/catalog';
import { InventoryMovementModal } from './InventoryMovementModal';

export interface MovementHistoryTabProps {
  movements: InventoryMovementItem[];
  products: ProductListItem[];
  isLoading: boolean;
  isActionLoading: boolean;
  userRole?: string | null;
  onRefresh?: () => void;
  onRecordMovement?: (input: RecordInventoryMovementInput) => Promise<any>;
}

export const MovementHistoryTab: React.FC<MovementHistoryTabProps> = ({
  movements,
  products,
  isLoading,
  isActionLoading,
  userRole,
  onRefresh,
  onRecordMovement,
}) => {
  const canMutate = canRecordInventoryMovement(userRole);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('TODOS');

  const filteredMovements = movements.filter((mov) => {
    if (selectedType !== 'TODOS' && mov.tipo_movimiento !== selectedType) {
      return false;
    }
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      mov.producto_nombre.toLowerCase().includes(term) ||
      mov.producto_sku.toLowerCase().includes(term) ||
      mov.motivo_justificacion.toLowerCase().includes(term) ||
      mov.registrado_por_username.toLowerCase().includes(term)
    );
  });

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-xl border border-border">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="w-full sm:w-64">
            <Input
              placeholder="Buscar por producto, justificación u operador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar en kardex"
              leftIcon={
                <svg className="w-4 h-4 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          </div>

          <div className="w-full sm:w-56">
            <Select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              options={[
                { value: 'TODOS', label: 'Todos los movimientos' },
                { value: 'MERMA_DANIO', label: 'Merma por Daño' },
                { value: 'MERMA_VENCIMIENTO', label: 'Merma Vencimiento' },
                { value: 'CONSUMO_PROPIO', label: 'Consumo Propio' },
                { value: 'ENTRADA_AJUSTE', label: 'Entrada Ajuste' },
                { value: 'STOCK_INICIAL', label: 'Stock Inicial' },
                { value: 'SALIDA_VENTA', label: 'Venta POS' },
                { value: 'ENTRADA_COMPRA', label: 'Compra Proveedor' },
                { value: 'REVERSION_TACHADO', label: 'Reversión Tachado' },
              ]}
              aria-label="Filtrar por tipo de movimiento"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          {canMutate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              disabled={isActionLoading}
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Registrar Merma / Ajuste
            </Button>
          )}
        </div>
      </div>

      {/* Tabla Kardex Inmutable */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha / Hora</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead>Tipo Movimiento</TableHead>
            <TableHead>Cantidad</TableHead>
            <TableHead>Transición Stock</TableHead>
            <TableHead>Justificación</TableHead>
            <TableHead>Operador</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <TableLoadingSkeleton colSpan={7} rows={4} />
          ) : filteredMovements.length === 0 ? (
            <TableEmptyState
              colSpan={7}
              title={
                searchTerm || selectedType !== 'TODOS'
                  ? 'No hay movimientos con los filtros aplicados'
                  : 'No se registran movimientos en el Kardex'
              }
              description={
                searchTerm || selectedType !== 'TODOS'
                  ? 'Intenta con otro filtro de búsqueda o tipo de movimiento.'
                  : 'Los asientos de stock inicial, compras, ventas y mermas se registrarán aquí de forma cronológica inmutable.'
              }
              action={
                canMutate ? (
                  <Button variant="primary" size="sm" onClick={() => setIsModalOpen(true)}>
                    Registrar Merma / Ajuste
                  </Button>
                ) : undefined
              }
            />
          ) : (
            filteredMovements.map((mov) => {
              const badge = getMovementTypeBadge(mov.tipo_movimiento);
              const isPos = mov.signo === '+';

              return (
                <TableRow key={mov.id}>
                  <TableCell className="font-mono text-xs text-txt-secondary whitespace-nowrap">
                    {mov.created_at}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-txt-primary">{mov.producto_nombre}</span>
                      <span className="font-mono text-[11px] text-txt-muted">
                        {mov.producto_sku}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant={badge.variant} size="sm">
                      {badge.label}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <span
                      className={`font-mono font-bold text-xs ${
                        isPos ? 'text-status-success' : 'text-status-danger'
                      }`}
                    >
                      {mov.signo}
                      {mov.cantidad}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5 font-mono text-xs text-txt-primary">
                      <span>{mov.stock_anterior}</span>
                      <Icon name="arrow-right" className="w-3.5 h-3.5 text-txt-muted" aria-hidden="true" />
                      <span className="font-bold">{mov.stock_resultante}</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <span
                      className="text-xs text-txt-secondary line-clamp-2 max-w-xs"
                      title={mov.motivo_justificacion}
                    >
                      {mov.motivo_justificacion}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs font-mono text-txt-muted">
                      @{mov.registrado_por_username}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Modal de Movimiento de Inventario / Merma */}
      {canMutate && (
        <InventoryMovementModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          products={products}
          isLoading={isActionLoading}
          onSubmit={async (input) => {
            if (onRecordMovement) {
              const res = await onRecordMovement(input);
              return Boolean(res);
            }
            return false;
          }}
        />
      )}
    </div>
  );
};
