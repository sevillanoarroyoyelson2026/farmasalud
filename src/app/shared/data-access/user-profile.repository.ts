import { inject, Injectable } from '@angular/core';
import { collection, getDocs, query, where, type DocumentData } from 'firebase/firestore';
import { isKnownUserRole } from '../../core/auth/user-role';
import { firestoreDatabase } from '../../core/firebase/firebase-client';
import {
  convertFirestoreValueToDate,
  readBooleanField,
  readStringField,
} from '../../core/firebase/firestore-mappers';
import { ApiClientService } from '../../core/http/api-client.service';
import {
  CreateStaffUserRequest,
  UpdateUserAccessRequest,
  UserProfile,
} from '../models/user-profile';

const USERS_COLLECTION = 'users';

/**
 * Perfiles de usuario para el panel de administración.
 * La lectura la permiten las reglas solo al admin; crear personal y cambiar roles
 * pasa siempre por functions (son las únicas que tocan los custom claims).
 */
@Injectable({ providedIn: 'root' })
export class UserProfileRepository {
  private readonly apiClient = inject(ApiClientService);

  async findStaffUsers(): Promise<UserProfile[]> {
    return this.findUsersWithRoles(['admin', 'worker']);
  }

  async findCustomers(): Promise<UserProfile[]> {
    return this.findUsersWithRoles(['customer']);
  }

  async createStaffUser(staffUserRequest: CreateStaffUserRequest): Promise<void> {
    await this.apiClient.postJson('admin-create-staff-user', staffUserRequest);
  }

  async updateUserAccess(accessChangeRequest: UpdateUserAccessRequest): Promise<void> {
    await this.apiClient.postJson('admin-update-user-access', accessChangeRequest);
  }

  private async findUsersWithRoles(roles: string[]): Promise<UserProfile[]> {
    const usersQuery = query(collection(firestoreDatabase, USERS_COLLECTION), where('role', 'in', roles));
    const usersSnapshot = await getDocs(usersQuery);
    return usersSnapshot.docs
      .map((userDocument) => this.mapDocumentToUserProfile(userDocument.id, userDocument.data()))
      .filter((userProfile): userProfile is UserProfile => userProfile !== null)
      .sort((firstUser, secondUser) => firstUser.fullName.localeCompare(secondUser.fullName, 'es'));
  }

  private mapDocumentToUserProfile(uid: string, userFields: DocumentData): UserProfile | null {
    const storedRole = userFields['role'];
    if (!isKnownUserRole(storedRole)) {
      return null;
    }
    const storedPhone = userFields['phone'];
    const storedBranchId = userFields['branchId'];
    return {
      uid,
      email: readStringField(userFields, 'email'),
      fullName: readStringField(userFields, 'fullName'),
      phone: typeof storedPhone === 'string' && storedPhone ? storedPhone : null,
      role: storedRole,
      branchId: typeof storedBranchId === 'string' && storedBranchId ? storedBranchId : null,
      isDisabled: readBooleanField(userFields, 'isDisabled', false),
      createdAt: convertFirestoreValueToDate(userFields['createdAt']),
    };
  }
}
