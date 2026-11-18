// ============================================================================
// SUITE DE PRUEBAS FRONTEND: SLICE 9 PARTE C
// Eliminación de spinners (animate-spin), ConfirmDialog en acciones sensibles
// y fluidez numérica en modales de Asistencias y Entidades
// Ubicación: src/__tests__/Slice9DesignSystemPartC.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Button } from '../components/primitives/Button';
import { AuthorizeRedPassModal } from '../features/attendance/AuthorizeRedPassModal';
import { SystemConfigModal } from '../features/attendance/SystemConfigModal';
import { CatalogView } from '../features/catalog/CatalogView';
import { ClientFormModal } from '../features/entities/ClientFormModal';
import { ClientWeightHistoryModal } from '../features/entities/ClientWeightHistoryModal';
import { OperationalExpensesTab } from '../features/finance/components/OperationalExpensesTab';
import { CartTable } from '../features/pos/components/CartTable';
import { AuthSession } from '../types/auth';
import { PlanListItem, ProductListItem } from '../types/catalog';
import { OperationalExpenseDto } from '../types/finance';

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
  login_at: '2026-11-17 08:00:00',
};

describe('Slice 9 Parte C: Pulido Final', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Button en estado isLoading usa indicador pulsante sin animate-spin', () => {
    const { container } = render(<Button isLoading>Guardar</Button>);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(container.querySelectorAll('.animate-pulse').length).toBe(2);
  });

  it('Inputs de AuthorizeRedPassModal, SystemConfigModal, ClientFormModal y ClientWeightHistoryModal formatean en onBlur', async () => {
    const fetchWeightHistory = vi.fn().mockResolvedValue([]);
    render(
      <div>
        <AuthorizeRedPassModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          evaluation={{
            asistenciaId: null,
            clienteId: 1,
            nombreCompleto: 'Juan Pérez',
            tipoDocumento: 'DNI',
            numeroDocumento: '12345678',
            fotoPerfilDataUrl: null,
            colorSemaforo: 'ROJO',
            ingresoPermitido: false,
            alertaSonora: true,
            esRebote: false,
            motivoSemaforo: 'Sin membresía',
            membresiaId: null,
            nombrePlan: null,
            fechaVencimiento: null,
            diasRestantes: 0,
            deudaTotalPendiente: '0.00',
            modoIngreso: 'QR_LOCAL',
            fechaHoraIngreso: '2026-11-17 08:00:00',
            creditoGeneradoId: null,
          }}
        />
        <SystemConfigModal
          isOpen={true}
          onClose={vi.fn()}
          config={null}
          onSave={vi.fn()}
        />
        <ClientFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmitCreate={vi.fn()}
          onSubmitUpdate={vi.fn()}
          currentSession={adminSession}
        />
        <ClientWeightHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          client={{
            id: 1,
            persona_id: 1,
            nombres: 'Juan',
            apellidos: 'Pérez',
            tipo_documento: 'DNI',
            numero_documento: '12345678',
            telefono: null,
            email: null,
            codigo_qr_token: 'ZG-QR-1',
            peso_actual_kg: '75.00',
            estado_activo: true,
            created_at: '2026-11-17 08:00:00',
          }}
          onRecordWeight={vi.fn()}
          fetchWeightHistory={fetchWeightHistory}
        />
      </div>
    );

    await waitFor(() => {
      expect(fetchWeightHistory).toHaveBeenCalledWith(1);
    });

    const inputsToCheck = [
      screen.getByLabelText(/Monto del Pase Diario a Crédito/i) as HTMLInputElement,
      screen.getByLabelText(/Precio Pase Diario a Crédito por Defecto/i) as HTMLInputElement,
      screen.getByLabelText(/Peso Inicial \(kg\)/i) as HTMLInputElement,
      screen.getByLabelText(/^Peso \(kg\)/i) as HTMLInputElement,
    ];

    for (const input of inputsToCheck) {
      expect(input).toHaveAttribute('inputmode', 'decimal');
      fireEvent.change(input, { target: { value: '50' } });
      expect(input.value).toBe('50');
      fireEvent.blur(input);
      expect(input.value).toBe('50.00');
    }
  });

  it('CartTable solicita ConfirmDialog antes de ejecutar onClearCart', () => {
    const onClearCart = vi.fn();
    render(
      <CartTable
        items={[
          {
            tipo_item: 'PRODUCTO',
            producto_id: 1,
            cantidad: 1,
            precio_unitario: '10.00',
            subtotal: '10.00',
          },
        ]}
        descuento="0.00"
        subtotal={10}
        totalVenta={10}
        onUpdateQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
        onClearCart={onClearCart}
        onDescuentoChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Vaciar Carrito/i }));
    expect(onClearCart).not.toHaveBeenCalled();
    expect(screen.getByText(/¿Vaciar todo el carrito de compra\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sí, vaciar carrito/i }));
    expect(onClearCart).toHaveBeenCalledTimes(1);
  });

  it('OperationalExpensesTab solicita ConfirmDialog antes de desactivar un gasto activo', async () => {
    const onToggleActive = vi.fn().mockResolvedValue({});
    const expense: OperationalExpenseDto = {
      id: 7,
      categoria: 'SERVICIOS_BASICOS',
      descripcion: 'Recibo de Luz',
      monto: '120.00',
      metodo_pago: 'EFECTIVO',
      canal_caja: 'FISICA',
      comprobante_referencia: null,
      fecha_gasto: '2026-11-17',
      notas: null,
      registrado_por_username: 'admin',
      estado_activo: 1,
      created_at: '2026-11-17 08:00:00',
      updated_at: '2026-11-17 08:00:00',
    };

    render(
      <OperationalExpensesTab
        expenses={[expense]}
        isLoading={false}
        isActionLoading={false}
        filter={{}}
        onFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        onCreateExpense={vi.fn()}
        onUpdateExpense={vi.fn()}
        onToggleActive={onToggleActive}
        userRole="ADMINISTRADOR"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Desactivar$/i }));
    expect(onToggleActive).not.toHaveBeenCalled();
    expect(screen.getByText(/¿Desactivar gasto operativo\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sí, desactivar gasto/i }));
    await waitFor(() => {
      expect(onToggleActive).toHaveBeenCalledWith(7);
    });
  });

  it('CatalogView solicita ConfirmDialog antes de desactivar un plan o producto activo', async () => {
    const onTogglePlanActive = vi.fn().mockResolvedValue(true);
    const onToggleProductActive = vi.fn().mockResolvedValue(true);

    const plan: PlanListItem = {
      id: 11,
      codigo: 'PLAN-1M',
      nombre: 'Mensual',
      descripcion: null,
      tipo_plan: 'MENSUALIDAD',
      duracion_meses: 1,
      precio_base: '80.00',
      permite_recuperacion_dias: true,
      estado_activo: true,
      created_at: '2026-11-17 08:00:00',
      updated_at: '2026-11-17 08:00:00',
    };

    const product: ProductListItem = {
      id: 22,
      codigo_sku: 'AGUA-1',
      nombre: 'Agua 600ml',
      categoria: 'BEBIDAS',
      unidad_medida: 'UNIDAD',
      precio_compra_referencial: '1.00',
      precio_venta: '2.50',
      stock_actual: 10,
      stock_minimo: 2,
      alerta_stock_bajo: false,
      proveedor_preferido_id: null,
      proveedor_nombre: null,
      estado_activo: true,
      created_at: '2026-11-17 08:00:00',
      updated_at: '2026-11-17 08:00:00',
    };

    render(
      <CatalogView
        currentSession={adminSession}
        plans={[plan]}
        products={[product]}
        movements={[]}
        onTogglePlanActive={onTogglePlanActive}
        onToggleProductActive={onToggleProductActive}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Desactivar$/i }));
    expect(onTogglePlanActive).not.toHaveBeenCalled();
    expect(screen.getByText(/¿Desactivar plan de membresía\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sí, desactivar/i }));
    await waitFor(() => {
      expect(onTogglePlanActive).toHaveBeenCalledWith(11, true);
    });
  });
});
