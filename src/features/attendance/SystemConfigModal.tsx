// ============================================================================
// MODAL: CONFIGURACIÓN DE PARÁMETROS OPERATIVOS DEL SEMÁFORO (SLICE 5)
// Exclusivo para rol ADMINISTRADOR
// Ubicación: src/features/attendance/SystemConfigModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert, Button, Input, Modal } from '../../components/primitives';
import { validateSystemConfig } from '../../domain/attendance';
import { SystemConfigDto, UpdateSystemConfigInput } from '../../types/attendance';
import {
  formatDecimalOnBlur,
  preventEnterKeySubmit,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  selectIfZeroDefault,
} from '../../utils/formSafety';

export interface SystemConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfigDto | null;
  onSave: (input: UpdateSystemConfigInput) => Promise<void>;
  isLoading?: boolean;
}

export const SystemConfigModal: React.FC<SystemConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  isLoading = false,
}) => {
  const [diasAmarilloStr, setDiasAmarilloStr] = useState<string>(
    String(config?.diasAlertaAmarillo ?? 5)
  );
  const [minutosReboteStr, setMinutosReboteStr] = useState<string>(
    String(config?.minutosAntireboteQr ?? 3)
  );
  const [precioPase, setPrecioPase] = useState<string>(
    config?.precioPaseDiarioCreditoDefault ?? '10.00'
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!diasAmarilloStr.trim() || !minutosReboteStr.trim() || !precioPase.trim()) {
      setError('Todos los parámetros marcados con * son obligatorios.');
      return;
    }

    const input: UpdateSystemConfigInput = {
      diasAlertaAmarillo: parseInt(diasAmarilloStr, 10),
      minutosAntireboteQr: parseInt(minutosReboteStr, 10),
      precioPaseDiarioCreditoDefault: precioPase,
    };

    const validation = validateSystemConfig(input);
    if (!validation.isValid) {
      setError(validation.error || 'Configuración inválida');
      return;
    }

    try {
      await onSave(input);
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al actualizar configuración';
      setError(msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      preventClose={isLoading}
      size="md"
      title="Configuración del Semáforo"
      description="Parámetros operativos globales (Administrador)"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="system-config-form"
            variant="primary"
            size="sm"
            isLoading={isLoading}
          >
            Guardar Parámetros
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
          id="system-config-form"
          noValidate
          onSubmit={handleSubmit}
          onKeyDown={preventEnterKeySubmit}
          className="flex flex-col gap-4"
        >
          <Input
            id="input-dias-amarillo"
            label="Umbral Alerta Semáforo Amarillo (Días restantes)"
            type="text"
            inputMode="numeric"
            required
            value={diasAmarilloStr}
            onFocus={selectIfZeroDefault}
            onChange={(e) => setDiasAmarilloStr(sanitizeIntegerInput(e.target.value))}
            hint="Si a la membresía le quedan estos días o menos, se activará el semáforo amarillo."
          />

          <Input
            id="input-minutos-rebote"
            label="Ventana de Filtro Anti-Rebote (Minutos)"
            type="text"
            inputMode="numeric"
            required
            value={minutosReboteStr}
            onFocus={selectIfZeroDefault}
            onChange={(e) => setMinutosReboteStr(sanitizeIntegerInput(e.target.value))}
            hint="Tiempo en el que lecturas consecutivas del mismo socio se ignoran para no duplicar asistencias."
          />

          <Input
            id="input-precio-pase-def"
            label="Precio Pase Diario a Crédito por Defecto (S/)"
            type="text"
            inputMode="decimal"
            required
            value={precioPase}
            onFocus={selectIfZeroDefault}
            onChange={(e) => setPrecioPase(sanitizeDecimalInput(e.target.value))}
            onBlur={(e) => {
              setPrecioPase(formatDecimalOnBlur(e.target.value, { min: 0, fallback: '' }));
            }}
            leftIcon={<span className="text-xs font-bold">S/</span>}
            hint="Monto inicial cargado a la cuenta por cobrar al autorizar el pase desde semáforo rojo."
          />
        </form>
      </div>
    </Modal>
  );
};
