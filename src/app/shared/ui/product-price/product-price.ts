import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { getEffectivePrice, hasActivePromotion, Product } from '../../models/product';

/** Precio de venta; si hay promoción vigente muestra el precio anterior tachado y el % de descuento. */
@Component({
  selector: 'app-product-price',
  imports: [CurrencyPipe],
  template: `
    <span class="product-price" [class.is-large]="size() === 'large'">
      <span class="product-price-current">{{ effectivePrice() | currency: 'PEN' : 'S/ ' }}</span>
      @if (isPromoted()) {
        <span class="product-price-previous">{{ product().price | currency: 'PEN' : 'S/ ' }}</span>
        <span class="product-price-discount">-{{ product().promotion?.discountPercent }}%</span>
      }
    </span>
  `,
  styles: `
    .product-price { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem; }
    .product-price-current { font-family: var(--font-heading); font-size: 1.15rem; font-weight: 800; color: var(--color-text); }
    .product-price-previous { font-size: 0.8rem; color: var(--color-text-muted); text-decoration: line-through; }
    .product-price-discount {
      padding: 0.05rem 0.4rem; border-radius: 999px; background: var(--color-danger-soft);
      color: #991b1b; font-size: 0.72rem; font-weight: 700;
    }
    .is-large .product-price-current { font-size: 2rem; }
    .is-large .product-price-previous { font-size: 1rem; }
    .is-large .product-price-discount { font-size: 0.85rem; }
  `,
})
export class ProductPrice {
  readonly product = input.required<Product>();
  readonly size = input<'normal' | 'large'>('normal');

  readonly isPromoted = computed(() => hasActivePromotion(this.product()));
  readonly effectivePrice = computed(() => getEffectivePrice(this.product()));
}
