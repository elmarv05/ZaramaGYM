// ============================================================================
// HOOK REACTIVO: PUNTO DE VENTA (POS), CAJA Y CRÉDITOS (SLICE 4)
// Control de Turnos, Carrito Multidominio, Split de Pagos, Tachados y Deudores
// Ubicación: src/hooks/usePos.ts
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  calculateCartTotals,
  calculatePaymentSplit,
  CartTotals,
  PaymentSplitResult,
  roundMoney,
  validatePosSaleInput,
} from '../domain/pos';
import { catalogIpc } from '../services/ipc/catalogIpc';
import { entityIpc } from '../services/ipc/entityIpc';
import { posIpc } from '../services/ipc/posIpc';
import { AppError } from '../types/auth';
import { PlanListItem, ProductListItem } from '../types/catalog';
import { ClientListItem } from '../types/entity';
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
  PosPaymentInput,
  PosSaleItemInput,
  ResolveStruckSaleInput,
  SaleDetailDto,
  SaleFilter,
  SaleListItemDto,
  StrikeSaleInput,
} from '../types/pos';

export interface UsePosOptions {
  autoFetch?: boolean;
}

export interface UsePosResult {
  // 1. Estado y Turno de Caja
  activeShift: CashShiftDto | null;
  shiftSummary: CashShiftSummaryDto | null;
  shifts: CashShiftDto[];
  isLoadingShift: boolean;

  // 2. Carrito de Compras POS
  cartItems: PosSaleItemInput[];
  descuento: string;
  pagos: PosPaymentInput[];
  selectedClient: ClientListItem | null;
  totals: CartTotals;
  splitResult: PaymentSplitResult;

  // 3. Catálogo de selección para Caja
  availableProducts: ProductListItem[];
  availablePlans: PlanListItem[];
  availableClients: ClientListItem[];

  // 4. Ventas del Turno y Auditoría
  sales: SaleListItemDto[];
  selectedSaleDetail: SaleDetailDto | null;

  // 5. Deudores y Membresías
  credits: ClientCreditDto[];
  memberships: ClientMembershipDto[];

  // 6. Estados de Carga y Error
  isLoading: boolean;
  isActionLoading: boolean;
  error: AppError | null;

  // 7. Acciones y Métodos
  clearError: () => void;
  refreshAll: () => Promise<void>;
  refreshShift: () => Promise<void>;
  openShift: (input: OpenCashShiftInput) => Promise<CashShiftDto | null>;
  closeShift: (input: CloseCashShiftInput) => Promise<CashShiftDto | null>;
  fetchShifts: (filter?: CashShiftFilter) => Promise<void>;
  fetchShiftSummary: (shiftId?: number) => Promise<void>;

  // Carrito
  addItem: (item: PosSaleItemInput) => void;
  updateItemQuantity: (index: number, quantity: number) => void;
  removeItem: (index: number) => void;
  clearCart: () => void;
  setDescuento: (desc: string) => void;
  setSelectedClient: (client: ClientListItem | null) => void;
  setPagos: (pagos: PosPaymentInput[]) => void;
  updatePayment: (metodo: PosPaymentInput['metodo_pago'], monto: string, referencia?: string) => void;
  removePayment: (metodo: PosPaymentInput['metodo_pago']) => void;
  createSale: (notas?: string) => Promise<SaleDetailDto | null>;

  // Ventas y Tachados
  fetchSales: (filter?: SaleFilter) => Promise<void>;
  fetchSaleDetail: (saleId: number) => Promise<SaleDetailDto | null>;
  strikeSale: (saleId: number, input: StrikeSaleInput) => Promise<SaleDetailDto | null>;
  resolveStruckSale: (saleId: number, input: ResolveStruckSaleInput) => Promise<SaleDetailDto | null>;

  // Créditos y Membresías
  fetchCredits: (filter?: ClientCreditFilter) => Promise<void>;
  fetchMemberships: (filter?: ClientMembershipFilter) => Promise<void>;
  addCreditAmortizationToCart: (credit: ClientCreditDto, amount?: string) => void;
}

