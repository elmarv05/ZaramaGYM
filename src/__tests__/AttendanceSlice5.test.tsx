// ============================================================================
// SUITE DE PRUEBAS FRONTEND: SLICE 5 (CONTROL DE ASISTENCIAS Y SEMÁFORO)
// Semáforo Inteligente, Anti-Rebote, Ingreso Manual, Pase a Crédito y Prórrogas
// Ubicación: src/__tests__/AttendanceSlice5.test.tsx
// ============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttendanceView } from '../features/attendance/AttendanceView';
import { AuthSession } from '../types/auth';
import { ClientListItem } from '../types/entity';
import {
  AttendanceListItemDto,
  AttendanceTodaySummaryDto,
  CheckInEvaluationDto,
  MembershipExtensionDto,
  SystemConfigDto,
} from '../types/attendance';
import { ClientMembershipDto } from '../types/pos';

// Mock de safeInvoke de Tauri IPC
vi.mock('../services/ipc/client', () => ({
  safeInvoke: vi.fn(),
}));

import { safeInvoke } from '../services/ipc/client';

const mockSafeInvoke = vi.mocked(safeInvoke);

const adminSession: AuthSession = {
  user_id: 1,
  persona_id: 1,
  username: 'admin',
  nombre_completo: 'Administrador Zarama',
  rol: 'ADMINISTRADOR',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-15 08:00:00',
};

const recepcionistaSession: AuthSession = {
  user_id: 3,
  persona_id: 3,
  username: 'recep1',
  nombre_completo: 'Operador Recepción',
  rol: 'RECEPCIONISTA',
  foto_perfil_data_url: null,
  is_locked: false,
  login_at: '2026-11-15 08:30:00',
};

const mockSummary: AttendanceTodaySummaryDto = {
  totalIngresosHoy: 12,
  totalVerde: 8,
  totalAmarillo: 3,
  totalRojoAutorizados: 1,
  totalQrLocal: 9,
  totalManualOlvido: 2,
  totalPaseCredito: 1,
  totalQrMovil: 0,
  ultimoIngresoHora: '2026-11-15 10:45:00',
};

const mockConfig: SystemConfigDto = {
  diasAlertaAmarillo: 5,
  minutosAntireboteQr: 3,
  precioPaseDiarioCreditoDefault: '10.00',
  updatedAt: '2026-11-15 08:00:00',
};

const mockAttendances: AttendanceListItemDto[] = [
  {
    id: 1,
    clienteId: 101,
    nombreCompleto: 'Carlos Mendoza',
    tipoDocumento: 'DNI',
    numeroDocumento: '45892134',
    membresiaId: 50,
    nombrePlan: 'Plan Mensual Oro',
    fechaHoraIngreso: '2026-11-15 08:15:00',
    modoIngreso: 'QR_LOCAL',
    colorSemaforo: 'VERDE',
    motivoSemaforo: 'Membresía activa vigente',
    diasRestantesMomento: 18,
    deudaPendienteMomento: '0.00',
    creditoGeneradoId: null,
    registradoPorUsuarioId: 1,
    registradoPorNombre: 'admin',
    notas: null,
    createdAt: '2026-11-15 08:15:00',
  },
];

const mockExtensions: MembershipExtensionDto[] = [
  {
    id: 1,
    membresiaId: 50,
    clienteId: 101,
    nombreCliente: 'Carlos Mendoza',
    nombrePlan: 'Plan Mensual Oro',
    diasOtorgados: 3,
    fechaVencimientoAnterior: '2026-11-20 23:59:59',
    fechaVencimientoNueva: '2026-11-23 23:59:59',
    motivoJustificacion: 'Reposo médico certificado',
    autorizadoPorUsuarioId: 1,
    autorizadoPorNombre: 'admin',
    createdAt: '2026-11-15 09:00:00',
  },
];

