// ============================================================================
// COMPONENTE: MODAL DE GASTO OPERATIVO (CREACIÓN Y EDICIÓN - ADMIN)
// Categorías contables, derivación automática de canal y comprobante de referencia
// Ubicación: src/features/finance/components/ExpenseFormModal.tsx
// ============================================================================

import React, { useEffect, useId, useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Input } from '../../../components/primitives/Input';
import { Label } from '../../../components/primitives/Label';
import { Modal } from '../../../components/primitives/Modal';
import { Select, SelectOption } from '../../../components/primitives/Select';
import { Textarea } from '../../../components/primitives/Textarea';
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

const EXPENSE_CATEGORY_OPTIONS: SelectOption[] = (
  Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]
).map((cat) => ({
  value: cat,
  label: EXPENSE_CATEGORY_LABELS[cat],
}));

const PAYMENT_METHOD_OPTIONS: SelectOption[] = [
  { value: 'EFECTIVO', label: 'EFECTIVO (Caja Física)' },
  { value: 'YAPE', label: 'YAPE (Digital)' },
  { value: 'PLIN', label: 'PLIN (Digital)' },
  { value: 'TRANSFERENCIA', label: 'TRANSFERENCIA (Digital)' },
  { value: 'TARJETA', label: 'TARJETA POS (Digital)' },
];

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
}) => {
  const isEditing = Boolean(initialData);
  const metodoPagoId = useId();

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

        <Select
          label="Categoría del Gasto"
          selectSize="sm"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as ExpenseCategory)}
          required
          options={EXPENSE_CATEGORY_OPTIONS}
        />

        <Input
          label="Descripción del gasto"
          inputSize="sm"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej. Recibo de luz mes de octubre / Compra de jabón y desinfectante..."
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Monto del gasto (S/)"
            inputSize="sm"
            type="text"
            inputMode="decimal"
            value={monto}
            onFocus={selectIfZeroDefault}
            onChange={(e) => setMonto(sanitizeDecimalInput(e.target.value))}
            onBlur={(e) => {
              setMonto(formatDecimalOnBlur(e.target.value, { min: 0.01, fallback: '' }));
            }}
            placeholder="0.00"
            required
            className="bg-canvas"
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-1">
              <Label htmlFor={metodoPagoId} required className="normal-case">
                Método de pago del gasto
              </Label>
              <Badge variant={canalCaja === 'FISICA' ? 'success' : 'info'} size="sm">
                {canalCaja}
              </Badge>
            </div>
            <Select
              id={metodoPagoId}
              selectSize="sm"
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value as PaymentMethod)}
              required
              options={PAYMENT_METHOD_OPTIONS}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Comprobante / N° Operación (Opcional)"
            inputSize="sm"
            value={comprobanteReferencia}
            onChange={(e) => setComprobanteReferencia(e.target.value)}
            placeholder="Ej. Recibo 01248 / Op 884729"
          />

          <Input
            label="Fecha del gasto (Opcional)"
            inputSize="sm"
            type="date"
            value={fechaGasto}
            onChange={(e) => setFechaGasto(e.target.value)}
            className="bg-canvas"
          />
        </div>

        <Textarea
          label="Notas u Observaciones (Opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Información adicional del egreso..."
          rows={2}
          className="text-xs bg-canvas"
        />

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
