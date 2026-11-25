// ============================================================================
// VISTA PRINCIPAL: PUNTO DE VENTA (POS), CAJA Y CRÉDITOS (SLICE 4)
// Núcleo transaccional: 4 Pestañas operativas, Arquitectura de Caja Triple
// Flujo de Tachado en 2 Pasos y Visibilidad Operativa "Caso Juan Pérez"
// Ubicación: src/features/pos/PosView.tsx
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Select,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/primitives';
import { canResolveStruckSale, canStrikeSale, formatMoney } from '../../domain/pos';
import { getLocalDateISO } from '../../domain/printingBackup';
import { usePos } from '../../hooks/usePos';
import { AppError, AuthSession } from '../../types/auth';
import { PlanListItem, ProductListItem } from '../../types/catalog';
import { ClientListItem } from '../../types/entity';
import {
  CashShiftDto,
  ClientCreditDto,
  PosSaleItemInput,
  SaleDetailDto,
  SaleListItemDto,
} from '../../types/pos';
import { CartTable } from './components/CartTable';
import { CloseShiftModal } from './components/CloseShiftModal';
import { DebtorsTable } from './components/DebtorsTable';
import { OpenShiftModal } from './components/OpenShiftModal';
import { PaymentSplitter } from './components/PaymentSplitter';
import { ResolveStruckModal } from './components/ResolveStruckModal';
import { SaleDetailModal } from './components/SaleDetailModal';
import { ShiftStatusHeader, ShiftViewMode } from './components/ShiftStatusHeader';
import { ShiftSummaryPanel } from './components/ShiftSummaryPanel';
import { StrikeSaleModal } from './components/StrikeSaleModal';

export type PosMainTab = 'pos' | 'ventas' | 'deudores' | 'tachados_admin';
export type PosCheckoutStep = 'client' | 'items' | 'payment';

export interface PosViewProps {
  currentSession: AuthSession;
  initialTab?: PosMainTab;

  // Inyección opcional para testing desacoplado
  activeShift?: CashShiftDto | null;
  products?: ProductListItem[];
  plans?: PlanListItem[];
  clients?: ClientListItem[];
  sales?: SaleListItemDto[];
  credits?: ClientCreditDto[];

  isLoading?: boolean;
  error?: AppError | null;
  onClearError?: () => void;
}

