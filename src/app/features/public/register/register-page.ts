import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthActionResult } from '../../../core/auth/auth-session';
import { AuthService } from '../../../core/auth/auth.service';
import { resolvePostLoginRoute } from '../../../core/auth/post-login-redirect';
import {
  passwordStrengthValidator,
  peruvianCellphoneValidator,
} from '../../../shared/validators/password-strength.validator';

type RegisterFieldName = 'fullName' | 'email' | 'phone' | 'password' | 'hasAcceptedPrivacyPolicy';

/** Registro de clientes. El consentimiento de datos personales es obligatorio (Ley 29733). */
@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
  styleUrl: '../auth-shared/auth-page.css',
})
export class RegisterPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly registerForm = this.formBuilder.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(120)]],
    phone: ['', [peruvianCellphoneValidator]],
    password: ['', [Validators.required, passwordStrengthValidator]],
    hasAcceptedPrivacyPolicy: [false, [Validators.requiredTrue]],
  });

  readonly isSubmitting = signal(false);
  readonly isPasswordVisible = signal(false);
  readonly errorMessage = signal('');

  async submitRegistration(): Promise<void> {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    let registrationResult: AuthActionResult;
    try {
      registrationResult = await this.authService.registerCustomer(this.registerForm.getRawValue());
    } catch {
      // Red de seguridad: el botón nunca queda en "cargando" si algo inesperado falla.
      registrationResult = { isSuccessful: false, errorMessage: 'No se pudo crear tu cuenta. Inténtalo de nuevo.' };
    } finally {
      this.isSubmitting.set(false);
    }

    if (!registrationResult.isSuccessful || !registrationResult.session) {
      this.errorMessage.set(registrationResult.errorMessage ?? 'No se pudo crear tu cuenta.');
      return;
    }
    await this.router.navigateByUrl(resolvePostLoginRoute(registrationResult.session, null));
  }

  togglePasswordVisibility(): void {
    this.isPasswordVisible.update((isVisible) => !isVisible);
  }

  hasFieldError(fieldName: RegisterFieldName): boolean {
    const formField = this.registerForm.controls[fieldName];
    return formField.invalid && formField.touched;
  }
}
