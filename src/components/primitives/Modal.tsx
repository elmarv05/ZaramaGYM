import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';
import { useModalScrollLock } from './modalScrollLock';

export const dialogSizeVariants = cva('', {
  variants: {
    size: {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-2xl',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-[3px] overflow-hidden overscroll-contain zg-modal-backdrop',
        className
      )}
      {...props}
    />
  );
}

export interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogSizeVariants> {
  showCloseButton?: boolean;
}

export function DialogContent({
  className,
  children,
  size = 'md',
  showCloseButton = false,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed inset-x-3 sm:inset-x-6 inset-y-3 sm:inset-y-6 z-50 mx-auto my-auto h-fit w-[calc(100%-1.5rem)] sm:w-[calc(100%-3rem)] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]',
          'bg-elevated border border-elevated-border rounded-xl shadow-lg dark:ring-1 dark:ring-white/[0.03] flex flex-col overflow-hidden overscroll-contain zg-modal-panel focus:outline-none',
          dialogSizeVariants({ size }),
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Cerrar modal"
            className="absolute top-3.5 right-3.5 p-1 rounded text-txt-muted hover:text-txt-primary hover:bg-canvas-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border',
        className
      )}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'shrink-0 flex flex-wrap items-center justify-end gap-3 px-4 sm:px-6 py-3.5 bg-canvas-subtle border-t border-border',
        className
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base font-bold text-txt-primary', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-xs text-txt-muted', className)}
      {...props}
    />
  );
}

export interface ModalProps extends VariantProps<typeof dialogSizeVariants> {
  isOpen: boolean;
  onClose?: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  preventClose?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  preventClose = false,
  size = 'md',
  className,
}: ModalProps) {
  useModalScrollLock(isOpen);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !preventClose && onClose) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        size={size}
        className={className}
        {...(!description ? { 'aria-describedby': undefined } : {})}
        onEscapeKeyDown={(event) => {
          if (preventClose || !onClose) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (preventClose || !onClose) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (preventClose || !onClose) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <div className="flex flex-col gap-0.5 pr-4 min-w-0">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
          {!preventClose && onClose && (
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Cerrar modal"
                className="p-1 rounded text-txt-muted hover:text-txt-primary hover:bg-canvas-subtle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus shrink-0"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </DialogClose>
          )}
        </DialogHeader>

        <div
          data-slot="dialog-body"
          className="flex-1 min-h-0 px-4 sm:px-6 py-4 sm:py-5 text-sm text-txt-secondary leading-relaxed overflow-y-auto overscroll-contain"
        >
          {children}
        </div>

        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
