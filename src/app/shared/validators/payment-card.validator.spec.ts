import { describe, expect, it } from 'vitest';
import { isValidCardExpiration, isValidCardNumber } from './payment-card.validator';

describe('tarjeta del pago simulado', () => {
  it('acepta números de prueba válidos (Luhn) con o sin espacios', () => {
    expect(isValidCardNumber('4111 1111 1111 1111')).toBe(true);
    expect(isValidCardNumber('5111111111111118')).toBe(true);
  });

  it('rechaza números mal escritos o demasiado cortos', () => {
    expect(isValidCardNumber('4111 1111 1111 1112')).toBe(false);
    expect(isValidCardNumber('1234')).toBe(false);
  });

  it('valida el vencimiento contra el mes actual', () => {
    const referenceDate = new Date(2026, 10, 15);
    expect(isValidCardExpiration('11/26', referenceDate)).toBe(true);
    expect(isValidCardExpiration('10/26', referenceDate)).toBe(false);
    expect(isValidCardExpiration('13/27', referenceDate)).toBe(false);
  });
});
