// Product utilities: normalization, pricing, safety

export function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeProduct(raw) {
  const precoCheio = raw.precoMaximo ?? raw.oldPrice ?? raw.preco ?? raw.price ?? null;
  const precoDesconto = raw.precoComDesconto ?? raw.valorComDesconto ?? raw.salePrice ?? raw.price ?? precoCheio ?? 0;
  const nome = raw.nome || raw.name || 'Produto sem nome';
  const descricao = raw.descricao || raw.description || '';
  const categoria = raw.categoria || raw.category || 'outros';
  const imagens = Array.isArray(raw.fotos) ? raw.fotos : (raw.image ? [raw.image] : []);
  // Campos auxiliares para busca
  const dcbRaw = raw.dcb || raw.DCB || raw.nomeDCB || raw.nome_dcb || raw.nomeComumBrasileiro || raw.nome_comum_brasileiro || raw.principioAtivo || raw.principio_ativo || raw.principioativo || '';
  const ean = raw.ean || raw.EAN || raw.codBarras || raw.codigoBarras || raw.barcode || raw.barCode || null;
  const descontoCalc = (precoCheio && precoDesconto && precoCheio > precoDesconto)
    ? Math.round(((precoCheio - precoDesconto)/precoCheio) * 100)
    : (raw.desconto ? Math.round(raw.desconto * 100) : 0);
  return {
    id: raw.id,
    nome: escapeHTML(nome),
    descricao: escapeHTML(descricao),
    categoria,
    imagens,
    precoCheio,
    precoDesconto,
    desconto: descontoCalc,
    quantidade: raw.quantidade ?? raw.stock ?? 0,
    ativo: (raw.ativo !== false),
    codRed: raw.codRed || raw.codigo || null,
    dcb: dcbRaw ? escapeHTML(String(dcbRaw)) : '',
    ean,
    destaque: !!(raw.destaque || raw.featured),
    laboratorio: raw.laboratorio || raw.marca || '',
    _raw: raw
  };
}

export function formatPrice(v) {
  if (v == null) return '';
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}
