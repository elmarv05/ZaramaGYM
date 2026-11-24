// ============================================================================
// VISTA PRINCIPAL: PUNTO DE VENTA (POS), CAJA Y CRÉDITOS (SLICE 4)
// Núcleo transaccional: 4 Pestañas operativas, Arquitectura de Caja Triple
// Flujo de Tachado en 2 Pasos y Visibilidad Operativa "Caso Juan Pérez"
// Ubicación: src/features/pos/PosView.tsx
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Select,
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
  const products = propProducts ?? hook.availableProducts;
  const plans = propPlans ?? hook.availablePlans;
  const clients = propClients ?? hook.availableClients;
  const sales = propSales ?? hook.sales;
  const credits = propCredits ?? hook.credits;

  const isLoading = propIsLoading ?? hook.isLoading;
  const error = propError ?? hook.error;

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

  // Manejador para amortizar un crédito y llevarlo directo al carrito
  const handleAmortizeCredit = (credit: ClientCreditDto) => {
    hook.addCreditAmortizationToCart(credit);
    setActiveTab('pos');
  };

  // Manejador para registrar venta con feedback
  const handleExecuteSale = async () => {
    const created = await hook.createSale();
    if (created) {
      setDetailModalSale(created);
    }
  };

  // Filtro de ventas en la pestaña 2
  const [salesFilterStatus, setSalesFilterStatus] = useState<string>('TODAS');
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (salesFilterStatus === 'TODAS') return true;
      return s.estado_venta === salesFilterStatus;
    });
  }, [sales, salesFilterStatus]);

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
      />

      {/* Banner de Resumen según vista si hay turno abierto */}
      {activeShift && (
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
        {/* PESTAÑA 1: PUNTO DE VENTA (POS)                                      */}
        {/* ==================================================================== */}
        <TabsContent value="pos" className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda: Selector de Cliente + Catálogo (7 columnas) */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              {/* Selector de Cliente (Caso Juan Pérez) */}
              <Card padding="sm" className="gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-txt-primary flex items-center gap-1.5">
                    <Icon name="user" className="w-4 h-4 text-txt-secondary" aria-hidden="true" />
                    Selección de Cliente / Socio
                  </span>
                  {hook.selectedClient ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => hook.setSelectedClient(null)}
                      className="text-[11px] font-semibold text-status-danger"
                    >
                      Cambiar a Público General
                    </Button>
                  ) : (
                    <Badge variant="default" size="sm">
                      Público General / Venta Rápida
                    </Badge>
                  )}
                </div>

                {hook.selectedClient ? (
                  <div className="p-3 bg-canvas-subtle border border-status-success-border rounded-lg flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-txt-primary text-sm">
                        {hook.selectedClient.nombres} {hook.selectedClient.apellidos}
                      </h4>
                      <p className="text-xs text-txt-muted">
                        DNI: {hook.selectedClient.numero_documento} • QR: {hook.selectedClient.codigo_qr_token}
                      </p>
                    </div>
                    <Badge variant="success" size="sm">
                      Identificado
                    </Badge>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      inputSize="sm"
                      aria-label="Buscar cliente o socio"
                      placeholder="Buscar por Apellidos, Nombres, DNI o QR..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                    />

                    {/* Menú flotante de resultados en vivo */}
                    {clientSearch.trim().length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-border">
                        {filteredClients.length > 0 ? (
                          filteredClients.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                hook.setSelectedClient(c);
                                setClientSearch('');
                              }}
                              className="w-full text-left p-2.5 hover:bg-canvas-subtle focus-visible:bg-canvas-subtle focus:outline-none text-xs flex justify-between items-center transition-colors"
                            >
                              <div className="flex flex-col">
                                <span className="font-bold text-txt-primary">
                                  {c.nombres} {c.apellidos}
                                </span>
                                <span className="text-[11px] text-txt-muted">
                                  Doc: {c.numero_documento} • {c.codigo_qr_token}
                                </span>
                              </div>
                              <span className="text-[11px] font-semibold text-brand">Seleccionar</span>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-xs text-txt-muted">
                            No se encontraron clientes con "{clientSearch}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Si el cliente tiene deudas pendientes */}
                {clientPendingCredits.length > 0 && (
                  <div className="p-3 bg-status-warning-bg border border-status-warning-border rounded-lg flex flex-col gap-2">
                    <span className="text-xs font-bold text-status-warning inline-flex items-center gap-1.5">
                      <Icon name="warning" className="w-4 h-4 shrink-0" aria-hidden="true" />
                      Este socio tiene {clientPendingCredits.length} deuda(s) pendiente(s):
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {clientPendingCredits.map((cred) => (
                        <div
                          key={cred.id}
                          className="flex items-center justify-between bg-surface p-2 rounded border border-status-warning-border text-xs"
                        >
                          <div>
                            <span className="font-semibold text-txt-primary">{cred.descripcion}</span>
                            <span className="text-[11px] text-txt-muted block">
                              Saldo: S/ {formatMoney(cred.saldo_pendiente)}
                            </span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => hook.addCreditAmortizationToCart(cred)}
                            className="text-[11px] font-bold"
                          >
                            + Amortizar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Selector de Catálogo (Productos / Planes) */}
              <Card padding="sm" className="gap-4">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
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
                          <div className="flex flex-col">
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
                              disabled={isOutOfStock || !activeShift}
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
                )}

                {/* Sub-pestaña Planes */}
                {catalogSubTab === 'planes' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 bg-canvas-subtle p-2.5 rounded-lg border border-border text-xs">
                      <label htmlFor="plan-start-date" className="font-bold text-txt-secondary whitespace-nowrap">
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                      {filteredPlans.map((pl) => (
                        <div
                          key={pl.id}
                          className="p-3 bg-surface border border-border rounded-lg flex flex-col justify-between gap-2 hover:border-brand/70 hover:shadow-xs transition-[border-color,box-shadow,background-color] duration-150"
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-txt-primary text-xs">
                                {pl.nombre}
                              </span>
                              <Badge variant="info" size="sm">
                                {pl.tipo_plan}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-txt-muted">
                              Código: {pl.codigo} • Duración: {pl.duracion_meses ? `${pl.duracion_meses} meses` : 'Pase Diario'}
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
                              disabled={!activeShift}
                              onClick={() => handleAddPlan(pl)}
                              className="text-xs font-bold"
                            >
                              + Inscribir
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Columna Derecha: Carrito + Split de Pagos (5 columnas) */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <CartTable
                items={hook.cartItems}
                descuento={hook.descuento}
                subtotal={hook.totals.subtotal}
                totalVenta={hook.totals.totalVenta}
                onUpdateQuantity={hook.updateItemQuantity}
                onRemoveItem={hook.removeItem}
                onClearCart={hook.clearCart}
                onDescuentoChange={hook.setDescuento}
                disabled={!activeShift}
              />

              <PaymentSplitter
                totalVenta={hook.totals.totalVenta}
                pagos={hook.pagos}
                splitResult={hook.splitResult}
                hasCliente={Boolean(hook.selectedClient)}
                onUpdatePayment={hook.updatePayment}
                onRemovePayment={hook.removePayment}
                onSubmitSale={handleExecuteSale}
                isLoading={hook.isActionLoading}
                disabled={!activeShift || hook.cartItems.length === 0}
              />
            </div>
          </div>
        </TabsContent>

        {/* ==================================================================== */}
        {/* PESTAÑA 2: VENTAS DEL TURNO & TACHADO (PASO 1)                        */}
        {/* ==================================================================== */}
        <TabsContent
          value="ventas"
          className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h3 className="font-bold text-txt-primary text-base flex items-center gap-2">
                <Icon name="receipt" className="w-4 h-4 text-brand" aria-hidden="true" />
                Registro de Ventas del Turno y Tachado Inmediato
              </h3>
              <p className="text-xs text-txt-secondary">
                Historial de transacciones del turno activo. Permite consultar comprobantes y ejecutar el Tachado Paso 1 si el turno sigue abierto.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-44">
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

              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => hook.fetchSales()}
                title="Refrescar ventas"
                aria-label="Refrescar ventas"
              >
                <Icon name="refresh" className="w-4 h-4" aria-hidden="true" />
              </Button>
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
