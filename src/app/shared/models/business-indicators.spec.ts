import { describe, expect, it } from 'vitest';
import {
  calculateAverageFulfillmentMinutes,
  calculateAverageRating,
  calculateCorrectFulfillmentRate,
  calculatePercentageChange,
  calculateSalesTotal,
  countOrdersBy,
  countOrdersByHourOfDay,
  filterOrdersCreatedBetween,
  groupSalesByBranch,
  formatDurationInMinutes,
  groupSalesByDay,
  rankBestSellingProducts,
} from './business-indicators';
import { Order, OrderStatus } from './order';

function createOrder(status: OrderStatus, orderTotal: number, createdAt: Date, overrides: Partial<Order> = {}): Order {
  return {
    id: `pedido-${Math.random()}`,
    orderNumber: 'FS-1',
    customerUid: 'c',
    customerName: 'Ana',
    contactPhone: '987654321',
    branchId: 'el-bosque',
    branchName: 'El Bosque',
    fulfillmentType: 'pickup',
    deliveryAddress: null,
    customerNote: '',
    items: [],
    itemsTotal: orderTotal,
    deliveryFee: 0,
    orderTotal,
    paymentMethod: 'simulated_card',
    paymentStatus: 'paid',
    paymentReference: null,
    hasPrescription: false,
    prescriptionReviewStatus: null,
    prescriptionReviewNote: '',
    status,
    statusHistory: [],
    courierName: null,
    createdAt,
    ...overrides,
  };
}

const today = new Date(2026, 10, 15, 10, 0);

describe('indicadores del T2', () => {
  it('las ventas no cuentan pedidos cancelados', () => {
    expect(calculateSalesTotal([createOrder('delivered', 20, today), createOrder('cancelled', 50, today)])).toBe(20);
  });

  it('la tasa de atención correcta ignora las cancelaciones del propio cliente', () => {
    const orders = [
      createOrder('delivered', 10, today),
      createOrder('delivered', 10, today),
      createOrder('delivered', 10, today),
      createOrder('cancelled', 10, today, { statusHistory: [{ status: 'cancelled', changedAt: today, note: 'Sin stock real' }] }),
      createOrder('cancelled', 10, today, { statusHistory: [{ status: 'cancelled', changedAt: today, note: 'Cancelado por el cliente' }] }),
    ];
    expect(calculateCorrectFulfillmentRate(orders)).toBe(75);
    expect(calculateCorrectFulfillmentRate([])).toBeNull();
  });

  it('el tiempo de atención se mide hasta la entrega', () => {
    const deliveredOrder = createOrder('delivered', 10, today, {
      statusHistory: [{ status: 'delivered', changedAt: new Date(today.getTime() + 45 * 60_000), note: '' }],
    });
    expect(calculateAverageFulfillmentMinutes([deliveredOrder])).toBe(45);
    expect(formatDurationInMinutes(135)).toBe('2 h 15 min');
  });

  it('agrupa ventas por día e incluye los días sin ventas', () => {
    const dailySales = groupSalesByDay([createOrder('confirmed', 30, today)], 3, today);
    expect(dailySales.map((daySales) => daySales.salesTotal)).toEqual([0, 0, 30]);
  });

  it('ordena los productos más vendidos por unidades', () => {
    const orderWithItems = createOrder('delivered', 0, today, {
      items: [
        { productId: 'a', productName: 'A', presentation: '', unitPrice: 1, quantity: 2, subtotal: 2, requiresPrescription: false, allocatedLots: [] },
        { productId: 'b', productName: 'B', presentation: '', unitPrice: 1, quantity: 5, subtotal: 5, requiresPrescription: false, allocatedLots: [] },
      ],
    });
    expect(rankBestSellingProducts([orderWithItems]).map((productSales) => productSales.productId)).toEqual(['b', 'a']);
  });

  it('promedia las calificaciones con un decimal', () => {
    expect(calculateAverageRating([5, 4, 4])).toBe(4.3);
    expect(calculateAverageRating([])).toBeNull();
  });
});

describe('comparaciones y distribuciones del dashboard', () => {
  it('calcula la variación frente al período anterior', () => {
    expect(calculatePercentageChange(150, 100)).toBe(50);
    expect(calculatePercentageChange(80, 100)).toBe(-20);
    expect(calculatePercentageChange(30, 0)).toBeNull();
  });

  it('separa los pedidos por rango de fechas', () => {
    const lastWeek = new Date(2026, 10, 8);
    const orders = [createOrder('delivered', 10, today), createOrder('delivered', 10, lastWeek)];
    expect(filterOrdersCreatedBetween(orders, new Date(2026, 10, 14), new Date(2026, 10, 16))).toHaveLength(1);
  });

  it('agrupa ventas por botica sin contar cancelados', () => {
    const orders = [
      createOrder('delivered', 30, today, { branchName: 'El Bosque' }),
      createOrder('delivered', 50, today, { branchName: 'El Molino' }),
      createOrder('cancelled', 999, today, { branchName: 'El Bosque' }),
    ];
    expect(groupSalesByBranch(orders)).toEqual([
      { label: 'El Molino', amount: 50 },
      { label: 'El Bosque', amount: 30 },
    ]);
  });

  it('cuenta pedidos por hora del día y por característica', () => {
    const orders = [createOrder('delivered', 10, today), createOrder('confirmed', 10, today)];
    expect(countOrdersByHourOfDay(orders)[10]).toBe(2);
    expect(countOrdersBy(orders, (order) => order.status).get('delivered')).toBe(1);
  });
});
