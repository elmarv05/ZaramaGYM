// ============================================================================
// HOOK DE AUTENTICACIÓN, ROLES Y CICLO DE SESIÓN
// Ubicación: src/hooks/useAuth.ts
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { AuthSession, AppError, LoginCredentials } from '../types/auth';
import { authIpc } from '../services/ipc/authIpc';
import { normalizeAppError } from '../services/ipc/client';

export interface UseAuthReturn {
  session: AuthSession | null;
  isLoading: boolean;
  isActionLoading: boolean;
  error: AppError | null;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  logout: () => Promise<void>;
  lockSession: () => Promise<void>;
  unlockSession: (password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  checkSession: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const checkSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const activeSession = await authIpc.getCurrentSession();
      setSession(activeSession);
      setError(null);
    } catch (err) {
      setError(normalizeAppError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = async (credentials: LoginCredentials): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const newSession = await authIpc.login(credentials);
      setSession(newSession);
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setIsActionLoading(true);
      await authIpc.logout();
      setSession(null);
      setError(null);
    } catch (err) {
      setError(normalizeAppError(err));
      // Mantener la sesión activa si el backend rechaza el cierre (ej. turno de caja ABIERTO)
    } finally {
      setIsActionLoading(false);
    }
  };

  const lockSession = async (): Promise<void> => {
    try {
      setIsActionLoading(true);
      setError(null);
      await authIpc.lockSession();
      setSession((prev) => (prev ? { ...prev, is_locked: true } : null));
    } catch (err) {
      setError(normalizeAppError(err));
    } finally {
      setIsActionLoading(false);
    }
  };

  const unlockSession = async (password: string): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const updatedSession = await authIpc.unlockSession(password);
      setSession(updatedSession);
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      await authIpc.changeOwnPassword(currentPassword, newPassword);
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  return {
    session,
    isLoading,
    isActionLoading,
    error,
    login,
    logout,
    lockSession,
    unlockSession,
    changePassword,
    checkSession,
    clearError,
  };
}
