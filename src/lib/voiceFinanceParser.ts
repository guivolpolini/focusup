import type {
  FinanceTransactionType,
  FinancePaymentMethod,
  FinanceCategory,
  FinanceCard,
} from '../types';

export interface ParsedVoiceFinanceResult {
  type: FinanceTransactionType;
  amountInCents: number;
  description: string;
  categoryId: string;
  date: string; // YYYY-MM-DD
  paymentMethod: FinancePaymentMethod;
  cardId?: string;
  totalInstallments: number;
  rawTranscript: string;
  confidence: 'high' | 'medium' | 'low';
}

// Mapeamento de palavras numéricas em português
const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
  mil: 1000,
};

/**
 * Converte palavras e dígitos para centavos inteiros
 * Exemplos:
 * "50 reais" -> 5000
 * "R$ 120,50" -> 12050
 * "duzentos e cinquenta reais" -> 25000
 * "35 reais e 50 centavos" -> 3550
 */
export function extractAmountInCents(text: string): number {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Tenta encontrar padrão numérico direto com dígitos (ex: "120,50", "50 reais", "35.00")
  const digitRegex = /(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|conto)?/i;
  const digitMatch = normalized.match(digitRegex);

  // Também procura centavos separados (ex: "35 reais e 50 centavos")
  const centavosRegex = /(\d{1,2})\s*centavos?/i;
  const centavosMatch = normalized.match(centavosRegex);

  let centsFromDigits = 0;
  if (digitMatch && digitMatch[1]) {
    const rawNum = digitMatch[1].replace(',', '.');
    const parsed = parseFloat(rawNum);
    if (!isNaN(parsed) && parsed > 0) {
      centsFromDigits = Math.round(parsed * 100);
      if (centavosMatch && centavosMatch[1] && !digitMatch[1].includes('.') && !digitMatch[1].includes(',')) {
        centsFromDigits += parseInt(centavosMatch[1], 10);
      }
      return centsFromDigits;
    }
  }

  // 2. Se não encontrou dígitos, tenta converter palavras numéricas por extenso
  // Ex: "duzentos e cinquenta reais"
  const tokens = normalized.split(/\s+/);
  let total = 0;
  let currentGroup = 0;
  let foundAnyNumber = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].replace(/[.,]/g, '');
    if (token === 'e') continue;

    if (token in NUMBER_WORDS) {
      foundAnyNumber = true;
      const val = NUMBER_WORDS[token];
      if (val === 1000) {
        currentGroup = (currentGroup || 1) * 1000;
        total += currentGroup;
        currentGroup = 0;
      } else if (val >= 100) {
        currentGroup += val;
      } else {
        currentGroup += val;
      }
    } else if (token === 'reais' || token === 'real' || token === 'conto') {
      total += currentGroup;
      currentGroup = 0;
      break;
    }
  }

  total += currentGroup;

  // Verifica centavos por extenso (ex: "e cinquenta centavos")
  let centavosPart = 0;
  const centavosIdx = tokens.indexOf('centavos');
  if (centavosIdx > 0) {
    const prevWord = tokens[centavosIdx - 1];
    if (prevWord in NUMBER_WORDS) {
      centavosPart = NUMBER_WORDS[prevWord];
    }
  }

  if (foundAnyNumber && total > 0) {
    return total * 100 + centavosPart;
  }

  return 0;
}

/**
 * Detecta parcelas em frases como:
 * "em três vezes", "em 3x", "em 10 parcelas", "dividido em 2x"
 */
