import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Skeleton } from './Skeleton';

export interface TableProps extends React.ComponentProps<'table'> {
  /** Nombre accesible del contenedor desplazable (activa role="region" para navegación por teclado) */
  containerLabel?: string;
  containerClassName?: string;
}

export function Table({
  className,
  containerLabel,
  containerClassName,
  ...props
}: TableProps) {
  return (
    <div
      data-slot="table-container"
      tabIndex={0}
      role={containerLabel ? 'region' : undefined}
      aria-label={containerLabel}
      className={cn(
        'w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-xl border border-border/90 bg-surface shadow-xs focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
        containerClassName
      )}
    >
      <table
        data-slot="table"
        className={cn('w-full text-left border-collapse text-sm tabular-nums', className)}
        {...props}
      />
    </div>
  );
}

export interface TableHeaderProps extends React.ComponentProps<'thead'> {
  stickyHeader?: boolean;
}

export function TableHeader({
  className,
  stickyHeader = false,
  ...props
}: TableHeaderProps) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        'bg-canvas-subtle/90 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-txt-muted',
        stickyHeader && 'sticky top-0 z-10 backdrop-blur-sm',
        className
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('divide-y divide-border/75 bg-surface', className)}
      {...props}
    />
  );
}

export function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'bg-canvas-subtle/75 border-t border-border font-medium text-txt-primary [&>tr]:last:border-b-0',
        className
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'transition-colors duration-100 hover:bg-surface-hover/85 focus-within:bg-surface-hover/55',
        className
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  scope = 'col',
  ...props
}: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      scope={scope}
      className={cn('py-2.5 px-3.5 font-semibold text-txt-secondary', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('py-2.5 px-3.5 text-txt-primary align-middle', className)}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-3 px-4 pb-3 text-xs text-txt-muted text-left', className)}
      {...props}
    />
  );
}

export interface TableEmptyStateProps {
  colSpan: number;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function TableEmptyState({
  colSpan,
  icon,
  title,
  description,
  action,
}: TableEmptyStateProps) {
  return (
    <tr data-slot="table-empty-state">
      <td colSpan={colSpan} className="py-12 px-4 text-center">
        <div className="flex flex-col items-center justify-center max-w-sm mx-auto gap-2">
          {icon || (
            <div
              aria-hidden="true"
              className="w-12 h-12 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted mb-1"
            >
              <Inbox className="w-6 h-6" aria-hidden="true" />
            </div>
          )}
          <h4 className="text-sm font-semibold text-txt-primary">{title}</h4>
          {description && <p className="text-xs text-txt-muted">{description}</p>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </td>
    </tr>
  );
}

export interface TableLoadingSkeletonProps {
  colSpan: number;
  rows?: number;
}

export function TableLoadingSkeleton({
  colSpan,
  rows = 4,
}: TableLoadingSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <tr key={index} data-slot="table-loading-row">
          <td colSpan={colSpan} className="py-3.5 px-4">
            <div className="flex items-center gap-4 w-full">
              <Skeleton className="h-3.5 w-1/4" />
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3.5 w-1/4" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
