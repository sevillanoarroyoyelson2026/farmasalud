import type { Handler } from '@netlify/functions';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { recordAuditEvent } from '../lib/audit-log';
import { adminFirestore } from '../lib/firebase-admin';
import {
  createErrorResponse,
  createJsonResponse,
  HttpError,
  rejectUnsupportedMethod,
} from '../lib/http-response';
import {
  describeInvalidTransition,
  ORDER_TRANSITION_RULES,
  type FulfillmentType,
  type OrderStatus,
} from '../lib/order-workflow';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCallerWithRole, parseRequestBody } from '../lib/request-guard';
import type { LotAllocation } from '../lib/stock-allocation';

const FUNCTION_NAME = 'update-order-status';

const updateOrderStatusSchema = z
  .object({
    orderId: z.string().uuid(),
    action: z.enum([
      'approve_prescription',
      'reject_prescription',
      'start_preparation',
      'mark_ready_for_pickup',
      'dispatch',
      'mark_delivered',
      'cancel_by_staff',
      'cancel_by_customer',
    ]),
    note: z.string().trim().max(300),
    courierName: z.string().trim().max(80).nullable(),
  })
  .strict();

interface StoredOrderItem {
  productId: string;
  quantity: number;
  allocatedLots: LotAllocation[];
}

/**
 * Avanza un pedido por su flujo (validar receta → preparar → despachar → entregar)
 * o lo cancela. Si se cancela, devuelve el stock a los MISMOS lotes de donde salió.
 * - Trabajador: solo pedidos de su sucursal. Admin: todos. Cliente: solo cancelar los suyos.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const caller = await authenticateCallerWithRole(requestEvent, ['admin', 'worker', 'customer']);
    await enforceRateLimit(`${FUNCTION_NAME}:${caller.uid}`, 120, 600);
    const statusRequest = parseRequestBody(requestEvent, updateOrderStatusSchema);
    const transitionRule = ORDER_TRANSITION_RULES[statusRequest.action];
    if (transitionRule.isNoteRequired && statusRequest.note.length < 5) {
      throw new HttpError(400, 'Indica el motivo (mínimo 5 caracteres).');
    }

    const orderReference = adminFirestore.collection('orders').doc(statusRequest.orderId);
    const updatedOrder = await adminFirestore.runTransaction(async (transaction) => {
      const orderSnapshot = await transaction.get(orderReference);
      if (!orderSnapshot.exists) {
        throw new HttpError(404, 'El pedido no existe.');
      }
      const orderBranchId = orderSnapshot.get('branchId') as string;
      const isOrderOwner = orderSnapshot.get('customerUid') === caller.uid;
      const canOperateOrder =
        caller.role === 'admin' ||
        (caller.role === 'worker' && caller.branchId === orderBranchId) ||
        (caller.role === 'customer' && isOrderOwner);
      if (!canOperateOrder) {
        throw new HttpError(404, 'El pedido no existe.');
      }

      const currentStatus = orderSnapshot.get('status') as OrderStatus;
      const invalidTransitionMessage = describeInvalidTransition(
        statusRequest.action,
        currentStatus,
        orderSnapshot.get('fulfillmentType') as FulfillmentType,
        caller.role === 'customer' ? 'customer' : 'staff',
      );
      if (invalidTransitionMessage) {
        throw new HttpError(409, invalidTransitionMessage);
      }

      const nextStatus = transitionRule.resultingStatus;
      const orderUpdate: Record<string, unknown> = {
        status: nextStatus,
        statusHistory: FieldValue.arrayUnion({
          status: nextStatus,
          changedAt: Timestamp.now(),
          changedByUid: caller.uid,
          note: statusRequest.note,
        }),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (statusRequest.action === 'approve_prescription' || statusRequest.action === 'reject_prescription') {
        orderUpdate['prescription.reviewStatus'] =
          statusRequest.action === 'approve_prescription' ? 'approved' : 'rejected';
        orderUpdate['prescription.reviewNote'] = statusRequest.note;
        orderUpdate['prescription.reviewedByUid'] = caller.uid;
      }
      if (statusRequest.action === 'dispatch') {
        orderUpdate['courierName'] = statusRequest.courierName || null;
      }
      if (statusRequest.action === 'mark_delivered') {
        orderUpdate['payment.status'] = 'paid';
      }

      if (nextStatus === 'cancelled') {
        if (orderSnapshot.get('payment.status') === 'paid') {
          orderUpdate['payment.status'] = 'refunded';
        }
        for (const orderItem of orderSnapshot.get('items') as StoredOrderItem[]) {
          const productReference = adminFirestore.collection('products').doc(orderItem.productId);
          for (const lotAllocation of orderItem.allocatedLots) {
            transaction.update(productReference.collection('lots').doc(lotAllocation.lotId), {
              quantityAvailable: FieldValue.increment(lotAllocation.quantity),
              updatedAt: FieldValue.serverTimestamp(),
            });
            transaction.set(adminFirestore.collection('stock_movements').doc(), {
              productId: orderItem.productId,
              branchId: orderBranchId,
              lotId: lotAllocation.lotId,
              lotNumber: lotAllocation.lotNumber,
              movementType: 'entry',
              reason: 'order_cancelled',
              quantity: lotAllocation.quantity,
              orderId: orderReference.id,
              performedByUid: caller.uid,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
          transaction.update(
            productReference,
            new FieldPath('stockByBranch', orderBranchId),
            FieldValue.increment(orderItem.quantity),
          );
        }
      }

      transaction.update(orderReference, orderUpdate);
      return { orderNumber: orderSnapshot.get('orderNumber') as string, nextStatus };
    });

    if (
      statusRequest.action === 'approve_prescription' ||
      statusRequest.action === 'reject_prescription' ||
      updatedOrder.nextStatus === 'cancelled'
    ) {
      await recordAuditEvent({
        action: statusRequest.action === 'approve_prescription' ? 'prescription.validated' : 'order.cancelled',
        performedByUid: caller.uid,
        targetType: 'order',
        targetId: statusRequest.orderId,
        details: { orderNumber: updatedOrder.orderNumber, action: statusRequest.action, note: statusRequest.note },
      });
    }
    return createJsonResponse(requestEvent, 200, { status: updatedOrder.nextStatus });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
