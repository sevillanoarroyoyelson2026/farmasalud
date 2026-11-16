import { describe, expect, it } from 'vitest';
import { describeElapsedTime, isNotificationUnreadBy, StaffNotification } from './staff-notification';

const sampleNotification: StaffNotification = {
  id: 'low-stock__el-bosque__paracetamol',
  productId: 'paracetamol',
  productName: 'Paracetamol 500 mg',
  presentation: 'Caja x 100',
  branchId: 'el-bosque',
  branchName: 'Botica el Bosque',
  availableUnits: 3,
  minimumStock: 10,
  severity: 'low_stock',
  readByUids: ['admin-1'],
  createdAt: null,
};

describe('notificaciones del personal', () => {
  it('cada persona tiene su propio estado de leída', () => {
    expect(isNotificationUnreadBy(sampleNotification, 'admin-1')).toBe(false);
    expect(isNotificationUnreadBy(sampleNotification, 'trabajador-1')).toBe(true);
  });

  it('describe cuánto tiempo pasó desde la alerta', () => {
    const referenceDate = new Date(2026, 10, 16, 12, 0);
    expect(describeElapsedTime(new Date(2026, 10, 16, 11, 55), referenceDate)).toBe('hace 5 min');
    expect(describeElapsedTime(new Date(2026, 10, 16, 9, 0), referenceDate)).toBe('hace 3 h');
    expect(describeElapsedTime(new Date(2026, 10, 15, 11, 0), referenceDate)).toBe('hace 1 día');
    expect(describeElapsedTime(null, referenceDate)).toBe('ahora');
  });
});
