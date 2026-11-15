import { computed, Injectable, signal } from '@angular/core';

export interface CartLine {
  productId: string;
  quantity: number;
}

const CART_STORAGE_KEY = 'farmasalud.cart';
export const MAXIMUM_UNITS_PER_PRODUCT = 20;

/**
 * Carrito del cliente. Solo guarda ids y cantidades (nada de precios):
 * el precio real lo calcula el servidor al crear el pedido.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly cartLinesSignal = signal<CartLine[]>(this.readStoredCart());

  readonly cartLines = this.cartLinesSignal.asReadonly();
  readonly totalUnits = computed(() =>
    this.cartLinesSignal().reduce((unitCount, cartLine) => unitCount + cartLine.quantity, 0),
  );
  readonly isEmpty = computed(() => this.cartLinesSignal().length === 0);

  getQuantityOf(productId: string): number {
    return this.cartLinesSignal().find((cartLine) => cartLine.productId === productId)?.quantity ?? 0;
  }

  addProduct(productId: string, quantityToAdd = 1): void {
    const currentQuantity = this.getQuantityOf(productId);
    this.setProductQuantity(productId, currentQuantity + quantityToAdd);
  }

  setProductQuantity(productId: string, requestedQuantity: number): void {
    const allowedQuantity = Math.min(Math.max(Math.floor(requestedQuantity), 0), MAXIMUM_UNITS_PER_PRODUCT);
    const otherLines = this.cartLinesSignal().filter((cartLine) => cartLine.productId !== productId);
    const isAlreadyInCart = otherLines.length !== this.cartLinesSignal().length;
    if (allowedQuantity === 0) {
      this.saveCart(otherLines);
      return;
    }
    const updatedLines = isAlreadyInCart
      ? this.cartLinesSignal().map((cartLine) =>
          cartLine.productId === productId ? { productId, quantity: allowedQuantity } : cartLine,
        )
      : [...otherLines, { productId, quantity: allowedQuantity }];
    this.saveCart(updatedLines);
  }

  removeProduct(productId: string): void {
    this.setProductQuantity(productId, 0);
  }

  clearCart(): void {
    this.saveCart([]);
  }

  private saveCart(cartLines: CartLine[]): void {
    this.cartLinesSignal.set(cartLines);
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartLines));
    } catch {
      // Sin almacenamiento: el carrito dura solo esta pestaña.
    }
  }

  /** Lo guardado en el navegador se valida: podría haber sido manipulado. */
  private readStoredCart(): CartLine[] {
    try {
      const storedCart: unknown = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(storedCart)) {
        return [];
      }
      return storedCart
        .filter(
          (storedLine): storedLine is CartLine =>
            typeof storedLine?.productId === 'string' &&
            /^[A-Za-z0-9_-]{1,128}$/.test(storedLine.productId) &&
            Number.isInteger(storedLine.quantity) &&
            storedLine.quantity > 0,
        )
        .map((cartLine) => ({
          productId: cartLine.productId,
          quantity: Math.min(cartLine.quantity, MAXIMUM_UNITS_PER_PRODUCT),
        }))
        .slice(0, 30);
    } catch {
      return [];
    }
  }
}
