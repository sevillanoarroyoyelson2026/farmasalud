import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminFirestore } from './firebase-admin';
import { HttpError } from './http-response';

const RATE_LIMITS_COLLECTION = 'rate_limits';

/**
 * Límite simple de peticiones por ventana de tiempo, guardado en Firestore
 * (las functions no comparten memoria entre instancias).
 * Ejemplo: enforceRateLimit(`create-order:${uid}`, 5, 60) → máximo 5 pedidos por minuto.
 */
export async function enforceRateLimit(
  rateLimitKey: string,
  maximumRequests: number,
  windowSeconds: number,
): Promise<void> {
  const safeDocumentId = rateLimitKey.replace(/[^A-Za-z0-9:_-]/g, '_');
  const rateLimitReference = adminFirestore.collection(RATE_LIMITS_COLLECTION).doc(safeDocumentId);
  const currentTimeMillis = Date.now();

  const isRequestAllowed = await adminFirestore.runTransaction(async (transaction) => {
    const rateLimitSnapshot = await transaction.get(rateLimitReference);
    const windowStartMillis = (rateLimitSnapshot.get('windowStartedAt') as Timestamp | undefined)?.toMillis() ?? 0;
    const requestCount = (rateLimitSnapshot.get('requestCount') as number | undefined) ?? 0;
    const isWindowExpired = currentTimeMillis - windowStartMillis > windowSeconds * 1000;

    if (isWindowExpired) {
      transaction.set(rateLimitReference, {
        windowStartedAt: Timestamp.fromMillis(currentTimeMillis),
        requestCount: 1,
        expiresAt: Timestamp.fromMillis(currentTimeMillis + windowSeconds * 2000),
      });
      return true;
    }
    if (requestCount >= maximumRequests) {
      return false;
    }
    transaction.update(rateLimitReference, { requestCount: FieldValue.increment(1) });
    return true;
  });

  if (!isRequestAllowed) {
    throw new HttpError(429, 'Hiciste demasiadas solicitudes seguidas. Espera un momento.');
  }
}
