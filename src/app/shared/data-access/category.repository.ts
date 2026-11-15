import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { firestoreDatabase } from '../../core/firebase/firebase-client';
import { readBooleanField, readStringField } from '../../core/firebase/firestore-mappers';
import { Category, CategoryFormValue } from '../models/category';
import { createSlugFromText } from '../utils/text-normalization';

const CATEGORIES_COLLECTION = 'categories';

/** Categorías del catálogo. Lectura pública; escritura solo del admin (reglas de Firestore). */
@Injectable({ providedIn: 'root' })
export class CategoryRepository {
  async findAllCategories(): Promise<Category[]> {
    const categoriesSnapshot = await getDocs(collection(firestoreDatabase, CATEGORIES_COLLECTION));
    return categoriesSnapshot.docs
      .map((categoryDocument) => this.mapDocumentToCategory(categoryDocument.id, categoryDocument.data()))
      .sort((firstCategory, secondCategory) => firstCategory.name.localeCompare(secondCategory.name, 'es'));
  }

  async findActiveCategories(): Promise<Category[]> {
    const allCategories = await this.findAllCategories();
    return allCategories.filter((category) => category.isActive);
  }

  async createCategory(categoryFormValue: CategoryFormValue): Promise<string> {
    const newCategoryId = createSlugFromText(categoryFormValue.name);
    if (!newCategoryId) {
      throw new Error('El nombre de la categoría no es válido.');
    }
    const categoryReference = doc(firestoreDatabase, CATEGORIES_COLLECTION, newCategoryId);
    if ((await getDoc(categoryReference)).exists()) {
      throw new Error('Ya existe una categoría con ese nombre.');
    }
    await setDoc(categoryReference, {
      ...categoryFormValue,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newCategoryId;
  }

  async updateCategory(categoryId: string, categoryFormValue: CategoryFormValue): Promise<void> {
    await updateDoc(doc(firestoreDatabase, CATEGORIES_COLLECTION, categoryId), {
      ...categoryFormValue,
      updatedAt: serverTimestamp(),
    });
  }

  private mapDocumentToCategory(categoryId: string, categoryFields: DocumentData): Category {
    return {
      id: categoryId,
      name: readStringField(categoryFields, 'name'),
      description: readStringField(categoryFields, 'description'),
      isActive: readBooleanField(categoryFields, 'isActive', true),
    };
  }
}
