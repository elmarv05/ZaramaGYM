// ============================================================================
// COMPONENTE: MODAL DE GASTO OPERATIVO (CREACIÓN Y EDICIÓN - ADMIN)
// Categorías contables, derivación automática de canal y comprobante de referencia
// Ubicación: src/features/finance/components/ExpenseFormModal.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Input } from '../../../components/primitives/Input';
import { Modal } from '../../../components/primitives/Modal';
import {
  EXPENSE_CATEGORY_LABELS,
  derivePaymentChannel,
  validateExpenseInput,
} from '../../../domain/finance';
import {
  CreateExpenseDto,
  ExpenseCategory,
  OperationalExpenseDto,
  UpdateExpenseDto,
} from '../../../types/finance';
import { PaymentMethod } from '../../../types/pos';
import {
  formatDecimalOnBlur,
  preventEnterKeySubmit,
  roundMonetary,
  sanitizeDecimalInput,
  selectIfZeroDefault,
} from '../../../utils/formSafety';

export interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateExpenseDto | UpdateExpenseDto) => Promise<any>;
  initialData?: OperationalExpenseDto | null;
  isLoading?: boolean;
}

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
}) => {
  const isEditing = Boolean(initialData);

  const [categoria, setCategoria] = useState<ExpenseCategory>('SERVICIOS_BASICOS');
  const [descripcion, setDescripcion] = useState<string>('');
  const [monto, setMonto] = useState<string>('');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('EFECTIVO');
  const [comprobanteReferencia, setComprobanteReferencia] = useState<string>('');
  const [fechaGasto, setFechaGasto] = useState<string>('');
  const [notas, setNotas] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (initialData) {
      setCategoria(initialData.categoria);
      setDescripcion(initialData.descripcion);
      setMonto(initialData.monto);
      setMetodoPago(initialData.metodo_pago);
      setComprobanteReferencia(initialData.comprobante_referencia || '');
      setFechaGasto(initialData.fecha_gasto?.slice(0, 10) || '');
      setNotas(initialData.notas || '');
    } else {
      setCategoria('SERVICIOS_BASICOS');
      setDescripcion('');
      setMonto('');
      setMetodoPago('EFECTIVO');
      setComprobanteReferencia('');
      setFechaGasto('');
      setNotas('');
    }
    setErrors([]);
  }, [initialData, isOpen]);

  const canalCaja = derivePaymentChannel(metodoPago);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    const parsedMonto = parseFloat(monto);
    const payload: CreateExpenseDto = {
      categoria,
      descripcion: descripcion.trim(),
      monto: monto.trim() && !isNaN(parsedMonto) ? roundMonetary(parsedMonto).toFixed(2) : '',
      metodo_pago: metodoPago,
      canal_caja: canalCaja,
      comprobante_referencia: comprobanteReferencia.trim() || null,
      fecha_gasto: fechaGasto.trim() || null,
      notas: notas.trim() || null,
    };

    const validation = validateExpenseInput(payload);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setErrors([err?.message || 'Error al guardar el gasto operativo']);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Editar Gasto Operativo #${initialData?.id}` : 'Registrar Gasto Operativo'}
      description="Egresos operacionales administrativos del gimnasio (exclusivo Administrador)."
      size="md"
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        onKeyDown={preventEnterKeySubmit}
        className="flex flex-col gap-3.5 text-xs"
      >
        {errors.length > 0 && (
          <Alert variant="danger" title="Error en el formulario" onClose={() => setErrors([])}>
            <ul className="list-disc pl-4 space-y-1">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div>
          <label className="font-bold text-txt-primary block mb-1">
            Categoría del Gasto: <span className="text-rose-500">*</span>
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as ExpenseCategory)}
            aria-label="Categoría del Gasto"
            required
            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
          >
            {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {EXPENSE_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-bold text-txt-primary block mb-1">
            Descripción: <span className="text-rose-500">*</span>
          </label>
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej. Recibo de luz mes de octubre / Compra de jabón y desinfectante..."
            aria-label="Descripción del gasto"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-txt-primary block mb-1">
              Monto (S/): <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={monto}
              onFocus={selectIfZeroDefault}
              onChange={(e) => setMonto(sanitizeDecimalInput(e.target.value))}
              onBlur={(e) => {
                setMonto(formatDecimalOnBlur(e.target.value, { min: 0.01, fallback: '' }));
              }}
              placeholder="0.00"
              aria-label="Monto del gasto"
              required
              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
            />
          </div>

          <div>
            <label className="font-bold text-txt-primary block mb-1">
              Método de Pago: <span className="text-rose-500">*</span>
              <Badge variant={canalCaja === 'FISICA' ? 'success' : 'info'} className="ml-1.5">
                {canalCaja}
              </Badge>
            </label>
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as PaymentMethod)}
              aria-label="Método de pago del gasto"
              required
              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-surface text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
            >
              <option value="EFECTIVO">EFECTIVO (Caja Física)</option>
              <option value="YAPE">YAPE (Digital)</option>
              <option value="PLIN">PLIN (Digital)</option>
              <option value="TRANSFERENCIA">TRANSFERENCIA (Digital)</option>
              <option value="TARJETA">TARJETA POS (Digital)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-txt-primary block mb-1">
              Comprobante / N° Operación (Opcional):
            </label>
            <Input
              value={comprobanteReferencia}
              onChange={(e) => setComprobanteReferencia(e.target.value)}
              placeholder="Ej. Recibo 01248 / Op 884729"
            />
          </div>

          <div>
            <label className="font-bold text-txt-primary block mb-1">Fecha de Gasto (Opcional):</label>
            <input
              type="date"
              value={fechaGasto}
              onChange={(e) => setFechaGasto(e.target.value)}
              aria-label="Fecha del gasto"
              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
            />
          </div>
        </div>

        <div>
          <label className="font-bold text-txt-primary block mb-1">Notas u Observaciones (Opcional):</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Información adicional del egreso..."
            rows={2}
            className="w-full px-2.5 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs focus:ring-1 focus:ring-brand outline-none"
          />
        </div>

        <div className="flex justify-end items-center gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isLoading}>
            {isEditing ? 'Guardar Cambios' : 'Registrar Gasto'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
