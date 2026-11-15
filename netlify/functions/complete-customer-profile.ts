import type { Handler } from '@netlify/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { recordAuditEvent } from '../lib/audit-log';
import { adminAuth, adminFirestore } from '../lib/firebase-admin';
import { createErrorResponse, createJsonResponse, rejectUnsupportedMethod } from '../lib/http-response';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCaller, parseRequestBody, type UserRole } from '../lib/request-guard';

const FUNCTION_NAME = 'complete-customer-profile';
const CURRENT_PRIVACY_POLICY_VERSION = '2026-11';

const completeCustomerProfileSchema = z
  .object({
    fullName: z.string().trim().max(80),
    phone: z
      .string()
      .trim()
      .regex(/^9\d{8}$/, 'Celular no válido')
      .nullable(),
    hasAcceptedPrivacyPolicy: z.literal(true),
  })
  .strict();

/**
 * Crea el perfil de un cliente nuevo (registro con correo o primer ingreso con Google)
 * y le asigna el rol `customer` en los custom claims.
 * El navegador NUNCA decide el rol: aquí siempre se asigna `customer`, salvo que el
 * documento ya exista con un rol de personal creado por un administrador.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const authenticatedCaller = await authenticateCaller(requestEvent);
    if (authenticatedCaller.role) {
      return createJsonResponse(requestEvent, 200, { role: authenticatedCaller.role });
    }

    await enforceRateLimit(`${FUNCTION_NAME}:${authenticatedCaller.uid}`, 5, 600);
    const profileRequest = parseRequestBody(requestEvent, completeCustomerProfileSchema);

    const firebaseUser = await adminAuth.getUser(authenticatedCaller.uid);
    const userProfileReference = adminFirestore.collection('users').doc(authenticatedCaller.uid);

    const assignedRole = await adminFirestore.runTransaction(async (transaction) => {
      const existingProfileSnapshot = await transaction.get(userProfileReference);
      const existingRole = existingProfileSnapshot.get('role') as UserRole | undefined;
      if (existingRole) {
        return existingRole;
      }

      transaction.set(userProfileReference, {
        email: firebaseUser.email ?? '',
        fullName: profileRequest.fullName || firebaseUser.displayName || '',
        phone: profileRequest.phone,
        role: 'customer',
        branchId: null,
        isDisabled: false,
        signInProvider: firebaseUser.providerData[0]?.providerId ?? 'password',
        privacyConsent: {
          policyVersion: CURRENT_PRIVACY_POLICY_VERSION,
          acceptedAt: FieldValue.serverTimestamp(),
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return 'customer' as const;
    });

    const existingBranchId = (await userProfileReference.get()).get('branchId') as string | null;
    await adminAuth.setCustomUserClaims(authenticatedCaller.uid, {
      role: assignedRole,
      branchId: assignedRole === 'customer' ? null : existingBranchId,
    });

    if (assignedRole === 'customer') {
      await recordAuditEvent({
        action: 'customer.profile_created',
        performedByUid: authenticatedCaller.uid,
        targetType: 'user',
        targetId: authenticatedCaller.uid,
        details: { privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION },
      });
    }

    return createJsonResponse(requestEvent, 200, { role: assignedRole });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
