import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../../utils/cn';

export interface LabelProps extends React.ComponentProps<typeof LabelPrimitive.Root> {
  required?: boolean;
}

export function Label({ className, children, required, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'text-xs font-semibold text-txt-secondary uppercase tracking-wider select-none inline-flex items-center gap-1 peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {required && (
        <span aria-hidden="true" className="text-status-danger text-xs">
          *
        </span>
      )}
    </LabelPrimitive.Root>
  );
}
