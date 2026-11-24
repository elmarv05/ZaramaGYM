// ============================================================================
// COMPONENTE: TARJETA VISUAL DEL SEMÁFORO INTELIGENTE (TRAFFIC LIGHT CARD)
// Estados: Standby (En espera), Verde (Acceso), Amarillo (Alerta), Rojo (Bloqueo)
// Ubicación: src/features/attendance/TrafficLightCard.tsx
// ============================================================================

import React from 'react';
import { Button, Card, Icon } from '../../components/primitives';
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
      <Card
        data-testid="traffic-light-standby"
        className="w-full border-2 border-dashed rounded-2xl p-10 items-center justify-center text-center gap-4"
      >
        <div
          aria-hidden="true"
          className="w-20 h-20 rounded-full bg-canvas-subtle flex items-center justify-center text-txt-muted shadow-inner border border-border"
        >
          <Icon name="activity" className="w-9 h-9" />
        </div>
        <div className="max-w-md flex flex-col gap-1">
          <h3 className="text-lg font-bold text-txt-primary">
            Listo para escanear credencial QR o buscar socio por DNI
          </h3>
          <p className="text-xs text-txt-muted leading-relaxed">
            Escanee la credencial QR desde el smartphone Wi-Fi, cámara web o use el ingreso manual.
            El semáforo inteligente validará vigencia, anti-rebote y estado financiero en tiempo
            real.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-txt-secondary bg-canvas px-3 py-1.5 rounded-full border border-border">
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full bg-status-success animate-ping motion-reduce:animate-none"
          />
          <span>Conexión Establecida</span>
        </div>
      </Card>
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

  // 2. CONFIGURACIÓN VISUAL POR COLOR DE SEMÁFORO (100% Design Tokens)
  const colorStyles = {
    VERDE: {
      cardBg: 'bg-status-success-bg/70 border-status-success text-txt-primary',
      headerBg: 'bg-status-success text-white',
      badgeText: 'ACCESO PERMITIDO — MEMBRESÍA ACTIVA',
      dotClass: 'bg-white',
      statusBadgeBg: 'bg-status-success text-white',
    },
    AMARILLO: {
      cardBg: 'bg-status-warning-bg/70 border-status-warning text-txt-primary',
      headerBg: 'bg-status-warning text-white font-black',
      badgeText: 'INGRESO PERMITIDO CON ALERTA PREVENTIVA',
      dotClass: 'bg-white',
      statusBadgeBg: 'bg-status-warning text-white font-bold',
    },
    ROJO: {
      cardBg: 'bg-status-danger-bg/70 border-status-danger text-txt-primary',
      headerBg: 'bg-status-danger text-white',
      badgeText: 'ACCESO DENEGADO — MEMBRESÍA VENCIDA O INEXISTENTE',
      dotClass: 'bg-white',
      statusBadgeBg: 'bg-status-danger text-white',
    },
  }[colorSemaforo];

  return (
    <article
      data-testid={`traffic-light-card-${colorSemaforo.toLowerCase()}`}
      className={`w-full border-2 rounded-2xl overflow-hidden shadow-md flex flex-col transition-all ${colorStyles.cardBg}`}
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          title="Limpiar semáforo y volver a standby"
          leftIcon={<Icon name="x" className="w-3.5 h-3.5" />}
          className="text-white hover:text-white bg-black/20 hover:bg-black/30 min-h-[28px] px-2.5 py-1"
        >
          Limpiar
        </Button>
      </div>

      {/* Alerta Anti-Rebote destacada si aplica */}
      {esRebote && (
        <div
          data-testid="anti-rebote-badge"
          className="bg-accent-indigo text-white text-xs font-bold px-6 py-2 flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-2">
            <Icon name="clock" className="w-4 h-4 shrink-0" aria-hidden="true" />
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
                className="w-20 h-20 rounded-2xl object-cover border-2 border-surface shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-surface border border-border flex items-center justify-center font-black text-2xl text-txt-secondary shadow-sm">
                {nombreCompleto.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div
              aria-hidden="true"
              className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-xs ${colorStyles.statusBadgeBg}`}
            >
              <Icon
                name={
                  colorSemaforo === 'VERDE'
                    ? 'check'
                    : colorSemaforo === 'AMARILLO'
                    ? 'warning'
                    : 'x'
                }
                className="w-3.5 h-3.5"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-black tracking-tight text-txt-primary">{nombreCompleto}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-txt-secondary">
              <span className="font-semibold text-txt-primary">
                {tipoDocumento}: {numeroDocumento}
              </span>
              <span aria-hidden="true">•</span>
              <span>Canal: {formatAttendanceMode(modoIngreso)}</span>
              <span aria-hidden="true">•</span>
              <span>Hora: {fechaHoraIngreso || 'Ahora'}</span>
            </div>
            {creditoGeneradoId && (
              <span className="text-[11px] font-bold text-status-danger inline-flex items-center gap-1">
                <Icon name="warning" className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
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
              {diasRestantes === 0
                ? 'Vence hoy'
                : diasRestantes && diasRestantes < 0
                ? 'Vencida'
                : 'Vigente'}
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onNavigateToPos(deudaNum > 0 ? 'deudores' : 'pos')}
              leftIcon={<Icon name="pos" className="w-4 h-4" />}
              className="bg-status-warning text-white hover:opacity-90 border-transparent"
            >
              Ir a Caja / Cobrar Deuda o Renovar
            </Button>
          )}

          {/* ACCIONES OBLIGATORIAS PARA SEMÁFORO ROJO (Bloqueo en Puerta) */}
          {colorSemaforo === 'ROJO' && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid="btn-reject-red-pass"
                onClick={() => {
                  if (onNavigateToPos) {
                    onNavigateToPos('pos');
                  } else {
                    onClear();
                  }
                }}
                leftIcon={<Icon name="x" className="w-4 h-4 text-status-danger" />}
              >
                Rechazar (Enviar a Caja / POS)
              </Button>

              {onAuthorizeRedPass && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  data-testid="btn-authorize-red-pass"
                  disabled={isActionLoading}
                  onClick={() => onAuthorizeRedPass(evaluation)}
                  leftIcon={<Icon name="receipt" className="w-4 h-4" />}
                >
                  Autorizar Pase Diario a Crédito (S/ 10.00)
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
};
