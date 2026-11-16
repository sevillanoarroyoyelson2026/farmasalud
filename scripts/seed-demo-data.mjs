/**
 * Carga DATOS FICTICIOS de demostración en el proyecto Firebase real.
 *   node scripts/seed-demo-data.mjs
 *
 * - Respeta lo que ya existe (sucursales y el administrador); se niega a correr si ya hay productos.
 * - Todo es coherente: el stock sale de lotes, los pedidos descuentan lotes por FEFO y dejan
 *   movimientos, los correlativos (FS-, OC-, RC-) coinciden con sus contadores.
 * - Las imágenes de productos quedan VACÍAS para cargarlas desde el panel.
 * - Empresas, laboratorios y personas son inventados.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

process.loadEnvFile('.env');
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
const adminAuth = getAuth();
const firestore = getFirestore();
const bulkWriter = firestore.bulkWriter();

// ------------------------------------------------------------------ utilidades
let randomSeed = 20261116;
/** Pseudoaleatorio con semilla fija: la demo es igual cada vez que se genera. */
function nextRandom() {
  randomSeed = (randomSeed + 0x6d2b79f5) | 0;
  let mixed = Math.imul(randomSeed ^ (randomSeed >>> 15), 1 | randomSeed);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}
function randomInteger(minimum, maximum) {
  return minimum + Math.floor(nextRandom() * (maximum - minimum + 1));
}
function pickRandom(options) {
  return options[Math.floor(nextRandom() * options.length)];
}
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const now = Date.now();
const daysFromNow = (days) => new Date(now + days * DAY_MS);
const roundToCents = (amount) => Math.round(amount * 100) / 100;
const timestampOf = (date) => Timestamp.fromDate(date);
const formatSequentialNumber = (prefix, number) => `${prefix}-${String(number).padStart(6, '0')}`;
/** Las escrituras se acumulan y se envían al final: si algo falla antes, no queda nada a medias. */
const pendingWrites = [];
function writeDocument(documentPath, documentData) {
  pendingWrites.push([documentPath, documentData]);
}

// ------------------------------------------------------------------ catálogo base
const NEW_BRANCHES = [
  { id: 'botica-centro-historico', name: 'Botica Centro Histórico', address: 'Jr. Pizarro 512', district: 'Trujillo', phone: '044201845', offersDelivery: true },
  { id: 'botica-la-esperanza', name: 'Botica La Esperanza', address: 'Av. José Gabriel Condorcanqui 1350', district: 'La Esperanza', phone: '044287310', offersDelivery: true },
  { id: 'botica-victor-larco', name: 'Botica Víctor Larco', address: 'Av. Larco 1120', district: 'Víctor Larco Herrera', phone: '044284522', offersDelivery: true },
  { id: 'botica-florencia-de-mora', name: 'Botica Florencia de Mora', address: 'Calle Los Cedros 245', district: 'Florencia de Mora', phone: '044296074', offersDelivery: false },
];

const CATEGORIES = [
  { id: 'analgesicos', name: 'Analgésicos y antiinflamatorios', description: 'Alivio del dolor, fiebre e inflamación.' },
  { id: 'antibioticos', name: 'Antibióticos', description: 'Venta solo con receta médica.' },
  { id: 'antigripales', name: 'Antigripales y respiratorio', description: 'Resfríos, tos y alergias.' },
  { id: 'vitaminas', name: 'Vitaminas y suplementos', description: 'Refuerzo de defensas y energía.' },
  { id: 'cuidado-personal', name: 'Cuidado personal', description: 'Higiene, piel y protección solar.' },
  { id: 'bebes-y-mama', name: 'Bebés y mamá', description: 'Cuidado del bebé y la madre.' },
  { id: 'primeros-auxilios', name: 'Primeros auxilios', description: 'Botiquín y curaciones.' },
];

