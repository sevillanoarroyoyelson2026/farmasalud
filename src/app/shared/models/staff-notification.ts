/** Alerta de stock bajo que ve el personal (la crea y la resuelve el servidor). */
export type LowStockSeverity = 'low_stock' | 'out_of_stock';

export interface StaffNotification {
  id: string;
  productId: string;
  productName: string;
  presentation: string;
  branchId: string;
  branchName: string;
  availableUnits: number;
  minimumStock: number;
  severity: LowStockSeverity;
  readByUids: string[];
  createdAt: Date | null;
}

export function isNotificationUnreadBy(notification: StaffNotification, uid: string): boolean {
  return !notification.readByUids.includes(uid);
}

/** "hace 5 min", "hace 2 h", "hace 3 días": para la lista de la campana. */
export function describeElapsedTime(date: Date | null, referenceDate = new Date()): string {
  if (!date) {
    return 'ahora';
  }
  const elapsedMinutes = Math.floor((referenceDate.getTime() - date.getTime()) / 60_000);
  if (elapsedMinutes < 1) {
    return 'ahora';
  }
  if (elapsedMinutes < 60) {
    return `hace ${elapsedMinutes} min`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `hace ${elapsedHours} h`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return elapsedDays === 1 ? 'hace 1 día' : `hace ${elapsedDays} días`;
}
