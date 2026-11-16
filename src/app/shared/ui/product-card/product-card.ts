import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ProductAvailability } from '../../../features/public/catalog/product-availability';
import { CartService } from '../../data-access/cart.service';
import { hasActivePromotion, Product } from '../../models/product';
import { CartNoticeService } from '../cart-notice/cart-notice';
import { ProductPrice } from '../product-price/product-price';

/**
 * Tarjeta de producto de la tienda (catálogo e inicio): foto grande, presentación,
 * nombre, disponibilidad, precio y botón de carrito. Toda la tarjeta lleva a la ficha.
 */
@Component({
  selector: 'app-product-card',
  imports: [RouterLink, ProductPrice],
  templateUrl: './product-card.html',
  styleUrl: './product-card.css',
  host: { '[class.is-out-of-stock]': 'isOutOfStock()' },
})
export class ProductCard {
  private readonly cartNotice = inject(CartNoticeService);
  private readonly cartService = inject(CartService);
  readonly isStaffMember = inject(AuthService).isStaffMember;

  readonly product = input.required<Product>();
  readonly availability = input.required<ProductAvailability>();
  /** Posición en la lista: alterna el color pastel de los productos sin foto. */
  readonly toneIndex = input(0);

  readonly isOutOfStock = computed(() => this.availability().stockStatus === 'out_of_stock');
  readonly quantityInCart = computed(() => this.cartService.getQuantityOf(this.product().id));
  readonly placeholderTone = computed(() => (this.product().imageUrl ? 0 : this.toneIndex() % 4));
  /** % de descuento vigente para la placa sobre la foto (null si no hay promoción). */
  readonly discountPercent = computed(() => {
    const product = this.product();
    return hasActivePromotion(product) ? (product.promotion?.discountPercent ?? null) : null;
  });

  addToCart(): void {
    this.cartService.addProduct(this.product().id);
    this.cartNotice.announceAddedProduct(this.product().name);
  }
}
