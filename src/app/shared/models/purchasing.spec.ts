import { describe, expect, it } from 'vitest';
import { evaluateSupplierOffers, getPendingUnits, Quotation } from './purchasing';

const sampleQuotation: Quotation = {
  id: 'cotizacion-1',
  title: 'Reposición analgésicos',
  branchId: 'el-bosque',
  requestedItems: [
    { productId: 'paracetamol', productName: 'Paracetamol', quantity: 100 },
    { productId: 'ibuprofeno', productName: 'Ibuprofeno', quantity: 50 },
  ],
  supplierOffers: [
    { supplierId: 'a', supplierName: 'Droguería A', deliveryDays: 5, paymentTerms: '', unitPriceByProduct: { paracetamol: 0.5, ibuprofeno: 1 } },
    { supplierId: 'b', supplierName: 'Droguería B', deliveryDays: 2, paymentTerms: '', unitPriceByProduct: { paracetamol: 0.5, ibuprofeno: 1 } },
    { supplierId: 'c', supplierName: 'Droguería C', deliveryDays: 1, paymentTerms: '', unitPriceByProduct: { paracetamol: 0.1 } },
  ],
  status: 'open',
  awardedSupplierId: null,
  purchaseOrderId: null,
  createdAt: null,
};

describe('comparación de cotizaciones', () => {
  it('descarta ofertas incompletas y desempata por menor plazo de entrega', () => {
    const evaluatedOffers = evaluateSupplierOffers(sampleQuotation);
    expect(evaluatedOffers.map((evaluation) => evaluation.offerTotal)).toEqual([100, 100, null]);
    expect(evaluatedOffers.find((evaluation) => evaluation.isBestOffer)?.offer.supplierId).toBe('b');
  });
});

describe('unidades pendientes de una orden de compra', () => {
  it('descuenta lo recibido y lo rechazado', () => {
    expect(
      getPendingUnits({
        productId: 'p',
        productName: 'P',
        presentation: '',
        quantityOrdered: 100,
        quantityReceived: 60,
        quantityRejected: 5,
        unitCost: 1,
        subtotal: 100,
      }),
    ).toBe(35);
  });
});
