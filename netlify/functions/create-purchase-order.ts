import type { Handler } from '@netlify/functions';
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
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
import { formatSequentialNumber } from '../lib/stock-entry';
import { firestoreDocumentIdSchema } from '../lib/validation-schemas';

const FUNCTION_NAME = 'create-purchase-order';

const createPurchaseOrderSchema = z
  .object({
    supplierId: firestoreDocumentIdSchema,
    branchId: firestoreDocumentIdSchema,
    quotationId: firestoreDocumentIdSchema.nullable(),
    expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
    notes: z.string().trim().max(500),
    items: z
      .array(
        z
          .object({
            productId: firestoreDocumentIdSchema,
            quantity: z.number().int().min(1).max(100_000),
            unitCost: z.number().positive().max(100_000),
          })
          .strict(),
      )
      .min(1)
      .max(60)
      .refine((orderItems) => new Set(orderItems.map((orderItem) => orderItem.productId)).size === orderItems.length, {
        message: 'Producto repetido',
      }),
  })
  .strict();

function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Genera una orden de compra (procedimiento O01.02: compras y abastecimiento).
 * Si viene de una cotización, la marca como adjudicada a ese proveedor.
 * Número correlativo OC-000001 y registro en auditoría.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const administrator = await authenticateCallerWithRole(requestEvent, ['admin']);
    await enforceRateLimit(`${FUNCTION_NAME}:${administrator.uid}`, 60, 600);
    const purchaseRequest = parseRequestBody(requestEvent, createPurchaseOrderSchema);

    const purchaseOrderReference = adminFirestore.collection('purchase_orders').doc();
    const supplierReference = adminFirestore.collection('suppliers').doc(purchaseRequest.supplierId);
    const branchReference = adminFirestore.collection('branches').doc(purchaseRequest.branchId);
    const counterReference = adminFirestore.collection('counters').doc('purchase_orders');
    const productReferences: DocumentReference[] = purchaseRequest.items.map((orderItem) =>
      adminFirestore.collection('products').doc(orderItem.productId),
    );
    const quotationReference = purchaseRequest.quotationId
      ? adminFirestore.collection('quotations').doc(purchaseRequest.quotationId)
      : null;

    const createdPurchaseOrder = await adminFirestore.runTransaction(async (transaction) => {
      const [supplierSnapshot, branchSnapshot, counterSnapshot, ...productSnapshots] = await transaction.getAll(
        supplierReference,
        branchReference,
        counterReference,
        ...productReferences,
      );
      const quotationSnapshot = quotationReference ? await transaction.get(quotationReference) : null;

      if (!supplierSnapshot.exists || supplierSnapshot.get('isActive') !== true) {
        throw new HttpError(400, 'El proveedor no existe o está inactivo.');
      }
      if (!branchSnapshot.exists) {
        throw new HttpError(400, 'La sucursal no existe.');
      }
      if (quotationSnapshot && (!quotationSnapshot.exists || quotationSnapshot.get('status') !== 'open')) {
        throw new HttpError(409, 'La cotización ya fue adjudicada o cancelada.');
      }

      const purchaseOrderItems = purchaseRequest.items.map((requestedItem, itemIndex) => {
        const productSnapshot = productSnapshots[itemIndex];
        if (!productSnapshot.exists) {
          throw new HttpError(400, 'Uno de los productos no existe.');
        }
        return {
          productId: requestedItem.productId,
          productName: productSnapshot.get('name') as string,
          presentation: (productSnapshot.get('presentation') as string) ?? '',
          quantityOrdered: requestedItem.quantity,
          quantityReceived: 0,
          quantityRejected: 0,
          unitCost: roundToCents(requestedItem.unitCost),
          subtotal: roundToCents(requestedItem.unitCost * requestedItem.quantity),
        };
      });

      const orderNumber = formatSequentialNumber(
        'OC',
        ((counterSnapshot.get('lastNumber') as number) ?? 0) + 1,
      );
      transaction.set(counterReference, { lastNumber: FieldValue.increment(1) }, { merge: true });
      transaction.set(purchaseOrderReference, {
        orderNumber,
        supplierId: purchaseRequest.supplierId,
        supplierName: supplierSnapshot.get('name') as string,
        supplierRuc: supplierSnapshot.get('ruc') as string,
        branchId: purchaseRequest.branchId,
        branchName: branchSnapshot.get('name') as string,
        quotationId: purchaseRequest.quotationId,
        items: purchaseOrderItems,
        orderTotal: roundToCents(purchaseOrderItems.reduce((total, orderItem) => total + orderItem.subtotal, 0)),
        expectedDeliveryDate: Timestamp.fromDate(new Date(`${purchaseRequest.expectedDeliveryDate}T12:00:00-05:00`)),
        notes: purchaseRequest.notes,
        status: 'issued',
        cancellationReason: '',
        createdByUid: administrator.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (quotationReference) {
        transaction.update(quotationReference, {
          status: 'awarded',
          awardedSupplierId: purchaseRequest.supplierId,
          purchaseOrderId: purchaseOrderReference.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return { purchaseOrderId: purchaseOrderReference.id, orderNumber };
    });

    await recordAuditEvent({
      action: 'purchase_order.approved',
      performedByUid: administrator.uid,
      targetType: 'purchase_order',
      targetId: createdPurchaseOrder.purchaseOrderId,
      details: { orderNumber: createdPurchaseOrder.orderNumber, supplierId: purchaseRequest.supplierId },
    });
    return createJsonResponse(requestEvent, 201, createdPurchaseOrder);
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
