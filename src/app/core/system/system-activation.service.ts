import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Estado de activación del sistema en el frontend.
 *
 * Es solo para la experiencia de usuario (mostrar u ocultar la pantalla de
 * "activación pendiente"). El bloqueo REAL está en el servidor: aunque alguien
 * saltara esta pantalla, las functions rechazan toda operación si el sistema no
 * está activado.
 *
 * Ante un fallo de red se asume ACTIVO (fail-open): así una caída momentánea no
 * deja fuera a un cliente que sí pagó; si de verdad está apagado, el servidor
 * bloqueará igual.
 */
@Injectable({ providedIn: 'root' })
export class SystemActivationService {
  private readonly activatedState = signal(true);

  /** `true` mientras el sistema esté activo (o no se haya podido comprobar). */
  readonly isActivated = this.activatedState.asReadonly();

  async refreshActivationStatus(): Promise<void> {
    try {
      const httpResponse = await fetch(`${environment.apiBaseUrl}/system-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(8_000),
      });
      if (!httpResponse.ok) {
        this.activatedState.set(true);
        return;
      }
      const responseBody = (await httpResponse.json()) as { active?: boolean };
      this.activatedState.set(responseBody.active !== false);
    } catch {
      this.activatedState.set(true);
    }
  }
}
