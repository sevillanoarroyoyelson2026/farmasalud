import { Routes } from '@angular/router';
import { requireRoleGuard } from '../../core/guards/role.guard';
import { AdminLayout } from '../../layouts/admin-layout/admin-layout';
import { createModuleInProgressRoute } from '../../shared/ui/module-in-progress/module-in-progress-route';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayout,
    canActivate: [requireRoleGuard(['admin'])],
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard | Farmasalud',
        loadComponent: () =>
          import('./dashboard/admin-dashboard-page').then((module) => module.AdminDashboardPage),
      },
      {
        path: 'productos',
        title: 'Productos | Farmasalud',
        loadComponent: () =>
          import('./products/admin-products-page').then((module) => module.AdminProductsPage),
      },
      {
        path: 'categorias',
        title: 'Categorías | Farmasalud',
        loadComponent: () =>
          import('./categories/admin-categories-page').then((module) => module.AdminCategoriesPage),
      },
      {
        path: 'stock',
        title: 'Lotes y stock | Farmasalud',
        loadComponent: () => import('./stock/admin-stock-page').then((module) => module.AdminStockPage),
      },
      {
        path: 'sucursales',
        title: 'Sucursales | Farmasalud',
        loadComponent: () =>
          import('./branches/admin-branches-page').then((module) => module.AdminBranchesPage),
      },
      {
        path: 'usuarios',
        title: 'Usuarios | Farmasalud',
        loadComponent: () => import('./users/admin-users-page').then((module) => module.AdminUsersPage),
      },
      {
        path: 'pedidos',
        title: 'Pedidos | Farmasalud',
        data: { boardMode: 'history' },
        loadComponent: () =>
          import('../staff-orders/staff-order-board-page').then((module) => module.StaffOrderBoardPage),
      },
      createModuleInProgressRoute('proveedores', 'Proveedores', 'Registro de proveedores y distribuidores.', 5),
      createModuleInProgressRoute('cotizaciones', 'Cotizaciones', 'Comparación de precios, plazos y condiciones.', 5),
      createModuleInProgressRoute('ordenes-compra', 'Órdenes de compra', 'Generación y envío al proveedor.', 5),
      createModuleInProgressRoute('delivery', 'Delivery', 'Asignación y seguimiento de entregas.', 6),
      createModuleInProgressRoute('promociones', 'Promociones', 'Descuentos y productos destacados.', 6),
      createModuleInProgressRoute('reclamos', 'Reclamos', 'Buzón de reclamos de clientes.', 6),
      createModuleInProgressRoute('reportes', 'Reportes', 'Ventas, rotación, vencimientos y satisfacción.', 6),
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];
