import { computed, inject, Injectable, signal } from '@angular/core';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { firebaseAuth } from '../firebase/firebase-client';
import { ApiClientService } from '../http/api-client.service';
import { AppLoggerService } from '../logger/app-logger.service';
import { getAuthErrorMessage } from './auth-error-messages';
import { AuthActionResult, AuthSession } from './auth-session';
import { settleWithTimeout, watchForAbandonedPopup } from './settle-with-timeout';
import { isKnownUserRole, STAFF_ROLES, UserRole } from './user-role';

/** Tiempo máximo con la ventana de Google abierta antes de dar el intento por cancelado. */
const GOOGLE_POPUP_TIMEOUT_MS = 3 * 60_000;
/** Tiempo máximo para dejar lista la sesión (incluye crear el perfil en el servidor). */
const SESSION_RESOLUTION_TIMEOUT_MS = 25_000;

/** Datos que el cliente envía al crear su perfil (el rol lo asigna SIEMPRE el servidor). */
interface CustomerProfileRequest {
  fullName: string;
  phone: string | null;
  hasAcceptedPrivacyPolicy: boolean;
}

export interface CustomerRegistrationForm {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  hasAcceptedPrivacyPolicy: boolean;
}

type SessionWaiter = (session: AuthSession | null) => void;

/** Errores de popup que justifican reintentar con redirección (navegadores que bloquean ventanas). */
const POPUP_UNAVAILABLE_ERROR_CODES = [
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
];

