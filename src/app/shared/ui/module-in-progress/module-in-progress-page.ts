import { Component, input } from '@angular/core';

/**
 * Pantalla temporal para los módulos de los siguientes sprints.
 * Recibe los datos desde `data` de la ruta (gracias a withComponentInputBinding).
 */
@Component({
  selector: 'app-module-in-progress-page',
  template: `
    <section class="module-in-progress surface-card">
      <span class="module-in-progress-icon" aria-hidden="true"><i class="fas fa-screwdriver-wrench"></i></span>
      <h2 class="module-in-progress-title">{{ moduleName() }}</h2>
      <p class="module-in-progress-text">{{ moduleDescription() }}</p>
      <span class="module-in-progress-badge">Se construye en el sprint {{ plannedSprint() }}</span>
    </section>
  `,
  styles: `
    .module-in-progress {
      max-width: 560px;
      margin: 2rem auto;
      padding: 2.5rem 2rem;
      text-align: center;
    }
    .module-in-progress-icon {
      display: inline-grid;
      place-items: center;
      width: 56px;
      height: 56px;
      margin-bottom: 1rem;
      border-radius: 16px;
      background: var(--color-primary-soft);
      color: var(--color-primary);
      font-size: 1.4rem;
    }
    .module-in-progress-title {
      font-size: 1.35rem;
    }
    .module-in-progress-text {
      color: var(--color-text-secondary);
    }
    .module-in-progress-badge {
      display: inline-block;
      padding: 0.35rem 0.8rem;
      border-radius: 999px;
      background: var(--color-warning-soft);
      color: var(--color-warning);
      font-size: 0.8rem;
      font-weight: 700;
    }
  `,
})
export class ModuleInProgressPage {
  readonly moduleName = input('Módulo en construcción');
  readonly moduleDescription = input('');
  readonly plannedSprint = input<number>(1);
}
