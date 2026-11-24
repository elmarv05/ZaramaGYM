// ============================================================================
// MODAL: REGISTRO DE MERMAS, AJUSTES Y CONSUMO PROPIO (SLICE 3)
// Invarianza matemática de stock >= 0 y justificación obligatoria >= 5 caracteres.
// Ubicación: src/features/catalog/InventoryMovementModal.tsx
// ============================================================================

import React, { useEffect, useId, useState } from 'react';
import { Alert } from '../../components/primitives/Alert';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';
import { Label } from '../../components/primitives/Label';
import { Modal } from '../../components/primitives/Modal';
import { Select } from '../../components/primitives/Select';
import { Textarea } from '../../components/primitives/Textarea';
import { validateInventoryMovementForm } from '../../domain/catalog';
import {
  ProductListItem,
  RecordInventoryMovementInput,
} from '../../types/catalog';
import {
  preventEnterKeySubmit,
  sanitizeIntegerInput,
  selectIfZeroDefault,
} from '../../utils/formSafety';

export interface InventoryMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductListItem[];
  selectedProduct?: ProductListItem | null;
  onSubmit: (input: RecordInventoryMovementInput) => Promise<boolean>;
  isLoading?: boolean;
}

export const InventoryMovementModal: React.FC<InventoryMovementModalProps> = ({
  isOpen,
  onClose,
  products,
  selectedProduct,
  onSubmit,
  isLoading = false,
}) => {
  const justificacionId = useId();
  const [productId, setProductId] = useState<number>(0);
  const [tipoMovimiento, setTipoMovimiento] = useState<
    'MERMA_DANIO' | 'MERMA_VENCIMIENTO' | 'CONSUMO_PROPIO' | 'ENTRADA_AJUSTE'
  >('MERMA_DANIO');
  const [cantidadStr, setCantidadStr] = useState<string>('1');
  const [justificacion, setJustificacion] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedProduct) {
      setProductId(selectedProduct.id);
    } else if (products.length > 0 && productId === 0) {
      setProductId(products[0].id);
    }
  }, [selectedProduct, products, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setCantidadStr('1');
      setJustificacion('');
      setErrors({});
    }
  }, [isOpen]);

  const activeProduct =
    products.find((p) => p.id === productId) || selectedProduct || null;

  const currentStock = activeProduct ? activeProduct.stock_actual : 0;
  const parsedCantidad = parseInt(cantidadStr, 10);
  const cantidad = isNaN(parsedCantidad) ? 0 : parsedCantidad;
  const isSalida = ['MERMA_DANIO', 'MERMA_VENCIMIENTO', 'CONSUMO_PROPIO'].includes(
    tipoMovimiento
  );
  const delta = isSalida ? -cantidad : +cantidad;
  const resultingStock = currentStock + delta;
  const isStockNegativo = isSalida && resultingStock < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formValues = {
      producto_id: productId,
      tipo_movimiento: tipoMovimiento,
      cantidad: Number(cantidad),
      costo_unitario_momento: activeProduct?.precio_compra_referencial,
      motivo_justificacion: justificacion,
    };

    const validationErrors = validateInventoryMovementForm(formValues, currentStock);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const success = await onSubmit({
      producto_id: formValues.producto_id,
      tipo_movimiento: formValues.tipo_movimiento,
      cantidad: formValues.cantidad,
      costo_unitario_momento: formValues.costo_unitario_momento,
      motivo_justificacion: formValues.motivo_justificacion.trim(),
    });

    if (success) {
      onClose();
    }
  };

  const productOptions = products.map((p) => ({
    value: String(p.id),
    label: `${p.nombre} (SKU: ${p.codigo_sku} — Stock: ${p.stock_actual})`,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar Movimiento en Kardex / Merma"
      description="Asienta ajustes de inventario físico, pérdidas por daño/vencimiento o consumo interno."
      size="md"
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        onKeyDown={preventEnterKeySubmit}
        className="flex flex-col gap-4"
      >
        {selectedProduct ? (
          <div className="bg-canvas-subtle p-3 rounded-lg border border-border flex flex-col gap-1">
            <span className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">
              Producto Seleccionado
            </span>
            <div className="flex items-center justify-between">
              <span className="font-bold text-txt-primary text-sm">
                {selectedProduct.nombre}
              </span>
              <span className="font-mono text-xs text-txt-muted">
                SKU: {selectedProduct.codigo_sku}
              </span>
            </div>
          </div>
        ) : (
          <Select
            label="Producto a Ajustar"
            value={String(productId)}
            onChange={(e) => setProductId(parseInt(e.target.value, 10))}
            options={productOptions}
            error={errors.producto_id}
            required
          />
        )}

        <Select
          label="Tipo de Movimiento"
          value={tipoMovimiento}
          onChange={(e) => setTipoMovimiento(e.target.value as any)}
          options={[
            { value: 'MERMA_DANIO', label: 'Merma por Daño o Rotura (-)' },
            { value: 'MERMA_VENCIMIENTO', label: 'Merma por Vencimiento / Caducidad (-)' },
            { value: 'CONSUMO_PROPIO', label: 'Consumo Propio / Cortesía (-)' },
            { value: 'ENTRADA_AJUSTE', label: 'Entrada por Ajuste de Inventario (+)' },
          ]}
          required
        />

        <Input
          label="Cantidad de Unidades"
          type="text"
          inputMode="numeric"
          value={cantidadStr}
          onFocus={selectIfZeroDefault}
          onChange={(e) => setCantidadStr(sanitizeIntegerInput(e.target.value))}
          error={errors.cantidad}
          required
          hint="Número entero positivo mayor a cero"
        />

        {/* Simulador visual de transición de stock */}
        <div
          className={`p-3 rounded-lg border flex items-center justify-between ${
            isStockNegativo
              ? 'bg-status-danger-bg border-status-danger-border'
              : 'bg-canvas-subtle border-border'
          }`}
        >
          <div className="flex flex-col">
            <span className="text-xs text-txt-secondary">Transición en Kardex:</span>
            <div className="flex items-center gap-2 text-sm font-semibold mt-0.5">
              <span className="text-txt-primary">Stock Actual: {currentStock}</span>
              <span className={isSalida ? 'text-status-danger font-bold' : 'text-status-success font-bold'}>
                {isSalida ? `-${cantidad}` : `+${cantidad}`}
              </span>
              <Icon name="arrow-right" className="w-4 h-4 text-txt-muted" aria-hidden="true" />
              <span
                className={`font-bold ${
                  isStockNegativo ? 'text-status-danger' : 'text-txt-primary'
                }`}
              >
                Resultante: {resultingStock}
              </span>
            </div>
          </div>
          {isStockNegativo && (
            <Badge variant="danger" size="sm" className="uppercase tracking-wider font-bold">
              Stock Negativo
            </Badge>
          )}
        </div>

        {isStockNegativo && (
          <Alert variant="danger">
            No se puede registrar una merma o salida que supere el stock actual en existencia.
          </Alert>
        )}

        <div className="flex flex-col gap-1.5 text-left">
          <div className="flex items-center justify-between">
            <Label htmlFor={justificacionId} required>
              Motivo o Justificación Obligatoria
            </Label>
            <span
              className={`text-[11px] font-mono ${
                justificacion.trim().length >= 5 ? 'text-txt-muted' : 'text-status-danger font-bold'
              }`}
            >
              {justificacion.trim().length}/5 mín.
            </span>
          </div>
          <Textarea
            id={justificacionId}
            rows={2}
            placeholder="Describe detalladamente la causa de la merma, rotura o consumo..."
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            error={errors.motivo_justificacion}
            required
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border mt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            disabled={isStockNegativo || isLoading}
          >
            Asentar Movimiento
          </Button>
        </div>
      </form>
    </Modal>
  );
};
