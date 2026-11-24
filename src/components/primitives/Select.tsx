import * as React from 'react';
import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export const selectVariants = cva(
  'w-full bg-surface border rounded-lg text-txt-primary shadow-2xs transition-[border-color,box-shadow,background-color] duration-150 cursor-pointer appearance-none focus:outline-none focus-visible:ring-[3px] focus-visible:ring-offset-0 disabled:bg-canvas-subtle disabled:text-txt-muted disabled:cursor-not-allowed',
  {
    variants: {
      state: {
        default:
          'border-border hover:border-border-elevated focus-visible:border-border-focus focus-visible:ring-ring/25',
        error:
          'border-status-danger focus-visible:border-status-danger focus-visible:ring-status-danger/25',
      },
      selectSize: {
        sm: 'h-8 px-2.5 pr-8 text-xs',
        md: 'h-9 px-3 pr-8 text-sm',
        lg: 'h-10 px-3.5 pr-9 text-sm',
      },
    },
    defaultVariants: {
      state: 'default',
      selectSize: 'md',
    },
  }
);

export interface SelectProps
  extends React.ComponentProps<'select'>,
    Omit<VariantProps<typeof selectVariants>, 'state'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
}

export function Select({
  label,
  error,
  hint,
  options,
  selectSize = 'md',
  className,
  id,
  required,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const errorId = `${selectId}-error`;
  const hintId = `${selectId}-hint`;

  return (
    <div data-slot="select-field" className="w-full flex flex-col gap-1.5 text-left">
      {label && (
        <label
          data-slot="select-label"
          htmlFor={selectId}
          className="text-xs font-semibold text-txt-primary tracking-[-0.01em] select-none flex items-center justify-between"
        >
          <span>{label}</span>
          {required && (
            <span aria-hidden="true" className="text-status-danger text-xs">
              *
            </span>
          )}
        </label>
      )}

      <div data-slot="select-wrapper" className="relative flex items-center">
        <select
          data-slot="select"
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          required={required}
          className={cn(
            selectVariants({ state: error ? 'error' : 'default', selectSize }),
            className
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 flex items-center text-txt-muted"
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      {error && (
        <p data-slot="select-error" id={errorId} role="alert" className="text-xs text-status-danger font-medium">
          {error}
        </p>
      )}

      {!error && hint && (
        <p data-slot="select-hint" id={hintId} className="text-xs text-txt-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
