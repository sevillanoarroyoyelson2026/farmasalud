import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
} from '@angular/core';
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

/** Paradero de la ruta: una botica activa con cuántos productos tiene en stock. */
interface RouteStop {
  branch: Branch;
  availableProductCount: number;
}

interface PromotedProductRow {
  product: Product;
  availability: ProductAvailability;
}

/** Ficha de texto del diagrama "muchos → uno". */
interface FlowStep {
  name: string;
  description: string;
}

/** Punto del diagrama: un círculo del motivo, con su tono por zona. */
interface DiagramDot {
  x: number;
  y: string;
  tone: 'pale' | 'deep' | 'ribbon' | 'order';
}

const FLOW_STEPS: FlowStep[] = [
  {
    name: 'Eliges',
    description: 'Busca en el catálogo y revisa el stock real de tu botica antes de comprar.',
  },
  {
    name: 'Ordenas',
    description: 'Arma tu pedido; si tu medicamento exige receta, un farmacéutico la valida.',
  },
  {
    name: 'Recibes',
    description: 'Paga en línea con tarjeta y sigue tu pedido hasta la puerta de tu casa.',
  },
];

/**
 * Puntos del diagrama "muchos → uno": dispersos a la izquierda, apretados en
 * una cinta al centro y ordenados en hileras a la derecha. Posiciones
 * deterministas (sin azar en cada render): ~120 círculos de 12px sobre un
 * lienzo de 1200 × 270.
 */
function buildDiagramDots(): DiagramDot[] {
  const dots: DiagramDot[] = [];
  const jitter = (seed: number): number => Math.sin(seed * 12.9898) * 0.5;

  // Zona izquierda: dispersión suelta en dos tonos pálidos.
  for (let column = 0; column < 11; column++) {
    for (let row = 0; row < 7; row++) {
      const seed = column * 7 + row;
      if (Math.abs(jitter(seed + 3)) < 0.25) continue;
      dots.push({
        x: 16 + column * 34 + jitter(seed) * 6,
        y: `${22 + row * 34 + jitter(seed + 9) * 6}px`,
        tone: seed % 2 === 0 ? 'pale' : 'deep',
      });
    }
  }

  // Zona central: cinta apretada de tres hileras.
  for (let column = 0; column < 25; column++) {
    for (let row = 0; row < 3; row++) {
      dots.push({
        x: 408 + column * 15,
        y: `${112 + row * 15}px`,
        tone: 'ribbon',
      });
    }
  }

  // Zona derecha: hileras parejas en el acento.
  for (let column = 0; column < 8; column++) {
    for (let row = 0; row < 6; row++) {
      dots.push({
        x: 836 + column * 44,
        y: `${30 + row * 42}px`,
        tone: 'order',
      });
    }
  }

  return dots;
}

/**
 * Inicio de la tienda: ficha impresa + la ruta de boticas en vivo (paraderos
 * con stock real), ofertas, el flujo de compra como diagrama, tablero de
 * categorías, cifras y cierre.
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

  readonly flowSteps = FLOW_STEPS;
  readonly diagramDots = buildDiagramDots();
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

  /** Categorías activas con su número de productos, para el tablero de fichas. */
  readonly categoryBoardRows = computed(() => {
    const products = this.products();
    return this.categories().map((category) => ({
      category,
      productCount: products.filter((product) => product.categoryId === category.id).length,
    }));
  });

  /** Boticas con delivery, para las cifras escalonadas. */
  readonly deliveryBranchCount = computed(
    () => this.branchSelection.availableBranches().filter((branch) => branch.offersDelivery).length,
  );

  /** Productos activos publicados, para las cifras escalonadas. */
  readonly productCount = computed(() => this.products().length);

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
