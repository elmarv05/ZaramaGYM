// ============================================================================
// COMPONENTE: FORMULARIO DE CLIENTE EN 2 FASES Y EDICIÓN DUAL (SLICE 2)
// Fase 1: Nueva Persona vs Persona Existente (!es_cliente)
// Fase 2: Datos Únicos de Cliente (Salud, Emergencia, Peso)
// Edición Dual con RBAC ("Caso Juan Pérez")
// Ubicación: src/features/entities/ClientFormModal.tsx
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  ClientDetail,
  ClientListItem,
  CreateClientInput,
  PersonDocumentType,
  PersonListItem,
  UpdateClientInput,
} from '../../types/entity';
import { AuthSession } from '../../types/auth';
import {
  PERSON_DOCUMENT_TYPES,
  canModifyLinkedPersonData,
  validateClientForm,
} from '../../domain/entity';
import { Modal } from '../../components/primitives/Modal';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';
import { Select } from '../../components/primitives/Select';

export interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingClient?: ClientListItem | ClientDetail | null;
  onSubmitCreate: (input: CreateClientInput) => Promise<ClientDetail | null>;
  onSubmitUpdate: (clientId: number, input: UpdateClientInput) => Promise<ClientDetail | null>;
  persons?: PersonListItem[];
  currentSession?: AuthSession;
  isLoading?: boolean;
}

