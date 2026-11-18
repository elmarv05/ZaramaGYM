// ============================================================================
// SUITE DE PRUEBAS FRONTEND: SLICE 9 PARTE A
// Design System Kinetic Ledger / Obsidian, Primitivos SVG, Esqueletos,
// Semáforo G/Y/R y Fluidez de Inputs Numéricos (sin salto de cursor)
// Ubicación: src/__tests__/Slice9DesignSystemPartA.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Alert } from '../components/primitives/Alert';
import { ConfirmDialog } from '../components/primitives/ConfirmDialog';
import { Icon, IconName } from '../components/primitives/Icon';
import { Modal } from '../components/primitives/Modal';
import { AppShellSkeleton, ModuleSkeleton, Skeleton } from '../components/primitives/Skeleton';
import { CartTable } from '../features/pos/components/CartTable';
import { CloseShiftModal } from '../features/pos/components/CloseShiftModal';
import { OpenShiftModal } from '../features/pos/components/OpenShiftModal';
import { PaymentSplitter } from '../features/pos/components/PaymentSplitter';
import { useTheme } from '../hooks/useTheme';
import { usePos } from '../hooks/usePos';
import { calculatePaymentSplit } from '../domain/pos';
import { CashShiftDto, SaleDetailDto } from '../types/pos';
import { posIpc } from '../services/ipc/posIpc';

vi.mock('../services/ipc/client', () => ({
  safeInvoke: vi.fn(),
}));

function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      store = {};
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
  };
}

