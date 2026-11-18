// ============================================================================
// SERVICIOS IPC: GESTIÓN DE USUARIOS (SLICE 1)
// Ubicación: src/services/ipc/userIpc.ts
// ============================================================================

import { CreateUserInput, UpdateUserInput, UserListItem } from '../../types/auth';
import { safeInvoke } from './client';

export const userIpc = {
  /**
   * Obtiene la lista de usuarios del sistema accesible según la jerarquía del operador
   */
  async listUsers(): Promise<UserListItem[]> {
    return safeInvoke<UserListItem[]>('list_users');
  },

  /**
   * Crea un nuevo usuario y su persona natural asociada
   */
  async createUser(input: CreateUserInput): Promise<UserListItem> {
    return safeInvoke<UserListItem>('create_user', { input });
  },

  /**
   * Actualiza datos de un usuario y opcionalmente su persona vinculada
   */
  async updateUser(userId: number, input: UpdateUserInput): Promise<UserListItem> {
    return safeInvoke<UserListItem>('update_user', {
      input: {
        ...input,
        user_id: userId,
      },
    });
  },

  /**
   * Actualiza la foto de perfil del usuario (propia o delegada según rol)
   */
  async updateUserPhoto(userId: number, fotoPerfilDataUrl: string | null): Promise<void> {
    return safeInvoke<void>('update_user_photo', {
      input: {
        user_id: userId,
        foto_perfil_data_url: fotoPerfilDataUrl,
        userId,
        fotoPerfilDataUrl,
      },
    });
  },

  /**
   * Activa o desactiva a un usuario del sistema (con defensas de auto-desactivación y admin root)
   */
  async toggleUserActive(userId: number, active: boolean): Promise<void> {
    return safeInvoke<void>('toggle_user_active', {
      userId,
      user_id: userId,
      active,
    });
  },
};
