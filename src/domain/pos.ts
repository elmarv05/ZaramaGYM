// ============================================================================
// DOMINIO Y REGLAS DE NEGOCIO: PUNTO DE VENTA (POS), CAJA Y CRÉDITOS (SLICE 4)
// Funciones puras, matemáticas deterministas y validaciones de invariantes
// Ubicación: src/domain/pos.ts
// ============================================================================

import { UserRole } from '../types/auth';
import {
  CreditOrigin,
  CreatePosSaleInput,
  PosPaymentInput,
  PosSaleItemInput,
  SaleState,
  CashShiftState,
} from '../types/pos';

/**
 * Redondea un número a 2 decimales con precisión monetaria
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Convierte un número o string a string con formato "0.00"
 */
export function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) || 0 : amount;
  return roundMoney(num).toFixed(2);
}

export interface CartTotals {
  subtotal: number;
  descuento: number;
  totalVenta: number;
  subtotalStr: string;
  descuentoStr: string;
  totalVentaStr: string;
}

/**
 * Calcula los totales del carrito POS (subtotal, descuento, total)
 */
export function calculateCartTotals(
  items: PosSaleItemInput[],
  descuentoInput?: string | number | null
): CartTotals {
  const rawSubtotal = items.reduce((acc, item) => {
    const qty = item.cantidad || 0;
    const price = parseFloat(item.precio_unitario) || 0;
    return acc + qty * price;
  }, 0);

  const subtotal = roundMoney(rawSubtotal);
  const rawDiscount = typeof descuentoInput === 'string' ? parseFloat(descuentoInput) || 0 : (descuentoInput || 0);
  const descuento = roundMoney(Math.min(Math.max(0, rawDiscount), subtotal));
  const totalVenta = roundMoney(Math.max(0, subtotal - descuento));

  return {
    subtotal,
    descuento,
    totalVenta,
    subtotalStr: subtotal.toFixed(2),
    descuentoStr: descuento.toFixed(2),
    totalVentaStr: totalVenta.toFixed(2),
  };
}

export interface PaymentSplitResult {
  montoEfectivoEntregado: number;
  montoPagadoDigital: number;
  efectivoNetoRetenido: number;
  vueltoEfectivo: number;
  saldoCreditoGenerado: number;
  sumaPagosTotales: number;
  montoEfectivoEntregadoStr: string;
  montoPagadoDigitalStr: string;
  efectivoNetoRetenidoStr: string;
  vueltoEfectivoStr: string;
  saldoCreditoGeneradoStr: string;
  isOverpaidDigital: boolean;
  isCredito: boolean;
}

/**
 * Calcula en vivo el split de pagos (Efectivo y Digitales), vuelto en gaveta
 * y el saldo a crédito resultante según las reglas del Slice 4.
 */
export function calculatePaymentSplit(
  totalVenta: number,
  pagos: PosPaymentInput[]
): PaymentSplitResult {
  let efectivoEntregado = 0;
  let digital = 0;

  for (const pago of pagos) {
    const m = parseFloat(pago.monto) || 0;
    if (pago.metodo_pago === 'EFECTIVO') {
      efectivoEntregado += m;
    } else {
      digital += m;
    }
  }

  efectivoEntregado = roundMoney(efectivoEntregado);
  digital = roundMoney(digital);

  const isOverpaidDigital = digital > totalVenta;

  // Monto cubierto por medios digitales (máximo totalVenta)
  const restanteParaEfectivo = Math.max(0, roundMoney(totalVenta - digital));

  let efectivoRetenido = 0;
  let vuelto = 0;

  if (efectivoEntregado > restanteParaEfectivo) {
    vuelto = roundMoney(efectivoEntregado - restanteParaEfectivo);
    efectivoRetenido = restanteParaEfectivo;
  } else {
    vuelto = 0;
    efectivoRetenido = efectivoEntregado;
  }

  const sumaPagosAplicados = roundMoney(digital + efectivoRetenido);
  const saldoCredito = roundMoney(Math.max(0, totalVenta - sumaPagosAplicados));

  return {
    montoEfectivoEntregado: efectivoEntregado,
    montoPagadoDigital: digital,
    efectivoNetoRetenido: efectivoRetenido,
    vueltoEfectivo: vuelto,
    saldoCreditoGenerado: saldoCredito,
    sumaPagosTotales: roundMoney(efectivoEntregado + digital),
    montoEfectivoEntregadoStr: efectivoEntregado.toFixed(2),
    montoPagadoDigitalStr: digital.toFixed(2),
    efectivoNetoRetenidoStr: efectivoRetenido.toFixed(2),
    vueltoEfectivoStr: vuelto.toFixed(2),
    saldoCreditoGeneradoStr: saldoCredito.toFixed(2),
    isOverpaidDigital,
    isCredito: saldoCredito > 0,
  };
}

export type ArqueoEstado = 'CUADRE_EXACTO' | 'SOBRANTE' | 'FALTANTE';

export interface ArqueoResult {
  declarado: number;
  esperado: number;
  diferencia: number;
  diferenciaStr: string;
  estado: ArqueoEstado;
}

