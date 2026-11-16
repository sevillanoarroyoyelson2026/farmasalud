import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { AuthService } from '../../../core/auth/auth.service';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import {
  ALL_BRANCHES_OPTION,
  BranchSelectionService,
} from '../../../shared/data-access/branch-selection.service';
import { CustomerServiceRepository } from '../../../shared/data-access/customer-service.repository';
import { OrderRepository } from '../../../shared/data-access/order.repository';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import {
  calculateAverageFulfillmentMinutes,
  calculateAverageRating,
  calculateCorrectFulfillmentRate,
  calculatePercentageChange,
  calculateSalesTotal,
  countOrdersBy,
  countOrdersByHourOfDay,
  filterOrdersCreatedBetween,
  formatDurationInMinutes,
  groupSalesByBranch,
  groupSalesByDay,
  rankBestSellingProducts,
} from '../../../shared/models/business-indicators';
import {
  ACTIVE_ORDER_STATUSES,
  Order,
  ORDER_STATUS_LABEL,
  OrderStatus,
  PAYMENT_METHOD_LABEL,
  PaymentMethod,
} from '../../../shared/models/order';
import { getInternalStockStatus, getStockInBranch, getTotalStock, Product } from '../../../shared/models/product';
import { CATEGORICAL_SERIES_COLORS, formatSoles } from '../../../shared/ui/data-chart/chart-theme';
import { DataChart } from '../../../shared/ui/data-chart/data-chart';
import { Sparkline } from '../../../shared/ui/sparkline/sparkline';
import { buildOrdersByHourChart, buildRankingBarChart, buildSalesTrendChart } from './dashboard-charts';

