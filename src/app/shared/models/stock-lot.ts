/** Lote de un producto en una sucursal (subcolección `products/{id}/lots`). */
export interface StockLot {
  id: string;
  branchId: string;
  lotNumber: string;
  expirationDate: Date | null;
  quantityAvailable: number;
  quantityReceived: number;
}

export type StockEntryReason = 'initial_stock' | 'manual_entry';

export interface RegisterStockLotRequest {
  productId: string;
  branchId: string;
  lotNumber: string;
  /** Formato AAAA-MM-DD. */
  expirationDate: string;
  quantity: number;
  entryReason: StockEntryReason;
}

const DAYS_TO_FLAG_NEAR_EXPIRATION = 90;
const MILLISECONDS_PER_DAY = 86_400_000;

export function isLotNearExpiration(stockLot: StockLot, referenceDate = new Date()): boolean {
  if (!stockLot.expirationDate) {
    return false;
  }
  const daysUntilExpiration =
    (stockLot.expirationDate.getTime() - referenceDate.getTime()) / MILLISECONDS_PER_DAY;
  return daysUntilExpiration <= DAYS_TO_FLAG_NEAR_EXPIRATION;
}