export function usePos(options: UsePosOptions = { autoFetch: true }): UsePosResult {
  const { autoFetch = true } = options;

  // Turnos
  const [activeShift, setActiveShift] = useState<CashShiftDto | null>(null);
  const [shiftSummary, setShiftSummary] = useState<CashShiftSummaryDto | null>(null);
  const [shifts, setShifts] = useState<CashShiftDto[]>([]);
  const [isLoadingShift, setIsLoadingShift] = useState(false);

  // Carrito
  const [cartItems, setCartItems] = useState<PosSaleItemInput[]>([]);
  const [descuento, setDescuento] = useState<string>('0.00');
  const [pagos, setPagos] = useState<PosPaymentInput[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(null);

  // Catálogo disponible
  const [availableProducts, setAvailableProducts] = useState<ProductListItem[]>([]);
  const [availablePlans, setAvailablePlans] = useState<PlanListItem[]>([]);
  const [availableClients, setAvailableClients] = useState<ClientListItem[]>([]);

  // Ventas
  const [sales, setSales] = useState<SaleListItemDto[]>([]);
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<SaleDetailDto | null>(null);

  // Créditos y membresías
  const [credits, setCredits] = useState<ClientCreditDto[]>([]);
  const [memberships, setMemberships] = useState<ClientMembershipDto[]>([]);

  // Estados UI
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Cálculos derivados reactivos
  const totals = useMemo(() => {
    return calculateCartTotals(cartItems, descuento);
  }, [cartItems, descuento]);

  const splitResult = useMemo(() => {
    return calculatePaymentSplit(totals.totalVenta, pagos);
  }, [totals.totalVenta, pagos]);

  // Sincronización de Turno de Caja
  const refreshShift = useCallback(async () => {
    setIsLoadingShift(true);
    try {
      const shift = await posIpc.getActiveCashShift();
      setActiveShift(shift);
      if (shift) {
        const summary = await posIpc.getCashShiftSummary(shift.id).catch(() => null);
        setShiftSummary(summary);
      } else {
        setShiftSummary(null);
      }
    } catch (err: any) {
      // Si falla safeInvoke, no romper interfaz pero registrar error si relevante
      console.warn('Error al consultar turno activo de caja:', err);
    } finally {
      setIsLoadingShift(false);
    }
  }, []);

  const openShift = useCallback(
    async (input: OpenCashShiftInput): Promise<CashShiftDto | null> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const opened = await posIpc.openCashShift(input);
        setActiveShift(opened);
        await refreshShift();
        return opened;
      } catch (err: any) {
        setError(err);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    [refreshShift]
  );

  const closeShift = useCallback(
    async (input: CloseCashShiftInput): Promise<CashShiftDto | null> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const closed = await posIpc.closeCashShift(input);
        setActiveShift(null);
        setShiftSummary(null);
        await refreshShift();
        return closed;
      } catch (err: any) {
        setError(err);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    [refreshShift]
  );

  const fetchShifts = useCallback(async (filter: CashShiftFilter = {}) => {
    try {
      const list = await posIpc.listCashShifts(filter);
      setShifts(list || []);
    } catch (err: any) {
      console.warn('Error al listar turnos:', err);
    }
  }, []);

  const fetchShiftSummary = useCallback(async (shiftId?: number) => {
    try {
      const summary = await posIpc.getCashShiftSummary(shiftId);
      setShiftSummary(summary);
    } catch (err: any) {
      console.warn('Error al obtener resumen de turno:', err);
    }
  }, []);

  // Consultas de datos
  const fetchSales = useCallback(async (filter: SaleFilter = {}) => {
    try {
      const list = await posIpc.listSales(filter);
      setSales(list || []);
    } catch (err: any) {
      console.warn('Error al listar ventas:', err);
    }
  }, []);

  const fetchSaleDetail = useCallback(async (saleId: number): Promise<SaleDetailDto | null> => {
    setIsActionLoading(true);
    try {
      const detail = await posIpc.getSaleDetail(saleId);
      setSelectedSaleDetail(detail);
      return detail;
    } catch (err: any) {
      setError(err);
      return null;
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  const fetchCredits = useCallback(async (filter: ClientCreditFilter = {}) => {
    try {
      const list = await posIpc.listClientCredits(filter);
      setCredits(list || []);
    } catch (err: any) {
      console.warn('Error al listar créditos:', err);
    }
  }, []);

  const fetchMemberships = useCallback(async (filter: ClientMembershipFilter = {}) => {
    try {
      const list = await posIpc.listClientMemberships(filter);
      setMemberships(list || []);
    } catch (err: any) {
      console.warn('Error al listar membresías:', err);
    }
  }, []);

  const fetchCatalogs = useCallback(async () => {
    try {
      const [prods, plns, cls] = await Promise.all([
        catalogIpc.listProducts({ solo_activos: true }).catch(() => []),
        catalogIpc.listPlans({ solo_activos: true }).catch(() => []),
        entityIpc.listClients({ solo_activos: true }).catch(() => []),
      ]);
      setAvailableProducts(prods || []);
      setAvailablePlans(plns || []);
      setAvailableClients(cls || []);
    } catch (err: any) {
      console.warn('Error al cargar catálogos en POS:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([
        refreshShift(),
        fetchCatalogs(),
        fetchSales(),
        fetchCredits(),
        fetchMemberships(),
      ]);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [refreshShift, fetchCatalogs, fetchSales, fetchCredits, fetchMemberships]);

  // Manejo del Carrito POS
  const addItem = useCallback((newItem: PosSaleItemInput) => {
    setCartItems((prev) => {
      // Si es un producto ya existente, incrementamos cantidad
      if (newItem.tipo_item === 'PRODUCTO' && newItem.producto_id) {
        const existingIdx = prev.findIndex(
          (it) => it.tipo_item === 'PRODUCTO' && it.producto_id === newItem.producto_id
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          const curr = updated[existingIdx];
          const newQty = curr.cantidad + (newItem.cantidad || 1);
          const pu = parseFloat(curr.precio_unitario) || 0;
          updated[existingIdx] = {
            ...curr,
            cantidad: newQty,
            subtotal: roundMoney(newQty * pu).toFixed(2),
          };
          return updated;
        }
      }
      return [...prev, newItem];
    });
  }, []);

  const updateItemQuantity = useCallback((index: number, quantity: number) => {
    setCartItems((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      if (quantity <= 0) {
        return prev.filter((_, i) => i !== index);
      }
      const updated = [...prev];
      const item = updated[index];
      const pu = parseFloat(item.precio_unitario) || 0;
      updated[index] = {
        ...item,
        cantidad: quantity,
        subtotal: roundMoney(quantity * pu).toFixed(2),
      };
      return updated;
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setDescuento('0.00');
    setPagos([]);
    setSelectedClient(null);
  }, []);

  // Split de Pagos
  const updatePayment = useCallback(
    (metodo: PosPaymentInput['metodo_pago'], monto: string, referencia?: string) => {
      setPagos((prev) => {
        const filtered = prev.filter((p) => p.metodo_pago !== metodo);
        const hasRef = Boolean(referencia && referencia.trim().length > 0);
        if (monto.trim() === '' && !hasRef) {
          return filtered;
        }
        return [
          ...filtered,
          {
            metodo_pago: metodo,
            monto,
            referencia_operacion: hasRef ? referencia : undefined,
          },
        ];
      });
    },
    []
  );

  const removePayment = useCallback((metodo: PosPaymentInput['metodo_pago']) => {
    setPagos((prev) => prev.filter((p) => p.metodo_pago !== metodo));
  }, []);

  // Registrar Venta POS
  const createSale = useCallback(
    async (notas?: string): Promise<SaleDetailDto | null> => {
      const normalizedPagos: PosPaymentInput[] = pagos
        .filter((p) => {
          const val = parseFloat(p.monto);
          return !isNaN(val) && val > 0;
        })
        .map((p) => ({
          metodo_pago: p.metodo_pago,
          monto: roundMoney(parseFloat(p.monto)).toFixed(2),
          referencia_operacion: p.referencia_operacion?.trim() || undefined,
        }));

      const saleInput: CreatePosSaleInput = {
        cliente_id: selectedClient ? selectedClient.id : null,
        items: cartItems,
        descuento:
          parseFloat(descuento) > 0
            ? roundMoney(parseFloat(descuento)).toFixed(2)
            : undefined,
        pagos: normalizedPagos,
        notas: notas?.trim() || undefined,
      };

      const validation = validatePosSaleInput(saleInput);
      if (!validation.isValid) {
        setError({
          code: 'Validation',
          message: validation.errors.join('; '),
        });
        return null;
      }

      setIsActionLoading(true);
      setError(null);
      try {
        const created = await posIpc.createPosSale(saleInput);
        clearCart();
        await refreshShift();
        await fetchSales();
        await fetchCredits();
        await fetchMemberships();
        return created;
      } catch (err: any) {
        setError(err);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    [cartItems, descuento, pagos, selectedClient, clearCart, refreshShift, fetchSales, fetchCredits, fetchMemberships]
  );

  // Tachado Paso 1
  const strikeSale = useCallback(
    async (saleId: number, input: StrikeSaleInput): Promise<SaleDetailDto | null> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const struck = await posIpc.strikeSale(saleId, input);
        await refreshShift();
        await fetchSales();
        await fetchCredits();
        return struck;
      } catch (err: any) {
        setError(err);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    [refreshShift, fetchSales, fetchCredits]
  );

  // Tachado Paso 2 (Admin)
  const resolveStruckSale = useCallback(
    async (saleId: number, input: ResolveStruckSaleInput): Promise<SaleDetailDto | null> => {
      setIsActionLoading(true);
      setError(null);
      try {
        const resolved = await posIpc.resolveStruckSale(saleId, input);
        await refreshShift();
        await fetchSales();
        await fetchCredits();
        return resolved;
      } catch (err: any) {
        setError(err);
        return null;
      } finally {
        setIsActionLoading(false);
      }
    },
    [refreshShift, fetchSales, fetchCredits]
  );

  // Cargar cuota/amortización al carrito con 1 clic
  const addCreditAmortizationToCart = useCallback(
    (credit: ClientCreditDto, amount?: string) => {
      // Buscamos o asociamos el cliente
      const matchedClient = availableClients.find((c) => c.id === credit.cliente_id) || {
        id: credit.cliente_id,
        persona_id: 0,
        nombres: credit.cliente_nombre_completo,
        apellidos: '',
        tipo_documento: 'DNI' as any,
        numero_documento: credit.cliente_numero_documento,
        telefono: credit.cliente_telefono || null,
        email: null,
        codigo_qr_token: `ZG-QR-${credit.cliente_id}`,
        peso_actual_kg: null,
        estado_activo: true,
        created_at: credit.created_at,
      };

      setSelectedClient(matchedClient as ClientListItem);

      const montoAmortizar = amount ? parseFloat(amount) : parseFloat(credit.saldo_pendiente);
      const amortizacionItem: PosSaleItemInput = {
        tipo_item: 'AMORTIZACION_CREDITO',
        credito_id: credit.id,
        cantidad: 1,
        precio_unitario: montoAmortizar.toFixed(2),
        subtotal: montoAmortizar.toFixed(2),
      };

      addItem(amortizacionItem);
    },
    [availableClients, addItem]
  );

  useEffect(() => {
    if (autoFetch) {
      refreshAll();
    }
  }, [autoFetch, refreshAll]);

  return {
    activeShift,
    shiftSummary,
    shifts,
    isLoadingShift,
    cartItems,
    descuento,
    pagos,
    selectedClient,
    totals,
    splitResult,
    availableProducts,
    availablePlans,
    availableClients,
    sales,
    selectedSaleDetail,
    credits,
    memberships,
    isLoading,
    isActionLoading,
    error,
    clearError,
    refreshAll,
    refreshShift,
    openShift,
    closeShift,
    fetchShifts,
    fetchShiftSummary,
    addItem,
    updateItemQuantity,
    removeItem,
    clearCart,
    setDescuento,
    setSelectedClient,
    setPagos,
    updatePayment,
    removePayment,
    createSale,
    fetchSales,
    fetchSaleDetail,
    strikeSale,
    resolveStruckSale,
    fetchCredits,
    fetchMemberships,
    addCreditAmortizationToCart,
  };
}
