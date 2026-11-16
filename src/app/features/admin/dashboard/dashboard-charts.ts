import type { ChartConfiguration, TooltipItem } from 'chart.js';
import type { DailySales } from '../../../shared/models/business-indicators';
import {
  CHART_GRID_COLOR,
  CHART_MUTED_TEXT_COLOR,
  CHART_TOOLTIP_BACKGROUND,
  formatCompactSoles,
  formatSoles,
  SINGLE_SERIES_AREA_COLOR,
  SINGLE_SERIES_COLOR,
} from '../../../shared/ui/data-chart/chart-theme';

/**
 * Configuraciones de Chart.js del dashboard. Funciones puras: reciben datos ya
 * calculados y devuelven el gráfico listo (una sola serie y un solo eje cada uno).
 */

const tooltipStyle = {
  backgroundColor: CHART_TOOLTIP_BACKGROUND,
  padding: 10,
  cornerRadius: 8,
  titleFont: { weight: 600 as const },
  displayColors: false,
};

const dayLabelFormatter = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' });
const fullDayFormatter = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

/** Ventas por día: línea de área con cursor vertical y detalle de pedidos en el tooltip. */
export function buildSalesTrendChart(dailySales: DailySales[]): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: dailySales.map((daySales) => dayLabelFormatter.format(daySales.date)),
      datasets: [
        {
          label: 'Ventas',
          data: dailySales.map((daySales) => daySales.salesTotal),
          borderColor: SINGLE_SERIES_COLOR,
          backgroundColor: SINGLE_SERIES_AREA_COLOR,
          borderWidth: 2,
          fill: 'origin',
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 18,
          pointHoverBackgroundColor: SINGLE_SERIES_COLOR,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
        },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle,
          callbacks: {
            title: (tooltipItems: TooltipItem<'line'>[]) => fullDayFormatter.format(dailySales[tooltipItems[0].dataIndex].date),
            label: (tooltipItem: TooltipItem<'line'>) => {
              const daySales = dailySales[tooltipItem.dataIndex];
              return `${formatSoles(daySales.salesTotal)} · ${daySales.orderCount} ${daySales.orderCount === 1 ? 'pedido' : 'pedidos'}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: CHART_MUTED_TEXT_COLOR, maxTicksLimit: 8, maxRotation: 0 } },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: CHART_GRID_COLOR },
          ticks: { color: CHART_MUTED_TEXT_COLOR, maxTicksLimit: 5, callback: (tickValue) => formatCompactSoles(Number(tickValue)) },
        },
      },
    },
  };
}

/** Ranking horizontal de una sola serie (boticas, productos, estados) con el valor escrito al final. */
export function buildRankingBarChart(
  labels: string[],
  values: number[],
  formatValue: (value: number) => string,
  valueName: string,
): ChartConfiguration<'bar'> {
  const largestValue = Math.max(...values, 1);
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: valueName,
          data: values,
          backgroundColor: SINGLE_SERIES_COLOR,
          hoverBackgroundColor: '#0a3b3e',
          borderRadius: 4,
          borderSkipped: 'start',
          barThickness: 'flex',
          maxBarThickness: 22,
          categoryPercentage: 0.78,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      layout: { padding: { right: 70 } },
      plugins: {
        legend: { display: false },
        valueLabels: { formatValue },
        tooltip: {
          ...tooltipStyle,
          callbacks: { label: (tooltipItem: TooltipItem<'bar'>) => `${valueName}: ${formatValue(Number(tooltipItem.raw))}` },
        },
      },
      scales: {
        // Sin eje numérico visible: cada barra ya lleva su cifra escrita.
        x: { display: false, beginAtZero: true, suggestedMax: largestValue * 1.05 },
        y: { grid: { display: false }, border: { display: false }, ticks: { color: CHART_MUTED_TEXT_COLOR, autoSkip: false } },
      },
    },
  };
}

/** Pedidos por hora del día: columnas de una sola serie (cuándo compran los clientes). */
export function buildOrdersByHourChart(ordersByHour: number[]): ChartConfiguration<'bar'> {
  return {
    type: 'bar',
    data: {
      labels: ordersByHour.map((_count, hour) => `${hour}h`),
      datasets: [
        {
          label: 'Pedidos',
          data: ordersByHour,
          backgroundColor: SINGLE_SERIES_COLOR,
          hoverBackgroundColor: '#0a3b3e',
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'start',
          categoryPercentage: 0.82,
          barPercentage: 0.9,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle,
          callbacks: {
            title: (tooltipItems: TooltipItem<'bar'>[]) => `De ${tooltipItems[0].dataIndex}:00 a ${tooltipItems[0].dataIndex}:59`,
            label: (tooltipItem: TooltipItem<'bar'>) => `${tooltipItem.raw} ${Number(tooltipItem.raw) === 1 ? 'pedido' : 'pedidos'}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: CHART_MUTED_TEXT_COLOR, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: CHART_GRID_COLOR },
          ticks: { color: CHART_MUTED_TEXT_COLOR, precision: 0, maxTicksLimit: 4 },
        },
      },
    },
  };
}
