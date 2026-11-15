import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
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

/** App Check protege Firestore y las functions contra tráfico automatizado (bots). */
export const firebaseAppCheck: AppCheck | null = environment.appCheckRecaptchaSiteKey
  ? initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(environment.appCheckRecaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  : null;

if (environment.useFirebaseEmulators) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestoreDatabase, '127.0.0.1', 8080);
}
