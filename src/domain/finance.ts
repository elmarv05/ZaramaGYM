// ============================================================================
// FUNCIONES PURAS Y LÓGICA DE DOMINIO: FINANZAS, COMPRAS Y GASTOS (SLICE 7)
// Ubicación: src/domain/finance.ts
// ============================================================================

import { PaymentChannel, PaymentMethod } from '../types/pos';
import {
  CreateExpenseDto,
  CreateSupplierPurchaseDetailDto,
  CreateSupplierPurchaseDto,
  ExpenseCategory,
  PurchaseInvoiceType,
  UpdateExpenseDto,
} from '../types/finance';
import { roundMonetary } from '../utils/formSafety';

/**
 * Diccionario de categorías de gasto para presentación UI
 */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SERVICIOS_BASICOS: 'Servicios Básicos (Luz, Agua, Internet)',
  ALQUILER: 'Alquiler de Local',
  MANTENIMIENTO_EQUIPOS: 'Mantenimiento de Máquinas y Equipos',
  LIMPIEZA_INSUMOS: 'Limpieza e Insumos',
  PERSONAL_HONORARIOS: 'Personal y Honorarios',
  MARKETING: 'Marketing y Publicidad',
  IMPUESTOS_TASAS: 'Impuestos, Licencias y Tasas',
  OTROS: 'Otros Gastos Operativos',
};

/**
 * Diccionario de tipos de comprobante de compra
 */
export const PURCHASE_INVOICE_LABELS: Record<PurchaseInvoiceType, string> = {
  FACTURA: 'Factura',
  BOLETA: 'Boleta',
  RECIBO: 'Recibo',
  SIN_COMPROBANTE: 'Sin Comprobante',
};

/**
 * Formatea número o string a moneda peruana S/ con 2 decimales
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return 'S/ 0.00';
  const val = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(val)) return 'S/ 0.00';
  return `S/ ${val.toFixed(2)}`;
}

/**
 * Redondeo contable exacto a 2 decimales
 */
export function roundMoney(amount: number): number {
  return roundMonetary(amount);
}

/**
 * Deriva de forma unívoca el canal contable según el método de pago:
 * EFECTIVO -> FISICA
 * YAPE, PLIN, TRANSFERENCIA, TARJETA -> DIGITAL
 */
export function derivePaymentChannel(method: PaymentMethod): PaymentChannel {
  if (method === 'EFECTIVO') {
    return 'FISICA';
  }
  return 'DIGITAL';
}

/**
 * Calcula de manera reactiva el subtotal de cada ítem de compra y el total de la compra.
 */
export function calculatePurchaseItemsTotal(
  items: Array<{ producto_id?: number; cantidad: number; costo_unitario: string }>
): {
  itemsWithSubtotals: CreateSupplierPurchaseDetailDto[];
  totalCompra: string;
} {
  let totalSum = 0;

  const itemsWithSubtotals: CreateSupplierPurchaseDetailDto[] = items.map((item) => {
    const qty = Math.max(0, item.cantidad || 0);
    const unitCost = Math.max(0, parseFloat(item.costo_unitario) || 0);
    const subtotalNum = roundMoney(qty * unitCost);
    totalSum += subtotalNum;

    return {
      producto_id: item.producto_id ?? 0,
      cantidad: qty,
      costo_unitario: unitCost.toFixed(2),
      subtotal: subtotalNum.toFixed(2),
    };
  });

  return {
    itemsWithSubtotals,
    totalCompra: roundMoney(totalSum).toFixed(2),
  };
}

/**
 * Valida un DTO de creación de compra a proveedor antes de despacharlo a Tauri IPC
 */
