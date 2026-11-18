// ============================================================================
// SUITE DE PRUEBAS FRONTEND: SLICE 7 (COMPRAS, GASTOS Y FINANZAS)
// Verificación exhaustiva: Selector Triple de Caja (Física/Digital/Mixta),
// Compras a Proveedores, Control RBAC de Gastos y Bandeja Global de Tachados (Paso 2)
// Ubicación: src/features/finance/__tests__/FinanceView.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { safeInvoke } from '../../../services/ipc/client';
import { AuthSession } from '../../../types/auth';
import { ProductListItem } from '../../../types/catalog';
import { SupplierListItem } from '../../../types/entity';
import {
  FinancialDashboardDto,
  OperationalExpenseDto,
  StruckSaleTrayItemDto,
  SupplierPurchaseSummaryDto,
} from '../../../types/finance';
import { FinanceView } from '../FinanceView';

// Mock de safeInvoke de Tauri IPC
vi.mock('../../../services/ipc/client', () => ({
  safeInvoke: vi.fn(),
}));

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-15 08:00:00',
};

const supervisorSession: AuthSession = {
  user_id: 2,
  persona_id: 2,
  username: 'super1',
  nombre_completo: 'Carlos Supervisor',
  rol: 'SUPERVISOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-15 08:15:00',
};

const mockDashboard: FinancialDashboardDto = {
  filtro_aplicado: {},
  fisica: {
    canal: 'FISICA',
    ingresos_ventas: '500.00',
    egresos_compras: '100.00',
    egresos_gastos: '0.00',
    total_egresos: '100.00',
    flujo_neto: '400.00',
  },
  digital: {
    canal: 'DIGITAL',
    ingresos_ventas: '300.00',
    egresos_compras: '0.00',
    egresos_gastos: '50.00',
    total_egresos: '50.00',
    flujo_neto: '250.00',
  },
  mixta: {
    canal: 'MIXTA',
    ingresos_ventas: '800.00',
    egresos_compras: '100.00',
    egresos_gastos: '50.00',
    total_egresos: '150.00',
    flujo_neto: '650.00',
  },
  desglose_digital_ingresos: {
    yape: '200.00',
    plin: '100.00',
    transferencia: '0.00',
    tarjeta: '0.00',
    total: '300.00',
  },
  desglose_digital_compras: {
    yape: '0.00',
    plin: '0.00',
    transferencia: '0.00',
    tarjeta: '0.00',
    total: '0.00',
  },
  desglose_digital_gastos: {
    yape: '50.00',
    plin: '0.00',
    transferencia: '0.00',
    tarjeta: '0.00',
    total: '50.00',
  },
  ingresos_por_dominio: {
    planes: '500.00',
    productos: '200.00',
    amortizaciones: '100.00',
    total: '800.00',
  },
  gastos_por_categoria: [
    {
      categoria: 'ALQUILER',
      categoria_label: 'Alquiler de Local',
      monto: '50.00',
      porcentaje: '100.00',
    },
  ],
  indicadores_control: {
    total_creditos_pendientes: '180.00',
    cantidad_creditos_pendientes: 2,
    ventas_tachadas_pendientes_count: 1,
    monto_tachado_pendiente: '60.00',
    ventas_anuladas_definitivas_count: 3,
  },
};

const mockSuppliers: SupplierListItem[] = [
  {
    id: 1,
    tipo_proveedor: 'EMPRESA',
    persona_id: null,
    empresa_id: 1,
    tipo_documento: 'RUC',
    numero_documento: '20556677881',
    nombre_o_razon_social: 'Distribuidora Lima SAC',
    nombre_comercial: 'Lima Drinks',
    rubro_o_categoria: 'BEBIDAS',
    contacto_referencia: 'Juan Vendedor',
    telefono: '999888777',
    email: 'ventas@limadrinks.pe',
    estado_activo: true,
    created_at: '2026-11-10 10:00:00',
  },
];

