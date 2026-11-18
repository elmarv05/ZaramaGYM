import React from 'react';
import { cn } from '../../utils/cn';
import { Button } from './Button';
import { Icon, IconName } from './Icon';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  variant?: 'danger' | 'warning' | 'success';
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  children?: React.ReactNode;
}

const VARIANT_CONFIG: Record<
  'danger' | 'warning' | 'success',
  {
    icon: IconName;
    badgeBg: string;
    iconColor: string;
    dotColor: string;
    borderAccent: string;
    confirmButtonClass: string;
  }
> = {
  danger: {
    icon: 'danger',
    badgeBg: 'bg-status-danger-bg border-status-danger/30',
    iconColor: 'text-status-danger',
    dotColor: 'bg-status-danger',
    borderAccent: 'border-l-4 border-l-status-danger',
    confirmButtonClass: '',
  },
  warning: {
    icon: 'warning',
    badgeBg: 'bg-status-warning-bg border-status-warning/30',
    iconColor: 'text-status-warning',
    dotColor: 'bg-status-warning',
    borderAccent: 'border-l-4 border-l-status-warning',
    confirmButtonClass:
      'bg-status-warning text-white hover:opacity-90 focus-visible:ring-status-warning border border-transparent shadow-sm',
  },
  success: {
    icon: 'check',
    badgeBg: 'bg-status-success-bg border-status-success/30',
    iconColor: 'text-status-success',
    dotColor: 'bg-status-success',
    borderAccent: 'border-l-4 border-l-status-success',
    confirmButtonClass: '',
  },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  variant = 'danger',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isLoading = false,
  children,
}) => {
  const cfg = VARIANT_CONFIG[variant];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      preventClose={isLoading}
      className={cfg.borderAccent}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            autoFocus={variant === 'danger'}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant === 'danger' ? 'danger' : variant === 'success' ? 'primary' : 'secondary'}
            onClick={onConfirm}
            isLoading={isLoading}
            className={cfg.confirmButtonClass}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-full border flex items-center justify-center shrink-0 relative',
            cfg.badgeBg,
            cfg.iconColor
          )}
        >
          <Icon name={cfg.icon} className="w-5 h-5" />
          <span
            aria-hidden="true"
            className={cn(
              'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface',
              cfg.dotColor
            )}
          />
        </div>
        <div className="flex-1 text-sm text-txt-secondary leading-relaxed">
          {children || (
            <p>
              Esta acción requiere confirmación explícita. Verifica los datos antes de continuar.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};
