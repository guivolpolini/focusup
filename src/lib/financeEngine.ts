import type {
  FinanceTransaction,
  FinanceCard,
  FinanceMonthlyBudget,
  FinanceRecurringExpense,
  FinanceRecurringFrequency,
  FinancePaymentMethod,
} from '../types';

/**
 * Converte valor em centavos para formato monetário brasileiro BRL (ex: 4990 -> "R$ 49,90")
 */
export function formatCentsToBRL(cents: number): string {
  if (isNaN(cents)) return 'R$ 0,00';
  const isNegative = cents < 0;
  const absVal = Math.abs(cents) / 100;
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absVal);

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Converte string digitada ou numérica brasileira para centavos inteiros (ex: "49,90" -> 4990)
 */
export function parseBRLToCents(value: string | number): number {
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  if (!value || typeof value !== 'string') return 0;

  // Limpa caracteres de moeda e espaços
  let clean = value.replace(/R\$/g, '').replace(/\s/g, '').trim();
  const isNegative = clean.startsWith('-') || clean.startsWith('(');
  clean = clean.replace(/[-()+]/g, '');

  // Trata formato brasileiro (1.234,56) vs formato americano (1234.56)
  if (clean.includes(',') && clean.includes('.')) {
    // Ex: 1.250,50 -> remove ponto de milhar e troca vírgula por ponto
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    // Ex: 49,90 -> 49.90
    clean = clean.replace(',', '.');
  }

  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return 0;

  const cents = Math.round(parsed * 100);
  return isNegative ? -cents : cents;
}

/**
 * Obtém a chave do mês no formato 'YYYY-MM'
 */
export function getMonthKey(dateStr?: string): string {
  if (!dateStr) {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
  return dateStr.slice(0, 7);
}

/**
 * Nome legível do mês em português (ex: '2026-10' -> 'Outubro de 2026')
 */
export function formatMonthYear(monthKey: string): string {
  if (!monthKey || monthKey.length < 7) return '';
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;

  const date = new Date(year, month, 1);
  const monthName = date.toLocaleDateString('pt-BR', { month: 'long' });
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return `${capitalized} de ${year}`;
}

/**
 * Retorna o mês adjacente com base no offset (-1 para anterior, +1 para próximo)
 */
export function getAdjacentMonthKey(monthKey: string, offset: number): string {
  const [yearStr, monthStr] = monthKey.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + offset;

  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Calcula o mês da fatura de cartão com base na data de compra e no dia de corte (closingDay)
 * - Se dia da compra <= dia de fechamento -> fatura do mês atual (ou ajustado)
 * - Se dia da compra > dia de fechamento -> fatura do próximo mês
 */
export function calculateInvoiceMonth(purchaseDate: string, closingDay: number): string {
  const [yStr, mStr, dStr] = purchaseDate.split('-');
  let year = parseInt(yStr, 10);
  let month = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);

  // Determina o último dia do mês para não estourar em meses curtos
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const effectiveClosingDay = Math.min(closingDay, lastDayOfMonth);

  if (day > effectiveClosingDay) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Divide centavos em parcelas exatas sem perda por arredondamento (IEEE 754)
 * Ex: 10000 centavos em 3x -> [3334, 3333, 3333]
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (count <= 1) return [totalCents];

  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;

  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(base + (i < remainder ? 1 : 0));
  }
  return result;
}

/**
 * Gera as parcelas futuras para uma compra no cartão de crédito
 */
