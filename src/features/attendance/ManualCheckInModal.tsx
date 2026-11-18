// ============================================================================
// MODAL: INGRESO MANUAL POR OLVIDO DE QR (SLICE 5)
// Identificación directa por DNI o selección de socio
// Ubicación: src/features/attendance/ManualCheckInModal.tsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/primitives/Icon';
import { ClientListItem } from '../../types/entity';
import { CheckInInput } from '../../types/attendance';

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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const filteredClients = clients.filter((c) => {
    if (!searchTerm.trim()) return false;
    const term = searchTerm.toLowerCase();
    const fullName = `${c.nombres} ${c.apellidos}`.toLowerCase();
    return (
      fullName.includes(term) ||
      c.numero_documento.toLowerCase().includes(term)
    );
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
      // Reset y cerrar al tener éxito
      setDocumento('');
      setSelectedClientId(null);
      setSearchTerm('');
      setNotas('');
      onClose();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Error al procesar ingreso manual';
      setLocalError(msg);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-checkin-modal-title"
      className="fixed inset-0 z-50 flex justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain zg-modal-backdrop"
    >
      <div className="bg-surface border border-border rounded-2xl max-w-lg w-full my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain p-6 shadow-xl flex flex-col gap-5 zg-modal-panel">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-canvas-subtle text-accent-indigo border border-border flex items-center justify-center">
              <Icon name="user" className="w-5 h-5" />
            </div>
            <div>
              <h3 id="manual-checkin-modal-title" className="text-base font-bold text-txt-primary">
                Ingreso Manual por Olvido de QR
              </h3>
              <p className="text-xs text-txt-muted">
                Valide el acceso mediante DNI o Carnet de Extranjería
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-txt-muted hover:text-txt-primary p-1.5 rounded-lg hover:bg-canvas transition-colors"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        {localError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200"
          >
            {localError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Campo Directo de Documento */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-doc-manual" className="text-xs font-bold text-txt-secondary">
              Número de Documento (DNI / CE) *
            </label>
            <input
              id="input-doc-manual"
              type="text"
              autoFocus
              placeholder="Ej. 45892134"
              value={documento}
              onChange={(e) => {
                setDocumento(e.target.value);
                setLocalError(null);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-canvas text-sm font-semibold text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {/* Buscador de Socio en Padrón */}
          {clients.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="input-search-socio" className="text-xs font-bold text-txt-secondary">
                O buscar socio por nombre o apellido:
              </label>
              <input
                id="input-search-socio"
                type="text"
                placeholder="Escriba para filtrar clientes registrados..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedClientId(null);
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-canvas text-xs text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
              />
              {filteredClients.length > 0 && (
                <ul className="max-h-36 overflow-y-auto border border-border rounded-lg bg-surface divide-y divide-border">
                  {filteredClients.map((client) => (
                    <li
                      key={client.id}
                      onClick={() => handleSelectClient(client)}
                      className="px-3 py-2 text-xs hover:bg-canvas cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <span className="font-semibold text-txt-primary">
                        {client.nombres} {client.apellidos}
                      </span>
                      <span className="text-txt-muted text-[11px]">{client.numero_documento}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Notas u observaciones */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="input-notas-manual" className="text-xs font-bold text-txt-secondary">
              Notas u Observación (Opcional)
            </label>
            <input
              id="input-notas-manual"
              type="text"
              placeholder="Ej. Dejó su credencial en el auto"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-canvas text-xs text-txt-primary focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-txt-secondary hover:bg-canvas transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-brand-text font-bold text-xs shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
                  <span>Evaluando en Puerta...</span>
                </>
              ) : (
                <>
                  <Icon name="check" className="w-3.5 h-3.5" />
                  <span>Registrar Ingreso Manual</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
