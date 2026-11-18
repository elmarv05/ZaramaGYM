// ============================================================================
// PRUEBAS UNITARIAS: DOMINIO POS, CAJA Y CRÉDITOS (SLICE 4)
// Ubicación: src/__tests__/domain/pos.test.ts
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  calculateCartTotals,
  calculateCashDifference,
  calculatePaymentSplit,
  canResolveStruckSale,
  canStrikeSale,
  formatMoney,
  resolveCreditOrigin,
  roundMoney,
  validatePosSaleInput,
  validateStrikeSaleInput,
} from '../../domain/pos';
import { CreatePosSaleInput, PosSaleItemInput } from '../../types/pos';

describe('Dominio POS: Funciones Matemáticas Deterministas y Redondeo', () => {
  it('roundMoney y formatMoney redondean correctamente a 2 decimales sin distorsiones', () => {
    expect(roundMoney(10.555)).toBe(10.56);
    expect(roundMoney(10.554)).toBe(10.55);
    expect(formatMoney(15)).toBe('15.00');
    expect(formatMoney('25.3')).toBe('25.30');
    expect(formatMoney(0)).toBe('0.00');
  });

  it('calculateCartTotals calcula subtotal, descuento acotado y total con precisión', () => {
    const items: PosSaleItemInput[] = [
      {
        tipo_item: 'PRODUCTO',
        producto_id: 1,
        cantidad: 2,
        precio_unitario: '12.50',
        subtotal: '25.00',
      },
      {
        tipo_item: 'PRODUCTO',
        producto_id: 2,
        cantidad: 1,
        precio_unitario: '5.00',
        subtotal: '5.00',
      },
    ];

    const resultWithoutDiscount = calculateCartTotals(items, 0);
    expect(resultWithoutDiscount.subtotal).toBe(30.00);
    expect(resultWithoutDiscount.descuento).toBe(0.00);
    expect(resultWithoutDiscount.totalVenta).toBe(30.00);

    const resultWithDiscount = calculateCartTotals(items, '5.00');
    expect(resultWithDiscount.subtotal).toBe(30.00);
    expect(resultWithDiscount.descuento).toBe(5.00);
    expect(resultWithDiscount.totalVenta).toBe(25.00);

    // El descuento no puede superar el subtotal
    const resultExcessiveDiscount = calculateCartTotals(items, '50.00');
    expect(resultExcessiveDiscount.descuento).toBe(30.00);
    expect(resultExcessiveDiscount.totalVenta).toBe(0.00);
  });
});

describe('Dominio POS: Split de Pagos, Vuelto y Crédito Automático', () => {
  it('pago exacto en efectivo no genera vuelto ni crédito', () => {
    const split = calculatePaymentSplit(50.00, [
      { metodo_pago: 'EFECTIVO', monto: '50.00' },
    ]);

    expect(split.montoEfectivoEntregado).toBe(50.00);
    expect(split.efectivoNetoRetenido).toBe(50.00);
    expect(split.vueltoEfectivo).toBe(0.00);
    expect(split.saldoCreditoGenerado).toBe(0.00);
    expect(split.isCredito).toBe(false);
  });

  it('pago en efectivo con billete mayor calcula vuelto y retiene solo el neto', () => {
    const split = calculatePaymentSplit(45.00, [
      { metodo_pago: 'EFECTIVO', monto: '100.00' },
    ]);

    expect(split.montoEfectivoEntregado).toBe(100.00);
    expect(split.vueltoEfectivo).toBe(55.00);
    expect(split.efectivoNetoRetenido).toBe(45.00);
    expect(split.saldoCreditoGenerado).toBe(0.00);
  });

  it('pago mixto (Yape + Efectivo con vuelto) calcula vuelto exacto', () => {
    // Total 100: Yape paga 60, cliente entrega billete de 50 en efectivo.
    // Falta cubrir 40 en efectivo -> Vuelto = 10, Retenido = 40.
    const split = calculatePaymentSplit(100.00, [
      { metodo_pago: 'YAPE', monto: '60.00' },
      { metodo_pago: 'EFECTIVO', monto: '50.00' },
    ]);

    expect(split.montoPagadoDigital).toBe(60.00);
    expect(split.montoEfectivoEntregado).toBe(50.00);
    expect(split.efectivoNetoRetenido).toBe(40.00);
    expect(split.vueltoEfectivo).toBe(10.00);
    expect(split.saldoCreditoGenerado).toBe(0.00);
    expect(split.isOverpaidDigital).toBe(false);
  });

  it('pago parcial genera saldo a crédito automáticamente', () => {
    // Total 120, cliente paga 50 en efectivo.
    const split = calculatePaymentSplit(120.00, [
      { metodo_pago: 'EFECTIVO', monto: '50.00' },
    ]);

    expect(split.efectivoNetoRetenido).toBe(50.00);
    expect(split.vueltoEfectivo).toBe(0.00);
    expect(split.saldoCreditoGenerado).toBe(70.00);
    expect(split.isCredito).toBe(true);
  });

  it('detecta si el pago digital excede el total de la venta', () => {
    const split = calculatePaymentSplit(50.00, [
      { metodo_pago: 'PLIN', monto: '60.00' },
    ]);

    expect(split.isOverpaidDigital).toBe(true);
  });
});

