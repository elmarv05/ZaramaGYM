// ============================================================================
// COMPONENTE: MODAL DE CAMBIO DE CONTRASEÑA PROPIA (CHANGE PASSWORD MODAL)
// Ubicación: src/features/auth/ChangePasswordModal.tsx
// ============================================================================

import React, { useState } from 'react';
import { validateChangePassword } from '../../domain/auth';
import { AppError } from '../../types/auth';
import { Modal } from '../../components/primitives/Modal';
import { Input } from '../../components/primitives/Input';
import { Button } from '../../components/primitives/Button';
import { Alert } from '../../components/primitives/Alert';
import { preventEnterKeySubmit } from '../../utils/formSafety';

export interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  isLoading?: boolean;
  error?: AppError | null;
  onClearError?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  onChangePassword,
  isLoading = false,
  error,
  onClearError,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setSuccessMessage(null);
    if (onClearError) onClearError();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onClearError) onClearError();
    setSuccessMessage(null);

    const validation = validateChangePassword({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    const ok = await onChangePassword(currentPassword, newPassword);
    if (ok) {
      setSuccessMessage('¡Tu contraseña ha sido actualizada con éxito!');
      setTimeout(() => {
        handleClose();
      }, 1500);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Cambiar Contraseña de Acceso"
      description="Por seguridad, tu nueva contraseña debe tener al menos 6 caracteres."
      size="md"
    >
      <div className="flex flex-col gap-4">
        {successMessage && (
          <Alert variant="success" title="Actualización exitosa">
            {successMessage}
          </Alert>
        )}

        {error && (
          <Alert variant="danger" title="Error al actualizar contraseña">
            {error.code === 'Unauthorized'
              ? 'La contraseña actual ingresada es incorrecta.'
              : error.message}
          </Alert>
        )}

        <form
          noValidate
          onSubmit={handleSubmit}
          onKeyDown={preventEnterKeySubmit}
          className="flex flex-col gap-3.5"
        >
          <Input
            label="Contraseña Actual"
            type="password"
            placeholder="••••••••"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              if (fieldErrors.currentPassword) {
                setFieldErrors((prev) => ({ ...prev, currentPassword: '' }));
              }
            }}
            error={fieldErrors.currentPassword}
            disabled={isLoading || Boolean(successMessage)}
            autoFocus
            required
          />

          <Input
            label="Nueva Contraseña"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (fieldErrors.newPassword) {
                setFieldErrors((prev) => ({ ...prev, newPassword: '' }));
              }
            }}
            error={fieldErrors.newPassword}
            disabled={isLoading || Boolean(successMessage)}
            required
          />

          <Input
            label="Confirmar Nueva Contraseña"
            type="password"
            placeholder="Repite la nueva contraseña"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (fieldErrors.confirmPassword) {
                setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
              }
            }}
            error={fieldErrors.confirmPassword}
            disabled={isLoading || Boolean(successMessage)}
            required
          />

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border mt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              disabled={isLoading || Boolean(successMessage)}
            >
              Guardar Contraseña
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
