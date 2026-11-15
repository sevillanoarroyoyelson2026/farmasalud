import { describe, expect, it } from 'vitest';
import {
  countBranchesWithStock,
  getCustomerStockStatus,
  getInternalStockStatus,
  getTotalStock,
  Product,
} from './product';

const sampleProduct: Product = {
  id: 'paracetamol-500',
  name: 'Paracetamol 500 mg',
  genericName: 'Paracetamol',
  presentation: 'Caja x 100 tabletas',
  laboratory: 'Genfar',
  description: '',
  categoryId: 'analgesicos',
  price: 12.5,
  requiresPrescription: false,
  imageUrl: '',
  isActive: true,
  minimumStock: 10,
  stockByBranch: { 'el-bosque': 25, 'la-esperanza': 0, 'sucursal-cerrada': 40 },
};

describe('stock del producto', () => {
  it('suma solo las sucursales indicadas', () => {
    expect(getTotalStock(sampleProduct, ['el-bosque', 'la-esperanza'])).toBe(25);
    expect(countBranchesWithStock(sampleProduct, ['el-bosque', 'la-esperanza'])).toBe(1);
  });

  it('marca stock bajo según el mínimo del producto', () => {
    expect(getInternalStockStatus(sampleProduct, 0)).toBe('out_of_stock');
    expect(getInternalStockStatus(sampleProduct, 10)).toBe('low_stock');
    expect(getInternalStockStatus(sampleProduct, 11)).toBe('available');
  });

  it('al cliente solo le avisa cuando quedan pocas unidades', () => {
    expect(getCustomerStockStatus(0)).toBe('out_of_stock');
    expect(getCustomerStockStatus(3)).toBe('low_stock');
    expect(getCustomerStockStatus(30)).toBe('available');
  });
});
