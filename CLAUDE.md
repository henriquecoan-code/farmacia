# Farmácia São Benedito

## Visão geral do código

Loja online da Farmácia São Benedito (Lauro Müller - SC). O repositório tem o **site antigo**, que está no ar: HTML/JS na raiz e em `modern/`, com Firebase/Firestore e hospedagem no GitHub Pages. Tem também o **site novo**, em construção na pasta `site/`: Astro estático + Supabase (Postgres em São Paulo, Auth, RLS, RPCs) + busca Pagefind. Os produtos vêm do ERP da farmácia (Postgres, acessado por VPN e **só leitura**) por scripts Node que rodam no PC da farmácia.

**Stack:** Astro 7, Supabase (supabase-js, Postgres + RLS), Pagefind, Node (pg) para sync e testes (node:test + PGlite). No site antigo: Firebase 9.6 via CDN e firebase-admin.
**Estrutura:**
- `site/` é o site novo: `src/` (páginas e scripts do navegador), `scripts/` (sync do ERP, migrations, fotos), `supabase/` (migrations e testes).
- `scripts/` é o sync antigo ERP → Firestore.
- `config/product-filters.json` tem as regras de bloqueio, usadas pelos dois pipelines.

Arquitetura detalhada, rotas, banco, armadilhas e guia de tarefas em [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Regras importantes
- Responder e documentar em português.
- Segredos nunca entram no repositório:
  - chaves em `C:\Keys\`;
  - senha do ERP pedida ao rodar os scripts;
  - em `site/.env`, só a URL e a chave pública do Supabase.
- Não ler nem exibir `site/scripts/.saida/`, que tem credenciais de teste e dados do ERP.
- Runners `.ps1` rodam da raiz do projeto: `powershell -ExecutionPolicy Bypass -File .\site\scripts\<runner>.ps1`.
- Produtos de controle especial (Portaria 344) e antimicrobianos nunca vão para o site; o filtro fica no SELECT do sync.
- O total do pedido é calculado no banco (`criar_pedido`). Nunca confiar no preço vindo do navegador.
- Mudanças no banco entram como uma nova migration em `site/supabase/migrations/`, com teste em `site/supabase/tests/`, e são aplicadas com `run-aplicar-migrations.ps1`.
- Testes do site novo: `cd site && npm run test:db`. Para ver o site: `npm run build && npm run preview`.
- Não fazer commit nem push sem o pedido do usuário.
