// ============================================================================
// COMPONENTE: TAB DE COMPRAS A PROVEEDORES (HISTORIAL Y KARDEX)
// Listado filtrable, modal de creación, modal de detalle y anulación controlada
// Ubicación: src/features/finance/components/SupplierPurchasesTab.tsx
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
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
      <div className="flex flex-col gap-4 animate-pulse" role="status" aria-label="Cargando compras a proveedores">
        <div className="h-12 bg-surface rounded-xl border border-border" />
        <div className="h-64 bg-surface rounded-xl border border-border" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Acciones y Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-surface rounded-xl border border-border shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro Canal */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-txt-muted font-medium">Canal:</span>
            <select
              value={canalFilter}
              onChange={(e) => handleApplyFilter(e.target.value, estadoFilter)}
              aria-label="Filtrar por Canal"
              className="px-2 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs outline-none"
            >
              <option value="TODOS">Todos los Canales</option>
              <option value="FISICA">Caja Física (Efectivo)</option>
              <option value="DIGITAL">Caja Digital</option>
            </select>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-txt-muted font-medium">Estado:</span>
            <select
              value={estadoFilter}
              onChange={(e) => handleApplyFilter(canalFilter, e.target.value)}
              aria-label="Filtrar por Estado"
              className="px-2 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs outline-none"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="1">Activas (En Kardex)</option>
              <option value="0">Anuladas (Revertidas)</option>
            </select>
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
      </div>

      {/* 2. Empty State */}
      {purchases.length === 0 ? (
        <div className="p-10 text-center bg-surface rounded-xl border border-border flex flex-col items-center justify-center gap-3">
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
        </div>
      ) : (
        /* 3. Data State: Tabla de Compras */
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas-subtle text-txt-muted border-b border-border">
                <tr>
                  <th className="p-3"># ID</th>
                  <th className="p-3">Proveedor</th>
                  <th className="p-3">Comprobante</th>
                  <th className="p-3">Método / Canal</th>
                  <th className="p-3 text-right">Total Compra</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Registrado Por</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {purchases.map((p) => {
                  const isActiva = p.estado_activo === 1;
                  return (
                    <tr key={p.id} className="hover:bg-canvas/50 transition-colors">
                      <td className="p-3 font-mono font-bold text-txt-primary">#{p.id}</td>
                      <td className="p-3">
                        <span className="font-bold text-txt-primary block">{p.proveedor_nombre}</span>
                        <span className="text-[11px] text-txt-muted">{p.proveedor_documento}</span>
                      </td>
                      <td className="p-3">
                        <span className="font-medium text-txt-primary">
                          {PURCHASE_INVOICE_LABELS[p.tipo_comprobante] || p.tipo_comprobante}
                        </span>
                        {p.numero_comprobante && (
                          <span className="text-[11px] text-txt-muted block font-mono">
                            {p.numero_comprobante}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-txt-primary block">{p.metodo_pago}</span>
                        <Badge variant={p.canal_caja === 'FISICA' ? 'success' : 'info'} size="sm">
                          {p.canal_caja}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-black text-sm text-txt-primary">
                        {formatCurrency(p.total_compra)}
                      </td>
                      <td className="p-3 text-txt-secondary">{p.fecha_compra}</td>
                      <td className="p-3 text-txt-secondary">@{p.registrado_por_username}</td>
                      <td className="p-3 text-center">
                        <Badge variant={isActiva ? 'success' : 'danger'}>
                          {isActiva ? 'ACTIVA' : 'ANULADA'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
