import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from '../../components/primitives/Modal';

describe('Component: Modal (Bloqueo de Scroll del Fondo)', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  it('bloquea el scroll de body y html al abrirse y lo restaura al cerrarse', () => {
    const { rerender, unmount } = render(
      <Modal isOpen={true} title="Modal Principal">
        <p>Contenido principal</p>
      </Modal>
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('overscroll-contain');

    rerender(
      <Modal isOpen={false} title="Modal Principal">
        <p>Contenido principal</p>
      </Modal>
    );

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');

    unmount();
  });

  it('mantiene el scroll bloqueado con modales anidados hasta que todos se cierran', () => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    const outer = render(
      <Modal isOpen={true} title="Modal Externo">
        <p>Externo</p>
      </Modal>
    );

    const inner = render(
      <Modal isOpen={true} title="Modal Interno">
        <p>Interno</p>
      </Modal>
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    // Al cerrar el modal interno, el externo sigue abierto -> debe permanecer hidden
    inner.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    // Al cerrar el modal externo, restaura el overflow previo
    outer.unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('auto');
  });
});
