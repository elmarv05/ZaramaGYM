// ============================================================================
// COMPONENTE: GESTIÓN DE USUARIOS DEL SISTEMA (USER MANAGEMENT TABLE)
// Accesible para Administradores (Sistema de 2 roles con foto de perfil)
// Creación en 2 Fases (Nueva Persona vs Persona Existente) y Edición Dual con RBAC
// Ubicación: src/features/auth/UserManagementTable.tsx
// ============================================================================

import React, { useState, useMemo, useRef } from 'react';
import {
  AuthSession,
  CreateUserInput,
  UpdateUserInput,
  UserListItem,
  AppError,
  UserRole,
} from '../../types/auth';
import { PersonDocumentType, PersonListItem, UpdatePersonInput } from '../../types/entity';
import {
  validateCreateUserInput,
  VALID_DOCUMENT_TYPES,
  fileToDataUrl,
} from '../../domain/user';
import { canModifyLinkedPersonData, validatePersonForm } from '../../domain/entity';
import { userIpc } from '../../services/ipc/userIpc';
import { Button } from '../../components/primitives/Button';
import { Badge } from '../../components/primitives/Badge';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';
import { Select } from '../../components/primitives/Select';
import { Modal } from '../../components/primitives/Modal';
import { preventEnterKeySubmit } from '../../utils/formSafety';
import { Alert } from '../../components/primitives/Alert';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
  TableLoadingSkeleton,
} from '../../components/primitives/Table';
import {
  EntityFlashCard,
  EntityFlashCardEmptyState,
  EntityFlashCardGrid,
  EntityFlashCardSkeletonGrid,
} from '../entities/EntityFlashCard';
import { EntityProfileModal } from '../entities/EntityProfileModal';

export interface UserManagementTableProps {
  currentSession: AuthSession;
  users: UserListItem[];
  persons?: PersonListItem[];
  isLoading: boolean;
  isActionLoading: boolean;
  error: AppError | null;
  onRefresh: () => void;
  onCreateUser: (input: CreateUserInput) => Promise<boolean>;
  onUpdateUser?: (userId: number, input: UpdateUserInput) => Promise<boolean>;
  onToggleActive: (userId: number, currentActive: boolean) => Promise<boolean>;
  onUpdatePhoto?: (userId: number, photoDataUrl: string | null) => Promise<boolean>;
  onClearError?: () => void;
}

type PersonSelectionMode = 'new' | 'existing';
type UserEditTab = 'account' | 'person';

