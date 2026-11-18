// ============================================================================
// COMPONENTE: TAB DE GASTOS OPERATIVOS (ADMIN EXCLUSIVO / RBAC BLINDADO)
// Control de egresos administrativos con política Zero-Delete y blindaje para Supervisores
// Ubicación: src/features/finance/components/OperationalExpensesTab.tsx
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { ConfirmDialog } from '../../../components/primitives/ConfirmDialog';
import { Icon } from '../../../components/primitives/Icon';
import {
  EXPENSE_CATEGORY_LABELS,
  canManageExpenses,
  formatCurrency,
} from '../../../domain/finance';
import {
  CreateExpenseDto,
  ExpenseCategory,
  ExpenseFilter,
  OperationalExpenseDto,
  UpdateExpenseDto,
} from '../../../types/finance';
import { ExpenseFormModal } from './ExpenseFormModal';

export interface OperationalExpensesTabProps {
  expenses: OperationalExpenseDto[];
  isLoading: boolean;
  isActionLoading: boolean;
  filter: ExpenseFilter;
  onFilterChange: (filter: ExpenseFilter) => void;
  onRefresh: () => void;
  onCreateExpense: (input: CreateExpenseDto) => Promise<OperationalExpenseDto>;
  onUpdateExpense: (id: number, input: UpdateExpenseDto) => Promise<OperationalExpenseDto>;
  onToggleActive: (id: number) => Promise<OperationalExpenseDto>;
  userRole?: string;
}

