import { describe, it, expect } from 'vitest';
import {
  validatePersonDocument,
  validatePersonForm,
  validateClientForm,
  validateRecordWeightInput,
  validateCompanyForm,
  validateSupplierForm,
  buildWhatsAppWelcomeLink,
  validateEntityEmail,
  validateEntityPhone,
  validateBirthDate,
  formatKg,
  formatWeightVariation,
} from '../../domain/entity';
import { CreateClientInput, CreateCompanyInput, CreatePersonInput, CreateSupplierInput } from '../../types/entity';

describe('Domain: Entity Validations & Helpers (Slice 2)', () => {
  describe('validatePersonDocument', () => {
    it('debe validar DNI de 8 dígitos para PERSONA_NATURAL', () => {
      expect(validatePersonDocument('DNI', '1234567')).toContain('8 dígitos');
      expect(validatePersonDocument('DNI', '123456789')).toContain('8 dígitos');
      expect(validatePersonDocument('DNI', 'abcdefgh')).toContain('8 dígitos');
      expect(validatePersonDocument('DNI', '71234567')).toBeNull();
    });

    it('debe validar RUC 10, 15 o 17 para PERSONA_NATURAL', () => {
      expect(validatePersonDocument('RUC', '20601234567')).toContain('comenzar con 10, 15 o 17');
      expect(validatePersonDocument('RUC', '10712345678')).toBeNull();
      expect(validatePersonDocument('RUC', '15712345678')).toBeNull();
      expect(validatePersonDocument('RUC', '17712345678')).toBeNull();
    });
  });

  describe('validateEntityEmail, validateEntityPhone & validateBirthDate', () => {
    it('valida emails opcionales', () => {
      expect(validateEntityEmail(null)).toBeNull();
      expect(validateEntityEmail('')).toBeNull();
      expect(validateEntityEmail('invalido')).toContain('formato de correo');
      expect(validateEntityEmail('contacto@empresa.com')).toBeNull();
    });

    it('valida teléfonos opcionales de Perú', () => {
      expect(validateEntityPhone(null)).toBeNull();
      expect(validateEntityPhone('')).toBeNull();
      expect(validateEntityPhone('123')).toContain('entre 7 y 15 dígitos');
      expect(validateEntityPhone('987654321')).toBeNull();
      expect(validateEntityPhone('+51 987 654 321')).toBeNull();
    });

    it('valida fecha de nacimiento no futura', () => {
      expect(validateBirthDate(null)).toBeNull();
      expect(validateBirthDate('2000-05-15')).toBeNull();
      expect(validateBirthDate('2099-01-01')).toContain('no puede ser una fecha futura');
    });
  });

  describe('validatePersonForm - Regla de Apellidos Obligatorios', () => {
    it('falla si la persona natural no tiene apellidos', () => {
      const input: CreatePersonInput = {
        tipo_documento: 'DNI',
        numero_documento: '71234567',
        nombres: 'Carlos',
        apellidos: '',
      };

      const result = validatePersonForm(input);
      expect(result.isValid).toBe(false);
      expect(result.errors.apellidos).toContain('apellidos son obligatorios');
    });

    it('pasa con datos válidos', () => {
      const input: CreatePersonInput = {
        tipo_documento: 'DNI',
        numero_documento: '71234567',
        nombres: 'Carlos',
        apellidos: 'Pérez García',
      };

      const result = validatePersonForm(input);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedInput?.apellidos).toBe('Pérez García');
    });
  });

  describe('validateClientForm - Salud y Peso Inicial', () => {
    it('valida cliente con peso inicial válido y contactos de emergencia', () => {
      const input: CreateClientInput = {
        tipo_documento: 'DNI',
        numero_documento: '71234567',
        nombres: 'Roberto',
        apellidos: 'Mendoza',
        nombre_contacto_emergencia: 'Dra. Rosa (Hermana)',
        numero_contacto_emergencia: '912345678',
        notas_medicas: 'Asma leve controlada',
        peso_inicial_kg: '78.50',
      };

      const result = validateClientForm(input);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('falla si el peso inicial es negativo o fuera de rango', () => {
      const input: CreateClientInput = {
        tipo_documento: 'DNI',
        numero_documento: '71234567',
        nombres: 'Roberto',
        apellidos: 'Mendoza',
        peso_inicial_kg: '-5',
      };

      const result = validateClientForm(input);
      expect(result.isValid).toBe(false);
      expect(result.errors.peso_inicial_kg).toContain('entre 1 y 400 kg');
    });
  });

  describe('validateRecordWeightInput', () => {
    it('valida peso positivo dentro del rango', () => {
      const result = validateRecordWeightInput({
        cliente_id: 1,
        peso_kg: '76.20',
        nota: 'Control semana 2',
      });
      expect(result.isValid).toBe(true);
      expect(result.sanitizedInput?.peso_kg).toBe('76.20');
    });

    it('rechaza peso inválido o 0', () => {
      const result = validateRecordWeightInput({
        cliente_id: 1,
        peso_kg: '0',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.peso_kg).toContain('entre 1 y 400 kg');
    });
  });

  describe('validateCompanyForm - RUC 20 Exclusivo', () => {
    it('debe exigir que el RUC tenga 11 dígitos y comience con 20', () => {
      const input: CreateCompanyInput = {
        ruc: '10712345678', // Comienza con 10 (persona natural)
        razon_social: 'Empresa Test SAC',
      };

      const result = validateCompanyForm(input);
      expect(result.isValid).toBe(false);
      expect(result.errors.ruc).toContain('comenzar con 20');
    });

    it('acepta RUC 20 válido con razón social', () => {
      const input: CreateCompanyInput = {
        ruc: '20601234567',
        razon_social: 'Distribuidora Fitness SAC',
        nombre_comercial: 'FitSupps',
      };

      const result = validateCompanyForm(input);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedInput?.razon_social).toBe('Distribuidora Fitness SAC');
    });
  });

  describe('validateSupplierForm - Polimorfismo Limpio', () => {
    it('requiere datos de empresa cuando tipo es EMPRESA', () => {
      const input: CreateSupplierInput = {
        tipo_proveedor: 'EMPRESA',
      };

      const result = validateSupplierForm(input);
      expect(result.isValid).toBe(false);
      expect(result.errors.empresa_id).toContain('empresa jurídica RUC 20');
    });

    it('requiere datos de persona cuando tipo es PERSONA_NATURAL', () => {
      const input: CreateSupplierInput = {
        tipo_proveedor: 'PERSONA_NATURAL',
      };

      const result = validateSupplierForm(input);
      expect(result.isValid).toBe(false);
      expect(result.errors.persona_id).toContain('persona natural');
    });
  });

  describe('formatKg & formatWeightVariation', () => {
    it('formatea kg correctamente', () => {
      expect(formatKg(null)).toBe('-- kg');
      expect(formatKg('75.5')).toBe('75.50 kg');
      expect(formatKg(80)).toBe('80.00 kg');
    });

    it('formatea variación con badges descriptivos', () => {
      expect(formatWeightVariation(0).text).toContain('0.00 kg');
      expect(formatWeightVariation(1.5).text).toBe('+1.50 kg');
      expect(formatWeightVariation(1.5).variant).toBe('warning');
      expect(formatWeightVariation(-2.3).text).toBe('-2.30 kg');
      expect(formatWeightVariation(-2.3).variant).toBe('success');
    });
  });

  describe('buildWhatsAppWelcomeLink', () => {
    it('retorna null si no hay teléfono o tiene menos de 9 dígitos', () => {
      expect(buildWhatsAppWelcomeLink(null, 'Carlos', 'ZG-123')).toBeNull();
      expect(buildWhatsAppWelcomeLink('', 'Carlos', 'ZG-123')).toBeNull();
      expect(buildWhatsAppWelcomeLink('12345', 'Carlos', 'ZG-123')).toBeNull();
    });

    it('construye enlace con prefijo 51 y mensaje codificado para celular de 9 dígitos', () => {
      const link = buildWhatsAppWelcomeLink('987654321', 'Carlos Pérez', 'ZG-A1B2C3D4E5F67890');
      expect(link).not.toBeNull();
      expect(link).toContain('https://wa.me/51987654321?text=');
      expect(link).toContain(encodeURIComponent('Carlos Pérez'));
      expect(link).toContain(encodeURIComponent('ZG-A1B2C3D4E5F67890'));
      expect(link).toContain('ZaramaGYM');
    });

    it('respeta número con prefijo de país si ya tiene más de 9 dígitos', () => {
      const link = buildWhatsAppWelcomeLink('+51 987 654 321', 'Ana', 'ZG-TEST');
      expect(link).toContain('https://wa.me/51987654321?text=');
    });
  });
});
