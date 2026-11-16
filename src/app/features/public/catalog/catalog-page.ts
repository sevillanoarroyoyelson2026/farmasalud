import {
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { BranchRepository } from '../../../shared/data-access/branch.repository';
import {
  ALL_BRANCHES_OPTION,
  BranchSelectionService,
} from '../../../shared/data-access/branch-selection.service';
import { CategoryRepository } from '../../../shared/data-access/category.repository';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { Category } from '../../../shared/models/category';
import { Product } from '../../../shared/models/product';
import { ProductCard } from '../../../shared/ui/product-card/product-card';
import { normalizeTextForSearch } from '../../../shared/utils/text-normalization';
import { describeProductAvailability, ProductAvailability } from './product-availability';

interface CatalogProductCard {
  product: Product;
  categoryName: string;
  availability: ProductAvailability;
}

const ALL_CATEGORIES_FILTER = '';

/**
 * Catálogo público (procedimiento 04.02: el cliente busca, revisa disponibilidad
 * real en su botica y elige). Los productos agotados se muestran al final.
 */
@Component({
  selector: 'app-catalog-page',
  imports: [ProductCard],
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.css',
})
export class CatalogPage implements OnInit {
  private readonly productRepository = inject(ProductRepository);
  private readonly categoryRepository = inject(CategoryRepository);
  private readonly branchRepository = inject(BranchRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly branchSelection = inject(BranchSelectionService);

  /** `?categoria=analgesicos` desde enlaces externos o del inicio. */
  readonly categoria = input<string>();
  /** `?buscar=paracetamol` desde el buscador del inicio. */
  readonly buscar = input<string>();

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly searchText = signal('');
  readonly selectedCategoryId = signal(ALL_CATEGORIES_FILTER);
  readonly isShowingOnlyAvailable = signal(false);

  readonly activeBranchIds = computed(() =>
    this.branchSelection.availableBranches().map((branch) => branch.id),
  );

  readonly visibleProductCards = computed<CatalogProductCard[]>(() => {
    const normalizedSearch = normalizeTextForSearch(this.searchText());
    const selectedCategoryId = this.selectedCategoryId();
    const categoryNameById = new Map(
      this.categories().map((category) => [category.id, category.name]),
    );
    const visibleCategoryIds = new Set(this.categories().map((category) => category.id));

    return this.products()
      .filter((product) => visibleCategoryIds.has(product.categoryId))
      .filter(
        (product) =>
          selectedCategoryId === ALL_CATEGORIES_FILTER || product.categoryId === selectedCategoryId,
      )
      .filter((product) =>
        normalizeTextForSearch(
          `${product.name} ${product.genericName} ${product.laboratory}`,
        ).includes(normalizedSearch),
      )
      .map((product) => ({
        product,
        categoryName: categoryNameById.get(product.categoryId) ?? '',
        availability: describeProductAvailability(
          product,
          ALL_BRANCHES_OPTION,
          this.activeBranchIds(),
        ),
      }))
      .filter(
        (productCard) =>
          !this.isShowingOnlyAvailable() || productCard.availability.stockStatus !== 'out_of_stock',
      )
      .sort(
        (firstCard, secondCard) =>
          Number(firstCard.availability.stockStatus === 'out_of_stock') -
          Number(secondCard.availability.stockStatus === 'out_of_stock'),
      );
  });

  constructor() {
    // La URL manda: al llegar desde la cabecera (categoría o búsqueda) se reemplazan ambos filtros.
    effect(() => {
      this.selectedCategoryId.set(this.categoria() ?? ALL_CATEGORIES_FILTER);
    });
    effect(() => {
      this.searchText.set(this.buscar() ?? '');
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const [activeProducts, activeCategories, activeBranches] = await Promise.all([
        this.productRepository.findActiveProducts(),
        this.categoryRepository.findActiveCategories(),
        this.branchRepository.findActiveBranches(),
      ]);
      this.products.set(activeProducts);
      this.categories.set(activeCategories);
      this.branchSelection.setAvailableBranches(activeBranches);
    } catch (error) {
      this.logger.logError('CatalogPage.loadCatalog', error);
      this.loadErrorMessage.set(
        'No pudimos cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  updateSearchText(inputEvent: Event): void {
    this.searchText.set((inputEvent.target as HTMLInputElement).value);
  }

  selectCategory(categoryId: string): void {
    this.selectedCategoryId.set(categoryId);
  }

  clearSearch(): void {
    this.searchText.set('');
  }

  toggleOnlyAvailable(): void {
    this.isShowingOnlyAvailable.update((isShowing) => !isShowing);
  }
}
