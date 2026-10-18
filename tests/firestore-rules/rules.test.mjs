// Testes das regras do Firestore (firestore.rules) no Emulator.
// Rodar a partir desta pasta:  npm install && npm test
// (requer Java e firebase-tools; o projeto demo-farmacia é só local, nada vai para produção)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, before, after, beforeEach, describe } from 'node:test';
import {
  initializeTestEnvironment, assertSucceeds, assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection,
  getDocs, query, where, runTransaction, serverTimestamp, increment
} from 'firebase/firestore';

const rulesPath = fileURLToPath(new URL('../../firestore.rules', import.meta.url));
let env;

const ALICE = 'alice';
const BOB = 'bob';
const ADMIN = 'admin1';

const db = (uid, claims = {}) => uid
  ? env.authenticatedContext(uid, { email: `${uid}@teste.com`, ...claims }).firestore()
  : env.unauthenticatedContext().firestore();

// Mesmo formato do checkout.js -> firebase-service.createOrder
function orderPayload(uid, n, overrides = {}) {
  return {
    createdAt: new Date().toISOString(),
    items: [{ id: 'p1', name: 'Dipirona', price: 9.9, quantity: 2 }],
    totals: { subtotal: 19.8, shipping: 5, discount: 0, total: 24.8 },
    shippingMethod: 'delivery',
    paymentMethod: 'pix',
    installments: null,
    address: { street: 'Rua A', number: '10', city: 'Cidade', state: 'SC', zipCode: '88000-000' },
    user: `${uid}@teste.com`,
    userId: uid,
    coupon: null,
    status: 'pending',
    history: [{ status: 'pending', at: new Date().toISOString(), note: 'Pedido criado' }],
    id: n,
    orderNumber: n,
    ...overrides
  };
}

// Reproduz a transação do front: lê meta/counters, grava orderSeq+1 e o pedido
async function placeOrder(fs, uid, { overrides = {}, seqOverride = null } = {}) {
  return runTransaction(fs, async (tx) => {
    const cRef = doc(fs, 'meta', 'counters');
    const snap = await tx.get(cRef);
    const cur = snap.exists() && typeof snap.data().orderSeq === 'number' ? snap.data().orderSeq : 0;
    const next = seqOverride ?? cur + 1;
    tx.set(cRef, { orderSeq: next }, { merge: true });
    const oRef = doc(collection(fs, 'pedidos'));
    tx.set(oRef, orderPayload(uid, next, overrides));
    return oRef.id;
  });
}

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-farmacia',
    firestore: { rules: readFileSync(rulesPath, 'utf8') }
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (fs) => {
    await setDoc(doc(fs, 'produtos', 'p1'), { nome: 'Dipirona', preco: 9.9 });
    await setDoc(doc(fs, 'meta', 'counters'), { orderSeq: 41, productsVersion: 3 });
    await setDoc(doc(fs, 'usuarios', ALICE), { name: 'Alice', email: 'alice@teste.com' });
    await setDoc(doc(fs, 'usuarios', 'roleadmin'), { name: 'R', email: 'roleadmin@teste.com', role: 'admin' });
    await setDoc(doc(fs, 'pedidos', 'pAlice'), orderPayload(ALICE, 40));
    await setDoc(doc(fs, 'admins', ALICE), { note: 'legado' });
    await setDoc(doc(fs, 'meta', 'admins'), { uids: [ADMIN], emails: [] });
  });
});

const adminDb = () => db(ADMIN, { admin: true });

describe('produtos', () => {
  test('leitura pública (anônimo)', async () => {
    await assertSucceeds(getDoc(doc(db(null), 'produtos', 'p1')));
    await assertSucceeds(getDocs(collection(db(null), 'produtos')));
  });
  test('cliente comum não grava', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'produtos', 'p2'), { nome: 'X' }));
    await assertFails(updateDoc(doc(db(ALICE), 'produtos', 'p1'), { preco: 0.01 }));
    await assertFails(deleteDoc(doc(db(ALICE), 'produtos', 'p1')));
  });
  test('admin por claim admin:true grava', async () => {
    await assertSucceeds(updateDoc(doc(adminDb(), 'produtos', 'p1'), { preco: 10 }));
    await assertSucceeds(addDoc(collection(adminDb(), 'produtos'), { nome: 'Novo' }));
    await assertSucceeds(deleteDoc(doc(adminDb(), 'produtos', 'p1')));
  });
  test("admin por claim role:'admin' grava", async () => {
    await assertSucceeds(updateDoc(doc(db('x', { role: 'admin' }), 'produtos', 'p1'), { preco: 11 }));
  });
  test("admin por usuarios/{uid}.role == 'admin' grava", async () => {
    await assertSucceeds(updateDoc(doc(db('roleadmin'), 'produtos', 'p1'), { preco: 12 }));
  });
  test('admins/{uid} legado NÃO dá permissão de escrita', async () => {
    await assertFails(updateDoc(doc(db(ALICE), 'produtos', 'p1'), { preco: 1 }));
  });
});

