// ============================================================================
// COMPONENTE: FLASH CARDS UNIFICADAS PARA EL DIRECTORIO Y USUARIOS
// Formato base adaptable para Clientes, Proveedores, Personas, Empresas RUC 20 y Usuarios
// Incluye micro-interacciones suaves, Skeleton Cards y Empty State
// Ubicación: src/features/entities/EntityFlashCard.tsx
// ============================================================================

import React from 'react';
import { Badge } from '../../components/primitives/Badge';
import { Icon, IconName } from '../../components/primitives/Icon';
import { cn } from '../../utils/cn';

export interface FlashCardBadgeItem {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  icon?: IconName;
  title?: string;
}

export interface FlashCardMetricSlot {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  action?: React.ReactNode;
}

export interface EntityFlashCardProps {
  /** Etiqueta principal del tipo de entidad (CLIENTE, PROVEEDOR, PERSONA, EMPRESA RUC 20, USUARIO) */
  entityTag: string;
  entityTagVariant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  /** Badges secundarios en la barra superior */
  secondaryBadges?: FlashCardBadgeItem[];
  /** Estado activo / inactivo */
  isActive: boolean;
  /** Avatar circular: imagen, iniciales o icono */
  avatarPhotoUrl?: string | null;
  avatarInitials?: string;
  avatarIcon?: IconName;
  onAvatarClick?: () => void;
  avatarActionTitle?: string;
  /** Identidad principal */
  title: string;
  subtitleTag?: React.ReactNode;
  documentLabel: string;
  secondaryCodeChip?: React.ReactNode;
  /** Líneas de contacto primario */
  phone?: string | null;
  email?: string | null;
  /** Caja de resumen contextual (2 columnas limpias con datos reales) */
  metrics?: [FlashCardMetricSlot, FlashCardMetricSlot];
  /** Acciones rápidas en el pie izquierdo de la tarjeta */
  quickActions?: React.ReactNode;
  /** Acción para abrir el perfil completo */
  onOpenProfile: () => void;
  openProfileLabel?: string;
  className?: string;
}

