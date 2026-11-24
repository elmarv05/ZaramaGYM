// ============================================================================
// COMPONENTE: FORMULARIO DE INICIO DE SESIÓN CENTRADO FULL-CANVAS (LOGIN FORM)
// Diseño Kinetic Ledger / Kinetic Obsidian con fondo esmeralda-teal completo,
// emblema ZaramaGYM centrado sobre la tarjeta de acceso y Modo Claro/Oscuro
// Ubicación: src/features/auth/LoginForm.tsx
// ============================================================================

import React, { useId, useState } from 'react';
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
  /** Muestra controles de ayuda de desarrollo únicamente en entorno DEV (en producción siempre ocultos). */
  showDevHelpers?: boolean;
}

const CURRENT_APP_VERSION = '0.1.0';

export const LoginForm: React.FC<LoginFormProps> = ({
  onLogin,
  isLoading = false,
  error,
  onClearError,
}) => {
  const { theme, setTheme } = useTheme();
  const headingId = useId();
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
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClearFields();
    }
  };

  return (
    <div className="w-full h-full min-h-dvh relative overflow-hidden flex flex-col text-white zg-login-backdrop bg-gradient-to-br from-[var(--login-bg-from)] via-[var(--login-bg-via)] to-[var(--login-bg-to)] zg-view-enter">
      {/* Textura ambiental ligera en 1 sola capa GPU (se atenúa automáticamente en modo oscuro) */}
      <div
        aria-hidden="true"
        className="zg-login-ambient absolute inset-0 pointer-events-none select-none"
      />

      {/* Sutil emblema de marca de agua centrado sin sobrecarga de 24 nodos <img> */}
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
      >
        <img
          src="/zaramagym-logo.png"
          alt=""
          className="w-[460px] h-[460px] object-contain opacity-[0.06] dark:opacity-[0.035] scale-105"
        />
      </div>

      {/* Capa scrollable que centra el emblema + formulario y respeta pantallas pequeñas */}
      <div className="relative z-10 flex-1 w-full h-full overflow-y-auto overscroll-contain flex flex-col justify-between p-5 sm:p-8 lg:px-12 lg:py-7">
        {/* Barra superior: Área recepción + versión y Selector Claro / Oscuro */}
        <header className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 dark:bg-white/[0.06] border border-white/20 dark:border-white/[0.06] text-xs font-semibold tracking-wide text-white/95">
              <span className="w-2 h-2 rounded-full bg-status-success-border dark:bg-brand animate-pulse" aria-hidden="true" />
              Área recepción
            </span>
            <span className="hidden sm:inline text-white/80 dark:text-white/55 font-mono text-[11px]">
              v{CURRENT_APP_VERSION}
            </span>
          </div>

          <div
            role="group"
            aria-label="Selector de modo de color"
            className="inline-flex items-center p-1 rounded-full bg-surface/95 dark:bg-surface/90 border border-white/25 dark:border-border shadow-md gap-0.5"
          >
            <Button
              type="button"
              variant={theme === 'light' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('light')}
              aria-label="Modo claro"
              aria-pressed={theme === 'light'}
              leftIcon={<Icon name="sun" className="w-3.5 h-3.5" aria-hidden="true" />}
              className={`rounded-full h-7 min-h-0 px-3 py-1 text-xs font-semibold ${
                theme === 'light'
                  ? 'shadow-xs'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              Claro
            </Button>
            <Button
              type="button"
              variant={theme === 'dark' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setTheme('dark')}
              aria-label="Modo oscuro"
              aria-pressed={theme === 'dark'}
              leftIcon={<Icon name="moon" className="w-3.5 h-3.5" aria-hidden="true" />}
              className={`rounded-full h-7 min-h-0 px-3 py-1 text-xs font-semibold ${
                theme === 'dark'
                  ? 'shadow-xs'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              Oscuro
            </Button>
          </div>
        </header>

        {/* Bloque Central: Logo + Título centrados encima de la Tarjeta de Inicio de Sesión */}
        <div className="w-full max-w-[420px] mx-auto my-auto py-4 flex flex-col items-center gap-5">
          {/* Logo y Título encima del formulario */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white/15 dark:bg-white/[0.06] p-2 border border-white/25 dark:border-white/[0.06] shadow-lg flex items-center justify-center ring-4 ring-white/10 dark:ring-brand/10">
              <img
                src="/zaramagym-logo.png"
                alt="Logo ZaramaGYM"
                className="w-full h-full object-contain rounded-full"
              />
            </div>

            <div className="flex flex-col gap-1 max-w-sm">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white drop-shadow-sm">
                ZaramaGYM
              </h1>
              <p className="text-xs sm:text-sm text-white/90 dark:text-white/75 leading-relaxed">
                Fuerza, disciplina y gestión inteligente para tu gimnasio.
              </p>
            </div>
          </div>

          {/* Tarjeta de Inicio de Sesión */}
          <div className="w-full bg-surface text-txt-primary border border-white/25 dark:border-border rounded-2xl p-6 sm:p-7 shadow-lg dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_0_rgba(255,255,255,0.025)] flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h2 id={headingId} className="text-xl sm:text-2xl font-bold tracking-tight text-txt-primary">
                Iniciar Sesión
              </h2>
              <p className="text-xs text-txt-muted">
                Ingresa tus credenciales de operador para acceder al sistema.
              </p>
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
              aria-labelledby={headingId}
              onSubmit={handleSubmit}
              onKeyDown={handleKeyDown}
              className="flex flex-col gap-4"
              noValidate
            >
              <Input
                name="username"
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
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
                leftIcon={<Icon name="user" className="w-4 h-4" />}
                autoFocus
                required
              />

              <Input
                name="password"
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
                enterKeyHint="done"
                leftIcon={<Icon name="lock" className="w-4 h-4" />}
                rightIcon={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label="Mostrar u ocultar contraseña"
                    aria-pressed={showPassword}
                    disabled={isLoading}
                    className="size-7 p-0 text-txt-muted hover:text-txt-primary"
                  >
                    <Icon name={showPassword ? 'eye-off' : 'eye'} className="w-4 h-4" aria-hidden="true" />
                  </Button>
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
        </div>

        {/* Pie de página unificado */}
        <footer className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/90 dark:text-white/70 border-t border-white/15 dark:border-white/[0.06] pt-3.5 shrink-0">
          <span>Max Rios • Consultoría y desarrollo freelance</span>
          <span className="font-semibold text-white dark:text-white/90">Sincronización: 100%</span>
        </footer>
      </div>
    </div>
  );
};
