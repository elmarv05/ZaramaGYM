// ============================================================================
// COMPONENTE: PANEL OPERATIVO DE RECEPCIÓN (RECEPTION DASHBOARD)
// Hub unificado de Módulos del Gimnasio con Flash Cards cromáticas por módulo
// y vistas operativas estandarizadas in-place (sin redirecciones incongruentes)
// Ubicación: src/features/reception/ReceptionDashboard.tsx
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '../../components/primitives/Badge';
import { Icon, IconName } from '../../components/primitives/Icon';
import { Skeleton } from '../../components/primitives/Skeleton';
import { AuthSession } from '../../types/auth';
import { AttendanceMainTab, AttendanceView } from '../attendance/AttendanceView';
import { CatalogView } from '../catalog/CatalogView';
import { EntityDirectoryView, EntityDirectoryViewProps } from '../entities/EntityDirectoryView';
import { LanServerView } from '../lan/LanServerView';
import { PosMainTab, PosView } from '../pos/PosView';

export type ReceptionTab =
  | 'modulos'
  | 'directorio'
  | 'asistencias'
  | 'pos'
  | 'catalogo'
  | 'lan';

export interface ReceptionDashboardProps {
  session: AuthSession;
  onLockSession?: () => void;
  entitiesProps?: Partial<EntityDirectoryViewProps>;
  /** Conservado por compatibilidad de props; el flujo del Panel Operativo es estandarizado in-place */
  onNavigateToPos?: (initialSubTab?: PosMainTab) => void;
  onNavigateToAttendance?: () => void;
  onNavigateToLan?: () => void;
}

interface ModuleColorTokens {
  strip: string;
  cardSurface: string;
  cardBorder: string;
  iconBox: string;
  tagPill: string;
  ctaText: string;
  dot: string;
  navUnderline: string;
  headerBadge: string;
}

interface ModuleCardConfig {
  id: string;
  targetTab: Exclude<ReceptionTab, 'modulos'>;
  posSubTab?: PosMainTab;
  attendanceSubTab?: AttendanceMainTab;
  title: string;
  tag: string;
  description: string;
  ctaLabel: string;
  icon: IconName;
  color: ModuleColorTokens;
}

const MODULE_PALETTE = {
  sky: {
    strip: 'bg-sky-500 dark:bg-sky-400',
    cardSurface: 'bg-sky-50/70 hover:bg-sky-50 dark:bg-sky-950/25 dark:hover:bg-sky-950/40',
    cardBorder:
      'border-sky-200/90 hover:border-sky-500 dark:border-sky-800/70 dark:hover:border-sky-400',
    iconBox:
      'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/60 dark:text-sky-300 dark:border-sky-700/60',
    tagPill: 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200',
    ctaText: 'text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500 dark:bg-sky-400',
    navUnderline: 'border-sky-600 dark:border-sky-400',
    headerBadge:
      'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-800',
  },
  indigo: {
    strip: 'bg-indigo-500 dark:bg-indigo-400',
    cardSurface:
      'bg-indigo-50/70 hover:bg-indigo-50 dark:bg-indigo-950/25 dark:hover:bg-indigo-950/40',
    cardBorder:
      'border-indigo-200/90 hover:border-indigo-500 dark:border-indigo-800/70 dark:hover:border-indigo-400',
    iconBox:
      'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/60 dark:text-indigo-300 dark:border-indigo-700/60',
    tagPill: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200',
    ctaText: 'text-indigo-700 dark:text-indigo-300',
    dot: 'bg-indigo-500 dark:bg-indigo-400',
    navUnderline: 'border-indigo-600 dark:border-indigo-400',
    headerBadge:
      'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800',
  },
  emerald: {
    strip: 'bg-emerald-500 dark:bg-emerald-400',
    cardSurface:
      'bg-emerald-50/70 hover:bg-emerald-50 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/40',
    cardBorder:
      'border-emerald-200/90 hover:border-emerald-500 dark:border-emerald-800/70 dark:hover:border-emerald-400',
    iconBox:
      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-700/60',
    tagPill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
    ctaText: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    navUnderline: 'border-emerald-600 dark:border-emerald-400',
    headerBadge:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
  },
  amber: {
    strip: 'bg-amber-500 dark:bg-amber-400',
    cardSurface:
      'bg-amber-50/70 hover:bg-amber-50 dark:bg-amber-950/25 dark:hover:bg-amber-950/40',
    cardBorder:
      'border-amber-200/90 hover:border-amber-500 dark:border-amber-800/70 dark:hover:border-amber-400',
    iconBox:
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700/60',
    tagPill: 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200',
    ctaText: 'text-amber-800 dark:text-amber-300',
    dot: 'bg-amber-500 dark:bg-amber-400',
    navUnderline: 'border-amber-600 dark:border-amber-400',
    headerBadge:
      'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
  },
  rose: {
    strip: 'bg-rose-500 dark:bg-rose-400',
    cardSurface:
      'bg-rose-50/70 hover:bg-rose-50 dark:bg-rose-950/25 dark:hover:bg-rose-950/40',
    cardBorder:
      'border-rose-200/90 hover:border-rose-500 dark:border-rose-800/70 dark:hover:border-rose-400',
    iconBox:
      'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/60 dark:text-rose-300 dark:border-rose-700/60',
    tagPill: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
    ctaText: 'text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500 dark:bg-rose-400',
    navUnderline: 'border-rose-600 dark:border-rose-400',
    headerBadge:
      'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
  },
  teal: {
    strip: 'bg-teal-500 dark:bg-teal-400',
    cardSurface:
      'bg-teal-50/70 hover:bg-teal-50 dark:bg-teal-950/25 dark:hover:bg-teal-950/40',
    cardBorder:
      'border-teal-200/90 hover:border-teal-500 dark:border-teal-800/70 dark:hover:border-teal-400',
    iconBox:
      'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/60 dark:text-teal-300 dark:border-teal-700/60',
    tagPill: 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200',
    ctaText: 'text-teal-700 dark:text-teal-300',
    dot: 'bg-teal-500 dark:bg-teal-400',
    navUnderline: 'border-teal-600 dark:border-teal-400',
    headerBadge:
      'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-800',
  },
  violet: {
    strip: 'bg-violet-500 dark:bg-violet-400',
    cardSurface:
      'bg-violet-50/70 hover:bg-violet-50 dark:bg-violet-950/25 dark:hover:bg-violet-950/40',
    cardBorder:
      'border-violet-200/90 hover:border-violet-500 dark:border-violet-800/70 dark:hover:border-violet-400',
    iconBox:
      'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/60 dark:text-violet-300 dark:border-violet-700/60',
    tagPill: 'bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200',
    ctaText: 'text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500 dark:bg-violet-400',
    navUnderline: 'border-violet-600 dark:border-violet-400',
    headerBadge:
      'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/60 dark:text-violet-200 dark:border-violet-800',
  },
} as const;

