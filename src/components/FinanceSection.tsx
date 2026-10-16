import { useState, useMemo, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Wallet,
  CreditCard,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Mic,
  CalendarClock,
  Repeat,
  BarChart3,
  PieChart,
  TrendingUp,
  TrendingDown,
  Edit3,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { db, ensureDefaultFinanceCategories, markCategoryAsDeleted } from '../lib/db';
import {
  formatCentsToBRL,
  parseBRLToCents,
  getMonthKey,
  formatMonthYear,
  formatDateBR,
  getAdjacentMonthKey,
  calculateMonthlySummary,
  calculateCardSummary,
  generateInstallmentTransactions,
  parseCSVTransactions,
  inferCategoryFromDescription,
  getRecurringOccurrencesForMonth,
  buildRecurringPaymentTransaction,
  calculateMonthlyEvolution,
  calculateFixedVsVariable,
  calculatePreviousMonthComparison,
  getUpcomingCommitments,
  type ParsedCSVRow,
  type RecurringOccurrence,
} from '../lib/financeEngine';
import { parseVoiceFinanceCommand } from '../lib/voiceFinanceParser';
import { useSpeechRecognition } from '../lib/useSpeechRecognition';
import type {
  FinanceTransaction,
  FinanceCard,
  FinanceCategory,
  FinancePaymentMethod,
  FinanceTransactionType,
  FinanceRecurringExpense,
  FinanceRecurringFrequency,
  FinanceRecurringStatus,
} from '../types';

const PAYMENT_METHOD_LABELS: Record<FinancePaymentMethod, string> = {
  pix: 'Pix',
  money: 'Dinheiro',
  debit: 'Débito',
  credit: 'Cartão de Crédito',
  other: 'Outro',
};

const FREQUENCY_LABELS: Record<FinanceRecurringFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

export function FinanceSection() {
  const [currentMonthKey, setCurrentMonthKey] = useState<string>(() => getMonthKey());
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'recurring' | 'transactions' | 'cards'>('summary');

  // Período do gráfico de evolução mensal (3, 6 ou 12 meses)
  const [evolutionMonths, setEvolutionMonths] = useState<3 | 6 | 12>(6);
  const [hoveredEvolutionMonth, setHoveredEvolutionMonth] = useState<string | null>(null);

  // Filtros de Lançamentos
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filtro da aba Gastos Fixos
  const [recurringFilter, setRecurringFilter] = useState<'all' | 'pending' | 'credit' | 'paid' | 'paused'>('all');

  // Modais
  const [showTransactionModal, setShowTransactionModal] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransaction | null>(null);
  const [showCardModal, setShowCardModal] = useState<boolean>(false);
  const [showBudgetModal, setShowBudgetModal] = useState<boolean>(false);
  const [showCSVModal, setShowCSVModal] = useState<boolean>(false);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState<boolean>(false);
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [voiceOriginText, setVoiceOriginText] = useState<string | null>(null);

  // Modais de Gastos Fixos
  const [showRecurringModal, setShowRecurringModal] = useState<boolean>(false);
  const [editingRecurring, setEditingRecurring] = useState<FinanceRecurringExpense | null>(null);
  const [payingOccurrence, setPayingOccurrence] = useState<RecurringOccurrence | null>(null);
  const [payDateStr, setPayDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [payAmountStr, setPayAmountStr] = useState<string>('');

  // Consultas Reativas do Dexie
  const transactions = useLiveQuery(() => db.financeTransactions.toArray()) || [];
  const cards = useLiveQuery(() => db.financeCards.filter((c) => !c.isArchived).toArray()) || [];
  const categories = useLiveQuery(() => db.financeCategories.toArray()) || [];
  const budget = useLiveQuery(() => db.financeBudgets.get(`budget_${currentMonthKey}`));
  const recurringExpenses = useLiveQuery(() => db.financeRecurring.toArray()) || [];

  // Garante categorias padrão na inicialização do módulo financeiro
  useEffect(() => {
    ensureDefaultFinanceCategories();
  }, []);

  // Resumo do Mês (Receitas, Despesas Realizadas, Saldo Atual e Orçamento)
  const summary = useMemo(() => {
    return calculateMonthlySummary(transactions, currentMonthKey, budget);
  }, [transactions, currentMonthKey, budget]);

  // Resumo de Gastos Fixos do Mês
  const recurringSummary = useMemo(() => {
    return getRecurringOccurrencesForMonth(recurringExpenses, transactions, currentMonthKey);
  }, [recurringExpenses, transactions, currentMonthKey]);

  // Saldo Projetado = Saldo Atual (realizado) - Contas Fixas Pendentes Diretas do Mês (boletos/pix, exclui cartão)
  const projectedBalanceInCents = summary.estimatedBalanceInCents - recurringSummary.totalPendingDirectInCents;

  // Resumos dos Cartões (incorporando gastos fixos no cartão que caem na fatura)
  const cardsSummary = useMemo(() => {
    return cards.map((card) =>
      calculateCardSummary(
        card,
        transactions,
        `${currentMonthKey}-15`,
        recurringSummary.occurrences,
        cards.length
      )
    );
  }, [cards, transactions, currentMonthKey, recurringSummary.occurrences]);

  const totalOpenInvoicesInCents = useMemo(() => {
    return cardsSummary.reduce((acc, cs) => acc + cs.currentInvoiceTotalInCents, 0);
  }, [cardsSummary]);

  // Análises e Gráficos do Dashboard
  const monthlyEvolution = useMemo(() => {
    // Ancora no mês atual do calendário (ou no mês selecionado se for posterior) para manter o histórico sempre visível
    const anchor = currentMonthKey > getMonthKey() ? currentMonthKey : getMonthKey();
    return calculateMonthlyEvolution(transactions, anchor, evolutionMonths);
  }, [transactions, currentMonthKey, evolutionMonths]);

  const fixedVsVariable = useMemo(() => {
    return calculateFixedVsVariable(transactions, recurringSummary, currentMonthKey);
  }, [transactions, recurringSummary, currentMonthKey]);

  const prevMonthComparison = useMemo(() => {
    return calculatePreviousMonthComparison(transactions, currentMonthKey);
  }, [transactions, currentMonthKey]);

  const upcomingCommitments = useMemo(() => {
    return getUpcomingCommitments(recurringSummary, cardsSummary, currentMonthKey);
  }, [recurringSummary, cardsSummary, currentMonthKey]);

  // Mapeamento de Categorias por ID
  const categoryMap = useMemo(() => {
    const map = new Map<string, FinanceCategory>();
    categories.forEach((cat) => map.set(cat.id, cat));
    return map;
  }, [categories]);

  // Lançamentos do mês atual (sem filtros de busca) para "Movimentações Recentes"
  const monthTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        const txMonth = tx.paymentMethod === 'credit' && tx.invoiceMonth ? tx.invoiceMonth : tx.date.slice(0, 7);
        return txMonth === currentMonthKey;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [transactions, currentMonthKey]);

  // Lançamentos filtrados para a aba Lançamentos
  const filteredTransactions = useMemo(() => {
    return monthTransactions.filter((tx) => {
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (filterCategory !== 'all' && tx.categoryId !== filterCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = tx.description.toLowerCase().includes(q);
        const catName = categoryMap.get(tx.categoryId)?.name.toLowerCase() || '';
        return matchDesc || catName.includes(q);
      }
      return true;
    });
  }, [monthTransactions, filterType, filterCategory, searchQuery, categoryMap]);

  // Ocorrências filtradas para a aba Gastos Fixos
  const filteredOccurrences = useMemo(() => {
    return recurringSummary.occurrences.filter((occ) => {
      if (recurringFilter === 'all') return true;
      if (recurringFilter === 'pending') {
        return (occ.status === 'pending' || occ.status === 'overdue') && occ.paymentMethod !== 'credit';
      }
      if (recurringFilter === 'credit') {
        return occ.paymentMethod === 'credit';
      }
      if (recurringFilter === 'paid') return occ.status === 'paid';
      if (recurringFilter === 'paused') return occ.status === 'paused';
      return true;
    });
  }, [recurringSummary.occurrences, recurringFilter]);

  // Form State para Transação
  const [txType, setTxType] = useState<FinanceTransactionType>('expense');
  const [txDescription, setTxDescription] = useState('');
  const [txAmountStr, setTxAmountStr] = useState('');
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txPaymentMethod, setTxPaymentMethod] = useState<FinancePaymentMethod>('pix');
  const [txCardId, setTxCardId] = useState('');
  const [txInstallments, setTxInstallments] = useState(1);

  // Form State para Gasto Fixo Recorrente
  const [recName, setRecName] = useState('');
  const [recAmountStr, setRecAmountStr] = useState('');
  const [recCategoryId, setRecCategoryId] = useState('');
  const [recFirstDueDate, setRecFirstDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recHasDueDate, setRecHasDueDate] = useState<boolean>(true);
  const [recFrequency, setRecFrequency] = useState<FinanceRecurringFrequency>('monthly');
  const [recPaymentMethod, setRecPaymentMethod] = useState<FinancePaymentMethod>('pix');
  const [recCardId, setRecCardId] = useState('');
  const [recNotes, setRecNotes] = useState('');
  const [recStatus, setRecStatus] = useState<FinanceRecurringStatus>('active');

  // Form State para Cartão
  const [cardName, setCardName] = useState('');
  const [cardLimitStr, setCardLimitStr] = useState('');
  const [cardClosingDay, setCardClosingDay] = useState(20);
  const [cardDueDay, setCardDueDay] = useState(5);
  const [cardColor, setCardColor] = useState('from-indigo-600 to-indigo-800');

  // Form State para Limite Mensal
  const [budgetLimitStr, setBudgetLimitStr] = useState('');

  // Form State para Nova Categoria
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<FinanceTransactionType>('expense');

  // CSV Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvPreviewRows, setCsvPreviewRows] = useState<ParsedCSVRow[]>([]);
  const [csvDefaultType, setCsvDefaultType] = useState<FinanceTransactionType>('expense');
  const [csvDefaultCategory, setCsvDefaultCategory] = useState('');

  // Handlers de Navegação de Mês
  const handlePrevMonth = () => setCurrentMonthKey(getAdjacentMonthKey(currentMonthKey, -1));
  const handleNextMonth = () => setCurrentMonthKey(getAdjacentMonthKey(currentMonthKey, 1));
  const handleCurrentMonth = () => setCurrentMonthKey(getMonthKey());

  // Processamento de Comando de Voz
  const [voiceInput, setVoiceInput] = useState('');
  const [voiceParsingError, setVoiceParsingError] = useState<string | null>(null);

  const handleVoiceFinal = (rawText: string) => {
    const text = rawText.trim();
    if (!text) {
      setVoiceParsingError('Nenhum texto detectado. Fale ou digite o comando antes de continuar.');
      return;
    }

    const parsed = parseVoiceFinanceCommand(text, categories, cards);
    if (parsed.amountInCents === 0) {
      setVoiceParsingError(
        `Não identificamos o valor em reais em: "${text}". Tente informar o valor (ex: "Gastei 50 reais no mercado").`
      );
      return;
    }

    cancelListening();
    setShowVoiceModal(false);
    setVoiceParsingError(null);

    setEditingTransaction(null);
    setTxType(parsed.type);
    setTxAmountStr((parsed.amountInCents / 100).toFixed(2).replace('.', ','));
    setTxDescription(parsed.description);
    setTxCategoryId(parsed.categoryId);
    setTxDate(parsed.date);
    setTxPaymentMethod(parsed.paymentMethod);
    setTxCardId(parsed.cardId || cards[0]?.id || '');
    setTxInstallments(parsed.totalInstallments);
    setVoiceOriginText(text);
    setShowTransactionModal(true);
  };

  const {
    isSupported: isSpeechSupported,
    isListening,
    transcript: liveTranscript,
    error: speechError,
    startListening,
    stopListening,
    cancelListening,
    resetTranscript,
  } = useSpeechRecognition({
    onFinalResult: (finalText) => {
      setVoiceInput(finalText);
      handleVoiceFinal(finalText);
    },
  });

  useEffect(() => {
    if (liveTranscript) {
      setVoiceInput(liveTranscript);
      setVoiceParsingError(null);
    }
  }, [liveTranscript]);

  const handleToggleVoice = () => {
    if (isListening) {
      stopListening();
    } else {
      setVoiceParsingError(null);
      resetTranscript();
      startListening();
    }
  };

  const handleStartVoice = () => {
    setVoiceInput('');
    setVoiceParsingError(null);
    resetTranscript();
    setShowVoiceModal(true);
  };

  // Abertura de Modal de Transação (Nova ou Edição)
  const openNewTransactionModal = (type: FinanceTransactionType = 'expense') => {
    setEditingTransaction(null);
    setVoiceOriginText(null);
    setTxType(type);
    setTxDescription('');
    setTxAmountStr('');
    setTxDate(new Date().toISOString().slice(0, 10));
    setTxPaymentMethod('pix');
    setTxCardId(cards[0]?.id || '');
    setTxInstallments(1);

    const firstCat = categories.find((c) => c.type === type)?.id || '';
    setTxCategoryId(firstCat);
    setShowTransactionModal(true);
  };

  const openEditTransactionModal = (tx: FinanceTransaction) => {
    setEditingTransaction(tx);
    setVoiceOriginText(null);
    setTxType(tx.type);
    setTxDescription(tx.description);
    setTxAmountStr((tx.amountInCents / 100).toFixed(2).replace('.', ','));
    setTxDate(tx.date);
    setTxPaymentMethod(tx.paymentMethod);
    setTxCategoryId(tx.categoryId);
    setTxCardId(tx.cardId || cards[0]?.id || '');
    setTxInstallments(1);
    setShowTransactionModal(true);
  };

  // Salvar Transação (À vista ou Parcelada)
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountInCents = parseBRLToCents(txAmountStr);
    if (!txDescription.trim() || amountInCents <= 0 || !txCategoryId) return;

    const now = Date.now();

    if (editingTransaction) {
      const selectedCard = txPaymentMethod === 'credit' ? cards.find((c) => c.id === txCardId) : null;
      const invoiceMonth = selectedCard
        ? calculateCardSummary(selectedCard, [], txDate).currentInvoiceMonth
        : undefined;

      await db.financeTransactions.update(editingTransaction.id, {
        type: txType,
        description: txDescription.trim(),
        amountInCents,
        categoryId: txCategoryId,
        date: txDate,
        paymentMethod: txPaymentMethod,
        cardId: txPaymentMethod === 'credit' ? txCardId : undefined,
        invoiceMonth,
        updatedAt: now,
      });
      setShowTransactionModal(false);
      return;
    }

    if (txType === 'expense' && txPaymentMethod === 'credit' && txInstallments > 1 && txCardId) {
      const selectedCard = cards.find((c) => c.id === txCardId);
      const closingDay = selectedCard ? selectedCard.closingDay : 20;
      const planId = `plan_${now}_${Math.random().toString(36).substring(2, 7)}`;

      const installmentTxs = generateInstallmentTransactions({
        planId,
        description: txDescription.trim(),
        categoryId: txCategoryId,
        cardId: txCardId,
        totalCents: amountInCents,
        totalInstallments: txInstallments,
        firstDate: txDate,
        closingDay,
      });

      await db.financeTransactions.bulkAdd(installmentTxs);
      setShowTransactionModal(false);
      return;
    }

    const selectedCard = txPaymentMethod === 'credit' ? cards.find((c) => c.id === txCardId) : null;
    const invoiceMonth = selectedCard
      ? calculateCardSummary(selectedCard, [], txDate).currentInvoiceMonth
      : undefined;

    const newTx: FinanceTransaction = {
      id: `tx_${now}_${Math.random().toString(36).substring(2, 7)}`,
      type: txType,
      amountInCents,
      description: txDescription.trim(),
      categoryId: txCategoryId,
      date: txDate,
      paymentMethod: txPaymentMethod,
      cardId: txPaymentMethod === 'credit' ? txCardId : undefined,
      invoiceMonth,
      createdAt: now,
      updatedAt: now,
    };

    await db.financeTransactions.add(newTx);
    setShowTransactionModal(false);
  };

  // Excluir Transação
  const handleDeleteTransaction = async (id: string, installmentPlanId?: string) => {
    if (installmentPlanId) {
      if (confirm('Esta compra faz parte de um parcelamento. Deseja excluir todas as parcelas deste plano?')) {
        const related = transactions.filter((t) => t.installmentPlanId === installmentPlanId);
        await db.financeTransactions.bulkDelete(related.map((t) => t.id));
        return;
      }
    }
    if (confirm('Deseja excluir este lançamento financeiro?')) {
      await db.financeTransactions.delete(id);
    }
  };

  // ============================================================================
  // HANDLERS DE GASTOS FIXOS (RECORRENTES)
  // ============================================================================

  const openNewRecurringModal = () => {
    setEditingRecurring(null);
    setRecName('');
    setRecAmountStr('');
    const defaultExpCat =
      categories.find((c) => c.id === 'cat_assinaturas' || c.id === 'cat_moradia')?.id ||
      categories.find((c) => c.type === 'expense')?.id ||
      '';
    setRecCategoryId(defaultExpCat);
    setRecHasDueDate(true);
    setRecFirstDueDate(`${currentMonthKey}-${new Date().toISOString().slice(8, 10)}`);
    setRecFrequency('monthly');
    setRecPaymentMethod('pix');
    setRecCardId(cards[0]?.id || '');
    setRecNotes('');
    setRecStatus('active');
    setShowRecurringModal(true);
  };

  const openEditRecurringModal = (rec: FinanceRecurringExpense) => {
    setEditingRecurring(rec);
    setRecName(rec.name);
    setRecAmountStr((rec.amountInCents / 100).toFixed(2).replace('.', ','));
    setRecCategoryId(rec.categoryId);
    const hasDue = Boolean(rec.firstDueDate && rec.firstDueDate.trim() !== '');
    setRecHasDueDate(hasDue);
    setRecFirstDueDate(rec.firstDueDate || '');
    setRecFrequency(rec.frequency);
    setRecPaymentMethod(rec.paymentMethod);
    setRecCardId(rec.cardId || cards[0]?.id || '');
    setRecNotes(rec.notes || '');
    setRecStatus(rec.status);
    setShowRecurringModal(true);
  };

  const handleSaveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountInCents = parseBRLToCents(recAmountStr);
    if (!recName.trim() || amountInCents <= 0 || !recCategoryId) return;
    if (recHasDueDate && (!recFirstDueDate || recFirstDueDate.trim() === '')) return;

    const effectiveDueDate = recHasDueDate && recFirstDueDate ? recFirstDueDate : undefined;
    const now = Date.now();

    if (editingRecurring) {
      await db.financeRecurring.update(editingRecurring.id, {
        name: recName.trim(),
        amountInCents,
        categoryId: recCategoryId,
        firstDueDate: effectiveDueDate,
        frequency: recFrequency,
        paymentMethod: recPaymentMethod,
        cardId: recPaymentMethod === 'credit' ? recCardId : undefined,
        notes: recNotes.trim() || undefined,
        status: recStatus,
        updatedAt: now,
      });
      setShowRecurringModal(false);
      return;
    }

    const newRec: FinanceRecurringExpense = {
      id: `rec_${now}_${Math.random().toString(36).substring(2, 7)}`,
      name: recName.trim(),
      amountInCents,
      categoryId: recCategoryId,
      firstDueDate: effectiveDueDate,
      frequency: recFrequency,
      paymentMethod: recPaymentMethod,
      cardId: recPaymentMethod === 'credit' ? recCardId : undefined,
      notes: recNotes.trim() || undefined,
      status: recStatus,
      createdAt: now,
      updatedAt: now,
    };

    await db.financeRecurring.add(newRec);
    setShowRecurringModal(false);
  };

  const handleToggleRecurringStatus = async (rec: FinanceRecurringExpense) => {
    const nextStatus: FinanceRecurringStatus = rec.status === 'active' ? 'paused' : 'active';
    await db.financeRecurring.update(rec.id, {
      status: nextStatus,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteRecurring = async (rec: FinanceRecurringExpense) => {
    if (
      confirm(
        `Deseja excluir o gasto fixo "${rec.name}"?\n\nOs pagamentos já realizados em meses anteriores serão preservados no seu histórico de lançamentos.`
      )
    ) {
      await db.financeRecurring.delete(rec.id);
    }
  };

  const openPayOccurrenceModal = (occ: RecurringOccurrence) => {
    setPayingOccurrence(occ);
    setPayDateStr(new Date().toISOString().slice(0, 10));
    setPayAmountStr((occ.expectedAmountInCents / 100).toFixed(2).replace('.', ','));
  };

  const handleConfirmOccurrencePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingOccurrence) return;

    const paidAmountInCents = parseBRLToCents(payAmountStr);
    if (paidAmountInCents <= 0) return;

    const existingTx = transactions.find(
      (t) =>
        t.occurrenceKey === payingOccurrence.occurrenceKey ||
        t.id === `tx_rec_${payingOccurrence.occurrenceKey}`
    );

    const tx = buildRecurringPaymentTransaction({
      occurrence: payingOccurrence,
      paidDate: payDateStr || new Date().toISOString().slice(0, 10),
      paidAmountInCents,
      cards,
      existingTransaction: existingTx,
    });

    // put() garante idempotência absoluta (nunca duplica lançamento)
    await db.financeTransactions.put(tx);
    setPayingOccurrence(null);
  };

  const handleUndoOccurrencePayment = async (occ: RecurringOccurrence) => {
    const txId = occ.paidTransactionId || `tx_rec_${occ.occurrenceKey}`;
    if (confirm(`Deseja desfazer o pagamento de "${occ.name}" e voltar para Pendente?`)) {
      await db.financeTransactions.delete(txId);
    }
  };

  // Salvar Cartão
  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardName.trim()) return;

    const limitInCents = cardLimitStr ? parseBRLToCents(cardLimitStr) : undefined;
    const now = Date.now();
    const newCard: FinanceCard = {
      id: `card_${now}_${Math.random().toString(36).substring(2, 7)}`,
      name: cardName.trim(),
      color: cardColor,
      limitInCents,
      closingDay: Number(cardClosingDay) || 20,
      dueDay: Number(cardDueDay) || 5,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.financeCards.add(newCard);
    setShowCardModal(false);
    setCardName('');
    setCardLimitStr('');
  };

  // Salvar Limite Mensal
  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const limitInCents = parseBRLToCents(budgetLimitStr);
    const budgetId = `budget_${currentMonthKey}`;

    await db.financeBudgets.put({
      id: budgetId,
      monthKey: currentMonthKey,
      limitInCents,
      updatedAt: Date.now(),
    });

    setShowBudgetModal(false);
  };

  const openBudgetModal = () => {
    setBudgetLimitStr(
      budget?.limitInCents ? (budget.limitInCents / 100).toFixed(2).replace('.', ',') : ''
    );
    setShowBudgetModal(true);
  };

  // Salvar Nova Categoria Personalizada
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const trimmed = newCatName.trim();
    // Verifica se já existe uma categoria com este nome
    const alreadyExists = categories.some(
      (c) => c.name.toLowerCase().trim() === trimmed.toLowerCase() && c.type === newCatType
    );
    if (alreadyExists) {
      alert(`Já existe uma categoria de ${newCatType === 'expense' ? 'despesa' : 'receita'} chamada "${trimmed}".`);
      return;
    }

    const now = Date.now();
    const newId = `cat_custom_${now}_${Math.random().toString(36).substring(2, 7)}`;
    await db.financeCategories.add({
      id: newId,
      name: trimmed,
      type: newCatType,
      isCustom: true,
    });

    if (showTransactionModal) {
      setTxCategoryId(newId);
    }
    if (showRecurringModal) {
      setRecCategoryId(newId);
    }
    if (showCSVModal) {
      setCsvDefaultCategory(newId);
    }

    setNewCatName('');
    setShowNewCategoryModal(false);
  };

  const handleDeleteCategory = async (cat: FinanceCategory) => {
    // Garante que o usuário mantenha pelo menos uma categoria desse tipo
    const remainingSameType = categories.filter((c) => c.type === cat.type && c.id !== cat.id);
    if (remainingSameType.length === 0) {
      alert(`Você não pode excluir todas as categorias de ${cat.type === 'expense' ? 'despesa' : 'receita'}. Mantenha pelo menos uma ativa.`);
      return;
    }

    const isDefault = !cat.isCustom;
    const msg = isDefault
      ? `Deseja realmente excluir a categoria padrão "${cat.name}"? Seus lançamentos existentes continuarão seguros no histórico. Você poderá restaurá-la a qualquer momento clicando em "Restaurar categorias padrão".`
      : `Deseja excluir a categoria personalizada "${cat.name}"? Seus lançamentos existentes continuarão seguros no histórico.`;

    if (!confirm(msg)) {
      return;
    }

    // Registra como excluída para não recriar no reload
    markCategoryAsDeleted(cat.id);

    // Remove do IndexedDB
    await db.financeCategories.delete(cat.id);
  };

  // Processar Upload de CSV com Categorização Inteligente por Linha
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const defaultCat =
          categories.find((c) => c.id === 'cat-outros-despesa')?.id ||
          categories.find((c) => c.type === 'expense')?.id ||
          '';
        setCsvDefaultCategory(defaultCat);
        const { rows } = parseCSVTransactions(text, categories, defaultCat);
        setCsvPreviewRows(rows);
        setShowCSVModal(true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Atualizar categoria individual de uma linha do preview CSV
  const handleUpdateCSVRowCategory = (rowIndex: number, newCategoryId: string) => {
    setCsvPreviewRows((prev) =>
      prev.map((row, idx) =>
        idx === rowIndex ? { ...row, categoryId: newCategoryId, autoMatched: true } : row
      )
    );
  };

  // Atualizar tipo (despesa/receita) individual de uma linha do preview CSV
  const handleUpdateCSVRowType = (rowIndex: number, newType: FinanceTransactionType) => {
    setCsvPreviewRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIndex) return row;
        const inferred = inferCategoryFromDescription(
          row.description,
          newType,
          categories,
          row.rawCategory,
          csvDefaultCategory
        );
        return {
          ...row,
          type: newType,
          categoryId: inferred.categoryId,
          autoMatched: inferred.matched,
        };
      })
    );
  };

  // Remover uma linha indesejada do preview CSV antes de importar
  const handleRemoveCSVRow = (rowIndex: number) => {
    setCsvPreviewRows((prev) => prev.filter((_, idx) => idx !== rowIndex));
  };

  // Reaplicar categorização inteligente em todas as linhas do CSV
  const handleReapplyAutoCategorization = () => {
    setCsvPreviewRows((prev) =>
      prev.map((row) => {
        const inferred = inferCategoryFromDescription(
          row.description,
          row.type || csvDefaultType,
          categories,
          row.rawCategory,
          csvDefaultCategory
        );
        return {
          ...row,
          categoryId: inferred.categoryId,
          autoMatched: inferred.matched,
        };
      })
    );
  };

  // Confirmar Importação de CSV respeitando a categoria individual de cada linha
  const handleConfirmCSVImport = async () => {
    if (csvPreviewRows.length === 0) return;

    const now = Date.now();
    const newTransactions: FinanceTransaction[] = csvPreviewRows.map((row, idx) => ({
      id: `tx_import_${now}_${idx}`,
      type: row.type || csvDefaultType,
      amountInCents: row.amountInCents,
      description: row.description,
      categoryId: row.categoryId || csvDefaultCategory,
      date: row.date,
      paymentMethod: 'other',
      createdAt: now,
      updatedAt: now,
    }));

    await db.financeTransactions.bulkAdd(newTransactions);
    setShowCSVModal(false);
    setCsvPreviewRows([]);
    alert(`${newTransactions.length} lançamentos importados com suas respectivas categorias!`);
  };

  // Auto-categorizar lançamentos já existentes no mês atual com 1 clique
  const handleAutoCategorizeExistingMonth = async () => {
    if (monthTransactions.length === 0) return;

    let updatedCount = 0;
    const now = Date.now();

    for (const tx of monthTransactions) {
      const inferred = inferCategoryFromDescription(tx.description, tx.type, categories);
      if (inferred.matched && inferred.categoryId && inferred.categoryId !== tx.categoryId) {
        await db.financeTransactions.update(tx.id, {
          categoryId: inferred.categoryId,
          updatedAt: now,
        });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      alert(
        `✨ ${updatedCount} lançamento(s) de ${formatMonthYear(
          currentMonthKey
        )} foram re-categorizados automaticamente pelo nome do estabelecimento!`
      );
    } else {
      alert(
        'Todos os lançamentos identificáveis deste mês já estão nas categorias correspondentes. Você também pode trocar a categoria clicando diretamente no seletor de cada item na lista!'
      );
    }
  };

  // Maior valor para escala do gráfico de evolução mensal
  const maxEvolutionValue = useMemo(() => {
    let max = 0;
    for (const p of monthlyEvolution.points) {
      if (p.incomeInCents > max) max = p.incomeInCents;
      if (p.expenseInCents > max) max = p.expenseInCents;
    }
    return max;
  }, [monthlyEvolution.points]);

  return (
    <div className="space-y-6 pb-20">
      {/* ============================================================ */}
      {/* CABEÇALHO DO FINANCEIRO + SELETOR DE MÊS + AÇÕES RÁPIDAS */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">Dashboard Financeiro</h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800">
                  Offline & Seguro
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Visão geral completa de receitas, despesas, gastos fixos e faturas
              </p>
            </div>
          </div>

          {/* Seletor de Mês */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-start">
            {currentMonthKey !== getMonthKey() && (
              <button
                type="button"
                onClick={handleCurrentMonth}
                title="Voltar para o mês atual"
                className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1.5 rounded-xl transition-colors whitespace-nowrap shadow-2xs"
              >
                ← Mês Atual
              </button>
            )}
            <div className="flex items-center bg-slate-100/80 rounded-xl p-1 border border-slate-200/60">
              <button
                onClick={handlePrevMonth}
                title="Mês anterior"
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleCurrentMonth}
                title="Clique para ir ao mês atual"
                className="px-3 py-1 text-xs font-semibold text-slate-700 hover:text-emerald-700 min-w-36 text-center"
              >
                {formatMonthYear(currentMonthKey)}
              </button>
              <button
                onClick={handleNextMonth}
                title="Próximo mês"
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Barra de Ações Rápidas */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <button
            onClick={() => openNewTransactionModal('expense')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Despesa
          </button>
          <button
            onClick={() => openNewTransactionModal('income')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Receita
          </button>
          <button
            onClick={handleStartVoice}
            title={
              isSpeechSupported
                ? 'Registrar lançamento por comando de voz'
                : 'Reconhecimento de voz não suportado pelo navegador'
            }
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:from-violet-700 hover:to-indigo-800 text-white text-xs sm:text-sm font-bold shadow-md shadow-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/45 hover:-translate-y-0.5 active:translate-y-0 transition-all ring-2 ring-indigo-400/25"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/20">
              <Mic className="w-3.5 h-3.5 text-white animate-pulse" />
            </span>
            <span>Registrar por Voz</span>
          </button>
          <button
            onClick={openNewRecurringModal}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold shadow-xs transition-colors"
          >
            <Repeat className="w-4 h-4 text-amber-600" />
            <span>Adicionar Gasto Fixo</span>
          </button>
          <button
            onClick={() => setActiveSubTab('cards')}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <CreditCard className="w-4 h-4 text-slate-600" />
            <span>Cartões e Faturas</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Importar extrato CSV"
            className="ml-auto p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-1.5 text-xs font-medium"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden md:inline">Importar CSV</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* NAVEGAÇÃO ENTRE AS 4 SUB-ABAS DO FINANCEIRO */}
      {/* ============================================================ */}
      <div className="flex overflow-x-auto border-b border-slate-200 no-scrollbar">
        <button
          onClick={() => setActiveSubTab('summary')}
          className={`pb-3 px-4 sm:px-5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors relative ${
            activeSubTab === 'summary'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Visão Geral
        </button>
        <button
          onClick={() => setActiveSubTab('recurring')}
          className={`pb-3 px-4 sm:px-5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors relative flex items-center gap-2 ${
            activeSubTab === 'recurring'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Gastos Fixos
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              recurringSummary.overdueCount > 0
                ? 'bg-rose-100 text-rose-700 font-bold'
                : recurringSummary.pendingCount > 0
                ? 'bg-amber-100 text-amber-800 font-bold'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {recurringSummary.pendingCount > 0
              ? `${recurringSummary.pendingCount} pend.`
              : recurringSummary.occurrences.length}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('transactions')}
          className={`pb-3 px-4 sm:px-5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors relative flex items-center gap-2 ${
            activeSubTab === 'transactions'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Lançamentos
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {filteredTransactions.length}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('cards')}
          className={`pb-3 px-4 sm:px-5 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors relative flex items-center gap-2 ${
            activeSubTab === 'cards'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Cartões & Faturas
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {cards.length}
          </span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* 1. ABA VISÃO GERAL (DASHBOARD COMPLETO) */}
      {/* ============================================================ */}
      {activeSubTab === 'summary' && (
        <div className="space-y-6">
          {/* 1.1. Grid de Indicadores Principais (KPIs) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Saldo Atual & Projetado */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Saldo Atual
                </span>
                <span className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600">
                  <Wallet className="w-4 h-4" />
                </span>
              </div>
              <div>
                <div
                  className={`text-xl font-bold ${
                    summary.estimatedBalanceInCents >= 0 ? 'text-slate-900' : 'text-rose-600'
                  }`}
                >
                  {formatCentsToBRL(summary.estimatedBalanceInCents)}
                </div>
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">Projetado:</span>
                  <span
                    className={`font-bold ${
                      projectedBalanceInCents >= 0 ? 'text-indigo-600' : 'text-rose-600'
                    }`}
                  >
                    {formatCentsToBRL(projectedBalanceInCents)}
                  </span>
                </div>
              </div>
            </div>

            {/* Total de Receitas */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Total de Receitas
                </span>
                <span className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600">
                  <ArrowDownRight className="w-4 h-4" />
                </span>
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-600">
                  {formatCentsToBRL(summary.totalIncomeInCents)}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Recebidas em {formatMonthYear(currentMonthKey)}
                </span>
              </div>
            </div>

            {/* Total de Despesas */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Total de Despesas
                </span>
                <span className="p-1.5 rounded-xl bg-rose-50 text-rose-600">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
              <div>
                <div className="text-xl font-bold text-rose-600">
                  {formatCentsToBRL(summary.totalExpenseInCents)}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Gastos efetivados + faturas
                </span>
              </div>
            </div>

            {/* Gastos Fixos (Total Previsto) */}
            <div
              onClick={() => setActiveSubTab('recurring')}
              className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between cursor-pointer hover:border-amber-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Gastos Fixos
                </span>
                <span className="p-1.5 rounded-xl bg-amber-50 text-amber-600">
                  <Repeat className="w-4 h-4" />
                </span>
              </div>
              <div>
                <div className="text-xl font-bold text-slate-800">
                  {formatCentsToBRL(recurringSummary.totalExpectedInCents)}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {recurringSummary.creditCount > 0
                    ? `Pago: ${formatCentsToBRL(recurringSummary.totalPaidInCents)} • ${recurringSummary.creditCount} no cartão`
                    : `Pago: ${formatCentsToBRL(recurringSummary.totalPaidInCents)}`}
                </span>
              </div>
            </div>

            {/* Contas Pendentes */}
            <div
              onClick={() => {
                setRecurringFilter('pending');
                setActiveSubTab('recurring');
              }}
              className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between cursor-pointer hover:border-rose-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Contas Pendentes
                </span>
                <span
                  className={`p-1.5 rounded-xl ${
                    recurringSummary.overdueDirectCount > 0
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  <CalendarClock className="w-4 h-4" />
                </span>
              </div>
              <div>
                <div
                  className={`text-xl font-bold ${
                    recurringSummary.overdueDirectCount > 0
                      ? 'text-rose-600'
                      : recurringSummary.totalPendingDirectInCents > 0
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {formatCentsToBRL(recurringSummary.totalPendingDirectInCents)}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {recurringSummary.pendingDirectCount === 0
                    ? recurringSummary.creditCount > 0
                      ? 'Tudo em dia (fixos no cartão caem na fatura)'
                      : 'Tudo em dia neste mês'
                    : recurringSummary.overdueDirectCount > 0
                    ? `${recurringSummary.overdueDirectCount} atrasada(s) • ${recurringSummary.pendingDirectCount} a pagar direto`
                    : `${recurringSummary.pendingDirectCount} conta(s) a pagar direto`}
                </span>
              </div>
            </div>

            {/* Faturas de Cartão */}
            <div
              onClick={() => setActiveSubTab('cards')}
              className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between cursor-pointer hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Faturas de Cartão
                </span>
                <span className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600">
                  <CreditCard className="w-4 h-4" />
                </span>
              </div>
              <div>
                <div className="text-xl font-bold text-slate-800">
                  {formatCentsToBRL(totalOpenInvoicesInCents)}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {cards.length === 0
                    ? 'Nenhum cartão ativo'
                    : `${cards.length} cartão(ões) em aberto`}
                </span>
              </div>
            </div>
          </div>

          {/* 1.2. Painel de Orçamento Mensal (Limite Mensal) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Percent className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Orçamento Mensal ({formatMonthYear(currentMonthKey)})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Acompanhe seu limite de gastos estabelecido para este mês
                  </p>
                </div>
              </div>

              <button
                onClick={openBudgetModal}
                className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors"
              >
                {summary.limitInCents > 0 ? 'Alterar Limite Mensal' : 'Configurar Limite Mensal'}
              </button>
            </div>

            {summary.limitInCents <= 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  Você ainda não definiu um limite de gastos para{' '}
                  <strong>{formatMonthYear(currentMonthKey)}</strong>. Defina uma meta para receber
                  alertas quando estiver próximo do teto.
                </div>
                <button
                  onClick={openBudgetModal}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Definir Limite Agora
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[11px] text-slate-500 block">Limite Definido</span>
                    <span className="text-sm sm:text-base font-bold text-slate-800">
                      {formatCentsToBRL(summary.limitInCents)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[11px] text-slate-500 block">Total Gasto</span>
                    <span className="text-sm sm:text-base font-bold text-rose-600">
                      {formatCentsToBRL(summary.totalExpenseInCents)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[11px] text-slate-500 block">
                      {summary.isOverLimit ? 'Excedente' : 'Disponível para Gastar'}
                    </span>
                    <span
                      className={`text-sm sm:text-base font-bold ${
                        summary.isOverLimit ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {summary.isOverLimit
                        ? formatCentsToBRL(summary.totalExpenseInCents - summary.limitInCents)
                        : formatCentsToBRL(summary.remainingInCents)}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[11px] text-slate-500 block">Percentual Utilizado</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-sm sm:text-base font-bold ${
                          summary.isOverLimit
                            ? 'text-rose-600'
                            : summary.percentageUsed >= 85
                            ? 'text-amber-600'
                            : 'text-slate-800'
                        }`}
                      >
                        {summary.percentageUsed.toFixed(1)}%
                      </span>
                      {summary.isOverLimit ? (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full">
                          Acima
                        </span>
                      ) : summary.percentageUsed >= 85 ? (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                          Atenção
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        summary.isOverLimit
                          ? 'bg-rose-500'
                          : summary.percentageUsed >= 85
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, summary.percentageUsed)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-500">
                    <span>
                      {summary.isOverLimit
                        ? `Você ultrapassou o orçamento mensal em ${formatCentsToBRL(
                            summary.totalExpenseInCents - summary.limitInCents
                          )}.`
                        : summary.percentageUsed >= 85
                        ? `Atenção: você já consumiu ${summary.percentageUsed.toFixed(
                            0
                          )}% do limite deste mês.`
                        : `Dentro do planejado • Resta ${formatCentsToBRL(summary.remainingInCents)}`}
                    </span>
                    <span>Meta: {formatCentsToBRL(summary.limitInCents)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 1.3. Resumo de Gastos Fixos & Próximos Vencimentos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card Resumo de Gastos Fixos no Dashboard */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-800">Resumo de Gastos Fixos</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openNewRecurringModal}
                      className="text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      + Adicionar
                    </button>
                    <button
                      onClick={() => setActiveSubTab('recurring')}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      Ver todos <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {recurringSummary.occurrences.length === 0 ? (
                  <div className="py-8 text-center space-y-2 bg-slate-50/60 rounded-xl border border-dashed border-slate-200 p-4">
                    <Repeat className="w-6 h-6 text-slate-300 mx-auto" />
                    <p className="text-xs font-medium text-slate-600">
                      Nenhum gasto fixo cadastrado para este mês.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Cadastre contas recorrentes como Aluguel, Internet, Energia, Academia ou
                      Assinaturas para acompanhar seus vencimentos.
                    </p>
                    <button
                      onClick={openNewRecurringModal}
                      className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Cadastrar Primeiro Gasto Fixo
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Previsto no Mês
                        </span>
                        <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                          {formatCentsToBRL(recurringSummary.totalExpectedInCents)}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                          Já Pago ({recurringSummary.paidCount})
                        </span>
                        <span className="text-sm font-bold text-emerald-700 mt-0.5 block">
                          {formatCentsToBRL(recurringSummary.totalPaidInCents)}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100">
                        <span className="text-[10px] uppercase font-bold text-amber-800 block">
                          A Pagar Direto ({recurringSummary.pendingDirectCount})
                        </span>
                        <span className="text-sm font-bold text-amber-800 mt-0.5 block">
                          {formatCentsToBRL(recurringSummary.totalPendingDirectInCents)}
                        </span>
                      </div>
                    </div>

                    {/* Destaque do Próximo Vencimento */}
                    {recurringSummary.nextDueOccurrence && recurringSummary.nextDueOccurrence.paymentMethod !== 'credit' ? (
                      <div
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                          recurringSummary.nextDueOccurrence.status === 'overdue'
                            ? 'bg-rose-50/70 border-rose-200'
                            : 'bg-amber-50/50 border-amber-200/80'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                recurringSummary.nextDueOccurrence.status === 'overdue'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {recurringSummary.nextDueOccurrence.status === 'overdue'
                                ? 'Conta em Atraso'
                                : recurringSummary.nextDueOccurrence.dueDate
                                ? 'Próximo Vencimento Direto'
                                : 'Gasto Fixo Mensal'}
                            </span>
                            <span className="text-xs font-semibold text-slate-600">
                              {recurringSummary.nextDueOccurrence.dueDate
                                ? `Vence em ${formatDateBR(recurringSummary.nextDueOccurrence.dueDate)}`
                                : 'Sem vencimento fixo'}
                            </span>
                          </div>
                          <div className="text-sm font-bold text-slate-900">
                            {recurringSummary.nextDueOccurrence.name} —{' '}
                            {formatCentsToBRL(
                              recurringSummary.nextDueOccurrence.expectedAmountInCents
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => openPayOccurrenceModal(recurringSummary.nextDueOccurrence!)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap shadow-xs"
                        >
                          Dar Baixa
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            {recurringSummary.totalExpectedInCents === 0
                              ? 'Nenhum gasto fixo cadastrado'
                              : recurringSummary.pendingDirectCount === 0 && recurringSummary.creditCount > 0
                              ? 'Nenhuma conta avulsa pendente!'
                              : 'Todos os gastos fixos ativos deste mês já foram pagos!'}
                          </span>
                        </div>
                        {recurringSummary.pendingDirectCount === 0 && recurringSummary.creditCount > 0 && (
                          <span className="text-[11px] font-normal text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-lg">
                            {recurringSummary.creditCount} no cartão (caem na fatura)
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {recurringSummary.paidCount} paga(s) • {recurringSummary.pendingDirectCount} a pagar direto
                  {recurringSummary.creditCount > 0 ? ` • ${recurringSummary.creditCount} na fatura do cartão` : ''}
                </span>
                <button
                  onClick={() => setActiveSubTab('recurring')}
                  className="text-emerald-600 font-semibold hover:underline"
                >
                  Gerenciar Gastos Fixos
                </button>
              </div>
            </div>

            {/* Card Próximos Vencimentos (Gastos Fixos + Faturas de Cartão) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">Próximos Vencimentos do Mês</h3>
                </div>
                <span className="text-xs text-slate-400">
                  {upcomingCommitments.length} compromisso(s)
                </span>
              </div>

              {upcomingCommitments.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs space-y-1">
                  <Clock className="w-6 h-6 mx-auto text-slate-300" />
                  <p>Nenhuma conta fixa ou fatura prevista para este mês.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {upcomingCommitments.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            item.kind === 'card_invoice'
                              ? 'bg-indigo-100 text-indigo-600'
                              : item.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-600'
                              : item.status === 'overdue'
                              ? 'bg-rose-100 text-rose-600'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.kind === 'card_invoice' ? (
                            <CreditCard className="w-4 h-4" />
                          ) : (
                            <Repeat className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">
                            {item.title}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span>{item.dueDate ? `Vence ${formatDateBR(item.dueDate)}` : 'Sem vencimento fixo'}</span>
                            <span>•</span>
                            <span
                              className={`font-semibold ${
                                item.status === 'paid'
                                  ? 'text-emerald-600'
                                  : item.status === 'overdue'
                                  ? 'text-rose-600'
                                  : 'text-amber-700'
                              }`}
                            >
                              {item.status === 'paid'
                                ? 'Pago'
                                : item.status === 'overdue'
                                ? 'Atrasado'
                                : 'Pendente'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          {formatCentsToBRL(item.amountInCents)}
                        </span>
                        {item.kind === 'recurring' &&
                          item.recurringOccurrence &&
                          item.status !== 'paid' && (
                            item.recurringOccurrence.paymentMethod === 'credit' ? (
                              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-md">
                                Na Fatura
                              </span>
                            ) : (
                              <button
                                onClick={() => openPayOccurrenceModal(item.recurringOccurrence!)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold"
                              >
                                Pagar
                              </button>
                            )
                          )}
                        {item.kind === 'card_invoice' && (
                          <button
                            onClick={() => setActiveSubTab('cards')}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold"
                          >
                            Fatura
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 1.4. Gráficos e Análise de Despesas (Gastos por Categoria, Evolução Mensal, Fixos vs Variáveis) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico 1: Gastos por Categoria */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-800">Gastos por Categoria</h3>
                </div>
                <span className="text-xs text-slate-400">
                  {summary.categoryExpenses.length} categoria(s)
                </span>
              </div>

              {summary.categoryExpenses.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs space-y-1">
                  <PieChart className="w-7 h-7 mx-auto text-slate-200" />
                  <p className="font-medium text-slate-500">Sem despesas neste mês</p>
                  <p className="text-[11px]">
                    Registre gastos para visualizar a distribuição por categoria.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {summary.categoryExpenses.slice(0, 6).map((item) => {
                    const cat = categoryMap.get(item.categoryId);
                    const pct =
                      summary.totalExpenseInCents > 0
                        ? ((item.totalCents / summary.totalExpenseInCents) * 100).toFixed(1)
                        : '0.0';

                    return (
                      <div key={item.categoryId} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700">
                            {cat?.name || 'Outros'}
                          </span>
                          <span className="font-semibold text-slate-800">
                            {formatCentsToBRL(item.totalCents)}{' '}
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({pct}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Number(pct))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Gráfico 2: Evolução Mensal (Receitas vs Despesas) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">Evolução Mensal</h3>
                </div>
                <div className="flex bg-slate-100 rounded-lg p-0.5 text-[11px] font-semibold">
                  {([3, 6, 12] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setEvolutionMonths(m)}
                      className={`px-2 py-0.5 rounded-md transition-colors ${
                        evolutionMonths === m
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {m}M
                    </button>
                  ))}
                </div>
              </div>

              {!monthlyEvolution.hasAnyData ? (
                <div className="py-12 text-center text-slate-400 text-xs space-y-1">
                  <BarChart3 className="w-7 h-7 mx-auto text-slate-200" />
                  <p className="font-medium text-slate-500">Sem histórico no período</p>
                  <p className="text-[11px]">
                    Adicione receitas ou despesas para comparar a evolução mês a mês.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Legenda */}
                  <div className="flex items-center gap-4 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                      Receitas
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                      Despesas
                    </span>
                  </div>

                  {/* Barras Verticais Responsivas */}
                  <div className="h-40 flex items-end justify-between gap-2 pt-4 pb-1 border-b border-slate-100">
                    {monthlyEvolution.points.map((pt) => {
                      const incHeight =
                        maxEvolutionValue > 0
                          ? Math.max(4, Math.round((pt.incomeInCents / maxEvolutionValue) * 100))
                          : 4;
                      const expHeight =
                        maxEvolutionValue > 0
                          ? Math.max(4, Math.round((pt.expenseInCents / maxEvolutionValue) * 100))
                          : 4;
                      const isCurrent = pt.monthKey === currentMonthKey;
                      const isHovered = pt.monthKey === (hoveredEvolutionMonth || currentMonthKey);

                      return (
                        <div
                          key={pt.monthKey}
                          onClick={() => setHoveredEvolutionMonth(pt.monthKey)}
                          onMouseEnter={() => setHoveredEvolutionMonth(pt.monthKey)}
                          title={`${pt.fullLabel}\nReceitas: ${formatCentsToBRL(
                            pt.incomeInCents
                          )}\nDespesas: ${formatCentsToBRL(pt.expenseInCents)}`}
                          className={`flex-1 flex flex-col items-center gap-1.5 cursor-pointer rounded-lg p-1 transition-all h-full justify-end ${
                            isHovered ? 'bg-slate-50 shadow-2xs' : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="w-full flex items-end justify-center gap-1 h-28">
                            <div
                              className="w-2.5 sm:w-3 bg-emerald-500 rounded-t transition-all"
                              style={{
                                height: pt.incomeInCents > 0 ? `${incHeight}%` : '2px',
                                opacity: pt.incomeInCents > 0 ? 1 : 0.25,
                              }}
                            />
                            <div
                              className="w-2.5 sm:w-3 bg-rose-500 rounded-t transition-all"
                              style={{
                                height: pt.expenseInCents > 0 ? `${expHeight}%` : '2px',
                                opacity: pt.expenseInCents > 0 ? 1 : 0.25,
                              }}
                            />
                          </div>
                          <span
                            className={`text-[10px] truncate ${
                              isCurrent
                                ? 'font-bold text-emerald-700'
                                : isHovered
                                ? 'font-semibold text-slate-800'
                                : 'text-slate-400'
                            }`}
                          >
                            {pt.shortLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Card de Detalhes do Mês no Gráfico */}
                  {(() => {
                    const activePoint =
                      monthlyEvolution.points.find(
                        (p) => p.monthKey === (hoveredEvolutionMonth || currentMonthKey)
                      ) || monthlyEvolution.points[monthlyEvolution.points.length - 1];

                    if (!activePoint) return null;

                    const balance = activePoint.incomeInCents - activePoint.expenseInCents;

                    return (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{activePoint.fullLabel}</span>
                          {activePoint.monthKey === currentMonthKey && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold">
                              Mês Selecionado
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-medium text-emerald-700">
                            Receitas: <strong>{formatCentsToBRL(activePoint.incomeInCents)}</strong>
                          </span>
                          <span className="font-medium text-rose-700">
                            Despesas: <strong>{formatCentsToBRL(activePoint.expenseInCents)}</strong>
                          </span>
                          <span
                            className={`font-bold ${
                              balance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            Saldo: {formatCentsToBRL(balance)}
                          </span>

                          {activePoint.monthKey !== currentMonthKey && (
                            <button
                              type="button"
                              onClick={() => setCurrentMonthKey(activePoint.monthKey)}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline ml-auto sm:ml-0"
                            >
                              Filtrar painel para este mês →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Gráfico 3: Gastos Fixos vs Variáveis */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-800">Fixos vs Variáveis</h3>
                </div>
                <span className="text-xs text-slate-400">{formatMonthYear(currentMonthKey)}</span>
              </div>

              {fixedVsVariable.totalAnalysedInCents === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs space-y-1">
                  <Repeat className="w-7 h-7 mx-auto text-slate-200" />
                  <p className="font-medium text-slate-500">Sem dados para proporção</p>
                  <p className="text-[11px]">
                    Registre gastos fixos ou despesas variáveis para analisar a divisão do seu
                    orçamento.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Barra Proporcional Dupla */}
                  <div className="space-y-1.5">
                    <div className="w-full h-4 rounded-full bg-slate-100 overflow-hidden flex">
                      {fixedVsVariable.fixedPercentage > 0 && (
                        <div
                          className="bg-amber-500 h-full transition-all duration-500"
                          style={{ width: `${fixedVsVariable.fixedPercentage}%` }}
                          title={`Gastos Fixos: ${fixedVsVariable.fixedPercentage}%`}
                        />
                      )}
                      {fixedVsVariable.variablePercentage > 0 && (
                        <div
                          className="bg-indigo-500 h-full transition-all duration-500"
                          style={{ width: `${fixedVsVariable.variablePercentage}%` }}
                          title={`Gastos Variáveis: ${fixedVsVariable.variablePercentage}%`}
                        />
                      )}
                    </div>
                    <div className="flex justify-between text-[11px] font-semibold">
                      <span className="text-amber-700">
                        Fixos: {fixedVsVariable.fixedPercentage}%
                      </span>
                      <span className="text-indigo-700">
                        Variáveis: {fixedVsVariable.variablePercentage}%
                      </span>
                    </div>
                  </div>

                  {/* Detalhamento em Reais */}
                  <div className="space-y-2.5">
                    <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-100 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-800">
                          Gastos Fixos e Recorrentes
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Pagos: {formatCentsToBRL(fixedVsVariable.fixedRealizedInCents)} •
                          Pendentes: {formatCentsToBRL(fixedVsVariable.fixedPendingInCents)}
                        </div>
                      </div>
                      <span className="text-sm font-bold text-amber-800">
                        {formatCentsToBRL(fixedVsVariable.fixedTotalInCents)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-800">
                          Gastos Variáveis do Mês
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Compras avulsas e parcelas não recorrentes
                        </div>
                      </div>
                      <span className="text-sm font-bold text-indigo-800">
                        {formatCentsToBRL(fixedVsVariable.variableRealizedInCents)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 1.5. Movimentações Recentes + Comparação com o Mês Anterior */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Movimentações Recentes (ocupa 2 colunas no desktop) */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Movimentações Recentes</h3>
                  <p className="text-xs text-slate-400">
                    Últimos lançamentos registrados em {formatMonthYear(currentMonthKey)}
                  </p>
                </div>
                <button
                  onClick={() => setActiveSubTab('transactions')}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  Ver histórico completo <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {monthTransactions.length === 0 ? (
                <div className="py-10 text-center text-slate-400 space-y-2">
                  <DollarSign className="w-7 h-7 mx-auto text-slate-300" />
                  <p className="text-xs font-medium text-slate-500">
                    Nenhuma movimentação registrada neste mês.
                  </p>
                  <div className="flex justify-center gap-2 pt-1">
                    <button
                      onClick={() => openNewTransactionModal('expense')}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100"
                    >
                      + Registrar Despesa
                    </button>
                    <button
                      onClick={() => openNewTransactionModal('income')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100"
                    >
                      + Registrar Receita
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {monthTransactions.slice(0, 6).map((tx) => {
                    const cat = categoryMap.get(tx.categoryId);
                    const isExpense = tx.type === 'expense';
                    const isCredit = tx.paymentMethod === 'credit';
                    const card = isCredit && tx.cardId ? cards.find((c) => c.id === tx.cardId) : null;

                    return (
                      <div
                        key={tx.id}
                        className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 px-2 rounded-xl transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isExpense
                                ? 'bg-rose-50 text-rose-600'
                                : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {isExpense ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                                {tx.description}
                              </span>
                              {(tx.recurringExpenseId || tx.occurrenceKey) && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 font-semibold shrink-0">
                                  Fixo
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                              <span className="font-medium text-slate-600">
                                {cat?.name || 'Outros'}
                              </span>
                              <span>•</span>
                              <span>{formatDateBR(tx.date)}</span>
                              <span>•</span>
                              <span>
                                {isCredit
                                  ? card?.name || 'Cartão de Crédito'
                                  : PAYMENT_METHOD_LABELS[tx.paymentMethod]}
                              </span>
                              {tx.totalInstallments && tx.totalInstallments > 1 && (
                                <span className="bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded font-medium">
                                  {tx.installmentNumber}/{tx.totalInstallments}x
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-xs sm:text-sm font-bold ${
                              isExpense ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {isExpense ? '-' : '+'} {formatCentsToBRL(tx.amountInCents)}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditTransactionModal(tx)}
                              title="Editar lançamento"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteTransaction(tx.id, tx.installmentPlanId)
                              }
                              title="Excluir lançamento"
                              className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Comparação com o Mês Anterior */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Comparativo Mensal</h3>
                <p className="text-xs text-slate-400">
                  Em relação a {formatMonthYear(prevMonthComparison.previousMonthKey)}
                </p>
              </div>

              {!prevMonthComparison.hasPreviousData ? (
                <div className="py-10 text-center text-slate-400 text-xs space-y-1 bg-slate-50/60 rounded-xl border border-dashed border-slate-200 p-4">
                  <TrendingUp className="w-6 h-6 mx-auto text-slate-300" />
                  <p className="font-medium text-slate-600">Sem dados no mês anterior</p>
                  <p className="text-[11px]">
                    Não há lançamentos em {formatMonthYear(prevMonthComparison.previousMonthKey)}{' '}
                    para calcular variações percentuais.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Variação de Despesas */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Despesas vs Mês Anterior</span>
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          prevMonthComparison.expenseDiffInCents > 0
                            ? 'text-rose-600'
                            : prevMonthComparison.expenseDiffInCents < 0
                            ? 'text-emerald-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {prevMonthComparison.expenseDiffInCents > 0 ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : prevMonthComparison.expenseDiffInCents < 0 ? (
                          <TrendingDown className="w-3.5 h-3.5" />
                        ) : null}
                        {prevMonthComparison.expenseChangePercent !== null
                          ? `${prevMonthComparison.expenseChangePercent > 0 ? '+' : ''}${prevMonthComparison.expenseChangePercent.toFixed(
                              1
                            )}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700">
                      {prevMonthComparison.expenseDiffInCents > 0
                        ? `Aumento de ${formatCentsToBRL(prevMonthComparison.expenseDiffInCents)}`
                        : prevMonthComparison.expenseDiffInCents < 0
                        ? `Economia de ${formatCentsToBRL(
                            Math.abs(prevMonthComparison.expenseDiffInCents)
                          )}`
                        : 'Mesmo patamar de gastos'}
                    </div>
                  </div>

                  {/* Variação de Receitas */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Receitas vs Mês Anterior</span>
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          prevMonthComparison.incomeDiffInCents > 0
                            ? 'text-emerald-600'
                            : prevMonthComparison.incomeDiffInCents < 0
                            ? 'text-rose-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {prevMonthComparison.incomeChangePercent !== null
                          ? `${prevMonthComparison.incomeChangePercent > 0 ? '+' : ''}${prevMonthComparison.incomeChangePercent.toFixed(
                              1
                            )}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700">
                      {prevMonthComparison.incomeDiffInCents >= 0
                        ? `+${formatCentsToBRL(prevMonthComparison.incomeDiffInCents)} em receitas`
                        : `-${formatCentsToBRL(
                            Math.abs(prevMonthComparison.incomeDiffInCents)
                          )} em receitas`}
                    </div>
                  </div>

                  {/* Maiores variações por categoria */}
                  {prevMonthComparison.categoryVariations.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Destaques por Categoria
                      </span>
                      {prevMonthComparison.categoryVariations.slice(0, 3).map((v) => {
                        const cat = categoryMap.get(v.categoryId);
                        const increased = v.diffCents > 0;
                        return (
                          <div
                            key={v.categoryId}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-slate-700 font-medium truncate">
                              {cat?.name || 'Outros'}
                            </span>
                            <span
                              className={`font-semibold ${
                                increased ? 'text-rose-600' : 'text-emerald-600'
                              }`}
                            >
                              {increased ? '+' : '-'}
                              {formatCentsToBRL(Math.abs(v.diffCents))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. ABA GASTOS FIXOS (CONTROLE DE RECORRÊNCIAS) */}
      {/* ============================================================ */}
      {activeSubTab === 'recurring' && (
        <div className="space-y-6">
          {/* Resumo Superior de Gastos Fixos do Mês */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Previsto em {formatMonthYear(currentMonthKey)}
              </span>
              <div className="text-2xl font-bold text-slate-800 mt-1">
                {formatCentsToBRL(recurringSummary.totalExpectedInCents)}
              </div>
              <span className="text-[11px] text-slate-400">
                {recurringSummary.occurrences.filter((o) => o.status !== 'paused').length}{' '}
                vencimento(s) ativo(s)
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">
                Total Pago no Mês
              </span>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {formatCentsToBRL(recurringSummary.totalPaidInCents)}
              </div>
              <span className="text-[11px] text-slate-400">
                {recurringSummary.paidCount} conta(s) quitada(s)
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">
                Falta Pagar (Pendente)
              </span>
              <div className="text-2xl font-bold text-amber-600 mt-1">
                {formatCentsToBRL(recurringSummary.totalPendingInCents)}
              </div>
              <span className="text-[11px] text-slate-400">
                {recurringSummary.pendingCount} conta(s) em aberto
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider block">
                Contas em Atraso (Diretas)
              </span>
              <div className="text-2xl font-bold text-rose-600 mt-1">
                {recurringSummary.overdueDirectCount}
              </div>
              <span className="text-[11px] text-slate-400">
                {recurringSummary.overdueDirectCount > 0
                  ? 'Atenção aos boletos/pix ultrapassados'
                  : 'Nenhum boleto ou conta direta atrasada'}
              </span>
            </div>
          </div>

          {/* Barra de Filtros e Botão Novo Gasto Fixo */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-medium">
              {(
                [
                  { id: 'all', label: 'Todos do Mês' },
                  { id: 'pending', label: 'A Pagar Direto' },
                  { id: 'credit', label: 'Na Fatura do Cartão' },
                  { id: 'paid', label: 'Pagos' },
                  { id: 'paused', label: 'Pausados' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRecurringFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    recurringFilter === tab.id
                      ? 'bg-white shadow-xs text-slate-900 font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={openNewRecurringModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Gasto Fixo
            </button>
          </div>

          {/* Lista de Ocorrências do Mês Selecionado */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                Vencimentos de {formatMonthYear(currentMonthKey)}
              </h3>
              <span className="text-xs text-slate-400">
                {filteredOccurrences.length} registro(s)
              </span>
            </div>

            {filteredOccurrences.length === 0 ? (
              <div className="py-14 text-center text-slate-400 space-y-2 p-4">
                <Repeat className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  {recurringFilter === 'pending' && recurringSummary.creditCount > 0
                    ? 'Nenhuma conta avulsa pendente de pagamento direto!'
                    : 'Nenhum gasto fixo encontrado para o filtro selecionado neste mês.'}
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {recurringFilter === 'pending' && recurringSummary.creditCount > 0
                    ? `Seus ${recurringSummary.creditCount} gasto(s) fixo(s) no cartão já caem automaticamente na fatura consolidada.`
                    : 'Cadastre suas despesas recorrentes (Aluguel, Condomínio, Luz, Água, Internet, Academia, Streaming) para controlar os pagamentos mensais sem duplicidade.'}
                </p>
                {recurringFilter === 'pending' && recurringSummary.creditCount > 0 && (
                  <button
                    onClick={() => setRecurringFilter('credit')}
                    className="mt-2 text-xs font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1"
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Ver gastos na fatura do cartão
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredOccurrences.map((occ) => {
                  const cat = categoryMap.get(occ.categoryId);
                  const recTemplate = recurringExpenses.find((r) => r.id === occ.recurringId);
                  const card =
                    occ.paymentMethod === 'credit' && occ.cardId
                      ? cards.find((c) => c.id === occ.cardId)
                      : null;

                  return (
                    <div
                      key={occ.occurrenceKey}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            occ.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-600'
                              : occ.status === 'paused'
                              ? 'bg-slate-100 text-slate-400'
                              : occ.paymentMethod === 'credit'
                              ? 'bg-indigo-50 text-indigo-600'
                              : occ.status === 'overdue'
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {occ.paymentMethod === 'credit' ? (
                            <CreditCard className="w-5 h-5" />
                          ) : (
                            <Repeat className="w-5 h-5" />
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-slate-800">{occ.name}</span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                occ.status === 'paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : occ.status === 'paused'
                                  ? 'bg-slate-200 text-slate-600'
                                  : occ.paymentMethod === 'credit'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : occ.status === 'overdue'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {occ.status === 'paid'
                                ? 'Pago'
                                : occ.status === 'paused'
                                ? 'Pausado'
                                : occ.paymentMethod === 'credit'
                                ? 'Na Fatura'
                                : occ.status === 'overdue'
                                ? 'Atrasado'
                                : 'Pendente'}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                              {FREQUENCY_LABELS[occ.frequency]}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-700">
                              {cat?.name || 'Outros'}
                            </span>
                            <span>•</span>
                            <span>{occ.dueDate ? `Vencimento: ${formatDateBR(occ.dueDate)}` : 'Sem vencimento fixo'}</span>
                            <span>•</span>
                            <span>
                              {occ.paymentMethod === 'credit'
                                ? `Cartão ${card?.name || 'Crédito'}`
                                : PAYMENT_METHOD_LABELS[occ.paymentMethod]}
                            </span>
                            {occ.status === 'paid' && occ.paidDate && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-700 font-medium">
                                  Pago em {formatDateBR(occ.paidDate)}
                                </span>
                              </>
                            )}
                          </div>

                          {occ.notes && (
                            <p className="text-[11px] text-slate-400 italic">"{occ.notes}"</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left sm:text-right">
                          <div className="text-sm sm:text-base font-bold text-slate-900">
                            {formatCentsToBRL(
                              occ.status === 'paid'
                                ? occ.paidAmountInCents ?? occ.expectedAmountInCents
                                : occ.expectedAmountInCents
                            )}
                          </div>
                          {occ.status === 'paid' &&
                            occ.paidAmountInCents &&
                            occ.paidAmountInCents !== occ.expectedAmountInCents && (
                              <span className="text-[10px] text-slate-400 block">
                                Previsto: {formatCentsToBRL(occ.expectedAmountInCents)}
                              </span>
                            )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {(occ.status === 'pending' || occ.status === 'overdue') && (
                            <button
                              onClick={() => openPayOccurrenceModal(occ)}
                              className={`px-3 py-1.5 rounded-xl text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1 ${
                                occ.paymentMethod === 'credit'
                                  ? 'bg-indigo-600 hover:bg-indigo-700'
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {occ.paymentMethod === 'credit' ? (
                                <>
                                  <CreditCard className="w-3.5 h-3.5" />
                                  Lançar no Cartão
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Marcar Pago
                                </>
                              )}
                            </button>
                          )}

                          {occ.status === 'paid' && (
                            <button
                              onClick={() => handleUndoOccurrencePayment(occ)}
                              title="Desfazer pagamento e voltar para pendente"
                              className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-medium flex items-center gap-1"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Desfazer
                            </button>
                          )}

                          {recTemplate && (
                            <>
                              <button
                                onClick={() => openEditRecurringModal(recTemplate)}
                                title="Editar gasto fixo"
                                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggleRecurringStatus(recTemplate)}
                                title={
                                  recTemplate.status === 'active'
                                    ? 'Pausar recorrência'
                                    : 'Reativar recorrência'
                                }
                                className="p-2 rounded-xl text-amber-600 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                              >
                                {recTemplate.status === 'active' ? (
                                  <PauseCircle className="w-4 h-4" />
                                ) : (
                                  <PlayCircle className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => handleDeleteRecurring(recTemplate)}
                                title="Excluir gasto fixo"
                                className="p-2 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lista Mestre de Todos os Cadastros Recorrentes (para gerenciar trimestrais/anuais/futuros) */}
          {recurringExpenses.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Todos os Gastos Fixos Cadastrados ({recurringExpenses.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recurringExpenses.map((rec) => {
                  const cat = categoryMap.get(rec.categoryId);
                  return (
                    <div
                      key={rec.id}
                      className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/40 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {rec.name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                              rec.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {rec.status === 'active' ? 'Ativo' : 'Pausado'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {formatCentsToBRL(rec.amountInCents)} • {FREQUENCY_LABELS[rec.frequency]}{' '}
                          • {cat?.name || 'Outros'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {rec.firstDueDate ? `1º vencimento: ${formatDateBR(rec.firstDueDate)}` : 'Sem vencimento fixo'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEditRecurringModal(rec)}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/60"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleRecurringStatus(rec)}
                          className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-100/60"
                          title={rec.status === 'active' ? 'Pausar' : 'Reativar'}
                        >
                          {rec.status === 'active' ? (
                            <PauseCircle className="w-3.5 h-3.5" />
                          ) : (
                            <PlayCircle className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteRecurring(rec)}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100/60"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. ABA LANÇAMENTOS */}
      {/* ============================================================ */}
      {activeSubTab === 'transactions' && (
        <div className="space-y-4">
          {/* Barra de Filtros e Busca */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-slate-100 rounded-xl p-1 text-xs">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                    filterType === 'all' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-600'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFilterType('expense')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                    filterType === 'expense' ? 'bg-white shadow-xs text-rose-600' : 'text-slate-600'
                  }`}
                >
                  Despesas
                </button>
                <button
                  onClick={() => setFilterType('income')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                    filterType === 'income'
                      ? 'bg-white shadow-xs text-emerald-600'
                      : 'text-slate-600'
                  }`}
                >
                  Receitas
                </button>
              </div>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 outline-none focus:border-emerald-500"
              >
                <option value="all">Todas Categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Buscar lançamento..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-52 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleAutoCategorizeExistingMonth}
                title="Classificar automaticamente cada gasto deste mês pelo nome do estabelecimento"
                className="flex items-center gap-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold whitespace-nowrap px-2.5 py-1.5 rounded-xl transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Auto-categorizar
              </button>
              <button
                onClick={() => setShowNewCategoryModal(true)}
                title="Criar categoria personalizada"
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold whitespace-nowrap px-2"
              >
                + Categoria
              </button>
            </div>
          </div>

          {/* Listagem de Lançamentos */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {filteredTransactions.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <DollarSign className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-sm font-medium">
                  Nenhum lançamento encontrado para os filtros atuais.
                </p>
                <p className="text-xs text-slate-400">
                  Clique em "+ Nova Despesa" ou "+ Nova Receita" para registrar.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredTransactions.map((tx) => {
                  const isExpense = tx.type === 'expense';
                  const isCredit = tx.paymentMethod === 'credit';
                  const card =
                    isCredit && tx.cardId ? cards.find((c) => c.id === tx.cardId) : null;

                  return (
                    <div
                      key={tx.id}
                      className="p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isExpense
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {isExpense ? (
                            <ArrowUpRight className="w-5 h-5" />
                          ) : (
                            <ArrowDownRight className="w-5 h-5" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-slate-800">
                              {tx.description}
                            </span>
                            {(tx.recurringExpenseId || tx.occurrenceKey) && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 font-semibold">
                                Gasto Fixo
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1">
                            {/* Seletor rápido de categoria direto na linha */}
                            <select
                              value={tx.categoryId}
                              onChange={async (e) => {
                                await db.financeTransactions.update(tx.id, {
                                  categoryId: e.target.value,
                                  updatedAt: Date.now(),
                                });
                              }}
                              title="Clique para trocar a categoria deste lançamento"
                              className="font-semibold text-slate-700 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200/80 rounded-lg px-2 py-0.5 text-[11px] outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                            >
                              {categories
                                .filter((c) => c.type === tx.type)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                            </select>
                            <span>•</span>
                            <span>{formatDateBR(tx.date)}</span>
                            <span>•</span>
                            <span>{PAYMENT_METHOD_LABELS[tx.paymentMethod]}</span>
                            {isCredit && (
                              <>
                                <span>•</span>
                                <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-medium">
                                  {card?.name || 'Cartão'}
                                </span>
                              </>
                            )}
                            {tx.totalInstallments && tx.totalInstallments > 1 && (
                              <span className="bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded font-medium">
                                {tx.installmentNumber}/{tx.totalInstallments}x
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div
                          className={`text-sm sm:text-base font-bold ${
                            isExpense ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {isExpense ? '-' : '+'} {formatCentsToBRL(tx.amountInCents)}
                        </div>

                        <div className="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditTransactionModal(tx)}
                            title="Editar lançamento"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteTransaction(tx.id, tx.installmentPlanId)
                            }
                            title="Excluir lançamento"
                            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. ABA CARTÕES & FATURAS */}
      {/* ============================================================ */}
      {activeSubTab === 'cards' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Seus Cartões de Crédito</h3>
            <button
              onClick={() => setShowCardModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo Cartão
            </button>
          </div>

          {cards.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 space-y-2">
              <CreditCard className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-medium">Nenhum cartão de crédito cadastrado.</p>
              <p className="text-xs text-slate-400">
                Cadastre seus cartões para controlar faturas mensais, compras parceladas e limites.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {cardsSummary.map(
                ({
                  card,
                  currentInvoiceTotalInCents,
                  nextInvoiceTotalInCents,
                  futureInstallmentsTotalInCents,
                  estimatedAvailableLimitInCents,
                  currentInvoiceMonth,
                }) => (
                  <div
                    key={card.id}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between"
                  >
                    <div
                      className={`p-5 bg-gradient-to-r ${
                        card.color || 'from-indigo-600 to-indigo-800'
                      } text-white`}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <CreditCard className="w-6 h-6 text-white/80" />
                        <span className="text-[10px] uppercase font-bold tracking-widest text-white/70">
                          Cartão de Crédito
                        </span>
                      </div>
                      <div className="text-lg font-bold tracking-tight">{card.name}</div>
                      <div className="mt-3 flex items-center justify-between text-xs text-white/90">
                        <span>Fecha dia {card.closingDay}</span>
                        <span>Vence dia {card.dueDay}</span>
                      </div>
                    </div>

                    <div className="p-5 space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">
                          Fatura ({formatMonthYear(currentInvoiceMonth)}):
                        </span>
                        <span className="font-bold text-slate-900 text-sm">
                          {formatCentsToBRL(currentInvoiceTotalInCents)}
                        </span>
                      </div>

                      {recurringSummary.totalCreditInCents > 0 && (
                        <div className="flex justify-between items-center text-[11px] text-indigo-700 bg-indigo-50/70 border border-indigo-100 px-2.5 py-1 rounded-lg">
                          <span>Gastos fixos nesta fatura:</span>
                          <span className="font-semibold">
                            {formatCentsToBRL(
                              recurringSummary.occurrences
                                .filter((o) => o.paymentMethod === 'credit' && (o.cardId === card.id || (!o.cardId && cards.length === 1)))
                                .reduce((acc, o) => acc + (o.status === 'paid' ? (o.paidAmountInCents ?? o.expectedAmountInCents) : o.expectedAmountInCents), 0)
                            )}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Próxima Fatura:</span>
                        <span className="font-semibold text-slate-700">
                          {formatCentsToBRL(nextInvoiceTotalInCents)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Parcelas Futuras Totais:</span>
                        <span className="font-semibold text-slate-700">
                          {formatCentsToBRL(futureInstallmentsTotalInCents)}
                        </span>
                      </div>

                      {card.limitInCents && (
                        <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                          <span className="text-slate-500">Limite Disponível Estimado:</span>
                          <span className="font-bold text-emerald-600">
                            {formatCentsToBRL(estimatedAvailableLimitInCents || 0)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CADASTRAR / EDITAR GASTO FIXO */}
      {/* ============================================================ */}
      {showRecurringModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingRecurring ? 'Editar Gasto Fixo' : 'Novo Gasto Fixo Recorrente'}
              </h3>
              <button
                onClick={() => setShowRecurringModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecurring} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Gasto Fixo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aluguel, Internet, Energia, Academia, Netflix..."
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Valor Previsto (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={recAmountStr}
                    onChange={(e) => setRecAmountStr(e.target.value)}
                    className="w-full text-sm font-bold px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Frequência *
                  </label>
                  <select
                    value={recFrequency}
                    onChange={(e) =>
                      setRecFrequency(e.target.value as FinanceRecurringFrequency)
                    }
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  >
                    <option value="monthly">Mensal</option>
                    <option value="weekly">Semanal</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Categoria *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCatType('expense');
                        setShowNewCategoryModal(true);
                      }}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      + Nova
                    </button>
                  </div>
                  <select
                    value={recCategoryId}
                    onChange={(e) => setRecCategoryId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  >
                    {categories
                      .filter((c) => c.type === 'expense')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.isCustom ? '★' : ''}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      1º Vencimento
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!recHasDueDate}
                        onChange={(e) => {
                          const withoutDue = e.target.checked;
                          setRecHasDueDate(!withoutDue);
                          if (withoutDue) setRecFirstDueDate('');
                          else setRecFirstDueDate(new Date().toISOString().slice(0, 10));
                        }}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                      />
                      <span>Sem vencimento</span>
                    </label>
                  </div>
                  {recHasDueDate ? (
                    <input
                      type="date"
                      required={recHasDueDate}
                      value={recFirstDueDate}
                      onChange={(e) => setRecFirstDueDate(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                    />
                  ) : (
                    <div className="w-full text-xs px-3 py-2 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-500 italic flex items-center justify-between">
                      <span>Sem vencimento fixo</span>
                      <button
                        type="button"
                        onClick={() => {
                          setRecHasDueDate(true);
                          setRecFirstDueDate(new Date().toISOString().slice(0, 10));
                        }}
                        className="text-[10px] text-emerald-600 font-semibold hover:underline"
                      >
                        Definir data
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Forma de Pagamento
                  </label>
                  <select
                    value={recPaymentMethod}
                    onChange={(e) =>
                      setRecPaymentMethod(e.target.value as FinancePaymentMethod)
                    }
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  >
                    <option value="pix">Pix / Boleto</option>
                    <option value="debit">Débito Automático</option>
                    <option value="credit">Cartão de Crédito</option>
                    <option value="money">Dinheiro</option>
                    <option value="other">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Status da Recorrência
                  </label>
                  <select
                    value={recStatus}
                    onChange={(e) =>
                      setRecStatus(e.target.value as FinanceRecurringStatus)
                    }
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  >
                    <option value="active">Ativo</option>
                    <option value="paused">Pausado</option>
                  </select>
                </div>
              </div>

              {recPaymentMethod === 'credit' && (
                <div>
                  <label className="block text-xs font-semibold text-indigo-900 mb-1">
                    Cartão Associado
                  </label>
                  <select
                    value={recCardId}
                    onChange={(e) => setRecCardId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-indigo-200 rounded-xl outline-none bg-indigo-50/40"
                  >
                    {cards.length === 0 ? (
                      <option value="">Nenhum cartão cadastrado</option>
                    ) : (
                      cards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Fecha dia {c.closingDay})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observações (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Débito automático dia 10, plano família..."
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecurringModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  {editingRecurring ? 'Salvar Alterações' : 'Cadastrar Gasto Fixo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CONFIRMAR PAGAMENTO DE GASTO FIXO (DAR BAIXA) */}
      {/* ============================================================ */}
      {payingOccurrence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {payingOccurrence.paymentMethod === 'credit'
                  ? 'Confirmar Lançamento no Cartão'
                  : 'Confirmar Pagamento'}
              </h3>
              <button
                onClick={() => setPayingOccurrence(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
              <div className="text-sm font-bold text-slate-800">{payingOccurrence.name}</div>
              <div className="text-xs text-slate-500">
                {payingOccurrence.dueDate ? `Vencimento: ${formatDateBR(payingOccurrence.dueDate)} • ` : 'Sem vencimento fixo • '}Valor previsto:{' '}
                {formatCentsToBRL(payingOccurrence.expectedAmountInCents)}
              </div>
              {payingOccurrence.paymentMethod === 'credit' && (
                <div className="text-[11px] text-indigo-700 font-medium pt-1">
                  💳 Este gasto será contabilizado na fatura do seu cartão de crédito.
                </div>
              )}
            </div>

            <form onSubmit={handleConfirmOccurrencePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {payingOccurrence.paymentMethod === 'credit'
                    ? 'Valor a Lançar na Fatura (R$) *'
                    : 'Valor Efetivamente Pago (R$) *'}
                </label>
                <input
                  type="text"
                  required
                  value={payAmountStr}
                  onChange={(e) => setPayAmountStr(e.target.value)}
                  className="w-full text-base font-bold px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {payingOccurrence.paymentMethod === 'credit'
                    ? 'Data da Cobrança no Cartão *'
                    : 'Data do Pagamento *'}
                </label>
                <input
                  type="date"
                  required
                  value={payDateStr}
                  onChange={(e) => setPayDateStr(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayingOccurrence(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 shadow-xs ${
                    payingOccurrence.paymentMethod === 'credit'
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {payingOccurrence.paymentMethod === 'credit' ? (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Confirmar no Cartão
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar Baixa
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: NOVA / EDITAR TRANSAÇÃO */}
      {/* ============================================================ */}
      {showTransactionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingTransaction
                  ? 'Editar Lançamento'
                  : `Nova ${txType === 'expense' ? 'Despesa' : 'Receita'}`}
              </h3>
              <button
                onClick={() => setShowTransactionModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              {voiceOriginText && (
                <div className="p-3 bg-indigo-50/90 border border-indigo-200/80 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <Mic className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                    Comando de voz interpretado
                  </div>
                  <p className="text-xs text-slate-700 italic">"{voiceOriginText}"</p>
                  <p className="text-[11px] text-indigo-700 font-semibold">
                    Confira os dados antes de salvar.
                  </p>
                </div>
              )}

              {!editingTransaction && (
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setTxType('expense');
                      const firstExp = categories.find((c) => c.type === 'expense')?.id || '';
                      setTxCategoryId(firstExp);
                    }}
                    className={`py-2 rounded-lg transition-colors ${
                      txType === 'expense'
                        ? 'bg-white shadow-xs text-rose-600'
                        : 'text-slate-600'
                    }`}
                  >
                    Despesa
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxType('income');
                      const firstInc = categories.find((c) => c.type === 'income')?.id || '';
                      setTxCategoryId(firstInc);
                    }}
                    className={`py-2 rounded-lg transition-colors ${
                      txType === 'income'
                        ? 'bg-white shadow-xs text-emerald-600'
                        : 'text-slate-600'
                    }`}
                  >
                    Receita
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor (R$) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="0,00"
                  value={txAmountStr}
                  onChange={(e) => setTxAmountStr(e.target.value)}
                  className="w-full text-base font-bold px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Supermercado, Aluguel, Freelance..."
                  value={txDescription}
                  onChange={(e) => setTxDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Categoria *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setNewCatType(txType);
                        setShowNewCategoryModal(true);
                      }}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      + Nova
                    </button>
                  </div>
                  <select
                    value={txCategoryId}
                    onChange={(e) => setTxCategoryId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  >
                    {categories
                      .filter((c) => c.type === txType)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.isCustom ? '★' : ''}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data *
                  </label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={txPaymentMethod}
                  onChange={(e) =>
                    setTxPaymentMethod(e.target.value as FinancePaymentMethod)
                  }
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                >
                  <option value="pix">Pix</option>
                  <option value="money">Dinheiro em Espécie</option>
                  <option value="debit">Cartão de Débito</option>
                  {txType === 'expense' && <option value="credit">Cartão de Crédito</option>}
                  <option value="other">Outro</option>
                </select>
              </div>

              {txType === 'expense' && txPaymentMethod === 'credit' && (
                <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-indigo-900 mb-1">
                      Escolha o Cartão *
                    </label>
                    <select
                      value={txCardId}
                      onChange={(e) => setTxCardId(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-indigo-200 rounded-xl outline-none bg-white"
                    >
                      {cards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Fecha dia {c.closingDay})
                        </option>
                      ))}
                    </select>
                  </div>

                  {!editingTransaction && (
                    <div>
                      <label className="block text-xs font-semibold text-indigo-900 mb-1">
                        Parcelamento
                      </label>
                      <select
                        value={txInstallments}
                        onChange={(e) => setTxInstallments(Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-indigo-200 rounded-xl outline-none bg-white"
                      >
                        <option value={1}>À vista (1x)</option>
                        <option value={2}>2x</option>
                        <option value={3}>3x</option>
                        <option value={4}>4x</option>
                        <option value={5}>5x</option>
                        <option value={6}>6x</option>
                        <option value={10}>10x</option>
                        <option value={12}>12x</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransactionModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: NOVO CARTÃO */}
      {/* ============================================================ */}
      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Novo Cartão de Crédito</h3>
              <button
                onClick={() => setShowCardModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Cartão *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Nubank Roxinho, Inter Black..."
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Limite Total (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="R$ 5.000,00"
                  value={cardLimitStr}
                  onChange={(e) => setCardLimitStr(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dia do Fechamento *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    required
                    value={cardClosingDay}
                    onChange={(e) => setCardClosingDay(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dia do Vencimento *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    required
                    value={cardDueDay}
                    onChange={(e) => setCardDueDay(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Estilo Visual do Cartão
                </label>
                <div className="flex gap-2">
                  {[
                    { label: 'Índigo', bg: 'from-indigo-600 to-indigo-800' },
                    { label: 'Roxo', bg: 'from-purple-600 to-purple-800' },
                    { label: 'Esmeralda', bg: 'from-emerald-600 to-emerald-800' },
                    { label: 'Rosa', bg: 'from-rose-600 to-rose-800' },
                    { label: 'Grafite', bg: 'from-slate-700 to-slate-900' },
                  ].map((c) => (
                    <button
                      key={c.bg}
                      type="button"
                      onClick={() => setCardColor(c.bg)}
                      className={`h-7 flex-1 rounded-lg bg-gradient-to-r ${c.bg} border-2 transition-all ${
                        cardColor === c.bg
                          ? 'border-amber-400 scale-105 shadow-xs'
                          : 'border-transparent opacity-80'
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCardModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Salvar Cartão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DEFINIR LIMITE MENSAL */}
      {/* ============================================================ */}
      {showBudgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Limite Mensal ({formatMonthYear(currentMonthKey)})
              </h3>
              <button
                onClick={() => setShowBudgetModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Teto de Gastos (R$)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 3.500,00"
                  value={budgetLimitStr}
                  onChange={(e) => setBudgetLimitStr(e.target.value)}
                  className="w-full text-base font-bold px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  A alteração vale apenas para {formatMonthYear(currentMonthKey)}, preservando o
                  histórico dos outros meses.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Salvar Limite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: NOVA CATEGORIA PERSONALIZADA */}
      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* MODAL: GERENCIAR E CRIAR CATEGORIAS */}
      {/* ============================================================ */}
      {showNewCategoryModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Categorias Financeiras</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Categorias padrão já vêm ativas. Cadastre aqui apenas se desejar uma específica.
                </p>
              </div>
              <button
                onClick={() => setShowNewCategoryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulário para Cadastrar Nova Categoria Específica */}
            <form onSubmit={handleSaveCategory} className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
              <span className="text-xs font-bold text-slate-800 block">
                Cadastrar Categoria Específica
              </span>

              <div className="grid grid-cols-2 gap-2 bg-slate-200/60 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setNewCatType('expense')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    newCatType === 'expense'
                      ? 'bg-white shadow-xs text-rose-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => setNewCatType('income')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    newCatType === 'income'
                      ? 'bg-white shadow-xs text-emerald-600'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Receita
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder={
                    newCatType === 'expense'
                      ? 'Ex: Pet Shop, Manutenção Moto, Doações...'
                      : 'Ex: Aluguel de Imóvel, Dividendos FIIs...'
                  }
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs whitespace-nowrap transition-colors"
                >
                  + Adicionar
                </button>
              </div>
            </form>

            {/* Listagem de Categorias Existentes */}
            <div className="flex-1 min-h-0 flex flex-col space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  Categorias Ativas no Sistema ({categories.filter((c) => c.type === newCatType).length})
                </span>
                <span className="text-[11px] text-slate-400">
                  {newCatType === 'expense' ? 'Despesas' : 'Receitas'}
                </span>
              </div>

              <div className="flex-1 min-h-0 max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200/80 rounded-xl p-1 bg-white">
                {categories
                  .filter((c) => c.type === newCatType)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-2 px-3 hover:bg-slate-50 text-xs rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{c.name}</span>
                        {c.isCustom ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                            Personalizada
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                            Padrão
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(c)}
                        title={`Excluir categoria "${c.name}"`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Deseja restaurar todas as categorias padrão originais? Suas categorias personalizadas continuarão intactas.')) {
                    await ensureDefaultFinanceCategories(true);
                  }
                }}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                ✨ Restaurar categorias padrão
              </button>
              <button
                type="button"
                onClick={() => setShowNewCategoryModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: PREVIEW DE IMPORTAÇÃO CSV */}
      {/* ============================================================ */}
      {showCSVModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Revisar Importação de Extrato
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Foram identificados <strong>{csvPreviewRows.length}</strong> registros válidos.
                  Cada gasto possui sua própria categoria abaixo.
                </p>
              </div>
              <button
                onClick={() => setShowCSVModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Banner de Categorização Inteligente */}
            <div className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-indigo-900">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  <strong>
                    {csvPreviewRows.filter((r) => r.autoMatched).length} de {csvPreviewRows.length}
                  </strong>{' '}
                  lançamentos foram categorizados automaticamente pelo nome. Você pode alterar a
                  categoria de <strong>cada item individualmente</strong> na tabela.
                </span>
              </div>
              <button
                type="button"
                onClick={handleReapplyAutoCategorization}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold whitespace-nowrap self-start sm:self-auto"
              >
                Re-classificar tudo
              </button>
            </div>

            {/* Controles de Fallback Padrão */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Categoria padrão para itens não identificados
                </label>
                <div className="flex gap-1.5">
                  <select
                    value={csvDefaultCategory}
                    onChange={(e) => {
                      const nextDefault = e.target.value;
                      setCsvDefaultCategory(nextDefault);
                      // Atualiza apenas as linhas que ainda não tinham correspondência automática/manual
                      setCsvPreviewRows((prev) =>
                        prev.map((r) =>
                          !r.autoMatched ? { ...r, categoryId: nextDefault } : r
                        )
                      );
                    }}
                    className="flex-1 text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvPreviewRows((prev) =>
                        prev.map((r) => ({ ...r, categoryId: csvDefaultCategory }))
                      );
                    }}
                    title="Aplicar esta categoria em absolutamente todas as linhas"
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-600 whitespace-nowrap"
                  >
                    Aplicar a todos
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Tipo padrão do extrato
                </label>
                <select
                  value={csvDefaultType}
                  onChange={(e) => {
                    const nextType = e.target.value as FinanceTransactionType;
                    setCsvDefaultType(nextType);
                    setCsvPreviewRows((prev) =>
                      prev.map((r) => {
                        const inferred = inferCategoryFromDescription(
                          r.description,
                          nextType,
                          categories,
                          r.rawCategory,
                          csvDefaultCategory
                        );
                        return {
                          ...r,
                          type: nextType,
                          categoryId: inferred.categoryId,
                          autoMatched: inferred.matched,
                        };
                      })
                    );
                  }}
                  className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                >
                  <option value="expense">Despesas</option>
                  <option value="income">Receitas</option>
                </select>
              </div>
            </div>

            {/* Tabela Completa com Seletor de Categoria por Linha */}
            <div className="flex-1 min-h-0 max-h-80 overflow-y-auto border border-slate-200/80 rounded-xl text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Data</th>
                    <th className="p-2.5">Descrição</th>
                    <th className="p-2.5">Categoria do Gasto</th>
                    <th className="p-2.5">Tipo</th>
                    <th className="p-2.5 text-right">Valor</th>
                    <th className="p-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {csvPreviewRows.map((row, i) => {
                    const rowType = row.type || csvDefaultType;
                    const availableCats = categories.filter((c) => c.type === rowType);
                    const catList = availableCats.length > 0 ? availableCats : categories;

                    return (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="p-2.5 font-medium text-slate-600 whitespace-nowrap">
                          {formatDateBR(row.date)}
                        </td>
                        <td className="p-2.5 text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{row.description}</span>
                            {row.autoMatched && (
                              <span
                                title="Categoria identificada automaticamente pelo nome"
                                className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold shrink-0"
                              >
                                Auto
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <select
                            value={row.categoryId || csvDefaultCategory}
                            onChange={(e) => handleUpdateCSVRowCategory(i, e.target.value)}
                            className="w-full min-w-[140px] text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold outline-none focus:border-emerald-500 cursor-pointer"
                          >
                            {catList.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <select
                            value={rowType}
                            onChange={(e) =>
                              handleUpdateCSVRowType(i, e.target.value as FinanceTransactionType)
                            }
                            className={`text-[11px] font-bold px-2 py-1 rounded-lg border outline-none cursor-pointer ${
                              rowType === 'expense'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <option value="expense">Despesa</option>
                            <option value="income">Receita</option>
                          </select>
                        </td>
                        <td className="p-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                          {formatCentsToBRL(row.amountInCents)}
                        </td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveCSVRow(i)}
                            title="Ignorar / remover esta linha da importação"
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setNewCatType(csvDefaultType);
                  setShowNewCategoryModal(true);
                }}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
              >
                + Criar nova categoria
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCSVModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCSVImport}
                  disabled={csvPreviewRows.length === 0}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white flex items-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Importação ({csvPreviewRows.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: GRAVAÇÃO POR COMANDO DE VOZ */}
      {/* ============================================================ */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Comando por Voz
              </span>
              <button
                type="button"
                onClick={() => {
                  cancelListening();
                  setShowVoiceModal(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleToggleVoice}
              className={`w-full p-5 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer select-none ${
                isListening
                  ? 'bg-rose-50 border-2 border-rose-500 shadow-md shadow-rose-500/20 active:scale-98'
                  : 'bg-slate-50 hover:bg-slate-100/90 border-2 border-slate-200 active:scale-98'
              }`}
            >
              <div className="relative flex items-center justify-center">
                {isListening && (
                  <div className="absolute -inset-3 rounded-full bg-rose-500/20 animate-ping" />
                )}
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 scale-105'
                      : 'bg-white text-slate-700 shadow-sm border border-slate-200'
                  }`}
                >
                  <Mic className="w-8 h-8" />
                </div>
              </div>

              <div className="text-center space-y-1">
                <span
                  className={`text-sm font-bold block ${
                    isListening ? 'text-rose-600' : 'text-slate-800'
                  }`}
                >
                  {isListening ? 'Ouvindo... Fale agora!' : 'Toque aqui para falar'}
                </span>
                {liveTranscript && isListening ? (
                  <span className="text-xs font-semibold text-rose-900 bg-white/80 px-2.5 py-1 rounded-lg border border-rose-200 block">
                    "{liveTranscript}"
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 block">
                    {isListening
                      ? 'Fale a frase completa — processa automaticamente ao pausar ou tocar aqui'
                      : 'Diga o valor, onde gastou e forma de pagamento'}
                  </span>
                )}
              </div>
            </button>

            <div className="space-y-1">
              <textarea
                value={voiceInput}
                onChange={(e) => {
                  setVoiceInput(e.target.value);
                  setVoiceParsingError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleVoiceFinal(voiceInput || liveTranscript);
                  }
                }}
                placeholder='Ex: "Gastei 50 reais no mercado hoje" ou "Recebi 200 de freelance no Pix"'
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none font-medium text-slate-800"
              />
            </div>

            {(speechError || voiceParsingError) && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-tight">{voiceParsingError || speechError}</span>
              </div>
            )}

            {!voiceInput && (
              <div className="text-left bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Exemplos para testar:
                </p>
                <div className="space-y-1">
                  {[
                    'Gastei 50 reais no mercado hoje',
                    'Paguei 35 de Uber no Pix',
                    'Recebi 1200 de salário',
                    'Tênis 240 em 3x no cartão de crédito',
                  ].map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => {
                        setVoiceInput(ex);
                        setVoiceParsingError(null);
                      }}
                      className="block w-full text-left text-[11px] text-slate-600 hover:text-slate-900 hover:bg-white p-1 rounded transition-colors"
                    >
                      • "{ex}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  cancelListening();
                  setShowVoiceModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleVoiceFinal(voiceInput || liveTranscript)}
                disabled={!(voiceInput.trim() || liveTranscript.trim())}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                Processar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botão Flutuante de Voz (FAB) */}
      <button
        type="button"
        onClick={handleStartVoice}
        title={
          isSpeechSupported
            ? 'Registrar lançamento por comando de voz'
            : 'Reconhecimento de voz não suportado pelo navegador'
        }
        className="fixed bottom-20 md:bottom-8 right-5 md:right-8 z-40 flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 rounded-full bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 hover:from-violet-700 hover:to-indigo-800 text-white font-bold text-xs sm:text-sm shadow-xl shadow-indigo-600/35 hover:shadow-indigo-600/50 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 group cursor-pointer"
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors">
          <Mic className="w-4 h-4 text-white animate-pulse" />
        </span>
        <span className="tracking-wide">Registrar por Voz</span>
      </button>
    </div>
  );
}
