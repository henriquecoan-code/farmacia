---
name: fotos-produtos
description: Trata as fotos de produtos tiradas no celular (foto do produto + foto do código de barras, em sequência) e publica no site da farmácia como site/public/produtos/<EAN>.webp, ligada ao produto pelo código de barras. Use quando o usuário pedir para processar, tratar, conferir ou corrigir fotos de produtos, a pasta fotos-entrada, ou fotos que não apareceram no site.
---

# Fotos de produtos (site novo da farmácia)

## Como funciona

1. O usuário tira, no celular, **duas fotos em sequência por produto**: primeiro o **produto**, depois o **código de barras**.
2. Ele envia as fotos para `fotos-entrada/` no GitHub (na raiz do repositório).
3. O workflow `.github/workflows/fotos-produtos.yml` roda sozinho a cada envio e chama `site/scripts/fotos-produtos.mjs`, que:
   - ordena as fotos pelo horário em que foram tiradas (EXIF; sem EXIF, nome do arquivo `AAAAMMDD_HHMMSS`);
   - lê o código de barras (EAN-13/EAN-8/UPC, com dígito verificador) com `zxing-wasm`;
   - monta os pares: foto sem código seguida de foto com código. Se a foto do produto também mostrar o mesmo código, o par vale;
   - na foto do produto: corrige a rotação do celular, remove o fundo com IA local (`@imgly/background-removal-node`, modelo `medium`), recorta, centraliza em **800×800**, fundo **#FFFFFF**, produto ocupando **82%**, nitidez leve, sem metadados, **WebP qualidade 82**;
   - salva em `site/public/produtos/<EAN>.webp` (EAN sem zeros à esquerda; foto nova substitui a antiga) e apaga as duas fotos originais;
   - o que não fecha par (foto sem código depois, código sem produto antes, erro de tratamento) vai para `fotos-entrada/revisar/`, com o motivo em `fotos-entrada/revisar/LEIA-ME.txt`. Os outros pares seguem normalmente.
4. No build do site, `site/src/lib/catalogo.ts` (`ligarFotos`) dá a foto `<EAN>.webp` ao produto que tem esse código e ainda não tem foto cadastrada no admin.
5. Os códigos de cada produto vêm do ERP, tabela **`cadcdbar`** (`gtin` ou `cod_barra`; um produto pode ter vários), lidos pelo `site/scripts/sync-erp.mjs` e gravados na coluna `ean` do Supabase separados por vírgula.

## Rodar manualmente

Na pasta `site/` (dependências já estão no `package.json`; a 1ª execução baixa o modelo de IA):

```bash
node scripts/fotos-produtos.mjs --dry-run            # só mostra os pares e o que faria
node scripts/fotos-produtos.mjs                      # processa e apaga os originais
node scripts/fotos-produtos.mjs --manter-originais   # processa e mantém os originais
```

Ou dispare o workflow "Fotos de produtos" pela aba Actions do GitHub (`workflow_dispatch`).

## Ao atender o usuário

- Para fotos em `fotos-entrada/revisar/`: leia o `LEIA-ME.txt`, olhe as fotos e resolva. Ex.: renomeie para acertar a ordem, peça a foto que falta, ou rode o script só com o par corrigido. Ao terminar, apague a linha do `LEIA-ME.txt` (e o arquivo, se ficar vazio).
- Foto que não aparece no site: confira se `site/public/produtos/<EAN>.webp` existe, se o EAN está entre os códigos do produto no `cadcdbar` (coluna `ean` do Supabase) e se o produto já tem foto cadastrada no admin (ela tem prioridade).
- Informe o peso original e o final (o script mostra, ex.: 3,0 MB → 37 KB).
- Dica de foto para o usuário: produto **apoiado em pé sobre uma folha branca**, não na mão. A IA às vezes mantém dedos que encostam no produto.
- Licença: `@imgly/background-removal-node` é AGPL. Pode ser usada como ferramenta interna (script/workflow), mas **não** deve ir para o código que roda no navegador.
- Não troque o tamanho/formato sem pedir: o site usa uma única imagem por produto (`fotos[0]` em `ProdutoImagem.astro`).
