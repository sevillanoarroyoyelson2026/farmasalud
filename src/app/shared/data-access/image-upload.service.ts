import { inject, Injectable } from '@angular/core';
import { ApiClientService } from '../../core/http/api-client.service';

export type ImageUploadFolder = 'products' | 'prescriptions';

const MAXIMUM_IMAGE_SIZE_BYTES_BY_FOLDER: Record<ImageUploadFolder, number> = {
  products: 5 * 1024 * 1024,
  prescriptions: 10 * 1024 * 1024,
};
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface SignedUploadParameters {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  deliveryType: 'upload' | 'authenticated';
  allowedFormats: string;
}

interface CloudinaryUploadResponse {
  secure_url?: string;
  public_id?: string;
  version?: number;
  format?: string;
}

export interface UploadedPrescriptionFile {
  publicId: string;
  version: number;
  format: string;
}

/**
 * Sube imágenes a Cloudinary con firma del servidor (function `sign-image-upload`):
 * la clave secreta nunca llega al navegador.
 * - Productos: públicas, solo el admin.
 * - Recetas: privadas (`authenticated`), en la carpeta del propio cliente.
 */
@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private readonly apiClient = inject(ApiClientService);

  /** Devuelve el mensaje de error si el archivo no es válido, o null si se puede subir. */
  describeInvalidImage(imageFile: File, uploadFolder: ImageUploadFolder): string | null {
    if (!ALLOWED_IMAGE_TYPES.includes(imageFile.type)) {
      return 'Solo se aceptan imágenes JPG, PNG o WEBP.';
    }
    const maximumSizeBytes = MAXIMUM_IMAGE_SIZE_BYTES_BY_FOLDER[uploadFolder];
    if (imageFile.size > maximumSizeBytes) {
      return `La imagen no debe superar los ${maximumSizeBytes / 1024 / 1024} MB.`;
    }
    return null;
  }

  /** Imagen pública de producto: devuelve su URL. */
  async uploadProductImage(imageFile: File): Promise<string> {
    const uploadResult = await this.uploadToCloudinary(imageFile, 'products');
    if (!uploadResult.secure_url) {
      throw new Error('No se pudo subir la imagen. Inténtalo de nuevo.');
    }
    return uploadResult.secure_url;
  }

  /** Receta privada: devuelve la referencia que se guarda en el pedido (no una URL pública). */
  async uploadPrescription(imageFile: File): Promise<UploadedPrescriptionFile> {
    const uploadResult = await this.uploadToCloudinary(imageFile, 'prescriptions');
    if (!uploadResult.public_id || !uploadResult.version || !uploadResult.format) {
      throw new Error('No se pudo subir la receta. Inténtalo de nuevo.');
    }
    return { publicId: uploadResult.public_id, version: uploadResult.version, format: uploadResult.format };
  }

  private async uploadToCloudinary(
    imageFile: File,
    uploadFolder: ImageUploadFolder,
  ): Promise<CloudinaryUploadResponse> {
    const invalidImageMessage = this.describeInvalidImage(imageFile, uploadFolder);
    if (invalidImageMessage) {
      throw new Error(invalidImageMessage);
    }

    const signedParameters = await this.apiClient.postJson<SignedUploadParameters>('sign-image-upload', {
      folder: uploadFolder,
    });

    const uploadForm = new FormData();
    uploadForm.append('file', imageFile);
    uploadForm.append('api_key', signedParameters.apiKey);
    uploadForm.append('timestamp', String(signedParameters.timestamp));
    uploadForm.append('signature', signedParameters.signature);
    uploadForm.append('folder', signedParameters.folder);
    uploadForm.append('type', signedParameters.deliveryType);
    uploadForm.append('allowed_formats', signedParameters.allowedFormats);

    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signedParameters.cloudName)}/image/upload`,
      { method: 'POST', body: uploadForm },
    );
    const uploadResult = (await uploadResponse.json().catch(() => ({}))) as CloudinaryUploadResponse;
    if (!uploadResponse.ok) {
      throw new Error('No se pudo subir la imagen. Inténtalo de nuevo.');
    }
    return uploadResult;
  }
}
