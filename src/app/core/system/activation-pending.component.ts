import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Pantalla que se muestra cuando el sistema no está activado (licencia pendiente).
 * Se ve intencional y profesional: no parece un error ni una app rota.
 */
@Component({
  selector: 'app-activation-pending',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="activation-pending">
      <div class="activation-pending__card">
        <div class="activation-pending__icon" aria-hidden="true">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <h1 class="activation-pending__title">Sistema pendiente de activación</h1>
        <p class="activation-pending__text">
          Este sistema aún no ha sido activado. Por favor, comunícate con el proveedor del software
          para completar la activación y empezar a usarlo.
        </p>
        <p class="activation-pending__note">
          Si crees que esto es un error, vuelve a intentarlo en unos minutos.
        </p>
      </div>
    </main>
  `,
  styles: [
    `
      .activation-pending {
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: 1.5rem;
        background: linear-gradient(160deg, #0f172a 0%, #134e4a 100%);
      }
      .activation-pending__card {
        max-width: 30rem;
        width: 100%;
        text-align: center;
        background: #ffffff;
        border-radius: 1rem;
        padding: 2.5rem 2rem;
        box-shadow: 0 1.5rem 3rem rgba(0, 0, 0, 0.25);
      }
      .activation-pending__icon {
        font-size: 2.75rem;
        color: #0d9488;
        margin-bottom: 1rem;
      }
      .activation-pending__title {
        font-size: 1.4rem;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 0.75rem;
      }
      .activation-pending__text {
        color: #475569;
        line-height: 1.55;
        margin: 0 0 0.75rem;
      }
      .activation-pending__note {
        color: #94a3b8;
        font-size: 0.85rem;
        margin: 0;
      }
    `,
  ],
})
export class ActivationPendingComponent {}