export function generateInstallmentTransactions(params: {
  planId: string;
  description: string;
  categoryId: string;
  cardId: string;
  totalCents: number;
  totalInstallments: number;
  firstDate: string; // YYYY-MM-DD
  closingDay: number;
}): FinanceTransaction[] {
  const {
    planId,
    description,
    categoryId,
    cardId,
    totalCents,
    totalInstallments,
    firstDate,
    closingDay,
  } = params;

  const installmentAmounts = splitInstallments(totalCents, totalInstallments);
  const [yStr, mStr, dStr] = firstDate.split('-');
  const baseYear = parseInt(yStr, 10);
  const baseMonth = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);

  const transactions: FinanceTransaction[] = [];
  const now = Date.now();

  for (let i = 0; i < totalInstallments; i++) {
    let year = baseYear;
    let month = baseMonth + i;
    while (month > 12) {
      month -= 12;
      year += 1;
    }

    const lastDay = new Date(year, month, 0).getDate();
    const effectiveDay = Math.min(day, lastDay);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(effectiveDay).padStart(2, '0')}`;
    const invoiceMonth = calculateInvoiceMonth(dateStr, closingDay);

    transactions.push({
      id: `${planId}_inst_${i + 1}`,
      type: 'expense',
      amountInCents: installmentAmounts[i],
      description: totalInstallments > 1 ? `${description} (${i + 1}/${totalInstallments})` : description,
      categoryId,
      date: dateStr,
      paymentMethod: 'credit',
      cardId,
      installmentPlanId: planId,
      installmentNumber: i + 1,
      totalInstallments,
      invoiceMonth,
      createdAt: now,
      updatedAt: now,
    });
  }

  return transactions;
}

export interface MonthlySummaryResult {
  monthKey: string;
  totalIncomeInCents: number;
  totalExpenseInCents: number;
  estimatedBalanceInCents: number;
  limitInCents: number;
  remainingInCents: number;
  percentageUsed: number;
  isOverLimit: boolean;
  categoryExpenses: { categoryId: string; totalCents: number; count: number }[];
}

/**
 * Calcula o resumo mensal (receitas, despesas, saldo, limite e progresso)
 */
export function calculateMonthlySummary(
  transactions: FinanceTransaction[],
  monthKey: string,
  budget?: FinanceMonthlyBudget
): MonthlySummaryResult {
  let totalIncomeInCents = 0;
  let totalExpenseInCents = 0;
  const categoryMap: Record<string, { totalCents: number; count: number }> = {};

  for (const tx of transactions) {
    // Pagamento de fatura não é computado como nova despesa
    if (tx.isInvoicePayment) continue;

    if (tx.type === 'income') {
      if (tx.date.startsWith(monthKey)) {
        totalIncomeInCents += tx.amountInCents;
      }
    } else if (tx.type === 'expense') {
      // Para cartão de crédito, computa no mês da fatura (invoiceMonth).
      // Se não tiver invoiceMonth especificado, usa o mês da data da transação.
      const txMonth = (tx.paymentMethod === 'credit' && tx.invoiceMonth) ? tx.invoiceMonth : tx.date.slice(0, 7);

      if (txMonth === monthKey) {
        totalExpenseInCents += tx.amountInCents;
        if (!categoryMap[tx.categoryId]) {
          categoryMap[tx.categoryId] = { totalCents: 0, count: 0 };
        }
        categoryMap[tx.categoryId].totalCents += tx.amountInCents;
        categoryMap[tx.categoryId].count += 1;
      }
    }
  }

  const estimatedBalanceInCents = totalIncomeInCents - totalExpenseInCents;
  const limitInCents = budget?.limitInCents || 0;
  const remainingInCents = limitInCents > 0 ? limitInCents - totalExpenseInCents : 0;
  const percentageUsed = limitInCents > 0 ? Math.min(999, (totalExpenseInCents / limitInCents) * 100) : 0;
  const isOverLimit = limitInCents > 0 && totalExpenseInCents > limitInCents;

  const categoryExpenses = Object.entries(categoryMap)
    .map(([categoryId, data]) => ({ categoryId, ...data }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    monthKey,
    totalIncomeInCents,
    totalExpenseInCents,
    estimatedBalanceInCents,
    limitInCents,
    remainingInCents,
    percentageUsed,
    isOverLimit,
    categoryExpenses,
  };
}

export interface CardInvoiceSummary {
  card: FinanceCard;
  currentInvoiceMonth: string;
  currentInvoiceTotalInCents: number;
  nextInvoiceTotalInCents: number;
  futureInstallmentsTotalInCents: number;
  estimatedAvailableLimitInCents?: number;
  transactionsCount: number;
}

/**
 * Calcula os totais de fatura e limite disponível para um cartão de crédito
 */
export function calculateCardSummary(
  card: FinanceCard,
  transactions: FinanceTransaction[],
  referenceDate?: string
): CardInvoiceSummary {
  const ref = referenceDate || new Date().toISOString().slice(0, 10);
  const currentInvoiceMonth = calculateInvoiceMonth(ref, card.closingDay);
  const nextInvoiceMonth = getAdjacentMonthKey(currentInvoiceMonth, 1);

  let currentInvoiceTotalInCents = 0;
  let nextInvoiceTotalInCents = 0;
  let futureInstallmentsTotalInCents = 0;
  let transactionsCount = 0;

  for (const tx of transactions) {
    if (tx.cardId !== card.id || tx.isInvoicePayment) continue;

    transactionsCount++;
    const inv = tx.invoiceMonth || calculateInvoiceMonth(tx.date, card.closingDay);

    if (inv === currentInvoiceMonth) {
      currentInvoiceTotalInCents += tx.amountInCents;
    } else if (inv === nextInvoiceMonth) {
      nextInvoiceTotalInCents += tx.amountInCents;
      futureInstallmentsTotalInCents += tx.amountInCents;
    } else if (inv > currentInvoiceMonth) {
      futureInstallmentsTotalInCents += tx.amountInCents;
    }
  }

  const totalCommitted = currentInvoiceTotalInCents + futureInstallmentsTotalInCents;
  const estimatedAvailableLimitInCents = card.limitInCents
    ? Math.max(0, card.limitInCents - totalCommitted)
    : undefined;

  return {
    card,
    currentInvoiceMonth,
    currentInvoiceTotalInCents,
    nextInvoiceTotalInCents,
    futureInstallmentsTotalInCents,
    estimatedAvailableLimitInCents,
    transactionsCount,
  };
}

export interface ParsedCSVRow {
  date: string; // YYYY-MM-DD
  description: string;
  amountInCents: number;
  type: 'income' | 'expense';
  isDuplicate?: boolean;
}

/**
 * Leitor rápido de CSV bancário (suporta delimitador vírgula ou ponto-e-vírgula)
 */
export function parseCSVTransactions(csvContent: string): {
  rows: ParsedCSVRow[];
  totalParsed: number;
  invalidCount: number;
} {
  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { rows: [], totalParsed: 0, invalidCount: 0 };
  }

  // Detecta separador (',' ou ';')
  const headerLine = lines[0];
  const separator = headerLine.includes(';') ? ';' : ',';
  const headers = headerLine.split(separator).map((h) => h.toLowerCase().replace(/["']/g, '').trim());

  // Procura índices de colunas
  let dateIdx = headers.findIndex((h) => h.includes('data') || h.includes('date'));
  let descIdx = headers.findIndex((h) => h.includes('desc') || h.includes('hist') || h.includes('título') || h.includes('memo'));
  let amountIdx = headers.findIndex((h) => h.includes('valor') || h.includes('amount') || h.includes('value'));

  // Se não encontrou por nome, assume padrão: col 0 = data, col 1 = desc, col 2 = valor
  if (dateIdx === -1) dateIdx = 0;
  if (descIdx === -1) descIdx = 1;
  if (amountIdx === -1) amountIdx = 2;

  const rows: ParsedCSVRow[] = [];
  let invalidCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Divide respeitando aspas simples
    const cols = line.split(separator).map((c) => c.replace(/["']/g, '').trim());
    if (cols.length < 2) {
      invalidCount++;
      continue;
    }

    const rawDate = cols[dateIdx] || '';
    const rawDesc = cols[descIdx] || 'Lançamento importado';
    const rawAmount = cols[amountIdx] || '0';

    // Normaliza data para YYYY-MM-DD
    let normalizedDate = '';
    if (rawDate.includes('/')) {
      const parts = rawDate.split('/');
      if (parts.length === 3) {
        // DD/MM/YYYY
        if (parts[2].length === 4) {
          normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    } else if (rawDate.includes('-')) {
      normalizedDate = rawDate.slice(0, 10);
    }

    if (!normalizedDate || normalizedDate.length !== 10) {
      normalizedDate = new Date().toISOString().slice(0, 10);
    }

    const amountInCents = parseBRLToCents(rawAmount);
    if (amountInCents === 0) {
      invalidCount++;
      continue;
    }

    // Se o valor for negativo no extrato, é despesa; se positivo, receita
    const isExpense = amountInCents < 0 || rawAmount.includes('-');
    rows.push({
      date: normalizedDate,
      description: rawDesc,
      amountInCents: Math.abs(amountInCents),
      type: isExpense ? 'expense' : 'income',
    });
  }

  return {
    rows,
    totalParsed: rows.length,
    invalidCount,
  };
}

// ============================================================================
// MOTOR DE GASTOS FIXOS E RECORRÊNCIAS (SEM DUPLICIDADE)
// ============================================================================

export type RecurringOccurrenceStatus = 'paid' | 'pending' | 'overdue' | 'paused';

export interface RecurringOccurrence {
  occurrenceKey: string; // `${recurringId}_${dueDate}`
  recurringId: string;
  name: string;
  categoryId: string;
  expectedAmountInCents: number;
  dueDate: string; // YYYY-MM-DD
  frequency: FinanceRecurringFrequency;
  paymentMethod: FinancePaymentMethod;
  cardId?: string;
  notes?: string;
  status: RecurringOccurrenceStatus;
  paidTransactionId?: string;
  paidAmountInCents?: number;
  paidDate?: string;
}

export interface MonthlyRecurringSummary {
  monthKey: string;
  occurrences: RecurringOccurrence[];
  totalExpectedInCents: number; // Previsto total ativo (pagas + pendentes/atrasadas)
  totalPaidInCents: number;
  totalPendingInCents: number; // Soma de pendentes + atrasadas
  paidCount: number;
  pendingCount: number; // Pendentes + atrasadas
  overdueCount: number;
  nextDueOccurrence: RecurringOccurrence | null;
}

/**
 * Formata data YYYY-MM-DD para DD/MM/AAAA
 */
export function formatDateBR(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr || '';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Gera de forma determinística todas as ocorrências de gastos fixos para um mês específico (YYYY-MM)
 * sem duplicar registros ao recarregar ou navegar entre meses.
 */
export function getRecurringOccurrencesForMonth(
  recurringExpenses: FinanceRecurringExpense[],
  transactions: FinanceTransaction[],
  monthKey: string,
  referenceTodayStr?: string
): MonthlyRecurringSummary {
  const todayStr = referenceTodayStr || new Date().toISOString().slice(0, 10);
  const [tYearStr, tMonthStr] = monthKey.split('-');
  const targetYear = parseInt(tYearStr, 10);
  const targetMonth = parseInt(tMonthStr, 10); // 1..12
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();

  // Mapa rápido de transações já pagas vinculadas por occurrenceKey ou ID determinístico
  const paidByOccurrenceKey = new Map<string, FinanceTransaction>();
  for (const tx of transactions) {
    if (tx.occurrenceKey) {
      paidByOccurrenceKey.set(tx.occurrenceKey, tx);
    } else if (tx.id.startsWith('tx_rec_')) {
      const key = tx.id.replace(/^tx_rec_/, '');
      paidByOccurrenceKey.set(key, tx);
    }
  }

  const occurrences: RecurringOccurrence[] = [];

  for (const rec of recurringExpenses) {
    if (!rec.firstDueDate || rec.firstDueDate.length < 10) continue;
    const [sYearStr, sMonthStr, sDayStr] = rec.firstDueDate.slice(0, 10).split('-');
    const startYear = parseInt(sYearStr, 10);
    const startMonth = parseInt(sMonthStr, 10);
    const startDay = parseInt(sDayStr, 10);

    const monthsDiff = (targetYear - startYear) * 12 + (targetMonth - startMonth);
    if (monthsDiff < 0) continue; // Mês anterior ao início da recorrência

    const dueDates: string[] = [];

    if (rec.frequency === 'monthly') {
      const effectiveDay = Math.min(startDay, lastDayOfTargetMonth);
      const dueStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(effectiveDay).padStart(2, '0')}`;
      if (dueStr >= rec.firstDueDate) {
        dueDates.push(dueStr);
      }
    } else if (rec.frequency === 'quarterly') {
      if (monthsDiff % 3 === 0) {
        const effectiveDay = Math.min(startDay, lastDayOfTargetMonth);
        const dueStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(effectiveDay).padStart(2, '0')}`;
        if (dueStr >= rec.firstDueDate) {
          dueDates.push(dueStr);
        }
      }
    } else if (rec.frequency === 'yearly') {
      if (monthsDiff % 12 === 0) {
        const effectiveDay = Math.min(startDay, lastDayOfTargetMonth);
        const dueStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(effectiveDay).padStart(2, '0')}`;
        if (dueStr >= rec.firstDueDate) {
          dueDates.push(dueStr);
        }
      }
    } else if (rec.frequency === 'weekly') {
      const cursor = new Date(startYear, startMonth - 1, startDay, 12, 0, 0);
      const endOfTarget = new Date(targetYear, targetMonth - 1, lastDayOfTargetMonth, 23, 59, 59);
      let safety = 0;
      while (cursor <= endOfTarget && safety < 1000) {
        safety++;
        const cy = cursor.getFullYear();
        const cm = cursor.getMonth() + 1;
        const cd = cursor.getDate();
        if (cy === targetYear && cm === targetMonth) {
          const dueStr = `${cy}-${String(cm).padStart(2, '0')}-${String(cd).padStart(2, '0')}`;
          dueDates.push(dueStr);
        }
        cursor.setDate(cursor.getDate() + 7);
      }
    }

    for (const dueDate of dueDates) {
      const occurrenceKey = `${rec.id}_${dueDate}`;
      const paidTx = paidByOccurrenceKey.get(occurrenceKey);

      let status: RecurringOccurrenceStatus;
      if (paidTx) {
        status = 'paid';
      } else if (rec.status === 'paused') {
        status = 'paused';
      } else if (dueDate < todayStr) {
        status = 'overdue';
      } else {
        status = 'pending';
      }

      occurrences.push({
        occurrenceKey,
        recurringId: rec.id,
        name: rec.name,
        categoryId: rec.categoryId,
        expectedAmountInCents: rec.amountInCents,
        dueDate,
        frequency: rec.frequency,
        paymentMethod: rec.paymentMethod,
        cardId: rec.cardId,
        notes: rec.notes,
        status,
        paidTransactionId: paidTx?.id,
        paidAmountInCents: paidTx?.amountInCents,
        paidDate: paidTx?.date,
      });
    }
  }

  occurrences.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));

  let totalPaidInCents = 0;
  let totalPendingInCents = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  for (const occ of occurrences) {
    if (occ.status === 'paid') {
      totalPaidInCents += occ.paidAmountInCents ?? occ.expectedAmountInCents;
      paidCount++;
    } else if (occ.status === 'pending' || occ.status === 'overdue') {
      totalPendingInCents += occ.expectedAmountInCents;
      pendingCount++;
      if (occ.status === 'overdue') {
        overdueCount++;
      }
    }
  }

  const totalExpectedInCents = totalPaidInCents + totalPendingInCents;
  const nextDueOccurrence =
    occurrences.find((o) => o.status === 'overdue' || o.status === 'pending') || null;

  return {
    monthKey,
    occurrences,
    totalExpectedInCents,
    totalPaidInCents,
    totalPendingInCents,
    paidCount,
    pendingCount,
    overdueCount,
    nextDueOccurrence,
  };
}

