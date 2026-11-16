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

/** Pedidos creados dentro de [desde, hasta). */
export function filterOrdersCreatedBetween(orders: Order[], fromDate: Date, untilDate: Date): Order[] {
  return orders.filter(
    (order) =>
      order.createdAt !== null &&
      order.createdAt.getTime() >= fromDate.getTime() &&
      order.createdAt.getTime() < untilDate.getTime(),
  );
}

/**
 * Variación porcentual frente al período anterior (redondeada a 1 decimal).
 * null cuando no hay base de comparación (período anterior en cero).
 */
export function calculatePercentageChange(currentValue: number, previousValue: number): number | null {
  if (previousValue === 0) {
    return null;
  }
  return Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
}

export interface LabeledAmount {
  label: string;
  amount: number;
}

/** Ventas por botica (sin cancelados), de mayor a menor. */
export function groupSalesByBranch(orders: Order[]): LabeledAmount[] {
  const salesByBranch = new Map<string, number>();
  for (const order of orders.filter((candidate) => candidate.status !== 'cancelled')) {
    salesByBranch.set(order.branchName, (salesByBranch.get(order.branchName) ?? 0) + order.orderTotal);
  }
  return [...salesByBranch.entries()]
    .map(([label, amount]) => ({ label, amount: Math.round(amount * 100) / 100 }))
    .sort((firstBranch, secondBranch) => secondBranch.amount - firstBranch.amount);
}

/** Cantidad de pedidos según la hora del día en que se hicieron (0 a 23). */
export function countOrdersByHourOfDay(orders: Order[]): number[] {
  const ordersByHour = Array.from({ length: 24 }, () => 0);
  for (const order of orders) {
    if (order.createdAt) {
      ordersByHour[order.createdAt.getHours()]++;
    }
  }
  return ordersByHour;
}

/** Cuántos pedidos hay en cada valor de una característica (estado, entrega, pago…). */
export function countOrdersBy<GroupKey extends string>(orders: Order[], readGroupKey: (order: Order) => GroupKey): Map<GroupKey, number> {
  const ordersByGroup = new Map<GroupKey, number>();
  for (const order of orders) {
    const groupKey = readGroupKey(order);
    ordersByGroup.set(groupKey, (ordersByGroup.get(groupKey) ?? 0) + 1);
  }
  return ordersByGroup;
}
