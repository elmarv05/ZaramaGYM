// ============================================================================
// HOOK REACTIVO: COMPRAS, GASTOS Y FINANZAS (SLICE 7)
// Gestión integral de vistas físicas/digitales/mixtas, compras, kardex, gastos y tachados
// Ubicación: src/hooks/useFinance.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { catalogIpc } from '../services/ipc/catalogIpc';
import { entityIpc } from '../services/ipc/entityIpc';
import { financeIpc } from '../services/ipc/financeIpc';
import { posIpc } from '../services/ipc/posIpc';
import { emitSidebarAlertsRefresh } from '../utils/sidebarAlerts';
import { AppError } from '../types/auth';
import { ProductListItem } from '../types/catalog';
import { SupplierListItem } from '../types/entity';
import {
  CancelSupplierPurchaseDto,
  CreateExpenseDto,
  CreateSupplierPurchaseDto,
  ExpenseFilter,
  FinancialDashboardDto,
  FinancialReportFilter,
  FinancialViewChannel,
  OperationalExpenseDto,
  StruckSaleFilter,
  StruckSaleTrayItemDto,
  SupplierPurchaseDetailDto,
  SupplierPurchaseFilter,
  SupplierPurchaseSummaryDto,
  UpdateExpenseDto,
} from '../types/finance';
import { ResolveStruckSaleInput, SaleDetailDto } from '../types/pos';

export interface UseFinanceOptions {
  isAdmin?: boolean;
  canViewDashboard?: boolean;
  autoFetch?: boolean;
}

