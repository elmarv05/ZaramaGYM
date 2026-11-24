// ============================================================================
// SUITE DE PRUEBAS FRONTEND: SLICE 4 (PUNTO DE VENTA, CAJA, CRÉDITOS Y TACHADOS)
// Verificación exhaustiva: Ciclo de Turnos, 3 Vistas de Caja, Carrito Multidominio,
// Split de Pagos, Flujo de Tachado en 2 Pasos y Cartera de Deudores
// Ubicación: src/__tests__/PosSlice4.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PosView } from '../features/pos/PosView';
import { AuthSession } from '../types/auth';
import { PlanListItem, ProductListItem } from '../types/catalog';
import { ClientListItem } from '../types/entity';
import { CashShiftDto, ClientCreditDto, SaleListItemDto } from '../types/pos';

// Mock de safeInvoke de Tauri IPC
vi.mock('../services/ipc/client', () => ({
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
  login_at: '2026-11-14 08:00:00',
};

const recepcionistaSession: AuthSession = {
  user_id: 3,
  persona_id: 3,
  username: 'recep1',
  nombre_completo: 'Ana Recepción',
  rol: 'RECEPCIONISTA',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-14 08:30:00',
};

const mockOpenShift: CashShiftDto = {
  id: 10,
  usuario_apertura_id: 1,
  usuario_apertura_username: 'admin',
  usuario_cierre_id: null,
  usuario_cierre_username: null,
  fecha_apertura: '2026-11-14 08:00:00',
  fecha_cierre: null,
  monto_apertura_fisico: '100.00',
  total_ventas_efectivo: '80.00',
  total_efectivo_esperado: '180.00',
  monto_cierre_fisico_declarado: null,
  diferencia_arqueo_fisico: null,
  total_ventas_digital: '120.00',
  desglose_digital: {
    yape: '70.00',
    plin: '30.00',
    transferencia: '20.00',
    tarjeta: '0.00',
  },
  estado: 'ABIERTO',
  notas_apertura: 'Fondo inicial para cambio',
  notas_cierre: null,
  created_at: '2026-11-14 08:00:00',
  updated_at: '2026-11-14 08:00:00',
};

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
    proveedor_preferido_id: null,
    proveedor_nombre: null,
    estado_activo: true,
    created_at: '2026-11-14 08:00:00',
    updated_at: '2026-11-14 08:00:00',
  },
  {
    id: 2,
    codigo_sku: 'PROD-PROT-VAIN',
    nombre: 'Proteína Whey Vainilla 1kg',
    categoria: 'SUPLEMENTOS',
    unidad_medida: 'UNIDAD',
    precio_compra_referencial: '80.00',
    precio_venta: '130.00',
    stock_actual: 8,
    stock_minimo: 2,
    alerta_stock_bajo: false,
    proveedor_preferido_id: null,
    proveedor_nombre: null,
    estado_activo: true,
    created_at: '2026-11-14 08:00:00',
    updated_at: '2026-11-14 08:00:00',
  },
];

const mockPlans: PlanListItem[] = [
  {
    id: 1,
    codigo: 'PLAN-MENSUAL',
    nombre: 'Plan Mensual Completo',
    descripcion: 'Acceso total por 1 mes',
    tipo_plan: 'MENSUALIDAD',
    duracion_meses: 1,
    precio_base: '90.00',
    permite_recuperacion_dias: true,
    estado_activo: true,
    created_at: '2026-11-14 08:00:00',
    updated_at: '2026-11-14 08:00:00',
  },
];

const mockClients: ClientListItem[] = [
  {
    id: 5,
    persona_id: 5,
    nombres: 'Juan',
    apellidos: 'Pérez García',
    tipo_documento: 'DNI',
    numero_documento: '44556677',
    telefono: '998877665',
    email: 'juan.perez@example.com',
    codigo_qr_token: 'ZG-QR-JUAN-PEREZ',
    peso_actual_kg: '78.50',
    estado_activo: true,
    created_at: '2026-11-14 08:00:00',
  },
];

const mockSales: SaleListItemDto[] = [
  {
    id: 101,
    turno_caja_id: 10,
    cliente_nombre_completo: 'Juan Pérez García',
    total_venta: '90.00',
    monto_pagado_efectivo: '90.00',
    monto_pagado_digital: '0.00',
    saldo_credito_generado: '0.00',
    estado_venta: 'COMPLETADA',
    usuario_vendedor_username: 'recep1',
    created_at: '2026-11-14 09:30:00',
  },
  {
    id: 102,
    turno_caja_id: 10,
    cliente_nombre_completo: 'Público General',
    total_venta: '2.50',
    monto_pagado_efectivo: '2.50',
    monto_pagado_digital: '0.00',
    saldo_credito_generado: '0.00',
    estado_venta: 'TACHADA_EN_TURNO',
    usuario_vendedor_username: 'recep1',
    created_at: '2026-11-14 10:15:00',
  },
];

