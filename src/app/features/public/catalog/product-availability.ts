import {
  countBranchesWithStock,
  getCustomerStockStatus,
  getStockInBranch,
  Product,
  StockStatus,
} from '../../../shared/models/product';

export interface ProductAvailability {
  stockStatus: StockStatus;
  /** Texto para el cliente; nunca revela la cantidad exacta en almacén. */
  availabilityLabel: string;
}

/**
 * Disponibilidad que ve el cliente.
 * - Con botica elegida: estado en esa botica.
 * - Sin botica: en cuántas boticas activas hay stock.
 */
export function describeProductAvailability(
  product: Product,
  selectedBranchId: string,
  activeBranchIds: string[],
): ProductAvailability {
  if (selectedBranchId) {
    const stockStatus = getCustomerStockStatus(getStockInBranch(product, selectedBranchId));
    const availabilityLabelByStatus: Record<StockStatus, string> = {
      available: 'Disponible en tu botica',
      low_stock: 'Últimas unidades',
      out_of_stock: 'Agotado en esta botica',
    };
    return { stockStatus, availabilityLabel: availabilityLabelByStatus[stockStatus] };
  }

  const branchesWithStock = countBranchesWithStock(product, activeBranchIds);
  if (branchesWithStock === 0) {
    return { stockStatus: 'out_of_stock', availabilityLabel: 'Agotado' };
  }
  return {
    stockStatus: 'available',
    availabilityLabel: branchesWithStock === 1 ? 'Disponible en 1 botica' : `Disponible en ${branchesWithStock} boticas`,
  };
}
