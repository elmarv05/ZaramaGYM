// ============================================================================
// SUITE DE PRUEBAS FRONTEND: BI-SLICE 1 (PERMISOS RBAC Y DEMOGRAFÍA)
// Verifica: Sub-pestaña Permisos de Recepción, Enforcement en FinanceView y
// HomeDashboardView, y campos opcionales Género / Canal de Captación en Directorio
// Ubicación: src/__tests__/BiSlice1PermissionsDemographics.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { UserManagementTable } from '../features/auth/UserManagementTable';
import { FinanceView } from '../features/finance/FinanceView';
import { HomeDashboardView } from '../features/home/HomeDashboardView';
import { PersonFormModal } from '../features/entities/PersonFormModal';
import { ClientFormModal } from '../features/entities/ClientFormModal';
import { EntityProfileModal } from '../features/entities/EntityProfileModal';
import { PERMISSIONS_UPDATED_EVENT } from '../hooks/useReceptionistPermissions';
import { AuthSession, UserListItem } from '../types/auth';
import {
  DEFAULT_RECEPTIONIST_PERMISSIONS,
  HomeDashboardMetricsDto,
  ReceptionistPermissionsDto,
} from '../types/dashboard';
import { ClientDetail } from '../types/entity';
import { FinancialDashboardDto } from '../types/finance';

const mockedInvoke = vi.mocked(invoke);

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Principal',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-25 08:00:00',
};

const recepSession: AuthSession = {
  user_id: 2,
  persona_id: 2,
  username: 'recep1',
  nombre_completo: 'Lucía Recepcionista',
  rol: 'RECEPCIONISTA',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-25 08:15:00',
};

const mockUsers: UserListItem[] = [
  {
    id: 1,
    persona_id: 1,
    username: 'admin',
    nombres: 'Administrador',
    apellidos: 'Principal',
    numero_documento: '00000000',
    tipo_documento: 'DNI',
    rol: 'ADMINISTRADOR',
    foto_perfil_data_url: null,
    estado_activo: true,
    ultimo_login: '2026-11-25 08:00:00',
    created_at: '2026-11-01 08:00:00',
  },
];

const mockHomeMetrics: HomeDashboardMetricsDto = {
  clientes_activos: 42,
  membresias_activas: 38,
  asistencias_hoy_total: 15,
  deudores_activos_count: 3,
  saldo_creditos_pendiente: '120.00',
  ingresos_hoy_fisico: '150.00',
  ingresos_hoy_digital: '200.00',
  ingresos_hoy_total: '350.00',
  ingresos_mes_fisico: '1200.00',
  ingresos_mes_digital: '1800.00',
  ingresos_mes_total: '3000.00',
  can_view_monthly_revenue: false,
  afluencia_por_franja: [{ franja: '08:00', hora: 8, total: 15 }],
  membresias_por_vencer: [],
  generated_at: '2026-11-25 10:00:00',
};

const mockFinanceDashboard: FinancialDashboardDto = {
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
    egresos_gastos: '0.00',
    total_egresos: '0.00',
    flujo_neto: '300.00',
  },
  mixta: {
    canal: 'MIXTA',
    ingresos_ventas: '800.00',
    egresos_compras: '100.00',
    egresos_gastos: '0.00',
    total_egresos: '100.00',
    flujo_neto: '700.00',
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
    yape: '0.00',
    plin: '0.00',
    transferencia: '0.00',
    tarjeta: '0.00',
    total: '0.00',
  },
  ingresos_por_dominio: {
    planes: '500.00',
    productos: '300.00',
    amortizaciones: '0.00',
    total: '800.00',
  },
  gastos_por_categoria: [],
  indicadores_control: {
    total_creditos_pendientes: '120.00',
    cantidad_creditos_pendientes: 1,
    ventas_tachadas_pendientes_count: 0,
    monto_tachado_pendiente: '0.00',
    ventas_anuladas_definitivas_count: 0,
  },
};

