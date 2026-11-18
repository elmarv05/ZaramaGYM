import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';

// Contador global para soportar modales anidados sin restaurar el scroll prematuramente
let openModalCount = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';

export interface ModalProps {
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

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  preventClose = false,
  size = 'md',
  className,
}) => {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!isOpen) return;

    if (openModalCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    openModalCount += 1;

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.documentElement.style.overflow = previousHtmlOverflow;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, preventClose, onClose]);

  if (!isOpen) return null;

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className="fixed inset-0 z-50 flex justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm zg-modal-backdrop"
        onClick={() => {
          if (!preventClose && onClose) onClose();
        }}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        className={cn(
          'relative w-full my-auto max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] bg-surface border border-elevated rounded-lg shadow-lg flex flex-col z-10 overflow-hidden zg-modal-panel',
          sizeStyles[size],
          className
        )}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex flex-col gap-0.5 pr-4 min-w-0">
            <h3 id={titleId} className="text-base font-bold text-txt-primary">
              {title}
            </h3>
            {description && (
              <p id={descId} className="text-xs text-txt-muted">
                {description}
              </p>
            )}
          </div>
          {!preventClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar modal"
              className="p-1 rounded text-txt-muted hover:text-txt-primary hover:bg-canvas-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Body */}
        <div className="flex-1 min-h-0 px-6 py-5 text-sm text-txt-secondary leading-relaxed overflow-y-auto overscroll-contain">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 px-6 py-3.5 bg-canvas-subtle border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
