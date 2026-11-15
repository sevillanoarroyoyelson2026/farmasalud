import { AuthSession } from './auth-session';
import { isSafeInternalRoute, resolvePostLoginRoute } from './post-login-redirect';
import { UserRole } from './user-role';

function buildSession(role: UserRole): AuthSession {
  return {
    uid: 'uid-1',
    email: 'persona@farmasalud.test',
    displayName: 'Persona',
    role,
    branchId: role === 'worker' ? 'el-bosque' : null,
    isEmailVerified: true,
  };
}

describe('resolvePostLoginRoute', () => {
  it('envía al administrador a su dashboard aunque haya returnUrl', () => {
    expect(resolvePostLoginRoute(buildSession('admin'), '/carrito')).toBe('/admin/dashboard');
  });

  it('envía al trabajador a su cola de pedidos', () => {
    expect(resolvePostLoginRoute(buildSession('worker'), null)).toBe('/trabajador/pedidos');
  });

  it('devuelve al cliente a la página que quería visitar', () => {
    expect(resolvePostLoginRoute(buildSession('customer'), '/mis-pedidos')).toBe('/mis-pedidos');
  });

  it('ignora returnUrl peligrosos y lleva al cliente al inicio', () => {
    expect(resolvePostLoginRoute(buildSession('customer'), '//sitio-malicioso.com')).toBe('/');
  });
});

describe('isSafeInternalRoute', () => {
  it.each([
    ['https://sitio-malicioso.com', false],
    ['//sitio-malicioso.com', false],
    ['/\\sitio-malicioso.com', false],
    ['/admin/usuarios', false],
    ['/trabajador/pedidos', false],
    ['/catalogo', true],
  ])('evalúa %s como %s', (candidateRoute, expectedIsSafe) => {
    expect(isSafeInternalRoute(candidateRoute)).toBe(expectedIsSafe);
  });
});