export const PosView: React.FC<PosViewProps> = (props) => {
  const {
    currentSession,
    initialTab = 'pos',
    activeShift: propActiveShift,
    products: propProducts,
    plans: propPlans,
    clients: propClients,
    sales: propSales,
    credits: propCredits,
    isLoading: propIsLoading,
    error: propError,
    onClearError,
  } = props;

  const shouldAutoFetch =
    propActiveShift === undefined &&
    propProducts === undefined &&
    propPlans === undefined &&
    propSales === undefined;

  const hook = usePos({ autoFetch: shouldAutoFetch });

  // Estados de navegación y vistas
  const [activeTab, setActiveTab] = useState<PosMainTab>(initialTab);
  const [viewMode, setViewMode] = useState<ShiftViewMode>('FISICA');
  const [posStep, setPosStep] = useState<PosCheckoutStep>('client');
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const goToStep = useCallback((nextStep: PosCheckoutStep) => {
    setPosStep(nextStep);
    requestAnimationFrame(() => {
      stepHeadingRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Modales
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [strikeModalSale, setStrikeModalSale] = useState<SaleListItemDto | null>(null);
  const [resolveModalSale, setResolveModalSale] = useState<SaleListItemDto | null>(null);
  const [detailModalSale, setDetailModalSale] = useState<SaleDetailDto | null>(null);

  // Estados de búsqueda y selección en Catálogo del POS
  const [catalogSubTab, setCatalogSubTab] = useState<'productos' | 'planes'>('productos');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [planStartDate, setPlanStartDate] = useState<string>(
    () => getLocalDateISO()
  );

  // Colecciones efectivas
  const activeShift = propActiveShift !== undefined ? propActiveShift : hook.activeShift;
  const isShiftOpen = Boolean(activeShift && activeShift.estado === 'ABIERTO');
  const products = propProducts ?? hook.availableProducts;
  const plans = propPlans ?? hook.availablePlans;
  const clients = propClients ?? hook.availableClients;
  const sales = propSales ?? hook.sales;
  const credits = propCredits ?? hook.credits;

  const isLoading = propIsLoading ?? hook.isLoading;
  const error = propError ?? hook.error;

  useEffect(() => {
    if (!isShiftOpen) {
      setPosStep('client');
    }
  }, [isShiftOpen]);

  const hasClientRequiredItem = useMemo(() => {
    return hook.cartItems.some(
      (it) => it.tipo_item === 'PLAN' || it.tipo_item === 'AMORTIZACION_CREDITO'
    );
  }, [hook.cartItems]);

  const isAdmin = currentSession?.rol === 'ADMINISTRADOR';
  const canResolve = canResolveStruckSale(currentSession?.rol);
  const canStrike = canStrikeSale(currentSession?.rol);

  // Filtrado de Productos para el POS
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.nombre.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        p.codigo_sku.toLowerCase().includes(catalogSearch.toLowerCase());
      return matchSearch;
    });
  }, [products, catalogSearch]);

  // Filtrado de Planes para el POS
  const filteredPlans = useMemo(() => {
    return plans.filter((pl) => {
      const matchSearch =
        pl.nombre.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        pl.codigo.toLowerCase().includes(catalogSearch.toLowerCase());
      return matchSearch;
    });
  }, [plans, catalogSearch]);

  // Filtrado de Clientes para el Selector
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return [];
    const term = clientSearch.toLowerCase();
    return clients.filter((c) => {
      return (
        c.nombres.toLowerCase().includes(term) ||
        c.apellidos.toLowerCase().includes(term) ||
        c.numero_documento.includes(term) ||
        c.codigo_qr_token.toLowerCase().includes(term)
      );
    });
  }, [clients, clientSearch]);

  // Créditos pendientes del cliente seleccionado (si tiene deudas)
  const clientPendingCredits = useMemo(() => {
    if (!hook.selectedClient) return [];
    return credits.filter(
      (c) => c.cliente_id === hook.selectedClient?.id && c.estado === 'PENDIENTE'
    );
  }, [hook.selectedClient, credits]);

  // Manejador para agregar producto al carrito
  const handleAddProduct = (prod: ProductListItem) => {
    if (prod.stock_actual <= 0) return;
    const item: PosSaleItemInput = {
      tipo_item: 'PRODUCTO',
      producto_id: prod.id,
      cantidad: 1,
      precio_unitario: prod.precio_venta,
      subtotal: prod.precio_venta,
      ...({ descripcion_producto: prod.nombre } as any),
    };
    hook.addItem(item);
  };

  // Manejador para agregar plan al carrito
  const handleAddPlan = (plan: PlanListItem) => {
    const planPrice = plan.precio_base || plan.precio || '0.00';
    const item: PosSaleItemInput = {
      tipo_item: 'PLAN',
      plan_id: plan.id,
      cantidad: 1,
      precio_unitario: planPrice,
      subtotal: planPrice,
      fecha_inicio_plan: planStartDate,
      ...({ nombre_plan: `${plan.nombre} (${plan.codigo})` } as any),
    };
    hook.addItem(item);
  };

  // Manejador para amortizar un crédito y llevarlo directo al carrito (avanza al Paso 2 si hay turno abierto)
  const handleAmortizeCredit = (credit: ClientCreditDto) => {
    hook.addCreditAmortizationToCart(credit);
    setActiveTab('pos');
    if (isShiftOpen) {
      goToStep('items');
    }
  };

  // Manejador para confirmar venta final, reiniciar el flujo al Paso 1 y abrir el modal del detalle generado
  const handleExecuteSale = async () => {
    const created = await hook.createSale();
    if (created) {
      setClientSearch('');
      setCatalogSearch('');
      setPosStep('client');
      setDetailModalSale(created);
    }
  };

  // Filtros de ventas en la pestaña 2 (Estado, Cliente, Rango de Fechas, Usuario)
  const [salesFilterStatus, setSalesFilterStatus] = useState<string>('TODAS');
  const [salesFilterClient, setSalesFilterClient] = useState<string>('');
  const [salesFilterUser, setSalesFilterUser] = useState<string>('TODOS');
  const [salesFilterDateFrom, setSalesFilterDateFrom] = useState<string>('');
  const [salesFilterDateTo, setSalesFilterDateTo] = useState<string>('');

  const availableSaleUsers = useMemo(() => {
    const users = new Set<string>();
    sales.forEach((s) => {
      if (s.usuario_vendedor_username) {
        users.add(s.usuario_vendedor_username);
      }
    });
    if (currentSession?.username) {
      users.add(currentSession.username);
    }
    return Array.from(users).sort();
  }, [sales, currentSession?.username]);

  const hasActiveSaleFilters =
    salesFilterStatus !== 'TODAS' ||
    salesFilterClient.trim() !== '' ||
    salesFilterUser !== 'TODOS' ||
    salesFilterDateFrom !== '' ||
    salesFilterDateTo !== '';

  const handleClearSaleFilters = () => {
    setSalesFilterStatus('TODAS');
    setSalesFilterClient('');
    setSalesFilterUser('TODOS');
    setSalesFilterDateFrom('');
    setSalesFilterDateTo('');
  };

  useEffect(() => {
    if (!shouldAutoFetch || activeTab !== 'ventas') return;
    void hook.fetchSales({
      estado_venta:
        salesFilterStatus !== 'TODAS' ? (salesFilterStatus as any) : undefined,
      cliente_busqueda: salesFilterClient.trim() || undefined,
      usuario_vendedor_username:
        salesFilterUser !== 'TODOS' ? salesFilterUser : undefined,
      fecha_desde: salesFilterDateFrom || undefined,
      fecha_hasta: salesFilterDateTo || undefined,
    });
  }, [
    shouldAutoFetch,
    activeTab,
    salesFilterStatus,
    salesFilterClient,
    salesFilterUser,
    salesFilterDateFrom,
    salesFilterDateTo,
    hook.fetchSales,
  ]);

  const filteredSales = useMemo(() => {
    const clientTerm = salesFilterClient.trim().toLowerCase();
    return sales.filter((s) => {
      if (salesFilterStatus !== 'TODAS' && s.estado_venta !== salesFilterStatus) {
        return false;
      }
      if (clientTerm) {
        const clientName = (s.cliente_nombre_completo || 'Público General').toLowerCase();
        if (!clientName.includes(clientTerm)) {
          return false;
        }
      }
      if (salesFilterUser !== 'TODOS') {
        if (s.usuario_vendedor_username.toLowerCase() !== salesFilterUser.toLowerCase()) {
          return false;
        }
      }
      const saleDatePart = (s.created_at || '').slice(0, 10);
      if (salesFilterDateFrom && saleDatePart && saleDatePart < salesFilterDateFrom) {
        return false;
      }
      if (salesFilterDateTo && saleDatePart && saleDatePart > salesFilterDateTo) {
        return false;
      }
      return true;
    });
  }, [
    sales,
    salesFilterStatus,
    salesFilterClient,
    salesFilterUser,
    salesFilterDateFrom,
    salesFilterDateTo,
  ]);

  // Ventas pendientes de resolución para la bandeja de Administrador (Paso 2)
  const struckSales = useMemo(() => {
    return sales.filter((s) => s.estado_venta === 'TACHADA_EN_TURNO');
  }, [sales]);

  // Cantidad de deudores únicos con saldo pendiente (para insignia circular amarilla en el tab)
  const debtorsWithBalanceCount = useMemo(() => {
    return new Set(
      credits
        .filter((c) => c.estado === 'PENDIENTE' && Number(c.saldo_pendiente) > 0)
        .map((c) => c.cliente_id)
    ).size;
  }, [credits]);

  return (
    <div className="w-full flex flex-col gap-6">
      {/* 1. Header de Estado de Caja y Saldo en Gaveta */}
      <ShiftStatusHeader
        shift={activeShift}
        isLoading={hook.isLoadingShift}
        activeViewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenShiftClick={() => setIsOpenShiftModalOpen(true)}
        onCloseShiftClick={() => setIsCloseShiftModalOpen(true)}
        onRefreshClick={hook.refreshShift}
        hideClosedAction={activeTab === 'pos'}
      />

      {/* Banner de Resumen según vista si hay turno abierto */}
      {isShiftOpen && activeShift && (
        <ShiftSummaryPanel
          shift={activeShift}
          summary={hook.shiftSummary}
          activeViewMode={viewMode}
        />
      )}

      {/* Alerta de Error Global si existe */}
      {error && (
        <Alert
          variant="danger"
          title="Error en Operación POS"
          onClose={onClearError || hook.clearError}
        >
          {error.message}
        </Alert>
      )}

      {/* Indicador de carga de fondo */}
      {isLoading && (
        <div className="w-full text-center py-1 text-xs text-txt-muted animate-pulse">
          Actualizando datos del sistema POS...
        </div>
      )}

      {/* 2. Barra de Pestañas Operativas (Radix Tabs) */}
      <Tabs
        value={activeTab}
        onValueChange={(nextValue) => setActiveTab(nextValue as PosMainTab)}
        className="gap-5"
      >
        <TabsList aria-label="Módulos de Caja y POS">
          <TabsTrigger value="pos">
            <Icon name="pos" className="w-4 h-4" aria-hidden="true" />
            <span>Punto de Venta</span>
          </TabsTrigger>

          <TabsTrigger value="ventas">
            <Icon name="receipt" className="w-4 h-4" aria-hidden="true" />
            <span>Ventas del Turno & Tachado</span>
          </TabsTrigger>

          <TabsTrigger value="deudores">
            <Icon name="credit-card" className="w-4 h-4" aria-hidden="true" />
            <span>Deudores & Créditos</span>
            {debtorsWithBalanceCount > 0 && (
              <Badge
                variant="warning"
                size="sm"
                className="font-mono px-1.5 py-0 text-[10px]"
                title={`${debtorsWithBalanceCount} deudor(es) con saldo pendiente`}
              >
                {debtorsWithBalanceCount}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="tachados_admin">
            <Icon name="shield" className="w-4 h-4" aria-hidden="true" />
            <span>Auditoría Tachados</span>
            {struckSales.length > 0 && (
              <Badge
                variant="danger"
                size="sm"
                className="font-mono px-1.5 py-0 text-[10px]"
              >
                {struckSales.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================== */}
        {/* PESTAÑA 1: PUNTO DE VENTA (POS) — FLUJO SECUENCIAL Y PROGRESIVO       */}
        {/* ==================================================================== */}
        <TabsContent value="pos" className="flex flex-col gap-6">
          {/* ESTADO 0A: CARGANDO TURNO DE CAJA (SKELETON SIN CLS) */}
          {hook.isLoadingShift && !activeShift ? (
            <Card padding="lg" className="w-full min-h-[320px] gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Skeleton className="h-12 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
                <Skeleton className="h-12 rounded-xl" />
              </div>
              <Skeleton className="h-52 w-full rounded-xl" />
            </Card>
          ) : !isShiftOpen ? (
            /* ESTADO 0B: SIN CAJA ABIERTA -> MENSAJE Y ACCIÓN "ABRIR TURNO DE CAJA" */
            <Card
              data-slot="pos-closed-shift-state"
              data-testid="pos-closed-shift-state"
              className="w-full min-h-[320px] border-2 border-dashed p-8 sm:p-12 items-center justify-center text-center gap-4"
            >
              <div
                aria-hidden="true"
                className="w-16 h-16 rounded-2xl bg-status-danger-bg border border-status-danger-border text-status-danger flex items-center justify-center shadow-xs"
              >
                <Icon name="lock" className="w-8 h-8" />
              </div>

              <div className="max-w-md flex flex-col items-center gap-2">
                <Badge variant="danger" size="sm">
                  Caja Cerrada
                </Badge>
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-txt-primary">
                  Abrir turno de caja
                </h2>
                <p className="text-xs sm:text-sm text-txt-secondary leading-relaxed">
                  No existe un turno de caja activo en esta estación. Abre un turno asignando el fondo inicial en efectivo para habilitar la selección de cliente, catálogo y registro de ventas.
                </p>
              </div>

              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={() => setIsOpenShiftModalOpen(true)}
                leftIcon={<Icon name="key" className="w-4 h-4" />}
                className="mt-1 font-bold shadow-sm"
              >
                Abrir turno de caja
              </Button>
            </Card>
          ) : (
            /* FLUJO SECUENCIAL PROGRESIVO EN 3 PASOS CON TURNO DE CAJA ABIERTO */
            <div className="flex flex-col gap-6">
              {/* STEPPER ACCESIBLE DE PROGRESO (ARIA-CURRENT="STEP") */}
              <nav aria-label="Progreso de venta POS" data-slot="pos-stepper">
                <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {([
                    {
                      id: 'client' as const,
                      stepNum: 1,
                      title: 'Seleccionar Cliente',
                      subtitle: hook.selectedClient
                        ? `${hook.selectedClient.nombres} ${hook.selectedClient.apellidos}`
                        : posStep !== 'client'
                        ? 'Público General'
                        : 'Socio o venta rápida',
                      icon: 'user' as const,
                    },
                    {
                      id: 'items' as const,
                      stepNum: 2,
                      title: 'Productos y Detalle',
                      subtitle:
                        hook.cartItems.length > 0
                          ? `${hook.cartItems.length} ítem(s) • S/ ${formatMoney(hook.totals.totalVenta)}`
                          : 'Catálogo y carrito',
                      icon: 'package' as const,
                    },
                    {
                      id: 'payment' as const,
                      stepNum: 3,
                      title: 'Métodos de Pago',
                      subtitle: 'Efectivo, Yape, Plin o Tarjeta',
                      icon: 'credit-card' as const,
                    },
                  ]).map((stepItem) => {
                    const stepOrder: Record<PosCheckoutStep, number> = {
                      client: 1,
                      items: 2,
                      payment: 3,
                    };
                    const currentOrder = stepOrder[posStep];
                    const isCurrent = posStep === stepItem.id;
                    const isCompleted = currentOrder > stepItem.stepNum;
                    const canJumpBack = isCompleted;

                    return (
                      <li key={stepItem.id} aria-current={isCurrent ? 'step' : undefined}>
                        <button
                          type="button"
                          disabled={!canJumpBack && !isCurrent}
                          onClick={() => {
                            if (canJumpBack) goToStep(stepItem.id);
                          }}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 ${
                            isCurrent
                              ? 'bg-surface border-brand shadow-xs text-txt-primary'
                              : isCompleted
                              ? 'bg-status-success-bg/70 border-status-success-border text-txt-primary hover:bg-status-success-bg cursor-pointer'
                              : 'bg-canvas-subtle/60 border-border text-txt-muted cursor-default opacity-80'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                              isCurrent
                                ? 'bg-brand text-brand-text'
                                : isCompleted
                                ? 'bg-status-success text-brand-text'
                                : 'bg-surface border border-border text-txt-muted'
                            }`}
                          >
                            {isCompleted ? (
                              <Icon name="check" className="w-3.5 h-3.5" />
                            ) : (
                              stepItem.stepNum
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold block truncate">
                              {stepItem.title}
                            </span>
                            <span className="text-[11px] text-txt-secondary block truncate">
                              {stepItem.subtitle}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>

              {/* ============================================================== */}
              {/* PASO 1: SOLO PANEL PARA SELECCIONAR EL CLIENTE                 */}
              {/* ============================================================== */}
              {posStep === 'client' && (
                <Card
                  data-slot="pos-step-client"
                  data-testid="pos-step-client"
                  className="max-w-3xl w-full mx-auto"
                >
                  <CardHeader>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <CardTitle
                        ref={stepHeadingRef}
                        tabIndex={-1}
                        className="flex items-center gap-2 text-base focus:outline-none"
                      >
                        <Icon name="user" className="w-4 h-4 text-brand" aria-hidden="true" />
                        <span>Paso 1: Seleccionar Cliente o Socio</span>
                      </CardTitle>
                      <CardDescription>
                        Identifica al socio para inscribir planes, amortizar deudas o vender a crédito, o continúa como Público General para ventas rápidas al contado.
                      </CardDescription>
                    </div>
                    {hook.selectedClient ? (
                      <Badge variant="success" size="sm">
                        Identificado
                      </Badge>
                    ) : (
                      <Badge variant="default" size="sm">
                        Sin socio asignado
                      </Badge>
                    )}
                  </CardHeader>

                  <CardContent className="flex flex-col gap-4">
                    {/* Buscador de socios */}
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor="pos-client-search-input"
                        className="text-xs font-semibold text-txt-secondary"
                      >
                        Buscar socio en el directorio
                      </label>
                      <Input
                        id="pos-client-search-input"
                        inputSize="md"
                        aria-label="Buscar cliente o socio"
                        placeholder="Buscar por Apellidos, Nombres, DNI o QR..."
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        leftIcon={<Icon name="search" className="w-4 h-4" />}
                      />
                    </div>

                    {/* Tarjeta del socio seleccionado */}
                    {hook.selectedClient && (
                      <div className="p-3.5 bg-status-success-bg/60 border border-status-success-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="font-bold text-txt-primary text-sm truncate">
                            {hook.selectedClient.nombres} {hook.selectedClient.apellidos}
                          </h4>
                          <p className="text-xs text-txt-secondary font-mono">
                            DNI: {hook.selectedClient.numero_documento} • QR: {hook.selectedClient.codigo_qr_token}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => hook.setSelectedClient(null)}
                          className="shrink-0 bg-surface text-xs"
                        >
                          Quitar selección
                        </Button>
                      </div>
                    )}

                    {/* Deudas pendientes del socio seleccionado */}
                    {clientPendingCredits.length > 0 && (
                      <div className="p-3.5 bg-status-warning-bg border border-status-warning-border rounded-xl flex flex-col gap-2.5">
                        <span className="text-xs font-bold text-status-warning inline-flex items-center gap-1.5">
                          <Icon name="warning" className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>Este socio tiene {clientPendingCredits.length} deuda(s) pendiente(s):</span>
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {clientPendingCredits.map((cred) => (
                            <div
                              key={cred.id}
                              className="flex items-center justify-between gap-2 bg-surface p-2.5 rounded-lg border border-status-warning-border text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-txt-primary block truncate">
                                  {cred.descripcion}
                                </span>
                                <span className="text-[11px] text-txt-muted block">
                                  Saldo: S/ {formatMoney(cred.saldo_pendiente)}
                                </span>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  hook.addCreditAmortizationToCart(cred);
                                  goToStep('items');
                                }}
                                className="text-[11px] font-bold shrink-0"
                              >
                                + Amortizar
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resultados de búsqueda o sugerencias rápidas del directorio */}
                    {clientSearch.trim().length > 0 ? (
                      <div className="border border-border rounded-xl bg-canvas-subtle/50 overflow-hidden">
                        {filteredClients.length > 0 ? (
                          <div className="max-h-56 overflow-y-auto [scrollbar-gutter:stable] overscroll-contain divide-y divide-border">
                            {filteredClients.map((c) => {
                              const isSelected = hook.selectedClient?.id === c.id;
                              return (
                                <div
                                  key={c.id}
                                  className="p-3 bg-surface hover:bg-surface-hover flex items-center justify-between gap-3 transition-colors"
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-txt-primary text-xs truncate">
                                      {c.nombres} {c.apellidos}
                                    </span>
                                    <span className="text-[11px] text-txt-muted font-mono truncate">
                                      Doc: {c.numero_documento} • {c.codigo_qr_token}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={isSelected ? 'secondary' : 'primary'}
                                    aria-label={`Seleccionar a ${c.nombres} ${c.apellidos}`}
                                    onClick={() => {
                                      hook.setSelectedClient(c);
                                      setClientSearch('');
                                    }}
                                    className="text-xs shrink-0"
                                  >
                                    {isSelected ? 'Seleccionado' : 'Seleccionar'}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-5 text-center flex flex-col items-center gap-2">
                            <span className="text-xs text-txt-muted">
                              No se encontraron clientes con "{clientSearch}"
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setClientSearch('')}
                            >
                              Limpiar búsqueda
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      !hook.selectedClient &&
                      clients.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold text-txt-muted uppercase tracking-wider">
                            Socios registrados recientes
                          </span>
                          <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto [scrollbar-gutter:stable] overscroll-contain divide-y divide-border">
                            {clients.slice(0, 6).map((c) => (
                              <div
                                key={c.id}
                                className="p-2.5 px-3 bg-surface hover:bg-surface-hover flex items-center justify-between gap-3 transition-colors"
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className="font-semibold text-txt-primary text-xs truncate">
                                    {c.nombres} {c.apellidos}
                                  </span>
                                  <span className="text-[11px] text-txt-muted font-mono truncate">
                                    Doc: {c.numero_documento} • {c.codigo_qr_token}
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  aria-label={`Seleccionar a ${c.nombres} ${c.apellidos}`}
                                  onClick={() => hook.setSelectedClient(c)}
                                  className="text-xs shrink-0"
                                >
                                  Seleccionar
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </CardContent>

                  <CardFooter className="justify-between">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        hook.setSelectedClient(null);
                        goToStep('items');
                      }}
                      leftIcon={<Icon name="users" className="w-4 h-4" />}
                    >
                      Continuar como Público General
                    </Button>

                    <Button
                      type="button"
                      variant="primary"
                      data-testid="btn-pos-continue-to-items"
                      disabled={!hook.selectedClient}
                      onClick={() => goToStep('items')}
                      rightIcon={<Icon name="arrow-right" className="w-4 h-4" />}
                      className="font-bold"
                    >
                      Continuar a Productos
                    </Button>
                  </CardFooter>
                </Card>
              )}

              {/* ============================================================== */}
              {/* PASO 2: PRODUCTOS + LISTA DE DETALLES ESCOGIDOS + CONFIRMAR    */}
              {/* ============================================================== */}
              {posStep === 'items' && (
                <div
                  data-slot="pos-step-items"
                  data-testid="pos-step-items"
                  className="flex flex-col gap-5"
                >
                  {/* Barra de contexto del cliente actual y retorno al Paso 1 */}
                  <Card padding="sm" className="sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        aria-hidden="true"
                        className="w-9 h-9 rounded-lg bg-canvas-subtle border border-border flex items-center justify-center text-brand shrink-0"
                      >
                        <Icon name="user" className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3
                          ref={stepHeadingRef}
                          tabIndex={-1}
                          className="text-sm font-bold text-txt-primary truncate focus:outline-none"
                        >
                          {hook.selectedClient
                            ? `Cliente: ${hook.selectedClient.nombres} ${hook.selectedClient.apellidos}`
                            : 'Cliente: Público General (Venta Rápida)'}
                        </h3>
                        <p className="text-xs text-txt-muted truncate">
                          {hook.selectedClient
                            ? `DNI: ${hook.selectedClient.numero_documento} • Selecciona productos, planes o cuotas`
                            : 'Solo productos al contado. Para planes o créditos identifica un socio.'}
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => goToStep('client')}
                      leftIcon={<Icon name="chevron-left" className="w-4 h-4" />}
                      className="shrink-0"
                    >
                      Cambiar Cliente
                    </Button>
                  </Card>

                  {hasClientRequiredItem && !hook.selectedClient && (
                    <Alert variant="warning" floating={false}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span>
                          Los planes de membresía y amortizaciones requieren un socio identificado antes de pasar al cobro.
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => goToStep('client')}
                          className="shrink-0"
                        >
                          Seleccionar Socio
                        </Button>
                      </div>
                    </Alert>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Apartado de Productos y Planes (7 columnas) */}
                    <Card padding="sm" className="lg:col-span-7 min-w-0 gap-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={catalogSubTab === 'productos' ? 'primary' : 'secondary'}
                            onClick={() => setCatalogSubTab('productos')}
                            leftIcon={<Icon name="package" className="w-3.5 h-3.5" aria-hidden="true" />}
                          >
                            Productos en Stock
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={catalogSubTab === 'planes' ? 'primary' : 'secondary'}
                            onClick={() => setCatalogSubTab('planes')}
                            leftIcon={<Icon name="catalog" className="w-3.5 h-3.5" aria-hidden="true" />}
                          >
                            Planes & Pases
                          </Button>
                        </div>

                        <div className="w-full sm:w-52">
                          <Input
                            inputSize="sm"
                            aria-label="Buscar en catálogo"
                            placeholder="Buscar en catálogo..."
                            value={catalogSearch}
                            onChange={(e) => setCatalogSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Sub-pestaña Productos */}
                      {catalogSubTab === 'productos' && (
                        filteredProducts.length === 0 ? (
                          <div className="py-10 text-center flex flex-col items-center gap-2">
                            <Icon name="package" className="w-7 h-7 text-txt-muted" aria-hidden="true" />
                            <p className="text-xs text-txt-muted">
                              No se encontraron productos disponibles con ese criterio.
                            </p>
                            {catalogSearch.trim().length > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setCatalogSearch('')}
                              >
                                Limpiar filtro
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto [scrollbar-gutter:stable] overscroll-contain pr-1">
                            {filteredProducts.map((p) => {
                              const isOutOfStock = p.stock_actual <= 0;
                              return (
                                <div
                                  key={p.id}
                                  className={`p-3 rounded-lg border flex flex-col justify-between gap-2 transition-[border-color,box-shadow,background-color] duration-150 ${
                                    isOutOfStock
                                      ? 'bg-canvas-subtle/50 border-border opacity-60'
                                      : 'bg-surface border-border hover:border-brand/70 hover:shadow-xs'
                                  }`}
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-bold text-txt-primary text-xs line-clamp-1">
                                      {p.nombre}
                                    </span>
                                    <span className="text-[11px] text-txt-muted">
                                      SKU: {p.codigo_sku} • Stock: {p.stock_actual} {p.unidad_medida}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                                    <span className="font-extrabold text-sm text-status-success">
                                      S/ {formatMoney(p.precio_venta)}
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={isOutOfStock ? 'outline' : 'primary'}
                                      disabled={isOutOfStock}
                                      onClick={() => handleAddProduct(p)}
                                      className="text-xs font-bold"
                                    >
                                      {isOutOfStock ? 'Agotado' : '+ Agregar'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )
                      )}

                      {/* Sub-pestaña Planes */}
                      {catalogSubTab === 'planes' && (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-3 bg-canvas-subtle p-2.5 rounded-lg border border-border text-xs">
                            <label
                              htmlFor="plan-start-date"
                              className="font-bold text-txt-secondary whitespace-nowrap"
                            >
                              Fecha de Inicio del Plan:
                            </label>
                            <div className="w-40">
                              <Input
                                id="plan-start-date"
                                type="date"
                                inputSize="sm"
                                value={planStartDate}
                                onChange={(e) => setPlanStartDate(e.target.value)}
                                className="font-semibold py-1"
                              />
                            </div>
                          </div>

                          {filteredPlans.length === 0 ? (
                            <div className="py-10 text-center flex flex-col items-center gap-2">
                              <Icon name="catalog" className="w-7 h-7 text-txt-muted" aria-hidden="true" />
                              <p className="text-xs text-txt-muted">
                                No se encontraron planes activos con ese criterio.
                              </p>
                              {catalogSearch.trim().length > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCatalogSearch('')}
                                >
                                  Limpiar filtro
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto [scrollbar-gutter:stable] overscroll-contain pr-1">
                              {filteredPlans.map((pl) => (
                                <div
                                  key={pl.id}
                                  className="p-3 bg-surface border border-border rounded-lg flex flex-col justify-between gap-2 hover:border-brand/70 hover:shadow-xs transition-[border-color,box-shadow,background-color] duration-150"
                                >
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-bold text-txt-primary text-xs truncate">
                                        {pl.nombre}
                                      </span>
                                      <Badge variant="info" size="sm" className="shrink-0">
                                        {pl.tipo_plan}
                                      </Badge>
                                    </div>
                                    <span className="text-[11px] text-txt-muted">
                                      Código: {pl.codigo} • Duración:{' '}
                                      {pl.duracion_meses ? `${pl.duracion_meses} meses` : 'Pase Diario'}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                                    <span className="font-extrabold text-sm text-status-success">
                                      S/ {formatMoney(pl.precio_base || pl.precio || '0.00')}
                                    </span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="primary"
                                      onClick={() => handleAddPlan(pl)}
                                      className="text-xs font-bold"
                                    >
                                      + Inscribir
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>

                    {/* Lista de Detalles de Venta Escogidos + Botón Confirmar (5 columnas) */}
                    <div className="lg:col-span-5 min-w-0 flex flex-col gap-4">
                      <CartTable
                        items={hook.cartItems}
                        descuento={hook.descuento}
                        subtotal={hook.totals.subtotal}
                        totalVenta={hook.totals.totalVenta}
                        onUpdateQuantity={hook.updateItemQuantity}
                        onRemoveItem={hook.removeItem}
                        onClearCart={hook.clearCart}
                        onDescuentoChange={hook.setDescuento}
                        disabled={false}
                      />

                      <Card padding="sm" className="gap-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-txt-secondary">
                          <span>Paso siguiente:</span>
                          <span className="font-semibold text-txt-primary">
                            Métodos de pago y confirmación
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2.5">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => goToStep('client')}
                            leftIcon={<Icon name="chevron-left" className="w-4 h-4" />}
                          >
                            Atrás
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            data-testid="btn-pos-confirm-items"
                            disabled={
                              hook.cartItems.length === 0 ||
                              hook.totals.totalVenta <= 0 ||
                              (hasClientRequiredItem && !hook.selectedClient)
                            }
                            onClick={() => goToStep('payment')}
                            rightIcon={<Icon name="arrow-right" className="w-4 h-4" />}
                            className="flex-1 font-extrabold shadow-sm"
                          >
                            Confirmar Detalle y Elegir Pago
                          </Button>
                        </div>
                      </Card>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* PASO 3: MÉTODOS DE PAGO Y CONFIRMAR VENTA                      */}
              {/* ============================================================== */}
              {posStep === 'payment' && (
                <div
                  data-slot="pos-step-payment"
                  data-testid="pos-step-payment"
                  className="flex flex-col gap-5"
                >
                  {/* Barra superior de navegación hacia atrás */}
                  <Card padding="sm" className="sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3
                        ref={stepHeadingRef}
                        tabIndex={-1}
                        className="text-sm sm:text-base font-bold text-txt-primary flex items-center gap-2 focus:outline-none"
                      >
                        <Icon name="credit-card" className="w-4 h-4 text-brand" aria-hidden="true" />
                        <span>Paso 3: Métodos de Pago y Confirmar Venta</span>
                      </h3>
                      <p className="text-xs text-txt-muted">
                        Selecciona el medio de cobro (Efectivo, Digital o Mixto) y confirma la operación para generar el comprobante.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => goToStep('items')}
                      leftIcon={<Icon name="chevron-left" className="w-4 h-4" />}
                      className="shrink-0"
                    >
                      Volver a Productos y Detalles
                    </Button>
                  </Card>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Resumen de los detalles confirmados (5 columnas) */}
                    <Card className="lg:col-span-5 min-w-0">
                      <CardHeader className="py-3.5 px-5">
                        <CardTitle className="text-sm">Resumen de Venta</CardTitle>
                        <Badge variant={hook.selectedClient ? 'success' : 'default'} size="sm">
                          {hook.selectedClient ? 'Socio Identificado' : 'Público General'}
                        </Badge>
                      </CardHeader>

                      <CardContent className="flex flex-col gap-3.5 py-4 px-5 text-xs">
                        <div className="p-3 rounded-lg bg-canvas-subtle border border-border flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] uppercase font-bold text-txt-muted block">
                              Cliente
                            </span>
                            <span className="font-bold text-txt-primary block truncate">
                              {hook.selectedClient
                                ? `${hook.selectedClient.nombres} ${hook.selectedClient.apellidos}`
                                : 'Público General'}
                            </span>
                            {hook.selectedClient && (
                              <span className="text-[11px] text-txt-muted font-mono">
                                DNI: {hook.selectedClient.numero_documento}
                              </span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => goToStep('client')}
                            className="text-xs shrink-0"
                          >
                            Cambiar
                          </Button>
                        </div>

                        <Separator />

                        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto [scrollbar-gutter:stable] overscroll-contain pr-1">
                          {hook.cartItems.map((it, idx) => {
                            const label =
                              it.tipo_item === 'PRODUCTO' && (it as any).descripcion_producto
                                ? (it as any).descripcion_producto
                                : it.tipo_item === 'PLAN'
                                ? (it as any).nombre_plan || 'Plan de Membresía'
                                : it.tipo_item === 'AMORTIZACION_CREDITO'
                                ? `Amortización Crédito #${it.credito_id}`
                                : `Ítem #${idx + 1}`;
                            return (
                              <div
                                key={`${it.tipo_item}-${idx}`}
                                className="flex items-start justify-between gap-3 py-1.5 border-b border-border/60 last:border-b-0"
                              >
                                <div className="min-w-0">
                                  <span className="font-semibold text-txt-primary block truncate">
                                    {it.cantidad} × {label}
                                  </span>
                                  <span className="text-[11px] text-txt-muted">
                                    P.U. S/ {formatMoney(it.precio_unitario)}
                                  </span>
                                </div>
                                <span className="font-bold text-txt-primary tabular-nums shrink-0">
                                  S/ {formatMoney(it.subtotal)}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="pt-2 border-t border-border flex flex-col gap-1.5">
                          <div className="flex justify-between text-txt-secondary">
                            <span>Subtotal:</span>
                            <span className="font-semibold text-txt-primary tabular-nums">
                              S/ {formatMoney(hook.totals.subtotal)}
                            </span>
                          </div>
                          {parseFloat(hook.descuento) > 0 && (
                            <div className="flex justify-between text-status-warning">
                              <span>Descuento aplicado:</span>
                              <span className="font-semibold tabular-nums">
                                - S/ {formatMoney(hook.descuento)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-border">
                            <span className="font-extrabold text-sm text-txt-primary">
                              Total a Pagar:
                            </span>
                            <span className="font-black text-lg text-status-success tabular-nums">
                              S/ {formatMoney(hook.totals.totalVenta)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Métodos de Pago y Botón Confirmar Venta (7 columnas) */}
                    <div className="lg:col-span-7 min-w-0">
                      <PaymentSplitter
                        totalVenta={hook.totals.totalVenta}
                        pagos={hook.pagos}
                        splitResult={hook.splitResult}
                        hasCliente={Boolean(hook.selectedClient)}
                        onUpdatePayment={hook.updatePayment}
                        onRemovePayment={hook.removePayment}
                        onSubmitSale={handleExecuteSale}
                        submitLabel="Confirmar Venta"
                        isLoading={hook.isActionLoading}
                        disabled={!isShiftOpen || hook.cartItems.length === 0}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ==================================================================== */}
        {/* PESTAÑA 2: VENTAS DEL TURNO & TACHADO (PASO 1)                        */}
        {/* ==================================================================== */}
        <TabsContent
          value="ventas"
          className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-4"
        >
          <div className="flex flex-col gap-3 border-b border-border pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-txt-primary text-base flex items-center gap-2">
                  <Icon name="receipt" className="w-4 h-4 text-brand" aria-hidden="true" />
                  Registro de Ventas del Turno y Tachado Inmediato
                </h3>
                <p className="text-xs text-txt-secondary">
                  Historial de transacciones del turno activo. Permite consultar comprobantes y ejecutar el Tachado Paso 1 si el turno sigue abierto.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {hasActiveSaleFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSaleFilters}
                    className="text-xs"
                  >
                    Limpiar filtros
                  </Button>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() =>
                    hook.fetchSales({
                      estado_venta:
                        salesFilterStatus !== 'TODAS'
                          ? (salesFilterStatus as any)
                          : undefined,
                      cliente_busqueda: salesFilterClient.trim() || undefined,
                      usuario_vendedor_username:
                        salesFilterUser !== 'TODOS' ? salesFilterUser : undefined,
                      fecha_desde: salesFilterDateFrom || undefined,
                      fecha_hasta: salesFilterDateTo || undefined,
                    })
                  }
                  title="Refrescar ventas"
                  aria-label="Refrescar ventas"
                >
                  <Icon name="refresh" className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* Barra de Filtros de Ventas: Cliente, Rango de Fechas, Usuario y Estado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 bg-canvas-subtle p-3 rounded-xl border border-border">
              <div>
                <Input
                  inputSize="sm"
                  value={salesFilterClient}
                  onChange={(e) => setSalesFilterClient(e.target.value)}
                  placeholder="Filtrar por cliente..."
                  aria-label="Filtrar ventas por cliente"
                  leftIcon={<Icon name="search" className="w-3.5 h-3.5" aria-hidden="true" />}
                />
              </div>

              <div>
                <Input
                  type="date"
                  inputSize="sm"
                  value={salesFilterDateFrom}
                  onChange={(e) => setSalesFilterDateFrom(e.target.value)}
                  aria-label="Filtrar ventas desde fecha"
                  title="Fecha desde"
                />
              </div>

              <div>
                <Input
                  type="date"
                  inputSize="sm"
                  value={salesFilterDateTo}
                  onChange={(e) => setSalesFilterDateTo(e.target.value)}
                  aria-label="Filtrar ventas hasta fecha"
                  title="Fecha hasta"
                />
              </div>

              <div>
                <Select
                  selectSize="sm"
                  value={salesFilterUser}
                  onChange={(e) => setSalesFilterUser(e.target.value)}
                  aria-label="Filtrar ventas por usuario"
                  options={[
                    { value: 'TODOS', label: 'Todos los Usuarios' },
                    ...availableSaleUsers.map((u) => ({
                      value: u,
                      label: `@${u}`,
                    })),
                  ]}
                />
              </div>

              <div>
                <Select
                  selectSize="sm"
                  value={salesFilterStatus}
                  onChange={(e) => setSalesFilterStatus(e.target.value)}
                  aria-label="Filtrar ventas por estado"
                  options={[
                    { value: 'TODAS', label: 'Todos los Estados' },
                    { value: 'COMPLETADA', label: 'Solo Completadas' },
                    { value: 'TACHADA_EN_TURNO', label: 'Tachadas en Turno' },
                    { value: 'ANULADA_DEFINITIVA', label: 'Anuladas Definitivas' },
                  ]}
                />
              </div>
            </div>
          </div>

          {filteredSales.length === 0 ? (
            <div className="py-8 text-center text-xs text-txt-muted">
              No se encontraron ventas para los criterios seleccionados.
            </div>
          ) : (
            <Table
              containerLabel="Registro de ventas del turno"
              containerClassName="rounded-xl shadow-xs"
              className="min-w-[680px] text-xs"
            >
              <TableHeader stickyHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 py-3 text-[11px]">Venta #</TableHead>
                  <TableHead className="px-3 py-3 text-[11px]">Cliente</TableHead>
                  <TableHead className="px-3 py-3 text-[11px]">Vendedor</TableHead>
                  <TableHead className="px-3 py-3 text-right text-[11px]">Efectivo</TableHead>
                  <TableHead className="px-3 py-3 text-right text-[11px]">Digital</TableHead>
                  <TableHead className="px-3 py-3 text-right text-[11px]">Total</TableHead>
                  <TableHead className="px-3 py-3 text-center text-[11px]">Estado</TableHead>
                  <TableHead className="px-4 py-3 text-center text-[11px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((s) => {
                  const isTurnoOpen = activeShift && activeShift.id === s.turno_caja_id && activeShift.estado === 'ABIERTO';
                  const canDoStrike = canStrike && s.estado_venta === 'COMPLETADA' && isTurnoOpen;

                  return (
                    <TableRow key={s.id}>
                      <TableCell className="px-4 py-3 font-bold">
                        #{s.id}
                        <span className="block text-[10px] text-txt-muted font-normal">{s.created_at}</span>
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <span className="font-semibold text-txt-primary">
                          {s.cliente_nombre_completo || 'Público General'}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-txt-secondary">
                        @{s.usuario_vendedor_username}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right text-txt-secondary font-medium">
                        S/ {formatMoney(s.monto_pagado_efectivo)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right text-txt-secondary font-medium">
                        S/ {formatMoney(s.monto_pagado_digital)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right font-extrabold">
                        S/ {formatMoney(s.total_venta)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        {s.estado_venta === 'COMPLETADA' && <Badge variant="success" size="sm">Completada</Badge>}
                        {s.estado_venta === 'TACHADA_EN_TURNO' && <Badge variant="warning" size="sm">Tachada</Badge>}
                        {s.estado_venta === 'ANULADA_DEFINITIVA' && <Badge variant="danger" size="sm">Anulada Definitiva</Badge>}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const detail = await hook.fetchSaleDetail(s.id);
                              if (detail) setDetailModalSale(detail);
                            }}
                            className="text-xs"
                          >
                            Ver Detalle
                          </Button>

                          {canDoStrike && (
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              onClick={() => setStrikeModalSale(s)}
                              leftIcon={<Icon name="scissors" className="w-3.5 h-3.5" aria-hidden="true" />}
                              className="text-xs font-bold"
                            >
                              Tachar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ==================================================================== */}
        {/* PESTAÑA 3: DEUDORES Y CRÉDITOS                                        */}
        {/* ==================================================================== */}
        <TabsContent value="deudores">
          <DebtorsTable
            credits={credits}
            isLoading={hook.isLoading}
            onAmortizeInPos={handleAmortizeCredit}
            onRefresh={hook.fetchCredits}
          />
        </TabsContent>

        {/* ==================================================================== */}
        {/* PESTAÑA 4: BANDEJA ADMIN RESOLUCIÓN DE TACHADOS (PASO 2)             */}
        {/* ==================================================================== */}
        <TabsContent
          value="tachados_admin"
          className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-txt-primary text-base flex items-center gap-2">
                  <Icon name="shield" className="w-4 h-4 text-brand" aria-hidden="true" />
                  Bandeja Administrativa: Resolución de Tachados
                </h3>
                <Badge variant={isAdmin ? 'success' : 'default'} size="sm">
                  {isAdmin ? 'Acceso Administrador' : 'Modo Informativo'}
                </Badge>
              </div>
              <p className="text-xs text-txt-secondary">
                {isAdmin
                  ? 'Como Administrador, dictamina de forma definitiva sobre las ventas tachadas por los operadores: confirma su anulación o revierte el tachado si el turno sigue abierto.'
                  : 'Ventas en estado TACHADA_EN_TURNO pendientes de confirmación definitiva por un Administrador.'}
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => hook.fetchSales()}
              className="self-start sm:self-auto"
              title="Refrescar bandeja"
              aria-label="Refrescar bandeja"
            >
              <Icon name="refresh" className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>

          {!isAdmin && (
            <Alert variant="info" floating={false}>
              Solo los usuarios con rol <strong>ADMINISTRADOR</strong> cuentan con privilegios para confirmar anulaciones o revertir tachados.
            </Alert>
          )}

          {struckSales.length === 0 ? (
            <div className="py-8 text-center text-xs text-txt-muted flex items-center justify-center gap-2">
              <Icon name="check" className="w-4 h-4 text-status-success" aria-hidden="true" />
              <span>No hay ventas pendientes de resolución en la bandeja de tachados.</span>
            </div>
          ) : (
            <Table
              containerLabel="Bandeja administrativa de resolución de tachados"
              containerClassName="rounded-xl shadow-xs"
              className="min-w-[680px] text-xs"
            >
              <TableHeader stickyHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 py-3 text-[11px]">Venta #</TableHead>
                  <TableHead className="px-3 py-3 text-[11px]">Turno</TableHead>
                  <TableHead className="px-3 py-3 text-[11px]">Cliente</TableHead>
                  <TableHead className="px-3 py-3 text-right text-[11px]">Monto</TableHead>
                  <TableHead className="px-4 py-3 text-[11px]">Motivo Tachado</TableHead>
                  <TableHead className="px-4 py-3 text-center text-[11px]">Acción Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {struckSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="px-4 py-3 font-bold">#{s.id}</TableCell>
                    <TableCell className="px-3 py-3 text-txt-secondary">Turno #{s.turno_caja_id}</TableCell>
                    <TableCell className="px-3 py-3 font-semibold">
                      {s.cliente_nombre_completo || 'Público General'}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right font-bold">
                      S/ {formatMoney(s.total_venta)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-txt-secondary text-[11px] italic">
                      {s.usuario_vendedor_username ? `Vendedor: @${s.usuario_vendedor_username}` : ''}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-center">
                      {canResolve ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          onClick={() => setResolveModalSale(s)}
                          leftIcon={<Icon name="shield" className="w-3.5 h-3.5" aria-hidden="true" />}
                          className="text-xs font-bold shadow-xs"
                        >
                          Resolver
                        </Button>
                      ) : (
                        <span className="text-[11px] text-txt-muted italic">
                          Pendiente de Admin
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* ==================================================================== */}
      {/* MODALES DEL SLICE 4                                                   */}
      {/* ==================================================================== */}
      <OpenShiftModal
        isOpen={isOpenShiftModalOpen}
        onClose={() => setIsOpenShiftModalOpen(false)}
        onSubmit={hook.openShift}
        isLoading={hook.isActionLoading}
      />

      <CloseShiftModal
        isOpen={isCloseShiftModalOpen}
        shift={activeShift}
        onClose={() => setIsCloseShiftModalOpen(false)}
        onSubmit={hook.closeShift}
        isLoading={hook.isActionLoading}
      />

      <StrikeSaleModal
        isOpen={Boolean(strikeModalSale)}
        sale={strikeModalSale}
        turnoEstado={activeShift?.estado}
        onClose={() => setStrikeModalSale(null)}
        onSubmit={hook.strikeSale}
        isLoading={hook.isActionLoading}
      />

      <ResolveStruckModal
        isOpen={Boolean(resolveModalSale)}
        sale={resolveModalSale}
        turnoAbierto={activeShift !== null && activeShift.estado === 'ABIERTO'}
        onClose={() => setResolveModalSale(null)}
        onSubmit={hook.resolveStruckSale}
        isLoading={hook.isActionLoading}
      />

      <SaleDetailModal
        isOpen={Boolean(detailModalSale)}
        sale={detailModalSale}
        onClose={() => setDetailModalSale(null)}
        canStrike={canStrike && activeShift !== null && activeShift.estado === 'ABIERTO'}
        onStrikeClick={(s) => {
          setDetailModalSale(null);
          setStrikeModalSale(s as any);
        }}
      />
    </div>
  );
};
