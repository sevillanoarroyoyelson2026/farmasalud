/**
 * Crea usuarios de prueba SOLO en el emulador de Auth (sirve aunque no haya Java
 * para el emulador de Firestore). Útil para revisar los layouts de cada rol.
 *   npm run emulators:auth   (en otra terminal)
 *   npm run seed:auth
 * Contraseña de todos: Farma2026
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
initializeApp({ projectId: 'demo-farmasalud' });
const adminAuth = getAuth();

const TEST_PASSWORD = 'Farma2026';
const testUsers = [
  { email: 'admin@farmasalud.test', fullName: 'Administrador de Prueba', role: 'admin', branchId: null },
  { email: 'trabajador@farmasalud.test', fullName: 'Técnico de Prueba', role: 'worker', branchId: 'el-bosque' },
  { email: 'cliente@farmasalud.test', fullName: 'Cliente de Prueba', role: 'customer', branchId: null },
];

try {
  for (const testUser of testUsers) {
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.getUserByEmail(testUser.email);
    } catch {
      firebaseUser = await adminAuth.createUser({
        email: testUser.email,
        password: TEST_PASSWORD,
        displayName: testUser.fullName,
        emailVerified: true,
      });
    }
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { role: testUser.role, branchId: testUser.branchId });
  }
  console.log(`Usuarios de prueba listos (clave ${TEST_PASSWORD}).`);
} catch (error) {
  console.error('[seed-auth-emulator]', error instanceof Error ? error.message : error);
  process.exit(1);
}
