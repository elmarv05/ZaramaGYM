// ============================================================================
// COMPONENTE: HISTORIAL DE PESOS Y REGISTRO RÁPIDO EN VIVO (SLICE 2)
// Ubicación: src/features/entities/ClientWeightHistoryModal.tsx
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  ClientListItem,
  ClientDetail,
  ClientWeightRecord,
  RecordClientWeightInput,
} from '../../types/entity';
import { formatKg, formatWeightVariation, validateRecordWeightInput } from '../../domain/entity';
import { Modal } from '../../components/primitives/Modal';
import { Button } from '../../components/primitives/Button';
import { Input } from '../../components/primitives/Input';
import { Badge } from '../../components/primitives/Badge';
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

export interface ClientWeightHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ClientListItem | ClientDetail | null;
  onRecordWeight: (input: RecordClientWeightInput) => Promise<ClientWeightRecord | null>;
  fetchWeightHistory: (clientId: number) => Promise<ClientWeightRecord[]>;
}

export const ClientWeightHistoryModal: React.FC<ClientWeightHistoryModalProps> = ({
  isOpen,
  onClose,
  client,
  onRecordWeight,
  fetchWeightHistory,
}) => {
  const [history, setHistory] = useState<ClientWeightRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulario rápido
  const [nuevoPeso, setNuevoPeso] = useState<string>('');
  const [nota, setNota] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!client) return;
    try {
      setIsLoading(true);
      setError(null);
      const records = await fetchWeightHistory(client.id);
      setHistory(Array.isArray(records) ? records : []);
    } catch (err) {
      setError('No se pudo cargar el historial de peso del cliente.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [client, fetchWeightHistory]);

  useEffect(() => {
    if (isOpen && client) {
      setNuevoPeso('');
      setNota('');
      setFormError(null);
      loadHistory();
    }
  }, [isOpen, client, loadHistory]);

  if (!client) return null;

  const currentWeightDisplay =
    history.length > 0
      ? formatKg(history[0].peso_kg)
      : client.peso_actual_kg
      ? formatKg(client.peso_actual_kg)
      : '-- kg';

  // Variación acumulada total (último peso - primer peso)
  let totalDeltaText = '0.00 kg';
  if (history.length > 1) {
    const latest = Number(history[0].peso_kg);
    const initial = Number(history[history.length - 1].peso_kg);
    if (!isNaN(latest) && !isNaN(initial)) {
      const delta = latest - initial;
      totalDeltaText = `${delta > 0 ? '+' : ''}${delta.toFixed(2)} kg total`;
    }
  }

  const handleSubmitNewWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validation = validateRecordWeightInput({
      cliente_id: client.id,
      peso_kg: nuevoPeso.trim(),
      nota: nota.trim() || null,
    });

    if (!validation.isValid) {
      setFormError(validation.errors.peso_kg || 'Por favor ingresa un peso válido.');
      return;
    }

    try {
      setIsSubmitting(true);
      const record = await onRecordWeight({
        cliente_id: client.id,
        peso_kg: nuevoPeso.trim(),
        nota: nota.trim() || null,
      });

      if (record) {
        setHistory((prev) => [record, ...prev]);
        setNuevoPeso('');
        setNota('');
      }
    } catch (err) {
      setFormError('Error al registrar el peso.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Récord de Peso: ${client.nombres} ${client.apellidos}`}
      description="Control cronológico de evolución física con cálculo automático de variación."
      size="lg"
    >
      <div className="flex flex-col gap-5">
        {/* Banner de Estado Físico Actual */}
        <div className="p-4 bg-canvas-subtle rounded-xl border border-border flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-txt-muted uppercase tracking-wider font-semibold">
              Peso Actual Registrado
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-txt-primary">
                {currentWeightDisplay}
              </span>
              {history.length > 1 && (
                <span className="text-xs font-semibold text-txt-secondary">
                  ({totalDeltaText})
                </span>
              )}
            </div>
          </div>
          <Badge variant="info" size="md">
            {history.length} {history.length === 1 ? 'control' : 'controles'}
          </Badge>
        </div>

        {/* Formulario Rápido de Registro en Vivo */}
        <form
          onSubmit={handleSubmitNewWeight}
          className="p-4 bg-surface rounded-xl border border-border shadow-xs flex flex-col gap-3"
        >
          <span className="text-sm font-bold text-txt-primary">
            Registrar Nuevo Control de Peso
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Peso (kg)"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="Ej: 75.50"
              value={nuevoPeso}
              onChange={(e) => {
                setNuevoPeso(e.target.value);
                if (formError) setFormError(null);
              }}
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0) {
                  setNuevoPeso(v.toFixed(2));
                }
              }}
              error={formError || undefined}
              disabled={isSubmitting}
              required
            />

            <div className="sm:col-span-2">
              <Input
                label="Nota o Motivo (Opcional)"
                placeholder="Ej: Control mensual, inicio de rutina..."
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              disabled={isSubmitting || !nuevoPeso.trim()}
            >
              Guardar Peso
            </Button>
          </div>
        </form>

        {error && (
          <Alert variant="danger" title="Error" actionText="Reintentar" onAction={loadHistory}>
            {error}
          </Alert>
        )}

        {/* Tabla Cronológica de Historial */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-txt-muted uppercase tracking-wider">
            Historial de Pesajes
          </span>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Peso</TableHead>
                <TableHead>Variación (Δ)</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead className="text-right">Registrado por</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <TableLoadingSkeleton colSpan={5} rows={3} />
              ) : history.length === 0 ? (
                <TableEmptyState
                  colSpan={5}
                  title="Sin récords de peso previos"
                  description="Utiliza el formulario de arriba para registrar el primer control de peso del cliente."
                />
              ) : (
                history.map((record) => {
                  const varInfo = formatWeightVariation(record.variacion_kg);
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-xs text-txt-secondary">
                        {record.fecha_registro}
                      </TableCell>
                      <TableCell className="font-bold text-txt-primary">
                        {formatKg(record.peso_kg)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={varInfo.variant} size="sm">
                          {varInfo.text}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-txt-muted">
                        {record.nota || '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono text-txt-secondary">
                        @{record.registrado_por_username || 'sistema'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
};
