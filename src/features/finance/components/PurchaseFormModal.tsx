// ============================================================================
// COMPONENTE: MODAL DE NUEVA COMPRA A PROVEEDOR (INGRESO STOCK / KARDEX)
// Constructor de ítems dinámicos, cálculo reactivo de subtotales y total
// Ubicación: src/features/finance/components/PurchaseFormModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { Input } from '../../../components/primitives/Input';
import { Modal } from '../../../components/primitives/Modal';
import {
  PURCHASE_INVOICE_LABELS,
  calculatePurchaseItemsTotal,
  derivePaymentChannel,
  formatCurrency,
  validateSupplierPurchaseInput,
} from '../../../domain/finance';
import { ProductListItem } from '../../../types/catalog';
import { SupplierListItem } from '../../../types/entity';
import {
  CreateSupplierPurchaseDetailDto,
  CreateSupplierPurchaseDto,
  PurchaseInvoiceType,
} from '../../../types/finance';
import { PaymentMethod } from '../../../types/pos';

export interface PurchaseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateSupplierPurchaseDto) => Promise<any>;
  suppliers: SupplierListItem[];
  products: ProductListItem[];
  isLoading?: boolean;
}

interface DraftItem {
  tempId: string;
  producto_id: number;
  cantidad: number;
  costo_unitario: string;
  subtotal: string;
}

