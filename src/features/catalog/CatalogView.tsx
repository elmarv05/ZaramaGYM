// ============================================================================
// VISTA PRINCIPAL: CATÁLOGO DE PLANES, INVENTARIO Y KARDEX (SLICE 3)
// 3 Pestañas accesibles: Planes & Simulador, Inventario y Kardex de Mermas.
// Respeta RBAC estricto: RECEPCIONISTA (Planes lectura / Productos crear-editar) vs ADMIN (Total).
// Ubicación: src/features/catalog/CatalogView.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Alert } from '../../components/primitives/Alert';
import { ConfirmDialog } from '../../components/primitives/ConfirmDialog';
import { Icon } from '../../components/primitives/Icon';
import { canMutateCatalog } from '../../domain/catalog';
import { useCatalog } from '../../hooks/useCatalog';
import { AppError, AuthSession } from '../../types/auth';
import {
  CreatePlanInput,
  CreateProductInput,
  InventoryMovementItem,
  PlanExpirationPreviewDto,
  PlanListItem,
  ProductListItem,
  RecordInventoryMovementInput,
  TipoPlan,
  UpdatePlanInput,
  UpdateProductInput,
} from '../../types/catalog';
import { MovementHistoryTab } from './MovementHistoryTab';
import { PlanListTab } from './PlanListTab';
import { ProductListTab } from './ProductListTab';

export type CatalogSubTab = 'planes' | 'productos' | 'kardex';

export interface CatalogViewProps {
  currentSession: AuthSession;
  initialTab?: CatalogSubTab;

  // Colecciones provistas o mockeadas opcionales
  plans?: PlanListItem[];
  products?: ProductListItem[];
  movements?: InventoryMovementItem[];

  isLoading?: boolean;
  isActionLoading?: boolean;
  error?: AppError | null;

  onRefresh?: () => void;
  onCreatePlan?: (input: CreatePlanInput) => Promise<PlanListItem | null>;
  onUpdatePlan?: (planId: number, input: UpdatePlanInput) => Promise<PlanListItem | null>;
  onTogglePlanActive?: (planId: number, currentActive: boolean) => Promise<boolean>;
  onSimulate?: (
    fechaInicio: string,
    tipoPlan: TipoPlan,
    duracionMeses: number | null,
    planId?: number
  ) => Promise<PlanExpirationPreviewDto>;

  onCreateProduct?: (input: CreateProductInput) => Promise<ProductListItem | null>;
  onUpdateProduct?: (productId: number, input: UpdateProductInput) => Promise<ProductListItem | null>;
  onToggleProductActive?: (productId: number, currentActive: boolean) => Promise<boolean>;
  onRecordMovement?: (input: RecordInventoryMovementInput) => Promise<any>;

  onClearError?: () => void;
}

