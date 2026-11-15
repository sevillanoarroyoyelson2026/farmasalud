import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { firestoreDatabase } from '../../core/firebase/firebase-client';
import {
  convertFirestoreValueToDate,
  readBooleanField,
  readNumberField,
  readStringField,
} from '../../core/firebase/firestore-mappers';
import { ApiClientService } from '../../core/http/api-client.service';
import {
  CreatePurchaseOrderRequest,
  GoodsReception,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  Quotation,
  QuotationRequestedItem,
  ReceptionLine,
  Supplier,
  SupplierFormValue,
  SupplierOffer,
} from '../models/purchasing';

function sortByNewest<Entity extends { createdAt: Date | null }>(entities: Entity[]): Entity[] {
  return entities.sort(
    (firstEntity, secondEntity) => (secondEntity.createdAt?.getTime() ?? 0) - (firstEntity.createdAt?.getTime() ?? 0),
  );
}

/**
 * Proveedores, cotizaciones, órdenes de compra y recepciones.
 * - Proveedores y cotizaciones: los escribe el admin (validados por las reglas).
 * - Órdenes de compra y recepciones: solo por functions (números correlativos, stock, auditoría).
 */
@Injectable({ providedIn: 'root' })
export class PurchasingRepository {
  private readonly apiClient = inject(ApiClientService);

  // ------------------------------------------------------------ proveedores
  async findAllSuppliers(): Promise<Supplier[]> {
    const suppliersSnapshot = await getDocs(collection(firestoreDatabase, 'suppliers'));
    return suppliersSnapshot.docs
      .map((supplierDocument) => this.mapDocumentToSupplier(supplierDocument.id, supplierDocument.data()))
      .sort((firstSupplier, secondSupplier) => firstSupplier.name.localeCompare(secondSupplier.name, 'es'));
  }

