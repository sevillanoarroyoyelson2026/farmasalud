import { DatePipe } from '@angular/common';
import { afterNextRender, Component, computed, effect, inject, Injector, input, OnInit, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import {
  ALL_BRANCHES_OPTION,
  BranchSelectionService,
} from '../../../shared/data-access/branch-selection.service';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { StockLotRepository } from '../../../shared/data-access/stock-lot.repository';
import {
  getInternalStockStatus,
  getStockInBranch,
  getTotalStock,
  Product,
  StockStatus,
} from '../../../shared/models/product';
import { isLotNearExpiration, StockEntryReason, StockLot } from '../../../shared/models/stock-lot';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { normalizeTextForSearch } from '../../../shared/utils/text-normalization';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

interface ProductStockRow {
  product: Product;
  availableUnits: number;
  stockStatus: StockStatus;
}

const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  out_of_stock: 'Sin stock',
  low_stock: 'Bajo el mínimo',
  available: 'Suficiente',
};

function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Stock por sucursal e ingreso de lotes (procedimiento O02.03: registro en inventario).
 * Usa la sucursal elegida en el header del panel; "Todas" suma las boticas activas.
 */
@Component({
  selector: 'app-admin-stock-page',
  imports: [ReactiveFormsModule, DialogPanel, DatePipe],
  templateUrl: './admin-stock-page.html',
  styles: `
    /* Fila a la que llevó una notificación: se resalta y late dos veces */
    tr.is-highlighted td { background: var(--color-warning-soft); }
    tr.is-highlighted td:first-child { box-shadow: inset 4px 0 0 var(--color-warning); }
    tr.is-highlighted { animation: stock-row-highlight 1.1s ease-in-out 2; }
    @keyframes stock-row-highlight { 50% { opacity: 0.55; } }
    @media (prefers-reduced-motion: reduce) { tr.is-highlighted { animation: none; } }
  `,
})
export class AdminStockPage implements OnInit {
  private readonly productRepository = inject(ProductRepository);
  private readonly stockLotRepository = inject(StockLotRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly injector = inject(Injector);
  readonly branchSelection = inject(BranchSelectionService);

  /** Query params que pone la campana de notificaciones: `?producto=…&sucursal=…`. */
  readonly producto = input<string>();
  readonly sucursal = input<string>();
  /** Producto al que llevó una notificación (se resalta y se desplaza hasta él). */
  readonly highlightedProductId = signal<string | null>(null);

  readonly stockStatusLabel = STOCK_STATUS_LABEL;
  readonly products = signal<Product[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly searchText = signal('');
  readonly isShowingOnlyAlerts = signal(false);

  readonly productForLotRegistration = signal<Product | null>(null);
  readonly productForLotHistory = signal<Product | null>(null);
  readonly lotsOfSelectedProduct = signal<StockLot[]>([]);
  readonly isLoadingLots = signal(false);
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');
  readonly earliestAllowedExpirationDate = formatDateForInput(new Date(Date.now() + 86_400_000));

  readonly selectedBranchLabel = computed(
    () => this.branchSelection.selectedBranch()?.name ?? 'todas las sucursales',
  );

  readonly productStockRows = computed<ProductStockRow[]>(() => {
    const selectedBranchId = this.branchSelection.selectedBranchId();
    const activeBranchIds = this.branchSelection
      .availableBranches()
      .filter((branch) => branch.isActive)
      .map((branch) => branch.id);
    const normalizedSearch = normalizeTextForSearch(this.searchText());

    return this.products()
      .filter((product) => normalizeTextForSearch(`${product.name} ${product.genericName}`).includes(normalizedSearch))
      .map((product) => {
        const availableUnits =
          selectedBranchId === ALL_BRANCHES_OPTION
            ? getTotalStock(product, activeBranchIds)
            : getStockInBranch(product, selectedBranchId);
        return { product, availableUnits, stockStatus: getInternalStockStatus(product, availableUnits) };
      })
      .filter((stockRow) => !this.isShowingOnlyAlerts() || stockRow.stockStatus !== 'available');
  });

  readonly lotForm = this.formBuilder.nonNullable.group({
    branchId: ['', [Validators.required]],
    lotNumber: ['', [Validators.required, Validators.maxLength(40), Validators.pattern(/^[A-Za-z0-9./-]+$/)]],
    expirationDate: ['', [Validators.required]],
    quantity: [1, [Validators.required, Validators.min(1), Validators.max(100000), Validators.pattern(/^\d+$/)]],
    entryReason: ['initial_stock' as StockEntryReason, [Validators.required]],
  });

  /** `data.startWithAlertsOnly` en la ruta (pantalla "Alertas de stock" del trabajador). */
  readonly startWithAlertsOnly = input(false);

  constructor() {
    // Se reacciona también si ya estabas en esta pantalla y abres otra notificación.
    effect(() => {
      const productIdFromNotification = this.producto();
      const branchIdFromNotification = this.sucursal();
      untracked(() => this.focusNotifiedProduct(productIdFromNotification ?? null, branchIdFromNotification ?? null));
    });
  }

  async ngOnInit(): Promise<void> {
    this.isShowingOnlyAlerts.set(this.startWithAlertsOnly());
    await this.loadProducts();
  }

  updateSearchText(inputEvent: Event): void {
    this.searchText.set((inputEvent.target as HTMLInputElement).value);
  }

  toggleAlertsFilter(): void {
    this.isShowingOnlyAlerts.update((isShowing) => !isShowing);
  }

  describeBranch(branchId: string): string {
    return this.branchSelection.availableBranches().find((branch) => branch.id === branchId)?.name ?? branchId;
  }

  isNearExpiration(stockLot: StockLot): boolean {
    return isLotNearExpiration(stockLot);
  }

  openLotRegistration(product: Product): void {
    this.lotForm.reset({
      branchId: this.branchSelection.selectedBranchId(),
      lotNumber: '',
      expirationDate: '',
      quantity: 1,
      entryReason: 'initial_stock',
    });
    this.saveErrorMessage.set('');
    this.productForLotRegistration.set(product);
  }

  async openLotHistory(product: Product): Promise<void> {
    this.productForLotHistory.set(product);
    this.lotsOfSelectedProduct.set([]);
    this.isLoadingLots.set(true);
    try {
      this.lotsOfSelectedProduct.set(
        await this.stockLotRepository.findLotsOfProduct(product.id, this.branchSelection.selectedBranchId()),
      );
    } catch (error) {
      this.logger.logError('AdminStockPage.openLotHistory', error);
    } finally {
      this.isLoadingLots.set(false);
    }
  }

  closeDialogs(): void {
    this.productForLotRegistration.set(null);
    this.productForLotHistory.set(null);
  }

  async registerLot(): Promise<void> {
    const product = this.productForLotRegistration();
    if (!product || this.lotForm.invalid) {
      this.lotForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    const formValue = this.lotForm.getRawValue();
    try {
      await this.stockLotRepository.registerStockLot({
        productId: product.id,
        ...formValue,
        lotNumber: formValue.lotNumber.trim().toUpperCase(),
        quantity: Number(formValue.quantity),
      });
      this.closeDialogs();
      await this.loadProducts();
    } catch (error) {
      this.logger.logError('AdminStockPage.registerLot', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudo registrar el lote.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  hasLotFieldError(fieldName: keyof typeof this.lotForm.controls): boolean {
    const formControl = this.lotForm.controls[fieldName];
    return formControl.invalid && formControl.touched;
  }

  /**
   * Viene de una notificación: el admin pasa a la botica de la alerta (el trabajador ya
   * está fijo en la suya), se limpia la búsqueda y se resalta la fila del producto.
   */
  private focusNotifiedProduct(productId: string | null, branchId: string | null): void {
    if (!productId) {
      return;
    }
    if (branchId && this.authService.currentSession()?.role === 'admin') {
      this.branchSelection.selectBranch(branchId);
    }
    this.searchText.set('');
    this.isShowingOnlyAlerts.set(false);
    this.highlightedProductId.set(productId);
    this.scrollToHighlightedRowWhenVisible();
  }

  private scrollToHighlightedRowWhenVisible(attemptsLeft = 20): void {
    afterNextRender(
      () => {
        const highlightedRow = document.getElementById(`stock-row-${this.highlightedProductId()}`);
        if (highlightedRow) {
          highlightedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (attemptsLeft > 0) {
          // La tabla aún está cargando: se reintenta en breve.
          setTimeout(() => this.scrollToHighlightedRowWhenVisible(attemptsLeft - 1), 150);
        }
      },
      { injector: this.injector },
    );
  }

  private async loadProducts(): Promise<void> {
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    try {
      this.products.set(await this.productRepository.findAllProducts());
    } catch (error) {
      this.logger.logError('AdminStockPage.loadProducts', error);
      this.loadErrorMessage.set('No se pudo cargar el stock.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
