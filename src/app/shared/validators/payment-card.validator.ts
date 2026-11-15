import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validaciones del formulario de tarjeta del PAGO SIMULADO.
 * Los datos de la tarjeta nunca salen del navegador: al servidor solo van los 4 últimos dígitos.
 */
export function extractCardDigits(cardNumber: string): string {
  return cardNumber.replace(/\D/g, '');
}

/** Algoritmo de Luhn: detecta números de tarjeta mal escritos. */
export function isValidCardNumber(cardNumber: string): boolean {
  const cardDigits = extractCardDigits(cardNumber);
  if (cardDigits.length < 13 || cardDigits.length > 19) {
    return false;
  }
  let checksum = 0;
  for (let digitIndex = 0; digitIndex < cardDigits.length; digitIndex++) {
    let digit = Number(cardDigits[cardDigits.length - 1 - digitIndex]);
    if (digitIndex % 2 === 1) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    checksum += digit;
  }
  return checksum % 10 === 0;
}

/** Vencimiento en formato MM/AA, no anterior al mes actual. */
export function isValidCardExpiration(expiration: string, referenceDate = new Date()): boolean {
  const expirationMatch = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiration.trim());
  if (!expirationMatch) {
    return false;
  }
  const expirationMonth = Number(expirationMatch[1]);
  const expirationYear = 2000 + Number(expirationMatch[2]);
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth() + 1;
  return expirationYear > currentYear || (expirationYear === currentYear && expirationMonth >= currentMonth);
}

export const cardNumberValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  !control.value || isValidCardNumber(String(control.value)) ? null : { invalidCardNumber: true };

export const cardExpirationValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  !control.value || isValidCardExpiration(String(control.value)) ? null : { invalidCardExpiration: true };