const MODULE_FLASH_CARDS: ModuleCardConfig[] = [
  {
    id: 'card-directory',
    targetTab: 'directorio',
    title: 'Directorio de Socios & Entidades',
    tag: 'Entidades',
    description:
      'Clientes QR, fichas médicas, personas naturales, empresas RUC 20 y proveedores.',
    ctaLabel: 'Abrir directorio',
    icon: 'directory',
    color: MODULE_PALETTE.sky,
  },
  {
    id: 'card-attendance',
    targetTab: 'asistencias',
    attendanceSubTab: 'monitor',
    title: 'Asistencias & Semáforo QR',
    tag: 'Control de Puerta',
    description:
      'Escáner QR de ingreso, semáforo verde/ámbar/rojo, destrabes y prórrogas.',
    ctaLabel: 'Abrir escáner',
    icon: 'qr',
    color: MODULE_PALETTE.indigo,
  },
  {
    id: 'card-pos',
    targetTab: 'pos',
    posSubTab: 'pos',
    title: 'Caja & Punto de Venta (POS)',
    tag: 'Ventas y Cobros',
    description:
      'Inscripción de planes, venta de productos y pagos mixtos (Efectivo/Yape/Plin).',
    ctaLabel: 'Abrir caja POS',
    icon: 'pos',
    color: MODULE_PALETTE.emerald,
  },
  {
    id: 'card-shift',
    targetTab: 'pos',
    posSubTab: 'pos',
    title: 'Turnos y Arqueo de Caja',
    tag: 'Gestión de Turno',
    description:
      'Apertura de gaveta, conteo de efectivo por denominación y cierre de estación.',
    ctaLabel: 'Gestionar turno',
    icon: 'key',
    color: MODULE_PALETTE.amber,
  },
  {
    id: 'card-debtors',
    targetTab: 'pos',
    posSubTab: 'deudores',
    title: 'Cuentas por Cobrar (Deudores)',
    tag: 'Créditos',
    description:
      'Socios con saldo pendiente y registro de amortizaciones directas en 1 clic.',
    ctaLabel: 'Ver deudores',
    icon: 'credit-card',
    color: MODULE_PALETTE.rose,
  },
  {
    id: 'card-catalog',
    targetTab: 'catalogo',
    title: 'Catálogo & Stock',
    tag: 'Planes y Precios',
    description:
      'Tarifario de membresías, simulador Day Overflow e inventario de productos.',
    ctaLabel: 'Consultar catálogo',
    icon: 'catalog',
    color: MODULE_PALETTE.teal,
  },
  {
    id: 'card-lan',
    targetTab: 'lan',
    title: 'Escáner Móvil Wi-Fi LAN',
    tag: 'Red Local :3443',
    description:
      'Vinculación de smartphones por QR, estado de red local y simulador móvil.',
    ctaLabel: 'Abrir red LAN',
    icon: 'wifi',
    color: MODULE_PALETTE.violet,
  },
];

