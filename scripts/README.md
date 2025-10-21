# Scripts de Integração (PG → Firestore / JSON)

Este diretório reúne os utilitários para integrar o PostgreSQL da farmácia ao site (Firestore) e para exportar um fallback em JSON.

## O que já está implementado
- Sincronização completa PG → Firestore com moderação por regras configuráveis.
- Atualização de estoque (apenas quantidade) sem afetar outros campos.
- Exportação para `data/products.json` (modo vitrine, somente leitura no front).
- Invalidação de cache no front via `meta/counters.productsVersion`.
- Regras de negócio: nomes especiais para perfumaria, filtro por filial do estoque, COALESCE de estoque ausente para 0.

---

## Filtros de produtos e moderação (config/product-filters.json)
As regras de publicação/pendência são declarativas neste arquivo. Campos suportados:
- disallowedKeywords: palavras bloqueadas no nome (case-insensitive, com acentos ignorados).
- disallowedGroups: lista de `cod_grupo` bloqueados.
- minPrice: preço mínimo global (após desconto) para publicar.
- minPriceByCategory: preço mínimo por categoria do site (chaves como: perfumaria, correlatos, etc.).
- minPriceByGroup: preço mínimo por `cod_grupo` (chaves string do número do grupo).
- requireDcb: se true, bloqueia itens sem DCB.
- requireLaboratorio: se true, bloqueia itens sem laboratório.
- minNameLength: comprimento mínimo do nome.
- maxDiscountPercent: teto de desconto permitido (0–100).
- blockIfRegex: expressões regulares (string) aplicadas ao nome; se casar, bloqueia.
- allowListIds: lista de ids (cod_reduzido) sempre permitidos, ignorando bloqueios.

Onde é aplicado:
- `scripts/sync-pg-to-firestore.mjs` lê esse JSON e calcula `pendente`, `motivosBloqueio` e, quando bloqueado, força `publicado=false` (sem sobrescrever liberações manuais quando não bloqueado).

Observações de domínio:
- Perfumaria (grupo 8000) usa `nom_prodcomp` como nome de exibição quando existir.
- Estoque é filtrado por filial (`cadestoq.cod_filial` via env `ESTOQUE_COD_FILIAL`, default 3) e, quando não há linha, trata como 0 (LEFT JOIN + COALESCE).

---

## Mapeamento de grupos → categorias do site
Definido em `scripts/sync-pg-to-firestore.mjs` (constante `GRUPO_TO_CATEGORIA`). Ajuste conforme sua taxonomia:

```
10000: 'conveniencia'
9000:  'correlatos'
4000:  'genericos'
8000:  'perfumaria'
3000:  'referencia'
2000:  'similares'
```

---

## Sincronismo — execução (PowerShell)
Requisitos gerais:
- Node 18+
- Dependências: `pg`, `firebase-admin` (já presentes em `package.json`)
- Service Account do Firebase Admin: mantenha o JSON fora do repositório e aponte por caminho absoluto.

Variáveis comuns (exemplos — prefira rodar via os scripts .ps1 prontos):

```powershell
# Postgres (usuário somente leitura recomendado)
$env:PGHOST = "192.168.1.220"; $env:PGPORT = "5432";
$env:PGDATABASE = "sgfpod1";   $env:PGUSER = "consulta"; $env:PGPASSWORD = "***";
# Timeouts (ms)
$env:PG_CONNECT_TIMEOUT = "10000"; $env:PG_STATEMENT_TIMEOUT = "60000";
# Firestore
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\Keys\\farmacia-service-account.json";
# Filial do estoque (default 3)
$env:ESTOQUE_COD_FILIAL = "3";
```

### A) Sync completo PG → Firestore
- Script pronto: `scripts\run-sync-template.ps1`
- Comportamento: cria/atualiza produtos em `produtos/{id}`, aplica filtros/moderação e faz bump de `productsVersion`.
- Amostra opcional: `SYNC_LIMIT` (ex.: 20) ou `SYNC_SAMPLE_IDS` (lista de ids) para testes rápidos.