  /** El id del proveedor es su RUC: así no se registra dos veces la misma empresa. */
  async createSupplier(supplierFormValue: SupplierFormValue): Promise<void> {
    const supplierReference = doc(firestoreDatabase, 'suppliers', supplierFormValue.ruc);
    if ((await getDoc(supplierReference)).exists()) {
      throw new Error('Ya existe un proveedor con ese RUC.');
    }
    await setDoc(supplierReference, { ...supplierFormValue, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }

  async updateSupplier(supplierId: string, supplierFormValue: SupplierFormValue): Promise<void> {
    await updateDoc(doc(firestoreDatabase, 'suppliers', supplierId), {
      ...supplierFormValue,
      updatedAt: serverTimestamp(),
    });
  }

  // ------------------------------------------------------------ cotizaciones
  async findAllQuotations(): Promise<Quotation[]> {
    const quotationsSnapshot = await getDocs(collection(firestoreDatabase, 'quotations'));
    return sortByNewest(
      quotationsSnapshot.docs.map((quotationDocument) =>
        this.mapDocumentToQuotation(quotationDocument.id, quotationDocument.data()),
      ),
    );
  }

  async createQuotation(title: string, branchId: string, requestedItems: QuotationRequestedItem[]): Promise<void> {
    await addDoc(collection(firestoreDatabase, 'quotations'), {
      title,
      branchId,
      requestedItems,
      supplierOffers: [],
      status: 'open',
      awardedSupplierId: null,
      purchaseOrderId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async saveSupplierOffers(quotationId: string, supplierOffers: SupplierOffer[]): Promise<void> {
    await updateDoc(doc(firestoreDatabase, 'quotations', quotationId), {
      supplierOffers,
      updatedAt: serverTimestamp(),
    });
  }

  async cancelQuotation(quotationId: string): Promise<void> {
    await updateDoc(doc(firestoreDatabase, 'quotations', quotationId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  }

  // ------------------------------------------------------------ órdenes de compra
  /** `branchId` vacío = todas (solo admin). El trabajador SIEMPRE consulta su sucursal. */
  async findPurchaseOrders(branchId: string): Promise<PurchaseOrder[]> {
    const branchFilter: QueryConstraint[] = branchId ? [where('branchId', '==', branchId)] : [];
    const purchaseOrdersSnapshot = await getDocs(query(collection(firestoreDatabase, 'purchase_orders'), ...branchFilter));
    return sortByNewest(
      purchaseOrdersSnapshot.docs.map((purchaseOrderDocument) =>
        this.mapDocumentToPurchaseOrder(purchaseOrderDocument.id, purchaseOrderDocument.data()),
      ),
    );
  }

  async createPurchaseOrder(purchaseOrderRequest: CreatePurchaseOrderRequest): Promise<{ orderNumber: string }> {
    return this.apiClient.postJson<{ orderNumber: string }>('create-purchase-order', purchaseOrderRequest);
  }

  async cancelPurchaseOrder(purchaseOrderId: string, cancellationReason: string): Promise<void> {
    await this.apiClient.postJson('cancel-purchase-order', { purchaseOrderId, cancellationReason });
  }

  // ------------------------------------------------------------ recepciones
  async findReceptionsOfPurchaseOrder(purchaseOrderId: string, branchId: string): Promise<GoodsReception[]> {
    const receptionsQuery = query(
      collection(firestoreDatabase, 'receptions'),
      where('purchaseOrderId', '==', purchaseOrderId),
      where('branchId', '==', branchId),
    );
    const receptionsSnapshot = await getDocs(receptionsQuery);
    return sortByNewest(
      receptionsSnapshot.docs.map((receptionDocument): GoodsReception => {
        const receptionFields = receptionDocument.data();
        return {
          id: receptionDocument.id,
          purchaseOrderNumber: readStringField(receptionFields, 'purchaseOrderNumber'),
          lines: Array.isArray(receptionFields['lines']) ? (receptionFields['lines'] as ReceptionLine[]) : [],
          hasIncidents: readBooleanField(receptionFields, 'hasIncidents', false),
          incidentNotes: readStringField(receptionFields, 'incidentNotes'),
          createdAt: convertFirestoreValueToDate(receptionFields['createdAt']),
        };
      }),
    );
  }

  async registerGoodsReception(
    purchaseOrderId: string,
    lines: ReceptionLine[],
    incidentNotes: string,
  ): Promise<{ isFullyReceived: boolean }> {
    return this.apiClient.postJson<{ isFullyReceived: boolean }>('register-goods-reception', {
      purchaseOrderId,
      lines,
      incidentNotes,
    });
  }

  // ------------------------------------------------------------ mapeos
  private mapDocumentToSupplier(supplierId: string, supplierFields: DocumentData): Supplier {
    return {
      id: supplierId,
      name: readStringField(supplierFields, 'name'),
      ruc: readStringField(supplierFields, 'ruc'),
      contactName: readStringField(supplierFields, 'contactName'),
      phone: readStringField(supplierFields, 'phone'),
      email: readStringField(supplierFields, 'email'),
      address: readStringField(supplierFields, 'address'),
      paymentTerms: readStringField(supplierFields, 'paymentTerms'),
      deliveryDays: readNumberField(supplierFields, 'deliveryDays'),
      isActive: readBooleanField(supplierFields, 'isActive', true),
    };
  }

  private mapDocumentToQuotation(quotationId: string, quotationFields: DocumentData): Quotation {
    return {
      id: quotationId,
      title: readStringField(quotationFields, 'title'),
      branchId: readStringField(quotationFields, 'branchId'),
      requestedItems: Array.isArray(quotationFields['requestedItems'])
        ? (quotationFields['requestedItems'] as QuotationRequestedItem[])
        : [],
      supplierOffers: Array.isArray(quotationFields['supplierOffers'])
        ? (quotationFields['supplierOffers'] as SupplierOffer[])
        : [],
      status: (readStringField(quotationFields, 'status') || 'open') as Quotation['status'],
      awardedSupplierId: (quotationFields['awardedSupplierId'] as string | null) ?? null,
      purchaseOrderId: (quotationFields['purchaseOrderId'] as string | null) ?? null,
      createdAt: convertFirestoreValueToDate(quotationFields['createdAt']),
    };
  }

  private mapDocumentToPurchaseOrder(purchaseOrderId: string, purchaseOrderFields: DocumentData): PurchaseOrder {
    return {
      id: purchaseOrderId,
      orderNumber: readStringField(purchaseOrderFields, 'orderNumber'),
      supplierId: readStringField(purchaseOrderFields, 'supplierId'),
      supplierName: readStringField(purchaseOrderFields, 'supplierName'),
      supplierRuc: readStringField(purchaseOrderFields, 'supplierRuc'),
      branchId: readStringField(purchaseOrderFields, 'branchId'),
      branchName: readStringField(purchaseOrderFields, 'branchName'),
      quotationId: (purchaseOrderFields['quotationId'] as string | null) ?? null,
      items: Array.isArray(purchaseOrderFields['items']) ? (purchaseOrderFields['items'] as PurchaseOrderItem[]) : [],
      orderTotal: readNumberField(purchaseOrderFields, 'orderTotal'),
      expectedDeliveryDate: convertFirestoreValueToDate(purchaseOrderFields['expectedDeliveryDate']),
      notes: readStringField(purchaseOrderFields, 'notes'),
      status: readStringField(purchaseOrderFields, 'status') as PurchaseOrderStatus,
      cancellationReason: readStringField(purchaseOrderFields, 'cancellationReason'),
      createdAt: convertFirestoreValueToDate(purchaseOrderFields['createdAt']),
    };
  }
}
