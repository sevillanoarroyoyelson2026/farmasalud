import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { recordAuditEvent } from '../lib/audit-log';
import { adminAuth, adminFirestore } from '../lib/firebase-admin';
import {
  createErrorResponse,
  createJsonResponse,
  HttpError,
  rejectUnsupportedMethod,
} from '../lib/http-response';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCallerWithRole, parseRequestBody } from '../lib/request-guard';
import {
  firestoreDocumentIdSchema,
  staffRoleSchema,
  strongPasswordSchema,
} from '../lib/validation-schemas';

const FUNCTION_NAME = 'admin-create-staff-user';

const createStaffUserSchema = z
  .object({
    fullName: z.string().trim().min(3).max(80),
    email: z.string().trim().toLowerCase().email().max(120),
    temporaryPassword: strongPasswordSchema,
    role: staffRoleSchema,
    branchId: firestoreDocumentIdSchema.nullable(),
  })
  .strict()
  .refine((staffUser) => staffUser.role !== 'worker' || staffUser.branchId !== null, {
    message: 'Un trabajador debe tener sucursal asignada',
    path: ['branchId'],
  });

/**
 * El administrador crea cuentas de personal (admin o trabajador).
 * El rol y la sucursal se guardan en los custom claims del token, que es lo que
 * revisan las reglas de Firestore y el resto de functions.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const administrator = await authenticateCallerWithRole(requestEvent, ['admin']);
    await enforceRateLimit(`${FUNCTION_NAME}:${administrator.uid}`, 20, 600);
    const staffUserRequest = parseRequestBody(requestEvent, createStaffUserSchema);

    if (staffUserRequest.branchId) {
      const branchSnapshot = await adminFirestore.collection('branches').doc(staffUserRequest.branchId).get();
      if (!branchSnapshot.exists) {
        throw new HttpError(400, 'La sucursal indicada no existe.');
      }
    }

    let createdUserUid: string;
    try {
      const createdUser = await adminAuth.createUser({
        email: staffUserRequest.email,
        password: staffUserRequest.temporaryPassword,
        displayName: staffUserRequest.fullName,
      });
      createdUserUid = createdUser.uid;
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/email-already-exists') {
        throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
      }
      throw error;
    }

    const assignedBranchId = staffUserRequest.role === 'worker' ? staffUserRequest.branchId : null;
    await adminAuth.setCustomUserClaims(createdUserUid, {
      role: staffUserRequest.role,
      branchId: assignedBranchId,
    });

    await adminFirestore.collection('users').doc(createdUserUid).set({
      email: staffUserRequest.email,
      fullName: staffUserRequest.fullName,
      phone: null,
      role: staffUserRequest.role,
      branchId: assignedBranchId,
      isDisabled: false,
      signInProvider: 'password',
      createdByUid: administrator.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await recordAuditEvent({
      action: 'user.created',
      performedByUid: administrator.uid,
      targetType: 'user',
      targetId: createdUserUid,
      details: { role: staffUserRequest.role, branchId: assignedBranchId },
    });

    return createJsonResponse(requestEvent, 201, { uid: createdUserUid });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
