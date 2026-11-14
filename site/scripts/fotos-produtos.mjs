// Fotos de produtos: fotos-entrada/ (celular) -> site/public/produtos/<EAN>.webp
//
// Fluxo esperado: para cada produto, 1 foto do PRODUTO e logo depois 1 foto do CÓDIGO DE BARRAS.
//   1. ordena as fotos pelo horário em que foram tiradas (EXIF; sem EXIF, nome do arquivo)
//   2. lê o código de barras de cada foto e monta os pares (produto -> código)
//   3. foto do produto: corrige a rotação, remove o fundo (IA local), centraliza em 800x800
//      com fundo branco (#FFFFFF), produto ocupando 82% e exporta WebP
//   4. salva em site/public/produtos/<EAN>.webp e apaga as fotos originais do par
//   5. o que não deu para resolver vai para fotos-entrada/revisar/ (com o motivo em LEIA-ME.txt)
//
// O site liga a foto ao produto pelo EAN (tabela cadcdbar do ERP): ver src/lib/catalogo.ts.
//
// Uso (na pasta site/):  node scripts/fotos-produtos.mjs [--dry-run] [--manter-originais]
import { removeBackground } from '@imgly/background-removal-node';
import sharp from 'sharp';
import exifr from 'exifr';
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// wasm do leitor de código de barras vem do node_modules (sem baixar da internet)
const wasm = await fs.readFile(createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm'));
prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.length) }, fireImmediately: true });

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRADA = path.join(RAIZ, 'fotos-entrada');
const REVISAR = path.join(ENTRADA, 'revisar');
const SAIDA = path.join(RAIZ, 'site', 'public', 'produtos');
const DRY_RUN = process.argv.includes('--dry-run');
const MANTER = process.argv.includes('--manter-originais');

const LADO = 800;          // tamanho final (quadrado)
const OCUPACAO = 0.82;     // produto ocupa 82% do lado (9% de margem de cada lado)
const QUALIDADE = 82;      // WebP
const EXTENSOES = /\.(jpe?g|png|heic|heif|webp)$/i;

// EAN/GTIN sem zeros à esquerda (GTIN-14 "0789..." = EAN-13 "789...")
export const normalizarEan = (s) => String(s || '').replace(/\D/g, '').replace(/^0+/, '');

// Dígito verificador GS1 (EAN-8, UPC-A, EAN-13, GTIN-14)
export function eanValido(codigo) {
  const d = String(codigo).replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(d.length)) return false;
  const nums = [...d].map(Number);
  const dv = nums.pop();
  const soma = nums.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === dv;
}

// Monta os pares produto -> código. fotos: [{arquivo, codigo|null}] já em ordem de horário.
export function montarPares(fotos) {
  const pares = [];
  const problemas = [];
  for (let i = 0; i < fotos.length; ) {
    const a = fotos[i];
    const b = fotos[i + 1];
    if (!b) {
      problemas.push({ fotos: [a], motivo: a.codigo ? 'código de barras sem a foto do produto antes' : 'foto do produto sem a foto do código de barras depois' });
      i += 1;
    } else if (b.codigo && (!a.codigo || a.codigo === b.codigo)) {
      pares.push({ produto: a, codigo: b.codigo, fotoCodigo: b });
      i += 2;
    } else if (a.codigo) {
      problemas.push({ fotos: [a], motivo: 'código de barras sem a foto do produto antes' });
      i += 1;
    } else {
      problemas.push({ fotos: [a], motivo: 'foto do produto sem código de barras legível na foto seguinte' });
      i += 1;
    }
  }
  return { pares, problemas };
}

async function horario(arquivo) {
  try {
    const exif = await exifr.parse(arquivo, ['DateTimeOriginal', 'CreateDate']);
    const d = exif?.DateTimeOriginal || exif?.CreateDate;
    if (d instanceof Date && !isNaN(d)) return d.getTime();
  } catch { /* sem EXIF */ }
  return null;
}

// Foto já "em pé" (rotação do EXIF aplicada) e reduzida, sem metadados
const abrir = (arquivo, max) => sharp(arquivo).rotate().resize(max, max, { fit: 'inside', withoutEnlargement: true });

