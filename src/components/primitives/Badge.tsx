import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border font-semibold leading-none tracking-[0.01em] transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-canvas-subtle text-txt-primary border-border',
        outline: 'bg-transparent text-txt-secondary border-border-elevated',
        success: 'bg-status-success-bg text-status-success border-status-success-border',
        warning: 'bg-status-warning-bg text-status-warning border-status-warning-border',
        danger: 'bg-status-danger-bg text-status-danger border-status-danger-border',
        info: 'bg-status-info-bg text-status-info border-status-info-border',
      },
      size: {
        sm: 'text-[11px] px-2 py-1',
        md: 'text-xs px-2.5 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  asChild = false,
  className,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </Comp>
  );
}
