// ============================================================================
// COMPONENTE: FORMULARIO DE PROVEEDOR EN 2 FASES Y EDICIÓN DUAL (SLICE 2)
// Selector adaptativo: Persona Natural vs Empresa Jurídica RUC 20
// Creación en 2 Fases (Nueva vs Existente) y Edición Dual con RBAC ("Caso Juan Pérez")
// Ubicación: src/features/entities/SupplierFormModal.tsx
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  CompanyListItem,
  CreateSupplierInput,
  PersonDocumentType,
  PersonListItem,
  SupplierDetail,
  SupplierListItem,
  SupplierType,
  UpdateCompanyInput,
  UpdatePersonInput,
  UpdateSupplierInput,
} from '../../types/entity';
import { AuthSession } from '../../types/auth';
import {
  PERSON_DOCUMENT_TYPES,
  canModifyLinkedPersonData,
  validateCompanyForm,
  validatePersonForm,
} from '../../domain/entity';
import { Modal } from '../../components/primitives/Modal';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';
import { Select } from '../../components/primitives/Select';
import { preventEnterKeySubmit } from '../../utils/formSafety';

export interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSupplier?: SupplierListItem | SupplierDetail | null;
  onSubmitCreate: (input: CreateSupplierInput) => Promise<SupplierDetail | null>;
  onSubmitUpdate: (supplierId: number, input: UpdateSupplierInput) => Promise<SupplierDetail | null>;
  persons?: PersonListItem[];
  companies?: CompanyListItem[];
  currentSession?: AuthSession;
  isLoading?: boolean;
}

