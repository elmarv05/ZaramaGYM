import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientFormModal } from '../../features/entities/ClientFormModal';
import { PurchaseFormModal } from '../../features/finance/components/PurchaseFormModal';
import { ExpenseFormModal } from '../../features/finance/components/ExpenseFormModal';
import { CartTable } from '../../features/pos/components/CartTable';
import { PaymentSplitter } from '../../features/pos/components/PaymentSplitter';
import { calculatePaymentSplit, calculateCartTotals, roundMoney } from '../../domain/pos';
import { sanitizeDecimalInput, sanitizeIntegerInput, formatDecimalOnBlur } from '../../utils/formSafety';
import { ProductListItem } from '../../types/catalog';
import { SupplierListItem } from '../../types/entity';

const mockSuppliers: SupplierListItem[] = [
  {
    id: 1,
    tipo_proveedor: 'EMPRESA',
    persona_id: null,
    empresa_id: 10,
    tipo_documento: 'RUC',
    numero_documento: '20556677881',
    nombre_o_razon_social: 'Distribuidora Fit SAC',
    nombre_comercial: 'FitSupps',
    rubro_o_categoria: 'Suplementos',
    contacto_referencia: 'Ana',
    telefono: '987654321',
    email: 'ventas@fitsupps.pe',
    estado_activo: true,
    created_at: '2026-11-10',
  },
];

const mockProducts: ProductListItem[] = [
  {
    id: 1,
    codigo_sku: 'SUP-WHEY-1K',
    nombre: 'Proteína Whey 1kg',
    categoria: 'SUPLEMENTOS',
    unidad_medida: 'UNIDAD',
    precio_compra_referencial: '120.00',
    precio_venta: '180.00',
    stock_actual: 10,
    stock_minimo: 2,
    alerta_stock_bajo: false,
    proveedor_preferido_id: 1,
    proveedor_nombre: 'Distribuidora Fit SAC',
    estado_activo: true,
    created_at: '2026-11-10',
    updated_at: '2026-11-10',
  },
];

