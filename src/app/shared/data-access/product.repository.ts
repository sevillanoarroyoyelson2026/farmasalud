import { inject, Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { firestoreDatabase } from '../../core/firebase/firebase-client';
import {
  readBooleanField,
  readNumberField,
  readStringField,
} from '../../core/firebase/firestore-mappers';
import { ApiClientService } from '../../core/http/api-client.service';
import { Product, ProductFormValue } from '../models/product';

const PRODUCTS_COLLECTION = 'products';

interface SaveProductResponse {
  productId: string;
}

/**
 * Productos del catálogo.
 * - Lectura directa de Firestore (el público solo ve productos activos).
 * - Escritura a través de la function `admin-save-product`, que valida los datos,
 *   protege el stock y deja auditoría de los cambios de precio.
 */
@Injectable({ providedIn: 'root' })
export class ProductRepository {
  private readonly apiClient = inject(ApiClientService);

  async findActiveProducts(): Promise<Product[]> {
    const activeProductsQuery = query(
      collection(firestoreDatabase, PRODUCTS_COLLECTION),
      where('isActive', '==', true),
    );
    const productsSnapshot = await getDocs(activeProductsQuery);
    return this.sortProductsByName(
      productsSnapshot.docs.map((productDocument) =>
        this.mapDocumentToProduct(productDocument.id, productDocument.data()),
      ),
    );
  }

  /** Incluye productos inactivos: solo lo puede leer el personal. */
  async findAllProducts(): Promise<Product[]> {
    const productsSnapshot = await getDocs(collection(firestoreDatabase, PRODUCTS_COLLECTION));
    return this.sortProductsByName(
      productsSnapshot.docs.map((productDocument) =>
        this.mapDocumentToProduct(productDocument.id, productDocument.data()),
      ),
    );
  }

  /** Devuelve null si no existe o si el visitante no tiene permiso (producto inactivo). */
  async findProductById(productId: string): Promise<Product | null> {
    try {
      const productSnapshot = await getDoc(doc(firestoreDatabase, PRODUCTS_COLLECTION, productId));
      return productSnapshot.exists()
        ? this.mapDocumentToProduct(productSnapshot.id, productSnapshot.data())
        : null;
    } catch {
      return null;
    }
  }

  async saveProduct(productId: string | null, productFormValue: ProductFormValue): Promise<string> {
    const saveResponse = await this.apiClient.postJson<SaveProductResponse>('admin-save-product', {
      productId,
      ...productFormValue,
    });
    return saveResponse.productId;
  }

  private sortProductsByName(products: Product[]): Product[] {
    return products.sort((firstProduct, secondProduct) =>
      firstProduct.name.localeCompare(secondProduct.name, 'es'),
    );
  }

  private mapDocumentToProduct(productId: string, productFields: DocumentData): Product {
    return {
      id: productId,
      name: readStringField(productFields, 'name'),
      genericName: readStringField(productFields, 'genericName'),
      presentation: readStringField(productFields, 'presentation'),
      laboratory: readStringField(productFields, 'laboratory'),
      description: readStringField(productFields, 'description'),
      categoryId: readStringField(productFields, 'categoryId'),
      price: readNumberField(productFields, 'price'),
      requiresPrescription: readBooleanField(productFields, 'requiresPrescription', false),
      imageUrl: readStringField(productFields, 'imageUrl'),
      isActive: readBooleanField(productFields, 'isActive', true),
      minimumStock: readNumberField(productFields, 'minimumStock'),
      stockByBranch: this.readStockByBranch(productFields['stockByBranch']),
    };
  }

  private readStockByBranch(stockByBranchField: unknown): Record<string, number> {
    if (!stockByBranchField || typeof stockByBranchField !== 'object') {
      return {};
    }
    const stockByBranch: Record<string, number> = {};
    for (const [branchId, availableUnits] of Object.entries(stockByBranchField)) {
      if (typeof availableUnits === 'number' && Number.isFinite(availableUnits)) {
        stockByBranch[branchId] = availableUnits;
      }
    }
    return stockByBranch;
  }
}
