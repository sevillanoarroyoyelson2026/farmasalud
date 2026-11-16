import { afterNextRender, Component, computed, ElementRef, inject, Injector, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { BranchRepository } from '../../../shared/data-access/branch.repository';
import { CategoryRepository } from '../../../shared/data-access/category.repository';
import {
  ALL_BRANCHES_OPTION,
  BranchSelectionService,
} from '../../../shared/data-access/branch-selection.service';
import { CartService } from '../../../shared/data-access/cart.service';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { Branch } from '../../../shared/models/branch';
import { Category } from '../../../shared/models/category';
import { getStockInBranch, hasActivePromotion, Product } from '../../../shared/models/product';
import { CartNoticeService } from '../../../shared/ui/cart-notice/cart-notice';
import { CountUp } from '../../../shared/ui/count-up/count-up';
import { ProductPrice } from '../../../shared/ui/product-price/product-price';
import { RevealOnScroll } from '../../../shared/ui/reveal-on-scroll/reveal-on-scroll';
import { describeProductAvailability, ProductAvailability } from '../catalog/product-availability';

const MAXIMUM_FEATURED_PROMOTIONS = 5;
const SKELETON_STOP_COUNT = 6;

interface PurchaseStep {
  iconClass: string;
  title: string;
  description: string;
}

/** Paradero de la ruta: una botica activa con cuántos productos tiene en stock. */
interface RouteStop {
  branch: Branch;
  availableProductCount: number;
}

interface PromotedProductRow {
  product: Product;
  availability: ProductAvailability;
}

/** Pasos del proceso de atención y dispensación digital (procedimiento 04.02 del informe T2). */
const PURCHASE_STEPS: PurchaseStep[] = [
  {
    iconClass: 'fas fa-store',
    title: 'Elige tu botica',
    description: 'Ves el stock real de la botica más cercana antes de comprar.',
  },
  {
    iconClass: 'fas fa-file-prescription',
    title: 'Sube tu receta',
    description: 'Si el medicamento la requiere, un farmacéutico la valida antes de despachar.',
  },
  {
    iconClass: 'fas fa-credit-card',
    title: 'Paga seguro',
    description: 'Pago con tarjeta en línea (en esta demo el cobro es simulado).',
  },
  {
    iconClass: 'fas fa-truck-fast',
    title: 'Recibe en casa',
    description: 'Sigue el estado de tu pedido hasta la entrega.',
  },
];

/**
 * Inicio de la tienda. Las boticas reales se muestran como paraderos de una ruta:
 * elegir uno fija la botica con la que el catálogo calcula la disponibilidad.
 */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, ProductPrice, RevealOnScroll, CountUp],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage implements OnInit {
  private readonly productRepository = inject(ProductRepository);
  private readonly branchRepository = inject(BranchRepository);
  private readonly categoryRepository = inject(CategoryRepository);
  private readonly router = inject(Router);
  private readonly logger = inject(AppLoggerService);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly branchSelection = inject(BranchSelectionService);
  readonly cartService = inject(CartService);
  private readonly cartNotice = inject(CartNoticeService);
  readonly isStaffMember = inject(AuthService).isStaffMember;
  readonly currentSession = inject(AuthService).currentSession;

  readonly purchaseSteps = PURCHASE_STEPS;
  readonly skeletonStops = Array.from({ length: SKELETON_STOP_COUNT }, (_, stopIndex) => stopIndex);

  private readonly products = signal<Product[]>([]);
  private readonly categories = signal<Category[]>([]);
  readonly isLoadingRoute = signal(true);
  readonly hasRouteLoadFailed = signal(false);
  readonly searchTerm = signal('');

  readonly routeStops = computed<RouteStop[]>(() =>
    this.branchSelection.availableBranches().map((branch) => ({
      branch,
      availableProductCount: this.products().filter(
        (product) => getStockInBranch(product, branch.id) > 0,
      ).length,
    })),
  );

  readonly selectedStopIndex = computed(() =>
    this.routeStops().findIndex(
      (routeStop) => routeStop.branch.id === this.branchSelection.selectedBranchId(),
    ),
  );

  readonly promotedProductRows = computed<PromotedProductRow[]>(() => {
    const selectedBranchId = this.branchSelection.selectedBranchId();
    const activeBranchIds = this.branchSelection.availableBranches().map((branch) => branch.id);
    return this.products()
      .filter((product) => hasActivePromotion(product))
      .sort(
        (firstProduct, secondProduct) =>
          (secondProduct.promotion?.discountPercent ?? 0) -
          (firstProduct.promotion?.discountPercent ?? 0),
      )
      .slice(0, MAXIMUM_FEATURED_PROMOTIONS)
      .map((product) => ({
        product,
        availability: describeProductAvailability(product, selectedBranchId, activeBranchIds),
      }));
  });

  /** Categorías activas con su número de productos, para el tablero de categorías. */
  readonly categoryBoardRows = computed(() => {
    const products = this.products();
    return this.categories().map((category) => ({
      category,
      productCount: products.filter((product) => product.categoryId === category.id).length,
    }));
  });

  /** Boticas con delivery, para la franja de cifras. */
  readonly deliveryBranchCount = computed(
    () => this.branchSelection.availableBranches().filter((branch) => branch.offersDelivery).length,
  );

  /** Productos activos publicados, para la franja de cifras. */
  readonly productCount = computed(() => this.products().length);

  /** Icono por familia de categoría; si no hay coincidencia, un rótulo genérico. */
  categoryIcon(categoryName: string): string {
    const normalized = categoryName.toLowerCase();
    if (normalized.includes('analg')) return 'fas fa-tablets';
    if (normalized.includes('antibi')) return 'fas fa-capsules';
    if (normalized.includes('vitamin') || normalized.includes('suplement')) {
      return 'fas fa-lemon';
    }
    if (normalized.includes('cuidado') || normalized.includes('higiene')) {
      return 'fas fa-pump-soap';
    }
    if (normalized.includes('derm') || normalized.includes('piel')) return 'fas fa-hand-dots';
    if (normalized.includes('materno') || normalized.includes('infant')) return 'fas fa-baby';
    if (normalized.includes('equipo') || normalized.includes('dispositivo')) {
      return 'fas fa-kit-medical';
    }
    if (normalized.includes('respirat') || normalized.includes('gripa')) return 'fas fa-lungs';
    return 'fas fa-shapes';
  }

  /** Productos y boticas en paralelo. Si falla, la ruta y las ofertas no aparecen; el buscador sigue funcionando. */
  async ngOnInit(): Promise<void> {
    try {
      const [activeProducts, activeBranches, activeCategories] = await Promise.all([
        this.productRepository.findActiveProducts(),
        this.branchRepository.findActiveBranches(),
        this.categoryRepository.findActiveCategories(),
      ]);
      this.products.set(activeProducts);
      this.branchSelection.setAvailableBranches(activeBranches);
      this.categories.set(activeCategories);
      // La botica guardada puede quedar fuera de vista en la línea: se centra sin mover la página.
      afterNextRender(
        () => {
          const scroller = this.hostElement.nativeElement.querySelector<HTMLElement>('.route-line-scroller');
          const selectedStop = scroller?.querySelector<HTMLElement>('.route-stop-button.is-selected');
          if (scroller && selectedStop) {
            const stopLeft = selectedStop.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
            scroller.scrollLeft += stopLeft - (scroller.clientWidth - selectedStop.offsetWidth) / 2;
          }
        },
        { injector: this.injector },
      );
    } catch (error) {
      this.logger.logError('HomePage.loadRoute', error);
      this.hasRouteLoadFailed.set(true);
    } finally {
      this.isLoadingRoute.set(false);
    }
  }

  updateSearchTerm(inputEvent: Event): void {
    this.searchTerm.set((inputEvent.target as HTMLInputElement).value);
  }

  searchCatalog(submitEvent: Event): void {
    submitEvent.preventDefault();
    const trimmedSearchTerm = this.searchTerm().trim();
    void this.router.navigate(['/catalogo'], {
      queryParams: trimmedSearchTerm ? { buscar: trimmedSearchTerm } : {},
    });
  }

  selectStop(branchId: string, clickEvent: Event): void {
    const isAlreadySelected = this.branchSelection.selectedBranchId() === branchId;
    this.branchSelection.selectBranch(isAlreadySelected ? ALL_BRANCHES_OPTION : branchId);
    (clickEvent.currentTarget as HTMLElement).scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }

  addToCart(product: Product): void {
    this.cartService.addProduct(product.id);
    this.cartNotice.announceAddedProduct(product.name);
  }
}
