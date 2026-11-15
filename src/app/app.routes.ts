import { Routes } from '@angular/router';

/**
 * Una rama de rutas por rol, cada una cargada bajo demanda (lazy loading):
 *   ''            → tienda pública (visitantes y clientes)
 *   /admin        → panel del administrador
 *   /trabajador   → panel del trabajador (farmacéutico / almacén)
 */
export const routes: Routes = [
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then((module) => module.ADMIN_ROUTES),
  },
  {
    path: 'trabajador',
    loadChildren: () =>
      import('./features/worker/worker.routes').then((module) => module.WORKER_ROUTES),
  },
  {
    path: '',
    loadChildren: () =>
      import('./features/public/public.routes').then((module) => module.PUBLIC_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
