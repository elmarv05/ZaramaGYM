// ============================================================================
// DOMINIO DE AUTENTICACIÓN - REGLAS Y VALIDACIONES PURAS (CLIENTE)
// Ubicación: src/domain/auth.ts
// ============================================================================

import { LoginCredentials } from '../types/auth';

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Valida credenciales antes de enviar comando IPC login
 */
export function validateLoginCredentials(credentials: LoginCredentials): ValidationResult {
  const errors: Record<string, string> = {};

  const username = credentials.username?.trim();
  if (!username) {
    errors.username = 'El nombre de usuario es obligatorio.';
  }

  const password = credentials.password;
  if (!password) {
    errors.password = 'La contraseña es obligatoria.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valida reglas de cambio de contraseña
 */
export function validateChangePassword(params: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  if (!params.currentPassword) {
    errors.currentPassword = 'Debes ingresar tu contraseña actual.';
  }

  if (!params.newPassword) {
    errors.newPassword = 'Debes ingresar una nueva contraseña.';
  } else if (params.newPassword.length < 6) {
    errors.newPassword = 'La nueva contraseña debe tener al menos 6 caracteres.';
  } else if (params.currentPassword && params.newPassword === params.currentPassword) {
    errors.newPassword = 'La nueva contraseña no puede ser idéntica a la actual.';
  }

  if (!params.confirmPassword) {
    errors.confirmPassword = 'Debes confirmar la nueva contraseña.';
  } else if (params.newPassword && params.newPassword !== params.confirmPassword) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valida contraseña para desbloqueo de turno
 */
export function validateUnlockPassword(password: string): ValidationResult {
  const errors: Record<string, string> = {};
  if (!password || password.trim().length === 0) {
    errors.password = 'Ingresa tu contraseña para desbloquear el turno.';
  }
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
