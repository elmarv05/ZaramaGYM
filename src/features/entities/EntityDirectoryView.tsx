// ============================================================================
// COMPONENTE: DIRECTORIO SEGMENTADO EN 3 SUB-VISTAS (SLICE 2)
// Sub-pestaña 1: Clientes (QR, Contacto Emergencia, Notas Médicas, Historial Pesos)
// Sub-pestaña 2: Proveedores (Persona Natural o Empresa RUC 20)
// Sub-pestaña 3: Base Maestra de Personas Naturales
// Ubicación: src/features/entities/EntityDirectoryView.tsx
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  ClientDetail,
  ClientListItem,
  ClientWeightRecord,
  CompanyDetail,
  CompanyListItem,
  CreateClientInput,
  CreateCompanyInput,
  CreatePersonInput,
  CreateSupplierInput,
  PersonDetail,
  PersonListItem,
  RecordClientWeightInput,
  SupplierDetail,
  SupplierListItem,
  UpdateClientInput,
  UpdateCompanyInput,
  UpdatePersonInput,
  UpdateSupplierInput,
} from '../../types/entity';
import { AuthSession, AppError } from '../../types/auth';
import {
  canAccessPersonsTab,
  canCreateSupplierOrCompany,
  canEditOrDeactivateSupplierOrCompany,
  canToggleClientActive,
  formatKg,
} from '../../domain/entity';
import { triggerBase64FileDownload } from '../../domain/printingBackup';
import { normalizeAppError } from '../../services/ipc/client';
import { dashboardIpc } from '../../services/ipc/dashboardIpc';
import { ExportFormat } from '../../types/dashboard';
import { Button } from '../../components/primitives/Button';
import { Badge } from '../../components/primitives/Badge';
import { CheckboxField } from '../../components/primitives/Checkbox';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';
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
import { QrCredentialModal } from './QrCredentialModal';
import { ClientWeightHistoryModal } from './ClientWeightHistoryModal';
import { ClientFormModal } from './ClientFormModal';
import { SupplierFormModal } from './SupplierFormModal';
import { PersonFormModal } from './PersonFormModal';
import { CompanyFormModal } from './CompanyFormModal';
import {
  EntityFlashCard,
  EntityFlashCardEmptyState,
  EntityFlashCardGrid,
  EntityFlashCardSkeletonGrid,
} from './EntityFlashCard';
import { EntityProfileModal, ProfileEntitySubject } from './EntityProfileModal';
import { useEntities } from '../../hooks/useEntities';

export type DirectorySubTab = 'clients' | 'suppliers' | 'persons' | 'companies';
export type DirectoryViewMode = 'cards' | 'table';

function getEntityInitials(firstName: string, lastName?: string | null): string {
  const f = firstName.trim();
  const l = (lastName || '').trim();
  if (!f && !l) return 'ZG';
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  return f.slice(0, 2).toUpperCase();
}

export interface EntityDirectoryViewProps {
  currentSession: AuthSession;
  initialSubTab?: DirectorySubTab;

  // Colecciones provistas o mockeadas
  clients?: ClientListItem[];
  suppliers?: SupplierListItem[];
  persons?: PersonListItem[];
  companies?: CompanyListItem[];

  // Retrocompatibilidad para tests previos
  entities?: any[];

  isLoading?: boolean;
  isActionLoading?: boolean;
  error?: AppError | null;

  onRefresh?: () => void;

  // Handlers Clientes
  onCreateClient?: (input: CreateClientInput) => Promise<ClientDetail | null>;
  onUpdateClient?: (clientId: number, input: UpdateClientInput) => Promise<ClientDetail | null>;
  onToggleClientActive?: (clientId: number, active: boolean) => Promise<boolean>;
  onRegenerateClientQr?: (clientId: number) => Promise<string | null>;
  onRecordClientWeight?: (input: RecordClientWeightInput) => Promise<ClientWeightRecord | null>;
  onGetClientWeightHistory?: (clientId: number) => Promise<ClientWeightRecord[]>;

  // Handlers Proveedores
  onCreateSupplier?: (input: CreateSupplierInput) => Promise<SupplierDetail | null>;
  onUpdateSupplier?: (supplierId: number, input: UpdateSupplierInput) => Promise<SupplierDetail | null>;
  onToggleSupplierActive?: (supplierId: number, active: boolean) => Promise<boolean>;

  // Handlers Personas
  onCreatePerson?: (input: CreatePersonInput) => Promise<PersonDetail | null>;
  onUpdatePerson?: (personId: number, input: UpdatePersonInput) => Promise<PersonDetail | null>;
  onTogglePersonActive?: (personId: number, active: boolean) => Promise<boolean>;

  // Handlers Empresas RUC 20
  onCreateCompany?: (input: CreateCompanyInput) => Promise<CompanyDetail | null>;
  onUpdateCompany?: (companyId: number, input: UpdateCompanyInput) => Promise<CompanyDetail | null>;
  onToggleCompanyActive?: (companyId: number, active: boolean) => Promise<boolean>;

  // Compatibilidad anterior
  onCreateEntity?: any;
  onUpdateEntity?: any;
  onToggleActive?: any;
  onRegenerateQr?: any;
  onFilterChange?: any;

  onClearError?: () => void;
}

