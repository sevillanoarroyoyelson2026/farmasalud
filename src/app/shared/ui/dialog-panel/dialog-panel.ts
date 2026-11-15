import { Component, HostListener, input, output } from '@angular/core';

let nextDialogNumber = 0;

/**
 * Ventana modal ligera (sin el JavaScript de Bootstrap): fondo oscuro, título,
 * botón cerrar y tecla Escape. En móvil ocupa todo el ancho desde abajo.
 */
@Component({
  selector: 'app-dialog-panel',
  template: `
    @if (isOpen()) {
      <div class="dialog-backdrop" (click)="closeRequested.emit()"></div>
      <section class="dialog-panel" role="dialog" aria-modal="true" [attr.aria-labelledby]="dialogTitleId">
        <header class="dialog-header">
          <h2 class="dialog-title" [id]="dialogTitleId">{{ dialogTitle() }}</h2>
          <button type="button" class="btn-close" aria-label="Cerrar" (click)="closeRequested.emit()"></button>
        </header>
        <div class="dialog-body">
          <ng-content />
        </div>
      </section>
    }
  `,
  styles: `
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1050;
      background: rgba(15, 23, 42, 0.5);
    }
    .dialog-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      z-index: 1055;
      display: flex;
      flex-direction: column;
      width: min(640px, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      transform: translate(-50%, -50%);
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-raised);
    }
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--color-border);
    }
    .dialog-title {
      margin: 0;
      font-size: 1.1rem;
    }
    .dialog-body {
      padding: 1.25rem;
      overflow-y: auto;
    }
    @media (max-width: 576px) {
      .dialog-panel {
        top: auto;
        bottom: 0;
        left: 0;
        width: 100%;
        max-height: 92vh;
        transform: none;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      }
    }
  `,
})
export class DialogPanel {
  readonly dialogTitle = input.required<string>();
  readonly isOpen = input.required<boolean>();
  readonly closeRequested = output<void>();

  readonly dialogTitleId = `dialog-title-${++nextDialogNumber}`;

  @HostListener('document:keydown.escape')
  closeWithEscapeKey(): void {
    if (this.isOpen()) {
      this.closeRequested.emit();
    }
  }
}
