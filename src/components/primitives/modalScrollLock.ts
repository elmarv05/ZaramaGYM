import { useEffect } from 'react';

// Contador global para soportar modales y diálogos anidados sin restaurar el scroll prematuramente
let openModalCount = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';

export function useModalScrollLock(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

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
}
