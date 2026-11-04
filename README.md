# Farmácia São Benedito — site

Loja virtual da Farmácia São Benedito: catálogo de produtos, carrinho, checkout, conta do cliente e painel administrativo.

- **Publicado em:** https://henriquecoan-code.github.io/farmacia/ (GitHub Pages, publica a branch `main`)
- **Tecnologia:** HTML + CSS + JavaScript (módulos ES6), sem build. Firebase Auth e Firestore (projeto `farmaciasaobenedito-bcb2c`, SDK 9.6 via CDN).
- **Dados dos produtos:** vêm do PostgreSQL da farmácia (ERP), sincronizados para o Firestore por scripts Node em [`scripts/`](scripts/README.md).

## Páginas

| Página | O que é |
|---|---|
| `index.html` | Início: destaques, categorias, busca |
| `produtos.html` | Catálogo completo com filtros, ordenação e paginação |
| `checkout.html` | Finalização do pedido (endereço com ViaCEP, entrega, pagamento) |
| `conta.html` | Minha conta: dados, endereços, baixar meus dados e excluir conta (LGPD) |
| `pedidos.html` | Histórico de pedidos do cliente |
| `privacidade.html` / `termos.html` | Política de Privacidade e Termos de Uso |
| `modern-admin.html` | Painel admin: produtos, pedidos, clientes, publicar catálogo |
| `instrucoes.html` | Instruções internas da equipe |
| `modern-index.html` | Só redireciona para `./` (endereço antigo) |

## Funcionalidades

**Cliente**
- Catálogo lido de documentos agregados (`catalogo/parte-N`): uma visita nova custa ~3 leituras no Firestore, e o catálogo fica em cache no navegador (IndexedDB) por 10 minutos. `?nocache` na URL força buscar de novo.
- Carrinho (localStorage):
  - ao abrir, preço e estoque são conferidos com o catálogo;
  - mostra o aviso "Preço atualizado" quando o preço mudou;
  - itens sem estoque ficam translúcidos e fora do total;
  - a quantidade é limitada ao estoque;
  - tem botão de lixeira para remover itens;
  - cada item tem uma caixa de seleção para escolher o que vai para o pedido, e os não selecionados continuam no carrinho depois da compra.
- Checkout: reconfere preços antes de enviar. Pagamento Pix, cartão (na entrega ou retirada) ou boleto; nenhum dado de cartão é coletado no site.
- Login e cadastro com Firebase Auth, com ciência da Política de Privacidade.
- PWA: instalável (`manifest.webmanifest`) e com service worker (`sw.js`) para funcionar offline.

**Admin**
- Acesso por custom claim `admin` (ver [`scripts/set-admin-claim.mjs`](scripts/set-admin-claim.mjs)).
- CRUD de produtos, pedidos e clientes.
- Botão **📢 Publicar catálogo**: regenera o catálogo agregado depois de editar produtos no painel.

## Estrutura

```
index.html, produtos.html, checkout.html, conta.html, pedidos.html,
privacidade.html, termos.html, modern-admin.html, instrucoes.html
sw.js, manifest.webmanifest     PWA
img/                            logo e ícones
modern/
  components/                   header, footer, modals, bottom-nav (carregados via component-loader)
  css/                          modern-styles, checkout, account, admin, modals...
  js/
    bootstrap.js                inicialização única compartilhada pelas páginas
    app.js, checkout.js, account.js, orders.js, admin.js, ...
    services/
      firebase-service.js       Firestore, catálogo agregado e cache
      catalog-utils.mjs         regras do catálogo (usado pelo site e pelos scripts Node)
      cart-service.js           carrinho, revalidação de preço/estoque e seleção
      auth-service.js, modals-service.js, legal.js, analytics-service.js (só local), ...
scripts/                        sincronização PG → Firestore, catálogo, admin (ver scripts/README.md)
config/product-filters.json     regras de moderação de produtos
data/products.json              cópia estática dos produtos (usada se o Firestore falhar)
firestore.rules, firebase.json  regras de segurança do Firestore
tests/firestore-rules/          testes das regras no Emulator
docs/SEGURANCA-FIRESTORE.md     explicação das regras e checklist de deploy
```

## Rodar localmente

```bash
python -m http.server 8000
```

Abra http://localhost:8000/. No VS Code/Claude, a configuração `site` em `.claude/launch.json` faz o mesmo.

Em `localhost`, o admin aceita o modo de desenvolvimento (`adminDev`). Esse modo nunca funciona no site publicado.

## Publicar uma alteração

1. Faça commit e push na `main`; o GitHub Pages publica em ~1 minuto.
2. **Se alterou algum JS ou CSS, aumente `CACHE_NAME` em `sw.js`** (ex.: `farmacia-shell-v6` → `v7`). Sem isso, quem já visitou o site continua com os arquivos antigos.
3. Regras do Firestore **não** são publicadas pelo push. Publique-as pelo Console (Firestore → Regras) ou com `firebase deploy --only firestore:rules`, depois de rodar os testes:
   ```bash
   cd tests/firestore-rules && npm install && npm test
   ```
   Detalhes em [`docs/SEGURANCA-FIRESTORE.md`](docs/SEGURANCA-FIRESTORE.md).

## Sincronização de produtos

Os produtos são sincronizados do Postgres (VPN necessária) por scripts PowerShell e Node. Eles gravam só o que mudou, usando um estado local, e atualizam o catálogo. Veja como rodar, a cota do Firestore e o agendamento em **[scripts/README.md](scripts/README.md)**.

## Firestore (coleções principais)

| Coleção | Uso |
|---|---|
| `produtos/{id}` | Cadastro completo (fonte: Postgres + moderação do admin) |
| `catalogo/parte-N` | Catálogo agregado lido pelo site (só produtos visíveis) |
| `meta/counters` | `productsVersion`, `catalogVersion`, `catalogParts`, `orderSeq` |
| `pedidos/{id}` | Pedidos dos clientes |
| `usuarios/{uid}` | Perfil e endereços do cliente |

Cota grátis: 50 mil leituras e 20 mil gravações por dia, renovando ~4h (Brasília).

## Privacidade (LGPD)

- Política e Termos em `privacidade.html` e `termos.html`; aviso de armazenamento local na primeira visita.
- O cliente pode baixar os próprios dados e excluir a conta em `conta.html`. A exclusão depende das regras novas do Firestore estarem publicadas.
- Sem Google Analytics nem cookies de rastreamento; o analytics é apenas local (localStorage).
- Terceiros envolvidos: Google Firebase, GitHub Pages, ViaCEP, WhatsApp, Google Fonts e cdnjs.

## Segurança

- Chaves do Firebase Admin e senhas do Postgres **nunca** entram no repositório: as chaves ficam em `C:\Keys\`, e a senha é pedida ao rodar os scripts.
- Conteúdo vindo do banco é escapado antes de ir para o HTML (`escapeHTML`).
- Pendência conhecida: o total do pedido é calculado no navegador. A solução proposta, uma Cloud Function, está em `docs/SEGURANCA-FIRESTORE.md`.
