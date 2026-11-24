import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { OpenShiftModal } from '../features/pos/components/OpenShiftModal';
import { safeInvoke } from '../services/ipc/client';
import { AuthSession } from '../types/auth';
import {
  acknowledgeModuleAlerts,
  computeVisibleSidebarAlerts,
  emitSidebarAlertsRefresh,
  reconcileAcknowledgedAlerts,
  SidebarAlertsMap,
} from '../utils/sidebarAlerts';
import { preventEnterKeySubmit } from '../utils/formSafety';

vi.mock('../services/ipc/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/ipc/client')>();
  return {
    ...actual,
    safeInvoke: vi.fn(),
  };
});

const mockedInvoke = vi.mocked(safeInvoke);

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-21 09:00:00',
};

describe('Iteración UX: Notificaciones Inteligentes en Sidebar, Contraste Chrome y Seguridad de Formularios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Máquina de estados pura de alertas del Sidebar (Unseen / Ack)', () => {
    it('muestra alerta inicial, se oculta al visitar el módulo, permanece oculta al salir sin resolver y reaparece si surge un NUEVO ítem', () => {
      const initialSnapshots: SidebarAlertsMap = {
        catalog: {
          ids: [10],
          count: 1,
          label: '1 producto con stock bajo',
          variant: 'warning',
        },
        pos: {
          ids: [5],
          count: 1,
          label: '1 deudor con saldo pendiente',
          variant: 'warning',
        },
      };

      // Al iniciar sesión: ambas alertas visibles
      let ack = {};
      let visible = computeVisibleSidebarAlerts(initialSnapshots, ack);
      expect(visible.catalog?.count).toBe(1);
      expect(visible.pos?.count).toBe(1);

      // Usuario entra a Catálogo -> desaparece del Sidebar
      ack = acknowledgeModuleAlerts(ack, 'catalog', initialSnapshots.catalog);
      visible = computeVisibleSidebarAlerts(initialSnapshots, ack);
      expect(visible.catalog).toBeUndefined();
      expect(visible.pos?.count).toBe(1);

      // Usuario regresa al Dashboard sin resolver el producto 10 -> sigue oculta
      ack = reconcileAcknowledgedAlerts(ack, initialSnapshots, 'home');
      visible = computeVisibleSidebarAlerts(initialSnapshots, ack);
      expect(visible.catalog).toBeUndefined();

      // Una venta en POS baja el producto 22 por debajo del mínimo -> reaparece con 2
      const afterSaleSnapshots: SidebarAlertsMap = {
        ...initialSnapshots,
        catalog: {
          ids: [10, 22],
          count: 2,
          label: '2 productos con stock bajo',
          variant: 'warning',
        },
      };
      ack = reconcileAcknowledgedAlerts(ack, afterSaleSnapshots, 'pos');
      visible = computeVisibleSidebarAlerts(afterSaleSnapshots, ack);
      expect(visible.catalog?.count).toBe(2);

      // Si todos los productos se reponen (count = 0), se limpia el ack para futuras alertas
      const resolvedSnapshots: SidebarAlertsMap = { pos: initialSnapshots.pos };
      ack = reconcileAcknowledgedAlerts(ack, resolvedSnapshots, 'home');
      visible = computeVisibleSidebarAlerts(initialSnapshots, ack);
      expect(visible.catalog?.count).toBe(1);
    });
  });

  describe('2. Integración en App Shell: Badges del Sidebar, Descarte al Entrar y Colapso Limpio', () => {
    it('muestra badges amarillos en Sidebar, los descarta al entrar al módulo, no reaparecen al volver a Inicio y reaparecen ante una nueva venta', async () => {
      let lowStockProducts = [
        {
          id: 101,
          codigo_sku: 'AGUA-500',
          nombre: 'Agua Mineral 500ml',
          categoria: 'BEBIDAS',
          unidad_medida: 'BOTELLA',
          precio_compra_referencial: '1.00',
          precio_venta: '3.00',
          stock_actual: 2,
          stock_minimo: 5,
          alerta_stock_bajo: true,
          estado_activo: true,
          created_at: '2026-11-20 08:00:00',
        },
      ];

      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_current_session') return adminSession;
        if (cmd === 'list_products') return lowStockProducts;
        if (cmd === 'list_client_credits') {
          return [
            {
              id: 1,
              cliente_id: 7,
              cliente_nombre_completo: 'Carlos Deudor',
              cliente_numero_documento: '12345678',
              cliente_telefono: null,
              venta_origen_id: 1,
              origen_credito: 'VENTA_CREDITO',
              descripcion: 'Saldo pendiente',
              monto_total: '50.00',
              monto_pagado: '10.00',
              saldo_pendiente: '40.00',
              estado: 'PENDIENTE',
              registrado_por_usuario_id: 1,
              registrado_por_username: 'admin',
              fecha_emision: '2026-11-20',
              fecha_ultimo_pago: null,
              notas: null,
              created_at: '2026-11-20 10:00:00',
            },
          ];
        }
        if (cmd === 'list_struck_sales_tray') {
          return [
            {
              id: 55,
              turno_caja_id: 1,
              turno_estado: 'ABIERTO',
              total_venta: '25.00',
              monto_pagado_efectivo: '25.00',
              monto_pagado_digital: '0.00',
              saldo_credito_generado: '0.00',
              estado_venta: 'TACHADA_EN_TURNO',
              usuario_vendedor_username: 'recep1',
              created_at: '2026-11-21 08:30:00',
            },
          ];
        }
        if (cmd === 'get_active_cash_shift' || cmd === 'get_cash_shift_summary') return null;
        return [];
      });

      const user = userEvent.setup();
      render(<App />);

      const sidebar = await screen.findByLabelText(/navegación lateral zaramagym/i);

      // 1. Al iniciar sesión aparecen badges circulares amarillos en Catálogo, POS y Finanzas
      await waitFor(() => {
        expect(within(sidebar).getByTestId('sidebar-alert-catalog')).toHaveTextContent('1');
        expect(within(sidebar).getByTestId('sidebar-alert-pos')).toHaveTextContent('1');
        expect(within(sidebar).getByTestId('sidebar-alert-finance')).toHaveTextContent('1');
      });

      // 2. Clic en Catálogo e Inventario -> desaparece el badge del Sidebar, permanece en el tab interno
      await user.click(within(sidebar).getByRole('button', { name: /catálogo e inventario/i }));
      await waitFor(() => {
        expect(within(sidebar).queryByTestId('sidebar-alert-catalog')).not.toBeInTheDocument();
      });
      const productosTab = await screen.findByRole('tab', { name: /inventario de productos/i });
      expect(await within(productosTab).findByText('1')).toBeInTheDocument();

      // 3. Regresar a Inicio sin resolver -> el badge del Sidebar NO vuelve a aparecer
      await user.click(within(sidebar).getByRole('button', { name: /^inicio$/i }));
      await waitFor(() => {
        expect(within(sidebar).queryByTestId('sidebar-alert-catalog')).not.toBeInTheDocument();
      });

      // 4. Simular nueva venta que baja OTRO producto debajo del mínimo -> reaparece con '2'
      lowStockProducts = [
        ...lowStockProducts,
        {
          ...lowStockProducts[0],
          id: 202,
          codigo_sku: 'PROT-WHEY',
          nombre: 'Proteína Scoop',
          stock_actual: 1,
          stock_minimo: 4,
        },
      ];
      emitSidebarAlertsRefresh();
      await waitFor(() => {
        expect(within(sidebar).getByTestId('sidebar-alert-catalog')).toHaveTextContent('2');
      });

      // 5. Sin flecha duplicada en Sidebar; el botón hamburguesa del Header minimiza manteniendo el logo visible
      expect(
        within(sidebar).queryByRole('button', { name: /colapsar barra lateral/i })
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /alternar barra lateral/i }));
      expect(within(sidebar).getByAltText('ZaramaGYM')).toBeInTheDocument();
      expect(within(sidebar).getByTestId('sidebar-alert-catalog')).toHaveTextContent('2');
    });
  });

  describe('3. Seguridad de Formularios y Campos Numéricos', () => {
    it('preventEnterKeySubmit bloquea Enter y NumpadEnter en inputs pero permite textarea y botones', () => {
      const makeEvent = (key: string, code: string, tagName: string, type = 'text') => {
        const prevented = vi.fn();
        const el = document.createElement(tagName);
        if (el instanceof HTMLInputElement) el.type = type;
        preventEnterKeySubmit({
          key,
          code,
          target: el,
          nativeEvent: { isComposing: false },
          preventDefault: prevented,
        } as unknown as React.KeyboardEvent<HTMLFormElement>);
        return prevented;
      };

      expect(makeEvent('Enter', 'Enter', 'input', 'text')).toHaveBeenCalledTimes(1);
      expect(makeEvent('Enter', 'NumpadEnter', 'input', 'text')).toHaveBeenCalledTimes(1);
      expect(makeEvent('Enter', 'Enter', 'select')).toHaveBeenCalledTimes(1);
      expect(makeEvent('Enter', 'Enter', 'textarea')).not.toHaveBeenCalled();
      expect(makeEvent('Enter', 'Enter', 'button')).not.toHaveBeenCalled();
    });

    it('OpenShiftModal renderiza el prefijo S/ como leftIcon no obstructivo (pointer-events-none)', () => {
      render(
        <OpenShiftModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn().mockResolvedValue(true)}
          isLoading={false}
        />
      );

      const amountInput = screen.getByLabelText(/fondo inicial en efectivo/i);
      expect(amountInput).toBeInTheDocument();
      expect(amountInput).toHaveClass('pl-9');
      const prefix = screen.getByText('S/');
      expect(prefix.parentElement).toHaveClass('pointer-events-none');
    });
  });
});
