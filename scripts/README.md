# Scripts de Integração (PG → Firestore / JSON)

Este diretório contém scripts para sincronizar o banco PostgreSQL da farmácia com o site.

## Opção A — Sincronizar para Firestore

Requisitos:
- Node 18+
- `npm i pg firebase-admin`
- Credencial do Firebase Admin (Service Account JSON)

Variáveis de ambiente (PowerShell no Windows):

```powershell
# Postgres
$env:PGHOST = "seu-host";
$env:PGPORT = "5432";
$env:PGDATABASE = "seu-db";
$env:PGUSER = "seu-user";
$env:PGPASSWORD = "sua-senha";
# SSL opcional
# $env:PGSSL = "1";

# Firebase Admin
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\caminho\\serviceAccount.json";
```

Rodar:

```powershell
node .\scripts\sync-pg-to-firestore.mjs
```

O script irá:
- Ler produtos do PG com as regras: `flg_ativo = 'A'`, `tip_classeterapeutica` nula/vazia, `qtd_estoque > 0`.
- Upsert na coleção `produtos` do Firestore usando `cod_reduzido` como `id`.
- Incrementar `meta/counters.productsVersion` para o front invalidar o cache e recarregar produtos.

Mapeamento de categorias:
- Edite a constante `GRUPO_TO_CATEGORIA` nos scripts para refletir como cada `cod_grupo` se encaixa nas categorias do site.

## Opção B — Exportar JSON para modo vitrine

Requisitos:
- Node 18+
- `npm i pg`

Variáveis (mesmo bloco PG acima), depois:

```powershell
node .\scripts\export-pg-to-json.mjs
```

Isso gera `data/products.json`. Para usar no site, abra as páginas com `?vitrine=1` (ex.: `modern-index.html?vitrine=1` ou `produtos.html?vitrine=1`). O código já está preparado para ler esse JSON e bloquear operações de escrita.

## Mapeamento de grupos (exemplo do cliente)
Atualize nos dois scripts:
```
10000: 'conveniencia'
9000:  'correlatos'
4000:  'genericos'
8000:  'perfumaria'
3000:  'referencia'
2000:  'similares'
```

## Agendar no Windows (Task Scheduler)
1. Abra o Agendador de Tarefas.
2. Criar Tarefa Básica → nome "Sync PG Firestore" → periodicidade (ex.: a cada 1 hora).
3. Ação: Iniciar um programa.
   - Programa/script: `powershell.exe`
   - Adicionar argumentos: `-ExecutionPolicy Bypass -File "C:\caminho\repo\scripts\run-sync-template.ps1"`
   - Iniciar em: `C:\caminho\repo` (pasta do projeto, onde está node_modules).
4. Marque "Executar com privilégios mais altos" se necessário.
5. Teste executando a tarefa manualmente e veja o histórico/saída.

> Se preferir o export para JSON, agende `scripts\run-export-template.ps1`.

## Dicas
- Execute via Agendador de Tarefas do Windows a cada 30–60 minutos.
- Use um usuário read-only no Postgres.
- Não versione o JSON de credenciais do Firebase Admin.
- Se `prc_desconto` for percentual inteiro (ex.: 15), adapte a lógica `calcularPreco()` (dividindo por 100).
