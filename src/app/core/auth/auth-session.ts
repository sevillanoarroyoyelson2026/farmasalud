import { UserRole } from './user-role';

/**
 * Sesión del usuario tal como la conoce el front.
 * Se construye SIEMPRE a partir del token verificado de Firebase (custom claims),
 * nunca desde localStorage, para que no pueda manipularse desde el navegador.
 */
export interface AuthSession {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  branchId: string | null;
  isEmailVerified: boolean;
}

/** Resultado de una acción de autenticación que la pantalla puede mostrar. */
export interface AuthActionResult {
  isSuccessful: boolean;
  errorMessage?: string;
  session?: AuthSession;
}
