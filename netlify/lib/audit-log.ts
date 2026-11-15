import { FieldValue } from 'firebase-admin/firestore';
import { adminFirestore } from './firebase-admin';

const AUDIT_LOGS_COLLECTION = 'audit_logs';

export type AuditAction =
  | 'user.created'
  | 'user.access_updated'
  | 'customer.profile_created'
  | 'stock.adjusted'
  | 'stock.lot_registered'
  | 'product.created'
  | 'purchase_order.approved'
  | 'purchase_order.cancelled'
  | 'purchase_order.received'
  | 'prescription.validated'
  | 'order.cancelled'
  | 'product.price_changed';

export interface AuditEvent {
  action: AuditAction;
  performedByUid: string;
  targetType: string;
  targetId: string;
  /** Solo datos necesarios para la trazabilidad: nunca contraseñas, tokens ni recetas. */
  details: Record<string, unknown>;
}

/** Registro inmutable de acciones sensibles (solo el admin puede leerlo; nadie lo edita). */
export async function recordAuditEvent(auditEvent: AuditEvent): Promise<void> {
  await adminFirestore.collection(AUDIT_LOGS_COLLECTION).add({
    ...auditEvent,
    createdAt: FieldValue.serverTimestamp(),
  });
}
