// ============================================================================
// HOOK DE GESTIÓN DEL DIRECTORIO SEGMENTADO (SLICE 2)
// Personas Naturales, Clientes con Historial de Peso, Empresas RUC 20 y Proveedores
// Ubicación: src/hooks/useEntities.ts
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import {
  ClientDetail,
  ClientFilter,
  ClientListItem,
  ClientWeightRecord,
  CompanyDetail,
  CompanyFilter,
  CompanyListItem,
  CreateClientInput,
  CreateCompanyInput,
  CreatePersonInput,
  CreateSupplierInput,
  PersonDetail,
  PersonFilter,
  PersonListItem,
  RecordClientWeightInput,
  SupplierDetail,
  SupplierFilter,
  SupplierListItem,
  UpdateClientInput,
  UpdateCompanyInput,
  UpdatePersonInput,
  UpdateSupplierInput,
} from '../types/entity';
import { AppError } from '../types/auth';
import { entityIpc } from '../services/ipc/entityIpc';
import { normalizeAppError } from '../services/ipc/client';

export interface UseEntitiesReturn {
  // Clientes
  clients: ClientListItem[];
  clientFilter: ClientFilter;
  setClientFilter: React.Dispatch<React.SetStateAction<ClientFilter>>;
  fetchClients: (filter?: ClientFilter) => Promise<void>;
  createClient: (input: CreateClientInput) => Promise<ClientDetail | null>;
  updateClient: (clientId: number, input: UpdateClientInput) => Promise<ClientDetail | null>;
  toggleClientActive: (clientId: number, currentActive: boolean) => Promise<boolean>;
  regenerateClientQr: (clientId: number) => Promise<string | null>;
  recordClientWeight: (input: RecordClientWeightInput) => Promise<ClientWeightRecord | null>;
  getClientWeightHistory: (clientId: number) => Promise<ClientWeightRecord[]>;

  // Proveedores
  suppliers: SupplierListItem[];
  supplierFilter: SupplierFilter;
  setSupplierFilter: React.Dispatch<React.SetStateAction<SupplierFilter>>;
  fetchSuppliers: (filter?: SupplierFilter) => Promise<void>;
  createSupplier: (input: CreateSupplierInput) => Promise<SupplierDetail | null>;
  updateSupplier: (supplierId: number, input: UpdateSupplierInput) => Promise<SupplierDetail | null>;
  toggleSupplierActive: (supplierId: number, currentActive: boolean) => Promise<boolean>;

  // Empresas RUC 20
  companies: CompanyListItem[];
  companyFilter: CompanyFilter;
  setCompanyFilter: React.Dispatch<React.SetStateAction<CompanyFilter>>;
  fetchCompanies: (filter?: CompanyFilter) => Promise<void>;
  createCompany: (input: CreateCompanyInput) => Promise<CompanyDetail | null>;
  updateCompany: (companyId: number, input: UpdateCompanyInput) => Promise<CompanyDetail | null>;
  toggleCompanyActive: (companyId: number, currentActive: boolean) => Promise<boolean>;

  // Base Maestra de Personas
  persons: PersonListItem[];
  personFilter: PersonFilter;
  setPersonFilter: React.Dispatch<React.SetStateAction<PersonFilter>>;
  fetchPersons: (filter?: PersonFilter) => Promise<void>;
  createPerson: (input: CreatePersonInput) => Promise<PersonDetail | null>;
  updatePerson: (personId: number, input: UpdatePersonInput) => Promise<PersonDetail | null>;
  togglePersonActive: (personId: number, currentActive: boolean) => Promise<boolean>;

  // Estados Globales de Carga y Error
  isLoading: boolean;
  isActionLoading: boolean;
  error: AppError | null;
  clearError: () => void;
  refreshAll: () => Promise<void>;
}

