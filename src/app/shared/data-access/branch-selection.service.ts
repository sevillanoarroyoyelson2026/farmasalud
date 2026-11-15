import { computed, Injectable, signal } from '@angular/core';
import { Branch } from '../models/branch';

const SELECTED_BRANCH_STORAGE_KEY = 'farmasalud.selectedBranchId';
export const ALL_BRANCHES_OPTION = '';

/**
 * Sucursal con la que se está trabajando (patrón BranchSelectionService de Alliker).
 * - Admin: puede elegir cualquier sucursal o "todas".
 * - Trabajador: queda fijo en la sucursal de su token (no puede cambiarla).
 * Guardar el id en localStorage es solo comodidad visual: las reglas de Firestore
 * y las functions filtran por la sucursal real del token.
 */
@Injectable({ providedIn: 'root' })
export class BranchSelectionService {
  private readonly availableBranchesSignal = signal<Branch[]>([]);
  private readonly selectedBranchIdSignal = signal<string>(this.readStoredBranchId());

  readonly availableBranches = this.availableBranchesSignal.asReadonly();
  readonly selectedBranchId = this.selectedBranchIdSignal.asReadonly();
  readonly selectedBranch = computed(
    () =>
      this.availableBranchesSignal().find((branch) => branch.id === this.selectedBranchIdSignal()) ??
      null,
  );

  setAvailableBranches(branches: Branch[]): void {
    this.availableBranchesSignal.set(branches);
    const isStoredBranchStillValid =
      this.selectedBranchIdSignal() === ALL_BRANCHES_OPTION ||
      branches.some((branch) => branch.id === this.selectedBranchIdSignal());
    if (!isStoredBranchStillValid) {
      this.selectBranch(ALL_BRANCHES_OPTION);
    }
  }

  selectBranch(branchId: string): void {
    this.selectedBranchIdSignal.set(branchId);
    try {
      localStorage.setItem(SELECTED_BRANCH_STORAGE_KEY, branchId);
    } catch {
      // Sin almacenamiento disponible: la selección dura solo esta sesión.
    }
  }

  /** El trabajador siempre opera en su sucursal asignada. */
  lockToAssignedBranch(assignedBranchId: string): void {
    this.selectedBranchIdSignal.set(assignedBranchId);
  }

  private readStoredBranchId(): string {
    try {
      return localStorage.getItem(SELECTED_BRANCH_STORAGE_KEY) ?? ALL_BRANCHES_OPTION;
    } catch {
      return ALL_BRANCHES_OPTION;
    }
  }
}
