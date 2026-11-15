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
import { firestoreDocumentIdSchema, userRoleSchema } from '../lib/validation-schemas';

const FUNCTION_NAME = 'admin-update-user-access';

const updateUserAccessSchema = z
  .object({
    targetUid: z.string().trim().min(1).max(128),
    role: userRoleSchema,
    branchId: firestoreDocumentIdSchema.nullable(),
    isDisabled: z.boolean(),
  })
  .strict()
  .refine((accessChange) => accessChange.role !== 'worker' || accessChange.branchId !== null, {
    message: 'Un trabajador debe tener sucursal asignada',
    path: ['branchId'],
  });

/**
 * Cambia rol, sucursal o estado (habilitado/deshabilitado) de un usuario.
 * Después revoca sus tokens: la sesión anterior deja de servir de inmediato,
 * así un trabajador despedido o degradado no conserva permisos.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const administrator = await authenticateCallerWithRole(requestEvent, ['admin']);
    await enforceRateLimit(`${FUNCTION_NAME}:${administrator.uid}`, 30, 600);
    const accessChange = parseRequestBody(requestEvent, updateUserAccessSchema);

    if (accessChange.targetUid === administrator.uid) {
      throw new HttpError(400, 'No puedes cambiar tu propio acceso. Pide a otro administrador.');
    }

    const userProfileReference = adminFirestore.collection('users').doc(accessChange.targetUid);
    const userProfileSnapshot = await userProfileReference.get();
    if (!userProfileSnapshot.exists) {
      throw new HttpError(404, 'El usuario no existe.');
    }

    if (accessChange.branchId) {
      const branchSnapshot = await adminFirestore.collection('branches').doc(accessChange.branchId).get();
      if (!branchSnapshot.exists) {
        throw new HttpError(400, 'La sucursal indicada no existe.');
      }
    }

    const assignedBranchId = accessChange.role === 'worker' ? accessChange.branchId : null;
    const previousRole = userProfileSnapshot.get('role') as string;

    await adminAuth.updateUser(accessChange.targetUid, { disabled: accessChange.isDisabled });
    await adminAuth.setCustomUserClaims(accessChange.targetUid, {
      role: accessChange.role,
      branchId: assignedBranchId,
    });
    await adminAuth.revokeRefreshTokens(accessChange.targetUid);

    await userProfileReference.update({
      role: accessChange.role,
      branchId: assignedBranchId,
      isDisabled: accessChange.isDisabled,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await recordAuditEvent({
      action: 'user.access_updated',
      performedByUid: administrator.uid,
      targetType: 'user',
      targetId: accessChange.targetUid,
      details: {
        previousRole,
        newRole: accessChange.role,
        branchId: assignedBranchId,
        isDisabled: accessChange.isDisabled,
      },
    });

    return createJsonResponse(requestEvent, 200, { isUpdated: true });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
