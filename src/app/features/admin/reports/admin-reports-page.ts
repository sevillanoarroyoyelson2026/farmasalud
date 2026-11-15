import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { BranchSelectionService } from '../../../shared/data-access/branch-selection.service';
import { OrderRepository } from '../../../shared/data-access/order.repository';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { StockLotRepository } from '../../../shared/data-access/stock-lot.repository';
import {
  calculateSalesTotal,
  DailySales,
  groupSalesByDay,
  rankBestSellingProducts,
} from '../../../shared/models/business-indicators';
import { Order, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '../../../shared/models/order';
import { isLotNearExpiration, StockLot } from '../../../shared/models/stock-lot';

interface ExpiringLotRow {
  productName: string;
  lot: StockLot;
}

const REPORT_PERIOD_OPTIONS = [7, 30, 90];

/** Escapa un valor para CSV (evita romper columnas y la inyección de fórmulas en Excel). */
function toCsvCell(cellValue: string | number): string {
  const cellText = String(cellValue);
  const safeText = /^[=+\-@]/.test(cellText) ? `'${cellText}` : cellText;
  return `"${safeText.replace(/"/g, '""')}"`;
}

/**
 * Reportes de gestión: ventas por día, rotación de productos, medios de pago,
 * lotes por vencer y exportación a CSV de los pedidos del período.
 */
@Component({
  selector: 'app-admin-reports-page',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './admin-reports-page.html',
  styleUrl: './admin-reports-page.css',
})
export class AdminReportsPage {
  private readonly orderRepository = inject(OrderRepository);
  private readonly productRepository = inject(ProductRepository);
  private readonly stockLotRepository = inject(StockLotRepository);
  private readonly logger = inject(AppLoggerService);
  readonly branchSelection = inject(BranchSelectionService);

  readonly periodOptions = REPORT_PERIOD_OPTIONS;
  readonly selectedPeriodDays = signal(30);
  readonly periodOrders = signal<Order[]>([]);
  readonly expiringLots = signal<ExpiringLotRow[]>([]);
  readonly isLoading = signal(true);
  readonly isLoadingLots = signal(false);
  readonly loadErrorMessage = signal('');
  readonly isShowingSalesTable = signal(false);

  readonly selectedBranchName = computed(() => this.branchSelection.selectedBranch()?.name ?? 'Todas las sucursales');
  readonly dailySales = computed(() => groupSalesByDay(this.periodOrders(), this.selectedPeriodDays()));
  readonly maximumDailySales = computed(() => Math.max(...this.dailySales().map((daySales) => daySales.salesTotal), 1));
  readonly periodSalesTotal = computed(() => calculateSalesTotal(this.periodOrders()));
  readonly nonCancelledOrdersCount = computed(
    () => this.periodOrders().filter((order) => order.status !== 'cancelled').length,
  );
  readonly averageTicket = computed(() =>
    this.nonCancelledOrdersCount() === 0 ? 0 : this.periodSalesTotal() / this.nonCancelledOrdersCount(),
  );
  readonly bestSellingProducts = computed(() => rankBestSellingProducts(this.periodOrders()));
  readonly maximumUnitsSold = computed(() =>
    Math.max(...this.bestSellingProducts().map((productSales) => productSales.unitsSold), 1),
  );
  readonly ordersByStatus = computed(() => this.countBy((order) => ORDER_STATUS_LABEL[order.status]));
  readonly ordersByPaymentMethod = computed(() => this.countBy((order) => PAYMENT_METHOD_LABEL[order.paymentMethod]));
  readonly ordersByFulfillment = computed(() =>
    this.countBy((order) => (order.fulfillmentType === 'delivery' ? 'Delivery' : 'Recojo en botica')),
  );

  constructor() {
    effect(() => {
      void this.loadOrders(this.branchSelection.selectedBranchId(), this.selectedPeriodDays());
    });
  }

  selectPeriod(periodDays: number): void {
    this.selectedPeriodDays.set(periodDays);
  }

  /** Altura de la barra en % del máximo (mínimo visible si hubo ventas). */
  calculateBarHeight(daySales: DailySales): number {
    if (daySales.salesTotal === 0) {
      return 0;
    }
    return Math.max((daySales.salesTotal / this.maximumDailySales()) * 100, 2);
  }

  /** Carga los lotes de cada producto con stock en la sucursal (puede tardar con catálogos grandes). */
  async loadExpiringLots(): Promise<void> {
    this.isLoadingLots.set(true);
    try {
      const branchId = this.branchSelection.selectedBranchId();
      const products = (await this.productRepository.findAllProducts()).filter((product) =>
        Object.entries(product.stockByBranch).some(
          ([stockBranchId, availableUnits]) => availableUnits > 0 && (!branchId || stockBranchId === branchId),
        ),
      );
      const lotsByProduct = await Promise.all(
        products.map(async (product) => ({
          product,
          lots: await this.stockLotRepository.findLotsOfProduct(product.id, branchId),
        })),
      );
      this.expiringLots.set(
        lotsByProduct
          .flatMap(({ product, lots }) =>
            lots
              .filter((lot) => lot.quantityAvailable > 0 && isLotNearExpiration(lot))
              .map((lot) => ({ productName: product.name, lot })),
          )
          .sort((firstRow, secondRow) => (firstRow.lot.expirationDate?.getTime() ?? 0) - (secondRow.lot.expirationDate?.getTime() ?? 0)),
      );
    } catch (error) {
      this.logger.logError('AdminReportsPage.loadExpiringLots', error);
    } finally {
      this.isLoadingLots.set(false);
    }
  }

  describeBranch(branchId: string): string {
    return this.branchSelection.availableBranches().find((branch) => branch.id === branchId)?.name ?? branchId;
  }

  exportOrdersToCsv(): void {
    const headerRow = ['Pedido', 'Fecha', 'Botica', 'Cliente', 'Estado', 'Entrega', 'Pago', 'Productos', 'Delivery', 'Total'];
    const dataRows = this.periodOrders().map((order) => [
      order.orderNumber,
      order.createdAt ? order.createdAt.toLocaleString('es-PE') : '',
      order.branchName,
      order.customerName,
      ORDER_STATUS_LABEL[order.status],
      order.fulfillmentType === 'delivery' ? 'Delivery' : 'Recojo',
      PAYMENT_METHOD_LABEL[order.paymentMethod],
      order.itemsTotal.toFixed(2),
      order.deliveryFee.toFixed(2),
      order.orderTotal.toFixed(2),
    ]);
    const csvContent = [headerRow, ...dataRows].map((row) => row.map(toCsvCell).join(';')).join('\r\n');
    const csvBlob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(csvBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `pedidos-farmasalud-${this.selectedPeriodDays()}-dias.csv`;
    downloadLink.click();
    URL.revokeObjectURL(downloadUrl);
  }

  private countBy(describeGroup: (order: Order) => string): { groupName: string; orderCount: number }[] {
    const countByGroup = new Map<string, number>();
    for (const order of this.periodOrders()) {
      const groupName = describeGroup(order);
      countByGroup.set(groupName, (countByGroup.get(groupName) ?? 0) + 1);
    }
    return [...countByGroup.entries()]
      .map(([groupName, orderCount]) => ({ groupName, orderCount }))
      .sort((firstGroup, secondGroup) => secondGroup.orderCount - firstGroup.orderCount);
  }

  private async loadOrders(branchId: string, periodDays: number): Promise<void> {
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    this.expiringLots.set([]);
    try {
      const periodStart = new Date();
      periodStart.setHours(0, 0, 0, 0);
      periodStart.setDate(periodStart.getDate() - (periodDays - 1));
      this.periodOrders.set(await this.orderRepository.findOrdersSince(branchId, periodStart));
    } catch (error) {
      this.logger.logError('AdminReportsPage.loadOrders', error);
      this.loadErrorMessage.set('No se pudieron cargar los datos del reporte.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
