// ============================================================================
// COMPONENTE: FORMULARIO DE INICIO DE SESIÓN SPLIT-SCREEN (LOGIN FORM)
// Diseño Kinetic Ledger / Kinetic Obsidian con emblema ZaramaGYM y Modo Claro/Oscuro
// Ubicación: src/features/auth/LoginForm.tsx
// ============================================================================

import React, { useState } from 'react';
import { validateLoginCredentials } from '../../domain/auth';
import { AppError, LoginCredentials } from '../../types/auth';
import { useTheme } from '../../hooks/useTheme';
import { Alert } from '../../components/primitives/Alert';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';

export interface LoginFormProps {
  onLogin: (credentials: LoginCredentials) => Promise<boolean>;
  isLoading?: boolean;
  error?: AppError | null;
  onClearError?: () => void;
}

const WATERMARK_CELLS = Array.from({ length: 16 });

export const LoginForm: React.FC<LoginFormProps> = ({
  onLogin,
  isLoading = false,
  error,
  onClearError,
}) => {
  const { theme, setTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onClearError) onClearError();

    const credentials: LoginCredentials = { username, password };
    const validation = validateLoginCredentials(credentials);

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    await onLogin(credentials);
  };

  const handleClearFields = () => {
    if (isLoading) return;
    setUsername('');
    setPassword('');
    setFieldErrors({});
    if (onClearError) onClearError();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClearFields();
    }
  };

  const fillQuickTestCredentials = () => {
    setUsername('admin');
    setPassword('admin123');
    setFieldErrors({});
    if (onClearError) onClearError();
  };

  return (
    <div className="w-full h-full min-h-dvh flex bg-surface overflow-hidden zg-view-enter">
      {/* Panel Izquierdo: Identidad Visual Esmeralda-Teal (50%) */}
      <div className="hidden md:flex md:w-1/2 h-full relative overflow-hidden flex-col justify-between p-8 lg:p-12 text-white bg-gradient-to-br from-[#05AD52] via-[#047857] to-[#0D9488]">
        {/* Patrón de marca de agua 4x4 */}
        <div
          aria-hidden="true"
          className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-6 p-6 opacity-[0.08] pointer-events-none select-none rotate-[-12deg] scale-110"
        >
          {WATERMARK_CELLS.map((_, index) => (
            <div key={index} className="flex items-center justify-center">
              <img
                src="/zaramagym-logo.png"
                alt=""
                className="w-16 h-16 object-contain"
              />
            </div>
          ))}
        </div>

        {/* Barra superior */}
        <div className="relative z-10 flex items-center justify-between gap-3 text-xs">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" aria-hidden="true" />
            Area recepción
          </span>
          <span className="text-white/80 font-mono text-[11px]">
            App Version 1.0.0
          </span>
        </div>

        {/* Emblema Central */}
        <div className="relative z-10 flex flex-col items-center text-center gap-4 my-auto py-8">
          <div className="w-28 h-28 rounded-full bg-white/10 backdrop-blur-md p-2 border border-white/25 shadow-xl flex items-center justify-center">
            <img
              src="/zaramagym-logo.png"
              alt="Logo ZaramaGYM"
              className="w-full h-full object-contain rounded-full"
            />
          </div>

          <div className="flex flex-col gap-1.5 max-w-sm">
            <h1 className="text-3xl font-black tracking-tight">ZaramaGYM</h1>
            <p className="text-sm text-white/90 leading-relaxed">
              Fuerza, disciplina y gestión inteligente para tu gimnasio.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-xs font-medium">
              <Icon name="database" className="w-3.5 h-3.5" />
              Gestión de datos Integrada
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-xs font-medium">
              <Icon name="qr" className="w-3.5 h-3.5" />
              Terminal QR conectada
            </span>
          </div>
        </div>

        {/* Pie izquierdo */}
        <div className="relative z-10 flex items-center justify-between text-[11px] text-white/80 border-t border-white/15 pt-4">
          <span>Max Rios • Consultoría y desarrollo freelance</span>
          <span className="font-semibold text-white">Sincronización: 100%</span>
        </div>
      </div>

      {/* Panel Derecho: Tarjeta de Acceso y Selector de Tema (50%) */}
      <div className="w-full md:w-1/2 h-full overflow-y-auto overscroll-contain p-6 sm:p-10 flex flex-col justify-between bg-canvas relative">
        {/* Esquina superior derecha: Selector Claro / Oscuro */}
        <div className="flex items-center justify-between md:justify-end gap-3 mb-4 shrink-0">
          <div className="flex items-center gap-2 md:hidden">
            <img
              src="/zaramagym-logo.png"
              alt="ZaramaGYM"
              className="w-8 h-8 rounded-full object-contain"
            />
            <span className="font-bold text-sm text-txt-primary">ZaramaGYM</span>
          </div>

          <div
            role="group"
            aria-label="Selector de modo de color"
            className="inline-flex items-center p-1 rounded-full bg-surface border border-border shadow-sm"
          >
            <button
              type="button"
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                theme === 'light'
                  ? 'bg-brand text-brand-text shadow-xs'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              <Icon name="sun" className="w-3.5 h-3.5" />
              <span>I</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                theme === 'dark'
                  ? 'bg-brand text-brand-text shadow-xs'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              <Icon name="moon" className="w-3.5 h-3.5" />
              <span>O</span>
            </button>
          </div>
        </div>

        {/* Tarjeta Central de Inicio de Sesión */}
        <div className="w-full max-w-md mx-auto my-auto bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-md flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-status-success-bg text-status-success text-[11px] font-semibold border border-status-success/20 w-fit">
                <span className="w-2 h-2 rounded-full bg-status-success" aria-hidden="true" />
                Estado: Desarrollo
              </span>

              <button
                type="button"
                onClick={fillQuickTestCredentials}
                disabled={isLoading}
                aria-label="Autocompletar Admin"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-canvas-subtle hover:bg-surface-hover border border-border text-[11px] font-semibold text-txt-secondary hover:text-txt-primary transition-colors disabled:opacity-50"
              >
                <Icon name="key" className="w-3 h-3 text-brand" />
                <span>Autocompletar Admin</span>
              </button>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-txt-primary">
                Iniciar Sesión
              </h2>
              <p className="text-xs text-txt-muted mt-0.5">
                Bienvenido de nuevo al sistema
              </p>
            </div>
          </div>

          {error && (
            <Alert
              variant="danger"
              title="No se pudo iniciar sesión"
              onClose={onClearError}
            >
              {error.code === 'Unauthorized'
                ? 'Usuario o contraseña incorrectos. Verifica tus credenciales o consulta con el Administrador.'
                : error.code === 'Validation'
                ? error.message
                : `Error del sistema (${error.code}): ${error.message}`}
            </Alert>
          )}

          <form
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            className="flex flex-col gap-4"
            noValidate
          >
            <Input
              label="Usuario del Sistema"
              placeholder="Ej: admin o recepcion"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) {
                  setFieldErrors((prev) => ({ ...prev, username: '' }));
                }
              }}
              error={fieldErrors.username}
              disabled={isLoading}
              autoComplete="username"
              leftIcon={<Icon name="user" className="w-4 h-4" />}
              autoFocus
              required
            />

            <Input
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: '' }));
                }
              }}
              error={fieldErrors.password}
              disabled={isLoading}
              autoComplete="current-password"
              leftIcon={<Icon name="lock" className="w-4 h-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label="Mostrar u ocultar contraseña"
                  aria-pressed={showPassword}
                  disabled={isLoading}
                  className="p-1 rounded text-txt-muted hover:text-txt-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} className="w-4 h-4" />
                </button>
              }
              required
            />

            <div className="pt-1">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full font-bold"
                isLoading={isLoading}
                disabled={isLoading}
              >
                Iniciar Sesión
              </Button>
            </div>
          </form>
        </div>

        {/* Indicadores de teclado inferiores */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-txt-muted">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] text-txt-primary shadow-xs">
              Enter
            </kbd>
            para ingresar
          </span>
          <span aria-hidden="true">•</span>
          <span className="inline-flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] text-txt-primary shadow-xs">
              Esc
            </kbd>
            para limpiar
          </span>
        </div>
      </div>
    </div>
  );
};
