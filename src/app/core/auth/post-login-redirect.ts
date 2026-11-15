import { AuthSession } from './auth-session';
import { HOME_ROUTE_BY_ROLE } from './user-role';

/**
 * Decide a dónde ir después de iniciar sesión (equivalente a `redirectBasedOnRole` de Alliker).
 * - Personal: siempre a su panel.
 * - Cliente: a la URL que quería visitar, solo si es una ruta interna segura.
 */
export function resolvePostLoginRoute(session: AuthSession, requestedReturnUrl: string | null): string {
  if (session.role !== 'customer') {
    return HOME_ROUTE_BY_ROLE[session.role];
  }
  return isSafeInternalRoute(requestedReturnUrl) ? requestedReturnUrl : HOME_ROUTE_BY_ROLE.customer;
}

/** Evita redirecciones abiertas a otros dominios (`//sitio-malicioso.com`, `https://...`). */
export function isSafeInternalRoute(candidateRoute: string | null): candidateRoute is string {
  if (!candidateRoute) {
    return false;
  }
  const startsWithSingleSlash = candidateRoute.startsWith('/') && !candidateRoute.startsWith('//');
  const containsBackslash = candidateRoute.includes('\\');
  const pointsToPanel = candidateRoute.startsWith('/admin') || candidateRoute.startsWith('/trabajador');
  return startsWithSingleSlash && !containsBackslash && !pointsToPanel;
}