/**
 * Cria ou atualiza de forma idempotente (sem duplicidade) a transação de pagamento de uma ocorrência fixa.
 */
export function buildRecurringPaymentTransaction(params: {
  occurrence: RecurringOccurrence;
  paidDate: string; // YYYY-MM-DD
  paidAmountInCents?: number;
  cards?: FinanceCard[];
  existingTransaction?: FinanceTransaction;
}): FinanceTransaction {
  const { occurrence, paidDate, paidAmountInCents, cards = [], existingTransaction } = params;
  const now = Date.now();
  const amountInCents = paidAmountInCents ?? occurrence.expectedAmountInCents;

  let invoiceMonth: string | undefined;
  if (occurrence.paymentMethod === 'credit' && occurrence.cardId) {
    const card = cards.find((c) => c.id === occurrence.cardId);
    if (card) {
      invoiceMonth = calculateInvoiceMonth(paidDate, card.closingDay);
    } else {
      invoiceMonth = paidDate.slice(0, 7);
    }
  }

  return {
    id: existingTransaction?.id || `tx_rec_${occurrence.occurrenceKey}`,
    type: 'expense',
    amountInCents,
    description: occurrence.name,
    categoryId: occurrence.categoryId,
    date: paidDate,
    paymentMethod: occurrence.paymentMethod,
    cardId: occurrence.paymentMethod === 'credit' ? occurrence.cardId : undefined,
    invoiceMonth,
    recurringExpenseId: occurrence.recurringId,
    occurrenceKey: occurrence.occurrenceKey,
    createdAt: existingTransaction?.createdAt || now,
    updatedAt: now,
  };
}

