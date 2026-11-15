import type { Timestamp } from 'firebase-admin/firestore';

export interface StoredProductPromotion {
  discountPercent: number;
  endsAt: Timestamp;
}

/**
 * Precio que realmente paga el cliente: aplica la promoción solo si sigue vigente.
 * Es la ÚNICA fuente del precio de venta (create-order la usa; el navegador solo la muestra).
 */
export function calculateEffectiveUnitPrice(
  listPrice: number,
  promotion: StoredProductPromotion | null | undefined,
  referenceDate = new Date(),
): number {
  const isPromotionActive =
    promotion !== null &&
    promotion !== undefined &&
    promotion.discountPercent > 0 &&
    promotion.endsAt.toDate().getTime() > referenceDate.getTime();
  const effectivePrice = isPromotionActive ? listPrice * (1 - promotion.discountPercent / 100) : listPrice;
  return Math.round(effectivePrice * 100) / 100;
}
