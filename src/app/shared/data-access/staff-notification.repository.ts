import { Injectable } from '@angular/core';
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestoreDatabase } from '../../core/firebase/firebase-client';
import {
  convertFirestoreValueToDate,
  readNumberField,
  readStringField,
} from '../../core/firebase/firestore-mappers';
import { StaffNotification } from '../models/staff-notification';

const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Notificaciones de stock bajo, en TIEMPO REAL. Solo se leen las activas: cuando el
 * servidor las marca como resueltas, desaparecen solas de la campana.
 * El trabajador siempre filtra por su botica (las reglas no le dejan ver otras).
 */
@Injectable({ providedIn: 'root' })
export class StaffNotificationRepository {
  watchActiveNotifications(
    branchIdFilter: string | null,
    onNotifications: (notifications: StaffNotification[]) => void,
    onError: (error: unknown) => void,
  ): Unsubscribe {
    const branchFilter = branchIdFilter ? [where('branchId', '==', branchIdFilter)] : [];
    const activeNotificationsQuery = query(
      collection(firestoreDatabase, NOTIFICATIONS_COLLECTION),
      where('status', '==', 'active'),
      ...branchFilter,
    );
    return onSnapshot(
      activeNotificationsQuery,
      (notificationsSnapshot) =>
        onNotifications(
          notificationsSnapshot.docs
            .map((notificationDocument) => this.mapDocumentToNotification(notificationDocument.id, notificationDocument.data()))
            .sort((firstNotification, secondNotification) =>
              (secondNotification.createdAt?.getTime() ?? 0) - (firstNotification.createdAt?.getTime() ?? 0),
            ),
        ),
      onError,
    );
  }

  /** Marca la notificación como leída SOLO para quien la abre (las reglas lo exigen así). */
  async markAsRead(notificationId: string, readerUid: string): Promise<void> {
    await updateDoc(doc(firestoreDatabase, NOTIFICATIONS_COLLECTION, notificationId), { readByUids: arrayUnion(readerUid) });
  }

  async markAllAsRead(notificationIds: string[], readerUid: string): Promise<void> {
    const readBatch = writeBatch(firestoreDatabase);
    for (const notificationId of notificationIds) {
      readBatch.update(doc(firestoreDatabase, NOTIFICATIONS_COLLECTION, notificationId), { readByUids: arrayUnion(readerUid) });
    }
    await readBatch.commit();
  }

  private mapDocumentToNotification(notificationId: string, notificationFields: DocumentData): StaffNotification {
    const readByUids = notificationFields['readByUids'];
    return {
      id: notificationId,
      productId: readStringField(notificationFields, 'productId'),
      productName: readStringField(notificationFields, 'productName'),
      presentation: readStringField(notificationFields, 'presentation'),
      branchId: readStringField(notificationFields, 'branchId'),
      branchName: readStringField(notificationFields, 'branchName'),
      availableUnits: readNumberField(notificationFields, 'availableUnits'),
      minimumStock: readNumberField(notificationFields, 'minimumStock'),
      severity: notificationFields['severity'] === 'out_of_stock' ? 'out_of_stock' : 'low_stock',
      readByUids: Array.isArray(readByUids) ? readByUids.filter((uid): uid is string => typeof uid === 'string') : [],
      createdAt: convertFirestoreValueToDate(notificationFields['createdAt']),
    };
  }
}
