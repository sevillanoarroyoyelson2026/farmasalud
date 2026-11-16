import { CartNoticeService } from '../../../shared/ui/cart-notice/cart-notice';
import { ProductPrice } from '../../../shared/ui/product-price/product-price';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { CartService, MAXIMUM_UNITS_PER_PRODUCT } from '../../../shared/data-access/cart.service';
import { BranchRepository } from '../../../shared/data-access/branch.repository';
import { BranchSelectionService } from '../../../shared/data-access/branch-selection.service';
import { CategoryRepository } from '../../../shared/data-access/category.repository';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { Branch } from '../../../shared/models/branch';
import {
  getCustomerStockStatus,
  getStockInBranch,
  Product,
  StockStatus,
} from '../../../shared/models/product';
import { describeProductAvailability } from '../catalog/product-availability';

interface BranchAvailability {
  branch: Branch;
  stockStatus: StockStatus;
}

const BRANCH_STOCK_LABEL: Record<StockStatus, string> = {
  available: 'Disponible',
  low_stock: 'Últimas unidades',
  out_of_stock: 'Agotado',
};

/** Ficha del producto con la disponibilidad en cada botica activa. */
@Component({
  selector: 'app-product-detail-page',
  imports: [RouterLink, ProductPrice],
  templateUrl: './product-detail-page.html',
  styleUrl: './product-detail-page.css',
})
export class ProductDetailPage implements OnInit {
  private readonly productRepository = inject(ProductRepository);
  private readonly categoryRepository = inject(CategoryRepository);
  private readonly branchRepository = inject(BranchRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly pageTitle = inject(Title);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly cartNotice = inject(CartNoticeService);
  readonly branchSelection = inject(BranchSelectionService);

  /** Parámetro de ruta `/producto/:productId`. */
  readonly productId = input.required<string>();

  readonly branchStockLabel = BRANCH_STOCK_LABEL;
  readonly maximumUnitsPerProduct = MAXIMUM_UNITS_PER_PRODUCT;
  readonly isStaffMember = this.authService.isStaffMember;
  readonly selectedQuantity = signal(1);
  readonly product = signal<Product | null>(null);
  readonly unitsInCart = computed(() => {
    const loadedProduct = this.product();
    return loadedProduct ? this.cartService.getQuantityOf(loadedProduct.id) : 0;
  });
  readonly canAddToCart = computed(
    () =>
      this.selectedBranchAvailability()?.stockStatus !== 'out_of_stock' && this.product() !== null,
  );
  readonly categoryName = signal('');
  readonly isLoading = signal(true);

  readonly selectedBranchAvailability = computed(() => {
    const loadedProduct = this.product();
    if (!loadedProduct) {
      return null;
    }
    const activeBranchIds = this.branchSelection.availableBranches().map((branch) => branch.id);
    return describeProductAvailability(
      loadedProduct,
      this.branchSelection.selectedBranchId(),
      activeBranchIds,
    );
  });

  readonly availabilityByBranch = computed<BranchAvailability[]>(() => {
    const loadedProduct = this.product();
    if (!loadedProduct) {
      return [];
    }
    return this.branchSelection.availableBranches().map((branch) => ({
      branch,
      stockStatus: getCustomerStockStatus(getStockInBranch(loadedProduct, branch.id)),
    }));
  });

  async ngOnInit(): Promise<void> {
    try {
      const [loadedProduct, activeCategories, activeBranches] = await Promise.all([
        this.productRepository.findProductById(this.productId()),
        this.categoryRepository.findActiveCategories(),
        this.branchRepository.findActiveBranches(),
      ]);
      this.branchSelection.setAvailableBranches(activeBranches);
      if (loadedProduct?.isActive) {
        this.product.set(loadedProduct);
        this.categoryName.set(
          activeCategories.find((category) => category.id === loadedProduct.categoryId)?.name ?? '',
        );
        this.pageTitle.setTitle(`${loadedProduct.name} | Farmasalud`);
      }
    } catch (error) {
      this.logger.logError('ProductDetailPage.loadProduct', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectBranch(branchId: string): void {
    this.branchSelection.selectBranch(branchId);
  }

  changeSelectedQuantity(quantityDifference: number): void {
    this.selectedQuantity.update((currentQuantity) =>
      Math.min(Math.max(currentQuantity + quantityDifference, 1), MAXIMUM_UNITS_PER_PRODUCT),
    );
  }

  addToCart(): void {
    const loadedProduct = this.product();
    if (loadedProduct && this.canAddToCart()) {
      this.cartService.addProduct(loadedProduct.id, this.selectedQuantity());
      this.cartNotice.announceAddedProduct(loadedProduct.name);
      this.selectedQuantity.set(1);
    }
  }
}
