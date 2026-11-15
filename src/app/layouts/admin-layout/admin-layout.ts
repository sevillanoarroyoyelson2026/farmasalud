import { Component, inject, OnInit } from '@angular/core';
import { AppLoggerService } from '../../core/logger/app-logger.service';
import { BranchRepository } from '../../shared/data-access/branch.repository';
import {
  ALL_BRANCHES_OPTION,
  BranchSelectionService,
} from '../../shared/data-access/branch-selection.service';
import {
  PanelNavigationItem,
  PanelNavigationSection,
  PanelShell,
} from '../../shared/ui/panel-shell/panel-shell';

/**
 * Menú del administrador agrupado según los procesos del informe T2:
 * ventas (O04.02), inventario (O02.03 / O03), compras (O01.02) y gestión.
 */
const ADMIN_NAVIGATION_SECTIONS: PanelNavigationSection[] = [
  {
    sectionTitle: 'General',
    items: [{ iconClass: 'fas fa-chart-pie', label: 'Dashboard', path: '/admin/dashboard' }],
  },
  {
    sectionTitle: 'Ventas',
    items: [
      { iconClass: 'fas fa-receipt', label: 'Pedidos', path: '/admin/pedidos' },
      { iconClass: 'fas fa-truck-fast', label: 'Delivery', path: '/admin/delivery' },
      { iconClass: 'fas fa-percent', label: 'Promociones', path: '/admin/promociones' },
      { iconClass: 'fas fa-comment-medical', label: 'Reclamos', path: '/admin/reclamos' },
    ],
  },
  {
    sectionTitle: 'Inventario',
    items: [
      { iconClass: 'fas fa-pills', label: 'Productos', path: '/admin/productos' },
      { iconClass: 'fas fa-tags', label: 'Categorías', path: '/admin/categorias' },
      { iconClass: 'fas fa-boxes-stacked', label: 'Lotes y stock', path: '/admin/stock' },
    ],
  },
  {
    sectionTitle: 'Compras',
    items: [
      { iconClass: 'fas fa-handshake', label: 'Proveedores', path: '/admin/proveedores' },
      { iconClass: 'fas fa-file-invoice-dollar', label: 'Cotizaciones', path: '/admin/cotizaciones' },
      { iconClass: 'fas fa-file-signature', label: 'Órdenes de compra', path: '/admin/ordenes-compra' },
      { iconClass: 'fas fa-dolly', label: 'Recepción', path: '/admin/recepcion' },
    ],
  },
  {
    sectionTitle: 'Gestión',
    items: [
      { iconClass: 'fas fa-store', label: 'Sucursales', path: '/admin/sucursales' },
      { iconClass: 'fas fa-users-gear', label: 'Usuarios', path: '/admin/usuarios' },
      { iconClass: 'fas fa-chart-line', label: 'Reportes', path: '/admin/reportes' },
    ],
  },
];

const ADMIN_MOBILE_QUICK_LINKS: PanelNavigationItem[] = [
  { iconClass: 'fas fa-chart-pie', label: 'Inicio', path: '/admin/dashboard' },
  { iconClass: 'fas fa-receipt', label: 'Pedidos', path: '/admin/pedidos' },
  { iconClass: 'fas fa-boxes-stacked', label: 'Stock', path: '/admin/stock' },
  { iconClass: 'fas fa-file-signature', label: 'Compras', path: '/admin/ordenes-compra' },
];

@Component({
  selector: 'app-admin-layout',
  imports: [PanelShell],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout implements OnInit {
  private readonly branchRepository = inject(BranchRepository);
  private readonly logger = inject(AppLoggerService);
  readonly branchSelection = inject(BranchSelectionService);

  readonly navigationSections = ADMIN_NAVIGATION_SECTIONS;
  readonly mobileQuickLinks = ADMIN_MOBILE_QUICK_LINKS;
  readonly allBranchesOption = ALL_BRANCHES_OPTION;

  async ngOnInit(): Promise<void> {
    try {
      const branches = await this.branchRepository.findAllBranches();
      this.branchSelection.setAvailableBranches(branches);
    } catch (error) {
      this.logger.logError('AdminLayout.loadBranches', error);
    }
  }

  changeSelectedBranch(changeEvent: Event): void {
    const branchSelect = changeEvent.target as HTMLSelectElement;
    this.branchSelection.selectBranch(branchSelect.value);
  }
}
