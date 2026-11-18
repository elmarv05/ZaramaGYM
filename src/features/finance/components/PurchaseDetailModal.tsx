// ============================================================================
// COMPONENTE: MODAL DE DETALLE DE COMPRA A PROVEEDOR
// Inspección de cabecera, items adquiridos y trazabilidad de anulación
// Ubicación: src/features/finance/components/PurchaseDetailModal.tsx
// ============================================================================

import React from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Icon } from '../../../components/primitives/Icon';
import { Modal } from '../../../components/primitives/Modal';
import { PURCHASE_INVOICE_LABELS, formatCurrency } from '../../../domain/finance';
import { SupplierPurchaseDetailDto } from '../../../types/finance';

export interface PurchaseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  detail: SupplierPurchaseDetailDto | null;
  onOpenCancelModal?: (compraId: number) => void;
  isAdmin?: boolean;
}

export const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = ({
  isOpen,
  onClose,
  detail,
  onOpenCancelModal,
  isAdmin = false,
}) => {
  if (!detail) return null;

  const { purchase, items, notas, anulado_por_username } = detail;
  const isActiva = purchase.estado_activo === 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Detalle de Compra #${purchase.id}`}
      description="Consulta auditada de adquisición de mercadería e insumos de inventario."
      size="lg"
    >
      <div className="flex flex-col gap-4 text-xs">
        {/* Banner de Estado Anulado si aplica */}
        {!isActiva && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-900 rounded-lg text-rose-800 dark:text-rose-300">
            <div className="flex items-center gap-2 font-bold mb-1">
              <Icon name="warning" className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>COMPRA ANULADA EN KARDEX</span>
            </div>
            <p className="text-[11px]">
              Anulado por: <strong>{anulado_por_username || 'Administrador'}</strong> el{' '}
              {purchase.fecha_anulacion || 'Fecha no registrada'}.
            </p>
            {purchase.motivo_anulacion && (
              <p className="text-[11px] mt-1 italic">
                Motivo: &quot;{purchase.motivo_anulacion}&quot;
              </p>
            )}
          </div>
        )}

        {/* Resumen Cabecera */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-canvas rounded-lg border border-border">
          <div>
            <span className="text-txt-muted block">Proveedor:</span>
            <span className="font-bold text-txt-primary">
              {purchase.proveedor_nombre} ({purchase.proveedor_documento})
            </span>
          </div>

          <div>
            <span className="text-txt-muted block">Comprobante:</span>
            <span className="font-bold text-txt-primary">
              {PURCHASE_INVOICE_LABELS[purchase.tipo_comprobante] || purchase.tipo_comprobante}
              {purchase.numero_comprobante ? ` - ${purchase.numero_comprobante}` : ' (S/N)'}
            </span>
          </div>

          <div>
            <span className="text-txt-muted block">Método y Canal:</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-semibold text-txt-primary">{purchase.metodo_pago}</span>
              <Badge variant={purchase.canal_caja === 'FISICA' ? 'success' : 'info'}>
                Canal {purchase.canal_caja}
              </Badge>
            </div>
          </div>

          <div>
            <span className="text-txt-muted block">Fecha y Operador:</span>
            <span className="text-txt-primary">
              {purchase.fecha_compra} (por @{purchase.registrado_por_username})
            </span>
          </div>
        </div>

        {/* Tabla de Productos Comprados */}
        <div className="flex flex-col gap-2">
          <span className="font-bold text-txt-primary">Líneas de Detalle ({items.length} productos):</span>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas-subtle text-txt-muted">
                <tr>
                  <th className="p-2">SKU</th>
                  <th className="p-2">Producto</th>
                  <th className="p-2 text-right">Cantidad</th>
                  <th className="p-2 text-right">Costo Unitario</th>
                  <th className="p-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-surface/50">
                    <td className="p-2 font-mono text-txt-muted">{it.producto_sku}</td>
                    <td className="p-2 font-medium text-txt-primary">{it.producto_nombre}</td>
                    <td className="p-2 text-right font-bold text-txt-primary">{it.cantidad}</td>
                    <td className="p-2 text-right text-txt-primary">S/ {it.costo_unitario}</td>
                    <td className="p-2 text-right font-bold text-txt-primary">S/ {it.subtotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Total General */}
        <div className="flex justify-between items-center p-3 bg-canvas-subtle rounded-lg border border-border">
          <span className="font-bold text-sm text-txt-primary">Total Liquidado de Compra:</span>
          <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
            {formatCurrency(purchase.total_compra)}
          </span>
        </div>

        {/* Notas adicionales */}
        {notas && (
          <div className="p-2.5 bg-canvas rounded border border-border text-txt-secondary">
            <span className="font-semibold block text-txt-primary mb-0.5">Notas:</span>
            <p>{notas}</p>
          </div>
        )}

        {/* Botones de Pie */}
        <div className="flex justify-between items-center pt-2 border-t border-border">
          <div>
            {isActiva && isAdmin && onOpenCancelModal && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenCancelModal(purchase.id);
                }}
              >
                Anular Compra (Revertir Stock)
              </Button>
            )}
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cerrar Detalle
          </Button>
        </div>
      </div>
    </Modal>
  );
};
