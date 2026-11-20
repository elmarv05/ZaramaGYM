// ============================================================================
// COMPONENTE: MODAL DE INFORMACIÓN DE CONTACTO DEL DESARROLLADOR
// Muestra la información de contacto y QR real de WhatsApp de Max Rios
// Ubicación: src/components/DeveloperContactModal.tsx
// ============================================================================

import React from 'react';
import { Button } from './primitives/Button';
import { Icon } from './primitives/Icon';
import { Modal } from './primitives/Modal';

export interface DeveloperContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WHATSAPP_DISPLAY = '+51 967 231 461';

export const DeveloperContactModal: React.FC<DeveloperContactModalProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Información de Contacto"
      size="sm"
      footer={
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-3.5">
        {/* Cabecera estilo Tarjeta de Presentación */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-canvas-subtle p-4">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-brand"
          />

          <div className="flex items-center gap-3.5 pt-0.5">
            <div
              aria-hidden="true"
              className="w-12 h-12 rounded-xl bg-brand text-brand-text flex items-center justify-center font-bold text-base tracking-tight shadow-sm shrink-0"
            >
              MR
            </div>

            <div className="min-w-0 flex flex-col gap-0.5">
              <h4 className="text-base font-bold text-txt-primary leading-tight">
                Max Rios
              </h4>
              <p className="text-xs font-semibold text-brand">
                Consultor y Desarrollador Freelance
              </p>
              <span className="text-[11px] text-txt-secondary">
                Ingeniería de Sistemas
              </span>
            </div>
          </div>
        </div>

        {/* Bloque Solo WhatsApp */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xs">
          <div className="w-9 h-9 rounded-lg bg-status-success-bg text-status-success flex items-center justify-center shrink-0">
            <Icon name="smartphone" className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-txt-muted">
              Solo WhatsApp
            </div>
            <div className="text-sm font-mono font-bold text-txt-primary">
              {WHATSAPP_DISPLAY}
            </div>
          </div>
        </div>

        {/* Código QR Real de Contacto Directo */}
        <div className="rounded-xl border border-border bg-surface p-4 flex flex-col items-center text-center gap-2.5 shadow-xs">
          <div>
            <h5 className="text-xs font-bold text-txt-primary">
              Código QR de Contacto Directo
            </h5>
            <p className="text-[11px] text-txt-muted">
              Escanea para guardar contacto / WhatsApp
            </p>
          </div>

          {/* Quiet zone blanca garantizada para lectura óptica en Modo Claro y Oscuro */}
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
            <img
              src="/max-rios-whatsapp-qr.png"
              alt="Código QR de WhatsApp de Max Rios"
              className="w-44 h-44 object-contain block"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-canvas-subtle border border-border text-[11px] font-medium text-txt-secondary">
            <Icon name="check" className="w-3.5 h-3.5 text-status-success shrink-0" />
            <span>Enlace verificado de WhatsApp</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
