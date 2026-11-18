// ============================================================================
// SERVICIOS IPC: CAJA, POS, CRÉDITOS Y TACHADOS (SLICE 4)
// Envoltorios tipados para Tauri v2 con dual-binding camelCase + snake_case
// Ubicación: src/services/ipc/posIpc.ts
// ============================================================================

import {
  CashShiftDto,
  CashShiftFilter,
  CashShiftSummaryDto,
  ClientCreditDto,
  ClientCreditFilter,
  ClientMembershipDto,
  ClientMembershipFilter,
  CloseCashShiftInput,
  CreatePosSaleInput,
  OpenCashShiftInput,
  ResolveStruckSaleInput,
  SaleDetailDto,
  SaleFilter,
  SaleListItemDto,
  StrikeSaleInput,
} from '../../types/pos';
import { safeInvoke } from './client';

export const posIpc = {
  // ==========================================================================
  // 1. TURNOS DE CAJA (FÍSICA, DIGITAL Y CONSOLIDADA)
  // ==========================================================================

  /**
   * Obtiene el turno de caja actualmente abierto, o null si no hay ninguno
   */
  async getActiveCashShift(): Promise<CashShiftDto | null> {
    return safeInvoke<CashShiftDto | null>('get_active_cash_shift');
  },

  /**
   * Abre un nuevo turno de caja con fondo inicial en efectivo
   */
  async openCashShift(input: OpenCashShiftInput): Promise<CashShiftDto> {
    return safeInvoke<CashShiftDto>('open_cash_shift', {
      input,
    });
  },

  /**
   * Cierra el turno de caja activo con declaración de arqueo físico
   */
  async closeCashShift(input: CloseCashShiftInput): Promise<CashShiftDto> {
    return safeInvoke<CashShiftDto>('close_cash_shift', {
      input,
    });
  },

  /**
   * Consulta el historial de turnos de caja
   */
  async listCashShifts(filter: CashShiftFilter = {}): Promise<CashShiftDto[]> {
    return safeInvoke<CashShiftDto[]>('list_cash_shifts', {
      filter,
    });
  },

  /**
   * Obtiene el resumen financiero multidimensional de un turno
   */
  async getCashShiftSummary(shiftId?: number): Promise<CashShiftSummaryDto> {
    return safeInvoke<CashShiftSummaryDto>('get_cash_shift_summary', {
      shiftId: shiftId ?? null,
      shift_id: shiftId ?? null,
    });
  },

  // ==========================================================================
  // 2. PUNTO DE VENTA (POS) Y VENTAS MULTIDOMINIO
  // ==========================================================================

  /**
   * Procesa de forma atómica una venta en el POS (Productos, Planes, Amortizaciones)
   */
  async createPosSale(input: CreatePosSaleInput): Promise<SaleDetailDto> {
    return safeInvoke<SaleDetailDto>('create_pos_sale', {
      input,
    });
  },

  /**
   * Lista el histórico de ventas según filtros de turno, cliente o estado
   */
  async listSales(filter: SaleFilter = {}): Promise<SaleListItemDto[]> {
    return safeInvoke<SaleListItemDto[]>('list_sales', {
      filter,
    });
  },

  /**
   * Consulta el detalle completo de una venta con sus ítems y pagos
   */
  async getSaleDetail(saleId: number): Promise<SaleDetailDto> {
    return safeInvoke<SaleDetailDto>('get_sale_detail', {
      saleId,
      sale_id: saleId,
    });
  },

  // ==========================================================================
  // 3. FLUJO DE TACHADO EN 2 PASOS (ANTI-FRAUDE)
  // ==========================================================================

  /**
   * Paso 1: Tacha una venta en turno abierto, revirtiendo stock y saldo de inmediato
   */
  async strikeSale(saleId: number, input: StrikeSaleInput): Promise<SaleDetailDto> {
    return safeInvoke<SaleDetailDto>('strike_sale', {
      saleId,
      sale_id: saleId,
      input,
    });
  },

  /**
   * Paso 2: Resolución definitiva en bandeja de Administrador (Confirmar o Revertir)
   */
  async resolveStruckSale(saleId: number, input: ResolveStruckSaleInput): Promise<SaleDetailDto> {
    return safeInvoke<SaleDetailDto>('resolve_struck_sale', {
      saleId,
      sale_id: saleId,
      input,
    });
  },

  // ==========================================================================
  // 4. CRÉDITOS Y MEMBRESÍAS EMITIDAS
  // ==========================================================================

  /**
   * Consulta la cartera de cuentas por cobrar (créditos de clientes)
   */
  async listClientCredits(filter: ClientCreditFilter = {}): Promise<ClientCreditDto[]> {
    return safeInvoke<ClientCreditDto[]>('list_client_credits', {
      filter,
    });
  },

  /**
   * Consulta las membresías emitidas a socios
   */
  async listClientMemberships(filter: ClientMembershipFilter = {}): Promise<ClientMembershipDto[]> {
    return safeInvoke<ClientMembershipDto[]>('list_client_memberships', {
      filter,
    });
  },
};