const PERIOD_OPTIONS = [7, 30, 90];
const DAY_MS = 86_400_000;
/** Orden del flujo del pedido: así se leen las barras de "Pedidos por estado". */
const STATUS_DISPLAY_ORDER: OrderStatus[] = [
  'pending_prescription',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

interface IndicatorTile {
  label: string;
  value: string;
  /** Variación % frente al período anterior; null si no hay con qué comparar. */
  change: number | null;
  /** Para "tiempo de atención" bajar es bueno. */
  isLowerBetter?: boolean;
  previousText: string;
  sparklineValues: number[];
}

interface ShareSegment {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

interface ShareBar {
  title: string;
  segments: ShareSegment[];
  /** Texto para lectores de pantalla: "Tipo de entrega: Delivery 60 %, Recojo 40 %". */
  accessibleSummary: string;
}

/**
 * Dashboard de gestión con los indicadores del informe T2.
 * Pedidos en tiempo real (onSnapshot): al entrar un pedido nuevo, las cifras y los
 * gráficos se actualizan solos con animación. Se compara contra el período anterior.
 */
@Component({
  selector: 'app-admin-dashboard-page',
  imports: [RouterLink, DataChart, Sparkline, CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './admin-dashboard-page.html',
  styleUrl: './admin-dashboard-page.css',
})
export class AdminDashboardPage {
  private readonly authService = inject(AuthService);
  private readonly orderRepository = inject(OrderRepository);
  private readonly productRepository = inject(ProductRepository);
  private readonly customerServiceRepository = inject(CustomerServiceRepository);
  private readonly logger = inject(AppLoggerService);
  readonly branchSelection = inject(BranchSelectionService);

  readonly periodOptions = PERIOD_OPTIONS;
  readonly selectedPeriodDays = signal(30);
  /** Pedidos de este período y del anterior (para comparar). */
  readonly ordersOfBothPeriods = signal<Order[]>([]);
  readonly products = signal<Product[]>([]);
  readonly ratings = signal<number[]>([]);
  readonly pendingClaimsCount = signal(0);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly lastUpdatedAt = signal<Date | null>(null);

  readonly administratorName = computed(() => this.authService.currentSession()?.displayName?.split(' ')[0] ?? '');
  readonly selectedBranchName = computed(() => this.branchSelection.selectedBranch()?.name ?? 'Todas las sucursales');
  readonly isShowingAllBranches = computed(() => this.branchSelection.selectedBranchId() === ALL_BRANCHES_OPTION);

  // ---------------------------------------------------------------- períodos
  private readonly periodStart = computed(() => this.startOfDayDaysAgo(this.selectedPeriodDays() - 1));
  private readonly previousPeriodStart = computed(() => this.startOfDayDaysAgo(this.selectedPeriodDays() * 2 - 1));
  readonly currentOrders = computed(() =>
    filterOrdersCreatedBetween(this.ordersOfBothPeriods(), this.periodStart(), new Date(Date.now() + DAY_MS)),
  );
  private readonly previousOrders = computed(() =>
    filterOrdersCreatedBetween(this.ordersOfBothPeriods(), this.previousPeriodStart(), this.periodStart()),
  );
  private readonly currentSoldOrders = computed(() => this.currentOrders().filter((order) => order.status !== 'cancelled'));
  private readonly previousSoldOrders = computed(() => this.previousOrders().filter((order) => order.status !== 'cancelled'));
  readonly dailySales = computed(() => groupSalesByDay(this.currentOrders(), this.selectedPeriodDays()));

  // ---------------------------------------------------------------- indicadores
  readonly indicatorTiles = computed<IndicatorTile[]>(() => {
    const currentSales = calculateSalesTotal(this.currentOrders());
    const previousSales = calculateSalesTotal(this.previousOrders());
    const currentOrderCount = this.currentSoldOrders().length;
    const previousOrderCount = this.previousSoldOrders().length;
    const currentTicket = currentOrderCount ? currentSales / currentOrderCount : 0;
    const previousTicket = previousOrderCount ? previousSales / previousOrderCount : 0;
    const currentRate = calculateCorrectFulfillmentRate(this.currentOrders());
    const previousRate = calculateCorrectFulfillmentRate(this.previousOrders());
    const dailySales = this.dailySales();
    return [
      {
        label: 'Ventas',
        value: formatSoles(currentSales),
        change: calculatePercentageChange(currentSales, previousSales),
        previousText: `Antes: ${formatSoles(previousSales)}`,
        sparklineValues: dailySales.map((daySales) => daySales.salesTotal),
      },
      {
        label: 'Pedidos',
        value: String(currentOrderCount),
        change: calculatePercentageChange(currentOrderCount, previousOrderCount),
        previousText: `Antes: ${previousOrderCount}`,
        sparklineValues: dailySales.map((daySales) => daySales.orderCount),
      },
      {
        label: 'Ticket promedio',
        value: formatSoles(currentTicket),
        change: calculatePercentageChange(currentTicket, previousTicket),
        previousText: `Antes: ${formatSoles(previousTicket)}`,
        sparklineValues: dailySales.map((daySales) => (daySales.orderCount ? daySales.salesTotal / daySales.orderCount : 0)),
      },
      {
        label: 'Atención correcta',
        value: currentRate === null ? 'Sin datos' : `${currentRate.toLocaleString('es-PE')} %`,
        change: currentRate !== null && previousRate !== null ? calculatePercentageChange(currentRate, previousRate) : null,
        previousText: previousRate === null ? 'Sin período anterior' : `Antes: ${previousRate.toLocaleString('es-PE')} %`,
        sparklineValues: [],
      },
    ];
  });

  readonly averageFulfillmentTime = computed(() => {
    const averageMinutes = calculateAverageFulfillmentMinutes(this.currentOrders());
    return averageMinutes === null ? null : formatDurationInMinutes(averageMinutes);
  });
  readonly averageRating = computed(() => calculateAverageRating(this.ratings()));
  readonly ratingStars = [1, 2, 3, 4, 5];

  // ---------------------------------------------------------------- requiere atención
  readonly pendingPrescriptionsCount = computed(
    () => this.ordersOfBothPeriods().filter((order) => order.status === 'pending_prescription').length,
  );
  readonly activeOrdersCount = computed(
    () => this.ordersOfBothPeriods().filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status)).length,
  );
  readonly productsBelowMinimum = computed(() => {
    const selectedBranchId = this.branchSelection.selectedBranchId();
    const activeBranchIds = this.branchSelection.availableBranches().filter((branch) => branch.isActive).map((branch) => branch.id);
    return this.products().filter((product) => {
      if (!product.isActive) {
        return false;
      }
      const availableUnits =
        selectedBranchId === ALL_BRANCHES_OPTION ? getTotalStock(product, activeBranchIds) : getStockInBranch(product, selectedBranchId);
      return getInternalStockStatus(product, availableUnits) !== 'available';
    });
  });

  // ---------------------------------------------------------------- gráficos
  readonly salesTrendChart = computed(() => buildSalesTrendChart(this.dailySales()));
  readonly salesTrendSummary = computed(() => {
    const bestDay = [...this.dailySales()].sort((firstDay, secondDay) => secondDay.salesTotal - firstDay.salesTotal)[0];
    return bestDay && bestDay.salesTotal > 0
      ? `Ventas por día de los últimos ${this.selectedPeriodDays()} días. El mejor día fue el ${bestDay.date.toLocaleDateString('es-PE')} con ${formatSoles(bestDay.salesTotal)}.`
      : `Ventas por día de los últimos ${this.selectedPeriodDays()} días: sin ventas.`;
  });

  readonly ordersByStatus = computed(() => {
    const countByStatus = countOrdersBy(this.currentOrders(), (order) => order.status);
    return STATUS_DISPLAY_ORDER.filter((status) => countByStatus.has(status)).map((status) => ({
      label: ORDER_STATUS_LABEL[status],
      count: countByStatus.get(status) ?? 0,
    }));
  });
  readonly ordersByStatusChart = computed(() =>
    buildRankingBarChart(
      this.ordersByStatus().map((statusGroup) => statusGroup.label),
      this.ordersByStatus().map((statusGroup) => statusGroup.count),
      (value) => String(value),
      'Pedidos',
    ),
  );

  readonly salesByBranch = computed(() => groupSalesByBranch(this.currentOrders()));
  readonly salesByBranchChart = computed(() =>
    buildRankingBarChart(
      this.salesByBranch().map((branchSales) => branchSales.label.replace(/^Botica\s+/i, '')),
      this.salesByBranch().map((branchSales) => branchSales.amount),
      formatSoles,
      'Ventas',
    ),
  );

  readonly bestSellingProducts = computed(() => rankBestSellingProducts(this.currentOrders(), 6));
  readonly bestSellingProductsChart = computed(() =>
    buildRankingBarChart(
      this.bestSellingProducts().map((productSales) => productSales.productName),
      this.bestSellingProducts().map((productSales) => productSales.unitsSold),
      (value) => `${value} u.`,
      'Unidades vendidas',
    ),
  );

  readonly ordersByHour = computed(() => countOrdersByHourOfDay(this.currentOrders()));
  readonly ordersByHourChart = computed(() => buildOrdersByHourChart(this.ordersByHour()));
  readonly busiestHour = computed(() => {
    const ordersByHour = this.ordersByHour();
    const maximumOrders = Math.max(...ordersByHour);
    return maximumOrders > 0 ? ordersByHour.indexOf(maximumOrders) : null;
  });

  /** Barras de proporción: el color sigue a la categoría (orden fijo), nunca al ranking. */
  readonly shareBars = computed<ShareBar[]>(() => {
    const soldOrders = this.currentSoldOrders();
    const fulfillmentCounts = countOrdersBy(soldOrders, (order) => order.fulfillmentType);
    const paymentCounts = countOrdersBy(soldOrders, (order) => order.paymentMethod);
    const paymentOrder: PaymentMethod[] = ['simulated_card', 'cash_on_delivery', 'culqi_card'];
    return [
      this.buildShareBar('Tipo de entrega', [
        ['Delivery', fulfillmentCounts.get('delivery') ?? 0],
        ['Recojo en botica', fulfillmentCounts.get('pickup') ?? 0],
      ]),
      this.buildShareBar(
        'Forma de pago',
        paymentOrder.map((paymentMethod) => [PAYMENT_METHOD_LABEL[paymentMethod], paymentCounts.get(paymentMethod) ?? 0]),
      ),
    ];
  });

  private stopWatchingOrders: Unsubscribe | null = null;

  constructor() {
    // Pedidos en vivo: se vuelve a suscribir al cambiar sucursal o período.
    effect(() => {
      const branchId = this.branchSelection.selectedBranchId();
      const sinceDate = this.previousPeriodStart();
      this.watchOrders(branchId, sinceDate);
    });
    // Catálogo, reseñas y reclamos: se recargan al cambiar de sucursal.
    effect(() => {
      void this.loadSupportingData(this.branchSelection.selectedBranchId());
    });
    inject(DestroyRef).onDestroy(() => this.stopWatchingOrders?.());
  }

  selectPeriod(periodDays: number): void {
    this.selectedPeriodDays.set(periodDays);
  }

  describeChange(indicatorTile: IndicatorTile): 'up' | 'down' | 'flat' {
    if (indicatorTile.change === null || indicatorTile.change === 0) {
      return 'flat';
    }
    return indicatorTile.change > 0 ? 'up' : 'down';
  }

  isChangeGood(indicatorTile: IndicatorTile): boolean {
    const direction = this.describeChange(indicatorTile);
    return indicatorTile.isLowerBetter ? direction === 'down' : direction === 'up';
  }

  private buildShareBar(title: string, countedCategories: [string, number][]): ShareBar {
    const totalCount = countedCategories.reduce((total, [, count]) => total + count, 0);
    const segments = countedCategories
        .map(([label, count], categoryIndex) => ({
          label,
          count,
          percentage: totalCount ? Math.round((count / totalCount) * 100) : 0,
          color: CATEGORICAL_SERIES_COLORS[categoryIndex],
        }))
        .filter((segment) => segment.count > 0);
    return {
      title,
      segments,
      accessibleSummary: `${title}: ${segments.map((segment) => `${segment.label} ${segment.percentage} %`).join(', ')}`,
    };
  }

  private startOfDayDaysAgo(daysAgo: number): Date {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    startOfDay.setDate(startOfDay.getDate() - daysAgo);
    return startOfDay;
  }

  private watchOrders(branchId: string, sinceDate: Date): void {
    this.stopWatchingOrders?.();
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    this.stopWatchingOrders = this.orderRepository.watchOrdersSince(
      branchId,
      sinceDate,
      (orders) => {
        this.ordersOfBothPeriods.set(orders);
        this.lastUpdatedAt.set(new Date());
        this.isLoading.set(false);
      },
      (error) => {
        this.logger.logError('AdminDashboardPage.watchOrders', error);
        this.loadErrorMessage.set('No se pudieron cargar los pedidos. Revisa tu conexión.');
        this.isLoading.set(false);
      },
    );
  }

  private async loadSupportingData(branchId: string): Promise<void> {
    try {
      const [loadedProducts, branchReviews, allClaims] = await Promise.all([
        this.productRepository.findAllProducts(),
        this.customerServiceRepository.findReviews(branchId),
        this.customerServiceRepository.findAllClaims(),
      ]);
      this.products.set(loadedProducts);
      this.ratings.set(branchReviews.map((review) => review.rating));
      this.pendingClaimsCount.set(allClaims.filter((claim) => claim.status !== 'resolved').length);
    } catch (error) {
      this.logger.logError('AdminDashboardPage.loadSupportingData', error);
    }
  }
}
