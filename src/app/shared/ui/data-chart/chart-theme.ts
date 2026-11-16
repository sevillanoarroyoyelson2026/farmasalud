/**
 * Colores de gráficos del panel, validados con el validador de paletas de dataviz
 * (banda de luminosidad, croma, separación para daltonismo y contraste):
 * - Serie única (magnitud): teal de la marca.
 * - Categorías (orden fijo, nunca rotado): aqua, naranja, azul.
 *   Aqua tiene contraste < 3:1 sobre blanco, por eso esos gráficos SIEMPRE llevan
 *   etiquetas visibles y vista de tabla.
 * Los colores de estado (verde/rojo) no se usan para series: están reservados para alertas.
 */
export const SINGLE_SERIES_COLOR = '#0f5257';
export const SINGLE_SERIES_AREA_COLOR = 'rgba(15, 82, 87, 0.12)';
export const CATEGORICAL_SERIES_COLORS = ['#1baf7a', '#eb6834', '#2a78d6'] as const;

export const CHART_TEXT_COLOR = '#3d4456';
export const CHART_MUTED_TEXT_COLOR = '#4d5468';
export const CHART_GRID_COLOR = 'rgba(20, 20, 20, 0.07)';
export const CHART_TOOLTIP_BACKGROUND = '#141414';

const solesFormatter = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 });
const compactSolesFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatSoles(amount: number): string {
  return solesFormatter.format(amount);
}

/** Para ejes: "S/ 1,2 mil" en vez de "S/ 1.234,00". */
export function formatCompactSoles(amount: number): string {
  return compactSolesFormatter.format(amount);
}
