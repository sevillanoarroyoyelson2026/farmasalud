import type { Handler } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { z } from 'zod';
import { buildPrescriptionFolder } from '../lib/cloudinary';
import { adminFirestore } from '../lib/firebase-admin';
import {
  createErrorResponse,
  createJsonResponse,
  HttpError,
  rejectUnsupportedMethod,
} from '../lib/http-response';
import type { OrderStatus } from '../lib/order-workflow';
import { calculateEffectiveUnitPrice, type StoredProductPromotion } from '../lib/product-pricing';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCallerWithRole, parseRequestBody } from '../lib/request-guard';
import {
  reserveStockFromEarliestExpiringLots,
  type AvailableLot,
  type LotAllocation,
} from '../lib/stock-allocation';
import { firestoreDocumentIdSchema } from '../lib/validation-schemas';

const FUNCTION_NAME = 'create-order';
const DELIVERY_FEE_IN_SOLES = 6;
const MAXIMUM_UNITS_PER_PRODUCT = 20;

const createOrderSchema = z
  .object({
    /** Lo genera el navegador una vez por checkout: si el cliente reintenta, no se duplica el pedido. */
    idempotencyKey: z.string().uuid(),
    branchId: firestoreDocumentIdSchema,
    items: z
      .array(
        z
          .object({
            productId: firestoreDocumentIdSchema,
            quantity: z.number().int().min(1).max(MAXIMUM_UNITS_PER_PRODUCT),
          })
          .strict(),
      )
      .min(1)
      .max(30)
      .refine(
        (orderItems) => new Set(orderItems.map((orderItem) => orderItem.productId)).size === orderItems.length,
        { message: 'Producto repetido' },
      ),
    fulfillmentType: z.enum(['delivery', 'pickup']),
    deliveryAddress: z
      .object({
        street: z.string().trim().min(5).max(160),
        district: z.string().trim().min(2).max(60),
        reference: z.string().trim().max(160),
      })
      .strict()
      .nullable(),
    contactPhone: z.string().regex(/^9\d{8}$/),
    paymentMethod: z.enum(['simulated_card', 'cash_on_delivery']),
    simulatedCardLastDigits: z.string().regex(/^\d{4}$/).nullable(),
    prescriptionFile: z
      .object({
        publicId: z.string().max(200),
        version: z.number().int().positive(),
        format: z.enum(['jpg', 'jpeg', 'png', 'webp']),
      })
      .strict()
      .nullable(),
    customerNote: z.string().trim().max(300),
  })
  .strict()
  .refine((orderRequest) => orderRequest.fulfillmentType === 'pickup' || orderRequest.deliveryAddress !== null, {
    message: 'Falta la dirección de entrega',
    path: ['deliveryAddress'],
  })
  .refine(
    (orderRequest) => orderRequest.paymentMethod !== 'simulated_card' || orderRequest.simulatedCardLastDigits !== null,
    { message: 'Faltan los datos de la tarjeta', path: ['simulatedCardLastDigits'] },
  );

type CreateOrderRequest = z.infer<typeof createOrderSchema>;

interface PricedOrderItem {
  productId: string;
  productName: string;
  presentation: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  requiresPrescription: boolean;
  allocatedLots: LotAllocation[];
}

function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function formatOrderNumber(sequentialNumber: number): string {
  return `FS-${String(sequentialNumber).padStart(6, '0')}`;
}

function readAvailableLots(lotDocuments: DocumentSnapshot[]): AvailableLot[] {
  return lotDocuments.map((lotDocument) => ({
    lotId: lotDocument.id,
    lotNumber: lotDocument.get('lotNumber') as string,
    expirationDate: (lotDocument.get('expirationDate') as Timestamp).toDate(),
    quantityAvailable: lotDocument.get('quantityAvailable') as number,
  }));
}

