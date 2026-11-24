// ============================================================================
// MODAL: ALTA Y EDICIÓN DE PLANES Y MEMBRESÍAS (SLICE 3)
// Ubicación: src/features/catalog/PlanFormModal.tsx
// ============================================================================

import React, { useEffect, useId, useState } from 'react';
import { Button } from '../../components/primitives/Button';
import { Input } from '../../components/primitives/Input';
import { Label } from '../../components/primitives/Label';
import { Modal } from '../../components/primitives/Modal';
import { Select } from '../../components/primitives/Select';
import { Switch } from '../../components/primitives/Switch';
import { Textarea } from '../../components/primitives/Textarea';
import { validatePlanForm } from '../../domain/catalog';
import { CreatePlanInput, PlanListItem, TipoPlan, UpdatePlanInput } from '../../types/catalog';
import {
  formatDecimalOnBlur,
  preventEnterKeySubmit,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  selectIfZeroDefault,
} from '../../utils/formSafety';

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
  const recuperacionId = useId();

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipoPlan, setTipoPlan] = useState<TipoPlan>('MENSUALIDAD');
  const [duracionMesesStr, setDuracionMesesStr] = useState<string>('1');
  const [precioBase, setPrecioBase] = useState('80.00');
  const [permiteRecuperacion, setPermiteRecuperacion] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (planToEdit) {
      setCodigo(planToEdit.codigo);
      setNombre(planToEdit.nombre);
      setDescripcion(planToEdit.descripcion || '');
      setTipoPlan(planToEdit.tipo_plan);
      setDuracionMesesStr(String(planToEdit.duracion_meses));
      setPrecioBase(planToEdit.precio_base);
      setPermiteRecuperacion(planToEdit.permite_recuperacion_dias);
    } else {
      setCodigo('');
      setNombre('');
      setDescripcion('');
      setTipoPlan('MENSUALIDAD');
      setDuracionMesesStr('1');
      setPrecioBase('80.00');
      setPermiteRecuperacion(true);
    }
    setErrors({});
  }, [planToEdit, isOpen]);

  const handleTipoPlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextTipo = e.target.value as TipoPlan;
    setTipoPlan(nextTipo);
    if (nextTipo === 'PASE_DIARIO') {
      setDuracionMesesStr('0');
      setPermiteRecuperacion(false);
    } else if (!duracionMesesStr || parseInt(duracionMesesStr, 10) === 0) {
      setDuracionMesesStr('1');
      setPermiteRecuperacion(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedDuracion = parseInt(duracionMesesStr, 10);
    const formValues = {
      codigo: isEditing ? planToEdit?.codigo : codigo,
      nombre,
      descripcion: descripcion.trim() || null,
      tipo_plan: tipoPlan,
      duracion_meses: tipoPlan === 'PASE_DIARIO' ? 0 : isNaN(parsedDuracion) ? 0 : parsedDuracion,
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
      <form
        noValidate
        onSubmit={handleSubmit}
        onKeyDown={preventEnterKeySubmit}
        className="flex flex-col gap-4"
      >
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

        <Textarea
          label="Descripción de Beneficios (Opcional)"
          rows={2}
          placeholder="Detalles de disciplinas incluidas, horario libre, etc."
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />

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
            type="text"
            inputMode="numeric"
            value={duracionMesesStr}
            onFocus={selectIfZeroDefault}
            onChange={(e) => setDuracionMesesStr(sanitizeIntegerInput(e.target.value))}
            onBlur={(e) => {
              if (tipoPlan === 'PASE_DIARIO') {
                setDuracionMesesStr('0');
                return;
              }
              const n = parseInt(e.target.value, 10);
              if (!e.target.value.trim()) return;
              if (!isNaN(n)) {
                setDuracionMesesStr(String(Math.min(36, Math.max(0, n))));
              }
            }}
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
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={precioBase}
          onFocus={selectIfZeroDefault}
          onChange={(e) => setPrecioBase(sanitizeDecimalInput(e.target.value))}
          onBlur={(e) => {
            setPrecioBase(formatDecimalOnBlur(e.target.value, { min: 0, fallback: '' }));
          }}
          error={errors.precio_base}
          required
          leftIcon={<span className="text-xs font-bold text-txt-muted">S/</span>}
        />

        <div className="bg-canvas-subtle p-3 rounded-lg border border-border flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <Label htmlFor={recuperacionId} className="normal-case text-xs font-semibold text-txt-primary">
              Recuperación de Días por Justificación
            </Label>
            <span className="text-[11px] text-txt-muted">
              Permite congelamiento y reposición en el slice de asistencias
            </span>
          </div>
          <Switch
            id={recuperacionId}
            checked={permiteRecuperacion}
            onCheckedChange={setPermiteRecuperacion}
            disabled={tipoPlan === 'PASE_DIARIO'}
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