export const CatalogView: React.FC<CatalogViewProps> = (props) => {
  const {
    currentSession,
    initialTab = 'planes',
    plans: propPlans,
    products: propProducts,
    movements: propMovements,
    isLoading: propIsLoading,
    isActionLoading: propIsActionLoading,
    error: propError,
    onRefresh: propOnRefresh,
    onCreatePlan: propOnCreatePlan,
    onUpdatePlan: propOnUpdatePlan,
    onTogglePlanActive: propOnTogglePlanActive,
    onSimulate: propOnSimulate,
    onCreateProduct: propOnCreateProduct,
    onUpdateProduct: propOnUpdateProduct,
    onToggleProductActive: propOnToggleProductActive,
    onRecordMovement: propOnRecordMovement,
    onClearError,
  } = props;

  // Si no se inyectan colecciones externas, activamos hook interno
  const shouldAutoFetch =
    propPlans === undefined && propProducts === undefined && propMovements === undefined;

  const hook = useCatalog(shouldAutoFetch);

  const [activeTab, setActiveTab] = useState<CatalogSubTab>(initialTab);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{
    type: 'plan' | 'product';
    id: number;
    name: string;
  } | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const plans = (propPlans ?? hook.plans) || [];
  const products = (propProducts ?? hook.products) || [];
  const movements = (propMovements ?? hook.movements) || [];
  const isLoading = propIsLoading ?? hook.isLoading;
  const isActionLoading = propIsActionLoading ?? hook.isActionLoading;
  const error = propError ?? hook.error;

  const togglePlanActiveFn = propOnTogglePlanActive ?? hook.togglePlanActive;
  const toggleProductActiveFn = propOnToggleProductActive ?? hook.toggleProductActive;

  const handleTogglePlanActive = async (planId: number, currentActive: boolean) => {
    if (currentActive) {
      const target = plans.find((p) => p.id === planId);
      setConfirmDeactivate({
        type: 'plan',
        id: planId,
        name: target?.nombre || `Plan #${planId}`,
      });
      return false;
    }
    return togglePlanActiveFn(planId, currentActive);
  };

  const handleToggleProductActive = async (productId: number, currentActive: boolean) => {
    if (currentActive) {
      const target = products.find((p) => p.id === productId);
      setConfirmDeactivate({
        type: 'product',
        id: productId,
        name: target?.nombre || `Producto #${productId}`,
      });
      return false;
    }
    return toggleProductActiveFn(productId, currentActive);
  };

  const canMutate = canMutateCatalog(currentSession?.rol);
  const lowStockCount = products.filter(
    (p) => p && p.estado_activo !== false && (p.alerta_stock_bajo || p.stock_actual <= p.stock_minimo)
  ).length;

  const handleRefresh = () => {
    if (propOnRefresh) {
      propOnRefresh();
    } else {
      hook.refreshAll();
    }
  };

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Banner Informativo RBAC para Recepcionistas */}
      {!canMutate && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-3.5 flex items-center gap-3 text-blue-900 dark:text-blue-200 text-xs">
          <Icon name="info" className="w-4 h-4 shrink-0" aria-hidden="true" />
          <div>
            <span className="font-bold">Modo Operativo de Recepción:</span>
            <span className="ml-1 text-txt-secondary">
              Puedes consultar y crear nuevas tarifas o planes, usar el Simulador, y registrar o modificar productos del inventario. Editar o dar de baja planes existentes, desactivar productos y registrar mermas o ajustes en Kardex están reservados al Administrador.
            </span>
          </div>
        </div>
      )}

      {/* Navegación por pestañas accesibles */}
      <div
        role="tablist"
        aria-label="Pestañas de Catálogo e Inventario"
        className="flex flex-wrap items-center gap-2 border-b border-border pb-2"
      >
        <button
          type="button"
          role="tab"
          id="tab-planes"
          aria-selected={activeTab === 'planes'}
          aria-controls="panel-planes"
          onClick={() => setActiveTab('planes')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors inline-flex items-center gap-2 ${
            activeTab === 'planes'
              ? 'bg-surface text-txt-primary shadow-sm border border-border'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="calendar" className="w-4 h-4" aria-hidden="true" />
          <span>Planes y Simulador</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-productos"
          aria-selected={activeTab === 'productos'}
          aria-controls="panel-productos"
          onClick={() => setActiveTab('productos')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors flex items-center gap-2 ${
            activeTab === 'productos'
              ? 'bg-surface text-txt-primary shadow-sm border border-border'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="package" className="w-4 h-4" aria-hidden="true" />
          <span>Inventario de Productos</span>
          {lowStockCount > 0 && (
            <span
              className="bg-amber-500 text-white font-mono px-1.5 py-0.2 rounded-full text-[10px]"
              title={`${lowStockCount} producto(s) con stock bajo`}
            >
              {lowStockCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-kardex"
          aria-selected={activeTab === 'kardex'}
          aria-controls="panel-kardex"
          onClick={() => setActiveTab('kardex')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors inline-flex items-center gap-2 ${
            activeTab === 'kardex'
              ? 'bg-surface text-txt-primary shadow-sm border border-border'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          <Icon name="audit" className="w-4 h-4" aria-hidden="true" />
          <span>Kardex y Mermas</span>
        </button>
      </div>

      {/* Banner de Error Global */}
      {error && (
        <Alert
          variant="danger"
          title="Error en el módulo de catálogo e inventario"
          actionText="Reintentar"
          onAction={handleRefresh}
          onClose={onClearError || hook.clearError}
        >
          {error.message}
        </Alert>
      )}

      {/* Subvistas según pestaña activa */}
      {activeTab === 'planes' && (
        <div id="panel-planes" role="tabpanel" aria-labelledby="tab-planes">
          <PlanListTab
            plans={plans}
            isLoading={isLoading}
            isActionLoading={isActionLoading}
            userRole={currentSession?.rol}
            onRefresh={handleRefresh}
            onCreatePlan={propOnCreatePlan ?? hook.createPlan}
            onUpdatePlan={propOnUpdatePlan ?? hook.updatePlan}
            onTogglePlanActive={handleTogglePlanActive}
            onSimulate={propOnSimulate ?? hook.simulateExpiration}
          />
        </div>
      )}

      {activeTab === 'productos' && (
        <div id="panel-productos" role="tabpanel" aria-labelledby="tab-productos">
          <ProductListTab
            products={products}
            isLoading={isLoading}
            isActionLoading={isActionLoading}
            userRole={currentSession?.rol}
            onRefresh={handleRefresh}
            onCreateProduct={propOnCreateProduct ?? hook.createProduct}
            onUpdateProduct={propOnUpdateProduct ?? hook.updateProduct}
            onToggleProductActive={handleToggleProductActive}
            onRecordMovement={propOnRecordMovement ?? hook.recordMovement}
          />
        </div>
      )}

      {activeTab === 'kardex' && (
        <div id="panel-kardex" role="tabpanel" aria-labelledby="tab-kardex">
          <MovementHistoryTab
            movements={movements}
            products={products}
            isLoading={isLoading}
            isActionLoading={isActionLoading}
            userRole={currentSession?.rol}
            onRefresh={handleRefresh}
            onRecordMovement={propOnRecordMovement ?? hook.recordMovement}
          />
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmDeactivate)}
        onClose={() => setConfirmDeactivate(null)}
        onConfirm={async () => {
          if (!confirmDeactivate) return;
          try {
            if (confirmDeactivate.type === 'plan') {
              await togglePlanActiveFn(confirmDeactivate.id, true);
            } else {
              await toggleProductActiveFn(confirmDeactivate.id, true);
            }
          } finally {
            setConfirmDeactivate(null);
          }
        }}
        variant="warning"
        title={
          confirmDeactivate?.type === 'plan'
            ? '¿Desactivar plan de membresía?'
            : '¿Desactivar producto del inventario?'
        }
        description={
          confirmDeactivate?.type === 'plan'
            ? 'El plan dejará de aparecer disponible para nuevas inscripciones en el Punto de Venta.'
            : 'El producto quedará oculto para ventas futuras en el Punto de Venta.'
        }
        confirmText="Sí, desactivar"
        cancelText="Cancelar"
        isLoading={isActionLoading}
      >
        {confirmDeactivate && (
          <p>
            Elemento seleccionado: <strong>{confirmDeactivate.name}</strong>
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
};
