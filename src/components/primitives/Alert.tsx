import React from 'react';
import { cn } from '../../utils/cn';
import { Icon, IconName } from './Icon';

export interface AlertProps {
  variant?: 'danger' | 'warning' | 'info' | 'success';
  title?: string;
  children: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  onClose?: () => void;
  className?: string;
}

const VARIANT_STYLES: Record<
  NonNullable<AlertProps['variant']>,
  {
    container: string;
    dot: string;
    icon: IconName;
  }
> = {
  danger: {
    container:
      'bg-status-danger-bg text-status-danger border-status-danger/30 border-l-status-danger',
    dot: 'bg-status-danger shadow-[0_0_8px_var(--color-status-danger)]',
    icon: 'danger',
  },
  warning: {
    container:
      'bg-status-warning-bg text-status-warning border-status-warning/30 border-l-status-warning',
    dot: 'bg-status-warning shadow-[0_0_8px_var(--color-status-warning)]',
    icon: 'warning',
  },
  info: {
    container:
      'bg-status-info-bg text-status-info border-status-info/30 border-l-status-info',
    dot: 'bg-status-info shadow-[0_0_8px_var(--color-status-info)]',
    icon: 'info',
  },
  success: {
    container:
      'bg-status-success-bg text-status-success border-status-success/30 border-l-status-success',
    dot: 'bg-status-success shadow-[0_0_8px_var(--color-status-success)]',
    icon: 'check',
  },
};

export const Alert: React.FC<AlertProps> = ({
  variant = 'danger',
  title,
  children,
  actionText,
  onAction,
  onClose,
  className,
}) => {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      role="alert"
      className={cn(
        'w-full flex items-start gap-3 p-3.5 rounded-md border border-l-4 text-sm',
        styles.container,
        className
      )}
    >
      <div className="relative flex items-center justify-center shrink-0 mt-0.5">
        <Icon name={styles.icon} className="w-5 h-5" />
        <span
          aria-hidden="true"
          className={cn('absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full', styles.dot)}
        />
      </div>

      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        {title && (
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn('w-2 h-2 rounded-full shrink-0', styles.dot)}
            />
            <h4 className="font-semibold">{title}</h4>
          </div>
        )}
        <div className="text-xs leading-relaxed">{children}</div>
        {actionText && onAction && (
          <div className="mt-2">
            <button
              type="button"
              onClick={onAction}
              className="text-xs font-bold underline hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
            >
              {actionText}
            </button>
          </div>
        )}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar alerta"
          className="text-current opacity-70 hover:opacity-100 p-1 rounded transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};
