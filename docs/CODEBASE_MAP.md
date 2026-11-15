---
last_mapped: 2026-11-14T17:46:58Z
total_files: 144
total_tokens: 253442
---

# Mapa do código: Farmácia São Benedito

> Gerado pelo Cartographer. Último mapeamento: 2026-11-14T17:46:58Z.
> Ficaram de fora: `data/products.json` (3 MB de dados), as pastas geradas (`site/dist`, `site/.astro`, `node_modules`) e `site/scripts/.saida/`, que é privada e tem credenciais e dados do ERP.

O repositório tem **um site só**: a loja em `site/` (Astro 7 estático + Supabase + Pagefind), publicada na raiz do GitHub Pages pelo workflow `site.yml`. O site antigo (HTML na raiz e em `modern/`, com Firebase/Firestore) e o sync antigo ERP → Firestore (`scripts/`) foram removidos em 11/2026 e ficam só no histórico do Git.

## Visão geral

```mermaid
graph TB
    subgraph Farmácia["Rede da farmácia (VPN)"]
        ERP[(ERP Postgres<br/>sgfpod1, só leitura)]
    end
    subgraph PC["PC da farmácia (PowerShell, chaves em C:\Keys)"]
        Sync[site/scripts/sync-erp.mjs]
    end
    subgraph Site["Site"]
        SB[(Supabase Postgres<br/>RLS + RPCs)]
        Build[GitHub Actions: Astro build + Pagefind]
        Pages[GitHub Pages]
    end
    Fotos[fotos-entrada/ → GitHub Action] --> PubFotos[site/public/produtos/EAN.webp]

    ERP -->|SELECT, sessão READ ONLY| Sync --> SB
    Sync -.->|repository_dispatch| Build
    SB -->|REST produtos_publicos| Build --> Pages
    PubFotos --> Build
    Pages -->|navegador: login, carrinho, criar_pedido| SB
```

## Estrutura de pastas

```
/
├── config/product-filters.json   regras de bloqueio de produto (usadas pelo sync)
├── data/products.json    exportação antiga do ERP (dados de exemplo quando não há Supabase configurado)
├── docs/                 este mapa
├── fotos-entrada/        fotos do celular para processar (gatilho do Action)
├── .github/workflows/fotos-produtos.yml
├── .github/workflows/site.yml   gera o site e publica na raiz do Pages (push na main, aviso do sync
│                                "catalogo-atualizado", fim do workflow de fotos e todo dia às 03:30)
├── .claude/              launch.json (preview "site-novo"), skill fotos-produtos
└── site/                 O SITE
    ├── astro.config.mjs  SITE_URL / BASE_PATH por variável de ambiente
    ├── .env              só PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY (fora do Git)
    ├── public/           img/, produtos/<EAN>.webp, sw.js (desliga o service worker do site antigo)
    ├── src/
    │   ├── data/loja.ts  dados da loja (RDC 44); campos PREENCHER
    │   ├── lib/          catalogo.ts (build), secoes.ts, supabase.ts, url.ts
    │   ├── layouts/Base.astro
    │   ├── components/   Catalogo (submenu), Listagem, ProdutoCard, ProdutoImagem
    │   ├── pages/        rotas (ver tabela abaixo)
    │   ├── scripts/      código do navegador: carrinho, sessão, endereços, busca…
    │   └── styles/       global.css (tokens/formulários), produto-card.css
    ├── scripts/          sync-erp, aplicar-migrations, erp-investigar, fotos-produtos
    └── supabase/
        ├── migrations/   0001 schema · 0002 RLS · 0003 RPCs · 0004 service_role · 0005
        └── tests/        db.test.mjs, sync.test.mjs (PGlite, sem Docker)
```

---

## Site novo (`site/`)

### Build × navegador
- **No build** (frontmatter, `getStaticPaths`, `lib/catalogo.ts`) roda Node e gera as páginas a partir do catálogo.
- **No navegador** (`<script>` e `src/scripts/*`) rodam carrinho, login, checkout, conta, pedidos, busca e a atualização "ao vivo" de preço e estoque, falando direto com o Supabase. O RLS e as RPCs garantem a segurança.
- O HTML do produto é uma foto do último build. `ao-vivo.ts` e `carrinho-revalidar.ts` corrigem preço e estoque no navegador.