type EntitySelectionMode = 'new' | 'existing';
type EditActiveTab = 'supplier' | 'linked';

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  isOpen,
  onClose,
  editingSupplier,
  onSubmitCreate,
  onSubmitUpdate,
  persons = [],
  companies = [],
  currentSession,
  isLoading = false,
}) => {
  const isEditing = Boolean(editingSupplier);

  const [tipoProveedor, setTipoProveedor] = useState<SupplierType>('EMPRESA');
  const [creationMode, setCreationMode] = useState<EntitySelectionMode>('new');
  const [editTab, setEditTab] = useState<EditActiveTab>('supplier');

  // Búsqueda y selección de entidades existentes
  const [searchEntityTerm, setSearchEntityTerm] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);

  // Desbloqueo de datos personales / empresa en edición dual
  const [isLinkedUnlocked, setIsLinkedUnlocked] = useState(false);

  // Campos comunes de proveedor
  const [rubro, setRubro] = useState('');
  const [contactoRef, setContactoRef] = useState('');

  // Campos Empresa
  const [rucEmpresa, setRucEmpresa] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [telefonoEmpresa, setTelefonoEmpresa] = useState('');
  const [emailEmpresa, setEmailEmpresa] = useState('');
  const [direccionEmpresa, setDireccionEmpresa] = useState('');

  // Campos Persona Natural
  const [tipoDocPersona, setTipoDocPersona] = useState<PersonDocumentType>('DNI');
  const [numDocPersona, setNumDocPersona] = useState('');
  const [nombresPersona, setNombresPersona] = useState('');
  const [apellidosPersona, setApellidosPersona] = useState('');
  const [telefonoPersona, setTelefonoPersona] = useState('');
  const [emailPersona, setEmailPersona] = useState('');
  const [direccionPersona, setDireccionPersona] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingSupplier) {
      setTipoProveedor(editingSupplier.tipo_proveedor);
      setRubro(editingSupplier.rubro_o_categoria || '');
      setContactoRef(editingSupplier.contacto_referencia || '');

      if (editingSupplier.tipo_proveedor === 'EMPRESA') {
        setRucEmpresa(editingSupplier.numero_documento || '');
        setRazonSocial(editingSupplier.nombre_o_razon_social || '');
        setNombreComercial(editingSupplier.nombre_comercial || '');
        setTelefonoEmpresa(editingSupplier.telefono || '');
        setEmailEmpresa(editingSupplier.email || '');
        setDireccionEmpresa(editingSupplier.direccion || '');
      } else {
        setTipoDocPersona((editingSupplier.tipo_documento as PersonDocumentType) || 'DNI');
        setNumDocPersona(editingSupplier.numero_documento || '');
        setNombresPersona(editingSupplier.nombres || editingSupplier.nombre_o_razon_social || '');
        setApellidosPersona(editingSupplier.apellidos || '');
        setTelefonoPersona(editingSupplier.telefono || '');
        setEmailPersona(editingSupplier.email || '');
        setDireccionPersona(editingSupplier.direccion || '');
      }

      setCreationMode('new');
      setEditTab('supplier');
      setIsLinkedUnlocked(false);
    } else {
      setTipoProveedor('EMPRESA');
      setCreationMode('new');
      setEditTab('supplier');
      setIsLinkedUnlocked(false);
      setSearchEntityTerm('');
      setSelectedCompanyId(null);
      setSelectedPersonId(null);
      setRubro('');
      setContactoRef('');
      setRucEmpresa('');
      setRazonSocial('');
      setNombreComercial('');
      setTelefonoEmpresa('');
      setEmailEmpresa('');
      setDireccionEmpresa('');
      setTipoDocPersona('DNI');
      setNumDocPersona('');
      setNombresPersona('');
      setApellidosPersona('');
      setTelefonoPersona('');
      setEmailPersona('');
      setDireccionPersona('');
    }
    setErrors({});
  }, [editingSupplier, isOpen]);

  // Jerarquía RBAC para desbloqueo de datos personales
  const canUnlockLinkedData = useMemo(() => {
    if (!isEditing || !editingSupplier) return true;
    if (editingSupplier.tipo_proveedor === 'EMPRESA') {
      return true; // Administrador puede editar datos comerciales de empresa
    }
    return canModifyLinkedPersonData(currentSession?.rol, editingSupplier.persona_rol_usuario);
  }, [isEditing, editingSupplier, currentSession]);

  // Empresas disponibles para vincular (que coincidan con búsqueda)
  const filteredAvailableCompanies = useMemo(() => {
    if (tipoProveedor !== 'EMPRESA') return [];
    if (!searchEntityTerm.trim()) return companies.slice(0, 10);
    const term = searchEntityTerm.toLowerCase();
    return companies.filter(
      (c) =>
        c.ruc.includes(term) ||
        c.razon_social.toLowerCase().includes(term) ||
        (c.nombre_comercial && c.nombre_comercial.toLowerCase().includes(term))
    );
  }, [companies, searchEntityTerm, tipoProveedor]);

  // Personas disponibles para vincular (que coincidan con búsqueda)
  const filteredAvailablePersons = useMemo(() => {
    if (tipoProveedor !== 'PERSONA_NATURAL') return [];
    if (!searchEntityTerm.trim()) return persons.slice(0, 10);
    const term = searchEntityTerm.toLowerCase();
    return persons.filter(
      (p) =>
        p.numero_documento.includes(term) ||
        p.nombres.toLowerCase().includes(term) ||
        p.apellidos.toLowerCase().includes(term)
    );
  }, [persons, searchEntityTerm, tipoProveedor]);

  const selectedCompany = useMemo(() => {
    return companies.find((c) => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  const selectedPerson = useMemo(() => {
    return persons.find((p) => p.id === selectedPersonId) || null;
  }, [persons, selectedPersonId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // MODO EDICIÓN
    if (isEditing && editingSupplier) {
      let empresaData: UpdateCompanyInput | null = null;
      let personaData: UpdatePersonInput | null = null;

      if (isLinkedUnlocked) {
        if (editingSupplier.tipo_proveedor === 'EMPRESA') {
          const compVal = validateCompanyForm({
            razon_social: razonSocial,
            nombre_comercial: nombreComercial || null,
            telefono: telefonoEmpresa || null,
            email: emailEmpresa || null,
            direccion: direccionEmpresa || null,
          });
          if (!compVal.isValid) {
            setErrors(compVal.errors);
            setEditTab('linked');
            return;
          }
          empresaData = {
            razon_social: razonSocial.trim(),
            nombre_comercial: nombreComercial.trim() || null,
            telefono: telefonoEmpresa.trim() || null,
            email: emailEmpresa.trim() || null,
            direccion: direccionEmpresa.trim() || null,
          };
        } else {
          // PERSONA_NATURAL
          const personVal = validatePersonForm({
            tipo_documento: tipoDocPersona,
            numero_documento: numDocPersona,
            nombres: nombresPersona,
            apellidos: apellidosPersona,
            telefono: telefonoPersona || null,
            email: emailPersona || null,
            direccion: direccionPersona || null,
          });
          if (!personVal.isValid) {
            setErrors(personVal.errors);
            setEditTab('linked');
            return;
          }
          personaData = {
            tipo_documento: tipoDocPersona,
            numero_documento: numDocPersona.trim(),
            nombres: nombresPersona.trim(),
            apellidos: apellidosPersona.trim(),
            telefono: telefonoPersona.trim() || null,
            email: emailPersona.trim() || null,
            direccion: direccionPersona.trim() || null,
          };
        }
      }

      const updatePayload: UpdateSupplierInput = {
        rubro_o_categoria: rubro.trim() || null,
        contacto_referencia: contactoRef.trim() || null,
        empresa_data: empresaData,
        persona_data: personaData,
      };

      const result = await onSubmitUpdate(editingSupplier.id, updatePayload);
      if (result) onClose();
      return;
    }

    // MODO CREACIÓN
    if (tipoProveedor === 'EMPRESA') {
      if (creationMode === 'existing') {
        if (!selectedCompanyId) {
          setErrors({ selectedEntity: 'Debes seleccionar una empresa jurídica existente.' });
          return;
        }
        const input: CreateSupplierInput = {
          tipo_proveedor: 'EMPRESA',
          empresa_id: selectedCompanyId,
          rubro_o_categoria: rubro.trim() || null,
          contacto_referencia: contactoRef.trim() || null,
        };
        const result = await onSubmitCreate(input);
        if (result) onClose();
      } else {
        const companyVal = validateCompanyForm({
          ruc: rucEmpresa,
          razon_social: razonSocial,
          nombre_comercial: nombreComercial || null,
          telefono: telefonoEmpresa || null,
          email: emailEmpresa || null,
          direccion: direccionEmpresa || null,
        });

        if (!companyVal.isValid) {
          setErrors(companyVal.errors);
          return;
        }

        const input: CreateSupplierInput = {
          tipo_proveedor: 'EMPRESA',
          rubro_o_categoria: rubro.trim() || null,
          contacto_referencia: contactoRef.trim() || null,
          empresa_data: companyVal.sanitizedInput,
        };

        const result = await onSubmitCreate(input);
        if (result) onClose();
      }
    } else {
      // PERSONA_NATURAL
      if (creationMode === 'existing') {
        if (!selectedPersonId) {
          setErrors({ selectedEntity: 'Debes seleccionar una persona natural existente.' });
          return;
        }
        const input: CreateSupplierInput = {
          tipo_proveedor: 'PERSONA_NATURAL',
          persona_id: selectedPersonId,
          rubro_o_categoria: rubro.trim() || null,
          contacto_referencia: contactoRef.trim() || null,
        };
        const result = await onSubmitCreate(input);
        if (result) onClose();
      } else {
        const personVal = validatePersonForm({
          tipo_documento: tipoDocPersona,
          numero_documento: numDocPersona,
          nombres: nombresPersona,
          apellidos: apellidosPersona,
          telefono: telefonoPersona || null,
          email: emailPersona || null,
          direccion: direccionPersona || null,
        });

        if (!personVal.isValid) {
          setErrors(personVal.errors);
          return;
        }

        const input: CreateSupplierInput = {
          tipo_proveedor: 'PERSONA_NATURAL',
          rubro_o_categoria: rubro.trim() || null,
          contacto_referencia: contactoRef.trim() || null,
          persona_data: personVal.sanitizedInput,
        };

        const result = await onSubmitCreate(input);
        if (result) onClose();
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor'}
      description="Vincula una Empresa Jurídica RUC 20 o una Persona Natural proveedora."
      size="lg"
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        onKeyDown={preventEnterKeySubmit}
        className="flex flex-col gap-4"
      >
        {/* Selector de Tipo (Solo en Creación) */}
        {!isEditing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
                Tipo de Proveedor
              </span>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={tipoProveedor === 'EMPRESA' ? 'primary' : 'secondary'}
                  size="md"
                  aria-pressed={tipoProveedor === 'EMPRESA'}
                  onClick={() => {
                    setTipoProveedor('EMPRESA');
                    setSelectedCompanyId(null);
                    setErrors({});
                  }}
                  leftIcon={<Icon name="building" className="w-4 h-4" aria-hidden="true" />}
                  className="py-2.5 px-3 rounded-lg font-semibold"
                >
                  Empresa (RUC 20)
                </Button>

                <Button
                  type="button"
                  variant={tipoProveedor === 'PERSONA_NATURAL' ? 'primary' : 'secondary'}
                  size="md"
                  aria-pressed={tipoProveedor === 'PERSONA_NATURAL'}
                  onClick={() => {
                    setTipoProveedor('PERSONA_NATURAL');
                    setSelectedPersonId(null);
                    setErrors({});
                  }}
                  leftIcon={<Icon name="user" className="w-4 h-4" aria-hidden="true" />}
                  className="py-2.5 px-3 rounded-lg font-semibold"
                >
                  Persona Natural
                </Button>
              </div>
            </div>

            {/* Fase 1: Modo de Selección de Entidad Base (Nueva vs Existente) */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-border">
              <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
                Fase 1: Selección de Entidad Base
              </span>
              <div className="flex rounded-lg bg-canvas-subtle p-1 border border-border gap-1">
                <Button
                  type="button"
                  variant={creationMode === 'new' ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={creationMode === 'new'}
                  onClick={() => {
                    setCreationMode('new');
                    setErrors({});
                  }}
                  leftIcon={<Icon name="plus" className="w-3.5 h-3.5" aria-hidden="true" />}
                  className={`flex-1 min-h-[30px] text-xs ${
                    creationMode === 'new'
                      ? 'shadow-xs font-bold'
                      : 'text-txt-muted hover:text-txt-primary border border-transparent'
                  }`}
                >
                  Crear Nueva {tipoProveedor === 'EMPRESA' ? 'Empresa' : 'Persona'}
                </Button>
                <Button
                  type="button"
                  variant={creationMode === 'existing' ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={creationMode === 'existing'}
                  onClick={() => {
                    setCreationMode('existing');
                    setErrors({});
                  }}
                  leftIcon={<Icon name="search" className="w-3.5 h-3.5" aria-hidden="true" />}
                  className={`flex-1 min-h-[30px] text-xs ${
                    creationMode === 'existing'
                      ? 'shadow-xs font-bold'
                      : 'text-txt-muted hover:text-txt-primary border border-transparent'
                  }`}
                >
                  Elegir {tipoProveedor === 'EMPRESA' ? 'Empresa' : 'Persona'} Existente
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* En Edición: Cabecera y Selector de Pestañas */
          <div className="flex flex-col gap-2">
            <div className="p-3 bg-canvas-subtle rounded-lg border border-border flex items-center justify-between">
              <span className="text-xs text-txt-muted">Tipo Registrado:</span>
              <span className="text-sm font-bold text-txt-primary inline-flex items-center gap-1.5">
                <Icon
                  name={editingSupplier?.tipo_proveedor === 'EMPRESA' ? 'building' : 'user'}
                  className="w-4 h-4 text-brand"
                  aria-hidden="true"
                />
                <span>
                  {editingSupplier?.tipo_proveedor === 'EMPRESA'
                    ? 'Empresa Jurídica'
                    : 'Persona Natural'}
                </span>
              </span>
            </div>

            <div className="flex border-b border-border gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={editTab === 'supplier'}
                onClick={() => setEditTab('supplier')}
                className={`rounded-none border-b-2 py-2 px-4 text-xs font-bold uppercase tracking-wider hover:bg-transparent ${
                  editTab === 'supplier'
                    ? 'border-brand text-brand hover:text-brand'
                    : 'border-transparent text-txt-muted hover:text-txt-primary'
                }`}
              >
                1. Datos del Proveedor
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={editTab === 'linked'}
                onClick={() => setEditTab('linked')}
                className={`rounded-none border-b-2 py-2 px-4 text-xs font-bold uppercase tracking-wider hover:bg-transparent ${
                  editTab === 'linked'
                    ? 'border-brand text-brand hover:text-brand'
                    : 'border-transparent text-txt-muted hover:text-txt-primary'
                }`}
              >
                2. Datos de la {editingSupplier?.tipo_proveedor === 'EMPRESA' ? 'Empresa' : 'Persona'}
              </Button>
            </div>
          </div>
        )}

        {/* CONTENIDO EN CREACIÓN: FASE 1 EXISTENTE */}
        {!isEditing && creationMode === 'existing' && (
          <div className="flex flex-col gap-3 p-3 bg-canvas-subtle rounded-lg border border-border">
            <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
              Buscar {tipoProveedor === 'EMPRESA' ? 'Empresa (RUC 20)' : 'Persona'} en el Directorio
            </span>

            <Input
              placeholder={
                tipoProveedor === 'EMPRESA'
                  ? 'Buscar por RUC o Razón Social...'
                  : 'Buscar por DNI o Nombres...'
              }
              value={searchEntityTerm}
              onChange={(e) => setSearchEntityTerm(e.target.value)}
              aria-label="Buscar entidad existente"
            />

            {/* Error si no seleccionó */}
            {errors.selectedEntity && (
              <span className="text-xs text-status-danger font-medium">
                {errors.selectedEntity}
              </span>
            )}

            {/* Tarjeta de entidad actualmente seleccionada */}
            {tipoProveedor === 'EMPRESA' && selectedCompany && (
              <div className="p-3 bg-surface rounded-lg border-2 border-brand flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-txt-primary flex items-center gap-1.5">
                    <Icon name="building" className="w-4 h-4 text-brand" />
                    <span>{selectedCompany.razon_social}</span>
                  </div>
                  <div className="text-xs text-txt-muted font-mono">
                    RUC: {selectedCompany.ruc} {selectedCompany.nombre_comercial ? `(${selectedCompany.nombre_comercial})` : ''}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCompanyId(null)}
                >
                  Cambiar
                </Button>
              </div>
            )}

            {tipoProveedor === 'PERSONA_NATURAL' && selectedPerson && (
              <div className="p-3 bg-surface rounded-lg border-2 border-brand flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-txt-primary flex items-center gap-1.5">
                    <Icon name="user" className="w-4 h-4 text-brand" />
                    <span>
                      {selectedPerson.nombres} {selectedPerson.apellidos}
                    </span>
                  </div>
                  <div className="text-xs text-txt-muted font-mono">
                    {selectedPerson.tipo_documento}: {selectedPerson.numero_documento}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPersonId(null)}
                >
                  Cambiar
                </Button>
              </div>
            )}

            {/* Lista de coincidencias si no hay seleccionado aún */}
            {tipoProveedor === 'EMPRESA' && !selectedCompanyId && (
              <div className="max-h-40 overflow-y-auto flex flex-col gap-1 border border-border rounded-md bg-surface p-1">
                {filteredAvailableCompanies.length === 0 ? (
                  <div className="text-xs text-txt-muted p-2 text-center">
                    No se encontraron empresas con ese criterio.
                  </div>
                ) : (
                  filteredAvailableCompanies.map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedCompanyId(c.id);
                        setErrors({});
                      }}
                      className="w-full h-auto p-2 text-left justify-between font-normal"
                    >
                      <div>
                        <span className="text-xs font-bold text-txt-primary block">
                          {c.razon_social}
                        </span>
                        <span className="text-[11px] font-mono text-txt-muted">
                          RUC {c.ruc}
                        </span>
                      </div>
                      <span className="text-xs text-brand font-semibold">Seleccionar</span>
                    </Button>
                  ))
                )}
              </div>
            )}

            {tipoProveedor === 'PERSONA_NATURAL' && !selectedPersonId && (
              <div className="max-h-40 overflow-y-auto flex flex-col gap-1 border border-border rounded-md bg-surface p-1">
                {filteredAvailablePersons.length === 0 ? (
                  <div className="text-xs text-txt-muted p-2 text-center">
                    No se encontraron personas con ese criterio.
                  </div>
                ) : (
                  filteredAvailablePersons.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedPersonId(p.id);
                        setErrors({});
                      }}
                      className="w-full h-auto p-2 text-left justify-between font-normal"
                    >
                      <div>
                        <span className="text-xs font-bold text-txt-primary block">
                          {p.nombres} {p.apellidos}
                        </span>
                        <span className="text-[11px] font-mono text-txt-muted">
                          {p.tipo_documento}: {p.numero_documento}
                        </span>
                      </div>
                      <span className="text-xs text-brand font-semibold">Seleccionar</span>
                    </Button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO EN CREACIÓN (NUEVA EMPRESA) O EN EDICIÓN (PESTAÑA EMPRESA) */}
        {((!isEditing && creationMode === 'new' && tipoProveedor === 'EMPRESA') ||
          (isEditing && editTab === 'linked' && editingSupplier?.tipo_proveedor === 'EMPRESA')) && (
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
                Datos de la Empresa (RUC 20)
              </span>
              {isEditing && (
                <Button
                  type="button"
                  variant={isLinkedUnlocked ? 'primary' : 'outline'}
                  size="sm"
                  leftIcon={<Icon name={isLinkedUnlocked ? 'lock' : 'key'} className="w-3.5 h-3.5" />}
                  onClick={() => setIsLinkedUnlocked(!isLinkedUnlocked)}
                >
                  {isLinkedUnlocked ? 'Bloquear edición de empresa' : 'Modificar datos de empresa'}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="RUC de Empresa (11 dígitos, inicia con 20)"
                placeholder="Ej: 20601234567"
                value={rucEmpresa}
                onChange={(e) => {
                  setRucEmpresa(e.target.value);
                  if (errors.ruc) setErrors((prev) => ({ ...prev, ruc: '' }));
                }}
                error={errors.ruc}
                disabled={isEditing || isLoading}
                required={!isEditing}
              />

              <Input
                label="Razón Social (Registrada en SUNAT)"
                placeholder="Ej: Distribuidora Suplementos Fit SAC"
                value={razonSocial}
                onChange={(e) => {
                  setRazonSocial(e.target.value);
                  if (errors.razon_social) setErrors((prev) => ({ ...prev, razon_social: '' }));
                }}
                error={errors.razon_social}
                maxLength={80}
                hint={`${razonSocial.length}/80 caracteres máximo`}
                disabled={(isEditing && !isLinkedUnlocked) || isLoading}
                required
              />

              <Input
                label="Nombre Comercial (Opcional)"
                placeholder="Ej: FitSupps"
                value={nombreComercial}
                onChange={(e) => setNombreComercial(e.target.value)}
                disabled={(isEditing && !isLinkedUnlocked) || isLoading}
              />

              <Input
                label="Teléfono Corporativo"
                placeholder="Ej: 01 2345678"
                value={telefonoEmpresa}
                onChange={(e) => setTelefonoEmpresa(e.target.value)}
                disabled={(isEditing && !isLinkedUnlocked) || isLoading}
              />

              <div className="sm:col-span-2">
                <Input
                  label="Correo Electrónico de Contacto"
                  type="email"
                  placeholder="ventas@fitsupps.com"
                  value={emailEmpresa}
                  onChange={(e) => setEmailEmpresa(e.target.value)}
                  error={errors.email}
                  disabled={(isEditing && !isLinkedUnlocked) || isLoading}
                />
              </div>

              {isEditing && (
                <div className="sm:col-span-2">
                  <Input
                    label="Dirección Fiscal"
                    placeholder="Ej: Av. Las Américas 123"
                    value={direccionEmpresa}
                    onChange={(e) => setDireccionEmpresa(e.target.value)}
                    disabled={!isLinkedUnlocked || isLoading}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTENIDO EN CREACIÓN (NUEVA PERSONA) O EN EDICIÓN (PESTAÑA PERSONA) */}
        {((!isEditing && creationMode === 'new' && tipoProveedor === 'PERSONA_NATURAL') ||
          (isEditing && editTab === 'linked' && editingSupplier?.tipo_proveedor === 'PERSONA_NATURAL')) && (
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
                Datos de Persona Natural
              </span>
              {isEditing && (
                <Button
                  type="button"
                  variant={isLinkedUnlocked ? 'primary' : 'outline'}
                  size="sm"
                  disabled={!canUnlockLinkedData}
                  leftIcon={<Icon name={isLinkedUnlocked ? 'lock' : 'key'} className="w-3.5 h-3.5" />}
                  onClick={() => setIsLinkedUnlocked(!isLinkedUnlocked)}
                  title={
                    !canUnlockLinkedData
                      ? 'Protegido por jerarquía RBAC: solo puedes editar los datos comerciales de proveedor'
                      : undefined
                  }
                >
                  {isLinkedUnlocked ? 'Bloquear edición de persona' : 'Modificar datos personales'}
                </Button>
              )}
            </div>

            {isEditing && !canUnlockLinkedData && (
              <div className="p-2.5 bg-status-warning-bg border border-status-warning-border rounded text-xs text-status-warning">
                Protegido por jerarquía RBAC: la persona vinculada tiene credenciales de sistema y no tienes permisos para alterar sus datos personales.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Tipo de Documento"
                options={PERSON_DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
                value={tipoDocPersona}
                onChange={(e) => setTipoDocPersona(e.target.value as PersonDocumentType)}
                disabled={(isEditing && !isLinkedUnlocked) || isLoading}
                required
              />

              <Input
                label="Número de Documento"
                placeholder="Ej: 8 dígitos DNI o RUC 10/15/17"
                value={numDocPersona}
                onChange={(e) => {
                  setNumDocPersona(e.target.value);
                  if (errors.numero_documento) {
                    setErrors((prev) => ({ ...prev, numero_documento: '' }));
                  }
                }}
                error={errors.numero_documento}
                disabled={(isEditing && !isLinkedUnlocked) || isLoading}
                required
              />

              <Input
                label="Nombres"
                placeholder="Nombres"
                value={nombresPersona}
                onChange={(e) => {
                  setNombresPersona(e.target.value);
                  if (errors.nombres) setErrors((prev) => ({ ...prev, nombres: '' }));
                }}
                error={errors.nombres}
                disabled={(isEditing && !isLinkedUnlocked) || isLoading}
                required
              />

              <Input
                label="Apellidos"
                placeholder="Apellidos completos"
                value={apellidosPersona}
                onChange={(e) => {
                  setApellidosPersona(e.target.value);
                  if (errors.apellidos) setErrors((prev) => ({ ...prev, apellidos: '' }));
                }}
                error={errors.apellidos}
                disabled={(isEditing && !isLinkedUnlocked) || isLoading}
                required
              />

              <Input
                label="Teléfono Móvil"
                placeholder="Ej: 987654321"
                value={telefonoPersona}
                onChange={(e) => setTelefonoPersona(e.target.value)}
                disabled={(isEditing && !isLinkedUnlocked) || isLoading}
              />

              <Input
                label="Correo Electrónico"
                type="email"
                placeholder="proveedor@correo.com"
                value={emailPersona}
                onChange={(e) => setEmailPersona(e.target.value)}
                error={errors.email}
                disabled={(isEditing && !isLinkedUnlocked) || isLoading}
              />

              {isEditing && (
                <div className="sm:col-span-2">
                  <Input
                    label="Dirección"
                    placeholder="Ej: Jr. Comercio 456"
                    value={direccionPersona}
                    onChange={(e) => setDireccionPersona(e.target.value)}
                    disabled={!isLinkedUnlocked || isLoading}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* FASE 2: CAMPOS COMERCIALES DE PROVEEDOR (Visible en Creación o en Pestaña Supplier de Edición) */}
        {(!isEditing || editTab === 'supplier') && (
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
              {isEditing ? 'Datos Comerciales del Proveedor' : 'Fase 2: Datos Únicos del Proveedor'}
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Rubro o Categoría"
                placeholder="Ej: Suplementos, Equipamiento, Limpieza, Mantenimiento..."
                value={rubro}
                onChange={(e) => setRubro(e.target.value)}
                disabled={isLoading}
              />

              <Input
                label="Contacto de Referencia (Ejecutivo / Asesor)"
                placeholder="Ej: Juan Pérez - Asesor Comercial"
                value={contactoRef}
                onChange={(e) => setContactoRef(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading} disabled={isLoading}>
            {isEditing ? 'Guardar Cambios' : 'Registrar Proveedor'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
