import React from 'react';
import { cn } from '../../utils/cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, ...props }) => {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-border/70 dark:bg-surface-active/60',
        className
      )}
      {...props}
    />
  );
};

export const AppShellSkeleton: React.FC = () => {
  return (
    <div
      role="status"
      aria-label="Cargando aplicación ZaramaGYM"
      className="h-dvh w-full flex overflow-hidden bg-canvas text-txt-primary"
    >
      <span className="sr-only">Verificando sesión activa de ZaramaGYM...</span>

      {/* 1. Sidebar Izquierdo */}
      <aside className="hidden md:flex w-72 shrink-0 h-full flex-col justify-between border-r border-border bg-surface p-4 overflow-hidden">
        <div className="flex flex-col gap-6">
          {/* Logo + Nombre */}
          <div className="flex items-center gap-3 px-1">
            <Skeleton className="w-9 h-9 rounded-lg" />
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>

          {/* Elementos de navegación */}
          <div className="flex flex-col gap-2">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div key={idx} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="w-4 h-4 rounded" />
                <Skeleton className={cn('h-3.5', idx % 2 === 0 ? 'w-32' : 'w-24')} />
              </div>
            ))}
          </div>
        </div>

        {/* Pie del Sidebar */}
        <div className="pt-4 border-t border-border flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="flex flex-col gap-1.5 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      </aside>

      {/* Columna Derecha (Header + Main + Footer) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* 2. Header Superior */}
        <header className="h-16 border-b border-border bg-surface px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-md md:hidden" />
            <Skeleton className="h-5 w-44" />
          </div>
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md hidden sm:block" />
          </div>
        </header>

        {/* 3. Tarjetas / Tabla Principal */}
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 sm:p-6 flex flex-col gap-6 max-w-7xl w-full mx-auto">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="w-7 h-7 rounded-lg" />
                </div>
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-2.5 w-36" />
              </div>
            ))}
          </div>

          {/* Tabla principal */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden flex-1 flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-48" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-36 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-4 py-2 border-b border-border/60 last:border-b-0"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                    <Skeleton className="h-3.5 w-40" />
                  </div>
                  <Skeleton className="h-3.5 w-24 hidden sm:block" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-7 w-20 rounded-md" />
                </div>
              ))}
            </div>
          </div>
          </div>
        </main>

        {/* 4. Footer Inferior */}
        <footer className="h-11 border-t border-border bg-surface px-4 sm:px-6 flex items-center justify-between shrink-0">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-28" />
        </footer>
      </div>
    </div>
  );
};

export interface ModuleSkeletonProps {
  rows?: number;
  label?: string;
}

export const ModuleSkeleton: React.FC<ModuleSkeletonProps> = ({
  rows = 5,
  label = 'Cargando módulo',
}) => {
  return (
    <div
      role="status"
      aria-label={label}
      className="w-full flex flex-col gap-5"
    >
      <span className="sr-only">{label}...</span>

      {/* Barra de filtros */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <Skeleton className="h-9 w-64 max-w-full rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md hidden sm:block" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2.5"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-canvas-subtle border-b border-border grid grid-cols-4 gap-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16 justify-self-end" />
        </div>
        <div className="divide-y divide-border p-4 flex flex-col gap-3">
          {Array.from({ length: rows }).map((_, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-4 items-center pt-3 first:pt-0">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-md justify-self-end" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
