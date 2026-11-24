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
import { CURRENT_APP_VERSION } from '../../services/updater/appUpdater';

export interface LoginFormProps {
  onLogin: (credentials: LoginCredentials) => Promise<boolean>;
  isLoading?: boolean;
  error?: AppError | null;
  onClearError?: () => void;
  /** Muestra controles de ayuda de desarrollo únicamente en entorno DEV (en producción siempre ocultos). */
  showDevHelpers?: boolean;
}

const WATERMARK_CELLS = Array.from({ length: 24 });

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
    <div className="w-full h-full min-h-dvh relative overflow-hidden flex flex-col text-white bg-gradient-to-br from-[#05AD52] via-[#047857] to-[#0D9488] zg-view-enter">
      {/* Patrón de marca de agua en todo el fondo */}
      <div
        aria-hidden="true"
        className="absolute inset-0 grid grid-cols-4 sm:grid-cols-6 grid-rows-4 gap-6 p-6 opacity-[0.08] pointer-events-none select-none rotate-[-12deg] scale-110"
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

      {/* Capa scrollable que centra el emblema + formulario y respeta pantallas pequeñas */}
      <div className="relative z-10 flex-1 w-full h-full overflow-y-auto overscroll-contain flex flex-col justify-between p-5 sm:p-8 lg:px-12 lg:py-7">
        {/* Barra superior: Área recepción + versión y Selector Claro / Oscuro */}
        <header className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-xs font-semibold tracking-wide text-white">
              <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" aria-hidden="true" />
              Área recepción
            </span>
            <span className="hidden sm:inline text-white/85 font-mono text-[11px]">
              v{CURRENT_APP_VERSION}
            </span>
          </div>

          <div
            role="group"
            aria-label="Selector de modo de color"
            className="inline-flex items-center p-1 rounded-full bg-surface/95 backdrop-blur-md border border-white/25 dark:border-border shadow-md"
          >
            <button
              type="button"
              onClick={() => setTheme('light')}
              aria-label="Modo claro"
              aria-pressed={theme === 'light'}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                theme === 'light'
                  ? 'bg-brand text-brand-text shadow-xs'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              <Icon name="sun" className="w-3.5 h-3.5" />
              <span>Claro</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              aria-label="Modo oscuro"
              aria-pressed={theme === 'dark'}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                theme === 'dark'
                  ? 'bg-brand text-brand-text shadow-xs'
                  : 'text-txt-secondary hover:text-txt-primary'
              }`}
            >
              <Icon name="moon" className="w-3.5 h-3.5" />
              <span>Oscuro</span>
            </button>
          </div>
        </header>

        {/* Bloque Central: Logo + Título centrados encima de la Tarjeta de Inicio de Sesión */}
        <div className="w-full max-w-md mx-auto my-auto py-4 flex flex-col items-center gap-5">
          {/* Logo y Título encima del formulario */}
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-white/15 backdrop-blur-md p-2 border border-white/30 shadow-xl flex items-center justify-center">
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
              <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
                Fuerza, disciplina y gestión inteligente para tu gimnasio.
              </p>
            </div>
          </div>

          {/* Tarjeta de Inicio de Sesión */}
          <div className="w-full bg-surface text-txt-primary border border-white/20 dark:border-border rounded-2xl p-6 sm:p-7 shadow-2xl flex flex-col gap-5">
            <h2 id={headingId} className="text-2xl font-bold tracking-tight text-txt-primary">
              Iniciar Sesión
            </h2>

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
        </div>

        {/* Pie de página unificado */}
        <footer className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/85 border-t border-white/15 pt-3.5 shrink-0">
          <span>Max Rios • Consultoría y desarrollo freelance</span>
          <span className="font-semibold text-white">Sincronización: 100%</span>
        </footer>
      </div>
    </div>
  );
};