const mockCredits: ClientCreditDto[] = [
  {
    id: 201,
    cliente_id: 5,
    cliente_nombre_completo: 'Juan Pérez García',
    cliente_numero_documento: '44556677',
    cliente_telefono: '998877665',
    venta_origen_id: 100,
    origen_credito: 'MEMBRESIA_PAGO_PARCIAL',
    descripcion: 'Saldo pendiente por Plan Trimestral',
    monto_total: '240.00',
    monto_pagado: '150.00',
    saldo_pendiente: '90.00',
    estado: 'PENDIENTE',
    registrado_por_usuario_id: 1,
    registrado_por_username: 'admin',
    fecha_emision: '2026-11-10 10:00:00',
    fecha_ultimo_pago: null,
    notas: 'Promesa de pago a fin de mes',
    created_at: '2026-11-10 10:00:00',
  },
];

describe('Suite Frontend: Slice 4 - Punto de Venta, Caja, Créditos y Tachados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 1. CICLO DE TURNO DE CAJA (APERTURA, ARQUEO Y CIERRE)
  // ==========================================================================
  describe('1. Ciclo de Turno de Caja y Arqueo Físico', () => {
    it('muestra alerta ámbar de caja cerrada cuando no hay turno activo y permite abrir modal', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          activeShift={null}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={[]}
          credits={[]}
        />
      );

      // Alerta visible
      expect(
        screen.getByText(/Caja Cerrada — Abre un turno para operar el Punto de Venta/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Sin Turno Activo/i)).toBeInTheDocument();

      // Botón de abrir turno
      const openBtn = screen.getByRole('button', { name: /Abrir Turno de Caja/i });
      expect(openBtn).toBeInTheDocument();

      // Abrir modal
      fireEvent.click(openBtn);
      expect(screen.getByText(/Apertura de Turno de Caja/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Fondo Inicial en Efectivo/i)).toBeInTheDocument();
    });

    it('cuando hay turno abierto muestra badge verde, saldos en gaveta y botón de cierre', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={mockSales}
          credits={mockCredits}
        />
      );

      // Turno activo
      expect(screen.getByText(/Turno #10 Abierto/i)).toBeInTheDocument();
      expect(screen.getByText(/Caja Activa/i)).toBeInTheDocument();
      expect(screen.getAllByText(/S\/ 180.00/i).length).toBeGreaterThanOrEqual(1); // Efectivo esperado

      // Botón de cierre
      const closeBtn = screen.getByRole('button', { name: /Arqueo y Cierre de Caja/i });
      expect(closeBtn).toBeInTheDocument();

      // Abrir modal de arqueo
      fireEvent.click(closeBtn);
      expect(screen.getByText(/Arqueo Físico y Cierre de Turno de Caja/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Efectivo Físico Contado en Gaveta/i)).toBeInTheDocument();
      // Cuadre exacto inicial
      expect(screen.getByText(/Cuadre Exacto/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 2. SELECTOR DE LAS 3 VISTAS DE CAJA (FÍSICA, DIGITAL, CONSOLIDADA)
  // ==========================================================================
  describe('2. Selector de 3 Vistas de Caja', () => {
    it('alterna correctamente entre Caja Física, Digital y Vista Mixta', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={mockSales}
          credits={mockCredits}
        />
      );

      // Por defecto arranca en Caja Física
      expect(screen.getByText(/Panel de Caja Física \(Gaveta\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Billetes y monedas iniciales/i)).toBeInTheDocument();

      // Cambiar a Caja Digital
      const digitalBtn = screen.getByRole('button', { name: /Caja Digital/i });
      fireEvent.click(digitalBtn);

      expect(screen.getByText(/Panel de Caja Digital \(Vouchers\)/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Yape/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/S\/ 70.00/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Plin/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/S\/ 30.00/i).length).toBeGreaterThanOrEqual(1);

      // Cambiar a Vista Mixta / Consolidada
      const mixtaBtn = screen.getByRole('button', { name: /Vista Mixta/i });
      fireEvent.click(mixtaBtn);

      expect(screen.getByText(/Vista Consolidada y Métricas Financieras/i)).toBeInTheDocument();
      expect(screen.getByText(/Recaudación Físico/i)).toBeInTheDocument();
      expect(screen.getByText(/Recaudación Digital/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Consolidado/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 3. CARRITO POS MULTIDOMINIO Y VISIBILIDAD "CASO JUAN PÉREZ"
  // ==========================================================================
  describe('3. Carrito POS Multidominio y Búsqueda de Clientes', () => {
    it('permite buscar y seleccionar a un cliente registrado (Caso Juan Pérez)', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={[]}
          credits={mockCredits}
        />
      );

      // Escribir en el buscador de cliente
      const searchInput = screen.getByPlaceholderText(/Buscar por Apellidos, Nombres, DNI o QR/i);
      fireEvent.change(searchInput, { target: { value: 'Juan' } });

      // Aparece resultado flotante
      await waitFor(() => {
        expect(screen.getByText(/Juan Pérez García/i)).toBeInTheDocument();
      });

      // Seleccionar cliente
      const selectBtn = screen.getByText('Seleccionar');
      fireEvent.click(selectBtn);

      // Ahora aparece identificado con badge verde
      expect(screen.getByText(/Identificado/i)).toBeInTheDocument();
      expect(screen.getByText(/DNI: 44556677/i)).toBeInTheDocument();

      // Muestra alerta si tiene deudas pendientes
      expect(screen.getByText(/Este socio tiene 1 deuda\(s\) pendiente\(s\):/i)).toBeInTheDocument();
      expect(screen.getByText(/Saldo pendiente por Plan Trimestral/i)).toBeInTheDocument();
    });

    it('agrega productos al carrito y actualiza subtotales y total a pagar', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={[]}
          credits={[]}
        />
      );

      // El carrito empieza vacío
      expect(screen.getByText(/El carrito está vacío/i)).toBeInTheDocument();

      // Agregar Agua Mineral (S/ 2.50)
      const addBtns = screen.getAllByRole('button', { name: /\+ Agregar/i });
      fireEvent.click(addBtns[0]);

      // El carrito ahora tiene 1 ítem
      expect(screen.getByText(/Carrito de Compra \(1 ítem\)/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Agua Mineral 600ml/i).length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(/S\/ 2.50/i).length).toBeGreaterThanOrEqual(1);
    });

    it('permite inscribir planes de membresía con fecha de inicio proyectada', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={[]}
          credits={[]}
        />
      );

      // Cambiar catálogo a Planes
      const planesTab = screen.getByRole('button', { name: /Planes & Pases/i });
      fireEvent.click(planesTab);

      expect(screen.getByText(/Plan Mensual Completo/i)).toBeInTheDocument();

      // Inscribir plan
      const enrollBtn = screen.getByRole('button', { name: /\+ Inscribir/i });
      fireEvent.click(enrollBtn);

      // Carrito contiene el plan
      expect(screen.getByText(/Plan Mensual Completo \(PLAN-MENSUAL\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Plan Membresía/i)).toBeInTheDocument();
      expect(screen.getAllByText(/S\/ 90.00/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // 4. SPLIT DE PAGOS, VUELTO Y CRÉDITO AUTOMÁTICO
  // ==========================================================================
  describe('4. Panel de Pagos Mixtos y Crédito Automático', () => {
    it('calcula vuelto reactivo cuando el efectivo entregado supera el total', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={[]}
          credits={[]}
        />
      );

      // Agregar Agua Mineral (S/ 2.50)
      const addBtn = screen.getAllByRole('button', { name: /\+ Agregar/i })[0];
      fireEvent.click(addBtn);

      // Pagar con billete de S/ 10.00 en efectivo
      const cashInput = screen.getByLabelText(/Monto en Efectivo en Gaveta/i);
      fireEvent.change(cashInput, { target: { value: '10.00' } });

      // Vuelto calculado = S/ 7.50
      await waitFor(() => {
        expect(screen.getAllByText(/Vuelto: S\/ 7.50/i).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('alerta cuando se realiza pago parcial y no se ha identificado a un cliente', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={[]}
          credits={[]}
        />
      );

      // Agregar Proteína (S/ 130.00)
      const addBtn = screen.getAllByRole('button', { name: /\+ Agregar/i })[1];
      fireEvent.click(addBtn);

      // Pagar solo S/ 50.00 en efectivo
      const cashInput = screen.getByLabelText(/Monto en Efectivo en Gaveta/i);
      fireEvent.change(cashInput, { target: { value: '50.00' } });

      // Muestra advertencia de que el pago parcial requiere cliente para crédito
      await waitFor(() => {
        expect(
          screen.getByText(/El pago parcial generará una deuda por/i)
        ).toBeInTheDocument();
        expect(screen.getAllByText(/S\/ 80.00/i).length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ==========================================================================
  // 5. VENTAS DEL TURNO Y TACHADO PASO 1
  // ==========================================================================
  describe('5. Ventas del Turno y Tachado Paso 1 (strike_sale)', () => {
    it('en la pestaña de ventas permite ver el detalle del comprobante', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          initialTab="ventas"
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={mockSales}
          credits={[]}
        />
      );

      // Lista de ventas presente
      expect(screen.getByText(/Registro de Ventas del Turno/i)).toBeInTheDocument();
      expect(screen.getByText('#101')).toBeInTheDocument();
      expect(screen.getByText('#102')).toBeInTheDocument();

      // Botón Ver Detalle
      const detailBtns = screen.getAllByRole('button', { name: /Ver Detalle/i });
      expect(detailBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('abre modal de tachado Paso 1 y valida motivo >= 5 caracteres', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          initialTab="ventas"
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={mockSales}
          credits={[]}
        />
      );

      // Venta #101 es COMPLETADA en turno abierto -> Botón Tachar habilitado
      const strikeBtn = screen.getByRole('button', { name: /^Tachar$/i });
      expect(strikeBtn).toBeInTheDocument();

      fireEvent.click(strikeBtn);

      // Modal abierto
      expect(screen.getByText(/Tachar Venta #101/i)).toBeInTheDocument();
      expect(screen.getByText(/Efectos Inmediatos del Tachado en Caja/i)).toBeInTheDocument();

      const textarea = screen.getByLabelText(/Motivo Obligatorio del Tachado/i);
      const confirmBtn = screen.getByRole('button', { name: /Confirmar Tachado/i });

      // Botón deshabilitado con menos de 5 caracteres
      fireEvent.change(textarea, { target: { value: 'err' } });
      expect(confirmBtn).toBeDisabled();

      // Botón habilitado con motivo válido
      fireEvent.change(textarea, { target: { value: 'Error en cobro de efectivo' } });
      expect(confirmBtn).not.toBeDisabled();
    });
  });

  // ==========================================================================
  // 6. BANDEJA DE AUDITORÍA ADMIN: RESOLUCIÓN DE TACHADOS PASO 2
  // ==========================================================================
  describe('6. Bandeja Admin: Resolución de Tachados Paso 2', () => {
    it('para rol ADMINISTRADOR habilita botón para dictaminar sobre ventas tachadas', async () => {
      render(
        <PosView
          currentSession={adminSession}
          initialTab="tachados_admin"
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={mockSales}
          credits={[]}
        />
      );

      // Badge Admin
      expect(screen.getByText(/Acceso Administrador/i)).toBeInTheDocument();

      // Venta #102 está TACHADA_EN_TURNO
      expect(screen.getByText('#102')).toBeInTheDocument();

      // Botón Resolver disponible para Admin
      const resolveBtn = screen.getByRole('button', { name: /^Resolver$/i });
      expect(resolveBtn).toBeInTheDocument();

      // Abrir modal de resolución
      fireEvent.click(resolveBtn);
      expect(
        screen.getByText(/Bandeja Admin: Resolución de Venta #102/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Confirmar Anulación Definitiva/i)).toBeInTheDocument();
      expect(screen.getByText(/Revertir Tachado \(Reactivar Venta\)/i)).toBeInTheDocument();
    });

    it('para rol RECEPCIONISTA restringe acciones de resolución y muestra estado informativo', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          initialTab="tachados_admin"
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={mockSales}
          credits={[]}
        />
      );

      // Modo informativo
      expect(screen.getByText(/Modo Informativo/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Solo los usuarios con rol/i)
      ).toBeInTheDocument();

      // No debe existir el botón Resolver
      expect(
        screen.queryByRole('button', { name: /^Resolver$/i })
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Pendiente de Admin/i)).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 7. BANDEJA DE DEUDORES Y AMORTIZACIÓN EN POS
  // ==========================================================================
  describe('7. Cartera de Deudores y Amortización Rápida en POS', () => {
    it('muestra lista de créditos pendientes y botón para amortizar directamente en POS', async () => {
      render(
        <PosView
          currentSession={recepcionistaSession}
          initialTab="deudores"
          activeShift={mockOpenShift}
          products={mockProducts}
          plans={mockPlans}
          clients={mockClients}
          sales={[]}
          credits={mockCredits}
        />
      );

      // Tabla de deudores
      expect(screen.getByText(/Cartera de Cuentas por Cobrar/i)).toBeInTheDocument();
      expect(screen.getByText(/Juan Pérez García/i)).toBeInTheDocument();
      expect(screen.getAllByText(/S\/ 90.00/i).length).toBeGreaterThanOrEqual(1); // Saldo pendiente
      expect(screen.getByText(/Membresía Parcial/i)).toBeInTheDocument();

      // Botón Amortizar en POS
      const amortizeBtn = screen.getByRole('button', { name: /Amortizar en POS/i });
      expect(amortizeBtn).toBeInTheDocument();

      // Al pulsar, cambia automáticamente a la pestaña de POS
      fireEvent.click(amortizeBtn);

      await waitFor(() => {
        expect(screen.getByText(/^Punto de Venta$/i)).toBeInTheDocument();
      });
    });
  });
});
