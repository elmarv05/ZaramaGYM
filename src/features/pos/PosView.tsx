// ============================================================================
// VISTA PRINCIPAL: PUNTO DE VENTA (POS), CAJA Y CRÉDITOS (SLICE 4)
// Núcleo transaccional: 4 Pestañas operativas, Arquitectura de Caja Triple
// Flujo de Tachado en 2 Pasos y Visibilidad Operativa "Caso Juan Pérez"
// Ubicación: src/features/pos/PosView.tsx
// ============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { Alert } from '../../components/primitives/Alert';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';
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

      {/* 2. Barra de Pestañas Operativas */}
      <div
        role="tablist"
        aria-label="Módulos de Caja y POS"
        className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
      >
        <button
          type="button"
          role="tab"
          id="tab-pos"
          aria-selected={activeTab === 'pos'}
          aria-controls="panel-pos"
          onClick={() => setActiveTab('pos')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors inline-flex items-center gap-2 ${
            activeTab === 'pos'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="pos" className="w-4 h-4" aria-hidden="true" />
          <span>Punto de Venta (POS)</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-ventas"
          aria-selected={activeTab === 'ventas'}
          aria-controls="panel-ventas"
          onClick={() => setActiveTab('ventas')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors inline-flex items-center gap-2 ${
            activeTab === 'ventas'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="receipt" className="w-4 h-4" aria-hidden="true" />
          <span>Ventas del Turno & Tachado (Paso 1) ({sales.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-deudores"
          aria-selected={activeTab === 'deudores'}
          aria-controls="panel-deudores"
          onClick={() => setActiveTab('deudores')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors inline-flex items-center gap-2 ${
            activeTab === 'deudores'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="credit-card" className="w-4 h-4" aria-hidden="true" />
          <span>Deudores & Créditos ({credits.filter((c) => c.estado === 'PENDIENTE').length})</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-tachados-admin"
          aria-selected={activeTab === 'tachados_admin'}
          aria-controls="panel-tachados-admin"
          onClick={() => setActiveTab('tachados_admin')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors inline-flex items-center gap-2 ${
            activeTab === 'tachados_admin'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="shield" className="w-4 h-4" aria-hidden="true" />
          <span>Auditoría Tachados (Paso 2)</span>
          {struckSales.length > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-red-100 text-red-700 font-bold">
              {struckSales.length}
            </span>
          )}
        </button>
      </div>

      {/* ==================================================================== */}
      {/* PESTAÑA 1: PUNTO DE VENTA (POS)                                      */}
      {/* ==================================================================== */}
      {activeTab === 'pos' && (
        <div
          role="tabpanel"
          id="panel-pos"
          aria-labelledby="tab-pos"
          className="flex flex-col gap-6"
        >
          {!activeShift && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-4 flex items-center justify-between gap-3">
              <span className="text-xs text-amber-900 dark:text-amber-200 font-medium inline-flex items-center gap-2">
                <Icon name="warning" className="w-4 h-4 shrink-0" aria-hidden="true" />
                Abre un turno de caja para habilitar el registro de ventas y cobros en el sistema.
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setIsOpenShiftModalOpen(true)}
              >
                Abrir Turno Ahora
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda: Selector de Cliente + Catálogo (7 columnas) */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              {/* Selector de Cliente (Caso Juan Pérez) */}
              <div className="bg-surface border border-border rounded-xl p-4 shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-txt-primary flex items-center gap-1.5">
                    <Icon name="user" className="w-4 h-4 text-txt-secondary" aria-hidden="true" />
                    Selección de Cliente / Socio
                  </span>
                  {hook.selectedClient ? (
                    <button
                      type="button"
                      onClick={() => hook.setSelectedClient(null)}
                      className="text-[11px] font-semibold text-red-600 hover:underline"
                    >
                      Cambiar a Público General
                    </button>
                  ) : (
                    <Badge variant="default" size="sm">
                      Público General / Venta Rápida
                    </Badge>
                  )}
                </div>

                {hook.selectedClient ? (
                  <div className="p-3 bg-canvas-subtle border border-emerald-300 dark:border-emerald-800 rounded-lg flex items-center justify-between">
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
                      placeholder="Buscar por Apellidos, Nombres, DNI o QR..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="text-xs"
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
                              className="w-full text-left p-2.5 hover:bg-canvas-subtle text-xs flex justify-between items-center transition-colors"
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
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg flex flex-col gap-2">
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-200 inline-flex items-center gap-1.5">
                      <Icon name="warning" className="w-4 h-4 shrink-0" aria-hidden="true" />
                      Este socio tiene {clientPendingCredits.length} deuda(s) pendiente(s):
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {clientPendingCredits.map((cred) => (
                        <div
                          key={cred.id}
                          className="flex items-center justify-between bg-surface p-2 rounded border border-amber-200 dark:border-amber-900 text-xs"
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
              </div>

              {/* Selector de Catálogo (Productos / Planes) */}
              <div className="bg-surface border border-border rounded-xl p-4 shadow-xs flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCatalogSubTab('productos')}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                        catalogSubTab === 'productos'
                          ? 'bg-brand text-brand-text'
                          : 'bg-canvas-subtle text-txt-muted hover:text-txt-primary'
                      }`}
                    >
                      <Icon name="package" className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Productos en Stock ({products.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatalogSubTab('planes')}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                        catalogSubTab === 'planes'
                          ? 'bg-brand text-brand-text'
                          : 'bg-canvas-subtle text-txt-muted hover:text-txt-primary'
                      }`}
                    >
                      <Icon name="catalog" className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Planes & Pases ({plans.length})</span>
                    </button>
                  </div>

                  <div className="w-44">
                    <Input
                      placeholder="Buscar en catálogo..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      className="text-xs py-1"
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
                          className={`p-3 rounded-lg border flex flex-col justify-between gap-2 transition-all ${
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
                            <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-400">
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
                      <input
                        id="plan-start-date"
                        type="date"
                        value={planStartDate}
                        onChange={(e) => setPlanStartDate(e.target.value)}
                        className="text-xs px-2 py-1 rounded border border-border bg-surface text-txt-primary font-semibold"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                      {filteredPlans.map((pl) => (
                        <div
                          key={pl.id}
                          className="p-3 bg-surface border border-border rounded-lg flex flex-col justify-between gap-2 hover:border-brand/70 hover:shadow-xs transition-all"
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
                            <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-400">
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
              </div>
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
        </div>
      )}

      {/* ==================================================================== */}
      {/* PESTAÑA 2: VENTAS DEL TURNO & TACHADO (PASO 1)                        */}
      {/* ==================================================================== */}
      {activeTab === 'ventas' && (
        <div
          role="tabpanel"
          id="panel-ventas"
          aria-labelledby="tab-ventas"
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
              <select
                value={salesFilterStatus}
                onChange={(e) => setSalesFilterStatus(e.target.value)}
                aria-label="Filtrar ventas por estado"
                className="text-xs rounded-lg border border-border bg-surface px-3 py-1.5 font-semibold text-txt-primary"
              >
                <option value="TODAS">Todos los Estados</option>
                <option value="COMPLETADA">Solo Completadas</option>
                <option value="TACHADA_EN_TURNO">Tachadas en Turno (Paso 1)</option>
                <option value="ANULADA_DEFINITIVA">Anuladas Definitivas</option>
              </select>

              <button
                type="button"
                onClick={() => hook.fetchSales()}
                className="p-1.5 border border-border rounded-lg bg-canvas-subtle hover:bg-slate-200 dark:hover:bg-slate-700 text-xs text-txt-secondary hover:text-txt-primary transition-colors"
                title="Refrescar ventas"
                aria-label="Refrescar ventas"
              >
                <Icon name="refresh" className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {filteredSales.length === 0 ? (
            <div className="py-8 text-center text-xs text-txt-muted">
              No se encontraron ventas para los criterios seleccionados.
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas-subtle text-[11px] text-txt-muted uppercase font-bold border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Venta #</th>
                    <th className="px-3 py-3">Cliente</th>
                    <th className="px-3 py-3">Vendedor</th>
                    <th className="px-3 py-3 text-right">Efectivo</th>
                    <th className="px-3 py-3 text-right">Digital</th>
                    <th className="px-3 py-3 text-right">Total</th>
                    <th className="px-3 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSales.map((s) => {
                    const isTurnoOpen = activeShift && activeShift.id === s.turno_caja_id && activeShift.estado === 'ABIERTO';
                    const canDoStrike = canStrike && s.estado_venta === 'COMPLETADA' && isTurnoOpen;

                    return (
                      <tr key={s.id} className="hover:bg-canvas-subtle/40 transition-colors">
                        <td className="px-4 py-3 font-bold text-txt-primary">
                          #{s.id}
                          <span className="block text-[10px] text-txt-muted font-normal">{s.created_at}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-semibold text-txt-primary">
                            {s.cliente_nombre_completo || 'Público General'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-txt-secondary">
                          @{s.usuario_vendedor_username}
                        </td>
                        <td className="px-3 py-3 text-right text-txt-secondary font-medium">
                          S/ {formatMoney(s.monto_pagado_efectivo)}
                        </td>
                        <td className="px-3 py-3 text-right text-txt-secondary font-medium">
                          S/ {formatMoney(s.monto_pagado_digital)}
                        </td>
                        <td className="px-3 py-3 text-right font-extrabold text-txt-primary">
                          S/ {formatMoney(s.total_venta)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {s.estado_venta === 'COMPLETADA' && <Badge variant="success" size="sm">Completada</Badge>}
                          {s.estado_venta === 'TACHADA_EN_TURNO' && <Badge variant="warning" size="sm">Tachada (Paso 1)</Badge>}
                          {s.estado_venta === 'ANULADA_DEFINITIVA' && <Badge variant="danger" size="sm">Anulada Definitiva</Badge>}
                        </td>
                        <td className="px-4 py-3 text-center">
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
                                Tachar (Paso 1)
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* PESTAÑA 3: DEUDORES Y CRÉDITOS                                        */}
      {/* ==================================================================== */}
      {activeTab === 'deudores' && (
        <div role="tabpanel" id="panel-deudores" aria-labelledby="tab-deudores">
          <DebtorsTable
            credits={credits}
            isLoading={hook.isLoading}
            onAmortizeInPos={handleAmortizeCredit}
            onRefresh={hook.fetchCredits}
          />
        </div>
      )}

      {/* ==================================================================== */}
      {/* PESTAÑA 4: BANDEJA ADMIN RESOLUCIÓN DE TACHADOS (PASO 2)             */}
      {/* ==================================================================== */}
      {activeTab === 'tachados_admin' && (
        <div
          role="tabpanel"
          id="panel-tachados-admin"
          aria-labelledby="tab-tachados-admin"
          className="bg-surface border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-txt-primary text-base flex items-center gap-2">
                  <Icon name="shield" className="w-4 h-4 text-brand" aria-hidden="true" />
                  Bandeja Administrativa: Resolución de Tachados (Paso 2)
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

            <button
              type="button"
              onClick={() => hook.fetchSales()}
              className="p-1.5 border border-border rounded-lg bg-canvas-subtle hover:bg-slate-200 dark:hover:bg-slate-700 text-xs text-txt-secondary hover:text-txt-primary transition-colors self-start sm:self-auto"
              title="Refrescar bandeja"
              aria-label="Refrescar bandeja"
            >
              <Icon name="refresh" className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {!isAdmin && (
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2">
              <Icon name="info" className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                Solo los usuarios con rol <strong>ADMINISTRADOR</strong> cuentan con privilegios para confirmar anulaciones o revertir tachados.
              </span>
            </div>
          )}

          {struckSales.length === 0 ? (
            <div className="py-8 text-center text-xs text-txt-muted flex items-center justify-center gap-2">
              <Icon name="check" className="w-4 h-4 text-status-success" aria-hidden="true" />
              <span>No hay ventas pendientes de resolución en la bandeja de tachados.</span>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-canvas-subtle text-[11px] text-txt-muted uppercase font-bold border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Venta #</th>
                    <th className="px-3 py-3">Turno</th>
                    <th className="px-3 py-3">Cliente</th>
                    <th className="px-3 py-3 text-right">Monto</th>
                    <th className="px-4 py-3">Motivo Tachado</th>
                    <th className="px-4 py-3 text-center">Acción Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {struckSales.map((s) => (
                    <tr key={s.id} className="hover:bg-canvas-subtle/40 transition-colors">
                      <td className="px-4 py-3 font-bold text-txt-primary">#{s.id}</td>
                      <td className="px-3 py-3 text-txt-secondary">Turno #{s.turno_caja_id}</td>
                      <td className="px-3 py-3 font-semibold text-txt-primary">
                        {s.cliente_nombre_completo || 'Público General'}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-txt-primary">
                        S/ {formatMoney(s.total_venta)}
                      </td>
                      <td className="px-4 py-3 text-txt-secondary text-[11px] italic">
                        {s.usuario_vendedor_username ? `Vendedor: @${s.usuario_vendedor_username}` : ''}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {canResolve ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            onClick={() => setResolveModalSale(s)}
                            leftIcon={<Icon name="shield" className="w-3.5 h-3.5" aria-hidden="true" />}
                            className="text-xs font-bold shadow-xs"
                          >
                            Resolver (Paso 2)
                          </Button>
                        ) : (
                          <span className="text-[11px] text-txt-muted italic">
                            Pendiente de Admin
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
