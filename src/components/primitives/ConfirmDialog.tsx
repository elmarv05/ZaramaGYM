import * as React from 'react';
import { useRef } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';
import { Button } from './Button';
import { Icon, IconName } from './Icon';
import { useModalScrollLock } from './modalScrollLock';

export function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>
) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

export function AlertDialogTrigger(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>
) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

export function AlertDialogPortal(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Portal>
) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

export function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-[3px] overflow-hidden overscroll-contain zg-modal-backdrop',
        className
      )}
      {...props}
    />
  );
}

export function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          'fixed inset-x-3 sm:inset-x-6 inset-y-3 sm:inset-y-6 z-50 mx-auto my-auto h-fit w-[calc(100%-1.5rem)] sm:w-[calc(100%-3rem)] max-w-sm max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]',
          'bg-elevated border border-elevated-border rounded-xl shadow-lg dark:ring-1 dark:ring-white/[0.03] flex flex-col overflow-hidden overscroll-contain zg-modal-panel focus:outline-none',
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        'shrink-0 flex flex-col gap-0.5 px-4 sm:px-6 py-4 border-b border-border',
        className
      )}
      {...props}
    />
  );
}

export function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        'shrink-0 flex flex-wrap items-center justify-end gap-3 px-4 sm:px-6 py-3.5 bg-canvas-subtle border-t border-border',
        className
      )}
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-base font-bold text-txt-primary', className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-xs text-txt-muted', className)}
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={className}
      {...props}
    />
  );
}

export function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={className}
      {...props}
    />
  );
}

export const confirmDialogVariants = cva('border-l-4', {
  variants: {
    variant: {
      danger: 'border-l-status-danger',
      warning: 'border-l-status-warning',
      success: 'border-l-status-success',
    },
  },
  defaultVariants: {
    variant: 'danger',
  },
});

export interface ConfirmDialogProps extends VariantProps<typeof confirmDialogVariants> {
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
    confirmButtonClass: string;
  }
> = {
  danger: {
    icon: 'danger',
    badgeBg: 'bg-status-danger-bg border-status-danger-border',
    iconColor: 'text-status-danger',
    dotColor: 'bg-status-danger',
    confirmButtonClass: '',
  },
  warning: {
    icon: 'warning',
    badgeBg: 'bg-status-warning-bg border-status-warning-border',
    iconColor: 'text-status-warning',
    dotColor: 'bg-status-warning',
    confirmButtonClass:
      'bg-status-warning text-txt-inverse hover:opacity-90 focus-visible:ring-status-warning/35 border border-transparent shadow-xs',
  },
  success: {
    icon: 'check',
    badgeBg: 'bg-status-success-bg border-status-success-border',
    iconColor: 'text-status-success',
    dotColor: 'bg-status-success',
    confirmButtonClass: '',
  },
};

export function ConfirmDialog({
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
}: ConfirmDialogProps) {
  useModalScrollLock(isOpen);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cfg = VARIANT_CONFIG[variant];

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isLoading) {
      onClose();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className={cn(confirmDialogVariants({ variant }))}
        {...(!description ? { 'aria-describedby': undefined } : {})}
        onEscapeKeyDown={(event) => {
          if (isLoading) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          if (variant === 'danger' && cancelRef.current) {
            event.preventDefault();
            cancelRef.current.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>

        <div
          data-slot="alert-dialog-body"
          className="flex-1 min-h-0 px-4 sm:px-6 py-4 sm:py-5 text-sm text-txt-secondary leading-relaxed overflow-y-auto overscroll-contain"
        >
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
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
        </div>

        <AlertDialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={
              variant === 'danger' ? 'danger' : variant === 'success' ? 'primary' : 'secondary'
            }
            onClick={onConfirm}
            isLoading={isLoading}
            className={cfg.confirmButtonClass}
          >
            {confirmText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
