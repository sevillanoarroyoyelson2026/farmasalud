import { UserRole } from '../../core/auth/user-role';

/** Perfil guardado en `users/{uid}`. El rol real está en los custom claims; esto es su reflejo. */
export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  branchId: string | null;
  isDisabled: boolean;
  createdAt: Date | null;
}

export interface CreateStaffUserRequest {
  fullName: string;
  email: string;
  temporaryPassword: string;
  role: 'admin' | 'worker';
  branchId: string | null;
}

export interface UpdateUserAccessRequest {
  targetUid: string;
  role: UserRole;
  branchId: string | null;
  isDisabled: boolean;
}
