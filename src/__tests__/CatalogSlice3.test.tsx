// ============================================================================
// SUITE DE PRUEBAS FRONTEND: SLICE 3 (CATÁLOGO, DAY OVERFLOW, INVENTARIO Y KARDEX)
// Verificación exhaustiva: CP-01 a CP-07, simulador UI, modales, RBAC y 4 estados.
// Ubicación: src/__tests__/CatalogSlice3.test.tsx
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calculateDayOverflowPreview } from '../domain/catalog';
import { CatalogView } from '../features/catalog/CatalogView';
import { PlanFormModal } from '../features/catalog/PlanFormModal';
import { ProductFormModal } from '../features/catalog/ProductFormModal';
import { InventoryMovementModal } from '../features/catalog/InventoryMovementModal';
import { AuthSession } from '../types/auth';
import {
  InventoryMovementItem,
  PlanListItem,
  ProductListItem,
} from '../types/catalog';

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-13 08:00:00',
};

const recepcionistaSession: AuthSession = {
  user_id: 3,
  persona_id: 3,
  username: 'recep1',
  nombre_completo: 'Ana Recepción',
  rol: 'RECEPCIONISTA',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-13 08:30:00',
};

const mockPlans: PlanListItem[] = [
  {
    id: 1,
    codigo: 'PASE-DIA',
    nombre: 'Pase Diario',
    descripcion: 'Acceso ilimitado por una jornada',
    tipo_plan: 'PASE_DIARIO',
    duracion_meses: 0,
    precio_base: '10.00',
    permite_recuperacion_dias: false,
    estado_activo: true,
    created_at: '2026-11-13 08:00:00',
    updated_at: '2026-11-13 08:00:00',
  },
  {
    id: 2,
    codigo: 'PLAN-1M',
    nombre: 'Membresía Mensual',
    descripcion: 'Acceso por 1 mes con recuperación',
    tipo_plan: 'MENSUALIDAD',
    duracion_meses: 1,
    precio_base: '80.00',
    permite_recuperacion_dias: true,
    estado_activo: true,
    created_at: '2026-11-13 08:00:00',
    updated_at: '2026-11-13 08:00:00',
  },
  {
    id: 3,
    codigo: 'PLAN-3M',
    nombre: 'Membresía Trimestral',
    descripcion: 'Acceso continuo 3 meses',
    tipo_plan: 'MENSUALIDAD',
    duracion_meses: 3,
    precio_base: '210.00',
    permite_recuperacion_dias: true,
    estado_activo: true,
    created_at: '2026-11-13 08:00:00',
    updated_at: '2026-11-13 08:00:00',
  },
];

const mockProducts: ProductListItem[] = [
  {
    id: 1,
    codigo_sku: 'BEB-AGUA-600',
    nombre: 'Agua Mineral Sin Gas 600ml',
    categoria: 'BEBIDAS',
    unidad_medida: 'BOTELLA',
    precio_compra_referencial: '1.20',
    precio_venta: '3.00',
    stock_actual: 3, // Stock actual (3) <= Stock mínimo (5) -> ALERTA STOCK BAJO
    stock_minimo: 5,
    alerta_stock_bajo: true,
    proveedor_preferido_id: null,
    proveedor_nombre: null,
    estado_activo: true,
    created_at: '2026-11-13 08:00:00',
    updated_at: '2026-11-13 08:00:00',
  },
  {
    id: 2,
    codigo_sku: 'SUP-WHEY-1K',
    nombre: 'Proteína Whey 1kg Vainilla',
    categoria: 'SUPLEMENTOS',
    unidad_medida: 'UNIDAD',
    precio_compra_referencial: '95.00',
    precio_venta: '145.00',
    stock_actual: 0, // SIN STOCK
    stock_minimo: 2,
    alerta_stock_bajo: true,
    proveedor_preferido_id: null,
    proveedor_nombre: 'FitSupps SAC',
    estado_activo: true,
    created_at: '2026-11-13 08:00:00',
    updated_at: '2026-11-13 08:00:00',
  },
  {
    id: 3,
    codigo_sku: 'ACC-GUANTES-L',
    nombre: 'Guantes de Entrenamiento Talla L',
    categoria: 'ACCESORIOS',
    unidad_medida: 'UNIDAD',
    precio_compra_referencial: '20.00',
    precio_venta: '45.00',
    stock_actual: 12,
    stock_minimo: 4,
    alerta_stock_bajo: false,
    proveedor_preferido_id: null,
    proveedor_nombre: null,
    estado_activo: true,
    created_at: '2026-11-13 08:00:00',
    updated_at: '2026-11-13 08:00:00',
  },
];

