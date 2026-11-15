import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { getEffectivePrice, hasActivePromotion, Product } from '../../../shared/models/product';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { normalizeTextForSearch } from '../../../shared/utils/text-normalization';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

/**
 * Promociones: descuento porcentual con fecha de fin. El servidor aplica el precio
 * con descuento al cobrar; aquí solo se define. Los productos en promoción se
 * destacan en el inicio y el catálogo de la tienda.
 */
@Component({
  selector: 'app-admin-promotions-page',
  imports: [FormsModule, DialogPanel, CurrencyPipe, DatePipe],
  templateUrl: './admin-promotions-page.html',
})
export class AdminPromotionsPage implements OnInit {
  private readonly productRepository = inject(ProductRepository);
  private readonly logger = inject(AppLoggerService);

  readonly products = signal<Product[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly searchText = signal('');
  readonly isShowingOnlyPromoted = signal(true);

  readonly editingProduct = signal<Product | null>(null);
  readonly discountPercent = signal(10);
  readonly promotionEndDate = signal('');
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');
  readonly earliestEndDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  readonly visibleProducts = computed(() => {
    const normalizedSearch = normalizeTextForSearch(this.searchText());
    return this.products().filter(
      (product) =>
        (!this.isShowingOnlyPromoted() || hasActivePromotion(product)) &&
        normalizeTextForSearch(product.name).includes(normalizedSearch),
    );
  });
  readonly previewPrice = computed(() => {
    const product = this.editingProduct();
    return product ? Math.round(product.price * (1 - (Number(this.discountPercent()) || 0) / 100) * 100) / 100 : 0;
  });

  async ngOnInit(): Promise<void> {
    await this.loadProducts();
  }

  isPromoted(product: Product): boolean {
    return hasActivePromotion(product);
  }

  effectivePrice(product: Product): number {
    return getEffectivePrice(product);
  }

  updateSearchText(inputEvent: Event): void {
    this.searchText.set((inputEvent.target as HTMLInputElement).value);
    if (this.searchText()) {
      this.isShowingOnlyPromoted.set(false);
    }
  }

  openPromotionDialog(product: Product): void {
    this.editingProduct.set(product);
    this.discountPercent.set(product.promotion?.discountPercent ?? 10);
    this.promotionEndDate.set(
      product.promotion && hasActivePromotion(product)
        ? product.promotion.endsAt.toISOString().slice(0, 10)
        : new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
    );
    this.saveErrorMessage.set('');
  }

  closeDialog(): void {
    this.editingProduct.set(null);
  }

  async savePromotion(): Promise<void> {
    const discount = Number(this.discountPercent());
    if (!Number.isInteger(discount) || discount < 1 || discount > 70 || this.promotionEndDate() < this.earliestEndDate) {
      this.saveErrorMessage.set('El descuento va de 1 % a 70 % y la fecha de fin debe ser futura.');
      return;
    }
    await this.applyPromotion({ discountPercent: discount, endsAt: this.promotionEndDate() });
  }

  async removePromotion(): Promise<void> {
    await this.applyPromotion(null);
  }

  private async applyPromotion(promotion: { discountPercent: number; endsAt: string } | null): Promise<void> {
    const product = this.editingProduct();
    if (!product) {
      return;
    }
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    try {
      await this.productRepository.setProductPromotion(product.id, promotion);
      this.closeDialog();
      await this.loadProducts();
    } catch (error) {
      this.logger.logError('AdminPromotionsPage.applyPromotion', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudo guardar la promoción.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadProducts(): Promise<void> {
    this.loadErrorMessage.set('');
    try {
      this.products.set(await this.productRepository.findAllProducts());
    } catch (error) {
      this.logger.logError('AdminPromotionsPage.loadProducts', error);
      this.loadErrorMessage.set('No se pudieron cargar los productos.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
