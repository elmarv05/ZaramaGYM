import { describe, it, expect } from 'vitest';
import {
  calculateDayOverflowPreview,
  canMutateCatalog,
  formatPEN,
  formatProductCategory,
  getDaysInMonth,
  isLeapYear,
  validateInventoryMovementForm,
  validatePlanForm,
  validateProductForm,
} from '../../domain/catalog';

describe('Dominio Catálogo: Algoritmo Day Overflow & Validaciones (Slice 3)', () => {
  describe('Año Bisiesto y Días del Mes', () => {
    it('determina años bisiestos correctamente', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2025)).toBe(false);
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(2000)).toBe(true);
      expect(isLeapYear(1900)).toBe(false);
    });

    it('calcula días por mes incluyendo febrero bisiesto y común', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(getDaysInMonth(2025, 2)).toBe(28);
      expect(getDaysInMonth(2026, 4)).toBe(30);
      expect(getDaysInMonth(2026, 1)).toBe(31);
    });
  });

  describe('Casos Canónicos Obligatorios Day Overflow (CP-01 a CP-07)', () => {
    // CP-01: 2024-01-31, 1 mes -> 2024-03-02, +2 días, 32 días
    it('CP-01: compensa +2 días en año bisiesto al desbordar febrero de 29 días', () => {
      const result = calculateDayOverflowPreview('2024-01-31', 'MENSUALIDAD', 1);
      expect(result.fecha_vencimiento_date).toBe('2024-03-02');
      expect(result.fecha_vencimiento_timestamp).toBe('2024-03-02 23:59:59');
      expect(result.hubo_desbordamiento).toBe(true);
      expect(result.dias_desbordamiento).toBe(2);
      expect(result.dias_totales).toBe(32);
      expect(result.explicacion).toContain('El mes destino 02/2024 tiene 29 días');
      expect(result.explicacion).toContain('Se compensaron 2 día(s) desbordando al 2024-03-02');
    });

    // CP-02: 2025-01-31, 1 mes -> 2025-03-03, +3 días, 32 días
    it('CP-02: compensa +3 días en año común al desbordar febrero de 28 días', () => {
      const result = calculateDayOverflowPreview('2025-01-31', 'MENSUALIDAD', 1);
      expect(result.fecha_vencimiento_date).toBe('2025-03-03');
      expect(result.fecha_vencimiento_timestamp).toBe('2025-03-03 23:59:59');
      expect(result.hubo_desbordamiento).toBe(true);
      expect(result.dias_desbordamiento).toBe(3);
      expect(result.dias_totales).toBe(32);
      expect(result.explicacion).toContain('El mes destino 02/2025 tiene 28 días');
      expect(result.explicacion).toContain('Se compensaron 3 día(s) desbordando al 2025-03-03');
    });

    // CP-03: 2026-01-31, 2 meses -> 2026-03-31, 0 días, 60 días
    it('CP-03: sin desbordamiento cuando el mes destino (Marzo) tiene 31 días', () => {
      const result = calculateDayOverflowPreview('2026-01-31', 'MENSUALIDAD', 2);
      expect(result.fecha_vencimiento_date).toBe('2026-03-31');
      expect(result.fecha_vencimiento_timestamp).toBe('2026-03-31 23:59:59');
      expect(result.hubo_desbordamiento).toBe(false);
      expect(result.dias_desbordamiento).toBe(0);
      expect(result.dias_totales).toBe(60);
      expect(result.explicacion).toContain('sin desbordamiento');
    });

    // CP-04: 2026-01-31, 3 meses -> 2026-05-01, +1 día, 91 días
    it('CP-04: compensa +1 día cuando el mes destino (Abril) tiene 30 días', () => {
      const result = calculateDayOverflowPreview('2026-01-31', 'MENSUALIDAD', 3);
      expect(result.fecha_vencimiento_date).toBe('2026-05-01');
      expect(result.fecha_vencimiento_timestamp).toBe('2026-05-01 23:59:59');
      expect(result.hubo_desbordamiento).toBe(true);
      expect(result.dias_desbordamiento).toBe(1);
      expect(result.dias_totales).toBe(91);
      expect(result.explicacion).toContain('El mes destino 04/2026 tiene 30 días');
      expect(result.explicacion).toContain('Se compensaron 1 día(s) desbordando al 2026-05-01');
    });

    // CP-05: 2026-05-15, PASE_DIARIO, 0 meses -> 2026-05-15, 0 días, 1 día
    it('CP-05: Pase Diario vence exactamente el mismo día a las 23:59:59 con 1 día total', () => {
      const result = calculateDayOverflowPreview('2026-05-15', 'PASE_DIARIO', 0);
      expect(result.fecha_vencimiento_date).toBe('2026-05-15');
      expect(result.fecha_vencimiento_timestamp).toBe('2026-05-15 23:59:59');
      expect(result.hubo_desbordamiento).toBe(false);
      expect(result.dias_desbordamiento).toBe(0);
      expect(result.dias_totales).toBe(1);
      expect(result.explicacion).toContain('Pase diario con vigencia exclusiva');
    });

    // CP-06: 2026-08-31, 1 mes -> 2026-10-01, +1 día, 32 días
    it('CP-06: inicio 31 de agosto con 1 mes compensa +1 día hacia el 01 de octubre', () => {
      const result = calculateDayOverflowPreview('2026-08-31', 'MENSUALIDAD', 1);
      expect(result.fecha_vencimiento_date).toBe('2026-10-01');
      expect(result.fecha_vencimiento_timestamp).toBe('2026-10-01 23:59:59');
      expect(result.hubo_desbordamiento).toBe(true);
      expect(result.dias_desbordamiento).toBe(1);
      expect(result.dias_totales).toBe(32);
      expect(result.explicacion).toContain('El mes destino 09/2026 tiene 30 días');
      expect(result.explicacion).toContain('Se compensaron 1 día(s) desbordando al 2026-10-01');
    });

    // CP-07: 2024-02-29, 12 meses -> 2025-03-01, +1 día, 367 días
    it('CP-07: inicio 29 de febrero bisiesto con 12 meses compensa +1 día al 01 de marzo en año común', () => {
      const result = calculateDayOverflowPreview('2024-02-29', 'MENSUALIDAD', 12);
      expect(result.fecha_vencimiento_date).toBe('2025-03-01');
      expect(result.fecha_vencimiento_timestamp).toBe('2025-03-01 23:59:59');
      expect(result.hubo_desbordamiento).toBe(true);
      expect(result.dias_desbordamiento).toBe(1);
      expect(result.dias_totales).toBe(367);
      expect(result.explicacion).toContain('El mes destino 02/2025 tiene 28 días');
      expect(result.explicacion).toContain('Se compensaron 1 día(s) desbordando al 2025-03-01');
    });
  });

  describe('Validación de Formulario de Planes', () => {
    it('rechaza código vacío y nombres muy cortos en creación', () => {
      const errors = validatePlanForm({
        codigo: '',
        nombre: 'Pl',
        tipo_plan: 'MENSUALIDAD',
        duracion_meses: 1,
        precio_base: '80.00',
        permite_recuperacion_dias: true,
      });
      expect(errors.codigo).toBeDefined();
      expect(errors.nombre).toBeDefined();
    });

    it('valida coherencia entre tipo de plan y duración en meses', () => {
      const errDiario = validatePlanForm({
        codigo: 'P1',
        nombre: 'Plan Diario Inválido',
        tipo_plan: 'PASE_DIARIO',
        duracion_meses: 2,
        precio_base: '10.00',
        permite_recuperacion_dias: false,
      });
      expect(errDiario.duracion_meses).toBeDefined();

      const errMensual = validatePlanForm({
        codigo: 'P2',
        nombre: 'Plan Mensual Inválido',
        tipo_plan: 'MENSUALIDAD',
        duracion_meses: 0,
        precio_base: '80.00',
        permite_recuperacion_dias: true,
      });
      expect(errMensual.duracion_meses).toBeDefined();
    });
  });

  describe('Validación de Formulario de Productos', () => {
    it('valida campos obligatorios y formato de SKU', () => {
      const errors = validateProductForm({
        codigo_sku: '?? SKU',
        nombre: 'Ag',
        categoria: 'BEBIDAS',
        precio_compra_referencial: '2.00',
        precio_venta: '4.50',
        stock_minimo: 5,
      });
      expect(errors.codigo_sku).toBeDefined();
      expect(errors.nombre).toBeDefined();
    });

    it('no permite precios o stock negativos', () => {
      const errors = validateProductForm({
        codigo_sku: 'BEB-01',
        nombre: 'Agua Mineral',
        categoria: 'BEBIDAS',
        precio_compra_referencial: '-1',
        precio_venta: '-5',
        stock_minimo: -2,
        stock_inicial: -10,
      });
      expect(errors.precio_venta).toBeDefined();
      expect(errors.precio_compra_referencial).toBeDefined();
      expect(errors.stock_minimo).toBeDefined();
      expect(errors.stock_inicial).toBeDefined();
    });
  });

  describe('Validación de Movimientos de Inventario y Mermas', () => {
    it('exige justificación mínima de 5 caracteres', () => {
      const errors = validateInventoryMovementForm(
        {
          producto_id: 1,
          tipo_movimiento: 'MERMA_DANIO',
          cantidad: 2,
          motivo_justificacion: 'Roto', // 4 caracteres
        },
        10
      );
      expect(errors.motivo_justificacion).toBeDefined();
    });

    it('bloquea merma si la cantidad solicitada supera el stock disponible (evita stock negativo)', () => {
      const errors = validateInventoryMovementForm(
        {
          producto_id: 1,
          tipo_movimiento: 'MERMA_DANIO',
          cantidad: 15,
          motivo_justificacion: 'Botella rota durante acomodo',
        },
        10 // Stock actual disponible = 10
      );
      expect(errors.cantidad).toContain('Stock insuficiente para aplicar salida');
      expect(errors.cantidad).toContain('Stock actual: 10, solicitado: 15');
    });

    it('permite ajuste positivo sin importar stock actual', () => {
      const errors = validateInventoryMovementForm(
        {
          producto_id: 1,
          tipo_movimiento: 'ENTRADA_AJUSTE',
          cantidad: 20,
          motivo_justificacion: 'Conteo físico reveló sobrante',
        },
        5
      );
      expect(Object.keys(errors).length).toBe(0);
    });
  });

  describe('RBAC y Helpers de Presentación', () => {
    it('permite mutaciones a ADMINISTRADOR y SUPERVISOR, restringe a RECEPCIONISTA', () => {
      expect(canMutateCatalog('ADMINISTRADOR')).toBe(true);
      expect(canMutateCatalog('SUPERVISOR')).toBe(true);
      expect(canMutateCatalog('RECEPCIONISTA')).toBe(false);
      expect(canMutateCatalog(null)).toBe(false);
    });

    it('formatea montos a soles peruanos y categorías con emojis semánticos', () => {
      expect(formatPEN('80')).toBe('S/ 80.00');
      expect(formatPEN(15.5)).toBe('S/ 15.50');
      expect(formatProductCategory('BEBIDAS')).toBe('Bebidas');
      expect(formatProductCategory('SUPLEMENTOS')).toBe('Suplementos');
    });
  });
});
