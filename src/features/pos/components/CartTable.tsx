// ============================================================================
// COMPONENTE: TABLA DEL CARRITO POS MULTIDOMINIO (CART TABLE)
// Gestión de ítems (Productos, Planes, Amortizaciones), cantidades, descuentos y totales
// Ubicación: src/features/pos/components/CartTable.tsx
// ============================================================================

import React, { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Icon,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/primitives';
import { formatMoney } from '../../../domain/pos';
import { PosSaleItemInput } from '../../../types/pos';
import {
  formatDecimalOnBlur,
  sanitizeDecimalInput,
  selectIfZeroDefault,
} from '../../../utils/formSafety';

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
      <Card
        role="region"
        aria-label="Carrito de Compras"
        className="w-full border-dashed p-8 items-center justify-center text-center gap-3"
      >
        <div
          aria-hidden="true"
          className="w-14 h-14 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted"
        >
          <Icon name="pos" className="w-6 h-6" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-txt-primary">El carrito está vacío</h4>
          <p className="text-xs text-txt-muted mt-0.5">
            Selecciona productos en stock, planes de membresía o cuotas de amortización del catálogo lateral.
          </p>
        </div>
      </Card>
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
    <Card className="w-full overflow-hidden">
      {/* Encabezado del Carrito */}
      <div className="px-4 py-3 bg-canvas-subtle border-b border-border flex items-center justify-between">
        <span className="font-bold text-txt-primary text-sm">
          Carrito de Compra ({items.length} {items.length === 1 ? 'ítem' : 'ítems'})
        </span>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setIsClearConfirmOpen(true)}
          disabled={disabled}
          className="text-xs text-status-danger font-semibold"
        >
          Vaciar Carrito
        </Button>
      </div>

      {/* Lista de Ítems */}
      <Table
        containerLabel="Ítems del carrito de compra"
        containerClassName="rounded-none border-0"
        className="text-xs"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4 py-2.5 text-[11px]">Ítem / Tipo</TableHead>
            <TableHead className="px-3 py-2.5 text-center text-[11px]">Cant.</TableHead>
            <TableHead className="px-3 py-2.5 text-right text-[11px]">P. Unitario</TableHead>
            <TableHead className="px-4 py-2.5 text-right text-[11px]">Subtotal</TableHead>
            <TableHead className="px-3 py-2.5 text-center w-12 text-[11px]">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const pu = parseFloat(item.precio_unitario) || 0;
            const sub = parseFloat(item.subtotal) || 0;
            return (
              <TableRow key={`${item.tipo_item}-${item.producto_id || item.plan_id || item.credito_id}-${index}`}>
                <TableCell className="px-4 py-3">
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
                </TableCell>

                {/* Selector Cantidad */}
                <TableCell className="px-3 py-3 text-center">
                  {item.tipo_item === 'AMORTIZACION_CREDITO' ? (
                    <span className="font-bold text-txt-primary">1</span>
                  ) : (
                    <div className="inline-flex items-center gap-1 border border-border rounded-md px-1 py-0.5 bg-surface">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled || item.cantidad <= 1}
                        onClick={() => onUpdateQuantity(index, item.cantidad - 1)}
                        aria-label="Disminuir cantidad"
                        className="min-h-[24px] min-w-[24px] h-6 w-6 p-0 font-bold"
                      >
                        -
                      </Button>
                      <span className="w-6 text-center font-bold text-txt-primary">
                        {item.cantidad}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        onClick={() => onUpdateQuantity(index, item.cantidad + 1)}
                        aria-label="Aumentar cantidad"
                        className="min-h-[24px] min-w-[24px] h-6 w-6 p-0 font-bold"
                      >
                        +
                      </Button>
                    </div>
                  )}
                </TableCell>

                <TableCell className="px-3 py-3 text-right text-txt-secondary font-medium">
                  S/ {formatMoney(pu)}
                </TableCell>

                <TableCell className="px-4 py-3 text-right font-extrabold">
                  S/ {formatMoney(sub)}
                </TableCell>

                <TableCell className="px-3 py-3 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    onClick={() => onRemoveItem(index)}
                    title="Quitar ítem"
                    aria-label="Quitar ítem del carrito"
                    className="min-h-[28px] min-w-[28px] p-1 text-txt-muted hover:text-status-danger"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Footer de Totales y Descuento */}
      <div className="p-4 bg-canvas-subtle border-t border-border flex flex-col gap-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-txt-secondary">Subtotal Carrito:</span>
          <span className="font-bold text-txt-primary">S/ {formatMoney(subtotal)}</span>
        </div>

        {/* Campo de Descuento */}
        <div className="flex justify-between items-center text-xs gap-2">
          <label htmlFor="cart-discount-input" className="text-txt-secondary flex items-center gap-1">
            Descuento Especial (S/):
          </label>
          <div className="w-28">
            <Input
              id="cart-discount-input"
              type="text"
              inputSize="sm"
              inputMode="decimal"
              value={descuento}
              onFocus={selectIfZeroDefault}
              onChange={(e) => onDescuentoChange(sanitizeDecimalInput(e.target.value))}
              onBlur={(e) => {
                onDescuentoChange(
                  formatDecimalOnBlur(e.target.value, {
                    min: 0,
                    max: subtotal,
                    fallback: '0.00',
                  })
                );
              }}
              disabled={disabled}
              leftIcon={<span className="text-xs font-bold">S/</span>}
              className="text-right font-bold py-1 pl-7 pr-2"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Total a Pagar */}
        <div className="flex justify-between items-center pt-2 border-t border-border">
          <span className="font-extrabold text-sm text-txt-primary">Total a Pagar:</span>
          <span className="font-black text-lg text-status-success">
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
    </Card>
  );
};
