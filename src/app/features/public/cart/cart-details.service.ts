import { computed, inject, Injectable, signal } from '@angular/core';
import { BranchRepository } from '../../../shared/data-access/branch.repository';
import { BranchSelectionService } from '../../../shared/data-access/branch-selection.service';
import { CartLine, CartService } from '../../../shared/data-access/cart.service';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { getEffectivePrice, getStockInBranch, Product } from '../../../shared/models/product';

export interface CartLineDetail {
  product: Product;
  quantity: number;
  subtotal: number;
  /** Unidades que hay en la botica elegida (el servidor vuelve a validar al pagar). */
  hasEnoughStockInBranch: boolean;
}

/**
 * Une el carrito (ids y cantidades) con los productos y la botica elegida.
 * Lo usan el carrito y el checkout. El precio mostrado es referencial:
 * el que vale es el que calcula el servidor al crear el pedido.
 */
@Injectable({ providedIn: 'root' })
export class CartDetailsService {
  private readonly cartService = inject(CartService);
  private readonly productRepository = inject(ProductRepository);
  private readonly branchRepository = inject(BranchRepository);
  readonly branchSelection = inject(BranchSelectionService);

  private readonly loadedProductsSignal = signal<Map<string, Product>>(new Map());
  readonly isLoading = signal(true);

  readonly cartLineDetails = computed<CartLineDetail[]>(() => {
    const selectedBranchId = this.branchSelection.selectedBranchId();
    return this.cartService
      .cartLines()
      .map((cartLine) => this.buildLineDetail(cartLine, selectedBranchId))
      .filter((lineDetail): lineDetail is CartLineDetail => lineDetail !== null);
  });

  readonly itemsTotal = computed(
    () =>
      Math.round(
        this.cartLineDetails().reduce((total, lineDetail) => total + lineDetail.subtotal, 0) * 100,
      ) / 100,
  );
  readonly requiresPrescription = computed(() =>
    this.cartLineDetails().some((lineDetail) => lineDetail.product.requiresPrescription),
  );
  readonly hasStockProblems = computed(() =>
    this.cartLineDetails().some((lineDetail) => !lineDetail.hasEnoughStockInBranch),
  );
  readonly selectedBranch = this.branchSelection.selectedBranch;

  /** true si la botica tiene stock para todas las líneas del carrito (el servidor lo vuelve a validar). */
  canBranchFulfillCart(branchId: string): boolean {
    const loadedProducts = this.loadedProductsSignal();
    return this.cartService.cartLines().every((cartLine) => {
      const product = loadedProducts.get(cartLine.productId);
      return product !== undefined && getStockInBranch(product, branchId) >= cartLine.quantity;
    });
  }

  /** Carga productos y boticas; quita del carrito los productos que ya no se venden. */
  async loadCartDetails(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [activeBranches, cartProducts] = await Promise.all([
        this.branchRepository.findActiveBranches(),
        Promise.all(
          this.cartService
            .cartLines()
            .map((cartLine) => this.productRepository.findProductById(cartLine.productId)),
        ),
      ]);
      this.branchSelection.setAvailableBranches(activeBranches);
      const productsById = new Map<string, Product>();
      for (const cartProduct of cartProducts) {
        if (cartProduct?.isActive) {
          productsById.set(cartProduct.id, cartProduct);
        }
      }
      for (const cartLine of this.cartService.cartLines()) {
        if (!productsById.has(cartLine.productId)) {
          this.cartService.removeProduct(cartLine.productId);
        }
      }
      this.loadedProductsSignal.set(productsById);
    } finally {
      this.isLoading.set(false);
    }
  }

  private buildLineDetail(cartLine: CartLine, selectedBranchId: string): CartLineDetail | null {
    const product = this.loadedProductsSignal().get(cartLine.productId);
    if (!product) {
      return null;
    }
    return {
      product,
      quantity: cartLine.quantity,
      subtotal: getEffectivePrice(product) * cartLine.quantity,
      hasEnoughStockInBranch:
        Boolean(selectedBranchId) &&
        getStockInBranch(product, selectedBranchId) >= cartLine.quantity,
    };
  }
}
