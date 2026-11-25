// ============================================================================
// SUITE DE PRUEBAS UNITARIAS: PRIMITIVAS GRÁFICAS BI Y BARRA DE FILTROS
// Verifica: MetricKpiCard, MultiSeriesLineChart, BarChart, DonutChart,
// HeatmapGrid y BiFilterBar (estados loading/empty/data e interactividad)
// Ubicación: src/__tests__/BiChartsAndFilterBar.test.tsx
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BarChart,
  DEFAULT_HEATMAP_DAYS,
  DEFAULT_HEATMAP_HOURS,
  DonutChart,
  HeatmapGrid,
  MetricKpiCard,
  MultiSeriesLineChart,
} from '../components/primitives/charts';
import {
  BiFilterBar,
  computeDatePresetRange,
} from '../features/home/components/BiFilterBar';

describe('Suite BI-Slice 2: Primitivas Gráficas SVG y BiFilterBar', () => {
  describe('1. MetricKpiCard', () => {
    it('renderiza valor, subtítulo, tendencia positiva/negativa y Sin base previa', () => {
      const { rerender } = render(
        <MetricKpiCard
          label="Ingresos Brutos"
          value="S/ 12,450.00"
          subtitle="Periodo actual"
          icon="cash"
          deltaPct={12.4}
          deltaLabel="vs periodo ant."
          accent="success"
        />
      );

      expect(screen.getByText('Ingresos Brutos')).toBeInTheDocument();
      expect(screen.getByText('S/ 12,450.00')).toBeInTheDocument();
      expect(screen.getByText('+12.4% vs periodo ant.')).toBeInTheDocument();

      rerender(
        <MetricKpiCard
          label="Mermas"
          value="S/ 85.00"
          deltaPct={-15.2}
          invertTrendColor={true}
          accent="warning"
        />
      );
      const badge = screen.getByText('-15.2%').closest('[data-slot="badge"]');
      expect(badge).toHaveAttribute('data-variant', 'success');

      rerender(
        <MetricKpiCard
          label="Nuevos Socios"
          value={24}
          deltaPct={null}
        />
      );
      expect(screen.getByText('Sin base previa')).toBeInTheDocument();
    });

    it('renderiza estado loading con Skeleton sin mostrar valor crudo', () => {
      render(
        <MetricKpiCard
          label="Ingresos Netos"
          value="S/ 999.00"
          loading={true}
        />
      );

      expect(screen.getByRole('status', { name: /cargando ingresos netos/i })).toBeInTheDocument();
      expect(screen.queryByText('S/ 999.00')).not.toBeInTheDocument();
    });
  });

  describe('2. MultiSeriesLineChart', () => {
    const labels = ['01 Nov', '02 Nov', '03 Nov'];
    const series = [
      {
        id: 'ingresos',
        label: 'Ingresos',
        color: 'var(--color-brand-primary)',
        data: [500, 750, 900],
        fillArea: true,
      },
      {
        id: 'egresos',
        label: 'Egresos',
        color: 'var(--color-status-danger)',
        data: [200, 150, 300],
        dashed: true,
      },
    ];

    it('renderiza múltiples series, actualiza el inspector y permite ocultar/mostrar series en la leyenda', async () => {
      const user = userEvent.setup();
      render(
        <MultiSeriesLineChart
          title="Flujo de Caja"
          labels={labels}
          series={series}
          formatValue={(v) => `S/ ${v.toFixed(0)}`}
        />
      );

      expect(screen.getByRole('img', { name: /flujo de caja/i })).toBeInTheDocument();
      // Por defecto inspecciona el último punto (03 Nov)
      expect(screen.getByText('S/ 900')).toBeInTheDocument();
      expect(screen.getByText('S/ 300')).toBeInTheDocument();

      // Hover / focus sobre el primer punto (01 Nov)
      const firstCol = screen.getByRole('button', { name: /01 nov/i });
      fireEvent.mouseEnter(firstCol);
      expect(screen.getByText('S/ 500')).toBeInTheDocument();
      expect(screen.getByText('S/ 200')).toBeInTheDocument();

      // Toggle de la serie Egresos en la leyenda
      const legendGroup = screen.getByRole('group', { name: /series visibles en el gráfico/i });
      const egresosBtn = within(legendGroup).getByRole('button', { name: /^egresos$/i });
      expect(egresosBtn).toHaveAttribute('aria-pressed', 'true');
      await user.click(egresosBtn);
      expect(egresosBtn).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByText('S/ 200')).not.toBeInTheDocument();
    });

    it('maneja estados loading y vacío', () => {
      const { rerender } = render(
        <MultiSeriesLineChart labels={[]} series={[]} loading={true} />
      );
      expect(screen.getByRole('status')).toBeInTheDocument();

      rerender(
        <MultiSeriesLineChart
          labels={[]}
          series={[]}
          emptyTitle="Sin puntos"
          emptyMessage="No hay registros"
        />
      );
      expect(screen.getByText('Sin puntos')).toBeInTheDocument();
      expect(screen.getByText('No hay registros')).toBeInTheDocument();
    });
  });

  describe('3. BarChart', () => {
    it('soporta orientación vertical y horizontal, múltiples series y callback onBarClick', async () => {
      const user = userEvent.setup();
      const handleBarClick = vi.fn();

      const { rerender } = render(
        <BarChart
          title="Ventas por Canal"
          labels={['Física', 'Digital']}
          series={[
            { id: 'planes', label: 'Planes', color: 'var(--color-brand-primary)', data: [400, 650] },
            { id: 'productos', label: 'Productos', color: 'var(--color-accent-sky)', data: [150, 200] },
          ]}
          formatValue={(v) => `S/ ${v}`}
          onBarClick={handleBarClick}
        />
      );

      const digitalPlanesBar = screen.getByRole('button', { name: /digital — planes: s\/ 650/i });
      await user.click(digitalPlanesBar);

      expect(handleBarClick).toHaveBeenCalledWith({
        categoryIndex: 1,
        categoryLabel: 'Digital',
        seriesId: 'planes',
        seriesLabel: 'Planes',
        value: 650,
      });

      rerender(
        <BarChart
          orientation="horizontal"
          title="Top Productos"
          labels={['Proteína Whey', 'Agua 600ml']}
          series={[
            { id: 'ingresos', label: 'Ingresos', color: 'var(--color-brand-primary)', data: [1200, 450] },
          ]}
          formatValue={(v) => `S/ ${v}`}
        />
      );

      expect(screen.getByRole('img', { name: /top productos/i })).toBeInTheDocument();
      expect(screen.getByText('Proteína Whey')).toBeInTheDocument();
    });

    it('maneja estados loading y vacío', () => {
      const { rerender } = render(
        <BarChart labels={[]} series={[]} loading={true} />
      );
      expect(screen.getByRole('status')).toBeInTheDocument();

      rerender(<BarChart labels={['A']} series={[{ id: '1', label: 'S', color: '#000', data: [0] }]} />);
      expect(screen.getByText(/sin datos para mostrar/i)).toBeInTheDocument();
    });
  });

  describe('4. DonutChart', () => {
    it('renderiza segmentos, leyenda tabular y actualiza valor central al interactuar', () => {
      render(
        <DonutChart
          title="Canales de Captación"
          centerLabel="Socios"
          centerValue={50}
          items={[
            { id: 'redes', label: 'Redes Sociales', value: 30, percentage: 60, count: 30 },
            { id: 'referido', label: 'Recomendación', value: 20, percentage: 40, count: 20 },
          ]}
        />
      );

      expect(screen.getByRole('img', { name: /canales de captación/i })).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('60.0%')).toBeInTheDocument();
      expect(screen.getByText('40.0%')).toBeInTheDocument();

      const legendList = screen.getByRole('list');
      const redesLegendBtn = within(legendList).getByRole('button', { name: /redes sociales/i });
      fireEvent.mouseEnter(redesLegendBtn);
      expect(screen.getAllByText('30').length).toBeGreaterThanOrEqual(2);
    });

    it('maneja estados loading y vacío', () => {
      const { rerender } = render(<DonutChart items={[]} loading={true} />);
      expect(screen.getByRole('status')).toBeInTheDocument();

      rerender(<DonutChart items={[]} emptyTitle="Sin segmentos" />);
      expect(screen.getByText('Sin segmentos')).toBeInTheDocument();
    });
  });

  describe('5. HeatmapGrid', () => {
    it('renderiza matriz 7x18, leyenda Menor -> Mayor y detalle accesible por celda', () => {
      render(
        <HeatmapGrid
          title="Afluencia Semanal"
          rows={DEFAULT_HEATMAP_DAYS}
          cols={DEFAULT_HEATMAP_HOURS}
          cells={[
            { row: 0, col: 1, value: 12, detail: 'Pico mañana' },
            { row: 4, col: 13, value: 25, detail: 'Hora pico viernes' },
          ]}
        />
      );

      expect(screen.getByRole('grid', { name: /afluencia semanal/i })).toBeInTheDocument();
      expect(screen.getByText('Menor')).toBeInTheDocument();
      expect(screen.getByText('Mayor')).toBeInTheDocument();

      const cell = screen.getByRole('gridcell', {
        name: /vie 18:00: 25 asistencias \(hora pico viernes\)/i,
      });
      fireEvent.focus(cell);
      expect(screen.getByText('25 asistencias')).toBeInTheDocument();
      expect(screen.getByText(/hora pico viernes/i)).toBeInTheDocument();
    });

    it('maneja estados loading y vacío', () => {
      const { rerender } = render(<HeatmapGrid cells={[]} loading={true} />);
      expect(screen.getByRole('status')).toBeInTheDocument();

      rerender(<HeatmapGrid cells={[]} emptyTitle="Sin marcaciones" />);
      expect(screen.getByText('Sin marcaciones')).toBeInTheDocument();
    });
  });

  describe('6. BiFilterBar y computeDatePresetRange', () => {
    it('calcula correctamente los rangos locales para cada preset', () => {
      const fixedNow = new Date(2026, 10, 25, 14, 30, 0); // 2026-11-25
      expect(computeDatePresetRange('today', fixedNow)).toEqual({
        fecha_desde: '2026-11-25',
        fecha_hasta: '2026-11-25',
      });
      expect(computeDatePresetRange('7d', fixedNow)).toEqual({
        fecha_desde: '2026-11-19',
        fecha_hasta: '2026-11-25',
      });
      expect(computeDatePresetRange('30d', fixedNow)).toEqual({
        fecha_desde: '2026-10-27',
        fecha_hasta: '2026-11-25',
      });
      expect(computeDatePresetRange('current_month', fixedNow)).toEqual({
        fecha_desde: '2026-11-01',
        fecha_hasta: '2026-11-25',
      });
      expect(computeDatePresetRange('previous_month', fixedNow)).toEqual({
        fecha_desde: '2026-10-01',
        fecha_hasta: '2026-10-31',
      });
      expect(computeDatePresetRange('ytd', fixedNow)).toEqual({
        fecha_desde: '2026-01-01',
        fecha_hasta: '2026-11-25',
      });
    });

    it('permite seleccionar presets, cambiar fechas a personalizado, cambiar granularidad y exportar según canExport', async () => {
      const user = userEvent.setup();
      const onPresetChange = vi.fn();
      const onDateRangeChange = vi.fn();
      const onGranularityChange = vi.fn();
      const onExport = vi.fn();

      const { rerender } = render(
        <BiFilterBar
          preset="30d"
          fechaDesde="2026-10-27"
          fechaHasta="2026-11-25"
          onPresetChange={onPresetChange}
          onDateRangeChange={onDateRangeChange}
          showGranularity={true}
          granularity="auto"
          onGranularityChange={onGranularityChange}
          canExport={false}
          onExport={onExport}
        >
          <span>Filtro Canal Extra</span>
        </BiFilterBar>
      );

      expect(screen.getByText('Filtro Canal Extra')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /exportar vista en csv/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '7 días' }));
      expect(onPresetChange).toHaveBeenCalledWith('7d', expect.objectContaining({
        fecha_desde: expect.any(String),
        fecha_hasta: expect.any(String),
      }));
      expect(onDateRangeChange).toHaveBeenCalledTimes(1);

      // Cambiar fecha manualmente cambia a custom
      const desdeInput = screen.getByLabelText('Desde');
      fireEvent.change(desdeInput, { target: { value: '2026-11-01' } });
      expect(onPresetChange).toHaveBeenLastCalledWith('custom', {
        fecha_desde: '2026-11-01',
        fecha_hasta: '2026-11-25',
      });

      // Cambiar granularidad
      await user.selectOptions(screen.getByLabelText(/granularidad/i), 'week');
      expect(onGranularityChange).toHaveBeenCalledWith('week');

      // Habilitar exportación
      rerender(
        <BiFilterBar
          preset="custom"
          fechaDesde="2026-11-01"
          fechaHasta="2026-11-25"
          onPresetChange={onPresetChange}
          onDateRangeChange={onDateRangeChange}
          canExport={true}
          onExport={onExport}
        />
      );
      expect(screen.getByText('Personalizado')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /exportar vista en csv/i }));
      expect(onExport).toHaveBeenCalledWith('CSV');

      await user.click(screen.getByRole('button', { name: /exportar vista en excel/i }));
      expect(onExport).toHaveBeenCalledWith('XLSX');
    });
  });
});
