import { Component, computed, inject, OnInit } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AppLoggerService } from '../../core/logger/app-logger.service';
import { BranchRepository } from '../../shared/data-access/branch.repository';
import { BranchSelectionService } from '../../shared/data-access/branch-selection.service';
import {
  PanelNavigationItem,
  PanelNavigationSection,
  PanelShell,
} from '../../shared/ui/panel-shell/panel-shell';

/**
 * Menú del trabajador (director técnico / técnico farmacéutico / almacén),
 * según los procedimientos 04.02 (dispensación digital) y 03.02 (registro en inventario).
 */
const WORKER_NAVIGATION_SECTIONS: PanelNavigationSection[] = [
  {
    sectionTitle: 'Atención de pedidos',
    items: [
      { iconClass: 'fas fa-list-check', label: 'Cola de pedidos', path: '/trabajador/pedidos' },
      { iconClass: 'fas fa-file-prescription', label: 'Validar recetas', path: '/trabajador/recetas' },
      { iconClass: 'fas fa-box', label: 'Preparación y despacho', path: '/trabajador/despacho' },
    ],
  },
  {
    sectionTitle: 'Almacén',
    items: [
      { iconClass: 'fas fa-dolly', label: 'Recepción de mercadería', path: '/trabajador/recepcion' },
      { iconClass: 'fas fa-triangle-exclamation', label: 'Alertas de stock', path: '/trabajador/alertas' },
    ],
  },
];

const WORKER_MOBILE_QUICK_LINKS: PanelNavigationItem[] = [
  { iconClass: 'fas fa-list-check', label: 'Pedidos', path: '/trabajador/pedidos' },
  { iconClass: 'fas fa-file-prescription', label: 'Recetas', path: '/trabajador/recetas' },
  { iconClass: 'fas fa-box', label: 'Despacho', path: '/trabajador/despacho' },
  { iconClass: 'fas fa-dolly', label: 'Recepción', path: '/trabajador/recepcion' },
];

@Component({
  selector: 'app-worker-layout',
  imports: [PanelShell],
  templateUrl: './worker-layout.html',
  styleUrl: './worker-layout.css',
})
export class WorkerLayout implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly branchRepository = inject(BranchRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly branchSelection = inject(BranchSelectionService);

  readonly navigationSections = WORKER_NAVIGATION_SECTIONS;
  readonly mobileQuickLinks = WORKER_MOBILE_QUICK_LINKS;
  readonly assignedBranchName = computed(
    () =>
      this.branchSelection.selectedBranch()?.name ??
      this.authService.currentSession()?.branchId ??
      'Sin sucursal asignada',
  );

  async ngOnInit(): Promise<void> {
    const assignedBranchId = this.authService.currentSession()?.branchId;
    if (!assignedBranchId) {
      return;
    }
    // Primero se fija la sucursal: las consultas del trabajador SIEMPRE filtran por ella.
    this.branchSelection.lockToAssignedBranch(assignedBranchId);
    try {
      const branches = await this.branchRepository.findAllBranches();
      this.branchSelection.setAvailableBranches(branches.filter((branch) => branch.id === assignedBranchId));
      this.branchSelection.lockToAssignedBranch(assignedBranchId);
    } catch (error) {
      this.logger.logError('WorkerLayout.loadAssignedBranch', error);
    }
  }
}
