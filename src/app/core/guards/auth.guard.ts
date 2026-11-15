import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** Exige una sesión iniciada (cualquier rol). */
export const requireAuthenticatedUserGuard: CanActivateFn = async (_route, routerState) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const resolvedSession = await authService.waitForResolvedSession();

  if (resolvedSession) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: routerState.url } });
};
