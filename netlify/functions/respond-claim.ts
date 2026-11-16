import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { notifyClaimAnswered } from '../lib/email-notifications';
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

const FUNCTION_NAME = 'respond-claim';

const respondClaimSchema = z
  .object({
    claimId: firestoreDocumentIdSchema,
    status: z.enum(['open', 'in_review', 'resolved']),
    response: z.string().trim().max(2000),
  })
  .strict()
  .refine((claimResponse) => claimResponse.status !== 'resolved' || claimResponse.response.length >= 10, {
    message: 'La respuesta debe tener al menos 10 caracteres',
    path: ['response'],
  });

/**
 * El administrador atiende un reclamo. Al marcarlo como respondido, el cliente
 * recibe la respuesta por correo (además de verla en su cuenta).
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const administrator = await authenticateCallerWithRole(requestEvent, ['admin']);
    await enforceRateLimit(`${FUNCTION_NAME}:${administrator.uid}`, 60, 600);
    const claimResponse = parseRequestBody(requestEvent, respondClaimSchema);

    const claimReference = adminFirestore.collection('claims').doc(claimResponse.claimId);
    const claimSnapshot = await claimReference.get();
    if (!claimSnapshot.exists) {
      throw new HttpError(404, 'El reclamo no existe.');
    }
    const wasAlreadyResolved = claimSnapshot.get('status') === 'resolved';

    await claimReference.update({
      status: claimResponse.status,
      response: claimResponse.response,
      respondedByUid: administrator.uid,
      respondedAt: claimResponse.status === 'resolved' ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (claimResponse.status === 'resolved' && !wasAlreadyResolved) {
      await notifyClaimAnswered(
        (claimSnapshot.get('customerEmail') as string) ?? '',
        claimSnapshot.get('claimNumber') as string,
        claimResponse.response,
      );
    }
    return createJsonResponse(requestEvent, 200, { isUpdated: true });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
