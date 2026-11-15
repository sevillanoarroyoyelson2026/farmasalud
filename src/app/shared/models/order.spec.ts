import { describe, expect, it } from 'vitest';
import { buildTrackingSteps, getAvailableStaffActions, Order } from './order';

function createSampleOrder(orderOverrides: Partial<Order>): Order {
  return {
    id: 'pedido-1',
    orderNumber: 'FS-000001',
    customerUid: 'cliente-1',
    customerName: 'Ana',
    contactPhone: '987654321',
    branchId: 'el-bosque',
    branchName: 'Botica El Bosque',
    fulfillmentType: 'delivery',
    deliveryAddress: { street: 'Av. España 123', district: 'Trujillo', reference: '' },
    customerNote: '',
    items: [],
    itemsTotal: 20,
    deliveryFee: 6,
    orderTotal: 26,
    paymentMethod: 'simulated_card',
    paymentStatus: 'paid',
    paymentReference: 'SIM-1',
    hasPrescription: false,
    prescriptionReviewStatus: null,
    prescriptionReviewNote: '',
    status: 'confirmed',
    statusHistory: [],
    courierName: null,
    createdAt: null,
    ...orderOverrides,
  };
}

describe('acciones del personal sobre un pedido', () => {
  it('un pedido con receta pendiente solo se aprueba, rechaza o cancela', () => {
    const availableActions = getAvailableStaffActions(createSampleOrder({ status: 'pending_prescription' }));
    expect(availableActions.map((actionDefinition) => actionDefinition.action)).toEqual([
      'approve_prescription',
      'reject_prescription',
      'cancel_by_staff',
    ]);
  });

  it('en preparación ofrece despachar si es delivery y "listo para recoger" si es recojo', () => {
    const deliveryActions = getAvailableStaffActions(createSampleOrder({ status: 'preparing' }));
    const pickupActions = getAvailableStaffActions(
      createSampleOrder({ status: 'preparing', fulfillmentType: 'pickup' }),
    );
    expect(deliveryActions.some((actionDefinition) => actionDefinition.action === 'dispatch')).toBe(true);
    expect(deliveryActions.some((actionDefinition) => actionDefinition.action === 'mark_ready_for_pickup')).toBe(false);
    expect(pickupActions.some((actionDefinition) => actionDefinition.action === 'mark_ready_for_pickup')).toBe(true);
  });

  it('un pedido entregado o cancelado ya no tiene acciones', () => {
    expect(getAvailableStaffActions(createSampleOrder({ status: 'delivered' }))).toEqual([]);
    expect(getAvailableStaffActions(createSampleOrder({ status: 'cancelled' }))).toEqual([]);
  });
});

describe('pasos del seguimiento', () => {
  it('incluye la validación de receta solo si el pedido la lleva', () => {
    expect(buildTrackingSteps(createSampleOrder({ hasPrescription: true }))[0]).toBe('pending_prescription');
    expect(buildTrackingSteps(createSampleOrder({ fulfillmentType: 'pickup' }))).toEqual([
      'confirmed',
      'preparing',
      'ready_for_pickup',
      'delivered',
    ]);
  });
});
