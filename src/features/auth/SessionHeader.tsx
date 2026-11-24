// ============================================================================
// COMPONENTE: BARRA SUPERIOR DE SESIÓN Y CONTROL GLOBAL (SESSION HEADER)
// Ubicación: src/features/auth/SessionHeader.tsx
// ============================================================================

import React, { useRef, useState } from 'react';
import { AuthSession } from '../../types/auth';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Separator } from '../../components/primitives/Separator';
import { fileToDataUrl } from '../../domain/user';
import { userIpc } from '../../services/ipc/userIpc';

export interface SessionHeaderProps {
  session: AuthSession;
  onLockSession: () => void;
  onLogout: () => void;
  onChangePasswordClick: () => void;
  onPhotoUpdated?: (newPhotoUrl: string) => void;
  isActionLoading?: boolean;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({
  session,
  onLockSession,
  onLogout,
  onChangePasswordClick,
  onPhotoUpdated,
  isActionLoading = false,
}) => {
  const isAdmin = session.rol === 'ADMINISTRADOR';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(
    session.foto_perfil_data_url || null
  );

  const getInitials = (name: string): string => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleAvatarClick = () => {
    if (!isUploadingPhoto && !isActionLoading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingPhoto(true);
      const dataUrl = await fileToDataUrl(file);
      await userIpc.updateUserPhoto(session.user_id, dataUrl);
      setCurrentPhoto(dataUrl);
      if (onPhotoUpdated) {
        onPhotoUpdated(dataUrl);
      }
    } catch (err) {
      console.error('Error al subir la foto de perfil:', err);
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <header className="w-full bg-surface border-b border-border px-6 py-3 flex items-center justify-between select-none shadow-sm sticky top-0 z-20">
      {/* Marca / Logotipo */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand text-brand-text flex items-center justify-center font-black text-sm tracking-wider shadow-sm">
          ZG
        </div>
        <div>
          <h1 className="text-base font-bold text-txt-primary leading-tight">
            ZaramaGYM
          </h1>
          <p className="text-[11px] text-txt-muted leading-none">
            Control de Acceso y Gestión Operativa
          </p>
        </div>
      </div>

      {/* Datos del Usuario y Acciones Rápidas */}
      <div className="flex items-center gap-4">
        {/* Identidad del Operador con Avatar */}
        <div className="flex items-center gap-3">
          {/* Avatar Circular con Selector de Archivo */}
          <div className="relative group">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleAvatarClick}
              disabled={isUploadingPhoto || isActionLoading}
              title="Haz clic para cambiar tu foto de perfil"
              className="w-10 h-10 min-h-0 min-w-0 p-0 rounded-full border-2 border-border overflow-hidden bg-canvas-subtle hover:border-brand hover:bg-canvas-subtle shadow-xs relative"
              aria-label="Cambiar foto de perfil"
            >
              {isUploadingPhoto ? (
                <div className="w-full h-full bg-white/40 dark:bg-white/20 animate-pulse absolute inset-0" aria-hidden="true" />
              ) : currentPhoto ? (
                <img
                  src={currentPhoto}
                  alt={session.nombre_completo}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-txt-secondary">
                  {getInitials(session.nombre_completo)}
                </span>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>

          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-txt-primary">
                {session.nombre_completo}
              </span>
              <Badge
                variant={isAdmin ? 'default' : 'info'}
                size="sm"
              >
                {session.rol}
              </Badge>
            </div>
            <span className="text-xs text-txt-muted font-mono">
              @{session.username}
            </span>
          </div>
        </div>

        {/* Separador vertical */}
        <Separator orientation="vertical" className="h-7 mx-1" />

        {/* Botones de Operación de Sesión */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onChangePasswordClick}
            disabled={isActionLoading}
            title="Cambiar contraseña de acceso"
          >
            Cambiar Clave
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={onLockSession}
            disabled={isActionLoading}
            leftIcon={
              <svg className="w-4 h-4 text-txt-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            }
          >
            Bloquear Turno
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            disabled={isActionLoading}
            className="text-status-danger hover:bg-status-danger-bg hover:text-status-danger"
            leftIcon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            }
          >
            Cerrar Sesión
          </Button>
        </div>
      </div>
    </header>
  );
};
