// ============================================================================
// TIPOS E INTERFACES DE AUTENTICACIÓN, USUARIOS Y AUDITORÍA (SLICE 1)
// Ubicación: src/types/auth.ts
// ============================================================================

import type { UpdatePersonInput } from './entity';

export type UserRole = 'ADMINISTRADOR' | 'SUPERVISOR' | 'RECEPCIONISTA';

export type AppErrorCode =
  | 'Unauthorized'
  | 'Forbidden'
  | 'NotFound'
  | 'Validation'
  | 'Conflict'
  | 'SessionLocked'
  | 'Internal';

export interface AppError {
  code: AppErrorCode;
  message: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthSession {
  user_id: number;
  persona_id: number;
  username: string;
  nombre_completo: string;
  rol: UserRole;
  foto_perfil_data_url: string | null;
  is_locked: boolean;
  login_at: string;
}

export interface UserListItem {
  id: number;
  persona_id: number;
  username: string;
  nombres: string;
  apellidos: string;
  numero_documento: string;
  tipo_documento: string;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  rol: UserRole;
  foto_perfil_data_url: string | null;
  estado_activo: boolean;
  ultimo_login: string | null;
  created_at: string;
}

export interface CreateUserInput {
  persona_id?: number | null;
  username: string;
  password: string;
  tipo_documento?: string;
  numero_documento?: string;
  nombres?: string;
  apellidos?: string;
  telefono?: string | null;
  email?: string | null;
  rol: UserRole;
  foto_perfil_data_url?: string | null;
}

export interface UpdateUserInput {
  user_id?: number;
  username?: string | null;
  new_password?: string | null;
  rol?: UserRole | null;
  foto_perfil_data_url?: string | null;
  persona_data?: UpdatePersonInput | null;
}

export interface UpdateUserPhotoInput {
  user_id: number;
  foto_perfil_data_url: string | null;
}

export interface AuditFilter {
  modulo?: string | null;
  accion?: string | null;
  username?: string | null;
  desde?: string | null;
  hasta?: string | null;
  limit?: number | null;
}

export interface AuditLogItem {
  id: number;
  usuario_id: number | null;
  username: string;
  accion: string;
  modulo: string;
  detalles_json: string;
  ip_o_terminal: string;
  created_at: string;
}
