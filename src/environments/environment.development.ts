/**
 * Configuración de desarrollo: proyecto Firebase real `farmasalud-2a366`.
 * Para volver a los emuladores locales, pon `useFirebaseEmulators: true`
 * (y en .env las variables *_EMULATOR_HOST).
 * Estos datos son PÚBLICOS (identifican la app web); la seguridad la dan las reglas.
 */
export const environment = {
  isProduction: false,
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
  appCheckRecaptchaSiteKey: '',
  culqiPublicKey: 'pk_test_REEMPLAZAR',
};
