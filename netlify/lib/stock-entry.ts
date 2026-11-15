import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { adminFirestore } from './firebase-admin';
import { HttpError } from './http-response';

export type StockEntryReason = 'initial_stock' | 'manual_entry' | 'purchase_reception';

export interface StockEntry {
  productReference: DocumentReference;
  branchId: string;
  lotNumber: string;
  expirationDate: Date;
  quantity: number;
  reason: StockEntryReason;
  performedByUid: string;
  /** Documento que originó el ingreso (p. ej. la orden de compra). */
  sourceDocumentId: string | null;
  /** Lote ya existente con el mismo número en esa sucursal (leído antes de escribir). */
  existingLot: QueryDocumentSnapshot | null;
}

/** Vencimiento al final del día en hora de Lima, a partir de "AAAA-MM-DD". */
export function parseExpirationDate(isoDate: string): Date {
  const expirationDate = new Date(`${isoDate}T23:59:59-05:00`);
  if (Number.isNaN(expirationDate.getTime()) || expirationDate.getTime() <= Date.now()) {
    throw new HttpError(400, 'No se puede ingresar un lote vencido o con fecha no válida.');
  }
  return expirationDate;
}

/** Lectura (debe ir ANTES de cualquier escritura de la transacción). */
export async function findExistingLot(
  transaction: Transaction,
  productReference: DocumentReference,
  branchId: string,
  lotNumber: string,
): Promise<QueryDocumentSnapshot | null> {
  const sameLotSnapshot = await transaction.get(
    productReference.collection('lots').where('branchId', '==', branchId).where('lotNumber', '==', lotNumber).limit(1),
  );
  return sameLotSnapshot.docs[0] ?? null;
}

/**
 * Escribe un ingreso de stock: crea o suma el lote, actualiza el stock del producto
 * en la sucursal y registra el movimiento. Devuelve el id del lote.
 */
export function writeStockEntry(transaction: Transaction, stockEntry: StockEntry): string {
  const lotsCollection = stockEntry.productReference.collection('lots');
  let lotReference = lotsCollection.doc();

  if (stockEntry.existingLot) {
    const existingExpiration = (stockEntry.existingLot.get('expirationDate') as Timestamp).toDate();
    if (existingExpiration.toISOString().slice(0, 10) !== stockEntry.expirationDate.toISOString().slice(0, 10)) {
      throw new HttpError(409, `El lote ${stockEntry.lotNumber} ya existe con otra fecha de vencimiento.`);
    }
    lotReference = stockEntry.existingLot.ref;
    transaction.update(lotReference, {
      quantityAvailable: FieldValue.increment(stockEntry.quantity),
      quantityReceived: FieldValue.increment(stockEntry.quantity),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    transaction.set(lotReference, {
      branchId: stockEntry.branchId,
      lotNumber: stockEntry.lotNumber,
      expirationDate: Timestamp.fromDate(stockEntry.expirationDate),
      quantityAvailable: stockEntry.quantity,
      quantityReceived: stockEntry.quantity,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  transaction.update(
    stockEntry.productReference,
    new FieldPath('stockByBranch', stockEntry.branchId),
    FieldValue.increment(stockEntry.quantity),
    'updatedAt',
    FieldValue.serverTimestamp(),
  );

  transaction.set(adminFirestore.collection('stock_movements').doc(), {
    productId: stockEntry.productReference.id,
    branchId: stockEntry.branchId,
    lotId: lotReference.id,
    lotNumber: stockEntry.lotNumber,
    movementType: 'entry',
    reason: stockEntry.reason,
    quantity: stockEntry.quantity,
    sourceDocumentId: stockEntry.sourceDocumentId,
    performedByUid: stockEntry.performedByUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  return lotReference.id;
}

/** Número de lote normalizado (mayúsculas, solo caracteres seguros). */
export const LOT_NUMBER_PATTERN = /^[A-Z0-9./-]+$/;

/** Correlativo legible: OC-000001, RC-000001… (leer el contador ANTES de escribir). */
export function formatSequentialNumber(prefix: string, sequentialNumber: number): string {
  return `${prefix}-${String(sequentialNumber).padStart(6, '0')}`;
}
