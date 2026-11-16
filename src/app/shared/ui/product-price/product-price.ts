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
      font-stretch: var(--font-stretch-label);
      font-size: 1.3rem;
      font-weight: 900;
      color: var(--color-text);
    }
    .product-price-previous {
      font-size: 0.85rem;
      color: var(--color-text-muted);
      text-decoration: line-through;
    }
    .product-price-discount {
      padding: 0.05rem 0.4rem;
      border-radius: var(--radius-sm);
      background: var(--route-marigold);
      color: var(--route-ink);
      font-family: var(--font-heading);
      font-stretch: var(--font-stretch-label);
      font-size: 0.78rem;
      font-weight: 800;
    }
    .is-large .product-price-current {
      font-size: 2.6rem;
      font-stretch: var(--font-stretch-sign);
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
