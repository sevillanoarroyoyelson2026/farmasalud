import { inject, Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  limit,
  Timestamp,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestoreDatabase } from '../../core/firebase/firebase-client';
import {
  convertFirestoreValueToDate,
  readNumberField,
  readStringField,
} from '../../core/firebase/firestore-mappers';
import { ApiClientService } from '../../core/http/api-client.service';
import {
  CreateOrderRequest,
  DeliveryAddress,
  Order,
  OrderAction,
  OrderItem,
  OrderStatus,
  OrderStatusChange,
} from '../models/order';

const ORDERS_COLLECTION = 'orders';
const RECENT_ORDERS_LIMIT = 150;

export interface CreatedOrder {
  orderId: string;
  orderNumber: string;
}

type OrdersListener = (orders: Order[]) => void;
type ListenerErrorHandler = (error: unknown) => void;

/**
 * Pedidos. Se leen en TIEMPO REAL (onSnapshot) para que el cliente vea su
 * seguimiento y el trabajador su cola sin recargar. Crear y cambiar estado
 * solo es posible a través de las functions.
 */
@Injectable({ providedIn: 'root' })
export class OrderRepository {
  private readonly apiClient = inject(ApiClientService);

  watchCustomerOrders(customerUid: string, onOrders: OrdersListener, onError: ListenerErrorHandler): Unsubscribe {
    return this.watchOrders([where('customerUid', '==', customerUid)], onOrders, onError);
  }

  /** `branchId` vacío = todas las sucursales (solo admin). */
  watchBranchOrders(branchId: string, onOrders: OrdersListener, onError: ListenerErrorHandler): Unsubscribe {
    const branchFilter = branchId ? [where('branchId', '==', branchId)] : [];
    return this.watchOrders(branchFilter, onOrders, onError);
  }

  watchOrder(orderId: string, onOrder: (order: Order | null) => void, onError: ListenerErrorHandler): Unsubscribe {
    return onSnapshot(
      doc(firestoreDatabase, ORDERS_COLLECTION, orderId),
      (orderSnapshot) =>
        onOrder(orderSnapshot.exists() ? this.mapDocumentToOrder(orderSnapshot.id, orderSnapshot.data()) : null),
      onError,
    );
  }

  /** Pedidos desde una fecha, para indicadores y reportes (`branchId` vacío = todas, solo admin). */
  async findOrdersSince(branchId: string, sinceDate: Date): Promise<Order[]> {
    const branchFilter = branchId ? [where('branchId', '==', branchId)] : [];
    const ordersSnapshot = await getDocs(
      query(
        collection(firestoreDatabase, ORDERS_COLLECTION),
        ...branchFilter,
        where('createdAt', '>=', Timestamp.fromDate(sinceDate)),
        orderBy('createdAt', 'desc'),
      ),
    );
    return ordersSnapshot.docs.map((orderDocument) => this.mapDocumentToOrder(orderDocument.id, orderDocument.data()));
  }

  async createOrder(orderRequest: CreateOrderRequest): Promise<CreatedOrder> {
    return this.apiClient.postJson<CreatedOrder>('create-order', orderRequest);
  }

  async applyOrderAction(orderId: string, action: OrderAction, note = '', courierName: string | null = null): Promise<void> {
    await this.apiClient.postJson('update-order-status', { orderId, action, note, courierName });
  }

  async getPrescriptionUrl(orderId: string): Promise<string> {
    const response = await this.apiClient.postJson<{ prescriptionUrl: string }>('get-prescription-url', { orderId });
    return response.prescriptionUrl;
  }

  private watchOrders(
    filters: QueryConstraint[],
    onOrders: OrdersListener,
    onError: ListenerErrorHandler,
  ): Unsubscribe {
    const ordersQuery = query(
      collection(firestoreDatabase, ORDERS_COLLECTION),
      ...filters,
      orderBy('createdAt', 'desc'),
      limit(RECENT_ORDERS_LIMIT),
    );
    return onSnapshot(
      ordersQuery,
      (ordersSnapshot) =>
        onOrders(ordersSnapshot.docs.map((orderDocument) => this.mapDocumentToOrder(orderDocument.id, orderDocument.data()))),
      onError,
    );
  }

  private mapDocumentToOrder(orderId: string, orderFields: DocumentData): Order {
    const payment = (orderFields['payment'] ?? {}) as DocumentData;
    const prescription = orderFields['prescription'] as DocumentData | null;
    const statusHistory = Array.isArray(orderFields['statusHistory']) ? orderFields['statusHistory'] : [];
    return {
      id: orderId,
      orderNumber: readStringField(orderFields, 'orderNumber'),
      customerUid: readStringField(orderFields, 'customerUid'),
      customerName: readStringField(orderFields, 'customerName'),
      contactPhone: readStringField(orderFields, 'contactPhone'),
      branchId: readStringField(orderFields, 'branchId'),
      branchName: readStringField(orderFields, 'branchName'),
      fulfillmentType: orderFields['fulfillmentType'] === 'pickup' ? 'pickup' : 'delivery',
      deliveryAddress: (orderFields['deliveryAddress'] as DeliveryAddress | null) ?? null,
      customerNote: readStringField(orderFields, 'customerNote'),
      items: Array.isArray(orderFields['items']) ? (orderFields['items'] as OrderItem[]) : [],
      itemsTotal: readNumberField(orderFields, 'itemsTotal'),
      deliveryFee: readNumberField(orderFields, 'deliveryFee'),
      orderTotal: readNumberField(orderFields, 'orderTotal'),
      paymentMethod: payment['method'] === 'cash_on_delivery' ? 'cash_on_delivery' : 'simulated_card',
      paymentStatus: payment['status'] ?? 'pending',
      paymentReference: payment['simulatedReference'] ?? null,
      hasPrescription: prescription !== null && prescription !== undefined,
      prescriptionReviewStatus: prescription?.['reviewStatus'] ?? null,
      prescriptionReviewNote: prescription?.['reviewNote'] ?? '',
      status: readStringField(orderFields, 'status') as OrderStatus,
      statusHistory: statusHistory.map(
        (statusChange: DocumentData): OrderStatusChange => ({
          status: statusChange['status'] as OrderStatus,
          changedAt: convertFirestoreValueToDate(statusChange['changedAt']),
          note: typeof statusChange['note'] === 'string' ? statusChange['note'] : '',
        }),
      ),
      courierName: typeof orderFields['courierName'] === 'string' ? orderFields['courierName'] : null,
      createdAt: convertFirestoreValueToDate(orderFields['createdAt']),
    };
  }
}
