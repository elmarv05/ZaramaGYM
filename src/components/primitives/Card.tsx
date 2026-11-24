import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

export const cardVariants = cva(
  'rounded-xl border text-txt-primary flex flex-col transition-[border-color,background-color,box-shadow] duration-150',
  {
    variants: {
      variant: {
        default:
          'bg-surface border-border/90 shadow-xs dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.02)]',
        subtle: 'bg-canvas-subtle/80 border-border/80 shadow-2xs',
        elevated:
          'bg-elevated border-elevated-border shadow-md dark:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.025)]',
        interactive:
          'bg-surface border-border/90 shadow-xs zg-module-card hover:border-brand/45 dark:shadow-[0_1px_3px_0_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.02)]',
      },
      padding: {
        none: '',
        sm: 'p-4 gap-3',
        md: 'p-5 gap-4',
        lg: 'p-6 gap-5',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'none',
    },
  }
);

export interface CardProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant = 'default', padding = 'none', ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(cardVariants({ variant, padding }), className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'flex items-start justify-between gap-3 px-5 py-4 border-b border-border',
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return (
    <h3
      data-slot="card-title"
      className={cn('text-sm sm:text-base font-bold leading-snug text-txt-primary', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-xs text-txt-muted leading-relaxed', className)}
      {...props}
    />
  );
}

export function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('shrink-0 flex items-center gap-2', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-5 py-4 flex-1 min-w-0', className)}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex flex-wrap items-center justify-end gap-2.5 px-5 py-3.5 border-t border-border bg-canvas-subtle/60 rounded-b-xl',
        className
      )}
      {...props}
    />
  );
}
