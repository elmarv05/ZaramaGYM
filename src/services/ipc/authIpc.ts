// ============================================================================
// SERVICIOS IPC: AUTENTICACIÓN Y SESIÓN
// Ubicación: src/services/ipc/authIpc.ts
// ============================================================================

import {
  AuthSession,
  CrashRecoveryNotice,
  LoginCredentials,
} from '../../types/auth';
import { safeInvoke } from './client';

export const authIpc = {
  /**
   * Inicia sesión con credenciales
   */
  async login(credentials: LoginCredentials): Promise<AuthSession> {
    return safeInvoke<AuthSession>('login', { credentials });
  },

  /**
   * Cierra la sesión activa actual
   */
  async logout(): Promise<void> {
    return safeInvoke<void>('logout');
  },

  /**
   * Consulta si existe una sesión activa y su estado de bloqueo
   */
  async getCurrentSession(): Promise<AuthSession | null> {
    return safeInvoke<AuthSession | null>('get_current_session');
  },

  /**
   * Bloquea el turno del usuario activo
   */
  async lockSession(): Promise<void> {
    return safeInvoke<void>('lock_session');
  },

  /**
   * Desbloquea el turno mediante la contraseña del usuario en sesión
   */
  async unlockSession(password: string): Promise<AuthSession> {
    return safeInvoke<AuthSession>('unlock_session', { password });
  },

  /**
   * Cambia la contraseña del usuario actualmente autenticado
   */
  async changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
    return safeInvoke<void>('change_own_password', {
      currentPassword,
      newPassword,
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  /**
   * Consulta si el sistema detectó un cierre forzado/apagado brusco con caja abierta al iniciar
   */
  async getCrashRecoveryNotice(): Promise<CrashRecoveryNotice | null> {
    return safeInvoke<CrashRecoveryNotice | null>('get_crash_recovery_notice');
  },

  /**
   * Marca como reconocido el aviso de recuperación de cierre forzado en la sesión actual
   */
  async acknowledgeCrashRecoveryNotice(): Promise<void> {
    return safeInvoke<void>('acknowledge_crash_recovery_notice');
  },
};
