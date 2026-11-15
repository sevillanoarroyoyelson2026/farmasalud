/**
 * Pedido web. Espejo de lo que guarda la function `create-order`.
 * Las reglas de transición viven en el servidor (netlify/lib/order-workflow.ts);
 * aquí solo se replican para decidir qué botones mostrar.
 */
export type OrderStatus =
  | 'pending_prescription'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type OrderAction =
  | 'approve_prescription'
  | 'reject_prescription'
  | 'start_preparation'
  | 'mark_ready_for_pickup'
  | 'dispatch'
  | 'mark_delivered'
  | 'cancel_by_staff'
  | 'cancel_by_customer';

export type FulfillmentType = 'delivery' | 'pickup';
export type PaymentMethod = 'simulated_card' | 'cash_on_delivery';
export type PaymentStatus = 'paid' | 'pending' | 'refunded';
export type PrescriptionReviewStatus = 'pending' | 'approved' | 'rejected';

export interface OrderItem {
  productId: string;
  productName: string;
  presentation: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  requiresPrescription: boolean;
  allocatedLots: { lotId: string; lotNumber: string; quantity: number }[];
}

export interface DeliveryAddress {
  street: string;
  district: string;
  reference: string;
}

export interface OrderStatusChange {
  status: OrderStatus;
  changedAt: Date | null;
  note: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerUid: string;
  customerName: string;
  contactPhone: string;
  branchId: string;
  branchName: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress: DeliveryAddress | null;
  customerNote: string;
  items: OrderItem[];
  itemsTotal: number;
  deliveryFee: number;
  orderTotal: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference: string | null;
  hasPrescription: boolean;
  prescriptionReviewStatus: PrescriptionReviewStatus | null;
  prescriptionReviewNote: string;
  status: OrderStatus;
  statusHistory: OrderStatusChange[];
  courierName: string | null;
  createdAt: Date | null;
}

export interface CreateOrderRequest {
  idempotencyKey: string;
  branchId: string;
  items: { productId: string; quantity: number }[];
  fulfillmentType: FulfillmentType;
  deliveryAddress: DeliveryAddress | null;
  contactPhone: string;
  paymentMethod: PaymentMethod;
  simulatedCardLastDigits: string | null;
  prescriptionFile: { publicId: string; version: number; format: string } | null;
  customerNote: string;
}

export const DELIVERY_FEE_IN_SOLES = 6;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_prescription: 'Validando receta',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready_for_pickup: 'Listo para recoger',
  out_for_delivery: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

/** Clase de `status-badge` para cada estado. */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  pending_prescription: 'is-warning',
  confirmed: 'is-info',
  preparing: 'is-info',
  ready_for_pickup: 'is-success',
  out_for_delivery: 'is-success',
  delivered: 'is-neutral',
  cancelled: 'is-danger',
};

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'pending_prescription',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  simulated_card: 'Tarjeta (pago simulado)',
  cash_on_delivery: 'Pago al recibir',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: 'Pagado',
  pending: 'Por cobrar',
  refunded: 'Reembolsado',
};

export interface OrderActionDefinition {
  action: OrderAction;
  label: string;
  iconClass: string;
  buttonClass: string;
  allowedFromStatuses: OrderStatus[];
  requiredFulfillmentType?: FulfillmentType;
  isNoteRequired: boolean;
}

/** Acciones del personal en el orden en que se muestran. */
export const STAFF_ORDER_ACTIONS: OrderActionDefinition[] = [
  {
    action: 'approve_prescription',
    label: 'Aprobar receta',
    iconClass: 'fas fa-circle-check',
    buttonClass: 'btn-success',
    allowedFromStatuses: ['pending_prescription'],
    isNoteRequired: false,
  },
  {
    action: 'reject_prescription',
    label: 'Rechazar receta',
    iconClass: 'fas fa-ban',
    buttonClass: 'btn-outline-danger',
    allowedFromStatuses: ['pending_prescription'],
    isNoteRequired: true,
  },
  {
    action: 'start_preparation',
    label: 'Empezar preparación',
    iconClass: 'fas fa-box-open',
    buttonClass: 'btn-primary',
    allowedFromStatuses: ['confirmed'],
    isNoteRequired: false,
  },
  {
    action: 'mark_ready_for_pickup',
    label: 'Listo para recoger',
    iconClass: 'fas fa-store',
    buttonClass: 'btn-primary',
    allowedFromStatuses: ['preparing'],
    requiredFulfillmentType: 'pickup',
    isNoteRequired: false,
  },
  {
    action: 'dispatch',
    label: 'Despachar con delivery',
    iconClass: 'fas fa-motorcycle',
    buttonClass: 'btn-primary',
    allowedFromStatuses: ['preparing'],
    requiredFulfillmentType: 'delivery',
    isNoteRequired: false,
  },
  {
    action: 'mark_delivered',
    label: 'Marcar entregado',
    iconClass: 'fas fa-flag-checkered',
    buttonClass: 'btn-success',
    allowedFromStatuses: ['ready_for_pickup', 'out_for_delivery'],
    isNoteRequired: false,
  },
  {
    action: 'cancel_by_staff',
    label: 'Cancelar pedido',
    iconClass: 'fas fa-xmark',
    buttonClass: 'btn-outline-danger',
    allowedFromStatuses: ['pending_prescription', 'confirmed', 'preparing'],
    isNoteRequired: true,
  },
];

export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = ['pending_prescription', 'confirmed'];

export function getAvailableStaffActions(order: Order): OrderActionDefinition[] {
  return STAFF_ORDER_ACTIONS.filter(
    (actionDefinition) =>
      actionDefinition.allowedFromStatuses.includes(order.status) &&
      (!actionDefinition.requiredFulfillmentType ||
        actionDefinition.requiredFulfillmentType === order.fulfillmentType),
  );
}

/** Pasos que ve el cliente en el seguimiento (según tipo de entrega y si lleva receta). */
export function buildTrackingSteps(order: Order): OrderStatus[] {
  const trackingSteps: OrderStatus[] = [];
  if (order.hasPrescription) {
    trackingSteps.push('pending_prescription');
  }
  trackingSteps.push('confirmed', 'preparing');
  trackingSteps.push(order.fulfillmentType === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup');
  trackingSteps.push('delivered');
  return trackingSteps;
}
