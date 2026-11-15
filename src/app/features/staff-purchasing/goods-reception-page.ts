import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { AppLoggerService } from '../../core/logger/app-logger.service';
import { BranchSelectionService } from '../../shared/data-access/branch-selection.service';
import { PurchasingRepository } from '../../shared/data-access/purchasing.repository';
import {
  getPendingUnits,
  PURCHASE_ORDER_STATUS_LABEL,
  PURCHASE_ORDER_STATUS_TONE,
  PurchaseOrder,
  ReceptionLine,
} from '../../shared/models/purchasing';
import { DialogPanel } from '../../shared/ui/dialog-panel/dialog-panel';
import { describeErrorForUser } from '../../shared/utils/user-facing-error';

interface ReceptionLineDraft {
  productId: string;
  productName: string;
  pendingUnits: number;
  lotNumber: string;
  expirationDate: string;
  quantityReceived: number;
  quantityRejected: number;
}

const OPEN_PURCHASE_ORDER_STATUSES = ['issued', 'partially_received'];

/**
 * Recepción de mercadería (procedimientos O01.02 y O02.03): el almacenero verifica lo
 * que llegó contra la orden de compra, registra lote y vencimiento de lo conforme y
 * anota las incidencias. El stock entra a la botica al confirmar.
 */
@Component({
  selector: 'app-goods-reception-page',
  imports: [FormsModule, DialogPanel, DatePipe],
  templateUrl: './goods-reception-page.html',
  styles: `
    .reception-line { display: grid; grid-template-columns: minmax(0, 1.4fr) 1fr 1fr 90px 90px auto; gap: 0.5rem; align-items: end; padding: 0.6rem 0; border-bottom: 1px solid var(--color-border); }
    @media (max-width: 768px) { .reception-line { grid-template-columns: 1fr 1fr; } .reception-line-product { grid-column: 1 / -1; } }
  `,
})
export class GoodsReceptionPage {
  private readonly purchasingRepository = inject(PurchasingRepository);
  private readonly authService = inject(AuthService);
  private readonly logger = inject(AppLoggerService);
  readonly branchSelection = inject(BranchSelectionService);

