import { Routes } from '@angular/router';
import { requireRoleGuard } from '../../core/guards/role.guard';
import { WorkerLayout } from '../../layouts/worker-layout/worker-layout';

const loadStaffOrderBoardPage = () =>
  import('../staff-orders/staff-order-board-page').then((module) => module.StaffOrderBoardPage);

export const WORKER_ROUTES: Routes = [
  {
    path: '',
    component: WorkerLayout,
    canActivate: [requireRoleGuard(['worker'])],
    children: [
      {
        path: 'pedidos',
        title: 'Cola de pedidos | Farmasalud',
        data: { boardMode: 'active' },
        loadComponent: loadStaffOrderBoardPage,
      },
      {
        path: 'recetas',
        title: 'Validar recetas | Farmasalud',
        data: { boardMode: 'prescriptions' },
        loadComponent: loadStaffOrderBoardPage,
      },
      {
        path: 'despacho',
        title: 'Preparación y despacho | Farmasalud',
        data: { boardMode: 'dispatch' },
        loadComponent: loadStaffOrderBoardPage,
      },
      {
        path: 'alertas',
        title: 'Alertas de stock | Farmasalud',
        data: { startWithAlertsOnly: true },
        loadComponent: () =>
          import('../admin/stock/admin-stock-page').then((module) => module.AdminStockPage),
      },
      {
        path: 'recepcion',
        title: 'Recepción de mercadería | Farmasalud',
        loadComponent: () =>
          import('../staff-purchasing/goods-reception-page').then((module) => module.GoodsReceptionPage),
      },
      { path: '', redirectTo: 'pedidos', pathMatch: 'full' },
    ],
  },
];
