// ============================================================================
// COMPONENTE: PANEL OPERATIVO DE RECEPCIÓN (RECEPTION DASHBOARD)
// Vista para Rol RECEPCIONISTA (y accesible para SUPERVISOR / ADMINISTRADOR)
// Conexión con Caja, POS, Catálogo y Directorio de Socios
// Ubicación: src/features/reception/ReceptionDashboard.tsx
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '../../components/primitives/Badge';
import { Icon } from '../../components/primitives/Icon';
import { AuthSession } from '../../types/auth';
import { CatalogView } from '../catalog/CatalogView';
import { EntityDirectoryView, EntityDirectoryViewProps } from '../entities/EntityDirectoryView';
import { PosMainTab, PosView } from '../pos/PosView';

export interface ReceptionDashboardProps {
  session: AuthSession;
  onLockSession: () => void;
  entitiesProps?: Partial<EntityDirectoryViewProps>;
  onNavigateToPos?: (initialSubTab?: PosMainTab) => void;
  onNavigateToAttendance?: () => void;
  onNavigateToLan?: () => void;
}

export const ReceptionDashboard: React.FC<ReceptionDashboardProps> = ({
  session,
  onLockSession,
  entitiesProps,
  onNavigateToPos,
  onNavigateToAttendance,
  onNavigateToLan,
}) => {
  const [activeTab, setActiveTab] = useState<'directorio' | 'catalogo' | 'pos' | 'resumen'>('directorio');
  const [posInitialSubTab, setPosInitialSubTab] = useState<PosMainTab>('pos');

  const handleGoToPos = (subTab: PosMainTab = 'pos') => {
    if (onNavigateToPos) {
      onNavigateToPos(subTab);
    } else {
      setPosInitialSubTab(subTab);
      setActiveTab('pos');
    }
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Banner de Bienvenida Operativa */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-txt-primary">
              ¡Hola, {session.nombre_completo}!
            </h2>
            <Badge variant="success" size="sm">
              Turno Activo
            </Badge>
          </div>
          <p className="text-xs text-txt-secondary">
            Estación operativa ({session.rol}) iniciada el {session.login_at} (Usuario @{session.username})
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onNavigateToLan && (
            <button
              type="button"
              onClick={onNavigateToLan}
              className="text-xs font-bold text-violet-800 dark:text-violet-200 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/50 px-3.5 py-1.5 rounded-lg border border-violet-300 dark:border-violet-800 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Icon name="wifi" className="w-4 h-4" />
              <span>Escáner Móvil LAN</span>
            </button>
          )}

          {onNavigateToAttendance && (
            <button
              type="button"
              onClick={onNavigateToAttendance}
              className="text-xs font-bold text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-3.5 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-800 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Icon name="qr" className="w-4 h-4" />
              <span>Control de Asistencias / Escáner QR</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleGoToPos('pos')}
            className="text-xs font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 px-3.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Icon name="pos" className="w-4 h-4" />
            <span>Ir a Caja / POS</span>
          </button>

          <button
            type="button"
            onClick={onLockSession}
            className="text-xs font-medium text-txt-muted hover:text-txt-primary bg-canvas-subtle hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-md border border-border transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Proteger Estación
          </button>
        </div>
      </div>

      {/* Subnavegación de Recepción */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('directorio')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors ${
            activeTab === 'directorio'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          Directorio de Socios & Clientes (Credenciales QR)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('catalogo')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors ${
            activeTab === 'catalogo'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          Catálogo & Stock (Simulador Day Overflow)
        </button>

        <button
          type="button"
          onClick={() => handleGoToPos('pos')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors ${
            activeTab === 'pos'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          Caja & POS (Turnos y Ventas)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('resumen')}
          className={`text-sm font-semibold px-4 py-2 rounded-md transition-colors ${
            activeTab === 'resumen'
              ? 'bg-surface text-txt-primary shadow-sm border border-border font-bold'
              : 'text-txt-muted hover:text-txt-primary hover:bg-surface/50'
          }`}
        >
          Módulos del Gimnasio
        </button>
      </div>

      {/* Contenido según pestaña */}
      {activeTab === 'directorio' && (
        <section aria-labelledby="recepcion-directorio-heading">
          <div className="mb-4">
            <h3 id="recepcion-directorio-heading" className="text-base font-bold text-txt-primary">
              Control de Socios, Clientes y Credenciales de Acceso
            </h3>
            <p className="text-xs text-txt-muted">
              Consulta inmediata de credenciales QR, contactos de emergencia y evolución de peso corporal.
            </p>
          </div>
          <EntityDirectoryView currentSession={session} {...entitiesProps} />
        </section>
      )}

      {activeTab === 'catalogo' && (
        <section aria-labelledby="recepcion-catalogo-heading">
          <div className="mb-4">
            <h3 id="recepcion-catalogo-heading" className="text-base font-bold text-txt-primary">
              Catálogo de Planes y Stock de Inventario
            </h3>
            <p className="text-xs text-txt-muted">
              Cotiza membresías con el simulador matemático Day Overflow y consulta existencias de productos.
            </p>
          </div>
          <CatalogView currentSession={session} />
        </section>
      )}

      {activeTab === 'pos' && (
        <section aria-labelledby="recepcion-pos-heading">
          <div className="mb-4">
            <h3 id="recepcion-pos-heading" className="text-base font-bold text-txt-primary">
              Punto de Venta (POS) y Turnos de Caja
            </h3>
            <p className="text-xs text-txt-muted">
              Control de caja física y digital, cobro de productos, inscripción de planes y amortización de créditos.
            </p>
          </div>
          <PosView currentSession={session} initialTab={posInitialSubTab} />
        </section>
      )}

      {activeTab === 'resumen' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Acción Rápida: Servidor Wi-Fi Local & Escáner Móvil */}
          {onNavigateToLan && (
            <div
              onClick={onNavigateToLan}
              className="bg-surface border border-border rounded-xl p-5 shadow-xs flex flex-col gap-2 cursor-pointer hover:border-violet-500 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-950/50 text-violet-600 flex items-center justify-center font-bold">
                <Icon name="wifi" className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-txt-primary text-sm">Escáner Móvil Wi-Fi LAN</h4>
              <p className="text-xs text-txt-secondary leading-relaxed">
                Visualización de smartphones vinculados, red local :3443 y simulador móvil de semáforo.
              </p>
            </div>
          )}

          {/* Acción Rápida: Control de Asistencias / Escáner QR */}
          {onNavigateToAttendance && (
            <div
              onClick={onNavigateToAttendance}
              className="bg-surface border border-border rounded-xl p-5 shadow-xs flex flex-col gap-2 cursor-pointer hover:border-indigo-500 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center font-bold">
                <Icon name="qr" className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-txt-primary text-sm">Control de Asistencias / Escáner QR</h4>
              <p className="text-xs text-txt-secondary leading-relaxed">
                Validación de accesos con semáforo inteligente, alerta de vencimientos y prórroga de días.
              </p>
            </div>
          )}

          {/* Acción Rápida: Ir a Caja / POS */}
          <div
            onClick={() => handleGoToPos('pos')}
            className="bg-surface border border-border rounded-xl p-5 shadow-xs flex flex-col gap-2 cursor-pointer hover:border-emerald-500 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center font-bold">
              <Icon name="pos" className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-txt-primary text-sm">Ir a Caja / POS</h4>
            <p className="text-xs text-txt-secondary leading-relaxed">
              Cobro de productos al contado, venta de planes y registro de pagos mixtos (Efectivo/Yape/Plin).
            </p>
          </div>

          {/* Acción Rápida: Abrir/Cerrar Turno */}
          <div
            onClick={() => handleGoToPos('pos')}
            className="bg-surface border border-border rounded-xl p-5 shadow-xs flex flex-col gap-2 cursor-pointer hover:border-amber-500 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center font-bold">
              <Icon name="key" className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-txt-primary text-sm">Abrir/Cerrar Turno</h4>
            <p className="text-xs text-txt-secondary leading-relaxed">
              Asignación de fondo inicial en gaveta, arqueo de billetes y monedas y cierre de estación.
            </p>
          </div>

          {/* Acción Rápida: Cuentas por Cobrar (Deudores) */}
          <div
            onClick={() => handleGoToPos('deudores')}
            className="bg-surface border border-border rounded-xl p-5 shadow-xs flex flex-col gap-2 cursor-pointer hover:border-sky-500 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-950/50 text-sky-600 flex items-center justify-center font-bold">
              <Icon name="credit-card" className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-txt-primary text-sm">Cuentas por Cobrar (Deudores)</h4>
            <p className="text-xs text-txt-secondary leading-relaxed">
              Consulta de socios con saldos pendientes por cuotas o consumos y amortización directa en 1 clic.
            </p>
          </div>

          {/* Catálogo & Precios */}
          <div
            onClick={() => setActiveTab('catalogo')}
            className="bg-surface border border-border rounded-xl p-5 shadow-xs flex flex-col gap-2 cursor-pointer hover:border-brand transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center font-bold">
              <Icon name="catalog" className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-txt-primary text-sm">Catálogo & Precios</h4>
            <p className="text-xs text-txt-secondary leading-relaxed">
              Consulta inmediata de membresías, simulador Day Overflow y disponibilidad de stock en tiempo real.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