describe('pedidos: create', () => {
  test('dono autenticado cria pedido na transação com orderSeq+1', async () => {
    await assertSucceeds(placeOrder(db(ALICE), ALICE));
  });
  test('anônimo não cria', async () => {
    await assertFails(placeOrder(db(null), ALICE));
  });
  test('userId de outra pessoa é rejeitado', async () => {
    await assertFails(placeOrder(db(BOB), ALICE));
  });
  test("status inicial diferente de 'pending' é rejeitado", async () => {
    await assertFails(placeOrder(db(ALICE), ALICE, { overrides: { status: 'delivered' } }));
  });
  test('history com status diferente de pending é rejeitado', async () => {
    await assertFails(placeOrder(db(ALICE), ALICE, {
      overrides: { history: [{ status: 'delivered', at: 'x' }] }
    }));
  });
  test('campo extra é rejeitado', async () => {
    await assertFails(placeOrder(db(ALICE), ALICE, { overrides: { pago: true } }));
  });
  test('tipos inválidos são rejeitados', async () => {
    await assertFails(placeOrder(db(ALICE), ALICE, { overrides: { items: [] } }));
    await assertFails(placeOrder(db(ALICE), ALICE, { overrides: { items: 'x' } }));
    await assertFails(placeOrder(db(ALICE), ALICE, {
      overrides: { totals: { subtotal: 1, shipping: 0, discount: 0, total: -5 } }
    }));
    await assertFails(placeOrder(db(ALICE), ALICE, {
      overrides: { totals: { subtotal: 1, shipping: 0, discount: 0, total: '1' } }
    }));
    await assertFails(placeOrder(db(ALICE), ALICE, { overrides: { address: 'Rua A' } }));
  });
  test('pedido sem gravar o contador na mesma transação é rejeitado', async () => {
    await assertFails(addDoc(collection(db(ALICE), 'pedidos'), orderPayload(ALICE, 42)));
    // fallback do front (número do localStorage) também é rejeitado
    await assertFails(addDoc(collection(db(ALICE), 'pedidos'), orderPayload(ALICE, 1)));
  });
  test('pular números (orderSeq+2) é rejeitado', async () => {
    await assertFails(placeOrder(db(ALICE), ALICE, { seqOverride: 43 }));
  });
  test('id diferente de orderNumber é rejeitado', async () => {
    await assertFails(placeOrder(db(ALICE), ALICE, { overrides: { id: 999 } }));
  });
  test('primeiro pedido quando meta/counters não existe', async () => {
    await seed((fs) => deleteDoc(doc(fs, 'meta', 'counters')));
    await assertSucceeds(placeOrder(db(ALICE), ALICE));
  });
  test('LIMITAÇÃO: total manipulado (preço 0,01) ainda passa nas regras', async () => {
    await assertSucceeds(placeOrder(db(ALICE), ALICE, {
      overrides: {
        items: [{ id: 'p1', name: 'Dipirona', price: 0.01, quantity: 100 }],
        totals: { subtotal: 1, shipping: 0, discount: 0, total: 1 }
      }
    }));
  });
});

