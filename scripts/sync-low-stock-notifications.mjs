/**
 * Recalcula TODAS las notificaciones de stock bajo a partir del stock actual.
 *   node scripts/sync-low-stock-notifications.mjs
 *
 * Úsalo una vez al activar las notificaciones (para los productos que ya estaban bajo el
 * mínimo) o si alguna vez se cargó stock por fuera del sistema. Después, las functions
 * las mantienen al día solas en cada venta, ingreso, recepción o cancelación.
 * Aplica las mismas reglas que netlify/lib/low-stock-notifications.ts.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

process.loadEnvFile('.env');
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
const firestore = getFirestore();

function describeStockSeverity(availableUnits, minimumStock) {
  if (availableUnits <= 0) return 'out_of_stock';
  return availableUnits <= minimumStock ? 'low_stock' : null;
}

const branches = await firestore.collection('branches').get();
const branchNameById = new Map(branches.docs.map((branch) => [branch.id, branch.get('name')]));
const activeBranchIds = branches.docs.filter((branch) => branch.get('isActive') !== false).map((branch) => branch.id);
const products = await firestore.collection('products').get();

let createdCount = 0;
let resolvedCount = 0;
let unchangedCount = 0;
for (const product of products.docs) {
  const stockByBranch = product.get('stockByBranch') ?? {};
  for (const branchId of activeBranchIds) {
    const severity =
      product.get('isActive') === true && branchId in stockByBranch
        ? describeStockSeverity(stockByBranch[branchId], product.get('minimumStock') ?? 0)
        : null;
    const notificationReference = firestore.doc(`notifications/low-stock__${branchId}__${product.id}`);
    const notificationSnapshot = await notificationReference.get();
    const isCurrentlyActive = notificationSnapshot.exists && notificationSnapshot.get('status') === 'active';
    const notificationDetails = {
      type: 'low_stock',
      productId: product.id,
      productName: product.get('name'),
      presentation: product.get('presentation') ?? '',
      branchId,
      branchName: branchNameById.get(branchId) ?? branchId,
      availableUnits: stockByBranch[branchId] ?? 0,
      minimumStock: product.get('minimumStock') ?? 0,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (severity && !isCurrentlyActive) {
      await notificationReference.set({
        ...notificationDetails, severity, status: 'active', readByUids: [],
        createdAt: FieldValue.serverTimestamp(), resolvedAt: null,
      });
      createdCount++;
      console.log(`  + ${severity === 'out_of_stock' ? 'Agotado' : 'Stock bajo'}: ${product.get('name')} en ${notificationDetails.branchName} (${notificationDetails.availableUnits}/${notificationDetails.minimumStock})`);
    } else if (!severity && isCurrentlyActive) {
      await notificationReference.update({ ...notificationDetails, status: 'resolved', resolvedAt: FieldValue.serverTimestamp() });
      resolvedCount++;
    } else {
      unchangedCount++;
    }
  }
}
console.log(`\nNotificaciones: ${createdCount} creadas, ${resolvedCount} resueltas, ${unchangedCount} sin cambios.`);
process.exit(0);
