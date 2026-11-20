// ============================================================================
// SUITE DE PRUEBAS FRONTEND: SLICE 9 PARTE B
// LoginForm Split-Screen, HomeDashboardView, Shell de 4 Componentes,
// Buscador Inteligente Ctrl+K y Pulido Numérico en Modales
// Ubicación: src/__tests__/Slice9DesignSystemPartB.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { App } from '../App';
import { LoginForm } from '../features/auth/LoginForm';
import { HomeDashboardView } from '../features/home/HomeDashboardView';
import { PlanFormModal } from '../features/catalog/PlanFormModal';
import { ProductFormModal } from '../features/catalog/ProductFormModal';
import { AuthSession } from '../types/auth';
import { HomeDashboardMetricsDto } from '../types/dashboard';

const mockedInvoke = vi.mocked(invoke);

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

const sampleMetrics: HomeDashboardMetricsDto = {
  clientes_activos: 42,
  membresias_activas: 36,
  asistencias_hoy_total: 18,
  deudores_activos_count: 3,
  saldo_creditos_pendiente: '240.00',
  ingresos_hoy_fisico: '150.00',
  ingresos_hoy_digital: '210.00',
  ingresos_hoy_total: '360.00',
  ingresos_mes_fisico: '1850.00',
  ingresos_mes_digital: '2450.00',
  ingresos_mes_total: '4300.00',
  can_view_monthly_revenue: true,
  afluencia_por_franja: [
    { franja: '07:00', hora: 7, total: 8 },
    { franja: '18:00', hora: 18, total: 10 },
  ],
  membresias_por_vencer: [],
  generated_at: '2026-11-17 18:00:00',
};

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

