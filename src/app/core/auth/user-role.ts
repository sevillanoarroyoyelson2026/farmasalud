/** Los tres únicos roles del sistema. El rol vive en los custom claims del token. */
export type UserRole = 'admin' | 'worker' | 'customer';

export const STAFF_ROLES: readonly UserRole[] = ['admin', 'worker'];

/** Pantalla de inicio de cada rol después de iniciar sesión. */
export const HOME_ROUTE_BY_ROLE: Record<UserRole, string> = {
  admin: '/admin/dashboard',
  worker: '/trabajador/pedidos',
  customer: '/',
};

/** Texto que se muestra en la interfaz para cada rol. */
export const ROLE_DISPLAY_NAME: Record<UserRole, string> = {
  admin: 'Administrador',
  worker: 'Trabajador',
  customer: 'Cliente',
};

export function isKnownUserRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'worker' || value === 'customer';
}
