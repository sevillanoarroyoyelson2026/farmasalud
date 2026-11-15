import { inject, Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { firestoreDatabase } from '../../core/firebase/firebase-client';
import {
  convertFirestoreValueToDate,
  readNumberField,
  readStringField,
} from '../../core/firebase/firestore-mappers';
import { ApiClientService } from '../../core/http/api-client.service';
import { Claim, ClaimStatus, OrderReview, SubmitClaimRequest } from '../models/customer-service';

/** Libro de reclamaciones y reseñas de pedidos entregados. */
@Injectable({ providedIn: 'root' })
export class CustomerServiceRepository {
  private readonly apiClient = inject(ApiClientService);

  // ------------------------------------------------------------ reclamos
  async submitClaim(claimRequest: SubmitClaimRequest): Promise<{ claimNumber: string }> {
    return this.apiClient.postJson<{ claimNumber: string }>('submit-claim', claimRequest);
  }

  async findCustomerClaims(customerUid: string): Promise<Claim[]> {
    const claimsSnapshot = await getDocs(
      query(collection(firestoreDatabase, 'claims'), where('customerUid', '==', customerUid)),
    );
    return this.sortClaimsByNewest(claimsSnapshot.docs.map((claimDocument) => this.mapDocumentToClaim(claimDocument.id, claimDocument.data())));
  }

  async findAllClaims(): Promise<Claim[]> {
    const claimsSnapshot = await getDocs(collection(firestoreDatabase, 'claims'));
    return this.sortClaimsByNewest(claimsSnapshot.docs.map((claimDocument) => this.mapDocumentToClaim(claimDocument.id, claimDocument.data())));
  }

  async respondToClaim(claimId: string, status: ClaimStatus, response: string, administratorUid: string): Promise<void> {
    await updateDoc(doc(firestoreDatabase, 'claims', claimId), {
      status,
      response,
      respondedByUid: administratorUid,
      respondedAt: status === 'resolved' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
  }

  // ------------------------------------------------------------ reseñas
  async findReviewOfOrder(orderId: string): Promise<OrderReview | null> {
    try {
      const reviewSnapshot = await getDoc(doc(firestoreDatabase, 'reviews', orderId));
      return reviewSnapshot.exists() ? this.mapDocumentToReview(reviewSnapshot.data()) : null;
    } catch {
      return null;
    }
  }

  async createReview(orderId: string, branchId: string, customerUid: string, rating: number, comment: string): Promise<void> {
    await setDoc(doc(firestoreDatabase, 'reviews', orderId), {
      orderId,
      customerUid,
      branchId,
      rating,
      comment,
      createdAt: serverTimestamp(),
    });
  }

  /** Reseñas para el indicador de satisfacción (admin: todas; `branchId` filtra). */
  async findReviews(branchId: string): Promise<OrderReview[]> {
    const reviewsQuery = branchId
      ? query(collection(firestoreDatabase, 'reviews'), where('branchId', '==', branchId))
      : collection(firestoreDatabase, 'reviews');
    const reviewsSnapshot = await getDocs(reviewsQuery);
    return reviewsSnapshot.docs.map((reviewDocument) => this.mapDocumentToReview(reviewDocument.data()));
  }

  private mapDocumentToReview(reviewFields: DocumentData): OrderReview {
    return {
      orderId: readStringField(reviewFields, 'orderId'),
      branchId: readStringField(reviewFields, 'branchId'),
      rating: readNumberField(reviewFields, 'rating'),
      comment: readStringField(reviewFields, 'comment'),
      createdAt: convertFirestoreValueToDate(reviewFields['createdAt']),
    };
  }

  private sortClaimsByNewest(claims: Claim[]): Claim[] {
    return claims.sort((firstClaim, secondClaim) => (secondClaim.createdAt?.getTime() ?? 0) - (firstClaim.createdAt?.getTime() ?? 0));
  }

  private mapDocumentToClaim(claimId: string, claimFields: DocumentData): Claim {
    const claimedAmount = claimFields['claimedAmount'];
    return {
      id: claimId,
      claimNumber: readStringField(claimFields, 'claimNumber'),
      claimType: claimFields['claimType'] === 'grievance' ? 'grievance' : 'complaint',
      fullName: readStringField(claimFields, 'fullName'),
      documentNumber: readStringField(claimFields, 'documentNumber'),
      address: readStringField(claimFields, 'address'),
      phone: readStringField(claimFields, 'phone'),
      customerEmail: readStringField(claimFields, 'customerEmail'),
      relatedOrderNumber: readStringField(claimFields, 'relatedOrderNumber'),
      claimedAmount: typeof claimedAmount === 'number' ? claimedAmount : null,
      description: readStringField(claimFields, 'description'),
      requestedSolution: readStringField(claimFields, 'requestedSolution'),
      status: (readStringField(claimFields, 'status') || 'open') as ClaimStatus,
      response: readStringField(claimFields, 'response'),
      createdAt: convertFirestoreValueToDate(claimFields['createdAt']),
      respondedAt: convertFirestoreValueToDate(claimFields['respondedAt']),
    };
  }
}