describe('Form Safety, Obligatoriedad y Precisión Decimal/Monetaria', () => {
  it('1. Bloquea guardado accidental al presionar Enter dentro de inputs en ClientFormModal', async () => {
    const user = userEvent.setup();
    const handleCreate = vi.fn().mockResolvedValue({ id: 99 });

    render(
      <ClientFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={handleCreate}
        onSubmitUpdate={vi.fn()}
      />
    );

    const docInput = screen.getByLabelText(/número de documento/i);
    await user.type(docInput, '71234567{enter}');
    const nombresInput = screen.getByLabelText(/^nombres/i);
    await user.type(nombresInput, 'Luis{enter}');
    const apellidosInput = screen.getByLabelText(/^apellidos/i);
    await user.type(apellidosInput, 'Paredes{enter}');

    // Aunque todos los obligatorios ya tengan datos, Enter en inputs NO debe guardar automáticamente
    expect(handleCreate).not.toHaveBeenCalled();

    // Solo al hacer clic explícito en "Registrar Cliente" se envía
    await user.click(screen.getByRole('button', { name: /registrar cliente/i }));
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  it('2. Exige campos obligatorios en ClientFormModal y ExpenseFormModal sin permitir envío incompleto', async () => {
    const user = userEvent.setup();
    const handleClientCreate = vi.fn();
    const handleExpenseSubmit = vi.fn();

    const { unmount } = render(
      <ClientFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmitCreate={handleClientCreate}
        onSubmitUpdate={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /registrar cliente/i }));
    expect(handleClientCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/número de documento.*obligatorio/i)).toBeInTheDocument();
    expect(screen.getByText(/nombres son obligatorios/i)).toBeInTheDocument();
    expect(screen.getByText(/apellidos son obligatorios/i)).toBeInTheDocument();

    unmount();

    render(
      <ExpenseFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={handleExpenseSubmit}
      />
    );

    await user.click(screen.getByRole('button', { name: /registrar gasto/i }));
    expect(handleExpenseSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/descripción del gasto debe tener al menos 3 caracteres/i)).toBeInTheDocument();
    expect(screen.getByText(/monto del gasto debe ser un valor numérico mayor a 0/i)).toBeInTheDocument();
  });

  it('3. PurchaseFormModal permite editar Costo Unitario decimal y Cantidad libremente sin trabarse ni guardarse con Enter', async () => {
    const user = userEvent.setup();
    const handlePurchaseSubmit = vi.fn().mockResolvedValue({ id: 5 });

    render(
      <PurchaseFormModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={handlePurchaseSubmit}
        suppliers={mockSuppliers}
        products={mockProducts}
      />
    );

    const qtyInput = screen.getByLabelText(/cantidad a comprar/i) as HTMLInputElement;
    const costInput = screen.getByLabelText(/costo unitario/i) as HTMLInputElement;

    // Permite borrar completamente con Backspace y digitar nueva cantidad sin rebotes a "1"
    await user.clear(qtyInput);
    expect(qtyInput.value).toBe('');
    await user.type(qtyInput, '4');
    expect(qtyInput.value).toBe('4');

    // Permite borrar "120.00" completamente y digitar decimales (incluso con coma ',') sin type="number" quirks
    await user.clear(costInput);
    expect(costInput.value).toBe('');
    await user.type(costInput, '25,75{enter}');
    expect(costInput.value).toBe('25.75');

    // Enter no guardó la compra accidentalmente
    expect(handlePurchaseSubmit).not.toHaveBeenCalled();

    // Añadir ítem al detalle y verificar subtotal exacto 4 * 25.75 = 103.00
    await user.click(screen.getByRole('button', { name: /\+ añadir al detalle/i }));
    expect(screen.getAllByText('S/ 103.00').length).toBeGreaterThanOrEqual(1);
  });

  it('4. Carrito POS y Medios de Pago conservan 300 exacto (nunca 299.99) y sanitizan decimales', async () => {
    const handleDescuentoChange = vi.fn();
    const handleUpdatePayment = vi.fn();

    // Prueba de helpers puros y matemáticas POS
    expect(roundMoney(300)).toBe(300);
    expect(sanitizeDecimalInput('300')).toBe('300');
    expect(sanitizeDecimalInput('300,5')).toBe('300.5');
    expect(sanitizeIntegerInput('12a')).toBe('12');
    expect(formatDecimalOnBlur('300', { min: 0 })).toBe('300.00');

    const totals = calculateCartTotals(
      [
        {
          tipo_item: 'PLAN',
          plan_id: 1,
          cantidad: 1,
          precio_unitario: '300.00',
          subtotal: '300.00',
        },
      ],
      '0.00'
    );
    expect(totals.totalVenta).toBe(300);
    expect(totals.totalVentaStr).toBe('300.00');

    const split = calculatePaymentSplit(300, [
      { metodo_pago: 'EFECTIVO', monto: '300' },
    ]);
    expect(split.montoEfectivoEntregadoStr).toBe('300.00');
    expect(split.saldoCreditoGenerado).toBe(0);

    // Prueba de UI: CartTable usa inputMode="decimal" (no type="number") y al perder foco formatea 300 -> 300.00
    render(
      <CartTable
        items={[
          {
            tipo_item: 'PRODUCTO',
            producto_id: 1,
            cantidad: 1,
            precio_unitario: '300.00',
            subtotal: '300.00',
          },
        ]}
        descuento="300"
        subtotal={300}
        totalVenta={0}
        onUpdateQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
        onClearCart={vi.fn()}
        onDescuentoChange={handleDescuentoChange}
      />
    );

    const discountInput = screen.getByLabelText(/descuento especial/i) as HTMLInputElement;
    expect(discountInput.type).toBe('text');
    expect(discountInput.inputMode).toBe('decimal');
    fireEvent.blur(discountInput);
    expect(handleDescuentoChange).toHaveBeenCalledWith('300.00');

    // Prueba de UI: PaymentSplitter usa inputMode="decimal" y conserva "300" -> "300.00"
    render(
      <PaymentSplitter
        totalVenta={300}
        pagos={[{ metodo_pago: 'EFECTIVO', monto: '300' }]}
        splitResult={split}
        hasCliente={false}
        onUpdatePayment={handleUpdatePayment}
        onRemovePayment={vi.fn()}
        onSubmitSale={vi.fn()}
      />
    );

    const cashInput = screen.getByLabelText(/monto en efectivo en gaveta/i) as HTMLInputElement;
    expect(cashInput.type).toBe('text');
    expect(cashInput.inputMode).toBe('decimal');
    fireEvent.blur(cashInput);
    expect(handleUpdatePayment).toHaveBeenCalledWith('EFECTIVO', '300.00', undefined);
  });
});