const PRODUCTS = [
  { id: 'paracetamol-500-x100', name: 'Paracetamol 500 mg', genericName: 'Paracetamol', presentation: 'Caja x 100 tabletas', laboratory: 'Andes Farma', categoryId: 'analgesicos', price: 12.5, minimumStock: 15, requiresPrescription: false, description: 'Analgésico y antipirético para dolor leve a moderado y fiebre.' },
  { id: 'ibuprofeno-400-x100', name: 'Ibuprofeno 400 mg', genericName: 'Ibuprofeno', presentation: 'Caja x 100 tabletas', laboratory: 'Pharma Norte', categoryId: 'analgesicos', price: 18.9, minimumStock: 12, requiresPrescription: false, description: 'Antiinflamatorio no esteroideo para dolor e inflamación.' },
  { id: 'naproxeno-550-x10', name: 'Naproxeno sódico 550 mg', genericName: 'Naproxeno', presentation: 'Blíster x 10 tabletas', laboratory: 'Lab. Chimú', categoryId: 'analgesicos', price: 7.8, minimumStock: 10, requiresPrescription: false, description: 'Alivio prolongado de dolores musculares y menstruales.' },
  { id: 'diclofenaco-gel-50g', name: 'Diclofenaco gel 1 %', genericName: 'Diclofenaco', presentation: 'Tubo x 50 g', laboratory: 'Andes Farma', categoryId: 'analgesicos', price: 14.5, minimumStock: 8, requiresPrescription: false, description: 'Gel tópico para golpes, torceduras y dolor muscular.' },
  { id: 'amoxicilina-500-x100', name: 'Amoxicilina 500 mg', genericName: 'Amoxicilina', presentation: 'Caja x 100 cápsulas', laboratory: 'Pharma Norte', categoryId: 'antibioticos', price: 32.0, minimumStock: 10, requiresPrescription: true, description: 'Antibiótico de amplio espectro. Requiere receta médica.' },
  { id: 'azitromicina-500-x3', name: 'Azitromicina 500 mg', genericName: 'Azitromicina', presentation: 'Caja x 3 tabletas', laboratory: 'Vitalis Lab', categoryId: 'antibioticos', price: 15.9, minimumStock: 8, requiresPrescription: true, description: 'Antibiótico macrólido. Requiere receta médica.' },
  { id: 'cefalexina-500-x10', name: 'Cefalexina 500 mg', genericName: 'Cefalexina', presentation: 'Blíster x 10 cápsulas', laboratory: 'Lab. Chimú', categoryId: 'antibioticos', price: 9.5, minimumStock: 8, requiresPrescription: true, description: 'Antibiótico cefalosporínico. Requiere receta médica.' },
  { id: 'antigripal-noche-x12', name: 'Antigripal Noche', genericName: 'Paracetamol + Clorfenamina + Fenilefrina', presentation: 'Caja x 12 tabletas', laboratory: 'Andes Farma', categoryId: 'antigripales', price: 9.9, minimumStock: 15, requiresPrescription: false, description: 'Alivio de síntomas de gripe y resfrío para descansar mejor.' },
  { id: 'loratadina-10-x10', name: 'Loratadina 10 mg', genericName: 'Loratadina', presentation: 'Blíster x 10 tabletas', laboratory: 'Pharma Norte', categoryId: 'antigripales', price: 5.5, minimumStock: 12, requiresPrescription: false, description: 'Antihistamínico para alergias que no produce somnolencia.' },
  { id: 'jarabe-ambroxol-120', name: 'Ambroxol jarabe 30 mg/5 ml', genericName: 'Ambroxol', presentation: 'Frasco x 120 ml', laboratory: 'Vitalis Lab', categoryId: 'antigripales', price: 11.2, minimumStock: 10, requiresPrescription: false, description: 'Mucolítico para tos con flema.' },
  { id: 'vitamina-c-1000-x30', name: 'Vitamina C 1000 mg', genericName: 'Ácido ascórbico', presentation: 'Tubo x 30 tabletas efervescentes', laboratory: 'Vitalis Lab', categoryId: 'vitaminas', price: 24.9, minimumStock: 10, requiresPrescription: false, description: 'Refuerza las defensas. Sabor naranja.' },
  { id: 'multivitaminico-adulto-x60', name: 'Multivitamínico adulto', genericName: 'Vitaminas y minerales', presentation: 'Frasco x 60 cápsulas', laboratory: 'Vitalis Lab', categoryId: 'vitaminas', price: 45.0, minimumStock: 6, requiresPrescription: false, description: 'Complejo de 23 vitaminas y minerales para el día a día.' },
  { id: 'protector-solar-fps50', name: 'Protector solar FPS 50+', genericName: 'Filtros UVA/UVB', presentation: 'Frasco x 120 ml', laboratory: 'Derma Costa', categoryId: 'cuidado-personal', price: 49.9, minimumStock: 6, requiresPrescription: false, description: 'Protección muy alta, resistente al agua. Para todo tipo de piel.' },
  { id: 'alcohol-gel-500', name: 'Alcohol en gel 70 %', genericName: 'Alcohol etílico', presentation: 'Frasco x 500 ml', laboratory: 'Insumos La Libertad', categoryId: 'cuidado-personal', price: 13.5, minimumStock: 10, requiresPrescription: false, description: 'Desinfectante de manos con glicerina.' },
  { id: 'panales-talla-m-x40', name: 'Pañales talla M', genericName: 'Pañal desechable', presentation: 'Paquete x 40 unidades', laboratory: 'Bebé Feliz', categoryId: 'bebes-y-mama', price: 39.9, minimumStock: 8, requiresPrescription: false, description: 'Para bebés de 6 a 10 kg, con indicador de humedad.' },
  { id: 'suero-oral-500', name: 'Suero de rehidratación oral', genericName: 'Sales de rehidratación', presentation: 'Botella x 500 ml', laboratory: 'Andes Farma', categoryId: 'bebes-y-mama', price: 6.5, minimumStock: 12, requiresPrescription: false, description: 'Repone líquidos y electrolitos. Sabor fresa.' },
  { id: 'gasas-esteriles-x10', name: 'Gasas estériles 10 x 10 cm', genericName: 'Gasa de algodón', presentation: 'Sobre x 10 unidades', laboratory: 'Insumos La Libertad', categoryId: 'primeros-auxilios', price: 4.2, minimumStock: 15, requiresPrescription: false, description: 'Para limpieza y cobertura de heridas.' },
  { id: 'agua-oxigenada-120', name: 'Agua oxigenada 10 vol.', genericName: 'Peróxido de hidrógeno', presentation: 'Frasco x 120 ml', laboratory: 'Insumos La Libertad', categoryId: 'primeros-auxilios', price: 3.5, minimumStock: 12, requiresPrescription: false, description: 'Antiséptico para limpieza de heridas leves.' },
];

const PROMOTED_PRODUCTS = [
  { productId: 'vitamina-c-1000-x30', discountPercent: 20, endsInDays: 14 },
  { productId: 'protector-solar-fps50', discountPercent: 15, endsInDays: 21 },
  { productId: 'antigripal-noche-x12', discountPercent: 10, endsInDays: 7 },
];

