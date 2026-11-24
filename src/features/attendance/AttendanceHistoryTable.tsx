// ============================================================================
// COMPONENTE: HISTORIAL DE ASISTENCIAS Y AUDITORÍA DE INGRESO (SLICE 5)
// 4 Estados visuales: Skeleton, Empty, Error, Success
// Ubicación: src/features/attendance/AttendanceHistoryTable.tsx
// ============================================================================

import React, { useState } from 'react';
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
} from '../../components/primitives';
import { formatAttendanceMode } from '../../domain/attendance';
import {
  AttendanceCheckInMode,
  AttendanceFilter,
  AttendanceListItemDto,
  TrafficLightColor,
} from '../../types/attendance';

export interface AttendanceHistoryTableProps {
  attendances: AttendanceListItemDto[];
  isLoading: boolean;
  error: string | null;
  onFilterChange: (filter: AttendanceFilter) => void;
  onRetry: () => void;
  onOpenManualModal?: () => void;
}

const SEMAFORO_FILTER_OPTIONS = [
  { value: '', label: 'Todos los Semáforos' },
  { value: 'VERDE', label: 'Verde (Acceso)' },
  { value: 'AMARILLO', label: 'Amarillo (Alerta)' },
  { value: 'ROJO', label: 'Rojo (Pase Crédito)' },
];

const MODO_FILTER_OPTIONS = [
  { value: '', label: 'Todos los Modos' },
  { value: 'QR_LOCAL', label: 'Escaneo QR Local' },
  { value: 'MANUAL_OLVIDO_QR', label: 'Manual Olvido QR' },
  { value: 'PASE_DIARIO_CREDITO_ROJO', label: 'Pase Diario a Crédito' },
  { value: 'QR_MOVIL_LAN', label: 'Móvil LAN' },
];

export const AttendanceHistoryTable: React.FC<AttendanceHistoryTableProps> = ({
  attendances,
  isLoading,
  error,
  onFilterChange,
  onRetry,
  onOpenManualModal,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [selectedColor, setSelectedColor] = useState<TrafficLightColor | ''>('');
  const [selectedModo, setSelectedModo] = useState<AttendanceCheckInMode | ''>('');

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({
      busqueda: busqueda.trim() || undefined,
      colorSemaforo: selectedColor || undefined,
      modoIngreso: selectedModo || undefined,
    });
  };

  const handleResetFilters = () => {
    setBusqueda('');
    setSelectedColor('');
    setSelectedModo('');
    onFilterChange({});
  };

  // 1. ESTADO DE ERROR
  if (error && !isLoading) {
    return (
      <Alert
        variant="danger"
        floating={false}
        title="No se pudo cargar el historial de asistencias"
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
      {/* Barra de Filtros */}
      <div role="search">
        <Card padding="sm" className="shadow-2xs">
          <form
            onSubmit={handleFilterSubmit}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              <div className="flex-1 min-w-[200px]">
                <Input
                  type="text"
                  inputSize="sm"
                  aria-label="Buscar por socio, DNI o plan"
                  placeholder="Buscar por socio, DNI o plan..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  leftIcon={<Icon name="search" className="w-3.5 h-3.5" />}
                />
              </div>

              <div className="w-full sm:w-44">
                <Select
                  selectSize="sm"
                  aria-label="Filtrar por color de semáforo"
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value as TrafficLightColor | '')}
                  options={SEMAFORO_FILTER_OPTIONS}
                />
              </div>

              <div className="w-full sm:w-48">
                <Select
                  selectSize="sm"
                  aria-label="Filtrar por modo de ingreso"
                  value={selectedModo}
                  onChange={(e) => setSelectedModo(e.target.value as AttendanceCheckInMode | '')}
                  options={MODO_FILTER_OPTIONS}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm">
                Filtrar
              </Button>
              {(busqueda || selectedColor || selectedModo) && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleResetFilters}
                >
                  Limpiar
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>

      {/* 2. ESTADO LOADING / SKELETON */}
      {isLoading ? (
        <div
          data-testid="attendance-history-loading"
          role="status"
          aria-label="Cargando historial de asistencias"
          className="w-full flex flex-col gap-2"
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl border border-border" />
          ))}
        </div>
      ) : attendances.length === 0 ? (
        /* 3. EMPTY STATE ACCIONABLE */
        <Card
          data-testid="attendance-history-empty"
          className="border-dashed p-10 items-center justify-center text-center gap-3"
        >
          <div
            aria-hidden="true"
            className="w-14 h-14 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted border border-border"
          >
            <Icon name="audit" className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-txt-primary">No se encontraron asistencias</h4>
          <p className="text-xs text-txt-muted max-w-sm">
            Aún no hay registros que coincidan con los filtros seleccionados o no se han marcado
            ingresos hoy.
          </p>
          {onOpenManualModal && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onOpenManualModal}
              className="mt-2"
            >
              Registrar Primer Ingreso
            </Button>
          )}
        </Card>
      ) : (
        /* 4. SUCCESS / DATA STATE */
        <Table
          containerLabel="Historial de asistencias"
          containerClassName="rounded-xl shadow-xs"
          className="text-xs"
        >
          <TableHeader stickyHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Fecha / Hora</TableHead>
              <TableHead>Socio / Documento</TableHead>
              <TableHead>Plan Vigente</TableHead>
              <TableHead>Semáforo</TableHead>
              <TableHead>Modo Ingreso</TableHead>
              <TableHead>Motivo / Estado</TableHead>
              <TableHead>Días Restantes</TableHead>
              <TableHead>Deuda</TableHead>
              <TableHead>Operador</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attendances.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap font-medium">
                  {item.fechaHoraIngreso || item.createdAt}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-bold text-txt-primary">{item.nombreCompleto}</span>
                    <span className="text-[11px] text-txt-muted">
                      {item.tipoDocumento}: {item.numeroDocumento}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap font-medium text-txt-secondary">
                  {item.nombrePlan || 'Pase Sin Plan'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge
                    variant={
                      item.colorSemaforo === 'VERDE'
                        ? 'success'
                        : item.colorSemaforo === 'AMARILLO'
                        ? 'warning'
                        : 'danger'
                    }
                    size="sm"
                  >
                    {item.colorSemaforo}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-txt-secondary">
                  {formatAttendanceMode(item.modoIngreso)}
                </TableCell>
                <TableCell className="max-w-xs truncate" title={item.motivoSemaforo}>
                  {item.motivoSemaforo}
                  {item.creditoGeneradoId && (
                    <span className="block text-[10px] font-bold text-status-danger">
                      Crédito #{item.creditoGeneradoId}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap font-semibold">
                  {item.diasRestantesMomento !== null && item.diasRestantesMomento !== undefined ? (
                    <span
                      className={
                        item.diasRestantesMomento <= 5
                          ? 'text-status-warning font-bold'
                          : 'text-txt-primary'
                      }
                    >
                      {item.diasRestantesMomento} d
                    </span>
                  ) : (
                    <span className="text-txt-muted">-</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap font-bold">
                  {parseFloat(item.deudaPendienteMomento) > 0 ? (
                    <span className="text-status-danger">
                      S/ {parseFloat(item.deudaPendienteMomento).toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-status-success">S/ 0.00</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-txt-muted text-[11px]">
                  {item.registradoPorNombre || `Op #${item.registradoPorUsuarioId}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
