// ============================================================================
// SERVICIOS IPC: DIRECTORIO SEGMENTADO Y CREDENCIAL QR (SLICE 2)
// Personas Naturales, Clientes con Historial de Pesos, Empresas RUC 20 y Proveedores
// Ubicación: src/services/ipc/entityIpc.ts
// ============================================================================

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
} from '../../types/entity';
import { safeInvoke } from './client';

export const entityIpc = {
  // ==========================================================================
  // 1. PERSONAS NATURALES (personas)
  // ==========================================================================

  /**
   * Lista personas naturales visibles según el rango jerárquico del usuario en sesión
   */
  async listPersons(filter: PersonFilter = {}): Promise<PersonListItem[]> {
    return safeInvoke<PersonListItem[]>('list_persons', { filter });
  },

  /**
   * Obtiene el detalle de una persona natural por ID
   */
  async getPerson(personId: number): Promise<PersonDetail> {
    return safeInvoke<PersonDetail>('get_person', {
      personId,
      person_id: personId,
    });
  },

  /**
   * Registra una nueva persona natural
   */
  async createPerson(input: CreatePersonInput): Promise<PersonDetail> {
    return safeInvoke<PersonDetail>('create_person', { input });
  },

  /**
   * Actualiza datos de una persona natural
   */
  async updatePerson(personId: number, input: UpdatePersonInput): Promise<PersonDetail> {
    return safeInvoke<PersonDetail>('update_person', {
      personId,
      person_id: personId,
      input,
    });
  },

  /**
   * Alterna el estado activo de una persona (Zero-Delete con defensas)
   */
  async togglePersonActive(personId: number, active: boolean): Promise<void> {
    return safeInvoke<void>('toggle_person_active', {
      personId,
      person_id: personId,
      active,
    });
  },

  // ==========================================================================
  // 2. CLIENTES Y RÉCORD HISTÓRICO DE PESOS (clientes & cliente_pesos_historial)
  // ==========================================================================

  /**
   * Lista clientes con su QR y último peso registrado
   */
  async listClients(filter: ClientFilter = {}): Promise<ClientListItem[]> {
    return safeInvoke<ClientListItem[]>('list_clients', { filter });
  },

  /**
   * Obtiene el detalle de un cliente por su client_id
   */
  async getClient(clientId: number): Promise<ClientDetail> {
    return safeInvoke<ClientDetail>('get_client', {
      clientId,
      client_id: clientId,
    });
  },

  /**
   * Inscribe un nuevo cliente (crea o vincula persona, genera QR y registra peso inicial si existe)
   */
  async createClient(input: CreateClientInput): Promise<ClientDetail> {
    return safeInvoke<ClientDetail>('create_client', { input });
  },

  /**
   * Actualiza datos de contacto de emergencia, salud y persona del cliente
   */
  async updateClient(clientId: number, input: UpdateClientInput): Promise<ClientDetail> {
    return safeInvoke<ClientDetail>('update_client', {
      clientId,
      client_id: clientId,
      input,
    });
  },

  /**
   * Alterna el estado activo del cliente
   */
  async toggleClientActive(clientId: number, active: boolean): Promise<void> {
    return safeInvoke<void>('toggle_client_active', {
      clientId,
      client_id: clientId,
      active,
    });
  },

  /**
   * Emite un nuevo token QR CSPRNG ZG-<16 HEX> para el cliente
   */
  async regenerateClientQr(clientId: number): Promise<string> {
    return safeInvoke<string>('regenerate_client_qr', {
      clientId,
      client_id: clientId,
    });
  },

  /**
   * Registra un nuevo récord de peso para el cliente con cálculo automático de variación
   */
  async recordClientWeight(input: RecordClientWeightInput): Promise<ClientWeightRecord> {
    return safeInvoke<ClientWeightRecord>('record_client_weight', { input });
  },

  /**
   * Consulta el historial cronológico descendente de pesaje de un cliente
   */
  async getClientWeightHistory(clientId: number): Promise<ClientWeightRecord[]> {
    return safeInvoke<ClientWeightRecord[]>('get_client_weight_history', {
      clientId,
      client_id: clientId,
    });
  },

  // ==========================================================================
  // 3. EMPRESAS JURÍDICAS RUC 20 (empresas)
  // ==========================================================================

  /**
   * Lista empresas jurídicas registradas
   */
  async listCompanies(filter: CompanyFilter = {}): Promise<CompanyListItem[]> {
    return safeInvoke<CompanyListItem[]>('list_companies', { filter });
  },

  /**
   * Obtiene detalle de una empresa jurídica por su ID
   */
  async getCompany(companyId: number): Promise<CompanyDetail> {
    return safeInvoke<CompanyDetail>('get_company', {
      companyId,
      company_id: companyId,
    });
  },

  /**
   * Registra una empresa jurídica validando RUC 20 de 11 dígitos
   */
  async createCompany(input: CreateCompanyInput): Promise<CompanyDetail> {
    return safeInvoke<CompanyDetail>('create_company', { input });
  },

  /**
   * Actualiza datos de una empresa jurídica
   */
  async updateCompany(companyId: number, input: UpdateCompanyInput): Promise<CompanyDetail> {
    return safeInvoke<CompanyDetail>('update_company', {
      companyId,
      company_id: companyId,
      input,
    });
  },

  /**
   * Alterna el estado activo de una empresa jurídica
   */
  async toggleCompanyActive(companyId: number, active: boolean): Promise<void> {
    return safeInvoke<void>('toggle_company_active', {
      companyId,
      company_id: companyId,
      active,
    });
  },

  // ==========================================================================
  // 4. PROVEEDORES POLIMÓRFICOS (proveedores)
  // ==========================================================================

  /**
   * Lista proveedores registrados (Persona Natural o Empresa RUC 20)
   */
  async listSuppliers(filter: SupplierFilter = {}): Promise<SupplierListItem[]> {
    return safeInvoke<SupplierListItem[]>('list_suppliers', { filter });
  },

  /**
   * Obtiene detalle unificado de un proveedor
   */
  async getSupplier(supplierId: number): Promise<SupplierDetail> {
    return safeInvoke<SupplierDetail>('get_supplier', {
      supplierId,
      supplier_id: supplierId,
    });
  },

  /**
   * Vincula una persona o empresa como proveedor con rubro y contacto de referencia
   */
  async createSupplier(input: CreateSupplierInput): Promise<SupplierDetail> {
    return safeInvoke<SupplierDetail>('create_supplier', { input });
  },

  /**
   * Actualiza rubro o contacto de referencia de un proveedor
   */
  async updateSupplier(supplierId: number, input: UpdateSupplierInput): Promise<SupplierDetail> {
    return safeInvoke<SupplierDetail>('update_supplier', {
      supplierId,
      supplier_id: supplierId,
      input,
    });
  },

  /**
   * Alterna estado activo del proveedor
   */
  async toggleSupplierActive(supplierId: number, active: boolean): Promise<void> {
    return safeInvoke<void>('toggle_supplier_active', {
      supplierId,
      supplier_id: supplierId,
      active,
    });
  },

  /**
   * Abre una URL externa segura (ej. WhatsApp Web) mediante Tauri IPC o fallback navegador
   */
  async openExternalUrl(url: string): Promise<void> {
    const isTauriRuntime =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
    if (isTauriRuntime) {
      await safeInvoke<void>('open_external_url', { url });
      return;
    }
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  },
};
