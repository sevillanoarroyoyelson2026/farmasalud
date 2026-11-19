import type { Handler } from '@netlify/functions';
import { createErrorResponse, createJsonResponse, rejectUnsupportedMethod } from '../lib/http-response';
import { isSystemActivated } from '../lib/system-activation';

const FUNCTION_NAME = 'system-status';

/**
 * Estado de activación del sistema. Público (sin sesión): el frontend lo consulta
 * al arrancar para decidir si muestra la app o la pantalla de "activación pendiente".
 * No expone la clave; solo responde `{ active: true | false }`.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }
  try {
    return createJsonResponse(requestEvent, 200, { active: isSystemActivated() });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