describe('Dominio POS: Arqueo de Caja y Clasificación de Cuadre', () => {
  it('cuadre exacto cuando declarado coincide con esperado', () => {
    const arqueo = calculateCashDifference('150.00', '150.00');
    expect(arqueo.diferencia).toBe(0.00);
    expect(arqueo.estado).toBe('CUADRE_EXACTO');
  });

  it('sobrante cuando declarado > esperado', () => {
    const arqueo = calculateCashDifference('210.50', '200.00');
    expect(arqueo.diferencia).toBe(10.50);
    expect(arqueo.estado).toBe('SOBRANTE');
  });

  it('faltante cuando declarado < esperado', () => {
    const arqueo = calculateCashDifference('180.00', '200.00');
    expect(arqueo.diferencia).toBe(-20.00);
    expect(arqueo.estado).toBe('FALTANTE');
  });
});

describe('Dominio POS: Clasificación de Crédito y Validaciones de Venta', () => {
  it('resolveCreditOrigin clasifica MEMBRESIA_PAGO_PARCIAL si hay plan y PRODUCTO_CREDITO si solo son productos', () => {
    const itemsSoloProductos: PosSaleItemInput[] = [
      { tipo_item: 'PRODUCTO', producto_id: 1, cantidad: 1, precio_unitario: '10.00', subtotal: '10.00' },
    ];
    expect(resolveCreditOrigin(itemsSoloProductos)).toBe('PRODUCTO_CREDITO');

    const itemsConPlan: PosSaleItemInput[] = [
      { tipo_item: 'PLAN', plan_id: 2, cantidad: 1, precio_unitario: '100.00', subtotal: '100.00' },
      { tipo_item: 'PRODUCTO', producto_id: 1, cantidad: 1, precio_unitario: '10.00', subtotal: '10.00' },
    ];
    expect(resolveCreditOrigin(itemsConPlan)).toBe('MEMBRESIA_PAGO_PARCIAL');
  });

  it('valida que el carrito no esté vacío', () => {
    const input: CreatePosSaleInput = {
      cliente_id: null,
      items: [],
      pagos: [],
    };
    const res = validatePosSaleInput(input);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain('no puede estar vacío');
  });

  it('permite venta rápida a público general para productos al contado', () => {
    const input: CreatePosSaleInput = {
      cliente_id: null,
      items: [
        { tipo_item: 'PRODUCTO', producto_id: 1, cantidad: 1, precio_unitario: '15.00', subtotal: '15.00' },
      ],
      pagos: [
        { metodo_pago: 'EFECTIVO', monto: '15.00' },
      ],
    };
    const res = validatePosSaleInput(input);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('exige cliente_id para ventas con PLAN, AMORTIZACION_CREDITO o saldo a crédito', () => {
    // Caso Plan sin cliente
    const inputPlan: CreatePosSaleInput = {
      cliente_id: null,
      items: [
        { tipo_item: 'PLAN', plan_id: 1, cantidad: 1, precio_unitario: '80.00', subtotal: '80.00' },
      ],
      pagos: [
        { metodo_pago: 'EFECTIVO', monto: '80.00' },
      ],
    };
    expect(validatePosSaleInput(inputPlan).isValid).toBe(false);

    // Caso Crédito sin cliente
    const inputCredito: CreatePosSaleInput = {
      cliente_id: null,
      items: [
        { tipo_item: 'PRODUCTO', producto_id: 1, cantidad: 1, precio_unitario: '40.00', subtotal: '40.00' },
      ],
      pagos: [
        { metodo_pago: 'EFECTIVO', monto: '10.00' }, // Falta 30 -> Crédito
      ],
    };
    expect(validatePosSaleInput(inputCredito).isValid).toBe(false);
  });

  it('prohíbe re-financiar a crédito una venta de amortización de deuda', () => {
    const input: CreatePosSaleInput = {
      cliente_id: 5,
      items: [
        { tipo_item: 'AMORTIZACION_CREDITO', credito_id: 10, cantidad: 1, precio_unitario: '50.00', subtotal: '50.00' },
      ],
      pagos: [
        { metodo_pago: 'EFECTIVO', monto: '20.00' }, // Pago incompleto
      ],
    };
    const res = validatePosSaleInput(input);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.includes('No es posible diferir a crédito'))).toBe(true);
  });
});

describe('Dominio POS: Tachado en 2 Pasos y Permisos RBAC', () => {
  it('validateStrikeSaleInput rechaza tachado si turno cerrado o motivo corto', () => {
    expect(validateStrikeSaleInput('1234', 'ABIERTO', 'COMPLETADA').isValid).toBe(false);
    expect(validateStrikeSaleInput('Error en cobro', 'CERRADO', 'COMPLETADA').isValid).toBe(false);
    expect(validateStrikeSaleInput('Error en cobro', 'ABIERTO', 'TACHADA_EN_TURNO').isValid).toBe(false);
    expect(validateStrikeSaleInput('Error en cobro de plan', 'ABIERTO', 'COMPLETADA').isValid).toBe(true);
  });

  it('canStrikeSale permite a cualquier rol operativo tachar en turno abierto', () => {
    expect(canStrikeSale('RECEPCIONISTA')).toBe(true);
    expect(canStrikeSale('SUPERVISOR')).toBe(true);
    expect(canStrikeSale('ADMINISTRADOR')).toBe(true);
    expect(canStrikeSale(null)).toBe(false);
  });

  it('canResolveStruckSale restringe el Paso 2 exclusivamente al ADMINISTRADOR', () => {
    expect(canResolveStruckSale('ADMINISTRADOR')).toBe(true);
    expect(canResolveStruckSale('SUPERVISOR')).toBe(false);
    expect(canResolveStruckSale('RECEPCIONISTA')).toBe(false);
    expect(canResolveStruckSale(null)).toBe(false);
  });
});