/** Arma cada línea con el precio REAL de Firestore y reserva lotes FEFO. */
function priceAndReserveOrderItems(
  orderRequest: CreateOrderRequest,
  productSnapshots: DocumentSnapshot[],
  lotDocumentsByProduct: DocumentSnapshot[][],
): PricedOrderItem[] {
  return orderRequest.items.map((requestedItem, itemIndex) => {
    const productSnapshot = productSnapshots[itemIndex];
    if (!productSnapshot.exists || productSnapshot.get('isActive') !== true) {
      throw new HttpError(409, 'Un producto de tu carrito ya no está disponible. Actualiza el carrito.');
    }
    const productName = productSnapshot.get('name') as string;
    const allocatedLots = reserveStockFromEarliestExpiringLots(
      readAvailableLots(lotDocumentsByProduct[itemIndex]),
      requestedItem.quantity,
    );
    if (!allocatedLots) {
      throw new HttpError(409, `No hay stock suficiente de "${productName}" en la botica elegida.`);
    }
    const unitPrice = calculateEffectiveUnitPrice(
      productSnapshot.get('price') as number,
      productSnapshot.get('promotion') as StoredProductPromotion | null,
    );
    return {
      productId: requestedItem.productId,
      productName,
      presentation: (productSnapshot.get('presentation') as string) ?? '',
      unitPrice,
      quantity: requestedItem.quantity,
      subtotal: roundToCents(unitPrice * requestedItem.quantity),
      requiresPrescription: productSnapshot.get('requiresPrescription') === true,
      allocatedLots,
    };
  });
}