### lib/
| Arquivo | Papel |
|---|---|
| `catalogo.ts` | **Só build.** `carregarProdutos()` (memoizado). Lê `produtos_publicos` via REST, só com o header `apikey`, porque a chave `sb_publishable_` não é JWT. Pagina com `Range` de 1000 em 1000. Sem `.env`, usa `../data/products.json` com os filtros de `config/product-filters.json`. `ligarFotos` liga `public/produtos/<EAN>.webp` pelo EAN. Também tem `destaquesHome` (só MIP), `temDesconto` e `percentualDesconto`. |
| `secoes.ts` | Sem dependência de Node, serve também ao navegador. `SECOES` (slug, nome, categorias, cor), `MENU_SECAO` (nome curto e ícone SVG), `NOME_TIPO`, `NOME_CATEGORIA`, `secaoDaCategoria`, `brl`, `dividirNome`. |
| `supabase.ts` | Cliente (PKCE, sessão persistida), ou `null` sem `.env`. |
| `url.ts` | `u(path)` respeita o `BASE_PATH`; também `urlProduto` e `urlSecao(slug, n)`. |

### Rotas
| Rota | Arquivo | Observação |
|---|---|---|
| `/` | `index.astro` | Hero, seções (só no celular), 8 ofertas, JSON-LD `Pharmacy` |
| `/categoria/<secao>/[n]/` | `categoria/[secao]/[...pagina].astro` | 48 por página, atalhos de tipo |
| `/tipo/<tipo>/[n]/` | `tipo/[tipo]/[...pagina].astro` | genéricos, referência, similares, outros |
| `/ofertas/[n]/` | `ofertas/[...pagina].astro` | com desconto, maior % primeiro |
| `/produto/<slug>-<cod>/` | `produto/[slug].astro` | JSON-LD Product, "mesmo princípio ativo", metadados do Pagefind |
| `/busca/?q=&secao=` | `busca.astro` | Pagefind JS API, mesma grade de cards |
| `/carrinho/`, `/checkout/` | | noindex |
| `/entrar/`, `/redefinir-senha/` | | login, cadastro, esqueci a senha |
| `/conta/`, `/conta/pedidos/`, `/conta/pedido/?id=` | | exigem login; LGPD (baixar e excluir) |
| `/sobre/`, `/privacidade/`, `/termos/`, `/404` | | |

### Componentes e layout
- **`Base.astro`**:
  - cabeçalho com faixa, logo, busca (GET `/busca/`), conta e carrinho, e menu de seções com ícones (nomes curtos abaixo de 1000px; 4 colunas no celular);
  - rodapé com os dados legais;
  - script global com cliques delegados em `[data-qtd-passo]` e `[data-add-carrinho]`, o contador do carrinho e o rótulo Entrar/Conta, que olha a chave `sb-*-auth-token` sem carregar o Supabase.
- **`Catalogo.astro`**: a partir de 1000px, grade de 5 colunas: submenu (1 card de largura, 4 seções e o botão "Fale com nossa equipe") + conteúdo (4 cards por linha).
- **`Listagem.astro`**: migalhas, h1, atalhos de tipo, grade e paginação.
- **`ProdutoCard.astro` / `ProdutoImagem.astro`**: card com preço cheio riscado, % e preço final, quantidade −/+ e Adicionar. Sem foto, mostra um card tipográfico na cor da seção.

### Carrinho, sessão e pedido (navegador)
- **`scripts/carrinho.ts`**:
  - guarda no localStorage `sb_carrinho_v1` um array de `ItemCarrinho` (cod_red, slug, nome, preco, estoque, tipo_venda, quantidade, selecionado, preco_anterior?, indisponivel?);
  - cada gravação dispara o evento `carrinho:mudou`;
  - `itensDoPedido()` devolve os itens marcados e disponíveis; `removerItens()` tira só os comprados.
- **`scripts/carrinho-revalidar.ts`**: `revalidar()` consulta `produtos_publicos`. Fica separado para não carregar o supabase-js em todas as páginas.
- **`scripts/sessao.ts`**:
  - `cliente()`, `usuarioAtual()`;
  - `exigirLogin()`, que redireciona para `/entrar/?volta=`;
  - `destinoVolta()`, que só aceita caminhos internos;
  - `mensagemErro()` (erros do Supabase e do banco em português), `esc()`, rótulos de status, pagamento e entrega;
  - `VERSAO_POLITICA`.
- **`scripts/enderecos.ts`**: CRUD de `enderecos` (via RLS), o formulário compartilhado entre conta e checkout, e o ViaCEP (envia só o CEP).
- **Checkout**:
  1. `exigirLogin`, depois `revalidar`;
  2. carrega `config_loja`, `perfis` e endereços;
  3. o cliente escolhe entrega e pagamento (por ora só "na entrega");
  4. `rpc('criar_pedido')` grava o pedido;
  5. `removerItens` tira os comprados do carrinho;
  6. redireciona para `/conta/pedido/?id=…&novo=1`.

