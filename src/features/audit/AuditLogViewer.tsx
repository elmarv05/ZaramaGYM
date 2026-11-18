// ============================================================================
// COMPONENTE: VISOR DE BITÁCORA DE AUDITORÍA UNIVERSAL (AUDIT LOG VIEWER)
// Solo visible para Administradores
// Ubicación: src/features/audit/AuditLogViewer.tsx
// ============================================================================

import React, { useState } from 'react';
import { AuditFilter, AuditLogItem, AppError } from '../../types/auth';
import { Button } from '../../components/primitives/Button';
import { Badge } from '../../components/primitives/Badge';
import { Input } from '../../components/primitives/Input';
import { Select } from '../../components/primitives/Select';
import { Modal } from '../../components/primitives/Modal';
import { Alert } from '../../components/primitives/Alert';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
  TableLoadingSkeleton,
} from '../../components/primitives/Table';

export interface AuditLogViewerProps {
  logs: AuditLogItem[];
  filter: AuditFilter;
  isLoading: boolean;
  error: AppError | null;
  onFilterChange: (filter: AuditFilter) => void;
  onRefresh: () => void;
  onClearError?: () => void;
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
  logs,
  filter,
  isLoading,
  error,
  onFilterChange,
  onRefresh,
  onClearError,
}) => {
  const [localFilter, setLocalFilter] = useState<AuditFilter>(filter);
  const [selectedJsonDetails, setSelectedJsonDetails] = useState<{
    logId: number;
    action: string;
    json: string;
  } | null>(null);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (onClearError) onClearError();
    onFilterChange(localFilter);
  };

  const handleResetFilter = () => {
    const empty: AuditFilter = {
      modulo: '',
      accion: '',
      username: '',
      limit: 100,
    };
    setLocalFilter(empty);
    if (onClearError) onClearError();
    onFilterChange(empty);
  };

  const formatPrettyJson = (raw: string): string => {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Panel de Filtros */}
      <form
        onSubmit={handleApplyFilter}
        className="p-4 bg-surface border border-border rounded-lg shadow-sm flex flex-col gap-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Input
            label="Módulo"
            placeholder="Ej: AUTH, USER..."
            value={localFilter.modulo || ''}
            onChange={(e) =>
              setLocalFilter((prev) => ({ ...prev, modulo: e.target.value }))
            }
            disabled={isLoading}
          />

          <Input
            label="Acción"
            placeholder="Ej: LOGIN_EXITOSO..."
            value={localFilter.accion || ''}
            onChange={(e) =>
              setLocalFilter((prev) => ({ ...prev, accion: e.target.value }))
            }
            disabled={isLoading}
          />

          <Input
            label="Usuario"
            placeholder="Ej: admin..."
            value={localFilter.username || ''}
            onChange={(e) =>
              setLocalFilter((prev) => ({ ...prev, username: e.target.value }))
            }
            disabled={isLoading}
          />

          <Select
            label="Límite de Registros"
            options={[
              { value: '50', label: '50 más recientes' },
              { value: '100', label: '100 más recientes' },
              { value: '250', label: '250 más recientes' },
              { value: '500', label: '500 más recientes (Máx)' },
            ]}
            value={String(localFilter.limit || 100)}
            onChange={(e) =>
              setLocalFilter((prev) => ({
                ...prev,
                limit: Number(e.target.value),
              }))
            }
            disabled={isLoading}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border mt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetFilter}
            disabled={isLoading}
          >
            Limpiar Filtros
          </Button>

          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={isLoading}
            leftIcon={
              <svg className="w-3.5 h-3.5 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            }
          >
            Aplicar Filtro
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refrescar auditoría"
          >
            Refrescar
          </Button>
        </div>
      </form>

      {/* Manejo de Error */}
      {error && (
        <Alert
          variant="danger"
          title="Error al consultar bitácora de auditoría"
          actionText="Reintentar carga"
          onAction={onRefresh}
          onClose={onClearError}
        >
          {error.message}
        </Alert>
      )}

      {/* Tabla de Bitácora Inmutable */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead>Fecha / Hora</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Módulo</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Terminal / IP</TableHead>
            <TableHead className="text-right">Detalles JSON</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <TableLoadingSkeleton colSpan={7} rows={5} />
          ) : logs.length === 0 ? (
            <TableEmptyState
              colSpan={7}
              title="No se encontraron registros de auditoría"
              description="No hay eventos en la bitácora que coincidan con los filtros aplicados."
              action={
                <Button variant="secondary" size="sm" onClick={handleResetFilter}>
                  Restablecer Filtros
                </Button>
              }
            />
          ) : (
            logs.map((log) => {
              const isSecurityOrAlert =
                log.accion.includes('FALLIDO') ||
                log.accion.includes('LOCKED') ||
                log.accion.includes('TOGGLE');

              return (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-xs text-txt-muted">
                    #{log.id}
                  </TableCell>

                  <TableCell className="font-mono text-xs text-txt-secondary whitespace-nowrap">
                    {log.created_at}
                  </TableCell>

                  <TableCell>
                    <span className="font-semibold text-xs text-txt-primary">
                      @{log.username}
                    </span>
                  </TableCell>

                  <TableCell>
                    <Badge variant="default" size="sm">
                      {log.modulo}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant={
                        log.accion.includes('EXITOSO')
                          ? 'success'
                          : isSecurityOrAlert
                          ? 'warning'
                          : 'default'
                      }
                      size="sm"
                    >
                      {log.accion}
                    </Badge>
                  </TableCell>

                  <TableCell className="text-xs text-txt-muted font-mono">
                    {log.ip_o_terminal}
                  </TableCell>

                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedJsonDetails({
                          logId: log.id,
                          action: log.accion,
                          json: log.detalles_json,
                        })
                      }
                    >
                      Ver Detalle
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Modal Inspector Forense de Detalles JSON */}
      {selectedJsonDetails && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedJsonDetails(null)}
          title={`Detalle de Evento #${selectedJsonDetails.logId}: ${selectedJsonDetails.action}`}
          description="Estructura inmutable JSON registrada en SQLite para este evento del sistema."
          size="lg"
        >
          <div className="flex flex-col gap-3">
            <div className="bg-canvas-subtle p-3.5 rounded-lg border border-border">
              <pre className="font-mono text-xs text-txt-primary overflow-x-auto whitespace-pre-wrap leading-relaxed select-text">
                {formatPrettyJson(selectedJsonDetails.json)}
              </pre>
            </div>
            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedJsonDetails(null)}
              >
                Cerrar Inspector
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
