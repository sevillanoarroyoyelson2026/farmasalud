import { Timestamp } from 'firebase/firestore';

/**
 * Conversión de fechas de Firestore en un solo lugar.
 * Firestore devuelve `Timestamp`; la app trabaja con `Date`.
 */
export function convertFirestoreValueToDate(firestoreValue: unknown): Date | null {
  if (firestoreValue instanceof Timestamp) {
    return firestoreValue.toDate();
  }
  if (firestoreValue instanceof Date) {
    return firestoreValue;
  }
  if (typeof firestoreValue === 'string' || typeof firestoreValue === 'number') {
    const parsedDate = new Date(firestoreValue);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }
  return null;
}

export function readStringField(documentFields: Record<string, unknown>, fieldName: string): string {
  const fieldValue = documentFields[fieldName];
  return typeof fieldValue === 'string' ? fieldValue : '';
}

export function readNumberField(documentFields: Record<string, unknown>, fieldName: string): number {
  const fieldValue = documentFields[fieldName];
  return typeof fieldValue === 'number' && Number.isFinite(fieldValue) ? fieldValue : 0;
}

export function readBooleanField(
  documentFields: Record<string, unknown>,
  fieldName: string,
  defaultValue: boolean,
): boolean {
  const fieldValue = documentFields[fieldName];
  return typeof fieldValue === 'boolean' ? fieldValue : defaultValue;
}