Rodar manualmente:

```powershell
.\u005cscripts
un-sync-template.ps1
```

### B) Atualizar apenas estoque (quantidade)
- Script pronto: `scripts\run-sync-stock.ps1`
- Comportamento: só atualiza `quantidade` + `atualizadoEm`. Opções principais:
  - `ONLY_EXISTING=1`: não cria novos docs, só atualiza existentes.
  - `SKIP_UNCHANGED=1`: evita gravar quando a quantidade não mudou.
  - `BUMP_VERSION=1`: após alterações, atualiza `productsVersion`.
  - `PROGRESS_EVERY`: imprime progresso a cada N itens.
  - `VERBOSE=1`/`DRY_RUN=1`: diagnóstico sem escrever (útil para auditoria).

Rodar manualmente:

```powershell
.\u005cscripts
un-sync-stock.ps1
```

### C) Verificar divergências PG × Firestore (amostra)
- Script pronto: `scripts\run-verify-stock.ps1`
- Comportamento: consulta uma amostra no PG e compara com Firestore, listando OK/DIFF/FS_NOT_FOUND.

```powershell
.\u005cscripts
un-verify-stock.ps1
```

### D) Exportar JSON (modo vitrine)
- Script pronto: `scripts\run-export-template.ps1`
- Resultado: `data\products.json`. No front, adicione `?vitrine=1` nas páginas.

```powershell
.\u005cscripts
un-export-template.ps1
```

---

## Agendar no Windows (Task Scheduler)
Sugestões:
- Sync completo: 1× por madrugada.
- Estoque: a cada 10–30 minutos, com `ONLY_EXISTING=1` e `SKIP_UNCHANGED=1` para minimizar escritas.

Passos:
1) Agendador de Tarefas → Criar Tarefa (não básica) → Aba Geral: marcar "Executar com privilégios mais altos".
2) Disparadores: defina a periodicidade.
3) Ações: Iniciar um programa.
   - Programa/script: `powershell.exe`
   - Argumentos: `-ExecutionPolicy Bypass -File "C:\\caminho\\repo\\scripts\\run-sync-stock.ps1"`
   - Iniciar em: `C:\\caminho\\repo`
4) Teste executando manualmente e revise o histórico.

---

## Boas práticas e limites
- Não deprecie estoque pelo site; o estoque é autoridade do PG.
- Guarde o JSON do Service Account fora do repositório e proteja o caminho.
- Evite exceder limites diários do Firestore; o sync de estoque escreve apenas quando muda.
- Mantenha `PG_STATEMENT_TIMEOUT` e limites de amostra em testes para evitar consultas longas.
- Usuário de banco com permissão de leitura apenas.

---

## Solução de problemas rápidos
- Exit code 1 ao rodar: confira o caminho em `GOOGLE_APPLICATION_CREDENTIALS` (o script valida a existência do arquivo) e variáveis PG.
- Sem produtos retornados: verifique filtros (ativo, classe terapêutica vazia) e amostra (`SYNC_LIMIT`/`SYNC_SAMPLE_IDS`).
- Estoque não aparece: revise `ESTOQUE_COD_FILIAL` e lembre que ausência de linha vira `0` (COALESCE).
- Muitos itens pendentes: ajuste `config/product-filters.json` (minPrice, keywords, regex, etc.) ou use `allowListIds` para exceções.
- Front não atualiza de imediato: confirme o bump de `productsVersion` nos logs e aguarde cache/refresh do app.

---

## Referências de arquivos
- `scripts/sync-pg-to-firestore.mjs`: sync completo com regras de moderação e bump de versão.
- `scripts/sync-stock-only.mjs`: atualização de quantidade com opções de otimização.
- `scripts/verify-stock.mjs`: verificação de amostra PG × Firestore.
- `config/product-filters.json`: regras de bloqueio/publicação.
- Runners PowerShell: `run-sync-template.ps1`, `run-sync-stock.ps1`, `run-verify-stock.ps1`, `run-export-template.ps1`.
