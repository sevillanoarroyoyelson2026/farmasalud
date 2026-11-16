import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Inicializa Firebase Admin una sola vez por instancia de la function.
 * - Producción: credencial de la cuenta de servicio en FIREBASE_SERVICE_ACCOUNT_KEY.
 * - Desarrollo con emuladores: basta FIREBASE_PROJECT_ID + FIREBASE_AUTH_EMULATOR_HOST.
 */
function initializeAdminApp(): App {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const isUsingEmulators = Boolean(process.env['FIREBASE_AUTH_EMULATOR_HOST']);
  if (isUsingEmulators) {
    return initializeApp({ projectId: process.env['FIREBASE_PROJECT_ID'] ?? 'demo-farmasalud' });
  }

  const serviceAccountJson = process.env['FIREBASE_SERVICE_ACCOUNT_KEY'];
  try {
    if (!serviceAccountJson) {
      throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT_KEY');
    }
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  } catch (error) {
    // No se lanza al cargar el módulo: así el handler responde un error GENÉRICO (500)
    // en vez de que Netlify muestre la traza interna. El detalle queda en el log.
    console.error(`[firebase-admin] Configuración inválida: ${error instanceof Error ? error.message : String(error)}`);
    return initializeApp({ projectId: 'configuracion-faltante' });
  }
}

export const adminApp = initializeAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminFirestore = getFirestore(adminApp);
export const adminAppCheck = getAppCheck(adminApp);
