import { CurrencyPipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { CartService, MAXIMUM_UNITS_PER_PRODUCT } from '../../../shared/data-access/cart.service';
import { CartDetailsService } from './cart-details.service';

/** Carrito: revisar cantidades y disponibilidad en la botica antes de pagar. */
@Component({
  selector: 'app-cart-page',
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './cart-page.html',
  styleUrl: './cart-page.css',
})
export class CartPage implements OnInit {
  private readonly logger = inject(AppLoggerService);
  readonly cartService = inject(CartService);
  readonly cartDetails = inject(CartDetailsService);
  readonly maximumUnitsPerProduct = MAXIMUM_UNITS_PER_PRODUCT;

  async ngOnInit(): Promise<void> {
    try {
      await this.cartDetails.loadCartDetails();
    } catch (error) {
      this.logger.logError('CartPage.loadCartDetails', error);
    }
  }

  changeSelectedBranch(changeEvent: Event): void {
    this.cartDetails.branchSelection.selectBranch((changeEvent.target as HTMLSelectElement).value);
  }

  increaseQuantity(productId: string): void {
    this.cartService.addProduct(productId);
  }

  decreaseQuantity(productId: string): void {
    this.cartService.setProductQuantity(productId, this.cartService.getQuantityOf(productId) - 1);
  }

  removeProduct(productId: string): void {
    this.cartService.removeProduct(productId);
  }
}