export function validateSupplierPurchaseInput(
  input: CreateSupplierPurchaseDto
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.proveedor_id || input.proveedor_id <= 0) {
    errors.push('Debe seleccionar un proveedor válido.');
  }

  if (!input.detalles || input.detalles.length === 0) {
    errors.push('Debe registrar al menos un producto en el detalle de la compra.');
  } else {
    let sumSubtotals = 0;

    input.detalles.forEach((det, idx) => {
      if (!det.producto_id || det.producto_id <= 0) {
        errors.push(`Ítem #${idx + 1}: Debe seleccionar un producto.`);
      }
      if (!det.cantidad || det.cantidad <= 0) {
        errors.push(`Ítem #${idx + 1}: La cantidad debe ser mayor a 0.`);
      }
      const costNum = parseFloat(det.costo_unitario);
      if (isNaN(costNum) || costNum < 0) {
        errors.push(`Ítem #${idx + 1}: El costo unitario no puede ser negativo.`);
      }
      const subNum = parseFloat(det.subtotal);
      if (isNaN(subNum) || subNum < 0) {
        errors.push(`Ítem #${idx + 1}: El subtotal es inválido.`);
      } else {
        sumSubtotals += subNum;
      }
    });

    const totalNum = parseFloat(input.total_compra);
    if (isNaN(totalNum) || totalNum <= 0) {
      errors.push('El total de la compra debe ser mayor a S/ 0.00.');
    } else if (Math.abs(roundMoney(sumSubtotals) - roundMoney(totalNum)) > 0.05) {
      errors.push(
        `El total declarado (S/ ${totalNum.toFixed(2)}) no coincide con la suma de subtotales (S/ ${sumSubtotals.toFixed(2)}).`
      );
    }
  }

  const expectedChannel = derivePaymentChannel(input.metodo_pago);
  if (input.canal_caja !== expectedChannel) {
    errors.push(
      `El método de pago ${input.metodo_pago} es incompatible con el canal ${input.canal_caja}. Debe ser ${expectedChannel}.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Valida el motivo de anulación de una compra (mínimo 5 caracteres no vacíos)
 */
export function validateCancelPurchaseInput(motivo: string): { isValid: boolean; error?: string } {
  const clean = (motivo || '').trim();
  if (clean.length < 5) {
    return {
      isValid: false,
      error: 'El motivo de anulación es obligatorio y debe tener al menos 5 caracteres descriptivos.',
    };
  }
  return { isValid: true };
}

/**
 * Valida un gasto operativo antes de su persistencia
 */
export function validateExpenseInput(
  input: CreateExpenseDto | UpdateExpenseDto
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const cleanDesc = (input.descripcion || '').trim();
  if (cleanDesc.length < 3) {
    errors.push('La descripción del gasto debe tener al menos 3 caracteres.');
  }

  const montoNum = parseFloat(input.monto);
  if (isNaN(montoNum) || montoNum <= 0) {
    errors.push('El monto del gasto debe ser un valor numérico mayor a 0.');
  }

  if (!input.categoria) {
    errors.push('Debe seleccionar una categoría de gasto válida.');
  }

  const expectedChannel = derivePaymentChannel(input.metodo_pago);
  if (input.canal_caja !== expectedChannel) {
    errors.push(
      `El método de pago ${input.metodo_pago} es incompatible con el canal ${input.canal_caja}. Debe ser ${expectedChannel}.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * RBAC: Gestión y consulta de gastos operativos es exclusiva de ADMINISTRADOR
 */
export function canManageExpenses(role?: string | null): boolean {
  return role === 'ADMINISTRADOR';
}

/**
 * RBAC: Anulación de compras a proveedores es exclusiva de ADMINISTRADOR
 */
export function canCancelSupplierPurchase(role?: string | null): boolean {
  return role === 'ADMINISTRADOR';
}

/**
 * RBAC: Resolución definitiva (Paso 2) de ventas tachadas es exclusiva de ADMINISTRADOR
 */
export function canResolveStruckSales(role?: string | null): boolean {
  return role === 'ADMINISTRADOR';
}

/**
 * RBAC: Acceso al módulo de finanzas (Dashboard, Compras y Bandeja de Tachados en lectura) para ADMINISTRADOR y RECEPCIONISTA
 */
export function canAccessFinanceModule(rol?: string | null): boolean {
  return rol === 'ADMINISTRADOR' || rol === 'RECEPCIONISTA';
}

export function canAccessFinance(role?: string | null): boolean {
  return role === 'ADMINISTRADOR' || role === 'RECEPCIONISTA';
}
