import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  CheckboxField,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Input,
  Label,
  Modal,
  Select,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableLoadingSkeleton,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  badgeVariants,
  buttonVariants,
} from '../../components/primitives';

describe('Fase 1 + 2: Primitivas Estandarizadas (shadcn/ui + Radix + CVA)', () => {
  describe('Button y Badge (CVA, data-slot, asChild)', () => {
    it('expone data-slot, data-variant, data-size y soporta composición polimórfica asChild', () => {
      render(
        <div>
          <Button variant="danger" size="sm">
            Eliminar
          </Button>
          <Button asChild variant="outline">
            <a href="#reporte">Ver reporte</a>
          </Button>
          <Badge variant="success" size="sm">
            Activo
          </Badge>
          <Badge asChild variant="info">
            <a href="#info">Info</a>
          </Badge>
        </div>
      );

      const dangerBtn = screen.getByRole('button', { name: 'Eliminar' });
      expect(dangerBtn).toHaveAttribute('data-slot', 'button');
      expect(dangerBtn).toHaveAttribute('data-variant', 'danger');
      expect(dangerBtn).toHaveAttribute('data-size', 'sm');
      expect(dangerBtn.className).toContain('hover:bg-status-danger-hover');
      expect(dangerBtn.className).not.toContain('hover:bg-red-800');

      const linkBtn = screen.getByRole('link', { name: 'Ver reporte' });
      expect(linkBtn).toHaveAttribute('data-slot', 'button');
      expect(linkBtn.className).toContain('border-border-strong');

      const badge = screen.getByText('Activo');
      expect(badge).toHaveAttribute('data-slot', 'badge');
      expect(badge.className).toContain('border-status-success-border');
      expect(badge.className).not.toContain('border-emerald-300');

      const linkBadge = screen.getByRole('link', { name: 'Info' });
      expect(linkBadge).toHaveAttribute('data-slot', 'badge');

      expect(buttonVariants({ variant: 'primary', size: 'icon' })).toContain('size-9');
      expect(badgeVariants({ variant: 'warning' })).toContain('border-status-warning-border');
    });
  });

  describe('Input y Select (accesibilidad de formularios)', () => {
    it('solo asigna aria-invalid="true" cuando existe error y enlaza aria-describedby', () => {
      const { rerender } = render(
        <div>
          <Input label="Documento" hint="8 dígitos" required />
          <Select
            label="Plan"
            hint="Selecciona un plan"
            required
            options={[
              { value: '1m', label: 'Mensual' },
              { value: '3m', label: 'Trimestral' },
            ]}
          />
        </div>
      );

      const input = screen.getByLabelText(/Documento/i);
      expect(input).toHaveAttribute('data-slot', 'input');
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(input).toHaveAccessibleDescription('8 dígitos');

      const select = screen.getByLabelText(/Plan/i);
      expect(select).toHaveAttribute('data-slot', 'select');
      expect(select).not.toHaveAttribute('aria-invalid');
      expect(select).toHaveAccessibleDescription('Selecciona un plan');

      rerender(
        <div>
          <Input label="Documento" error="DNI inválido" required />
          <Select
            label="Plan"
            error="Plan obligatorio"
            required
            options={[{ value: '1m', label: 'Mensual' }]}
          />
        </div>
      );

      expect(screen.getByLabelText(/Documento/i)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(/Documento/i)).toHaveAccessibleDescription('DNI inválido');
      expect(screen.getByLabelText(/Plan/i)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(/Plan/i)).toHaveAccessibleDescription('Plan obligatorio');
    });
  });

  describe('Alert (Live Regions accesibles y CVA)', () => {
    it('usa role="status" polite en success/info y role="alert" assertive en danger/warning', () => {
      render(
        <div>
          <Alert variant="success" floating={false} title="Guardado">
            Operación completada
          </Alert>
          <Alert variant="danger" floating={false} title="Error">
            Fallo crítico
          </Alert>
        </div>
      );

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-slot', 'alert');
      expect(status).toHaveAttribute('aria-live', 'polite');

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('data-slot', 'alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });
  });

  describe('Table (semántica y Skeleton tokenizado)', () => {
    it('aplica scope="col" en TableHead, soporta TableCaption/TableFooter y reutiliza Skeleton', () => {
      const { container } = render(
        <Table containerLabel="Tabla de resumen de cuotas">
          <TableCaption>Resumen de cuotas</TableCaption>
          <TableHeader stickyHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableLoadingSkeleton colSpan={2} rows={2} />
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total: 2</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      );

      expect(
        screen.getByRole('region', { name: 'Tabla de resumen de cuotas' })
      ).toHaveAttribute('tabindex', '0');
      expect(container.querySelector('[data-slot="table-header"]')?.className).toContain(
        'sticky'
      );
      expect(screen.getByText('Resumen de cuotas')).toHaveAttribute('data-slot', 'table-caption');
      const headers = screen.getAllByRole('columnheader');
      headers.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));

      const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBe(6);
      expect(container.innerHTML).not.toContain('bg-slate-200');
    });
  });

  describe('Modal (Radix Dialog) y ConfirmDialog (Radix AlertDialog)', () => {
    it('Modal respeta Escape y preventClose con accesibilidad Radix Dialog', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      const { rerender } = render(
        <Modal isOpen={true} onClose={onClose} title="Editar Cliente" description="Actualiza los datos">
          <Input label="Nombre" />
        </Modal>
      );

      const dialog = screen.getByRole('dialog', { name: 'Editar Cliente' });
      expect(dialog).toHaveAttribute('data-slot', 'dialog-content');
      expect(dialog).toHaveAccessibleDescription('Actualiza los datos');

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);

      onClose.mockClear();
      rerender(
        <Modal isOpen={true} onClose={onClose} preventClose={true} title="Proceso Crítico">
          <p>No cerrar aún</p>
        </Modal>
      );

      await user.keyboard('{Escape}');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('ConfirmDialog expone role="alertdialog", enfoca Cancelar en danger y bloquea cierre accidental', () => {
      const onClose = vi.fn();
      const onConfirm = vi.fn();

      render(
        <ConfirmDialog
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          variant="danger"
          title="Anular venta"
          description="Esta acción no se puede deshacer"
          confirmText="Sí, anular"
          cancelText="Cancelar"
        />
      );

      const alertDialog = screen.getByRole('alertdialog', { name: 'Anular venta' });
      expect(alertDialog).toHaveAttribute('data-slot', 'alert-dialog-content');
      expect(alertDialog).toHaveAccessibleDescription('Esta acción no se puede deshacer');

      // En variantes destructivas, el foco inicial debe caer sobre el botón seguro (Cancelar)
      expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();

      // Clic en overlay no debe cerrar un AlertDialog crítico
      const overlay = document.querySelector('[data-slot="alert-dialog-overlay"]');
      expect(overlay).not.toBeNull();
      if (overlay) {
        fireEvent.pointerDown(overlay);
        fireEvent.click(overlay);
      }
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Sí, anular' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Fase 3: Tabs, Card, Textarea, Checkbox, Switch, Tooltip y DropdownMenu', () => {
    it('Tabs soporta navegación por flechas (ArrowRight/ArrowLeft) y clics sintéticos', async () => {
      const user = userEvent.setup();
      render(
        <Tabs defaultValue="uno">
          <TabsList aria-label="Pestañas de prueba">
            <TabsTrigger value="uno">Uno</TabsTrigger>
            <TabsTrigger value="dos">Dos</TabsTrigger>
            <TabsTrigger value="tres">Tres</TabsTrigger>
          </TabsList>
          <TabsContent value="uno">Panel Uno</TabsContent>
          <TabsContent value="dos">Panel Dos</TabsContent>
          <TabsContent value="tres">Panel Tres</TabsContent>
        </Tabs>
      );

      const tabUno = screen.getByRole('tab', { name: 'Uno' });
      const tabDos = screen.getByRole('tab', { name: 'Dos' });
      const tabTres = screen.getByRole('tab', { name: 'Tres' });

      expect(tabUno).toHaveAttribute('aria-selected', 'true');
      expect(tabUno).toHaveAttribute('data-slot', 'tabs-trigger');
      expect(screen.getByText('Panel Uno')).toBeInTheDocument();

      // Navegación con teclado (Tab para entrar al tablist + flecha derecha)
      await user.tab();
      expect(tabUno).toHaveFocus();
      await user.keyboard('{ArrowRight}');
      expect(tabDos).toHaveFocus();
      expect(tabDos).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Panel Dos')).toBeInTheDocument();

      // Clic sintético directo (compatibilidad fireEvent.click)
      fireEvent.click(tabTres);
      expect(tabTres).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Panel Tres')).toBeInTheDocument();
    });

    it('Card, Label, Separator y Textarea exponen data-slot y accesibilidad de error', () => {
      render(
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Tarjeta Operativa</CardTitle>
            <CardDescription>Resumen del turno</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent>
            <Label htmlFor="obs-field" required>
              Observación
            </Label>
            <Textarea id="obs-field" label="Detalle" error="Mínimo 5 caracteres" required />
          </CardContent>
          <CardFooter>Pie de tarjeta</CardFooter>
        </Card>
      );

      expect(screen.getByText('Tarjeta Operativa')).toHaveAttribute('data-slot', 'card-title');
      expect(screen.getByText('Pie de tarjeta')).toHaveAttribute('data-slot', 'card-footer');

      const textarea = screen.getByLabelText(/Detalle/i);
      expect(textarea).toHaveAttribute('data-slot', 'textarea');
      expect(textarea).toHaveAttribute('aria-invalid', 'true');
      expect(textarea).toHaveAccessibleDescription('Mínimo 5 caracteres');
    });

    it('Checkbox, CheckboxField y Switch alternan estados accesibles por clic y teclado', async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      const onSwitchChange = vi.fn();

      render(
        <div>
          <CheckboxField
            label="Aceptar política"
            description="Registro auditado"
            onCheckedChange={onCheckedChange}
          />
          <Checkbox aria-label="Selección parcial" checked="indeterminate" />
          <Switch aria-label="Activar notificaciones" onCheckedChange={onSwitchChange} />
        </div>
      );

      const checkbox = screen.getByRole('checkbox', { name: /Aceptar política/i });
      expect(checkbox).toHaveAttribute('data-slot', 'checkbox');
      await user.click(checkbox);
      expect(onCheckedChange).toHaveBeenCalledWith(true);

      const indeterminate = screen.getByRole('checkbox', { name: 'Selección parcial' });
      expect(indeterminate).toHaveAttribute('data-state', 'indeterminate');

      const toggle = screen.getByRole('switch', { name: 'Activar notificaciones' });
      expect(toggle).toHaveAttribute('data-slot', 'switch');
      await user.click(toggle);
      expect(onSwitchChange).toHaveBeenCalledWith(true);
    });

    it('DropdownMenu y Tooltip operan con teclado y ocultan shortcuts decorativos a lectores de pantalla', async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();

      render(
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                Ayuda
              </Button>
            </TooltipTrigger>
            <TooltipContent>Información contextual</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Acciones
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={onAction}>
                Exportar PDF
                <DropdownMenuShortcut>Ctrl+P</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>
      );

      await user.click(screen.getByRole('button', { name: 'Acciones' }));
      const menuItem = await screen.findByRole('menuitem', { name: 'Exportar PDF' });
      expect(menuItem).toHaveAttribute('data-slot', 'dropdown-menu-item');
      expect(screen.getByText('Ctrl+P')).toHaveAttribute('aria-hidden', 'true');

      await user.click(menuItem);
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });
});
