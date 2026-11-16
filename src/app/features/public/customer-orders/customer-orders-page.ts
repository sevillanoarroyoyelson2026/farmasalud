import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { OrderRepository } from '../../../shared/data-access/order.repository';
import { Order, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '../../../shared/models/order';

/** Historial de pedidos del cliente, actualizado en tiempo real. */
@Component({
  selector: 'app-customer-orders-page',
  imports: [RouterLink, CurrencyPipe, DatePipe],
  template: `
    <section class="container-xl customer-orders-page">
      <h1 class="customer-orders-title">Mis pedidos</h1>
      @if (isLoading()) {
        <div class="panel-empty-state">
          <span class="spinner-border text-primary" role="status"></span>Cargando…
        </div>
      } @else if (loadErrorMessage()) {
        <div class="panel-empty-state surface-card">
          <i class="fas fa-circle-exclamation" aria-hidden="true"></i>{{ loadErrorMessage() }}
        </div>
      } @else if (orders().length === 0) {
        <div class="panel-empty-state surface-card">
          <i class="fas fa-receipt" aria-hidden="true"></i>
          <p class="mb-0">Aún no tienes pedidos.</p>
          <a class="btn btn-primary btn-sm mt-2" routerLink="/catalogo">Ver catálogo</a>
        </div>
      } @else {
        <ul class="customer-order-list">
          @for (order of orders(); track order.id) {
            <li>
              <a class="customer-order-card surface-card" [routerLink]="['/mis-pedidos', order.id]">
                <span>
                  <strong>{{ order.orderNumber }}</strong>
                  <span class="panel-table-secondary">
                    {{ order.createdAt ? (order.createdAt | date: 'dd/MM/yyyy HH:mm') : '' }} ·
                    {{ order.branchName }}
                  </span>
                </span>
                <span class="customer-order-card-side">
                  <span class="status-badge" [class]="'status-badge ' + statusTone[order.status]">{{
                    statusLabel[order.status]
                  }}</span>
                  <strong>{{ order.orderTotal | currency: 'PEN' : 'S/ ' }}</strong>
                </span>
              </a>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .customer-orders-page {
      padding-top: 2rem;
      padding-bottom: 3rem;
      max-width: 860px;
    }
    .customer-orders-title {
      margin-bottom: 1.25rem;
      font-size: clamp(1.5rem, 3vw, 2rem);
    }
    .customer-order-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0;
      list-style: none;
    }
    .customer-order-card {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      color: inherit;
      text-decoration: none;
      transition: box-shadow var(--transition-base);
    }
    .customer-order-card:hover {
      box-shadow: var(--shadow-raised);
    }
    .customer-order-card-side {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
  `,
})
export class CustomerOrdersPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly orderRepository = inject(OrderRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly destroyReference = inject(DestroyRef);

  readonly statusLabel = ORDER_STATUS_LABEL;
  readonly statusTone = ORDER_STATUS_TONE;
  readonly orders = signal<Order[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');

  ngOnInit(): void {
    const customerUid = this.authService.currentSession()?.uid;
    if (!customerUid) {
      return;
    }
    const stopWatchingOrders = this.orderRepository.watchCustomerOrders(
      customerUid,
      (customerOrders) => {
        this.orders.set(customerOrders);
        this.isLoading.set(false);
      },
      (error) => {
        this.logger.logError('CustomerOrdersPage.watchCustomerOrders', error);
        this.loadErrorMessage.set('No pudimos cargar tus pedidos.');
        this.isLoading.set(false);
      },
    );
    this.destroyReference.onDestroy(stopWatchingOrders);
  }
}
