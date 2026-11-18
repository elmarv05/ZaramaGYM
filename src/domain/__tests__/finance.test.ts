// ============================================================================
// PRUEBAS UNITARIAS: DOMINIO DE FINANZAS, COMPRAS Y GASTOS (SLICE 7)
// Ubicación: src/domain/__tests__/finance.test.ts
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  EXPENSE_CATEGORY_LABELS,
  PURCHASE_INVOICE_LABELS,
  calculatePurchaseItemsTotal,
  canAccessFinanceModule,
  canCancelSupplierPurchase,
  canManageExpenses,
  derivePaymentChannel,
  formatCurrency,
  validateCancelPurchaseInput,
  validateExpenseInput,
  validateSupplierPurchaseInput,
} from '../finance';
import { CreateExpenseDto, CreateSupplierPurchaseDto } from '../../types/finance';

describe('Dominio de Finanzas: Funciones Puras y Reglas de Negocio (Slice 7)', () => {
  describe('derivePaymentChannel', () => {
    it('asigna correctamente canal FISICA a EFECTIVO', () => {
      expect(derivePaymentChannel('EFECTIVO')).toBe('FISICA');
    });

    it('asigna correctamente canal DIGITAL a YAPE, PLIN, TRANSFERENCIA y TARJETA', () => {
      expect(derivePaymentChannel('YAPE')).toBe('DIGITAL');
      expect(derivePaymentChannel('PLIN')).toBe('DIGITAL');
      expect(derivePaymentChannel('TRANSFERENCIA')).toBe('DIGITAL');
      expect(derivePaymentChannel('TARJETA')).toBe('DIGITAL');
    });
  });

  describe('calculatePurchaseItemsTotal', () => {
    it('calcula subtotales exactos y total general de ítems', () => {
      const items = [
        { producto_id: 1, cantidad: 5, costo_unitario: '10.50' },
        { producto_id: 2, cantidad: 2, costo_unitario: '25.00' },
      ];

      const result = calculatePurchaseItemsTotal(items);

      expect(result.itemsWithSubtotals).toHaveLength(2);
      expect(result.itemsWithSubtotals[0].subtotal).toBe('52.50');
      expect(result.itemsWithSubtotals[1].subtotal).toBe('50.00');
      expect(result.totalCompra).toBe('102.50');
    });

    it('retorna 0.00 cuando la lista de ítems está vacía', () => {
      const result = calculatePurchaseItemsTotal([]);
      expect(result.itemsWithSubtotals).toEqual([]);
      expect(result.totalCompra).toBe('0.00');
    });

    it('maneja cantidades con decimales o precios cero sin distorsión', () => {
      const items = [
        { producto_id: 3, cantidad: 3, costo_unitario: '0.00' },
        { producto_id: 4, cantidad: 4, costo_unitario: '1.333' },
      ];
      const result = calculatePurchaseItemsTotal(items);
      expect(result.itemsWithSubtotals[0].subtotal).toBe('0.00');
      expect(result.itemsWithSubtotals[1].subtotal).toBe('5.33');
      expect(result.totalCompra).toBe('5.33');
    });
  });

  describe('validateSupplierPurchaseInput', () => {
    const validPurchase: CreateSupplierPurchaseDto = {
      proveedor_id: 1,
      tipo_comprobante: 'FACTURA',
      numero_comprobante: 'F001-00123',
      metodo_pago: 'TRANSFERENCIA',
      canal_caja: 'DIGITAL',
      total_compra: '100.00',
      detalles: [
        {
          producto_id: 1,
          cantidad: 10,
          costo_unitario: '10.00',
          subtotal: '100.00',
        },
      ],
    };

    it('valida exitosamente un DTO correcto y consistente', () => {
      const res = validateSupplierPurchaseInput(validPurchase);
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('falla si proveedor_id es <= 0 o no se especifica', () => {
      const res = validateSupplierPurchaseInput({
        ...validPurchase,
        proveedor_id: 0,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('proveedor'))).toBe(true);
    });

    it('falla si no hay ítems en detalles', () => {
      const res = validateSupplierPurchaseInput({
        ...validPurchase,
        detalles: [],
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('al menos un producto'))).toBe(true);
    });

    it('falla si un ítem tiene cantidad <= 0 o costo negativo', () => {
      const res = validateSupplierPurchaseInput({
        ...validPurchase,
        detalles: [
          {
            producto_id: 1,
            cantidad: 0,
            costo_unitario: '-5.00',
            subtotal: '0.00',
          },
        ],
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    });

    it('falla si el total_compra no coincide con la suma de subtotales', () => {
      const res = validateSupplierPurchaseInput({
        ...validPurchase,
        total_compra: '90.00', // Subtotal es 100.00
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('no coincide con la suma'))).toBe(true);
    });

    it('falla si hay discrepancia entre metodo_pago y canal_caja', () => {
      const res = validateSupplierPurchaseInput({
        ...validPurchase,
        metodo_pago: 'EFECTIVO',
        canal_caja: 'DIGITAL', // Incompatible
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('incompatible con el canal'))).toBe(true);
    });
  });

  describe('validateCancelPurchaseInput', () => {
    it('valida exitosamente un motivo con 5 o más caracteres limpios', () => {
      const res = validateCancelPurchaseInput('Factura duplicada por proveedor');
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('falla con un motivo corto (< 5 caracteres) o con solo espacios', () => {
      const res = validateCancelPurchaseInput(' err ');
      expect(res.isValid).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('validateExpenseInput', () => {
    const validExpense: CreateExpenseDto = {
      categoria: 'ALQUILER',
      descripcion: 'Pago alquiler local mensualidad noviembre',
      monto: '1500.00',
      metodo_pago: 'TRANSFERENCIA',
      canal_caja: 'DIGITAL',
    };

    it('valida exitosamente un gasto con datos correctos', () => {
      const res = validateExpenseInput(validExpense);
      expect(res.isValid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('falla si el monto es <= 0 o inválido', () => {
      const res = validateExpenseInput({
        ...validExpense,
        monto: '0.00',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('mayor a 0'))).toBe(true);
    });

    it('falla si la descripción tiene menos de 3 caracteres', () => {
      const res = validateExpenseInput({
        ...validExpense,
        descripcion: 'ok',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('descripción'))).toBe(true);
    });

    it('falla si metodo_pago no corresponde al canal_caja', () => {
      const res = validateExpenseInput({
        ...validExpense,
        metodo_pago: 'EFECTIVO',
        canal_caja: 'DIGITAL',
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('incompatible'))).toBe(true);
    });
  });

  describe('Control de Acceso RBAC', () => {
    it('canManageExpenses es exclusivo para ADMINISTRADOR', () => {
      expect(canManageExpenses('ADMINISTRADOR')).toBe(true);
      expect(canManageExpenses('SUPERVISOR')).toBe(false);
      expect(canManageExpenses('RECEPCIONISTA')).toBe(false);
      expect(canManageExpenses(undefined)).toBe(false);
    });

    it('canCancelSupplierPurchase es exclusivo para ADMINISTRADOR', () => {
      expect(canCancelSupplierPurchase('ADMINISTRADOR')).toBe(true);
      expect(canCancelSupplierPurchase('SUPERVISOR')).toBe(false);
      expect(canCancelSupplierPurchase('RECEPCIONISTA')).toBe(false);
      expect(canCancelSupplierPurchase(undefined)).toBe(false);
    });

    it('canAccessFinanceModule permite ADMINISTRADOR y SUPERVISOR, pero deniega RECEPCIONISTA', () => {
      expect(canAccessFinanceModule('ADMINISTRADOR')).toBe(true);
      expect(canAccessFinanceModule('SUPERVISOR')).toBe(true);
      expect(canAccessFinanceModule('RECEPCIONISTA')).toBe(false);
      expect(canAccessFinanceModule(undefined)).toBe(false);
    });
  });

  describe('Diccionarios y Etiquetas Legibles', () => {
    it('EXPENSE_CATEGORY_LABELS contiene todas las categorías con textos legibles', () => {
      expect(EXPENSE_CATEGORY_LABELS.SERVICIOS_BASICOS).toBe('Servicios Básicos (Luz, Agua, Internet)');
      expect(EXPENSE_CATEGORY_LABELS.ALQUILER).toBe('Alquiler de Local');
      expect(EXPENSE_CATEGORY_LABELS.MANTENIMIENTO_EQUIPOS).toBe('Mantenimiento de Máquinas y Equipos');
      expect(EXPENSE_CATEGORY_LABELS.LIMPIEZA_INSUMOS).toBe('Limpieza e Insumos');
      expect(EXPENSE_CATEGORY_LABELS.PERSONAL_HONORARIOS).toBe('Personal y Honorarios');
      expect(EXPENSE_CATEGORY_LABELS.MARKETING).toBe('Marketing y Publicidad');
      expect(EXPENSE_CATEGORY_LABELS.IMPUESTOS_TASAS).toBe('Impuestos, Licencias y Tasas');
      expect(EXPENSE_CATEGORY_LABELS.OTROS).toBe('Otros Gastos Operativos');
    });

    it('PURCHASE_INVOICE_LABELS contiene tipos de comprobante legibles', () => {
      expect(PURCHASE_INVOICE_LABELS.FACTURA).toBe('Factura');
      expect(PURCHASE_INVOICE_LABELS.BOLETA).toBe('Boleta');
      expect(PURCHASE_INVOICE_LABELS.RECIBO).toBe('Recibo');
      expect(PURCHASE_INVOICE_LABELS.SIN_COMPROBANTE).toBe('Sin Comprobante');
    });

    it('formatCurrency formatea montos a soles S/ con dos decimales', () => {
      expect(formatCurrency(120.5)).toBe('S/ 120.50');
      expect(formatCurrency('35.9')).toBe('S/ 35.90');
      expect(formatCurrency(0)).toBe('S/ 0.00');
    });
  });
});