export function useFinance(options: UseFinanceOptions = {}) {
  const {
    isAdmin = false,
    canViewDashboard = isAdmin,
    autoFetch = true,
  } = options;

  // Estados de datos principales
  const [dashboard, setDashboard] = useState<FinancialDashboardDto | null>(null);
  const [reportFilter, setReportFilter] = useState<FinancialReportFilter>({});
  const [activeChannelView, setActiveChannelView] = useState<FinancialViewChannel>('MIXTA');

  const [purchases, setPurchases] = useState<SupplierPurchaseSummaryDto[]>([]);
  const [selectedPurchaseDetail, setSelectedPurchaseDetail] = useState<SupplierPurchaseDetailDto | null>(null);
  const [purchaseFilter, setPurchaseFilter] = useState<SupplierPurchaseFilter>({});

  const [expenses, setExpenses] = useState<OperationalExpenseDto[]>([]);
  const [expenseFilter, setExpenseFilter] = useState<ExpenseFilter>({});

  const [struckSalesTray, setStruckSalesTray] = useState<StruckSaleTrayItemDto[]>([]);
  const [struckFilter, setStruckFilter] = useState<StruckSaleFilter>({});

  // Catálogos auxiliares para selector de formulario
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);

  // Estados de control de UI
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ==========================================================================
  // 1. CARGA DE CATÁLOGOS AUXILIARES
  // ==========================================================================
  const fetchCatalogs = useCallback(async () => {
    try {
      const [suppliersData, productsData] = await Promise.all([
        entityIpc.listSuppliers({ solo_activos: true }),
        catalogIpc.listProducts({ solo_activos: true }),
      ]);
      setSuppliers(suppliersData);
      setProducts(productsData);
    } catch {
      // Los catálogos auxiliares no deben romper la carga del módulo
    }
  }, []);

  // ==========================================================================
  // 2. DASHBOARD FINANCIERO MULTICANAL
  // ==========================================================================
  const fetchDashboard = useCallback(async (filterToUse?: FinancialReportFilter) => {
    if (!canViewDashboard) {
      setDashboard(null);
      return null;
    }
    const filter = filterToUse !== undefined ? filterToUse : reportFilter;
    try {
      const data = await financeIpc.getFinancialDashboardSummary(filter);
      setDashboard(data);
      return data;
    } catch (err) {
      setError(err as AppError);
      throw err;
    }
  }, [canViewDashboard, reportFilter]);

  // ==========================================================================
  // 3. COMPRAS A PROVEEDORES
  // ==========================================================================
  const fetchPurchases = useCallback(async (filterToUse?: SupplierPurchaseFilter) => {
    const filter = filterToUse !== undefined ? filterToUse : purchaseFilter;
    try {
      const data = await financeIpc.listSupplierPurchases(filter);
      setPurchases(data);
      return data;
    } catch (err) {
      setError(err as AppError);
      throw err;
    }
  }, [purchaseFilter]);

  const fetchPurchaseDetail = useCallback(async (id: number): Promise<SupplierPurchaseDetailDto> => {
    setIsActionLoading(true);
    setError(null);
    try {
      const detail = await financeIpc.getSupplierPurchaseDetail(id);
      setSelectedPurchaseDetail(detail);
      return detail;
    } catch (err) {
      setError(err as AppError);
      throw err;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const createPurchase = useCallback(
    async (input: CreateSupplierPurchaseDto): Promise<SupplierPurchaseDetailDto> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const created = await financeIpc.createSupplierPurchase(input);
        await Promise.all([
          fetchPurchases(),
          fetchDashboard(),
          fetchCatalogs(),
        ]);
        emitSidebarAlertsRefresh();
        return created;
      } catch (err) {
        setError(err as AppError);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchPurchases, fetchDashboard, fetchCatalogs]
  );

  const cancelPurchase = useCallback(
    async (id: number, input: CancelSupplierPurchaseDto): Promise<SupplierPurchaseDetailDto> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const cancelled = await financeIpc.cancelSupplierPurchase(id, input);
        setSelectedPurchaseDetail(cancelled);
        await Promise.all([
          fetchPurchases(),
          fetchDashboard(),
          fetchCatalogs(),
        ]);
        emitSidebarAlertsRefresh();
        return cancelled;
      } catch (err) {
        setError(err as AppError);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchPurchases, fetchDashboard, fetchCatalogs]
  );

  // ==========================================================================
  // 4. GASTOS OPERATIVOS (ADMIN EXCLUSIVO)
  // ==========================================================================
  const fetchExpenses = useCallback(async (filterToUse?: ExpenseFilter) => {
    if (!isAdmin) {
      setExpenses([]);
      return [];
    }
    const filter = filterToUse !== undefined ? filterToUse : expenseFilter;
    try {
      const data = await financeIpc.listOperationalExpenses(filter);
      setExpenses(data);
      return data;
    } catch (err) {
      setError(err as AppError);
      throw err;
    }
  }, [isAdmin, expenseFilter]);

  const createExpense = useCallback(
    async (input: CreateExpenseDto): Promise<OperationalExpenseDto> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const created = await financeIpc.createOperationalExpense(input);
        await Promise.all([
          fetchExpenses(),
          fetchDashboard(),
        ]);
        return created;
      } catch (err) {
        setError(err as AppError);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchExpenses, fetchDashboard]
  );

  const updateExpense = useCallback(
    async (id: number, input: UpdateExpenseDto): Promise<OperationalExpenseDto> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const updated = await financeIpc.updateOperationalExpense(id, input);
        await Promise.all([
          fetchExpenses(),
          fetchDashboard(),
        ]);
        return updated;
      } catch (err) {
        setError(err as AppError);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchExpenses, fetchDashboard]
  );

  const toggleExpenseActive = useCallback(
    async (id: number): Promise<OperationalExpenseDto> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const toggled = await financeIpc.toggleOperationalExpenseActive(id);
        await Promise.all([
          fetchExpenses(),
          fetchDashboard(),
        ]);
        return toggled;
      } catch (err) {
        setError(err as AppError);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchExpenses, fetchDashboard]
  );

  // ==========================================================================
  // 5. BANDEJA GLOBAL DE TACHADOS (PASO 2)
  // ==========================================================================
  const fetchStruckSalesTray = useCallback(async (filterToUse?: StruckSaleFilter) => {
    const filter = filterToUse !== undefined ? filterToUse : struckFilter;
    try {
      const data = await financeIpc.listStruckSalesTray(filter);
      setStruckSalesTray(data);
      return data;
    } catch (err) {
      setError(err as AppError);
      throw err;
    }
  }, [struckFilter]);

  const resolveStruckSale = useCallback(
    async (saleId: number, input: ResolveStruckSaleInput): Promise<SaleDetailDto> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const result = await posIpc.resolveStruckSale(saleId, input);
        await Promise.all([
          fetchStruckSalesTray(),
          fetchDashboard(),
        ]);
        emitSidebarAlertsRefresh();
        return result;
      } catch (err) {
        setError(err as AppError);
        throw err;
      } finally {
        setIsActionLoading(false);
      }
    },
    [fetchStruckSalesTray, fetchDashboard]
  );

  // ==========================================================================
  // REFRESH CONSOLIDADO
  // ==========================================================================
  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const promises: Promise<unknown>[] = [
        fetchPurchases(),
        fetchStruckSalesTray(),
        fetchCatalogs(),
      ];
      if (canViewDashboard) {
        promises.push(fetchDashboard());
      }
      if (isAdmin) {
        promises.push(fetchExpenses());
      }
      await Promise.all(promises);
    } catch (err) {
      setError(err as AppError);
    } finally {
      setIsLoading(false);
    }
  }, [
    isAdmin,
    canViewDashboard,
    fetchDashboard,
    fetchPurchases,
    fetchStruckSalesTray,
    fetchCatalogs,
    fetchExpenses,
  ]);

  // Carga automática al montar o cambiar rol
  useEffect(() => {
    if (autoFetch) {
      refreshAll();
    }
  }, [autoFetch, refreshAll]);

  return {
    // Datos Dashboard
    dashboard,
    reportFilter,
    setReportFilter,
    activeChannelView,
    setActiveChannelView,
    fetchDashboard,

    // Datos Compras
    purchases,
    selectedPurchaseDetail,
    setSelectedPurchaseDetail,
    purchaseFilter,
    setPurchaseFilter,
    fetchPurchases,
    fetchPurchaseDetail,
    createPurchase,
    cancelPurchase,

    // Datos Gastos
    expenses,
    expenseFilter,
    setExpenseFilter,
    fetchExpenses,
    createExpense,
    updateExpense,
    toggleExpenseActive,

    // Datos Bandeja Tachados
    struckSalesTray,
    struckFilter,
    setStruckFilter,
    fetchStruckSalesTray,
    resolveStruckSale,

    // Catálogos
    suppliers,
    products,
    fetchCatalogs,

    // Estados y utilitarios
    isLoading,
    isActionLoading,
    error,
    clearError,
    refreshAll,
  };
}