async function lerCodigo(arquivo) {
  for (const max of [2000, 1200, 3000]) {
    const { data, info } = await abrir(arquivo, max).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height, colorSpace: 'srgb' };
    const lidos = await readBarcodes(img, { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, maxNumberOfSymbols: 4 });
    const ok = lidos.filter((r) => r.isValid && eanValido(r.text));
    if (ok.length) return normalizarEan(ok[0].text);
  }
  return null;
}

async function tratarFoto(arquivo) {
  const entrada = await abrir(arquivo, 1600).png().toBuffer();
  const blob = await removeBackground(new Blob([entrada], { type: 'image/png' }), { model: 'medium', output: { format: 'image/png' } });
  const recorte = Buffer.from(await blob.arrayBuffer());

  // limites reais do produto (ignora restos quase transparentes)
  const { data, info } = await sharp(recorte).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('a IA não encontrou o produto na foto');

  const maxProduto = Math.round(LADO * OCUPACAO);
  const produto = await sharp(recorte)
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize(maxProduto, maxProduto, { fit: 'inside' })
    .sharpen({ sigma: 0.6 })
    .png()
    .toBuffer();

  return sharp({ create: { width: LADO, height: LADO, channels: 3, background: '#ffffff' } })
    .composite([{ input: produto, gravity: 'center' }])
    .webp({ quality: QUALIDADE, effort: 5 })
    .toBuffer();
}

async function paraRevisar(problemas) {
  if (!problemas.length || DRY_RUN) return;
  await fs.mkdir(REVISAR, { recursive: true });
  const linhas = [];
  for (const { fotos, motivo } of problemas) {
    for (const f of fotos) {
      await fs.rename(f.arquivo, path.join(REVISAR, path.basename(f.arquivo)));
      linhas.push(`${path.basename(f.arquivo)}: ${motivo}`);
    }
  }
  await fs.appendFile(path.join(REVISAR, 'LEIA-ME.txt'), `# ${new Date().toLocaleString('pt-BR')}\n${linhas.join('\n')}\n\n`);
}

async function main() {
  const nomes = (await fs.readdir(ENTRADA, { withFileTypes: true }))
    .filter((e) => e.isFile() && EXTENSOES.test(e.name)).map((e) => e.name);
  if (!nomes.length) { console.log('fotos-entrada/ vazia: nada a fazer.'); return; }

  const fotos = [];
  for (const nome of nomes) {
    const arquivo = path.join(ENTRADA, nome);
    fotos.push({ arquivo, nome, quando: await horario(arquivo) });
  }
  // horário da foto; empate ou sem EXIF: nome do arquivo (o celular nomeia por data/hora)
  fotos.sort((a, b) => (a.quando ?? 0) - (b.quando ?? 0) || a.nome.localeCompare(b.nome));

  for (const f of fotos) {
    f.codigo = await lerCodigo(f.arquivo);
    console.log(`${f.nome}: ${f.codigo ? `código ${f.codigo}` : 'sem código'}`);
  }

  const { pares, problemas } = montarPares(fotos);
  await fs.mkdir(SAIDA, { recursive: true });
  const feitos = [];
  for (const par of pares) {
    try {
      const webp = await tratarFoto(par.produto.arquivo);
      const destino = path.join(SAIDA, `${par.codigo}.webp`);
      const antes = (await fs.stat(par.produto.arquivo)).size;
      if (!DRY_RUN) {
        await fs.writeFile(destino, webp);
        if (!MANTER) await Promise.all([fs.unlink(par.produto.arquivo), fs.unlink(par.fotoCodigo.arquivo)]);
      }
      feitos.push(par.codigo);
      console.log(`OK ${par.codigo}.webp  (${(antes / 1048576).toFixed(1)} MB -> ${Math.round(webp.length / 1024)} KB)`);
    } catch (e) {
      problemas.push({ fotos: [par.produto, par.fotoCodigo], motivo: `erro ao tratar a foto: ${e.message}` });
    }
  }
  await paraRevisar(problemas);

  console.log(`\nResumo: ${feitos.length} foto(s) pronta(s)${DRY_RUN ? ' [dry-run, nada gravado]' : ''}; ${problemas.length} para revisar.`);
  for (const p of problemas) console.log(`  revisar: ${p.fotos.map((f) => f.nome).join(' + ')} -> ${p.motivo}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
