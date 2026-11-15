/** Modelos del proceso de compras y abastecimiento (O01.02) y recepción (O02.03). */

export interface Supplier {
  id: string;
  name: string;
  ruc: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  /** Ej.: "Contado", "Crédito 30 días". */
  paymentTerms: string;
  /** Plazo habitual de entrega en días. */
  deliveryDays: number;
  isActive: boolean;
}

export type SupplierFormValue = Omit<Supplier, 'id'>;

export interface QuotationRequestedItem {
  productId: string;
  productName: string;
  quantity: number;
}

export interface SupplierOffer {
  supplierId: string;
  supplierName: string;
  deliveryDays: number;
  paymentTerms: string;
  /** Precio unitario ofrecido por producto: { productId: precio }. */
  unitPriceByProduct: Record<string, number>;
}

export type QuotationStatus = 'open' | 'awarded' | 'cancelled';

export interface Quotation {
  id: string;
  title: string;
  branchId: string;
  requestedItems: QuotationRequestedItem[];
  supplierOffers: SupplierOffer[];
  status: QuotationStatus;
  awardedSupplierId: string | null;
  purchaseOrderId: string | null;
  createdAt: Date | null;
}

export interface OfferEvaluation {
  offer: SupplierOffer;
  /** null si al proveedor le falta cotizar algún producto. */
  offerTotal: number | null;
  isBestOffer: boolean;
}

/**
 * Compara ofertas: gana el menor total entre las que cotizaron TODOS los productos;
 * a igual total, la de menor plazo de entrega.
 */
export function evaluateSupplierOffers(quotation: Quotation): OfferEvaluation[] {
  const evaluatedOffers = quotation.supplierOffers.map((offer) => {
    const isComplete = quotation.requestedItems.every(
      (requestedItem) => (offer.unitPriceByProduct[requestedItem.productId] ?? 0) > 0,
    );
    const offerTotal = isComplete
      ? Math.round(
          quotation.requestedItems.reduce(
            (total, requestedItem) => total + offer.unitPriceByProduct[requestedItem.productId] * requestedItem.quantity,
            0,
          ) * 100,
        ) / 100
      : null;
    return { offer, offerTotal, isBestOffer: false };
  });
  const bestOffer = evaluatedOffers
    .filter((evaluation) => evaluation.offerTotal !== null)
    .sort(
      (firstEvaluation, secondEvaluation) =>
        (firstEvaluation.offerTotal ?? 0) - (secondEvaluation.offerTotal ?? 0) ||
        firstEvaluation.offer.deliveryDays - secondEvaluation.offer.deliveryDays,
    )[0];
  if (bestOffer) {
    bestOffer.isBestOffer = true;
  }
  return evaluatedOffers;
}

export type PurchaseOrderStatus = 'issued' | 'partially_received' | 'received' | 'cancelled';

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  presentation: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRejected: number;
  unitCost: number;
  subtotal: number;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  supplierRuc: string;
  branchId: string;
  branchName: string;
  quotationId: string | null;
  items: PurchaseOrderItem[];
  orderTotal: number;
  expectedDeliveryDate: Date | null;
  notes: string;
  status: PurchaseOrderStatus;
  cancellationReason: string;
  createdAt: Date | null;
}

export interface CreatePurchaseOrderRequest {
  supplierId: string;
  branchId: string;
  quotationId: string | null;
  expectedDeliveryDate: string;
  notes: string;
  items: { productId: string; quantity: number; unitCost: number }[];
}

export interface ReceptionLine {
  productId: string;
  productName?: string;
  lotNumber: string;
  expirationDate: string;
  quantityReceived: number;
  quantityRejected: number;
}

export interface GoodsReception {
  id: string;
  purchaseOrderNumber: string;
  lines: ReceptionLine[];
  hasIncidents: boolean;
  incidentNotes: string;
  createdAt: Date | null;
}

export const PURCHASE_ORDER_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  issued: 'Emitida',
  partially_received: 'Recibida parcial',
  received: 'Recibida',
  cancelled: 'Anulada',
};

export const PURCHASE_ORDER_STATUS_TONE: Record<PurchaseOrderStatus, string> = {
  issued: 'is-info',
  partially_received: 'is-warning',
  received: 'is-success',
  cancelled: 'is-neutral',
};

export function getPendingUnits(purchaseOrderItem: PurchaseOrderItem): number {
  return Math.max(
    purchaseOrderItem.quantityOrdered - purchaseOrderItem.quantityReceived - purchaseOrderItem.quantityRejected,
    0,
  );
}
