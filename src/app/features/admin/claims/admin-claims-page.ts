import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { CustomerServiceRepository } from '../../../shared/data-access/customer-service.repository';
import {
  Claim,
  CLAIM_RESPONSE_DEADLINE_DAYS,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_TONE,
  CLAIM_TYPE_LABEL,
  ClaimStatus,
} from '../../../shared/models/customer-service';
import { DialogPanel } from '../../../shared/ui/dialog-panel/dialog-panel';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';

const MILLISECONDS_PER_DAY = 86_400_000;

/** Bandeja del Libro de Reclamaciones: revisar, responder y controlar el plazo legal. */
@Component({
  selector: 'app-admin-claims-page',
  imports: [FormsModule, DialogPanel, DatePipe, CurrencyPipe],
  templateUrl: './admin-claims-page.html',
})
export class AdminClaimsPage implements OnInit {
  private readonly customerServiceRepository = inject(CustomerServiceRepository);
  private readonly logger = inject(AppLoggerService);

  readonly claimTypeLabel = CLAIM_TYPE_LABEL;
  readonly claimStatusLabel = CLAIM_STATUS_LABEL;
  readonly claimStatusTone = CLAIM_STATUS_TONE;
  readonly claims = signal<Claim[]>([]);
  readonly isLoading = signal(true);
  readonly loadErrorMessage = signal('');
  readonly statusFilter = signal<ClaimStatus | ''>('');

  readonly selectedClaim = signal<Claim | null>(null);
  readonly responseStatus = signal<ClaimStatus>('in_review');
  readonly responseText = signal('');
  readonly isSaving = signal(false);
  readonly saveErrorMessage = signal('');

  readonly visibleClaims = computed(() =>
    this.claims().filter((claim) => !this.statusFilter() || claim.status === this.statusFilter()),
  );
  readonly pendingClaimsCount = computed(() => this.claims().filter((claim) => claim.status !== 'resolved').length);

  async ngOnInit(): Promise<void> {
    await this.loadClaims();
  }

  /** Días que faltan para el plazo legal de respuesta (negativo = vencido). */
  daysLeftToRespond(claim: Claim): number | null {
    if (!claim.createdAt || claim.status === 'resolved') {
      return null;
    }
    const deadline = claim.createdAt.getTime() + CLAIM_RESPONSE_DEADLINE_DAYS * MILLISECONDS_PER_DAY;
    return Math.ceil((deadline - Date.now()) / MILLISECONDS_PER_DAY);
  }

  updateStatusFilter(changeEvent: Event): void {
    this.statusFilter.set((changeEvent.target as HTMLSelectElement).value as ClaimStatus | '');
  }

  openClaim(claim: Claim): void {
    this.selectedClaim.set(claim);
    this.responseStatus.set(claim.status === 'open' ? 'in_review' : claim.status);
    this.responseText.set(claim.response);
    this.saveErrorMessage.set('');
  }

  closeClaim(): void {
    this.selectedClaim.set(null);
  }

  async saveResponse(): Promise<void> {
    const claim = this.selectedClaim();
    if (!claim) {
      return;
    }
    if (this.responseStatus() === 'resolved' && this.responseText().trim().length < 10) {
      this.saveErrorMessage.set('Para cerrar el reclamo escribe la respuesta al cliente (mínimo 10 caracteres).');
      return;
    }
    this.isSaving.set(true);
    this.saveErrorMessage.set('');
    try {
      await this.customerServiceRepository.respondToClaim(
        claim.id,
        this.responseStatus(),
        this.responseText().trim().slice(0, 2000),
      );
      this.closeClaim();
      await this.loadClaims();
    } catch (error) {
      this.logger.logError('AdminClaimsPage.saveResponse', error);
      this.saveErrorMessage.set(describeErrorForUser(error, 'No se pudo guardar la respuesta.'));
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadClaims(): Promise<void> {
    this.loadErrorMessage.set('');
    try {
      this.claims.set(await this.customerServiceRepository.findAllClaims());
    } catch (error) {
      this.logger.logError('AdminClaimsPage.loadClaims', error);
      this.loadErrorMessage.set('No se pudieron cargar los reclamos.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
