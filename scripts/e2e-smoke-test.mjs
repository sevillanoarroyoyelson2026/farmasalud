/**
 * Prueba de punta a punta contra el proyecto Firebase REAL y las functions locales.
 *
 *   1) npm run dev:full        (en otra terminal: app + functions en http://localhost:8888)
 *   2) npm run test:e2e
 *
 * Usa el SDK de navegador (las MISMAS reglas de Firestore que la app) y llama a las
 * functions con tokens reales. Crea usuarios y datos de prueba marcados "E2E", recorre
 * el flujo completo (compras → recepción → promoción → venta → despacho → reseña →
 * reclamo) y prueba ataques que DEBEN fallar. Al final borra todo lo que creó y
 * restaura los contadores, aunque la prueba falle.
 */
import { randomUUID } from 'node:crypto';
import { cert, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  terminate,
  updateDoc,
  where,
} from 'firebase/firestore';

process.loadEnvFile('.env');

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://localhost:8888/api';
const FIREBASE_WEB_CONFIG = {
  apiKey: 'AIzaSyAInAFZdvCLohTq6YLyvXDiTKXvX6NobSA',
  authDomain: 'farmasalud-2a366.firebaseapp.com',
  projectId: 'farmasalud-2a366',
};
const TEST_RUN_ID = Date.now().toString(36);
const TEST_PASSWORD = `E2e-${randomUUID()}`;
const TEST_BRANCH_ID = `e2e-botica-${TEST_RUN_ID}`;
const OTHER_BRANCH_ID = `e2e-otra-${TEST_RUN_ID}`;
const TEST_CATEGORY_ID = `e2e-categoria-${TEST_RUN_ID}`;
const TEST_SUPPLIER_RUC = `20${String(Date.now()).slice(-9)}`;
const COUNTER_IDS = ['orders', 'purchase_orders', 'claims'];

initializeAdminApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
const adminAuth = getAdminAuth();
const adminFirestore = getAdminFirestore();

const createdUserUids = [];
const createdDocumentPaths = [];
const createdProductIds = [];
const savedCounterValues = new Map();
let passedChecks = 0;

// ------------------------------------------------------------------ utilidades
function check(condition, description) {
  if (!condition) {
    throw new Error(`FALLÓ: ${description}`);
  }
  passedChecks++;
  console.log(`  ✔ ${description}`);
}

async function expectRejection(operation, description) {
  try {
    await operation();
  } catch {
    check(true, description);
    return;
  }
  throw new Error(`FALLÓ (debía ser rechazado): ${description}`);
}

async function createTestUser(roleName, role, branchId) {
  const testUser = await adminAuth.createUser({
    email: `e2e-${roleName}-${TEST_RUN_ID}@farmasalud.test`,
    password: TEST_PASSWORD,
    displayName: `E2E ${roleName}`,
    emailVerified: true,
  });
  createdUserUids.push(testUser.uid);
  await adminAuth.setCustomUserClaims(testUser.uid, { role, branchId });
  await adminFirestore.doc(`users/${testUser.uid}`).set({
    email: testUser.email,
    fullName: `E2E ${roleName}`,
    phone: null,
    role,
    branchId,
    isDisabled: false,
  });
  createdDocumentPaths.push(`users/${testUser.uid}`);
  return testUser;
}

