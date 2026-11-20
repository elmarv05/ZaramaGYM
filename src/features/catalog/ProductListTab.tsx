// ============================================================================
// PESTAÑA: INVENTARIO DE PRODUCTOS, ALERTAS DE STOCK BAJO Y MERMAS (SLICE 3)
// 4 Estados: Loading, Empty, Error, Success. Soporta RBAC (Lectura/Edición).
// Ubicación: src/features/catalog/ProductListTab.tsx
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
  canCreateOrEditProducts,
  canDeactivateProducts,
  canRecordInventoryMovement,
  formatPEN,
  formatProductCategory,
} from '../../domain/catalog';
import {
  CreateProductInput,
  ProductListItem,
  RecordInventoryMovementInput,
  UpdateProductInput,
} from '../../types/catalog';
import { InventoryMovementModal } from './InventoryMovementModal';
import { ProductFormModal } from './ProductFormModal';

export interface ProductListTabProps {
  products: ProductListItem[];
  isLoading: boolean;
  isActionLoading: boolean;
  userRole?: string | null;
  onRefresh?: () => void;
  onCreateProduct?: (input: CreateProductInput) => Promise<ProductListItem | null>;
  onUpdateProduct?: (productId: number, input: UpdateProductInput) => Promise<ProductListItem | null>;
  onToggleProductActive?: (productId: number, currentActive: boolean) => Promise<boolean>;
  onRecordMovement?: (input: RecordInventoryMovementInput) => Promise<any>;
}

