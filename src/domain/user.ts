// ============================================================================
// DOMINIO DE USUARIOS - REGLAS Y VALIDACIONES PURAS (CLIENTE)
// Ubicación: src/domain/user.ts
// ============================================================================

import { CreateUserInput, UserRole } from '../types/auth';

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export const VALID_ROLES: UserRole[] = ['ADMINISTRADOR', 'RECEPCIONISTA'];
export const VALID_DOCUMENT_TYPES = ['DNI', 'RUC', 'CE', 'PASAPORTE', 'OTRO'] as const;
export type DocumentType = (typeof VALID_DOCUMENT_TYPES)[number];

/**
 * Valida un número de documento para Persona Natural según su tipo.
 * En la tabla personas solo existen personas naturales: si es RUC solo admite inicios 10, 15 o 17.
 */
export function validateDocumentNumber(tipo: string, numero: string): string | null {
  const cleanNumber = numero?.trim() ?? '';
  if (!cleanNumber) {
    return 'El número de documento es obligatorio.';
  }

  if (tipo === 'DNI') {
    if (!/^\d{8}$/.test(cleanNumber)) {
      return 'El DNI debe contener exactamente 8 dígitos numéricos.';
    }
  } else if (tipo === 'RUC') {
    if (!/^\d{11}$/.test(cleanNumber)) {
      return 'El RUC debe contener exactamente 11 dígitos numéricos.';
    }
    if (!/^(10|15|17)\d{9}$/.test(cleanNumber)) {
      return 'El RUC de persona natural debe comenzar con 10, 15 o 17.';
    }
  } else if (cleanNumber.length < 3) {
    return 'El documento debe contener al menos 3 caracteres.';
  }

  return null;
}

/**
 * Valida un correo electrónico opcional
 */
export function validateEmail(email?: string | null): string | null {
  if (!email || email.trim() === '') return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return 'El formato de correo electrónico no es válido.';
  }
  return null;
}

/**
 * Valida un teléfono opcional
 */
export function validatePhone(phone?: string | null): string | null {
  if (!phone || phone.trim() === '') return null;
  const clean = phone.trim();
  if (!/^[0-9+() -]{6,20}$/.test(clean)) {
    return 'El formato de teléfono no es válido (solo números, +, -, espacios).';
  }
  return null;
}

/**
 * Valida formulario completo para crear usuario
 */
export function validateCreateUserInput(input: CreateUserInput): ValidationResult {
  const errors: Record<string, string> = {};

  // Username
  const username = input.username?.trim();
  if (!username) {
    errors.username = 'El nombre de usuario es obligatorio.';
  } else if (username.length < 3) {
    errors.username = 'El nombre de usuario debe tener al menos 3 caracteres.';
  } else if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    errors.username = 'El usuario solo puede contener letras, números y los caracteres _ . -';
  }

  // Password
  if (!input.password) {
    errors.password = 'La contraseña temporal es obligatoria.';
  } else if (input.password.length < 6) {
    errors.password = 'La contraseña debe tener al menos 6 caracteres.';
  }

  // Si no está vinculado a una persona preexistente por ID, validar datos personales
  if (!input.persona_id) {
    // Tipo Documento
    if (!input.tipo_documento) {
      errors.tipo_documento = 'Selecciona el tipo de documento.';
    }

    // Número Documento
    const docError = validateDocumentNumber(input.tipo_documento || '', input.numero_documento || '');
    if (docError) {
      errors.numero_documento = docError;
    }

    // Nombres
    const nombres = input.nombres?.trim();
    if (!nombres) {
      errors.nombres = 'El nombre es obligatorio.';
    } else if (nombres.length < 2) {
      errors.nombres = 'El nombre debe tener al menos 2 caracteres.';
    }

    // Apellidos: estrictamente obligatorio en personas naturales (Slice 1 y 2)
    const apellidos = input.apellidos?.trim();
    if (!apellidos) {
      errors.apellidos = 'Los apellidos son obligatorios.';
    } else if (apellidos.length < 2) {
      errors.apellidos = 'Los apellidos deben tener al menos 2 caracteres.';
    }

    // Email
    const emailError = validateEmail(input.email);
    if (emailError) {
      errors.email = emailError;
    }

    // Telefono
    const phoneError = validatePhone(input.telefono);
    if (phoneError) {
      errors.telefono = phoneError;
    }
  }

  // Rol
  if (!input.rol || !VALID_ROLES.includes(input.rol)) {
    errors.rol = 'Selecciona un rol válido (ADMINISTRADOR o RECEPCIONISTA).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Convierte un archivo de imagen seleccionado por el usuario a un Data URL (base64)
 * optimizado y comprimido mediante canvas para no sobrecargar el almacenamiento.
 */
export async function fileToDataUrl(
  file: File,
  maxDimension = 256,
  quality = 0.85
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen válida.');
  }

  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('La imagen no debe superar los 5 MB de tamaño.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo de imagen.'));
    };

    reader.onload = () => {
      const result = reader.result as string;

      // Si no estamos en un entorno con DOM/Canvas completo, retornamos el data URL directo
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        resolve(result);
        return;
      }

      const img = new Image();
      img.onerror = () => {
        resolve(result); // Fallback a imagen sin redimensionar
      };

      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(result);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        } catch {
          resolve(result);
        }
      };

      img.src = result;
    };

    reader.readAsDataURL(file);
  });
}