/** Sesión de navegador independiente para cada rol (como tres personas distintas). */
async function openBrowserSession(testUser) {
  const firebaseApp = initializeApp(FIREBASE_WEB_CONFIG, `e2e-${testUser.uid}`);
  const firebaseAuth = getAuth(firebaseApp);
  await signInWithEmailAndPassword(firebaseAuth, testUser.email, TEST_PASSWORD);
  const firestoreDatabase = getFirestore(firebaseApp);
  const callFunction = async (functionName, requestBody) => {
    const idToken = await firebaseAuth.currentUser.getIdToken();
    const response = await fetch(`${API_BASE_URL}/${functionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(requestBody),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const invalidFieldsText = responseBody.invalidFields ? ` (campos: ${responseBody.invalidFields.join(", ")})` : "";
      const functionError = new Error(`${functionName} → HTTP ${response.status}: ${responseBody.message ?? "" }${invalidFieldsText}`);
      functionError.httpStatus = response.status;
      throw functionError;
    }
    return responseBody;
  };
  const closeSession = async () => {
    await signOut(firebaseAuth);
    await terminate(firestoreDatabase);
    await deleteApp(firebaseApp);
  };
  return { firestoreDatabase, callFunction, closeSession };
}

function futureDate(daysFromToday) {
  return new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);
}

async function readProductStock(productId, branchId) {
  return (await adminFirestore.doc(`products/${productId}`).get()).get(`stockByBranch.${branchId}`) ?? 0;
}

// ------------------------------------------------------------------ limpieza
async function deleteEverythingCreated() {
  console.log('\nLimpiando datos de prueba…');
  for (const productId of createdProductIds) {
    await adminFirestore.recursiveDelete(adminFirestore.doc(`products/${productId}`));
    const movements = await adminFirestore.collection('stock_movements').where('productId', '==', productId).get();
    await Promise.all(movements.docs.map((movement) => movement.ref.delete()));
  }
  for (const [collectionName, fieldName, fieldValue] of [
    ['orders', 'branchId', TEST_BRANCH_ID],
    ['purchase_orders', 'branchId', TEST_BRANCH_ID],
    ['receptions', 'branchId', TEST_BRANCH_ID],
    ['quotations', 'branchId', TEST_BRANCH_ID],
    ['reviews', 'branchId', TEST_BRANCH_ID],
    ['notifications', 'branchId', TEST_BRANCH_ID],
  ]) {
    const matchingDocuments = await adminFirestore.collection(collectionName).where(fieldName, '==', fieldValue).get();
    await Promise.all(matchingDocuments.docs.map((matchingDocument) => matchingDocument.ref.delete()));
  }
  for (const userUid of createdUserUids) {
    for (const [collectionName, fieldName] of [['claims', 'customerUid'], ['audit_logs', 'performedByUid']]) {
      const matchingDocuments = await adminFirestore.collection(collectionName).where(fieldName, '==', userUid).get();
      await Promise.all(matchingDocuments.docs.map((matchingDocument) => matchingDocument.ref.delete()));
    }
    const rateLimitDocuments = await adminFirestore.collection('rate_limits').get();
    await Promise.all(
      rateLimitDocuments.docs.filter((rateLimit) => rateLimit.id.includes(userUid)).map((rateLimit) => rateLimit.ref.delete()),
    );
  }
  await Promise.all(createdDocumentPaths.map((documentPath) => adminFirestore.doc(documentPath).delete()));
  await Promise.all(createdUserUids.map((userUid) => adminAuth.deleteUser(userUid)));
  for (const [counterId, savedValue] of savedCounterValues) {
    const counterReference = adminFirestore.doc(`counters/${counterId}`);
    if (savedValue === undefined) {
      await counterReference.delete();
    } else {
      await counterReference.set(savedValue);
    }
  }
  console.log('Limpieza completa: no quedan datos de prueba.');
}

// ------------------------------------------------------------------ prueba
async function runEndToEndFlow() {
  for (const counterId of COUNTER_IDS) {
    const counterSnapshot = await adminFirestore.doc(`counters/${counterId}`).get();
    savedCounterValues.set(counterId, counterSnapshot.exists ? counterSnapshot.data() : undefined);
  }

  console.log('Preparando usuarios de prueba…');
  const administratorUser = await createTestUser('admin', 'admin', null);
  const workerUser = await createTestUser('trabajador', 'worker', TEST_BRANCH_ID);
  const otherBranchWorkerUser = await createTestUser('trabajador-otra', 'worker', OTHER_BRANCH_ID);
  const customerUser = await createTestUser('cliente', 'customer', null);
  const otherCustomerUser = await createTestUser('cliente-otro', 'customer', null);

  const administrator = await openBrowserSession(administratorUser);
  const worker = await openBrowserSession(workerUser);
  const otherBranchWorker = await openBrowserSession(otherBranchWorkerUser);
  const customer = await openBrowserSession(customerUser);
  const otherCustomer = await openBrowserSession(otherCustomerUser);

  try {
    console.log('\n1. Catálogo y sucursal (admin)');
    for (const [branchId, branchName] of [[TEST_BRANCH_ID, 'E2E Botica'], [OTHER_BRANCH_ID, 'E2E Otra Botica']]) {
      await setDoc(doc(administrator.firestoreDatabase, 'branches', branchId), {
        name: branchName, address: 'Av. Prueba 123', district: 'Trujillo', phone: '044000000',
        isActive: true, offersDelivery: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      createdDocumentPaths.push(`branches/${branchId}`);
    }
    check(true, 'el admin crea sucursales (reglas validan los campos)');
    await setDoc(doc(administrator.firestoreDatabase, 'categories', TEST_CATEGORY_ID), {
      name: 'E2E Analgésicos', description: '', isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    createdDocumentPaths.push(`categories/${TEST_CATEGORY_ID}`);
    const { productId } = await administrator.callFunction('admin-save-product', {
      productId: null, name: 'E2E Paracetamol 500 mg', genericName: 'Paracetamol', presentation: 'Caja x 10',
      laboratory: 'E2E Lab', description: '', categoryId: TEST_CATEGORY_ID, price: 10, requiresPrescription: false,
      imageUrl: '', isActive: true, minimumStock: 5,
    });
    createdProductIds.push(productId);
    check(Boolean(productId), 'el admin crea un producto vía function');
    await expectRejection(
      () => updateDoc(doc(administrator.firestoreDatabase, 'products', productId), { price: 1 }),
      'nadie cambia el precio directo en Firestore (ni el admin)',
    );
    await expectRejection(
      () => customer.callFunction('admin-save-product', { productId: null }),
      'un cliente no puede llamar functions de administrador',
    );

    console.log('\n2. Compras: proveedor → cotización → orden de compra (admin)');
    await setDoc(doc(administrator.firestoreDatabase, 'suppliers', TEST_SUPPLIER_RUC), {
      name: 'E2E Droguería', ruc: TEST_SUPPLIER_RUC, contactName: '', phone: '', email: '', address: '',
      paymentTerms: 'Contado', deliveryDays: 2, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    createdDocumentPaths.push(`suppliers/${TEST_SUPPLIER_RUC}`);
    const quotationReference = await addDoc(collection(administrator.firestoreDatabase, 'quotations'), {
      title: 'E2E Reposición', branchId: TEST_BRANCH_ID,
      requestedItems: [{ productId, productName: 'E2E Paracetamol 500 mg', quantity: 30 }],
      supplierOffers: [], status: 'open', awardedSupplierId: null, purchaseOrderId: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await updateDoc(quotationReference, {
      supplierOffers: [{ supplierId: TEST_SUPPLIER_RUC, supplierName: 'E2E Droguería', deliveryDays: 2, paymentTerms: 'Contado', unitPriceByProduct: { [productId]: 4.5 } }],
      updatedAt: serverTimestamp(),
    });
    await expectRejection(
      () => updateDoc(quotationReference, { status: 'awarded', updatedAt: serverTimestamp() }),
      'adjudicar una cotización solo lo hace el servidor',
    );
    const { purchaseOrderId, orderNumber: purchaseOrderNumber } = await administrator.callFunction('create-purchase-order', {
      supplierId: TEST_SUPPLIER_RUC, branchId: TEST_BRANCH_ID, quotationId: quotationReference.id,
      expectedDeliveryDate: futureDate(2), notes: 'E2E', items: [{ productId, quantity: 30, unitCost: 4.5 }],
    });
    check(/^OC-\d{6}$/.test(purchaseOrderNumber), `orden de compra con número correlativo (${purchaseOrderNumber})`);
    check((await getDoc(quotationReference)).get('status') === 'awarded', 'la cotización queda adjudicada');

    console.log('\n3. Recepción de mercadería (trabajador de la botica)');
    await expectRejection(
      () => getDocs(query(collection(otherBranchWorker.firestoreDatabase, 'purchase_orders'), where('branchId', '==', TEST_BRANCH_ID))),
      'un trabajador de otra botica no ve sus órdenes de compra',
    );
    await expectRejection(
      () => otherBranchWorker.callFunction('register-goods-reception', {
        purchaseOrderId, incidentNotes: '',
        lines: [{ productId, lotNumber: 'E2E-X', expirationDate: futureDate(300), quantityReceived: 1, quantityRejected: 0 }],
      }),
      'un trabajador de otra botica no puede recibir la mercadería',
    );
    await worker.callFunction('register-goods-reception', {
      purchaseOrderId, incidentNotes: 'Caja dañada',
      lines: [
        { productId, lotNumber: 'E2E-L1', expirationDate: futureDate(200), quantityReceived: 15, quantityRejected: 0 },
        { productId, lotNumber: 'E2E-L2', expirationDate: futureDate(400), quantityReceived: 13, quantityRejected: 2 },
      ],
    });
    check((await readProductStock(productId, TEST_BRANCH_ID)) === 28, 'el stock sube con las 28 unidades conformes (2 rechazadas no)');
    check((await adminFirestore.doc(`purchase_orders/${purchaseOrderId}`).get()).get('status') === 'received', 'la OC queda "recibida"');

    console.log('\n4. Promoción (admin)');
    await administrator.callFunction('set-product-promotion', { productId, promotion: { discountPercent: 20, endsAt: futureDate(10) } });
    check(true, 'promoción de 20 % activada');

    console.log('\n5. Compra del cliente (pago simulado)');
    const orderIdempotencyKey = randomUUID();
    const orderRequest = {
      idempotencyKey: orderIdempotencyKey, branchId: TEST_BRANCH_ID, items: [{ productId, quantity: 20 }],
      fulfillmentType: 'pickup', deliveryAddress: null, contactPhone: '987654321', paymentMethod: 'simulated_card',
      simulatedCardLastDigits: '1111', culqiToken: null, prescriptionFile: null, customerNote: 'E2E',
    };
    const { orderId, orderNumber } = await customer.callFunction('create-order', orderRequest);
    const orderSnapshot = await adminFirestore.doc(`orders/${orderId}`).get();
    check(orderSnapshot.get('orderTotal') === 160, 'el servidor cobra el precio con descuento (20 × S/ 8.00 = S/ 160.00)');
    const allocatedLots = orderSnapshot.get('items')[0].allocatedLots.map((lot) => `${lot.lotNumber}:${lot.quantity}`);
    check(allocatedLots.join(',') === 'E2E-L1:15,E2E-L2:5', `FEFO: primero el lote que vence antes (${allocatedLots.join(', ')})`);
    check((await readProductStock(productId, TEST_BRANCH_ID)) === 8, 'el stock baja a 8');
    const repeatedOrder = await customer.callFunction('create-order', orderRequest);
    check(repeatedOrder.orderId === orderId && (await readProductStock(productId, TEST_BRANCH_ID)) === 8, 'reintentar el mismo pago no duplica el pedido');
    await expectRejection(
      () => customer.callFunction('create-order', { ...orderRequest, idempotencyKey: randomUUID(), items: [{ productId, quantity: 10 }] }),
      'no se puede comprar más de lo que hay en stock',
    );
    await expectRejection(
      () => updateDoc(doc(customer.firestoreDatabase, 'orders', orderId), { orderTotal: 1 }),
      'el cliente no puede cambiar el total de su pedido',
    );
    await expectRejection(
      () => getDoc(doc(otherCustomer.firestoreDatabase, 'orders', orderId)),
      'otro cliente no puede ver el pedido',
    );
    check((await getDoc(doc(customer.firestoreDatabase, 'orders', orderId))).exists(), `el cliente ve su pedido ${orderNumber}`);

    console.log('\n6. Atención en la botica (trabajador)');
    await expectRejection(
      () => otherBranchWorker.callFunction('update-order-status', { orderId, action: 'start_preparation', note: '', courierName: null }),
      'un trabajador de otra botica no puede atender el pedido',
    );
    for (const action of ['start_preparation', 'mark_ready_for_pickup', 'mark_delivered']) {
      await worker.callFunction('update-order-status', { orderId, action, note: '', courierName: null });
    }
    check((await adminFirestore.doc(`orders/${orderId}`).get()).get('status') === 'delivered', 'pedido preparado, listo y entregado');
    await expectRejection(
      () => customer.callFunction('update-order-status', { orderId, action: 'cancel_by_customer', note: '', courierName: null }),
      'un pedido entregado ya no se puede cancelar',
    );

    console.log('\n7. Reseña y reclamo (cliente) y respuesta (admin)');
    await expectRejection(
      () => setDoc(doc(otherCustomer.firestoreDatabase, 'reviews', orderId), {
        orderId, customerUid: otherCustomerUser.uid, branchId: TEST_BRANCH_ID, rating: 1, comment: '', createdAt: serverTimestamp(),
      }),
      'nadie califica un pedido ajeno',
    );
    await setDoc(doc(customer.firestoreDatabase, 'reviews', orderId), {
      orderId, customerUid: customerUser.uid, branchId: TEST_BRANCH_ID, rating: 5, comment: 'E2E', createdAt: serverTimestamp(),
    });
    check(true, 'el cliente califica su pedido entregado');
    const { claimId, claimNumber } = await customer.callFunction('submit-claim', {
      claimType: 'complaint', fullName: 'E2E Cliente', documentNumber: '12345678', address: 'Av. Prueba 123',
      phone: '987654321', relatedOrderNumber: orderNumber, claimedAmount: null,
      description: 'Prueba automática del libro de reclamaciones E2E.', requestedSolution: 'Ninguna, es una prueba.',
    });
    check(/^RC-\d{6}$/.test(claimNumber), `reclamo registrado con número ${claimNumber}`);
    await expectRejection(
      () => updateDoc(doc(administrator.firestoreDatabase, 'claims', claimId), { status: 'resolved' }),
      'la respuesta a reclamos solo pasa por el servidor',
    );
    await administrator.callFunction('respond-claim', { claimId, status: 'resolved', response: 'Respuesta automática de prueba E2E.' });
    check((await adminFirestore.doc(`claims/${claimId}`).get()).get('status') === 'resolved', 'el admin responde el reclamo');

    console.log('\n8. Cancelación devuelve stock a los mismos lotes');
    const { orderId: cancelledOrderId } = await customer.callFunction('create-order', {
      ...orderRequest, idempotencyKey: randomUUID(), items: [{ productId, quantity: 2 }],
    });
    check((await readProductStock(productId, TEST_BRANCH_ID)) === 6, 'segundo pedido descuenta 2 unidades');
    await customer.callFunction('update-order-status', { orderId: cancelledOrderId, action: 'cancel_by_customer', note: 'Cancelado por el cliente', courierName: null });
    check((await readProductStock(productId, TEST_BRANCH_ID)) === 8, 'al cancelar, el stock vuelve a 8');
    check((await adminFirestore.doc(`orders/${cancelledOrderId}`).get()).get('payment.status') === 'refunded', 'el pago queda como devuelto');

    console.log('\n9. Notificación de stock bajo: nace, se lee, se resuelve');
    const notificationPath = `notifications/low-stock__${TEST_BRANCH_ID}__${productId}`;
    // Stock actual 8. Subir el mínimo a 10 deja el producto bajo el mínimo → nace la alerta.
    await administrator.callFunction('admin-save-product', {
      productId, name: 'E2E Paracetamol 500 mg', genericName: 'Paracetamol', presentation: 'Caja x 10',
      laboratory: 'E2E Lab', description: '', categoryId: TEST_CATEGORY_ID, price: 10, requiresPrescription: false,
      imageUrl: '', isActive: true, minimumStock: 10,
    });
    const bornNotification = await adminFirestore.doc(notificationPath).get();
    check(bornNotification.get('status') === 'active' && bornNotification.get('availableUnits') === 8, 'nace la alerta (8 unidades, mínimo 10)');
    check(!(await adminFirestore.doc(`notifications/low-stock__${OTHER_BRANCH_ID}__${productId}`).get()).exists,
      'no se alerta en la botica que nunca tuvo el producto');
    const workerNotifications = await getDocs(query(collection(worker.firestoreDatabase, 'notifications'),
      where('status', '==', 'active'), where('branchId', '==', TEST_BRANCH_ID)));
    check(workerNotifications.docs.some((notification) => notification.id === notificationPath.split('/')[1]), 'el trabajador de la botica la ve');
    await expectRejection(
      () => getDocs(query(collection(otherBranchWorker.firestoreDatabase, 'notifications'), where('branchId', '==', TEST_BRANCH_ID))),
      'un trabajador de otra botica no la ve',
    );
    await updateDoc(doc(worker.firestoreDatabase, notificationPath), { readByUids: arrayUnion(workerUser.uid) });
    check((await adminFirestore.doc(notificationPath).get()).get('readByUids').includes(workerUser.uid), 'el trabajador la marca como leída');
    await expectRejection(
      () => updateDoc(doc(worker.firestoreDatabase, notificationPath), { status: 'resolved' }),
      'nadie la resuelve a mano desde el navegador',
    );
    // Una venta lo deja agotado → la alerta empeora y vuelve a ser "nueva" para todos.
    await customer.callFunction('create-order', { ...orderRequest, idempotencyKey: randomUUID(), items: [{ productId, quantity: 8 }] });
    const worsenedNotification = await adminFirestore.doc(notificationPath).get();
    check(worsenedNotification.get('severity') === 'out_of_stock' && worsenedNotification.get('readByUids').length === 0,
      'al agotarse, pasa a "agotado" y vuelve a ser nueva');
    // Ingreso de stock por encima del mínimo → se resuelve sola.
    await worker.callFunction('register-stock-lot', {
      productId, branchId: TEST_BRANCH_ID, lotNumber: 'E2E-L3', expirationDate: futureDate(300), quantity: 30, entryReason: 'manual_entry',
    });
    const resolvedNotification = await adminFirestore.doc(notificationPath).get();
    check(resolvedNotification.get('status') === 'resolved' && resolvedNotification.get('availableUnits') === 30,
      'al reponer 30 unidades se resuelve y sale de la campana');
  } finally {
    for (const session of [administrator, worker, otherBranchWorker, customer, otherCustomer]) {
      await session.closeSession();
    }
  }
}

let exitCode = 0;
try {
  await runEndToEndFlow();
  console.log(`\n✅ PRUEBA E2E SUPERADA: ${passedChecks} verificaciones correctas.`);
} catch (error) {
  exitCode = 1;
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
} finally {
  try {
    await deleteEverythingCreated();
  } catch (cleanupError) {
    exitCode = 1;
    console.error(`Error al limpiar: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
  }
  process.exit(exitCode);
}
