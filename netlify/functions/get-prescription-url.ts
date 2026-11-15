import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import { buildSignedPrescriptionUrl, type PrescriptionFileReference } from '../lib/cloudinary';
import { adminFirestore } from '../lib/firebase-admin';
import {
  createErrorResponse,
  createJsonResponse,
  HttpError,
  rejectUnsupportedMethod,
} from '../lib/http-response';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCallerWithRole, parseRequestBody } from '../lib/request-guard';

const FUNCTION_NAME = 'get-prescription-url';

const getPrescriptionUrlSchema = z.object({ orderId: z.string().uuid() }).strict();

/**
 * Entrega la URL firmada de la receta de un pedido. Las recetas son datos de salud:
 * solo las ve el cliente dueño o el personal de la sucursal que atiende el pedido.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const caller = await authenticateCallerWithRole(requestEvent, ['admin', 'worker', 'customer']);
    await enforceRateLimit(`${FUNCTION_NAME}:${caller.uid}`, 60, 600);
    const { orderId } = parseRequestBody(requestEvent, getPrescriptionUrlSchema);

    const orderSnapshot = await adminFirestore.collection('orders').doc(orderId).get();
    const canSeePrescription =
      orderSnapshot.exists &&
      (caller.role === 'admin' ||
        (caller.role === 'worker' && caller.branchId === orderSnapshot.get('branchId')) ||
        (caller.role === 'customer' && caller.uid === orderSnapshot.get('customerUid')));
    const prescriptionFile = orderSnapshot.get('prescription.file') as PrescriptionFileReference | undefined;
    if (!canSeePrescription || !prescriptionFile) {
      throw new HttpError(404, 'La receta no existe.');
    }

    return createJsonResponse(requestEvent, 200, { prescriptionUrl: buildSignedPrescriptionUrl(prescriptionFile) });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
