import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Logger central del front.
 * - En desarrollo muestra el detalle en consola para depurar.
 * - En producción solo registra errores y nunca imprime tokens ni datos personales:
 *   quien llama debe pasar un `context` corto (p. ej. 'AuthService.signInWithGoogle').
 */
@Injectable({ providedIn: 'root' })
export class AppLoggerService {
  logDebug(context: string, message: string): void {
    if (!environment.isProduction) {
      console.debug(`[${context}] ${message}`);
    }
  }

  logError(context: string, error: unknown): void {
    const errorDescription = this.describeError(error);
    console.error(`[${context}] ${errorDescription}`);
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      const errorCode = (error as { code?: string }).code;
      return errorCode ? `${errorCode}: ${error.message}` : error.message;
    }
    return String(error);
  }
}
