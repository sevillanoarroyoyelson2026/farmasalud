import { ProductPrice } from '../../../shared/ui/product-price/product-price';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { CartService } from '../../../shared/data-access/cart.service';
import { BranchRepository } from '../../../shared/data-access/branch.repository';
import { BranchSelectionService } from '../../../shared/data-access/branch-selection.service';
import { CategoryRepository } from '../../../shared/data-access/category.repository';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { Category } from '../../../shared/models/category';
import { hasActivePromotion, Product } from '../../../shared/models/product';
import { CartNoticeService } from '../../../shared/ui/cart-notice/cart-notice';
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
  imports: [RouterLink, ProductPrice],
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.css',
})
export class CatalogPage implements OnInit {
  private readonly productRepository = inject(ProductRepository);
  private readonly categoryRepository = inject(CategoryRepository);
  private readonly branchRepository = inject(BranchRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly branchSelection = inject(BranchSelectionService);
  readonly cartService = inject(CartService);
  private readonly cartNotice = inject(CartNoticeService);
  readonly isStaffMember = inject(AuthService).isStaffMember;

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
    const selectedBranchId = this.branchSelection.selectedBranchId();
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
          selectedBranchId,
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
    effect(() => {
      const categoryFromUrl = this.categoria();
      if (categoryFromUrl) {
        this.selectedCategoryId.set(categoryFromUrl);
      }
    });
    effect(() => {
      const searchFromUrl = this.buscar();
      if (searchFromUrl) {
        this.searchText.set(searchFromUrl);
      }
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
      this.revealSelectedBranchStop();
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

  /** La botica guardada puede quedar fuera de vista en la fila de paraderos: se centra al cargar. */
  private revealSelectedBranchStop(): void {
    afterNextRender(
      () => {
        const stopsRow = this.hostElement.nativeElement.querySelector<HTMLElement>('.catalog-stops');
        const selectedStop = stopsRow?.querySelector<HTMLElement>('.catalog-stop.is-selected');
        if (stopsRow && selectedStop) {
          const stopLeft = selectedStop.getBoundingClientRect().left - stopsRow.getBoundingClientRect().left;
          stopsRow.scrollLeft += stopLeft - (stopsRow.clientWidth - selectedStop.offsetWidth) / 2;
        }
      },
      { injector: this.injector },
    );
  }

  selectBranch(branchId: string): void {
    this.branchSelection.selectBranch(branchId);
  }

  clearSearch(): void {
    this.searchText.set('');
  }

  /** % de descuento vigente para la placa sobre la foto (null si no hay promoción). */
  discountPercentOf(product: Product): number | null {
    return hasActivePromotion(product) ? (product.promotion?.discountPercent ?? null) : null;
  }

  addToCart(product: Product): void {
    this.cartService.addProduct(product.id);
    this.cartNotice.announceAddedProduct(product.name);
  }

  toggleOnlyAvailable(): void {
    this.isShowingOnlyAvailable.update((isShowing) => !isShowing);
  }
}
