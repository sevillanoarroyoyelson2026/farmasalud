import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const CULQI_CHECKOUT_SCRIPT_URL = 'https://checkout.culqi.com/js/v4';
const VALID_PUBLIC_KEY_PATTERN = /^pk_(test|live)_[A-Za-z0-9]{8,}$/;

/** API mínima de Culqi Checkout v4 que usa la app (la define el script de Culqi). */
interface CulqiCheckoutApi {
  publicKey: string;
  settings(checkoutSettings: { title: string; currency: string; amount: number; description?: string }): void;
  options(checkoutOptions: Record<string, unknown>): void;
  open(): void;
  close(): void;
  token?: { id: string; email: string };
  error?: { user_message?: string };
}

declare global {
  interface Window {
    Culqi?: CulqiCheckoutApi;
    culqi?: () => void;
  }
}

/**
 * Pasarela Culqi (Checkout v4). El formulario de tarjeta es de Culqi: los datos de la
 * tarjeta nunca pasan por Farmasalud. La app solo recibe un token de un solo uso, y el
 * servidor cobra con su llave secreta el monto que él mismo calculó.
 */
@Injectable({ providedIn: 'root' })
export class CulqiCheckoutService {
  private scriptLoading: Promise<CulqiCheckoutApi> | null = null;

  /** true si hay llave pública real configurada; si no, la tienda usa el pago simulado. */
  isEnabled(): boolean {
    return VALID_PUBLIC_KEY_PATTERN.test(environment.culqiPublicKey);
  }

  /**
   * Abre el formulario de Culqi y devuelve el token de la tarjeta (tkn_...).
   * Si el cliente cierra el formulario sin pagar, la promesa queda sin resolver y puede
   * volver a pulsar "Pagar" (cada apertura reemplaza el callback anterior).
   */
  async requestCardToken(amountInSoles: number, orderDescription: string): Promise<string> {
    const culqiCheckout = await this.loadCheckoutScript();
    culqiCheckout.publicKey = environment.culqiPublicKey;
    culqiCheckout.settings({
      title: 'Farmasalud',
      currency: 'PEN',
      amount: Math.round(amountInSoles * 100),
      description: orderDescription.slice(0, 80),
    });
    culqiCheckout.options({
      lang: 'auto',
      installments: false,
      paymentMethods: { tarjeta: true, yape: false, bancaMovil: false, agente: false, billetera: false, cuotealo: false },
      style: { bannerColor: '#1440a8', buttonBackground: '#1440a8', priceColor: '#1440a8' },
    });

    return new Promise<string>((resolveToken, rejectToken) => {
      window.culqi = () => {
        if (culqiCheckout.token?.id) {
          culqiCheckout.close();
          resolveToken(culqiCheckout.token.id);
          return;
        }
        rejectToken(new Error(culqiCheckout.error?.user_message || 'No se pudo validar la tarjeta.'));
      };
      culqiCheckout.token = undefined;
      culqiCheckout.open();
    });
  }

  private loadCheckoutScript(): Promise<CulqiCheckoutApi> {
    if (window.Culqi) {
      return Promise.resolve(window.Culqi);
    }
    this.scriptLoading ??= new Promise<CulqiCheckoutApi>((resolveScript, rejectScript) => {
      const checkoutScript = document.createElement('script');
      checkoutScript.src = CULQI_CHECKOUT_SCRIPT_URL;
      checkoutScript.async = true;
      checkoutScript.onload = () =>
        window.Culqi ? resolveScript(window.Culqi) : rejectScript(new Error('No se pudo cargar la pasarela de pago.'));
      checkoutScript.onerror = () => {
        this.scriptLoading = null;
        rejectScript(new Error('No se pudo cargar la pasarela de pago. Revisa tu conexión.'));
      };
      document.head.appendChild(checkoutScript);
    });
    return this.scriptLoading;
  }
}
