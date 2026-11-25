// ============================================================================
// VISTA PRINCIPAL: MÓDULO DE COMPRAS, GASTOS Y FINANZAS (SLICE 7)
// Dashboard Multicanal (Física/Digital/Mixta), Compras Kardex, Gastos y Tachados
// Ubicación: src/features/finance/FinanceView.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/primitives';
import {
  triggerBase64FileDownload,
  triggerBase64PdfDownload,
} from '../../domain/printingBackup';
import { useFinance } from '../../hooks/useFinance';
import { useEffectivePermissions } from '../../hooks/useReceptionistPermissions';
import { normalizeAppError } from '../../services/ipc/client';
import { dashboardIpc } from '../../services/ipc/dashboardIpc';
import { printingBackupIpc } from '../../services/ipc/printingBackupIpc';
import { AppError, AuthSession } from '../../types/auth';
import { ProductListItem } from '../../types/catalog';
import { ExportFormat } from '../../types/dashboard';
import { SupplierListItem } from '../../types/entity';
import {
  FinancialDashboardDto,
  OperationalExpenseDto,
  StruckSaleTrayItemDto,
  SupplierPurchaseSummaryDto,
} from '../../types/finance';
import { FinancialDashboardTab } from './components/FinancialDashboardTab';
import { OperationalExpensesTab } from './components/OperationalExpensesTab';
import { StruckSalesTrayTab } from './components/StruckSalesTrayTab';
import { SupplierPurchasesTab } from './components/SupplierPurchasesTab';

export type FinanceMainTab = 'dashboard' | 'compras' | 'gastos' | 'tachados';

export interface FinanceViewProps {
  currentSession: AuthSession;
  initialTab?: FinanceMainTab;

