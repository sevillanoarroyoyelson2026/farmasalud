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
        @if (showDiscount()) {
          <span class="product-price-discount">-{{ product().promotion?.discountPercent }}%</span>
        }
      }
    </span>
  `,
  styles: `
    .product-price {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.4rem;
      font-variant-numeric: tabular-nums;
    }
    .product-price-current {
      font-family: var(--font-heading);
      font-size: 1.3rem;
      font-weight: 700;
      color: var(--color-text);
    }
    .product-price-previous {
      font-size: 0.875rem;
      color: var(--color-text-muted);
      text-decoration: line-through;
    }
    .product-price-discount {
      padding: 0.05rem 0.45rem;
      border-radius: var(--radius-pill);
      background: var(--field-peach);
      color: var(--route-ink);
      font-family: var(--font-heading);
      font-size: 0.8125rem;
      font-weight: 600;
    }
    .is-large .product-price-current {
      font-size: 2.75rem;
    }
    .is-large .product-price-previous {
      font-size: 1.05rem;
    }
    .is-large .product-price-discount {
      font-size: 0.95rem;
    }
  `,
})
export class ProductPrice {
  readonly product = input.required<Product>();
  readonly size = input<'normal' | 'large'>('normal');
  /** Se oculta cuando quien lo muestra ya destaca el descuento (p. ej. el tablero de ofertas). */
  readonly showDiscount = input(true);

  readonly isPromoted = computed(() => hasActivePromotion(this.product()));
  readonly effectivePrice = computed(() => getEffectivePrice(this.product()));
}
