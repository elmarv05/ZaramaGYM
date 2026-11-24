import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-md transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:active:scale-100 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100';

    const variantStyles = {
      primary:
        'bg-brand text-brand-text hover:bg-brand-hover focus-visible:ring-brand border border-transparent shadow-sm',
      secondary:
        'bg-surface text-txt-primary hover:bg-surface-hover border border-border focus-visible:ring-border-focus shadow-sm',
      danger:
        'bg-status-danger text-white hover:bg-red-800 focus-visible:ring-status-danger shadow-sm',
      ghost:
        'bg-transparent text-txt-secondary hover:bg-surface-hover hover:text-txt-primary focus-visible:ring-border-focus',
      outline:
        'bg-transparent text-txt-primary border border-border-strong hover:bg-surface-hover focus-visible:ring-border-focus',
    };

    const sizeStyles = {
      sm: 'text-xs px-2.5 py-1.5 gap-1.5 min-h-[32px]',
      md: 'text-sm px-4 py-2 gap-2 min-h-[38px]',
      lg: 'text-base px-5 py-2.5 gap-2.5 min-h-[44px]',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading ? (
          <>
            <span className="inline-flex items-center gap-1 mr-2" aria-hidden="true">
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-current opacity-60 animate-pulse" />
            </span>
            <span>Cargando...</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
            <span>{children}</span>
            {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
