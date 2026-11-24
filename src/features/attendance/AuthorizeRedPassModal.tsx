// ============================================================================
// MODAL: AUTORIZACIÓN DE PASE DIARIO A CRÉDITO DESDE SEMÁFORO ROJO (SLICE 5)
// Registro en creditos_clientes + Pase activo hasta las 23:59:59
// Ubicación: src/features/attendance/AuthorizeRedPassModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert, Button, Icon, Input, Modal } from '../../components/primitives';
import { AuthorizeRedPassInput, CheckInEvaluationDto } from '../../types/attendance';
import {
  formatDecimalOnBlur,
  preventEnterKeySubmit,
  roundMonetary,
  sanitizeDecimalInput,
  selectIfZeroDefault,
} from '../../utils/formSafety';

export interface AuthorizeRedPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluation: CheckInEvaluationDto | null;
  defaultMonto?: string | number;
  onConfirm: (input: AuthorizeRedPassInput) => Promise<void>;
  isLoading?: boolean;
}

export const AuthorizeRedPassModal: React.FC<AuthorizeRedPassModalProps> = ({
  isOpen,
  onClose,
  evaluation,
  defaultMonto = '10.00',
  onConfirm,
  isLoading = false,
}) => {
  const [monto, setMonto] = useState<string>(String(defaultMonto));
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!evaluation) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedMonto = parseFloat(monto);
    if (isNaN(parsedMonto) || parsedMonto <= 0) {
      setError('El monto del pase diario debe ser un valor numérico mayor a S/ 0.00');
      return;
    }

    try {
      await onConfirm({
        clienteId: evaluation.clienteId,
        montoPase: roundMonetary(parsedMonto).toFixed(2),
        notas: notas.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al autorizar pase diario a crédito';
      setError(msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      preventClose={isLoading}
      size="md"
      title="Autorizar Pase Diario a Crédito"
      description="Destrabe de acceso excepcional en Semáforo Rojo"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="authorize-red-pass-form"
            variant="danger"
            size="sm"
            isLoading={isLoading}
            leftIcon={<Icon name="check" className="w-3.5 h-3.5" />}
          >
            Confirmar y Desbloquear Puerta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Alert variant="danger" floating={false}>
            {error}
          </Alert>
        )}

        <div className="bg-canvas-subtle border border-border rounded-xl p-3.5 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
            Socio Beneficiario
          </span>
          <span className="text-sm font-black text-txt-primary">{evaluation.nombreCompleto}</span>
          <span className="text-xs text-txt-secondary">
            {evaluation.tipoDocumento}: {evaluation.numeroDocumento}
          </span>
        </div>

        <form
          id="authorize-red-pass-form"
          noValidate
          onSubmit={handleSubmit}
          onKeyDown={preventEnterKeySubmit}
          className="flex flex-col gap-4"
        >
          <Input
            id="input-monto-red-pass"
            label="Monto del Pase Diario a Crédito (S/)"
            type="text"
            inputMode="decimal"
            value={monto}
            onFocus={selectIfZeroDefault}
            onChange={(e) => setMonto(sanitizeDecimalInput(e.target.value))}
            onBlur={(e) => {
              setMonto(formatDecimalOnBlur(e.target.value, { min: 0.01, fallback: '' }));
            }}
            leftIcon={<span className="text-xs font-bold">S/</span>}
            hint="Se creará automáticamente una cuenta por cobrar en el módulo de créditos del cliente."
            required
          />

          <Input
            id="input-notas-red-pass"
            label="Notas u Observación del Operador (Opcional)"
            type="text"
            placeholder="Ej. Socio regular olvidó billetera"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />

          <div className="p-3 bg-status-warning-bg border border-status-warning-border rounded-xl text-[11px] text-status-warning leading-relaxed flex items-start gap-2">
            <Icon name="info" className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              El pase otorgado tendrá vigencia hasta las <strong>23:59:59</strong> del día de hoy y
              se registrará en la bitácora de auditoría inmutable.
            </span>
          </div>
        </form>
      </div>
    </Modal>
  );
};
