import * as React from 'react';
import { useId } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../utils/cn';

export type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root>;

export function Checkbox({ className, checked, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={checked}
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-border-strong bg-surface shadow-2xs transition-colors cursor-pointer',
        'data-[state=checked]:bg-brand data-[state=checked]:border-brand data-[state=checked]:text-brand-text',
        'data-[state=indeterminate]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:text-brand-text',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        {checked === 'indeterminate' ? (
          <Minus className="size-3.5 stroke-[3]" aria-hidden="true" />
        ) : (
          <Check className="size-3.5 stroke-[3]" aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export interface CheckboxFieldProps extends CheckboxProps {
  label: React.ReactNode;
  description?: string;
}

export function CheckboxField({
  label,
  description,
  id,
  className,
  disabled,
  ...props
}: CheckboxFieldProps) {
  const generatedId = useId();
  const checkboxId = id || generatedId;
  const descriptionId = description ? `${checkboxId}-desc` : undefined;

  return (
    <label
      data-slot="checkbox-field"
      htmlFor={checkboxId}
      className={cn(
        'inline-flex items-start gap-2.5 min-h-[36px] py-1.5 select-none cursor-pointer',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <Checkbox
        id={checkboxId}
        disabled={disabled}
        aria-describedby={descriptionId}
        className="mt-0.5"
        {...props}
      />
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-txt-primary leading-snug">{label}</span>
        {description && (
          <span id={descriptionId} className="text-xs text-txt-muted leading-snug">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
