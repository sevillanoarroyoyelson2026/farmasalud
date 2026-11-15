import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { BranchSelectionService } from '../../../shared/data-access/branch-selection.service';

interface DashboardIndicator {
  iconClass: string;
  label: string;
  /** Indicador del informe T2 que se calculará en el sprint 6. */
  sourceIndicator: string;
}

/**
 * Indicadores definidos en las fichas del informe de procesos (T2).
 * En el sprint 6 se reemplazan los valores vacíos por datos reales.
 */
const DASHBOARD_INDICATORS: DashboardIndicator[] = [
  { iconClass: 'fas fa-receipt', label: 'Pedidos de hoy', sourceIndicator: 'Eficiencia de venta' },
  {
    iconClass: 'fas fa-circle-check',
    label: 'Pedidos sin incidencias',
    sourceIndicator: 'Tasa de pedidos digitales atendidos correctamente',
  },
  {
    iconClass: 'fas fa-stopwatch',
    label: 'Tiempo promedio de atención',
    sourceIndicator: 'Tiempo promedio de atención del pedido online',
  },
  {
    iconClass: 'fas fa-triangle-exclamation',
    label: 'Productos bajo el mínimo',
    sourceIndicator: 'Cumplimiento del plan de abastecimiento',
  },
];

@Component({
  selector: 'app-admin-dashboard-page',
  templateUrl: './admin-dashboard-page.html',
  styleUrl: './admin-dashboard-page.css',
})
export class AdminDashboardPage {
  private readonly authService = inject(AuthService);
  private readonly branchSelection = inject(BranchSelectionService);

  readonly dashboardIndicators = DASHBOARD_INDICATORS;
  readonly administratorName = computed(() => this.authService.currentSession()?.displayName ?? '');
  readonly selectedBranchName = computed(
    () => this.branchSelection.selectedBranch()?.name ?? 'Todas las sucursales',
  );
}
