/**
 * Configuración de producción.
 * Aquí solo van claves PÚBLICAS (Firebase web config, llave pública de Culqi,
 * site key de reCAPTCHA). Las claves secretas viven en las variables de entorno
 * de Netlify y solo las leen las functions del servidor.
 */
export const environment = {
  isProduction: true,
  useFirebaseEmulators: false,
  apiBaseUrl: '/api',
  firebase: {
    apiKey: 'AIzaSyAInAFZdvCLohTq6YLyvXDiTKXvX6NobSA',
    authDomain: 'farmasalud-2a366.firebaseapp.com',
    projectId: 'farmasalud-2a366',
    storageBucket: 'farmasalud-2a366.firebasestorage.app',
    messagingSenderId: '1043517636428',
    appId: '1:1043517636428:web:049f44f96c1292a67059e9',
  },
  // TODO antes de publicar: site key de reCAPTCHA v3 (App Check).
  appCheckRecaptchaSiteKey: '',
  /** Llave PÚBLICA de Culqi (pk_test_... o pk_live_...). Vacía = pago simulado. */
  culqiPublicKey: '',
};
