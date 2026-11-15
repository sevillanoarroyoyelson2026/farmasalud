import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { BranchSelectionService } from '../../../shared/data-access/branch-selection.service';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { PurchasingRepository } from '../../../shared/data-access/purchasing.repository';
import { Product } from '../../../shared/models/product';
import {
  getPendingUnits,
  GoodsReception,
  PURCHASE_ORDER_STATUS_LABEL,
  PURCHASE_ORDER_STATUS_TONE,
  PurchaseOrder,
  Supplier,
} from '../../../shared/models/purchasing';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

interface PurchaseItemDraft {
  productId: string;
  quantity: number;
  unitCost: number;
}

function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Órdenes de compra (procedimiento O01.02): emisión directa o desde cotización,
 * seguimiento de lo recibido por la botica y anulación si aún no llegó nada.
 */
@Component({
  selector: 'app-admin-purchase-orders-page',
  imports: [FormsModule, DialogPanel, CurrencyPipe, DatePipe],
  templateUrl: './admin-purchase-orders-page.html',
  styles: `
    .draft-row { display: grid; grid-template-columns: minmax(0, 1fr) 90px 110px auto; gap: 0.5rem; margin-bottom: 0.5rem; }
    @media (max-width: 576px) { .draft-row { grid-template-columns: 1fr 1fr; } }
  `,
})
export class AdminPurchaseOrdersPage {
  private readonly purchasingRepository = inject(PurchasingRepository);
  private readonly productRepository = inject(ProductRepository);
  private readonly logger = inject(AppLoggerService);
  readonly branchSelection = inject(BranchSelectionService);

