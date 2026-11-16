import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
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
import { DELIVERY_FEE_IN_SOLES } from '../../../shared/models/order';
import { hasActivePromotion, Product } from '../../../shared/models/product';
import { ProductCard } from '../../../shared/ui/product-card/product-card';
import { RevealOnScroll } from '../../../shared/ui/reveal-on-scroll/reveal-on-scroll';
import { describeProductAvailability, ProductAvailability } from '../catalog/product-availability';

/** Diapositiva del carrusel principal. */
interface HeroSlide {
  eyebrow: string;
  title: string;
  text: string;
  ctaLabel: string;
  ctaLink: string;
  image: string;
  imageAlt: string;
  floatingBadge: string;
  tone: 'sunset' | 'cream' | 'cocoa';
}

interface ProductCardRow {
  product: Product;
  availability: ProductAvailability;
}

interface CategoryShortcut {
  category: Category;
  iconClass: string;
}

interface FeaturedTab {
  id: string;
  name: string;
}

interface CountdownPart {
  value: string;
  unit: string;
}

const MAXIMUM_OFFERS = 10;
const MAXIMUM_FEATURED_PRODUCTS = 8;
const MAXIMUM_FEATURED_TABS = 5;
const ALL_PRODUCTS_TAB = '';
const MILLISECONDS_PER_SECOND = 1000;

/** Ícono por palabra clave del nombre de la categoría (las categorías las crea el admin). */
const CATEGORY_ICON_BY_KEYWORD: [string, string][] = [
  ['analg', 'fa-capsules'],
  ['antibi', 'fa-bacteria'],
  ['grip', 'fa-head-side-cough'],
  ['respir', 'fa-lungs'],
  ['beb', 'fa-baby'],
  ['mam', 'fa-baby-carriage'],
  ['cuidado', 'fa-pump-soap'],
  ['auxilio', 'fa-kit-medical'],
  ['vitamin', 'fa-apple-whole'],
  ['suplement', 'fa-apple-whole'],
  ['derma', 'fa-hand-sparkles'],
  ['belleza', 'fa-spa'],
];

export function chooseCategoryIcon(categoryName: string): string {
  const normalizedName = categoryName.toLowerCase();
  return CATEGORY_ICON_BY_KEYWORD.find(([keyword]) => normalizedName.includes(keyword))?.[1] ?? 'fa-pills';
}

/** Días, horas, minutos y segundos que faltan; nunca negativo. */
export function splitRemainingTime(remainingMilliseconds: number): CountdownPart[] {
  const totalSeconds = Math.max(0, Math.floor(remainingMilliseconds / MILLISECONDS_PER_SECOND));
  const pad = (value: number): string => String(value).padStart(2, '0');
  return [
    { value: pad(Math.floor(totalSeconds / 86400)), unit: 'días' },
    { value: pad(Math.floor((totalSeconds % 86400) / 3600)), unit: 'horas' },
    { value: pad(Math.floor((totalSeconds % 3600) / 60)), unit: 'min' },
    { value: pad(totalSeconds % 60), unit: 'seg' },
  ];
}