const mockProducts: ProductListItem[] = [
  {
    id: 1,
    codigo_sku: 'PROD-AGUA-600',
    nombre: 'Agua Mineral 600ml',
    categoria: 'BEBIDAS',
    unidad_medida: 'UNIDAD',
    precio_compra_referencial: '1.20',
    precio_venta: '2.50',
    stock_actual: 25,
    stock_minimo: 5,
    alerta_stock_bajo: false,
    proveedor_preferido_id: 1,
    proveedor_nombre: 'Distribuidora Lima SAC',
    estado_activo: true,
    created_at: '2026-11-10 10:00:00',
    updated_at: '2026-11-10 10:00:00',
  },
];

const mockPurchases: SupplierPurchaseSummaryDto[] = [
  {
    id: 1,
    proveedor_id: 1,
    proveedor_nombre: 'Distribuidora Lima SAC',
    proveedor_documento: '20556677881',
    turno_caja_id: 5,
    tipo_comprobante: 'FACTURA',
    numero_comprobante: 'F001-0001',
    metodo_pago: 'EFECTIVO',
    canal_caja: 'FISICA',
    total_compra: '100.00',
    fecha_compra: '2026-11-15 09:30:00',
    registrado_por_username: 'admin',
    estado_activo: 1,
    motivo_anulacion: null,
    fecha_anulacion: null,
    created_at: '2026-11-15 09:30:00',
  },
];

const mockExpenses: OperationalExpenseDto[] = [
  {
    id: 10,
    categoria: 'ALQUILER',
    descripcion: 'Adelanto de alquiler del local central',
    monto: '50.00',
    metodo_pago: 'YAPE',
    canal_caja: 'DIGITAL',
    turno_caja_id: null,
    comprobante_referencia: 'Op 998877',
    fecha_gasto: '2026-11-15 10:00:00',
    notas: 'Mes de noviembre',
    registrado_por_username: 'admin',
    estado_activo: 1,
    created_at: '2026-11-15 10:00:00',
    updated_at: '2026-11-15 10:00:00',
  },
];

const mockStruckTray: StruckSaleTrayItemDto[] = [
  {
    id: 101,
    turno_caja_id: 5,
    turno_estado: 'ABIERTO',
    cliente_nombre_completo: 'Carlos Gómez',
    total_venta: '60.00',
    monto_pagado_efectivo: '60.00',
    monto_pagado_digital: '0.00',
    saldo_credito_generado: '0.00',
    estado_venta: 'TACHADA_EN_TURNO',
    usuario_vendedor_username: 'recep1',
    tachado_por_username: 'recep1',
    fecha_tachado: '2026-11-15 11:00:00',
    motivo_tachado: 'Cliente solicitó anulación por error de tipeo en producto',
    resuelto_por_admin_username: null,
    fecha_resolucion_tachado: null,
    nota_resolucion_tachado: null,
    created_at: '2026-11-15 10:45:00',
  },
  {
    id: 102,
    turno_caja_id: 4,
    turno_estado: 'CERRADO',
    cliente_nombre_completo: 'Maria Pérez',
    total_venta: '45.00',
    monto_pagado_efectivo: '0.00',
    monto_pagado_digital: '45.00',
    saldo_credito_generado: '0.00',
    estado_venta: 'ANULADA_DEFINITIVA',
    usuario_vendedor_username: 'recep2',
    tachado_por_username: 'recep2',
    fecha_tachado: '2026-11-14 16:00:00',
    motivo_tachado: 'Voucher Yape duplicado',
    resuelto_por_admin_username: 'admin',
    fecha_resolucion_tachado: '2026-11-14 18:00:00',
    nota_resolucion_tachado: 'Confirmado con extracto bancario',
    created_at: '2026-11-14 15:30:00',
  },
];

