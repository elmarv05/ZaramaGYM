import * as React from 'react';
import { useId } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

export const textareaVariants = cva(
  'w-full min-w-0 bg-surface border rounded-lg text-sm text-txt-primary placeholder:text-txt-muted/85 shadow-2xs transition-[border-color,box-shadow,background-color] duration-150 py-2 px-3 resize-y focus:outline-none focus-visible:ring-[3px] focus-visible:ring-offset-0 disabled:bg-canvas-subtle disabled:text-txt-muted disabled:cursor-not-allowed',
  {
    variants: {
      state: {
        default:
          'border-border hover:border-border-elevated focus-visible:border-border-focus focus-visible:ring-ring/25',
        error:
          'border-status-danger focus-visible:border-status-danger focus-visible:ring-status-danger/25',
      },
    },
    defaultVariants: {
      state: 'default',
    },
  }
);

export interface TextareaProps
  extends React.ComponentProps<'textarea'>,
    Omit<VariantProps<typeof textareaVariants>, 'state'> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({
  label,
  error,
  hint,
  className,
  id,
  required,
  rows = 3,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const errorId = `${textareaId}-error`;
  const hintId = `${textareaId}-hint`;

  return (
    <div data-slot="textarea-field" className="w-full min-w-0 flex flex-col gap-1.5 text-left">
      {label && (
        <label
          data-slot="textarea-label"
          htmlFor={textareaId}
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

      <textarea
        data-slot="textarea"
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        required={required}
        className={cn(textareaVariants({ state: error ? 'error' : 'default' }), className)}
        {...props}
      />

      {error && (
        <p
          data-slot="textarea-error"
          id={errorId}
          role="alert"
          className="text-xs text-status-danger font-medium"
        >
          {error}
        </p>
      )}

      {!error && hint && (
        <p data-slot="textarea-hint" id={hintId} className="text-xs text-txt-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
