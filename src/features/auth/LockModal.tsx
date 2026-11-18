// ============================================================================
// COMPONENTE: MODAL REACTIVO DE BLOQUEO DE TURNO (LOCK MODAL)
// Ubicación: src/features/auth/LockModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { AuthSession, AppError } from '../../types/auth';
import { validateUnlockPassword } from '../../domain/auth';
import { Modal } from '../../components/primitives/Modal';
import { Input } from '../../components/primitives/Input';
import { Button } from '../../components/primitives/Button';
import { Alert } from '../../components/primitives/Alert';

export interface LockModalProps {
  session: AuthSession;
  onUnlock: (password: string) => Promise<boolean>;
  onLogout: () => Promise<void>;
  isLoading?: boolean;
  error?: AppError | null;
  onClearError?: () => void;
}

export const LockModal: React.FC<LockModalProps> = ({
  session,
  onUnlock,
  onLogout,
  isLoading = false,
  error,
  onClearError,
}) => {
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onClearError) onClearError();

    const validation = validateUnlockPassword(password);
    if (!validation.isValid) {
      setFieldError(validation.errors.password || 'Contraseña requerida');
      return;
    }

    setFieldError('');
    const success = await onUnlock(password);
    if (success) {
      setPassword('');
    }
  };

  return (
    <Modal
      isOpen={session.is_locked}
      preventClose={true}
      title="Turno de Operación Bloqueado"
      description="Tu estación de trabajo está protegida para preservar la integridad operativa."
      size="md"
    >
      <div className="flex flex-col gap-5">
        {/* Ficha de Operador */}
        <div className="flex items-center gap-3.5 p-3.5 bg-canvas-subtle border border-border rounded-lg">
          <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-txt-primary">
            {session.nombre_completo.charAt(0)}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-txt-primary">
              {session.nombre_completo}
            </span>
            <span className="text-xs text-txt-muted font-mono">
              @{session.username} • Rol {session.rol}
            </span>
          </div>
        </div>

        {error && (
          <Alert variant="danger" title="No se pudo desbloquear">
            {error.code === 'Unauthorized'
              ? 'La contraseña ingresada es incorrecta. Inténtalo de nuevo.'
              : error.message}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Ingresa tu contraseña para continuar"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldError) setFieldError('');
              if (onClearError) onClearError();
            }}
            error={fieldError}
            disabled={isLoading}
            autoFocus
            required
          />

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
              disabled={isLoading}
              className="w-full"
            >
              Desbloquear Turno
            </Button>

            <button
              type="button"
              onClick={onLogout}
              disabled={isLoading}
              className="text-xs text-txt-muted hover:text-txt-primary underline text-center py-1 transition-colors"
            >
              ¿Cambio de turno? Cerrar sesión actual
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
