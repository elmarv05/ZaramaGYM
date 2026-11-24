// ============================================================================
// COMPONENTE: TARJETA VISUAL DEL SEMÁFORO INTELIGENTE (TRAFFIC LIGHT CARD)
// Estados: Standby (En espera), Verde (Acceso), Amarillo (Alerta), Rojo (Bloqueo)
// Ubicación: src/features/attendance/TrafficLightCard.tsx
// ============================================================================

import React from 'react';
import { Icon } from '../../components/primitives/Icon';
import { formatAttendanceMode } from '../../domain/attendance';
import { CheckInEvaluationDto } from '../../types/attendance';

export interface TrafficLightCardProps {
  evaluation: CheckInEvaluationDto | null;
  onClear: () => void;
  onAuthorizeRedPass?: (evaluation: CheckInEvaluationDto) => void;
  onNavigateToPos?: (subTab?: 'pos' | 'deudores') => void;
  isActionLoading?: boolean;
}

export const TrafficLightCard: React.FC<TrafficLightCardProps> = ({
  evaluation,
  onClear,
  onAuthorizeRedPass,
  onNavigateToPos,
  isActionLoading = false,
}) => {
  // 1. ESTADO STANDBY / EN ESPERA DE LECTURA
  if (!evaluation) {
    return (
      <div
        data-testid="traffic-light-standby"
        className="w-full bg-surface border-2 border-dashed border-border rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 transition-all"
      >
        <div className="w-20 h-20 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted shadow-inner border border-border">
          <Icon name="activity" className="w-9 h-9" />
        </div>
        <div className="max-w-md flex flex-col gap-1">
          <h3 className="text-lg font-bold text-txt-primary">
            Listo para escanear credencial QR o buscar socio por DNI
          </h3>
          <p className="text-xs text-txt-muted leading-relaxed">
            Escanee la credencial QR desde el smartphone Wi-Fi, cámara web o use el ingreso manual. El semáforo inteligente validará vigencia, anti-rebote y estado financiero en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-txt-secondary bg-canvas px-3 py-1.5 rounded-full border border-border">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Conexión Establecida</span>
        </div>
      </div>
    );
  }

  const {
    colorSemaforo,
    nombreCompleto,
    tipoDocumento,
    numeroDocumento,
    fotoPerfilDataUrl,
    nombrePlan,
    fechaVencimiento,
    diasRestantes,
    deudaTotalPendiente,
    motivoSemaforo,
    esRebote,
    modoIngreso,
    fechaHoraIngreso,
    creditoGeneradoId,
  } = evaluation;

  const deudaNum = parseFloat(deudaTotalPendiente) || 0;

  // 2. CONFIGURACIÓN VISUAL POR COLOR DE SEMÁFORO
  const colorStyles = {
    VERDE: {
      cardBg: 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/80 text-emerald-900 dark:text-emerald-100',
      headerBg: 'bg-emerald-600 text-white',
      badgeVariant: 'success' as const,
      badgeText: 'ACCESO PERMITIDO — MEMBRESÍA ACTIVA',
      dotClass: 'bg-status-success ring-2 ring-white/80',
      accentBorder: 'border-emerald-500',
    },
    AMARILLO: {
      cardBg: 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-500/80 text-amber-950 dark:text-amber-100',
      headerBg: 'bg-amber-500 text-slate-900 font-black',
      badgeVariant: 'warning' as const,
      badgeText: 'INGRESO PERMITIDO CON ALERTA PREVENTIVA',
      dotClass: 'bg-status-warning ring-2 ring-slate-900/30',
      accentBorder: 'border-amber-500',
    },
    ROJO: {
      cardBg: 'bg-rose-50/70 dark:bg-rose-950/25 border-rose-500/80 text-rose-950 dark:text-rose-100',
      headerBg: 'bg-rose-600 text-white',
      badgeVariant: 'danger' as const,
      badgeText: 'ACCESO DENEGADO — MEMBRESÍA VENCIDA O INEXISTENTE',
      dotClass: 'bg-status-danger ring-2 ring-white/80',
      accentBorder: 'border-rose-500',
    },
  }[colorSemaforo];

  return (
    <article
      data-testid={`traffic-light-card-${colorSemaforo.toLowerCase()}`}
      className={`w-full border-2 rounded-2xl overflow-hidden shadow-md flex flex-col transition-all ${colorStyles.cardBg} ${colorStyles.accentBorder}`}
    >
      {/* Barra de Título del Semáforo */}
      <div className={`px-6 py-3 flex items-center justify-between ${colorStyles.headerBg}`}>
        <div className="flex items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorStyles.dotClass}`}
            aria-hidden="true"
          />
          <span className="text-sm font-extrabold uppercase tracking-wide">
            {colorStyles.badgeText}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          title="Limpiar semáforo y volver a standby"
          className="text-xs font-semibold px-2.5 py-1 rounded bg-black/20 hover:bg-black/30 transition-colors inline-flex items-center gap-1"
        >
          <Icon name="x" className="w-3.5 h-3.5" />
          <span>Limpiar</span>
        </button>
      </div>

      {/* Alerta Anti-Rebote destacada si aplica */}
      {esRebote && (
        <div
          data-testid="anti-rebote-badge"
          className="bg-indigo-600 text-white text-xs font-bold px-6 py-2 flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-2">
            <Icon name="clock" className="w-4 h-4 shrink-0" />
            <span>Lectura dentro de ventana anti-rebote (3 min) — No duplicada en registros</span>
          </div>
          <span className="text-[11px] font-normal opacity-90">Ingreso ya validado previamente</span>
        </div>
      )}

      {/* Cuerpo Principal del Semáforo */}
      <div className="p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Identidad del Socio */}
        <div className="flex items-center gap-5">
          <div className="relative">
            {fotoPerfilDataUrl ? (
              <img
                src={fotoPerfilDataUrl}
                alt={nombreCompleto}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-white shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-surface border border-border flex items-center justify-center font-black text-2xl text-txt-secondary shadow-sm">
                {nombreCompleto.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div
              className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-xs ${
                colorSemaforo === 'VERDE'
                  ? 'bg-emerald-500 text-white'
                  : colorSemaforo === 'AMARILLO'
                  ? 'bg-amber-400 text-slate-900 font-bold'
                  : 'bg-rose-600 text-white'
              }`}
            >
              <Icon
                name={colorSemaforo === 'VERDE' ? 'check' : colorSemaforo === 'AMARILLO' ? 'warning' : 'x'}
                className="w-3.5 h-3.5"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-black tracking-tight">{nombreCompleto}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-txt-secondary">
              <span className="font-semibold text-txt-primary">
                {tipoDocumento}: {numeroDocumento}
              </span>
              <span>•</span>
              <span>Canal: {formatAttendanceMode(modoIngreso)}</span>
              <span>•</span>
              <span>Hora: {fechaHoraIngreso || 'Ahora'}</span>
            </div>
            {creditoGeneradoId && (
              <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 inline-flex items-center gap-1">
                <Icon name="warning" className="w-3.5 h-3.5 shrink-0" />
                <span>Pase concedido a crédito (ID Crédito: #{creditoGeneradoId})</span>
              </span>
            )}
          </div>
        </div>

        {/* Datos de Membresía y Finanzas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto">
          <div className="bg-surface/90 border border-border p-3 rounded-xl flex flex-col">
            <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
              Plan Vigente
            </span>
            <span className="text-sm font-extrabold text-txt-primary truncate">
              {nombrePlan || 'Sin Membresía'}
            </span>
            <span className="text-[11px] text-txt-secondary truncate">
              {fechaVencimiento ? `Vence: ${fechaVencimiento.split(' ')[0]}` : 'N/A'}
            </span>
          </div>

          <div className="bg-surface/90 border border-border p-3 rounded-xl flex flex-col">
            <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
              Días Restantes
            </span>
            <span
              className={`text-sm font-black ${
                diasRestantes === null || diasRestantes < 0
                  ? 'text-status-danger'
                  : diasRestantes <= 5
                  ? 'text-status-warning'
                  : 'text-status-success'
              }`}
            >
              {diasRestantes !== null ? `${diasRestantes} día(s)` : '0 días'}
            </span>
            <span className="text-[11px] text-txt-secondary">
              {diasRestantes === 0 ? 'Vence hoy' : diasRestantes && diasRestantes < 0 ? 'Vencida' : 'Vigente'}
            </span>
          </div>

          <div className="bg-surface/90 border border-border p-3 rounded-xl flex flex-col col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-txt-muted tracking-wider">
              Deuda Pendiente
            </span>
            <span
              className={`text-sm font-black ${
                deudaNum > 0 ? 'text-status-danger' : 'text-status-success'
              }`}
            >
              S/ {deudaNum.toFixed(2)}
            </span>
            <span className="text-[11px] text-txt-secondary">
              {deudaNum > 0 ? 'Saldo deudor en mora' : 'Al día (Cero Deuda)'}
            </span>
          </div>
        </div>
      </div>

      {/* Motivo Detallado y Acciones Obligatorias */}
      <div className="px-6 py-4 bg-surface/60 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-txt-muted uppercase">Motivo:</span>
          <span className="text-xs font-semibold text-txt-primary">{motivoSemaforo}</span>
        </div>

        {/* ACCIONES OBLIGATORIAS SEGÚN COLOR */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {/* Botón para Semáforo AMARILLO: Ir a Caja */}
          {colorSemaforo === 'AMARILLO' && onNavigateToPos && (
            <button
              type="button"
              onClick={() => onNavigateToPos(deudaNum > 0 ? 'deudores' : 'pos')}
              className="text-xs font-bold px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 transition-colors shadow-xs flex items-center gap-1.5"
            >
              <Icon name="pos" className="w-4 h-4" />
              <span>Ir a Caja / Cobrar Deuda o Renovar</span>
            </button>
          )}

          {/* ACCIONES OBLIGATORIAS PARA SEMÁFORO ROJO (Bloqueo en Puerta) */}
          {colorSemaforo === 'ROJO' && (
            <>
              {/* Acción 1: Rechazar y enviar a caja */}
              <button
                type="button"
                data-testid="btn-reject-red-pass"
                onClick={() => {
                  if (onNavigateToPos) {
                    onNavigateToPos('pos');
                  } else {
                    onClear();
                  }
                }}
                className="text-xs font-bold px-3.5 py-2 rounded-lg bg-canvas border border-border hover:bg-slate-200 dark:hover:bg-slate-700 text-txt-primary transition-colors flex items-center gap-1.5"
              >
                <Icon name="x" className="w-4 h-4 text-status-danger" />
                <span>Rechazar (Enviar a Caja / POS)</span>
              </button>

              {/* Acción 2: Autorizar Pase Diario a Crédito */}
              {onAuthorizeRedPass && (
                <button
                  type="button"
                  data-testid="btn-authorize-red-pass"
                  disabled={isActionLoading}
                  onClick={() => onAuthorizeRedPass(evaluation)}
                  className="text-xs font-black px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Icon name="receipt" className="w-4 h-4" />
                  <span>Autorizar Pase Diario a Crédito (S/ 10.00)</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
};
