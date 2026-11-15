import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminFirestore } from '../lib/firebase-admin';
import {
  createErrorResponse,
  createJsonResponse,
  rejectUnsupportedMethod,
} from '../lib/http-response';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCallerWithRole, parseRequestBody } from '../lib/request-guard';
import { formatSequentialNumber } from '../lib/stock-entry';

const FUNCTION_NAME = 'submit-claim';

const submitClaimSchema = z
  .object({
    claimType: z.enum(['complaint', 'grievance']),
    fullName: z.string().trim().min(3).max(80),
    documentNumber: z.string().regex(/^\d{8}$|^\d{9,12}$/, 'Documento no válido'),
    address: z.string().trim().min(5).max(160),
    phone: z.string().regex(/^9\d{8}$/),
    relatedOrderNumber: z.string().trim().max(20),
    claimedAmount: z.number().min(0).max(100_000).nullable(),
    description: z.string().trim().min(20).max(2000),
    requestedSolution: z.string().trim().min(5).max(1000),
  })
  .strict();

/**
 * Libro de Reclamaciones virtual (Código de Protección y Defensa del Consumidor, Ley 29571).
 * Asigna número correlativo RC-000001; el cliente puede seguir la respuesta en su cuenta.
 * "complaint" = reclamo (disconformidad con el producto/servicio); "grievance" = queja (atención).
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const customer = await authenticateCallerWithRole(requestEvent, ['customer']);
    await enforceRateLimit(`${FUNCTION_NAME}:${customer.uid}`, 5, 3600);
    const claimRequest = parseRequestBody(requestEvent, submitClaimSchema);

    const claimReference = adminFirestore.collection('claims').doc();
    const counterReference = adminFirestore.collection('counters').doc('claims');
    const claimNumber = await adminFirestore.runTransaction(async (transaction) => {
      const counterSnapshot = await transaction.get(counterReference);
      const nextClaimNumber = formatSequentialNumber('RC', ((counterSnapshot.get('lastNumber') as number) ?? 0) + 1);
      transaction.set(counterReference, { lastNumber: FieldValue.increment(1) }, { merge: true });
      transaction.set(claimReference, {
        ...claimRequest,
        claimNumber: nextClaimNumber,
        customerUid: customer.uid,
        customerEmail: customer.email,
        status: 'open',
        response: '',
        respondedByUid: null,
        respondedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return nextClaimNumber;
    });

    return createJsonResponse(requestEvent, 201, { claimId: claimReference.id, claimNumber });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