// ============================================================================
// ANÁLISES DO DASHBOARD: EVOLUÇÃO MENSAL, FIXOS VS VARIÁVEIS, COMPARATIVO E VENCIMENTOS
// ============================================================================

export interface MonthlyEvolutionPoint {
  monthKey: string;
  shortLabel: string; // ex: 'Out/26'
  fullLabel: string; // ex: 'Outubro de 2026'
  incomeInCents: number;
  expenseInCents: number;
  balanceInCents: number;
}

export function calculateMonthlyEvolution(
  transactions: FinanceTransaction[],
  endMonthKey: string,
  monthsCount: number = 6
): { points: MonthlyEvolutionPoint[]; hasAnyData: boolean } {
  const points: MonthlyEvolutionPoint[] = [];
  let hasAnyData = false;

  for (let i = monthsCount - 1; i >= 0; i--) {
    const mk = getAdjacentMonthKey(endMonthKey, -i);
    const summary = calculateMonthlySummary(transactions, mk);
    const [yStr, mStr] = mk.split('-');
    const date = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1);
    const shortMonth = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    const capitalizedShort = shortMonth.charAt(0).toUpperCase() + shortMonth.slice(1);

    if (summary.totalIncomeInCents > 0 || summary.totalExpenseInCents > 0) {
      hasAnyData = true;
    }

    points.push({
      monthKey: mk,
      shortLabel: `${capitalizedShort}/${yStr.slice(2)}`,
      fullLabel: formatMonthYear(mk),
      incomeInCents: summary.totalIncomeInCents,
      expenseInCents: summary.totalExpenseInCents,
      balanceInCents: summary.estimatedBalanceInCents,
    });
  }

  return { points, hasAnyData };
}

