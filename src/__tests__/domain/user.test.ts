import { describe, it, expect } from 'vitest';
import {
  validateDocumentNumber,
  validateEmail,
  validatePhone,
  validateCreateUserInput,
  fileToDataUrl,
} from '../../domain/user';

describe('Domain: User Validations', () => {
  describe('validateDocumentNumber', () => {
    it('debe exigir exactamente 8 dígitos para DNI', () => {
      expect(validateDocumentNumber('DNI', '1234567')).toContain('8 dígitos');
      expect(validateDocumentNumber('DNI', '123456789')).toContain('8 dígitos');
      expect(validateDocumentNumber('DNI', '1234567a')).toContain('8 dígitos');
      expect(validateDocumentNumber('DNI', '70809010')).toBeNull();
    });

    it('debe exigir exactamente 11 dígitos iniciando en 10, 15 o 17 para RUC de persona natural', () => {
      expect(validateDocumentNumber('RUC', '2012345678')).toContain('11 dígitos');
      expect(validateDocumentNumber('RUC', '20601234567')).toContain('comenzar con 10, 15 o 17');
      expect(validateDocumentNumber('RUC', '10712345678')).toBeNull();
      expect(validateDocumentNumber('RUC', '15712345678')).toBeNull();
      expect(validateDocumentNumber('RUC', '17712345678')).toBeNull();
    });

    it('debe requerir al menos 3 caracteres para otros documentos', () => {
      expect(validateDocumentNumber('PASAPORTE', 'AB')).toContain('al menos 3');
      expect(validateDocumentNumber('PASAPORTE', 'AB123456')).toBeNull();
    });
  });

  describe('validateEmail', () => {
    it('debe permitir email nulo o vacío por ser opcional', () => {
      expect(validateEmail(null)).toBeNull();
      expect(validateEmail('')).toBeNull();
      expect(validateEmail('   ')).toBeNull();
    });

    it('debe rechazar formato de email inválido', () => {
      expect(validateEmail('no-email')).toContain('formato de correo');
      expect(validateEmail('user@domain')).toContain('formato de correo');
    });

    it('debe aceptar emails bien formados', () => {
      expect(validateEmail('recepcion@zaramagym.com')).toBeNull();
    });
  });

  describe('validatePhone', () => {
    it('debe permitir teléfono vacío por ser opcional', () => {
      expect(validatePhone(null)).toBeNull();
      expect(validatePhone('')).toBeNull();
    });

    it('debe validar formatos numéricos con prefijo internacional', () => {
      expect(validatePhone('+51 987 654 321')).toBeNull();
      expect(validatePhone('abcde')).toContain('formato de teléfono');
    });
  });

  describe('validateCreateUserInput', () => {
    it('debe requerir todos los campos obligatorios incluyendo apellidos', () => {
      const result = validateCreateUserInput({
        username: '',
        password: '',
        tipo_documento: '',
        numero_documento: '',
        nombres: '',
        apellidos: '',
        rol: 'RECEPCIONISTA',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.username).toBeDefined();
      expect(result.errors.password).toBeDefined();
      expect(result.errors.tipo_documento).toBeDefined();
      expect(result.errors.numero_documento).toBeDefined();
      expect(result.errors.nombres).toBeDefined();
      expect(result.errors.apellidos).toBeDefined();
    });

    it('debe validar contraseña mínima de 6 caracteres', () => {
      const result = validateCreateUserInput({
        username: 'juanp',
        password: '123',
        tipo_documento: 'DNI',
        numero_documento: '44556677',
        nombres: 'Juan',
        apellidos: 'Pérez',
        rol: 'RECEPCIONISTA',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.password).toContain('al menos 6 caracteres');
    });

    it('debe exigir apellidos de al menos 2 caracteres', () => {
      const result = validateCreateUserInput({
        username: 'juanp',
        password: 'Password123',
        tipo_documento: 'DNI',
        numero_documento: '44556677',
        nombres: 'Juan',
        apellidos: 'P',
        rol: 'RECEPCIONISTA',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.apellidos).toContain('al menos 2 caracteres');
    });

    it('debe aceptar datos válidos para nuevo operador con foto opcional', () => {
      const result = validateCreateUserInput({
        username: 'juan.perez',
        password: 'PasswordSeguro123',
        tipo_documento: 'DNI',
        numero_documento: '71234567',
        nombres: 'Juan Carlos',
        apellidos: 'Pérez García',
        telefono: '+51 999888777',
        email: 'juan@zaramagym.com',
        rol: 'RECEPCIONISTA',
        foto_perfil_data_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      });

      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });
  });

  describe('fileToDataUrl', () => {
    it('rechaza archivos que no sean imágenes', async () => {
      const nonImageFile = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' });
      await expect(fileToDataUrl(nonImageFile)).rejects.toThrow('no es una imagen válida');
    });
  });
});
