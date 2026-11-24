// ============================================================================
// COMPONENTE: PESTAÑA SERIES DOCUMENTALES (NOTA VENTA, BOLETA, FACTURA)
// Ubicación: src/features/printing_backup/components/ReceiptSeriesTab.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert } from '../../../components/primitives/Alert';
import { Badge } from '../../../components/primitives/Badge';
import { Button } from '../../../components/primitives/Button';
import { CheckboxField } from '../../../components/primitives/Checkbox';
import { Icon } from '../../../components/primitives/Icon';
import { Input } from '../../../components/primitives/Input';
import { Modal } from '../../../components/primitives/Modal';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyState,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/primitives/Table';
import { RECEIPT_TYPE_LABELS } from '../../../domain/printingBackup';
import { preventEnterKeySubmit } from '../../../utils/formSafety';
import {
  ReceiptSeries,
  UpdateReceiptSeriesRequest,
} from '../../../types/printingBackup';

export interface ReceiptSeriesTabProps {
  series: ReceiptSeries[];
  isAdmin: boolean;
  isLoading: boolean;
  isActionLoading: boolean;
  onUpdateSeries: (req: UpdateReceiptSeriesRequest) => Promise<ReceiptSeries>;
  onRefresh: () => void;
}

export const ReceiptSeriesTab: React.FC<ReceiptSeriesTabProps> = ({
  series,
  isAdmin,
  isLoading,
  isActionLoading,
  onUpdateSeries,
  onRefresh,
}) => {
  const [editingSeries, setEditingSeries] = useState<ReceiptSeries | null>(null);
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editActivo, setEditActivo] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleOpenEdit = (s: ReceiptSeries) => {
    setEditingSeries(s);
    setEditDescripcion(s.descripcion || '');
    setEditActivo(s.estado_activo);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeries) return;

    try {
      await onUpdateSeries({
        serie_id: editingSeries.id,
        descripcion: editDescripcion.trim() || null,
        estado_activo: editActivo,
      });

      setFeedbackMsg(`Serie ${editingSeries.serie} actualizada con éxito.`);
      setEditingSeries(null);
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch {
      // Error manejado en hook
    }
  };

  // Formato correlativo con padding de 6 dígitos
  const formatCorrelativo = (num: number) => {
    return String(num).padStart(6, '0');
  };

  return (
    <div className="flex flex-col gap-4">
      {feedbackMsg && (
        <Alert
          variant="success"
          title="Serie Actualizada"
          onClose={() => setFeedbackMsg(null)}
        >
          {feedbackMsg}
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-surface rounded-xl border border-border shadow-sm">
        <div>
          <h3 className="font-bold text-sm text-txt-primary flex items-center gap-2">
            <Icon name="receipt" className="w-4 h-4 text-brand" aria-hidden="true" />
            <span>Series Documentales y Control de Correlativos</span>
          </h3>
          <p className="text-xs text-txt-muted">
            Correlativos inmutables asignados de forma secuencial y atómica en cada emisión de comprobante.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          isLoading={isLoading}
        >
          Actualizar Series
        </Button>
      </div>

      {/* Tabla de Series */}
      <Table containerLabel="Series documentales y correlativos">
        <TableHeader>
          <TableRow>
            <TableHead>Tipo de Comprobante</TableHead>
            <TableHead>Serie</TableHead>
            <TableHead>Correlativo Actual</TableHead>
            <TableHead>Ejemplo Siguiente</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Estado</TableHead>
            {isAdmin && <TableHead className="text-right">Acción</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {series.length === 0 ? (
            <TableEmptyState
              colSpan={isAdmin ? 7 : 6}
              icon={
                <div className="w-12 h-12 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted mb-1">
                  <Icon name="receipt" className="w-6 h-6" aria-hidden="true" />
                </div>
              }
              title="No hay series registradas"
              description="Las series iniciales (NV01, B001, F001) se configuran automáticamente con las migraciones del sistema."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRefresh}
                  isLoading={isLoading}
                >
                  Recargar Series
                </Button>
              }
            />
          ) : (
            series.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <span className="font-bold text-txt-primary">
                    {RECEIPT_TYPE_LABELS[s.tipo_comprobante] || s.tipo_comprobante}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono font-black text-brand text-xs px-2 py-0.5 rounded bg-brand/10">
                    {s.serie}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono font-semibold text-txt-primary">
                    {formatCorrelativo(s.correlativo_actual)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-txt-muted">
                    {s.serie}-{formatCorrelativo(s.correlativo_actual + 1)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-txt-secondary">
                    {s.descripcion || 'Sin descripción'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={s.estado_activo ? 'success' : 'default'} size="sm">
                    {s.estado_activo ? 'Activa' : 'Inactiva'}
                  </Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(s)}
                      leftIcon={<Icon name="edit" className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      Editar
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Modal de Edición de Serie (Admin) */}
      <Modal
        isOpen={Boolean(editingSeries)}
        onClose={() => setEditingSeries(null)}
        title={`Editar Serie Documental: ${editingSeries?.serie || ''}`}
        description={`Tipo: ${
          editingSeries
            ? RECEIPT_TYPE_LABELS[editingSeries.tipo_comprobante]
            : ''
        } | Correlativo actual: ${editingSeries?.correlativo_actual || 0}`}
        size="md"
      >
        <form noValidate onSubmit={handleSaveEdit} onKeyDown={preventEnterKeySubmit} className="flex flex-col gap-4">
          <Input
            label="Descripción de la Serie"
            value={editDescripcion}
            onChange={(e) => setEditDescripcion(e.target.value)}
            placeholder="Ej. Serie Principal para Boletas de Venta"
            disabled={isActionLoading}
          />

          <CheckboxField
            id="serieActivaCheck"
            checked={editActivo}
            onCheckedChange={(checked) => setEditActivo(checked === true)}
            disabled={isActionLoading}
            label="Serie activa para emisión de nuevos comprobantes"
            className="min-h-[32px] py-0 items-center [&_span]:text-xs"
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingSeries(null)}
              disabled={isActionLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" isLoading={isActionLoading}>
              Guardar Cambios
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
