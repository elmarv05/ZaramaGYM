// ============================================================================
// COMPONENTE: TAB DE GASTOS OPERATIVOS (ADMIN EXCLUSIVO / RBAC BLINDADO)
// Control de egresos administrativos con política Zero-Delete y blindaje para Recepcionistas
// Ubicación: src/features/finance/components/OperationalExpensesTab.tsx
// ============================================================================

import React, { useId, useState } from 'react';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { Card } from '../../../components/primitives/Card';
import { ConfirmDialog } from '../../../components/primitives/ConfirmDialog';
import { Icon } from '../../../components/primitives/Icon';
import { Label } from '../../../components/primitives/Label';
import { Select, SelectOption } from '../../../components/primitives/Select';
import { Skeleton } from '../../../components/primitives/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/primitives/Table';
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

const CATEGORY_FILTER_OPTIONS: SelectOption[] = [
  { value: 'TODAS', label: 'Todas las Categorías' },
  ...(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => ({
    value: cat,
    label: EXPENSE_CATEGORY_LABELS[cat],
  })),
];

const CHANNEL_FILTER_OPTIONS: SelectOption[] = [
  { value: 'TODOS', label: 'Todos los Canales' },
  { value: 'FISICA', label: 'Caja Física (Efectivo)' },
  { value: 'DIGITAL', label: 'Caja Digital' },
];

const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { value: 'TODOS', label: 'Todos los Estados' },
  { value: '1', label: 'Activos' },
  { value: '0', label: 'Desactivados' },
];

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
  const categoriaId = useId();
  const canalId = useId();
  const estadoId = useId();

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

  // 1. BLINDAJE RBAC: Si el usuario no es ADMINISTRADOR
  if (!isAdmin) {
    return (
      <Card className="p-8 border-status-warning-border shadow-sm items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-status-warning-bg flex items-center justify-center text-status-warning">
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
        <Badge variant="warning">Acceso Restringido a Recepcionistas</Badge>
      </Card>
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
      <div className="flex flex-col gap-4" role="status" aria-label="Cargando gastos operativos">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Acciones y Filtros */}
      <Card padding="sm" className="lg:flex-row lg:items-center justify-between gap-3 shadow-sm">
        <div role="search" className="flex flex-wrap items-center gap-3">
          {/* Filtro Categoría */}
          <div className="flex items-center gap-1.5 text-xs">
            <Label htmlFor={categoriaId} className="normal-case text-txt-muted font-medium">
              Categoría:
            </Label>
            <div className="w-48">
              <Select
                id={categoriaId}
                selectSize="sm"
                value={categoriaFilter}
                onChange={(e) => handleApplyFilter(e.target.value, canalFilter, estadoFilter)}
                aria-label="Filtrar por Categoría de gasto"
                options={CATEGORY_FILTER_OPTIONS}
                className="bg-canvas"
              />
            </div>
          </div>

          {/* Filtro Canal */}
          <div className="flex items-center gap-1.5 text-xs">
            <Label htmlFor={canalId} className="normal-case text-txt-muted font-medium">
              Canal:
            </Label>
            <div className="w-44">
              <Select
                id={canalId}
                selectSize="sm"
                value={canalFilter}
                onChange={(e) => handleApplyFilter(categoriaFilter, e.target.value, estadoFilter)}
                aria-label="Filtrar por Canal de gasto"
                options={CHANNEL_FILTER_OPTIONS}
                className="bg-canvas"
              />
            </div>
          </div>

          {/* Filtro Estado */}
          <div className="flex items-center gap-1.5 text-xs">
            <Label htmlFor={estadoId} className="normal-case text-txt-muted font-medium">
              Estado:
            </Label>
            <div className="w-40">
              <Select
                id={estadoId}
                selectSize="sm"
                value={estadoFilter}
                onChange={(e) => handleApplyFilter(categoriaFilter, canalFilter, e.target.value)}
                aria-label="Filtrar por Estado activo"
                options={STATUS_FILTER_OPTIONS}
                className="bg-canvas"
              />
            </div>
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
      </Card>

      {/* 3. Empty State */}
      {expenses.length === 0 ? (
        <Card className="p-10 text-center items-center justify-center gap-3">
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
        </Card>
      ) : (
        /* 4. Data State: Tabla de Gastos Operativos */
        <Table
          containerLabel="Listado de gastos operativos"
          containerClassName="rounded-xl shadow-sm"
          className="text-xs"
        >
          <TableHeader stickyHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="p-3 normal-case tracking-normal">Categoría</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Descripción</TableHead>
              <TableHead className="p-3 text-right normal-case tracking-normal">Monto</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Método / Canal</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Referencia / Comprobante</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Fecha</TableHead>
              <TableHead className="p-3 normal-case tracking-normal">Operador</TableHead>
              <TableHead className="p-3 text-center normal-case tracking-normal">Estado</TableHead>
              <TableHead className="p-3 text-right normal-case tracking-normal">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((exp) => {
              const isActivo = exp.estado_activo === 1;
              return (
                <TableRow
                  key={exp.id}
                  className={!isActivo ? 'opacity-60 bg-canvas/30' : undefined}
                >
                  <TableCell className="p-3">
                    <span className="font-bold text-txt-primary block">
                      {EXPENSE_CATEGORY_LABELS[exp.categoria] || exp.categoria}
                    </span>
                  </TableCell>
                  <TableCell className="p-3">
                    <span className="text-txt-primary font-medium">{exp.descripcion}</span>
                    {exp.notas && (
                      <span className="text-[11px] text-txt-muted block italic">
                        Nota: {exp.notas}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="p-3 text-right font-black text-sm text-txt-primary">
                    {formatCurrency(exp.monto)}
                  </TableCell>
                  <TableCell className="p-3">
                    <span className="font-semibold text-txt-primary block">{exp.metodo_pago}</span>
                    <Badge variant={exp.canal_caja === 'FISICA' ? 'success' : 'info'} size="sm">
                      {exp.canal_caja}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-3 text-txt-secondary font-mono">
                    {exp.comprobante_referencia || '—'}
                  </TableCell>
                  <TableCell className="p-3 text-txt-secondary">{exp.fecha_gasto?.slice(0, 10)}</TableCell>
                  <TableCell className="p-3 text-txt-secondary">@{exp.registrado_por_username}</TableCell>
                  <TableCell className="p-3 text-center">
                    <Badge variant={isActivo ? 'success' : 'danger'}>
                      {isActivo ? 'ACTIVO' : 'INACTIVO'}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-3 text-right space-x-1.5 whitespace-nowrap">
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
