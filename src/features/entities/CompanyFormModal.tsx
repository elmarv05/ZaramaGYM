// ============================================================================
// COMPONENTE: FORMULARIO DE EMPRESA RUC 20 (CREAR / EDITAR)
// Ubicación: src/features/entities/CompanyFormModal.tsx
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  CompanyDetail,
  CompanyListItem,
  CreateCompanyInput,
  UpdateCompanyInput,
} from '../../types/entity';
import { validateCompanyForm } from '../../domain/entity';
import { Modal } from '../../components/primitives/Modal';
import { Button } from '../../components/primitives/Button';
import { Input } from '../../components/primitives/Input';
import { preventEnterKeySubmit } from '../../utils/formSafety';

export interface CompanyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingCompany?: CompanyListItem | CompanyDetail | null;
  onSubmitCreate: (input: CreateCompanyInput) => Promise<CompanyDetail | null>;
  onSubmitUpdate: (companyId: number, input: UpdateCompanyInput) => Promise<CompanyDetail | null>;
  isLoading?: boolean;
}

export const CompanyFormModal: React.FC<CompanyFormModalProps> = ({
  isOpen,
  onClose,
  editingCompany,
  onSubmitCreate,
  onSubmitUpdate,
  isLoading = false,
}) => {
  const isEditing = Boolean(editingCompany);

  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingCompany) {
      setRuc(editingCompany.ruc);
      setRazonSocial(editingCompany.razon_social);
      setNombreComercial(editingCompany.nombre_comercial || '');
      setTelefono(editingCompany.telefono || '');
      setEmail(editingCompany.email || '');
      setDireccion((editingCompany as CompanyDetail).direccion || '');
    } else {
      setRuc('');
      setRazonSocial('');
      setNombreComercial('');
      setTelefono('');
      setEmail('');
      setDireccion('');
    }
    setErrors({});
  }, [editingCompany, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (isEditing && editingCompany) {
      const updateData: UpdateCompanyInput = {
        razon_social: razonSocial.trim(),
        nombre_comercial: nombreComercial.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        direccion: direccion.trim() || null,
      };

      const val = validateCompanyForm(updateData);
      if (!val.isValid) {
        setErrors(val.errors);
        return;
      }

      const result = await onSubmitUpdate(editingCompany.id, updateData);
      if (result) onClose();
      return;
    }

    const createData: CreateCompanyInput = {
      ruc: ruc.trim(),
      razon_social: razonSocial.trim(),
      nombre_comercial: nombreComercial.trim() || null,
      telefono: telefono.trim() || null,
      email: email.trim() || null,
      direccion: direccion.trim() || null,
    };

    const val = validateCompanyForm(createData);
    if (!val.isValid) {
      setErrors(val.errors);
      return;
    }

    const result = await onSubmitCreate(createData);
    if (result) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar Empresa Jurídica RUC 20' : 'Registrar Empresa Jurídica (RUC 20)'}
      description="Entidad corporativa con personería jurídica SUNAT para compras y servicios."
      size="lg"
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        onKeyDown={preventEnterKeySubmit}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="RUC de Empresa (11 dígitos, inicia con 20)"
            placeholder="Ej: 20601234567"
            value={ruc}
            onChange={(e) => {
              setRuc(e.target.value);
              if (errors.ruc) setErrors((prev) => ({ ...prev, ruc: '' }));
            }}
            error={errors.ruc}
            disabled={isEditing || isLoading}
            required={!isEditing}
          />

          <Input
            label="Razón Social (Registrada en SUNAT)"
            placeholder="Ej: Distribuidora Fit SAC"
            value={razonSocial}
            onChange={(e) => {
              setRazonSocial(e.target.value);
              if (errors.razon_social) setErrors((prev) => ({ ...prev, razon_social: '' }));
            }}
            error={errors.razon_social}
            maxLength={80}
            hint={`${razonSocial.length}/80 caracteres máximo`}
            disabled={isLoading}
            required
          />

          <Input
            label="Nombre Comercial (Opcional)"
            placeholder="Ej: FitSupps"
            value={nombreComercial}
            onChange={(e) => setNombreComercial(e.target.value)}
            disabled={isLoading}
          />

          <Input
            label="Teléfono Corporativo"
            placeholder="Ej: 01 2345678"
            value={telefono}
            onChange={(e) => {
              setTelefono(e.target.value);
              if (errors.telefono) setErrors((prev) => ({ ...prev, telefono: '' }));
            }}
            error={errors.telefono}
            disabled={isLoading}
          />

          <div className="sm:col-span-2">
            <Input
              label="Correo Electrónico Corporativo"
              type="email"
              placeholder="ventas@fitsupps.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
              }}
              error={errors.email}
              disabled={isLoading}
            />
          </div>

          <div className="sm:col-span-2">
            <Input
              label="Dirección Fiscal (Opcional)"
              placeholder="Ej: Av. Las Américas 123, Oficina 402"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading} disabled={isLoading}>
            {isEditing ? 'Guardar Cambios' : 'Registrar Empresa'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
