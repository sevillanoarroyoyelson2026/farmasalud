/**
 * Convierte una cuenta existente en el PRIMER administrador del sistema.
 * Solo se ejecuta una vez, en local, con la cuenta de servicio de Firebase:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/promote-first-admin.mjs correo@farmasalud.pe
 *
 * Por seguridad se niega a correr si ya existe un administrador: los siguientes
 * se crean desde el panel (function admin-create-staff-user).
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const targetEmail = process.argv[2];
if (!targetEmail) {
  console.error('Uso: node scripts/promote-first-admin.mjs <correo>');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const adminAuth = getAuth();
const adminFirestore = getFirestore();

try {
  const existingAdministrators = await adminFirestore
    .collection('users')
    .where('role', '==', 'admin')
    .limit(1)
    .get();
  if (!existingAdministrators.empty) {
    console.error('Ya existe un administrador. Crea los demás desde el panel de usuarios.');
    process.exit(1);
  }

  const targetUser = await adminAuth.getUserByEmail(targetEmail);
  await adminAuth.setCustomUserClaims(targetUser.uid, { role: 'admin', branchId: null });
  await adminAuth.revokeRefreshTokens(targetUser.uid);
  await adminFirestore.collection('users').doc(targetUser.uid).set(
    {
      email: targetUser.email,
      fullName: targetUser.displayName ?? '',
      role: 'admin',
      branchId: null,
      isDisabled: false,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`Listo: ${targetEmail} ahora es administrador. Vuelve a iniciar sesión.`);
} catch (error) {
  console.error('[promote-first-admin]', error instanceof Error ? error.message : error);
  process.exit(1);
}
