import { describe, it, expect } from 'vitest';
import {
  validateLoginCredentials,
  validateChangePassword,
  validateUnlockPassword,
} from '../../domain/auth';

describe('Domain: Auth Validations', () => {
  describe('validateLoginCredentials', () => {
    it('debe fallar si el usuario o contraseña están vacíos', () => {
      const result = validateLoginCredentials({ username: '', password: '' });
      expect(result.isValid).toBe(false);
      expect(result.errors.username).toBeDefined();
      expect(result.errors.password).toBeDefined();
    });

    it('debe fallar si el username contiene solo espacios en blanco', () => {
      const result = validateLoginCredentials({ username: '   ', password: 'secretpassword' });
      expect(result.isValid).toBe(false);
      expect(result.errors.username).toBeDefined();
    });

    it('debe ser válido con usuario y contraseña provistos', () => {
      const result = validateLoginCredentials({
        username: 'admin',
        password: 'adminpassword',
      });
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });

  describe('validateChangePassword', () => {
    it('debe fallar si falta la contraseña actual', () => {
      const result = validateChangePassword({
        currentPassword: '',
        newPassword: 'newSecret123',
        confirmPassword: 'newSecret123',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.currentPassword).toBeDefined();
    });

    it('debe fallar si la nueva contraseña tiene menos de 6 caracteres', () => {
      const result = validateChangePassword({
        currentPassword: 'oldSecret123',
        newPassword: '12345',
        confirmPassword: '12345',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.newPassword).toContain('al menos 6 caracteres');
    });

    it('debe fallar si la nueva contraseña es idéntica a la actual', () => {
      const result = validateChangePassword({
        currentPassword: 'secretPassword123',
        newPassword: 'secretPassword123',
        confirmPassword: 'secretPassword123',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.newPassword).toContain('no puede ser idéntica');
    });

    it('debe fallar si la confirmación no coincide con la nueva contraseña', () => {
      const result = validateChangePassword({
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123',
        confirmPassword: 'otherPassword123',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.confirmPassword).toContain('no coinciden');
    });

    it('debe ser exitoso con datos correctos', () => {
      const result = validateChangePassword({
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123',
      });
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });
  });

  describe('validateUnlockPassword', () => {
    it('debe fallar con contraseña vacía', () => {
      const result = validateUnlockPassword('');
      expect(result.isValid).toBe(false);
      expect(result.errors.password).toBeDefined();
    });

    it('debe ser válido con contraseña ingresada', () => {
      const result = validateUnlockPassword('admin123');
      expect(result.isValid).toBe(true);
      expect(result.errors.password).toBeUndefined();
    });
  });
});