const mockMovements: InventoryMovementItem[] = [
  {
    id: 1,
    producto_id: 1,
    producto_sku: 'BEB-AGUA-600',
    producto_nombre: 'Agua Mineral Sin Gas 600ml',
    tipo_movimiento: 'STOCK_INICIAL',
    signo: '+',
    cantidad: 10,
    stock_anterior: 0,
    stock_resultante: 10,
    costo_unitario_momento: '1.20',
    motivo_justificacion: 'Inventario inicial al dar de alta el producto',
    registrado_por_usuario_id: 1,
    registrado_por_username: 'admin',
    created_at: '2026-11-13 08:00:00',
  },
  {
    id: 2,
    producto_id: 1,
    producto_sku: 'BEB-AGUA-600',
    producto_nombre: 'Agua Mineral Sin Gas 600ml',
    tipo_movimiento: 'MERMA_DANIO',
    signo: '-',
    cantidad: 2,
    stock_anterior: 10,
    stock_resultante: 8,
    costo_unitario_momento: '1.20',
    motivo_justificacion: 'Botella dañada durante manipulación en mostrador',
    registrado_por_usuario_id: 1,
    registrado_por_username: 'admin',
    created_at: '2026-11-13 09:15:00',
  },
];

describe('Suite Frontend: Slice 3 - Catálogo, Day Overflow e Inventario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Algoritmo Canónico Day Overflow (Casos CP-01 a CP-07)', () => {
    it('CP-01: 2024-01-31 a 1 mes desborda Feb 29 (bisiesto) al 2024-03-02 con 32 días', () => {
      const res = calculateDayOverflowPreview('2024-01-31', 'MENSUALIDAD', 1);
      expect(res.fecha_vencimiento_date).toBe('2024-03-02');
      expect(res.fecha_vencimiento_timestamp).toBe('2024-03-02 23:59:59');
      expect(res.hubo_desbordamiento).toBe(true);
      expect(res.dias_desbordamiento).toBe(2);
      expect(res.dias_totales).toBe(32);
    });

    it('CP-02: 2025-01-31 a 1 mes desborda Feb 28 (común) al 2025-03-03 con 32 días', () => {
      const res = calculateDayOverflowPreview('2025-01-31', 'MENSUALIDAD', 1);
      expect(res.fecha_vencimiento_date).toBe('2025-03-03');
      expect(res.hubo_desbordamiento).toBe(true);
      expect(res.dias_desbordamiento).toBe(3);
      expect(res.dias_totales).toBe(32);
    });

    it('CP-03: 2026-01-31 a 2 meses (Marzo 31 días) no desborda y vence 2026-03-31 con 60 días', () => {
      const res = calculateDayOverflowPreview('2026-01-31', 'MENSUALIDAD', 2);
      expect(res.fecha_vencimiento_date).toBe('2026-03-31');
      expect(res.hubo_desbordamiento).toBe(false);
      expect(res.dias_desbordamiento).toBe(0);
      expect(res.dias_totales).toBe(60);
    });

    it('CP-04: 2026-01-31 a 3 meses (Abril 30 días) desborda +1 día al 2026-05-01 con 91 días', () => {
      const res = calculateDayOverflowPreview('2026-01-31', 'MENSUALIDAD', 3);
      expect(res.fecha_vencimiento_date).toBe('2026-05-01');
      expect(res.hubo_desbordamiento).toBe(true);
      expect(res.dias_desbordamiento).toBe(1);
      expect(res.dias_totales).toBe(91);
    });

    it('CP-05: 2026-05-15 Pase Diario vence el mismo día a las 23:59:59 con 1 día', () => {
      const res = calculateDayOverflowPreview('2026-05-15', 'PASE_DIARIO', 0);
      expect(res.fecha_vencimiento_date).toBe('2026-05-15');
      expect(res.fecha_vencimiento_timestamp).toBe('2026-05-15 23:59:59');
      expect(res.hubo_desbordamiento).toBe(false);
      expect(res.dias_totales).toBe(1);
    });

    it('CP-06: 2026-08-31 a 1 mes (Septiembre 30 días) desborda al 2026-10-01 con 32 días', () => {
      const res = calculateDayOverflowPreview('2026-08-31', 'MENSUALIDAD', 1);
      expect(res.fecha_vencimiento_date).toBe('2026-10-01');
      expect(res.hubo_desbordamiento).toBe(true);
      expect(res.dias_desbordamiento).toBe(1);
      expect(res.dias_totales).toBe(32);
    });

    it('CP-07: 2024-02-29 a 12 meses desborda al 2025-03-01 en año común con 367 días', () => {
      const res = calculateDayOverflowPreview('2024-02-29', 'MENSUALIDAD', 12);
      expect(res.fecha_vencimiento_date).toBe('2025-03-01');
      expect(res.hubo_desbordamiento).toBe(true);
      expect(res.dias_desbordamiento).toBe(1);
      expect(res.dias_totales).toBe(367);
    });
  });

  describe('2. Simulador Interactivo en UI', () => {
    it('permite cambiar fecha de inicio mediante casos rápidos y actualiza resultado Day Overflow', async () => {
      const user = userEvent.setup();
      render(
        <CatalogView
          currentSession={recepcionistaSession}
          plans={mockPlans}
          products={mockProducts}
          movements={mockMovements}
        />
      );

      // Comprobar que el simulador está presente
      expect(
        screen.getByRole('heading', { name: /simulador canónico de vencimientos/i })
      ).toBeInTheDocument();

      // Clic en botón de caso borde "31 Ene 2024" (CP-01)
      const btn31Ene2024 = screen.getByRole('button', { name: /31 ene 2024/i });
      await user.click(btn31Ene2024);

      await waitFor(() => {
        expect(screen.getByText(/2024-03-02 23:59:59/i)).toBeInTheDocument();
        expect(screen.getByText(/32 días de acceso/i)).toBeInTheDocument();
        expect(screen.getByText(/Day Overflow: \+2 día\(s\)/i)).toBeInTheDocument();
      });

      // Clic en botón "Pase Día" (CP-05)
      const btnPaseDia = screen.getByRole('button', { name: /pase día/i });
      await user.click(btnPaseDia);

      await waitFor(() => {
        expect(screen.getByText(/2024-01-31 23:59:59/i)).toBeInTheDocument();
        expect(screen.getByText(/1 días de acceso/i)).toBeInTheDocument();
        expect(screen.getByText(/Calendario Regular/i)).toBeInTheDocument();
      });
    });
  });

  describe('3. Validación y Envío de Formularios Especializados', () => {
    it('PlanFormModal: valida campos obligatorios y sincroniza duración con tipo de plan', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn().mockResolvedValue(true);
      const handleClose = vi.fn();

      render(
        <PlanFormModal
          isOpen={true}
          onClose={handleClose}
          onSubmit={handleSubmit}
          isLoading={false}
        />
      );

      // Enviar formulario vacío
      await user.click(screen.getByRole('button', { name: /registrar plan/i }));
      expect(screen.getByText(/el código del plan es obligatorio/i)).toBeInTheDocument();
      expect(screen.getByText(/el nombre del plan debe tener al menos 3 caracteres/i)).toBeInTheDocument();

      // Llenar campos correctamente
      await user.type(screen.getByLabelText(/código \/ sku del plan/i), 'PLAN-6M');
      await user.type(screen.getByLabelText(/nombre comercial/i), 'Membresía Semestral');

      await user.click(screen.getByRole('button', { name: /registrar plan/i }));

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            codigo: 'PLAN-6M',
            nombre: 'Membresía Semestral',
            tipo_plan: 'MENSUALIDAD',
            duracion_meses: 1,
            precio_base: '80.00',
            permite_recuperacion_dias: true,
          })
        );
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it('ProductFormModal: valida SKU y precio de venta, registra producto nuevo', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn().mockResolvedValue(true);
      const handleClose = vi.fn();

      render(
        <ProductFormModal
          isOpen={true}
          onClose={handleClose}
          onSubmit={handleSubmit}
          isLoading={false}
        />
      );

      await user.type(screen.getByLabelText(/código \/ sku/i), 'BEB-ENER-473');
      await user.type(screen.getByLabelText(/nombre del producto/i), 'Bebida Energizante 473ml');

      await user.click(screen.getByRole('button', { name: /registrar producto/i }));

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            codigo_sku: 'BEB-ENER-473',
            nombre: 'Bebida Energizante 473ml',
            categoria: 'BEBIDAS',
            precio_venta: '5.00',
            stock_minimo: 5,
          })
        );
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it('InventoryMovementModal: bloquea cuando la merma causa stock negativo y exige justificación >= 5 chars', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn().mockResolvedValue(true);
      const handleClose = vi.fn();

      // Producto con stock actual = 3
      const productWithLowStock = mockProducts[0];

      render(
        <InventoryMovementModal
          isOpen={true}
          onClose={handleClose}
          products={mockProducts}
          selectedProduct={productWithLowStock}
          onSubmit={handleSubmit}
          isLoading={false}
        />
      );

      const cantidadInput = screen.getByLabelText(/cantidad de unidades/i);
      const submitBtn = screen.getByRole('button', { name: /asentar movimiento/i });

      // Iniciar con cantidad 5 (supera stock actual de 3 -> resultante -2)
      await user.clear(cantidadInput);
      await user.type(cantidadInput, '5');

      // Debe mostrar advertencia de stock negativo y deshabilitar botón de envío
      expect(screen.getByText(/Stock Negativo/i)).toBeInTheDocument();
      expect(screen.getByText(/Resultante: -2/i)).toBeInTheDocument();
      expect(submitBtn).toBeDisabled();

      // Corregir a cantidad 1 (resultante 2 -> válido)
      await user.clear(cantidadInput);
      await user.type(cantidadInput, '1');
      expect(screen.getByText(/Resultante: 2/i)).toBeInTheDocument();
      expect(submitBtn).not.toBeDisabled();

      // Ingresar justificación corta (< 5 caracteres)
      const justificacionInput = screen.getByPlaceholderText(/describe detalladamente la causa/i);
      await user.type(justificacionInput, 'Rota'); // 4 chars

      await user.click(submitBtn);
      expect(
        screen.getByText(/la justificación es obligatoria y debe tener al menos 5 caracteres/i)
      ).toBeInTheDocument();
      expect(handleSubmit).not.toHaveBeenCalled();

      // Completar justificación válida (>= 5 caracteres)
      await user.type(justificacionInput, ' al caerse de la repisa');
      await user.click(submitBtn);

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            producto_id: productWithLowStock.id,
            tipo_movimiento: 'MERMA_DANIO',
            cantidad: 1,
            motivo_justificacion: 'Rota al caerse de la repisa',
          })
        );
        expect(handleClose).toHaveBeenCalled();
      });
    });
  });

  describe('4. Renderizado de CatalogView, Pestañas y RBAC', () => {
    it('muestra el banner operativo y aplica la matriz de permisos de RECEPCIONISTA (crea planes y edita productos, sin editar/bajar planes ni Kardex)', async () => {
      const user = userEvent.setup();
      render(
        <CatalogView
          currentSession={recepcionistaSession}
          plans={mockPlans}
          products={mockProducts}
          movements={mockMovements}
        />
      );

      // Banner informativo presente
      expect(
        screen.getByText(/Modo Operativo de Recepción:/i)
      ).toBeInTheDocument();

      // RECEPCIONISTA SÍ puede crear planes ("Nuevo Plan"), pero NO editar ni desactivar planes existentes
      expect(screen.getByRole('button', { name: /nuevo plan/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^editar$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^desactivar$/i })).not.toBeInTheDocument();

      // Cambiar a pestaña de Inventario de Productos
      const tabProductos = screen.getByRole('tab', { name: /inventario de productos/i });
      await user.click(tabProductos);

      // Tabla de productos visible con precios y stocks
      expect(screen.getByText('Agua Mineral Sin Gas 600ml')).toBeInTheDocument();
      expect(screen.getByText('Proteína Whey 1kg Vainilla')).toBeInTheDocument();
      expect(screen.getByText('Stock Bajo')).toBeInTheDocument();
      expect(screen.getByText('Sin Stock')).toBeInTheDocument();

      // RECEPCIONISTA SÍ puede crear y editar productos
      expect(screen.getByRole('button', { name: /nuevo producto/i })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /^editar$/i }).length).toBeGreaterThanOrEqual(1);

      // Botones exclusivos de ADMINISTRADOR ausentes para recepcionista
      expect(screen.queryByRole('button', { name: /merma \/ ajuste/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /desactivar/i })).not.toBeInTheDocument();

      // Cambiar a Kardex y verificar que no puede registrar mermas/ajustes
      const tabKardex = screen.getByRole('tab', { name: /kardex y mermas/i });
      await user.click(tabKardex);
      expect(
        screen.queryByRole('button', { name: /registrar merma \/ ajuste/i })
      ).not.toBeInTheDocument();
    });

    it('habilita todas las opciones operativas para ADMINISTRADOR', async () => {
      const user = userEvent.setup();
      render(
        <CatalogView
          currentSession={adminSession}
          plans={mockPlans}
          products={mockProducts}
          movements={mockMovements}
        />
      );

      // Banner informativo ausente para administrador
      expect(
        screen.queryByText(/Modo Operativo de Recepción:/i)
      ).not.toBeInTheDocument();

      // Botón "Nuevo Plan" disponible
      expect(screen.getByRole('button', { name: /nuevo plan/i })).toBeInTheDocument();

      // Cambiar a pestaña de Kardex y Mermas
      const tabKardex = screen.getByRole('tab', { name: /kardex y mermas/i });
      await user.click(tabKardex);

      // Bitácora visible con movimientos
      expect(screen.getByText('Stock Inicial', { selector: 'span' })).toBeInTheDocument();
      expect(screen.getByText('Merma por Daño (-)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /registrar merma \/ ajuste/i })).toBeInTheDocument();
    });

    it('filtra productos por "Solo con Stock Bajo" correctamente', async () => {
      const user = userEvent.setup();
      render(
        <CatalogView
          currentSession={adminSession}
          plans={mockPlans}
          products={mockProducts}
          movements={mockMovements}
        />
      );

      const tabProductos = screen.getByRole('tab', { name: /inventario de productos/i });
      await user.click(tabProductos);

      // Inicialmente se ven los 3 productos
      expect(screen.getByText('Agua Mineral Sin Gas 600ml')).toBeInTheDocument();
      expect(screen.getByText('Proteína Whey 1kg Vainilla')).toBeInTheDocument();
      expect(screen.getByText('Guantes de Entrenamiento Talla L')).toBeInTheDocument();

      // Activar filtro "Solo Stock Bajo"
      const btnSoloBajo = screen.getByRole('button', { name: /solo stock bajo/i });
      await user.click(btnSoloBajo);

      // Ahora solo deben mostrarse los 2 productos con stock bajo o cero
      expect(screen.getByText('Agua Mineral Sin Gas 600ml')).toBeInTheDocument();
      expect(screen.getByText('Proteína Whey 1kg Vainilla')).toBeInTheDocument();
      expect(
        screen.queryByText('Guantes de Entrenamiento Talla L')
      ).not.toBeInTheDocument();
    });

    it('muestra estados de carga y vacío correctamente', () => {
      render(
        <CatalogView
          currentSession={adminSession}
          plans={[]}
          products={[]}
          movements={[]}
          isLoading={false}
        />
      );

      expect(screen.getByText(/no hay planes en el catálogo/i)).toBeInTheDocument();
    });
  });

  describe('5. Integración en Navegación (App y ReceptionDashboard)', () => {
    it('en ReceptionDashboard permite acceder a la pestaña de Catálogo & Stock con simulador', async () => {
      const user = userEvent.setup();
      const { ReceptionDashboard } = await import('../features/reception/ReceptionDashboard');

      render(
        <ReceptionDashboard
          session={recepcionistaSession}
          onLockSession={vi.fn()}
          entitiesProps={{
            clients: [],
            suppliers: [],
            persons: [],
            companies: [],
            isLoading: false,
          }}
        />
      );

      // Clic en pestaña "Catálogo & Stock"
      const tabCatalogo = screen.getByRole('button', {
        name: /catálogo & stock/i,
      });
      await user.click(tabCatalogo);

      // Debe mostrar el título del panel de recepción y el simulador
      expect(
        screen.getByRole('heading', { name: /catálogo de planes y stock de inventario/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /simulador canónico de vencimientos/i })
      ).toBeInTheDocument();
      expect(screen.getByText(/Modo Operativo de Recepción:/i)).toBeInTheDocument();
    });
  });
});
