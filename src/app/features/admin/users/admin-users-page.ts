import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_DISPLAY_NAME, UserRole } from '../../../core/auth/user-role';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { BranchRepository } from '../../../shared/data-access/branch.repository';
import { UserProfileRepository } from '../../../shared/data-access/user-profile.repository';
import { Branch } from '../../../shared/models/branch';
import { UserProfile } from '../../../shared/models/user-profile';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { normalizeTextForSearch } from '../../../shared/utils/text-normalization';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';
import { passwordStrengthValidator } from '../../../shared/validators/password-strength.validator';

type UsersTab = 'staff' | 'customers';

/**
 * Usuarios del sistema. El personal (admin y trabajador) se crea aquí; los clientes
 * se registran solos en la tienda. Los cambios de rol revocan la sesión del usuario.
 */
@Component({
  selector: 'app-admin-users-page',
  imports: [ReactiveFormsModule, DialogPanel, DatePipe],
  templateUrl: './admin-users-page.html',
})
export class AdminUsersPage implements OnInit {
  private readonly userProfileRepository = inject(UserProfileRepository);
  private readonly branchRepository = inject(BranchRepository);
  private readonly authService = inject(AuthService);
  private readonly logger = inject(AppLoggerService);
  private readonly formBuilder = inject(FormBuilder);

  readonly roleDisplayName = ROLE_DISPLAY_NAME;
  readonly activeTab = signal<UsersTab>('staff');
  readonly staffUsers = signal<UserProfile[]>([]);
  readonly customers = signal<UserProfile[]>([]);
  readonly branches = signal<Branch[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly searchText = signal('');

  readonly isCreateDialogOpen = signal(false);
  readonly editingUser = signal<UserProfile | null>(null);
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');

  readonly currentAdministratorUid = computed(() => this.authService.currentSession()?.uid ?? '');
  readonly branchNameById = computed(() => new Map(this.branches().map((branch) => [branch.id, branch.name])));
  readonly visibleUsers = computed(() => {
    const listedUsers = this.activeTab() === 'staff' ? this.staffUsers() : this.customers();
    const normalizedSearch = normalizeTextForSearch(this.searchText());
    return listedUsers.filter((userProfile) =>
      normalizeTextForSearch(`${userProfile.fullName} ${userProfile.email}`).includes(normalizedSearch),
    );
  });

  readonly createStaffForm = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(120)]],
    temporaryPassword: ['', [Validators.required, passwordStrengthValidator]],
    role: ['worker' as 'admin' | 'worker', [Validators.required]],
    branchId: [''],
  });

  readonly accessForm = this.formBuilder.nonNullable.group({
    role: ['worker' as UserRole, [Validators.required]],
    branchId: [''],
    isDisabled: [false],
  });

  async ngOnInit(): Promise<void> {
    await this.loadUsers();
  }

  selectTab(selectedTab: UsersTab): void {
    this.activeTab.set(selectedTab);
  }

  updateSearchText(inputEvent: Event): void {
    this.searchText.set((inputEvent.target as HTMLInputElement).value);
  }

  describeBranch(branchId: string | null): string {
    if (!branchId) {
      return '—';
    }
    return this.branchNameById().get(branchId) ?? branchId;
  }

  openCreateStaffDialog(): void {
    this.createStaffForm.reset();
    this.saveErrorMessage.set('');
    this.isCreateDialogOpen.set(true);
  }

  openEditAccessDialog(userProfile: UserProfile): void {
    this.accessForm.reset({
      role: userProfile.role,
      branchId: userProfile.branchId ?? '',
      isDisabled: userProfile.isDisabled,
    });
    this.saveErrorMessage.set('');
    this.editingUser.set(userProfile);
  }

  closeDialogs(): void {
    this.isCreateDialogOpen.set(false);
    this.editingUser.set(null);
  }

  async createStaffUser(): Promise<void> {
    const formValue = this.createStaffForm.getRawValue();
    if (this.createStaffForm.invalid || this.isMissingRequiredBranch(formValue.role, formValue.branchId)) {
      this.createStaffForm.markAllAsTouched();
      return;
    }
    await this.runSave(() =>
      this.userProfileRepository.createStaffUser({
        ...formValue,
        email: formValue.email.trim().toLowerCase(),
        branchId: formValue.role === 'worker' ? formValue.branchId : null,
      }),
    );
  }

  async updateUserAccess(): Promise<void> {
    const userBeingEdited = this.editingUser();
    const formValue = this.accessForm.getRawValue();
    if (!userBeingEdited || this.isMissingRequiredBranch(formValue.role, formValue.branchId)) {
      this.accessForm.markAllAsTouched();
      return;
    }
    await this.runSave(() =>
      this.userProfileRepository.updateUserAccess({
        targetUid: userBeingEdited.uid,
        role: formValue.role,
        branchId: formValue.role === 'worker' ? formValue.branchId : null,
        isDisabled: formValue.isDisabled,
      }),
    );
  }

  isMissingRequiredBranch(role: UserRole, branchId: string): boolean {
    return role === 'worker' && !branchId;
  }

  hasCreateFieldError(fieldName: keyof typeof this.createStaffForm.controls): boolean {
    const formControl = this.createStaffForm.controls[fieldName];
    return formControl.invalid && formControl.touched;
  }

  private async runSave(saveOperation: () => Promise<void>): Promise<void> {
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    try {
      await saveOperation();
      this.closeDialogs();
      await this.loadUsers();
    } catch (error) {
      this.logger.logError('AdminUsersPage.save', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudieron guardar los cambios.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadUsers(): Promise<void> {
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    try {
      const [loadedStaffUsers, loadedCustomers, loadedBranches] = await Promise.all([
        this.userProfileRepository.findStaffUsers(),
        this.userProfileRepository.findCustomers(),
        this.branchRepository.findAllBranches(),
      ]);
      this.staffUsers.set(loadedStaffUsers);
      this.customers.set(loadedCustomers);
      this.branches.set(loadedBranches);
    } catch (error) {
      this.logger.logError('AdminUsersPage.loadUsers', error);
      this.loadErrorMessage.set('No se pudieron cargar los usuarios.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