type PersonSelectionMode = 'new' | 'existing';
type ClientEditTab = 'client_data' | 'person_data';

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  editingClient,
  onSubmitCreate,
  onSubmitUpdate,
  persons = [],
  currentSession,
  isLoading = false,
}) => {
  const isEditing = Boolean(editingClient);

  const [creationMode, setCreationMode] = useState<PersonSelectionMode>('new');
  const [editTab, setEditTab] = useState<ClientEditTab>('client_data');

  // Selección de persona existente
  const [searchPersonTerm, setSearchPersonTerm] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);

  // Desbloqueo de datos personales en edición dual
  const [isPersonalUnlocked, setIsPersonalUnlocked] = useState(false);

  // Datos personales
  const [tipoDocumento, setTipoDocumento] = useState<PersonDocumentType>('DNI');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');

  // Datos exclusivos de cliente
  const [nombreEmergencia, setNombreEmergencia] = useState('');
  const [numeroEmergencia, setNumeroEmergencia] = useState('');
  const [notasMedicas, setNotasMedicas] = useState('');
  const [pesoInicialKg, setPesoInicialKg] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingClient) {
      setTipoDocumento(editingClient.tipo_documento || 'DNI');
      setNumeroDocumento(editingClient.numero_documento || '');
      setNombres(editingClient.nombres || '');
      setApellidos(editingClient.apellidos || '');
      setFechaNacimiento(
        (editingClient as ClientDetail).fecha_nacimiento ||
          editingClient.fecha_nacimiento ||
          ''
      );
      setTelefono(editingClient.telefono || '');
      setEmail(editingClient.email || '');
      setDireccion(
        (editingClient as ClientDetail).direccion || editingClient.direccion || ''
      );

      setNombreEmergencia(
        (editingClient as ClientDetail).nombre_contacto_emergencia ||
          editingClient.nombre_contacto_emergencia ||
          ''
      );
      setNumeroEmergencia(
        (editingClient as ClientDetail).numero_contacto_emergencia ||
          editingClient.numero_contacto_emergencia ||
          ''
      );
      setNotasMedicas(
        (editingClient as ClientDetail).notas_medicas ||
          editingClient.notas_medicas ||
          ''
      );
      setPesoInicialKg(
        editingClient.peso_actual_kg ? String(editingClient.peso_actual_kg) : ''
      );

      setCreationMode('new');
      setEditTab('client_data');
      setIsPersonalUnlocked(false);
    } else {
      setCreationMode('new');
      setEditTab('client_data');
      setIsPersonalUnlocked(false);
      setSearchPersonTerm('');
      setSelectedPersonId(null);

      setTipoDocumento('DNI');
      setNumeroDocumento('');
      setNombres('');
      setApellidos('');
      setFechaNacimiento('');
      setTelefono('');
      setEmail('');
      setDireccion('');

      setNombreEmergencia('');
      setNumeroEmergencia('');
      setNotasMedicas('');
      setPesoInicialKg('');
    }
    setErrors({});
  }, [editingClient, isOpen]);

  // Permiso RBAC para modificar datos personales
  const canUnlockPersonalData = useMemo(() => {
    if (!isEditing || !editingClient) return true;
    return canModifyLinkedPersonData(
      currentSession?.rol,
      editingClient.persona_rol_usuario
    );
  }, [isEditing, editingClient, currentSession]);

  // Personas disponibles para convertir en clientes (!p.es_cliente)
  const availablePersons = useMemo(() => {
    const list = persons.filter((p) => !p.es_cliente);
    if (!searchPersonTerm.trim()) return list.slice(0, 10);
    const term = searchPersonTerm.toLowerCase();
    return list.filter(
      (p) =>
        p.numero_documento.includes(term) ||
        p.nombres.toLowerCase().includes(term) ||
        p.apellidos.toLowerCase().includes(term)
    );
  }, [persons, searchPersonTerm]);

  const selectedPerson = useMemo(() => {
    return persons.find((p) => p.id === selectedPersonId) || null;
  }, [persons, selectedPersonId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // MODO EDICIÓN
    if (isEditing && editingClient) {
      const updateData: UpdateClientInput = {
        modificar_datos_personales: isPersonalUnlocked,
        nombre_contacto_emergencia: nombreEmergencia.trim() || null,
        numero_contacto_emergencia: numeroEmergencia.trim() || null,
        notas_medicas: notasMedicas.trim() || null,
      };

      if (isPersonalUnlocked) {
        updateData.tipo_documento = tipoDocumento;
        updateData.numero_documento = numeroDocumento.trim();
        updateData.nombres = nombres.trim();
        updateData.apellidos = apellidos.trim();
        updateData.fecha_nacimiento = fechaNacimiento.trim() || null;
        updateData.telefono = telefono.trim() || null;
        updateData.email = email.trim() || null;
        updateData.direccion = direccion.trim() || null;
      }

      const val = validateClientForm(updateData);
      if (!val.isValid) {
        setErrors(val.errors);
        if (
          val.errors.nombres ||
          val.errors.apellidos ||
          val.errors.numero_documento ||
          val.errors.fecha_nacimiento ||
          val.errors.telefono ||
          val.errors.email
        ) {
          setEditTab('person_data');
        }
        return;
      }

      const result = await onSubmitUpdate(editingClient.id, updateData);
      if (result) onClose();
      return;
    }

    // MODO CREACIÓN
    if (creationMode === 'existing') {
      if (!selectedPersonId) {
        setErrors({ selectedPerson: 'Debes seleccionar una persona existente.' });
        return;
      }

      const createData: CreateClientInput = {
        persona_id: selectedPersonId,
        nombre_contacto_emergencia: nombreEmergencia.trim() || null,
        numero_contacto_emergencia: numeroEmergencia.trim() || null,
        notas_medicas: notasMedicas.trim() || null,
        peso_inicial_kg: pesoInicialKg.trim() ? pesoInicialKg.trim() : null,
      };

      const val = validateClientForm(createData);
      if (!val.isValid) {
        setErrors(val.errors);
        return;
      }

      const result = await onSubmitCreate(createData);
      if (result) onClose();
    } else {
      // Crear nueva persona + cliente
      const createData: CreateClientInput = {
        tipo_documento: tipoDocumento,
        numero_documento: numeroDocumento.trim(),
        nombres: nombres.trim(),
        apellidos: apellidos.trim(),
        fecha_nacimiento: fechaNacimiento.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        direccion: direccion.trim() || null,
        nombre_contacto_emergencia: nombreEmergencia.trim() || null,
        numero_contacto_emergencia: numeroEmergencia.trim() || null,
        notas_medicas: notasMedicas.trim() || null,
        peso_inicial_kg: pesoInicialKg.trim() ? pesoInicialKg.trim() : null,
      };

      const val = validateClientForm(createData);
      if (!val.isValid) {
        setErrors(val.errors);
        return;
      }

      const result = await onSubmitCreate(createData);
      if (result) onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar Datos del Cliente' : 'Inscribir Nuevo Socio Cliente'}
      description="Registra la persona, credencial QR, datos de emergencia y peso inicial."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* En Creación: Selector de Modo (Nueva Persona vs Existente) */}
        {!isEditing ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-txt-muted uppercase tracking-wider">
              Fase 1: Entidad Base (Persona Natural)
            </label>
            <div className="flex rounded-lg bg-canvas-subtle p-1 border border-border">
              <button
                type="button"
                onClick={() => {
                  setCreationMode('new');
                  setErrors({});
                }}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${
                  creationMode === 'new'
                    ? 'bg-surface text-txt-primary shadow-xs font-bold'
                    : 'text-txt-muted hover:text-txt-primary'
                }`}
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                <span>Crear Nueva Persona</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreationMode('existing');
                  setErrors({});
                }}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${
                  creationMode === 'existing'
                    ? 'bg-surface text-txt-primary shadow-xs font-bold'
                    : 'text-txt-muted hover:text-txt-primary'
                }`}
              >
                <Icon name="search" className="w-3.5 h-3.5" />
                <span>Elegir Persona Existente</span>
              </button>
            </div>
          </div>
        ) : (
          /* En Edición: Selector de Pestañas (Salud/Emergencia vs Persona) */
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setEditTab('client_data')}
              className={`py-2 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                editTab === 'client_data'
                  ? 'border-brand text-brand'
                  : 'border-transparent text-txt-muted hover:text-txt-primary'
              }`}
            >
              1. Salud y Contacto de Emergencia
            </button>
            <button
              type="button"
              onClick={() => setEditTab('person_data')}
              className={`py-2 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                editTab === 'person_data'
                  ? 'border-brand text-brand'
                  : 'border-transparent text-txt-muted hover:text-txt-primary'
              }`}
            >
              2. Datos Personales
            </button>
          </div>
        )}

        {/* FASE 1: PERSONA EXISTENTE (Solo Creación) */}
        {!isEditing && creationMode === 'existing' && (
          <div className="flex flex-col gap-3 p-3 bg-canvas-subtle rounded-lg border border-border">
            <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
              Buscar Persona Existente en el Sistema (Trabajador o Proveedor)
            </span>

            <Input
              placeholder="Buscar por DNI o Nombres..."
              value={searchPersonTerm}
              onChange={(e) => setSearchPersonTerm(e.target.value)}
              aria-label="Buscar persona existente para cliente"
            />

            {errors.selectedPerson && (
              <span className="text-xs text-status-danger font-medium">
                {errors.selectedPerson}
              </span>
            )}

            {selectedPerson && (
              <div className="p-3 bg-surface rounded-lg border-2 border-brand flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-txt-primary flex items-center gap-1.5">
                    <Icon name="user" className="w-4 h-4 text-brand" />
                    <span>
                      {selectedPerson.nombres} {selectedPerson.apellidos}
                    </span>
                  </div>
                  <div className="text-xs text-txt-muted font-mono">
                    {selectedPerson.tipo_documento}: {selectedPerson.numero_documento}{' '}
                    {selectedPerson.telefono ? `| Tel: ${selectedPerson.telefono}` : ''}
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

            {!selectedPersonId && (
              <div className="max-h-40 overflow-y-auto flex flex-col gap-1 border border-border rounded-md bg-surface p-1">
                {availablePersons.length === 0 ? (
                  <div className="text-xs text-txt-muted p-2 text-center">
                    No se encontraron personas disponibles que no sean ya socios.
                  </div>
                ) : (
                  availablePersons.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedPersonId(p.id);
                        setErrors({});
                      }}
                      className="p-2 text-left rounded hover:bg-canvas-subtle flex items-center justify-between transition-colors"
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
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* FASE 1: DATOS PERSONALES (Creación Nueva Persona o Pestaña Persona en Edición) */}
        {((!isEditing && creationMode === 'new') ||
          (isEditing && editTab === 'person_data')) && (
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
                {isEditing ? 'Datos de la Persona' : '1. Datos Personales'}
              </span>
              {isEditing && (
                <Button
                  type="button"
                  variant={isPersonalUnlocked ? 'primary' : 'outline'}
                  size="sm"
                  disabled={!canUnlockPersonalData}
                  leftIcon={<Icon name={isPersonalUnlocked ? 'lock' : 'key'} className="w-3.5 h-3.5" />}
                  onClick={() => setIsPersonalUnlocked(!isPersonalUnlocked)}
                  title={
                    !canUnlockPersonalData
                      ? 'Protegido por jerarquía RBAC: solo puedes editar los datos de socio'
                      : undefined
                  }
                >
                  {isPersonalUnlocked
                    ? 'Bloquear edición personal'
                    : 'Modificar datos personales'}
                </Button>
              )}
            </div>

            {isEditing && !canUnlockPersonalData && (
              <div className="p-2.5 bg-status-warning-bg border border-amber-300 rounded text-xs text-status-warning">
                Protegido por jerarquía RBAC: este socio cuenta con credenciales de usuario del sistema y tus permisos no permiten alterar sus datos personales.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Tipo de Documento"
                options={PERSON_DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value as PersonDocumentType)}
                error={errors.tipo_documento}
                disabled={(isEditing && !isPersonalUnlocked) || isLoading}
                required
              />

              <Input
                label="Número de Documento"
                placeholder="Ej: 8 dígitos DNI u 11 RUC 10/15/17"
                value={numeroDocumento}
                onChange={(e) => {
                  setNumeroDocumento(e.target.value);
                  if (errors.numero_documento) {
                    setErrors((prev) => ({ ...prev, numero_documento: '' }));
                  }
                }}
                error={errors.numero_documento}
                disabled={(isEditing && !isPersonalUnlocked) || isLoading}
                required
              />

              <Input
                label="Nombres"
                placeholder="Nombres completos"
                value={nombres}
                onChange={(e) => {
                  setNombres(e.target.value);
                  if (errors.nombres) setErrors((prev) => ({ ...prev, nombres: '' }));
                }}
                error={errors.nombres}
                disabled={(isEditing && !isPersonalUnlocked) || isLoading}
                required
              />

              <Input
                label="Apellidos"
                placeholder="Apellidos completos"
                value={apellidos}
                onChange={(e) => {
                  setApellidos(e.target.value);
                  if (errors.apellidos) setErrors((prev) => ({ ...prev, apellidos: '' }));
                }}
                error={errors.apellidos}
                disabled={(isEditing && !isPersonalUnlocked) || isLoading}
                required
              />

              <Input
                label="Fecha de Nacimiento"
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                error={errors.fecha_nacimiento}
                disabled={(isEditing && !isPersonalUnlocked) || isLoading}
              />

              <Input
                label="Teléfono Móvil (WhatsApp)"
                placeholder="Ej: 987654321"
                value={telefono}
                onChange={(e) => {
                  setTelefono(e.target.value);
                  if (errors.telefono) setErrors((prev) => ({ ...prev, telefono: '' }));
                }}
                error={errors.telefono}
                disabled={(isEditing && !isPersonalUnlocked) || isLoading}
              />

              <div className="sm:col-span-2">
                <Input
                  label="Correo Electrónico"
                  type="email"
                  placeholder="cliente@correo.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  error={errors.email}
                  disabled={(isEditing && !isPersonalUnlocked) || isLoading}
                />
              </div>

              {isEditing && (
                <div className="sm:col-span-2">
                  <Input
                    label="Dirección"
                    placeholder="Ej: Jr. Amazonas 789"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    disabled={!isPersonalUnlocked || isLoading}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* FASE 2: DATOS DE SOCIO, SALUD Y EMERGENCIA (Visible en Creación o en Pestaña Salud en Edición) */}
        {(!isEditing || editTab === 'client_data') && (
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
              {isEditing
                ? 'Datos del Cliente (Salud y Emergencia)'
                : 'Fase 2: Datos Únicos del Cliente (Salud y Emergencia)'}
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Nombre de Contacto de Emergencia"
                placeholder="Ej: María Gómez (Madre)"
                value={nombreEmergencia}
                onChange={(e) => setNombreEmergencia(e.target.value)}
                disabled={isLoading}
              />

              <Input
                label="Teléfono de Emergencia"
                placeholder="Ej: 912345678"
                value={numeroEmergencia}
                onChange={(e) => setNumeroEmergencia(e.target.value)}
                error={errors.numero_contacto_emergencia}
                hint="Solo para emergencias. El celular para WhatsApp se edita en la pestaña '2. Datos Personales'."
                disabled={isLoading}
              />

              <div className="sm:col-span-2">
                <Input
                  label="Notas Médicas / Alergias / Observaciones"
                  placeholder="Ej: Hipertensión, lesión en rodilla izquierda, asma..."
                  value={notasMedicas}
                  onChange={(e) => setNotasMedicas(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {!isEditing && (
                <Input
                  label="Peso Inicial (kg) (Opcional)"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="Ej: 72.50"
                  value={pesoInicialKg}
                  onChange={(e) => setPesoInicialKg(e.target.value)}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) {
                      setPesoInicialKg(v.toFixed(2));
                    }
                  }}
                  error={errors.peso_inicial_kg}
                  disabled={isLoading}
                />
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading} disabled={isLoading}>
            {isEditing ? 'Guardar Cambios' : 'Registrar Cliente'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
