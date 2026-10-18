# Segurança do Firestore — regras, testes e próximos passos

Arquivos:
- [`firestore.rules`](../firestore.rules): regras propostas (ainda **não** publicadas).
- [`firebase.json`](../firebase.json): configuração mínima (só regras + emulador).
- [`tests/firestore-rules/rules.test.mjs`](../tests/firestore-rules/rules.test.mjs): 46 testes no Emulator.

## 1. Mapa de acessos do front

| Caminho | Quem lê | Quem grava | Onde no código |
|---|---|---|---|
| `produtos/{id}` | todos (catálogo, inclusive anônimo) | admin (painel); scripts `sync-*`, `clean-products` (Admin SDK) | `firebase-service.getProducts/getProduct/addProduct/updateProduct/deleteProduct` |
| `meta/counters` | todos (`productsVersion` invalida o cache) | cliente: `orderSeq` +1 na transação do pedido; admin: `productsVersion`/`productsUpdatedAt`; scripts | `createOrder`, `_bumpProductsVersion` |
| `pedidos/{id}` | dono (`where userId == uid`), admin (lista tudo) | cliente: create; admin: `status` + `history` | `createOrder`, `listOrders`, `listOrdersByUser`, `updateOrderStatus` |
| `orders/{id}` (legado) | dono por `user.email`, admin | admin (status) | fallbacks de `listOrders*`/`updateOrderStatus` |
| `usuarios/{uid}` | dono, admin (`getClients` lista tudo) | dono (perfil) | `getCurrentUserProfile`, `getUserByEmail`, `getClients`, `admin.js` (fallback de role) |
| `usuarios/{uid}/enderecos/{id}` | dono | dono | `account.js`, `checkout.js` → `addAddressToClient`, `updateClientAddress`, `deleteClientAddress` |
| `clientes/{id}` (legado) | admin | admin | `getClients`, fallbacks de endereço/cliente |
| `ofertas`, `carrinhos/{uid}`, `usuarios/{uid}/endereco` | — | — | sem uso no site; mantidas das regras anteriores |
| `adminRequests/{id}` | admin | admin (painel → `process-admin-requests.mjs` concede claims) | `admin.js` |
| `admins/{uid}`, `adminsByEmail/{email}`, `meta/admins` | painel no login (fallback de admin) | ninguém pelo cliente | `admin.js` `checkFirestoreAdmin` |

## 2. Regras propostas (resumo)

- **Admin** = claim `admin == true` **ou** claim `role == 'admin'` **ou** `usuarios/{uid}.role == 'admin'`. Os scripts `set-admin-claim.mjs`/`process-admin-requests.mjs` já gravam as duas claims.
- **produtos**: leitura pública; escrita só admin.
- **pedidos**
  - create: autenticado, `userId == auth.uid`, `status == 'pending'`, `history` com 1 item `pending`, só as chaves que o checkout envia, tipos validados (`items` lista com 1–100 itens, `totals.*` números ≥ 0, `address` map, etc.).
  - `orderNumber` (= `id`) tem que ser o `orderSeq` gravado **na mesma transação** e exatamente +1 em relação ao anterior (`getAfter`). Isso impede números repetidos ou escolhidos pelo cliente.
  - leitura: dono ou admin. update: só admin, só `status`/`history`/`updatedAt`, status em `pending|processing|shipped|delivered|cancelled`. delete: ninguém.
- **meta/counters**: leitura pública; cliente autenticado só altera `orderSeq` e só +1; admin grava o resto.
- **usuarios/{uid}**: dono lê/cria/atualiza, mas não pode definir/alterar `role`, `admin`, `roles`. Endereços: só o dono (e admin).
- **adminRequests**: só admin cria/lê. Nas regras anteriores não havia regra (negado para todos); nunca abrir para não-admin, porque `process-admin-requests.mjs` concede a claim de admin para o e-mail pedido.
- **admins / adminsByEmail / meta/admins**: nunca graváveis pelo cliente. Usuário só lê o próprio `admins/{uid}` / `adminsByEmail/{seu e-mail}`; `meta/admins` só admin lê.
- Qualquer outra coleção: negada.

