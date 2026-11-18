// ============================================================================
// COMPONENTE: TABLA DEL CARRITO POS MULTIDOMINIO (CART TABLE)
// Gestión de ítems (Productos, Planes, Amortizaciones), cantidades, descuentos y totales
// Ubicación: src/features/pos/components/CartTable.tsx
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { ConfirmDialog } from '../../../components/primitives/ConfirmDialog';
import { Icon } from '../../../components/primitives/Icon';
import { formatMoney } from '../../../domain/pos';
import { PosSaleItemInput } from '../../../types/pos';

export interface CartTableProps {
  items: PosSaleItemInput[];
  descuento: string;
  subtotal: number;
  totalVenta: number;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onClearCart: () => void;
  onDescuentoChange: (desc: string) => void;
  disabled?: boolean;
}

export const CartTable: React.FC<CartTableProps> = ({
  items,
  descuento,
  subtotal,
  totalVenta,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onDescuentoChange,
  disabled = false,
}) => {
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  if (items.length === 0) {
    return (
      <div
        role="region"
        aria-label="Carrito de Compras"
        className="w-full bg-surface border border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3"
      >
        <div className="w-14 h-14 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted">
          <Icon name="pos" className="w-6 h-6" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-txt-primary">El carrito está vacío</h4>
          <p className="text-xs text-txt-muted mt-0.5">
            Selecciona productos en stock, planes de membresía o cuotas de amortización del catálogo lateral.
          </p>
        </div>
      </div>
    );
  }

  const getItemBadge = (tipo: PosSaleItemInput['tipo_item']) => {
    switch (tipo) {
      case 'PRODUCTO':
        return <Badge variant="info" size="sm">Producto</Badge>;
      case 'PLAN':
        return <Badge variant="success" size="sm">Plan Membresía</Badge>;
      case 'AMORTIZACION_CREDITO':
        return <Badge variant="warning" size="sm">Amortización Deuda</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="w-full bg-surface border border-border rounded-xl overflow-hidden shadow-xs flex flex-col">
      {/* Encabezado del Carrito */}
      <div className="px-4 py-3 bg-canvas-subtle border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-txt-primary text-sm">
            Carrito de Compra ({items.length} {items.length === 1 ? 'ítem' : 'ítems'})
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsClearConfirmOpen(true)}
          disabled={disabled}
          className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-semibold transition-colors disabled:opacity-50"
        >
          Vaciar Carrito
        </button>
      </div>

      {/* Lista de Ítems */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-canvas-subtle/50 text-txt-muted font-bold uppercase tracking-wider border-b border-border text-[11px]">
            <tr>
              <th className="px-4 py-2.5">Ítem / Tipo</th>
              <th className="px-3 py-2.5 text-center">Cant.</th>
              <th className="px-3 py-2.5 text-right">P. Unitario</th>
              <th className="px-4 py-2.5 text-right">Subtotal</th>
              <th className="px-3 py-2.5 text-center w-12">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item, index) => {
              const pu = parseFloat(item.precio_unitario) || 0;
              const sub = parseFloat(item.subtotal) || 0;
              return (
                <tr key={`${item.tipo_item}-${item.producto_id || item.plan_id || item.credito_id}-${index}`} className="hover:bg-canvas-subtle/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        {getItemBadge(item.tipo_item)}
                        <span className="font-semibold text-txt-primary">
                          {item.tipo_item === 'PRODUCTO' && (item as any).descripcion_producto
                            ? (item as any).descripcion_producto
                            : item.tipo_item === 'PLAN'
                            ? (item as any).nombre_plan || 'Plan de Membresía'
                            : item.tipo_item === 'AMORTIZACION_CREDITO'
                            ? `Amortización Crédito #${item.credito_id}`
                            : `Ítem #${index + 1}`}
                        </span>
                      </div>
                      {item.fecha_inicio_plan && (
                        <span className="text-[11px] text-txt-muted">
                          Inicio: {item.fecha_inicio_plan}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Selector Cantidad */}
                  <td className="px-3 py-3 text-center">
                    {item.tipo_item === 'AMORTIZACION_CREDITO' ? (
                      <span className="font-bold text-txt-primary">1</span>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 border border-border rounded-md px-1 py-0.5 bg-surface">
                        <button
                          type="button"
                          disabled={disabled || item.cantidad <= 1}
                          onClick={() => onUpdateQuantity(index, item.cantidad - 1)}
                          className="w-5 h-5 flex items-center justify-center font-bold text-txt-secondary hover:text-txt-primary disabled:opacity-30 rounded"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-bold text-txt-primary">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onUpdateQuantity(index, item.cantidad + 1)}
                          className="w-5 h-5 flex items-center justify-center font-bold text-txt-secondary hover:text-txt-primary disabled:opacity-30 rounded"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-3 text-right text-txt-secondary font-medium">
                    S/ {formatMoney(pu)}
                  </td>

                  <td className="px-4 py-3 text-right font-extrabold text-txt-primary">
                    S/ {formatMoney(sub)}
                  </td>

                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemoveItem(index)}
                      title="Quitar ítem"
                      aria-label="Quitar ítem del carrito"
                      className="text-txt-muted hover:text-status-danger transition-colors p-1 rounded inline-flex items-center justify-center"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer de Totales y Descuento */}
      <div className="p-4 bg-canvas-subtle border-t border-border flex flex-col gap-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-txt-secondary">Subtotal Carrito:</span>
          <span className="font-bold text-txt-primary">S/ {formatMoney(subtotal)}</span>
        </div>

        {/* Campo de Descuento */}
        <div className="flex justify-between items-center text-xs">
          <label htmlFor="cart-discount-input" className="text-txt-secondary flex items-center gap-1">
            Descuento Especial (S/):
          </label>
          <div className="w-28 relative">
            <span className="absolute left-2.5 top-1.5 text-txt-muted text-xs font-bold">S/</span>
            <input
              id="cart-discount-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max={subtotal}
              value={descuento}
              onChange={(e) => onDescuentoChange(e.target.value)}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0) {
                  const clamped = Math.min(v, subtotal);
                  onDescuentoChange(clamped.toFixed(2));
                } else {
                  onDescuentoChange('0.00');
                }
              }}
              disabled={disabled}
              className="w-full text-right text-xs font-bold pl-7 pr-2 py-1 rounded-md border border-border bg-surface text-txt-primary focus:outline-none focus:ring-1 focus:ring-brand"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Total a Pagar */}
        <div className="flex justify-between items-center pt-2 border-t border-border">
          <span className="font-extrabold text-sm text-txt-primary">Total a Pagar:</span>
          <span className="font-black text-lg text-emerald-700 dark:text-emerald-400">
            S/ {formatMoney(totalVenta)}
          </span>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={() => {
          onClearCart();
          setIsClearConfirmOpen(false);
        }}
        variant="warning"
        title="¿Vaciar todo el carrito de compra?"
        description="Se descartarán todos los productos, planes y amortizaciones agregados en la transacción actual."
        confirmText="Sí, vaciar carrito"
        cancelText="Cancelar"
      />
    </div>
  );
};
