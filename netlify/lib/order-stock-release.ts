import { FieldPath, FieldValue, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from './firebase-admin';
import type { LotAllocation } from './stock-allocation';

interface StoredOrderItem {
  productId: string;
  quantity: number;
  allocatedLots: LotAllocation[];
}

/**
 * Devuelve el stock de un pedido a los MISMOS lotes de donde salió y registra los movimientos.
 * Se usa al cancelar un pedido y cuando un pago con tarjeta es rechazado.
 * Solo escribe: el pedido debe haberse leído antes en la misma transacción.
 */
export function writeStockReleaseForOrder(
  transaction: Transaction,
  orderSnapshot: DocumentSnapshot,
  performedByUid: string,
  releaseReason: 'order_cancelled' | 'payment_rejected',
): void {
  const orderBranchId = orderSnapshot.get('branchId') as string;
  for (const orderItem of orderSnapshot.get('items') as StoredOrderItem[]) {
    const productReference = adminFirestore.collection('products').doc(orderItem.productId);
    for (const lotAllocation of orderItem.allocatedLots) {
      transaction.update(productReference.collection('lots').doc(lotAllocation.lotId), {
        quantityAvailable: FieldValue.increment(lotAllocation.quantity),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(adminFirestore.collection('stock_movements').doc(), {
        productId: orderItem.productId,
        branchId: orderBranchId,
        lotId: lotAllocation.lotId,
        lotNumber: lotAllocation.lotNumber,
        movementType: 'entry',
        reason: releaseReason,
        quantity: lotAllocation.quantity,
        orderId: orderSnapshot.id,
        performedByUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.update(
      productReference,
      new FieldPath('stockByBranch', orderBranchId),
      FieldValue.increment(orderItem.quantity),
    );
  }
}
