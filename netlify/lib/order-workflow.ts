/**
 * Flujo de estados del pedido (procedimiento O04.02: atención y dispensación digital).
 * Las transiciones se definen como datos: agregar un paso nuevo es agregar una fila,
 * no repartir if/else por las functions.
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
type OrderActor = 'staff' | 'customer';

interface OrderTransitionRule {
  allowedFromStatuses: OrderStatus[];
  resultingStatus: OrderStatus;
  allowedActor: OrderActor;
  /** Si se indica, la acción solo aplica a ese tipo de entrega. */
  requiredFulfillmentType?: FulfillmentType;
  isNoteRequired: boolean;
}

export const ORDER_TRANSITION_RULES: Record<OrderAction, OrderTransitionRule> = {
  approve_prescription: {
    allowedFromStatuses: ['pending_prescription'],
    resultingStatus: 'confirmed',
    allowedActor: 'staff',
    isNoteRequired: false,
  },
  reject_prescription: {
    allowedFromStatuses: ['pending_prescription'],
    resultingStatus: 'cancelled',
    allowedActor: 'staff',
    isNoteRequired: true,
  },
  start_preparation: {
    allowedFromStatuses: ['confirmed'],
    resultingStatus: 'preparing',
    allowedActor: 'staff',
    isNoteRequired: false,
  },
  mark_ready_for_pickup: {
    allowedFromStatuses: ['preparing'],
    resultingStatus: 'ready_for_pickup',
    allowedActor: 'staff',
    requiredFulfillmentType: 'pickup',
    isNoteRequired: false,
  },
  dispatch: {
    allowedFromStatuses: ['preparing'],
    resultingStatus: 'out_for_delivery',
    allowedActor: 'staff',
    requiredFulfillmentType: 'delivery',
    isNoteRequired: false,
  },
  mark_delivered: {
    allowedFromStatuses: ['ready_for_pickup', 'out_for_delivery'],
    resultingStatus: 'delivered',
    allowedActor: 'staff',
    isNoteRequired: false,
  },
  cancel_by_staff: {
    allowedFromStatuses: ['pending_prescription', 'confirmed', 'preparing'],
    resultingStatus: 'cancelled',
    allowedActor: 'staff',
    isNoteRequired: true,
  },
  cancel_by_customer: {
    allowedFromStatuses: ['pending_prescription', 'confirmed'],
    resultingStatus: 'cancelled',
    allowedActor: 'customer',
    isNoteRequired: false,
  },
};

/** Devuelve el mensaje de error si la transición no es válida, o null si se puede aplicar. */
export function describeInvalidTransition(
  orderAction: OrderAction,
  currentStatus: OrderStatus,
  fulfillmentType: FulfillmentType,
  actor: OrderActor,
): string | null {
  const transitionRule = ORDER_TRANSITION_RULES[orderAction];
  if (transitionRule.allowedActor !== actor) {
    return 'No puedes realizar esta acción sobre el pedido.';
  }
  if (!transitionRule.allowedFromStatuses.includes(currentStatus)) {
    return 'El pedido ya cambió de estado. Actualiza la pantalla.';
  }
  if (transitionRule.requiredFulfillmentType && transitionRule.requiredFulfillmentType !== fulfillmentType) {
    return 'Esta acción no corresponde al tipo de entrega del pedido.';
  }
  return null;
}
