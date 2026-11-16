/**
 * Traduce los códigos de error de Firebase Auth a mensajes genéricos en español.
 * Los mensajes no revelan si un correo existe o no (evita enumeración de cuentas).
 */
const AUTH_ERROR_MESSAGE_BY_CODE: Record<string, string> = {
  'auth/invalid-email': 'El correo electrónico no es válido.',
  'auth/user-disabled': 'Esta cuenta está deshabilitada. Comunícate con la farmacia.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/email-already-in-use': 'No se pudo crear la cuenta con ese correo. Intenta iniciar sesión.',
  'auth/weak-password': 'La contraseña debe tener al menos 8 caracteres, con letras y números.',
  'auth/password-does-not-meet-requirements':
    'La contraseña debe tener al menos 8 caracteres, con letras y números.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'auth/popup-closed-by-user': 'No se completó el inicio con Google. Inténtalo de nuevo.',
  'auth/session-timeout': 'El servidor tardó demasiado en responder. Inténtalo de nuevo en un momento.',
  'auth/cancelled-popup-request': 'Cerraste la ventana de Google antes de terminar.',
  'auth/network-request-failed': 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  'auth/account-exists-with-different-credential':
    'Ese correo ya está registrado con otro método de acceso.',
};

const DEFAULT_AUTH_ERROR_MESSAGE = 'No se pudo completar la operación. Inténtalo de nuevo.';

export function getAuthErrorMessage(error: unknown): string {
  const errorCode = (error as { code?: string } | null)?.code ?? '';
  return AUTH_ERROR_MESSAGE_BY_CODE[errorCode] ?? DEFAULT_AUTH_ERROR_MESSAGE;
}
