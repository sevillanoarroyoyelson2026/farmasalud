/** Producto del catálogo. El stock se guarda por sucursal y SOLO lo modifica el servidor. */
export interface Product {
  id: string;
  name: string;
  /** Principio activo (DCI), p. ej. "Paracetamol". */
  genericName: string;
  /** Forma y contenido, p. ej. "Caja x 100 tabletas de 500 mg". */
  presentation: string;
  laboratory: string;
  description: string;
  categoryId: string;
  price: number;
  requiresPrescription: boolean;
  imageUrl: string;
  isActive: boolean;
  /** Stock mínimo por sucursal antes de generar alerta de reposición. */
  minimumStock: number;
  /** Unidades disponibles por sucursal: { 'el-bosque': 25 }. */
  stockByBranch: Record<string, number>;
}

/** Datos que el administrador puede editar (el stock nunca viaja desde el formulario). */
export type ProductFormValue = Omit<Product, 'id' | 'stockByBranch'>;

export type StockStatus = 'out_of_stock' | 'low_stock' | 'available';

const LOW_STOCK_UNITS_FOR_CUSTOMERS = 5;

export function getStockInBranch(product: Product, branchId: string): number {
  return product.stockByBranch[branchId] ?? 0;
}

export function getTotalStock(product: Product, branchIds: string[]): number {
  return branchIds.reduce((totalUnits, branchId) => totalUnits + getStockInBranch(product, branchId), 0);
}

export function countBranchesWithStock(product: Product, branchIds: string[]): number {
  return branchIds.filter((branchId) => getStockInBranch(product, branchId) > 0).length;
}

/** Estado para el panel interno: compara contra el stock mínimo del producto. */
export function getInternalStockStatus(product: Product, availableUnits: number): StockStatus {
  if (availableUnits <= 0) {
    return 'out_of_stock';
  }
  return availableUnits <= product.minimumStock ? 'low_stock' : 'available';
}

/** Estado para el cliente: nunca se muestra la cantidad exacta, solo si quedan pocas. */
export function getCustomerStockStatus(availableUnits: number): StockStatus {
  if (availableUnits <= 0) {
    return 'out_of_stock';
  }
  return availableUnits <= LOW_STOCK_UNITS_FOR_CUSTOMERS ? 'low_stock' : 'available';
}
