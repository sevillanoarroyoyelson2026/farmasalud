import { FormControl } from '@angular/forms';
import { passwordStrengthValidator, peruvianCellphoneValidator } from './password-strength.validator';

describe('passwordStrengthValidator', () => {
  it.each([
    ['corta1', false],
    ['soloLetrasLargas', false],
    ['12345678', false],
    ['Farma2026', true],
  ])('evalúa "%s" como válida = %s', (password, expectedIsValid) => {
    const validationErrors = passwordStrengthValidator(new FormControl(password));
    expect(validationErrors === null).toBe(expectedIsValid);
  });
});

describe('peruvianCellphoneValidator', () => {
  it.each([
    ['', true],
    ['987654321', true],
    ['987 654 321', true],
    ['87654321', false],
    ['187654321', false],
  ])('evalúa "%s" como válido = %s', (phone, expectedIsValid) => {
    const validationErrors = peruvianCellphoneValidator(new FormControl(phone));
    expect(validationErrors === null).toBe(expectedIsValid);
  });
});
