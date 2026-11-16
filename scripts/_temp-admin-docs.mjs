// Administrador TEMPORAL para tomar capturas de la documentación (autorizado por el usuario).
// node scripts/_temp-admin-docs.mjs [create|delete] <ruta-archivo-contraseña>
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
process.loadEnvFile('.env');
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
const adminAuth = getAuth();
const temporaryEmail = 'revision-docs@farmasalud.test';
const existingUser = await adminAuth.getUserByEmail(temporaryEmail).catch(() => null);
if (process.argv[2] === 'delete') {
  if (existingUser) await adminAuth.deleteUser(existingUser.uid);
  console.log('Administrador temporal eliminado.');
} else {
  const temporaryPassword = `Tmp-${randomBytes(6).toString('hex')}`;
  const temporaryUser = existingUser
    ? await adminAuth.updateUser(existingUser.uid, { password: temporaryPassword })
    : await adminAuth.createUser({ email: temporaryEmail, password: temporaryPassword, displayName: 'Administración Farmasalud', emailVerified: true });
  await adminAuth.setCustomUserClaims(temporaryUser.uid, { role: 'admin', branchId: null });
  writeFileSync(process.argv[3], temporaryPassword);
  console.log('Administrador temporal listo.');
}
process.exit(0);
