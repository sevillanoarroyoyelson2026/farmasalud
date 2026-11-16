import type { Handler } from '@netlify/functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { recordAuditEvent } from '../lib/audit-log';
import { refundCulqiCharge } from '../lib/culqi';
import { notifyOrderStatusChanged } from '../lib/email-notifications';
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
import { writeStockReleaseForOrder } from '../lib/order-stock-release';
import { refreshLowStockNotifications } from '../lib/low-stock-notifications';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCallerWithRole, parseRequestBody } from '../lib/request-guard';

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
        writeStockReleaseForOrder(transaction, orderSnapshot, caller.uid, 'order_cancelled');
      }

      transaction.update(orderReference, orderUpdate);
      return {
        orderNumber: orderSnapshot.get('orderNumber') as string,
        nextStatus,
        customerEmail: (orderSnapshot.get('customerEmail') as string) ?? '',
        culqiChargeIdToRefund:
          nextStatus === 'cancelled' && orderSnapshot.get('payment.status') === 'paid'
            ? ((orderSnapshot.get('payment.culqiChargeId') as string | null) ?? null)
            : null,
        orderTotal: orderSnapshot.get('orderTotal') as number,
        branchId: orderBranchId,
        productIds: (orderSnapshot.get('items') as { productId: string }[]).map((orderItem) => orderItem.productId),
      };
    });

    // Pago real con Culqi: la cancelación devuelve el dinero en la pasarela.
    if (updatedOrder.culqiChargeIdToRefund) {
      const isRefunded = await refundCulqiCharge(updatedOrder.culqiChargeIdToRefund, updatedOrder.orderTotal);
      if (!isRefunded) {
        await orderReference.update({ 'payment.status': 'refund_failed', updatedAt: FieldValue.serverTimestamp() });
      }
    }
    if (updatedOrder.nextStatus === 'cancelled') {
      await refreshLowStockNotifications(updatedOrder.productIds, [updatedOrder.branchId]);
    }
    await notifyOrderStatusChanged(
      updatedOrder.customerEmail,
      statusRequest.orderId,
      updatedOrder.orderNumber,
      updatedOrder.nextStatus,
      statusRequest.note,
    );

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
