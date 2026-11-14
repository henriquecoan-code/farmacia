---
name: ecommerce-photo-studio
description: Prepara fotos brutas de produtos para e-commerce em Node.js. Remove o fundo via IA localmente, aplica fundo branco puro (#FFFFFF), ajusta iluminação/nitidez, centraliza o produto com margem padrão e exporta versões otimizadas em WebP e AVIF prontas para web.
---

# E-commerce Photo Studio (Node.js)

Use esta skill sempre que o usuário pedir para tratar, limpar, remover fundo, padronizar ou otimizar fotos de produtos para e-commerce e sites.

## Pipeline de Tratamento Obrigatório

Para qualquer imagem fornecida pelo usuário, execute as seguintes etapas em sequência:

1. **Remoção de Fundo (Local AI):** Use `@imgly/background-removal-node` para isolar o produto do fundo original sem depender de APIs pagas.
2. **Recorte Inteligente (Auto-Trim):** Remova o excesso de transparência ao redor do produto para encontrar seus limites reais (`bounding box`).
3. **Padronização de Estúdio (Fundo Branco `#FFFFFF`):**
   - Crie um canvas quadrado (`1200x1200` para desktop/zoom e `600x600` para cards/listagens) com fundo branco sólido (`#FFFFFF`).
   - Redimensione o produto recortado para ocupar **82% da área** (`margin` de 9% em cada lado), garantindo alinhamento visual uniforme entre todos os produtos da loja.
4. **Tratamento de Imagem (Sharp):**
   - Normalize levemente o contraste e aplique nitidez suave (`sharpen`) para realçar texturas do produto.
   - Remova metadados EXIF/GPS para privacidade e redução de peso.
5. **Exportação Web & Código:**
   - Salve em **WebP** (qualidade `85`) e **AVIF** (qualidade `80`) na pasta de saída (padrão: `public/images/products/`).
   - Retorne ao usuário a tag HTML `<picture>` responsiva pronta para uso com `width`, `height` e `loading="lazy"`.

## Configuração de Ambiente

Antes de rodar o script, verifique se `@imgly/background-removal-node` e `sharp` estão no `package.json`. Se não estiverem instalados, execute:

```bash
npm install --no-save @imgly/background-removal-node sharp
```

## Script de Processamento (Node.js)

Crie e execute um script temporário `process-product.mjs` (remova-o após concluir, caso o usuário não peça para mantê-lo) seguindo este modelo:

```javascript
import { removeBackground } from '@imgly/background-removal-node';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const inputPath = process.argv[2];
const outputDir = process.argv[3] || './public/images/products';
const baseName = path.basename(inputPath, path.extname(inputPath))
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-');

async function processEcommerceImage() {
  await fs.mkdir(outputDir, { recursive: true });

  // 1. Remove o fundo localmente usando IA
  const blob = await removeBackground(inputPath, {
    model: 'medium',
    output: { format: 'image/png' }
  });
  const cutoutBuffer = Buffer.from(await blob.arrayBuffer());

  // 2. Remove bordas transparentes vazias e aplica nitidez leve
  const trimmedBuffer = await sharp(cutoutBuffer)
    .trim()
    .sharpen({ sigma: 0.8 })
    .toBuffer();

  // 3. Gera tamanhos padrão de e-commerce (1200px zoom e 600px card)
  const sizes = [
    { suffix: 'full', canvas: 1200, productMax: 980 },
    { suffix: 'card', canvas: 600, productMax: 490 }
  ];

  for (const { suffix, canvas, productMax } of sizes) {
    const resizedProduct = await sharp(trimmedBuffer)
      .resize(productMax, productMax, {
        fit: 'inside',
        withoutEnlargement: false
      })
      .toBuffer();

    // Compõe sobre fundo branco puro (#FFFFFF) centralizado
    const studioImage = sharp({
      create: {
        width: canvas,
        height: canvas,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    }).composite([{ input: resizedProduct, gravity: 'center' }]);

    // Exporta WebP e AVIF otimizados
    await studioImage
      .clone()
      .webp({ quality: 85, effort: 5 })
      .toFile(path.join(outputDir, `${baseName}-${suffix}.webp`));

    await studioImage
      .clone()
      .avif({ quality: 80, effort: 4 })
      .toFile(path.join(outputDir, `${baseName}-${suffix}.avif`));
  }

  console.log(`Concluído: ${baseName} salvo em ${outputDir}`);
}

processEcommerceImage().catch(console.error);
```

## Execução

Rode o comando apontando para a foto original:

```bash
node process-product.mjs "./caminho/da/foto-original.jpg" "./public/images/products"
```

## Regras de Resposta ao Usuário
- Informe o peso original vs. peso final dos arquivos gerados.
- Sempre forneça o snippet HTML `<picture>` pronto para colar no site, apontando para os arquivos `.avif` e `.webp` criados.
- Se o usuário passar uma pasta inteira, adapte o loop para processar todas as imagens `.jpg`, `.jpeg` e `.png` do diretório em lote.
