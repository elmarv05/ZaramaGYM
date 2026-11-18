// ============================================================================
// MODAL: ALTA Y EDICIÓN DE PRODUCTOS DEL INVENTARIO (SLICE 3)
// Regla de Negocio: Prohibido alterar stock físico desde edición de producto.
// Ubicación: src/features/catalog/ProductFormModal.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Button } from '../../components/primitives/Button';
import { Input } from '../../components/primitives/Input';
import { Modal } from '../../components/primitives/Modal';
import { Select } from '../../components/primitives/Select';
import { validateProductForm } from '../../domain/catalog';
import {
  CreateProductInput,
  ProductCategory,
  ProductListItem,
  UpdateProductInput,
} from '../../types/catalog';

export interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: ProductListItem | null;
  onSubmit: (input: CreateProductInput | UpdateProductInput) => Promise<boolean>;
  isLoading?: boolean;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  onSubmit,
  isLoading = false,
}) => {
  const isEditing = Boolean(productToEdit);

  const [sku, setSku] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState<ProductCategory>('BEBIDAS');
  const [unidadMedida, setUnidadMedida] = useState('UNIDAD');
  const [precioCompra, setPrecioCompra] = useState('0.00');
  const [precioVenta, setPrecioVenta] = useState('5.00');
  const [stockInicial, setStockInicial] = useState<number>(0);
  const [stockMinimo, setStockMinimo] = useState<number>(5);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (productToEdit) {
      setSku(productToEdit.codigo_sku);
      setNombre(productToEdit.nombre);
      setCategoria(productToEdit.categoria);
      setUnidadMedida(productToEdit.unidad_medida || 'UNIDAD');
      setPrecioCompra(productToEdit.precio_compra_referencial);
      setPrecioVenta(productToEdit.precio_venta);
      setStockInicial(productToEdit.stock_actual);
      setStockMinimo(productToEdit.stock_minimo);
    } else {
      setSku('');
      setNombre('');
      setCategoria('BEBIDAS');
      setUnidadMedida('UNIDAD');
      setPrecioCompra('0.00');
      setPrecioVenta('5.00');
      setStockInicial(0);
      setStockMinimo(5);
    }
    setErrors({});
  }, [productToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formValues = {
      codigo_sku: isEditing ? productToEdit?.codigo_sku : sku,
      nombre,
      categoria,
      unidad_medida: unidadMedida,
      precio_compra_referencial: precioCompra,
      precio_venta: precioVenta,
      stock_inicial: isEditing ? undefined : Number(stockInicial),
      stock_minimo: Number(stockMinimo),
    };

    const validationErrors = validateProductForm(formValues, isEditing);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    let success = false;
    if (isEditing) {
      const updateData: UpdateProductInput = {
        nombre: formValues.nombre.trim(),
        categoria: formValues.categoria,
        unidad_medida: formValues.unidad_medida,
        precio_compra_referencial: String(formValues.precio_compra_referencial),
        precio_venta: String(formValues.precio_venta),
        stock_minimo: formValues.stock_minimo,
        proveedor_preferido_id: productToEdit?.proveedor_preferido_id ?? null,
      };
      success = await onSubmit(updateData);
    } else {
      const createData: CreateProductInput = {
        codigo_sku: formValues.codigo_sku!.trim().toUpperCase(),
        nombre: formValues.nombre.trim(),
        categoria: formValues.categoria,
        unidad_medida: formValues.unidad_medida,
        precio_compra_referencial: String(formValues.precio_compra_referencial),
        precio_venta: String(formValues.precio_venta),
        stock_inicial: formValues.stock_inicial ?? 0,
        stock_minimo: formValues.stock_minimo,
        proveedor_preferido_id: null,
      };
      success = await onSubmit(createData);
    }

    if (success) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Editar Producto: ${productToEdit?.nombre}` : 'Registrar Nuevo Producto'}
      description="Ingresa datos comerciales y umbrales de alerta de reposición."
      size="md"
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!isEditing && (
          <Input
            label="Código / SKU"
            placeholder="Ej. BEB-AGUA-500, SUP-WHEY-1K"
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            error={errors.codigo_sku}
            required
            hint="Código único alfanumérico para identificación rápida en inventario"
          />
        )}

        <Input
          label="Nombre del Producto"
          placeholder="Ej. Agua Mineral Sin Gas 600ml"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={errors.nombre}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Categoría"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as ProductCategory)}
            error={errors.categoria}
            options={[
              { value: 'BEBIDAS', label: 'Bebidas e Hidratación' },
              { value: 'SUPLEMENTOS', label: 'Suplementos & Proteínas' },
              { value: 'ACCESORIOS', label: 'Accesorios y Guantes' },
              { value: 'SNACKS', label: 'Barras & Snacks' },
              { value: 'OTROS', label: 'Otros Artículos' },
            ]}
            required
          />

          <Select
            label="Unidad de Medida"
            value={unidadMedida}
            onChange={(e) => setUnidadMedida(e.target.value)}
            options={[
              { value: 'UNIDAD', label: 'Unidad (und)' },
              { value: 'BOTELLA', label: 'Botella' },
              { value: 'SCOOP', label: 'Scoop / Porción' },
              { value: 'BARRA', label: 'Barra' },
              { value: 'PAQUETE', label: 'Paquete' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Precio de Compra Referencial"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={precioCompra}
            onChange={(e) => setPrecioCompra(e.target.value)}
            onBlur={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v >= 0) {
                setPrecioCompra(v.toFixed(2));
              }
            }}
            error={errors.precio_compra_referencial}
            leftIcon={<span className="text-xs font-bold text-txt-muted">S/</span>}
            hint="Costo estimado unitario"
          />

          <Input
            label="Precio de Venta al Público"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={precioVenta}
            onChange={(e) => setPrecioVenta(e.target.value)}
            onBlur={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v >= 0) {
                setPrecioVenta(v.toFixed(2));
              }
            }}
            error={errors.precio_venta}
            required
            leftIcon={<span className="text-xs font-bold text-txt-muted">S/</span>}
            hint="Precio final de mostrador"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!isEditing ? (
            <Input
              label="Stock Inicial Físico"
              type="number"
              min="0"
              value={stockInicial}
              onChange={(e) => setStockInicial(parseInt(e.target.value, 10) || 0)}
              error={errors.stock_inicial}
              hint="Genera asiento STOCK_INICIAL en Kardex"
            />
          ) : (
            <div className="flex flex-col gap-1.5 text-left">
              <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider select-none">
                Stock Físico Actual
              </label>
              <div className="bg-canvas-subtle border border-border rounded-md px-3 py-2 text-sm font-bold text-txt-primary">
                {productToEdit?.stock_actual ?? 0} {productToEdit?.unidad_medida || 'UNIDAD'}
              </div>
              <span className="text-[11px] text-txt-muted">
                Para ajustar stock use el botón "Registrar Merma / Ajuste"
              </span>
            </div>
          )}

          <Input
            label="Umbral Stock Mínimo"
            type="number"
            min="0"
            value={stockMinimo}
            onChange={(e) => setStockMinimo(parseInt(e.target.value, 10) || 0)}
            error={errors.stock_minimo}
            required
            hint="Dispara alerta visual en la tabla"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border mt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            {isEditing ? 'Guardar Cambios' : 'Registrar Producto'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
