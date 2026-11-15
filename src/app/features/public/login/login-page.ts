import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthActionResult } from '../../../core/auth/auth-session';
import { AuthService } from '../../../core/auth/auth.service';
import { resolvePostLoginRoute } from '../../../core/auth/post-login-redirect';

/** Pantalla de inicio de sesión: Google o correo y contraseña (mismo flujo que Alliker). */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: '../auth-shared/auth-page.css',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  /** Llega desde el query param `?returnUrl=` que agregan los guards. */
  readonly returnUrl = input<string | null>(null);

  readonly loginForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly isSubmitting = signal(false);
  readonly isPasswordVisible = signal(false);
  readonly errorMessage = signal('');
  readonly informationMessage = signal('');

  async submitEmailLogin(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    const { email, password } = this.loginForm.getRawValue();
    await this.runLoginAction(() => this.authService.signInWithEmail(email, password));
  }

  async loginWithGoogle(): Promise<void> {
    await this.runLoginAction(() => this.authService.signInWithGoogle());
  }

  async sendPasswordResetLink(): Promise<void> {
    const emailControl = this.loginForm.controls.email;
    if (emailControl.invalid) {
      emailControl.markAsTouched();
      this.errorMessage.set('Escribe tu correo arriba para enviarte el enlace de recuperación.');
      return;
    }
    await this.authService.requestPasswordReset(emailControl.value);
    this.errorMessage.set('');
    this.informationMessage.set(
      'Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.',
    );
  }

  togglePasswordVisibility(): void {
    this.isPasswordVisible.update((isVisible) => !isVisible);
  }

  hasFieldError(fieldName: 'email' | 'password'): boolean {
    const formField = this.loginForm.controls[fieldName];
    return formField.invalid && formField.touched;
  }

  private async runLoginAction(loginAction: () => Promise<AuthActionResult>): Promise<void> {
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.informationMessage.set('');

    const loginResult = await loginAction();
    this.isSubmitting.set(false);

    if (!loginResult.isSuccessful) {
      this.errorMessage.set(loginResult.errorMessage ?? 'No se pudo iniciar sesión.');
      return;
    }
    if (loginResult.session) {
      await this.router.navigateByUrl(resolvePostLoginRoute(loginResult.session, this.returnUrl()));
    }
  }
}
