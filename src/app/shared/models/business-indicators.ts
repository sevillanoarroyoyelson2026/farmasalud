import { Order } from './order';

/**
 * Indicadores de las fichas del informe T2, calculados a partir de los pedidos.
 * Funciones puras: fáciles de probar y de reutilizar en dashboard y reportes.
 */

const MILLISECONDS_PER_MINUTE = 60_000;

export function isSameCalendarDay(firstDate: Date, secondDate: Date): boolean {
  return firstDate.toDateString() === secondDate.toDateString();
}

/** Ventas = pedidos no cancelados (el dinero de los cancelados se devuelve). */
export function calculateSalesTotal(orders: Order[]): number {
  return Math.round(
    orders.filter((order) => order.status !== 'cancelled').reduce((total, order) => total + order.orderTotal, 0) * 100,
  ) / 100;
}

/**
 * Tasa de pedidos digitales atendidos correctamente: entregados / pedidos cerrados
 * (entregados + cancelados por la botica). Las cancelaciones del propio cliente no cuentan
 * como falla de atención. Devuelve null si aún no hay pedidos cerrados.
 */
export function calculateCorrectFulfillmentRate(orders: Order[]): number | null {
  const deliveredCount = orders.filter((order) => order.status === 'delivered').length;
  const failedByPharmacyCount = orders.filter(
    (order) =>
      order.status === 'cancelled' &&
      order.statusHistory[order.statusHistory.length - 1]?.note !== 'Cancelado por el cliente',
  ).length;
  const closedCount = deliveredCount + failedByPharmacyCount;
  return closedCount === 0 ? null : Math.round((deliveredCount / closedCount) * 1000) / 10;
}

/** Tiempo promedio (minutos) desde que se registra el pedido hasta que se entrega. */
export function calculateAverageFulfillmentMinutes(orders: Order[]): number | null {
  const fulfillmentDurations = orders
    .filter((order) => order.status === 'delivered' && order.createdAt)
    .map((order) => {
      const deliveryChange = [...order.statusHistory].reverse().find((statusChange) => statusChange.status === 'delivered');
      return deliveryChange?.changedAt && order.createdAt
        ? (deliveryChange.changedAt.getTime() - order.createdAt.getTime()) / MILLISECONDS_PER_MINUTE
        : null;
    })
    .filter((durationMinutes): durationMinutes is number => durationMinutes !== null && durationMinutes >= 0);
  if (fulfillmentDurations.length === 0) {
    return null;
  }
  return Math.round(fulfillmentDurations.reduce((total, duration) => total + duration, 0) / fulfillmentDurations.length);
}

export function formatDurationInMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export interface DailySales {
  date: Date;
  salesTotal: number;
  orderCount: number;
}

/** Ventas por día del período (incluye los días sin ventas, para no ocultar huecos). */
export function groupSalesByDay(orders: Order[], numberOfDays: number, referenceDate = new Date()): DailySales[] {
  const dailySales: DailySales[] = [];
  for (let daysAgo = numberOfDays - 1; daysAgo >= 0; daysAgo--) {
    const day = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - daysAgo);
    const ordersOfDay = orders.filter(
      (order) => order.status !== 'cancelled' && order.createdAt && isSameCalendarDay(order.createdAt, day),
    );
    dailySales.push({ date: day, salesTotal: calculateSalesTotal(ordersOfDay), orderCount: ordersOfDay.length });
  }
  return dailySales;
}

export interface ProductSales {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number;
}

/** Productos más vendidos por unidades (rotación). */
export function rankBestSellingProducts(orders: Order[], maximumProducts = 10): ProductSales[] {
  const salesByProduct = new Map<string, ProductSales>();
  for (const order of orders.filter((candidate) => candidate.status !== 'cancelled')) {
    for (const orderItem of order.items) {
      const productSales = salesByProduct.get(orderItem.productId) ?? {
        productId: orderItem.productId,
        productName: orderItem.productName,
        unitsSold: 0,
        revenue: 0,
      };
      productSales.unitsSold += orderItem.quantity;
      productSales.revenue = Math.round((productSales.revenue + orderItem.subtotal) * 100) / 100;
      salesByProduct.set(orderItem.productId, productSales);
    }
  }
  return [...salesByProduct.values()]
    .sort((firstProduct, secondProduct) => secondProduct.unitsSold - firstProduct.unitsSold)
    .slice(0, maximumProducts);
}

export function calculateAverageRating(ratings: number[]): number | null {
  if (ratings.length === 0) {
    return null;
  }
  return Math.round((ratings.reduce((total, rating) => total + rating, 0) / ratings.length) * 10) / 10;
}