const SUPPLIERS = [
  { ruc: '20481537926', name: 'Droguería Santa Rosa del Norte S.A.C.', contactName: 'Lucía Paredes', phone: '044245118', email: 'ventas@santarosanorte.example', address: 'Av. América Sur 1450, Trujillo', paymentTerms: 'Crédito 30 días', deliveryDays: 2 },
  { ruc: '20539871640', name: 'Distribuidora Farmacéutica Chimú S.A.C.', contactName: 'Jorge Alvarado', phone: '044221907', email: 'pedidos@chimufarma.example', address: 'Calle Bolognesi 330, Trujillo', paymentTerms: 'Contado', deliveryDays: 1 },
  { ruc: '20601284735', name: 'Laboratorios Moche Pharma S.A.C.', contactName: 'Rosa Medina', phone: '014702236', email: 'comercial@mochepharma.example', address: 'Av. Argentina 2850, Lima', paymentTerms: 'Crédito 45 días', deliveryDays: 4 },
  { ruc: '10457829361', name: 'Insumos Médicos La Libertad E.I.R.L.', contactName: 'Pedro Castillo Ruiz', phone: '948772104', email: 'insumoslalibertad@example.com', address: 'Av. Perú 980, La Esperanza', paymentTerms: 'Contado', deliveryDays: 1 },
];

const DEMO_PASSWORD = `Demo-${randomBytes(4).toString('hex')}-2026`;
const DEMO_STAFF = [
  { email: 'trabajador.elbosque@farmasalud.test', fullName: 'Rosa Gutiérrez (Q.F.)', branchId: 'el-bosque' },
  { email: 'trabajador.elmolino@farmasalud.test', fullName: 'Luis Mendoza', branchId: 'el-molino' },
  { email: 'trabajador.centro@farmasalud.test', fullName: 'Carmen Villanueva', branchId: 'botica-centro-historico' },
];
const DEMO_CUSTOMERS = [
  { email: 'maria.quispe@farmasalud.test', fullName: 'María Quispe Rojas', phone: '987451236' },
  { email: 'carlos.rodriguez@farmasalud.test', fullName: 'Carlos Rodríguez Vega', phone: '956321478' },
  { email: 'ana.torres@farmasalud.test', fullName: 'Ana Torres Lozano', phone: '941258763' },
];
const COURIERS = ['Juan Pérez', 'Miguel Sánchez', 'Diego Ramírez'];

// ------------------------------------------------------------------ estado en memoria
/** lotsByKey["productId|branchId"] = lotes con cantidades vivas, para asignar FEFO a los pedidos. */
const lotsByKey = new Map();
const stockByProduct = new Map(PRODUCTS.map((product) => [product.id, {}]));
const productById = new Map(PRODUCTS.map((product) => [product.id, product]));

function addLot(productId, branchId, lotNumber, expirationDate, quantity, reason, receivedAt, sourceDocumentId, performedByUid) {
  const lotId = firestore.collection('products').doc().id;
  const lot = { lotId, productId, branchId, lotNumber, expirationDate, quantityAvailable: quantity, quantityReceived: quantity, createdAt: receivedAt };
  const lotKey = `${productId}|${branchId}`;
  lotsByKey.set(lotKey, [...(lotsByKey.get(lotKey) ?? []), lot]);
  const productStock = stockByProduct.get(productId);
  productStock[branchId] = (productStock[branchId] ?? 0) + quantity;
  writeDocument(`stock_movements/${firestore.collection('stock_movements').doc().id}`, {
    productId, branchId, lotId, lotNumber, movementType: 'entry', reason, quantity, sourceDocumentId,
    performedByUid, createdAt: timestampOf(receivedAt),
  });
  return lot;
}

function reserveLotsFefo(productId, branchId, quantity) {
  const sellableLots = (lotsByKey.get(`${productId}|${branchId}`) ?? [])
    .filter((lot) => lot.quantityAvailable > 0 && lot.expirationDate.getTime() > now + 7 * DAY_MS)
    .sort((firstLot, secondLot) => firstLot.expirationDate - secondLot.expirationDate);
  const allocations = [];
  let pendingQuantity = quantity;
  for (const lot of sellableLots) {
    if (pendingQuantity === 0) break;
    const takenQuantity = Math.min(lot.quantityAvailable, pendingQuantity);
    allocations.push({ lot, quantity: takenQuantity });
    pendingQuantity -= takenQuantity;
  }
  if (pendingQuantity > 0) return null;
  for (const allocation of allocations) {
    allocation.lot.quantityAvailable -= allocation.quantity;
  }
  stockByProduct.get(productId)[branchId] -= quantity;
  return allocations;
}

// ------------------------------------------------------------------ ejecución
const existingProducts = await firestore.collection('products').limit(1).get();
if (!existingProducts.empty) {
  console.error('Ya hay productos en la base de datos: no se cargan datos de demostración para no duplicar.');
  process.exit(1);
}
const existingBranches = await firestore.collection('branches').get();
const administratorSnapshot = await firestore.collection('users').where('role', '==', 'admin').limit(1).get();
const administratorUid = administratorSnapshot.docs[0]?.id ?? 'seed-script';

console.log('1/9 Sucursales y categorías…');
for (const branch of NEW_BRANCHES) {
  const { id: branchId, ...branchFields } = branch;
  writeDocument(`branches/${branchId}`, { ...branchFields, isActive: true, createdAt: timestampOf(daysFromNow(-60)), updatedAt: timestampOf(daysFromNow(-60)) });
}
const allBranchIds = [...existingBranches.docs.map((branchDocument) => branchDocument.id), ...NEW_BRANCHES.map((branch) => branch.id)];
const branchNameById = new Map([
  ...existingBranches.docs.map((branchDocument) => [branchDocument.id, branchDocument.get('name')]),
  ...NEW_BRANCHES.map((branch) => [branch.id, branch.name]),
]);
for (const category of CATEGORIES) {
  const { id: categoryId, ...categoryFields } = category;
  writeDocument(`categories/${categoryId}`, { ...categoryFields, isActive: true, createdAt: timestampOf(daysFromNow(-60)), updatedAt: timestampOf(daysFromNow(-60)) });
}