describe('Slice 9 Parte B: Login Split-Screen, HomeDashboard y Shell 4 Componentes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
    document.documentElement.classList.remove('dark');
  });

  describe('LoginForm Split-Screen y UX', () => {
    it('no expone contraseña en texto plano ni "Default: admin" y permite toggle de contraseña, tema y Escape', async () => {
      const user = userEvent.setup();
      render(<LoginForm onLogin={vi.fn().mockResolvedValue(true)} />);

      expect(screen.getByText(/(Area recepción|ESTACIÓN #TK-01)/i)).toBeInTheDocument();
      expect(screen.queryByText(/admin123/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Default: admin/i)).not.toBeInTheDocument();

      const passwordInput = screen.getByLabelText(/^contraseña/i) as HTMLInputElement;
      expect(passwordInput.type).toBe('password');

      const toggleBtn = screen.getByRole('button', { name: /mostrar u ocultar contraseña/i });
      expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');

      await user.click(toggleBtn);
      expect(passwordInput.type).toBe('text');
      expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');

      // Selector de tema Claro / Oscuro
      const darkBtn = screen.getByRole('button', { name: /oscuro/i });
      await user.click(darkBtn);
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Escape limpia campos
      const userInput = screen.getByLabelText(/usuario del sistema/i) as HTMLInputElement;
      await user.type(userInput, 'operador');
      await user.type(passwordInput, 'secreto');
      fireEvent.keyDown(userInput, { key: 'Escape' });
      expect(userInput.value).toBe('');
      expect(passwordInput.value).toBe('');
    });
  });

  describe('HomeDashboardView', () => {
    it('muestra bienvenida, métricas en vivo (4 KPIs) y ejecuta navegación rápida', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      const onOpenSearch = vi.fn();

      render(
        <HomeDashboardView
          session={adminSession}
          clientsCount={42}
          metrics={sampleMetrics}
          onNavigate={onNavigate}
          onOpenSearch={onOpenSearch}
        />
      );

      expect(screen.getByText(/Bienvenido, Administrador Principal/i)).toBeInTheDocument();
      expect(screen.getByText(/Dashboard principal ZARAMA GYM/i)).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText(/Afluencia de Asistencias por Franja Horaria/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Ir a Asistencias QR/i }));
      expect(onNavigate).toHaveBeenCalledWith('attendance');

      await user.click(screen.getByRole('button', { name: /Abrir Caja \/ POS/i }));
      expect(onNavigate).toHaveBeenCalledWith('pos');

      await user.click(screen.getByRole('button', { name: /Explorar Directorio/i }));
      expect(onNavigate).toHaveBeenCalledWith('directory');

      await user.click(screen.getByRole('button', { name: /Búsqueda Rápida de Funciones/i }));
      expect(onOpenSearch).toHaveBeenCalledTimes(1);
    });
  });

  describe('App Shell 4 Componentes + Buscador Inteligente Ctrl+K', () => {
    it('muestra AppShellSkeleton durante la carga inicial de sesión', () => {
      mockedInvoke.mockImplementation(() => new Promise(() => {}));
      render(<App />);
      expect(
        screen.getByRole('status', { name: /Cargando aplicación ZaramaGYM/i })
      ).toBeInTheDocument();
    });

    it('navega con Ctrl+K a submódulos (Deudores) y permite ir a Inicio y alternar tema', async () => {
      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_current_session') return adminSession;
        if (cmd === 'get_active_cash_shift' || cmd === 'get_cash_shift_summary') return null;
        if (cmd === 'get_home_dashboard_metrics') return sampleMetrics;
        return [];
      });

      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Administrador Principal')).toBeInTheDocument();
      });

      // Verificar estructura de 4 componentes (Sidebar, Header, Main, Footer)
      expect(screen.getByLabelText(/Navegación lateral ZaramaGYM/i)).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByText(/© 2026 ZaramaGYM/i)).toBeInTheDocument();

      // Abrir buscador inteligente con Ctrl+K y buscar "deudores"
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      const searchInput = screen.getByLabelText(/Buscador inteligente de módulos y submódulos/i);
      await user.type(searchInput, 'deudores');

      const debtorOption = await screen.findByRole('option', {
        name: /Caja y POS -> Deudores y Créditos/i,
      });
      await user.click(debtorOption);

      await waitFor(() => {
        expect(
          screen.getByText(/Caja, Punto de Venta \(POS\) y Cuentas por Cobrar/i)
        ).toBeInTheDocument();
      });

      // Navegar a Inicio desde el Sidebar
      await user.click(screen.getByRole('button', { name: /^Inicio$/i }));
      await waitFor(() => {
        expect(screen.getByText(/Dashboard principal ZARAMA GYM/i)).toBeInTheDocument();
        expect(screen.getByText(/Afluencia de Asistencias por Franja Horaria/i)).toBeInTheDocument();
      });

      // Alternar modo de color desde el pie del Sidebar
      await user.click(screen.getByRole('button', { name: /Cambiar a modo Oscuro/i }));
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('Login ocupa todo el viewport y el Shell fija Header/Footer con scroll independiente en Sidebar y Main', async () => {
      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_current_session') return null;
        return [];
      });

      const { unmount } = render(<App />);
      await screen.findByRole('button', { name: /iniciar sesión/i });
      const loginMain = screen.getByRole('main');
      expect(loginMain.className).toContain('h-dvh');
      expect(loginMain.className).toContain('overflow-hidden');
      const loginContainer = loginMain.firstElementChild as HTMLElement;
      expect(loginContainer.className).not.toContain('max-w-5xl');
      expect(loginContainer.className).toContain('w-full');
      unmount();

      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_current_session') return adminSession;
        if (cmd === 'get_active_cash_shift' || cmd === 'get_cash_shift_summary') return null;
        return [];
      });

      render(<App />);
      await waitFor(() => {
        expect(screen.getByText('Administrador Principal')).toBeInTheDocument();
      });

      const sidebarNav = screen.getByRole('navigation', { name: /Módulos del Sistema/i });
      const headerEl = screen.getByRole('banner');
      const mainEl = screen.getByRole('main');
      const footerEl = screen.getByRole('contentinfo');

      expect(sidebarNav.className).toContain('overflow-y-auto');
      expect(sidebarNav.className).toContain('min-h-0');
      expect(mainEl.className).toContain('overflow-y-auto');
      expect(mainEl.className).toContain('min-h-0');
      expect(headerEl.className).toContain('shrink-0');
      expect(footerEl.className).toContain('shrink-0');
    });
  });

  describe('Inputs Numéricos en Modales de Catálogo', () => {
    it('PlanFormModal y ProductFormModal mantienen string crudo al teclear "50" y formatean en onBlur', () => {
      render(
        <div>
          <PlanFormModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />
          <ProductFormModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />
        </div>
      );

      const planPrice = screen.getByLabelText(/Precio Base/i) as HTMLInputElement;
      expect(planPrice).toHaveAttribute('inputmode', 'decimal');
      fireEvent.change(planPrice, { target: { value: '50' } });
      expect(planPrice.value).toBe('50');
      fireEvent.blur(planPrice);
      expect(planPrice.value).toBe('50.00');

      const prodPrice = screen.getByLabelText(/Precio de Venta al Público/i) as HTMLInputElement;
      expect(prodPrice).toHaveAttribute('inputmode', 'decimal');
      fireEvent.change(prodPrice, { target: { value: '50' } });
      expect(prodPrice.value).toBe('50');
      fireEvent.blur(prodPrice);
      expect(prodPrice.value).toBe('50.00');
    });
  });
});
