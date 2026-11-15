import { ApiRequestError } from '../../core/http/api-client.service';

/**
 * Mensaje que se puede mostrar al usuario a partir de un error.
 * - Errores de las functions y los lanzados por nuestros repositorios ya son seguros.
 * - Errores técnicos de Firebase (tienen `code`) se reemplazan por un mensaje genérico.
 */
export function describeErrorForUser(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  if (error instanceof Error && !('code' in error)) {
    return error.message;
  }
  return fallbackMessage;
}
