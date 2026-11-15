import { inject, Injectable } from '@angular/core';
import { collection, getDocs, query, where, type QueryConstraint } from 'firebase/firestore';
import { firestoreDatabase } from '../../core/firebase/firebase-client';
import {
  convertFirestoreValueToDate,
  readNumberField,
  readStringField,
} from '../../core/firebase/firestore-mappers';
import { ApiClientService } from '../../core/http/api-client.service';
import { RegisterStockLotRequest, StockLot } from '../models/stock-lot';

/**
 * Lotes por sucursal. Solo lectura desde el navegador (el trabajador únicamente de su
 * sucursal); los ingresos se registran con la function `register-stock-lot`, que
 * actualiza lote, stock del producto y movimiento en una sola transacción.
 */
@Injectable({ providedIn: 'root' })
export class StockLotRepository {
  private readonly apiClient = inject(ApiClientService);

  /** `branchId` vacío = todas las sucursales (solo admin). Ordenado por vencimiento (FEFO). */
  async findLotsOfProduct(productId: string, branchId: string): Promise<StockLot[]> {
    const branchFilter: QueryConstraint[] = branchId ? [where('branchId', '==', branchId)] : [];
    const lotsQuery = query(collection(firestoreDatabase, 'products', productId, 'lots'), ...branchFilter);
    const lotsSnapshot = await getDocs(lotsQuery);
    return lotsSnapshot.docs
      .map((lotDocument): StockLot => {
        const lotFields = lotDocument.data();
        return {
          id: lotDocument.id,
          branchId: readStringField(lotFields, 'branchId'),
          lotNumber: readStringField(lotFields, 'lotNumber'),
          expirationDate: convertFirestoreValueToDate(lotFields['expirationDate']),
          quantityAvailable: readNumberField(lotFields, 'quantityAvailable'),
          quantityReceived: readNumberField(lotFields, 'quantityReceived'),
        };
      })
      .sort(
        (firstLot, secondLot) =>
          (firstLot.expirationDate?.getTime() ?? Infinity) - (secondLot.expirationDate?.getTime() ?? Infinity),
      );
  }

  async registerStockLot(stockLotRequest: RegisterStockLotRequest): Promise<void> {
    await this.apiClient.postJson('register-stock-lot', stockLotRequest);
  }
}
