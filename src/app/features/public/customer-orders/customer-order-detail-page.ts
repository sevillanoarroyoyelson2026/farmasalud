import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { OrderRepository } from '../../../shared/data-access/order.repository';
import {
  buildTrackingSteps,
  CUSTOMER_CANCELLABLE_STATUSES,
  Order,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  OrderStatus,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from '../../../shared/models/order';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

interface TrackingStepView {
  status: OrderStatus;
  label: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

/** Seguimiento en tiempo real de un pedido del cliente. */
@Component({
  selector: 'app-customer-order-detail-page',
  imports: [RouterLink, CurrencyPipe, DatePipe],
  templateUrl: './customer-order-detail-page.html',
  styleUrl: './customer-order-detail-page.css',
})
export class CustomerOrderDetailPage implements OnInit {
  private readonly orderRepository = inject(OrderRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly destroyReference = inject(DestroyRef);

  /** Parámetro de ruta `/mis-pedidos/:orderId`. */
  readonly orderId = input.required<string>();

  readonly statusLabel = ORDER_STATUS_LABEL;
  readonly statusTone = ORDER_STATUS_TONE;
  readonly paymentMethodLabel = PAYMENT_METHOD_LABEL;
  readonly paymentStatusLabel = PAYMENT_STATUS_LABEL;
  readonly order = signal<Order | null>(null);
  readonly isLoading = signal(true);
  readonly isCancelling = signal(false);
  readonly isConfirmingCancellation = signal(false);
  readonly actionErrorMessage = signal('');
  readonly prescriptionUrl = signal('');

  readonly trackingSteps = computed<TrackingStepView[]>(() => {
    const currentOrder = this.order();
    if (!currentOrder || currentOrder.status === 'cancelled') {
      return [];
    }
    const trackingSteps = buildTrackingSteps(currentOrder);
    const currentStepIndex = trackingSteps.indexOf(currentOrder.status);
    return trackingSteps.map((stepStatus, stepIndex) => ({
      status: stepStatus,
      label: ORDER_STATUS_LABEL[stepStatus],
      isCompleted: stepIndex < currentStepIndex || currentOrder.status === 'delivered',
      isCurrent: stepIndex === currentStepIndex && currentOrder.status !== 'delivered',
    }));
  });

  readonly canCancelOrder = computed(() => {
    const currentOrder = this.order();
    return currentOrder !== null && CUSTOMER_CANCELLABLE_STATUSES.includes(currentOrder.status);
  });

  ngOnInit(): void {
    const stopWatchingOrder = this.orderRepository.watchOrder(
      this.orderId(),
      (watchedOrder) => {
        this.order.set(watchedOrder);
        this.isLoading.set(false);
      },
      (error) => {
        this.logger.logError('CustomerOrderDetailPage.watchOrder', error);
        this.isLoading.set(false);
      },
    );
    this.destroyReference.onDestroy(stopWatchingOrder);
  }

  async showPrescription(): Promise<void> {
    try {
      this.prescriptionUrl.set(await this.orderRepository.getPrescriptionUrl(this.orderId()));
    } catch (error) {
      this.actionErrorMessage.set(describeErrorForUser(error, 'No se pudo abrir la receta.'));
    }
  }

  async cancelOrder(): Promise<void> {
    this.isCancelling.set(true);
    this.actionErrorMessage.set('');
    try {
      await this.orderRepository.applyOrderAction(this.orderId(), 'cancel_by_customer', 'Cancelado por el cliente');
      this.isConfirmingCancellation.set(false);
    } catch (error) {
      this.logger.logError('CustomerOrderDetailPage.cancelOrder', error);
      this.actionErrorMessage.set(describeErrorForUser(error, 'No se pudo cancelar el pedido.'));
    } finally {
      this.isCancelling.set(false);
    }
  }
}