export const UserManagementTable: React.FC<UserManagementTableProps> = ({
  currentSession,
  users,
  persons = [],
  isLoading,
  isActionLoading,
  error,
  onRefresh,
  onCreateUser,
  onUpdateUser,
  onToggleActive,
  onUpdatePhoto,
  onClearError,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedProfileUser, setSelectedProfileUser] = useState<UserListItem | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activePhotoUserId, setActivePhotoUserId] = useState<number | null>(null);
  const tableFileInputRef = useRef<HTMLInputElement>(null);

  // Estados de Creación en 2 Fases
  const [creationMode, setCreationMode] = useState<PersonSelectionMode>('new');
  const [searchPersonTerm, setSearchPersonTerm] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);

  // Formulario nuevo usuario
  const [formData, setFormData] = useState<CreateUserInput>({
    username: '',
    password: '',
    tipo_documento: 'DNI',
    numero_documento: '',
    nombres: '',
    apellidos: '',
    telefono: '',
    email: '',
    rol: 'RECEPCIONISTA',
    foto_perfil_data_url: null,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [modalPhotoPreview, setModalPhotoPreview] = useState<string | null>(null);

  // Estados de Edición Dual de Usuario
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [editTab, setEditTab] = useState<UserEditTab>('account');
  const [isPersonalUnlocked, setIsPersonalUnlocked] = useState(false);

  // Campos edición usuario
  const [editUsername, setEditUsername] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editRol, setEditRol] = useState<UserRole>('RECEPCIONISTA');
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);

  // Campos edición persona vinculada
  const [editTipoDoc, setEditTipoDoc] = useState<PersonDocumentType>('DNI');
  const [editNumDoc, setEditNumDoc] = useState('');
  const [editNombres, setEditNombres] = useState('');
  const [editApellidos, setEditApellidos] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const isAdmin = currentSession.rol === 'ADMINISTRADOR';

  // Opciones de Rol (Sistema consolidado a 2 roles)
  const availableRoles: { value: UserRole; label: string }[] = useMemo(() => {
    return [
      { value: 'RECEPCIONISTA', label: 'RECEPCIONISTA (Operativo)' },
      { value: 'ADMINISTRADOR', label: 'ADMINISTRADOR (Total)' },
    ];
  }, []);

  // Filtrado local de usuarios
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(term) ||
        u.nombres.toLowerCase().includes(term) ||
        (u.apellidos && u.apellidos.toLowerCase().includes(term)) ||
        u.numero_documento.includes(term)
    );
  }, [users, searchTerm]);

  // Personas disponibles para asignarles cuenta (!p.rol_usuario)
  const availablePersonsForUser = useMemo(() => {
    const list = persons.filter((p) => !p.rol_usuario);
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

  const getInitials = (name: string): string => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleOpenCreateModal = () => {
    setCreationMode('new');
    setSelectedPersonId(null);
    setSearchPersonTerm('');
    setFormData({
      username: '',
      password: '',
      tipo_documento: 'DNI',
      numero_documento: '',
      nombres: '',
      apellidos: '',
      telefono: '',
      email: '',
      rol: 'RECEPCIONISTA',
      foto_perfil_data_url: null,
    });
    setModalPhotoPreview(null);
    setFormErrors({});
    if (onClearError) onClearError();
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    setCreationMode('new');
    setSelectedPersonId(null);
    setModalPhotoPreview(null);
    setFormErrors({});
    if (onClearError) onClearError();
  };

  const handleModalPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setModalPhotoPreview(dataUrl);
      setFormData((prev) => ({ ...prev, foto_perfil_data_url: dataUrl }));
    } catch (err) {
      console.error('Error al procesar foto:', err);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onClearError) onClearError();

    if (creationMode === 'existing') {
      if (!selectedPersonId) {
        setFormErrors({ selectedPerson: 'Debes seleccionar una persona existente.' });
        return;
      }

      const inputToSend: CreateUserInput = {
        persona_id: selectedPersonId,
        username: formData.username.trim(),
        password: formData.password,
        rol: formData.rol,
        foto_perfil_data_url: formData.foto_perfil_data_url || null,
      };

      const validation = validateCreateUserInput(inputToSend);
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        return;
      }

      setFormErrors({});
      const success = await onCreateUser(inputToSend);
      if (success) {
        setIsCreateModalOpen(false);
        setModalPhotoPreview(null);
      }
    } else {
      // Modo nueva persona
      const validation = validateCreateUserInput(formData);
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        return;
      }

      setFormErrors({});
      const success = await onCreateUser(formData);
      if (success) {
        setIsCreateModalOpen(false);
        setModalPhotoPreview(null);
      }
    }
  };

  // --------------------------------------------------------------------------
  // EDICIÓN DE USUARIO
  // --------------------------------------------------------------------------
  const handleOpenEditModal = (user: UserListItem) => {
    setEditingUser(user);
    setEditUsername(user.username);
    setEditNewPassword('');
    setEditRol(user.rol);
    setEditPhotoPreview(user.foto_perfil_data_url || null);

    setEditTipoDoc((user.tipo_documento as PersonDocumentType) || 'DNI');
    setEditNumDoc(user.numero_documento);
    setEditNombres(user.nombres);
    setEditApellidos(user.apellidos);
    setEditTelefono(user.telefono || '');
    setEditEmail(user.email || '');
    setEditDireccion(user.direccion || '');

    setEditTab('account');
    setIsPersonalUnlocked(false);
    setEditErrors({});
    if (onClearError) onClearError();
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingUser(null);
    setEditErrors({});
    if (onClearError) onClearError();
  };

  const handleEditPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setEditPhotoPreview(dataUrl);
    } catch (err) {
      console.error('Error al procesar foto:', err);
    }
  };

  const canUnlockUserPersonalData = useMemo(() => {
    if (!editingUser) return true;
    return canModifyLinkedPersonData(currentSession.rol, editingUser.rol);
  }, [editingUser, currentSession]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (onClearError) onClearError();
    setEditErrors({});

    const nextAccountErrors: Record<string, string> = {};
    const cleanUsername = editUsername.trim();
    if (!cleanUsername) {
      nextAccountErrors.username = 'El nombre de usuario es obligatorio.';
    } else if (cleanUsername.length < 3) {
      nextAccountErrors.username = 'El nombre de usuario debe tener al menos 3 caracteres.';
    } else if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
      nextAccountErrors.username =
        'El usuario solo puede contener letras, números y los caracteres _ . -';
    }
    if (editNewPassword.trim() && editNewPassword.length < 6) {
      nextAccountErrors.new_password = 'La nueva contraseña debe tener al menos 6 caracteres.';
    }
    if (Object.keys(nextAccountErrors).length > 0) {
      setEditErrors(nextAccountErrors);
      setEditTab('account');
      return;
    }

    let personaData: UpdatePersonInput | null = null;

    if (isPersonalUnlocked) {
      const pVal = validatePersonForm({
        tipo_documento: editTipoDoc,
        numero_documento: editNumDoc,
        nombres: editNombres,
        apellidos: editApellidos,
        telefono: editTelefono || null,
        email: editEmail || null,
        direccion: editDireccion || null,
      });

      if (!pVal.isValid) {
        setEditErrors(pVal.errors);
        setEditTab('person');
        return;
      }

      personaData = {
        tipo_documento: editTipoDoc,
        numero_documento: editNumDoc.trim(),
        nombres: editNombres.trim(),
        apellidos: editApellidos.trim(),
        telefono: editTelefono.trim() || null,
        email: editEmail.trim() || null,
        direccion: editDireccion.trim() || null,
      };
    }

    const updatePayload: UpdateUserInput = {
      username: editUsername.trim() || undefined,
      new_password: editNewPassword.trim() ? editNewPassword : null,
      rol: editRol,
      foto_perfil_data_url: editPhotoPreview,
      persona_data: personaData,
    };

    let success = false;
    if (onUpdateUser) {
      success = await onUpdateUser(editingUser.id, updatePayload);
    } else {
      await userIpc.updateUser(editingUser.id, updatePayload);
      onRefresh();
      success = true;
    }

    if (success) {
      setIsEditModalOpen(false);
      setEditingUser(null);
    }
  };

  // Subir/Cambiar foto desde una fila de la tabla
  const handleTriggerRowPhotoUpload = (userId: number) => {
    setActivePhotoUserId(userId);
    if (tableFileInputRef.current) {
      tableFileInputRef.current.click();
    }
  };

  const handleRowPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetUserId = activePhotoUserId;
    if (!file || !targetUserId) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      if (onUpdatePhoto) {
        await onUpdatePhoto(targetUserId, dataUrl);
      } else {
        await userIpc.updateUserPhoto(targetUserId, dataUrl);
        onRefresh();
      }
    } catch (err) {
      console.error('Error al actualizar foto de usuario:', err);
    } finally {
      setActivePhotoUserId(null);
      if (tableFileInputRef.current) {
        tableFileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Input oculto para cambio de foto en fila */}
      <input
        ref={tableFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleRowPhotoChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Barra de Herramientas Superior */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Input
              placeholder="Buscar por usuario, nombre o doc..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar usuarios"
              leftIcon={
                <svg className="w-4 h-4 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              }
            />
          </div>
          <div
            role="group"
            aria-label="Modo de visualización de usuarios"
            className="inline-flex items-center rounded-lg bg-canvas-subtle p-0.5 border border-border"
          >
            <Button
              type="button"
              variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
              title="Vista de tarjetas interactivas"
              leftIcon={<Icon name="dashboard" className="w-3.5 h-3.5" aria-hidden="true" />}
              className={`min-h-[28px] px-2.5 py-1 text-xs font-semibold ${
                viewMode === 'cards'
                  ? 'shadow-xs'
                  : 'text-txt-muted hover:text-txt-primary border border-transparent'
              }`}
            >
              Tarjetas
            </Button>
            <Button
              type="button"
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              title="Vista de tabla clásica"
              leftIcon={<Icon name="menu" className="w-3.5 h-3.5" aria-hidden="true" />}
              className={`min-h-[28px] px-2.5 py-1 text-xs font-semibold ${
                viewMode === 'table'
                  ? 'shadow-xs'
                  : 'text-txt-muted hover:text-txt-primary border border-transparent'
              }`}
            >
              Tabla
            </Button>
          </div>

          <Button
            variant="secondary"
            size="md"
            onClick={onRefresh}
            disabled={isLoading || isActionLoading}
            title="Actualizar lista de usuarios"
          >
            Refrescar
          </Button>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreateModal}
          disabled={isLoading || isActionLoading}
          leftIcon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Nuevo Usuario
        </Button>
      </div>

      {/* Mensaje de Error en Alerta */}
      {error && (
        <Alert
          variant="danger"
          title="Error en la gestión de usuarios"
          actionText="Reintentar carga"
          onAction={onRefresh}
          onClose={onClearError}
        >
          {error.message}
        </Alert>
      )}

      {/* Vista de Usuarios: Flash Cards (por defecto) o Tabla */}
      {viewMode === 'cards' ? (
        isLoading ? (
          <EntityFlashCardSkeletonGrid count={6} />
        ) : filteredUsers.length === 0 ? (
          <EntityFlashCardEmptyState
            icon="users"
            title="No hay usuarios registrados"
            description={
              searchTerm
                ? 'No se encontraron usuarios que coincidan con la búsqueda.'
                : 'Crea el primer usuario u operador del sistema con el botón superior.'
            }
            action={
              <Button variant="primary" size="sm" onClick={handleOpenCreateModal}>
                Crear Usuario
              </Button>
            }
          />
        ) : (
          <EntityFlashCardGrid>
            {filteredUsers.map((user) => {
              const isCurrentUser = user.id === currentSession.user_id;
              const isRootAdmin = user.id === 1;

              const canToggle = !isCurrentUser && !isRootAdmin && isAdmin;

              const canEdit = isCurrentUser || isAdmin;

              const canUploadPhoto = isCurrentUser || isAdmin;

              const fullName = `${user.nombres} ${user.apellidos}`.trim();

              return (
                <EntityFlashCard
                  key={user.id}
                  entityTag="USUARIO"
                  entityTagVariant={
                    user.rol === 'ADMINISTRADOR' ? 'default' : 'info'
                  }
                  secondaryBadges={[
                    {
                      label: user.rol,
                      variant: user.rol === 'ADMINISTRADOR' ? 'default' : 'info',
                    },
                  ]}
                  isActive={user.estado_activo}
                  avatarPhotoUrl={user.foto_perfil_data_url}
                  avatarInitials={getInitials(user.nombres)}
                  onAvatarClick={
                    canUploadPhoto ? () => handleTriggerRowPhotoUpload(user.id) : undefined
                  }
                  avatarActionTitle="Cambiar foto de este usuario"
                  title={fullName}
                  subtitleTag={
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-accent-indigo">
                        @{user.username}
                      </span>
                      {isCurrentUser && (
                        <span className="text-[10px] text-status-info font-bold uppercase tracking-wider">
                          (Tu cuenta activa)
                        </span>
                      )}
                    </div>
                  }
                  documentLabel={`${user.tipo_documento}: ${user.numero_documento}`}
                  phone={user.telefono}
                  email={user.email}
                  metrics={[
                    {
                      label: 'Rol Asignado',
                      value: <span>{user.rol}</span>,
                    },
                    {
                      label: 'Último Acceso',
                      value: (
                        <span className="font-mono text-[11px] truncate">
                          {user.ultimo_login ? user.ultimo_login : 'Nunca'}
                        </span>
                      ),
                    },
                  ]}
                  quickActions={
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canEdit || isActionLoading}
                        onClick={() => handleOpenEditModal(user)}
                      >
                        Editar
                      </Button>

                      <Button
                        variant={user.estado_activo ? 'outline' : 'secondary'}
                        size="sm"
                        disabled={!canToggle || isActionLoading}
                        onClick={() => onToggleActive(user.id, user.estado_activo)}
                        title={
                          isCurrentUser
                            ? 'No puedes desactivar tu propia cuenta en sesión'
                            : isRootAdmin
                            ? 'El Administrador Root no puede ser desactivado'
                            : !canToggle
                            ? 'No tienes permisos suficientes para alternar a este usuario'
                            : user.estado_activo
                            ? 'Desactivar acceso a este usuario'
                            : 'Reactivar acceso a este usuario'
                        }
                        className={
                          user.estado_activo
                            ? 'text-status-danger border-status-danger-border hover:bg-status-danger-bg'
                            : 'text-status-success border-status-success-border hover:bg-status-success-bg'
                        }
                      >
                        {user.estado_activo ? 'Desactivar' : 'Activar'}
                      </Button>
                    </>
                  }
                  onOpenProfile={() => setSelectedProfileUser(user)}
                />
              );
            })}
          </EntityFlashCardGrid>
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Foto</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Nombres y Apellidos</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Último Acceso</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableLoadingSkeleton colSpan={8} rows={4} />
            ) : filteredUsers.length === 0 ? (
              <TableEmptyState
                colSpan={8}
                title="No hay usuarios registrados"
                description={
                  searchTerm
                    ? 'No se encontraron usuarios que coincidan con la búsqueda.'
                    : 'Crea el primer usuario u operador del sistema con el botón superior.'
                }
                action={
                  <Button variant="primary" size="sm" onClick={handleOpenCreateModal}>
                    Crear Usuario
                  </Button>
                }
              />
            ) : (
              filteredUsers.map((user) => {
                const isCurrentUser = user.id === currentSession.user_id;
                const isRootAdmin = user.id === 1;

                const canToggle = !isCurrentUser && !isRootAdmin && isAdmin;

                const canEdit = isCurrentUser || isAdmin;

                const canUploadPhoto = isCurrentUser || isAdmin;

                return (
                  <TableRow
                    key={user.id}
                    className={!user.estado_activo ? 'opacity-60 bg-canvas-subtle/50' : ''}
                  >
                    <TableCell>
                      <div className="relative group w-10 h-10">
                        <div className="w-10 h-10 rounded-full overflow-hidden border border-border bg-surface flex items-center justify-center font-bold text-xs text-txt-secondary">
                          {user.foto_perfil_data_url ? (
                            <img
                              src={user.foto_perfil_data_url}
                              alt={`Foto de ${user.username}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>{getInitials(user.nombres)}</span>
                          )}
                        </div>

                        {canUploadPhoto && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleTriggerRowPhotoUpload(user.id)}
                            title="Cambiar foto de este usuario"
                            aria-label={`Cambiar foto de ${user.username}`}
                            className="absolute inset-0 min-h-0 min-w-0 p-0 bg-black/40 hover:bg-black/55 text-white hover:text-white rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                          </Button>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-txt-primary">@{user.username}</span>
                        {isCurrentUser && (
                          <span className="text-[10px] text-status-info font-bold uppercase tracking-wider">
                            (Tu cuenta activa)
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="font-medium text-txt-primary">
                        {user.nombres} {user.apellidos}
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-xs text-txt-secondary">
                        {user.tipo_documento}: {user.numero_documento}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={user.rol === 'ADMINISTRADOR' ? 'default' : 'info'}
                        size="sm"
                      >
                        {user.rol}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge variant={user.estado_activo ? 'success' : 'danger'} size="sm">
                        {user.estado_activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-txt-muted">
                        {user.ultimo_login ? user.ultimo_login : 'Nunca'}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedProfileUser(user)}
                        >
                          Ver perfil
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canEdit || isActionLoading}
                          onClick={() => handleOpenEditModal(user)}
                        >
                          Editar
                        </Button>

                        <Button
                          variant={user.estado_activo ? 'outline' : 'secondary'}
                          size="sm"
                          disabled={!canToggle || isActionLoading}
                          onClick={() => onToggleActive(user.id, user.estado_activo)}
                          title={
                            isCurrentUser
                              ? 'No puedes desactivar tu propia cuenta en sesión'
                              : isRootAdmin
                              ? 'El Administrador Root no puede ser desactivado'
                              : !canToggle
                              ? 'No tienes permisos suficientes para alternar a este usuario'
                              : user.estado_activo
                              ? 'Desactivar acceso a este usuario'
                              : 'Reactivar acceso a este usuario'
                          }
                          className={
                            user.estado_activo
                              ? 'text-status-danger border-status-danger-border hover:bg-status-danger-bg'
                              : 'text-status-success border-status-success-border hover:bg-status-success-bg'
                          }
                        >
                          {user.estado_activo ? 'Desactivar' : 'Activar'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}

      {/* Modal de Perfil Interactivo de Usuario */}
      <EntityProfileModal
        isOpen={Boolean(selectedProfileUser)}
        onClose={() => setSelectedProfileUser(null)}
        subject={
          selectedProfileUser
            ? {
                kind: 'user',
                data:
                  users.find((u) => u.id === selectedProfileUser.id) ?? selectedProfileUser,
              }
            : null
        }
        currentSession={currentSession}
        isActionLoading={isActionLoading}
        onUpdateUser={onUpdateUser}
        onToggleActive={onToggleActive}
        onOpenAdvancedEdit={
          selectedProfileUser
            ? () => {
                const target =
                  users.find((u) => u.id === selectedProfileUser.id) ?? selectedProfileUser;
                setSelectedProfileUser(null);
                handleOpenEditModal(target);
              }
            : undefined
        }
      />

      {/* ==================================================================== */}
      {/* MODAL PARA CREAR NUEVO USUARIO (EN 2 FASES) */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        title="Crear Nuevo Usuario del Sistema"
        description="Registra un operador con credenciales y rol de sistema (Administrador o Recepcionista)."
        size="lg"
      >
        <form
          noValidate
          onSubmit={handleCreateSubmit}
          onKeyDown={preventEnterKeySubmit}
          className="flex flex-col gap-4"
        >
          {/* Fase 1: Modo Selección de Persona */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-txt-muted uppercase tracking-wider">
              Fase 1: Persona Natural Vinculada
            </label>
            <div className="flex rounded-lg bg-canvas-subtle p-1 border border-border gap-1">
              <Button
                type="button"
                variant={creationMode === 'new' ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={creationMode === 'new'}
                onClick={() => {
                  setCreationMode('new');
                  setFormErrors({});
                }}
                leftIcon={<Icon name="plus" className="w-3.5 h-3.5" aria-hidden="true" />}
                className={`flex-1 min-h-[30px] text-xs ${
                  creationMode === 'new'
                    ? 'shadow-xs font-bold'
                    : 'text-txt-muted hover:text-txt-primary border border-transparent'
                }`}
              >
                Crear Nueva Persona
              </Button>
              <Button
                type="button"
                variant={creationMode === 'existing' ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={creationMode === 'existing'}
                onClick={() => {
                  setCreationMode('existing');
                  setFormErrors({});
                }}
                leftIcon={<Icon name="search" className="w-3.5 h-3.5" aria-hidden="true" />}
                className={`flex-1 min-h-[30px] text-xs ${
                  creationMode === 'existing'
                    ? 'shadow-xs font-bold'
                    : 'text-txt-muted hover:text-txt-primary border border-transparent'
                }`}
              >
                Elegir Persona Existente
              </Button>
            </div>
          </div>

          {/* Persona Existente */}
          {creationMode === 'existing' && (
            <div className="flex flex-col gap-3 p-3 bg-canvas-subtle rounded-lg border border-border">
              <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
                Buscar Persona sin Usuario en el Directorio
              </span>

              <Input
                placeholder="Buscar por DNI o Nombres..."
                value={searchPersonTerm}
                onChange={(e) => setSearchPersonTerm(e.target.value)}
                aria-label="Buscar persona existente para usuario"
              />

              {formErrors.selectedPerson && (
                <span className="text-xs text-status-danger font-medium">
                  {formErrors.selectedPerson}
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
                  {availablePersonsForUser.length === 0 ? (
                    <div className="text-xs text-txt-muted p-2 text-center">
                      No se encontraron personas disponibles sin rol de usuario.
                    </div>
                  ) : (
                    availablePersonsForUser.map((p) => (
                      <Button
                        key={p.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedPersonId(p.id);
                          setFormErrors({});
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

          {/* Nueva Persona: Inputs Personales */}
          {creationMode === 'new' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-border">
              <span className="sm:col-span-2 text-xs font-bold text-txt-muted uppercase tracking-wider">
                Datos de la Nueva Persona
              </span>

              <Select
                label="Tipo de Documento"
                options={VALID_DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
                value={formData.tipo_documento || 'DNI'}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, tipo_documento: e.target.value }))
                }
                error={formErrors.tipo_documento}
                disabled={isActionLoading}
                required
              />

              <Input
                label="Número de Documento"
                placeholder="Ej: 8 dígitos DNI u 11 RUC 10/15/17"
                value={formData.numero_documento || ''}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, numero_documento: e.target.value }));
                  if (formErrors.numero_documento) {
                    setFormErrors((prev) => ({ ...prev, numero_documento: '' }));
                  }
                }}
                error={formErrors.numero_documento}
                disabled={isActionLoading}
                required
              />

              <Input
                label="Nombres"
                placeholder="Nombres completos"
                value={formData.nombres || ''}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, nombres: e.target.value }));
                  if (formErrors.nombres) setFormErrors((prev) => ({ ...prev, nombres: '' }));
                }}
                error={formErrors.nombres}
                disabled={isActionLoading}
                required
              />

              <Input
                label="Apellidos"
                placeholder="Apellidos completos"
                value={formData.apellidos || ''}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, apellidos: e.target.value }));
                  if (formErrors.apellidos) setFormErrors((prev) => ({ ...prev, apellidos: '' }));
                }}
                error={formErrors.apellidos}
                disabled={isActionLoading}
                required
              />

              <Input
                label="Teléfono de Contacto"
                placeholder="Ej: +51 987654321"
                value={formData.telefono || ''}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, telefono: e.target.value }));
                  if (formErrors.telefono) setFormErrors((prev) => ({ ...prev, telefono: '' }));
                }}
                error={formErrors.telefono}
                disabled={isActionLoading}
              />

              <Input
                label="Correo Electrónico"
                type="email"
                placeholder="operador@zaramagym.com"
                value={formData.email || ''}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, email: e.target.value }));
                  if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: '' }));
                }}
                error={formErrors.email}
                disabled={isActionLoading}
              />
            </div>
          )}

          {/* Fase 2: Datos de Cuenta de Usuario */}
          <div className="flex flex-col gap-3 pt-2 border-t border-border">
            <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
              Fase 2: Credenciales de Cuenta y Rol
            </span>

            {/* Selector de Foto Opcional */}
            <div className="flex items-center gap-4 p-3 bg-canvas-subtle rounded-lg border border-border">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-border bg-surface flex items-center justify-center shrink-0">
                {modalPhotoPreview ? (
                  <img src={modalPhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-6 h-6 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-txt-primary">
                  Foto de Perfil (Opcional)
                </span>
                <label className="text-xs text-brand hover:underline cursor-pointer font-medium">
                  <span>Seleccionar imagen...</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleModalPhotoSelect}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Nombre de Usuario"
                placeholder="Ej: recepcion2"
                value={formData.username}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, username: e.target.value }));
                  if (formErrors.username) setFormErrors((prev) => ({ ...prev, username: '' }));
                }}
                error={formErrors.username}
                disabled={isActionLoading}
                required
              />

              <Input
                label="Contraseña Temporal"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={formData.password}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, password: e.target.value }));
                  if (formErrors.password) setFormErrors((prev) => ({ ...prev, password: '' }));
                }}
                error={formErrors.password}
                disabled={isActionLoading}
                required
              />

              <div className="sm:col-span-2">
                <Select
                  label="Rol Asignado"
                  options={availableRoles}
                  value={formData.rol}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, rol: e.target.value as UserRole }))
                  }
                  error={formErrors.rol}
                  disabled={isActionLoading}
                  required
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCloseCreateModal}
              disabled={isActionLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isActionLoading}
              disabled={isActionLoading}
            >
              Registrar Usuario
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL PARA EDITAR USUARIO (EDICIÓN DUAL RBAC) */}
      {/* ==================================================================== */}
      {editingUser && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          title={`Editar Usuario @${editingUser.username}`}
          description="Actualiza credenciales, rol y opcionalmente los datos de la persona vinculada."
          size="lg"
        >
          <form
            noValidate
            onSubmit={handleEditSubmit}
            onKeyDown={preventEnterKeySubmit}
            className="flex flex-col gap-4"
          >
            {/* Pestañas de Edición */}
            <div className="flex border-b border-border gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={editTab === 'account'}
                onClick={() => setEditTab('account')}
                className={`rounded-none border-b-2 py-2 px-4 text-xs font-bold uppercase tracking-wider hover:bg-transparent ${
                  editTab === 'account'
                    ? 'border-brand text-brand hover:text-brand'
                    : 'border-transparent text-txt-muted hover:text-txt-primary'
                }`}
              >
                1. Cuenta y Permisos
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={editTab === 'person'}
                onClick={() => setEditTab('person')}
                className={`rounded-none border-b-2 py-2 px-4 text-xs font-bold uppercase tracking-wider hover:bg-transparent ${
                  editTab === 'person'
                    ? 'border-brand text-brand hover:text-brand'
                    : 'border-transparent text-txt-muted hover:text-txt-primary'
                }`}
              >
                2. Datos de la Persona
              </Button>
            </div>

            {/* SECCIÓN 1: DATOS DE CUENTA */}
            {editTab === 'account' && (
              <div className="flex flex-col gap-3">
                {/* Foto de Perfil */}
                <div className="flex items-center gap-4 p-3 bg-canvas-subtle rounded-lg border border-border">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-border bg-surface flex items-center justify-center shrink-0">
                    {editPhotoPreview ? (
                      <img src={editPhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-sm text-txt-secondary">
                        {getInitials(editNombres)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-txt-primary">
                      Foto de Perfil
                    </span>
                    <label className="text-xs text-brand hover:underline cursor-pointer font-medium">
                      <span>Cambiar imagen...</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleEditPhotoSelect}
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Input
                    label="Nombre de Usuario"
                    value={editUsername}
                    onChange={(e) => {
                      setEditUsername(e.target.value);
                      if (editErrors.username) setEditErrors((prev) => ({ ...prev, username: '' }));
                    }}
                    error={editErrors.username}
                    disabled={isActionLoading}
                    required
                  />

                  <Input
                    label="Nueva Contraseña (Dejar en blanco para conservar actual)"
                    type="password"
                    placeholder="Opcional (mínimo 6 caracteres)"
                    value={editNewPassword}
                    onChange={(e) => {
                      setEditNewPassword(e.target.value);
                      if (editErrors.new_password) {
                        setEditErrors((prev) => ({ ...prev, new_password: '' }));
                      }
                    }}
                    error={editErrors.new_password}
                    disabled={isActionLoading}
                  />

                  <div className="sm:col-span-2">
                    <Select
                      label="Rol Asignado"
                      options={availableRoles}
                      value={editRol}
                      onChange={(e) => setEditRol(e.target.value as UserRole)}
                      disabled={isActionLoading}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 2: DATOS DE LA PERSONA */}
            {editTab === 'person' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
                    Datos Personales Vinculados
                  </span>
                  <Button
                    type="button"
                    variant={isPersonalUnlocked ? 'primary' : 'outline'}
                    size="sm"
                    disabled={!canUnlockUserPersonalData}
                    leftIcon={<Icon name={isPersonalUnlocked ? 'lock' : 'key'} className="w-3.5 h-3.5" />}
                    onClick={() => setIsPersonalUnlocked(!isPersonalUnlocked)}
                    title={
                      !canUnlockUserPersonalData
                        ? 'Protegido por jerarquía RBAC: no tienes permisos para alterar datos de este usuario'
                        : undefined
                    }
                  >
                    {isPersonalUnlocked
                      ? 'Bloquear edición personal'
                      : 'Modificar datos personales'}
                  </Button>
                </div>

                {!canUnlockUserPersonalData && (
                  <div className="p-2.5 bg-status-warning-bg border border-status-warning-border rounded text-xs text-status-warning">
                    Protegido por jerarquía RBAC: este usuario cuenta con privilegios superiores o iguales a tu rol y no puedes alterar sus datos personales.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Tipo de Documento"
                    options={VALID_DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
                    value={editTipoDoc}
                    onChange={(e) => setEditTipoDoc(e.target.value as PersonDocumentType)}
                    disabled={!isPersonalUnlocked || isActionLoading}
                    required
                  />

                  <Input
                    label="Número de Documento"
                    value={editNumDoc}
                    onChange={(e) => setEditNumDoc(e.target.value)}
                    error={editErrors.numero_documento}
                    disabled={!isPersonalUnlocked || isActionLoading}
                    required
                  />

                  <Input
                    label="Nombres"
                    value={editNombres}
                    onChange={(e) => setEditNombres(e.target.value)}
                    error={editErrors.nombres}
                    disabled={!isPersonalUnlocked || isActionLoading}
                    required
                  />

                  <Input
                    label="Apellidos"
                    value={editApellidos}
                    onChange={(e) => setEditApellidos(e.target.value)}
                    error={editErrors.apellidos}
                    disabled={!isPersonalUnlocked || isActionLoading}
                    required
                  />

                  <Input
                    label="Teléfono"
                    value={editTelefono}
                    onChange={(e) => setEditTelefono(e.target.value)}
                    error={editErrors.telefono}
                    disabled={!isPersonalUnlocked || isActionLoading}
                  />

                  <Input
                    label="Correo Electrónico"
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    error={editErrors.email}
                    disabled={!isPersonalUnlocked || isActionLoading}
                  />

                  <div className="sm:col-span-2">
                    <Input
                      label="Dirección"
                      value={editDireccion}
                      onChange={(e) => setEditDireccion(e.target.value)}
                      disabled={!isPersonalUnlocked || isActionLoading}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCloseEditModal}
                disabled={isActionLoading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isActionLoading}
                disabled={isActionLoading}
              >
                Guardar Cambios
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