```mermaid
sequenceDiagram
    participant C as Cliente (navegador)
    participant P as Página estática
    participant S as Supabase
    C->>P: abre /carrinho/
    P->>S: select produtos_publicos (cod_red in …)
    S-->>P: preço/estoque atuais (avisos de preço/esgotado)
    C->>P: Finalizar → /checkout/
    P->>S: getSession (sem sessão → /entrar/?volta=/checkout/)
    P->>S: config_loja, perfis, enderecos
    C->>P: Confirmar pedido
    P->>S: rpc criar_pedido({cod_red, quantidade}[], entrega, pagamento, endereço)
    S-->>S: relê preço/estoque na view, calcula frete e total, grava pedido + itens + log
    S-->>P: {id, numero, total}
    P->>C: /conta/pedido/?id=…&novo=1
```

### Busca (Pagefind)
- Só o `<article data-pagefind-body>` das páginas de produto é indexado. Ele carrega spans escondidos com `meta=title`, `meta=produto` (JSON para o card), `filter=secao` e `sort=preco`.
- O índice nasce no `npm run build` (`astro build && pagefind --site dist`), então **não existe no `npm run dev`**.
- `busca.astro` faz `import()` do `pagefind.js` e chama `filters()` antes de `search()`; sem isso, a contagem por seção volta vazia. Os resultados saem em lotes de 24, com `cardHtml()`.

---

## Banco do site novo (`site/supabase/migrations/`)

| Migration | Conteúdo |
|---|---|
| `0001_schema.sql` | Tabelas `produtos` (colunas do ERP + editoriais), view `produtos_publicos`, `config_loja` (1 linha: frete, parcelas, versão da política), `admins`, `perfis`, `enderecos`, `pedidos` (número a partir de 1001), `pedido_itens`, `pedido_status_log`, `pagamentos_eventos`. Gatilhos `tg_novo_usuario` (cria o perfil com o aceite) e `tg_log_status`. |
| `0002_rls.sql` | RLS em tudo. Revoga o padrão do Supabase e devolve só o necessário. Anônimo lê `produtos_publicos` e `config_loja`; cliente acessa os próprios perfis, endereços e pedidos (pedidos só leitura); equipe (`is_equipe`/`is_admin`) vê tudo. |
| `0003_rpc.sql` | `criar_pedido` (total no servidor), `cancelar_meu_pedido`, `admin_mudar_status` (transições válidas), `admin_atualizar_produto` (só campos editoriais), `exportar_meus_dados`, `excluir_minha_conta` (anonimiza os pedidos). EXECUTE só para `authenticated`. |
| `0004_service_role.sql` | Permissões do `service_role`: o projeto foi criado com "expose new tables" desligado. |
| `0005_pedido_sem_declaracao.sql` | `criar_pedido` sem exigir declaração de receita (decisão da farmácia). O pedido continua marcado com `tem_prescricao`. |

- **`produtos_publicos`**: `publicado AND (NOT pendente OR liberado_manual) AND estoque > 0`. `destaque` só vale para MIP (RDC 96/2008), e `tipo_venda` = `coalesce(tipo_venda_manual, tipo_venda)`.
- **Status do pedido**: `aguardando_pagamento` → `pago` → `separando` → `enviado` ou `pronto_retirada` → `entregue`, com `cancelado` a partir de qualquer passo. Na tela, um pedido "na entrega" ainda não pago aparece como **Recebido**.
- As migrations são aplicadas por `site/scripts/aplicar-migrations.mjs`, que registra cada uma em `public._migrations` (com RLS e sem políticas).

---

## Pipelines ERP → site

### Regras comuns
- O ERP é lido em `cadprodu` + `cadestoq` (filial 3) + `cadcddcb` (DCB) + `cadlabor` + `cadcdbar` (EAN). Só entram produtos com `flg_ativo='A'`.
- **Exclusões regulatórias**:
  - `tip_classeterapeutica` preenchida (SNGPC 1 = antimicrobiano, 2 = controle especial) fica fora;
  - `tip_lista` preenchida (listas A1–C5 da Portaria 344 e `T`, antimicrobiano).