describe('Suite Frontend: Slice 7 - Compras a Proveedores, Gastos Operativos y Finanzas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Dashboard Financiero y Selector Triple (Física / Digital / Mixta)', () => {
    it('muestra inicialmente la Vista Mixta con balance consolidado y desgloses', () => {
      render(
        <FinanceView
          currentSession={adminSession}
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      // Título y navegación
      expect(screen.getByText('Compras, Gastos Operativos y Finanzas')).toBeDefined();

      // Métricas iniciales en MIXTA: Ingresos S/ 800.00, Compras S/ 100.00, Gastos S/ 50.00, Flujo Neto S/ 650.00
      expect(screen.getAllByText('S/ 800.00').length).toBeGreaterThan(0);
      expect(screen.getByText('S/ 650.00')).toBeDefined();

      // Dominios operativos
      expect(screen.getByText('Planes y Membresías')).toBeDefined();
      expect(screen.getAllByText('S/ 500.00').length).toBeGreaterThan(0);
      expect(screen.getByText('Productos Minimarket')).toBeDefined();
      expect(screen.getAllByText('S/ 200.00').length).toBeGreaterThan(0);
    });

    it('cambia dinámicamente los montos de KPI al alternar al canal Caja Física', () => {
      render(
        <FinanceView
          currentSession={adminSession}
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      // Clic en Vista Caja Física
      const fisicaButton = screen.getByText('Caja Física (Efectivo)');
      fireEvent.click(fisicaButton);

      // En FÍSICA: Ingresos S/ 500.00, Compras S/ 100.00, Gastos S/ 0.00, Flujo Neto S/ 400.00
      expect(screen.getAllByText('S/ 500.00').length).toBeGreaterThan(0);
      expect(screen.getByText('S/ 400.00')).toBeDefined();
    });

    it('cambia dinámicamente los montos de KPI al alternar al canal Caja Digital', () => {
      render(
        <FinanceView
          currentSession={adminSession}
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      // Clic en Vista Caja Digital
      const digitalButton = screen.getByText('Caja Digital (Bancos / Apps)');
      fireEvent.click(digitalButton);

      // En DIGITAL: Ingresos S/ 300.00, Gastos S/ 50.00, Flujo Neto S/ 250.00
      expect(screen.getAllByText('S/ 300.00').length).toBeGreaterThan(0);
      expect(screen.getByText('S/ 250.00')).toBeDefined();
      expect(screen.getByText('Desglose por Billeteras y Medios Digitales')).toBeDefined();
    });

    it('exporta el reporte PDF con rango vacío (historial acumulado) cuando no hay filtro de fechas aplicado', async () => {
      const mockedInvoke = vi.mocked(safeInvoke);
      mockedInvoke.mockResolvedValue({
        filename: 'reporte_financiero_acumulado.pdf',
        pdf_base64: btoa('%PDF-1.4'),
        size_bytes: 8,
        sha256_hash: 'abc',
      });
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
      globalThis.URL.revokeObjectURL = vi.fn();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      render(
        <FinanceView
          currentSession={adminSession}
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      const exportBtn = screen.getByRole('button', { name: /Exportar Reporte PDF \(RAM\)/i });
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith(
          'generate_financial_report_pdf',
          expect.objectContaining({
            fecha_desde: '',
            fecha_hasta: '',
            canal_filtro: 'MIXTA',
          })
        );
      });

      clickSpy.mockRestore();
    });
  });

  describe('2. Compras a Proveedores y Restricción de Anulación', () => {
    it('muestra el historial de compras y el botón de Anular habilitado para ADMINISTRADOR', () => {
      render(
        <FinanceView
          currentSession={adminSession}
          initialTab="compras"
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      expect(screen.getByText('Distribuidora Lima SAC')).toBeDefined();
      expect(screen.getByText('Factura')).toBeDefined();
      expect(screen.getByText('F001-0001')).toBeDefined();

      // Botón "Anular" visible y disponible para Administrador
      const anularBtn = screen.getByRole('button', { name: 'Anular' });
      expect(anularBtn).toBeDefined();

      // Al hacer clic, abre el modal de anulación con advertencia de Kardex
      fireEvent.click(anularBtn);
      expect(screen.getByText(/ADVERTENCIA DE CONTROL DE STOCK/i)).toBeDefined();
      expect(screen.getByText(/AJUSTE_NEGATIVO/i)).toBeDefined();
    });

    it('oculta el botón de Anular Compra para el rol SUPERVISOR (Exclusivo Admin)', () => {
      render(
        <FinanceView
          currentSession={supervisorSession}
          initialTab="compras"
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      // El supervisor puede ver la lista de compras y ver el detalle
      expect(screen.getByText('Distribuidora Lima SAC')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Ver Detalle' })).toBeDefined();

      // Pero el botón "Anular" NO debe existir
      expect(screen.queryByRole('button', { name: 'Anular' })).toBeNull();
    });

    it('abre el modal de registro de compra y valida campos obligatorios', () => {
      render(
        <FinanceView
          currentSession={adminSession}
          initialTab="compras"
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      const nuevaCompraBtn = screen.getByText('+ Registrar Compra a Proveedor');
      fireEvent.click(nuevaCompraBtn);

      expect(screen.getByText('Registrar Nueva Compra a Proveedor')).toBeDefined();
      expect(screen.getByText('Detalle de Productos a Comprar:')).toBeDefined();
    });
  });

  describe('3. Gastos Operativos y Blindaje RBAC para Supervisores', () => {
    it('permite al ADMINISTRADOR consultar y registrar gastos operativos', () => {
      render(
        <FinanceView
          currentSession={adminSession}
          initialTab="gastos"
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      expect(screen.getByText('Adelanto de alquiler del local central')).toBeDefined();
      expect(screen.getByText('+ Registrar Gasto Operativo')).toBeDefined();
      expect(screen.getByRole('button', { name: 'Desactivar' })).toBeDefined();
    });

    it('bloquea y muestra banner informativo con candado cuando un SUPERVISOR entra a Gastos Operativos', () => {
      render(
        <FinanceView
          currentSession={supervisorSession}
          initialTab="gastos"
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      // Muestra banner de módulo restringido
      expect(
        screen.getByText('Gastos Operativos (Módulo Exclusivo para Administrador)')
      ).toBeDefined();
      expect(
        screen.getByText(/Acceso Restringido a Supervisores y Recepcionistas/i)
      ).toBeDefined();
      // No muestra el botón de nuevo gasto
      expect(screen.queryByText('+ Registrar Gasto Operativo')).toBeNull();
    });
  });

  describe('4. Bandeja Global de Tachados (Paso 2)', () => {
    it('muestra las ventas tachadas con su motivo de tachado y estado del turno', () => {
      render(
        <FinanceView
          currentSession={adminSession}
          initialTab="tachados"
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      expect(screen.getByText('Carlos Gómez')).toBeDefined();
      expect(screen.getByText('Turno #5')).toBeDefined();
      expect(screen.getByText('ABIERTO')).toBeDefined();
      expect(
        screen.getByText(/"Cliente solicitó anulación por error de tipeo en producto"/i)
      ).toBeDefined();

      // Botón "Resolver (Paso 2)" para venta pendiente en turno abierto
      const resolverBtn = screen.getByRole('button', { name: /^Resolver \(Paso 2\)$/i });
      expect(resolverBtn).toBeDefined();
    });

    it('abre el modal de resolución Paso 2 permitiendo Confirmar o Revertir', () => {
      render(
        <FinanceView
          currentSession={adminSession}
          initialTab="tachados"
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      const resolverBtn = screen.getByRole('button', { name: /^Resolver \(Paso 2\)$/i });
      fireEvent.click(resolverBtn);

      expect(
        screen.getByText(/Resolución Definitiva de Venta Tachada #101/i)
      ).toBeDefined();
      expect(
        screen.getByText(/Confirmar Anulación Definitiva \(Ratificar Tachado\)/i)
      ).toBeDefined();
      expect(
        screen.getByText(/Revertir Tachado \(Restaurar Venta a COMPLETADA\)/i)
      ).toBeDefined();
    });

    it('para ventas ya auditadas en ANULADA_DEFINITIVA muestra la resolución del Admin', () => {
      render(
        <FinanceView
          currentSession={adminSession}
          initialTab="tachados"
          dashboard={mockDashboard}
          purchases={mockPurchases}
          expenses={mockExpenses}
          struckSalesTray={mockStruckTray}
          suppliers={mockSuppliers}
          products={mockProducts}
        />
      );

      expect(screen.getByText('Maria Pérez')).toBeDefined();
      expect(screen.getByText('Turno #4')).toBeDefined();
      expect(screen.getByText('CERRADO')).toBeDefined();
      expect(screen.getByText('ANULADA DEFINITIVA')).toBeDefined();
      expect(screen.getByText('@admin')).toBeDefined();
      expect(screen.getByText('Confirmado con extracto bancario')).toBeDefined();
    });
  });
});