console.log('2/9 Proveedores…');
for (const supplier of SUPPLIERS) {
  writeDocument(`suppliers/${supplier.ruc}`, { ...supplier, isActive: true, createdAt: timestampOf(daysFromNow(-55)), updatedAt: timestampOf(daysFromNow(-55)) });
}

console.log('3/9 Usuarios de demostración…');
async function createDemoUser(demoUser, role, branchId) {
  let firebaseUser;
  try {
    firebaseUser = await adminAuth.getUserByEmail(demoUser.email);
    await adminAuth.updateUser(firebaseUser.uid, { password: DEMO_PASSWORD, emailVerified: true });
  } catch {
    firebaseUser = await adminAuth.createUser({ email: demoUser.email, password: DEMO_PASSWORD, displayName: demoUser.fullName, emailVerified: true });
  }
  await adminAuth.setCustomUserClaims(firebaseUser.uid, { role, branchId });
  writeDocument(`users/${firebaseUser.uid}`, {
    email: demoUser.email, fullName: demoUser.fullName, phone: demoUser.phone ?? null, role, branchId, isDisabled: false,
    signInProvider: 'password', createdAt: timestampOf(daysFromNow(-45)), updatedAt: timestampOf(daysFromNow(-45)),
    ...(role === 'customer' ? { privacyConsent: { policyVersion: '2026-11', acceptedAt: timestampOf(daysFromNow(-45)) } } : {}),
  });
  return { ...demoUser, uid: firebaseUser.uid, branchId };
}
const staffUsers = [];
for (const staffMember of DEMO_STAFF) staffUsers.push(await createDemoUser(staffMember, 'worker', staffMember.branchId));
const customerUsers = [];
for (const customer of DEMO_CUSTOMERS) customerUsers.push(await createDemoUser(customer, 'customer', null));
const workerUidByBranch = new Map(staffUsers.map((staffUser) => [staffUser.branchId, staffUser.uid]));

console.log('4/9 Stock inicial por lotes (todas las boticas)…');
let lotSequence = 100;
for (const product of PRODUCTS) {
  for (const branchId of allBranchIds) {
    const lotCount = branchId === 'el-bosque' || branchId === 'el-molino' ? 2 : 1;
    for (let lotIndex = 0; lotIndex < lotCount; lotIndex++) {
      // Algunos lotes vencen pronto (aparecen en "Lotes por vencer"); el resto entre 6 y 24 meses.
      const isNearExpiration = nextRandom() < 0.12;
      const expirationDate = daysFromNow(isNearExpiration ? randomInteger(25, 85) : randomInteger(180, 720));
      // Algunas boticas quedan con poco stock para que haya alertas de reposición.
      // El primer lote de las boticas con pedidos de demo siempre tiene stock suficiente.
      const mustHaveEnoughStock = lotIndex === 0 && ['el-bosque', 'el-molino', 'botica-centro-historico'].includes(branchId);
      const quantity = !mustHaveEnoughStock && nextRandom() < 0.15 ? randomInteger(1, Math.max(product.minimumStock - 3, 2)) : randomInteger(20, 80);
      addLot(product.id, branchId, `L${2026}${String(++lotSequence).padStart(4, '0')}`, expirationDate, quantity, 'initial_stock',
        daysFromNow(-50), null, administratorUid);
    }
  }
}

console.log('5/9 Cotizaciones, órdenes de compra y recepciones…');
const purchaseOrders = [];
function createPurchaseOrder({ supplier, branchId, quotationId, items, createdDaysAgo, expectedInDays, status, notes }) {
  const purchaseOrderId = firestore.collection('purchase_orders').doc().id;
  const orderNumber = formatSequentialNumber('OC', purchaseOrders.length + 1);
  const purchaseOrderItems = items.map((item) => {
    const product = productById.get(item.productId);
    return {
      productId: item.productId, productName: product.name, presentation: product.presentation,
      quantityOrdered: item.quantity, quantityReceived: 0, quantityRejected: 0, unitCost: item.unitCost,
      subtotal: roundToCents(item.unitCost * item.quantity),
    };
  });
  const purchaseOrder = {
    id: purchaseOrderId, orderNumber, supplierId: supplier.ruc, supplierName: supplier.name, supplierRuc: supplier.ruc,
    branchId, branchName: branchNameById.get(branchId), quotationId, items: purchaseOrderItems,
    orderTotal: roundToCents(purchaseOrderItems.reduce((total, item) => total + item.subtotal, 0)),
    expectedDeliveryDate: timestampOf(daysFromNow(expectedInDays)), notes, status, cancellationReason: '',
    createdByUid: administratorUid, createdAt: timestampOf(daysFromNow(-createdDaysAgo)), updatedAt: timestampOf(daysFromNow(-createdDaysAgo)),
  };
  purchaseOrders.push(purchaseOrder);
  return purchaseOrder;
}
function receivePurchaseOrder(purchaseOrder, receivedDaysAgo, receptionLines, incidentNotes) {
  const receivedAt = daysFromNow(-receivedDaysAgo);
  const receptionId = firestore.collection('receptions').doc().id;
  for (const receptionLine of receptionLines) {
    const orderItem = purchaseOrder.items.find((item) => item.productId === receptionLine.productId);
    orderItem.quantityReceived += receptionLine.quantityReceived;
    orderItem.quantityRejected += receptionLine.quantityRejected;
    if (receptionLine.quantityReceived > 0) {
      addLot(receptionLine.productId, purchaseOrder.branchId, receptionLine.lotNumber, daysFromNow(receptionLine.expiresInDays),
        receptionLine.quantityReceived, 'purchase_reception', receivedAt, purchaseOrder.id, workerUidByBranch.get(purchaseOrder.branchId) ?? administratorUid);
    }
  }
  const totalRejectedUnits = receptionLines.reduce((total, line) => total + line.quantityRejected, 0);
  writeDocument(`receptions/${receptionId}`, {
    purchaseOrderId: purchaseOrder.id, purchaseOrderNumber: purchaseOrder.orderNumber, supplierName: purchaseOrder.supplierName,
    branchId: purchaseOrder.branchId,
    lines: receptionLines.map((line) => ({
      productId: line.productId, productName: productById.get(line.productId).name, lotNumber: line.lotNumber,
      expirationDate: daysFromNow(line.expiresInDays).toISOString().slice(0, 10),
      quantityReceived: line.quantityReceived, quantityRejected: line.quantityRejected,
    })),
    hasIncidents: totalRejectedUnits > 0 || incidentNotes.length > 0, incidentNotes,
    receivedByUid: workerUidByBranch.get(purchaseOrder.branchId) ?? administratorUid, createdAt: timestampOf(receivedAt),
  });
  const isFullyReceived = purchaseOrder.items.every((item) => item.quantityReceived + item.quantityRejected >= item.quantityOrdered);
  purchaseOrder.status = isFullyReceived ? 'received' : 'partially_received';
  purchaseOrder.updatedAt = timestampOf(receivedAt);
}

