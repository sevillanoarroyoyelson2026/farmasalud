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
 * - Sin botica (toda la tienda): disponible si alguna botica activa tiene stock.
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

  // En la tienda no se muestran boticas: basta con saber si hay stock en alguna.
  if (countBranchesWithStock(product, activeBranchIds) === 0) {
    return { stockStatus: 'out_of_stock', availabilityLabel: 'Agotado' };
  }
  return { stockStatus: 'available', availabilityLabel: 'Disponible' };
}
