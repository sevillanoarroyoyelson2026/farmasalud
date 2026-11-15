import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CartService, MAXIMUM_UNITS_PER_PRODUCT } from './cart.service';

/** Almacenamiento en memoria: el entorno de pruebas no siempre trae localStorage. */
function createInMemoryStorage(): Storage {
  const storedValues = new Map<string, string>();
  return {
    get length() {
      return storedValues.size;
    },
    clear: () => storedValues.clear(),
    getItem: (storageKey) => storedValues.get(storageKey) ?? null,
    key: (keyIndex) => [...storedValues.keys()][keyIndex] ?? null,
    removeItem: (storageKey) => storedValues.delete(storageKey),
    setItem: (storageKey, storedValue) => storedValues.set(storageKey, String(storedValue)),
  };
}

describe('CartService', () => {
  beforeEach(() => vi.stubGlobal('localStorage', createInMemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('suma unidades del mismo producto en una sola línea', () => {
    const cartService = new CartService();
    cartService.addProduct('paracetamol');
    cartService.addProduct('paracetamol', 2);
    expect(cartService.cartLines()).toEqual([{ productId: 'paracetamol', quantity: 3 }]);
    expect(cartService.totalUnits()).toBe(3);
  });

  it('no permite pasar el máximo por producto ni cantidades negativas', () => {
    const cartService = new CartService();
    cartService.setProductQuantity('ibuprofeno', 999);
    expect(cartService.getQuantityOf('ibuprofeno')).toBe(MAXIMUM_UNITS_PER_PRODUCT);
    cartService.setProductQuantity('ibuprofeno', -3);
    expect(cartService.isEmpty()).toBe(true);
  });

  it('descarta datos manipulados guardados en el navegador', () => {
    localStorage.setItem(
      'farmasalud.cart',
      JSON.stringify([{ productId: '../hack', quantity: 1 }, { productId: 'ok', quantity: 2.5 }, { productId: 'bien', quantity: 2 }]),
    );
    expect(new CartService().cartLines()).toEqual([{ productId: 'bien', quantity: 2 }]);
  });
});