// Cotización adjudicada → OC recibida completa (con incidencia) en El Bosque.
const awardedQuotationId = firestore.collection('quotations').doc().id;
const awardedQuotationItems = [
  { productId: 'antigripal-noche-x12', quantity: 60 },
  { productId: 'loratadina-10-x10', quantity: 40 },
  { productId: 'jarabe-ambroxol-120', quantity: 30 },
];
const awardedOffers = [
  { supplier: SUPPLIERS[0], deliveryDays: 2, paymentTerms: 'Crédito 30 días', prices: { 'antigripal-noche-x12': 5.2, 'loratadina-10-x10': 2.4, 'jarabe-ambroxol-120': 6.1 } },
  { supplier: SUPPLIERS[1], deliveryDays: 1, paymentTerms: 'Contado', prices: { 'antigripal-noche-x12': 5.45, 'loratadina-10-x10': 2.3, 'jarabe-ambroxol-120': 6.4 } },
  { supplier: SUPPLIERS[2], deliveryDays: 4, paymentTerms: 'Crédito 45 días', prices: { 'antigripal-noche-x12': 5.0, 'loratadina-10-x10': 2.6 } },
];
const awardedPurchaseOrder = createPurchaseOrder({
  supplier: SUPPLIERS[0], branchId: 'el-bosque', quotationId: awardedQuotationId, createdDaysAgo: 20, expectedInDays: -18, status: 'issued',
  notes: 'Generada desde la cotización "Reposición antigripales – temporada de frío".',
  items: awardedQuotationItems.map((item) => ({ ...item, unitCost: awardedOffers[0].prices[item.productId] })),
});
receivePurchaseOrder(awardedPurchaseOrder, 18, [
  { productId: 'antigripal-noche-x12', lotNumber: 'AF2611A', expiresInDays: 540, quantityReceived: 60, quantityRejected: 0 },
  { productId: 'loratadina-10-x10', lotNumber: 'PN2610L', expiresInDays: 610, quantityReceived: 38, quantityRejected: 2 },
  { productId: 'jarabe-ambroxol-120', lotNumber: 'VL2609J', expiresInDays: 400, quantityReceived: 30, quantityRejected: 0 },
], '2 cajas de loratadina con empaque dañado; se devolvieron al proveedor.');
writeDocument(`quotations/${awardedQuotationId}`, {
  title: 'Reposición antigripales – temporada de frío', branchId: 'el-bosque',
  requestedItems: awardedQuotationItems.map((item) => ({ ...item, productName: productById.get(item.productId).name })),
  supplierOffers: awardedOffers.map((offer) => ({
    supplierId: offer.supplier.ruc, supplierName: offer.supplier.name, deliveryDays: offer.deliveryDays, paymentTerms: offer.paymentTerms, unitPriceByProduct: offer.prices,
  })),
  status: 'awarded', awardedSupplierId: SUPPLIERS[0].ruc, purchaseOrderId: awardedPurchaseOrder.id,
  createdAt: timestampOf(daysFromNow(-22)), updatedAt: timestampOf(daysFromNow(-20)),
});

// Cotización abierta con dos ofertas para comparar (El Molino).
const openQuotationItems = [
  { productId: 'vitamina-c-1000-x30', quantity: 50 },
  { productId: 'multivitaminico-adulto-x60', quantity: 24 },
];
writeDocument(`quotations/${firestore.collection('quotations').doc().id}`, {
  title: 'Vitaminas – campaña de defensas', branchId: 'el-molino',
  requestedItems: openQuotationItems.map((item) => ({ ...item, productName: productById.get(item.productId).name })),
  supplierOffers: [
    { supplierId: SUPPLIERS[2].ruc, supplierName: SUPPLIERS[2].name, deliveryDays: 4, paymentTerms: 'Crédito 45 días', unitPriceByProduct: { 'vitamina-c-1000-x30': 13.8, 'multivitaminico-adulto-x60': 27.5 } },
    { supplierId: SUPPLIERS[1].ruc, supplierName: SUPPLIERS[1].name, deliveryDays: 1, paymentTerms: 'Contado', unitPriceByProduct: { 'vitamina-c-1000-x30': 14.2, 'multivitaminico-adulto-x60': 26.9 } },
  ],
  status: 'open', awardedSupplierId: null, purchaseOrderId: null,
  createdAt: timestampOf(daysFromNow(-2)), updatedAt: timestampOf(daysFromNow(-1)),
});

