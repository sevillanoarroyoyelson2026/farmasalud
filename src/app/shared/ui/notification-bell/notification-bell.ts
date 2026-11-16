import { Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { AuthService } from '../../../core/auth/auth.service';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { StaffNotificationRepository } from '../../data-access/staff-notification.repository';
import { describeElapsedTime, isNotificationUnreadBy, StaffNotification } from '../../models/staff-notification';

const TOAST_DURATION_MS = 7000;
/** Pantalla de stock según el rol: el admin la tiene en su panel; el trabajador en "Alertas". */
const STOCK_ROUTE_BY_ROLE: Record<string, string> = { admin: '/admin/stock', worker: '/trabajador/alertas' };

/**
 * Campana de notificaciones del personal (alertas de stock bajo, en tiempo real).
 * - Contador de NO leídas (cada persona tiene su propio estado de lectura).
 * - Aviso emergente cuando llega una alerta nueva mientras se trabaja.
 * - Al hacer clic: se marca como leída y lleva a "Lotes y stock" con la botica
 *   elegida y el producto resaltado.
 * - Cuando el stock se repone, el servidor la resuelve y desaparece sola.
 */
@Component({
  selector: 'app-notification-bell',
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.css',
})
export class NotificationBell {
  private readonly authService = inject(AuthService);
  private readonly notificationRepository = inject(StaffNotificationRepository);
  private readonly router = inject(Router);
  private readonly logger = inject(AppLoggerService);
  private readonly hostElement = inject(ElementRef<HTMLElement>);

  readonly notifications = signal<StaffNotification[]>([]);
  readonly isPanelOpen = signal(false);
  readonly toastNotification = signal<StaffNotification | null>(null);
  readonly describeElapsedTime = describeElapsedTime;

  private readonly currentUid = computed(() => this.authService.currentSession()?.uid ?? '');
  readonly unreadNotifications = computed(() =>
    this.notifications().filter((notification) => isNotificationUnreadBy(notification, this.currentUid())),
  );
  readonly unreadCountLabel = computed(() => {
    const unreadCount = this.unreadNotifications().length;
    return unreadCount > 9 ? '9+' : String(unreadCount);
  });

  private stopWatching: Unsubscribe | null = null;
  private knownNotificationIds: Set<string> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const session = this.authService.currentSession();
      this.stopWatching?.();
      this.knownNotificationIds = null;
      if (!session || (session.role !== 'admin' && session.role !== 'worker')) {
        this.notifications.set([]);
        return;
      }
      // El trabajador solo escucha su botica (es lo que permiten las reglas).
      const branchIdFilter = session.role === 'worker' ? session.branchId : null;
      if (session.role === 'worker' && !branchIdFilter) {
        return;
      }
      this.stopWatching = this.notificationRepository.watchActiveNotifications(
        branchIdFilter,
        (activeNotifications) => this.receiveNotifications(activeNotifications),
        (error) => this.logger.logError('NotificationBell.watchActiveNotifications', error),
      );
    });
    inject(DestroyRef).onDestroy(() => {
      this.stopWatching?.();
      clearTimeout(this.toastTimer);
    });
  }

  isUnread(notification: StaffNotification): boolean {
    return isNotificationUnreadBy(notification, this.currentUid());
  }

  togglePanel(): void {
    this.isPanelOpen.update((isOpen) => !isOpen);
  }

  /** Lleva a la pantalla de stock con la botica y el producto de la alerta. */
  async openNotification(notification: StaffNotification): Promise<void> {
    this.isPanelOpen.set(false);
    this.dismissToast();
    if (this.isUnread(notification)) {
      this.notificationRepository.markAsRead(notification.id, this.currentUid()).catch((error: unknown) =>
        this.logger.logError('NotificationBell.markAsRead', error),
      );
    }
    const stockRoute = STOCK_ROUTE_BY_ROLE[this.authService.currentSession()?.role ?? ''] ?? '/';
    await this.router.navigate([stockRoute], {
      queryParams: { producto: notification.productId, sucursal: notification.branchId },
    });
  }

  async markAllAsRead(): Promise<void> {
    const unreadIds = this.unreadNotifications().map((notification) => notification.id);
    if (unreadIds.length === 0) {
      return;
    }
    try {
      await this.notificationRepository.markAllAsRead(unreadIds, this.currentUid());
    } catch (error) {
      this.logger.logError('NotificationBell.markAllAsRead', error);
    }
  }

  dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.toastNotification.set(null);
  }

  @HostListener('document:keydown.escape')
  closeWithEscape(): void {
    this.isPanelOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  closeWhenClickingOutside(clickEvent: MouseEvent): void {
    if (this.isPanelOpen() && !this.hostElement.nativeElement.contains(clickEvent.target as Node)) {
      this.isPanelOpen.set(false);
    }
  }

  /** La primera carga no genera avisos; después, cada alerta nueva no leída se anuncia. */
  private receiveNotifications(activeNotifications: StaffNotification[]): void {
    const previouslyKnownIds = this.knownNotificationIds;
    this.notifications.set(activeNotifications);
    this.knownNotificationIds = new Set(activeNotifications.map((notification) => notification.id));
    if (!previouslyKnownIds) {
      return;
    }
    const newestArrival = activeNotifications.find(
      (notification) => !previouslyKnownIds.has(notification.id) && this.isUnread(notification),
    );
    if (newestArrival) {
      this.toastNotification.set(newestArrival);
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.toastNotification.set(null), TOAST_DURATION_MS);
    }
  }
}