export const EntityDirectoryView: React.FC<EntityDirectoryViewProps> = (props) => {
  const {
    currentSession,
    initialSubTab = 'clients',
    clients: propClients,
    suppliers: propSuppliers,
    persons: propPersons,
    companies: propCompanies,
    entities: propEntities,
    isLoading: propIsLoading,
    isActionLoading: propIsActionLoading,
    error: propError,
    onRefresh: propOnRefresh,
    onCreateClient: propOnCreateClient,
    onUpdateClient: propOnUpdateClient,
    onToggleClientActive: propOnToggleClientActive,
    onRegenerateClientQr: propOnRegenerateClientQr,
    onRecordClientWeight: propOnRecordClientWeight,
    onGetClientWeightHistory: propOnGetClientWeightHistory,
    onCreateSupplier: propOnCreateSupplier,
    onUpdateSupplier: propOnUpdateSupplier,
    onToggleSupplierActive: propOnToggleSupplierActive,
    onCreatePerson: propOnCreatePerson,
    onUpdatePerson: propOnUpdatePerson,
    onTogglePersonActive: propOnTogglePersonActive,
    onCreateCompany: propOnCreateCompany,
    onUpdateCompany: propOnUpdateCompany,
    onToggleCompanyActive: propOnToggleCompanyActive,
    onToggleActive: propOnToggleActive,
    onRegenerateQr: propOnRegenerateQr,
    onClearError,
  } = props;

  // Si no se inyectan colecciones externas, activamos hook interno
  const shouldAutoFetch =
    propClients === undefined &&
    propSuppliers === undefined &&
    propPersons === undefined &&
    propCompanies === undefined &&
    propEntities === undefined;

  const hook = useEntities(shouldAutoFetch);

  const canAccessPersons = canAccessPersonsTab(currentSession?.rol);
  const canCreateSupOrComp = canCreateSupplierOrCompany(currentSession?.rol);
  const canEditOrDeactivateSupOrComp = canEditOrDeactivateSupplierOrCompany(currentSession?.rol);
  const canToggleClient = canToggleClientActive(currentSession?.rol);

  const normalizeSubTab = (tab: DirectorySubTab): DirectorySubTab => {
    if (tab === 'persons' && !canAccessPersons) return 'clients';
    if ((tab === 'suppliers' || tab === 'companies') && !canCreateSupOrComp) return 'clients';
    return tab;
  };

  const [activeSubTab, setActiveSubTab] = useState<DirectorySubTab>(
    normalizeSubTab(initialSubTab)
  );

  useEffect(() => {
    setActiveSubTab(normalizeSubTab(initialSubTab));
  }, [initialSubTab, canAccessPersons, canCreateSupOrComp]);

  const effectiveSubTab: DirectorySubTab = normalizeSubTab(activeSubTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [soloActivos, setSoloActivos] = useState(false);
  const [viewMode, setViewMode] = useState<DirectoryViewMode>('cards');
  const [selectedProfileSubject, setSelectedProfileSubject] =
    useState<ProfileEntitySubject | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{
    variant: 'success' | 'danger';
    title: string;
    message: string;
  } | null>(null);

  // Modales
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientListItem | ClientDetail | null>(null);

  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedQrClient, setSelectedQrClient] = useState<ClientListItem | null>(null);

  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [selectedWeightClient, setSelectedWeightClient] = useState<ClientListItem | null>(null);

  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierListItem | null>(null);

  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonListItem | null>(null);

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyListItem | CompanyDetail | null>(null);

  // Normalización de datos entre props y hook interno
  const clientsList: ClientListItem[] = useMemo(() => {
    if (propClients !== undefined) return propClients;
    if (propEntities !== undefined) {
      // Filtrar clientes si vienen de la lista legacy entities
      return propEntities
        .filter((e: any) => e.roles?.includes('CLIENTE') || e.es_cliente || e.codigo_qr_token)
        .map((e: any) => ({
          id: e.id,
          persona_id: e.id,
          tipo_documento: e.tipo_documento,
          numero_documento: e.numero_documento,
          nombres: e.nombres,
          apellidos: e.apellidos || '',
          telefono: e.telefono || null,
          email: e.email || null,
          codigo_qr_token: e.codigo_qr_token || 'ZG-PENDIENTE',
          peso_actual_kg: null,
          estado_activo: e.estado_activo,
          created_at: e.created_at,
        }));
    }
    return hook.clients;
  }, [propClients, propEntities, hook.clients]);

  const activeQrClient = useMemo(
    () =>
      selectedQrClient
        ? clientsList.find((c) => c.id === selectedQrClient.id) ?? selectedQrClient
        : null,
    [clientsList, selectedQrClient]
  );

  const activeWeightClient = useMemo(
    () =>
      selectedWeightClient
        ? clientsList.find((c) => c.id === selectedWeightClient.id) ?? selectedWeightClient
        : null,
    [clientsList, selectedWeightClient]
  );

  const suppliersList: SupplierListItem[] = useMemo(() => {
    if (propSuppliers !== undefined) return propSuppliers;
    if (propEntities !== undefined) {
      return propEntities
        .filter((e: any) => e.roles?.includes('PROVEEDOR') || e.es_proveedor)
        .map((e: any) => ({
          id: e.id,
          tipo_proveedor: e.tipo_persona === 'EMPRESA_JURIDICA' ? 'EMPRESA' : 'PERSONA_NATURAL',
          persona_id: e.tipo_persona === 'EMPRESA_JURIDICA' ? null : e.id,
          empresa_id: e.tipo_persona === 'EMPRESA_JURIDICA' ? e.id : null,
          tipo_documento: e.tipo_documento,
          numero_documento: e.numero_documento,
          nombre_o_razon_social: e.nombres,
          nombre_comercial: e.nombre_comercial || null,
          rubro_o_categoria: null,
          contacto_referencia: null,
          telefono: e.telefono || null,
          email: e.email || null,
          estado_activo: e.estado_activo,
          created_at: e.created_at,
        }));
    }
    return hook.suppliers;
  }, [propSuppliers, propEntities, hook.suppliers]);

  const personsList: PersonListItem[] = useMemo(() => {
    if (propPersons !== undefined) return propPersons;
    if (propEntities !== undefined) {
      return propEntities
        .filter((e: any) => e.tipo_persona !== 'EMPRESA_JURIDICA')
        .map((e: any) => ({
          id: e.id,
          tipo_documento: e.tipo_documento,
          numero_documento: e.numero_documento,
          nombres: e.nombres,
          apellidos: e.apellidos || '',
          telefono: e.telefono || null,
          email: e.email || null,
          es_cliente: Boolean(e.roles?.includes('CLIENTE')),
          es_proveedor: Boolean(e.roles?.includes('PROVEEDOR')),
          rol_usuario: null,
          estado_activo: e.estado_activo,
          created_at: e.created_at,
        }));
    }
    return hook.persons;
  }, [propPersons, propEntities, hook.persons]);

  const companiesList: CompanyListItem[] = useMemo(() => {
    if (propCompanies !== undefined) return propCompanies;
    return hook.companies;
  }, [propCompanies, hook.companies]);

  const activeProfileSubject = useMemo<ProfileEntitySubject | null>(() => {
    if (!selectedProfileSubject) return null;
    if (selectedProfileSubject.kind === 'client') {
      const fresh = clientsList.find((c) => c.id === selectedProfileSubject.data.id);
      return fresh ? { kind: 'client', data: fresh } : selectedProfileSubject;
    }
    if (selectedProfileSubject.kind === 'supplier') {
      const fresh = suppliersList.find((s) => s.id === selectedProfileSubject.data.id);
      return fresh ? { kind: 'supplier', data: fresh } : selectedProfileSubject;
    }
    if (selectedProfileSubject.kind === 'person') {
      const fresh = personsList.find((p) => p.id === selectedProfileSubject.data.id);
      return fresh ? { kind: 'person', data: fresh } : selectedProfileSubject;
    }
    if (selectedProfileSubject.kind === 'company') {
      const fresh = companiesList.find((c) => c.id === selectedProfileSubject.data.id);
      return fresh ? { kind: 'company', data: fresh } : selectedProfileSubject;
    }
    return selectedProfileSubject;
  }, [selectedProfileSubject, clientsList, suppliersList, personsList, companiesList]);

  const isLoading = propIsLoading ?? hook.isLoading;
  const isActionLoading = propIsActionLoading ?? hook.isActionLoading;
  const error = propError ?? hook.error;

  const handleRefresh = () => {
    if (propOnRefresh) {
      propOnRefresh();
    } else {
      hook.refreshAll();
    }
  };

  const handleExportClientsRoster = async (format: ExportFormat) => {
    setExportingFormat(format);
    setExportFeedback(null);
    try {
      const res = await dashboardIpc.exportClientsRoster(format);
      triggerBase64FileDownload(res.content_base64, res.filename, res.mime_type);
      setExportFeedback({
        variant: 'success',
        title: 'Padrón de clientes exportado',
        message: `Archivo ${res.filename} descargado (${res.row_count} registro${res.row_count === 1 ? '' : 's'}).`,
      });
    } catch (err) {
      const normalized = normalizeAppError(err);
      setExportFeedback({
        variant: 'danger',
        title: 'Error al exportar padrón de clientes',
        message: normalized.message,
      });
    } finally {
      setExportingFormat(null);
    }
  };

  // Filtrado local
  const filteredClients = useMemo(() => {
    return clientsList.filter((c) => {
      if (soloActivos && !c.estado_activo) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        c.nombres.toLowerCase().includes(term) ||
        c.apellidos.toLowerCase().includes(term) ||
        c.numero_documento.includes(term) ||
        c.codigo_qr_token.toLowerCase().includes(term)
      );
    });
  }, [clientsList, searchTerm, soloActivos]);

  const filteredSuppliers = useMemo(() => {
    return suppliersList.filter((s) => {
      if (soloActivos && !s.estado_activo) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        s.nombre_o_razon_social.toLowerCase().includes(term) ||
        (s.nombre_comercial && s.nombre_comercial.toLowerCase().includes(term)) ||
        s.numero_documento.includes(term) ||
        (s.rubro_o_categoria && s.rubro_o_categoria.toLowerCase().includes(term))
      );
    });
  }, [suppliersList, searchTerm, soloActivos]);

  const filteredPersons = useMemo(() => {
    return personsList.filter((p) => {
      if (soloActivos && !p.estado_activo) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.nombres.toLowerCase().includes(term) ||
        p.apellidos.toLowerCase().includes(term) ||
        p.numero_documento.includes(term)
      );
    });
  }, [personsList, searchTerm, soloActivos]);

  const filteredCompanies = useMemo(() => {
    return companiesList.filter((c) => {
      if (soloActivos && !c.estado_activo) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        c.ruc.includes(term) ||
        c.razon_social.toLowerCase().includes(term) ||
        (c.nombre_comercial && c.nombre_comercial.toLowerCase().includes(term))
      );
    });
  }, [companiesList, searchTerm, soloActivos]);

  // Handlers para Clientes
  const handleCreateClient = propOnCreateClient ?? hook.createClient;
  const handleUpdateClient = propOnUpdateClient ?? hook.updateClient;
  const handleToggleClientActive =
    propOnToggleClientActive ?? propOnToggleActive ?? hook.toggleClientActive;
  const handleRegenerateQr =
    propOnRegenerateClientQr ?? propOnRegenerateQr ?? hook.regenerateClientQr;
  const handleRecordWeight = propOnRecordClientWeight ?? hook.recordClientWeight;
  const handleGetWeightHistory = propOnGetClientWeightHistory ?? hook.getClientWeightHistory;

  // Handlers para Proveedores
  const handleCreateSupplier = propOnCreateSupplier ?? hook.createSupplier;
  const handleUpdateSupplier = propOnUpdateSupplier ?? hook.updateSupplier;
  const handleToggleSupplierActive =
    propOnToggleSupplierActive ?? propOnToggleActive ?? hook.toggleSupplierActive;

  // Handlers para Personas
  const handleCreatePerson = propOnCreatePerson ?? hook.createPerson;
  const handleUpdatePerson = propOnUpdatePerson ?? hook.updatePerson;
  const handleTogglePersonActive =
    propOnTogglePersonActive ?? propOnToggleActive ?? hook.togglePersonActive;

  // Handlers para Empresas RUC 20
  const handleCreateCompany = propOnCreateCompany ?? hook.createCompany;
  const handleUpdateCompany = propOnUpdateCompany ?? hook.updateCompany;
  const handleToggleCompanyActive =
    propOnToggleCompanyActive ?? propOnToggleActive ?? hook.toggleCompanyActive;

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Pestañas de Sub-Vistas Segmentadas */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div role="group" aria-label="Sub-vistas del directorio" className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant={effectiveSubTab === 'clients' ? 'secondary' : 'ghost'}
            size="md"
            aria-pressed={effectiveSubTab === 'clients'}
            onClick={() => setActiveSubTab('clients')}
            leftIcon={<Icon name="qr" className="w-4 h-4" aria-hidden="true" />}
            className={`text-sm font-semibold ${
              effectiveSubTab === 'clients'
                ? 'shadow-sm'
                : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
            }`}
          >
            {canAccessPersons ? 'Clientes' : 'Clientes & QR'}
          </Button>

          {canCreateSupOrComp && (
            <Button
              type="button"
              variant={effectiveSubTab === 'suppliers' ? 'secondary' : 'ghost'}
              size="md"
              aria-pressed={effectiveSubTab === 'suppliers'}
              onClick={() => setActiveSubTab('suppliers')}
              leftIcon={<Icon name="truck" className="w-4 h-4" aria-hidden="true" />}
              className={`text-sm font-semibold ${
                effectiveSubTab === 'suppliers'
                  ? 'shadow-sm'
                  : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
              }`}
            >
              Proveedores
            </Button>
          )}

          {canAccessPersons && (
            <Button
              type="button"
              variant={effectiveSubTab === 'persons' ? 'secondary' : 'ghost'}
              size="md"
              aria-pressed={effectiveSubTab === 'persons'}
              onClick={() => setActiveSubTab('persons')}
              leftIcon={<Icon name="users" className="w-4 h-4" aria-hidden="true" />}
              className={`text-sm font-semibold ${
                effectiveSubTab === 'persons'
                  ? 'shadow-sm'
                  : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
              }`}
            >
              Personas
            </Button>
          )}

          {canCreateSupOrComp && (
            <Button
              type="button"
              variant={effectiveSubTab === 'companies' ? 'secondary' : 'ghost'}
              size="md"
              aria-pressed={effectiveSubTab === 'companies'}
              onClick={() => setActiveSubTab('companies')}
              leftIcon={<Icon name="building" className="w-4 h-4" aria-hidden="true" />}
              className={`text-sm font-semibold ${
                effectiveSubTab === 'companies'
                  ? 'shadow-sm'
                  : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
              }`}
            >
              Empresas
            </Button>
          )}
        </div>

        {/* Botón de Creación Contextual */}
        <div>
          {effectiveSubTab === 'clients' && (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setEditingClient(null);
                setIsClientModalOpen(true);
              }}
              disabled={isActionLoading}
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Inscribir Cliente
            </Button>
          )}

          {canCreateSupOrComp && effectiveSubTab === 'suppliers' && (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setEditingSupplier(null);
                setIsSupplierModalOpen(true);
              }}
              disabled={isActionLoading}
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Nuevo Proveedor
            </Button>
          )}

          {canAccessPersons && effectiveSubTab === 'persons' && (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setEditingPerson(null);
                setIsPersonModalOpen(true);
              }}
              disabled={isActionLoading}
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Registrar Persona
            </Button>
          )}

          {canCreateSupOrComp && effectiveSubTab === 'companies' && (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setEditingCompany(null);
                setIsCompanyModalOpen(true);
              }}
              disabled={isActionLoading}
              leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Registrar Empresa
            </Button>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-surface p-3 rounded-xl border border-border">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <Input
            placeholder={
              effectiveSubTab === 'clients'
                ? 'Buscar por nombre, documento o token QR...'
                : effectiveSubTab === 'suppliers'
                ? 'Buscar por razón social, RUC o rubro...'
                : effectiveSubTab === 'persons'
                ? 'Buscar persona por nombre o documento...'
                : 'Buscar por RUC, razón social o nombre comercial...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Buscar en el directorio"
            leftIcon={
              <svg className="w-4 h-4 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <CheckboxField
            label="Solo activos"
            checked={soloActivos}
            onCheckedChange={(checked) => setSoloActivos(checked === true)}
            className="min-h-[32px] py-0 items-center [&_span]:text-xs [&_span]:text-txt-secondary"
          />

          {/* Selector de Vista: Flash Cards (Tarjetas) vs Tabla */}
          <div
            role="group"
            aria-label="Modo de visualización del directorio"
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

          {effectiveSubTab === 'clients' && (
            <div
              role="group"
              aria-label="Exportar Padrón de Clientes"
              className="flex items-center gap-1.5 border-l border-border pl-2.5"
            >
              <span className="text-[11px] font-semibold text-txt-muted hidden md:inline">
                Exportar Padrón:
              </span>
              {(['CSV', 'XLSX', 'PDF'] as ExportFormat[]).map((fmt) => {
                const label = fmt === 'XLSX' ? 'Excel (.xlsx)' : fmt;
                return (
                  <Button
                    key={fmt}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={exportingFormat !== null || isLoading}
                    isLoading={exportingFormat === fmt}
                    aria-label={`Exportar Padrón de Clientes en ${label}`}
                    leftIcon={<Icon name="download" className="w-3.5 h-3.5" />}
                    onClick={() => void handleExportClientsRoster(fmt)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || isActionLoading}
          >
            Refrescar
          </Button>
        </div>
      </div>

      {/* Feedback de Exportación del Padrón */}
      {exportFeedback && (
        <Alert
          variant={exportFeedback.variant}
          title={exportFeedback.title}
          onClose={() => setExportFeedback(null)}
        >
          {exportFeedback.message}
        </Alert>
      )}

      {/* Banner de Error */}
      {error && (
        <Alert
          variant="danger"
          title="Error en la consulta del directorio"
          actionText="Reintentar"
          onAction={handleRefresh}
          onClose={onClearError}
        >
          {error.message}
        </Alert>
      )}

      {/* ==================================================================== */}
      {/* SUB-VISTA 1: CLIENTES (FLASH CARDS O TABLA) */}
      {/* ==================================================================== */}
      {effectiveSubTab === 'clients' &&
        (viewMode === 'cards' ? (
          isLoading ? (
            <EntityFlashCardSkeletonGrid count={6} />
          ) : filteredClients.length === 0 ? (
            <EntityFlashCardEmptyState
              icon="qr"
              title={searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
              description={
                searchTerm
                  ? 'Prueba con otro término de búsqueda o limpia los filtros.'
                  : 'Inscribe al primer cliente del gimnasio para emitir su credencial digital.'
              }
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditingClient(null);
                    setIsClientModalOpen(true);
                  }}
                >
                  Inscribir Cliente
                </Button>
              }
            />
          ) : (
            <EntityFlashCardGrid>
              {filteredClients.map((client) => {
                const isCurrentPerson =
                  currentSession && client.persona_id === currentSession.persona_id;
                const fullName = `${client.nombres} ${client.apellidos}`.trim();

                return (
                  <EntityFlashCard
                    key={client.id}
                    entityTag="CLIENTE"
                    entityTagVariant="success"
                    secondaryBadges={
                      client.notas_medicas
                        ? [
                            {
                              label: 'Atención Médica',
                              variant: 'warning',
                              title: client.notas_medicas,
                            },
                          ]
                        : []
                    }
                    isActive={client.estado_activo}
                    avatarInitials={getEntityInitials(client.nombres, client.apellidos)}
                    title={fullName}
                    documentLabel={`${client.tipo_documento}: ${client.numero_documento}`}
                    secondaryCodeChip={
                      <span className="px-2 py-0.5 rounded bg-status-info-bg text-status-info border border-status-info-border font-mono text-[11px] font-semibold inline-flex items-center gap-1">
                        <Icon name="qr" className="w-3 h-3" aria-hidden="true" />
                        <span>{client.codigo_qr_token}</span>
                      </span>
                    }
                    phone={client.telefono}
                    email={client.email}
                    metrics={[
                      {
                        label: 'Peso Actual',
                        value: <span>{formatKg(client.peso_actual_kg)}</span>,
                        action: (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={() => {
                              setSelectedWeightClient(client);
                              setIsWeightModalOpen(true);
                            }}
                            className="text-[11px] font-semibold h-auto min-h-0 p-0"
                          >
                            Historial
                          </Button>
                        ),
                      },
                      {
                        label: 'Emergencia',
                        value: (
                          <span className="truncate">
                            {client.nombre_contacto_emergencia || 'Sin registrar'}
                          </span>
                        ),
                        subValue: client.numero_contacto_emergencia || undefined,
                      },
                    ]}
                    quickActions={
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedQrClient(client);
                            setIsQrModalOpen(true);
                          }}
                          title={`Abrir credencial QR (${client.codigo_qr_token})`}
                          aria-label={`Ver credencial QR de ${client.nombres} (${client.codigo_qr_token})`}
                          leftIcon={<Icon name="qr" className="w-3.5 h-3.5 text-brand" />}
                        >
                          Ver QR
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingClient(client);
                            setIsClientModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>

                        {canToggleClient && (
                          <Button
                            variant={client.estado_activo ? 'outline' : 'secondary'}
                            size="sm"
                            disabled={Boolean(isCurrentPerson) || isActionLoading}
                            onClick={() =>
                              handleToggleClientActive(client.id, client.estado_activo)
                            }
                            className={
                              client.estado_activo
                                ? 'text-status-danger border-status-danger-border'
                                : 'text-status-success border-status-success-border'
                            }
                          >
                            {client.estado_activo ? 'Desactivar' : 'Activar'}
                          </Button>
                        )}
                      </>
                    }
                    onOpenProfile={() =>
                      setSelectedProfileSubject({ kind: 'client', data: client })
                    }
                  />
                );
              })}
            </EntityFlashCardGrid>
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Socio / Cliente</TableHead>
                <TableHead>Contacto de Emergencia</TableHead>
                <TableHead>Notas Médicas</TableHead>
                <TableHead>Peso Actual</TableHead>
                <TableHead>Credencial QR</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableLoadingSkeleton colSpan={8} rows={4} />
              ) : filteredClients.length === 0 ? (
                <TableEmptyState
                  colSpan={8}
                  title={searchTerm ? 'No se encontraron clientes' : 'No hay clientes registrados'}
                  description={
                    searchTerm
                      ? 'Prueba con otro término de búsqueda o limpia los filtros.'
                      : 'Inscribe al primer cliente del gimnasio para emitir su credencial digital.'
                  }
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setEditingClient(null);
                        setIsClientModalOpen(true);
                      }}
                    >
                      Inscribir Cliente
                    </Button>
                  }
                />
              ) : (
                filteredClients.map((client) => {
                  const isCurrentPerson =
                    currentSession && client.persona_id === currentSession.persona_id;

                  return (
                    <TableRow key={client.id}>
                      <TableCell className="font-mono text-xs text-txt-secondary">
                        {client.tipo_documento}: {client.numero_documento}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-txt-primary">
                            {client.nombres} {client.apellidos}
                          </span>
                          {client.telefono && (
                            <span className="text-xs text-txt-muted">{client.telefono}</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        {(client as any).nombre_contacto_emergencia ||
                        (client as any).numero_contacto_emergencia ? (
                          <div className="flex flex-col text-xs">
                            <span className="font-medium text-txt-primary">
                              {(client as any).nombre_contacto_emergencia || 'Emergencia'}
                            </span>
                            <span className="text-txt-muted font-mono">
                              {(client as any).numero_contacto_emergencia || 'Sin número'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-txt-muted">Sin registrar</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {(client as any).notas_medicas ? (
                          <Badge variant="warning" size="sm" title={(client as any).notas_medicas}>
                            Atención Médica
                          </Badge>
                        ) : (
                          <span className="text-xs text-txt-muted">Ninguna</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-txt-primary text-xs">
                            {formatKg(client.peso_actual_kg)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedWeightClient(client);
                              setIsWeightModalOpen(true);
                            }}
                            className="text-[11px] px-2 py-0.5 text-brand hover:underline"
                          >
                            Historial
                          </Button>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedQrClient(client);
                            setIsQrModalOpen(true);
                          }}
                          title={`Abrir credencial QR (${client.codigo_qr_token})`}
                          aria-label={`Ver credencial QR de ${client.nombres} (${client.codigo_qr_token})`}
                          leftIcon={<Icon name="qr" className="w-4 h-4 text-brand shrink-0" />}
                          className="border-brand/30 hover:border-brand hover:bg-brand/10 gap-2"
                        >
                          <span className="font-semibold text-xs text-txt-primary whitespace-nowrap">
                            Ver QR
                          </span>
                          <span className="font-mono text-[10px] text-txt-muted bg-canvas-subtle px-1.5 py-0.5 rounded border border-border">
                            {client.codigo_qr_token}
                          </span>
                        </Button>
                      </TableCell>

                      <TableCell>
                        <Badge variant={client.estado_activo ? 'success' : 'danger'} size="sm">
                          {client.estado_activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSelectedProfileSubject({ kind: 'client', data: client })
                            }
                          >
                            Ver perfil
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingClient(client);
                              setIsClientModalOpen(true);
                            }}
                          >
                            Editar
                          </Button>

                          {canToggleClient && (
                            <Button
                              variant={client.estado_activo ? 'outline' : 'secondary'}
                              size="sm"
                              disabled={Boolean(isCurrentPerson) || isActionLoading}
                              onClick={() =>
                                handleToggleClientActive(client.id, client.estado_activo)
                              }
                              className={
                                client.estado_activo
                                  ? 'text-status-danger border-status-danger-border'
                                  : 'text-status-success border-status-success-border'
                              }
                            >
                              {client.estado_activo ? 'Desactivar' : 'Activar'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        ))}

      {/* ==================================================================== */}
      {/* SUB-VISTA 2: PROVEEDORES & EMPRESAS */}
      {/* ==================================================================== */}
      {canCreateSupOrComp && effectiveSubTab === 'suppliers' &&
        (viewMode === 'cards' ? (
          isLoading ? (
            <EntityFlashCardSkeletonGrid count={6} />
          ) : filteredSuppliers.length === 0 ? (
            <EntityFlashCardEmptyState
              icon="truck"
              title={
                searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados'
              }
              description={
                searchTerm
                  ? 'Intenta con otro término o limpia los filtros.'
                  : 'Registra a empresas o personas naturales proveedoras del gimnasio.'
              }
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditingSupplier(null);
                    setIsSupplierModalOpen(true);
                  }}
                >
                  Nuevo Proveedor
                </Button>
              }
            />
          ) : (
            <EntityFlashCardGrid>
              {filteredSuppliers.map((supplier) => {
                const isEmpresa = supplier.tipo_proveedor === 'EMPRESA';
                return (
                  <EntityFlashCard
                    key={supplier.id}
                    entityTag="PROVEEDOR"
                    entityTagVariant="info"
                    secondaryBadges={[
                      {
                        label: isEmpresa ? 'EMPRESA' : 'NATURAL',
                        variant: isEmpresa ? 'default' : 'info',
                        icon: isEmpresa ? 'building' : 'user',
                      },
                    ]}
                    isActive={supplier.estado_activo}
                    avatarIcon={isEmpresa ? 'building' : 'truck'}
                    title={supplier.nombre_o_razon_social}
                    subtitleTag={
                      supplier.nombre_comercial ? (
                        <span className="text-txt-muted">
                          Comercial: {supplier.nombre_comercial}
                        </span>
                      ) : undefined
                    }
                    documentLabel={`${supplier.tipo_documento}: ${supplier.numero_documento}`}
                    phone={supplier.telefono}
                    email={supplier.email}
                    metrics={[
                      {
                        label: 'Rubro / Categoría',
                        value: (
                          <span className="truncate">{supplier.rubro_o_categoria || '—'}</span>
                        ),
                      },
                      {
                        label: 'Contacto Ref.',
                        value: (
                          <span className="truncate">{supplier.contacto_referencia || '—'}</span>
                        ),
                      },
                    ]}
                    quickActions={
                      canEditOrDeactivateSupOrComp ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingSupplier(supplier);
                              setIsSupplierModalOpen(true);
                            }}
                          >
                            Editar
                          </Button>

                          <Button
                            variant={supplier.estado_activo ? 'outline' : 'secondary'}
                            size="sm"
                            disabled={isActionLoading}
                            onClick={() =>
                              handleToggleSupplierActive(supplier.id, supplier.estado_activo)
                            }
                            className={
                              supplier.estado_activo
                                ? 'text-status-danger border-status-danger-border'
                                : 'text-status-success border-status-success-border'
                            }
                          >
                            {supplier.estado_activo ? 'Desactivar' : 'Activar'}
                          </Button>
                        </>
                      ) : undefined
                    }
                    onOpenProfile={() =>
                      setSelectedProfileSubject({ kind: 'supplier', data: supplier })
                    }
                  />
                );
              })}
            </EntityFlashCardGrid>
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Documento / RUC</TableHead>
                <TableHead>Nombre o Razón Social</TableHead>
                <TableHead>Rubro / Categoría</TableHead>
                <TableHead>Contacto de Referencia</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableLoadingSkeleton colSpan={8} rows={4} />
              ) : filteredSuppliers.length === 0 ? (
                <TableEmptyState
                  colSpan={8}
                  title={
                    searchTerm ? 'No se encontraron proveedores' : 'No hay proveedores registrados'
                  }
                  description={
                    searchTerm
                      ? 'Intenta con otro término o limpia los filtros.'
                      : 'Registra a empresas o personas naturales proveedoras del gimnasio.'
                  }
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setEditingSupplier(null);
                        setIsSupplierModalOpen(true);
                      }}
                    >
                      Nuevo Proveedor
                    </Button>
                  }
                />
              ) : (
                filteredSuppliers.map((supplier) => {
                  const isEmpresa = supplier.tipo_proveedor === 'EMPRESA';
                  return (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <Badge variant={isEmpresa ? 'default' : 'info'} size="sm">
                          <span className="inline-flex items-center gap-1">
                            <Icon name={isEmpresa ? 'building' : 'user'} className="w-3 h-3" />
                            <span>{isEmpresa ? 'EMPRESA' : 'NATURAL'}</span>
                          </span>
                        </Badge>
                      </TableCell>

                      <TableCell className="font-mono text-xs text-txt-secondary">
                        {supplier.tipo_documento}: {supplier.numero_documento}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-txt-primary">
                            {supplier.nombre_o_razon_social}
                          </span>
                          {supplier.nombre_comercial && (
                            <span className="text-xs text-txt-muted">
                              Comercial: {supplier.nombre_comercial}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="text-xs font-medium text-txt-secondary">
                          {supplier.rubro_o_categoria || '—'}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="text-xs text-txt-muted">
                          {supplier.contacto_referencia || '—'}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="text-xs font-mono text-txt-secondary">
                          {supplier.telefono || '—'}
                        </span>
                      </TableCell>

                      <TableCell>
                        <Badge variant={supplier.estado_activo ? 'success' : 'danger'} size="sm">
                          {supplier.estado_activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSelectedProfileSubject({ kind: 'supplier', data: supplier })
                            }
                          >
                            Ver perfil
                          </Button>

                          {canEditOrDeactivateSupOrComp && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingSupplier(supplier);
                                  setIsSupplierModalOpen(true);
                                }}
                              >
                                Editar
                              </Button>

                              <Button
                                variant={supplier.estado_activo ? 'outline' : 'secondary'}
                                size="sm"
                                disabled={isActionLoading}
                                onClick={() =>
                                  handleToggleSupplierActive(supplier.id, supplier.estado_activo)
                                }
                                className={
                                  supplier.estado_activo
                                    ? 'text-status-danger border-status-danger-border'
                                    : 'text-status-success border-status-success-border'
                                }
                              >
                                {supplier.estado_activo ? 'Desactivar' : 'Activar'}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        ))}

      {/* ==================================================================== */}
      {/* SUB-VISTA 3: BASE MAESTRA DE PERSONAS */}
      {/* ==================================================================== */}
      {canAccessPersons && effectiveSubTab === 'persons' &&
        (viewMode === 'cards' ? (
          isLoading ? (
            <EntityFlashCardSkeletonGrid count={6} />
          ) : filteredPersons.length === 0 ? (
            <EntityFlashCardEmptyState
              icon="users"
              title={searchTerm ? 'No se encontraron personas' : 'No hay personas registradas'}
              description="Registra una nueva persona natural en el sistema."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditingPerson(null);
                    setIsPersonModalOpen(true);
                  }}
                >
                  Registrar Persona
                </Button>
              }
            />
          ) : (
            <EntityFlashCardGrid>
              {filteredPersons.map((person) => {
                const isCurrentSessionPerson =
                  currentSession && person.id === currentSession.persona_id;
                const isRootAdminPerson = person.id === 1;
                const canToggle = !isCurrentSessionPerson && !isRootAdminPerson;
                const fullName = `${person.nombres} ${person.apellidos}`.trim();

                const roleBadges = [
                  ...(person.es_cliente
                    ? [{ label: 'Cliente', variant: 'success' as const }]
                    : []),
                  ...(person.es_proveedor
                    ? [{ label: 'Proveedor', variant: 'info' as const }]
                    : []),
                  ...(person.rol_usuario
                    ? [
                        {
                          label: `Usuario: ${person.rol_usuario}`,
                          variant:
                            person.rol_usuario === 'ADMINISTRADOR'
                              ? ('default' as const)
                              : ('info' as const),
                        },
                      ]
                    : []),
                ];

                return (
                  <EntityFlashCard
                    key={person.id}
                    entityTag="PERSONA"
                    entityTagVariant="default"
                    secondaryBadges={roleBadges}
                    isActive={person.estado_activo}
                    avatarInitials={getEntityInitials(person.nombres, person.apellidos)}
                    title={fullName}
                    subtitleTag={
                      isCurrentSessionPerson ? (
                        <span className="text-[10px] text-status-info font-bold uppercase">
                          (Persona de tu sesión activa)
                        </span>
                      ) : undefined
                    }
                    documentLabel={`${person.tipo_documento}: ${person.numero_documento}`}
                    phone={person.telefono}
                    email={person.email}
                    metrics={[
                      {
                        label: 'Vínculos Activos',
                        value: (
                          <span className="truncate">
                            {roleBadges.length > 0
                              ? `${roleBadges.length} rol${roleBadges.length === 1 ? '' : 'es'}`
                              : 'Sin rol asignado'}
                          </span>
                        ),
                      },
                      {
                        label: 'Registro',
                        value: (
                          <span className="font-mono text-[11px]">
                            {person.created_at ? person.created_at.slice(0, 10) : '—'}
                          </span>
                        ),
                      },
                    ]}
                    quickActions={
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingPerson(person);
                            setIsPersonModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>

                        <Button
                          variant={person.estado_activo ? 'outline' : 'secondary'}
                          size="sm"
                          disabled={!canToggle || isActionLoading}
                          onClick={() =>
                            handleTogglePersonActive(person.id, person.estado_activo)
                          }
                          title={
                            isCurrentSessionPerson
                              ? 'No puedes desactivar la persona de tu propia sesión'
                              : isRootAdminPerson
                              ? 'La persona del Administrador Root no puede ser desactivada'
                              : person.estado_activo
                              ? 'Desactivar persona'
                              : 'Reactivar persona'
                          }
                          className={
                            person.estado_activo
                              ? 'text-status-danger border-status-danger-border'
                              : 'text-status-success border-status-success-border'
                          }
                        >
                          {person.estado_activo ? 'Desactivar' : 'Activar'}
                        </Button>
                      </>
                    }
                    onOpenProfile={() =>
                      setSelectedProfileSubject({ kind: 'person', data: person })
                    }
                  />
                );
              })}
            </EntityFlashCardGrid>
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Nombres y Apellidos</TableHead>
                <TableHead>Teléfono / Email</TableHead>
                <TableHead>Vínculos & Roles</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableLoadingSkeleton colSpan={6} rows={4} />
              ) : filteredPersons.length === 0 ? (
                <TableEmptyState
                  colSpan={6}
                  title={searchTerm ? 'No se encontraron personas' : 'No hay personas registradas'}
                  description="Registra una nueva persona natural en el sistema."
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setEditingPerson(null);
                        setIsPersonModalOpen(true);
                      }}
                    >
                      Registrar Persona
                    </Button>
                  }
                />
              ) : (
                filteredPersons.map((person) => {
                  const isCurrentSessionPerson =
                    currentSession && person.id === currentSession.persona_id;
                  const isRootAdminPerson = person.id === 1;

                  const canToggle = !isCurrentSessionPerson && !isRootAdminPerson;

                  return (
                    <TableRow key={person.id}>
                      <TableCell className="font-mono text-xs text-txt-secondary">
                        {person.tipo_documento}: {person.numero_documento}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-txt-primary">
                            {person.nombres} {person.apellidos}
                          </span>
                          {isCurrentSessionPerson && (
                            <span className="text-[10px] text-status-info font-bold uppercase">
                              (Persona de tu sesión activa)
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col text-xs text-txt-muted">
                          <span>{person.telefono || 'Sin teléfono'}</span>
                          <span className="text-[11px] text-txt-secondary">{person.email || ''}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {person.es_cliente && (
                            <Badge variant="success" size="sm">
                              Cliente
                            </Badge>
                          )}
                          {person.es_proveedor && (
                            <Badge variant="info" size="sm">
                              Proveedor
                            </Badge>
                          )}
                          {person.rol_usuario && (
                            <Badge
                              variant={
                                person.rol_usuario === 'ADMINISTRADOR'
                                  ? 'default'
                                  : 'info'
                              }
                              size="sm"
                            >
                              Usuario: {person.rol_usuario}
                            </Badge>
                          )}
                          {!person.es_cliente && !person.es_proveedor && !person.rol_usuario && (
                            <span className="text-xs text-txt-muted font-normal">
                              Sin rol asignado
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant={person.estado_activo ? 'success' : 'danger'} size="sm">
                          {person.estado_activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSelectedProfileSubject({ kind: 'person', data: person })
                            }
                          >
                            Ver perfil
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingPerson(person);
                              setIsPersonModalOpen(true);
                            }}
                          >
                            Editar
                          </Button>

                          <Button
                            variant={person.estado_activo ? 'outline' : 'secondary'}
                            size="sm"
                            disabled={!canToggle || isActionLoading}
                            onClick={() =>
                              handleTogglePersonActive(person.id, person.estado_activo)
                            }
                            title={
                              isCurrentSessionPerson
                                ? 'No puedes desactivar la persona de tu propia sesión'
                                : isRootAdminPerson
                                ? 'La persona del Administrador Root no puede ser desactivada'
                                : person.estado_activo
                                ? 'Desactivar persona'
                                : 'Reactivar persona'
                            }
                            className={
                              person.estado_activo
                                ? 'text-status-danger border-status-danger-border'
                                : 'text-status-success border-status-success-border'
                            }
                          >
                            {person.estado_activo ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        ))}

      {/* SUB-VISTA 4: EMPRESAS JURÍDICAS (RUC 20) */}
      {canCreateSupOrComp && effectiveSubTab === 'companies' &&
        (viewMode === 'cards' ? (
          isLoading ? (
            <EntityFlashCardSkeletonGrid count={6} />
          ) : filteredCompanies.length === 0 ? (
            <EntityFlashCardEmptyState
              icon="building"
              title="No hay empresas RUC 20 registradas"
              description={
                searchTerm
                  ? 'No se encontraron empresas jurídicas que coincidan con la búsqueda.'
                  : 'Registra empresas con RUC 20 para emitir compras y asociar facturación.'
              }
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditingCompany(null);
                    setIsCompanyModalOpen(true);
                  }}
                  leftIcon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  }
                >
                  Registrar Empresa
                </Button>
              }
            />
          ) : (
            <EntityFlashCardGrid>
              {filteredCompanies.map((company) => (
                <EntityFlashCard
                  key={company.id}
                  entityTag="EMPRESA RUC 20"
                  entityTagVariant="info"
                  isActive={company.estado_activo}
                  avatarIcon="building"
                  title={company.razon_social}
                  documentLabel={company.ruc}
                  phone={company.telefono}
                  email={company.email}
                  metrics={[
                    {
                      label: 'Nombre Comercial',
                      value: (
                        <span className="truncate">{company.nombre_comercial || '--'}</span>
                      ),
                    },
                    {
                      label: 'Registro',
                      value: (
                        <span className="font-mono text-[11px]">
                          {company.created_at ? company.created_at.slice(0, 10) : '—'}
                        </span>
                      ),
                    },
                  ]}
                  quickActions={
                    canEditOrDeactivateSupOrComp ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingCompany(company);
                            setIsCompanyModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>

                        <Button
                          variant={company.estado_activo ? 'outline' : 'secondary'}
                          size="sm"
                          disabled={isActionLoading}
                          onClick={() =>
                            handleToggleCompanyActive(company.id, company.estado_activo)
                          }
                          className={
                            company.estado_activo
                              ? 'text-status-danger border-status-danger-border'
                              : 'text-status-success border-status-success-border'
                          }
                        >
                          {company.estado_activo ? 'Desactivar' : 'Activar'}
                        </Button>
                      </>
                    ) : undefined
                  }
                  onOpenProfile={() =>
                    setSelectedProfileSubject({ kind: 'company', data: company })
                  }
                />
              ))}
            </EntityFlashCardGrid>
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RUC (20)</TableHead>
                <TableHead>Razón Social (SUNAT)</TableHead>
                <TableHead>Nombre Comercial</TableHead>
                <TableHead>Teléfono / Email</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableLoadingSkeleton colSpan={6} rows={5} />
              ) : filteredCompanies.length === 0 ? (
                <TableEmptyState
                  colSpan={6}
                  title="No hay empresas RUC 20 registradas"
                  description={
                    searchTerm
                      ? 'No se encontraron empresas jurídicas que coincidan con la búsqueda.'
                      : 'Registra empresas con RUC 20 para emitir compras y asociar facturación.'
                  }
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setEditingCompany(null);
                        setIsCompanyModalOpen(true);
                      }}
                      leftIcon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      }
                    >
                      Registrar Empresa
                    </Button>
                  }
                />
              ) : (
                filteredCompanies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-mono text-xs font-bold text-txt-primary">
                      {company.ruc}
                    </TableCell>

                    <TableCell>
                      <span className="font-semibold text-txt-primary block">
                        {company.razon_social}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-xs text-txt-secondary">
                        {company.nombre_comercial || '--'}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col text-xs text-txt-muted">
                        <span>{company.telefono || 'Sin teléfono'}</span>
                        <span className="text-[11px] text-txt-secondary">{company.email || ''}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant={company.estado_activo ? 'success' : 'danger'} size="sm">
                        {company.estado_activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setSelectedProfileSubject({ kind: 'company', data: company })
                          }
                        >
                          Ver perfil
                        </Button>

                        {canEditOrDeactivateSupOrComp && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingCompany(company);
                                setIsCompanyModalOpen(true);
                              }}
                            >
                              Editar
                            </Button>

                            <Button
                              variant={company.estado_activo ? 'outline' : 'secondary'}
                              size="sm"
                              disabled={isActionLoading}
                              onClick={() =>
                                handleToggleCompanyActive(company.id, company.estado_activo)
                              }
                              className={
                                company.estado_activo
                                  ? 'text-status-danger border-status-danger-border'
                                  : 'text-status-success border-status-success-border'
                              }
                            >
                              {company.estado_activo ? 'Desactivar' : 'Activar'}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ))}

      {/* ==================================================================== */}
      {/* MODALES FUNCIONALES Y PERFIL INTERACTIVO                             */}
      {/* ==================================================================== */}

      <EntityProfileModal
        isOpen={Boolean(activeProfileSubject)}
        onClose={() => setSelectedProfileSubject(null)}
        subject={activeProfileSubject}
        currentSession={currentSession}
        isActionLoading={isActionLoading}
        onUpdateClient={handleUpdateClient}
        onUpdatePerson={canAccessPersons ? handleUpdatePerson : undefined}
        onUpdateCompany={canEditOrDeactivateSupOrComp ? handleUpdateCompany : undefined}
        onUpdateSupplier={canEditOrDeactivateSupOrComp ? handleUpdateSupplier : undefined}
        onToggleActive={
          activeProfileSubject?.kind === 'client'
            ? canToggleClient
              ? handleToggleClientActive
              : undefined
            : activeProfileSubject?.kind === 'supplier'
            ? canEditOrDeactivateSupOrComp
              ? handleToggleSupplierActive
              : undefined
            : activeProfileSubject?.kind === 'person'
            ? canAccessPersons
              ? handleTogglePersonActive
              : undefined
            : activeProfileSubject?.kind === 'company'
            ? canEditOrDeactivateSupOrComp
              ? handleToggleCompanyActive
              : undefined
            : undefined
        }
        onRegenerateQr={handleRegenerateQr}
        onRecordWeight={handleRecordWeight}
        fetchWeightHistory={handleGetWeightHistory}
      />

      {/* Modal Credencial QR */}
      <QrCredentialModal
        isOpen={isQrModalOpen}
        onClose={() => {
          setIsQrModalOpen(false);
          setSelectedQrClient(null);
        }}
        client={activeQrClient}
        onRegenerateQr={handleRegenerateQr}
        isLoading={isActionLoading}
      />

      {/* Modal Historial de Pesos */}
      <ClientWeightHistoryModal
        isOpen={isWeightModalOpen}
        onClose={() => {
          setIsWeightModalOpen(false);
          setSelectedWeightClient(null);
        }}
        client={activeWeightClient}
        onRecordWeight={handleRecordWeight}
        fetchWeightHistory={handleGetWeightHistory}
      />

      {/* Modal Formulario Cliente */}
      <ClientFormModal
        isOpen={isClientModalOpen}
        onClose={() => {
          setIsClientModalOpen(false);
          setEditingClient(null);
        }}
        editingClient={editingClient}
        onSubmitCreate={handleCreateClient}
        onSubmitUpdate={handleUpdateClient}
        persons={personsList}
        currentSession={currentSession}
        isLoading={isActionLoading}
      />

      {/* Modal Formulario Proveedor */}
      <SupplierFormModal
        isOpen={isSupplierModalOpen}
        onClose={() => {
          setIsSupplierModalOpen(false);
          setEditingSupplier(null);
        }}
        editingSupplier={editingSupplier}
        onSubmitCreate={handleCreateSupplier}
        onSubmitUpdate={handleUpdateSupplier}
        persons={personsList}
        companies={companiesList}
        currentSession={currentSession}
        isLoading={isActionLoading}
      />

      {/* Modal Formulario Persona Natural */}
      <PersonFormModal
        isOpen={isPersonModalOpen}
        onClose={() => {
          setIsPersonModalOpen(false);
          setEditingPerson(null);
        }}
        editingPerson={editingPerson}
        onSubmitCreate={handleCreatePerson}
        onSubmitUpdate={handleUpdatePerson}
        isLoading={isActionLoading}
      />

      {/* Modal Formulario Empresa Jurídica RUC 20 */}
      <CompanyFormModal
        isOpen={isCompanyModalOpen}
        onClose={() => {
          setIsCompanyModalOpen(false);
          setEditingCompany(null);
        }}
        editingCompany={editingCompany}
        onSubmitCreate={handleCreateCompany}
        onSubmitUpdate={handleUpdateCompany}
        isLoading={isActionLoading}
      />
    </div>
  );
};
