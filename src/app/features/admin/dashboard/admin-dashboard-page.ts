import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  calculateSalesTotal,
  formatDurationInMinutes,
  isSameCalendarDay,
} from '../../../shared/models/business-indicators';
import { ACTIVE_ORDER_STATUSES, Order } from '../../../shared/models/order';
import {
  getInternalStockStatus,
  getStockInBranch,
  getTotalStock,
  Product,
} from '../../../shared/models/product';

const INDICATOR_PERIOD_DAYS = 30;

/**
 * Dashboard con los indicadores de las fichas del informe de procesos (T2):
 * eficiencia de venta, atención correcta, tiempo de atención, abastecimiento y satisfacción.
 * Últimos 30 días de la sucursal elegida en el encabezado (o de todas).
 */
@Component({
  selector: 'app-admin-dashboard-page',
  imports: [RouterLink, CurrencyPipe, DecimalPipe],
  templateUrl: './admin-dashboard-page.html',
  styleUrl: './admin-dashboard-page.css',
})
export class AdminDashboardPage {
  private readonly authService = inject(AuthService);
  private readonly orderRepository = inject(OrderRepository);
  private readonly productRepository = inject(ProductRepository);
  private readonly customerServiceRepository = inject(CustomerServiceRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly branchSelection = inject(BranchSelectionService);

  readonly indicatorPeriodDays = INDICATOR_PERIOD_DAYS;
  readonly recentOrders = signal<Order[]>([]);
  readonly products = signal<Product[]>([]);
  readonly ratings = signal<number[]>([]);
  readonly pendingClaimsCount = signal(0);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');

  readonly administratorName = computed(() => this.authService.currentSession()?.displayName ?? '');
  readonly selectedBranchName = computed(() => this.branchSelection.selectedBranch()?.name ?? 'todas las sucursales');

  readonly todaysOrders = computed(() =>
    this.recentOrders().filter((order) => order.createdAt && isSameCalendarDay(order.createdAt, new Date())),
  );
  readonly todaysSales = computed(() => calculateSalesTotal(this.todaysOrders()));
  readonly periodSales = computed(() => calculateSalesTotal(this.recentOrders()));
  readonly activeOrdersCount = computed(
    () => this.recentOrders().filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status)).length,
  );
  readonly pendingPrescriptionsCount = computed(
    () => this.recentOrders().filter((order) => order.status === 'pending_prescription').length,
  );
  readonly correctFulfillmentRate = computed(() => calculateCorrectFulfillmentRate(this.recentOrders()));
  readonly averageFulfillmentTime = computed(() => {
    const averageMinutes = calculateAverageFulfillmentMinutes(this.recentOrders());
    return averageMinutes === null ? null : formatDurationInMinutes(averageMinutes);
  });
  readonly averageRating = computed(() => calculateAverageRating(this.ratings()));

  readonly productsBelowMinimum = computed(() => {
    const selectedBranchId = this.branchSelection.selectedBranchId();
    const activeBranchIds = this.branchSelection
      .availableBranches()
      .filter((branch) => branch.isActive)
      .map((branch) => branch.id);
    return this.products().filter((product) => {
      if (!product.isActive) {
        return false;
      }
      const availableUnits =
        selectedBranchId === ALL_BRANCHES_OPTION
          ? getTotalStock(product, activeBranchIds)
          : getStockInBranch(product, selectedBranchId);
      return getInternalStockStatus(product, availableUnits) !== 'available';
    });
  });

  constructor() {
    effect(() => {
      void this.loadIndicators(this.branchSelection.selectedBranchId());
    });
  }

  private async loadIndicators(branchId: string): Promise<void> {
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    const periodStart = new Date(Date.now() - INDICATOR_PERIOD_DAYS * 86_400_000);
    try {
      const [periodOrders, loadedProducts, branchReviews, allClaims] = await Promise.all([
        this.orderRepository.findOrdersSince(branchId, periodStart),
        this.productRepository.findAllProducts(),
        this.customerServiceRepository.findReviews(branchId),
        this.customerServiceRepository.findAllClaims(),
      ]);
      this.recentOrders.set(periodOrders);
      this.products.set(loadedProducts);
      this.ratings.set(branchReviews.map((review) => review.rating));
      this.pendingClaimsCount.set(allClaims.filter((claim) => claim.status !== 'resolved').length);
    } catch (error) {
      this.logger.logError('AdminDashboardPage.loadIndicators', error);
      this.loadErrorMessage.set('No se pudieron calcular los indicadores. Revisa tu conexión.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