/**
 * Fuente única de verdad de la sesión.
 * - La sesión se arma desde el token de Firebase (custom claims `role` y `branchId`).
 * - Nada de la sesión se guarda en localStorage: Firebase ya persiste el token de forma segura.
 * - Si un usuario autenticado aún no tiene rol (cliente nuevo), se le pide al servidor
 *   que cree su perfil de cliente; el navegador nunca escribe su propio rol.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiClient = inject(ApiClientService);
  private readonly logger = inject(AppLoggerService);

  private readonly currentSessionSignal = signal<AuthSession | null>(null);
  private readonly isSessionResolvedSignal = signal(false);
  private pendingCustomerProfileRequest: CustomerProfileRequest | null = null;
  private sessionWaiters: SessionWaiter[] = [];
  private latestTokenChangeNumber = 0;

  readonly currentSession = this.currentSessionSignal.asReadonly();
  readonly isSessionResolved = this.isSessionResolvedSignal.asReadonly();
  readonly isLoggedIn = computed(() => this.currentSessionSignal() !== null);
  readonly currentRole = computed<UserRole | null>(() => this.currentSessionSignal()?.role ?? null);
  readonly isStaffMember = computed(() => {
    const role = this.currentRole();
    return role !== null && STAFF_ROLES.includes(role);
  });

  constructor() {
    onIdTokenChanged(firebaseAuth, (firebaseUser) => {
      const tokenChangeNumber = ++this.latestTokenChangeNumber;
      void this.resolveSessionFromFirebaseUser(firebaseUser, tokenChangeNumber);
    });
    void this.reportFailedGoogleRedirect();
  }

  /** Espera a que Firebase termine de restaurar la sesión (lo usan los guards). */
  waitForResolvedSession(): Promise<AuthSession | null> {
    if (this.isSessionResolvedSignal()) {
      return Promise.resolve(this.currentSessionSignal());
    }
    return new Promise((resolveWaiter) => this.sessionWaiters.push(resolveWaiter));
  }

  async signInWithEmail(email: string, password: string): Promise<AuthActionResult> {
    try {
      this.markSessionAsResolving();
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      return this.buildResultFromResolvedSession();
    } catch (error) {
      return this.buildFailedResult('AuthService.signInWithEmail', error);
    }
  }

  /**
   * Inicia sesión con Google. Al pulsar el botón el cliente acepta la política de
   * privacidad (el texto se muestra junto al botón), por eso se envía el consentimiento.
   */
  async signInWithGoogle(): Promise<AuthActionResult> {
    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    this.pendingCustomerProfileRequest = {
      fullName: '',
      phone: null,
      hasAcceptedPrivacyPolicy: true,
    };

    // Si el usuario cierra la ventana de Google, Firebase no siempre lo detecta:
    // se vigila el regreso del foco y hay un tope máximo de espera.
    const popupWatcher = watchForAbandonedPopup();
    try {
      this.markSessionAsResolving();
      await settleWithTimeout(
        Promise.race([signInWithPopup(firebaseAuth, googleProvider), popupWatcher.abandonment]),
        GOOGLE_POPUP_TIMEOUT_MS,
        'auth/popup-closed-by-user',
      );
      popupWatcher.stopWatching();
      return this.buildResultFromResolvedSession();
    } catch (error) {
      popupWatcher.stopWatching();
      const errorCode = (error as { code?: string }).code ?? '';
      if (POPUP_UNAVAILABLE_ERROR_CODES.includes(errorCode)) {
        await signInWithRedirect(firebaseAuth, googleProvider);
        return { isSuccessful: true };
      }
      return this.buildFailedResult('AuthService.signInWithGoogle', error);
    }
  }

  async registerCustomer(registrationForm: CustomerRegistrationForm): Promise<AuthActionResult> {
    if (!registrationForm.hasAcceptedPrivacyPolicy) {
      return { isSuccessful: false, errorMessage: 'Debes aceptar la política de privacidad.' };
    }

    this.pendingCustomerProfileRequest = {
      fullName: registrationForm.fullName.trim(),
      phone: registrationForm.phone.trim() || null,
      hasAcceptedPrivacyPolicy: true,
    };

    try {
      this.markSessionAsResolving();
      const userCredential = await createUserWithEmailAndPassword(
        firebaseAuth,
        registrationForm.email.trim(),
        registrationForm.password,
      );
      await updateProfile(userCredential.user, { displayName: registrationForm.fullName.trim() });
      await sendEmailVerification(userCredential.user);
      return this.buildResultFromResolvedSession();
    } catch (error) {
      return this.buildFailedResult('AuthService.registerCustomer', error);
    }
  }

  /** Siempre responde con éxito para no revelar si el correo está registrado. */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
    } catch (error) {
      this.logger.logError('AuthService.requestPasswordReset', error);
    }
  }

  async resendEmailVerification(): Promise<void> {
    const currentFirebaseUser = firebaseAuth.currentUser;
    if (currentFirebaseUser && !currentFirebaseUser.emailVerified) {
      await sendEmailVerification(currentFirebaseUser);
    }
  }

  /** Vuelve a leer el token (p. ej. después de verificar el correo o de un cambio de rol). */
  async refreshSession(): Promise<AuthSession | null> {
    const currentFirebaseUser = firebaseAuth.currentUser;
    if (!currentFirebaseUser) {
      return null;
    }
    await currentFirebaseUser.reload();
    this.markSessionAsResolving();
    await currentFirebaseUser.getIdToken(true);
    return this.waitForResolvedSession();
  }

  async signOutCurrentUser(): Promise<void> {
    try {
      await signOut(firebaseAuth);
    } catch (error) {
      this.logger.logError('AuthService.signOutCurrentUser', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Resolución de sesión
  // ---------------------------------------------------------------------------

  private async resolveSessionFromFirebaseUser(
    firebaseUser: FirebaseUser | null,
    tokenChangeNumber: number,
  ): Promise<void> {
    if (!firebaseUser) {
      this.publishSession(null);
      return;
    }

    try {
      const idTokenResult = await firebaseUser.getIdTokenResult();
      const roleClaim = idTokenResult.claims['role'];

      if (!isKnownUserRole(roleClaim)) {
        await this.createCustomerProfileOnServer(firebaseUser);
        // Forzar un token nuevo dispara otra vez onIdTokenChanged, ya con el rol.
        await firebaseUser.getIdToken(true);
        return;
      }

      if (tokenChangeNumber !== this.latestTokenChangeNumber) {
        return; // Llegó un cambio de token más reciente; este resultado ya no vale.
      }

      const branchIdClaim = idTokenResult.claims['branchId'];
      this.publishSession({
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName ?? firebaseUser.email ?? '',
        role: roleClaim,
        branchId: typeof branchIdClaim === 'string' ? branchIdClaim : null,
        isEmailVerified: firebaseUser.emailVerified,
      });
    } catch (error) {
      this.logger.logError('AuthService.resolveSessionFromFirebaseUser', error);
      this.publishSession(null);
      await this.signOutCurrentUser();
    }
  }

  private async createCustomerProfileOnServer(firebaseUser: FirebaseUser): Promise<void> {
    const profileRequest: CustomerProfileRequest = this.pendingCustomerProfileRequest ?? {
      fullName: firebaseUser.displayName ?? '',
      phone: null,
      hasAcceptedPrivacyPolicy: true,
    };
    if (!profileRequest.fullName) {
      profileRequest.fullName = firebaseUser.displayName ?? '';
    }

    await this.apiClient.postJson('complete-customer-profile', profileRequest);
    this.pendingCustomerProfileRequest = null;
  }

  private markSessionAsResolving(): void {
    this.isSessionResolvedSignal.set(false);
  }

  private publishSession(session: AuthSession | null): void {
    this.currentSessionSignal.set(session);
    this.isSessionResolvedSignal.set(true);
    const waitersToNotify = this.sessionWaiters;
    this.sessionWaiters = [];
    waitersToNotify.forEach((notifyWaiter) => notifyWaiter(session));
  }

  /**
   * Espera a que la sesión quede lista (rol asignado, perfil creado). Con tope de tiempo:
   * si el servidor no responde, se cierra la sesión a medias y se informa el error.
   */
  private async buildResultFromResolvedSession(): Promise<AuthActionResult> {
    let resolvedSession: AuthSession | null;
    try {
      resolvedSession = await settleWithTimeout(
        this.waitForResolvedSession(),
        SESSION_RESOLUTION_TIMEOUT_MS,
        'auth/session-timeout',
      );
    } catch (error) {
      this.logger.logError('AuthService.buildResultFromResolvedSession', error);
      await this.signOutCurrentUser();
      this.publishSession(null);
      return { isSuccessful: false, errorMessage: getAuthErrorMessage(error) };
    }
    if (!resolvedSession) {
      return {
        isSuccessful: false,
        errorMessage: 'No se pudo cargar tu perfil. Inténtalo de nuevo.',
      };
    }
    return { isSuccessful: true, session: resolvedSession };
  }

  private buildFailedResult(context: string, error: unknown): AuthActionResult {
    this.logger.logError(context, error);
    this.pendingCustomerProfileRequest = null;
    // El intento falló: la sesión vuelve a quedar "resuelta" con lo que había antes.
    // Si no se hiciera, todo lo que espera la sesión (guards, pantallas) quedaría colgado.
    if (!firebaseAuth.currentUser) {
      this.publishSession(null);
    } else if (!this.isSessionResolvedSignal()) {
      this.publishSession(this.currentSessionSignal());
    }
    return { isSuccessful: false, errorMessage: getAuthErrorMessage(error) };
  }

  private async reportFailedGoogleRedirect(): Promise<void> {
    try {
      await getRedirectResult(firebaseAuth);
    } catch (error) {
      this.logger.logError('AuthService.reportFailedGoogleRedirect', error);
    }
  }
}
