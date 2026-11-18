// ============================================================================
// DOMINIO DE ENTIDADES - REGLAS DE NEGOCIO Y VALIDACIONES PURAS (SLICE 2)
// Personas Naturales, Clientes con Historial de Peso, Empresas RUC 20 y Proveedores
// Ubicación: src/domain/entity.ts
// ============================================================================

import {
  CreateClientInput,
  CreateCompanyInput,
  CreatePersonInput,
  CreateSupplierInput,
  PersonDocumentType,
  RecordClientWeightInput,
  UpdateClientInput,
  UpdateCompanyInput,
  UpdatePersonInput,
  UpdateSupplierInput,
} from '../types/entity';
import { UserRole } from '../types/auth';

export interface EntityValidationResult<T = unknown> {
  isValid: boolean;
  errors: Record<string, string>;
  sanitizedInput?: T;
}

export const PERSON_DOCUMENT_TYPES: PersonDocumentType[] = [
  'DNI',
  'RUC',
  'CE',
  'PASAPORTE',
  'OTRO',
];

/**
 * Determina si un operador puede modificar los datos personales vinculados a una persona,
 * respetando la jerarquía RBAC y la regla "Caso Juan Pérez".
 */
export function canModifyLinkedPersonData(
  operatorRole?: UserRole | null,
  targetPersonUserRole?: UserRole | null
): boolean {
  if (!operatorRole) return false;
  if (operatorRole === 'ADMINISTRADOR') return true;
  if (operatorRole === 'SUPERVISOR') {
    return targetPersonUserRole !== 'ADMINISTRADOR' && targetPersonUserRole !== 'SUPERVISOR';
  }
  if (operatorRole === 'RECEPCIONISTA') {
    return !targetPersonUserRole;
  }
  return false;
}

/**
 * Valida un número de documento para Persona Natural
 */
export function validatePersonDocument(tipo: PersonDocumentType, numero: string): string | null {
  const cleanDoc = numero?.trim() ?? '';
  if (!cleanDoc) return 'El número de documento es obligatorio.';

  if (tipo === 'DNI') {
    if (!/^\d{8}$/.test(cleanDoc)) {
      return 'El DNI debe tener exactamente 8 dígitos numéricos.';
    }
  } else if (tipo === 'RUC') {
    if (!/^\d{11}$/.test(cleanDoc)) {
      return 'El RUC debe tener exactamente 11 dígitos numéricos.';
    }
    if (!/^(10|15|17)\d{9}$/.test(cleanDoc)) {
      return 'El RUC de persona natural debe comenzar con 10, 15 o 17.';
    }
  } else if (tipo === 'CE') {
    if (!/^[a-zA-Z0-9]{9,12}$/.test(cleanDoc)) {
      return 'El Carné de Extranjería debe tener de 9 a 12 caracteres alfanuméricos.';
    }
  } else if (tipo === 'PASAPORTE') {
    if (!/^[a-zA-Z0-9]{6,12}$/.test(cleanDoc)) {
      return 'El pasaporte debe tener de 6 a 12 caracteres alfanuméricos.';
    }
  } else if (tipo === 'OTRO') {
    if (cleanDoc.length < 1 || cleanDoc.length > 20) {
      return 'El documento debe tener entre 1 y 20 caracteres.';
    }
  }

  return null;
}

/**
 * Valida un correo electrónico opcional
 */
export function validateEntityEmail(email?: string | null): string | null {
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
export function validateEntityPhone(phone?: string | null): string | null {
  if (!phone || phone.trim() === '') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return 'El teléfono debe contener entre 7 y 15 dígitos numéricos.';
  }
  return null;
}

/**
 * Valida la fecha de nacimiento para personas naturales
 */
export function validateBirthDate(fecha?: string | null): string | null {
  if (!fecha || fecha.trim() === '') return null;
  const birthDate = new Date(fecha);
  if (isNaN(birthDate.getTime())) {
    return 'La fecha de nacimiento no es válida (use YYYY-MM-DD).';
  }

  const today = new Date();
  if (birthDate > today) {
    return 'La fecha de nacimiento no puede ser una fecha futura.';
  }

  const age = today.getFullYear() - birthDate.getFullYear();
  if (age > 120) {
    return 'La edad no puede ser mayor a 120 años.';
  }

  return null;
}

/**
 * Valida formulario de Persona Natural (Crear o Actualizar)
 */