export const OperationalExpensesTab: React.FC<OperationalExpensesTabProps> = ({
  expenses,
  isLoading,
  isActionLoading,
  filter,
  onFilterChange,
  onRefresh,
  onCreateExpense,
  onUpdateExpense,
  onToggleActive,
  userRole,
}) => {
  const isAdmin = canManageExpenses(userRole);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<OperationalExpenseDto | null>(null);
  const [expenseToDeactivate, setExpenseToDeactivate] =
    useState<OperationalExpenseDto | null>(null);

  // Filtros locales
  const [categoriaFilter, setCategoriaFilter] = useState<string>(filter.categoria || 'TODAS');
  const [canalFilter, setCanalFilter] = useState<string>(filter.canal_caja || 'TODOS');
  const [estadoFilter, setEstadoFilter] = useState<string>(
    filter.estado_activo !== undefined && filter.estado_activo !== null
      ? String(filter.estado_activo)
      : 'TODOS'
  );

  // 1. BLINDAJE RBAC: Si el usuario es SUPERVISOR (o no admin)
  if (!isAdmin) {
    return (
      <div className="p-8 bg-surface rounded-xl border border-amber-300 dark:border-amber-900/50 shadow-sm flex flex-col items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center text-amber-700 dark:text-amber-300">
          <Icon name="lock" className="w-6 h-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-bold text-txt-primary">
          Gastos Operativos (Módulo Exclusivo para Administrador)
        </h3>
        <p className="text-xs text-txt-secondary max-w-lg leading-relaxed">
          Por directivas contables y de seguridad operacional en <strong>ZaramaGYM</strong>, la visualización,
          registro y auditoría de egresos operativos (alquiler, nóminas, servicios e impuestos) está reservada
          únicamente para el rol <strong>ADMINISTRADOR</strong>.
        </p>
        <Badge variant="warning">Acceso Restringido a Supervisores y Recepcionistas</Badge>
      </div>
    );
  }

  const handleApplyFilter = (newCat: string, newCanal: string, newEstado: string) => {
    setCategoriaFilter(newCat);
    setCanalFilter(newCanal);
    setEstadoFilter(newEstado);

    onFilterChange({
      categoria: newCat === 'TODAS' ? undefined : (newCat as ExpenseCategory),
      canal_caja: newCanal === 'TODOS' ? undefined : (newCanal as any),
      estado_activo: newEstado === 'TODOS' ? undefined : Number(newEstado),
    });
  };

  const handleOpenCreate = () => {
    setEditingExpense(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (expense: OperationalExpenseDto) => {
    setEditingExpense(expense);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (input: CreateExpenseDto | UpdateExpenseDto) => {
    if (editingExpense) {
      await onUpdateExpense(editingExpense.id, input);
    } else {
      await onCreateExpense(input as CreateExpenseDto);
    }
  };

  // 2. Loading State
  if (isLoading && expenses.length === 0) {
    return (
      <div className="flex flex-col gap-4 animate-pulse" role="status" aria-label="Cargando gastos operativos">
        <div className="h-12 bg-surface rounded-xl border border-border" />
        <div className="h-64 bg-surface rounded-xl border border-border" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Acciones y Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 bg-surface rounded-xl border border-border shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro Categoría */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-txt-muted font-medium">Categoría:</span>
            <select
              value={categoriaFilter}
              onChange={(e) => handleApplyFilter(e.target.value, canalFilter, estadoFilter)}
              aria-label="Filtrar por Categoría de gasto"
              className="px-2 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs outline-none"
            >
              <option value="TODAS">Todas las Categorías</option>
              {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {EXPENSE_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Canal */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-txt-muted font-medium">Canal:</span>
            <select
              value={canalFilter}
              onChange={(e) => handleApplyFilter(categoriaFilter, e.target.value, estadoFilter)}
              aria-label="Filtrar por Canal de gasto"
              className="px-2 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs outline-none"
            >
              <option value="TODOS">Todos los Canales</option>
              <option value="FISICA">Caja Física (Efectivo)</option>
              <option value="DIGITAL">Caja Digital</option>
            </select>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-txt-muted font-medium">Estado:</span>
            <select
              value={estadoFilter}
              onChange={(e) => handleApplyFilter(categoriaFilter, canalFilter, e.target.value)}
              aria-label="Filtrar por Estado activo"
              className="px-2 py-1.5 rounded-md border border-border bg-canvas text-txt-primary text-xs outline-none"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="1">Activos</option>
              <option value="0">Desactivados</option>
            </select>
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={onRefresh} isLoading={isLoading}>
            Refrescar
          </Button>
        </div>

        <div>
          <Button type="button" variant="primary" size="sm" onClick={handleOpenCreate}>
            + Registrar Gasto Operativo
          </Button>
        </div>
      </div>

      {/* 3. Empty State */}
      {expenses.length === 0 ? (
        <div className="p-10 text-center bg-surface rounded-xl border border-border flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center text-txt-muted">
            <Icon name="receipt" className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-bold text-txt-primary">No se encontraron gastos operativos</h3>
          <p className="text-xs text-txt-muted max-w-sm">
            Registra los costos fijos y variables del gimnasio para mantener el balance y flujo neto al día.
          </p>
          <Button type="button" variant="primary" size="sm" onClick={handleOpenCreate}>
            + Registrar Primer Gasto
          </Button>
        </div>
      ) : (
        /* 4. Data State: Tabla de Gastos Operativos */
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas-subtle text-txt-muted border-b border-border">
                <tr>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Descripción</th>
                  <th className="p-3 text-right">Monto</th>
                  <th className="p-3">Método / Canal</th>
                  <th className="p-3">Referencia / Comprobante</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Operador</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {expenses.map((exp) => {
                  const isActivo = exp.estado_activo === 1;
                  return (
                    <tr
                      key={exp.id}
                      className={`hover:bg-canvas/50 transition-colors ${
                        !isActivo ? 'opacity-60 bg-canvas/30' : ''
                      }`}
                    >
                      <td className="p-3">
                        <span className="font-bold text-txt-primary block">
                          {EXPENSE_CATEGORY_LABELS[exp.categoria] || exp.categoria}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-txt-primary font-medium">{exp.descripcion}</span>
                        {exp.notas && (
                          <span className="text-[11px] text-txt-muted block italic">
                            Nota: {exp.notas}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-black text-sm text-txt-primary">
                        {formatCurrency(exp.monto)}
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-txt-primary block">{exp.metodo_pago}</span>
                        <Badge variant={exp.canal_caja === 'FISICA' ? 'success' : 'info'} size="sm">
                          {exp.canal_caja}
                        </Badge>
                      </td>
                      <td className="p-3 text-txt-secondary font-mono">
                        {exp.comprobante_referencia || '—'}
                      </td>
                      <td className="p-3 text-txt-secondary">{exp.fecha_gasto?.slice(0, 10)}</td>
                      <td className="p-3 text-txt-secondary">@{exp.registrado_por_username}</td>
                      <td className="p-3 text-center">
                        <Badge variant={isActivo ? 'success' : 'danger'}>
                          {isActivo ? 'ACTIVO' : 'INACTIVO'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenEdit(exp)}
                          disabled={isActionLoading}
                        >
                          Editar
                        </Button>

                        <Button
                          type="button"
                          variant={isActivo ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => {
                            if (isActivo) {
                              setExpenseToDeactivate(exp);
                            } else {
                              onToggleActive(exp.id);
                            }
                          }}
                          isLoading={isActionLoading}
                        >
                          {isActivo ? 'Desactivar' : 'Activar'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Registro / Edición */}
      <ExpenseFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialData={editingExpense}
        isLoading={isActionLoading}
      />

      <ConfirmDialog
        isOpen={Boolean(expenseToDeactivate)}
        onClose={() => setExpenseToDeactivate(null)}
        onConfirm={async () => {
          if (!expenseToDeactivate) return;
          try {
            await onToggleActive(expenseToDeactivate.id);
          } finally {
            setExpenseToDeactivate(null);
          }
        }}
        variant="danger"
        title="¿Desactivar gasto operativo?"
        description="El egreso dejará de contabilizarse en el flujo neto de caja."
        confirmText="Sí, desactivar gasto"
        cancelText="Cancelar"
        isLoading={isActionLoading}
      >
        {expenseToDeactivate && (
          <p>
            Gasto: <strong>{expenseToDeactivate.descripcion}</strong> (
            {formatCurrency(expenseToDeactivate.monto)})
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
};
