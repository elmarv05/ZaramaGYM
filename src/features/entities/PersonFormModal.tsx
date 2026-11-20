// ============================================================================
// COMPONENTE: FORMULARIO DE PERSONA NATURAL (CREAR / EDITAR) (SLICE 2)
// Ubicación: src/features/entities/PersonFormModal.tsx
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  CreatePersonInput,
  PersonDetail,
  PersonDocumentType,
  PersonListItem,
  UpdatePersonInput,
} from '../../types/entity';
import { PERSON_DOCUMENT_TYPES, validatePersonForm } from '../../domain/entity';
import { Modal } from '../../components/primitives/Modal';
import { Button } from '../../components/primitives/Button';
import { Input } from '../../components/primitives/Input';
import { Select } from '../../components/primitives/Select';
import { preventEnterKeySubmit } from '../../utils/formSafety';

export interface PersonFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPerson?: PersonListItem | PersonDetail | null;
  onSubmitCreate: (input: CreatePersonInput) => Promise<PersonDetail | null>;
  onSubmitUpdate: (personId: number, input: UpdatePersonInput) => Promise<PersonDetail | null>;
  isLoading?: boolean;
}

export const PersonFormModal: React.FC<PersonFormModalProps> = ({
  isOpen,
  onClose,
  editingPerson,
  onSubmitCreate,
  onSubmitUpdate,
  isLoading = false,
}) => {
  const isEditing = Boolean(editingPerson);

  const [formData, setFormData] = useState<CreatePersonInput>({
    tipo_documento: 'DNI',
    numero_documento: '',
    nombres: '',
    apellidos: '',
    fecha_nacimiento: '',
    telefono: '',
    email: '',
    direccion: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingPerson) {
      setFormData({
        tipo_documento: editingPerson.tipo_documento,
        numero_documento: editingPerson.numero_documento,
        nombres: editingPerson.nombres,
        apellidos: editingPerson.apellidos,
        fecha_nacimiento: (editingPerson as PersonDetail).fecha_nacimiento || '',
        telefono: editingPerson.telefono || '',
        email: editingPerson.email || '',
        direccion: (editingPerson as PersonDetail).direccion || '',
      });
    } else {
      setFormData({
        tipo_documento: 'DNI',
        numero_documento: '',
        nombres: '',
        apellidos: '',
        fecha_nacimiento: '',
        telefono: '',
        email: '',
        direccion: '',
      });
    }
    setErrors({});
  }, [editingPerson, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validation = validatePersonForm(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    if (isEditing && editingPerson) {
      const updateData: UpdatePersonInput = {
        tipo_documento: formData.tipo_documento,
        numero_documento: formData.numero_documento.trim(),
        nombres: formData.nombres.trim(),
        apellidos: formData.apellidos.trim(),
        fecha_nacimiento: formData.fecha_nacimiento?.trim() || null,
        telefono: formData.telefono?.trim() || null,
        email: formData.email?.trim() || null,
        direccion: formData.direccion?.trim() || null,
      };
      const result = await onSubmitUpdate(editingPerson.id, updateData);
      if (result) onClose();
    } else {
      const result = await onSubmitCreate(formData);
      if (result) onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar Persona Natural' : 'Registrar Nueva Persona Natural'}
      description="Base maestra de personas humanas (socios, trabajadores, clientes, proveedores)."
      size="lg"
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        onKeyDown={preventEnterKeySubmit}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Tipo de Documento"
            options={PERSON_DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
            value={formData.tipo_documento}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                tipo_documento: e.target.value as PersonDocumentType,
              }))
            }
            error={errors.tipo_documento}
            disabled={isLoading}
            required
          />

          <Input
            label="Número de Documento"
            placeholder="Ej: 8 dígitos DNI o RUC 10/15/17"
            value={formData.numero_documento}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, numero_documento: e.target.value }));
              if (errors.numero_documento) setErrors((prev) => ({ ...prev, numero_documento: '' }));
            }}
            error={errors.numero_documento}
            disabled={isLoading}
            required
          />

          <Input
            label="Nombres"
            placeholder="Nombres"
            value={formData.nombres}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, nombres: e.target.value }));
              if (errors.nombres) setErrors((prev) => ({ ...prev, nombres: '' }));
            }}
            error={errors.nombres}
            disabled={isLoading}
            required
          />

          <Input
            label="Apellidos"
            placeholder="Apellidos completos"
            value={formData.apellidos}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, apellidos: e.target.value }));
              if (errors.apellidos) setErrors((prev) => ({ ...prev, apellidos: '' }));
            }}
            error={errors.apellidos}
            disabled={isLoading}
            required
          />

          <Input
            label="Fecha de Nacimiento"
            type="date"
            value={formData.fecha_nacimiento || ''}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, fecha_nacimiento: e.target.value }))
            }
            error={errors.fecha_nacimiento}
            disabled={isLoading}
          />

          <Input
            label="Teléfono de Contacto"
            placeholder="Ej: 987654321"
            value={formData.telefono || ''}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, telefono: e.target.value }));
              if (errors.telefono) setErrors((prev) => ({ ...prev, telefono: '' }));
            }}
            error={errors.telefono}
            disabled={isLoading}
          />

          <div className="sm:col-span-2">
            <Input
              label="Correo Electrónico"
              type="email"
              placeholder="persona@correo.com"
              value={formData.email || ''}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, email: e.target.value }));
                if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
              }}
              error={errors.email}
              disabled={isLoading}
            />
          </div>

          <div className="sm:col-span-2">
            <Input
              label="Dirección Residencial"
              placeholder="Ej: Jr. Los Sauces 123"
              value={formData.direccion || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, direccion: e.target.value }))}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading} disabled={isLoading}>
            {isEditing ? 'Guardar Cambios' : 'Registrar Persona'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
