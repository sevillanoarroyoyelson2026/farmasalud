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
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCallerWithRole, parseRequestBody } from '../lib/request-guard';
import { firestoreDocumentIdSchema } from '../lib/validation-schemas';

const FUNCTION_NAME = 'register-stock-lot';

const registerStockLotSchema = z
  .object({
    productId: firestoreDocumentIdSchema,
    branchId: firestoreDocumentIdSchema,
    lotNumber: z
      .string()
      .trim()
      .toUpperCase()
      .min(1)
      .max(40)
      .regex(/^[A-Z0-9./-]+$/, 'Número de lote no válido'),
    expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
    quantity: z.number().int().min(1).max(100_000),
    entryReason: z.enum(['initial_stock', 'manual_entry']),
  })
  .strict();

/**
 * Registra el ingreso de un lote en una sucursal (procedimiento O02.03: registro en inventario).
 * En UNA transacción: crea o suma el lote, actualiza el stock del producto en esa sucursal
 * y guarda el movimiento. El trabajador solo puede registrar en su propia sucursal.
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

    const expirationDate = new Date(`${lotRequest.expirationDate}T23:59:59-05:00`);
    if (Number.isNaN(expirationDate.getTime()) || expirationDate.getTime() <= Date.now()) {
      throw new HttpError(400, 'No se puede ingresar un lote vencido.');
    }

    const productReference = adminFirestore.collection('products').doc(lotRequest.productId);
    const branchReference = adminFirestore.collection('branches').doc(lotRequest.branchId);
    const lotsCollection = productReference.collection('lots');

    const registeredLotId = await adminFirestore.runTransaction(async (transaction) => {
      const [productSnapshot, branchSnapshot, sameLotSnapshot] = await Promise.all([
        transaction.get(productReference),
        transaction.get(branchReference),
        transaction.get(
          lotsCollection
            .where('branchId', '==', lotRequest.branchId)
            .where('lotNumber', '==', lotRequest.lotNumber)
            .limit(1),
        ),
      ]);
      if (!productSnapshot.exists) {
        throw new HttpError(404, 'El producto no existe.');
      }
      if (!branchSnapshot.exists) {
        throw new HttpError(400, 'La sucursal no existe.');
      }

      let lotReference = lotsCollection.doc();
      const existingLot = sameLotSnapshot.docs[0];
      if (existingLot) {
        const existingExpiration = (existingLot.get('expirationDate') as Timestamp).toDate();
        if (existingExpiration.toISOString().slice(0, 10) !== expirationDate.toISOString().slice(0, 10)) {
          throw new HttpError(409, 'Ese lote ya existe con otra fecha de vencimiento.');
        }
        lotReference = existingLot.ref;
        transaction.update(lotReference, {
          quantityAvailable: FieldValue.increment(lotRequest.quantity),
          quantityReceived: FieldValue.increment(lotRequest.quantity),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        transaction.set(lotReference, {
          branchId: lotRequest.branchId,
          lotNumber: lotRequest.lotNumber,
          expirationDate: Timestamp.fromDate(expirationDate),
          quantityAvailable: lotRequest.quantity,
          quantityReceived: lotRequest.quantity,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.update(
        productReference,
        new FieldPath('stockByBranch', lotRequest.branchId),
        FieldValue.increment(lotRequest.quantity),
        'updatedAt',
        FieldValue.serverTimestamp(),
      );

      transaction.set(adminFirestore.collection('stock_movements').doc(), {
        productId: lotRequest.productId,
        branchId: lotRequest.branchId,
        lotId: lotReference.id,
        lotNumber: lotRequest.lotNumber,
        movementType: 'entry',
        reason: lotRequest.entryReason,
        quantity: lotRequest.quantity,
        performedByUid: staffMember.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      return lotReference.id;
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
    return createJsonResponse(requestEvent, 201, { lotId: registeredLotId });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
