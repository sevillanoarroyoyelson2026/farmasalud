import type { Handler } from '@netlify/functions';
import { FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
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
import {
  findExistingLot,
  LOT_NUMBER_PATTERN,
  parseExpirationDate,
  writeStockEntry,
} from '../lib/stock-entry';
import { firestoreDocumentIdSchema } from '../lib/validation-schemas';

const FUNCTION_NAME = 'register-goods-reception';

const receptionLineSchema = z
  .object({
    productId: firestoreDocumentIdSchema,
    lotNumber: z.string().trim().toUpperCase().min(1).max(40).regex(LOT_NUMBER_PATTERN, 'Número de lote no válido'),
    expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida'),
    quantityReceived: z.number().int().min(0).max(100_000),
    quantityRejected: z.number().int().min(0).max(100_000),
  })
  .strict()
  .refine((receptionLine) => receptionLine.quantityReceived + receptionLine.quantityRejected > 0, {
    message: 'Línea sin cantidades',
  });

const registerGoodsReceptionSchema = z
  .object({
    purchaseOrderId: firestoreDocumentIdSchema,
    lines: z
      .array(receptionLineSchema)
      .min(1)
      .max(60)
      .refine(
        (receptionLines) =>
          new Set(receptionLines.map((receptionLine) => `${receptionLine.productId}|${receptionLine.lotNumber}`)).size ===
          receptionLines.length,
        { message: 'Lote repetido para el mismo producto' },
      ),
    incidentNotes: z.string().trim().max(500),
  })
  .strict();

interface StoredPurchaseOrderItem {
  productId: string;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRejected: number;
  [otherField: string]: unknown;
}

/**
 * Recepción de mercadería de una orden de compra (procedimientos O01.02 y O02.03).
 * En una transacción: verifica cantidades contra lo pedido, ingresa los lotes conformes
 * al stock de la sucursal, registra incidencias (unidades rechazadas) y actualiza la OC.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const staffMember = await authenticateCallerWithRole(requestEvent, ['admin', 'worker']);
    await enforceRateLimit(`${FUNCTION_NAME}:${staffMember.uid}`, 30, 600);
    const receptionRequest = parseRequestBody(requestEvent, registerGoodsReceptionSchema);
    const expirationDateByLine = receptionRequest.lines.map((receptionLine) =>
      receptionLine.quantityReceived > 0 ? parseExpirationDate(receptionLine.expirationDate) : null,
    );

    const purchaseOrderReference = adminFirestore.collection('purchase_orders').doc(receptionRequest.purchaseOrderId);
    const receptionReference = adminFirestore.collection('receptions').doc();

    const receptionSummary = await adminFirestore.runTransaction(async (transaction) => {
      // ---- Lecturas
      const purchaseOrderSnapshot = await transaction.get(purchaseOrderReference);
      if (!purchaseOrderSnapshot.exists) {
        throw new HttpError(404, 'La orden de compra no existe.');
      }
      const branchId = purchaseOrderSnapshot.get('branchId') as string;
      if (staffMember.role === 'worker' && staffMember.branchId !== branchId) {
        throw new HttpError(404, 'La orden de compra no existe.');
      }
      const purchaseOrderStatus = purchaseOrderSnapshot.get('status') as string;
      if (purchaseOrderStatus !== 'issued' && purchaseOrderStatus !== 'partially_received') {
        throw new HttpError(409, 'Esta orden ya fue recibida por completo o está anulada.');
      }
      const existingLots: (QueryDocumentSnapshot | null)[] = [];
      for (const receptionLine of receptionRequest.lines) {
        const productReference = adminFirestore.collection('products').doc(receptionLine.productId);
        existingLots.push(
          receptionLine.quantityReceived > 0
            ? await findExistingLot(transaction, productReference, branchId, receptionLine.lotNumber)
            : null,
        );
      }

      // ---- Validación contra lo pedido
      const purchaseOrderItems = (purchaseOrderSnapshot.get('items') as StoredPurchaseOrderItem[]).map(
        (orderItem) => ({ ...orderItem }),
      );
      for (const receptionLine of receptionRequest.lines) {
        const orderItem = purchaseOrderItems.find((item) => item.productId === receptionLine.productId);
        if (!orderItem) {
          throw new HttpError(400, 'Se recibió un producto que no está en la orden de compra.');
        }
        orderItem.quantityReceived += receptionLine.quantityReceived;
        orderItem.quantityRejected += receptionLine.quantityRejected;
        if (orderItem.quantityReceived > orderItem.quantityOrdered) {
          throw new HttpError(400, `Se están recibiendo más unidades de "${orderItem.productName}" que las pedidas.`);
        }
      }
      const isFullyReceived = purchaseOrderItems.every(
        (orderItem) => orderItem.quantityReceived + orderItem.quantityRejected >= orderItem.quantityOrdered,
      );
      const totalRejectedUnits = receptionRequest.lines.reduce((total, line) => total + line.quantityRejected, 0);

      // ---- Escrituras
      receptionRequest.lines.forEach((receptionLine, lineIndex) => {
        const expirationDate = expirationDateByLine[lineIndex];
        if (receptionLine.quantityReceived === 0 || !expirationDate) {
          return;
        }
        writeStockEntry(transaction, {
          productReference: adminFirestore.collection('products').doc(receptionLine.productId),
          branchId,
          lotNumber: receptionLine.lotNumber,
          expirationDate,
          quantity: receptionLine.quantityReceived,
          reason: 'purchase_reception',
          performedByUid: staffMember.uid,
          sourceDocumentId: purchaseOrderReference.id,
          existingLot: existingLots[lineIndex],
        });
      });

      transaction.set(receptionReference, {
        purchaseOrderId: purchaseOrderReference.id,
        purchaseOrderNumber: purchaseOrderSnapshot.get('orderNumber') as string,
        supplierName: purchaseOrderSnapshot.get('supplierName') as string,
        branchId,
        lines: receptionRequest.lines.map((receptionLine) => ({
          ...receptionLine,
          productName: purchaseOrderItems.find((item) => item.productId === receptionLine.productId)?.productName ?? '',
        })),
        hasIncidents: totalRejectedUnits > 0 || receptionRequest.incidentNotes.length > 0,
        incidentNotes: receptionRequest.incidentNotes,
        receivedByUid: staffMember.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(purchaseOrderReference, {
        items: purchaseOrderItems,
        status: isFullyReceived ? 'received' : 'partially_received',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        orderNumber: purchaseOrderSnapshot.get('orderNumber') as string,
        isFullyReceived,
        totalRejectedUnits,
      };
    });

    await recordAuditEvent({
      action: 'purchase_order.received',
      performedByUid: staffMember.uid,
      targetType: 'purchase_order',
      targetId: receptionRequest.purchaseOrderId,
      details: receptionSummary,
    });
    return createJsonResponse(requestEvent, 201, { receptionId: receptionReference.id, ...receptionSummary });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
