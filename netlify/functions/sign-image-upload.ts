import type { Handler } from '@netlify/functions';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildPrescriptionFolder, readCloudinaryConfiguration } from '../lib/cloudinary';
import { createErrorResponse, createJsonResponse, HttpError, rejectUnsupportedMethod } from '../lib/http-response';
import { enforceRateLimit } from '../lib/rate-limiter';
import { authenticateCaller, parseRequestBody, type AuthenticatedCaller } from '../lib/request-guard';

const FUNCTION_NAME = 'sign-image-upload';
const ALLOWED_IMAGE_FORMATS = 'jpg,jpeg,png,webp';

const signImageUploadSchema = z
  .object({
    folder: z.enum(['products', 'prescriptions']),
  })
  .strict();

interface UploadDestination {
  cloudinaryFolder: string;
  /** `upload` = público (productos); `authenticated` = privado (recetas). */
  deliveryType: 'upload' | 'authenticated';
}

/** Quién puede subir a cada carpeta y con qué privacidad. */
function resolveUploadDestination(
  requestedFolder: 'products' | 'prescriptions',
  caller: AuthenticatedCaller,
): UploadDestination {
  if (requestedFolder === 'products') {
    if (caller.role !== 'admin') {
      throw new HttpError(403, 'No tienes permiso para subir imágenes de productos.');
    }
    return { cloudinaryFolder: 'farmasalud/products', deliveryType: 'upload' };
  }
  if (caller.role !== 'customer') {
    throw new HttpError(403, 'Solo los clientes suben recetas.');
  }
  return { cloudinaryFolder: buildPrescriptionFolder(caller.uid), deliveryType: 'authenticated' };
}

/**
 * Firma una subida a Cloudinary. La firma incluye carpeta, privacidad y formatos
 * permitidos: el navegador no puede cambiarlos sin invalidarla.
 */
export const handler: Handler = async (requestEvent) => {
  const methodRejection = rejectUnsupportedMethod(requestEvent);
  if (methodRejection) {
    return methodRejection;
  }

  try {
    const caller = await authenticateCaller(requestEvent);
    await enforceRateLimit(`${FUNCTION_NAME}:${caller.uid}`, 60, 600);
    const signRequest = parseRequestBody(requestEvent, signImageUploadSchema);
    const uploadDestination = resolveUploadDestination(signRequest.folder, caller);
    const cloudinaryConfiguration = readCloudinaryConfiguration();

    const timestamp = Math.round(Date.now() / 1000);
    // Cloudinary exige los parámetros ordenados alfabéticamente antes de firmar.
    const parametersToSign =
      `allowed_formats=${ALLOWED_IMAGE_FORMATS}&folder=${uploadDestination.cloudinaryFolder}` +
      `&timestamp=${timestamp}&type=${uploadDestination.deliveryType}`;
    const signature = createHash('sha1')
      .update(parametersToSign + cloudinaryConfiguration.apiSecret)
      .digest('hex');

    return createJsonResponse(requestEvent, 200, {
      cloudName: cloudinaryConfiguration.cloudName,
      apiKey: cloudinaryConfiguration.apiKey,
      timestamp,
      signature,
      folder: uploadDestination.cloudinaryFolder,
      deliveryType: uploadDestination.deliveryType,
      allowedFormats: ALLOWED_IMAGE_FORMATS,
    });
  } catch (error) {
    return createErrorResponse(requestEvent, FUNCTION_NAME, error);
  }
};
