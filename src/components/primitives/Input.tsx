import * as React from 'react';
import { useId } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

export const inputVariants = cva(
  'w-full min-w-0 bg-surface border rounded-lg text-txt-primary placeholder:text-txt-muted/85 shadow-2xs transition-[border-color,box-shadow,background-color] duration-150 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-offset-0 disabled:bg-canvas-subtle disabled:text-txt-muted disabled:cursor-not-allowed',
  {
    variants: {
      state: {
        default:
          'border-border hover:border-border-elevated focus-visible:border-border-focus focus-visible:ring-ring/25',
        error:
          'border-status-danger focus-visible:border-status-danger focus-visible:ring-status-danger/25',
      },
      inputSize: {
        sm: 'h-8 px-2.5 text-xs',
        md: 'h-9 px-3 text-sm',
        lg: 'h-10 px-3.5 text-sm',
      },
    },
    defaultVariants: {
      state: 'default',
      inputSize: 'md',
    },
  }
);

export interface InputProps
  extends React.ComponentProps<'input'>,
    Omit<VariantProps<typeof inputVariants>, 'state'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  inputSize = 'md',
  className,
  id,
  required,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div data-slot="input-field" className="w-full min-w-0 flex flex-col gap-1.5 text-left">
      {label && (
        <label
          data-slot="input-label"
          htmlFor={inputId}
          className="text-xs font-semibold text-txt-primary tracking-[-0.01em] select-none flex items-center justify-between gap-1"
        >
          <span className="min-w-0 break-words">{label}</span>
          {required && (
            <span aria-hidden="true" className="text-status-danger text-xs shrink-0">
              *
            </span>
          )}
        </label>
      )}

      <div data-slot="input-wrapper" className="relative flex items-center w-full min-w-0">
        {leftIcon && (
          <div
            aria-hidden="true"
            className="absolute left-3 inset-y-0 z-10 flex items-center pointer-events-none select-none text-txt-muted"
          >
            {leftIcon}
          </div>
        )}

        <input
          data-slot="input"
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          required={required}
          className={cn(
            inputVariants({ state: error ? 'error' : 'default', inputSize }),
            leftIcon && 'pl-9',
            rightIcon && 'pr-9',
            className
          )}
          {...props}
        />

        {rightIcon && (
          <div className="absolute right-3 inset-y-0 z-10 flex items-center text-txt-muted">
            {rightIcon}
          </div>
        )}
      </div>

      {error && (
        <p data-slot="input-error" id={errorId} role="alert" className="text-xs text-status-danger font-medium">
          {error}
        </p>
      )}

      {!error && hint && (
        <p data-slot="input-hint" id={hintId} className="text-xs text-txt-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