// OC directa pendiente de recibir en El Bosque (para probar "Recepción" con el trabajador).
createPurchaseOrder({
  supplier: SUPPLIERS[3], branchId: 'el-bosque', quotationId: null, createdDaysAgo: 1, expectedInDays: 1, status: 'issued',
  notes: 'Reposición de insumos de primeros auxilios.',
  items: [
    { productId: 'gasas-esteriles-x10', quantity: 50, unitCost: 2.1 },
    { productId: 'agua-oxigenada-120', quantity: 40, unitCost: 1.6 },
    { productId: 'alcohol-gel-500', quantity: 30, unitCost: 7.2 },
  ],
});
// OC recibida parcialmente en el Centro Histórico.
const partialPurchaseOrder = createPurchaseOrder({
  supplier: SUPPLIERS[1], branchId: 'botica-centro-historico', quotationId: null, createdDaysAgo: 6, expectedInDays: -4, status: 'issued',
  notes: 'Pedido mensual de analgésicos.',
  items: [
    { productId: 'paracetamol-500-x100', quantity: 40, unitCost: 6.3 },
    { productId: 'ibuprofeno-400-x100', quantity: 30, unitCost: 9.8 },
  ],
});
receivePurchaseOrder(partialPurchaseOrder, 4, [
  { productId: 'paracetamol-500-x100', lotNumber: 'CH2610P', expiresInDays: 700, quantityReceived: 40, quantityRejected: 0 },
  { productId: 'ibuprofeno-400-x100', lotNumber: 'CH2610I', expiresInDays: 650, quantityReceived: 12, quantityRejected: 0 },
], 'El proveedor enviará el saldo de ibuprofeno la próxima semana.');
// OC anulada.
const cancelledPurchaseOrder = createPurchaseOrder({
  supplier: SUPPLIERS[2], branchId: 'el-molino', quotationId: null, createdDaysAgo: 12, expectedInDays: -8, status: 'issued',
  notes: 'Pedido de protector solar.', items: [{ productId: 'protector-solar-fps50', quantity: 24, unitCost: 29.5 }],
});
cancelledPurchaseOrder.status = 'cancelled';
cancelledPurchaseOrder.cancellationReason = 'Se consiguió mejor precio con otro proveedor.';
for (const purchaseOrder of purchaseOrders) {
  const { id: purchaseOrderId, ...purchaseOrderFields } = purchaseOrder;
  writeDocument(`purchase_orders/${purchaseOrderId}`, purchaseOrderFields);
}

