import { HttpError } from './http-response';

const CULQI_CHARGES_URL = 'https://api.culqi.com/v2/charges';
const CULQI_REQUEST_TIMEOUT_MS = 20_000;

/** true cuando el sitio cobra con Culqi real (hay llave secreta configurada en el servidor). */
export function isCulqiPaymentEnabled(): boolean {
  return Boolean(process.env['CULQI_SECRET_KEY']);
}

export interface CulqiChargeRequest {
  amountInSoles: number;
  customerEmail: string;
  /** Token de tarjeta `tkn_...` generado por Culqi Checkout en el navegador. */
  cardToken: string;
  orderId: string;
  orderNumber: string;
}

export interface CulqiChargeResult {
  chargeId: string;
  cardLastDigits: string | null;
}

interface CulqiChargeResponseBody {
  id?: string;
  source?: { card_number?: string };
  user_message?: string;
}

/**
 * Cobra con la API de Culqi usando la llave SECRETA (solo vive en el servidor).
 * El monto lo calcula el servidor; el navegador solo aporta el token de la tarjeta,
 * así que nadie puede pagar menos manipulando la página.
 */
export async function chargeCardWithCulqi(chargeRequest: CulqiChargeRequest): Promise<CulqiChargeResult> {
  const culqiSecretKey = process.env['CULQI_SECRET_KEY'];
  if (!culqiSecretKey) {
    throw new HttpError(503, 'El pago con tarjeta no está disponible en este momento.');
  }

  let chargeResponse: Response;
  try {
    chargeResponse = await fetch(CULQI_CHARGES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${culqiSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(chargeRequest.amountInSoles * 100),
        currency_code: 'PEN',
        email: chargeRequest.customerEmail,
        source_id: chargeRequest.cardToken,
        description: `Farmasalud pedido ${chargeRequest.orderNumber}`.slice(0, 80),
        metadata: { order_id: chargeRequest.orderId, order_number: chargeRequest.orderNumber },
      }),
      signal: AbortSignal.timeout(CULQI_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, 'No pudimos comunicarnos con la pasarela de pago. No se realizó ningún cobro.');
  }

  const chargeBody = (await chargeResponse.json().catch(() => ({}))) as CulqiChargeResponseBody;
  if (!chargeResponse.ok || !chargeBody.id) {
    // `user_message` de Culqi está pensado para mostrarse al cliente (p. ej. "Tarjeta sin fondos").
    throw new HttpError(402, chargeBody.user_message || 'Tu tarjeta fue rechazada. No se realizó ningún cobro.');
  }
  const maskedCardNumber = chargeBody.source?.card_number ?? '';
  return { chargeId: chargeBody.id, cardLastDigits: maskedCardNumber ? maskedCardNumber.slice(-4) : null };
}

/**
 * Devuelve el cobro de un pedido cancelado. Devuelve false si Culqi no lo aceptó
 * (el pedido queda marcado "refund_failed" para que el admin lo revise en el panel de Culqi).
 */
export async function refundCulqiCharge(culqiChargeId: string, amountInSoles: number): Promise<boolean> {
  const culqiSecretKey = process.env['CULQI_SECRET_KEY'];
  if (!culqiSecretKey) {
    return false;
  }
  try {
    const refundResponse = await fetch('https://api.culqi.com/v2/refunds', {
      method: 'POST',
      headers: { Authorization: `Bearer ${culqiSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(amountInSoles * 100),
        charge_id: culqiChargeId,
        reason: 'solicitud_comprador',
      }),
      signal: AbortSignal.timeout(CULQI_REQUEST_TIMEOUT_MS),
    });
    if (!refundResponse.ok) {
      console.error(`[culqi] Devolución rechazada (HTTP ${refundResponse.status}) para ${culqiChargeId}`);
    }
    return refundResponse.ok;
  } catch (error) {
    console.error(`[culqi] Error de red al devolver ${culqiChargeId}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
