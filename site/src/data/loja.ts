// Dados da farmácia exibidos no site (rodapé, "Sobre", políticas, JSON-LD).
// RDC 44/2009: o site deve informar razão social, CNPJ, endereço, AFE, licença sanitária e farmacêutico responsável.
// Campos com PREENCHER aparecem destacados no site até serem completados.
export const PREENCHER = 'PREENCHER';

export const loja = {
  nomeFantasia: 'Farmácia São Benedito',
  razaoSocial: 'Jucenir Gazola Coan',
  cnpj: '00.162.606/0001-23',
  endereco: {
    logradouro: 'Rua Walter Vetterli, 102',
    bairro: 'Centro',
    cidade: 'Lauro Müller',
    uf: 'SC',
    cep: '88880-000',
  },
  telefone: '(48) 3464-3201',
  whatsapp: '554834643201',
  email: 'fciasaobenedito@gmail.com',
  // Horário conforme a Certidão de Regularidade CRF-SC 2026.
  horario: 'Loja física: segunda a sexta, das 8h30 às 21h; sábado, das 8h30 às 19h; domingo fechado. Entregas em horário comercial.',
  // Consulta pública de funcionamento de empresas da Anvisa (14/11/2026): autorização ativa, área Farmácia.
  afe: '7.72129-9',
  // Alvará Sanitário nº 23/2026, emitido em 18/03/2026, válido até 29/03/2027.
  licencaSanitaria: 'Alvará Sanitário nº 23/2026 – Vigilância Sanitária de Lauro Müller (válido até 29/03/2027)',
  // Responsáveis técnicos na Certidão de Regularidade CRF-SC 2026 (válida até 31/03/2027).
  farmaceuticos: [
    { nome: 'Guilherme Coan', crf: 'CRF-SC 6892' },
    { nome: 'Tainá de Souza Ribeiro', crf: 'CRF-SC 19951' },
  ],
  encarregadoLgpd: 'Jucenir Gazola Coan',
  entregas: [
    { cidade: 'Lauro Müller', regra: 'entrega imediata em horário comercial' },
    { cidade: 'Orleans', regra: 'pedidos até as 14h são entregues no mesmo dia' },
    { cidade: 'Treviso', regra: 'entregas às segundas, quartas e sextas-feiras' },
  ],
} as const;

export const enderecoCompleto = () =>
  `${loja.endereco.logradouro}, ${loja.endereco.bairro}, ${loja.endereco.cidade} - ${loja.endereco.uf}`;

export const farmaceuticosTexto = () =>
  loja.farmaceuticos.map((f) => `${f.nome} (${f.crf})`).join(' e ');

export const linkWhatsApp =(texto?: string) =>
  `https://wa.me/${loja.whatsapp}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
