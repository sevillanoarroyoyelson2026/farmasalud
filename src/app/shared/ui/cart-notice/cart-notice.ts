import { Component, inject, Injectable, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService } from '../../data-access/cart.service';

const NOTICE_VISIBLE_MILLISECONDS = 3600;

interface CartNotice {
  /** Cambia en cada aviso para reiniciar la animación aunque se repita el producto. */
  noticeId: number;
  productName: string;
}

/** Confirmación visible de "agregado al carrito" para cualquier pantalla de la tienda. */
@Injectable({ providedIn: 'root' })
export class CartNoticeService {
  private readonly currentNoticeSignal = signal<CartNotice | null>(null);
  private hideTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private nextNoticeId = 1;

  readonly currentNotice = this.currentNoticeSignal.asReadonly();

  announceAddedProduct(productName: string): void {
    clearTimeout(this.hideTimeoutId);
    this.currentNoticeSignal.set({ noticeId: this.nextNoticeId++, productName });
    this.hideTimeoutId = setTimeout(() => this.dismiss(), NOTICE_VISIBLE_MILLISECONDS);
  }

  dismiss(): void {
    clearTimeout(this.hideTimeoutId);
    this.currentNoticeSignal.set(null);
  }
}

@Component({
  selector: 'app-cart-notice',
  imports: [RouterLink],
  template: `
    <div class="cart-notice-region" role="status" aria-live="polite">
      @if (cartNotice.currentNotice(); as notice) {
        @for (visibleNotice of [notice]; track visibleNotice.noticeId) {
          <div class="cart-notice">
            <span class="cart-notice-check" aria-hidden="true"><i class="fas fa-check"></i></span>
            <span class="cart-notice-text">
              <strong>{{ visibleNotice.productName }}</strong>
              <span
                >agregado · {{ cartUnits() }} {{ cartUnits() === 1 ? 'unidad' : 'unidades' }} en tu
                carrito</span
              >
            </span>
            <a class="cart-notice-link" routerLink="/carrito" (click)="cartNotice.dismiss()"
              >Ver carrito</a
            >
            <button
              type="button"
              class="cart-notice-close"
              aria-label="Cerrar aviso"
              (click)="cartNotice.dismiss()"
            >
              <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .cart-notice-region {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      left: 1rem;
      z-index: 60;
      display: flex;
      justify-content: flex-end;
      pointer-events: none;
    }
    .cart-notice {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      width: min(100%, 27rem);
      padding: 0.75rem 0.75rem 0.75rem 0.85rem;
      border-radius: var(--radius-sm);
      background: var(--route-ink);
      box-shadow:
        inset 0 -4px 0 var(--route-marigold),
        var(--shadow-raised);
      color: #fff;
      pointer-events: auto;
    }
    @media (prefers-reduced-motion: no-preference) {
      .cart-notice {
        animation: cart-notice-arrive 0.5s var(--ease-out-expo);
      }
    }
    @keyframes cart-notice-arrive {
      from {
        transform: translateX(2rem);
        opacity: 0;
      }
    }
    .cart-notice-check {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      background: var(--route-live);
    }
    .cart-notice-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      font-size: 0.9rem;
      line-height: 1.3;
    }
    .cart-notice-text strong {
      overflow: hidden;
      font-family: var(--font-heading);
      font-stretch: var(--font-stretch-label);
      font-size: 1rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cart-notice-text span {
      color: var(--color-sidebar-text);
      font-variant-numeric: tabular-nums;
    }
    .cart-notice-link {
      flex-shrink: 0;
      padding: 0.55rem 0.8rem;
      border-radius: var(--radius-sm);
      background: var(--route-marigold);
      color: var(--route-ink);
      font-family: var(--font-heading);
      font-stretch: var(--font-stretch-label);
      font-weight: 800;
      text-decoration: none;
    }
    .cart-notice-link:hover {
      background: #ffcd4d;
    }
    .cart-notice-close {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-sidebar-text);
    }
    .cart-notice-close:hover {
      color: #fff;
    }
  `,
})
export class CartNoticeComponent {
  readonly cartNotice = inject(CartNoticeService);
  readonly cartUnits = inject(CartService).totalUnits;
}