- **`calcularPreco`**: um desconto maior que 1 é lido como porcentagem; entre 0 e 1, como fração.
- **Categorias** por `cod_grupo`: 10000 suplementos, 9000 hospitalares, 4000 genéricos, 8000 dermocosméticos (com `nom_prodcomp` como nome), 3000 referência, 2000 similares; o resto vira `medicamentos`.
- **`config/product-filters.json`**: palavras proibidas, preço mínimo, desconto máximo, regex e allowlist. Um produto que bate nessas regras fica `pendente`; não é apagado.
- O ERP **não tem campo de tarja**: `tip_id_tarja` está vazio. Os medicamentos ficam `prescricao` por padrão, e o admin corrige com `tipo_venda_manual`.

### Sync: `site/scripts/sync-erp.mjs`
- Runner: `.\site\scripts\run-sync-erp.ps1 [-Modo completo|estoque] [-DryRun]`, executado da raiz do projeto e com VPN.
- Lê o ERP numa sessão `READ ONLY` e grava no Supabase numa única transação; o `DRY_RUN` faz ROLLBACK no fim.
- **`lib/produtos-erp.mjs`**: transformação pura (preço, categoria, slug, bloqueio, EAN).
- **`lib/gravar-supabase.mjs`**:
  - upsert com `ON CONFLICT … WHERE (…) IS DISTINCT FROM (…)`, então só grava o que mudou e nunca toca nos campos editoriais;
  - zera o estoque de produtos que saíram do ERP, exceto em amostra.
- Dispara `repository_dispatch` (`catalogo-atualizado`) se houver `C:\Keys\github-dispatch-token.txt`; o workflow `site.yml` escuta esse evento e republica o site.
- `erp-investigar.mjs` é o "passo 0": descobre colunas do ERP e grava o resultado em `.saida/`.

### Sync agendado (PC da farmácia)
- **Senha do ERP:** `run-sync-erp.ps1 -GuardarSenha` grava `C:\Keys\erp-senha.dpapi`, cifrada pelo Windows (DPAPI). Só o mesmo usuário, no mesmo computador, consegue ler. Sem `-Agendado`, o runner ainda pergunta a senha se o arquivo não existir.
- **`agendar-sync.ps1`** cria as tarefas na pasta `\Farmacia\` do Agendador de Tarefas (`-Listar` mostra a situação, `-Remover` apaga):
  - **Sync estoque:** a cada 30 min, das 07:30 às 22:00;
  - **Sync completo:** todo dia às 22:30 (republica o site se o catálogo mudou).
- As tarefas chamam `wscript run-oculto.vbs <modo>`, que roda `run-sync-erp.ps1 -Modo <modo> -Agendado` sem janela e devolve o código de saída. Rodam com o usuário logado (por causa da senha cifrada) e recuperam a execução perdida se o PC estava desligado.
- **Log:** `%LOCALAPPDATA%\FarmaciaSync\logs\sync-<modo>-AAAA-MM.log`.
- **Monitoramento (healthchecks.io):** com `C:\Keys\healthchecks.json` (`{ "sync-estoque": "https://hc-ping.com/…", "sync-completo": "…" }`), cada execução agendada avisa o início, o sucesso ou a falha, com as últimas linhas do log. O workflow `site.yml` avisa pela URL do secret `HEALTHCHECK_SITE`. Sem o arquivo ou o secret, nada é avisado.

### Fotos de produtos
1. Fotografar no celular duas fotos por produto, em sequência: o produto e depois o código de barras.
2. Enviar para `fotos-entrada/`.
3. `.github/workflows/fotos-produtos.yml` roda `site/scripts/fotos-produtos.mjs`:
   - ordena as fotos pelo EXIF;
   - lê o EAN (zxing-wasm);
   - remove o fundo com @imgly (AGPL: usar só como ferramenta interna);
   - gera um quadrado de 800px em WebP;
   - grava `site/public/produtos/<EAN>.webp`.
4. Fotos sem par vão para `fotos-entrada/revisar/` com o motivo registrado em `LEIA-ME.txt`.
5. No build, `ligarFotos` associa a foto pelo EAN. Uma foto cadastrada no admin tem prioridade.
- A skill `.claude/skills/fotos-produtos` orienta como diagnosticar quando uma foto não aparece.

---

## Publicação (`.github/workflows/site.yml`)

- Endereço: `https://henriquecoan-code.github.io/farmacia/` (`SITE_URL` + `BASE_PATH=/farmacia`). No Pages, a fonte é **GitHub Actions**.
- Passos: `npm ci` → `npm run test:db` → `npm run build` (lê os produtos do Supabase) → confere que há pelo menos 500 páginas de produto → publica `site/dist`.
- Se o Supabase não responder ou os testes falharem, nada é publicado e o site no ar continua como estava.
- Gatilhos: push na `main` (em `site/`, `config/` ou no próprio workflow), `repository_dispatch` do sync, fim do workflow de fotos, todo dia às 03:30 e execução manual.
- **Domínio próprio:** trocar `SITE_URL` pelo domínio e `BASE_PATH` por `/`, configurar o domínio no Pages e atualizar a Site URL e as Redirect URLs do Supabase Auth.
- `site/public/sw.js` existe só para desligar o service worker que o site antigo registrava neste mesmo endereço (ele servia as páginas antigas do cache).

