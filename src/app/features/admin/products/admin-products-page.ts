import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { CategoryRepository } from '../../../shared/data-access/category.repository';
import { ImageUploadService } from '../../../shared/data-access/image-upload.service';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { Category } from '../../../shared/models/category';
import { Product, ProductFormValue } from '../../../shared/models/product';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { normalizeTextForSearch } from '../../../shared/utils/text-normalization';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

const ALL_CATEGORIES_FILTER = '';

/**
 * Catálogo de productos del administrador: datos, precio, receta e imagen.
 * El stock NO se edita aquí: entra por lotes (pantalla "Lotes y stock").
 */
@Component({
  selector: 'app-admin-products-page',
  imports: [ReactiveFormsModule, DialogPanel, CurrencyPipe],
  templateUrl: './admin-products-page.html',
  styles: `
    .product-thumbnail {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      width: 44px;
      height: 44px;
      overflow: hidden;
      border-radius: var(--radius-sm);
      background: var(--color-primary-soft);
      color: var(--color-primary);
    }
    .product-thumbnail img,
    .product-image-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .product-name-cell {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 220px;
    }
    .product-image-picker {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .product-image-preview {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      width: 88px;
      height: 88px;
      overflow: hidden;
      border: 1px dashed var(--color-border);
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      font-size: 1.5rem;
    }
  `,
})
export class AdminProductsPage implements OnInit {
  private readonly productRepository = inject(ProductRepository);
  private readonly categoryRepository = inject(CategoryRepository);
  private readonly imageUploadService = inject(ImageUploadService);
  private readonly logger = inject(AppLoggerService);
  private readonly formBuilder = inject(FormBuilder);

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly searchText = signal('');
  readonly selectedCategoryFilter = signal(ALL_CATEGORIES_FILTER);

  readonly isDialogOpen = signal(false);
  readonly editingProductId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly isUploadingImage = signal(false);
  readonly saveErrorMessage = signal('');

  readonly categoryNameById = computed(
    () => new Map(this.categories().map((category) => [category.id, category.name])),
  );

  readonly filteredProducts = computed(() => {
    const normalizedSearch = normalizeTextForSearch(this.searchText());
    const categoryFilter = this.selectedCategoryFilter();
    return this.products().filter((product) => {
      const matchesCategory = categoryFilter === ALL_CATEGORIES_FILTER || product.categoryId === categoryFilter;
      const searchableText = normalizeTextForSearch(
        `${product.name} ${product.genericName} ${product.laboratory}`,
      );
      return matchesCategory && searchableText.includes(normalizedSearch);
    });
  });

  readonly productForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    genericName: ['', [Validators.maxLength(120)]],
    presentation: ['', [Validators.required, Validators.maxLength(120)]],
    laboratory: ['', [Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(1000)]],
    categoryId: ['', [Validators.required]],
    price: [0, [Validators.required, Validators.min(0.1), Validators.max(100000)]],
    minimumStock: [5, [Validators.required, Validators.min(0), Validators.max(100000), Validators.pattern(/^\d+$/)]],
    requiresPrescription: [false],
    imageUrl: [''],
    isActive: [true],
  });

  async ngOnInit(): Promise<void> {
    await this.loadCatalog();
  }

  updateSearchText(inputEvent: Event): void {
    this.searchText.set((inputEvent.target as HTMLInputElement).value);
  }

  updateCategoryFilter(changeEvent: Event): void {
    this.selectedCategoryFilter.set((changeEvent.target as HTMLSelectElement).value);
  }

  openNewProductDialog(): void {
    this.editingProductId.set(null);
    this.productForm.reset();
    this.openDialog();
  }

  openEditProductDialog(product: Product): void {
    this.editingProductId.set(product.id);
    const { id: _productId, stockByBranch: _stockByBranch, ...productFormValue } = product;
    this.productForm.reset(productFormValue);
    this.openDialog();
  }

  closeDialog(): void {
    this.isDialogOpen.set(false);
  }

  async uploadSelectedImage(changeEvent: Event): Promise<void> {
    const fileInput = changeEvent.target as HTMLInputElement;
    const selectedImage = fileInput.files?.[0];
    fileInput.value = '';
    if (!selectedImage) {
      return;
    }
    this.saveErrorMessage.set('');
    this.isUploadingImage.set(true);
    try {
      const uploadedImageUrl = await this.imageUploadService.uploadProductImage(selectedImage);
      this.productForm.controls.imageUrl.setValue(uploadedImageUrl);
    } catch (error) {
      this.logger.logError('AdminProductsPage.uploadSelectedImage', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudo subir la imagen.'));
    } finally {
      this.isUploadingImage.set(false);
    }
  }

  removeImage(): void {
    this.productForm.controls.imageUrl.setValue('');
  }

  async saveProduct(): Promise<void> {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    const formValue = this.productForm.getRawValue();
    const productFormValue: ProductFormValue = {
      ...formValue,
      price: Number(formValue.price),
      minimumStock: Number(formValue.minimumStock),
    };
    try {
      await this.productRepository.saveProduct(this.editingProductId(), productFormValue);
      this.closeDialog();
      await this.loadCatalog();
    } catch (error) {
      this.logger.logError('AdminProductsPage.saveProduct', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudo guardar el producto.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  hasFieldError(fieldName: keyof typeof this.productForm.controls): boolean {
    const formControl = this.productForm.controls[fieldName];
    return formControl.invalid && formControl.touched;
  }

  private openDialog(): void {
    this.saveErrorMessage.set('');
    this.isDialogOpen.set(true);
  }

  private async loadCatalog(): Promise<void> {
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    try {
      const [loadedProducts, loadedCategories] = await Promise.all([
        this.productRepository.findAllProducts(),
        this.categoryRepository.findAllCategories(),
      ]);
      this.products.set(loadedProducts);
      this.categories.set(loadedCategories);
    } catch (error) {
      this.logger.logError('AdminProductsPage.loadCatalog', error);
      this.loadErrorMessage.set('No se pudo cargar el catálogo.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
