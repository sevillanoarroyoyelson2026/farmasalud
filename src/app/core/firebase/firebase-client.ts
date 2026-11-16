import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

/**
 * Único punto donde se inicializa Firebase en el navegador.
 * El resto de la app recibe `firebaseAuth` y `firestoreDatabase` desde aquí,
 * nunca vuelve a llamar a initializeApp.
 */
export const firebaseApp = initializeApp(environment.firebase);

export const firebaseAuth = getAuth(firebaseApp);
firebaseAuth.languageCode = 'es';

export const firestoreDatabase = getFirestore(firebaseApp);

/**
 * App Check protege Firestore y las functions contra tráfico automatizado (bots).
 * Proveedor: reCAPTCHA Enterprise / Google Cloud Fraud Defense (reCAPTCHA v3 clásico está obsoleto).
 */
export const firebaseAppCheck: AppCheck | null = environment.appCheckRecaptchaSiteKey
  ? initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(environment.appCheckRecaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

if (environment.useFirebaseEmulators) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestoreDatabase, '127.0.0.1', 8080);
}
