// ============================================================================
// UTILIDADES DE SEGURIDAD Y ERGONOMÍA EN FORMULARIOS
// 1. Prevenir guardado/envío accidental al presionar Enter dentro de inputs
// 2. Sanitización fluida de montos decimales y enteros sin saltos de cursor
//    ni interferencia de rueda del ratón (reemplazo seguro de type="number")
// 3. Redondeo monetario determinista sin deriva de punto flotante
// Ubicación: src/utils/formSafety.ts
// ============================================================================

import type React from 'react';

/**
 * Redondea un valor monetario a 2 decimales evitando errores de punto flotante
 * (ej. 299.99999999999994 -> 300, 1.005 -> 1.01).
 */
export function roundMonetary(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Math.sign(amount) * 1e-9) * 100) / 100;
}

/**
 * Evita que presionar Enter dentro de campos de entrada (<input>, <select>)
 * envíe el formulario accidentalmente antes de completar todos los campos.
 * Permite Enter dentro de <textarea> (salto de línea) y sobre <button type="submit">.
 */
export function preventEnterKeySubmit(e: React.KeyboardEvent<HTMLFormElement>): void {
  if (e.key !== 'Enter') return;
  if (e.nativeEvent?.isComposing) return;

  const target = e.target as HTMLElement | null;
  if (!target) return;

  const tag = target.tagName.toLowerCase();
  if (tag === 'textarea') return;
  if (tag === 'button') return;
  if (tag === 'input') {
    const inputType = (target as HTMLInputElement).type;
    if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') {
      return;
    }
  }

  e.preventDefault();
}

/**
 * Sanitiza un input decimal durante la escritura:
 * - Convierte coma ',' a punto '.'
 * - Conserva cadena vacía '' para permitir borrar con Backspace sin rebotes
 * - Conserva punto final ('12.') y ceros iniciales ('0.5') mientras el usuario digita
 */
export function sanitizeDecimalInput(raw: string): string {
  const normalized = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const firstDot = normalized.indexOf('.');
  if (firstDot === -1) return normalized;
  const intPart = normalized.slice(0, firstDot);
  const decPart = normalized.slice(firstDot + 1).replace(/\./g, '');
  return `${intPart}.${decPart}`;
}

/**
 * Formatea un valor decimal al perder foco (onBlur), aplicando límites opcionales.
 */
export function formatDecimalOnBlur(
  raw: string,
  options?: { min?: number; max?: number; fallback?: string }
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return options?.fallback ?? '';
  }

  const parsed = parseFloat(trimmed.replace(/,/g, '.'));
  if (isNaN(parsed)) {
    return options?.fallback ?? '';
  }

  let value = roundMonetary(parsed);
  if (options?.min !== undefined && value < options.min) {
    value = options.min;
  }
  if (options?.max !== undefined && value > options.max) {
    value = options.max;
  }

  return roundMonetary(value).toFixed(2);
}

/**
 * Sanitiza un input entero positivo durante la escritura conservando '' al borrar.
 */
export function sanitizeIntegerInput(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Al enfocar un campo con valor por defecto en cero ('0', '0.00'), lo selecciona
 * para que el usuario pueda sobrescribirlo directamente sin usar mouse ni flechas.
 */
export function selectIfZeroDefault(e: React.FocusEvent<HTMLInputElement>): void {
  if (e.target.value === '0.00' || e.target.value === '0') {
    e.target.select();
  }
}
