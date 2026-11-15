import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { BranchSelectionService } from '../../../shared/data-access/branch-selection.service';
import { ProductRepository } from '../../../shared/data-access/product.repository';
import { PurchasingRepository } from '../../../shared/data-access/purchasing.repository';
import { Product } from '../../../shared/models/product';
import {
  evaluateSupplierOffers,
  OfferEvaluation,
  Quotation,
  Supplier,
  SupplierOffer,
} from '../../../shared/models/purchasing';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

interface RequestedItemDraft {
  productId: string;
  quantity: number;
}

interface OfferDraft {
  supplierId: string;
  deliveryDays: number;
  paymentTerms: string;
  unitPriceByProduct: Record<string, number | null>;
}

const QUOTATION_STATUS_LABEL: Record<Quotation['status'], string> = {
  open: 'Abierta',
  awarded: 'Adjudicada',
  cancelled: 'Cancelada',
};

function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Cotizaciones (procedimiento O01.02): se piden precios de varios productos a varios
 * proveedores, se comparan por total y plazo, y la mejor oferta se convierte en orden de compra.
 */
@Component({
  selector: 'app-admin-quotations-page',
  imports: [FormsModule, DialogPanel, CurrencyPipe, DatePipe],
  templateUrl: './admin-quotations-page.html',
  styles: `
    .comparison-table td, .comparison-table th { white-space: nowrap; }
    .comparison-best { background: var(--color-accent-soft) !important; }
    .draft-row { display: grid; grid-template-columns: minmax(0, 1fr) 110px auto; gap: 0.5rem; margin-bottom: 0.5rem; }
  `,
})
export class AdminQuotationsPage implements OnInit {
  private readonly purchasingRepository = inject(PurchasingRepository);
  private readonly productRepository = inject(ProductRepository);
  private readonly logger = inject(AppLoggerService);
  readonly branchSelection = inject(BranchSelectionService);

