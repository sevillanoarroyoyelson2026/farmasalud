import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const MINIMUM_PASSWORD_LENGTH = 8;

/**
 * Contraseña de al menos 8 caracteres con letras y números.
 * La misma política se configura en Firebase Auth (Password policy) para que
 * el servidor también la exija.
 */
export const passwordStrengthValidator: ValidatorFn = (
  passwordControl: AbstractControl,
): ValidationErrors | null => {
  const password = String(passwordControl.value ?? '');
  if (!password) {
    return null;
  }

  const hasMinimumLength = password.length >= MINIMUM_PASSWORD_LENGTH;
  const hasLetter = /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password);
  const hasNumber = /\d/.test(password);

  return hasMinimumLength && hasLetter && hasNumber ? null : { weakPassword: true };
};

/** Número de celular peruano: 9 dígitos que empiezan con 9. */
export const peruvianCellphoneValidator: ValidatorFn = (
  phoneControl: AbstractControl,
): ValidationErrors | null => {
  const phone = String(phoneControl.value ?? '').replace(/\s/g, '');
  if (!phone) {
    return null;
  }
  return /^9\d{8}$/.test(phone) ? null : { invalidCellphone: true };
};
