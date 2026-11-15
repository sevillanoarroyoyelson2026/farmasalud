import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { BranchFormValue, BranchRepository } from '../../../shared/data-access/branch.repository';
import { BranchSelectionService } from '../../../shared/data-access/branch-selection.service';
import { Branch } from '../../../shared/models/branch';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

/** Gestión de las boticas: alta, edición y activación (no se borran: tienen historial). */
@Component({
  selector: 'app-admin-branches-page',
  imports: [ReactiveFormsModule, DialogPanel],
  templateUrl: './admin-branches-page.html',
})
export class AdminBranchesPage implements OnInit {
  private readonly branchRepository = inject(BranchRepository);
  private readonly branchSelection = inject(BranchSelectionService);
  private readonly logger = inject(AppLoggerService);
  private readonly formBuilder = inject(FormBuilder);

  readonly branches = signal<Branch[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly isDialogOpen = signal(false);
  readonly editingBranchId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');

  readonly branchForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    address: ['', [Validators.required, Validators.maxLength(160)]],
    district: ['', [Validators.required, Validators.maxLength(60)]],
    phone: ['', [Validators.maxLength(20), Validators.pattern(/^[0-9 +-]*$/)]],
    offersDelivery: [true],
    isActive: [true],
  });

  async ngOnInit(): Promise<void> {
    await this.loadBranches();
  }

  openNewBranchDialog(): void {
    this.editingBranchId.set(null);
    this.branchForm.reset();
    this.openDialog();
  }

  openEditBranchDialog(branch: Branch): void {
    this.editingBranchId.set(branch.id);
    const { id: _branchId, ...branchFormValue } = branch;
    this.branchForm.reset(branchFormValue);
    this.openDialog();
  }

  closeDialog(): void {
    this.isDialogOpen.set(false);
  }

  async saveBranch(): Promise<void> {
    if (this.branchForm.invalid) {
      this.branchForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    const branchFormValue: BranchFormValue = this.branchForm.getRawValue();
    try {
      const editingBranchId = this.editingBranchId();
      if (editingBranchId) {
        await this.branchRepository.updateBranch(editingBranchId, branchFormValue);
      } else {
        await this.branchRepository.createBranch(branchFormValue);
      }
      this.closeDialog();
      await this.loadBranches();
    } catch (error) {
      this.logger.logError('AdminBranchesPage.saveBranch', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudo guardar la sucursal.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  hasFieldError(fieldName: keyof typeof this.branchForm.controls): boolean {
    const formControl = this.branchForm.controls[fieldName];
    return formControl.invalid && formControl.touched;
  }

  private openDialog(): void {
    this.saveErrorMessage.set('');
    this.isDialogOpen.set(true);
  }

  private async loadBranches(): Promise<void> {
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    try {
      const loadedBranches = await this.branchRepository.findAllBranches();
      this.branches.set(loadedBranches);
      // El selector del header también debe ver las sucursales nuevas.
      this.branchSelection.setAvailableBranches(loadedBranches);
    } catch (error) {
      this.logger.logError('AdminBranchesPage.loadBranches', error);
      this.loadErrorMessage.set('No se pudieron cargar las sucursales.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
