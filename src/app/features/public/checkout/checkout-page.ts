import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AppLoggerService } from '../../../core/logger/app-logger.service';
import { CulqiCheckoutService } from '../../../core/payments/culqi-checkout.service';
import { CartService } from '../../../shared/data-access/cart.service';
import {
  ImageUploadService,
  UploadedPrescriptionFile,
} from '../../../shared/data-access/image-upload.service';
import { OrderRepository } from '../../../shared/data-access/order.repository';
import {
  CreateOrderRequest,
  DELIVERY_FEE_IN_SOLES,
  FulfillmentType,
  PaymentMethod,
} from '../../../shared/models/order';
import { describeErrorForUser } from '../../../shared/utils/user-facing-error';
import { peruvianCellphoneValidator } from '../../../shared/validators/password-strength.validator';
import {
  cardExpirationValidator,
  cardNumberValidator,
  extractCardDigits,
} from '../../../shared/validators/payment-card.validator';
import { CartDetailsService } from '../cart/cart-details.service';

/**
 * Checkout (procedimiento O04.02): entrega, receta, pago SIMULADO y confirmación.
 * Los datos de la tarjeta se validan aquí y se descartan; el servidor solo recibe los 4 últimos dígitos.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe],
  templateUrl: './checkout-page.html',
  styleUrl: './checkout-page.css',
})
export class CheckoutPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly orderRepository = inject(OrderRepository);
  private readonly imageUploadService = inject(ImageUploadService);
  private readonly router = inject(Router);
  private readonly logger = inject(AppLoggerService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly culqiCheckout = inject(CulqiCheckoutService);
  readonly cartDetails = inject(CartDetailsService);

  /** Con llave pública de Culqi se cobra de verdad; sin ella, pago simulado (proyecto académico). */
  readonly isRealCardPaymentEnabled = this.culqiCheckout.isEnabled();
  private readonly cardPaymentMethod: PaymentMethod = this.isRealCardPaymentEnabled
    ? 'culqi_card'
    : 'simulated_card';

  /** Una clave por visita al checkout: si el cliente pulsa dos veces, el servidor no duplica el pedido. */
  private readonly orderIdempotencyKey = crypto.randomUUID();

  readonly isEmailVerified = computed(
    () => this.authService.currentSession()?.isEmailVerified === true,
  );
  readonly uploadedPrescription = signal<UploadedPrescriptionFile | null>(null);
  readonly uploadedPrescriptionName = signal('');
  readonly isUploadingPrescription = signal(false);
  readonly isPlacingOrder = signal(false);
  readonly checkoutErrorMessage = signal('');

  readonly checkoutForm = this.formBuilder.nonNullable.group({
    fulfillmentType: ['delivery' as FulfillmentType],
    street: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(160)]],
    district: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    addressReference: ['', [Validators.maxLength(160)]],
    contactPhone: ['', [Validators.required, peruvianCellphoneValidator]],
    customerNote: ['', [Validators.maxLength(300)]],
    paymentMethod: [
      (this.culqiCheckout.isEnabled() ? 'culqi_card' : 'simulated_card') as PaymentMethod,
    ],
    cardHolderName: ['', [Validators.required, Validators.minLength(3)]],
    cardNumber: ['', [Validators.required, cardNumberValidator]],
    cardExpiration: ['', [Validators.required, cardExpirationValidator]],
    cardSecurityCode: ['', [Validators.required, Validators.pattern(/^\d{3,4}$/)]],
  });

  readonly selectedFulfillmentType = signal<FulfillmentType>('delivery');
  readonly selectedPaymentMethod = signal<PaymentMethod>(this.cardPaymentMethod);
  readonly isWaitingForCardForm = signal(false);
  readonly deliveryFee = computed(() =>
    this.selectedFulfillmentType() === 'delivery' ? DELIVERY_FEE_IN_SOLES : 0,
  );
  readonly orderTotal = computed(() => this.cartDetails.itemsTotal() + this.deliveryFee());
  readonly canSelectedBranchDeliver = computed(
    () => this.cartDetails.selectedBranch()?.offersDelivery === true,
  );

  constructor() {
    if (this.isRealCardPaymentEnabled) {
      // Con Culqi los datos de la tarjeta los pide el formulario de Culqi, no esta página.
      this.toggleControls(
        ['cardHolderName', 'cardNumber', 'cardExpiration', 'cardSecurityCode'],
        false,
      );
    }
    this.checkoutForm.controls.fulfillmentType.valueChanges.subscribe((fulfillmentType) => {
      this.selectedFulfillmentType.set(fulfillmentType);
      this.toggleControls(
        ['street', 'district', 'addressReference'],
        fulfillmentType === 'delivery',
      );
    });
    this.checkoutForm.controls.paymentMethod.valueChanges.subscribe((paymentMethod) => {
      this.selectedPaymentMethod.set(paymentMethod);
      this.toggleControls(
        ['cardHolderName', 'cardNumber', 'cardExpiration', 'cardSecurityCode'],
        paymentMethod === 'simulated_card' && !this.isRealCardPaymentEnabled,
      );
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.cartDetails.loadCartDetails();
      if (this.cartService.isEmpty() || !this.cartDetails.selectedBranch()) {
        await this.router.navigateByUrl('/carrito');
        return;
      }
      if (!this.canSelectedBranchDeliver()) {
        this.checkoutForm.controls.fulfillmentType.setValue('pickup');
      }
    } catch (error) {
      this.logger.logError('CheckoutPage.loadCartDetails', error);
      this.checkoutErrorMessage.set('No pudimos cargar tu carrito. Recarga la página.');
    }
  }

  async uploadPrescription(changeEvent: Event): Promise<void> {
    const fileInput = changeEvent.target as HTMLInputElement;
    const prescriptionImage = fileInput.files?.[0];
    fileInput.value = '';
    if (!prescriptionImage) {
      return;
    }
    this.checkoutErrorMessage.set('');
    this.isUploadingPrescription.set(true);
    try {
      this.uploadedPrescription.set(
        await this.imageUploadService.uploadPrescription(prescriptionImage),
      );
      this.uploadedPrescriptionName.set(prescriptionImage.name);
    } catch (error) {
      this.logger.logError('CheckoutPage.uploadPrescription', error);
      this.checkoutErrorMessage.set(describeErrorForUser(error, 'No se pudo subir la receta.'));
    } finally {
      this.isUploadingPrescription.set(false);
    }
  }

  hasFieldError(fieldName: keyof typeof this.checkoutForm.controls): boolean {
    const formControl = this.checkoutForm.controls[fieldName];
    return formControl.invalid && formControl.touched;
  }

  async placeOrder(): Promise<void> {
    this.checkoutErrorMessage.set('');
    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      this.checkoutErrorMessage.set('Revisa los campos marcados en rojo.');
      return;
    }
    if (this.cartDetails.requiresPrescription() && !this.uploadedPrescription()) {
      this.checkoutErrorMessage.set('Adjunta la foto de tu receta médica para continuar.');
      return;
    }
    const selectedBranch = this.cartDetails.selectedBranch();
    if (!selectedBranch) {
      return;
    }

    let culqiToken: string | null = null;
    if (this.checkoutForm.controls.paymentMethod.value === 'culqi_card') {
      this.isWaitingForCardForm.set(true);
      try {
        culqiToken = await this.culqiCheckout.requestCardToken(
          this.orderTotal(),
          `Pedido en ${selectedBranch.name}`,
        );
      } catch (error) {
        this.logger.logError('CheckoutPage.requestCardToken', error);
        this.checkoutErrorMessage.set(
          describeErrorForUser(error, 'No se pudo validar la tarjeta.'),
        );
        return;
      } finally {
        this.isWaitingForCardForm.set(false);
      }
    }

    this.isPlacingOrder.set(true);
    try {
      const createdOrder = await this.orderRepository.createOrder(
        this.buildOrderRequest(selectedBranch.id, culqiToken),
      );
      this.cartService.clearCart();
      await this.router.navigate(['/mis-pedidos', createdOrder.orderId]);
    } catch (error) {
      this.logger.logError('CheckoutPage.placeOrder', error);
      this.checkoutErrorMessage.set(
        describeErrorForUser(error, 'No pudimos registrar tu pedido. Inténtalo de nuevo.'),
      );
    } finally {
      this.isPlacingOrder.set(false);
    }
  }

  private buildOrderRequest(branchId: string, culqiToken: string | null): CreateOrderRequest {
    const formValue = this.checkoutForm.getRawValue();
    const isDelivery = formValue.fulfillmentType === 'delivery';
    const isSimulatedCardPayment = formValue.paymentMethod === 'simulated_card';
    return {
      idempotencyKey: this.orderIdempotencyKey,
      branchId,
      items: this.cartService.cartLines().map((cartLine) => ({ ...cartLine })),
      fulfillmentType: formValue.fulfillmentType,
      deliveryAddress: isDelivery
        ? {
            street: formValue.street.trim(),
            district: formValue.district.trim(),
            reference: formValue.addressReference.trim(),
          }
        : null,
      contactPhone: formValue.contactPhone.trim(),
      paymentMethod: formValue.paymentMethod,
      simulatedCardLastDigits: isSimulatedCardPayment
        ? extractCardDigits(formValue.cardNumber).slice(-4)
        : null,
      culqiToken,
      prescriptionFile: this.cartDetails.requiresPrescription()
        ? this.uploadedPrescription()
        : null,
      customerNote: formValue.customerNote.trim(),
    };
  }

  private toggleControls(
    controlNames: (keyof typeof this.checkoutForm.controls)[],
    isEnabled: boolean,
  ): void {
    for (const controlName of controlNames) {
      const formControl = this.checkoutForm.controls[controlName];
      if (isEnabled) {
        formControl.enable({ emitEvent: false });
      } else {
        formControl.disable({ emitEvent: false });
      }
    }
  }
}
