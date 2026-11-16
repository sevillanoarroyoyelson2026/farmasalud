import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type ChartType,
  type Plugin,
} from 'chart.js';
import { CHART_TEXT_COLOR } from './chart-theme';

// Solo se registran las piezas que se usan (el paquete queda más liviano).
Chart.register(BarController, BarElement, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);
Chart.defaults.font.family = "'Jost', 'Segoe UI', system-ui, sans-serif";
Chart.defaults.color = CHART_TEXT_COLOR;

/** Línea vertical que sigue al cursor en los gráficos de línea (lectura precisa por día). */
const crosshairPlugin: Plugin<'line'> = {
  id: 'farmasaludCrosshair',
  afterDatasetsDraw(chart) {
    const activeElement = chart.tooltip?.getActiveElements()[0];
    if (!activeElement) {
      return;
    }
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(activeElement.element.x, chartArea.top);
    ctx.lineTo(activeElement.element.x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.35)';
    ctx.stroke();
    ctx.restore();
  },
};

/** Opciones del plugin de etiquetas: `options.plugins.valueLabels.formatValue`. */
export interface ValueLabelsOptions {
  formatValue: (value: number) => string;
}

// Chart.js conoce así la opción del plugin propio (tipado, sin conversiones forzadas).
declare module 'chart.js' {
  interface PluginOptionsByType<TType extends ChartType> {
    valueLabels?: Partial<ValueLabelsOptions>;
  }
}

/**
 * Escribe el valor al final de cada barra (etiqueta directa): la cifra se lee sin
 * pasar el mouse, y la identidad nunca depende solo del color.
 */
const valueLabelsPlugin: Plugin<'bar'> = {
  id: 'valueLabels',
  afterDatasetsDraw(chart, _arguments, pluginOptions) {
    const formatValue = (pluginOptions as Partial<ValueLabelsOptions>).formatValue;
    if (!formatValue) {
      return;
    }
    const isHorizontal = chart.options.indexAxis === 'y';
    const { ctx } = chart;
    ctx.save();
    ctx.font = `600 12px ${Chart.defaults.font.family}`;
    ctx.fillStyle = CHART_TEXT_COLOR;
    chart.data.datasets.forEach((_dataset, datasetIndex) => {
      chart.getDatasetMeta(datasetIndex).data.forEach((barElement, valueIndex) => {
        const value = Number(chart.data.datasets[datasetIndex].data[valueIndex] ?? 0);
        if (!value) {
          return;
        }
        const labelText = formatValue(value);
        if (isHorizontal) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, barElement.x + 6, barElement.y);
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(labelText, barElement.x, barElement.y - 4);
        }
      });
    });
    ctx.restore();
  },
};
Chart.register(valueLabelsPlugin);

/**
 * Lienzo de Chart.js reutilizable. Recibe la configuración ya armada y:
 * - al cambiar los datos ANIMA la transición (no reconstruye el gráfico),
 * - respeta "reducir movimiento" del sistema,
 * - se destruye al salir de la pantalla (sin fugas de memoria).
 * El texto `accessibleSummary` describe el gráfico para lectores de pantalla.
 */
@Component({
  selector: 'app-data-chart',
  template: `
    <div class="data-chart-frame" [style.height]="height()">
      <canvas #chartCanvas role="img" [attr.aria-label]="accessibleSummary()"></canvas>
    </div>
  `,
  styles: `
    :host { display: block; }
    .data-chart-frame { position: relative; width: 100%; }
  `,
})
export class DataChart {
  readonly configuration = input.required<ChartConfiguration>();
  readonly accessibleSummary = input.required<string>();
  readonly height = input('260px');

  private readonly chartCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');
  private chartInstance: Chart | null = null;
  private readonly prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    afterNextRender(() => this.renderChart(this.configuration()));
    effect(() => {
      const nextConfiguration = this.configuration();
      if (this.chartInstance) {
        this.chartInstance.data = nextConfiguration.data;
        this.chartInstance.options = this.withMotionPreference(nextConfiguration).options ?? {};
        this.chartInstance.update();
      }
    });
    inject(DestroyRef).onDestroy(() => this.chartInstance?.destroy());
  }

  private renderChart(chartConfiguration: ChartConfiguration): void {
    const configurationWithPlugins = this.withMotionPreference(chartConfiguration);
    if (chartConfiguration.type === 'line') {
      configurationWithPlugins.plugins = [...(configurationWithPlugins.plugins ?? []), crosshairPlugin as Plugin];
    }
    this.chartInstance = new Chart(this.chartCanvas().nativeElement, configurationWithPlugins);
  }

  private withMotionPreference(chartConfiguration: ChartConfiguration): ChartConfiguration {
    return {
      ...chartConfiguration,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...chartConfiguration.options,
        animation: this.prefersReducedMotion ? false : { duration: 700, easing: 'easeOutQuart' },
      },
    } as ChartConfiguration;
  }
}