export interface FixedVsVariableResult {
  fixedRealizedInCents: number;
  fixedPendingInCents: number;
  fixedTotalInCents: number; // Realizado fixo + pendente fixo
  variableRealizedInCents: number;
  totalAnalysedInCents: number;
  fixedPercentage: number;
  variablePercentage: number;
}

export function calculateFixedVsVariable(
  transactions: FinanceTransaction[],
  recurringSummary: MonthlyRecurringSummary,
  monthKey: string
): FixedVsVariableResult {
  let fixedRealizedInCents = 0;
  let variableRealizedInCents = 0;

  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.isInvoicePayment) continue;
    const txMonth = tx.paymentMethod === 'credit' && tx.invoiceMonth ? tx.invoiceMonth : tx.date.slice(0, 7);
    if (txMonth !== monthKey) continue;

    if (tx.recurringExpenseId || tx.occurrenceKey || tx.id.startsWith('tx_rec_')) {
      fixedRealizedInCents += tx.amountInCents;
    } else {
      variableRealizedInCents += tx.amountInCents;
    }
  }

  const fixedPendingInCents = recurringSummary.totalPendingInCents;
  const fixedTotalInCents = fixedRealizedInCents + fixedPendingInCents;
  const totalAnalysedInCents = fixedTotalInCents + variableRealizedInCents;

  const fixedPercentage = totalAnalysedInCents > 0 ? Math.round((fixedTotalInCents / totalAnalysedInCents) * 100) : 0;
  const variablePercentage = totalAnalysedInCents > 0 ? 100 - fixedPercentage : 0;

  return {
    fixedRealizedInCents,
    fixedPendingInCents,
    fixedTotalInCents,
    variableRealizedInCents,
    totalAnalysedInCents,
    fixedPercentage,
    variablePercentage,
  };
}

