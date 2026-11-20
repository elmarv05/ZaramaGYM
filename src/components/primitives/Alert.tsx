import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import { Icon, IconName } from './Icon';

export interface AlertProps {
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

const VARIANT_STYLES: Record<
  NonNullable<AlertProps['variant']>,
  {
    inlineContainer: string;
    floatingBorder: string;
    iconBadge: string;
    titleColor: string;
    dot: string;
    icon: IconName;
    defaultTitle: string;
  }
> = {
  danger: {
    inlineContainer:
      'bg-status-danger-bg text-status-danger border-status-danger/30 border-l-status-danger',
    floatingBorder: 'border-border border-l-status-danger',
    iconBadge: 'bg-status-danger-bg text-status-danger border border-status-danger/25',
    titleColor: 'text-status-danger',
    dot: 'bg-status-danger shadow-[0_0_8px_var(--color-status-danger)]',
    icon: 'danger',
    defaultTitle: 'Atención Requerida',
  },
  warning: {
    inlineContainer:
      'bg-status-warning-bg text-status-warning border-status-warning/30 border-l-status-warning',
    floatingBorder: 'border-border border-l-status-warning',
    iconBadge: 'bg-status-warning-bg text-status-warning border border-status-warning/25',
    titleColor: 'text-status-warning',
    dot: 'bg-status-warning shadow-[0_0_8px_var(--color-status-warning)]',
    icon: 'warning',
    defaultTitle: 'Aviso Preventivo',
  },
  info: {
    inlineContainer:
      'bg-status-info-bg text-status-info border-status-info/30 border-l-status-info',
    floatingBorder: 'border-border border-l-status-info',
    iconBadge: 'bg-status-info-bg text-status-info border border-status-info/25',
    titleColor: 'text-status-info',
    dot: 'bg-status-info shadow-[0_0_8px_var(--color-status-info)]',
    icon: 'info',
    defaultTitle: 'Notificación',
  },
  success: {
    inlineContainer:
      'bg-status-success-bg text-status-success border-status-success/30 border-l-status-success',
    floatingBorder: 'border-border border-l-status-success',
    iconBadge: 'bg-status-success-bg text-status-success border border-status-success/25',
    titleColor: 'text-status-success',
    dot: 'bg-status-success shadow-[0_0_8px_var(--color-status-success)]',
    icon: 'check',
    defaultTitle: 'Operación Exitosa',
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

export const Alert: React.FC<AlertProps> = ({
  variant = 'danger',
  title,
  children,
  actionText,
  onAction,
  onClose,
  floating = true,
  autoHideDuration,
  className,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const styles = VARIANT_STYLES[variant];

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

  const resolvedTitle = title || (floating ? styles.defaultTitle : undefined);

  const alertNode = (
    <div
      role="alert"
      className={cn(
        'w-full flex items-start gap-3 p-3.5 rounded-xl border border-l-4 text-sm transition-all',
        floating
          ? cn(
              'pointer-events-auto bg-surface text-txt-primary shadow-xl zg-toast-enter',
              styles.floatingBorder
            )
          : styles.inlineContainer,
        className
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          floating ? styles.iconBadge : ''
        )}
      >
        <Icon name={styles.icon} className="w-4 h-4" />
      </div>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {resolvedTitle && (
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn('w-2 h-2 rounded-full shrink-0', styles.dot)}
            />
            <h4
              className={cn(
                'text-xs font-bold tracking-wide',
                floating ? styles.titleColor : 'font-semibold'
              )}
            >
              {resolvedTitle}
            </h4>
          </div>
        )}
        <div
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
                floating ? styles.titleColor : ''
              )}
            >
              {actionText}
            </button>
          </div>
        )}
      </div>

      {(onClose || floating) && (
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar alerta"
          className="text-txt-muted hover:text-txt-primary p-1 rounded-md hover:bg-canvas-subtle transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
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
};
