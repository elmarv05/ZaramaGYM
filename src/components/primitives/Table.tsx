import React from 'react';
import { cn } from '../../utils/cn';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {}

export const Table: React.FC<TableProps> = ({ className, ...props }) => (
  <div
    tabIndex={0}
    className="w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-md border border-border bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
  >
    <table className={cn('w-full text-left border-collapse text-sm', className)} {...props} />
  </div>
);

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className,
  ...props
}) => (
  <thead
    className={cn('bg-canvas-subtle border-b border-border text-xs font-semibold uppercase tracking-wider text-txt-secondary', className)}
    {...props}
  />
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className,
  ...props
}) => <tbody className={cn('divide-y divide-border bg-surface', className)} {...props} />;

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  className,
  ...props
}) => (
  <tr
    className={cn('transition-colors hover:bg-canvas-subtle/70 focus:bg-canvas-subtle', className)}
    {...props}
  />
);

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  ...props
}) => <th className={cn('py-3 px-4 font-semibold text-txt-secondary', className)} {...props} />;

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  ...props
}) => <td className={cn('py-3 px-4 text-txt-primary align-middle', className)} {...props} />;

export interface TableEmptyStateProps {
  colSpan: number;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const TableEmptyState: React.FC<TableEmptyStateProps> = ({
  colSpan,
  icon,
  title,
  description,
  action,
}) => (
  <tr>
    <td colSpan={colSpan} className="py-12 px-4 text-center">
      <div className="flex flex-col items-center justify-center max-w-sm mx-auto gap-2">
        {icon || (
          <div className="w-12 h-12 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted mb-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
        )}
        <h4 className="text-sm font-semibold text-txt-primary">{title}</h4>
        {description && <p className="text-xs text-txt-muted">{description}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </td>
  </tr>
);

export interface TableLoadingSkeletonProps {
  colSpan: number;
  rows?: number;
}

export const TableLoadingSkeleton: React.FC<TableLoadingSkeletonProps> = ({
  colSpan,
  rows = 4,
}) => (
  <>
    {Array.from({ length: rows }).map((_, index) => (
      <tr key={index} className="animate-pulse">
        <td colSpan={colSpan} className="py-3.5 px-4">
          <div className="h-4 bg-canvas-subtle rounded w-full flex items-center gap-4">
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
          </div>
        </td>
      </tr>
    ))}
  </>
);
