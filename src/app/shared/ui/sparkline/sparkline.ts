import { Component, computed, input } from '@angular/core';

const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 36;
const STROKE_PADDING = 3;

/**
 * Mini tendencia (SVG puro, sin librería) para las tarjetas de indicadores.
 * Es decorativa: el número y la variación de la tarjeta llevan la información.
 */
@Component({
  selector: 'app-sparkline',
  template: `
    <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      @if (areaPath()) {
        <path class="sparkline-area" [attr.d]="areaPath()" />
        <path class="sparkline-line" [attr.d]="linePath()" />
        <circle class="sparkline-end" [attr.cx]="lastPoint().x" [attr.cy]="lastPoint().y" r="2.8" />
      }
    </svg>
  `,
  styles: `
    :host { display: block; width: 100%; height: 36px; }
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    .sparkline-line { fill: none; stroke: #0f5257; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .sparkline-area { fill: rgba(15, 82, 87, 0.1); }
    .sparkline-end { fill: #0f5257; }
  `,
})
export class Sparkline {
  readonly values = input.required<number[]>();

  readonly width = SPARKLINE_WIDTH;
  readonly height = SPARKLINE_HEIGHT;

  private readonly points = computed(() => {
    const values = this.values();
    if (values.length < 2) {
      return [];
    }
    const maximumValue = Math.max(...values);
    const minimumValue = Math.min(...values);
    const valueRange = maximumValue - minimumValue || 1;
    return values.map((value, valueIndex) => ({
      x: (valueIndex / (values.length - 1)) * SPARKLINE_WIDTH,
      y: SPARKLINE_HEIGHT - STROKE_PADDING - ((value - minimumValue) / valueRange) * (SPARKLINE_HEIGHT - STROKE_PADDING * 2),
    }));
  });

  readonly linePath = computed(() =>
    this.points()
      .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' '),
  );
  readonly areaPath = computed(() =>
    this.points().length ? `${this.linePath()} L${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT} L0,${SPARKLINE_HEIGHT} Z` : '',
  );
  readonly lastPoint = computed(() => this.points()[this.points().length - 1] ?? { x: 0, y: 0 });
}
