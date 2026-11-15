import { createHash } from 'node:crypto';
import { HttpError } from './http-response';

/** Recetas: carpeta privada por cliente (tipo `authenticated`, no se ven sin URL firmada). */
export function buildPrescriptionFolder(customerUid: string): string {
  return `farmasalud/prescriptions/${customerUid}`;
}

export interface PrescriptionFileReference {
  publicId: string;
  version: number;
  format: string;
}

/**
 * URL firmada para ver una receta privada. Solo la genera el servidor después de
 * comprobar que quien la pide es el dueño o personal de la sucursal del pedido.
 */
export function buildSignedPrescriptionUrl(prescriptionFile: PrescriptionFileReference): string {
  const { cloudName, apiSecret } = readCloudinaryConfiguration();
  const assetPath = `${prescriptionFile.publicId}.${prescriptionFile.format}`;
  const urlSignature = createHash('sha1')
    .update(assetPath + apiSecret)
    .digest('base64url')
    .slice(0, 8);
  return `https://res.cloudinary.com/${cloudName}/image/authenticated/s--${urlSignature}--/v${prescriptionFile.version}/${assetPath}`;
}

export interface CloudinaryConfiguration {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Credenciales de Cloudinary desde variables de entorno (el secreto nunca sale del servidor). */
export function readCloudinaryConfiguration(): CloudinaryConfiguration {
  const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
  const apiKey = process.env['CLOUDINARY_API_KEY'];
  const apiSecret = process.env['CLOUDINARY_API_SECRET'];
  if (!cloudName || !apiKey || !apiSecret) {
    throw new HttpError(503, 'La subida de imágenes aún no está configurada.');
  }
  return { cloudName, apiKey, apiSecret };
}

/**
 * Solo se aceptan imágenes alojadas en NUESTRA cuenta de Cloudinary.
 * Así nadie puede guardar como imagen de producto un enlace a un sitio externo.
 */
export function isImageFromOwnCloudinaryAccount(imageUrl: string): boolean {
  const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
  if (!cloudName) {
    return false;
  }
  return imageUrl.startsWith(`https://res.cloudinary.com/${cloudName}/image/upload/`);
}