describe('pedidos: leitura e update', () => {
  test('dono lê o próprio pedido e lista com where userId', async () => {
    await assertSucceeds(getDoc(doc(db(ALICE), 'pedidos', 'pAlice')));
    await assertSucceeds(getDocs(query(collection(db(ALICE), 'pedidos'), where('userId', '==', ALICE))));
  });
  test('outro usuário não lê nem lista tudo', async () => {
    await assertFails(getDoc(doc(db(BOB), 'pedidos', 'pAlice')));
    await assertFails(getDocs(collection(db(BOB), 'pedidos')));
    await assertFails(getDocs(collection(db(null), 'pedidos')));
  });
  test('admin lê e lista todos', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'pedidos')));
  });
  test('dono não altera status nem total', async () => {
    await assertFails(updateDoc(doc(db(ALICE), 'pedidos', 'pAlice'), { status: 'delivered' }));
    await assertFails(updateDoc(doc(db(ALICE), 'pedidos', 'pAlice'), { 'totals.total': 0 }));
    await assertFails(deleteDoc(doc(db(ALICE), 'pedidos', 'pAlice')));
  });
  test('admin altera status + history (updateOrderStatus)', async () => {
    await assertSucceeds(updateDoc(doc(adminDb(), 'pedidos', 'pAlice'), {
      status: 'processing',
      history: [{ status: 'pending' }, { status: 'processing', note: 'Avanço manual' }]
    }));
  });
  test('admin não altera outros campos nem usa status inválido', async () => {
    await assertFails(updateDoc(doc(adminDb(), 'pedidos', 'pAlice'), { 'totals.total': 0 }));
    await assertFails(updateDoc(doc(adminDb(), 'pedidos', 'pAlice'), { status: 'pago', history: [] }));
  });
});

describe('meta/counters', () => {
  test('leitura pública', async () => {
    await assertSucceeds(getDoc(doc(db(null), 'meta', 'counters')));
  });
  test('cliente incrementa orderSeq em +1', async () => {
    await assertSucceeds(setDoc(doc(db(ALICE), 'meta', 'counters'), { orderSeq: 42 }, { merge: true }));
  });
  test('cliente não reduz, não pula e não muda outros campos', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'meta', 'counters'), { orderSeq: 1 }, { merge: true }));
    await assertFails(setDoc(doc(db(ALICE), 'meta', 'counters'), { orderSeq: 50 }, { merge: true }));
    await assertFails(setDoc(doc(db(ALICE), 'meta', 'counters'), { orderSeq: 42, productsVersion: 0 }, { merge: true }));
    await assertFails(setDoc(doc(db(ALICE), 'meta', 'counters'), { orderSeq: 42 })); // sem merge apaga productsVersion
    await assertFails(deleteDoc(doc(db(ALICE), 'meta', 'counters')));
  });
  test('anônimo não incrementa', async () => {
    await assertFails(setDoc(doc(db(null), 'meta', 'counters'), { orderSeq: 42 }, { merge: true }));
  });
  test('admin faz bump de productsVersion (_bumpProductsVersion)', async () => {
    await assertSucceeds(setDoc(doc(adminDb(), 'meta', 'counters'),
      { productsVersion: increment(1), productsUpdatedAt: serverTimestamp() }, { merge: true }));
  });
});

describe('catalogo (agregado)', () => {
  const parte = (n, over = {}) => ({
    v: 7, parte: n, total: 2, itens: [{ id: 'p1', nome: 'Dipirona' }], geradoEm: serverTimestamp(), ...over
  });
  test('leitura pública (get e list)', async () => {
    await seed((fs) => setDoc(doc(fs, 'catalogo', 'parte-0'), { v: 7, parte: 0, total: 1, itens: [], geradoEm: new Date() }));
    await assertSucceeds(getDoc(doc(db(null), 'catalogo', 'parte-0')));
    await assertSucceeds(getDocs(collection(db(null), 'catalogo')));
  });
  test('cliente e anônimo não gravam', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'catalogo', 'parte-0'), parte(0)));
    await assertFails(setDoc(doc(db(null), 'catalogo', 'parte-0'), parte(0)));
    await seed((fs) => setDoc(doc(fs, 'catalogo', 'parte-1'), { v: 7, parte: 1, total: 2, itens: [], geradoEm: new Date() }));
    await assertFails(updateDoc(doc(db(ALICE), 'catalogo', 'parte-1'), { itens: [] }));
    await assertFails(deleteDoc(doc(db(ALICE), 'catalogo', 'parte-1')));
  });
  test('admin grava, atualiza e apaga partes no formato certo', async () => {
    await assertSucceeds(setDoc(doc(adminDb(), 'catalogo', 'parte-0'), parte(0)));
    await assertSucceeds(updateDoc(doc(adminDb(), 'catalogo', 'parte-0'), { v: 8, geradoEm: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(adminDb(), 'catalogo', 'parte-0')));
  });
  test('admin com formato inválido é rejeitado', async () => {
    await assertFails(setDoc(doc(adminDb(), 'catalogo', 'parte-0'), parte(0, { v: '7' })));
    await assertFails(setDoc(doc(adminDb(), 'catalogo', 'parte-0'), parte(0, { itens: 'x' })));
    await assertFails(setDoc(doc(adminDb(), 'catalogo', 'parte-0'), parte(0, { geradoEm: '2026-10-18' })));
    await assertFails(setDoc(doc(adminDb(), 'catalogo', 'parte-0'), parte(0, { extra: 1 })));
  });
  test('meta/counters: admin grava catalogParts/catalogVersion', async () => {
    await assertSucceeds(setDoc(doc(adminDb(), 'meta', 'counters'), { catalogParts: 5, catalogVersion: 7 }, { merge: true }));
    await assertSucceeds(setDoc(doc(adminDb(), 'meta', 'counters'), { catalogVersion: increment(1) }, { merge: true }));
    await assertFails(setDoc(doc(adminDb(), 'meta', 'counters'), { catalogParts: -1 }, { merge: true }));
    await assertFails(setDoc(doc(adminDb(), 'meta', 'counters'), { catalogVersion: 'v7' }, { merge: true }));
  });
  test('meta/counters: cliente não mexe em catalogParts/catalogVersion; leitura continua pública', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'meta', 'counters'), { catalogParts: 1 }, { merge: true }));
    await assertFails(setDoc(doc(db(ALICE), 'meta', 'counters'), { orderSeq: 42, catalogVersion: 99 }, { merge: true }));
    await assertSucceeds(setDoc(doc(db(ALICE), 'meta', 'counters'), { orderSeq: 42 }, { merge: true }));
    await assertSucceeds(getDoc(doc(db(null), 'meta', 'counters')));
  });
});

