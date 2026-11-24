// ============================================================================
// MODAL: INGRESO MANUAL POR OLVIDO DE QR (SLICE 5)
// Identificación directa por DNI o selección de socio
// Ubicación: src/features/attendance/ManualCheckInModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { Alert, Button, Icon, Input, Modal } from '../../components/primitives';
import { ClientListItem } from '../../types/entity';
import { CheckInInput } from '../../types/attendance';
import { preventEnterKeySubmit } from '../../utils/formSafety';

export interface ManualCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CheckInInput) => Promise<void>;
  clients?: ClientListItem[];
  isLoading?: boolean;
}

export const ManualCheckInModal: React.FC<ManualCheckInModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  clients = [],
  isLoading = false,
}) => {
  const [documento, setDocumento] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [notas, setNotas] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const filteredClients = clients.filter((c) => {
    if (!searchTerm.trim()) return false;
    const term = searchTerm.toLowerCase();
    const fullName = `${c.nombres} ${c.apellidos}`.toLowerCase();
    return fullName.includes(term) || c.numero_documento.toLowerCase().includes(term);
  });

  const handleSelectClient = (client: ClientListItem) => {
    setSelectedClientId(client.id);
    setDocumento(client.numero_documento);
    const fullName = `${client.nombres} ${client.apellidos}`.trim();
    setSearchTerm(`${fullName} (${client.numero_documento})`);
    setLocalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const docLimpio = documento.trim();
    if (!docLimpio && !selectedClientId) {
      setLocalError('Ingrese el número de documento o seleccione un socio de la lista');
      return;
    }

    try {
      const input: CheckInInput = {
        clienteId: selectedClientId || undefined,
        numeroDocumento: docLimpio || undefined,
        modoIngreso: 'MANUAL_OLVIDO_QR',
        notas: notas.trim() || undefined,
      };
      await onSubmit(input);
      setDocumento('');
      setSelectedClientId(null);
      setSearchTerm('');
      setNotas('');
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error al procesar ingreso manual';
      setLocalError(msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      preventClose={isLoading}
      size="lg"
      title="Ingreso Manual por Olvido de QR"
      description="Valide el acceso mediante DNI o Carnet de Extranjería"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="manual-checkin-form"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            leftIcon={<Icon name="check" className="w-3.5 h-3.5" />}
          >
            Registrar Ingreso Manual
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {localError && (
          <Alert variant="danger" floating={false}>
            {localError}
          </Alert>
        )}

        <form
          id="manual-checkin-form"
          noValidate
          onSubmit={handleSubmit}
          onKeyDown={preventEnterKeySubmit}
          className="flex flex-col gap-4"
        >
          <Input
            id="input-doc-manual"
            label="Número de Documento (DNI / CE)"
            type="text"
            autoFocus
            required
            placeholder="Ej. 45892134"
            value={documento}
            onChange={(e) => {
              setDocumento(e.target.value);
              setLocalError(null);
            }}
          />

          {clients.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Input
                id="input-search-socio"
                label="O buscar socio por nombre o apellido:"
                type="text"
                placeholder="Escriba para filtrar clientes registrados..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedClientId(null);
                }}
              />
              {filteredClients.length > 0 && (
                <ul className="max-h-36 overflow-y-auto border border-border rounded-lg bg-surface divide-y divide-border">
                  {filteredClients.map((client) => (
                    <li key={client.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus:outline-none flex items-center justify-between transition-colors"
                      >
                        <span className="font-semibold text-txt-primary">
                          {client.nombres} {client.apellidos}
                        </span>
                        <span className="text-txt-muted text-[11px]">
                          {client.numero_documento}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Input
            id="input-notas-manual"
            label="Notas u Observación (Opcional)"
            type="text"
            placeholder="Ej. Dejó su credencial en el auto"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </form>
      </div>
    </Modal>
  );
};
