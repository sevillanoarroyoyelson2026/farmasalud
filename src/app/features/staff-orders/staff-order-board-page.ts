import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Unsubscribe } from 'firebase/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { AppLoggerService } from '../../core/logger/app-logger.service';
import { BranchSelectionService } from '../../shared/data-access/branch-selection.service';
import { OrderRepository } from '../../shared/data-access/order.repository';
import {
  getAvailableStaffActions,
  Order,
  OrderActionDefinition,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  OrderStatus,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from '../../shared/models/order';
import { DialogPanel } from '../../shared/ui/dialog-panel/dialog-panel';
import { normalizeTextForSearch } from '../../shared/utils/text-normalization';
import { describeErrorForUser } from '../../shared/utils/user-facing-error';

/** Qué pedidos muestra cada pantalla (se configura en la ruta con `data.boardMode`). */
export type OrderBoardMode = 'active' | 'prescriptions' | 'dispatch' | 'history';

interface OrderBoardConfiguration {
  pageTitle: string;
  pageDescription: string;
  visibleStatuses: OrderStatus[] | 'all';
  emptyMessage: string;
}

const ORDER_BOARD_CONFIGURATION: Record<OrderBoardMode, OrderBoardConfiguration> = {
  active: {
    pageTitle: 'Cola de pedidos',
    pageDescription: 'Pedidos en curso de la sucursal, del más antiguo al más reciente. Se actualiza solo.',
    visibleStatuses: ['pending_prescription', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery'],
    emptyMessage: 'No hay pedidos pendientes por ahora.',
  },
  prescriptions: {
    pageTitle: 'Validar recetas',
    pageDescription: 'Revisa que la receta sea legible, vigente y corresponda a los medicamentos del pedido.',
    visibleStatuses: ['pending_prescription'],
    emptyMessage: 'No hay recetas por validar.',
  },
  dispatch: {
    pageTitle: 'Preparación y despacho',
    pageDescription: 'Arma los pedidos confirmados (despacha primero el lote indicado) y entrégalos.',
    visibleStatuses: ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery'],
    emptyMessage: 'No hay pedidos para preparar o despachar.',
  },
  history: {
    pageTitle: 'Pedidos',
    pageDescription: 'Todos los pedidos web recientes. Usa el selector de sucursal del encabezado.',
    visibleStatuses: 'all',
    emptyMessage: 'Aún no hay pedidos.',
  },
};

/**
 * Tablero de pedidos del personal (procedimiento O04.02: validación de receta,
 * preparación, despacho y entrega). Lo usan el trabajador (su sucursal) y el admin
 * (sucursal elegida en el header o todas). Escucha Firestore en tiempo real.
 */
@Component({
  selector: 'app-staff-order-board-page',
  imports: [FormsModule, CurrencyPipe, DatePipe, DialogPanel],
  templateUrl: './staff-order-board-page.html',
  styleUrl: './staff-order-board-page.css',
})
export class StaffOrderBoardPage {
  private readonly orderRepository = inject(OrderRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly authService = inject(AuthService);
  readonly branchSelection = inject(BranchSelectionService);

  /** Viene de `data.boardMode` en la ruta (withComponentInputBinding). */
  readonly boardMode = input<OrderBoardMode>('active');

  readonly statusLabel = ORDER_STATUS_LABEL;
  readonly statusTone = ORDER_STATUS_TONE;
  readonly paymentMethodLabel = PAYMENT_METHOD_LABEL;
  readonly paymentStatusLabel = PAYMENT_STATUS_LABEL;

  readonly orders = signal<Order[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly searchText = signal('');

  readonly selectedOrderId = signal<string | null>(null);
  readonly pendingAction = signal<OrderActionDefinition | null>(null);
  readonly actionNote = signal('');
  readonly courierName = signal('');
  readonly isApplyingAction = signal(false);
  readonly actionErrorMessage = signal('');
  readonly prescriptionUrl = signal('');
  readonly isLoadingPrescription = signal(false);

  readonly boardConfiguration = computed(() => ORDER_BOARD_CONFIGURATION[this.boardMode()]);

  readonly visibleOrders = computed(() => {
    const visibleStatuses = this.boardConfiguration().visibleStatuses;
    const normalizedSearch = normalizeTextForSearch(this.searchText());
    const filteredOrders = this.orders().filter(
      (order) =>
        (visibleStatuses === 'all' || visibleStatuses.includes(order.status)) &&
        normalizeTextForSearch(`${order.orderNumber} ${order.customerName}`).includes(normalizedSearch),
    );
    // En las colas se atiende primero lo más antiguo; en el historial, lo más reciente arriba.
    return this.boardMode() === 'history' ? filteredOrders : [...filteredOrders].reverse();
  });

  readonly selectedOrder = computed(
    () => this.orders().find((order) => order.id === this.selectedOrderId()) ?? null,
  );
  readonly selectedOrderActions = computed(() => {
    const order = this.selectedOrder();
    return order ? getAvailableStaffActions(order) : [];
  });

  private stopWatchingOrders: Unsubscribe | null = null;

  constructor() {
    // Se vuelve a suscribir cuando cambia la sucursal elegida (admin).
    effect(() => {
      const session = this.authService.currentSession();
      const branchId =
        session?.role === 'worker' ? (session.branchId ?? '') : this.branchSelection.selectedBranchId();
      if (session?.role === 'worker' && !branchId) {
        this.loadErrorMessage.set('Tu cuenta no tiene sucursal asignada. Pide al administrador que la asigne.');
        this.isLoading.set(false);
        return;
      }
      this.watchOrdersOfBranch(branchId);
    });
    inject(DestroyRef).onDestroy(() => this.stopWatchingOrders?.());
  }

  updateSearchText(inputEvent: Event): void {
    this.searchText.set((inputEvent.target as HTMLInputElement).value);
  }

  countUnits(order: Order): number {
    return order.items.reduce((unitCount, orderItem) => unitCount + orderItem.quantity, 0);
  }

  openOrder(order: Order): void {
    this.selectedOrderId.set(order.id);
    this.resetActionState();
  }

  closeOrder(): void {
    this.selectedOrderId.set(null);
    this.resetActionState();
  }

  async showPrescription(): Promise<void> {
    const orderId = this.selectedOrderId();
    if (!orderId) {
      return;
    }
    this.isLoadingPrescription.set(true);
    try {
      this.prescriptionUrl.set(await this.orderRepository.getPrescriptionUrl(orderId));
    } catch (error) {
      this.actionErrorMessage.set(describeErrorForUser(error, 'No se pudo abrir la receta.'));
    } finally {
      this.isLoadingPrescription.set(false);
    }
  }

  /** Las acciones que exigen motivo (rechazar, cancelar) piden confirmación con nota. */
  requestAction(actionDefinition: OrderActionDefinition): void {
    this.actionErrorMessage.set('');
    if (actionDefinition.isNoteRequired || actionDefinition.action === 'dispatch') {
      this.pendingAction.set(actionDefinition);
      return;
    }
    void this.applyAction(actionDefinition);
  }

  cancelPendingAction(): void {
    this.pendingAction.set(null);
    this.actionNote.set('');
  }

  async applyAction(actionDefinition: OrderActionDefinition): Promise<void> {
    const orderId = this.selectedOrderId();
    if (!orderId) {
      return;
    }
    if (actionDefinition.isNoteRequired && this.actionNote().trim().length < 5) {
      this.actionErrorMessage.set('Escribe el motivo (mínimo 5 caracteres).');
      return;
    }
    this.isApplyingAction.set(true);
    this.actionErrorMessage.set('');
    try {
      await this.orderRepository.applyOrderAction(
        orderId,
        actionDefinition.action,
        this.actionNote().trim(),
        actionDefinition.action === 'dispatch' ? this.courierName().trim() || null : null,
      );
      this.cancelPendingAction();
    } catch (error) {
      this.logger.logError('StaffOrderBoardPage.applyAction', error);
      this.actionErrorMessage.set(describeErrorForUser(error, 'No se pudo actualizar el pedido.'));
    } finally {
      this.isApplyingAction.set(false);
    }
  }

  private resetActionState(): void {
    this.pendingAction.set(null);
    this.actionNote.set('');
    this.courierName.set('');
    this.actionErrorMessage.set('');
    this.prescriptionUrl.set('');
  }

  private watchOrdersOfBranch(branchId: string): void {
    this.stopWatchingOrders?.();
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    this.stopWatchingOrders = this.orderRepository.watchBranchOrders(
      branchId,
      (branchOrders) => {
        this.orders.set(branchOrders);
        this.isLoading.set(false);
      },
      (error) => {
        this.logger.logError('StaffOrderBoardPage.watchBranchOrders', error);
        this.loadErrorMessage.set('No se pudieron cargar los pedidos.');
        this.isLoading.set(false);
      },
    );
  }
}
