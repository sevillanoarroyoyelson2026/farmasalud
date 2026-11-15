import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { PurchasingRepository } from '../../../shared/data-access/purchasing.repository';
import { Supplier, SupplierFormValue } from '../../../shared/models/purchasing';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { normalizeTextForSearch } from '../../../shared/utils/text-normalization';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

/** Registro de proveedores y distribuidores (procedimiento O01.02). */
@Component({
  selector: 'app-admin-suppliers-page',
  imports: [ReactiveFormsModule, DialogPanel],
  templateUrl: './admin-suppliers-page.html',
})
export class AdminSuppliersPage implements OnInit {
  private readonly purchasingRepository = inject(PurchasingRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly formBuilder = inject(FormBuilder);

  readonly suppliers = signal<Supplier[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly searchText = signal('');
  readonly isDialogOpen = signal(false);
  readonly editingSupplierId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');

  readonly visibleSuppliers = computed(() => {
    const normalizedSearch = normalizeTextForSearch(this.searchText());
    return this.suppliers().filter((supplier) =>
      normalizeTextForSearch(`${supplier.name} ${supplier.ruc} ${supplier.contactName}`).includes(normalizedSearch),
    );
  });

  readonly supplierForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    ruc: ['', [Validators.required, Validators.pattern(/^(10|20)\d{9}$/)]],
    contactName: ['', [Validators.maxLength(80)]],
    phone: ['', [Validators.maxLength(20), Validators.pattern(/^[0-9 +-]*$/)]],
    email: ['', [Validators.email, Validators.maxLength(120)]],
    address: ['', [Validators.maxLength(160)]],
    paymentTerms: ['Contado', [Validators.maxLength(80)]],
    deliveryDays: [3, [Validators.required, Validators.min(0), Validators.max(120), Validators.pattern(/^\d+$/)]],
    isActive: [true],
  });

  async ngOnInit(): Promise<void> {
    await this.loadSuppliers();
  }

  updateSearchText(inputEvent: Event): void {
    this.searchText.set((inputEvent.target as HTMLInputElement).value);
  }

  openNewSupplierDialog(): void {
    this.editingSupplierId.set(null);
    this.supplierForm.reset();
    this.supplierForm.controls.ruc.enable();
    this.openDialog();
  }

  openEditSupplierDialog(supplier: Supplier): void {
    this.editingSupplierId.set(supplier.id);
    const { id: _supplierId, ...supplierFormValue } = supplier;
    this.supplierForm.reset(supplierFormValue);
    // El RUC es el identificador del proveedor: no se cambia.
    this.supplierForm.controls.ruc.disable();
    this.openDialog();
  }

  closeDialog(): void {
    this.isDialogOpen.set(false);
  }

  hasFieldError(fieldName: keyof typeof this.supplierForm.controls): boolean {
    const formControl = this.supplierForm.controls[fieldName];
    return formControl.invalid && formControl.touched;
  }

  async saveSupplier(): Promise<void> {
    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    const formValue = this.supplierForm.getRawValue();
    const supplierFormValue: SupplierFormValue = {
      ...formValue,
      name: formValue.name.trim(),
      email: formValue.email.trim().toLowerCase(),
      deliveryDays: Number(formValue.deliveryDays),
    };
    try {
      const editingSupplierId = this.editingSupplierId();
      if (editingSupplierId) {
        await this.purchasingRepository.updateSupplier(editingSupplierId, supplierFormValue);
      } else {
        await this.purchasingRepository.createSupplier(supplierFormValue);
      }
      this.closeDialog();
      await this.loadSuppliers();
    } catch (error) {
      this.logger.logError('AdminSuppliersPage.saveSupplier', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudo guardar el proveedor.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  private openDialog(): void {
    this.saveErrorMessage.set('');
    this.isDialogOpen.set(true);
  }

  private async loadSuppliers(): Promise<void> {
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    try {
      this.suppliers.set(await this.purchasingRepository.findAllSuppliers());
    } catch (error) {
      this.logger.logError('AdminSuppliersPage.loadSuppliers', error);
      this.loadErrorMessage.set('No se pudieron cargar los proveedores.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