### Efeitos colaterais conhecidos
1. Quem é admin **apenas** por `admins/{uid}`, `adminsByEmail` ou `meta/admins` continua vendo o painel, mas as gravações passam a falhar. Antes do deploy, rode `scripts/set-admin-claim.mjs` para esses usuários.
2. O fallback de `createOrder` (pedido sem contador, número do `localStorage`) passa a ser **rejeitado**. Hoje, nesse caso, o checkout mostra sucesso e guarda o pedido só no navegador: a loja não recebe o pedido. Sugestão: remover o fallback e mostrar erro.
3. `getUserByEmail` (query em `usuarios` por e-mail) só funciona para admin. Para o cliente ela já cai no fallback e não quebra o fluxo (`getCurrentUserProfile` vem antes).
4. A leitura de `orders` (legado) por e-mail confia em `token.email`. Exigir `email_verified` seria mais seguro, mas pode bloquear contas antigas.
5. Qualquer usuário autenticado pode incrementar `orderSeq` sozinho (gera buracos na numeração, não duplicidade). Isso é resolvido pela Cloud Function abaixo.

## 3. Ponto crítico que as regras NÃO resolvem: o total é calculado no navegador

`checkout.js` monta `items[].price`, `totals` (`calcTotals()`), frete (`getShippingValue()`) e cupom (`{ DESCONTO10: 0.10, BEMVINDO5: 0.05 }` fixo no JS). Qualquer pessoa pode gravar um pedido com preço R$ 0,01 ou com 100% de desconto. As regras validam tipos, mas não percorrem a lista de itens nem consultam `produtos`. O teste `LIMITAÇÃO: total manipulado` documenta isso.

Até ter a Function: **confira o valor do pedido contra o sistema da loja antes de separar ou entregar.**

### Esboço: Cloud Function `criarPedido` (callable, 2ª geração)

Precisa do plano Blaze. Com ela, a regra de `pedidos` vira `allow create: if false` e `meta/counters` deixa de ser gravável pelo cliente.

```js
// functions/index.js (esboço — não publicado)
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

const CUPONS = { DESCONTO10: 0.10, BEMVINDO5: 0.05 };          // mover para meta/cupons
const FRETE = { delivery: 9.90, express: 24.90, pickup: 0 };

export const criarPedido = onCall({ region: 'southamerica-east1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Faça login.');
  const { items, shippingMethod, paymentMethod, installments, address, coupon } = req.data || {};
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new HttpsError('invalid-argument', 'Carrinho inválido.');
  if (!(shippingMethod in FRETE)) throw new HttpsError('invalid-argument', 'Frete inválido.');

  // Preço sempre vem de produtos/{id}, nunca do cliente
  const refs = items.map(i => db.collection('produtos').doc(String(i.id)));
  const snaps = await db.getAll(...refs);
  const linhas = snaps.map((s, idx) => {
    const p = s.data();
    const qtd = Math.trunc(Number(items[idx].quantity));
    if (!s.exists || p.ativo === false || p.publicado === false) throw new HttpsError('failed-precondition', `Produto indisponível: ${items[idx].id}`);
    if (!(qtd >= 1 && qtd <= 99)) throw new HttpsError('invalid-argument', 'Quantidade inválida.');
    const price = Number(p.precoComDesconto || p.precoMaximo);
    return { id: s.id, name: p.nome, price, quantity: qtd };
  });
  const r2 = (v) => Math.round(v * 100) / 100;
  const subtotal = r2(linhas.reduce((t, l) => t + l.price * l.quantity, 0));
  const taxa = CUPONS[String(coupon || '').toUpperCase()] || 0;
  const discount = r2(subtotal * taxa);
  const shipping = FRETE[shippingMethod];
  const total = r2(Math.max(0, subtotal - discount) + shipping);

  return db.runTransaction(async (tx) => {
    const cRef = db.doc('meta/counters');
    const c = await tx.get(cRef);
    const next = (c.get('orderSeq') || 0) + 1;
    tx.set(cRef, { orderSeq: next }, { merge: true });
    const oRef = db.collection('pedidos').doc();
    tx.set(oRef, {
      id: next, orderNumber: next, userId: uid, user: req.auth.token.email || null,
      items: linhas, totals: { subtotal, shipping, discount, total },
      shippingMethod, paymentMethod: String(paymentMethod || ''), installments: installments || null,
      address: address || {}, coupon: taxa ? String(coupon).toUpperCase() : null,
      status: 'pending',
      history: [{ status: 'pending', at: new Date().toISOString(), note: 'Pedido criado' }],
      createdAt: new Date().toISOString(), createdAtTs: FieldValue.serverTimestamp(),
    });
    return { docId: oRef.id, orderNumber: next };
  });
});
```

