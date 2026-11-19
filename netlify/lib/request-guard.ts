import type { HandlerEvent } from '@netlify/functions';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { ZodType } from 'zod';
import { adminAppCheck, adminAuth } from './firebase-admin';
import { HttpError } from './http-response';
import { assertSystemActivated } from './system-activation';

export type UserRole = 'admin' | 'worker' | 'customer';

export interface AuthenticatedCaller {
  uid: string;
  email: string;
  role: UserRole | null;
  branchId: string | null;
  isEmailVerified: boolean;
  decodedToken: DecodedIdToken;
}

const MAXIMUM_REQUEST_BODY_BYTES = 50_000;

/**
 * Verifica App Check cuando REQUIRE_APP_CHECK=true (producción).
 * Así solo la app web de Farmasalud puede llamar a las functions.
 */
async function verifyAppCheckToken(requestEvent: HandlerEvent): Promise<void> {
  if (process.env['REQUIRE_APP_CHECK'] !== 'true') {
    return;
  }
  const appCheckToken = requestEvent.headers['x-firebase-appcheck'];
  if (!appCheckToken) {
    throw new HttpError(401, 'Solicitud no autorizada.');
  }
  try {
    await adminAppCheck.verifyToken(appCheckToken);
  } catch {
    throw new HttpError(401, 'Solicitud no autorizada.');
  }
}

/**
 * Identifica a quien llama a partir del ID token de Firebase.
 * `checkRevoked: true` hace que un cambio de rol o una cuenta deshabilitada
 * invaliden la sesión al instante.
 */
export async function authenticateCaller(requestEvent: HandlerEvent): Promise<AuthenticatedCaller> {
  // Candado de licencia: si el sistema no está activado, ninguna operación procede.
  assertSystemActivated();

  await verifyAppCheckToken(requestEvent);

  const authorizationHeader = requestEvent.headers['authorization'] ?? '';
  if (!authorizationHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'Debes iniciar sesión.');
  }

  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(authorizationHeader.slice('Bearer '.length), true);
  } catch {
    throw new HttpError(401, 'Tu sesión expiró. Vuelve a iniciar sesión.');
  }

  const roleClaim = decodedToken['role'];
  const branchIdClaim = decodedToken['branchId'];
  return {
    uid: decodedToken.uid,
    email: decodedToken.email ?? '',
    role: roleClaim === 'admin' || roleClaim === 'worker' || roleClaim === 'customer' ? roleClaim : null,
    branchId: typeof branchIdClaim === 'string' ? branchIdClaim : null,
    isEmailVerified: decodedToken.email_verified === true,
    decodedToken,
  };
}

/** Exige además que el rol esté dentro de los permitidos (autorización por rol). */
export async function authenticateCallerWithRole(
  requestEvent: HandlerEvent,
  allowedRoles: readonly UserRole[],
): Promise<AuthenticatedCaller & { role: UserRole }> {
  const authenticatedCaller = await authenticateCaller(requestEvent);
  if (!authenticatedCaller.role || !allowedRoles.includes(authenticatedCaller.role)) {
    throw new HttpError(403, 'No tienes permiso para realizar esta acción.');
  }
  return authenticatedCaller as AuthenticatedCaller & { role: UserRole };
}

/** Lee y valida el cuerpo JSON con un esquema zod (rechaza campos extra y tamaños excesivos). */
export function parseRequestBody<ParsedBody>(
  requestEvent: HandlerEvent,
  requestSchema: ZodType<ParsedBody>,
): ParsedBody {
  const rawBody = requestEvent.body ?? '{}';
  if (rawBody.length > MAXIMUM_REQUEST_BODY_BYTES) {
    throw new HttpError(413, 'La solicitud es demasiado grande.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, 'El formato de la solicitud no es válido.');
  }
  return requestSchema.parse(parsedJson);
}
