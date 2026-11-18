// ============================================================================
// SERVICIOS IPC: COMPRAS A PROVEEDORES, GASTOS OPERATIVOS Y FINANZAS (SLICE 7)
// Envoltorios tipados para Tauri v2 con dual-binding camelCase + snake_case
// Ubicación: src/services/ipc/financeIpc.ts
// ============================================================================

import {
  CancelSupplierPurchaseDto,
  CreateExpenseDto,
  CreateSupplierPurchaseDto,
  ExpenseFilter,
  FinancialDashboardDto,
  FinancialReportFilter,
  OperationalExpenseDto,
  StruckSaleFilter,
  StruckSaleTrayItemDto,
  SupplierPurchaseDetailDto,
  SupplierPurchaseFilter,
  SupplierPurchaseSummaryDto,
  UpdateExpenseDto,
} from '../../types/finance';
import { safeInvoke } from './client';

export const financeIpc = {
  // ==========================================================================
  // 1. COMPRAS A PROVEEDORES (INGRESO DE STOCK Y KARDEX)
  // ==========================================================================

  /**
   * Registra una compra de mercadería a proveedor e incrementa stock en inventario
   */
  async createSupplierPurchase(input: CreateSupplierPurchaseDto): Promise<SupplierPurchaseDetailDto> {
    return safeInvoke<SupplierPurchaseDetailDto>('create_supplier_purchase', {
      input,
    });
  },

  /**
   * Lista el histórico de compras de mercadería a proveedores
   */
  async listSupplierPurchases(filter?: SupplierPurchaseFilter): Promise<SupplierPurchaseSummaryDto[]> {
    return safeInvoke<SupplierPurchaseSummaryDto[]>('list_supplier_purchases', {
      filter: filter ?? null,
    });
  },

  /**
   * Obtiene el detalle completo de una compra y sus productos asociados
   */
  async getSupplierPurchaseDetail(id: number): Promise<SupplierPurchaseDetailDto> {
    return safeInvoke<SupplierPurchaseDetailDto>('get_supplier_purchase_detail', {
      id,
      purchase_id: id,
      purchaseId: id,
    });
  },

  /**
   * Anula una compra a proveedor revirtiendo el stock ingresado (Exclusivo Administrador)
   */
  async cancelSupplierPurchase(
    id: number,
    input: CancelSupplierPurchaseDto
  ): Promise<SupplierPurchaseDetailDto> {
    return safeInvoke<SupplierPurchaseDetailDto>('cancel_supplier_purchase', {
      id,
      purchase_id: id,
      purchaseId: id,
      input,
    });
  },

  // ==========================================================================
  // 2. GASTOS OPERATIVOS (EXCLUSIVO ADMINISTRADOR)
  // ==========================================================================

  /**
   * Registra un egreso operativo administrativo
   */
  async createOperationalExpense(input: CreateExpenseDto): Promise<OperationalExpenseDto> {
    return safeInvoke<OperationalExpenseDto>('create_operational_expense', {
      input,
    });
  },

  /**
   * Actualiza los datos de un gasto operativo existente
   */
  async updateOperationalExpense(
    id: number,
    input: UpdateExpenseDto
  ): Promise<OperationalExpenseDto> {
    return safeInvoke<OperationalExpenseDto>('update_operational_expense', {
      id,
      expense_id: id,
      expenseId: id,
      input,
    });
  },

  /**
   * Alterna el estado activo (Zero-Delete) de un gasto operativo
   */
  async toggleOperationalExpenseActive(id: number): Promise<OperationalExpenseDto> {
    return safeInvoke<OperationalExpenseDto>('toggle_operational_expense_active', {
      id,
      expense_id: id,
      expenseId: id,
    });
  },

  /**
   * Lista los gastos operativos con filtros multicriterio
   */
  async listOperationalExpenses(filter?: ExpenseFilter): Promise<OperationalExpenseDto[]> {
    return safeInvoke<OperationalExpenseDto[]>('list_operational_expenses', {
      filter: filter ?? null,
    });
  },

  // ==========================================================================
  // 3. BANDEJA GLOBAL DE TACHADOS (PASO 2)
  // ==========================================================================

  /**
   * Consulta la bandeja consolidada de ventas tachadas de cualquier turno
   */
  async listStruckSalesTray(filter?: StruckSaleFilter): Promise<StruckSaleTrayItemDto[]> {
    return safeInvoke<StruckSaleTrayItemDto[]>('list_struck_sales_tray', {
      filter: filter ?? null,
    });
  },

  // ==========================================================================
  // 4. AGREGACIONES Y DASHBOARD FINANCIERO (FÍSICA / DIGITAL / MIXTA)
  // ==========================================================================

  /**
   * Obtiene el resumen financiero consolidado por canales del periodo seleccionado
   */
  async getFinancialDashboardSummary(
    filter?: FinancialReportFilter
  ): Promise<FinancialDashboardDto> {
    return safeInvoke<FinancialDashboardDto>('get_financial_dashboard_summary', {
      filter: filter ?? null,
    });
  },
};