console.log('6/9 Pedidos de clientes (últimos 30 días)…');
const ORDER_PLANS = [
  // [díasAtrás, cliente, botica, entrega, pago, estado final, productos]
  [28, 0, 'el-bosque', 'delivery', 'simulated_card', 'delivered', [['paracetamol-500-x100', 1], ['vitamina-c-1000-x30', 2]]],
  [26, 1, 'el-bosque', 'pickup', 'cash_on_delivery', 'delivered', [['ibuprofeno-400-x100', 1], ['diclofenaco-gel-50g', 1]]],
  [23, 2, 'el-molino', 'delivery', 'simulated_card', 'delivered', [['panales-talla-m-x40', 2], ['suero-oral-500', 4]]],
  [20, 0, 'el-molino', 'pickup', 'simulated_card', 'delivered', [['amoxicilina-500-x100', 1]]],
  [17, 1, 'el-bosque', 'delivery', 'cash_on_delivery', 'delivered', [['antigripal-noche-x12', 2], ['loratadina-10-x10', 1]]],
  [14, 2, 'el-bosque', 'pickup', 'simulated_card', 'cancelled', [['protector-solar-fps50', 1]]],
  [12, 0, 'botica-centro-historico', 'delivery', 'simulated_card', 'delivered', [['multivitaminico-adulto-x60', 1], ['alcohol-gel-500', 2]]],
  [9, 1, 'el-molino', 'pickup', 'simulated_card', 'delivered', [['naproxeno-550-x10', 2], ['gasas-esteriles-x10', 3]]],
  [6, 2, 'el-bosque', 'delivery', 'simulated_card', 'delivered', [['jarabe-ambroxol-120', 1], ['vitamina-c-1000-x30', 1]]],
  [3, 0, 'el-bosque', 'delivery', 'cash_on_delivery', 'out_for_delivery', [['suero-oral-500', 6], ['paracetamol-500-x100', 1]]],
  [1, 1, 'el-molino', 'pickup', 'simulated_card', 'ready_for_pickup', [['loratadina-10-x10', 2]]],
  [0, 2, 'el-bosque', 'pickup', 'simulated_card', 'pending_prescription', [['azitromicina-500-x3', 1], ['antigripal-noche-x12', 1]]],
  [0, 0, 'el-bosque', 'delivery', 'simulated_card', 'preparing', [['protector-solar-fps50', 1], ['alcohol-gel-500', 1]]],
  [0, 1, 'el-molino', 'delivery', 'cash_on_delivery', 'confirmed', [['ibuprofeno-400-x100', 1], ['gasas-esteriles-x10', 2]]],
];
const STATUS_PATH_BY_FINAL_STATUS = {
  confirmed: ['confirmed'],
  preparing: ['confirmed', 'preparing'],
  ready_for_pickup: ['confirmed', 'preparing', 'ready_for_pickup'],
  out_for_delivery: ['confirmed', 'preparing', 'out_for_delivery'],
  delivered: null,
  cancelled: ['confirmed', 'cancelled'],
  pending_prescription: ['pending_prescription'],
};
const DELIVERY_ADDRESSES = [
  { street: 'Av. España 1845, dpto. 302', district: 'Trujillo', reference: 'Frente al colegio' },
  { street: 'Calle Los Pinos 217', district: 'Víctor Larco Herrera', reference: 'Casa de rejas verdes' },
  { street: 'Mz. F Lt. 12, Urb. El Bosque', district: 'Trujillo', reference: 'A media cuadra del parque' },
];
const deliveredOrders = [];
let orderSequence = 0;
for (const [daysAgo, customerIndex, branchId, fulfillmentType, paymentMethod, finalStatus, requestedItems] of ORDER_PLANS) {
  const customer = customerUsers[customerIndex];
  // Los pedidos de "hoy" se crean minutos atrás para que cuenten como ventas del día.
  const createdAt = new Date(now - daysAgo * DAY_MS - (daysAgo === 0 ? randomInteger(5, 40) : randomInteger(30, 300)) * MINUTE_MS);
  const orderId = randomUUID();
  const isCancelled = finalStatus === 'cancelled';
  const orderItems = requestedItems.map(([productId, quantity]) => {
    const product = productById.get(productId);
    const allocations = reserveLotsFefo(productId, branchId, quantity);
    if (!allocations) throw new Error(`Stock insuficiente para la demo: ${productId} en ${branchId}`);
    for (const allocation of allocations) {
      writeDocument(`stock_movements/${firestore.collection('stock_movements').doc().id}`, {
        productId, branchId, lotId: allocation.lot.lotId, lotNumber: allocation.lot.lotNumber, movementType: 'exit',
        reason: 'online_sale', quantity: allocation.quantity, orderId, performedByUid: customer.uid, createdAt: timestampOf(createdAt),
      });
    }
    return {
      productId, productName: product.name, presentation: product.presentation, unitPrice: product.price, quantity,
      subtotal: roundToCents(product.price * quantity), requiresPrescription: product.requiresPrescription,
      allocatedLots: allocations.map((allocation) => ({ lotId: allocation.lot.lotId, lotNumber: allocation.lot.lotNumber, quantity: allocation.quantity })),
    };
  });
  // Pedido cancelado: el stock vuelve a los mismos lotes.
  if (isCancelled) {
    for (const orderItem of orderItems) {
      for (const allocatedLot of orderItem.allocatedLots) {
        const lot = lotsByKey.get(`${orderItem.productId}|${branchId}`).find((candidate) => candidate.lotId === allocatedLot.lotId);
        lot.quantityAvailable += allocatedLot.quantity;
        writeDocument(`stock_movements/${firestore.collection('stock_movements').doc().id}`, {
          productId: orderItem.productId, branchId, lotId: allocatedLot.lotId, lotNumber: allocatedLot.lotNumber, movementType: 'entry',
          reason: 'order_cancelled', quantity: allocatedLot.quantity, orderId, performedByUid: workerUidByBranch.get(branchId) ?? administratorUid,
          createdAt: timestampOf(new Date(createdAt.getTime() + 40 * MINUTE_MS)),
        });
      }
      stockByProduct.get(orderItem.productId)[branchId] += orderItem.quantity;
    }
  }
  const requiresPrescription = orderItems.some((orderItem) => orderItem.requiresPrescription);
  const statusPath = STATUS_PATH_BY_FINAL_STATUS[finalStatus] ?? [
    ...(requiresPrescription ? ['pending_prescription'] : []),
    'confirmed', 'preparing', fulfillmentType === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup', 'delivered',
  ];
  const staffUid = workerUidByBranch.get(branchId) ?? administratorUid;
  let statusChangedAt = createdAt.getTime();
  const statusHistory = statusPath.map((status, statusIndex) => {
    if (statusIndex > 0) statusChangedAt += randomInteger(12, 45) * MINUTE_MS;
    const note = status === 'cancelled' ? 'Cancelado por el cliente' : status === 'confirmed' && requiresPrescription ? 'Receta válida' : '';
    return { status, changedAt: timestampOf(new Date(Math.min(statusChangedAt, now))), changedByUid: statusIndex === 0 ? customer.uid : staffUid, note };
  });
  const itemsTotal = roundToCents(orderItems.reduce((total, orderItem) => total + orderItem.subtotal, 0));
  const deliveryFee = fulfillmentType === 'delivery' ? 6 : 0;
  const isPaid = paymentMethod === 'simulated_card' || finalStatus === 'delivered';
  const orderNumber = formatSequentialNumber('FS', ++orderSequence);
  writeDocument(`orders/${orderId}`, {
    orderNumber, customerUid: customer.uid, customerName: customer.fullName, customerEmail: customer.email,
    contactPhone: customer.phone, branchId, branchName: branchNameById.get(branchId), fulfillmentType,
    deliveryAddress: fulfillmentType === 'delivery' ? pickRandom(DELIVERY_ADDRESSES) : null, customerNote: '',
    items: orderItems, itemsTotal, deliveryFee, orderTotal: roundToCents(itemsTotal + deliveryFee),
    payment: {
      method: paymentMethod,
      status: isCancelled && paymentMethod === 'simulated_card' ? 'refunded' : isPaid ? 'paid' : 'pending',
      simulatedReference: paymentMethod === 'simulated_card' ? `SIM-${randomBytes(4).toString('hex').toUpperCase()}` : null,
      cardLastDigits: paymentMethod === 'simulated_card' ? '1111' : null, culqiChargeId: null,
    },
    prescription: requiresPrescription
      ? { file: null, reviewStatus: finalStatus === 'pending_prescription' ? 'pending' : 'approved', reviewNote: finalStatus === 'pending_prescription' ? '' : 'Receta válida', reviewedByUid: finalStatus === 'pending_prescription' ? null : staffUid }
      : null,
    status: finalStatus, statusHistory,
    courierName: statusPath.includes('out_for_delivery') ? pickRandom(COURIERS) : null,
    createdAt: timestampOf(createdAt), updatedAt: statusHistory[statusHistory.length - 1].changedAt,
  });
  if (finalStatus === 'delivered') deliveredOrders.push({ orderId, customer, branchId, deliveredAt: statusChangedAt });
}

