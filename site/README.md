# Site novo — Farmácia São Benedito (Astro + Supabase)

Este é o site novo, em construção. O site atual, na raiz do repositório, continua no ar até a troca.

```
ERP (farmácia, só leitura) ──VPN + sync-erp──► Supabase (banco do site, na nuvem) ──build──► site estático (Astro)
```

- **O banco da farmácia só é lido.** O sync abre a sessão em modo `READ ONLY` e usa o usuário `consulta`.
- O **Supabase é um banco separado**. Ele guarda a cópia dos produtos, os clientes e os pedidos.
- Controle especial e antimicrobianos (`tip_classeterapeutica` preenchida) **nunca** saem do ERP.

## Situação

| Fase | Status |
|---|---|
| 1. Fundação: banco, regras de acesso, sync | ✅ código pronto e testado localmente; falta criar o Supabase e rodar |
| 2. Catálogo público: home, seções, produto, busca, sobre, privacidade, termos | ✅ pronto (com produtos de exemplo); falta o deploy |
| 3. Conta e pedido | ⏳ |
| 4. Admin | ⏳ |
| 5. Pagamentos (Mercado Pago + Pix Sicredi) | ⏳ |
| 6. Troca do site | ⏳ |

## Primeira configuração (uma vez)

1. **Criar o projeto no Supabase** em https://supabase.com, plano Free, região *South America (São Paulo)*. Anote a senha do banco.
2. Em *Project Settings → Database → Connection string*, escolha **Session pooler** e copie a URL, já com a senha no lugar de `[YOUR-PASSWORD]`. Salve-a numa linha só em:
   ```
   C:\Keys\supabase-db-url.txt
   ```
3. Opcional, mas recomendado: em *Database → SSL Configuration*, baixe o certificado e salve como `C:\Keys\supabase-ca.crt`.
4. Instale as dependências:
   ```powershell
   cd C:\Users\henri\OneDrive\Documentos\GitHub\farmacia\site
   npm install
   ```
5. Na raiz do projeto, crie as tabelas:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-aplicar-migrations.ps1
   ```
6. **Passo 0: investigar o ERP** (VPN ligada, só leitura):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-erp-investigar.ps1
   ```
   O resultado vai para `site/scripts/.saida/erp-investigacao.json`. Com ele, eu configuro em `run-sync-erp.ps1` qual coluna indica venda sob prescrição (`ERP_EXPR_PRESCRICAO`) e qual tem o EAN (`ERP_EXPR_EAN`). Enquanto isso não for configurado, todo medicamento (genéricos, referência, similares) fica como **prescrição**, que é o padrão seguro.
7. Primeira carga:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1 -DryRun   # simula
   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1           # grava
   ```

## Dia a dia

```powershell
powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1 -Modo estoque   # rápido, várias vezes ao dia
powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1                 # completo (preço, cadastro), 1x por dia
```

- O sync grava **só as linhas que mudaram**. O Supabase não cobra por leitura, então não há cota de leituras para controlar.
- O sync nunca mexe no que o admin edita: descrição, fotos, destaque, ocultar, liberar e correção de tarja.
- Produto que sai do ERP fica com estoque 0, e por isso some da loja.

## Desenvolvimento

```bash
cd site
npm run test:db   # testa banco, regras de acesso e sync num Postgres em memória (sem Docker)
npm run dev       # site em http://localhost:4321 (a busca só existe depois do build)
npm run build     # gera dist/ (~4 mil páginas) + índice de busca (Pagefind)
npm run preview   # serve o dist/ em http://localhost:4321
```

- Sem `PUBLIC_SUPABASE_URL` no `.env`, o build usa `../data/products.json` (exportação antiga) como **exemplo**, com os mesmos filtros do sync.
- Dados da loja (rodapé, Sobre, políticas) ficam em `src/data/loja.ts`. Os campos `PREENCHER` aparecem destacados em amarelo no site.
- Regras da Anvisa aplicadas no layout:
  - medicamento de prescrição mostra o selo "Exige receita", sem "de/por", desconto ou destaque (RDC 96/2008);
  - MIP traz a advertência obrigatória;
  - o rodapé informa AFE, licença e farmacêutico responsável.

- `supabase/migrations/`: tabelas (`0001`), regras de acesso RLS (`0002`) e funções chamadas pelo site (`0003`). O total do pedido é calculado **no banco** (`criar_pedido`).
- `scripts/lib/produtos-erp.mjs`: regras ERP → produto (preço, categoria, filtros de `../config/product-filters.json`).
- `scripts/lib/gravar-supabase.mjs`: gravação incremental.
- **Segredos nunca entram no repositório.** Ficam em `C:\Keys\`: a URL do banco, a service role e as credenciais Sicredi e Mercado Pago. O `.env` do site só pode ter valores públicos (`PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY`).
