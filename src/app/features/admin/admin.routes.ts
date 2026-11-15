import { Routes } from '@angular/router';
import { requireRoleGuard } from '../../core/guards/role.guard';
import { AdminLayout } from '../../layouts/admin-layout/admin-layout';

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
      {
        path: 'proveedores',
        title: 'Proveedores | Farmasalud',
        loadComponent: () => import('./suppliers/admin-suppliers-page').then((module) => module.AdminSuppliersPage),
      },
      {
        path: 'cotizaciones',
        title: 'Cotizaciones | Farmasalud',
        loadComponent: () => import('./quotations/admin-quotations-page').then((module) => module.AdminQuotationsPage),
      },
      {
        path: 'ordenes-compra',
        title: 'Órdenes de compra | Farmasalud',
        loadComponent: () => import('./purchase-orders/admin-purchase-orders-page').then((module) => module.AdminPurchaseOrdersPage),
      },
      {
        path: 'recepcion',
        title: 'Recepción de mercadería | Farmasalud',
        loadComponent: () => import('../staff-purchasing/goods-reception-page').then((module) => module.GoodsReceptionPage),
      },
      {
        path: 'delivery',
        title: 'Delivery | Farmasalud',
        data: { boardMode: 'deliveries' },
        loadComponent: () => import('../staff-orders/staff-order-board-page').then((module) => module.StaffOrderBoardPage),
      },
      {
        path: 'promociones',
        title: 'Promociones | Farmasalud',
        loadComponent: () => import('./promotions/admin-promotions-page').then((module) => module.AdminPromotionsPage),
      },
      {
        path: 'reclamos',
        title: 'Reclamos | Farmasalud',
        loadComponent: () => import('./claims/admin-claims-page').then((module) => module.AdminClaimsPage),
      },
      {
        path: 'reportes',
        title: 'Reportes | Farmasalud',
        loadComponent: () => import('./reports/admin-reports-page').then((module) => module.AdminReportsPage),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];
