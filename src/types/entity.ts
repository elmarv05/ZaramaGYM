// ============================================================================
// TIPOS E INTERFACES DEL DIRECTORIO SEGMENTADO (SLICE 2)
// Personas Naturales, Clientes con Historial de Peso, Empresas RUC 20 y Proveedores
// Ubicación: src/types/entity.ts
// ============================================================================

import { UserRole } from './auth';

// ----------------------------------------------------------------------------
// 1. PERSONAS NATURALES (personas)
// ----------------------------------------------------------------------------

export type PersonDocumentType = 'DNI' | 'RUC' | 'CE' | 'PASAPORTE' | 'OTRO';

export type PersonGender = 'MASCULINO' | 'FEMENINO' | 'OTRO' | 'PREFIERO_NO_DECIR';

export type ClientAcquisitionChannel =
  | 'REDES_SOCIALES'
  | 'RECOMENDACION'
  | 'CAMINANTE_FACHADA'
  | 'PUBLICIDAD_LOCAL'
  | 'PROMOCION'
  | 'OTRO';

export interface PersonListItem {
  id: number;
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  genero?: PersonGender | null;
  telefono: string | null;
  email: string | null;
  es_cliente: boolean;
  es_proveedor: boolean;
  rol_usuario: UserRole | null;
  estado_activo: boolean;
  created_at: string;
}

export interface PersonDetail {
  id: number;
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  genero?: PersonGender | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  es_cliente: boolean;
  cliente_id: number | null;
  es_proveedor: boolean;
  proveedor_id: number | null;
  rol_usuario: UserRole | null;
  usuario_id: number | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PersonFilter {
  search?: string;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreatePersonInput {
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento?: string | null;
  genero?: PersonGender | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

export interface UpdatePersonInput {
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento?: string | null;
  genero?: PersonGender | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

// ----------------------------------------------------------------------------
// 2. CLIENTES Y RÉCORD HISTÓRICO DE PESO (clientes & cliente_pesos_historial)
// ----------------------------------------------------------------------------

export interface ClientListItem {
  id: number; // cliente_id
  persona_id: number;
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento?: string | null;
  genero?: PersonGender | null;
  telefono: string | null;
  email: string | null;
  direccion?: string | null;
  codigo_qr_token: string;
  nombre_contacto_emergencia?: string | null;
  numero_contacto_emergencia?: string | null;
  notas_medicas?: string | null;
  peso_actual_kg: string | number | null;
  canal_captacion?: ClientAcquisitionChannel | null;
  persona_rol_usuario?: UserRole | null;
  estado_activo: boolean;
  created_at: string;
}

export interface ClientDetail {
  id: number; // cliente_id
  persona_id: number;
  tipo_documento: PersonDocumentType;
  numero_documento: string;
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  genero?: PersonGender | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  codigo_qr_token: string;
  nombre_contacto_emergencia: string | null;
  numero_contacto_emergencia: string | null;
  notas_medicas: string | null;
  peso_actual_kg: string | number | null;
  canal_captacion?: ClientAcquisitionChannel | null;
  persona_rol_usuario?: UserRole | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientFilter {
  search?: string;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateClientInput {
  persona_id?: number | null;
  tipo_documento?: PersonDocumentType;
  numero_documento?: string;
  nombres?: string;
  apellidos?: string;
  fecha_nacimiento?: string | null;
  genero?: PersonGender | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  nombre_contacto_emergencia?: string | null;
  numero_contacto_emergencia?: string | null;
  notas_medicas?: string | null;
  peso_inicial_kg?: string | number | null;
  canal_captacion?: ClientAcquisitionChannel | null;
}

export interface UpdateClientInput {
  tipo_documento?: PersonDocumentType;
  numero_documento?: string;
  nombres?: string;
  apellidos?: string;
  fecha_nacimiento?: string | null;
  genero?: PersonGender | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  nombre_contacto_emergencia?: string | null;
  numero_contacto_emergencia?: string | null;
  notas_medicas?: string | null;
  canal_captacion?: ClientAcquisitionChannel | null;
  modificar_datos_personales?: boolean | null;
}

export interface RecordClientWeightInput {
  cliente_id: number;
  peso_kg: string | number;
  nota?: string | null;
}

export type RecordWeightInput = RecordClientWeightInput;

export interface ClientWeightRecord {
  id: number;
  cliente_id: number;
  peso_kg: string | number;
  variacion_kg: string | number;
  nota: string | null;
  registrado_por_usuario_id: number | null;
  registrado_por_username: string | null;
  fecha_registro: string;
}

// ----------------------------------------------------------------------------
// 3. EMPRESAS JURÍDICAS RUC 20 (empresas)
// ----------------------------------------------------------------------------

export interface CompanyListItem {
  id: number;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  telefono: string | null;
  email: string | null;
  estado_activo: boolean;
  created_at: string;
}

export interface CompanyDetail {
  id: number;
  ruc: string;
  razon_social: string;
  nombre_comercial: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyFilter {
  search?: string;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateCompanyInput {
  ruc: string;
  razon_social: string;
  nombre_comercial?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

export interface UpdateCompanyInput {
  razon_social: string;
  nombre_comercial?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
}

// ----------------------------------------------------------------------------
// 4. PROVEEDORES POLIMÓRFICOS (proveedores)
// ----------------------------------------------------------------------------

export type SupplierType = 'PERSONA_NATURAL' | 'EMPRESA';

export interface SupplierListItem {
  id: number;
  tipo_proveedor: SupplierType;
  persona_id: number | null;
  empresa_id: number | null;
  tipo_documento: string;
  numero_documento: string;
  nombre_o_razon_social: string;
  nombres?: string | null;
  apellidos?: string | null;
  nombre_comercial: string | null;
  rubro_o_categoria: string | null;
  contacto_referencia: string | null;
  telefono: string | null;
  email: string | null;
  direccion?: string | null;
  persona_rol_usuario?: UserRole | null;
  estado_activo: boolean;
  created_at: string;
}

export interface SupplierDetail {
  id: number;
  tipo_proveedor: SupplierType;
  persona_id: number | null;
  empresa_id: number | null;
  tipo_documento: string;
  numero_documento: string;
  nombre_o_razon_social: string;
  nombres?: string | null;
  apellidos?: string | null;
  nombre_comercial: string | null;
  rubro_o_categoria: string | null;
  contacto_referencia: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  persona_rol_usuario?: UserRole | null;
  estado_activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierFilter {
  search?: string;
  tipo_proveedor?: SupplierType;
  solo_activos?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateSupplierInput {
  tipo_proveedor: SupplierType;
  persona_id?: number | null;
  empresa_id?: number | null;
  rubro_o_categoria?: string | null;
  contacto_referencia?: string | null;
  // Campos auxiliares si se crea persona/empresa en el mismo flujo:
  persona_data?: CreatePersonInput;
  empresa_data?: CreateCompanyInput;
}

export interface UpdateSupplierInput {
  rubro_o_categoria?: string | null;
  contacto_referencia?: string | null;
  persona_data?: UpdatePersonInput | null;
  empresa_data?: UpdateCompanyInput | null;
}
