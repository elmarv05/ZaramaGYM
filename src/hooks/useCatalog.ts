// ============================================================================
// HOOK REACTIVO: GESTIÓN DE ESTADO DE CATÁLOGO, PRODUCTOS Y MERMAS (SLICE 3)
// Manejo integral de los 4 estados visuales: Loading, Empty, Error, Success
// Ubicación: src/hooks/useCatalog.ts
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { calculateDayOverflowPreview } from '../domain/catalog';
import { catalogIpc } from '../services/ipc/catalogIpc';
import { emitSidebarAlertsRefresh } from '../utils/sidebarAlerts';
import { AppError } from '../types/auth';
import {
  CreatePlanInput,
  CreateProductInput,
  InventoryMovementItem,
  ListInventoryMovementsFilter,
  ListPlansFilter,
  ListProductsFilter,
  PlanExpirationPreviewDto,
  PlanListItem,
  ProductListItem,
  RecordInventoryMovementInput,
  TipoPlan,
  UpdatePlanInput,
  UpdateProductInput,
} from '../types/catalog';

export interface UseCatalogResult {
  plans: PlanListItem[];
  products: ProductListItem[];
  movements: InventoryMovementItem[];
  preview: PlanExpirationPreviewDto | null;
  isLoading: boolean;
  isActionLoading: boolean;
  error: AppError | null;

  // Acciones y Mutaciones
  clearError: () => void;
  refreshAll: () => Promise<void>;

  fetchPlans: (filter?: ListPlansFilter) => Promise<void>;
  createPlan: (input: CreatePlanInput) => Promise<PlanListItem | null>;
  updatePlan: (planId: number, input: UpdatePlanInput) => Promise<PlanListItem | null>;
  togglePlanActive: (planId: number, currentActive: boolean) => Promise<boolean>;

  fetchProducts: (filter?: ListProductsFilter) => Promise<void>;
  createProduct: (input: CreateProductInput) => Promise<ProductListItem | null>;
  updateProduct: (productId: number, input: UpdateProductInput) => Promise<ProductListItem | null>;
  toggleProductActive: (productId: number, currentActive: boolean) => Promise<boolean>;

  fetchMovements: (filter?: ListInventoryMovementsFilter) => Promise<void>;
  recordMovement: (input: RecordInventoryMovementInput) => Promise<InventoryMovementItem | null>;

  simulateExpiration: (
    fechaInicio: string,
    tipoPlan: TipoPlan,
    duracionMeses: number | null,
    planId?: number
  ) => Promise<PlanExpirationPreviewDto>;
}

