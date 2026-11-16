/**
 * Pruebas de las reglas de Firestore contra el emulador.
 * Ejecutar con:  npm run test:rules   (requiere Java 11+ para el emulador)
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let rulesTestEnvironment: RulesTestEnvironment;

const CUSTOMER_UID = 'cliente-1';
const OTHER_CUSTOMER_UID = 'cliente-2';
const WORKER_UID = 'trabajador-1';
const ADMIN_UID = 'admin-1';

function firestoreAs(uid: string, role: string, branchId: string | null = null) {
  return rulesTestEnvironment.authenticatedContext(uid, { role, branchId }).firestore();
}

beforeAll(async () => {
  rulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'demo-farmasalud-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

beforeEach(async () => {
  await rulesTestEnvironment.clearFirestore();
  await rulesTestEnvironment.withSecurityRulesDisabled(async (adminContext) => {
    const seedDatabase = adminContext.firestore();
    await setDoc(doc(seedDatabase, 'users', CUSTOMER_UID), { role: 'customer', fullName: 'Ana', phone: null });
    await setDoc(doc(seedDatabase, 'users', OTHER_CUSTOMER_UID), { role: 'customer', fullName: 'Luis' });
    await setDoc(doc(seedDatabase, 'products', 'paracetamol'), { name: 'Paracetamol', price: 2.5, isActive: true });
    await setDoc(doc(seedDatabase, 'products', 'descontinuado'), { name: 'Antiguo', price: 1, isActive: false });
    await setDoc(doc(seedDatabase, 'products/paracetamol/lots', 'lote-1'), { branchId: 'el-bosque', quantity: 10 });
    await setDoc(doc(seedDatabase, 'audit_logs', 'log-1'), { action: 'user.created' });
  });
});

afterAll(async () => {
  await rulesTestEnvironment.cleanup();
});

describe('usuarios', () => {
  it('un cliente lee su propio perfil pero no el de otro', async () => {
    const customerDatabase = firestoreAs(CUSTOMER_UID, 'customer');
    await assertSucceeds(getDoc(doc(customerDatabase, 'users', CUSTOMER_UID)));
    await assertFails(getDoc(doc(customerDatabase, 'users', OTHER_CUSTOMER_UID)));
  });

  it('un cliente NO puede cambiarse el rol a admin', async () => {
    const customerDatabase = firestoreAs(CUSTOMER_UID, 'customer');
    await assertFails(updateDoc(doc(customerDatabase, 'users', CUSTOMER_UID), { role: 'admin' }));
  });

  it('un cliente puede actualizar su celular con formato válido', async () => {
    const customerDatabase = firestoreAs(CUSTOMER_UID, 'customer');
    await assertSucceeds(updateDoc(doc(customerDatabase, 'users', CUSTOMER_UID), { phone: '987654321' }));
    await assertFails(updateDoc(doc(customerDatabase, 'users', CUSTOMER_UID), { phone: 'no-es-un-celular' }));
  });

  it('nadie crea perfiles desde el navegador (lo hace el servidor)', async () => {
    const newUserDatabase = firestoreAs('nuevo', 'customer');
    await assertFails(setDoc(doc(newUserDatabase, 'users', 'nuevo'), { role: 'customer' }));
  });
});

describe('catálogo y stock', () => {
  it('el público lee productos activos, pero no los inactivos', async () => {
    const visitorDatabase = rulesTestEnvironment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(visitorDatabase, 'products', 'paracetamol')));
    await assertFails(getDoc(doc(visitorDatabase, 'products', 'descontinuado')));
    await assertSucceeds(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'el-bosque'), 'products', 'descontinuado')));
  });

  it('nadie edita productos desde el navegador (precio y stock van por la function)', async () => {
    await assertFails(updateDoc(doc(firestoreAs(CUSTOMER_UID, 'customer'), 'products', 'paracetamol'), { price: 0.1 }));
    await assertFails(updateDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'products', 'paracetamol'), { price: 2.8 }));
  });

  it('solo el admin crea sucursales y con datos válidos', async () => {
    const validBranch = {
      name: 'Botica Centro',
      address: 'Jr. Pizarro 500',
      district: 'Trujillo',
      phone: '044000003',
      isActive: true,
      offersDelivery: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await assertFails(setDoc(doc(firestoreAs(WORKER_UID, 'worker', 'el-bosque'), 'branches', 'centro'), validBranch));
    await assertSucceeds(setDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'branches', 'centro'), validBranch));
    await assertFails(
      setDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'branches', 'otra'), { ...validBranch, isActive: 'si', extra: 1 }),
    );
  });

  it('el trabajador lee lotes de su sucursal pero no de otra', async () => {
    const lotReference = 'products/paracetamol/lots/lote-1';
    await assertSucceeds(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'el-bosque'), lotReference)));
    await assertFails(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'la-esperanza'), lotReference)));
    await assertFails(getDoc(doc(firestoreAs(CUSTOMER_UID, 'customer'), lotReference)));
  });

  it('nadie modifica el stock de un lote desde el navegador, ni siquiera el admin', async () => {
    const lotReference = 'products/paracetamol/lots/lote-1';
    await assertFails(updateDoc(doc(firestoreAs(ADMIN_UID, 'admin'), lotReference), { quantity: 999 }));
  });
});

describe('pedidos', () => {
  beforeEach(async () => {
    await rulesTestEnvironment.withSecurityRulesDisabled(async (adminContext) => {
      await setDoc(doc(adminContext.firestore(), 'orders', 'pedido-1'), {
        customerUid: CUSTOMER_UID,
        branchId: 'el-bosque',
        orderTotal: 20,
        status: 'confirmed',
      });
    });
  });

  it('el cliente ve su pedido, otro cliente no', async () => {
    await assertSucceeds(getDoc(doc(firestoreAs(CUSTOMER_UID, 'customer'), 'orders', 'pedido-1')));
    await assertFails(getDoc(doc(firestoreAs(OTHER_CUSTOMER_UID, 'customer'), 'orders', 'pedido-1')));
  });

  it('solo el personal de la sucursal del pedido lo ve', async () => {
    await assertSucceeds(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'el-bosque'), 'orders', 'pedido-1')));
    await assertFails(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'la-esperanza'), 'orders', 'pedido-1')));
  });

  it('nadie cambia el total ni el estado desde el navegador', async () => {
    await assertFails(updateDoc(doc(firestoreAs(CUSTOMER_UID, 'customer'), 'orders', 'pedido-1'), { orderTotal: 1 }));
    await assertFails(updateDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'orders', 'pedido-1'), { status: 'delivered' }));
  });
});

describe('compras, reclamos y reseñas', () => {
  beforeEach(async () => {
    await rulesTestEnvironment.withSecurityRulesDisabled(async (adminContext) => {
      const seedDatabase = adminContext.firestore();
      await setDoc(doc(seedDatabase, 'purchase_orders', 'oc-1'), { branchId: 'el-bosque', status: 'issued', orderTotal: 100 });
      await setDoc(doc(seedDatabase, 'claims', 'reclamo-1'), { customerUid: CUSTOMER_UID, status: 'open', response: '' });
      await setDoc(doc(seedDatabase, 'orders', 'pedido-entregado'), { customerUid: CUSTOMER_UID, branchId: 'el-bosque', status: 'delivered' });
      await setDoc(doc(seedDatabase, 'orders', 'pedido-en-curso'), { customerUid: CUSTOMER_UID, branchId: 'el-bosque', status: 'preparing' });
    });
  });

  it('las órdenes de compra solo las ve el personal de esa botica y nadie las escribe', async () => {
    await assertSucceeds(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'el-bosque'), 'purchase_orders', 'oc-1')));
    await assertFails(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'la-esperanza'), 'purchase_orders', 'oc-1')));
    await assertFails(getDoc(doc(firestoreAs(CUSTOMER_UID, 'customer'), 'purchase_orders', 'oc-1')));
    await assertFails(updateDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'purchase_orders', 'oc-1'), { status: 'received' }));
  });

  it('solo el admin registra proveedores y con RUC válido', async () => {
    const validSupplier = {
      name: 'Droguería Norte', ruc: '20123456789', contactName: '', phone: '', email: '', address: '',
      paymentTerms: 'Contado', deliveryDays: 3, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    };
    await assertFails(setDoc(doc(firestoreAs(WORKER_UID, 'worker', 'el-bosque'), 'suppliers', '20123456789'), validSupplier));
    await assertFails(setDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'suppliers', 'malo'), { ...validSupplier, ruc: '123' }));
    await assertSucceeds(setDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'suppliers', '20123456789'), validSupplier));
  });

  it('el reclamo lo ve su dueño y nadie lo modifica desde el navegador', async () => {
    await assertSucceeds(getDoc(doc(firestoreAs(CUSTOMER_UID, 'customer'), 'claims', 'reclamo-1')));
    await assertFails(getDoc(doc(firestoreAs(OTHER_CUSTOMER_UID, 'customer'), 'claims', 'reclamo-1')));
    await assertFails(updateDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'claims', 'reclamo-1'), { status: 'resolved' }));
  });

  it('solo se califica un pedido propio y ya entregado', async () => {
    const reviewFor = (orderId: string, customerUid: string) => ({
      orderId, customerUid, branchId: 'el-bosque', rating: 5, comment: 'Excelente', createdAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(firestoreAs(CUSTOMER_UID, 'customer'), 'reviews', 'pedido-entregado'), reviewFor('pedido-entregado', CUSTOMER_UID)));
    await assertFails(setDoc(doc(firestoreAs(CUSTOMER_UID, 'customer'), 'reviews', 'pedido-en-curso'), reviewFor('pedido-en-curso', CUSTOMER_UID)));
    await assertFails(setDoc(doc(firestoreAs(OTHER_CUSTOMER_UID, 'customer'), 'reviews', 'pedido-entregado'), reviewFor('pedido-entregado', OTHER_CUSTOMER_UID)));
  });
});

describe('notificaciones de stock bajo', () => {
  const notificationPath = 'notifications/low-stock__el-bosque__paracetamol';
  beforeEach(async () => {
    await rulesTestEnvironment.withSecurityRulesDisabled(async (adminContext) => {
      await setDoc(doc(adminContext.firestore(), notificationPath), {
        branchId: 'el-bosque', productId: 'paracetamol', status: 'active', availableUnits: 3, readByUids: [],
      });
    });
  });

  it('solo el personal de esa botica (y el admin) la ve', async () => {
    await assertSucceeds(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'el-bosque'), notificationPath)));
    await assertSucceeds(getDoc(doc(firestoreAs(ADMIN_UID, 'admin'), notificationPath)));
    await assertFails(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'la-esperanza'), notificationPath)));
    await assertFails(getDoc(doc(firestoreAs(CUSTOMER_UID, 'customer'), notificationPath)));
  });

  it('el trabajador la marca como leída solo en su propio nombre', async () => {
    const workerDatabase = firestoreAs(WORKER_UID, 'worker', 'el-bosque');
    await assertSucceeds(updateDoc(doc(workerDatabase, notificationPath), { readByUids: [WORKER_UID] }));
    await assertFails(updateDoc(doc(workerDatabase, notificationPath), { readByUids: [WORKER_UID, 'otro-usuario'] }));
  });

  it('nadie la resuelve, crea ni cambia sus cifras desde el navegador', async () => {
    const adminDatabase = firestoreAs(ADMIN_UID, 'admin');
    await assertFails(updateDoc(doc(adminDatabase, notificationPath), { status: 'resolved' }));
    await assertFails(updateDoc(doc(adminDatabase, notificationPath), { availableUnits: 99 }));
    await assertFails(setDoc(doc(adminDatabase, 'notifications/falsa'), { branchId: 'el-bosque', status: 'active' }));
  });
});

describe('auditoría', () => {
  it('solo el admin lee la auditoría y nadie la escribe', async () => {
    await assertSucceeds(getDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'audit_logs', 'log-1')));
    await assertFails(getDoc(doc(firestoreAs(WORKER_UID, 'worker', 'el-bosque'), 'audit_logs', 'log-1')));
    await assertFails(setDoc(doc(firestoreAs(ADMIN_UID, 'admin'), 'audit_logs', 'log-2'), { action: 'falso' }));
  });
});