describe('BI-Slice 1: Permisos Configurables RBAC y Campos Demográficos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Sub-pestaña Permisos de Recepción en UserManagementTable', () => {
    it('permite navegar a Permisos de Recepción, alternar switches, guardar cambios y restablecer todo bloqueado', async () => {
      const user = userEvent.setup();
      let currentSaved: ReceptionistPermissionsDto = {
        ...DEFAULT_RECEPTIONIST_PERMISSIONS,
        ver_tab_socios: true,
      };

      mockedInvoke.mockImplementation(async (cmd, args: unknown) => {
        if (cmd === 'get_receptionist_permissions') {
          return currentSaved;
        }
        if (cmd === 'update_receptionist_permissions') {
          const payload = (args as { input: ReceptionistPermissionsDto }).input;
          currentSaved = { ...payload };
          return currentSaved;
        }
        return null;
      });

      const eventListener = vi.fn();
      window.addEventListener(PERMISSIONS_UPDATED_EVENT, eventListener);

      render(
        <UserManagementTable
          currentSession={adminSession}
          users={mockUsers}
          isLoading={false}
          isActionLoading={false}
          error={null}
          onRefresh={vi.fn()}
          onCreateUser={vi.fn()}
          onToggleActive={vi.fn()}
        />
      );

      // Navegar a sub-pestaña Permisos de Recepción
      const permsTab = screen.getByRole('tab', { name: /permisos de recepción/i });
      await user.click(permsTab);

      // Verifica carga inicial y contador 1 de 12
      expect(await screen.findByText('1 de 12 habilitados')).toBeInTheDocument();
      expect(
        screen.getByText(/Sub-pestañas y Métricas del Módulo Inicio \(BI\)/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Módulo Finanzas Operativo/i)).toBeInTheDocument();
      expect(screen.getByText(/Exportaciones y Reportes/i)).toBeInTheDocument();

      // Guardar Cambios deshabilitado inicialmente sin cambios
      const saveBtn = screen.getByRole('button', { name: /guardar cambios/i });
      expect(saveBtn).toBeDisabled();

      // Activar Ver Dashboard Financiero y Exportar Clientes
      await user.click(
        screen.getByRole('switch', { name: /ver dashboard financiero y su pdf/i })
      );
      await user.click(
        screen.getByRole('switch', { name: /exportar padrón de clientes/i })
      );

      expect(screen.getByText('3 de 12 habilitados')).toBeInTheDocument();
      expect(saveBtn).not.toBeDisabled();

      // Guardar
      await user.click(saveBtn);

      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('update_receptionist_permissions', {
          input: expect.objectContaining({
            ver_tab_socios: true,
            ver_dashboard_modulo_finanzas: true,
            exportar_clientes: true,
            exportar_deudores: false,
          }),
        });
      });

      expect(eventListener).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByText(/permisos de recepción actualizados/i)
      ).toBeInTheDocument();

      // Probar Restablecer Todo Bloqueado
      const resetBtn = screen.getByRole('button', { name: /restablecer todo bloqueado/i });
      await user.click(resetBtn);
      expect(screen.getByText('0 de 12 habilitados')).toBeInTheDocument();
      expect(saveBtn).not.toBeDisabled();

      window.removeEventListener(PERMISSIONS_UPDATED_EVENT, eventListener);
    });
  });

  describe('2. Enforcement UI en FinanceView según permisos efectivos', () => {
    it('oculta Dashboard Financiero, redirige a Compras y NO llama get_financial_dashboard_summary si ver_dashboard_modulo_finanzas es false', async () => {
      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_my_effective_permissions') {
          return { ...DEFAULT_RECEPTIONIST_PERMISSIONS };
        }
        if (
          cmd === 'list_supplier_purchases' ||
          cmd === 'list_struck_sales_tray' ||
          cmd === 'list_suppliers' ||
          cmd === 'list_products'
        ) {
          return [];
        }
        if (cmd === 'get_financial_dashboard_summary') {
          throw new Error('NO_DEBE_LLAMARSE_SIN_PERMISO');
        }
        return [];
      });

      render(<FinanceView currentSession={recepSession} />);

      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('get_my_effective_permissions', undefined);
      });

      // Pestaña Dashboard Financiero oculta; Compras activa por defecto
      expect(
        screen.queryByRole('tab', { name: /dashboard financiero/i })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: /compras a proveedores/i })
      ).toHaveAttribute('data-state', 'active');

      // Botones de exportación ocultos
      expect(screen.queryByRole('button', { name: /ventas csv/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /exportar reporte pdf/i })
      ).not.toBeInTheDocument();

      // Verificación crítica anti-403: nunca se invocó get_financial_dashboard_summary
      expect(mockedInvoke).not.toHaveBeenCalledWith(
        'get_financial_dashboard_summary',
        expect.anything()
      );
    });

    it('muestra Dashboard Financiero para Recepcionista cuando ver_dashboard_modulo_finanzas es true y controla botones de ventas según exportar_ventas_caja', async () => {
      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_my_effective_permissions') {
          return {
            ...DEFAULT_RECEPTIONIST_PERMISSIONS,
            ver_dashboard_modulo_finanzas: true,
            exportar_ventas_caja: false,
          };
        }
        if (cmd === 'get_financial_dashboard_summary') {
          return mockFinanceDashboard;
        }
        return [];
      });

      const { rerender } = render(<FinanceView currentSession={recepSession} />);

      const dashTab = await screen.findByRole('tab', { name: /dashboard financiero/i });
      expect(dashTab).toBeInTheDocument();
      expect(dashTab).toHaveAttribute('data-state', 'active');

      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith(
          'get_financial_dashboard_summary',
          expect.anything()
        );
      });

      // El PDF de finanzas sí es visible, pero Ventas CSV / Excel permanecen ocultos
      expect(
        screen.getByRole('button', { name: /exportar reporte pdf \(ram\)/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /exportar ventas y caja en csv/i })
      ).not.toBeInTheDocument();

      // Si ahora tiene exportar_ventas_caja = true y emitimos evento de actualización
      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_my_effective_permissions') {
          return {
            ...DEFAULT_RECEPTIONIST_PERMISSIONS,
            ver_dashboard_modulo_finanzas: true,
            exportar_ventas_caja: true,
          };
        }
        if (cmd === 'get_financial_dashboard_summary') {
          return mockFinanceDashboard;
        }
        return [];
      });

      await act(async () => {
        window.dispatchEvent(new CustomEvent(PERMISSIONS_UPDATED_EVENT));
      });
      rerender(<FinanceView currentSession={recepSession} />);

      expect(
        await screen.findByRole('button', { name: /exportar ventas y caja en csv/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /exportar ventas y caja en excel/i })
      ).toBeInTheDocument();
    });
  });

  describe('3. Enforcement UI en HomeDashboardView según permisos efectivos', () => {
    it('oculta toda la sección de exportaciones si Recepcionista no tiene permisos habilitados', async () => {
      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_my_effective_permissions') {
          return { ...DEFAULT_RECEPTIONIST_PERMISSIONS };
        }
        return null;
      });

      render(
        <HomeDashboardView
          session={recepSession}
          metrics={mockHomeMetrics}
          onNavigate={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(mockedInvoke).toHaveBeenCalledWith('get_my_effective_permissions', undefined);
      });

      expect(
        screen.queryByText(/centro rápido de exportaciones contables/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /exportar padrón de clientes/i })
      ).not.toBeInTheDocument();
    });

    it('muestra únicamente las tarjetas de exportación habilitadas para Recepcionista', async () => {
      mockedInvoke.mockImplementation(async (cmd) => {
        if (cmd === 'get_my_effective_permissions') {
          return {
            ...DEFAULT_RECEPTIONIST_PERMISSIONS,
            exportar_clientes: true,
            exportar_deudores: false,
            exportar_ventas_caja: true,
          };
        }
        return null;
      });

      render(
        <HomeDashboardView
          session={recepSession}
          metrics={mockHomeMetrics}
          onNavigate={vi.fn()}
        />
      );

      expect(
        await screen.findByRole('button', { name: /exportar padrón de clientes en csv/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: /exportar ventas y movimientos de caja en csv/i,
        })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /exportar cartera de deudores/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('4. Campos Demográficos Opcionales (Género y Canal de Captación) en Directorio', () => {
    it('PersonFormModal permite seleccionar género opcional y lo envía en createPerson', async () => {
      const user = userEvent.setup();
      const handleCreate = vi.fn().mockResolvedValue({ id: 10 });

      render(
        <PersonFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmitCreate={handleCreate}
          onSubmitUpdate={vi.fn()}
        />
      );

      await user.type(screen.getByLabelText(/número de documento/i), '74561234');
      await user.type(screen.getByLabelText(/^nombres/i), 'Valeria');
      await user.type(screen.getByLabelText(/^apellidos/i), 'Quispe');
      await user.selectOptions(screen.getByLabelText(/género/i), 'FEMENINO');

      await user.click(screen.getByRole('button', { name: /registrar persona/i }));

      expect(handleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          nombres: 'Valeria',
          apellidos: 'Quispe',
          genero: 'FEMENINO',
        })
      );
    });

    it('ClientFormModal permite seleccionar Género (Fase 1) y Canal de Captación (Fase 2) y los envía en createClient', async () => {
      const user = userEvent.setup();
      const handleCreate = vi.fn().mockResolvedValue({ id: 20 });

      render(
        <ClientFormModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmitCreate={handleCreate}
          onSubmitUpdate={vi.fn()}
        />
      );

      await user.type(screen.getByLabelText(/número de documento/i), '76543210');
      await user.type(screen.getByLabelText(/^nombres/i), 'Diego');
      await user.type(screen.getByLabelText(/^apellidos/i), 'Salazar');
      await user.selectOptions(screen.getByLabelText(/género/i), 'MASCULINO');
      await user.selectOptions(
        screen.getByLabelText(/canal de captación/i),
        'REDES_SOCIALES'
      );

      await user.click(screen.getByRole('button', { name: /registrar cliente/i }));

      expect(handleCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          nombres: 'Diego',
          apellidos: 'Salazar',
          genero: 'MASCULINO',
          canal_captacion: 'REDES_SOCIALES',
        })
      );
    });

    it('EntityProfileModal muestra Género y Canal de Captación y respeta protección "Caso Juan Pérez" al editar', async () => {
      const user = userEvent.setup();
      const handleUpdateClient = vi.fn().mockResolvedValue({
        id: 10,
        persona_id: 99,
        tipo_documento: 'DNI',
        numero_documento: '77889900',
        nombres: 'Juan',
        apellidos: 'Pérez Admin',
        fecha_nacimiento: '1990-01-15',
        genero: 'MASCULINO',
        telefono: '999000111',
        email: 'juan@zaramagym.com',
        direccion: 'Jr. Lima 100',
        codigo_qr_token: 'ZG-JUAN1234',
        nombre_contacto_emergencia: 'María',
        numero_contacto_emergencia: '999000222',
        notas_medicas: null,
        peso_actual_kg: '80.00',
        canal_captacion: 'PROMOCION',
        persona_rol_usuario: 'ADMINISTRADOR',
        estado_activo: true,
        created_at: '2026-11-01',
        updated_at: '2026-11-25',
      });

      const juanClient: ClientDetail = {
        id: 10,
        persona_id: 99,
        tipo_documento: 'DNI',
        numero_documento: '77889900',
        nombres: 'Juan',
        apellidos: 'Pérez Admin',
        fecha_nacimiento: '1990-01-15',
        genero: 'MASCULINO',
        telefono: '999000111',
        email: 'juan@zaramagym.com',
        direccion: 'Jr. Lima 100',
        codigo_qr_token: 'ZG-JUAN1234',
        nombre_contacto_emergencia: 'María',
        numero_contacto_emergencia: '999000222',
        notas_medicas: null,
        peso_actual_kg: '80.00',
        canal_captacion: 'RECOMENDACION',
        persona_rol_usuario: 'ADMINISTRADOR',
        estado_activo: true,
        created_at: '2026-11-01',
        updated_at: '2026-11-01',
      };

      mockedInvoke.mockResolvedValue(juanClient);

      render(
        <EntityProfileModal
          isOpen={true}
          onClose={vi.fn()}
          subject={{ kind: 'client', data: juanClient }}
          currentSession={recepSession}
          onUpdateClient={handleUpdateClient}
        />
      );

      // En lectura muestra etiquetas legibles
      expect(screen.getByText('Masculino')).toBeInTheDocument();
      expect(screen.getByText('Recomendación / Referido')).toBeInTheDocument();

      // Activar edición como Recepcionista sobre un cliente vinculado a Admin ("Caso Juan Pérez")
      await user.click(screen.getByRole('button', { name: /editar perfil/i }));

      expect(screen.getByText(/datos personales protegidos por rol/i)).toBeInTheDocument();
      // Género sigue en solo lectura (no es editable)
      expect(screen.queryByLabelText(/^género$/i)).not.toBeInTheDocument();

      // Canal de Captación sí es editable porque pertenece a clientes
      const canalSelect = screen.getByLabelText(/canal de captación/i);
      await user.selectOptions(canalSelect, 'PROMOCION');
      await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

      await waitFor(() => {
        expect(handleUpdateClient).toHaveBeenCalledWith(
          10,
          expect.objectContaining({
            modificar_datos_personales: false,
            genero: undefined,
            canal_captacion: 'PROMOCION',
          })
        );
      });
    });
  });
});
