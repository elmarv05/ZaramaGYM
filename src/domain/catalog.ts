// ============================================================================
// DOMINIO DE CATÁLOGO: ALGORITMO DAY OVERFLOW, VALIDACIONES Y FORMATOS
// Ubicación: src/domain/catalog.ts
// ============================================================================

import {
  InventoryMovementType,
  PlanExpirationPreviewDto,
  ProductCategory,
  TipoPlan,
} from '../types/catalog';

// ============================================================================
// 1. ALGORITMO CANÓNICO DAY OVERFLOW (ZARAMAGYM)
// ============================================================================

/**
 * Determina si un año calendario gregoriano es bisiesto
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Retorna los días máximos de un mes en un año específico
 */
export function getDaysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

function pad2(num: number): string {
  return num.toString().padStart(2, '0');
}

function pad4(num: number): string {
  return num.toString().padStart(4, '0');
}

/**
 * Calcula con precisión determinista la fecha y hora de vencimiento de un plan
 * aplicando la regla canónica de Day Overflow para membresías mensuales y pases diarios.
 */
export function calculateDayOverflowPreview(
  fechaInicioStr: string,
  tipoPlan: TipoPlan,
  duracionMeses: number | null
): PlanExpirationPreviewDto {
  if (!fechaInicioStr || !/^\d{4}-\d{2}-\d{2}$/.test(fechaInicioStr)) {
    throw new Error('Fecha de inicio inválida. Se requiere formato YYYY-MM-DD.');
  }

  const [yStr, mStr, dStr] = fechaInicioStr.split('-');
  const y0 = parseInt(yStr, 10);
  const m0 = parseInt(mStr, 10);
  const d0 = parseInt(dStr, 10);

  // Validación de día dentro del mes de inicio
  const maxDiasMesInicio = getDaysInMonth(y0, m0);
  if (d0 < 1 || d0 > maxDiasMesInicio) {
    throw new Error(`Día ${d0} no es válido para el mes ${m0}/${y0}.`);
  }

  // CASO A: Pase Diario (duración 0 meses o tipo PASE_DIARIO)
  if (tipoPlan === 'PASE_DIARIO' || duracionMeses === 0 || duracionMeses === null) {
    return {
      fecha_inicio: fechaInicioStr,
      fecha_inicio_evaluada: fechaInicioStr,
      fecha_vencimiento_date: fechaInicioStr,
      fecha_vencimiento_timestamp: `${fechaInicioStr} 23:59:59`,
      fecha_vencimiento: `${fechaInicioStr} 23:59:59`,
      dias_totales: 1,
      hubo_desbordamiento: false,
      dias_desbordamiento: 0,
      dias_overflow_aplicados: 0,
      explicacion: 'Pase diario con vigencia exclusiva hasta las 23:59:59 del día de emisión.',
      nota_explicativa: 'Pase diario con vigencia exclusiva hasta las 23:59:59 del día de emisión.',
    };
  }

  // CASO B: Membresía Mensual (duracionMeses >= 1)
  const M = duracionMeses;
  const idxMes = m0 - 1 + M;
  const yTarget = y0 + Math.floor(idxMes / 12);
  const mTarget = (idxMes % 12) + 1;
  const dMax = getDaysInMonth(yTarget, mTarget);

  let finYear: number;
  let finMonth: number;
  let finDay: number;
  let huboDesbordamiento = false;
  let diasDesbordamiento = 0;
  let explicacion = '';

  if (d0 <= dMax) {
    // Subcaso B.1: Sin desbordamiento
    finYear = yTarget;
    finMonth = mTarget;
    finDay = d0;
    huboDesbordamiento = false;
    diasDesbordamiento = 0;
    explicacion = `Membresía regular de ${M} mes(es) sin desbordamiento. Vence el día ${d0} del mes ${pad2(
      mTarget
    )}/${pad4(yTarget)} a las 23:59:59.`;
  } else {
    // Subcaso B.2: Day Overflow (Compensación de días)
    huboDesbordamiento = true;
    diasDesbordamiento = d0 - dMax;

    // Sumar días de desbordamiento a partir del último día del mes destino
    const baseDate = new Date(Date.UTC(yTarget, mTarget - 1, dMax));
    baseDate.setUTCDate(baseDate.getUTCDate() + diasDesbordamiento);

    finYear = baseDate.getUTCFullYear();
    finMonth = baseDate.getUTCMonth() + 1;
    finDay = baseDate.getUTCDate();

    const finDateStr = `${pad4(finYear)}-${pad2(finMonth)}-${pad2(finDay)}`;
    explicacion = `El mes destino ${pad2(mTarget)}/${pad4(
      yTarget
    )} tiene ${dMax} días. Se compensaron ${diasDesbordamiento} día(s) desbordando al ${finDateStr} a las 23:59:59.`;
  }

  const finDateFormatted = `${pad4(finYear)}-${pad2(finMonth)}-${pad2(finDay)}`;
  const timestampFin = `${finDateFormatted} 23:59:59`;

  // Conteo de días inclusivos en UTC (sin alteraciones por horario de verano)
  const utcStart = Date.UTC(y0, m0 - 1, d0);
  const utcEnd = Date.UTC(finYear, finMonth - 1, finDay);
  const diffMs = utcEnd - utcStart;
  const diasTotales = Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1;

  return {
    fecha_inicio: fechaInicioStr,
    fecha_inicio_evaluada: fechaInicioStr,
    fecha_vencimiento_date: finDateFormatted,
    fecha_vencimiento_timestamp: timestampFin,
    fecha_vencimiento: timestampFin,
    dias_totales: diasTotales,
    hubo_desbordamiento: huboDesbordamiento,
    dias_desbordamiento: diasDesbordamiento,
    dias_overflow_aplicados: diasDesbordamiento,
    es_bisiesto_destino: isLeapYear(finYear),
    explicacion,
    nota_explicativa: explicacion,
  };
}

