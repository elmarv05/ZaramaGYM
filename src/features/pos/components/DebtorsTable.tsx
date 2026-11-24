// ============================================================================
// COMPONENTE: BANDEJA DE DEUDORES Y CRÉDITOS (DEBTORS TABLE)
// Cuentas por cobrar con filtros por estado y botón rápido de amortización en POS
// Ubicación: src/features/pos/components/DebtorsTable.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Input,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/primitives';
import { formatMoney } from '../../../domain/pos';
import { triggerBase64FileDownload } from '../../../domain/printingBackup';
import { normalizeAppError } from '../../../services/ipc/client';
import { dashboardIpc } from '../../../services/ipc/dashboardIpc';
import { ExportFileResult, ExportFormat } from '../../../types/dashboard';
import { ClientCreditDto, CreditOrigin, CreditState } from '../../../types/pos';

export interface DebtorsTableProps {
  credits: ClientCreditDto[];
  isLoading?: boolean;
  onAmortizeInPos: (credit: ClientCreditDto) => void;
  onRefresh?: () => void;
  onExportPortfolio?: (format: ExportFormat) => Promise<ExportFileResult | void>;
}

const ESTADO_OPTIONS = [
  { value: 'PENDIENTE', label: 'Solo Pendientes (Con Deuda)' },
  { value: 'TODOS', label: 'Todos los Estados' },
  { value: 'PAGADO', label: 'Totalmente Pagados' },
  { value: 'ANULADO', label: 'Anulados por Tachado' },
];

const ORIGEN_OPTIONS = [
  { value: 'TODOS', label: 'Todos los Orígenes' },
  { value: 'MEMBRESIA_PAGO_PARCIAL', label: 'Membresía (Pago Parcial)' },
  { value: 'PRODUCTO_CREDITO', label: 'Producto a Crédito' },
  { value: 'PASE_DIARIO_SEMAFORO_ROJO', label: 'Pase Diario Semáforo Rojo' },
];

