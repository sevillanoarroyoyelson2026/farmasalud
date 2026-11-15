import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../auth/user-role';
import { requireRoleGuard } from './role.guard';

function buildSession(role: UserRole): AuthSession {
  return { uid: 'uid-1', email: 'a@b.c', displayName: 'A', role, branchId: null, isEmailVerified: true };
}

async function runGuardWithSession(session: AuthSession | null, allowedRoles: UserRole[]) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { waitForResolvedSession: () => Promise.resolve(session) } },
    ],
  });
  const routerState = { url: '/admin/usuarios' } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() =>
    requireRoleGuard(allowedRoles)({} as ActivatedRouteSnapshot, routerState),
  );
}

describe('requireRoleGuard', () => {
  it('deja pasar al rol permitido', async () => {
    expect(await runGuardWithSession(buildSession('admin'), ['admin'])).toBe(true);
  });

  it('manda al login, recordando la URL, si no hay sesión', async () => {
    const guardResult = (await runGuardWithSession(null, ['admin'])) as UrlTree;
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(guardResult)).toBe('/login?returnUrl=%2Fadmin%2Fusuarios');
  });

  it('manda a un cliente a la tienda si intenta entrar al panel de admin', async () => {
    const guardResult = (await runGuardWithSession(buildSession('customer'), ['admin'])) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(guardResult)).toBe('/');
  });

  it('manda a un trabajador a su panel si intenta entrar al de admin', async () => {
    const guardResult = (await runGuardWithSession(buildSession('worker'), ['admin'])) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(guardResult)).toBe('/trabajador/pedidos');
  });
});