// ============================================================================
// 2. VALIDACIONES DE FORMULARIO DE DOMINIO
// ============================================================================

export interface PlanFormValues {
  codigo?: string;
  nombre: string;
  descripcion?: string | null;
  tipo_plan: TipoPlan;
  duracion_meses: number;
  precio_base: string | number;
  permite_recuperacion_dias: boolean;
}

export function validatePlanForm(
  values: PlanFormValues,
  isEditing = false
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!isEditing) {
    if (!values.codigo || values.codigo.trim().length < 2) {
      errors.codigo = 'El código del plan es obligatorio (mínimo 2 caracteres).';
    } else if (!/^[A-Z0-9_-]+$/i.test(values.codigo.trim())) {
      errors.codigo = 'El código solo puede contener letras, números, guiones y guiones bajos.';
    }
  }

  if (!values.nombre || values.nombre.trim().length < 3) {
    errors.nombre = 'El nombre del plan debe tener al menos 3 caracteres.';
  }

  if (values.tipo_plan === 'PASE_DIARIO') {
    if (values.duracion_meses !== 0) {
      errors.duracion_meses = 'El pase diario debe tener una duración de 0 meses.';
    }
  } else if (values.tipo_plan === 'MENSUALIDAD') {
    if (values.duracion_meses < 1 || !Number.isInteger(Number(values.duracion_meses))) {
      errors.duracion_meses = 'La membresía debe tener al menos 1 mes de duración.';
    }
  } else {
    errors.tipo_plan = 'Tipo de plan inválido.';
  }

  const precioNum = Number(values.precio_base);
  if (isNaN(precioNum) || precioNum < 0) {
    errors.precio_base = 'El precio base debe ser un monto numérico mayor o igual a 0.';
  }

  return errors;
}

