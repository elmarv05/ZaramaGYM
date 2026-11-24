// ============================================================================
// COMPONENTE: TAB DE COMPRAS A PROVEEDORES (HISTORIAL Y KARDEX)
// Listado filtrable, modal de creación, modal de detalle y anulación controlada
// Ubicación: src/features/finance/components/SupplierPurchasesTab.tsx
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
import { PURCHASE_INVOICE_LABELS, canCancelSupplierPurchase, formatCurrency } from '../../../domain/finance';
import { ProductListItem } from '../../../types/catalog';
import { SupplierListItem } from '../../../types/entity';
import {
  CancelSupplierPurchaseDto,
  CreateSupplierPurchaseDto,
  SupplierPurchaseDetailDto,
  SupplierPurchaseFilter,
  SupplierPurchaseSummaryDto,
} from '../../../types/finance';
import { CancelPurchaseModal } from './CancelPurchaseModal';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { PurchaseFormModal } from './PurchaseFormModal';

export interface SupplierPurchasesTabProps {
  purchases: SupplierPurchaseSummaryDto[];
  suppliers: SupplierListItem[];
  products: ProductListItem[];
  selectedPurchaseDetail: SupplierPurchaseDetailDto | null;
  isLoading: boolean;
  isActionLoading: boolean;
  filter: SupplierPurchaseFilter;
  onFilterChange: (filter: SupplierPurchaseFilter) => void;
  onRefresh: () => void;
  onFetchDetail: (id: number) => Promise<SupplierPurchaseDetailDto>;
  onCreatePurchase: (input: CreateSupplierPurchaseDto) => Promise<SupplierPurchaseDetailDto>;
  onCancelPurchase: (id: number, input: CancelSupplierPurchaseDto) => Promise<SupplierPurchaseDetailDto>;
  userRole?: string;
}

const PURCHASE_CHANNEL_OPTIONS: SelectOption[] = [
  { value: 'TODOS', label: 'Todos los Canales' },
  { value: 'FISICA', label: 'Caja Física (Efectivo)' },
  { value: 'DIGITAL', label: 'Caja Digital' },
];

const PURCHASE_STATUS_OPTIONS: SelectOption[] = [
  { value: 'TODOS', label: 'Todos los Estados' },
  { value: '1', label: 'Activas (En Kardex)' },
  { value: '0', label: 'Anuladas (Revertidas)' },
];