export interface PreviousMonthComparisonResult {
  currentMonthKey: string;
  previousMonthKey: string;
  hasPreviousData: boolean;
  currentIncomeInCents: number;
  previousIncomeInCents: number;
  incomeDiffInCents: number;
  incomeChangePercent: number | null;
  currentExpenseInCents: number;
  previousExpenseInCents: number;
  expenseDiffInCents: number;
  expenseChangePercent: number | null;
  categoryVariations: {
    categoryId: string;
    currentCents: number;
    previousCents: number;
    diffCents: number;
    changePercent: number | null;
  }[];
}

export function calculatePreviousMonthComparison(
  transactions: FinanceTransaction[],
  currentMonthKey: string
): PreviousMonthComparisonResult {
  const previousMonthKey = getAdjacentMonthKey(currentMonthKey, -1);
  const currSummary = calculateMonthlySummary(transactions, currentMonthKey);
  const prevSummary = calculateMonthlySummary(transactions, previousMonthKey);

  const hasPreviousData = prevSummary.totalIncomeInCents > 0 || prevSummary.totalExpenseInCents > 0;

  const incomeDiffInCents = currSummary.totalIncomeInCents - prevSummary.totalIncomeInCents;
  const incomeChangePercent =
    prevSummary.totalIncomeInCents > 0
      ? ((currSummary.totalIncomeInCents - prevSummary.totalIncomeInCents) / prevSummary.totalIncomeInCents) * 100
      : null;

  const expenseDiffInCents = currSummary.totalExpenseInCents - prevSummary.totalExpenseInCents;
  const expenseChangePercent =
    prevSummary.totalExpenseInCents > 0
      ? ((currSummary.totalExpenseInCents - prevSummary.totalExpenseInCents) / prevSummary.totalExpenseInCents) * 100
      : null;

  const catIds = new Set<string>();
  currSummary.categoryExpenses.forEach((c) => catIds.add(c.categoryId));
  prevSummary.categoryExpenses.forEach((c) => catIds.add(c.categoryId));

  const categoryVariations = Array.from(catIds)
    .map((categoryId) => {
      const currentCents = currSummary.categoryExpenses.find((c) => c.categoryId === categoryId)?.totalCents || 0;
      const previousCents = prevSummary.categoryExpenses.find((c) => c.categoryId === categoryId)?.totalCents || 0;
      const diffCents = currentCents - previousCents;
      const changePercent = previousCents > 0 ? ((currentCents - previousCents) / previousCents) * 100 : null;
      return {
        categoryId,
        currentCents,
        previousCents,
        diffCents,
        changePercent,
      };
    })
    .filter((v) => v.diffCents !== 0)
    .sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents));

  return {
    currentMonthKey,
    previousMonthKey,
    hasPreviousData,
    currentIncomeInCents: currSummary.totalIncomeInCents,
    previousIncomeInCents: prevSummary.totalIncomeInCents,
    incomeDiffInCents,
    incomeChangePercent,
    currentExpenseInCents: currSummary.totalExpenseInCents,
    previousExpenseInCents: prevSummary.totalExpenseInCents,
    expenseDiffInCents,
    expenseChangePercent,
    categoryVariations,
  };
}