  readonly quotationStatusLabel = QUOTATION_STATUS_LABEL;
  readonly quotations = signal<Quotation[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly products = signal<Product[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');
  readonly successMessage = signal('');

  // Nueva cotización
  readonly isCreateDialogOpen = signal(false);
  readonly newQuotationTitle = signal('');
  readonly newQuotationBranchId = signal('');
  readonly requestedItemDrafts = signal<RequestedItemDraft[]>([]);

  // Ofertas y comparación
  readonly selectedQuotationId = signal<string | null>(null);
  readonly offerDraft = signal<OfferDraft | null>(null);
  readonly selectedQuotation = computed(
    () => this.quotations().find((quotation) => quotation.id === this.selectedQuotationId()) ?? null,
  );
  readonly offerEvaluations = computed<OfferEvaluation[]>(() => {
    const quotation = this.selectedQuotation();
    return quotation ? evaluateSupplierOffers(quotation) : [];
  });
  readonly offerDraftSupplierName = computed(
    () => this.suppliers().find((supplier) => supplier.id === this.offerDraft()?.supplierId)?.name ?? '',
  );
  readonly suppliersWithoutOffer = computed(() => {
    const quotedSupplierIds = new Set(this.selectedQuotation()?.supplierOffers.map((offer) => offer.supplierId) ?? []);
    return this.suppliers().filter((supplier) => supplier.isActive && !quotedSupplierIds.has(supplier.id));
  });

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  describeBranch(branchId: string): string {
    return this.branchSelection.availableBranches().find((branch) => branch.id === branchId)?.name ?? branchId;
  }

  // ------------------------------------------------------------ nueva cotización
  openCreateDialog(): void {
    this.newQuotationTitle.set('');
    this.newQuotationBranchId.set(this.branchSelection.selectedBranchId());
    this.requestedItemDrafts.set([{ productId: '', quantity: 10 }]);
    this.saveErrorMessage.set('');
    this.isCreateDialogOpen.set(true);
  }

  addRequestedItemDraft(): void {
    this.requestedItemDrafts.update((itemDrafts) => [...itemDrafts, { productId: '', quantity: 10 }]);
  }

  removeRequestedItemDraft(draftIndex: number): void {
    this.requestedItemDrafts.update((itemDrafts) => itemDrafts.filter((_itemDraft, index) => index !== draftIndex));
  }

  async createQuotation(): Promise<void> {
    const validItemDrafts = this.requestedItemDrafts().filter(
      (itemDraft) => itemDraft.productId && Number.isInteger(Number(itemDraft.quantity)) && Number(itemDraft.quantity) > 0,
    );
    const hasDuplicatedProducts = new Set(validItemDrafts.map((itemDraft) => itemDraft.productId)).size !== validItemDrafts.length;
    if (this.newQuotationTitle().trim().length < 3 || !this.newQuotationBranchId() || validItemDrafts.length === 0 || hasDuplicatedProducts) {
      this.saveErrorMessage.set('Completa el título, la botica destino y al menos un producto (sin repetir).');
      return;
    }
    await this.runSave(async () => {
      await this.purchasingRepository.createQuotation(
        this.newQuotationTitle().trim(),
        this.newQuotationBranchId(),
        validItemDrafts.map((itemDraft) => ({
          productId: itemDraft.productId,
          productName: this.products().find((product) => product.id === itemDraft.productId)?.name ?? '',
          quantity: Number(itemDraft.quantity),
        })),
      );
      this.isCreateDialogOpen.set(false);
    });
  }

  // ------------------------------------------------------------ ofertas
  openQuotation(quotation: Quotation): void {
    this.selectedQuotationId.set(quotation.id);
    this.offerDraft.set(null);
    this.saveErrorMessage.set('');
  }

  closeDialogs(): void {
    this.isCreateDialogOpen.set(false);
    this.selectedQuotationId.set(null);
    this.offerDraft.set(null);
  }

  startOfferDraft(supplierId: string): void {
    const supplier = this.suppliers().find((candidate) => candidate.id === supplierId);
    const quotation = this.selectedQuotation();
    if (!supplier || !quotation) {
      return;
    }
    const existingOffer = quotation.supplierOffers.find((offer) => offer.supplierId === supplierId);
    this.offerDraft.set({
      supplierId,
      deliveryDays: existingOffer?.deliveryDays ?? supplier.deliveryDays,
      paymentTerms: existingOffer?.paymentTerms ?? supplier.paymentTerms,
      unitPriceByProduct: Object.fromEntries(
        quotation.requestedItems.map((requestedItem) => [
          requestedItem.productId,
          existingOffer?.unitPriceByProduct[requestedItem.productId] ?? null,
        ]),
      ),
    });
  }

  selectSupplierForOffer(changeEvent: Event): void {
    this.startOfferDraft((changeEvent.target as HTMLSelectElement).value);
  }

  async saveOfferDraft(): Promise<void> {
    const quotation = this.selectedQuotation();
    const draft = this.offerDraft();
    const supplier = this.suppliers().find((candidate) => candidate.id === draft?.supplierId);
    if (!quotation || !draft || !supplier) {
      return;
    }
    const unitPriceByProduct: Record<string, number> = {};
    for (const [productId, unitPrice] of Object.entries(draft.unitPriceByProduct)) {
      const parsedPrice = Number(unitPrice);
      if (unitPrice !== null && Number.isFinite(parsedPrice) && parsedPrice > 0) {
        unitPriceByProduct[productId] = Math.round(parsedPrice * 100) / 100;
      }
    }
    const savedOffer: SupplierOffer = {
      supplierId: supplier.id,
      supplierName: supplier.name,
      deliveryDays: Math.max(0, Math.floor(Number(draft.deliveryDays) || 0)),
      paymentTerms: draft.paymentTerms.trim().slice(0, 80),
      unitPriceByProduct,
    };
    const updatedOffers = [
      ...quotation.supplierOffers.filter((offer) => offer.supplierId !== supplier.id),
      savedOffer,
    ];
    await this.runSave(async () => {
      await this.purchasingRepository.saveSupplierOffers(quotation.id, updatedOffers);
      this.offerDraft.set(null);
    });
  }

  async removeOffer(supplierId: string): Promise<void> {
    const quotation = this.selectedQuotation();
    if (!quotation) {
      return;
    }
    await this.runSave(() =>
      this.purchasingRepository.saveSupplierOffers(
        quotation.id,
        quotation.supplierOffers.filter((offer) => offer.supplierId !== supplierId),
      ),
    );
  }

  async awardOffer(offerEvaluation: OfferEvaluation): Promise<void> {
    const quotation = this.selectedQuotation();
    if (!quotation || offerEvaluation.offerTotal === null) {
      return;
    }
    const expectedDeliveryDate = new Date(Date.now() + Math.max(offerEvaluation.offer.deliveryDays, 1) * 86_400_000);
    await this.runSave(async () => {
      const createdPurchaseOrder = await this.purchasingRepository.createPurchaseOrder({
        supplierId: offerEvaluation.offer.supplierId,
        branchId: quotation.branchId,
        quotationId: quotation.id,
        expectedDeliveryDate: formatDateForInput(expectedDeliveryDate),
        notes: `Generada desde la cotización "${quotation.title}".`,
        items: quotation.requestedItems.map((requestedItem) => ({
          productId: requestedItem.productId,
          quantity: requestedItem.quantity,
          unitCost: offerEvaluation.offer.unitPriceByProduct[requestedItem.productId],
        })),
      });
      this.saveErrorMessage.set('');
      this.closeDialogs();
      this.showSuccessMessage(`Orden de compra ${createdPurchaseOrder.orderNumber} generada. Revísala en Órdenes de compra.`);
    });
  }

  async cancelQuotation(): Promise<void> {
    const quotation = this.selectedQuotation();
    if (!quotation) {
      return;
    }
    await this.runSave(async () => {
      await this.purchasingRepository.cancelQuotation(quotation.id);
      this.closeDialogs();
    });
  }

  private showSuccessMessage(message: string): void {
    this.successMessage.set(message);
    setTimeout(() => this.successMessage.set(''), 6000);
  }

  private async runSave(saveOperation: () => Promise<void>): Promise<void> {
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    try {
      await saveOperation();
      await this.loadData();
    } catch (error) {
      this.logger.logError('AdminQuotationsPage.save', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudieron guardar los cambios.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadData(): Promise<void> {
    this.loadErrorMessage.set('');
    try {
      const [loadedQuotations, loadedSuppliers, loadedProducts] = await Promise.all([
        this.purchasingRepository.findAllQuotations(),
        this.purchasingRepository.findAllSuppliers(),
        this.productRepository.findAllProducts(),
      ]);
      this.quotations.set(loadedQuotations);
      this.suppliers.set(loadedSuppliers);
      this.products.set(loadedProducts);
    } catch (error) {
      this.logger.logError('AdminQuotationsPage.loadData', error);
      this.loadErrorMessage.set('No se pudieron cargar las cotizaciones.');
    } finally {
      this.isLoading.set(false);
    }
  }
}

