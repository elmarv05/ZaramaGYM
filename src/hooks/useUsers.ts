// ============================================================================
// HOOK DE GESTIÓN DE USUARIOS DEL SISTEMA (SLICE 1)
// Ubicación: src/hooks/useUsers.ts
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { UserListItem, CreateUserInput, UpdateUserInput, AppError } from '../types/auth';
import { userIpc } from '../services/ipc/userIpc';
import { normalizeAppError } from '../services/ipc/client';

export interface UseUsersReturn {
  users: UserListItem[];
  isLoading: boolean;
  isActionLoading: boolean;
  error: AppError | null;
  fetchUsers: () => Promise<void>;
  createUser: (input: CreateUserInput) => Promise<boolean>;
  updateUser: (userId: number, input: UpdateUserInput) => Promise<boolean>;
  updatePhoto: (userId: number, fotoPerfilDataUrl: string | null) => Promise<boolean>;
  toggleActive: (userId: number, currentActive: boolean) => Promise<boolean>;
  clearError: () => void;
}

export function useUsers(autoFetch = true): UseUsersReturn {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(autoFetch);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await userIpc.listUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(normalizeAppError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchUsers();
    }
  }, [autoFetch, fetchUsers]);

  const createUser = async (input: CreateUserInput): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const newUser = await userIpc.createUser(input);
      setUsers((prev) => [newUser, ...prev]);
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const updateUser = async (userId: number, input: UpdateUserInput): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const updatedUser = await userIpc.updateUser(userId, input);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updatedUser : u)));
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const updatePhoto = async (
    userId: number,
    fotoPerfilDataUrl: string | null
  ): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      await userIpc.updateUserPhoto(userId, fotoPerfilDataUrl);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, foto_perfil_data_url: fotoPerfilDataUrl } : u))
      );
      return true;
    } catch (err) {
      setError(normalizeAppError(err));
      return false;
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleActive = async (userId: number, currentActive: boolean): Promise<boolean> => {
    try {
      setIsActionLoading(true);
      setError(null);
      const nextActive = !currentActive;
      await userIpc.toggleUserActive(userId, nextActive);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, estado_activo: nextActive } : u))
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
    users,
    isLoading,
    isActionLoading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    updatePhoto,
    toggleActive,
    clearError,
  };
}