export const ProductListTab: React.FC<ProductListTabProps> = ({
  products,
  isLoading,
  isActionLoading,
  userRole,
  onRefresh,
  onCreateProduct,
  onUpdateProduct,
  onToggleProductActive,
  onRecordMovement,
}) => {
  const canEditOrCreate = canCreateOrEditProducts(userRole);
  const canDeactivate = canDeactivateProducts(userRole);
  const canAdjustKardex = canRecordInventoryMovement(userRole);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductListItem | null>(null);

  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementProduct, setMovementProduct] = useState<ProductListItem | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TODAS');
  const [soloActivos, setSoloActivos] = useState(false);
  const [soloStockBajo, setSoloStockBajo] = useState(false);

  // Cantidad de productos con alerta de stock bajo
  const lowStockCount = products.filter(
    (p) => p.alerta_stock_bajo || p.stock_actual <= p.stock_minimo
  ).length;

  // Filtrado de productos
  const filteredProducts = products.filter((prod) => {
    if (soloActivos && !prod.estado_activo) return false;
    if (soloStockBajo && !(prod.alerta_stock_bajo || prod.stock_actual <= prod.stock_minimo)) {
      return false;
    }
    if (selectedCategory !== 'TODAS' && prod.categoria !== selectedCategory) {
      return false;
    }
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      prod.nombre.toLowerCase().includes(term) ||
      prod.codigo_sku.toLowerCase().includes(term) ||
      (prod.proveedor_nombre && prod.proveedor_nombre.toLowerCase().includes(term))
    );
  });

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Barra de Filtros y Alertas */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-surface p-3.5 rounded-xl border border-border">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="w-full sm:w-64">
            <Input
              placeholder="Buscar por SKU o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar productos"
              leftIcon={
                <svg className="w-4 h-4 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          </div>

          <div className="w-full sm:w-48">
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={[
                { value: 'TODAS', label: 'Todas las categorías' },
                { value: 'BEBIDAS', label: 'Bebidas' },
                { value: 'SUPLEMENTOS', label: 'Suplementos' },
                { value: 'ACCESORIOS', label: 'Accesorios' },
                { value: 'SNACKS', label: 'Snacks' },
                { value: 'OTROS', label: 'Otros' },
              ]}
              aria-label="Filtrar por categoría"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Switch rápido de Stock Bajo */}
          <button
            type="button"
            onClick={() => setSoloStockBajo((prev) => !prev)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
              soloStockBajo
                ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700 shadow-xs'
                : 'bg-canvas-subtle text-txt-secondary border-border hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Icon name="warning" className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Solo Stock Bajo</span>
            {lowStockCount > 0 && (
              <span className="bg-amber-500 text-white font-mono px-1.5 py-0.2 rounded-full text-[10px]">
                {lowStockCount}
              </span>
            )}
          </button>

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

          {canEditOrCreate && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingProduct(null);
                setIsProductModalOpen(true);
              }}
              disabled={isActionLoading}
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Nuevo Producto
            </Button>
          )}
        </div>
      </div>

      {/* Tabla de Productos */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Precio Venta</TableHead>
            <TableHead>Costo Ref.</TableHead>
            <TableHead>Stock Actual / Mínimo</TableHead>
            <TableHead>Alerta Stock</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <TableLoadingSkeleton colSpan={9} rows={4} />
          ) : filteredProducts.length === 0 ? (
            <TableEmptyState
              colSpan={9}
              title={
                searchTerm || soloStockBajo
                  ? 'No hay productos con los filtros seleccionados'
                  : 'No hay productos en inventario'
              }
              description={
                searchTerm || soloStockBajo
                  ? 'Intenta con otro término o desmarca el filtro de stock bajo.'
                  : 'Registra los suplementos, bebidas y accesorios que comercializa el gimnasio.'
              }
              action={
                canEditOrCreate ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setEditingProduct(null);
                      setIsProductModalOpen(true);
                    }}
                  >
                    Nuevo Producto
                  </Button>
                ) : undefined
              }
            />
          ) : (
            filteredProducts.map((prod) => {
              const isLowStock =
                prod.alerta_stock_bajo || prod.stock_actual <= prod.stock_minimo;
              const isSinStock = prod.stock_actual === 0;

              return (
                <TableRow key={prod.id}>
                  <TableCell className="font-mono text-xs font-bold text-txt-secondary">
                    {prod.codigo_sku}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-txt-primary">{prod.nombre}</span>
                      <span className="text-[11px] text-txt-muted">
                        Unidad: {prod.unidad_medida || 'UNIDAD'}
                        {prod.proveedor_nombre ? ` • Prov: ${prod.proveedor_nombre}` : ''}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs font-medium text-txt-primary">
                      {formatProductCategory(prod.categoria)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs font-bold text-txt-primary font-mono bg-canvas-subtle px-2 py-0.5 rounded border border-border">
                      {formatPEN(prod.precio_venta)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-txt-muted font-mono">
                      {formatPEN(prod.precio_compra_referencial)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span
                        className={`font-bold ${
                          isSinStock
                            ? 'text-status-danger'
                            : isLowStock
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-txt-primary'
                        }`}
                      >
                        {prod.stock_actual}
                      </span>
                      <span className="text-txt-muted">/</span>
                      <span className="text-txt-muted" title="Stock mínimo">
                        {prod.stock_minimo}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    {isSinStock ? (
                      <Badge variant="danger" size="sm">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-status-danger" aria-hidden="true" />
                          <span>Sin Stock</span>
                        </span>
                      </Badge>
                    ) : isLowStock ? (
                      <Badge variant="warning" size="sm">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="warning" className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Stock Bajo</span>
                        </span>
                      </Badge>
                    ) : (
                      <Badge variant="success" size="sm">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="check" className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Normal</span>
                        </span>
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell>
                    <Badge variant={prod.estado_activo ? 'success' : 'danger'} size="sm">
                      {prod.estado_activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {canAdjustKardex && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setMovementProduct(prod);
                            setIsMovementModalOpen(true);
                          }}
                          className="text-xs"
                        >
                          Merma / Ajuste
                        </Button>
                      )}

                      {canEditOrCreate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingProduct(prod);
                            setIsProductModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                      )}

                      {canDeactivate && onToggleProductActive && (
                        <Button
                          variant={prod.estado_activo ? 'outline' : 'secondary'}
                          size="sm"
                          disabled={isActionLoading}
                          onClick={() => onToggleProductActive(prod.id, prod.estado_activo)}
                          className={
                            prod.estado_activo
                              ? 'text-status-danger border-red-300'
                              : 'text-status-success border-emerald-300'
                          }
                        >
                          {prod.estado_activo ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Modal de Producto */}
      {canEditOrCreate && (
        <ProductFormModal
          isOpen={isProductModalOpen}
          onClose={() => {
            setIsProductModalOpen(false);
            setEditingProduct(null);
          }}
          productToEdit={editingProduct}
          isLoading={isActionLoading}
          onSubmit={async (input) => {
            if (editingProduct && onUpdateProduct) {
              const res = await onUpdateProduct(editingProduct.id, input as UpdateProductInput);
              return Boolean(res);
            } else if (onCreateProduct) {
              const res = await onCreateProduct(input as CreateProductInput);
              return Boolean(res);
            }
            return false;
          }}
        />
      )}

      {/* Modal de Movimiento de Inventario / Merma */}
      {canAdjustKardex && (
        <InventoryMovementModal
          isOpen={isMovementModalOpen}
          onClose={() => {
            setIsMovementModalOpen(false);
            setMovementProduct(null);
          }}
          products={products}
          selectedProduct={movementProduct}
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