export function validatePersonForm(
  input: CreatePersonInput | UpdatePersonInput
): EntityValidationResult<CreatePersonInput> {
  const errors: Record<string, string> = {};

  const docError = validatePersonDocument(input.tipo_documento, input.numero_documento);
  if (docError) errors.numero_documento = docError;

  const nombres = input.nombres?.trim() ?? '';
  if (!nombres) {
    errors.nombres = 'Los nombres son obligatorios.';
  } else if (nombres.length < 2) {
    errors.nombres = 'Los nombres deben tener al menos 2 caracteres.';
  }

  const apellidos = input.apellidos?.trim() ?? '';
  if (!apellidos) {
    errors.apellidos = 'Los apellidos son obligatorios para personas naturales.';
  } else if (apellidos.length < 2) {
    errors.apellidos = 'Los apellidos deben tener al menos 2 caracteres.';
  }

  const birthError = validateBirthDate(input.fecha_nacimiento);
  if (birthError) errors.fecha_nacimiento = birthError;

  const emailError = validateEntityEmail(input.email);
  if (emailError) errors.email = emailError;

  const phoneError = validateEntityPhone(input.telefono);
  if (phoneError) errors.telefono = phoneError;

  const sanitizedInput: CreatePersonInput = {
    tipo_documento: input.tipo_documento,
    numero_documento: input.numero_documento?.trim() ?? '',
    nombres,
    apellidos,
    fecha_nacimiento: input.fecha_nacimiento?.trim() || null,
    telefono: input.telefono?.trim() || null,
    email: input.email?.trim() || null,
    direccion: input.direccion?.trim() || null,
  };

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedInput,
  };
}

/**
 * Valida formulario de Cliente (con datos personales + salud + peso inicial)
 */
export function validateClientForm(
  input: CreateClientInput | UpdateClientInput
): EntityValidationResult<CreateClientInput> {
  const errors: Record<string, string> = {};

  const createInput = input as CreateClientInput;
  const updateInput = input as UpdateClientInput;

  // Si no está vinculado a una persona preexistente por ID y no está explícitamente apagada la edición personal
  const shouldValidatePersonData =
    !createInput.persona_id && updateInput.modificar_datos_personales !== false;

  if (shouldValidatePersonData) {
    if (!createInput.tipo_documento || !createInput.numero_documento) {
      errors.numero_documento = 'El tipo y número de documento son obligatorios.';
    } else {
      const docErr = validatePersonDocument(
        createInput.tipo_documento,
        createInput.numero_documento
      );
      if (docErr) errors.numero_documento = docErr;
    }

    const nombres = createInput.nombres?.trim() ?? '';
    if (!nombres) {
      errors.nombres = 'Los nombres son obligatorios.';
    } else if (nombres.length < 2) {
      errors.nombres = 'Los nombres deben tener al menos 2 caracteres.';
    }

    const apellidos = createInput.apellidos?.trim() ?? '';
    if (!apellidos) {
      errors.apellidos = 'Los apellidos son obligatorios para el cliente.';
    } else if (apellidos.length < 2) {
      errors.apellidos = 'Los apellidos deben tener al menos 2 caracteres.';
    }

    const birthErr = validateBirthDate(createInput.fecha_nacimiento);
    if (birthErr) errors.fecha_nacimiento = birthErr;

    const emailErr = validateEntityEmail(createInput.email);
    if (emailErr) errors.email = emailErr;

    const phoneErr = validateEntityPhone(createInput.telefono);
    if (phoneErr) errors.telefono = phoneErr;
  }

  // Teléfono de contacto de emergencia si se especifica
  if (createInput.numero_contacto_emergencia) {
    const emPhoneErr = validateEntityPhone(createInput.numero_contacto_emergencia);
    if (emPhoneErr) {
      errors.numero_contacto_emergencia = `Contacto de emergencia: ${emPhoneErr}`;
    }
  }

  // Peso inicial opcional
  if (createInput.peso_inicial_kg !== undefined && createInput.peso_inicial_kg !== null && String(createInput.peso_inicial_kg).trim() !== '') {
    const pesoNum = Number(createInput.peso_inicial_kg);
    if (isNaN(pesoNum) || pesoNum <= 0 || pesoNum > 400) {
      errors.peso_inicial_kg = 'El peso inicial debe ser un número válido entre 1 y 400 kg.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedInput: createInput,
  };
}

/**
 * Valida un registro de peso de cliente
 */
export function validateRecordWeightInput(
  input: RecordClientWeightInput
): EntityValidationResult<RecordClientWeightInput> {
  const errors: Record<string, string> = {};

  if (!input.cliente_id || input.cliente_id <= 0) {
    errors.cliente_id = 'Debe indicar el cliente.';
  }

  const pesoNum = Number(input.peso_kg);
  if (isNaN(pesoNum) || pesoNum <= 0 || pesoNum > 400) {
    errors.peso_kg = 'El peso debe ser un número válido entre 1 y 400 kg.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedInput: {
      ...input,
      peso_kg: isNaN(pesoNum) ? input.peso_kg : pesoNum.toFixed(2),
      nota: input.nota?.trim() || null,
    },
  };
}

/**
 * Valida formulario de Empresa Jurídica RUC 20
 */
