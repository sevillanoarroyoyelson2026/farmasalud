import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ActivationPendingComponent } from './core/system/activation-pending.component';
import { SystemActivationService } from './core/system/system-activation.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ActivationPendingComponent],
  template: `
    @if (isActivated()) {
      <router-outlet />
    } @else {
      <app-activation-pending />
    }
  `,
})
export class App {
  protected readonly isActivated = inject(SystemActivationService).isActivated;
}
