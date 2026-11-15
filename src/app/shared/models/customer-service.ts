/** Libro de reclamaciones y reseñas de pedidos. */

/** complaint = reclamo (producto/servicio); grievance = queja (atención). */
export type ClaimType = 'complaint' | 'grievance';
export type ClaimStatus = 'open' | 'in_review' | 'resolved';

export interface Claim {
  id: string;
  claimNumber: string;
  claimType: ClaimType;
  fullName: string;
  documentNumber: string;
  address: string;
  phone: string;
  customerEmail: string;
  relatedOrderNumber: string;
  claimedAmount: number | null;
  description: string;
  requestedSolution: string;
  status: ClaimStatus;
  response: string;
  createdAt: Date | null;
  respondedAt: Date | null;
}

export interface SubmitClaimRequest {
  claimType: ClaimType;
  fullName: string;
  documentNumber: string;
  address: string;
  phone: string;
  relatedOrderNumber: string;
  claimedAmount: number | null;
  description: string;
  requestedSolution: string;
}

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  complaint: 'Reclamo',
  grievance: 'Queja',
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  open: 'Recibido',
  in_review: 'En revisión',
  resolved: 'Respondido',
};

export const CLAIM_STATUS_TONE: Record<ClaimStatus, string> = {
  open: 'is-warning',
  in_review: 'is-info',
  resolved: 'is-success',
};

/** Plazo legal de respuesta del Libro de Reclamaciones (D.S. 011-2011-PCM y modificatorias). */
export const CLAIM_RESPONSE_DEADLINE_DAYS = 15;

export interface OrderReview {
  orderId: string;
  branchId: string;
  rating: number;
  comment: string;
  createdAt: Date | null;
}