  readonly statusLabel = PURCHASE_ORDER_STATUS_LABEL;
  readonly statusTone = PURCHASE_ORDER_STATUS_TONE;
  readonly earliestAllowedExpirationDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  readonly openPurchaseOrders = signal<PurchaseOrder[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly successMessage = signal('');

  readonly selectedPurchaseOrder = signal<PurchaseOrder | null>(null);
  readonly receptionLineDrafts = signal<ReceptionLineDraft[]>([]);
  readonly incidentNotes = signal('');
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');

  readonly effectiveBranchId = computed(() => {
    const session = this.authService.currentSession();
    return session?.role === 'worker' ? (session.branchId ?? '') : this.branchSelection.selectedBranchId();
  });

  constructor() {
    effect(() => {
      void this.loadOpenPurchaseOrders(this.effectiveBranchId());
    });
  }

  countPendingUnits(purchaseOrder: PurchaseOrder): number {
    return purchaseOrder.items.reduce((total, orderItem) => total + getPendingUnits(orderItem), 0);
  }

  openReception(purchaseOrder: PurchaseOrder): void {
    this.selectedPurchaseOrder.set(purchaseOrder);
    this.incidentNotes.set('');
    this.saveErrorMessage.set('');
    this.receptionLineDrafts.set(
      purchaseOrder.items
        .filter((orderItem) => getPendingUnits(orderItem) > 0)
        .map((orderItem) => this.createLineDraft(orderItem.productId, orderItem.productName, getPendingUnits(orderItem))),
    );
  }

  /** Un mismo producto puede llegar en varios lotes. */
  addAnotherLot(lineDraft: ReceptionLineDraft): void {
    this.receptionLineDrafts.update((lineDrafts) => {
      const insertIndex = lineDrafts.indexOf(lineDraft) + 1;
      const newLineDraft = this.createLineDraft(lineDraft.productId, lineDraft.productName, lineDraft.pendingUnits);
      newLineDraft.quantityReceived = 0;
      return [...lineDrafts.slice(0, insertIndex), newLineDraft, ...lineDrafts.slice(insertIndex)];
    });
  }

  removeLine(lineDraft: ReceptionLineDraft): void {
    this.receptionLineDrafts.update((lineDrafts) => lineDrafts.filter((draft) => draft !== lineDraft));
  }

  closeReception(): void {
    this.selectedPurchaseOrder.set(null);
  }

  async confirmReception(): Promise<void> {
    const purchaseOrder = this.selectedPurchaseOrder();
    if (!purchaseOrder) {
      return;
    }
    const receptionLines: ReceptionLine[] = this.receptionLineDrafts()
      .map((lineDraft) => ({
        productId: lineDraft.productId,
        lotNumber: lineDraft.lotNumber.trim().toUpperCase(),
        expirationDate: lineDraft.expirationDate,
        quantityReceived: Number(lineDraft.quantityReceived) || 0,
        quantityRejected: Number(lineDraft.quantityRejected) || 0,
      }))
      .filter((receptionLine) => receptionLine.quantityReceived + receptionLine.quantityRejected > 0);

    const invalidLineMessage = this.describeInvalidLines(receptionLines);
    if (invalidLineMessage) {
      this.saveErrorMessage.set(invalidLineMessage);
      return;
    }

    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    try {
      const receptionResult = await this.purchasingRepository.registerGoodsReception(
        purchaseOrder.id,
        receptionLines,
        this.incidentNotes().trim(),
      );
      this.closeReception();
      this.successMessage.set(
        receptionResult.isFullyReceived
          ? `Orden ${purchaseOrder.orderNumber} recibida por completo. El stock ya está disponible.`
          : `Recepción parcial de ${purchaseOrder.orderNumber} registrada. El stock ya está disponible.`,
      );
      await this.loadOpenPurchaseOrders(this.effectiveBranchId());
    } catch (error) {
      this.logger.logError('GoodsReceptionPage.confirmReception', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudo registrar la recepción.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  private describeInvalidLines(receptionLines: ReceptionLine[]): string | null {
    if (receptionLines.length === 0) {
      return 'Indica las unidades recibidas o rechazadas de al menos un producto.';
    }
    for (const receptionLine of receptionLines) {
      if (!Number.isInteger(receptionLine.quantityReceived) || !Number.isInteger(receptionLine.quantityRejected) ||
          receptionLine.quantityReceived < 0 || receptionLine.quantityRejected < 0) {
        return 'Las cantidades deben ser números enteros.';
      }
      if (!/^[A-Z0-9./-]{1,40}$/.test(receptionLine.lotNumber)) {
        return 'Cada línea necesita un número de lote válido (letras, números, punto, guion o barra).';
      }
      if (receptionLine.quantityReceived > 0 && receptionLine.expirationDate < this.earliestAllowedExpirationDate) {
        return 'Indica una fecha de vencimiento futura para los lotes recibidos.';
      }
    }
    return null;
  }

  private createLineDraft(productId: string, productName: string, pendingUnits: number): ReceptionLineDraft {
    return { productId, productName, pendingUnits, lotNumber: '', expirationDate: '', quantityReceived: pendingUnits, quantityRejected: 0 };
  }

  private async loadOpenPurchaseOrders(branchId: string): Promise<void> {
    const session = this.authService.currentSession();
    if (session?.role === 'worker' && !branchId) {
      this.loadErrorMessage.set('Tu cuenta no tiene sucursal asignada.');
      this.isLoading.set(false);
      return;
    }
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    try {
      const purchaseOrders = await this.purchasingRepository.findPurchaseOrders(branchId);
      this.openPurchaseOrders.set(
        purchaseOrders.filter((purchaseOrder) => OPEN_PURCHASE_ORDER_STATUSES.includes(purchaseOrder.status)),
      );
    } catch (error) {
      this.logger.logError('GoodsReceptionPage.loadOpenPurchaseOrders', error);
      this.loadErrorMessage.set('No se pudieron cargar las órdenes de compra.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
