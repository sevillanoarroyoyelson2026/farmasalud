import type { HandlerEvent, HandlerResponse } from '@netlify/functions';
import { ZodError } from 'zod';

/** Error con código HTTP y mensaje SEGURO para mostrar al usuario. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const GENERIC_SERVER_ERROR_MESSAGE = 'Ocurrió un error interno. Inténtalo de nuevo en unos minutos.';

/** CORS restringido al dominio propio (ALLOWED_ORIGIN). Sin la variable, solo mismo origen. */
function buildCorsHeaders(requestOrigin: string | undefined): Record<string, string> {
  const allowedOrigin = process.env['ALLOWED_ORIGIN'];
  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (allowedOrigin && requestOrigin === allowedOrigin) {
    corsHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
    corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Firebase-AppCheck';
    corsHeaders['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    corsHeaders['Vary'] = 'Origin';
  }
  return corsHeaders;
}

export function createJsonResponse(
  requestEvent: HandlerEvent,
  statusCode: number,
  responseBody: unknown,
): HandlerResponse {
  return {
    statusCode,
    headers: buildCorsHeaders(requestEvent.headers['origin']),
    body: JSON.stringify(responseBody),
  };
}

/**
 * Convierte cualquier error en una respuesta controlada.
 * El detalle técnico va al log del servidor; el cliente solo recibe un mensaje genérico.
 */
export function createErrorResponse(
  requestEvent: HandlerEvent,
  functionName: string,
  error: unknown,
): HandlerResponse {
  if (error instanceof HttpError) {
    return createJsonResponse(requestEvent, error.statusCode, { message: error.message });
  }
  if (error instanceof ZodError) {
    return createJsonResponse(requestEvent, 400, {
      message: 'Los datos enviados no son válidos.',
      invalidFields: error.issues.map((validationIssue) => validationIssue.path.join('.')),
    });
  }
  const errorDescription = error instanceof Error ? error.message : String(error);
  console.error(`[${functionName}] ${errorDescription}`);
  return createJsonResponse(requestEvent, 500, { message: GENERIC_SERVER_ERROR_MESSAGE });
}

/** Solo se aceptan POST (y el preflight OPTIONS de CORS). */
export function rejectUnsupportedMethod(requestEvent: HandlerEvent): HandlerResponse | null {
  if (requestEvent.httpMethod === 'OPTIONS') {
    return createJsonResponse(requestEvent, 204, {});
  }
  if (requestEvent.httpMethod !== 'POST') {
    return createJsonResponse(requestEvent, 405, { message: 'Método no permitido.' });
  }
  return null;
}
