import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center font-semibold tracking-[-0.01em] rounded-lg transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:active:scale-100 select-none focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-offset-0 disabled:opacity-55 disabled:cursor-not-allowed disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-brand-text hover:bg-brand-hover focus-visible:ring-brand/35 border border-transparent shadow-[0_1px_2px_0_rgb(0_0_0/0.12),inset_0_1px_0_0_rgba(255,255,255,0.16)]',
        default:
          'bg-brand text-brand-text hover:bg-brand-hover focus-visible:ring-brand/35 border border-transparent shadow-[0_1px_2px_0_rgb(0_0_0/0.12),inset_0_1px_0_0_rgba(255,255,255,0.16)]',
        secondary:
          'bg-surface text-txt-primary hover:bg-surface-hover border border-border hover:border-border-elevated shadow-2xs',
        danger:
          'bg-status-danger text-white hover:bg-status-danger-hover focus-visible:ring-status-danger/35 border border-transparent shadow-xs',
        destructive:
          'bg-status-danger text-white hover:bg-status-danger-hover focus-visible:ring-status-danger/35 border border-transparent shadow-xs',
        ghost:
          'bg-transparent text-txt-secondary hover:bg-surface-hover hover:text-txt-primary',
        outline:
          'bg-surface/60 text-txt-primary border border-border-elevated hover:bg-surface-hover hover:border-border-strong shadow-2xs',
        link:
          'bg-transparent text-brand underline-offset-4 hover:underline p-0 h-auto min-h-0',
      },
      size: {
        sm: 'h-8 text-xs px-3 gap-1.5',
        md: 'h-9 text-sm px-4 gap-2',
        lg: 'h-10 text-sm px-5 gap-2',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  asChild = false,
  isLoading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  type = 'button',
  ...props
}: ButtonProps) {
  const resolvedClassName = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={resolvedClassName}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={resolvedClassName}
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
          {leftIcon && (
            <span className="inline-flex shrink-0" aria-hidden="true">
              {leftIcon}
            </span>
          )}
          <span>{children}</span>
          {rightIcon && (
            <span className="inline-flex shrink-0" aria-hidden="true">
              {rightIcon}
            </span>
          )}
        </>
      )}
    </button>
  );
}
