import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../../features/auth/LoginForm';
import { AppError } from '../../types/auth';

describe('Component: LoginForm', () => {
  it('renderiza inputs de usuario y contraseña con atributos de accesibilidad', () => {
    const handleLogin = vi.fn().mockResolvedValue(true);
    render(<LoginForm onLogin={handleLogin} />);

    expect(screen.getByLabelText(/usuario del sistema/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^contraseña/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /iniciar sesión/i })
    ).toBeInTheDocument();
  });

  it('muestra errores de validación cliente si se envía con campos vacíos sin invocar onLogin', async () => {
    const handleLogin = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();

    render(<LoginForm onLogin={handleLogin} />);

    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(
      screen.getByText(/el nombre de usuario es obligatorio/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/la contraseña es obligatoria/i)).toBeInTheDocument();
    expect(handleLogin).not.toHaveBeenCalled();
  });

  it('deshabilita el botón y muestra estado de carga cuando isLoading es true', () => {
    const handleLogin = vi.fn();
    render(<LoginForm onLogin={handleLogin} isLoading={true} />);

    const submitBtn = screen.getByRole('button', { name: /cargando/i });
    expect(submitBtn).toBeDisabled();
    expect(submitBtn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText(/usuario del sistema/i)).toBeDisabled();
  });

  it('muestra alerta de error amigable cuando se recibe AppError Unauthorized', () => {
    const handleLogin = vi.fn();
    const error: AppError = {
      code: 'Unauthorized',
      message: 'Credenciales inválidas',
    };

    render(<LoginForm onLogin={handleLogin} error={error} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/usuario o contraseña incorrectos/i)
    ).toBeInTheDocument();
  });

  it('permite ingresar credenciales y enviar formulario exitosamente', async () => {
    const handleLogin = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();

    render(<LoginForm onLogin={handleLogin} />);

    const usernameInput = screen.getByLabelText(/usuario del sistema/i);
    const passwordInput = screen.getByLabelText(/^contraseña/i);

    await user.type(usernameInput, 'admin');
    await user.type(passwordInput, 'admin123');

    expect(usernameInput).toHaveValue('admin');
    expect(passwordInput).toHaveValue('admin123');

    // Enviar
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(handleLogin).toHaveBeenCalledWith({
        username: 'admin',
        password: 'admin123',
      });
    });
  });

  it('no muestra las etiquetas de estado, autocompletar ni el subtítulo de bienvenida', () => {
    const handleLogin = vi.fn().mockResolvedValue(true);
    render(<LoginForm onLogin={handleLogin} showDevHelpers={true} />);

    expect(
      screen.queryByRole('button', { name: /autocompletar admin/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/estado: desarrollo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bienvenido de nuevo/i)).not.toBeInTheDocument();
  });

  it('muestra el logo y el título centrados encima del formulario con fondo completo', () => {
    const handleLogin = vi.fn().mockResolvedValue(true);
    const { container } = render(<LoginForm onLogin={handleLogin} />);

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('bg-gradient-to-br');

    const logo = screen.getByAltText(/logo zaramagym/i);
    const brandTitle = screen.getByRole('heading', { level: 1, name: /zaramagym/i });
    const form = screen.getByRole('form', { name: /iniciar sesión/i });

    expect(
      logo.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      brandTitle.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