/**
 * Crea el pedido (procedimiento O04.02). Todo en una transacción:
 * 1. Recalcula precios desde Firestore (el navegador nunca manda precios).
 * 2. Reserva stock por lotes FEFO en la botica elegida y lo descuenta.
 * 3. Registra movimientos de stock y el pedido con su número correlativo.
 * El pago es SIMULADO (proyecto académico): no se reciben datos de tarjeta, solo los 4 últimos dígitos.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const customer = await authenticateCallerWithRole(requestEvent, ['customer']);
    if (!customer.isEmailVerified) {
      throw new HttpError(403, 'Verifica tu correo antes de comprar.');
    }
    await enforceRateLimit(`${FUNCTION_NAME}:${customer.uid}`, 10, 600);
    const orderRequest = parseRequestBody(requestEvent, createOrderSchema);

    if (
      orderRequest.prescriptionFile &&
      !orderRequest.prescriptionFile.publicId.startsWith(`${buildPrescriptionFolder(customer.uid)}/`)
    ) {
      throw new HttpError(400, 'La receta adjunta no es válida.');
    }

    const customerProfile = await adminFirestore.collection('users').doc(customer.uid).get();
    const customerName = (customerProfile.get('fullName') as string) || customer.email;

    const orderReference = adminFirestore.collection('orders').doc(orderRequest.idempotencyKey);
    const branchReference = adminFirestore.collection('branches').doc(orderRequest.branchId);
    const orderCounterReference = adminFirestore.collection('counters').doc('orders');
    const productReferences: DocumentReference[] = orderRequest.items.map((orderItem) =>
      adminFirestore.collection('products').doc(orderItem.productId),
    );

    const createdOrder = await adminFirestore.runTransaction(async (transaction) => {
      // ---- Lecturas (Firestore exige leer todo antes de escribir)
      const existingOrder = await transaction.get(orderReference);
      if (existingOrder.exists) {
        if (existingOrder.get('customerUid') !== customer.uid) {
          throw new HttpError(409, 'No se pudo registrar el pedido. Inténtalo de nuevo.');
        }
        return { orderId: existingOrder.id, orderNumber: existingOrder.get('orderNumber') as string };
      }
      const [branchSnapshot, orderCounterSnapshot, ...productSnapshots] = await transaction.getAll(
        branchReference,
        orderCounterReference,
        ...productReferences,
      );
      const lotDocumentsByProduct = await Promise.all(
        productReferences.map(async (productReference) => {
          const lotsSnapshot = await transaction.get(
            productReference.collection('lots').where('branchId', '==', orderRequest.branchId),
          );
          return lotsSnapshot.docs;
        }),
      );

      // ---- Validaciones de negocio
      if (!branchSnapshot.exists || branchSnapshot.get('isActive') !== true) {
        throw new HttpError(400, 'La botica elegida no está disponible.');
      }
      if (orderRequest.fulfillmentType === 'delivery' && branchSnapshot.get('offersDelivery') !== true) {
        throw new HttpError(400, 'Esta botica no hace delivery. Elige recojo en tienda.');
      }
      const pricedItems = priceAndReserveOrderItems(orderRequest, productSnapshots, lotDocumentsByProduct);
      const requiresPrescription = pricedItems.some((pricedItem) => pricedItem.requiresPrescription);
      if (requiresPrescription && !orderRequest.prescriptionFile) {
        throw new HttpError(400, 'Tu pedido incluye medicamentos con receta: adjunta la receta médica.');
      }

      const itemsTotal = roundToCents(pricedItems.reduce((total, pricedItem) => total + pricedItem.subtotal, 0));
      const deliveryFee = orderRequest.fulfillmentType === 'delivery' ? DELIVERY_FEE_IN_SOLES : 0;
      const orderNumber = formatOrderNumber(((orderCounterSnapshot.get('lastOrderNumber') as number) ?? 0) + 1);
      const initialStatus: OrderStatus = requiresPrescription ? 'pending_prescription' : 'confirmed';
      const isPaidByCard = orderRequest.paymentMethod === 'simulated_card';

      // ---- Escrituras
      transaction.set(orderCounterReference, { lastOrderNumber: FieldValue.increment(1) }, { merge: true });

      for (const pricedItem of pricedItems) {
        const productReference = adminFirestore.collection('products').doc(pricedItem.productId);
        for (const lotAllocation of pricedItem.allocatedLots) {
          transaction.update(productReference.collection('lots').doc(lotAllocation.lotId), {
            quantityAvailable: FieldValue.increment(-lotAllocation.quantity),
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.set(adminFirestore.collection('stock_movements').doc(), {
            productId: pricedItem.productId,
            branchId: orderRequest.branchId,
            lotId: lotAllocation.lotId,
            lotNumber: lotAllocation.lotNumber,
            movementType: 'exit',
            reason: 'online_sale',
            quantity: lotAllocation.quantity,
            orderId: orderReference.id,
            performedByUid: customer.uid,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        transaction.update(
          productReference,
          new FieldPath('stockByBranch', orderRequest.branchId),
          FieldValue.increment(-pricedItem.quantity),
        );
      }

      transaction.set(orderReference, {
        orderNumber,
        customerUid: customer.uid,
        customerName,
        customerEmail: customer.email,
        contactPhone: orderRequest.contactPhone,
        branchId: orderRequest.branchId,
        branchName: branchSnapshot.get('name') as string,
        fulfillmentType: orderRequest.fulfillmentType,
        deliveryAddress: orderRequest.fulfillmentType === 'delivery' ? orderRequest.deliveryAddress : null,
        customerNote: orderRequest.customerNote,
        items: pricedItems,
        itemsTotal,
        deliveryFee,
        orderTotal: roundToCents(itemsTotal + deliveryFee),
        payment: {
          method: orderRequest.paymentMethod,
          status: isPaidByCard ? 'paid' : 'pending',
          simulatedReference: isPaidByCard ? `SIM-${randomBytes(4).toString('hex').toUpperCase()}` : null,
          cardLastDigits: isPaidByCard ? orderRequest.simulatedCardLastDigits : null,
        },
        prescription: requiresPrescription
          ? { file: orderRequest.prescriptionFile, reviewStatus: 'pending', reviewNote: '', reviewedByUid: null }
          : null,
        status: initialStatus,
        statusHistory: [{ status: initialStatus, changedAt: Timestamp.now(), changedByUid: customer.uid, note: '' }],
        courierName: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { orderId: orderReference.id, orderNumber };
    });

    return createJsonResponse(requestEvent, 201, createdOrder);
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