export const EntityFlashCard: React.FC<EntityFlashCardProps> = ({
  entityTag,
  entityTagVariant = 'default',
  secondaryBadges = [],
  isActive,
  avatarPhotoUrl,
  avatarInitials = 'ZG',
  avatarIcon,
  onAvatarClick,
  avatarActionTitle,
  title,
  subtitleTag,
  documentLabel,
  secondaryCodeChip,
  phone,
  email,
  metrics,
  quickActions,
  onOpenProfile,
  openProfileLabel = 'Ver perfil',
  className,
}) => {
  return (
    <article
      className={cn(
        'group relative bg-surface border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between gap-3.5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-brand/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 zg-view-enter',
        !isActive && 'opacity-75 bg-canvas-subtle/40',
        className
      )}
    >
      {/* PARTE SUPERIOR: BADGES + IDENTIDAD + CONTACTO */}
      <div className="flex flex-col gap-3">
        {/* Zona 1: Barra Superior de Tipo y Estado */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant={entityTagVariant} size="sm">
              {entityTag}
            </Badge>
            {secondaryBadges.map((b, idx) => (
              <Badge key={idx} variant={b.variant || 'default'} size="sm" title={b.title}>
                {b.icon && <Icon name={b.icon} className="w-3 h-3 mr-0.5" />}
                <span>{b.label}</span>
              </Badge>
            ))}
          </div>

          <Badge variant={isActive ? 'success' : 'danger'} size="sm">
            <Icon name={isActive ? 'check' : 'danger'} className="w-3 h-3 mr-0.5" />
            <span>{isActive ? 'Activo' : 'Inactivo'}</span>
          </Badge>
        </div>

        {/* Zona 2: Avatar + Nombre / Razón Social + Chips de Documento */}
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-full border border-border bg-canvas-subtle overflow-hidden flex items-center justify-center font-bold text-xs text-txt-secondary shadow-xs">
              {avatarPhotoUrl ? (
                <img
                  src={avatarPhotoUrl}
                  alt={`Foto de ${title}`}
                  className="w-full h-full object-cover"
                />
              ) : avatarIcon ? (
                <Icon name={avatarIcon} className="w-5 h-5 text-status-info" />
              ) : (
                <span className="text-brand font-bold">{avatarInitials}</span>
              )}
            </div>

            {onAvatarClick && (
              <button
                type="button"
                onClick={onAvatarClick}
                title={avatarActionTitle || 'Cambiar foto'}
                aria-label={avatarActionTitle || `Cambiar foto de ${title}`}
                className="absolute inset-0 bg-black/45 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
              >
                <Icon name="camera" className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpenProfile}
              className="text-left text-base font-bold text-txt-primary hover:text-brand transition-colors truncate focus:outline-none focus-visible:underline"
            >
              {title}
            </button>

            {subtitleTag && <div className="text-xs">{subtitleTag}</div>}

            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className="px-2 py-0.5 rounded bg-canvas-subtle border border-border font-mono text-xs text-txt-secondary">
                {documentLabel}
              </span>
              {secondaryCodeChip}
            </div>
          </div>
        </div>

        {/* Zona 3: Contacto Primario */}
        <div className="flex flex-col gap-1.5 pt-1 text-xs text-txt-secondary">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="smartphone" className="w-3.5 h-3.5 text-txt-muted shrink-0" />
            <span className="font-mono truncate">{phone || 'Sin teléfono'}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="mail" className="w-3.5 h-3.5 text-txt-muted shrink-0" />
            <span className="truncate">{email || 'Sin correo'}</span>
          </div>
        </div>

        {/* Zona 4: Caja de Resumen Contextual (Datos Reales del Rol) */}
        {metrics && (
          <div className="bg-canvas-subtle/80 border border-border rounded-lg p-2.5 grid grid-cols-2 gap-2.5">
            {metrics.map((m, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex flex-col gap-0.5 min-w-0',
                  idx === 1 && 'border-l border-border pl-2.5'
                )}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-txt-muted truncate">
                  {m.label}
                </span>
                <div className="text-xs font-bold text-txt-primary flex items-center gap-1.5 flex-wrap">
                  {m.value}
                  {m.action}
                </div>
                {m.subValue && (
                  <div className="text-[11px] text-txt-muted truncate">{m.subValue}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zona 5: Pie de Acciones Interactivas */}
      <div className="pt-2.5 border-t border-border flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">{quickActions}</div>

        <button
          type="button"
          onClick={onOpenProfile}
          aria-label={`${openProfileLabel} de ${title}`}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:text-brand-hover py-1 px-2 rounded-md hover:bg-status-success-bg/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ml-auto"
        >
          <span>{openProfileLabel}</span>
          <Icon
            name="arrow-right"
            className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
          />
        </button>
      </div>
    </article>
  );
};

// ============================================================================
// CONTENEDOR DE GRILLA RESPONSIVA PARA LAS FLASH CARDS
// ============================================================================

export const EntityFlashCardGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
    {children}
  </div>
);

// ============================================================================
// ESTADO DE CARGA (SKELETON FLASH CARDS - EVITA CLS)
// ============================================================================

export const EntityFlashCardSkeletonGrid: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <div
    role="status"
    aria-label="Cargando tarjetas del directorio"
    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
  >
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className="bg-surface border border-border rounded-xl p-4 flex flex-col justify-between gap-3.5 animate-pulse"
      >
        <div className="flex items-center justify-between">
          <div className="h-5 w-20 rounded-full bg-canvas-subtle" />
          <div className="h-5 w-16 rounded-full bg-canvas-subtle" />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-canvas-subtle shrink-0" />
          <div className="flex flex-col gap-2 flex-1">
            <div className="h-4 w-3/4 rounded bg-canvas-subtle" />
            <div className="h-3.5 w-1/2 rounded bg-canvas-subtle" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-3 w-2/3 rounded bg-canvas-subtle" />
          <div className="h-3 w-1/2 rounded bg-canvas-subtle" />
        </div>
        <div className="h-14 w-full rounded-lg bg-canvas-subtle" />
        <div className="pt-2.5 border-t border-border flex items-center justify-between">
          <div className="flex gap-1.5">
            <div className="h-7 w-14 rounded bg-canvas-subtle" />
            <div className="h-7 w-16 rounded bg-canvas-subtle" />
          </div>
          <div className="h-6 w-20 rounded bg-canvas-subtle" />
        </div>
      </div>
    ))}
  </div>
);

// ============================================================================
// ESTADO VACÍO PARA LA GRILLA DE FLASH CARDS
// ============================================================================

export interface EntityFlashCardEmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: IconName;
}

export const EntityFlashCardEmptyState: React.FC<EntityFlashCardEmptyStateProps> = ({
  title,
  description,
  action,
  icon = 'directory',
}) => (
  <div className="bg-surface border border-border rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3 shadow-xs">
    <div className="w-11 h-11 rounded-full bg-canvas-subtle border border-border flex items-center justify-center text-txt-muted">
      <Icon name={icon} className="w-5 h-5" />
    </div>
    <div className="max-w-md flex flex-col gap-1">
      <h3 className="text-sm font-bold text-txt-primary">{title}</h3>
      <p className="text-xs text-txt-muted">{description}</p>
    </div>
    {action && <div className="mt-1">{action}</div>}
  </div>
);