describe('Slice 9 Parte A: Design System, Primitivos y Fluidez Numérica', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const memoryStorage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage,
      configurable: true,
      writable: true,
    });
    document.documentElement.classList.remove('dark');
  });

  describe('useTheme', () => {
    it('gestiona light/dark, persiste en localStorage y sincroniza clase .dark en <html>', () => {
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
      expect(window.localStorage.getItem('zaramagym-theme')).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      act(() => {
        result.current.setTheme('light');
      });

      expect(result.current.theme).toBe('light');
      expect(window.localStorage.getItem('zaramagym-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('Primitivos: Icon, Skeleton, Alert, Modal, ConfirmDialog', () => {
    it('renderiza todos los iconos SVG requeridos sin emojis', () => {
      const names: IconName[] = [
        'home', 'dashboard', 'qr', 'pos', 'cash', 'users', 'directory', 'catalog',
        'finance', 'printer', 'audit', 'wifi', 'sun', 'moon', 'lock', 'logout',
        'search', 'check', 'warning', 'danger', 'info', 'plus', 'trash', 'edit',
        'eye', 'eye-off', 'chevron-left', 'chevron-right', 'menu', 'building',
        'package', 'credit-card', 'shield', 'database', 'refresh', 'download',
        'key', 'sparkles', 'terminal', 'clock', 'user', 'truck', 'scissors',
        'receipt', 'smartphone', 'bank',
      ];
      const { container } = render(
        <div>
          {names.map((n) => (
            <Icon key={n} name={n} data-testid={`icon-${n}`} />
          ))}
        </div>
      );
      expect(container.querySelectorAll('svg')).toHaveLength(names.length);
    });

    it('renderiza Skeleton, AppShellSkeleton y ModuleSkeleton con animate-pulse', () => {
      const { container } = render(
        <div>
          <Skeleton className="h-4 w-10" />
          <AppShellSkeleton />
          <ModuleSkeleton />
        </div>
      );
      expect(screen.getByRole('status', { name: /Cargando aplicación ZaramaGYM/i })).toBeInTheDocument();
      expect(screen.getByRole('status', { name: /Cargando módulo/i })).toBeInTheDocument();
      expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(10);
    });

    it('Alert aplica borde semafórico border-l-4 y botón de cierre accesible', () => {
      const onClose = vi.fn();
      render(
        <Alert variant="warning" title="Alerta Ámbar" onClose={onClose}>
          Mensaje de prueba
        </Alert>
      );
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('border-l-4');
      fireEvent.click(screen.getByRole('button', { name: /Cerrar alerta/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Modal aplica clases zg-modal-backdrop y zg-modal-panel y se monta vía Portal en document.body', () => {
      const { container, baseElement } = render(
        <div style={{ transform: 'translateY(0)' }} data-testid="transformed-parent">
          <Modal isOpen={true} title="Prueba Portal Viewport">
            <p>Contenido visible sobre viewport</p>
          </Modal>
        </div>
      );
      expect(baseElement.querySelector('.zg-modal-backdrop')).not.toBeNull();
      expect(baseElement.querySelector('.zg-modal-panel')).not.toBeNull();

      const transformedParent = container.querySelector('[data-testid="transformed-parent"]');
      const dialog = screen.getByRole('dialog');
      expect(transformedParent?.contains(dialog)).toBe(false);
      expect(dialog.parentElement).toBe(document.body);
      expect(baseElement.querySelector('.zg-modal-panel')?.className).toContain('my-auto');
    });

    it('ConfirmDialog renderiza estética Semáforo y ejecuta onConfirm y onClose', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();
      render(
        <ConfirmDialog
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          variant="danger"
          title="Eliminar registro"
          confirmText="Sí, eliminar"
          cancelText="Cancelar"
        >
          ¿Confirmas esta acción?
        </ConfirmDialog>
      );

      expect(screen.getByText('Eliminar registro')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Corrección de Inputs de Montos (cero salto de cursor)', () => {
    it('usePos.updatePayment conserva string crudo al teclear "5" -> "50" y createSale normaliza .toFixed(2)', async () => {
      const mockSaleDetail: SaleDetailDto = {
        id: 1,
        turno_caja_id: 1,
        cliente_id: null,
        cliente_nombre_completo: null,
        cliente_numero_documento: null,
        usuario_vendedor_id: 1,
        usuario_vendedor_username: 'admin',
        subtotal: '50.00',
        descuento: '0.00',
        total_venta: '50.00',
        monto_pagado_efectivo: '50.00',
        monto_pagado_digital: '0.00',
        saldo_credito_generado: '0.00',
        estado_venta: 'COMPLETADA',
        tachado_por_usuario_id: null,
        tachado_por_username: null,
        fecha_tachado: null,
        motivo_tachado: null,
        resuelto_por_admin_id: null,
        resuelto_por_admin_username: null,
        fecha_resolucion_tachado: null,
        nota_resolucion_tachado: null,
        notas: null,
        created_at: '2026-11-17 00:00:00',
        items: [],
        pagos: [],
      };
      const createSaleSpy = vi.spyOn(posIpc, 'createPosSale').mockResolvedValue(mockSaleDetail);

      const { result } = renderHook(() => usePos({ autoFetch: false }));

      act(() => {
        result.current.addItem({
          tipo_item: 'PRODUCTO',
          producto_id: 1,
          cantidad: 1,
          precio_unitario: '50.00',
          subtotal: '50.00',
        });
        result.current.updatePayment('EFECTIVO', '5');
      });

      expect(result.current.pagos).toEqual([
        { metodo_pago: 'EFECTIVO', monto: '5', referencia_operacion: undefined },
      ]);

      act(() => {
        result.current.updatePayment('EFECTIVO', '50');
      });

      expect(result.current.pagos).toEqual([
        { metodo_pago: 'EFECTIVO', monto: '50', referencia_operacion: undefined },
      ]);

      await act(async () => {
        await result.current.createSale();
      });

      expect(createSaleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pagos: [{ metodo_pago: 'EFECTIVO', monto: '50.00', referencia_operacion: undefined }],
        })
      );
    });

    it('PaymentSplitter mantiene "50" en onChange y formatea a "50.00" únicamente en onBlur', () => {
      const onUpdatePayment = vi.fn();
      const onRemovePayment = vi.fn();
      const pagos = [{ metodo_pago: 'EFECTIVO' as const, monto: '50' }];

      render(
        <PaymentSplitter
          totalVenta={100}
          pagos={pagos}
          splitResult={calculatePaymentSplit(100, pagos)}
          hasCliente={true}
          onUpdatePayment={onUpdatePayment}
          onRemovePayment={onRemovePayment}
          onSubmitSale={vi.fn()}
        />
      );

      const input = screen.getByLabelText(/Monto en Efectivo en Gaveta/i) as HTMLInputElement;
      expect(input).toHaveAttribute('inputmode', 'decimal');
      expect(input.value).toBe('50');

      fireEvent.blur(input);
      expect(onUpdatePayment).toHaveBeenCalledWith('EFECTIVO', '50.00', undefined);
    });

    it('CloseShiftModal sincroniza declarado al cambiar shift/isOpen y formatea en onBlur', () => {
      const shift1: CashShiftDto = {
        id: 1,
        usuario_apertura_id: 1,
        usuario_apertura_username: 'admin',
        usuario_cierre_id: null,
        usuario_cierre_username: null,
        fecha_apertura: '2026-11-17 08:00:00',
        fecha_cierre: null,
        monto_apertura_fisico: '50.00',
        total_ventas_efectivo: '100.00',
        total_efectivo_esperado: '150.00',
        monto_cierre_fisico_declarado: null,
        diferencia_arqueo_fisico: null,
        total_ventas_digital: '0.00',
        desglose_digital: { yape: '0.00', plin: '0.00', transferencia: '0.00', tarjeta: '0.00' },
        estado: 'ABIERTO',
        notas_apertura: null,
        notas_cierre: null,
        created_at: '2026-11-17 08:00:00',
        updated_at: '2026-11-17 08:00:00',
      };

      const shift2: CashShiftDto = { ...shift1, id: 2, total_efectivo_esperado: '275.00' };

      const { rerender } = render(
        <CloseShiftModal isOpen={true} shift={shift1} onClose={vi.fn()} onSubmit={vi.fn()} />
      );

      const input = screen.getByLabelText(/Efectivo Físico Contado en Gaveta/i) as HTMLInputElement;
      expect(input.value).toBe('150.00');

      fireEvent.change(input, { target: { value: '140' } });
      expect(input.value).toBe('140');

      fireEvent.blur(input);
      expect(input.value).toBe('140.00');

      rerender(
        <CloseShiftModal isOpen={true} shift={shift2} onClose={vi.fn()} onSubmit={vi.fn()} />
      );
      expect((screen.getByLabelText(/Efectivo Físico Contado en Gaveta/i) as HTMLInputElement).value).toBe('275.00');
    });

    it('OpenShiftModal y CartTable permiten escribir "50" fluido y formatean en onBlur', () => {
      const onDescuentoChange = vi.fn();
      render(
        <div>
          <OpenShiftModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />
          <CartTable
            items={[
              {
                tipo_item: 'PRODUCTO',
                producto_id: 1,
                cantidad: 1,
                precio_unitario: '100.00',
                subtotal: '100.00',
              },
            ]}
            descuento="50"
            subtotal={100}
            totalVenta={50}
            onUpdateQuantity={vi.fn()}
            onRemoveItem={vi.fn()}
            onClearCart={vi.fn()}
            onDescuentoChange={onDescuentoChange}
          />
        </div>
      );

      const openInput = screen.getByLabelText(/Fondo Inicial en Efectivo/i) as HTMLInputElement;
      fireEvent.change(openInput, { target: { value: '50' } });
      expect(openInput.value).toBe('50');
      fireEvent.blur(openInput);
      expect(openInput.value).toBe('50.00');

      const discountInput = screen.getByLabelText(/Descuento Especial \(S\/\)/i) as HTMLInputElement;
      expect(discountInput).toHaveAttribute('inputmode', 'decimal');
      expect(discountInput.value).toBe('50');
      fireEvent.blur(discountInput);
      expect(onDescuentoChange).toHaveBeenCalledWith('50.00');
    });
  });
});