---

## Convenções
- Código, comentários, mensagens e documentação em **português**.
- Segredos **nunca** no repositório:
  - chaves em `C:\Keys\` (`supabase-db-url.txt`, CA, token do GitHub);
  - senha do ERP pedida pelo `Read-Host` ou lida de `$env:PGPASSWORD`;
  - no `site/.env`, só valores públicos.
- Os runners `.ps1` rodam **da raiz do projeto**: `powershell -ExecutionPolicy Bypass -File .\site\scripts\…`. Não são scripts do `npm run`.
- No site:
  - todo `innerHTML` passa por `esc()`;
  - erros do banco são códigos (`raise exception 'codigo:…'`), traduzidos por `mensagemErro()`;
  - o preço vindo do navegador nunca é confiado.
- Um card de produto existe em **dois lugares**: `ProdutoCard.astro` e `scripts/card-html.ts`. Mudou um, mude o outro.
- Testes: `cd site && npm run test:db` cobre banco, RLS e sync, num Postgres em memória (PGlite). O workflow de publicação roda esses testes antes de gerar o site.

## Armadilhas
- **`getStaticPaths` é isolado** do resto do arquivo: constantes como `POR_PAGINA` precisam ficar dentro dele.
- **O build precisa rodar dentro de `site/`**: o modo de exemplo lê `../data/products.json` a partir do `process.cwd()`.
- **A busca não funciona no `npm run dev`**: use `npm run build && npm run preview`.
- **Classes com `display` anulavam `hidden`**: o `global.css` tem `[hidden]{display:none!important}`.
- **No Git Bash do Windows, `BASE_PATH=/farmacia` é convertido em caminho de arquivo** e o build falha. Para testar o build com o caminho de produção, use o PowerShell (`$env:BASE_PATH='/farmacia'`).
- **`VERSAO_POLITICA` aparece em 4 lugares**: `sessao.ts`, `privacidade.astro`, `termos.astro` e `config_loja.politica_versao`.
- **Supabase Auth**:
  - o envio padrão de e-mail só chega a membros do projeto, então clientes reais precisam de SMTP próprio;
  - configure as Redirect URLs e a senha mínima de 8 caracteres.
- **Os links de e-mail usam `token_hash`** (modelos "Confirm signup" e "Reset password" do Supabase editados à mão): as páginas `entrar` e `redefinir-senha` conferem o código com `verifyOtp`. Se os modelos voltarem ao padrão, o link só funciona no navegador em que foi pedido.

## Guia rápido
| Tarefa | Onde mexer |
|---|---|
| Mudar dados da loja ou rodapé legal | `site/src/data/loja.ts` (o texto fixo de cidades fica em `Base.astro` e `index.astro`) |
| Mudar seções ou menu | `site/src/lib/secoes.ts` (as rotas, o submenu e o filtro de busca derivam dele) |
| Mudar o card de produto | `ProdutoCard.astro` + `scripts/card-html.ts` + `ProdutoImagem.astro` + `styles/produto-card.css`; dado novo também em `metaBusca` (produto) |
| Nova página pública | `src/pages/x.astro` com `<Base>`; link no rodapé de `Base.astro` |
| Nova página com login | Copiar o padrão de `conta.astro`: `exigirLogin()` + `noindex` |
| Nova regra de pedido ou erro do banco | Nova migration `000N_*.sql` (+ teste em `db.test.mjs`) e uma linha em `mensagemErro()` |
| Aplicar migrations | `.\site\scripts\run-aplicar-migrations.ps1` |
| Agendar o sync no PC da farmácia | `run-sync-erp.ps1 -GuardarSenha` (uma vez) e `.\site\scripts\agendar-sync.ps1`; conferir com `-Listar` |
| Sincronizar o ERP | `.\site\scripts\run-sync-erp.ps1 [-Modo estoque] [-DryRun]` (com VPN) |
| Regras de bloqueio de produto | `config/product-filters.json` |
| Fotos | Enviar para `fotos-entrada/` (Action) ou rodar `node scripts/fotos-produtos.mjs` dentro de `site/` |
| Ver o site | `cd site && npm run build && npm run preview` (ou a configuração "site-novo" em `.claude/launch.json`) |
