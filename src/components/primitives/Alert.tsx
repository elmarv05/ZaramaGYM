import * as React from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';
import { Icon, IconName } from './Icon';

export const alertVariants = cva(
  'w-full flex items-start gap-3 p-3.5 rounded-xl border border-l-4 text-sm transition-colors duration-150',
  {
    variants: {
      variant: {
        danger: '',
        warning: '',
        info: '',
        success: '',
      },
      floating: {
        true: 'pointer-events-auto bg-surface text-txt-primary shadow-xl zg-toast-enter border-border',
        false: '',
      },
    },
    compoundVariants: [
      {
        variant: 'danger',
        floating: true,
        className: 'border-l-status-danger',
      },
      {
        variant: 'danger',
        floating: false,
        className:
          'bg-status-danger-bg text-status-danger border-status-danger-border border-l-status-danger',
      },
      {
        variant: 'warning',
        floating: true,
        className: 'border-l-status-warning',
      },
      {
        variant: 'warning',
        floating: false,
        className:
          'bg-status-warning-bg text-status-warning border-status-warning-border border-l-status-warning',
      },
      {
        variant: 'info',
        floating: true,
        className: 'border-l-status-info',
      },
      {
        variant: 'info',
        floating: false,
        className:
          'bg-status-info-bg text-status-info border-status-info-border border-l-status-info',
      },
      {
        variant: 'success',
        floating: true,
        className: 'border-l-status-success',
      },
      {
        variant: 'success',
        floating: false,
        className:
          'bg-status-success-bg text-status-success border-status-success-border border-l-status-success',
      },
    ],
    defaultVariants: {
      variant: 'danger',
      floating: true,
    },
  }
);

export interface AlertProps extends VariantProps<typeof alertVariants> {
  variant?: 'danger' | 'warning' | 'info' | 'success';
  title?: string;
  children: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  onClose?: () => void;
  /** Si es true (por defecto), se renderiza como notificación Push / Pop-up del lado derecho */
  floating?: boolean;
  /** Duración en ms para auto-ocultar notificaciones flotantes de éxito (default: 4500ms en success) */
  autoHideDuration?: number;
  className?: string;
}

const VARIANT_META: Record<
  NonNullable<AlertProps['variant']>,
  {
    iconBadge: string;
    titleColor: string;
    dot: string;
    icon: IconName;
    defaultTitle: string;
    isUrgent: boolean;
  }
> = {
  danger: {
    iconBadge: 'bg-status-danger-bg text-status-danger border border-status-danger-border',
    titleColor: 'text-status-danger',
    dot: 'bg-status-danger shadow-[0_0_8px_var(--color-status-danger)]',
    icon: 'danger',
    defaultTitle: 'Atención Requerida',
    isUrgent: true,
  },
  warning: {
    iconBadge: 'bg-status-warning-bg text-status-warning border border-status-warning-border',
    titleColor: 'text-status-warning',
    dot: 'bg-status-warning shadow-[0_0_8px_var(--color-status-warning)]',
    icon: 'warning',
    defaultTitle: 'Aviso Preventivo',
    isUrgent: true,
  },
  info: {
    iconBadge: 'bg-status-info-bg text-status-info border border-status-info-border',
    titleColor: 'text-status-info',
    dot: 'bg-status-info shadow-[0_0_8px_var(--color-status-info)]',
    icon: 'info',
    defaultTitle: 'Notificación',
    isUrgent: false,
  },
  success: {
    iconBadge: 'bg-status-success-bg text-status-success border border-status-success-border',
    titleColor: 'text-status-success',
    dot: 'bg-status-success shadow-[0_0_8px_var(--color-status-success)]',
    icon: 'check',
    defaultTitle: 'Operación Exitosa',
    isUrgent: false,
  },
};

function getOrCreateToastStack(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  let stack = document.getElementById('zg-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'zg-toast-stack';
    stack.className =
      'fixed top-4 right-4 z-[100] flex flex-col items-end gap-2.5 w-full max-w-sm sm:max-w-[400px] pointer-events-none px-3 sm:px-0';
    document.body.appendChild(stack);
  }
  return stack;
}

export function Alert({
  variant = 'danger',
  title,
  children,
  actionText,
  onAction,
  onClose,
  floating = true,
  autoHideDuration,
  className,
}: AlertProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const meta = VARIANT_META[variant];

  useEffect(() => {
    setIsDismissed(false);
  }, [variant, title, children]);

  const effectiveAutoHide =
    autoHideDuration !== undefined
      ? autoHideDuration
      : floating && variant === 'success'
      ? 4500
      : 0;

  useEffect(() => {
    if (!floating || effectiveAutoHide <= 0 || isDismissed) return;
    const timer = window.setTimeout(() => {
      if (onClose) {
        onClose();
      } else {
        setIsDismissed(true);
      }
    }, effectiveAutoHide);
    return () => window.clearTimeout(timer);
  }, [floating, effectiveAutoHide, isDismissed, onClose]);

  if (isDismissed) return null;

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      setIsDismissed(true);
    }
  };

  const resolvedTitle = title || (floating ? meta.defaultTitle : undefined);

  const alertNode = (
    <div
      data-slot="alert"
      data-variant={variant}
      role={meta.isUrgent ? 'alert' : 'status'}
      aria-live={meta.isUrgent ? 'assertive' : 'polite'}
      className={cn(alertVariants({ variant, floating }), className)}
    >
      <div
        aria-hidden="true"
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          floating ? meta.iconBadge : ''
        )}
      >
        <Icon name={meta.icon} className="w-4 h-4" />
      </div>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {resolvedTitle && (
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)}
            />
            <h4
              data-slot="alert-title"
              className={cn(
                'text-xs font-bold tracking-wide',
                floating ? meta.titleColor : 'font-semibold'
              )}
            >
              {resolvedTitle}
            </h4>
          </div>
        )}
        <div
          data-slot="alert-description"
          className={cn(
            'text-xs leading-relaxed break-words',
            floating ? 'text-txt-primary' : ''
          )}
        >
          {children}
        </div>
        {actionText && onAction && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={onAction}
              className={cn(
                'text-xs font-bold underline hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-current rounded',
                floating ? meta.titleColor : ''
              )}
            >
              {actionText}
            </button>
          </div>
        )}
      </div>

      {(onClose || floating) && (
        <button
          data-slot="alert-close"
          type="button"
          onClick={handleClose}
          aria-label="Cerrar alerta"
          className="text-txt-muted hover:text-txt-primary p-1 rounded-md hover:bg-canvas-subtle transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  if (floating) {
    const stack = getOrCreateToastStack();
    if (stack) {
      return createPortal(alertNode, stack);
    }
  }

  return alertNode;
}