export function useCatalog(autoFetch = true): UseCatalogResult {
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovementItem[]>([]);
  const [preview, setPreview] = useState<PlanExpirationPreviewDto | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(autoFetch);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // 1. Planes
  const fetchPlans = useCallback(async (filter: ListPlansFilter = {}) => {
    try {
      const data = await catalogIpc.listPlans(filter);
      setPlans(data || []);
    } catch (err) {
      setError(err as AppError);
    }
  }, []);

  const createPlan = useCallback(
    async (input: CreatePlanInput): Promise<PlanListItem | null> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const created = await catalogIpc.createPlan(input);
        setPlans((prev) => [created, ...prev]);
        return created;
      } catch (err) {
        setError(err as AppError);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  const updatePlan = useCallback(
    async (planId: number, input: UpdatePlanInput): Promise<PlanListItem | null> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const updated = await catalogIpc.updatePlan(planId, input);
        setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
        return updated;
      } catch (err) {
        setError(err as AppError);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  const togglePlanActive = useCallback(
    async (planId: number, currentActive: boolean): Promise<boolean> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const nextState = !currentActive;
        await catalogIpc.togglePlanActive(planId, nextState);
        setPlans((prev) =>
          prev.map((p) => (p.id === planId ? { ...p, estado_activo: nextState } : p))
        );
        return true;
      } catch (err) {
        setError(err as AppError);
        return false;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  // 2. Productos
  const fetchProducts = useCallback(async (filter: ListProductsFilter = {}) => {
    try {
      const data = await catalogIpc.listProducts(filter);
      setProducts(data || []);
    } catch (err) {
      setError(err as AppError);
    }
  }, []);

  const createProduct = useCallback(
    async (input: CreateProductInput): Promise<ProductListItem | null> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const created = await catalogIpc.createProduct(input);
        setProducts((prev) => [created, ...prev]);
        // Si generó stock inicial, recargamos movimientos en segundo plano
        if (input.stock_inicial > 0) {
          catalogIpc.listInventoryMovements({ limit: 50 }).then(setMovements).catch(() => {});
        }
        emitSidebarAlertsRefresh();
        return created;
      } catch (err) {
        setError(err as AppError);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  const updateProduct = useCallback(
    async (productId: number, input: UpdateProductInput): Promise<ProductListItem | null> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const updated = await catalogIpc.updateProduct(productId, input);
        setProducts((prev) => prev.map((prod) => (prod.id === productId ? updated : prod)));
        emitSidebarAlertsRefresh();
        return updated;
      } catch (err) {
        setError(err as AppError);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  const toggleProductActive = useCallback(
    async (productId: number, currentActive: boolean): Promise<boolean> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const nextState = !currentActive;
        await catalogIpc.toggleProductActive(productId, nextState);
        setProducts((prev) =>
          prev.map((prod) => (prod.id === productId ? { ...prod, estado_activo: nextState } : prod))
        );
        emitSidebarAlertsRefresh();
        return true;
      } catch (err) {
        setError(err as AppError);
        return false;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  // 3. Kardex y Mermas
  const fetchMovements = useCallback(async (filter: ListInventoryMovementsFilter = {}) => {
    try {
      const data = await catalogIpc.listInventoryMovements(filter);
      setMovements(data || []);
    } catch (err) {
      setError(err as AppError);
    }
  }, []);

  const recordMovement = useCallback(
    async (input: RecordInventoryMovementInput): Promise<InventoryMovementItem | null> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const movement = await catalogIpc.recordInventoryMovement(input);
        setMovements((prev) => [movement, ...prev]);
        // Actualizamos el stock local en la lista de productos
        setProducts((prev) =>
          prev.map((prod) =>
            prod.id === input.producto_id
              ? {
                  ...prod,
                  stock_actual: movement.stock_resultante,
                  alerta_stock_bajo: movement.stock_resultante <= prod.stock_minimo,
                }
              : prod
          )
        );
        emitSidebarAlertsRefresh();
        return movement;
      } catch (err) {
        setError(err as AppError);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    []
  );

  // 4. Simulador Day Overflow
  const simulateExpiration = useCallback(
    async (
      fechaInicio: string,
      tipoPlan: TipoPlan,
      duracionMeses: number | null,
      planId?: number
    ): Promise<PlanExpirationPreviewDto> => {
      try {
        const result = await catalogIpc.previewPlanExpiration(
          fechaInicio,
          planId,
          tipoPlan,
          duracionMeses
        );
        if (result && typeof result.hubo_desbordamiento === 'boolean') {
          setPreview(result);
          return result;
        }
        const fallback = calculateDayOverflowPreview(fechaInicio, tipoPlan, duracionMeses);
        setPreview(fallback);
        return fallback;
      } catch (_err) {
        // Fallback matemático instantáneo garantizado
        const fallback = calculateDayOverflowPreview(fechaInicio, tipoPlan, duracionMeses);
        setPreview(fallback);
        return fallback;
      }
    },
    []
  );

  // Carga global unificada
  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedPlans, fetchedProducts, fetchedMovements] = await Promise.all([
        catalogIpc.listPlans({}),
        catalogIpc.listProducts({}),
        catalogIpc.listInventoryMovements({ limit: 100 }),
      ]);
      setPlans(fetchedPlans || []);
      setProducts(fetchedProducts || []);
      setMovements(fetchedMovements || []);
    } catch (err) {
      setError(err as AppError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      refreshAll();
    }
  }, [autoFetch, refreshAll]);

  return {
    plans,
    products,
    movements,
    preview,
    isLoading,
    isActionLoading,
    error,
    clearError,
    refreshAll,
    fetchPlans,
    createPlan,
    updatePlan,
    togglePlanActive,
    fetchProducts,
    createProduct,
    updateProduct,
    toggleProductActive,
    fetchMovements,
    recordMovement,
    simulateExpiration,
  };
}
