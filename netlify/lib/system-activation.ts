import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http-response';

/**
 * Candado de activación del sistema (licencia).
 *
 * El sistema SOLO opera si la variable de entorno `SYSTEM_LICENSE_KEY` contiene
 * la clave de activación correcta. Aquí guardamos únicamente el **hash SHA-256**
 * de esa clave: el hash es irreversible, así que leer este archivo NO revela la
 * clave ni permite fabricar una válida.
 *
 * Operación:
 *   • ACTIVAR (tras el pago):  definir en Netlify  SYSTEM_LICENSE_KEY=<tu clave>  y volver a desplegar.
 *   • DESACTIVAR:              borrar la variable SYSTEM_LICENSE_KEY (o dejarla vacía) y volver a desplegar.
 *
 * Para cambiar la clave: ejecuta  `node scripts/generar-clave-activacion.mjs "<nueva clave>"`
 * y reemplaza el hash de abajo por el que imprima.
 */
const EXPECTED_LICENSE_KEY_HASH = '4b2ac119dc964c7b4edebde0b843db4b2f09cea7e741b9b8c9e9d89adff634f2';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** `true` solo si la clave presente en el entorno coincide con la esperada. */
export function isSystemActivated(): boolean {
  const providedKey = process.env['SYSTEM_LICENSE_KEY'];
  if (!providedKey) {
    return false;
  }
  // Comparación en tiempo constante (no filtra información por el tiempo de respuesta).
  const providedHash = Buffer.from(sha256Hex(providedKey), 'hex');
  const expectedHash = Buffer.from(EXPECTED_LICENSE_KEY_HASH, 'hex');
  return providedHash.length === expectedHash.length && timingSafeEqual(providedHash, expectedHash);
}

/**
 * Bloquea cualquier operación del servidor cuando el sistema no está activado.
 * Se invoca en el punto único por el que pasan todas las functions (`authenticateCaller`),
 * de modo que ninguna venta, stock, pago o cambio de rol puede ejecutarse sin activación.
 */
export function assertSystemActivated(): void {
  if (!isSystemActivated()) {
    throw new HttpError(503, 'El sistema está pendiente de activación. Contacte al proveedor del software.');
  }
}