console.log('7/9 Productos con stock, lotes y promociones…');
for (const product of PRODUCTS) {
  const { id: productId, ...productFields } = product;
  const promotion = PROMOTED_PRODUCTS.find((promotedProduct) => promotedProduct.productId === productId);
  writeDocument(`products/${productId}`, {
    ...productFields, imageUrl: '', isActive: true, stockByBranch: stockByProduct.get(productId),
    promotion: promotion ? { discountPercent: promotion.discountPercent, endsAt: timestampOf(daysFromNow(promotion.endsInDays)) } : null,
    createdAt: timestampOf(daysFromNow(-55)), updatedAt: timestampOf(daysFromNow(-1)),
  });
}
for (const lots of lotsByKey.values()) {
  for (const lot of lots) {
    writeDocument(`products/${lot.productId}/lots/${lot.lotId}`, {
      branchId: lot.branchId, lotNumber: lot.lotNumber, expirationDate: timestampOf(lot.expirationDate),
      quantityAvailable: lot.quantityAvailable, quantityReceived: lot.quantityReceived,
      createdAt: timestampOf(lot.createdAt), updatedAt: timestampOf(lot.createdAt),
    });
  }
}

console.log('8/9 Reseñas y reclamos…');
const REVIEW_COMMENTS = ['Llegó rápido y bien empacado.', 'Muy buena atención del químico farmacéutico.', '', 'Todo correcto, volveré a comprar.', 'El delivery demoró un poco, pero bien.'];
deliveredOrders.slice(0, 6).forEach((deliveredOrder, reviewIndex) => {
  writeDocument(`reviews/${deliveredOrder.orderId}`, {
    orderId: deliveredOrder.orderId, customerUid: deliveredOrder.customer.uid, branchId: deliveredOrder.branchId,
    rating: [5, 5, 4, 5, 3, 4][reviewIndex], comment: REVIEW_COMMENTS[reviewIndex % REVIEW_COMMENTS.length],
    createdAt: timestampOf(new Date(Math.min(deliveredOrder.deliveredAt + 3 * 60 * MINUTE_MS, now))),
  });
});
const CLAIMS = [
  {
    customer: customerUsers[1], claimType: 'complaint', daysAgo: 16, relatedOrderNumber: 'FS-000005', claimedAmount: 6,
    description: 'Pagué el delivery pero el pedido llegó una hora después de lo indicado y la caja venía abierta.',
    requestedSolution: 'Devolución del costo del delivery.', status: 'resolved',
    response: 'Lamentamos lo ocurrido. Verificamos el retraso y devolvimos los S/ 6.00 del delivery. Reforzamos el sellado de los pedidos.',
  },
  {
    customer: customerUsers[2], claimType: 'grievance', daysAgo: 2, relatedOrderNumber: '', claimedAmount: null,
    description: 'En la botica me atendieron con demora y no había nadie en caja durante varios minutos.',
    requestedSolution: 'Que mejoren la atención en horas punta.', status: 'open', response: '',
  },
];
CLAIMS.forEach((claim, claimIndex) => {
  const createdAt = daysFromNow(-claim.daysAgo);
  writeDocument(`claims/${firestore.collection('claims').doc().id}`, {
    claimType: claim.claimType, fullName: claim.customer.fullName, documentNumber: ['45781236', '47812593'][claimIndex],
    address: DELIVERY_ADDRESSES[claimIndex].street, phone: claim.customer.phone, relatedOrderNumber: claim.relatedOrderNumber,
    claimedAmount: claim.claimedAmount, description: claim.description, requestedSolution: claim.requestedSolution,
    claimNumber: formatSequentialNumber('RC', claimIndex + 1), customerUid: claim.customer.uid, customerEmail: claim.customer.email,
    status: claim.status, response: claim.response,
    respondedByUid: claim.status === 'resolved' ? administratorUid : null,
    respondedAt: claim.status === 'resolved' ? timestampOf(daysFromNow(-claim.daysAgo + 3)) : null,
    createdAt: timestampOf(createdAt), updatedAt: timestampOf(createdAt),
  });
});

console.log('9/9 Contadores y escritura final…');
writeDocument('counters/orders', { lastOrderNumber: orderSequence });
writeDocument('counters/purchase_orders', { lastNumber: purchaseOrders.length });
writeDocument('counters/claims', { lastNumber: CLAIMS.length });
for (const [documentPath, documentData] of pendingWrites) {
  bulkWriter.set(firestore.doc(documentPath), documentData);
}
await bulkWriter.close();

console.log('\nDatos de demostración cargados:');
console.log(`  ${NEW_BRANCHES.length} sucursales nuevas (total ${allBranchIds.length}), ${CATEGORIES.length} categorías, ${PRODUCTS.length} productos (sin imagen)`);
console.log(`  ${[...lotsByKey.values()].flat().length} lotes, ${PROMOTED_PRODUCTS.length} promociones, ${SUPPLIERS.length} proveedores, 2 cotizaciones`);
console.log(`  ${purchaseOrders.length} órdenes de compra, ${orderSequence} pedidos, ${Math.min(deliveredOrders.length, 6)} reseñas, ${CLAIMS.length} reclamos`);
console.log('\nCuentas de demostración (misma contraseña para todas):');
for (const demoUser of [...staffUsers, ...customerUsers]) {
  console.log(`  ${demoUser.branchId ? 'Trabajador' : 'Cliente   '}  ${demoUser.email}${demoUser.branchId ? `  (${branchNameById.get(demoUser.branchId)})` : ''}`);
}
console.log(`  Contraseña: ${DEMO_PASSWORD}`);
process.exit(0);
