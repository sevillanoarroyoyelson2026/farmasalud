import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from './firebase-admin';

/**
 * Notificaciones de stock bajo para el personal.
 *
 * Ciclo de vida (un solo documento por producto y botica, id `low-stock__{botica}__{producto}`):
 *   1. ACTIVA: el stock quedó en el mínimo o por debajo → aparece en la campana (nadie la leyó).
 *   2. LEÍDA: cada persona que la abre se agrega a `readByUids` (deja de contar como nueva para ella).
 *   3. RESUELTA: el stock volvió a superar el mínimo (ingreso, recepción, cancelación) o el producto
 *      se desactivó → `status: 'resolved'` y desaparece del panel.
 *   4. Si el stock vuelve a bajar, el mismo documento se reactiva como nueva (lecturas en cero).
 *
 * Es "mejor esfuerzo": si falla, se registra en el log y la operación de stock NO se revierte.
 */

export type LowStockSeverity = 'low_stock' | 'out_of_stock';

export function buildLowStockNotificationId(branchId: string, productId: string): string {
  return `low-stock__${branchId}__${productId}`;
}

/** Misma regla que el panel: en el mínimo o por debajo es alerta; en cero, agotado. */
export function describeStockSeverity(availableUnits: number, minimumStock: number): LowStockSeverity | null {
  if (availableUnits <= 0) {
    return 'out_of_stock';
  }
  return availableUnits <= minimumStock ? 'low_stock' : null;
}

/**
 * Recalcula las notificaciones de los productos indicados en las boticas indicadas.
 * `branchIds = 'all'` revisa todas las boticas activas (p. ej. cuando cambia el stock mínimo).
 */
export async function refreshLowStockNotifications(productIds: string[], branchIds: string[] | 'all'): Promise<void> {
  try {
    const uniqueProductIds = [...new Set(productIds)];
    const branchesSnapshot = await adminFirestore.collection('branches').get();
    const branchNameById = new Map(branchesSnapshot.docs.map((branchDocument) => [branchDocument.id, branchDocument.get('name') as string]));
    const activeBranchIds = branchesSnapshot.docs
      .filter((branchDocument) => branchDocument.get('isActive') !== false)
      .map((branchDocument) => branchDocument.id);
    const branchIdsToCheck = branchIds === 'all' ? activeBranchIds : [...new Set(branchIds)];

    for (const productId of uniqueProductIds) {
      const productSnapshot = await adminFirestore.collection('products').doc(productId).get();
      if (!productSnapshot.exists) {
        continue;
      }
      const stockByBranch = (productSnapshot.get('stockByBranch') as Record<string, number> | undefined) ?? {};
      const minimumStock = (productSnapshot.get('minimumStock') as number) ?? 0;
      const isProductActive = productSnapshot.get('isActive') === true;

      await Promise.all(
        branchIdsToCheck.map((branchId) =>
          syncNotificationForBranch({
            productId,
            productName: productSnapshot.get('name') as string,
            presentation: (productSnapshot.get('presentation') as string) ?? '',
            branchId,
            branchName: branchNameById.get(branchId) ?? branchId,
            availableUnits: stockByBranch[branchId] ?? 0,
            minimumStock,
            // Solo alerta si la botica maneja el producto (alguna vez tuvo stock) y sigue en venta.
            severity:
              isProductActive && branchId in stockByBranch
                ? describeStockSeverity(stockByBranch[branchId], minimumStock)
                : null,
          }),
        ),
      );
    }
  } catch (error) {
    console.error(`[low-stock-notifications] ${error instanceof Error ? error.message : String(error)}`);
  }
}

interface StockSituation {
  productId: string;
  productName: string;
  presentation: string;
  branchId: string;
  branchName: string;
  availableUnits: number;
  minimumStock: number;
  /** null = stock suficiente (o producto inactivo). */
  severity: LowStockSeverity | null;
}

async function syncNotificationForBranch(stockSituation: StockSituation): Promise<void> {
  const notificationReference = adminFirestore
    .collection('notifications')
    .doc(buildLowStockNotificationId(stockSituation.branchId, stockSituation.productId));

  await adminFirestore.runTransaction(async (transaction) => {
    const notificationSnapshot = await transaction.get(notificationReference);
    const isCurrentlyActive = notificationSnapshot.exists && notificationSnapshot.get('status') === 'active';
    const notificationDetails = {
      type: 'low_stock',
      productId: stockSituation.productId,
      productName: stockSituation.productName,
      presentation: stockSituation.presentation,
      branchId: stockSituation.branchId,
      branchName: stockSituation.branchName,
      availableUnits: stockSituation.availableUnits,
      minimumStock: stockSituation.minimumStock,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (stockSituation.severity === null) {
      // 3. Resuelta: el stock ya está bien. Si no había alerta activa, no hay nada que hacer.
      if (isCurrentlyActive) {
        transaction.update(notificationReference, {
          ...notificationDetails,
          status: 'resolved',
          resolvedAt: FieldValue.serverTimestamp(),
        });
      }
      return;
    }

    if (!isCurrentlyActive) {
      // 1. Nueva (o reactivada): nadie la ha leído todavía.
      transaction.set(notificationReference, {
        ...notificationDetails,
        severity: stockSituation.severity,
        status: 'active',
        readByUids: [],
        createdAt: FieldValue.serverTimestamp(),
        resolvedAt: null,
      });
      return;
    }

    // Sigue activa: se actualizan las cifras. Si empeoró a "agotado", vuelve a ser nueva para todos.
    const hasWorsened = stockSituation.severity === 'out_of_stock' && notificationSnapshot.get('severity') !== 'out_of_stock';
    transaction.update(notificationReference, {
      ...notificationDetails,
      severity: stockSituation.severity,
      ...(hasWorsened ? { readByUids: [], createdAt: FieldValue.serverTimestamp() } : {}),
    });
  });
}