/**
 * Calcula la diferencia de arqueo físico al cierre:
 * diferencia = declarado - esperado
 */
export function calculateCashDifference(
  montoDeclarado: number | string,
  montoEsperado: number | string
): ArqueoResult {
  const dec = roundMoney(typeof montoDeclarado === 'string' ? parseFloat(montoDeclarado) || 0 : montoDeclarado);
  const esp = roundMoney(typeof montoEsperado === 'string' ? parseFloat(montoEsperado) || 0 : montoEsperado);
  const dif = roundMoney(dec - esp);

  let estado: ArqueoEstado = 'CUADRE_EXACTO';
  if (dif > 0) {
    estado = 'SOBRANTE';
  } else if (dif < 0) {
    estado = 'FALTANTE';
  }

  return {
    declarado: dec,
    esperado: esp,
    diferencia: dif,
    diferenciaStr: dif.toFixed(2),
    estado,
  };
}

/**
 * Determina el tipo de origen del crédito a generar en base al contenido del carrito
 */
export function resolveCreditOrigin(items: PosSaleItemInput[]): CreditOrigin {
  const hasPlan = items.some((item) => item.tipo_item === 'PLAN');
  if (hasPlan) {
    return 'MEMBRESIA_PAGO_PARCIAL';
  }
  return 'PRODUCTO_CREDITO';
}

export interface PosValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Valida de forma pura e integral los datos de una venta POS antes del envío
 */
export function validatePosSaleInput(input: CreatePosSaleInput): PosValidationResult {
  const errors: string[] = [];

  if (!input.items || input.items.length === 0) {
    errors.push('El carrito de compras no puede estar vacío');
    return { isValid: false, errors };
  }

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    if (!item.cantidad || item.cantidad <= 0) {
      errors.push(`Ítem #${i + 1}: la cantidad debe ser mayor a 0`);
    }
    const pu = parseFloat(item.precio_unitario);
    if (isNaN(pu) || pu < 0) {
      errors.push(`Ítem #${i + 1}: el precio unitario no puede ser negativo`);
    }

    if (item.tipo_item === 'PRODUCTO' && !item.producto_id) {
      errors.push(`Ítem #${i + 1}: se requiere asociar el ID del producto`);
    }
    if (item.tipo_item === 'PLAN' && !item.plan_id) {
      errors.push(`Ítem #${i + 1}: se requiere asociar el ID del plan`);
    }
    if (item.tipo_item === 'AMORTIZACION_CREDITO' && !item.credito_id) {
      errors.push(`Ítem #${i + 1}: se requiere asociar el ID del crédito a amortizar`);
    }
  }

  const { totalVenta } = calculateCartTotals(input.items, input.descuento);
  const split = calculatePaymentSplit(totalVenta, input.pagos || []);

  if (split.isOverpaidDigital) {
    errors.push('El monto pagado con medios digitales no puede superar el total de la venta');
  }

  const hasPlan = input.items.some((it) => it.tipo_item === 'PLAN');
  const hasAmortizacion = input.items.some((it) => it.tipo_item === 'AMORTIZACION_CREDITO');
  const isCreditoGenerado = split.saldoCreditoGenerado > 0;

  // Regla: Si hay PLAN, AMORTIZACION_CREDITO o saldoCreditoGenerado > 0, cliente_id es obligatorio
  if ((hasPlan || hasAmortizacion || isCreditoGenerado) && (!input.cliente_id || input.cliente_id <= 0)) {
    errors.push('Se requiere identificar un cliente para ventas de planes, amortizaciones de deuda o ventas a crédito');
  }

  // Regla estricta: No se admite diferir o generar un nuevo crédito a partir de una amortización
  if (hasAmortizacion && isCreditoGenerado) {
    errors.push('No es posible diferir a crédito una venta que amortiza deudas pendientes');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validación de Tachado Paso 1
 */
export function validateStrikeSaleInput(
  motivo: string,
  turnoEstado?: CashShiftState,
  ventaEstado?: SaleState
): { isValid: boolean; error?: string } {
  if (turnoEstado && turnoEstado !== 'ABIERTO') {
    return { isValid: false, error: 'No se puede tachar una venta de un turno de caja ya cerrado' };
  }
  if (ventaEstado && ventaEstado !== 'COMPLETADA') {
    return { isValid: false, error: 'Solo se pueden tachar ventas en estado COMPLETADA' };
  }
  if (!motivo || motivo.trim().length < 5) {
    return { isValid: false, error: 'El motivo del tachado debe tener al menos 5 caracteres' };
  }
  return { isValid: true };
}

/**
 * Control RBAC: Cualquier operador puede tachar en el turno abierto
 */
export function canStrikeSale(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return role === 'ADMINISTRADOR' || role === 'SUPERVISOR' || role === 'RECEPCIONISTA';
}

/**
 * Control RBAC: Solo el Administrador puede resolver tachados (Paso 2)
 */
export function canResolveStruckSale(role?: UserRole | string | null): boolean {
  return role === 'ADMINISTRADOR';
}