export interface ProductFormValues {
  codigo_sku?: string;
  nombre: string;
  categoria: ProductCategory;
  unidad_medida?: string;
  precio_compra_referencial: string | number;
  precio_venta: string | number;
  stock_inicial?: number;
  stock_minimo: number;
  proveedor_preferido_id?: number | null;
}

export function validateProductForm(
  values: ProductFormValues,
  isEditing = false
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!isEditing) {
    if (!values.codigo_sku || values.codigo_sku.trim().length < 2) {
      errors.codigo_sku = 'El código SKU es obligatorio (mínimo 2 caracteres).';
    } else if (!/^[A-Z0-9_-]+$/i.test(values.codigo_sku.trim())) {
      errors.codigo_sku = 'El SKU solo puede contener caracteres alfanuméricos, guiones y guiones bajos.';
    }
  }

  if (!values.nombre || values.nombre.trim().length < 3) {
    errors.nombre = 'El nombre del producto debe tener al menos 3 caracteres.';
  }

  const validCategories: ProductCategory[] = [
    'BEBIDAS',
    'SUPLEMENTOS',
    'ACCESORIOS',
    'SNACKS',
    'OTROS',
  ];
  if (!validCategories.includes(values.categoria)) {
    errors.categoria = 'Selecciona una categoría válida.';
  }

  const precioVentaNum = Number(values.precio_venta);
  if (isNaN(precioVentaNum) || precioVentaNum < 0) {
    errors.precio_venta = 'El precio de venta debe ser mayor o igual a 0.';
  }

  const precioCompraNum = Number(values.precio_compra_referencial ?? 0);
  if (isNaN(precioCompraNum) || precioCompraNum < 0) {
    errors.precio_compra_referencial = 'El precio de compra referencial no puede ser negativo.';
  }

  const stockMinimoNum = Number(values.stock_minimo);
  if (isNaN(stockMinimoNum) || stockMinimoNum < 0 || !Number.isInteger(stockMinimoNum)) {
    errors.stock_minimo = 'El stock mínimo debe ser un número entero mayor o igual a 0.';
  }

  if (!isEditing && values.stock_inicial !== undefined) {
    const stockInicialNum = Number(values.stock_inicial);
    if (isNaN(stockInicialNum) || stockInicialNum < 0 || !Number.isInteger(stockInicialNum)) {
      errors.stock_inicial = 'El stock inicial debe ser un número entero mayor o igual a 0.';
    }
  }

  return errors;
}

export interface MovementFormValues {
  producto_id: number;
  tipo_movimiento: 'ENTRADA_AJUSTE' | 'MERMA_DANIO' | 'MERMA_VENCIMIENTO' | 'CONSUMO_PROPIO';
  cantidad: number;
  costo_unitario_momento?: string;
  motivo_justificacion: string;
}

export function validateInventoryMovementForm(
  values: MovementFormValues,
  stockActual: number
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.producto_id || values.producto_id <= 0) {
    errors.producto_id = 'Debes seleccionar un producto válido.';
  }

  const cantidadNum = Number(values.cantidad);
  if (isNaN(cantidadNum) || cantidadNum <= 0 || !Number.isInteger(cantidadNum)) {
    errors.cantidad = 'La cantidad debe ser un entero positivo mayor a 0.';
  }

  if (!values.motivo_justificacion || values.motivo_justificacion.trim().length < 5) {
    errors.motivo_justificacion =
      'La justificación es obligatoria y debe tener al menos 5 caracteres.';
  }

  // Prevención de stock negativo en salidas / mermas / consumo propio
  const isSalida = ['MERMA_DANIO', 'MERMA_VENCIMIENTO', 'CONSUMO_PROPIO'].includes(
    values.tipo_movimiento
  );
  if (isSalida && cantidadNum > 0) {
    if (stockActual < cantidadNum) {
      errors.cantidad = `Stock insuficiente para aplicar salida. Stock actual: ${stockActual}, solicitado: ${cantidadNum}`;
    }
  }

  return errors;
}