No front, `createOrder` passaria a chamar `httpsCallable(functions, 'criarPedido')` enviando só `{ items:[{id,quantity}], shippingMethod, paymentMethod, installments, address, coupon }`. Juros de parcelamento e estoque (`quantidade`) também devem ser recalculados/validados na Function.

## 4. Como testar

### Emulator (recomendado; precisa de Java e `firebase-tools`)
```bash
cd tests/firestore-rules
npm install
npm test
```
Usa o projeto local `demo-farmacia`: nada toca produção. Resultado atual: **46/46 passando**.

### Sem emulador: Rules Playground (Console → Firestore → Regras → "Playground de regras")
Cole o conteúdo de `firestore.rules` no editor **sem publicar** e simule:
1. `get /produtos/p1` sem autenticação → permitido.
2. `update /produtos/p1` autenticado `uid=u1`, sem claims → negado; com claim `{"admin": true}` → permitido.
3. `update /usuarios/u1` como `u1` com `{"role":"admin"}` → negado; com `{"phone":"..."}` → permitido.
4. `create /adminRequests/x` como usuário comum → negado.
5. `update /meta/counters` como `u1` com `orderSeq` = atual+1 (merge) → permitido; +2 → negado.
6. `get /pedidos/<id de outro usuário>` como `u1` → negado.
7. `create /admins/u1` com qualquer usuário → negado.
(O Playground simula uma operação por vez; o create de pedido depende de uma transação com `meta/counters`, então só dá para testar no emulador.)

## 5. Antes do deploy

1. **Copiar as regras publicadas hoje** (Console → Firestore → Regras) e comparar com este arquivo. Ver a seção 6.
2. Dar claim de admin a quem usa só os fallbacks (`set-admin-claim.mjs`).
3. Publicar só com aprovação: `firebase deploy --only firestore:rules --project farmaciasaobenedito-bcb2c`. (O Console guarda o histórico de versões, então dá para voltar para a versão anterior.)

## 6. Diferenças em relação às regras anteriores (Console, até 18/10/2026)

| Caminho | Antes | Agora | Impacto |
|---|---|---|---|
| `isAdmin()` | claims `admin`/`role` | claims + `usuarios/{uid}.role == 'admin'` | seguro só porque `usuarios.role` deixou de ser gravável pelo dono |
| `usuarios/{uid}` | dono grava **qualquer** campo | dono não cria/altera `role`, `admin`, `roles` | antes, qualquer um podia gravar `role:'admin'` e o painel o reconhecia como admin (os dados continuavam bloqueados porque o antigo `isAdmin` não lia esse campo) |
| `pedidos` create | só `userId == uid` (ou admin); nenhum outro campo validado | campos/tipos validados, `status 'pending'`, número amarrado ao contador; admin não cria pelo cliente | antes dava para gravar pedido já `delivered`, com qualquer número ou qualquer estrutura |
| `pedidos` read | dono por `userId` **ou** `user == token.email`, admin | dono por `userId`, admin | pedidos antigos sem `userId` deixam de aparecer para o cliente (o site já busca só por `userId`) |
| `pedidos` update/delete | admin, qualquer campo; delete permitido | admin, só `status`/`history`/`updatedAt`; delete negado | |
| `meta/*` read | **público** (inclusive `meta/admins`) | `counters` público; `meta/admins` e demais só admin | antes, a lista de uids/e-mails de admin era pública |
| `meta/*` write | admin em qualquer doc (inclusive `meta/admins`) | admin só em `counters`; `meta/admins` e demais só via Admin SDK | |
| `meta/counters` (cliente) | update com `changedKeys()` (ignora campos **adicionados/removidos**); exige que o doc e `orderSeq` já existam | `affectedKeys()`; aceita o primeiro `orderSeq` (doc ausente ou sem o campo) | antes o cliente podia incluir/remover campos (ex.: apagar `productsVersion`) junto com o +1 |
| `orders` (legado) | cliente **cria**; leitura por `userId`/`user.email` | ninguém cria; admin só altera status | o site não cria em `orders` |
| `clientes` | só admin | só admin | sem mudança |
| `adminRequests` | sem regra → negado para todos | só admin lê/cria (campos validados) | não havia escalada; o formulário do painel ficava quebrado e agora funciona para admin |
| `admins`, `adminsByEmail` | sem regra → negado | usuário lê só o próprio doc; ninguém grava | o fallback do painel volta a funcionar só para leitura |
| `produtos`, `ofertas`, `carrinhos`, `usuarios/*/endereco(s)` | — | iguais às anteriores | sem mudança |
| demais coleções | negado (padrão) | negado (explícito) | sem mudança |