  readonly statusLabel = PURCHASE_ORDER_STATUS_LABEL;
  readonly statusTone = PURCHASE_ORDER_STATUS_TONE;
  readonly getPendingUnits = getPendingUnits;
  readonly purchaseOrders = signal<PurchaseOrder[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly products = signal<Product[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');

  readonly isCreateDialogOpen = signal(false);
  readonly draftSupplierId = signal('');
  readonly draftBranchId = signal('');
  readonly draftExpectedDate = signal('');
  readonly draftNotes = signal('');
  readonly purchaseItemDrafts = signal<PurchaseItemDraft[]>([]);
  readonly draftTotal = computed(() =>
    this.purchaseItemDrafts().reduce(
      (total, itemDraft) => total + (Number(itemDraft.quantity) || 0) * (Number(itemDraft.unitCost) || 0),
      0,
    ),
  );

  readonly selectedPurchaseOrderId = signal<string | null>(null);
  readonly receptionsOfSelectedOrder = signal<GoodsReception[]>([]);
  readonly cancellationReason = signal('');
  readonly selectedPurchaseOrder = computed(
    () => this.purchaseOrders().find((purchaseOrder) => purchaseOrder.id === this.selectedPurchaseOrderId()) ?? null,
  );
  readonly activeSuppliers = computed(() => this.suppliers().filter((supplier) => supplier.isActive));

  constructor() {
    effect(() => {
      void this.loadPurchaseOrders(this.branchSelection.selectedBranchId());
    });
    void this.loadCatalogs();
  }

  openCreateDialog(): void {
    this.draftSupplierId.set('');
    this.draftBranchId.set(this.branchSelection.selectedBranchId());
    this.draftExpectedDate.set(formatDateForInput(new Date(Date.now() + 3 * 86_400_000)));
    this.draftNotes.set('');
    this.purchaseItemDrafts.set([{ productId: '', quantity: 10, unitCost: 1 }]);
    this.saveErrorMessage.set('');
    this.isCreateDialogOpen.set(true);
  }

  addPurchaseItemDraft(): void {
    this.purchaseItemDrafts.update((itemDrafts) => [...itemDrafts, { productId: '', quantity: 10, unitCost: 1 }]);
  }

  removePurchaseItemDraft(draftIndex: number): void {
    this.purchaseItemDrafts.update((itemDrafts) => itemDrafts.filter((_itemDraft, index) => index !== draftIndex));
  }

  recalculateDraftTotal(): void {
    this.purchaseItemDrafts.update((itemDrafts) => [...itemDrafts]);
  }

  async createPurchaseOrder(): Promise<void> {
    const validItems = this.purchaseItemDrafts()
      .filter((itemDraft) => itemDraft.productId)
      .map((itemDraft) => ({
        productId: itemDraft.productId,
        quantity: Number(itemDraft.quantity),
        unitCost: Math.round(Number(itemDraft.unitCost) * 100) / 100,
      }));
    const hasInvalidItems = validItems.some(
      (item) => !Number.isInteger(item.quantity) || item.quantity < 1 || !(item.unitCost > 0),
    );
    const hasDuplicatedProducts = new Set(validItems.map((item) => item.productId)).size !== validItems.length;
    if (!this.draftSupplierId() || !this.draftBranchId() || !this.draftExpectedDate() || validItems.length === 0 || hasInvalidItems || hasDuplicatedProducts) {
      this.saveErrorMessage.set('Completa proveedor, botica, fecha y productos con cantidad y costo válidos (sin repetir).');
      return;
    }
    await this.runSave(async () => {
      await this.purchasingRepository.createPurchaseOrder({
        supplierId: this.draftSupplierId(),
        branchId: this.draftBranchId(),
        quotationId: null,
        expectedDeliveryDate: this.draftExpectedDate(),
        notes: this.draftNotes().trim(),
        items: validItems,
      });
      this.isCreateDialogOpen.set(false);
    });
  }

  async openPurchaseOrder(purchaseOrder: PurchaseOrder): Promise<void> {
    this.selectedPurchaseOrderId.set(purchaseOrder.id);
    this.cancellationReason.set('');
    this.saveErrorMessage.set('');
    this.receptionsOfSelectedOrder.set([]);
    try {
      this.receptionsOfSelectedOrder.set(
        await this.purchasingRepository.findReceptionsOfPurchaseOrder(purchaseOrder.id, purchaseOrder.branchId),
      );
    } catch (error) {
      this.logger.logError('AdminPurchaseOrdersPage.loadReceptions', error);
    }
  }

  closeDialogs(): void {
    this.isCreateDialogOpen.set(false);
    this.selectedPurchaseOrderId.set(null);
  }

  async cancelPurchaseOrder(): Promise<void> {
    const purchaseOrder = this.selectedPurchaseOrder();
    if (!purchaseOrder) {
      return;
    }
    if (this.cancellationReason().trim().length < 5) {
      this.saveErrorMessage.set('Escribe el motivo de la anulación (mínimo 5 caracteres).');
      return;
    }
    await this.runSave(async () => {
      await this.purchasingRepository.cancelPurchaseOrder(purchaseOrder.id, this.cancellationReason().trim());
      this.closeDialogs();
    });
  }

  printPurchaseOrder(): void {
    window.print();
  }

  private async runSave(saveOperation: () => Promise<void>): Promise<void> {
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    try {
      await saveOperation();
      await this.loadPurchaseOrders(this.branchSelection.selectedBranchId());
    } catch (error) {
      this.logger.logError('AdminPurchaseOrdersPage.save', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudieron guardar los cambios.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadCatalogs(): Promise<void> {
    try {
      const [loadedSuppliers, loadedProducts] = await Promise.all([
        this.purchasingRepository.findAllSuppliers(),
        this.productRepository.findAllProducts(),
      ]);
      this.suppliers.set(loadedSuppliers);
      this.products.set(loadedProducts);
    } catch (error) {
      this.logger.logError('AdminPurchaseOrdersPage.loadCatalogs', error);
    }
  }

  private async loadPurchaseOrders(branchId: string): Promise<void> {
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    try {
      this.purchaseOrders.set(await this.purchasingRepository.findPurchaseOrders(branchId));
    } catch (error) {
      this.logger.logError('AdminPurchaseOrdersPage.loadPurchaseOrders', error);
      this.loadErrorMessage.set('No se pudieron cargar las órdenes de compra.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