/**
 * Inicio de la tienda: carrusel principal, accesos por categoría, ofertas con
 * cuenta regresiva, cinta de beneficios y productos destacados por pestañas.
 */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, ProductCard, RevealOnScroll],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage implements OnInit {
  private readonly productRepository = inject(ProductRepository);
  private readonly branchRepository = inject(BranchRepository);
  private readonly categoryRepository = inject(CategoryRepository);
  private readonly branchSelection = inject(BranchSelectionService);
  private readonly logger = inject(AppLoggerService);

  private readonly products = signal<Product[]>([]);
  private readonly categories = signal<Category[]>([]);
  private readonly currentTime = signal(Date.now());
  readonly isLoading = signal(true);

  // -- Carrusel principal --
  readonly activeSlideIndex = signal(0);
  readonly isCarouselPaused = signal(false);
  private swipeStartX: number | null = null;

  readonly heroSlides = computed<HeroSlide[]>(() => {
    const largestDiscount = Math.max(
      0,
      ...this.products()
        .filter((product) => hasActivePromotion(product))
        .map((product) => product.promotion?.discountPercent ?? 0),
    );
    return [
      {
        eyebrow: 'Ofertas de la semana',
        title: largestDiscount > 0 ? `Hasta -${largestDiscount}% en tu botica` : 'Tu botica de confianza, en línea',
        text: 'Medicamentos y cuidado personal con stock real y precios que te cuidan.',
        ctaLabel: 'Ver ofertas',
        ctaLink: '/catalogo',
        image: 'images/pills-and-medicines-02.jpg',
        imageAlt: 'Frascos de medicinas y pastillas sobre una superficie clara',
        floatingBadge: largestDiscount > 0 ? `-${largestDiscount}%` : 'Nuevo',
        tone: 'sunset',
      },
      {
        eyebrow: 'Delivery en Trujillo',
        title: `Tu pedido en casa por solo S/ ${DELIVERY_FEE_IN_SOLES}`,
        text: 'Compra en minutos desde tu celular y síguelo hasta tu puerta.',
        ctaLabel: 'Comprar ahora',
        ctaLink: '/catalogo',
        image: 'images/pills-and-medicines-01.jpg',
        imageAlt: 'Frascos de medicinas de colores sobre fondo claro',
        floatingBadge: 'Hoy mismo',
        tone: 'cream',
      },
      {
        eyebrow: 'Atención farmacéutica',
        title: 'Sube tu receta, nosotros la validamos',
        text: 'Un farmacéutico revisa cada receta antes de preparar tu pedido.',
        ctaLabel: 'Explorar catálogo',
        ctaLink: '/catalogo',
        image: 'images/former-pharmacy-shelves-with-medicines.jpg',
        imageAlt: 'Estantes de madera con frascos de cerámica de una botica tradicional',
        floatingBadge: 'Receta segura',
        tone: 'cocoa',
      },
    ];
  });

  // -- Categorías --
  readonly categoryShortcuts = computed<CategoryShortcut[]>(() =>
    this.categories().map((category) => ({ category, iconClass: chooseCategoryIcon(category.name) })),
  );

  // -- Ofertas con cuenta regresiva --
  readonly offerRows = computed<ProductCardRow[]>(() =>
    this.toCardRows(
      this.products()
        .filter((product) => hasActivePromotion(product))
        .sort(
          (firstProduct, secondProduct) =>
            (secondProduct.promotion?.discountPercent ?? 0) - (firstProduct.promotion?.discountPercent ?? 0),
        )
        .slice(0, MAXIMUM_OFFERS),
    ),
  );

  /** La promoción vigente que vence primero marca la cuenta regresiva. */
  readonly countdownParts = computed<CountdownPart[] | null>(() => {
    const promotionEndTimes = this.offerRows().map((offerRow) => offerRow.product.promotion?.endsAt.getTime() ?? 0);
    if (promotionEndTimes.length === 0) {
      return null;
    }
    return splitRemainingTime(Math.min(...promotionEndTimes) - this.currentTime());
  });

  // -- Destacados por pestañas --
  readonly selectedTabId = signal(ALL_PRODUCTS_TAB);

  readonly featuredTabs = computed<FeaturedTab[]>(() => {
    const categoryIdsWithProducts = new Set(this.products().map((product) => product.categoryId));
    return [
      { id: ALL_PRODUCTS_TAB, name: 'Todo' },
      ...this.categories()
        .filter((category) => categoryIdsWithProducts.has(category.id))
        .slice(0, MAXIMUM_FEATURED_TABS)
        .map((category) => ({ id: category.id, name: category.name })),
    ];
  });

  readonly featuredRows = computed<ProductCardRow[]>(() => {
    const selectedTabId = this.selectedTabId();
    const rows = this.toCardRows(
      this.products().filter(
        (product) => selectedTabId === ALL_PRODUCTS_TAB || product.categoryId === selectedTabId,
      ),
    );
    // Primero lo que se puede comprar ya.
    return rows
      .sort(
        (firstRow, secondRow) =>
          Number(firstRow.availability.stockStatus === 'out_of_stock') -
          Number(secondRow.availability.stockStatus === 'out_of_stock'),
      )
      .slice(0, MAXIMUM_FEATURED_PRODUCTS);
  });

  readonly tickerItems = [
    { icon: 'fa-truck-fast', text: `Delivery en Trujillo por S/ ${DELIVERY_FEE_IN_SOLES}` },
    { icon: 'fa-store', text: 'Recojo gratis en tu botica' },
    { icon: 'fa-user-doctor', text: 'Receta validada por farmacéutico' },
    { icon: 'fa-shield-halved', text: 'Pago seguro con tarjeta' },
    { icon: 'fa-boxes-stacked', text: 'Stock real antes de comprar' },
  ];

  constructor() {
    const clockInterval = setInterval(() => this.currentTime.set(Date.now()), MILLISECONDS_PER_SECOND);
    inject(DestroyRef).onDestroy(() => clearInterval(clockInterval));
  }

  /** Productos, categorías y boticas en paralelo (las boticas solo para calcular disponibilidad). */
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
      // El carrusel y los accesos siguen funcionando aunque no lleguen los productos.
      this.logger.logError('HomePage.loadProducts', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  showSlide(slideIndex: number): void {
    const slideCount = this.heroSlides().length;
    this.activeSlideIndex.set((slideIndex + slideCount) % slideCount);
  }

  showNextSlide(): void {
    this.showSlide(this.activeSlideIndex() + 1);
  }

  showPreviousSlide(): void {
    this.showSlide(this.activeSlideIndex() - 1);
  }

  startSwipe(pointerEvent: PointerEvent): void {
    this.swipeStartX = pointerEvent.clientX;
  }

  finishSwipe(pointerEvent: PointerEvent): void {
    if (this.swipeStartX === null) {
      return;
    }
    const swipeDistance = pointerEvent.clientX - this.swipeStartX;
    this.swipeStartX = null;
    if (Math.abs(swipeDistance) > 50) {
      if (swipeDistance < 0) {
        this.showNextSlide();
      } else {
        this.showPreviousSlide();
      }
    }
  }

  scrollOffers(offersTrack: HTMLElement, direction: 1 | -1): void {
    offersTrack.scrollBy({ left: direction * offersTrack.clientWidth * 0.8, behavior: 'smooth' });
  }

  selectTab(tabId: string): void {
    this.selectedTabId.set(tabId);
  }

  private toCardRows(products: Product[]): ProductCardRow[] {
    const activeBranchIds = this.branchSelection.availableBranches().map((branch) => branch.id);
    return products.map((product) => ({
      product,
      availability: describeProductAvailability(product, ALL_BRANCHES_OPTION, activeBranchIds),
    }));
  }
}
