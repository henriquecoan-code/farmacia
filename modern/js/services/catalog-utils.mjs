// Catálogo agregado: transforma a coleção `produtos` em poucos documentos `catalogo/parte-N`.
// Usado pelo navegador (admin "Publicar catálogo") e pelos scripts Node (scripts/build-catalog.mjs).
// Assim, um visitante novo lê ~3 documentos em vez da coleção inteira (~10 mil leituras).

export const CATALOG_COLLECTION = 'catalogo';
// Limite do Firestore é 1 MiB por documento; deixamos folga para nomes de campos/overhead
export const CATALOG_PART_MAX_BYTES = 700 * 1024;

// Mesmo critério de visibilidade usado na vitrine (app.js / produtos-firebase.js)
export function isVisibleProduct(p) {
  // `status: 'inactive'` é o campo que o painel admin grava ao desativar um produto
  return p && p.ativo !== false && p.status !== 'inactive' && p.publicado !== false && p.pendente !== true
    && (Number(p.quantidade ?? p.stock) || 0) > 0;
}

// Mantém só os campos que normalizeProduct (product-utils.js) e a vitrine usam, com nomes canônicos
export function compactProduct(raw) {
  const imagens = Array.isArray(raw.fotos) ? raw.fotos
    : (Array.isArray(raw.imagens) ? raw.imagens : (raw.image ? [raw.image] : []));
  const out = {
    id: String(raw.id),
    nome: raw.nome || raw.name || '',
    descricao: raw.descricao || raw.description || '',
    categoria: raw.categoria || raw.category || '',
    precoMaximo: raw.precoMaximo ?? raw.oldPrice ?? raw.preco ?? null,
    precoComDesconto: raw.precoComDesconto ?? raw.valorComDesconto ?? raw.salePrice ?? raw.price ?? null,
    quantidade: Number(raw.quantidade ?? raw.stock) || 0,
    codRed: raw.codRed || raw.codigo || '',
    dcb: raw.dcb || raw.DCB || raw.nomeDCB || raw.principioAtivo || '',
    ean: raw.ean || raw.EAN || raw.codBarras || raw.codigoBarras || '',
    laboratorio: raw.laboratorio || raw.marca || '',
    destaque: !!(raw.destaque || raw.featured),
    imagens
  };
  // Remove campos vazios para economizar espaço
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v === '' || v === null || v === false || (Array.isArray(v) && !v.length)) delete out[k];
  }
  return out;
}

function byteLength(obj) {
  const s = JSON.stringify(obj);
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length * 2;
}

// Recebe a lista bruta de produtos (com id) e devolve as partes: [[item, ...], ...]
export function buildCatalogParts(rawProducts, maxBytes = CATALOG_PART_MAX_BYTES) {
  const items = rawProducts.filter(isVisibleProduct).map(compactProduct)
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  const parts = [];
  let current = [];
  let size = 0;
  for (const it of items) {
    const sz = byteLength(it) + 16; // overhead aproximado por item no documento
    if (current.length && size + sz > maxBytes) { parts.push(current); current = []; size = 0; }
    current.push(it);
    size += sz;
  }
  if (current.length || !parts.length) parts.push(current);
  return parts;
}