describe('usuarios', () => {
  test('dono lê e grava o próprio perfil', async () => {
    await assertSucceeds(getDoc(doc(db(ALICE), 'usuarios', ALICE)));
    await assertSucceeds(updateDoc(doc(db(ALICE), 'usuarios', ALICE), { phone: '48999990000' }));
    await assertSucceeds(setDoc(doc(db(BOB), 'usuarios', BOB), { name: 'Bob', email: 'bob@teste.com' }));
  });
  test('dono NÃO se promove (role/admin/roles)', async () => {
    await assertFails(updateDoc(doc(db(ALICE), 'usuarios', ALICE), { role: 'admin' }));
    await assertFails(updateDoc(doc(db(ALICE), 'usuarios', ALICE), { admin: true }));
    await assertFails(updateDoc(doc(db(ALICE), 'usuarios', ALICE), { roles: ['admin'] }));
    await assertFails(setDoc(doc(db(BOB), 'usuarios', BOB), { name: 'Bob', role: 'admin' }));
  });
  test('dono não se promove via setDoc com merge', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'usuarios', ALICE), { role: 'admin' }, { merge: true }));
  });
  test('outro usuário não lê nem grava', async () => {
    await assertFails(getDoc(doc(db(BOB), 'usuarios', ALICE)));
    await assertFails(updateDoc(doc(db(BOB), 'usuarios', ALICE), { name: 'hack' }));
    await assertFails(getDocs(collection(db(BOB), 'usuarios')));
  });
  test('admin lista usuarios (getClients)', async () => {
    await assertSucceeds(getDocs(collection(adminDb(), 'usuarios')));
  });
  test('endereços: dono gerencia, outro não', async () => {
    const col = collection(db(ALICE), 'usuarios', ALICE, 'enderecos');
    await assertSucceeds(setDoc(doc(col, 'cadastro'), { street: 'Rua A', favorite: true }, { merge: true }));
    await assertSucceeds(getDocs(col));
    await assertFails(getDocs(collection(db(BOB), 'usuarios', ALICE, 'enderecos')));
    await assertFails(addDoc(collection(db(BOB), 'usuarios', ALICE, 'enderecos'), { street: 'X' }));
  });
});

