import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { HOME_ROUTE_BY_ROLE, UserRole } from '../auth/user-role';

/**
 * Permite entrar solo a los roles indicados.
 * - Sin sesión: manda al login y recuerda la URL pedida.
 * - Con otro rol: manda a la pantalla de inicio de su propio rol.
 * Esto es solo experiencia de usuario: la protección real está en las reglas
 * de Firestore y en las functions, que validan el rol del token.
 */
export function requireRoleGuard(allowedRoles: readonly UserRole[]): CanActivateFn {
  return async (_route, routerState) => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const resolvedSession = await authService.waitForResolvedSession();

    if (!resolvedSession) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: routerState.url } });
    }
    if (allowedRoles.includes(resolvedSession.role)) {
      return true;
    }
    return router.parseUrl(HOME_ROUTE_BY_ROLE[resolvedSession.role]);
  };
}