  // Inyección opcional para testing desacoplado
  dashboard?: FinancialDashboardDto | null;
  purchases?: SupplierPurchaseSummaryDto[];
  expenses?: OperationalExpenseDto[];
  struckSalesTray?: StruckSaleTrayItemDto[];
  suppliers?: SupplierListItem[];
  products?: ProductListItem[];
  isLoading?: boolean;
  error?: AppError | null;
  onClearError?: () => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  currentSession,
  initialTab = 'dashboard',
  dashboard: propDashboard,
  purchases: propPurchases,
  expenses: propExpenses,
  struckSalesTray: propStruckSalesTray,
  suppliers: propSuppliers,
  products: propProducts,
  isLoading: propIsLoading,
  error: propError,
  onClearError,
}) => {
  const isAdmin = currentSession?.rol === 'ADMINISTRADOR';
  const {
    permissions: effectivePermissions,
    isLoading: isPermissionsLoading,
  } = useEffectivePermissions(currentSession?.rol);

  const canViewFinanceDashboard =
    isAdmin || (!isPermissionsLoading && effectivePermissions.ver_dashboard_modulo_finanzas);
  const canExportSales =
    isAdmin || (!isPermissionsLoading && effectivePermissions.exportar_ventas_caja);

  const shouldAutoFetch =
    propDashboard === undefined &&
    propPurchases === undefined &&
    propExpenses === undefined &&
    propStruckSalesTray === undefined;

  const hook = useFinance({
    isAdmin,
    canViewDashboard: canViewFinanceDashboard,
    autoFetch: shouldAutoFetch,
  });

  const [activeTab, setActiveTab] = useState<FinanceMainTab>(
    !canViewFinanceDashboard && initialTab === 'dashboard' ? 'compras' : initialTab
  );

  useEffect(() => {
    setActiveTab(
      !canViewFinanceDashboard && initialTab === 'dashboard' ? 'compras' : initialTab
    );
  }, [initialTab, canViewFinanceDashboard]);

  const effectiveTab: FinanceMainTab =
    !canViewFinanceDashboard && activeTab === 'dashboard' ? 'compras' : activeTab;
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportingSalesFormat, setExportingSalesFormat] = useState<ExportFormat | null>(null);
  const [pdfFeedback, setPdfFeedback] = useState<{
    variant: 'info' | 'success' | 'danger';
    message: string;
  } | null>(null);

  // Fallbacks de props vs hook
  const dashboard = propDashboard !== undefined ? propDashboard : hook.dashboard;
  const purchases = propPurchases !== undefined ? propPurchases : hook.purchases;
  const expenses = propExpenses !== undefined ? propExpenses : hook.expenses;
  const struckSalesTray =
    propStruckSalesTray !== undefined ? propStruckSalesTray : hook.struckSalesTray;
  const suppliers = propSuppliers !== undefined ? propSuppliers : hook.suppliers;
  const products = propProducts !== undefined ? propProducts : hook.products;
  const isLoading = propIsLoading !== undefined ? propIsLoading : hook.isLoading;
  const error = propError !== undefined ? propError : hook.error;

  const handleClearError = () => {
    if (onClearError) onClearError();
    hook.clearError();
  };

  const handleExportFinancialPdf = async () => {
    setIsExportingPdf(true);
    setPdfFeedback(null);
    try {
      const desde = hook.reportFilter.fecha_desde || '';
      const hasta = hook.reportFilter.fecha_hasta || '';
      const canal = hook.activeChannelView;

      const res = await printingBackupIpc.generateFinancialReportPdf({
        fecha_desde: desde,
        fecha_hasta: hasta,
        canal_filtro: canal,
      });

      triggerBase64PdfDownload(res.pdf_base64, res.filename);
      setPdfFeedback({
        variant: 'info',
        message: `Reporte financiero ${res.filename} exportado exitosamente en RAM.`,
      });
      setTimeout(() => setPdfFeedback(null), 4000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al exportar reporte financiero en PDF.';
      setPdfFeedback({ variant: 'danger', message: msg });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportSalesCashReport = async (format: ExportFormat) => {
    setExportingSalesFormat(format);
    setPdfFeedback(null);
    try {
      const res = await dashboardIpc.exportSalesCashReport({
        fecha_desde: hook.reportFilter.fecha_desde || null,
        fecha_hasta: hook.reportFilter.fecha_hasta || null,
        canal_filtro: hook.activeChannelView,
        format,
      });

      triggerBase64FileDownload(res.content_base64, res.filename, res.mime_type);
      setPdfFeedback({
        variant: 'success',
        message: `Reporte de ventas y caja ${res.filename} exportado (${res.row_count} registro${res.row_count === 1 ? '' : 's'}).`,
      });
      setTimeout(() => setPdfFeedback(null), 4000);
    } catch (err: unknown) {
      const normalized = normalizeAppError(err);
      setPdfFeedback({
        variant: 'danger',
        message: normalized.message,
      });
    } finally {
      setExportingSalesFormat(null);
    }
  };

  const tachadasCount = dashboard?.indicadores_control?.ventas_tachadas_pendientes_count || 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado del Módulo con Métricas Rápidas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-surface rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
            <Icon name="finance" className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-txt-primary">
              Compras, Gastos Operativos y Finanzas
            </h2>
            <p className="text-xs text-txt-muted">
              Control multidimensional de flujos contables (Física, Digital y Mixta), compras y auditoría.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {effectiveTab === 'dashboard' && canViewFinanceDashboard && (
            <>
              {canExportSales && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleExportSalesCashReport('CSV')}
                    isLoading={exportingSalesFormat === 'CSV'}
                    disabled={isExportingPdf || exportingSalesFormat !== null}
                    aria-label="Exportar Ventas y Caja en CSV"
                    leftIcon={<Icon name="download" className="w-4 h-4" aria-hidden="true" />}
                  >
                    Ventas CSV
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleExportSalesCashReport('XLSX')}
                    isLoading={exportingSalesFormat === 'XLSX'}
                    disabled={isExportingPdf || exportingSalesFormat !== null}
                    aria-label="Exportar Ventas y Caja en Excel (.xlsx)"
                    leftIcon={<Icon name="download" className="w-4 h-4" aria-hidden="true" />}
                  >
                    Ventas Excel (.xlsx)
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportFinancialPdf}
                isLoading={isExportingPdf}
                disabled={exportingSalesFormat !== null}
                leftIcon={<Icon name="download" className="w-4 h-4" aria-hidden="true" />}
              >
                Exportar Reporte PDF (RAM)
              </Button>
            </>
          )}
          <Badge variant={isAdmin ? 'success' : 'info'}>
            Rol: {currentSession.rol}
          </Badge>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={hook.refreshAll}
            isLoading={isLoading}
          >
            Sincronizar
          </Button>
        </div>
      </div>

      {pdfFeedback && (
        <Alert
          variant={pdfFeedback.variant}
          title="Exportación Documental"
          onClose={() => setPdfFeedback(null)}
        >
          {pdfFeedback.message}
        </Alert>
      )}

      {/* Manejo de Errores Globales del Módulo */}
      {error && (
        <Alert
          variant="danger"
          title="Error en Operación Contable / Financiera"
          onClose={handleClearError}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>{error.message}</span>
            <Button type="button" variant="secondary" size="sm" onClick={hook.refreshAll}>
              Reintentar
            </Button>
          </div>
        </Alert>
      )}

      {/* Navegación por Sub-Pestañas Accesibles (Radix Tabs) */}
      <Tabs
        value={effectiveTab}
        onValueChange={(nextValue) => setActiveTab(nextValue as FinanceMainTab)}
        className="gap-6"
      >
        <TabsList aria-label="Pestañas de Finanzas">
          {canViewFinanceDashboard && (
            <TabsTrigger value="dashboard">
              <Icon name="bar-chart" className="w-4 h-4" aria-hidden="true" />
              <span>Dashboard Financiero</span>
            </TabsTrigger>
          )}

          <TabsTrigger value="compras">
            <Icon name="package" className="w-4 h-4" aria-hidden="true" />
            <span>Compras a Proveedores</span>
          </TabsTrigger>

          <TabsTrigger value="gastos">
            <Icon name={isAdmin ? 'receipt' : 'lock'} className="w-4 h-4" aria-hidden="true" />
            <span>Gastos Operativos</span>
            {!isAdmin && (
              <Badge variant="warning" size="sm">
                Solo Admin
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="tachados">
            <Icon name="shield" className="w-4 h-4" aria-hidden="true" />
            <span>Bandeja Global de Tachados</span>
            {tachadasCount > 0 && (
              <Badge variant="warning" size="sm">
                {tachadasCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Contenido de la Sub-Pestaña Activa */}
        {canViewFinanceDashboard && (
          <TabsContent value="dashboard">
            <FinancialDashboardTab
              dashboard={dashboard}
              activeChannelView={hook.activeChannelView}
              onSelectChannelView={hook.setActiveChannelView}
              reportFilter={hook.reportFilter}
              onApplyFilter={(f) => {
                hook.setReportFilter(f);
                hook.fetchDashboard(f);
              }}
              isLoading={isLoading}
              onNavigateToStruckTray={() => setActiveTab('tachados')}
            />
          </TabsContent>
        )}

        <TabsContent value="compras">
          <SupplierPurchasesTab
            purchases={purchases}
            suppliers={suppliers}
            products={products}
            selectedPurchaseDetail={hook.selectedPurchaseDetail}
            isLoading={isLoading}
            isActionLoading={hook.isActionLoading}
            filter={hook.purchaseFilter}
            onFilterChange={(f) => {
              hook.setPurchaseFilter(f);
              hook.fetchPurchases(f);
            }}
            onRefresh={hook.fetchPurchases}
            onFetchDetail={hook.fetchPurchaseDetail}
            onCreatePurchase={hook.createPurchase}
            onCancelPurchase={hook.cancelPurchase}
            userRole={currentSession.rol}
          />
        </TabsContent>

        <TabsContent value="gastos">
          <OperationalExpensesTab
            expenses={expenses}
            isLoading={isLoading}
            isActionLoading={hook.isActionLoading}
            filter={hook.expenseFilter}
            onFilterChange={(f) => {
              hook.setExpenseFilter(f);
              hook.fetchExpenses(f);
            }}
            onRefresh={hook.fetchExpenses}
            onCreateExpense={hook.createExpense}
            onUpdateExpense={hook.updateExpense}
            onToggleActive={hook.toggleExpenseActive}
            userRole={currentSession.rol}
          />
        </TabsContent>

        <TabsContent value="tachados">
          <StruckSalesTrayTab
            items={struckSalesTray}
            isLoading={isLoading}
            isActionLoading={hook.isActionLoading}
            filter={hook.struckFilter}
            onFilterChange={(f) => {
              hook.setStruckFilter(f);
              hook.fetchStruckSalesTray(f);
            }}
            onRefresh={hook.fetchStruckSalesTray}
            onResolveStruckSale={hook.resolveStruckSale}
            userRole={currentSession.rol}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
