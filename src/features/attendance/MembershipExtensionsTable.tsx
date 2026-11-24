// ============================================================================
// COMPONENTE: HISTORIAL DE EXTENSIONES Y RECUPERACIÓN DE DÍAS (SLICE 5)
// Bitácora auditada de prórrogas manuales concedidas
// Ubicación: src/features/attendance/MembershipExtensionsTable.tsx
// ============================================================================

import React from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/primitives';
import { MembershipExtensionDto } from '../../types/attendance';

export interface MembershipExtensionsTableProps {
  extensions: MembershipExtensionDto[];
  isLoading: boolean;
  error: string | null;
  canExtendMembership?: boolean;
  onOpenExtendModal: () => void;
  onRetry: () => void;
}

export const MembershipExtensionsTable: React.FC<MembershipExtensionsTableProps> = ({
  extensions,
  isLoading,
  error,
  canExtendMembership = true,
  onOpenExtendModal,
  onRetry,
}) => {
  // 1. ESTADO DE ERROR
  if (error && !isLoading) {
    return (
      <Alert
        variant="danger"
        floating={false}
        title="Error al cargar prórrogas de membresía"
        className="p-6 flex-col items-center text-center"
      >
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs max-w-md">{error}</p>
          <Button type="button" variant="danger" size="sm" onClick={onRetry}>
            Reintentar Carga
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-txt-primary">
            Registro Histórico de Prórrogas y Recuperación de Días
          </h3>
          <p className="text-xs text-txt-muted">
            Todas las extensiones manuales de membresía son auditadas de forma inmutable.
          </p>
        </div>
        {canExtendMembership && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-testid="btn-open-extend-modal"
            onClick={onOpenExtendModal}
            leftIcon={<Icon name="plus" className="w-4 h-4" />}
          >
            Otorgar Días de Membresía
          </Button>
        )}
      </div>

      {/* 2. LOADING / SKELETON */}
      {isLoading ? (
        <div
          data-testid="extensions-loading"
          role="status"
          aria-label="Cargando prórrogas de membresía"
          className="w-full flex flex-col gap-2"
        >
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl border border-border" />
          ))}
        </div>
      ) : extensions.length === 0 ? (
        /* 3. EMPTY STATE */
        <Card
          data-testid="extensions-empty"
          className="border-dashed p-10 items-center justify-center text-center gap-3"
        >
          <div
            aria-hidden="true"
            className="w-14 h-14 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted border border-border"
          >
            <Icon name="calendar" className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-txt-primary">
            No se han registrado extensiones de membresía
          </h4>
          <p className="text-xs text-txt-muted max-w-sm">
            {canExtendMembership
              ? 'Cuando un socio justifique inasistencia médica o viaje, use el botón superior para extender sus días válidos.'
              : 'Consulta aquí el historial auditado de prórrogas autorizadas por el Administrador.'}
          </p>
          {canExtendMembership && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onOpenExtendModal}
              className="mt-2"
            >
              Otorgar Primera Prórroga
            </Button>
          )}
        </Card>
      ) : (
        /* 4. SUCCESS / DATA STATE */
        <Table
          containerLabel="Registro histórico de prórrogas y recuperación de días"
          containerClassName="rounded-xl shadow-xs"
          className="text-xs"
        >
          <TableHeader stickyHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Fecha Registro</TableHead>
              <TableHead>Socio Beneficiario</TableHead>
              <TableHead>Plan Vigente</TableHead>
              <TableHead>Días Otorgados</TableHead>
              <TableHead>Vigencia Anterior</TableHead>
              <TableHead>Nueva Vigencia</TableHead>
              <TableHead>Motivo / Justificación</TableHead>
              <TableHead>Autorizado Por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {extensions.map((ext) => (
              <TableRow key={ext.id}>
                <TableCell className="whitespace-nowrap text-txt-muted font-medium">
                  {ext.createdAt}
                </TableCell>
                <TableCell className="font-bold">{ext.nombreCliente}</TableCell>
                <TableCell className="text-txt-secondary font-medium">{ext.nombrePlan}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant="success" size="sm" className="normal-case">
                    +{ext.diasOtorgados} días
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-txt-muted">
                  {ext.fechaVencimientoAnterior.split(' ')[0]}
                </TableCell>
                <TableCell className="whitespace-nowrap font-bold text-status-success">
                  {ext.fechaVencimientoNueva.split(' ')[0]} 23:59
                </TableCell>
                <TableCell className="max-w-xs truncate" title={ext.motivoJustificacion}>
                  {ext.motivoJustificacion}
                </TableCell>
                <TableCell className="whitespace-nowrap text-txt-secondary text-[11px]">
                  {ext.autorizadoPorNombre || `Usuario #${ext.autorizadoPorUsuarioId}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
