import type { Handler } from '@netlify/functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
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

const FUNCTION_NAME = 'set-product-promotion';
const MAXIMUM_PROMOTION_DAYS = 120;

const setProductPromotionSchema = z
  .object({
    productId: firestoreDocumentIdSchema,
    /** null = quitar la promoción. */
    promotion: z
      .object({
        discountPercent: z.number().int().min(1).max(70),
        endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
      })
      .strict()
      .nullable(),
  })
  .strict();

/**
 * Activa o quita la promoción de un producto. El descuento lo aplica el servidor
 * al crear el pedido; queda en auditoría porque cambia el precio de venta.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const administrator = await authenticateCallerWithRole(requestEvent, ['admin']);
    await enforceRateLimit(`${FUNCTION_NAME}:${administrator.uid}`, 60, 600);
    const promotionRequest = parseRequestBody(requestEvent, setProductPromotionSchema);

    let storedPromotion: { discountPercent: number; endsAt: Timestamp } | null = null;
    if (promotionRequest.promotion) {
      const endsAt = new Date(`${promotionRequest.promotion.endsAt}T23:59:59-05:00`);
      const maximumEndDate = Date.now() + MAXIMUM_PROMOTION_DAYS * 86_400_000;
      if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now() || endsAt.getTime() > maximumEndDate) {
        throw new HttpError(400, `La promoción debe terminar entre mañana y ${MAXIMUM_PROMOTION_DAYS} días.`);
      }
      storedPromotion = { discountPercent: promotionRequest.promotion.discountPercent, endsAt: Timestamp.fromDate(endsAt) };
    }

    const productReference = adminFirestore.collection('products').doc(promotionRequest.productId);
    const productSnapshot = await productReference.get();
    if (!productSnapshot.exists) {
      throw new HttpError(404, 'El producto no existe.');
    }
    await productReference.update({ promotion: storedPromotion, updatedAt: FieldValue.serverTimestamp() });

    await recordAuditEvent({
      action: 'product.price_changed',
      performedByUid: administrator.uid,
      targetType: 'product',
      targetId: promotionRequest.productId,
      details: { promotion: promotionRequest.promotion },
    });
    return createJsonResponse(requestEvent, 200, { isUpdated: true });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