const mockClients: ClientListItem[] = [
  {
    id: 101,
    persona_id: 101,
    nombres: 'Carlos',
    apellidos: 'Mendoza',
    tipo_documento: 'DNI',
    numero_documento: '45892134',
    telefono: '987654321',
    email: 'carlos@test.com',
    codigo_qr_token: 'ZG-CLM-101-ABC',
    estado_activo: true,
    created_at: '2026-11-01 10:00:00',
    peso_actual_kg: '78.50',
  },
  {
    id: 102,
    persona_id: 102,
    nombres: 'María',
    apellidos: 'López',
    tipo_documento: 'DNI',
    numero_documento: '47123987',
    telefono: '912345678',
    email: 'maria@test.com',
    codigo_qr_token: 'ZG-CLM-102-DEF',
    estado_activo: true,
    created_at: '2026-11-01 10:00:00',
    peso_actual_kg: '62.00',
  },
];

const mockActiveMemberships: ClientMembershipDto[] = [
  {
    id: 50,
    cliente_id: 101,
    cliente_nombre_completo: 'Carlos Mendoza',
    plan_id: 1,
    plan_nombre: 'Plan Mensual Oro',
    venta_id: 10,
    fecha_inicio: '2026-11-01 08:00:00',
    fecha_vencimiento: '2026-11-30 23:59:59',
    precio_pactado: '120.00',
    estado: 'ACTIVA',
    dias_restantes: 15,
    registrado_por_usuario_id: 1,
    registrado_por_username: 'admin',
    created_at: '2026-11-01 08:00:00',
  },
];

