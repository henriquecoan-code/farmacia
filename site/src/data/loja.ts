// Dados da farmácia exibidos no site (rodapé, "Sobre", políticas, JSON-LD).
// RDC 44/2009: o site deve informar razão social, CNPJ, endereço, AFE, licença sanitária e farmacêutico responsável.
// Campos com PREENCHER aparecem destacados no site até serem completados.
export const PREENCHER = 'PREENCHER';

export const loja = {
  nomeFantasia: 'Farmácia São Benedito',
  razaoSocial: 'Jucenir Gazola Coan',
  cnpj: '00.162.606/0001-23',
  endereco: {
    logradouro: 'Rua Walter Veterlly, 102',
    bairro: 'Centro',
    cidade: 'Lauro Müller',
    uf: 'SC',
    cep: `${PREENCHER}: CEP da loja`,
  },
  telefone: '(48) 3464-3201',
  whatsapp: '554834643201',
  email: 'fciasaobenedito@gmail.com',
  horario: `${PREENCHER}: horário de funcionamento`,
  afe: `${PREENCHER}: nº AFE (Anvisa)`,
  licencaSanitaria: `${PREENCHER}: nº da licença sanitária`,
  farmaceutico: `${PREENCHER}: nome do(a) farmacêutico(a)`,
  crf: `${PREENCHER}: CRF-SC nº`,
  encarregadoLgpd: 'Jucenir Gazola Coan',
  entregas: [
    { cidade: 'Lauro Müller', regra: 'entrega imediata em horário comercial' },
    { cidade: 'Orleans', regra: 'pedidos até as 14h são entregues no mesmo dia' },
    { cidade: 'Treviso', regra: 'entregas às segundas, quartas e sextas-feiras' },
  ],
} as const;

export const enderecoCompleto = () =>
  `${loja.endereco.logradouro}, ${loja.endereco.bairro}, ${loja.endereco.cidade} - ${loja.endereco.uf}`;

export const linkWhatsApp = (texto?: string) =>
  `https://wa.me/${loja.whatsapp}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
