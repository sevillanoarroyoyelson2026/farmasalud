import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { recordAuditEvent } from '../lib/audit-log';
import { adminFirestore } from '../lib/firebase-admin';
import {
  createErrorResponse,
  createJsonResponse,
  HttpError,
  rejectUnsupportedMethod,
} from '../lib/http-response';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCallerWithRole, parseRequestBody } from '../lib/request-guard';
import { firestoreDocumentIdSchema } from '../lib/validation-schemas';

const FUNCTION_NAME = 'cancel-purchase-order';

const cancelPurchaseOrderSchema = z
  .object({
    purchaseOrderId: firestoreDocumentIdSchema,
    cancellationReason: z.string().trim().min(5).max(300),
  })
  .strict();

/** Anula una orden de compra que aún no recibió mercadería. */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const administrator = await authenticateCallerWithRole(requestEvent, ['admin']);
    await enforceRateLimit(`${FUNCTION_NAME}:${administrator.uid}`, 30, 600);
    const cancelRequest = parseRequestBody(requestEvent, cancelPurchaseOrderSchema);
    const purchaseOrderReference = adminFirestore.collection('purchase_orders').doc(cancelRequest.purchaseOrderId);

    await adminFirestore.runTransaction(async (transaction) => {
      const purchaseOrderSnapshot = await transaction.get(purchaseOrderReference);
      if (!purchaseOrderSnapshot.exists) {
        throw new HttpError(404, 'La orden de compra no existe.');
      }
      if (purchaseOrderSnapshot.get('status') !== 'issued') {
        throw new HttpError(409, 'Solo se anulan órdenes sin mercadería recibida.');
      }
      transaction.update(purchaseOrderReference, {
        status: 'cancelled',
        cancellationReason: cancelRequest.cancellationReason,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await recordAuditEvent({
      action: 'purchase_order.cancelled',
      performedByUid: administrator.uid,
      targetType: 'purchase_order',
      targetId: cancelRequest.purchaseOrderId,
      details: { reason: cancelRequest.cancellationReason },
    });
    return createJsonResponse(requestEvent, 200, { isCancelled: true });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
