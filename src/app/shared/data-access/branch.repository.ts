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
import { Branch } from '../models/branch';
import { createSlugFromText } from '../utils/text-normalization';

const BRANCHES_COLLECTION = 'branches';

export type BranchFormValue = Omit<Branch, 'id'>;

/**
 * Lectura y escritura de sucursales. Solo el admin escribe (lo exigen las reglas de Firestore).
 * El id del documento es legible (`el-bosque`) porque los trabajadores lo llevan en su token.
 */
@Injectable({ providedIn: 'root' })
export class BranchRepository {
  async findAllBranches(): Promise<Branch[]> {
    const branchesSnapshot = await getDocs(collection(firestoreDatabase, BRANCHES_COLLECTION));
    return branchesSnapshot.docs
      .map((branchDocument) => this.mapDocumentToBranch(branchDocument.id, branchDocument.data()))
      .sort((firstBranch, secondBranch) => firstBranch.name.localeCompare(secondBranch.name, 'es'));
  }

  async findActiveBranches(): Promise<Branch[]> {
    const allBranches = await this.findAllBranches();
    return allBranches.filter((branch) => branch.isActive);
  }

  /** Crea la sucursal con id derivado del nombre. Devuelve el id asignado. */
  async createBranch(branchFormValue: BranchFormValue): Promise<string> {
    const newBranchId = createSlugFromText(branchFormValue.name);
    if (!newBranchId) {
      throw new Error('El nombre de la sucursal no es válido.');
    }
    const branchReference = doc(firestoreDatabase, BRANCHES_COLLECTION, newBranchId);
    const existingBranch = await getDoc(branchReference);
    if (existingBranch.exists()) {
      throw new Error('Ya existe una sucursal con ese nombre.');
    }
    await setDoc(branchReference, {
      ...branchFormValue,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newBranchId;
  }

  async updateBranch(branchId: string, branchFormValue: BranchFormValue): Promise<void> {
    await updateDoc(doc(firestoreDatabase, BRANCHES_COLLECTION, branchId), {
      ...branchFormValue,
      updatedAt: serverTimestamp(),
    });
  }

  private mapDocumentToBranch(branchId: string, branchFields: DocumentData): Branch {
    return {
      id: branchId,
      name: readStringField(branchFields, 'name'),
      address: readStringField(branchFields, 'address'),
      district: readStringField(branchFields, 'district'),
      phone: readStringField(branchFields, 'phone'),
      isActive: readBooleanField(branchFields, 'isActive', true),
      offersDelivery: readBooleanField(branchFields, 'offersDelivery', true),
    };
  }
}
