// ============================================================================
// MODAL: RECUPERACIÓN MANUAL DE DÍAS (PRÓRROGA DE MEMBRESÍA) (SLICE 5)
// Extensión auditada con cálculo en vivo de nueva fecha hasta 23:59:59
// Ubicación: src/features/attendance/ExtendMembershipModal.tsx
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Icon,
  Input,
  Modal,
  Select,
  Textarea,
} from '../../components/primitives';
import {
  calculateExtendedExpirationDate,
  validateExtensionInput,
} from '../../domain/attendance';
import { ExtendMembershipInput } from '../../types/attendance';
import { ClientMembershipDto } from '../../types/pos';
import {
  preventEnterKeySubmit,
  sanitizeIntegerInput,
  selectIfZeroDefault,
} from '../../utils/formSafety';

export interface ExtendMembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberships: ClientMembershipDto[];
  preselectedMembershipId?: number | null;
  onSubmit: (input: ExtendMembershipInput, permiteRecuperacionDias?: boolean) => Promise<void>;
  isLoading?: boolean;
}

export const ExtendMembershipModal: React.FC<ExtendMembershipModalProps> = ({
  isOpen,
  onClose,
  memberships,
  preselectedMembershipId,
  onSubmit,
  isLoading = false,
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(
    preselectedMembershipId || (memberships.length > 0 ? memberships[0].id : null)
  );
  const [diasOtorgadosStr, setDiasOtorgadosStr] = useState<string>('3');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsedDias = parseInt(diasOtorgadosStr, 10);
  const diasOtorgados = isNaN(parsedDias) ? 0 : parsedDias;

  React.useEffect(() => {
    if (selectedId === null && memberships.length > 0) {
      setSelectedId(memberships[0].id);
    }
  }, [memberships, selectedId]);

  const selectedMembership = useMemo(() => {
    return memberships.find((m) => m.id === selectedId) || null;
  }, [memberships, selectedId]);

  const projectedExpirationDate = useMemo(() => {
    if (!selectedMembership || !diasOtorgados || diasOtorgados < 1) return null;
    return calculateExtendedExpirationDate(
      selectedMembership.fecha_vencimiento,
      diasOtorgados
    );
  }, [selectedMembership, diasOtorgados]);

  const isPaseDiario =
    selectedMembership?.permite_recuperacion_dias !== undefined
      ? !selectedMembership.permite_recuperacion_dias
      : selectedMembership?.plan_nombre?.toUpperCase().includes('PASE') ||
        selectedMembership?.plan_nombre?.toUpperCase().includes('DIARIO');

  const membershipOptions = useMemo(() => {
    if (memberships.length === 0) {
      return [{ value: '', label: 'No hay membresías activas disponibles' }];
    }
    return memberships.map((m) => ({
      value: String(m.id),
      label: `${m.cliente_nombre_completo} — ${m.plan_nombre} (Vence: ${
        m.fecha_vencimiento.split(' ')[0]
      })`,
    }));
  }, [memberships]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedMembership) {
      setError('Seleccione una membresía activa para extender');
      return;
    }

    const validation = validateExtensionInput({
      diasOtorgados,
      motivoJustificacion: motivo,
      permiteRecuperacionDias: !isPaseDiario,
    });

    if (!validation.isValid) {
      setError(validation.error || 'Datos inválidos para la prórroga');
      return;
    }

    try {
      await onSubmit(
        {
          membresiaId: selectedMembership.id,
          diasOtorgados,
          motivoJustificacion: motivo.trim(),
        },
        !isPaseDiario
      );
      setMotivo('');
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al otorgar prórroga';
      setError(msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      preventClose={isLoading}
      size="lg"
      title="Recuperación Manual de Días"
      description="Prórroga auditada de vencimiento de membresía activa"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="extend-membership-form"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            disabled={isPaseDiario || memberships.length === 0}
            leftIcon={<Icon name="check" className="w-3.5 h-3.5" />}
          >
            Confirmar Extensión de Días
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

        <form
          id="extend-membership-form"
          noValidate
          onSubmit={handleSubmit}
          onKeyDown={preventEnterKeySubmit}
          className="flex flex-col gap-4"
        >
          <Select
            id="select-membresia-ext"
            label="Membresía del Socio"
            required
            value={selectedId !== null ? String(selectedId) : ''}
            onChange={(e) => {
              setSelectedId(Number(e.target.value));
              setError(null);
            }}
            options={membershipOptions}
          />

          {isPaseDiario && (
            <div className="p-3 rounded-xl bg-status-warning-bg border border-status-warning-border text-xs text-status-warning flex items-start gap-2">
              <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <strong>Atención:</strong> Los pases diarios tienen prohibida la recuperación de
                días por política comercial del gimnasio.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              id="input-dias-ext"
              label="Días Calendario a Otorgar (+N)"
              type="text"
              inputMode="numeric"
              required
              value={diasOtorgadosStr}
              onFocus={selectIfZeroDefault}
              onChange={(e) => {
                setDiasOtorgadosStr(sanitizeIntegerInput(e.target.value));
                setError(null);
              }}
              onBlur={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!e.target.value.trim()) return;
                if (!isNaN(n)) {
                  setDiasOtorgadosStr(String(Math.min(90, Math.max(1, n))));
                }
              }}
            />

            <div className="bg-canvas-subtle border border-border rounded-xl p-3 flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
                Nueva Fecha Proyectada
              </span>
              <span className="text-xs font-black text-status-success">
                {projectedExpirationDate || 'Calculando...'}
              </span>
            </div>
          </div>

          <Textarea
            id="input-motivo-ext"
            label="Motivo o Justificación Obligatoria (Mínimo 5 caracteres)"
            rows={3}
            required
            placeholder="Ej. Descanso médico presentado por el socio o suspensión por viaje justificado..."
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setError(null);
            }}
            hint={`Caracteres: ${motivo.trim().length} / 5 requeridos`}
          />
        </form>
      </div>
    </Modal>
  );
};
