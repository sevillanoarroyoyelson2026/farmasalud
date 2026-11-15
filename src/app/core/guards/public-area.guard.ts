import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { HOME_ROUTE_BY_ROLE } from '../auth/user-role';

/**
 * Pantallas de compra (carrito, checkout, mis pedidos): solo visitantes y clientes.
 * El personal (admin/trabajador) se devuelve a su panel para no mezclar cuentas.
 */
export const customerShoppingAreaGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const resolvedSession = await authService.waitForResolvedSession();

  if (!resolvedSession || resolvedSession.role === 'customer') {
    return true;
  }
  return router.parseUrl(HOME_ROUTE_BY_ROLE[resolvedSession.role]);
};

/** Login y registro: si ya hay sesión, no tiene sentido mostrarlos. */
export const guestOnlyGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const resolvedSession = await authService.waitForResolvedSession();

  if (!resolvedSession) {
    return true;
  }
  return router.parseUrl(HOME_ROUTE_BY_ROLE[resolvedSession.role]);
};