describe('Suite Frontend: Slice 5 - Control de Asistencias, Semáforo y Prórrogas', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'get_attendance_summary_today':
          return mockSummary;
        case 'get_system_config':
          return mockConfig;
        case 'list_attendances':
          return mockAttendances;
        case 'list_membership_extensions':
          return mockExtensions;
        case 'list_client_memberships':
          return mockActiveMemberships;
        default:
          return null;
      }
    });
  });

  describe('1. Renderizado de KPIs y Estado Standby del Semáforo', () => {
    it('muestra los contadores en vivo del día y el estado inicial en espera', async () => {
      render(
        <AttendanceView currentSession={adminSession} clients={mockClients} />
      );

      // Esperar que carguen los datos iniciales
      await waitFor(() => {
        expect(screen.getByText('12')).toBeInTheDocument(); // Ingresos Hoy
      });

      expect(screen.getByText('8')).toBeInTheDocument(); // Verdes
      expect(screen.getByText('3')).toBeInTheDocument(); // Amarillos
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1); // Pases Crédito o conteo de lista

      // Estado Standby del Semáforo
      expect(screen.getByTestId('traffic-light-standby')).toBeInTheDocument();
      expect(
        screen.getByText(/Listo para escanear credencial QR o buscar socio por DNI/i)
      ).toBeInTheDocument();
    });
  });

  describe('2. Evaluación del Semáforo en VERDE (Acceso Total)', () => {
    it('muestra la tarjeta verde con membrete de acceso permitido y sin alarmas', async () => {
      const evaluationVerde: CheckInEvaluationDto = {
        asistenciaId: 10,
        clienteId: 101,
        nombreCompleto: 'Carlos Mendoza',
        tipoDocumento: 'DNI',
        numeroDocumento: '45892134',
        fotoPerfilDataUrl: null,
        colorSemaforo: 'VERDE',
        ingresoPermitido: true,
        alertaSonora: false,
        esRebote: false,
        motivoSemaforo: 'Membresía activa vigente',
        membresiaId: 50,
        nombrePlan: 'Plan Mensual Oro',
        fechaVencimiento: '2026-11-30 23:59:59',
        diasRestantes: 15,
        deudaTotalPendiente: '0.00',
        modoIngreso: 'QR_LOCAL',
        fechaHoraIngreso: '2026-11-15 10:00:00',
        creditoGeneradoId: null,
      };

      mockSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_in_client') return evaluationVerde;
        if (cmd === 'get_attendance_summary_today') return mockSummary;
        if (cmd === 'list_attendances') return mockAttendances;
        if (cmd === 'list_membership_extensions') return mockExtensions;
        if (cmd === 'get_system_config') return mockConfig;
        if (cmd === 'list_client_memberships') return mockActiveMemberships;
        return null;
      });

      render(
        <AttendanceView currentSession={adminSession} clients={mockClients} />
      );

      const scannerInput = screen.getByTestId('scanner-qr-input');
      fireEvent.change(scannerInput, { target: { value: 'ZG-CLM-101-ABC' } });
      fireEvent.submit(scannerInput.closest('form')!);

      await waitFor(() => {
        expect(screen.getByTestId('traffic-light-card-verde')).toBeInTheDocument();
      });

      expect(screen.getByText(/ACCESO PERMITIDO — MEMBRESÍA ACTIVA/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Carlos Mendoza' })).toBeInTheDocument();
      expect(screen.getByText('15 día(s)')).toBeInTheDocument();
      expect(screen.getByText('S/ 0.00')).toBeInTheDocument();
    });
  });

  describe('3. Evaluación del Semáforo en AMARILLO (Alerta Preventiva y Botón POS)', () => {
    it('muestra tarjeta ámbar con alertas de vencimiento/deuda y botón Ir a Caja', async () => {
      const onNavigateToPosMock = vi.fn();
      const evaluationAmarillo: CheckInEvaluationDto = {
        asistenciaId: 11,
        clienteId: 102,
        nombreCompleto: 'María López',
        tipoDocumento: 'DNI',
        numeroDocumento: '47123987',
        fotoPerfilDataUrl: null,
        colorSemaforo: 'AMARILLO',
        ingresoPermitido: true,
        alertaSonora: true,
        esRebote: false,
        motivoSemaforo: 'Membresía por vencer en 2 día(s) y Deuda pendiente de S/ 40.00',
        membresiaId: 51,
        nombrePlan: 'Plan Mensual Oro',
        fechaVencimiento: '2026-11-17 23:59:59',
        diasRestantes: 2,
        deudaTotalPendiente: '40.00',
        modoIngreso: 'QR_LOCAL',
        fechaHoraIngreso: '2026-11-15 10:15:00',
        creditoGeneradoId: null,
      };

      mockSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_in_client') return evaluationAmarillo;
        if (cmd === 'get_attendance_summary_today') return mockSummary;
        if (cmd === 'list_attendances') return mockAttendances;
        if (cmd === 'list_membership_extensions') return mockExtensions;
        if (cmd === 'get_system_config') return mockConfig;
        if (cmd === 'list_client_memberships') return mockActiveMemberships;
        return null;
      });

      render(
        <AttendanceView
          currentSession={recepcionistaSession}
          clients={mockClients}
          onNavigateToPos={onNavigateToPosMock}
        />
      );

      const scannerInput = screen.getByTestId('scanner-qr-input');
      fireEvent.change(scannerInput, { target: { value: 'ZG-CLM-102-DEF' } });
      fireEvent.submit(scannerInput.closest('form')!);

      await waitFor(() => {
        expect(screen.getByTestId('traffic-light-card-amarillo')).toBeInTheDocument();
      });

      expect(screen.getByText(/INGRESO PERMITIDO CON ALERTA PREVENTIVA/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'María López' })).toBeInTheDocument();
      expect(screen.getByText('2 día(s)')).toBeInTheDocument();
      expect(screen.getByText('S/ 40.00')).toBeInTheDocument();

      // Botón rápido para cobrar deuda o renovar en POS
      const btnGoPos = screen.getByRole('button', {
        name: /Ir a Caja \/ Cobrar Deuda o Renovar/i,
      });
      expect(btnGoPos).toBeInTheDocument();

      fireEvent.click(btnGoPos);
      expect(onNavigateToPosMock).toHaveBeenCalledWith('deudores');
    });
  });

  describe('4. Evaluación del Semáforo en ROJO y 2 Acciones Obligatorias', () => {
    it('bloquea acceso en rojo y presenta botones [Rechazar] y [Autorizar Pase a Crédito]', async () => {
      const onNavigateToPosMock = vi.fn();
      const evaluationRojo: CheckInEvaluationDto = {
        asistenciaId: null,
        clienteId: 103,
        nombreCompleto: 'Juan Pérez Vencido',
        tipoDocumento: 'DNI',
        numeroDocumento: '40998877',
        fotoPerfilDataUrl: null,
        colorSemaforo: 'ROJO',
        ingresoPermitido: false,
        alertaSonora: true,
        esRebote: false,
        motivoSemaforo: 'Membresía vencida el 2026-11-10',
        membresiaId: null,
        nombrePlan: null,
        fechaVencimiento: '2026-11-10 23:59:59',
        diasRestantes: -5,
        deudaTotalPendiente: '0.00',
        modoIngreso: 'QR_LOCAL',
        fechaHoraIngreso: '2026-11-15 10:20:00',
        creditoGeneradoId: null,
      };

      const authorizedResult: CheckInEvaluationDto = {
        ...evaluationRojo,
        colorSemaforo: 'ROJO',
        ingresoPermitido: true,
        alertaSonora: false,
        modoIngreso: 'PASE_DIARIO_CREDITO_ROJO',
        creditoGeneradoId: 99,
        motivoSemaforo: 'Pase Diario a crédito autorizado por recepción',
      };

      mockSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_in_client') return evaluationRojo;
        if (cmd === 'authorize_red_daily_pass_credit') return authorizedResult;
        if (cmd === 'get_attendance_summary_today') return mockSummary;
        if (cmd === 'list_attendances') return mockAttendances;
        if (cmd === 'list_membership_extensions') return mockExtensions;
        if (cmd === 'get_system_config') return mockConfig;
        if (cmd === 'list_client_memberships') return mockActiveMemberships;
        return null;
      });

      render(
        <AttendanceView
          currentSession={recepcionistaSession}
          clients={mockClients}
          onNavigateToPos={onNavigateToPosMock}
        />
      );

      const scannerInput = screen.getByTestId('scanner-qr-input');
      fireEvent.change(scannerInput, { target: { value: 'ZG-CLM-103-VENCIDO' } });
      fireEvent.submit(scannerInput.closest('form')!);

      await waitFor(() => {
        expect(screen.getByTestId('traffic-light-card-rojo')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/ACCESO DENEGADO — MEMBRESÍA VENCIDA O INEXISTENTE/i)
      ).toBeInTheDocument();

      // Acción Obligatoria 1: Botón Rechazar
      const btnReject = screen.getByTestId('btn-reject-red-pass');
      expect(btnReject).toBeInTheDocument();

      // Acción Obligatoria 2: Botón Autorizar Pase Diario a Crédito
      const btnAuthorize = screen.getByTestId('btn-authorize-red-pass');
      expect(btnAuthorize).toBeInTheDocument();

      // Al hacer clic en Autorizar Pase Diario, se abre el modal de confirmación
      fireEvent.click(btnAuthorize);
      expect(screen.getByText('Autorizar Pase Diario a Crédito')).toBeInTheDocument();

      // Confirmar en el modal
      const btnConfirmAuth = screen.getByRole('button', {
        name: /Confirmar y Desbloquear Puerta/i,
      });
      fireEvent.click(btnConfirmAuth);

      await waitFor(() => {
        expect(mockSafeInvoke).toHaveBeenCalledWith(
          'authorize_red_daily_pass_credit',
          expect.objectContaining({
            input: expect.objectContaining({
              clienteId: 103,
              montoPase: '10.00',
            }),
          })
        );
      });
    });
  });

  describe('5. Indicador de Filtro Anti-Rebote (3 Minutos)', () => {
    it('muestra el badge distintivo cuando esRebote es true', async () => {
      const evaluationRebote: CheckInEvaluationDto = {
        asistenciaId: 10,
        clienteId: 101,
        nombreCompleto: 'Carlos Mendoza',
        tipoDocumento: 'DNI',
        numeroDocumento: '45892134',
        fotoPerfilDataUrl: null,
        colorSemaforo: 'VERDE',
        ingresoPermitido: true,
        alertaSonora: false,
        esRebote: true,
        motivoSemaforo: 'Membresía activa vigente',
        membresiaId: 50,
        nombrePlan: 'Plan Mensual Oro',
        fechaVencimiento: '2026-11-30 23:59:59',
        diasRestantes: 15,
        deudaTotalPendiente: '0.00',
        modoIngreso: 'QR_LOCAL',
        fechaHoraIngreso: '2026-11-15 10:00:00',
        creditoGeneradoId: null,
      };

      mockSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_in_client') return evaluationRebote;
        if (cmd === 'get_attendance_summary_today') return mockSummary;
        if (cmd === 'list_attendances') return mockAttendances;
        if (cmd === 'list_membership_extensions') return mockExtensions;
        if (cmd === 'get_system_config') return mockConfig;
        if (cmd === 'list_client_memberships') return mockActiveMemberships;
        return null;
      });

      render(
        <AttendanceView currentSession={adminSession} clients={mockClients} />
      );

      const scannerInput = screen.getByTestId('scanner-qr-input');
      fireEvent.change(scannerInput, { target: { value: 'ZG-CLM-101-ABC' } });
      fireEvent.submit(scannerInput.closest('form')!);

      await waitFor(() => {
        expect(screen.getByTestId('anti-rebote-badge')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Lectura dentro de ventana anti-rebote \(3 min\)/i)
      ).toBeInTheDocument();
    });
  });

  describe('6. Ingreso Manual por Olvido de QR', () => {
    it('abre el modal y envía el check-in con modoIngreso MANUAL_OLVIDO_QR', async () => {
      const evaluationManual: CheckInEvaluationDto = {
        asistenciaId: 15,
        clienteId: 101,
        nombreCompleto: 'Carlos Mendoza',
        tipoDocumento: 'DNI',
        numeroDocumento: '45892134',
        fotoPerfilDataUrl: null,
        colorSemaforo: 'VERDE',
        ingresoPermitido: true,
        alertaSonora: false,
        esRebote: false,
        motivoSemaforo: 'Membresía activa vigente',
        membresiaId: 50,
        nombrePlan: 'Plan Mensual Oro',
        fechaVencimiento: '2026-11-30 23:59:59',
        diasRestantes: 15,
        deudaTotalPendiente: '0.00',
        modoIngreso: 'MANUAL_OLVIDO_QR',
        fechaHoraIngreso: '2026-11-15 10:30:00',
        creditoGeneradoId: null,
      };

      mockSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'check_in_client') return evaluationManual;
        if (cmd === 'get_attendance_summary_today') return mockSummary;
        if (cmd === 'list_attendances') return mockAttendances;
        if (cmd === 'list_membership_extensions') return mockExtensions;
        if (cmd === 'get_system_config') return mockConfig;
        if (cmd === 'list_client_memberships') return mockActiveMemberships;
        return null;
      });

      render(
        <AttendanceView currentSession={recepcionistaSession} clients={mockClients} />
      );

      const btnOpenManual = screen.getByTestId('btn-manual-olvido-qr');
      fireEvent.click(btnOpenManual);

      expect(
        screen.getByRole('heading', { name: 'Ingreso Manual por Olvido de QR' })
      ).toBeInTheDocument();

      const inputDoc = screen.getByLabelText(/Número de Documento \(DNI \/ CE\)/i);
      fireEvent.change(inputDoc, { target: { value: '45892134' } });

      const btnSubmitManual = screen.getByRole('button', {
        name: /Registrar Ingreso Manual/i,
      });
      fireEvent.click(btnSubmitManual);

      await waitFor(() => {
        expect(mockSafeInvoke).toHaveBeenCalledWith(
          'check_in_client',
          expect.objectContaining({
            input: expect.objectContaining({
              numeroDocumento: '45892134',
              modoIngreso: 'MANUAL_OLVIDO_QR',
            }),
          })
        );
      });
    });
  });

  describe('7. Recuperación Manual de Días (Prórroga con Justificación)', () => {
    it('valida justificación >= 5 caracteres y ejecuta extend_membership_days', async () => {
      const newExtension: MembershipExtensionDto = {
        id: 2,
        membresiaId: 50,
        clienteId: 101,
        nombreCliente: 'Carlos Mendoza',
        nombrePlan: 'Plan Mensual Oro',
        diasOtorgados: 4,
        fechaVencimientoAnterior: '2026-11-30 23:59:59',
        fechaVencimientoNueva: '2026-12-04 23:59:59',
        motivoJustificacion: 'Avería eléctrica en las instalaciones del local',
        autorizadoPorUsuarioId: 1,
        autorizadoPorNombre: 'admin',
        createdAt: '2026-11-15 11:00:00',
      };

      mockSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'extend_membership_days') return newExtension;
        if (cmd === 'list_client_memberships') return mockActiveMemberships;
        if (cmd === 'list_membership_extensions') return [newExtension];
        if (cmd === 'get_attendance_summary_today') return mockSummary;
        if (cmd === 'list_attendances') return mockAttendances;
        if (cmd === 'get_system_config') return mockConfig;
        return null;
      });

      render(
        <AttendanceView currentSession={adminSession} clients={mockClients} />
      );

      // Ir a la pestaña de Recuperación Manual de Días
      const tabExtensions = screen.getByRole('tab', {
        name: /Recuperación Manual de Días/i,
      });
      fireEvent.click(tabExtensions);

      await waitFor(() => {
        expect(screen.getByTestId('btn-open-extend-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('btn-open-extend-modal'));

      expect(screen.getByText('Recuperación Manual de Días')).toBeInTheDocument();

      const selectMemb = screen.getByLabelText(/Membresía del Socio/i);
      fireEvent.change(selectMemb, { target: { value: '50' } });

      const inputDias = screen.getByLabelText(/Días Calendario a Otorgar/i);
      fireEvent.change(inputDias, { target: { value: '4' } });

      const textareaMotivo = screen.getByLabelText(/Motivo o Justificación Obligatoria/i);

      // Si escribe menos de 5 caracteres, muestra validación
      fireEvent.change(textareaMotivo, { target: { value: 'abc' } });
      const btnConfirmExt = screen.getByRole('button', {
        name: /Confirmar Extensión de Días/i,
      });
      fireEvent.click(btnConfirmExt);

      await waitFor(() => {
        expect(
          screen.getByText(/El motivo de justificación es obligatorio/i)
        ).toBeInTheDocument();
      });

      // Escribe justificación completa
      fireEvent.change(textareaMotivo, {
        target: { value: 'Avería eléctrica en las instalaciones del local' },
      });
      fireEvent.click(btnConfirmExt);

      await waitFor(() => {
        expect(mockSafeInvoke).toHaveBeenCalledWith(
          'extend_membership_days',
          expect.objectContaining({
            input: expect.objectContaining({
              membresiaId: 50,
              diasOtorgados: 4,
              motivoJustificacion: 'Avería eléctrica en las instalaciones del local',
            }),
          })
        );
      });
    });
  });

  describe('8. Configuración del Semáforo para Administrador / Supervisor', () => {
    it('abre modal de configuración y permite modificar parámetros operativos', async () => {
      const updatedConfig: SystemConfigDto = {
        diasAlertaAmarillo: 7,
        minutosAntireboteQr: 5,
        precioPaseDiarioCreditoDefault: '15.00',
        updatedAt: '2026-11-15 11:30:00',
      };

      mockSafeInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'update_system_config') return updatedConfig;
        if (cmd === 'get_system_config') return mockConfig;
        if (cmd === 'get_attendance_summary_today') return mockSummary;
        if (cmd === 'list_attendances') return mockAttendances;
        if (cmd === 'list_membership_extensions') return mockExtensions;
        if (cmd === 'list_client_memberships') return mockActiveMemberships;
        return null;
      });

      render(
        <AttendanceView currentSession={adminSession} clients={mockClients} />
      );

      const btnConfig = screen.getByTestId('btn-open-system-config');
      fireEvent.click(btnConfig);

      expect(screen.getByText('Configuración del Semáforo')).toBeInTheDocument();

      const inputDias = screen.getByLabelText(/Umbral Alerta Semáforo Amarillo/i);
      fireEvent.change(inputDias, { target: { value: '7' } });

      const inputMinutos = screen.getByLabelText(/Ventana de Filtro Anti-Rebote/i);
      fireEvent.change(inputMinutos, { target: { value: '5' } });

      const btnSave = screen.getByRole('button', { name: /Guardar Parámetros/i });
      fireEvent.click(btnSave);

      await waitFor(() => {
        expect(mockSafeInvoke).toHaveBeenCalledWith(
          'update_system_config',
          expect.objectContaining({
            input: expect.objectContaining({
              diasAlertaAmarillo: 7,
              minutosAntireboteQr: 5,
            }),
          })
        );
      });
    });
  });
});
