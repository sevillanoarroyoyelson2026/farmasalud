import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { recordAuditEvent } from '../lib/audit-log';
import { isImageFromOwnCloudinaryAccount } from '../lib/cloudinary';
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
import { firestoreDocumentIdSchema } from '../lib/validation-schemas';

const FUNCTION_NAME = 'admin-save-product';
const PRODUCTS_COLLECTION = 'products';

const saveProductSchema = z
  .object({
    productId: firestoreDocumentIdSchema.nullable(),
    name: z.string().trim().min(2).max(120),
    genericName: z.string().trim().max(120),
    presentation: z.string().trim().max(120),
    laboratory: z.string().trim().max(80),
    description: z.string().trim().max(1000),
    categoryId: firestoreDocumentIdSchema,
    price: z.number().positive().max(100_000),
    requiresPrescription: z.boolean(),
    imageUrl: z
      .string()
      .trim()
      .max(500)
      .refine((imageUrl) => imageUrl === '' || isImageFromOwnCloudinaryAccount(imageUrl), {
        message: 'La imagen debe subirse desde el panel',
      }),
    isActive: z.boolean(),
    minimumStock: z.number().int().min(0).max(100_000),
  })
  .strict();

function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Crea o actualiza un producto. Va por servidor (y no directo a Firestore) para:
 * - que el stock por sucursal nunca se pueda tocar desde un formulario,
 * - validar que la categoría exista y la imagen sea de nuestro Cloudinary,
 * - dejar en auditoría cada cambio de precio.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const administrator = await authenticateCallerWithRole(requestEvent, ['admin']);
    await enforceRateLimit(`${FUNCTION_NAME}:${administrator.uid}`, 120, 600);
    const { productId, ...productFields } = parseRequestBody(requestEvent, saveProductSchema);
    const normalizedProductFields = { ...productFields, price: roundToCents(productFields.price) };

    const categorySnapshot = await adminFirestore.collection('categories').doc(productFields.categoryId).get();
    if (!categorySnapshot.exists) {
      throw new HttpError(400, 'La categoría elegida no existe.');
    }

    if (!productId) {
      const createdProductReference = await adminFirestore.collection(PRODUCTS_COLLECTION).add({
        ...normalizedProductFields,
        stockByBranch: {},
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await recordAuditEvent({
        action: 'product.created',
        performedByUid: administrator.uid,
        targetType: 'product',
        targetId: createdProductReference.id,
        details: { name: normalizedProductFields.name, price: normalizedProductFields.price },
      });
      return createJsonResponse(requestEvent, 201, { productId: createdProductReference.id });
    }

    const productReference = adminFirestore.collection(PRODUCTS_COLLECTION).doc(productId);
    const previousPrice = await adminFirestore.runTransaction(async (transaction) => {
      const productSnapshot = await transaction.get(productReference);
      if (!productSnapshot.exists) {
        throw new HttpError(404, 'El producto no existe.');
      }
      transaction.update(productReference, {
        ...normalizedProductFields,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return productSnapshot.get('price') as number;
    });

    if (previousPrice !== normalizedProductFields.price) {
      await recordAuditEvent({
        action: 'product.price_changed',
        performedByUid: administrator.uid,
        targetType: 'product',
        targetId: productId,
        details: { previousPrice, newPrice: normalizedProductFields.price },
      });
    }
    await refreshLowStockNotifications([productId], 'all');
    return createJsonResponse(requestEvent, 200, { productId });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