export const PurchaseFormModal: React.FC<PurchaseFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  suppliers,
  products,
  isLoading = false,
}) => {
  const [proveedorId, setProveedorId] = useState<number>(suppliers[0]?.id || 0);
  const [tipoComprobante, setTipoComprobante] = useState<PurchaseInvoiceType>('FACTURA');
  const [numeroComprobante, setNumeroComprobante] = useState<string>('');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('TRANSFERENCIA');
  const [notas, setNotas] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);

  // Ítems dinámicos
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  // Ítem en construcción para añadir
  const [selectedProductId, setSelectedProductId] = useState<number>(products[0]?.id || 0);
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemUnitCost, setItemUnitCost] = useState<string>('0.00');

  // Si cambia el producto seleccionado en el mini-formulario, inicializar con su precio referencial si existe
  const handleSelectProductChange = (prodId: number) => {
    setSelectedProductId(prodId);
    const found = products.find((p) => p.id === prodId);
    if (found && found.precio_compra_referencial) {
      setItemUnitCost(found.precio_compra_referencial);
    }
  };

  const handleAddItem = () => {
    if (!selectedProductId || selectedProductId <= 0) {
      setErrors(['Seleccione un producto para añadir al detalle.']);
      return;
    }
    if (itemQty <= 0) {
      setErrors(['La cantidad del producto debe ser mayor a 0.']);
      return;
    }
    const cost = parseFloat(itemUnitCost);
    if (isNaN(cost) || cost < 0) {
      setErrors(['El costo unitario debe ser un valor numérico válido (mayor o igual a 0).']);
      return;
    }

    const { itemsWithSubtotals } = calculatePurchaseItemsTotal([
      { producto_id: selectedProductId, cantidad: itemQty, costo_unitario: itemUnitCost },
    ]);
    const computed = itemsWithSubtotals[0];

    setDraftItems((prev) => [
      ...prev,
      {
        tempId: `${Date.now()}-${Math.random()}`,
        producto_id: selectedProductId,
        cantidad: computed.cantidad,
        costo_unitario: computed.costo_unitario,
        subtotal: computed.subtotal,
      },
    ]);

    setErrors([]);
    setItemQty(1);
  };

  const handleRemoveItem = (tempId: string) => {
    setDraftItems((prev) => prev.filter((it) => it.tempId !== tempId));
  };

  // Cálculo total derivado de los items
  const { totalCompra } = calculatePurchaseItemsTotal(draftItems);
  const canalCaja = derivePaymentChannel(metodoPago);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    const detallesDto: CreateSupplierPurchaseDetailDto[] = draftItems.map((it) => ({
      producto_id: it.producto_id,
      cantidad: it.cantidad,
      costo_unitario: it.costo_unitario,
      subtotal: it.subtotal,
    }));

    const payload: CreateSupplierPurchaseDto = {
      proveedor_id: Number(proveedorId),
      tipo_comprobante: tipoComprobante,
      numero_comprobante: numeroComprobante.trim() || null,
      metodo_pago: metodoPago,
      canal_caja: canalCaja,
      total_compra: totalCompra,
      notas: notas.trim() || null,
      detalles: detallesDto,
    };

    const validation = validateSupplierPurchaseInput(payload);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    try {
      await onSubmit(payload);
      // Reset
      setDraftItems([]);
      setNumeroComprobante('');
      setNotas('');
      onClose();
    } catch (err: any) {
      setErrors([err?.message || 'Error al registrar la compra a proveedor']);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar Nueva Compra a Proveedor"
      description="Ingreso de mercadería al inventario. Afectará Kardex y actualizará el precio referencial."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
        {errors.length > 0 && (
          <Alert variant="danger" title="Errores en la compra" onClose={() => setErrors([])}>
            <ul className="list-disc pl-4 space-y-1">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </Alert>
        )}

        {/* 1. Datos del Proveedor y Comprobante */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-canvas-subtle rounded-lg border border-border">
          <div>
            <label className="font-bold text-txt-primary block mb-1">
              Proveedor: <span className="text-rose-500">*</span>
            </label>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(Number(e.target.value))}
              aria-label="Seleccionar Proveedor"
              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
            >
              <option value={0}>-- Selecciona un Proveedor --</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.tipo_proveedor === 'EMPRESA'
                    ? `[RUC] ${s.nombre_o_razon_social}${s.nombre_comercial ? ` (${s.nombre_comercial})` : ''}`
                    : `[${s.tipo_documento}] ${s.nombre_o_razon_social}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-txt-primary block mb-1">Tipo de Comprobante:</label>
            <select
              value={tipoComprobante}
              onChange={(e) => setTipoComprobante(e.target.value as PurchaseInvoiceType)}
              aria-label="Tipo de Comprobante"
              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
            >
              {(Object.keys(PURCHASE_INVOICE_LABELS) as PurchaseInvoiceType[]).map((type) => (
                <option key={type} value={type}>
                  {PURCHASE_INVOICE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-bold text-txt-primary block mb-1">Número de Comprobante:</label>
            <Input
              value={numeroComprobante}
              onChange={(e) => setNumeroComprobante(e.target.value)}
              placeholder="Ej. F001-000456 o Serie"
            />
          </div>

          <div>
            <label className="font-bold text-txt-primary block mb-1">
              Método de Pago:
              <Badge variant={canalCaja === 'FISICA' ? 'success' : 'info'} className="ml-2">
                Canal {canalCaja}
              </Badge>
            </label>
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as PaymentMethod)}
              aria-label="Método de Pago"
              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
            >
              <option value="EFECTIVO">EFECTIVO (Caja Física)</option>
              <option value="YAPE">YAPE (Digital)</option>
              <option value="PLIN">PLIN (Digital)</option>
              <option value="TRANSFERENCIA">TRANSFERENCIA BANCARIA (Digital)</option>
              <option value="TARJETA">TARJETA POS (Digital)</option>
            </select>
          </div>
        </div>

        {/* 2. Constructor de Ítems de Compra */}
        <div className="p-3 bg-surface rounded-lg border border-border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-txt-primary">Detalle de Productos a Comprar:</span>
            <span className="text-[11px] text-txt-muted">
              {draftItems.length} producto(s) en lista
            </span>
          </div>

          {/* Formulario mini para añadir ítem */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end p-2.5 bg-canvas rounded-lg border border-border">
            <div className="sm:col-span-2">
              <label className="font-semibold text-txt-secondary block mb-1">Producto:</label>
              <select
                value={selectedProductId}
                onChange={(e) => handleSelectProductChange(Number(e.target.value))}
                aria-label="Seleccionar Producto a comprar"
                className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
              >
                <option value={0}>-- Selecciona un Producto --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo_sku} - {p.nombre} (Stock: {p.stock_actual})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-txt-secondary block mb-1">Cantidad:</label>
              <input
                type="number"
                min={1}
                value={itemQty}
                onChange={(e) => setItemQty(parseInt(e.target.value, 10) || 1)}
                aria-label="Cantidad a comprar"
                className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
              />
            </div>

            <div>
              <label className="font-semibold text-txt-secondary block mb-1">Costo Unit. (S/):</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={itemUnitCost}
                onChange={(e) => setItemUnitCost(e.target.value)}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v >= 0) {
                    setItemUnitCost(v.toFixed(2));
                  }
                }}
                aria-label="Costo Unitario"
                className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
              />
            </div>

            <div className="sm:col-span-4 flex justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={handleAddItem}>
                + Añadir al Detalle
              </Button>
            </div>
          </div>

          {/* Tabla de ítems en borrador */}
          {draftItems.length === 0 ? (
            <div className="p-4 text-center text-txt-muted text-xs bg-canvas rounded border border-dashed border-border">
              Aún no has añadido productos a esta compra.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-border rounded">
                <thead className="bg-canvas-subtle text-txt-muted">
                  <tr>
                    <th className="p-2">Producto</th>
                    <th className="p-2 text-right">Cant.</th>
                    <th className="p-2 text-right">Costo Unit.</th>
                    <th className="p-2 text-right">Subtotal</th>
                    <th className="p-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {draftItems.map((item) => {
                    const prod = products.find((p) => p.id === item.producto_id);
                    return (
                      <tr key={item.tempId} className="hover:bg-surface/50">
                        <td className="p-2 text-txt-primary font-medium">
                          {prod ? `${prod.codigo_sku} - ${prod.nombre}` : `Prod #${item.producto_id}`}
                        </td>
                        <td className="p-2 text-right text-txt-primary">{item.cantidad}</td>
                        <td className="p-2 text-right text-txt-primary">S/ {item.costo_unitario}</td>
                        <td className="p-2 text-right font-bold text-txt-primary">S/ {item.subtotal}</td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.tempId)}
                            className="text-rose-500 hover:text-rose-700 font-bold p-1 inline-flex items-center justify-center"
                            title="Quitar ítem"
                            aria-label="Quitar ítem"
                          >
                            <Icon name="x" className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen Total */}
          <div className="flex justify-end items-center gap-3 pt-2 border-t border-border">
            <span className="font-bold text-sm text-txt-primary">Total Compra:</span>
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalCompra)}
            </span>
          </div>
        </div>

        {/* 3. Notas Adicionales */}
        <div>
          <label className="font-bold text-txt-primary block mb-1">Notas u Observaciones (Opcional):</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Detalles de entrega, lote o condiciones del proveedor..."
            rows={2}
            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
          />
        </div>

        {/* Botones de Acción */}
        <div className="flex justify-end items-center gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            disabled={draftItems.length === 0}
          >
            Confirmar y Registrar Compra
          </Button>
        </div>
      </form>
    </Modal>
  );
};