export function useEntities(autoFetch = true): UseEntitiesReturn {
  // Clientes
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [clientFilter, setClientFilter] = useState<ClientFilter>({});

  // Proveedores
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [supplierFilter, setSupplierFilter] = useState<SupplierFilter>({});

  // Empresas
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>({});

  // Personas
  const [persons, setPersons] = useState<PersonListItem[]>([]);
  const [personFilter, setPersonFilter] = useState<PersonFilter>({});

  // Estados
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // --------------------------------------------------------------------------
  // Fetchers
  // --------------------------------------------------------------------------
  const fetchClients = useCallback(async (customFilter?: ClientFilter) => {
    try {
      setIsLoading(true);
      setError(null);
      const activeFilter = customFilter ?? clientFilter;
      const data = await entityIpc.listClients(activeFilter);
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(normalizeAppError(err));
    } finally {
      setIsLoading(false);
    }
  }, [clientFilter]);

  const fetchSuppliers = useCallback(async (customFilter?: SupplierFilter) => {
    try {
      setIsLoading(true);
      setError(null);
      const activeFilter = customFilter ?? supplierFilter;
      const data = await entityIpc.listSuppliers(activeFilter);
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(normalizeAppError(err));
    } finally {
      setIsLoading(false);
    }
  }, [supplierFilter]);

  const fetchCompanies = useCallback(async (customFilter?: CompanyFilter) => {
    try {
      setIsLoading(true);
      setError(null);
      const activeFilter = customFilter ?? companyFilter;
      const data = await entityIpc.listCompanies(activeFilter);
      setCompanies(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(normalizeAppError(err));
    } finally {
      setIsLoading(false);
    }
  }, [companyFilter]);

  const fetchPersons = useCallback(async (customFilter?: PersonFilter) => {
    try {
      setIsLoading(true);
      setError(null);
      const activeFilter = customFilter ?? personFilter;
      const data = await entityIpc.listPersons(activeFilter);
      setPersons(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(normalizeAppError(err));
    } finally {
      setIsLoading(false);
    }
  }, [personFilter]);

  const refreshAll = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await Promise.all([
        fetchClients(),
        fetchSuppliers(),
        fetchCompanies(),
        fetchPersons(),
      ]);
    } catch (err) {
      setError(normalizeAppError(err));
    } finally {
      setIsLoading(false);
    }
  }, [fetchClients, fetchSuppliers, fetchCompanies, fetchPersons]);

  useEffect(() => {
    if (autoFetch) {
      refreshAll();
    }
  }, [autoFetch, refreshAll]);

  // --------------------------------------------------------------------------
  // Operaciones de Clientes
  // --------------------------------------------------------------------------
  const createClient = async (input: CreateClientInput): Promise<ClientDetail | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const created = await entityIpc.createClient(input);
      await Promise.all([fetchClients(), fetchPersons()]);
      return created;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const updateClient = async (
    clientId: number,
    input: UpdateClientInput
  ): Promise<ClientDetail | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const updated = await entityIpc.updateClient(clientId, input);
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? {
                ...c,
                nombres: updated.nombres,
                apellidos: updated.apellidos,
                tipo_documento: updated.tipo_documento,
                numero_documento: updated.numero_documento,
                telefono: updated.telefono,
                email: updated.email,
                direccion: updated.direccion,
                nombre_contacto_emergencia: updated.nombre_contacto_emergencia,
                numero_contacto_emergencia: updated.numero_contacto_emergencia,
                notas_medicas: updated.notas_medicas,
                peso_actual_kg: updated.peso_actual_kg,
              }
            : c
        )
      );
      await Promise.all([fetchClients(), fetchPersons(), fetchSuppliers()]);
      return updated;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleClientActive = async (
    clientId: number,
    currentActive: boolean
  ): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const nextActive = !currentActive;
      await entityIpc.toggleClientActive(clientId, nextActive);
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, estado_activo: nextActive } : c))
      );
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const regenerateClientQr = async (clientId: number): Promise<string | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const newToken = await entityIpc.regenerateClientQr(clientId);
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, codigo_qr_token: newToken } : c))
      );
      return newToken;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const recordClientWeight = async (
    input: RecordClientWeightInput
  ): Promise<ClientWeightRecord | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const record = await entityIpc.recordClientWeight(input);
      // Actualizar peso_actual_kg optimista en la lista de clientes
      setClients((prev) =>
        prev.map((c) =>
          c.id === input.cliente_id ? { ...c, peso_actual_kg: record.peso_kg } : c
        )
      );
      return record;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const getClientWeightHistory = async (clientId: number): Promise<ClientWeightRecord[]> => {
    return entityIpc.getClientWeightHistory(clientId);
  };

  // --------------------------------------------------------------------------
  // Operaciones de Proveedores
  // --------------------------------------------------------------------------
  const createSupplier = async (input: CreateSupplierInput): Promise<SupplierDetail | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const created = await entityIpc.createSupplier(input);
      await Promise.all([fetchSuppliers(), fetchPersons(), fetchCompanies()]);
      return created;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const updateSupplier = async (
    supplierId: number,
    input: UpdateSupplierInput
  ): Promise<SupplierDetail | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const updated = await entityIpc.updateSupplier(supplierId, input);
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === supplierId
            ? {
                ...s,
                rubro_o_categoria: updated.rubro_o_categoria,
                contacto_referencia: updated.contacto_referencia,
                nombre_o_razon_social: updated.nombre_o_razon_social,
                nombres: updated.nombres,
                apellidos: updated.apellidos,
                telefono: updated.telefono,
                email: updated.email,
                direccion: updated.direccion,
              }
            : s
        )
      );
      await Promise.all([fetchPersons(), fetchCompanies()]);
      return updated;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleSupplierActive = async (
    supplierId: number,
    currentActive: boolean
  ): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const nextActive = !currentActive;
      await entityIpc.toggleSupplierActive(supplierId, nextActive);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, estado_activo: nextActive } : s))
      );
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Operaciones de Empresas
  // --------------------------------------------------------------------------
  const createCompany = async (input: CreateCompanyInput): Promise<CompanyDetail | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const created = await entityIpc.createCompany(input);
      await Promise.all([fetchCompanies(), fetchSuppliers()]);
      return created;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const updateCompany = async (
    companyId: number,
    input: UpdateCompanyInput
  ): Promise<CompanyDetail | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const updated = await entityIpc.updateCompany(companyId, input);
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === companyId
            ? {
                ...c,
                razon_social: updated.razon_social,
                nombre_comercial: updated.nombre_comercial,
                telefono: updated.telefono,
                email: updated.email,
              }
            : c
        )
      );
      await fetchSuppliers();
      return updated;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleCompanyActive = async (
    companyId: number,
    currentActive: boolean
  ): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const nextActive = !currentActive;
      await entityIpc.toggleCompanyActive(companyId, nextActive);
      setCompanies((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, estado_activo: nextActive } : c))
      );
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Operaciones de Personas
  // --------------------------------------------------------------------------
  const createPerson = async (input: CreatePersonInput): Promise<PersonDetail | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const created = await entityIpc.createPerson(input);
      await Promise.all([fetchPersons(), fetchClients()]);
      return created;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const updatePerson = async (
    personId: number,
    input: UpdatePersonInput
  ): Promise<PersonDetail | null> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const updated = await entityIpc.updatePerson(personId, input);
      setPersons((prev) =>
        prev.map((p) =>
          p.id === personId
            ? {
                ...p,
                tipo_documento: updated.tipo_documento,
                numero_documento: updated.numero_documento,
                nombres: updated.nombres,
                apellidos: updated.apellidos,
                telefono: updated.telefono,
                email: updated.email,
              }
            : p
        )
      );
      await Promise.all([fetchClients(), fetchSuppliers()]);
      return updated;
    } catch (err) {
      setError(normalizeAppError(err));
      return null;
    } finally {
      setIsActionLoading(false);
    }
  };

  const togglePersonActive = async (
    personId: number,
    currentActive: boolean
  ): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const nextActive = !currentActive;
      await entityIpc.togglePersonActive(personId, nextActive);
      setPersons((prev) =>
        prev.map((p) => (p.id === personId ? { ...p, estado_activo: nextActive } : p))
      );
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  return {
    clients,
    clientFilter,
    setClientFilter,
    fetchClients,
    createClient,
    updateClient,
    toggleClientActive,
    regenerateClientQr,
    recordClientWeight,
    getClientWeightHistory,

    suppliers,
    supplierFilter,
    setSupplierFilter,
    fetchSuppliers,
    createSupplier,
    updateSupplier,
    toggleSupplierActive,

    companies,
    companyFilter,
    setCompanyFilter,
    fetchCompanies,
    createCompany,
    updateCompany,
    toggleCompanyActive,

    persons,
    personFilter,
    setPersonFilter,
    fetchPersons,
    createPerson,
    updatePerson,
    togglePersonActive,

    isLoading,
    isActionLoading,
    error,
    clearError,
    refreshAll,
  };
}
