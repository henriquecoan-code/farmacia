# Farmácia São Benedito

Loja online da Farmácia São Benedito (Lauro Müller - SC).

- **Site:** https://henriquecoan-code.github.io/farmacia/
- **Tecnologia:** [Astro](https://astro.build) (site estático) + [Supabase](https://supabase.com) (Postgres em São Paulo, login, regras de acesso e funções) + busca [Pagefind](https://pagefind.app). O código fica na pasta [`site/`](site/).
- **Dados dos produtos:** vêm do sistema da farmácia (ERP em Postgres, só leitura, por VPN) e são gravados no Supabase por um script que roda no PC da farmácia.
- **Hospedagem:** GitHub Pages, publicado pelo workflow [`site.yml`](.github/workflows/site.yml).

O site antigo (HTML + Firebase) foi removido em 11/2026 e continua disponível no histórico do Git.

## O que o site faz

- **Catálogo:** uma página por produto, seções (Medicamentos, Perfumaria, Suplementos, Saúde), ofertas e busca.
- **O que é vendido:** medicamentos isentos de prescrição e de tarja vermelha comum, perfumaria, suplementos e correlatos. **Controle especial (Portaria 344) e antimicrobianos nunca entram no site**; o filtro fica na leitura do ERP.
- **Conta do cliente:** cadastro com e-mail e senha, endereços, pedidos, exportação dos dados e exclusão da conta (LGPD).
- **Carrinho e pedido:** o preço e o estoque são conferidos de novo no banco, e o total do pedido é calculado no banco (função `criar_pedido`), nunca no navegador. Pagamento na entrega ou retirada; pagamento online ainda não está disponível.
- **Painel da equipe (`/admin/`):** fila de pedidos, separação, mudança de situação, impressão e edição dos produtos (publicar, destaque, descrição, foto, tipo de venda). Os pedidos também aparecem no FarmaRotina.

## Rodar no computador

```bash
cd site
npm install
npm run build
npm run preview
```

O arquivo `site/.env` (fora do Git) leva só o endereço e a chave pública do Supabase:

```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
```

Sem ele, o site é gerado com produtos de exemplo de `data/products.json`. A busca só funciona depois do `npm run build`.

Testes do banco (regras de acesso, pedido e sync), num Postgres em memória:

```bash
cd site
npm run test:db
```

## Publicação

O workflow **Publicar site** roda os testes, gera o site com os produtos do Supabase e publica no GitHub Pages. Ele dispara:

- a cada push na `main` que mexa em `site/` ou `config/`;
- quando o sync do ERP avisa que o catálogo mudou;
- quando o workflow de fotos termina;
- todo dia às 03:30;
- manualmente, na aba Actions.

Se os testes falharem ou o Supabase não responder, nada é publicado e o site no ar não muda.

## Rotinas no PC da farmácia

Os comandos rodam **da raiz do projeto**, com a VPN ligada quando leem o ERP. As chaves ficam em `C:\Keys\`, nunca no repositório.

| Tarefa | Comando |
|---|---|
| Sincronizar produtos (completo) | `powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1` |
| Sincronizar só o estoque | `powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1 -Modo estoque` |
| Aplicar mudanças no banco | `powershell -ExecutionPolicy Bypass -File .\site\scripts\run-aplicar-migrations.ps1` |
| Dar acesso ao painel da equipe | `powershell -ExecutionPolicy Bypass -File .\site\scripts\run-equipe.ps1 -Email pessoa@exemplo.com` |

**Fotos de produtos:** envie para a pasta `fotos-entrada/` duas fotos por produto, em sequência (o produto e depois o código de barras). O workflow **Fotos de produtos** trata as imagens e as liga ao produto pelo código de barras.

## Documentação

- [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md): arquitetura, rotas, banco, armadilhas e guia de tarefas.
- [CLAUDE.md](CLAUDE.md): regras do projeto.
