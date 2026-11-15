import { Injectable } from '@angular/core';
import { getToken } from 'firebase/app-check';
import { environment } from '../../../environments/environment';
import { firebaseAppCheck, firebaseAuth } from '../firebase/firebase-client';

/** Error controlado que devuelven las functions: el mensaje ya es apto para mostrar. */
export class ApiRequestError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

interface ApiErrorBody {
  message?: string;
}

const CONNECTION_ERROR_MESSAGE = 'No se pudo conectar con el servidor. Inténtalo de nuevo.';

/**
 * Cliente HTTP hacia las Netlify Functions (`/api/*`).
 * Adjunta automáticamente el ID token de Firebase y el token de App Check,
 * para que el servidor pueda verificar quién llama y que no es un bot.
 */
@Injectable({ providedIn: 'root' })
export class ApiClientService {
  async postJson<ResponseBody>(functionName: string, requestBody: unknown): Promise<ResponseBody> {
    const requestHeaders = await this.buildSecurityHeaders();

    let httpResponse: Response;
    try {
      httpResponse = await fetch(`${environment.apiBaseUrl}/${functionName}`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody ?? {}),
      });
    } catch {
      throw new ApiRequestError(0, CONNECTION_ERROR_MESSAGE);
    }

    const responseBody = await this.readJsonSafely(httpResponse);
    if (!httpResponse.ok) {
      const serverMessage = (responseBody as ApiErrorBody | null)?.message;
      throw new ApiRequestError(httpResponse.status, serverMessage ?? CONNECTION_ERROR_MESSAGE);
    }
    return responseBody as ResponseBody;
  }

  private async buildSecurityHeaders(): Promise<Record<string, string>> {
    const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

    await firebaseAuth.authStateReady();
    const idToken = await firebaseAuth.currentUser?.getIdToken();
    if (idToken) {
      requestHeaders['Authorization'] = `Bearer ${idToken}`;
    }

    if (firebaseAppCheck) {
      const appCheckResult = await getToken(firebaseAppCheck, false);
      requestHeaders['X-Firebase-AppCheck'] = appCheckResult.token;
    }
    return requestHeaders;
  }

  private async readJsonSafely(httpResponse: Response): Promise<unknown> {
    try {
      return await httpResponse.json();
    } catch {
      return null;
    }
  }
}
