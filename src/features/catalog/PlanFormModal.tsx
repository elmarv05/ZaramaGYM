// ============================================================================
// MODAL: ALTA Y EDICIÓN DE PLANES Y MEMBRESÍAS (SLICE 3)
// Ubicación: src/features/catalog/PlanFormModal.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Button } from '../../components/primitives/Button';
import { Input } from '../../components/primitives/Input';
import { Modal } from '../../components/primitives/Modal';
import { Select } from '../../components/primitives/Select';
import { validatePlanForm } from '../../domain/catalog';
import { CreatePlanInput, PlanListItem, TipoPlan, UpdatePlanInput } from '../../types/catalog';

export interface PlanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  planToEdit?: PlanListItem | null;
  onSubmit: (input: CreatePlanInput | UpdatePlanInput) => Promise<boolean>;
  isLoading?: boolean;
}

export const PlanFormModal: React.FC<PlanFormModalProps> = ({
  isOpen,
  onClose,
  planToEdit,
  onSubmit,
  isLoading = false,
}) => {
  const isEditing = Boolean(planToEdit);

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipoPlan, setTipoPlan] = useState<TipoPlan>('MENSUALIDAD');
  const [duracionMeses, setDuracionMeses] = useState<number>(1);
  const [precioBase, setPrecioBase] = useState('80.00');
  const [permiteRecuperacion, setPermiteRecuperacion] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (planToEdit) {
      setCodigo(planToEdit.codigo);
      setNombre(planToEdit.nombre);
      setDescripcion(planToEdit.descripcion || '');
      setTipoPlan(planToEdit.tipo_plan);
      setDuracionMeses(planToEdit.duracion_meses);
      setPrecioBase(planToEdit.precio_base);
      setPermiteRecuperacion(planToEdit.permite_recuperacion_dias);
    } else {
      setCodigo('');
      setNombre('');
      setDescripcion('');
      setTipoPlan('MENSUALIDAD');
      setDuracionMeses(1);
      setPrecioBase('80.00');
      setPermiteRecuperacion(true);
    }
    setErrors({});
  }, [planToEdit, isOpen]);

  const handleTipoPlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextTipo = e.target.value as TipoPlan;
    setTipoPlan(nextTipo);
    if (nextTipo === 'PASE_DIARIO') {
      setDuracionMeses(0);
      setPermiteRecuperacion(false);
    } else if (duracionMeses === 0) {
      setDuracionMeses(1);
      setPermiteRecuperacion(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formValues = {
      codigo: isEditing ? planToEdit?.codigo : codigo,
      nombre,
      descripcion: descripcion.trim() || null,
      tipo_plan: tipoPlan,
      duracion_meses: tipoPlan === 'PASE_DIARIO' ? 0 : Number(duracionMeses),
      precio_base: precioBase,
      permite_recuperacion_dias: permiteRecuperacion,
    };

    const validationErrors = validatePlanForm(formValues, isEditing);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    let success = false;
    if (isEditing) {
      const updateData: UpdatePlanInput = {
        nombre: formValues.nombre,
        descripcion: formValues.descripcion,
        precio_base: String(formValues.precio_base),
        permite_recuperacion_dias: formValues.permite_recuperacion_dias,
      };
      success = await onSubmit(updateData);
    } else {
      const createData: CreatePlanInput = {
        codigo: formValues.codigo!.trim().toUpperCase(),
        nombre: formValues.nombre.trim(),
        descripcion: formValues.descripcion,
        tipo_plan: formValues.tipo_plan,
        duracion_meses: formValues.duracion_meses,
        precio_base: String(formValues.precio_base),
        permite_recuperacion_dias: formValues.permite_recuperacion_dias,
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
      title={isEditing ? `Editar Plan: ${planToEdit?.codigo}` : 'Configurar Nuevo Plan o Membresía'}
      description="Define las condiciones de acceso, duración en meses y precio base en soles."
      size="md"
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!isEditing && (
          <Input
            label="Código / SKU del Plan"
            placeholder="Ej. PLAN-1M, PASE-DIA"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            error={errors.codigo}
            required
            hint="Identificador único en mayúsculas sin espacios"
          />
        )}

        <Input
          label="Nombre Comercial"
          placeholder="Ej. Membresía Mensual Regular"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={errors.nombre}
          required
        />

        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider select-none">
            Descripción de Beneficios (Opcional)
          </label>
          <textarea
            rows={2}
            className="w-full bg-surface border border-border rounded-md text-sm text-txt-primary p-2.5 focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none"
            placeholder="Detalles de disciplinas incluidas, horario libre, etc."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Tipo de Plan"
            value={tipoPlan}
            onChange={handleTipoPlanChange}
            error={errors.tipo_plan}
            options={[
              { value: 'MENSUALIDAD', label: 'Membresía Mensual' },
              { value: 'PASE_DIARIO', label: 'Pase Diario' },
            ]}
            required
            disabled={isEditing}
          />

          <Input
            label="Duración en Meses"
            type="number"
            min={tipoPlan === 'PASE_DIARIO' ? 0 : 1}
            max={tipoPlan === 'PASE_DIARIO' ? 0 : 36}
            value={duracionMeses}
            onChange={(e) => setDuracionMeses(parseInt(e.target.value, 10) || 0)}
            error={errors.duracion_meses}
            disabled={tipoPlan === 'PASE_DIARIO' || isEditing}
            hint={
              tipoPlan === 'PASE_DIARIO'
                ? 'Fijado en 0 (vence 23:59:59 del mismo día)'
                : 'Meses calendario con compensación Day Overflow'
            }
            required
          />
        </div>

        <Input
          label="Precio Base (S/ PEN)"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={precioBase}
          onChange={(e) => setPrecioBase(e.target.value)}
          onBlur={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= 0) {
              setPrecioBase(v.toFixed(2));
            }
          }}
          error={errors.precio_base}
          required
          leftIcon={<span className="text-xs font-bold text-txt-muted">S/</span>}
        />

        <div className="bg-canvas-subtle p-3 rounded-lg border border-border flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-txt-primary">
              Recuperación de Días por Justificación
            </span>
            <span className="text-[11px] text-txt-muted">
              Permite congelamiento y reposición en el slice de asistencias
            </span>
          </div>
          <input
            type="checkbox"
            checked={permiteRecuperacion}
            onChange={(e) => setPermiteRecuperacion(e.target.checked)}
            disabled={tipoPlan === 'PASE_DIARIO'}
            className="h-4 w-4 rounded border-border text-brand focus:ring-brand cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border mt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            {isEditing ? 'Guardar Cambios' : 'Registrar Plan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