export const DebtorsTable: React.FC<DebtorsTableProps> = ({
  credits,
  isLoading = false,
  onAmortizeInPos,
  onRefresh,
  onExportPortfolio,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<string>('PENDIENTE');
  const [origenFilter, setOrigenFilter] = useState<string>('TODOS');
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{
    variant: 'success' | 'danger';
    title: string;
    message: string;
  } | null>(null);

  const filteredCredits = useMemo(() => {
    return credits.filter((c) => {
      const matchesSearch =
        c.cliente_nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.cliente_numero_documento.includes(searchTerm);
      const matchesEstado = estadoFilter === 'TODOS' || c.estado === estadoFilter;
      const matchesOrigen = origenFilter === 'TODOS' || c.origen_credito === origenFilter;
      return matchesSearch && matchesEstado && matchesOrigen;
    });
  }, [credits, searchTerm, estadoFilter, origenFilter]);

  const handleExportDebtors = async (format: ExportFormat) => {
    setExportingFormat(format);
    setExportFeedback(null);
    try {
      let res: ExportFileResult | void;
      if (onExportPortfolio) {
        res = await onExportPortfolio(format);
      } else {
        res = await dashboardIpc.exportDebtorsPortfolio(format);
        triggerBase64FileDownload(res.content_base64, res.filename, res.mime_type);
      }
      const detail = res
        ? `Archivo ${res.filename} descargado (${res.row_count} registro${res.row_count === 1 ? '' : 's'}).`
        : `Cartera de deudores exportada en formato ${format}.`;
      setExportFeedback({
        variant: 'success',
        title: 'Cartera de deudores exportada',
        message: detail,
      });
    } catch (err) {
      const normalized = normalizeAppError(err);
      setExportFeedback({
        variant: 'danger',
        title: 'Error al exportar cartera de deudores',
        message: normalized.message,
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const totalDeudaPendiente = useMemo(() => {
    return credits
      .filter((c) => c.estado === 'PENDIENTE')
      .reduce((acc, c) => acc + (parseFloat(c.saldo_pendiente) || 0), 0);
  }, [credits]);

  const getOriginBadge = (origen: CreditOrigin) => {
    switch (origen) {
      case 'MEMBRESIA_PAGO_PARCIAL':
        return <Badge variant="warning" size="sm">Membresía Parcial</Badge>;
      case 'PRODUCTO_CREDITO':
        return <Badge variant="info" size="sm">Crédito Producto</Badge>;
      case 'PASE_DIARIO_SEMAFORO_ROJO':
        return <Badge variant="danger" size="sm">Pase Semáforo Rojo</Badge>;
      default:
        return null;
    }
  };

  const getStatusBadge = (estado: CreditState) => {
    switch (estado) {
      case 'PENDIENTE':
        return <Badge variant="danger" size="sm">Pendiente</Badge>;
      case 'PAGADO':
        return <Badge variant="success" size="sm">Pagado</Badge>;
      case 'ANULADO':
        return <Badge variant="default" size="sm">Anulado</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card padding="md" className="w-full gap-4">
      {/* Cabecera y Métricas de Deuda */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="font-bold text-txt-primary text-base sm:text-lg flex items-center gap-2">
            <Icon name="credit-card" className="w-5 h-5 text-brand" aria-hidden="true" />
            Cartera de Cuentas por Cobrar
          </h3>
          <p className="text-xs text-txt-secondary">
            Control centralizado de créditos generados por membresías con pago parcial, productos a crédito o pases diarios.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-status-warning-bg border border-status-warning-border px-3 py-1.5 rounded-lg flex flex-col">
            <span className="text-[10px] uppercase font-bold text-status-warning">
              Total Cartera Pendiente
            </span>
            <span className="text-sm font-black text-status-warning">
              S/ {formatMoney(totalDeudaPendiente)}
            </span>
          </div>

          <div
            role="group"
            aria-label="Exportar Cartera de Deudores"
            className="flex items-center gap-1.5"
          >
            {(['CSV', 'XLSX', 'PDF'] as ExportFormat[]).map((fmt) => {
              const label = fmt === 'XLSX' ? 'Excel (.xlsx)' : fmt;
              return (
                <Button
                  key={fmt}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportingFormat !== null || isLoading}
                  isLoading={exportingFormat === fmt}
                  aria-label={`Exportar Cartera de Deudores en ${label}`}
                  leftIcon={<Icon name="download" className="w-3.5 h-3.5" aria-hidden="true" />}
                  onClick={() => void handleExportDebtors(fmt)}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          {onRefresh && (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onRefresh}
              title="Refrescar cartera"
              aria-label="Refrescar cartera"
            >
              <Icon name="refresh" className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {exportFeedback && (
        <Alert
          variant={exportFeedback.variant}
          title={exportFeedback.title}
          onClose={() => setExportFeedback(null)}
        >
          {exportFeedback.message}
        </Alert>
      )}

      {/* Barra de Filtros */}
      <div role="search" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          inputSize="sm"
          aria-label="Buscar por socio o DNI"
          placeholder="Buscar por socio o DNI..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <Select
          selectSize="sm"
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          aria-label="Filtrar por estado de crédito"
          options={ESTADO_OPTIONS}
        />

        <Select
          selectSize="sm"
          value={origenFilter}
          onChange={(e) => setOrigenFilter(e.target.value)}
          aria-label="Filtrar por origen de crédito"
          options={ORIGEN_OPTIONS}
        />
      </div>

      {/* 1. Loading */}
      {isLoading && (
        <div role="status" aria-label="Cargando cartera de créditos y deudores" className="flex flex-col gap-2.5 py-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      )}

      {/* 2. Empty State */}
      {!isLoading && filteredCredits.length === 0 && (
        <div
          role="region"
          aria-label="Cartera de Deudores Vacía"
          className="w-full bg-surface border border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center gap-2"
        >
          <div
            aria-hidden="true"
            className="w-12 h-12 rounded-full bg-status-success-bg text-status-success flex items-center justify-center"
          >
            <Icon name="check" className="w-6 h-6" aria-hidden="true" />
          </div>
          <h4 className="text-sm font-bold text-txt-primary">No hay cuentas pendientes de cobro</h4>
          <p className="text-xs text-txt-muted max-w-sm">
            Todos los socios se encuentran al día o no se encontraron deudas con los filtros seleccionados.
          </p>
        </div>
      )}

      {/* 3. Tabla de Resultados */}
      {!isLoading && filteredCredits.length > 0 && (
        <Table
          containerLabel="Cartera de cuentas por cobrar"
          containerClassName="rounded-xl shadow-xs"
          className="text-xs"
        >
          <TableHeader stickyHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 py-3 text-[11px]">Cliente / DNI</TableHead>
              <TableHead className="px-3 py-3 text-[11px]">Origen y Concepto</TableHead>
              <TableHead className="px-3 py-3 text-right text-[11px]">Monto Total</TableHead>
              <TableHead className="px-3 py-3 text-right text-[11px]">Amortizado</TableHead>
              <TableHead className="px-3 py-3 text-right text-[11px]">Saldo Deudor</TableHead>
              <TableHead className="px-3 py-3 text-center text-[11px]">Estado</TableHead>
              <TableHead className="px-4 py-3 text-center text-[11px]">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCredits.map((credit) => (
              <TableRow key={credit.id}>
                <TableCell className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-bold text-txt-primary">
                      {credit.cliente_nombre_completo}
                    </span>
                    <span className="text-[11px] text-txt-muted">
                      DNI: {credit.cliente_numero_documento}
                      {credit.cliente_telefono && ` • Tel: ${credit.cliente_telefono}`}
                    </span>
                  </div>
                </TableCell>

                <TableCell className="px-3 py-3">
                  <div className="flex flex-col gap-0.5">
                    <div>{getOriginBadge(credit.origen_credito)}</div>
                    <span className="text-txt-secondary text-[11px] line-clamp-1">
                      {credit.descripcion}
                    </span>
                  </div>
                </TableCell>

                <TableCell className="px-3 py-3 text-right text-txt-secondary font-medium">
                  S/ {formatMoney(credit.monto_total)}
                </TableCell>

                <TableCell className="px-3 py-3 text-right text-status-success font-medium">
                  S/ {formatMoney(credit.monto_pagado)}
                </TableCell>

                <TableCell className="px-3 py-3 text-right font-black text-status-warning text-sm">
                  S/ {formatMoney(credit.saldo_pendiente)}
                </TableCell>

                <TableCell className="px-3 py-3 text-center">
                  {getStatusBadge(credit.estado)}
                </TableCell>

                <TableCell className="px-4 py-3 text-center">
                  {credit.estado === 'PENDIENTE' && parseFloat(credit.saldo_pendiente) > 0 ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => onAmortizeInPos(credit)}
                      leftIcon={<Icon name="credit-card" className="w-4 h-4" aria-hidden="true" />}
                      className="text-xs font-bold whitespace-nowrap shadow-xs"
                    >
                      Amortizar en POS
                    </Button>
                  ) : (
                    <span className="text-[11px] text-txt-muted italic">Sin saldo</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
};
