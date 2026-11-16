import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { recordAuditEvent } from '../lib/audit-log';
import { adminFirestore } from '../lib/firebase-admin';
import {
  createErrorResponse,
  createJsonResponse,
  HttpError,
  rejectUnsupportedMethod,
} from '../lib/http-response';
import { refreshLowStockNotifications } from '../lib/low-stock-notifications';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCallerWithRole, parseRequestBody } from '../lib/request-guard';
import {
  findExistingLot,
  LOT_NUMBER_PATTERN,
  parseExpirationDate,
  writeStockEntry,
} from '../lib/stock-entry';
import { firestoreDocumentIdSchema } from '../lib/validation-schemas';

const FUNCTION_NAME = 'register-stock-lot';

const registerStockLotSchema = z
  .object({
    productId: firestoreDocumentIdSchema,
    branchId: firestoreDocumentIdSchema,
    lotNumber: z.string().trim().toUpperCase().min(1).max(40).regex(LOT_NUMBER_PATTERN, 'Número de lote no válido'),
    expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
    quantity: z.number().int().min(1).max(100_000),
    entryReason: z.enum(['initial_stock', 'manual_entry']),
  })
  .strict();

/**
 * Ingreso manual de un lote (stock inicial o ajuste de entrada), procedimiento O02.03.
 * Las compras a proveedores entran por `register-goods-reception`.
 * El trabajador solo puede registrar en su propia sucursal.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const staffMember = await authenticateCallerWithRole(requestEvent, ['admin', 'worker']);
    await enforceRateLimit(`${FUNCTION_NAME}:${staffMember.uid}`, 120, 600);
    const lotRequest = parseRequestBody(requestEvent, registerStockLotSchema);
    if (staffMember.role === 'worker' && staffMember.branchId !== lotRequest.branchId) {
      throw new HttpError(403, 'Solo puedes registrar stock en tu sucursal.');
    }
    const expirationDate = parseExpirationDate(lotRequest.expirationDate);

    const productReference = adminFirestore.collection('products').doc(lotRequest.productId);
    const branchReference = adminFirestore.collection('branches').doc(lotRequest.branchId);

    const registeredLotId = await adminFirestore.runTransaction(async (transaction) => {
      const [productSnapshot, branchSnapshot] = await transaction.getAll(productReference, branchReference);
      const existingLot = await findExistingLot(transaction, productReference, lotRequest.branchId, lotRequest.lotNumber);
      if (!productSnapshot.exists) {
        throw new HttpError(404, 'El producto no existe.');
      }
      if (!branchSnapshot.exists) {
        throw new HttpError(400, 'La sucursal no existe.');
      }
      return writeStockEntry(transaction, {
        productReference,
        branchId: lotRequest.branchId,
        lotNumber: lotRequest.lotNumber,
        expirationDate,
        quantity: lotRequest.quantity,
        reason: lotRequest.entryReason,
        performedByUid: staffMember.uid,
        sourceDocumentId: null,
        existingLot,
      });
    });

    await recordAuditEvent({
      action: 'stock.lot_registered',
      performedByUid: staffMember.uid,
      targetType: 'product',
      targetId: lotRequest.productId,
      details: {
        branchId: lotRequest.branchId,
        lotNumber: lotRequest.lotNumber,
        quantity: lotRequest.quantity,
        reason: lotRequest.entryReason,
      },
    });
    await refreshLowStockNotifications([lotRequest.productId], [lotRequest.branchId]);
    return createJsonResponse(requestEvent, 201, { lotId: registeredLotId });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
