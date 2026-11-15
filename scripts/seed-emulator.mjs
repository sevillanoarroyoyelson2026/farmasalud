/**
 * Datos de prueba para la Firebase Emulator Suite (NUNCA contra producción).
 *   npm run emulators   (en otra terminal)
 *   npm run seed:emulator
 *
 * Crea 2 sucursales y 3 cuentas de prueba (contraseña: Farma2026):
 *   admin@farmasalud.test · trabajador@farmasalud.test · cliente@farmasalud.test
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';

initializeApp({ projectId: 'demo-farmasalud' });
const adminAuth = getAuth();
const adminFirestore = getFirestore();

const TEST_PASSWORD = 'Farma2026';

const testBranches = [
  { id: 'el-bosque', name: 'Botica El Bosque', address: 'Av. Ricardo Palma 903', district: 'Trujillo', phone: '044000001' },
  { id: 'la-esperanza', name: 'Botica La Esperanza', address: 'Av. José Gabriel Condorcanqui 1200', district: 'La Esperanza', phone: '044000002' },
];

const testUsers = [
  { email: 'admin@farmasalud.test', fullName: 'Administrador de Prueba', role: 'admin', branchId: null },
  { email: 'trabajador@farmasalud.test', fullName: 'Técnico de Prueba', role: 'worker', branchId: 'el-bosque' },
  { email: 'cliente@farmasalud.test', fullName: 'Cliente de Prueba', role: 'customer', branchId: null },
];

async function createOrReuseTestUser(testUser) {
  try {
    return await adminAuth.getUserByEmail(testUser.email);
  } catch {
    return adminAuth.createUser({
      email: testUser.email,
      password: TEST_PASSWORD,
      displayName: testUser.fullName,
      emailVerified: true,
    });
  }
}

try {
  for (const testBranch of testBranches) {
    const { id: branchId, ...branchFields } = testBranch;
    await adminFirestore.collection('branches').doc(branchId).set({
      ...branchFields,
      isActive: true,
      offersDelivery: true,
    });
  }

  for (const testUser of testUsers) {
    const firebaseUser = await createOrReuseTestUser(testUser);
    await adminAuth.setCustomUserClaims(firebaseUser.uid, { role: testUser.role, branchId: testUser.branchId });
    await adminFirestore.collection('users').doc(firebaseUser.uid).set({
      email: testUser.email,
      fullName: testUser.fullName,
      phone: null,
      role: testUser.role,
      branchId: testUser.branchId,
      isDisabled: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`Emulador listo: ${testBranches.length} sucursales y ${testUsers.length} usuarios (clave ${TEST_PASSWORD}).`);
} catch (error) {
  console.error('[seed-emulator]', error instanceof Error ? error.message : error);
  process.exit(1);
}
