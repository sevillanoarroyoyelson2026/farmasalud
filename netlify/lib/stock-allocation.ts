export interface AvailableLot {
  lotId: string;
  lotNumber: string;
  expirationDate: Date;
  quantityAvailable: number;
}

export interface LotAllocation {
  lotId: string;
  lotNumber: string;
  quantity: number;
}

/** Días mínimos de vida útil para vender un lote (no se despacha algo que vence mañana). */
const MINIMUM_SHELF_LIFE_DAYS = 7;
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * FEFO (First Expired, First Out): toma primero de los lotes que vencen antes.
 * Devuelve null si no alcanza el stock vendible.
 */
export function reserveStockFromEarliestExpiringLots(
  availableLots: AvailableLot[],
  requestedQuantity: number,
  referenceDate = new Date(),
): LotAllocation[] | null {
  const earliestSellableExpiration = referenceDate.getTime() + MINIMUM_SHELF_LIFE_DAYS * MILLISECONDS_PER_DAY;
  const sellableLots = availableLots
    .filter((lot) => lot.quantityAvailable > 0 && lot.expirationDate.getTime() > earliestSellableExpiration)
    .sort((firstLot, secondLot) => firstLot.expirationDate.getTime() - secondLot.expirationDate.getTime());

  const lotAllocations: LotAllocation[] = [];
  let pendingQuantity = requestedQuantity;
  for (const sellableLot of sellableLots) {
    if (pendingQuantity === 0) {
      break;
    }
    const allocatedQuantity = Math.min(sellableLot.quantityAvailable, pendingQuantity);
    lotAllocations.push({ lotId: sellableLot.lotId, lotNumber: sellableLot.lotNumber, quantity: allocatedQuantity });
    pendingQuantity -= allocatedQuantity;
  }
  return pendingQuantity === 0 ? lotAllocations : null;
}