describe('coleções de admin', () => {
  test('admins/{uid}: ninguém grava pelo cliente, nem admin', async () => {
    await assertFails(setDoc(doc(db(BOB), 'admins', BOB), { x: 1 }));
    await assertFails(setDoc(doc(adminDb(), 'admins', BOB), { x: 1 }));
  });
  test('admins/{uid}: usuário lê só o próprio', async () => {
    await assertSucceeds(getDoc(doc(db(ALICE), 'admins', ALICE)));
    await assertFails(getDoc(doc(db(BOB), 'admins', ALICE)));
  });
  test('adminsByEmail: ninguém grava pelo cliente', async () => {
    await assertFails(setDoc(doc(db(BOB), 'adminsByEmail', 'bob@teste.com'), { x: 1 }));
    await assertFails(setDoc(doc(adminDb(), 'adminsByEmail', 'bob@teste.com'), { x: 1 }));
    await assertSucceeds(getDoc(doc(db(BOB), 'adminsByEmail', 'bob@teste.com')));
    await assertFails(getDoc(doc(db(BOB), 'adminsByEmail', 'alice@teste.com')));
  });
  test('meta/admins: não gravável; só admin lê', async () => {
    await assertFails(setDoc(doc(db(BOB), 'meta', 'admins'), { uids: [BOB] }));
    await assertFails(updateDoc(doc(adminDb(), 'meta', 'admins'), { uids: [ADMIN, BOB] }));
    await assertFails(getDoc(doc(db(BOB), 'meta', 'admins')));
    await assertSucceeds(getDoc(doc(adminDb(), 'meta', 'admins')));
  });
  test('adminRequests: não-admin não cria (escalada via process-admin-requests.mjs)', async () => {
    const req = (uid) => ({
      email: 'bob@teste.com', action: 'grant', status: 'pending',
      requestedBy: uid, requestedByEmail: `${uid}@teste.com`,
      createdAt: new Date().toISOString(), createdAtTs: serverTimestamp()
    });
    await assertFails(addDoc(collection(db(BOB), 'adminRequests'), req(BOB)));
    await assertFails(getDocs(collection(db(BOB), 'adminRequests')));
    await assertSucceeds(addDoc(collection(adminDb(), 'adminRequests'), req(ADMIN)));
    await assertSucceeds(getDocs(collection(adminDb(), 'adminRequests')));
  });
});

describe('legado e padrão', () => {
  test('clientes: só admin', async () => {
    await seed((fs) => setDoc(doc(fs, 'clientes', 'c1'), { email: 'alice@teste.com', addresses: [] }));
    await assertFails(getDoc(doc(db(ALICE), 'clientes', 'c1')));
    await assertFails(updateDoc(doc(db(ALICE), 'clientes', 'c1'), { addresses: [{ id: 'a1' }] }));
    await assertSucceeds(getDocs(collection(adminDb(), 'clientes')));
    await assertSucceeds(updateDoc(doc(adminDb(), 'clientes', 'c1'), { addresses: [] }));
  });
  test('ofertas: leitura pública, escrita admin', async () => {
    await assertSucceeds(getDocs(collection(db(null), 'ofertas')));
    await assertFails(setDoc(doc(db(ALICE), 'ofertas', 'o1'), { a: 1 }));
    await assertSucceeds(setDoc(doc(adminDb(), 'ofertas', 'o1'), { a: 1 }));
  });
  test('carrinhos e endereco (singular): só o dono', async () => {
    await assertSucceeds(setDoc(doc(db(ALICE), 'carrinhos', ALICE), { items: [] }));
    await assertFails(getDoc(doc(db(BOB), 'carrinhos', ALICE)));
    await assertSucceeds(setDoc(doc(db(ALICE), 'usuarios', ALICE, 'endereco', 'e1'), { street: 'A' }));
    await assertFails(getDoc(doc(db(BOB), 'usuarios', ALICE, 'endereco', 'e1')));
  });
  test('meta/counters: cliente não adiciona campos novos junto com +1', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'meta', 'counters'), { orderSeq: 42, extra: 'x' }, { merge: true }));
  });
  test('orders (legado): dono por user.email lê; ninguém cria', async () => {
    await seed((fs) => setDoc(doc(fs, 'orders', 'o1'), { user: { email: 'alice@teste.com' }, status: 'pending' }));
    await assertSucceeds(getDoc(doc(db(ALICE), 'orders', 'o1')));
    await assertSucceeds(getDocs(query(collection(db(ALICE), 'orders'), where('user.email', '==', 'alice@teste.com'))));
    await assertFails(getDoc(doc(db(BOB), 'orders', 'o1')));
    await assertFails(addDoc(collection(db(ALICE), 'orders'), { user: { email: 'alice@teste.com' } }));
  });
  test('coleção desconhecida: negado', async () => {
    await assertFails(setDoc(doc(db(ALICE), 'qualquer', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(adminDb(), 'qualquer', 'x')));
  });
});