// ============================================================================
// 3. CONTROL DE ACCESO RBAC & PERMISOS DE CATÁLOGO
// ============================================================================

/**
 * Solo ADMINISTRADOR puede crear, editar o desactivar planes de membresía.
 */
/**
 * ADMINISTRADOR y RECEPCIONISTA pueden crear nuevos planes o tarifas de membresía.
 */
export function canCreatePlans(role?: string | null): boolean {
  return role === 'ADMINISTRADOR' || role === 'RECEPCIONISTA';
}

/**
 * Solo ADMINISTRADOR puede editar o desactivar/activar planes existentes.
 */
export function canEditOrDeactivatePlans(role?: string | null): boolean {
  return role === 'ADMINISTRADOR';
}

/**
 * Compatibilidad: alias de canEditOrDeactivatePlans (solo ADMINISTRADOR).
 */
export function canMutatePlans(role?: string | null): boolean {
  return canEditOrDeactivatePlans(role);
}

/**
 * ADMINISTRADOR y RECEPCIONISTA pueden registrar productos nuevos y modificar productos.
 */
export function canCreateOrEditProducts(role?: string | null): boolean {
  return role === 'ADMINISTRADOR' || role === 'RECEPCIONISTA';
}

/**
 * Solo ADMINISTRADOR puede desactivar o reactivar productos del inventario.
 */
export function canDeactivateProducts(role?: string | null): boolean {
  return role === 'ADMINISTRADOR';
}

/**
 * Solo ADMINISTRADOR puede registrar mermas o ajustes manuales en el Kardex.
 */
export function canRecordInventoryMovement(role?: string | null): boolean {
  return role === 'ADMINISTRADOR';
}

/**
 * Compatibilidad: solo ADMINISTRADOR posee mutación total del catálogo (planes, bajas y Kardex).
 */
export function canMutateCatalog(rol?: string | null): boolean {
  return rol === 'ADMINISTRADOR';
}

// ============================================================================
// 4. FORMATO VISUAL Y HELPERS DE PRESENTACIÓN
// ============================================================================

export function formatPEN(amount: string | number): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'S/ 0.00';
  return `S/ ${num.toFixed(2)}`;
}

export function formatProductCategory(categoria: ProductCategory): string {
  switch (categoria) {
    case 'BEBIDAS':
      return 'Bebidas';
    case 'SUPLEMENTOS':
      return 'Suplementos';
    case 'ACCESORIOS':
      return 'Accesorios';
    case 'SNACKS':
      return 'Snacks';
    case 'OTROS':
      return 'Otros';
    default:
      return categoria;
  }
}

export interface MovementBadgeInfo {
  label: string;
  variant: 'default' | 'success' | 'warning' | 'danger' | 'info';
  sign: '+' | '-';
}

export function getMovementTypeBadge(tipo: InventoryMovementType): MovementBadgeInfo {
  switch (tipo) {
    case 'STOCK_INICIAL':
      return { label: 'Stock Inicial', variant: 'info', sign: '+' };
    case 'ENTRADA_AJUSTE':
      return { label: 'Ajuste (+)', variant: 'success', sign: '+' };
    case 'ENTRADA_COMPRA':
      return { label: 'Compra (+)', variant: 'success', sign: '+' };
    case 'SALIDA_VENTA':
      return { label: 'Venta POS (-)', variant: 'default', sign: '-' };
    case 'MERMA_DANIO':
      return { label: 'Merma por Daño (-)', variant: 'danger', sign: '-' };
    case 'MERMA_VENCIMIENTO':
      return { label: 'Merma por Vencimiento (-)', variant: 'danger', sign: '-' };
    case 'CONSUMO_PROPIO':
      return { label: 'Consumo Interno (-)', variant: 'warning', sign: '-' };
    case 'REVERSION_TACHADO':
      return { label: 'Reversión (+)', variant: 'info', sign: '+' };
    default:
      return { label: tipo, variant: 'default', sign: '+' };
  }
}