export interface UpcomingCommitmentItem {
  id: string;
  kind: 'recurring' | 'card_invoice';
  title: string;
  amountInCents: number;
  dueDate: string; // YYYY-MM-DD
  status: 'overdue' | 'pending' | 'paid';
  recurringOccurrence?: RecurringOccurrence;
  cardId?: string;
}

export function getUpcomingCommitments(
  recurringSummary: MonthlyRecurringSummary,
  cardsSummary: CardInvoiceSummary[],
  monthKey: string,
  referenceTodayStr?: string
): UpcomingCommitmentItem[] {
  const todayStr = referenceTodayStr || new Date().toISOString().slice(0, 10);
  const items: UpcomingCommitmentItem[] = [];

  for (const occ of recurringSummary.occurrences) {
    if (occ.status === 'paused') continue;
    items.push({
      id: `comm_rec_${occ.occurrenceKey}`,
      kind: 'recurring',
      title: occ.name,
      amountInCents: occ.status === 'paid' ? (occ.paidAmountInCents ?? occ.expectedAmountInCents) : occ.expectedAmountInCents,
      dueDate: occ.dueDate,
      status: occ.status,
      recurringOccurrence: occ,
    });
  }

  const [yStr, mStr] = monthKey.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const lastDay = new Date(year, month, 0).getDate();

  for (const cs of cardsSummary) {
    if (cs.currentInvoiceTotalInCents <= 0) continue;
    const dueDay = Math.min(cs.card.dueDay, lastDay);
    const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    items.push({
      id: `comm_card_${cs.card.id}_${monthKey}`,
      kind: 'card_invoice',
      title: `Fatura ${cs.card.name}`,
      amountInCents: cs.currentInvoiceTotalInCents,
      dueDate,
      status: dueDate < todayStr ? 'overdue' : 'pending',
      cardId: cs.card.id,
    });
  }

  // Ordena: não pagos primeiro (atrasados -> pendentes), depois por proximidade da data de vencimento
  items.sort((a, b) => {
    const aPaid = a.status === 'paid' ? 1 : 0;
    const bPaid = b.status === 'paid' ? 1 : 0;
    if (aPaid !== bPaid) return aPaid - bPaid;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return items;
}