export const SupplierPurchasesTab: React.FC<SupplierPurchasesTabProps> = ({
  purchases,
  suppliers,
  products,
  selectedPurchaseDetail,
  isLoading,
  isActionLoading,
  filter,
  onFilterChange,
  onRefresh,
  onFetchDetail,
  onCreatePurchase,
  onCancelPurchase,
  userRole,
}) => {
  const isAdmin = canCancelSupplierPurchase(userRole);
  const canalId = useId();
  const estadoId = useId();

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);

  // Filtros locales
  const [canalFilter, setCanalFilter] = useState<string>(filter.canal_caja || 'TODOS');
  const [estadoFilter, setEstadoFilter] = useState<string>(
    filter.estado_activo !== undefined && filter.estado_activo !== null
      ? String(filter.estado_activo)
      : 'TODOS'
  );

  const handleApplyFilter = (newCanal: string, newEstado: string) => {
    setCanalFilter(newCanal);
    setEstadoFilter(newEstado);

    onFilterChange({
      canal_caja: newCanal === 'TODOS' ? undefined : (newCanal as any),
      estado_activo: newEstado === 'TODOS' ? undefined : Number(newEstado),
    });
  };

  const handleOpenDetail = async (id: number) => {
    try {
      await onFetchDetail(id);
      setIsDetailModalOpen(true);
    } catch {
      // Error manejado en hook
    }
  };

  // 1. Loading State
  if (isLoading && purchases.length === 0) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Cargando compras a proveedores">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Acciones y Filtros */}
      <Card padding="sm" className="sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div role="search" className="flex flex-wrap items-center gap-3">
          {/* Filtro Canal */}
          <div className="flex items-center gap-1.5 text-xs">
            <Label htmlFor={canalId} className="normal-case text-txt-muted font-medium">
              Canal:
            </Label>
            <div className="w-44">
              <Select
                id={canalId}
                selectSize="sm"
                value={canalFilter}
                onChange={(e) => handleApplyFilter(e.target.value, estadoFilter)}
                aria-label="Filtrar por Canal"
                options={PURCHASE_CHANNEL_OPTIONS}
                className="bg-canvas"
              />
            </div>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center gap-1.5 text-xs">
            <Label htmlFor={estadoId} className="normal-case text-txt-muted font-medium">
              Estado:
            </Label>
            <div className="w-44">
              <Select
                id={estadoId}
                selectSize="sm"
                value={estadoFilter}
                onChange={(e) => handleApplyFilter(canalFilter, e.target.value)}
                aria-label="Filtrar por Estado"
                options={PURCHASE_STATUS_OPTIONS}
                className="bg-canvas"
              />
            </div>
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={onRefresh} isLoading={isLoading}>
            Refrescar
          </Button>
        </div>

        <div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            + Registrar Compra a Proveedor
          </Button>
        </div>
      </Card>

      {/* 2. Empty State */}
      {purchases.length === 0 ? (
        <Card className="p-10 text-center items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center text-txt-muted">
            <Icon name="package" className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-bold text-txt-primary">No hay compras a proveedores registradas</h3>
          <p className="text-xs text-txt-muted max-w-sm">
            Registra una nueva adquisición de mercadería para ingresar stock al inventario y nutrir el Kardex de productos.
          </p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            + Registrar Primera Compra
          </Button>
        </Card>
      ) : (
        /* 3. Data State: Tabla de Compras */
        <Table
          containerLabel="Historial de compras a proveedores"
          containerClassName="rounded-xl shadow-sm"
          className="text-xs"
        >
          <TableHeader stickyHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="p-3 normal-case tracking-normal"># ID</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Proveedor</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Comprobante</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Método / Canal</TableHead>
              <TableHead className="p-3 text-right normal-case tracking-normal">Total Compra</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Fecha</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Registrado Por</TableHead>
              <TableHead className="p-3 text-center normal-case tracking-normal">Estado</TableHead>
              <TableHead className="p-3 text-right normal-case tracking-normal">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map((p) => {
              const isActiva = p.estado_activo === 1;
              return (
                <TableRow key={p.id}>
                  <TableCell className="p-3 font-mono font-bold text-txt-primary">#{p.id}</TableCell>
                  <TableCell className="p-3">
                    <span className="font-bold text-txt-primary block">{p.proveedor_nombre}</span>
                    <span className="text-[11px] text-txt-muted">{p.proveedor_documento}</span>
                  </TableCell>
                  <TableCell className="p-3">
                    <span className="font-medium text-txt-primary">
                      {PURCHASE_INVOICE_LABELS[p.tipo_comprobante] || p.tipo_comprobante}
                    </span>
                    {p.numero_comprobante && (
                      <span className="text-[11px] text-txt-muted block font-mono">
                        {p.numero_comprobante}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="p-3">
                    <span className="font-semibold text-txt-primary block">{p.metodo_pago}</span>
                    <Badge variant={p.canal_caja === 'FISICA' ? 'success' : 'info'} size="sm">
                      {p.canal_caja}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-3 text-right font-black text-sm text-txt-primary">
                    {formatCurrency(p.total_compra)}
                  </TableCell>
                  <TableCell className="p-3 text-txt-secondary">{p.fecha_compra}</TableCell>
                  <TableCell className="p-3 text-txt-secondary">@{p.registrado_por_username}</TableCell>
                  <TableCell className="p-3 text-center">
                    <Badge variant={isActiva ? 'success' : 'danger'}>
                      {isActiva ? 'ACTIVA' : 'ANULADA'}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-3 text-right space-x-1.5 whitespace-nowrap">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenDetail(p.id)}
                    >
                      Ver Detalle
                    </Button>

                    {isActiva && isAdmin && (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => setCancelTargetId(p.id)}
                      >
                        Anular
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Modal de Creación */}
      <PurchaseFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={onCreatePurchase}
        suppliers={suppliers}
        products={products}
        isLoading={isActionLoading}
      />

      {/* Modal de Detalle */}
      <PurchaseDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        detail={selectedPurchaseDetail}
        isAdmin={isAdmin}
        onOpenCancelModal={(id) => setCancelTargetId(id)}
      />

      {/* Modal de Anulación */}
      <CancelPurchaseModal
        isOpen={cancelTargetId !== null}
        onClose={() => setCancelTargetId(null)}
        compraId={cancelTargetId}
        onSubmit={onCancelPurchase}
        isLoading={isActionLoading}
      />
    </div>
  );
};
