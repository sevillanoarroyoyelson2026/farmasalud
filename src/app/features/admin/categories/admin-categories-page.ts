import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { CategoryRepository } from '../../../shared/data-access/category.repository';
import { Category, CategoryFormValue } from '../../../shared/models/category';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

/** Categorías del catálogo. Una categoría inactiva desaparece de los filtros de la tienda. */
@Component({
  selector: 'app-admin-categories-page',
  imports: [ReactiveFormsModule, DialogPanel],
  templateUrl: './admin-categories-page.html',
})
export class AdminCategoriesPage implements OnInit {
  private readonly categoryRepository = inject(CategoryRepository);
  private readonly logger = inject(AppLoggerService);
  private readonly formBuilder = inject(FormBuilder);

  readonly categories = signal<Category[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly isDialogOpen = signal(false);
  readonly editingCategoryId = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');

  readonly categoryForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    description: ['', [Validators.maxLength(200)]],
    isActive: [true],
  });

  async ngOnInit(): Promise<void> {
    await this.loadCategories();
  }

  openNewCategoryDialog(): void {
    this.editingCategoryId.set(null);
    this.categoryForm.reset();
    this.openDialog();
  }

  openEditCategoryDialog(category: Category): void {
    this.editingCategoryId.set(category.id);
    const { id: _categoryId, ...categoryFormValue } = category;
    this.categoryForm.reset(categoryFormValue);
    this.openDialog();
  }

  closeDialog(): void {
    this.isDialogOpen.set(false);
  }

  async saveCategory(): Promise<void> {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    const categoryFormValue: CategoryFormValue = this.categoryForm.getRawValue();
    try {
      const editingCategoryId = this.editingCategoryId();
      if (editingCategoryId) {
        await this.categoryRepository.updateCategory(editingCategoryId, categoryFormValue);
      } else {
        await this.categoryRepository.createCategory(categoryFormValue);
      }
      this.closeDialog();
      await this.loadCategories();
    } catch (error) {
      this.logger.logError('AdminCategoriesPage.saveCategory', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudo guardar la categoría.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  hasFieldError(fieldName: keyof typeof this.categoryForm.controls): boolean {
    const formControl = this.categoryForm.controls[fieldName];
    return formControl.invalid && formControl.touched;
  }

  private openDialog(): void {
    this.saveErrorMessage.set('');
    this.isDialogOpen.set(true);
  }

  private async loadCategories(): Promise<void> {
    this.isLoading.set(true);
    this.loadErrorMessage.set('');
    try {
      this.categories.set(await this.categoryRepository.findAllCategories());
    } catch (error) {
      this.logger.logError('AdminCategoriesPage.loadCategories', error);
      this.loadErrorMessage.set('No se pudieron cargar las categorías.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
