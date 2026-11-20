// ============================================================================
// COMPONENTES: MODALES DE INTEGRIDAD DE CAJA Y CRASH RECOVERY
// 1. CloseBlockedModal: Bloqueo preventivo al pulsar X de Windows con caja abierta
// 2. CrashRecoveryModal: Constatación y recuperación tras cierre forzado / apagado
// Ubicación: src/features/auth/CashIntegrityModals.tsx
// ============================================================================

import React from 'react';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Modal } from '../../components/primitives/Modal';
import { CloseBlockedPayload, CrashRecoveryNotice } from '../../types/auth';

export interface CloseBlockedModalProps {
  payload: CloseBlockedPayload | null;
  hasUnlockedSession: boolean;
  onDismiss: () => void;
  onGoToPos?: () => void;
}

export const CloseBlockedModal: React.FC<CloseBlockedModalProps> = ({
  payload,
  hasUnlockedSession,
  onDismiss,
  onGoToPos,
}) => {
  return (
    <Modal
      isOpen={Boolean(payload)}
      onClose={onDismiss}
      title="Cierre de Aplicación Bloqueado"
      description="Existe un turno de caja ABIERTO que requiere Arqueo y Cierre antes de salir de ZaramaGYM."
      size="md"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onDismiss}>
            {hasUnlockedSession ? 'Seguir Trabajando' : 'Entendido'}
          </Button>
          {hasUnlockedSession && onGoToPos && (
            <Button
              type="button"
              variant="danger"
              leftIcon={<Icon name="cash" className="w-4 h-4" />}
              onClick={onGoToPos}
            >
              Ir a Caja para Arqueo y Cierre
            </Button>
          )}
        </div>
      }
    >
      {payload && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-status-danger-bg border border-status-danger/30 text-status-danger">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-status-danger/15 shrink-0">
              <Icon name="shield" className="w-5 h-5" />
            </span>
            <div className="flex flex-col gap-1 text-xs leading-relaxed">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold uppercase tracking-wide">
                  Regla de Integridad de Caja Activa
                </span>
                <Badge variant="danger" size="sm">
                  Turno #{payload.shift_id} ABIERTO
                </Badge>
              </div>
              <p className="text-txt-primary font-medium">{payload.message}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-canvas-subtle border border-border text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-txt-muted">
                Responsable de Apertura
              </span>
              <span className="font-semibold text-txt-primary flex items-center gap-1.5">
                <Icon name="user" className="w-3.5 h-3.5 text-txt-muted" />
                <span>
                  {payload.usuario_apertura_nombre} (@{payload.usuario_apertura_username})
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-txt-muted">
                Fecha / Hora de Apertura
              </span>
              <span className="font-mono font-semibold text-txt-primary flex items-center gap-1.5">
                <Icon name="clock" className="w-3.5 h-3.5 text-txt-muted" />
                <span>{payload.fecha_apertura}</span>
              </span>
            </div>
          </div>

          {!hasUnlockedSession && (
            <p className="text-xs text-txt-secondary bg-canvas-subtle/60 border border-border rounded-lg p-3">
              Inicia sesión o desbloquea la estación para ingresar a <strong>Caja y POS</strong> y completar el arqueo antes de cerrar la ventana.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};

export interface CrashRecoveryModalProps {
  notice: CrashRecoveryNotice | null;
  canAccessAudit: boolean;
  onAcknowledgeAndContinue: () => void;
  onGoToPos: () => void;
  onGoToAudit?: () => void;
}

export const CrashRecoveryModal: React.FC<CrashRecoveryModalProps> = ({
  notice,
  canAccessAudit,
  onAcknowledgeAndContinue,
  onGoToPos,
  onGoToAudit,
}) => {
  return (
    <Modal
      isOpen={Boolean(notice && notice.detected && notice.had_open_cash_shift)}
      onClose={onAcknowledgeAndContinue}
      title="Cierre Forzado Detectado — Recuperación de Caja"
      description="La aplicación se cerró de forma inesperada mientras existía un turno de caja abierto."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onAcknowledgeAndContinue}>
            Retomar más tarde
          </Button>
          {canAccessAudit && onGoToAudit && (
            <Button
              type="button"
              variant="secondary"
              leftIcon={<Icon name="audit" className="w-4 h-4" />}
              onClick={onGoToAudit}
            >
              Ver en Auditoría
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            leftIcon={<Icon name="cash" className="w-4 h-4" />}
            onClick={onGoToPos}
          >
            Ir a Caja (Retomar o Arquear Turno)
          </Button>
        </div>
      }
    >
      {notice && (
        <div className="flex flex-col gap-4">
          {/* Banner Semáforo Ámbar/Rojo de Constatación */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-status-warning-bg border border-status-warning/35 text-status-warning">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-status-warning/15 shrink-0">
              <Icon name="warning" className="w-5 h-5" />
            </span>
            <div className="flex flex-col gap-1.5 text-xs leading-relaxed">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="danger" size="sm">
                  CIERRE_FORZADO_DETECTADO
                </Badge>
                {notice.shift_id !== null && (
                  <Badge variant="warning" size="sm">
                    Turno de Caja #{notice.shift_id} Pendiente
                  </Badge>
                )}
              </div>
              <p className="text-txt-primary font-medium">{notice.message}</p>
            </div>
          </div>

          {/* Ficha Forense de Tiempos y Responsable */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-canvas-subtle border border-border text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-txt-muted">
                Turno Abierto Por
              </span>
              <span className="font-semibold text-txt-primary">
                {notice.shift_opened_by_name || 'Operador'}{' '}
                {notice.shift_opened_by_username ? `(@${notice.shift_opened_by_username})` : ''}
              </span>
              {notice.shift_opened_at && (
                <span className="font-mono text-[11px] text-txt-muted">
                  Apertura: {notice.shift_opened_at}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-txt-muted">
                Último Operador Activo
              </span>
              <span className="font-semibold text-txt-primary">
                {notice.last_active_username ? `@${notice.last_active_username}` : 'Sin sesión en memoria'}
              </span>
            </div>

            <div className="flex flex-col gap-0.5 pt-2 border-t border-border/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-txt-muted">
                Última Actividad Registrada (Heartbeat)
              </span>
              <span className="font-mono font-semibold text-txt-primary flex items-center gap-1.5">
                <Icon name="clock" className="w-3.5 h-3.5 text-status-warning" />
                <span>{notice.last_heartbeat_at || 'No disponible'}</span>
              </span>
            </div>

            <div className="flex flex-col gap-0.5 pt-2 border-t border-border/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-txt-muted">
                Hora de Reinicio / Detección
              </span>
              <span className="font-mono font-semibold text-txt-primary flex items-center gap-1.5">
                <Icon name="refresh" className="w-3.5 h-3.5 text-brand" />
                <span>{notice.restarted_at}</span>
              </span>
            </div>
          </div>

          {/* Garantía Transaccional SQLite */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-status-success-bg/60 border border-status-success/25 text-xs text-txt-primary">
            <Icon name="database" className="w-4 h-4 text-status-success shrink-0 mt-0.5" />
            <span>
              <strong>Integridad SQLite verificada:</strong> Cada venta, apertura y cobro previo quedó guardado de forma atómica. El incidente ya quedó constatado en la <strong>Bitácora de Auditoría</strong>.
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
};