const ACTIVE_TAB_META: Record<
  Exclude<ReceptionTab, 'modulos'>,
  { label: string; color: ModuleColorTokens }
> = {
  directorio: { label: 'Directorio de Socios & Entidades', color: MODULE_PALETTE.sky },
  asistencias: { label: 'Asistencias & Semáforo QR', color: MODULE_PALETTE.indigo },
  pos: { label: 'Caja & POS', color: MODULE_PALETTE.emerald },
  catalogo: { label: 'Catálogo & Stock', color: MODULE_PALETTE.teal },
  lan: { label: 'Escáner Móvil Wi-Fi LAN', color: MODULE_PALETTE.violet },
};

export const ReceptionDashboard: React.FC<ReceptionDashboardProps> = ({
  session,
  entitiesProps,
}) => {
  const isAdmin = session.rol === 'ADMINISTRADOR';
  const [activeTab, setActiveTab] = useState<ReceptionTab>('modulos');
  const [posInitialSubTab, setPosInitialSubTab] = useState<PosMainTab>('pos');
  const [attendanceInitialSubTab, setAttendanceInitialSubTab] =
    useState<AttendanceMainTab>('monitor');

  const visibleFlashCards = React.useMemo(() => {
    return MODULE_FLASH_CARDS.filter((card) => isAdmin || card.id !== 'card-lan').map((card) => {
      if (!isAdmin && card.id === 'card-directory') {
        return {
          ...card,
          title: 'Directorio (Clientes / Proveedores / Empresas)',
          description:
            'Inscripción y edición de clientes con QR, y registro/consulta de proveedores y empresas RUC 20.',
        };
      }
      return card;
    });
  }, [isAdmin]);

  const activeTabMeta =
    activeTab === 'directorio' && !isAdmin
      ? {
          ...ACTIVE_TAB_META.directorio,
          label: 'Directorio (Clientes / Proveedores / Empresas)',
        }
      : activeTab !== 'modulos'
      ? ACTIVE_TAB_META[activeTab]
      : null;

  const openModule = (
    tab: ReceptionTab,
    options?: { posSubTab?: PosMainTab; attendanceSubTab?: AttendanceMainTab }
  ) => {
    if (tab === 'lan' && !isAdmin) return;
    if (options?.posSubTab) {
      setPosInitialSubTab(options.posSubTab);
    }
    if (options?.attendanceSubTab) {
      setAttendanceInitialSubTab(options.attendanceSubTab);
    }
    setActiveTab(tab);
  };

  const clientsList = entitiesProps?.clients ?? [];
  const isEntitiesLoading = Boolean(entitiesProps?.isLoading);
  const entitiesError = entitiesProps?.error;

  const renderModuleHeader = (
    headingId: string,
    title: string,
    subtitle: string,
    icon: IconName,
    tag: string,
    color: ModuleColorTokens
  ) => (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-border rounded-xl px-4 py-3 shadow-xs">
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${color.iconBox}`}
        >
          <Icon name={icon} className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={headingId} className="text-base font-bold text-txt-primary truncate">
              {title}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${color.headerBadge}`}
            >
              {tag}
            </span>
          </div>
          <p className="text-xs text-txt-muted">{subtitle}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => openModule('modulos')}
        className="self-start sm:self-center shrink-0 text-xs font-semibold text-txt-secondary hover:text-txt-primary bg-canvas-subtle hover:bg-surface-hover px-3 py-1.5 rounded-lg border border-border transition-colors inline-flex items-center gap-1.5"
      >
        <Icon name="chevron-left" className="w-3.5 h-3.5" />
        <span>Todos los módulos</span>
      </button>
    </div>
  );

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Banner de Bienvenida Operativa */}
      <div className="bg-surface border border-border rounded-xl p-5 sm:p-6 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-txt-primary">
              ¡Hola, {session.nombre_completo}!
            </h2>
            <Badge variant="success" size="sm">
              Turno Activo
            </Badge>
          </div>
          <p className="text-xs text-txt-secondary">
            Estación operativa ({session.rol}) iniciada el {session.login_at} (Usuario @
            {session.username})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => openModule('asistencias', { attendanceSubTab: 'monitor' })}
            aria-pressed={activeTab === 'asistencias'}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 shadow-xs ${
              activeTab === 'asistencias'
                ? 'bg-indigo-600 text-white border-indigo-700 dark:bg-indigo-500 dark:border-indigo-400'
                : 'text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border-indigo-300 dark:border-indigo-800'
            }`}
          >
            <Icon name="qr" className="w-4 h-4" />
            <span>Escáner QR</span>
          </button>

          <button
            type="button"
            onClick={() => openModule('pos', { posSubTab: 'pos' })}
            aria-pressed={activeTab === 'pos'}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 shadow-xs ${
              activeTab === 'pos'
                ? 'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:border-emerald-400'
                : 'text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border-emerald-300 dark:border-emerald-800'
            }`}
          >
            <Icon name="pos" className="w-4 h-4" />
            <span>Caja / POS</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => openModule('lan')}
              aria-pressed={activeTab === 'lan'}
              className={`text-xs font-bold px-3.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 shadow-xs ${
                activeTab === 'lan'
                  ? 'bg-violet-600 text-white border-violet-700 dark:bg-violet-500 dark:border-violet-400'
                  : 'text-violet-800 dark:text-violet-200 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/50 border-violet-300 dark:border-violet-800'
              }`}
            >
              <Icon name="wifi" className="w-4 h-4" />
              <span>Red LAN</span>
            </button>
          )}
        </div>
      </div>

      {/* Cabecera Única de Hub: Módulos del Gimnasio (sin pestañas redundantes) */}
      <nav
        aria-label="Módulos del Gimnasio"
        className="flex flex-wrap items-center gap-2 border-b border-border pb-2.5"
      >
        <button
          type="button"
          aria-current={activeTab === 'modulos' ? 'page' : undefined}
          onClick={() => openModule('modulos')}
          className={`text-xs sm:text-sm px-3.5 py-2 rounded-lg transition-colors inline-flex items-center gap-2 border ${
            activeTab === 'modulos'
              ? 'bg-surface text-txt-primary shadow-sm border-brand font-bold'
              : 'bg-surface/60 text-txt-secondary hover:text-txt-primary hover:bg-surface border-border font-semibold'
          }`}
        >
          <Icon name="dashboard" className="w-4 h-4 shrink-0 text-brand" />
          <span>Módulos del Gimnasio</span>
        </button>

        {activeTabMeta && (
          <div className="inline-flex items-center gap-2 text-xs text-txt-muted">
            <Icon name="chevron-right" className="w-3.5 h-3.5" />
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-semibold ${activeTabMeta.color.headerBadge}`}
            >
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full ${activeTabMeta.color.dot}`}
              />
              {activeTabMeta.label}
            </span>
          </div>
        )}
      </nav>

      {/* Contenido Dinámico Unificado (Animación Suave por Vista) */}
      <div key={activeTab} className="zg-view-enter w-full">
        {activeTab === 'modulos' && (
          <section aria-labelledby="modulos-hub-heading" className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 id="modulos-hub-heading" className="text-base font-bold text-txt-primary">
                  Accesos Directos a Módulos del Gimnasio
                </h3>
                <p className="text-xs text-txt-muted">
                  Selecciona una tarjeta para abrir el módulo directamente aquí. Cada módulo mantiene su color e icono de referencia.
                </p>
              </div>
              {entitiesError && entitiesProps?.onRefresh && (
                <button
                  type="button"
                  onClick={entitiesProps.onRefresh}
                  className="self-start text-xs font-semibold text-status-danger bg-status-danger-bg px-3 py-1.5 rounded-lg border border-status-danger/30 inline-flex items-center gap-1.5"
                >
                  <Icon name="refresh" className="w-3.5 h-3.5" />
                  <span>Reintentar carga de socios</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleFlashCards.map((card) => {
                const isDirectoryCard = card.targetTab === 'directorio';
                return (
                  <article key={card.id} className="flex">
                    <button
                      type="button"
                      onClick={() =>
                        openModule(card.targetTab, {
                          posSubTab: card.posSubTab,
                          attendanceSubTab: card.attendanceSubTab,
                        })
                      }
                      className={`zg-module-card w-full text-left rounded-xl border overflow-hidden shadow-xs flex flex-col justify-between ${card.color.cardSurface} ${card.color.cardBorder}`}
                    >
                      {/* Franja superior cromática de identidad */}
                      <span aria-hidden="true" className={`block w-full h-1.5 ${card.color.strip}`} />

                      <div className="p-4 sm:p-5 flex flex-col gap-3 flex-1">
                        {/* Cabecera: Icono + Tag + Contador (si aplica) */}
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${card.color.iconBox}`}
                          >
                            <Icon name={card.icon} className="w-5 h-5" />
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${card.color.tagPill}`}
                            >
                              {card.tag}
                            </span>

                            {isDirectoryCard &&
                              (isEntitiesLoading ? (
                                <Skeleton className="h-4 w-16 rounded-full" />
                              ) : (
                                <span className="text-[11px] font-mono font-semibold text-txt-secondary">
                                  {clientsList.length > 0
                                    ? `${clientsList.length} socios`
                                    : 'Sin socios'}
                                </span>
                              ))}
                          </div>
                        </div>

                        {/* Título y descripción concisa */}
                        <div className="flex flex-col gap-1">
                          <h4 className="font-bold text-txt-primary text-sm leading-snug">
                            {card.title}
                          </h4>
                          <p className="text-xs text-txt-secondary leading-relaxed">
                            {card.description}
                          </p>
                        </div>

                        {/* Pie de acción uniforme */}
                        <div
                          className={`mt-auto pt-2 border-t border-border/60 flex items-center justify-between text-xs font-bold ${card.color.ctaText}`}
                        >
                          <span>{card.ctaLabel}</span>
                          <Icon name="arrow-right" className="w-4 h-4 shrink-0" />
                        </div>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === 'directorio' && (
          <section aria-labelledby="recepcion-directorio-heading">
            {renderModuleHeader(
              'recepcion-directorio-heading',
              isAdmin
                ? 'Control de Personas, Empresas, Clientes y Proveedores'
                : 'Directorio (Clientes / Proveedores / Empresas)',
              isAdmin
                ? 'Consulta, gestión y creación de socios con credencial QR, empresas RUC 20 y proveedores.'
                : 'Inscripción y edición de clientes con QR, y registro/consulta de proveedores y empresas RUC 20.',
              'directory',
              'Entidades',
              MODULE_PALETTE.sky
            )}
            <EntityDirectoryView currentSession={session} {...entitiesProps} />
          </section>
        )}

        {activeTab === 'asistencias' && (
          <section aria-labelledby="recepcion-asistencias-heading">
            {renderModuleHeader(
              'recepcion-asistencias-heading',
              'Control de Asistencias, Semáforo y Escáner QR',
              'Validación de acceso en mostrador, alertas de vencimiento, destrabes y prórrogas.',
              'qr',
              'Control de Puerta',
              MODULE_PALETTE.indigo
            )}
            <AttendanceView
              currentSession={session}
              clients={clientsList}
              initialTab={attendanceInitialSubTab}
              onNavigateToPos={(subTab) =>
                openModule('pos', { posSubTab: subTab ?? 'pos' })
              }
            />
          </section>
        )}

        {activeTab === 'pos' && (
          <section aria-labelledby="recepcion-pos-heading">
            {renderModuleHeader(
              'recepcion-pos-heading',
              'Punto de Venta (POS), Turnos y Cuentas por Cobrar',
              'Cobro de membresías y productos, apertura/cierre de caja y amortización de deudores.',
              'pos',
              'Caja & POS',
              MODULE_PALETTE.emerald
            )}
            <PosView currentSession={session} initialTab={posInitialSubTab} />
          </section>
        )}

        {activeTab === 'catalogo' && (
          <section aria-labelledby="recepcion-catalogo-heading">
            {renderModuleHeader(
              'recepcion-catalogo-heading',
              'Catálogo de Planes y Stock de Inventario',
              'Cotiza membresías con el simulador matemático Day Overflow y consulta existencias de productos.',
              'catalog',
              'Planes y Stock',
              MODULE_PALETTE.teal
            )}
            <CatalogView currentSession={session} />
          </section>
        )}

        {isAdmin && activeTab === 'lan' && (
          <section aria-labelledby="recepcion-lan-heading">
            {renderModuleHeader(
              'recepcion-lan-heading',
              'Servidor Wi-Fi Local y Escáner Móvil (LAN)',
              'Vinculación de smartphones por QR, red local :3443 y simulador móvil de semáforo.',
              'wifi',
              'Red Local :3443',
              MODULE_PALETTE.violet
            )}
            <LanServerView currentSession={session} clients={clientsList} />
          </section>
        )}
      </div>
    </div>
  );
};