export function extractInstallments(text: string): number {
  const norm = text.toLowerCase();

  // Padrão numérico: "3x", "em 3 vezes", "em 3 parcelas", "dividido em 3"
  const digitMatch = norm.match(/(?:em|dividido\s+em)?\s*(\d{1,2})\s*(?:x|vezes|parcelas?)/i);
  if (digitMatch && digitMatch[1]) {
    const count = parseInt(digitMatch[1], 10);
    if (count >= 1 && count <= 72) return count;
  }

  // Padrão por extenso: "em três vezes", "em duas parcelas"
  const wordsMatch = norm.match(/(?:em|dividido\s+em)\s+(um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|doze)\s+(?:vezes|parcelas?)/i);
  if (wordsMatch && wordsMatch[1]) {
    const word = wordsMatch[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const count = NUMBER_WORDS[word];
    if (count && count >= 1) return count;
  }

  return 1;
}

/**
 * Detecta forma de pagamento a partir da fala
 */
export function extractPaymentMethod(text: string, hasInstallments: boolean): FinancePaymentMethod {
  const norm = text.toLowerCase();

  if (hasInstallments || norm.includes('credito') || norm.includes('crédito') || norm.includes('no cartao') || norm.includes('no cartão')) {
    return 'credit';
  }
  if (norm.includes('pix')) {
    return 'pix';
  }
  if (norm.includes('debito') || norm.includes('débito')) {
    return 'debit';
  }
  if (norm.includes('dinheiro') || norm.includes('especie') || norm.includes('espécie')) {
    return 'money';
  }

  return 'pix'; // Padrão seguro para o dia a dia brasileiro
}

/**
 * Detecta data relativa ("ontem", "anteontem", "hoje")
 */
export function extractDate(text: string): string {
  const norm = text.toLowerCase();
  const today = new Date();

  if (norm.includes('anteontem')) {
    today.setDate(today.getDate() - 2);
  } else if (norm.includes('ontem')) {
    today.setDate(today.getDate() - 1);
  }

  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Identifica o tipo (receita ou despesa)
 */
export function extractTransactionType(text: string): FinanceTransactionType {
  const norm = text.toLowerCase();
  const incomeKeywords = [
    'recebi',
    'recebido',
    'ganhei',
    'entrou',
    'salario',
    'salário',
    'freela',
    'freelance',
    'deposito',
    'depósito',
    'rendimento',
    'dividendos',
    'lucro',
    'vendi',
  ];

  for (const kw of incomeKeywords) {
    if (norm.includes(kw)) {
      return 'income';
    }
  }

  return 'expense';
}

/**
 * Mapeia palavras-chave para categorias cadastradas
 */
export function matchCategory(
  text: string,
  type: FinanceTransactionType,
  availableCategories: FinanceCategory[]
): string {
  const norm = text.toLowerCase();

  // Dicionário de intenção semântica
  const categoryKeywords: Record<string, string[]> = {
    'cat-alimentacao': [
      'mercado', 'supermercado', 'comida', 'almoco', 'almoço', 'janta', 'jantar',
      'lanche', 'cafe', 'café', 'padaria', 'restaurante', 'ifood', 'acougue', 'açougue',
      'pizza', 'hamburguer', 'lanche', 'refeicao', 'refeição', 'pastel'
    ],
    'cat-transporte': [
      'uber', '99', 'taxi', 'táxi', 'onibus', 'ônibus', 'metro', 'metrô',
      'gasolina', 'combustivel', 'combustível', 'estacionamento', 'pedagio', 'pedágio',
      'posto', 'etanol', 'diesel', 'corrida'
    ],
    'cat-lazer': [
      'cinema', 'filme', 'show', 'festa', 'balada', 'bar', 'cerveja', 'chope',
      'jogo', 'steam', 'game', 'viagem', 'praia', 'passeio', 'teatro'
    ],
    'cat-academia': [
      'academia', 'musculacao', 'musculação', 'whey', 'creatina', 'suplemento',
      'crossfit', 'smartfit', 'treino', 'personal'
    ],
    'cat-assinaturas': [
      'netflix', 'spotify', 'amazon', 'prime', 'youtube', 'apple', 'icloud',
      'disney', 'hbo', 'max', 'chatgpt', 'assinatura', 'plano'
    ],
    'cat-compras': [
      'tenis', 'tênis', 'roupa', 'camisa', 'calca', 'calça', 'sapato', 'shopping',
      'eletronico', 'eletrônico', 'celular', 'fone', 'notebook', 'mercado livre'
    ],
    'cat-moradia': [
      'aluguel', 'condominio', 'condomínio', 'luz', 'energia', 'agua', 'água',
      'gas', 'gás', 'internet', 'iptu', 'casa', 'faxina'
    ],
    'cat-saude': [
      'farmacia', 'farmácia', 'drogaria', 'remedio', 'remédio', 'medico', 'médico',
      'dentista', 'consulta', 'exame', 'hospital', 'remedios'
    ],
    'cat-educacao': [
      'faculdade', 'curso', 'livro', 'mensalidade', 'escola', 'aula', 'apostila'
    ],
    'cat-salario': [
      'salario', 'salário', 'empresa', 'adiantamento', 'holerite'
    ],
    'cat-freelance': [
      'freela', 'freelance', 'projeto', 'bico', 'servico', 'serviço', 'consultoria'
    ],
    'cat-investimentos': [
      'investimento', 'dividendo', 'rendimento', 'renda', 'juros', 'cdb', 'fii'
    ],
  };

  for (const [catId, keywords] of Object.entries(categoryKeywords)) {
    for (const kw of keywords) {
      if (norm.includes(kw)) {
        // Verifica se a categoria existe no banco do usuário
        const found = availableCategories.find((c) => c.id === catId && c.type === type);
        if (found) return found.id;
      }
    }
  }

  // Se não encontrar nas palavras chave fixas, busca por nome da categoria
  const matchingCat = availableCategories.find(
    (c) => c.type === type && norm.includes(c.name.toLowerCase())
  );
  if (matchingCat) return matchingCat.id;

  // Fallback seguro: Outros
  const defaultOther = availableCategories.find(
    (c) => c.type === type && (c.name.toLowerCase().includes('outro') || c.id.includes('outro'))
  );
  return defaultOther?.id || availableCategories[0]?.id || '';
}

/**
 * Extrai uma descrição limpa e concisa da frase dita
 */
export function extractDescription(
  text: string,
  type: FinanceTransactionType,
  categoryName?: string
): string {
  let clean = text
    .replace(/(?:eu\s+)?(?:gastei|paguei|comprei|recebi|ganhei|entrou|custou)\s+/gi, '')
    .replace(/\b(?:r\$\s*)?\d+(?:[.,]\d{1,2})?\s*(?:reais|real|conto)?\b/gi, '')
    .replace(/\b(?:no|na|de|do|da|com|em|para|por)\s+(?:pix|debito|débito|credito|crédito|dinheiro|especie|espécie|cartao|cartão)\b/gi, '')
    .replace(/\b(?:em|dividido\s+em)?\s*\d{1,2}\s*(?:x|vezes|parcelas?)\b/gi, '')
    .replace(/\b(?:hoje|ontem|anteontem)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Limpa preposições residuais no início ou fim
  clean = clean.replace(/^(?:no|na|de|do|da|com|em|para)\s+/i, '');
  clean = clean.replace(/\s+(?:no|na|de|do|da|com|em|para)$/i, '');

  if (clean.length >= 2) {
    // Capitaliza primeira letra
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  if (categoryName && !categoryName.toLowerCase().includes('outro')) {
    return categoryName;
  }

  return type === 'income' ? 'Receita' : 'Despesa';
}

/**
 * Tenta identificar um cartão compatível a partir do nome falado
 */
export function matchCard(text: string, cards: FinanceCard[]): string | undefined {
  const norm = text.toLowerCase();
  for (const card of cards) {
    if (norm.includes(card.name.toLowerCase())) {
      return card.id;
    }
  }
  return cards[0]?.id;
}

/**
 * Parser principal de comando de voz para transação financeira
 */
export function parseVoiceFinanceCommand(
  transcript: string,
  categories: FinanceCategory[],
  cards: FinanceCard[]
): ParsedVoiceFinanceResult {
  const type = extractTransactionType(transcript);
  const amountInCents = extractAmountInCents(transcript);
  const totalInstallments = extractInstallments(transcript);
  const paymentMethod = extractPaymentMethod(transcript, totalInstallments > 1);
  const date = extractDate(transcript);
  const categoryId = matchCategory(transcript, type, categories);
  const matchedCategory = categories.find((c) => c.id === categoryId);
  const description = extractDescription(transcript, type, matchedCategory?.name);
  const cardId = paymentMethod === 'credit' ? matchCard(transcript, cards) : undefined;

  const confidence = amountInCents > 0 && description.length > 2 ? 'high' : amountInCents > 0 ? 'medium' : 'low';

  return {
    type,
    amountInCents,
    description,
    categoryId,
    date,
    paymentMethod,
    cardId,
    totalInstallments,
    rawTranscript: transcript,
    confidence,
  };
}
