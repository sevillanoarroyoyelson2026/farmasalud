/** Categoría del catálogo (Analgésicos, Antibióticos, Cuidado personal…). */
export interface Category {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}

export type CategoryFormValue = Omit<Category, 'id'>;