export function validateCompanyForm(
  input: CreateCompanyInput | UpdateCompanyInput
): EntityValidationResult<CreateCompanyInput> {
  const errors: Record<string, string> = {};
  const createInput = input as CreateCompanyInput;

  // Validación de RUC 20 (estricto 11 dígitos iniciando en 20)
  if ('ruc' in createInput) {
    const ruc = createInput.ruc?.trim() ?? '';
    if (!ruc) {
      errors.ruc = 'El RUC es obligatorio.';
    } else if (!/^20\d{9}$/.test(ruc)) {
      errors.ruc = 'El RUC de empresa debe constar de 11 dígitos y comenzar con 20.';
    }
  }

  // Razón Social
  const razonSocial = input.razon_social?.trim() ?? '';
  if (!razonSocial) {
    errors.razon_social = 'La Razón Social es obligatoria.';
  } else if (razonSocial.length < 2) {
    errors.razon_social = 'La Razón Social debe tener al menos 2 caracteres.';
  }

  const emailError = validateEntityEmail(input.email);
  if (emailError) errors.email = emailError;

  const phoneError = validateEntityPhone(input.telefono);
  if (phoneError) errors.telefono = phoneError;

  const sanitizedInput: CreateCompanyInput = {
    ruc: 'ruc' in createInput ? createInput.ruc.trim() : '',
    razon_social: razonSocial,
    nombre_comercial: input.nombre_comercial?.trim() || null,
    telefono: input.telefono?.trim() || null,
    email: input.email?.trim() || null,
    direccion: input.direccion?.trim() || null,
  };

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedInput,
  };
}

/**
 * Valida formulario de Proveedor Polimórfico (Persona Natural o Empresa)
 */
export function validateSupplierForm(
  input: CreateSupplierInput | UpdateSupplierInput
): EntityValidationResult<CreateSupplierInput> {
  const errors: Record<string, string> = {};
  const createInput = input as CreateSupplierInput;

  if ('tipo_proveedor' in createInput) {
    const tipo = createInput.tipo_proveedor;
    if (tipo !== 'PERSONA_NATURAL' && tipo !== 'EMPRESA') {
      errors.tipo_proveedor = 'Selecciona si el proveedor es Persona Natural o Empresa.';
    }

    if (tipo === 'PERSONA_NATURAL') {
      if (!createInput.persona_id && !createInput.persona_data) {
        errors.persona_id = 'Debes vincular una persona natural o ingresar sus datos.';
      }
    } else if (tipo === 'EMPRESA') {
      if (!createInput.empresa_id && !createInput.empresa_data) {
        errors.empresa_id = 'Debes vincular una empresa jurídica RUC 20 o ingresar sus datos.';
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedInput: createInput,
  };
}

/**
 * Formatea un valor numérico o string de kg con 2 decimales
 */
export function formatKg(peso: string | number | null | undefined): string {
  if (peso === null || peso === undefined || peso === '') return '-- kg';
  const num = typeof peso === 'number' ? peso : parseFloat(peso);
  if (isNaN(num)) return '-- kg';
  return `${num.toFixed(2)} kg`;
}

/**
 * Formatea la variación de peso con badge descriptivo (+0.50 kg / -1.20 kg / 0.00 kg)
 */
export function formatWeightVariation(
  variation: string | number | null | undefined
): { text: string; variant: 'success' | 'warning' | 'default' } {
  if (variation === null || variation === undefined || variation === '') {
    return { text: '0.00 kg', variant: 'default' };
  }
  const num = typeof variation === 'number' ? variation : parseFloat(variation);
  if (isNaN(num) || Math.abs(num) < 0.001) {
    return { text: '0.00 kg (Inicial)', variant: 'default' };
  }
  if (num > 0) {
    return { text: `+${num.toFixed(2)} kg`, variant: 'warning' };
  }
  return { text: `${num.toFixed(2)} kg`, variant: 'success' };
}

/**
 * Genera el enlace de WhatsApp Web wa.me con mensaje de bienvenida y código QR
 */
export function buildWhatsAppWelcomeLink(
  telefono: string | null | undefined,
  nombreCompleto: string,
  codigoQrToken: string
): string | null {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, '');
  if (digits.length < 9) return null;

  // Si tiene exactamente 9 dígitos (formato estándar de celular en Perú), anteponer prefijo 51
  const phoneFormatted = digits.length === 9 ? `51${digits}` : digits;

  const message = encodeURIComponent(
    `¡Hola, ${nombreCompleto}! 👋 Te damos la bienvenida a ZaramaGYM.\n\n` +
      `Tu credencial digital de socio es: *${codigoQrToken}*\n\n` +
      `Preséntala en recepción desde tu celular o indícala para ingresar al gimnasio. ¡Nos vemos en el entrenamiento! 🏋️‍♂️`
  );

  return `https://wa.me/${phoneFormatted}?text=${message}`;
}
