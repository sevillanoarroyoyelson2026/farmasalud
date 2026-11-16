import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { CustomerServiceRepository } from '../../../shared/data-access/customer-service.repository';
import {
  Claim,
  CLAIM_RESPONSE_DEADLINE_DAYS,
  CLAIM_STATUS_LABEL,
  CLAIM_STATUS_TONE,
  CLAIM_TYPE_LABEL,
  ClaimType,
} from '../../../shared/models/customer-service';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';
import { peruvianCellphoneValidator } from '../../../shared/validators/password-strength.validator';

/** Libro de Reclamaciones virtual (Ley 29571): registro y seguimiento de reclamos y quejas. */
@Component({
  selector: 'app-claims-book-page',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './claims-book-page.html',
  styles: `
    .claims-page {
      max-width: 880px;
      padding-top: 2rem;
      padding-bottom: 3rem;
    }
    .claims-card {
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .claim-item {
      padding: 1rem 1.25rem;
      margin-bottom: 0.75rem;
    }
    .claim-response {
      padding: 0.75rem;
      margin-top: 0.5rem;
      border-radius: var(--radius-sm);
      background: var(--color-accent-soft);
    }
  `,
})
export class ClaimsBookPage implements OnInit {
  private readonly customerServiceRepository = inject(CustomerServiceRepository);
  private readonly authService = inject(AuthService);
  private readonly logger = inject(AppLoggerService);
  private readonly formBuilder = inject(FormBuilder);

  readonly claimTypeLabel = CLAIM_TYPE_LABEL;
  readonly claimStatusLabel = CLAIM_STATUS_LABEL;
  readonly claimStatusTone = CLAIM_STATUS_TONE;
  readonly responseDeadlineDays = CLAIM_RESPONSE_DEADLINE_DAYS;
  readonly customerClaims = signal<Claim[]>([]);
  readonly isSubmitting = signal(false);
  readonly submitErrorMessage = signal('');
  readonly submittedClaimNumber = signal('');

  readonly claimForm = this.formBuilder.nonNullable.group({
    claimType: ['complaint' as ClaimType],
    fullName: [
      this.authService.currentSession()?.displayName ?? '',
      [Validators.required, Validators.minLength(3), Validators.maxLength(80)],
    ],
    documentNumber: ['', [Validators.required, Validators.pattern(/^\d{8}$|^\d{9,12}$/)]],
    address: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(160)]],
    phone: ['', [Validators.required, peruvianCellphoneValidator]],
    relatedOrderNumber: ['', [Validators.maxLength(20)]],
    claimedAmount: [null as number | null, [Validators.min(0), Validators.max(100000)]],
    description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(2000)]],
    requestedSolution: [
      '',
      [Validators.required, Validators.minLength(5), Validators.maxLength(1000)],
    ],
    hasAcceptedTruthfulness: [false, [Validators.requiredTrue]],
  });

  async ngOnInit(): Promise<void> {
    await this.loadCustomerClaims();
  }

  hasFieldError(fieldName: keyof typeof this.claimForm.controls): boolean {
    const formControl = this.claimForm.controls[fieldName];
    return formControl.invalid && formControl.touched;
  }

  async submitClaim(): Promise<void> {
    if (this.claimForm.invalid) {
      this.claimForm.markAllAsTouched();
      return;
    }
    this.isSubmitting.set(true);
    this.submitErrorMessage.set('');
    const {
      hasAcceptedTruthfulness: _hasAccepted,
      claimedAmount,
      ...formValue
    } = this.claimForm.getRawValue();
    try {
      const submittedClaim = await this.customerServiceRepository.submitClaim({
        ...formValue,
        fullName: formValue.fullName.trim(),
        address: formValue.address.trim(),
        relatedOrderNumber: formValue.relatedOrderNumber.trim().toUpperCase(),
        description: formValue.description.trim(),
        requestedSolution: formValue.requestedSolution.trim(),
        claimedAmount:
          claimedAmount === null || claimedAmount === undefined || String(claimedAmount) === ''
            ? null
            : Number(claimedAmount),
      });
      this.submittedClaimNumber.set(submittedClaim.claimNumber);
      this.claimForm.reset();
      await this.loadCustomerClaims();
    } catch (error) {
      this.logger.logError('ClaimsBookPage.submitClaim', error);
      this.submitErrorMessage.set(describeErrorForUser(error, 'No se pudo registrar tu reclamo.'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private async loadCustomerClaims(): Promise<void> {
    const customerUid = this.authService.currentSession()?.uid;
    if (!customerUid) {
      return;
    }
    try {
      this.customerClaims.set(await this.customerServiceRepository.findCustomerClaims(customerUid));
    } catch (error) {
      this.logger.logError('ClaimsBookPage.loadCustomerClaims', error);
    }
  }
}
