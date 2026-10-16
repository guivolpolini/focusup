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
  HelpCircle,
  Percent,
  Mic,
} from 'lucide-react';
import { db } from '../lib/db';
import {
  formatCentsToBRL,
  parseBRLToCents,
  getMonthKey,
  formatMonthYear,
  getAdjacentMonthKey,
  calculateMonthlySummary,
  calculateCardSummary,
  generateInstallmentTransactions,
  parseCSVTransactions,
  type ParsedCSVRow,
} from '../lib/financeEngine';
import { parseVoiceFinanceCommand } from '../lib/voiceFinanceParser';
import { useSpeechRecognition } from '../lib/useSpeechRecognition';
import type {
  FinanceTransaction,
  FinanceCard,
  FinanceCategory,
  FinancePaymentMethod,
  FinanceTransactionType,
} from '../types';

export function FinanceSection() {
  const [currentMonthKey, setCurrentMonthKey] = useState<string>(() => getMonthKey());
  const [activeSubTab, setActiveSubTab] = useState<'summary' | 'transactions' | 'cards'>('summary');

  // Filtros de Lançamentos
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modais
  const [showTransactionModal, setShowTransactionModal] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransaction | null>(null);
  const [showCardModal, setShowCardModal] = useState<boolean>(false);
  const [showBudgetModal, setShowBudgetModal] = useState<boolean>(false);
  const [showCSVModal, setShowCSVModal] = useState<boolean>(false);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState<boolean>(false);
  const [showVoiceModal, setShowVoiceModal] = useState<boolean>(false);
  const [voiceOriginText, setVoiceOriginText] = useState<string | null>(null);

  // Consultas Reativas do Dexie
  const transactions = useLiveQuery(() => db.financeTransactions.toArray()) || [];
  const cards = useLiveQuery(() => db.financeCards.filter((c) => !c.isArchived).toArray()) || [];
  const categories = useLiveQuery(() => db.financeCategories.toArray()) || [];
  const budget = useLiveQuery(() => db.financeBudgets.get(`budget_${currentMonthKey}`));

  // Resumo do Mês
  const summary = useMemo(() => {
    return calculateMonthlySummary(transactions, currentMonthKey, budget);
  }, [transactions, currentMonthKey, budget]);

  // Resumos dos Cartões
  const cardsSummary = useMemo(() => {
    return cards.map((card) => calculateCardSummary(card, transactions));
  }, [cards, transactions]);

  // Mapeamento de Categorias por ID
  const categoryMap = useMemo(() => {
    const map = new Map<string, FinanceCategory>();
    categories.forEach((cat) => map.set(cat.id, cat));
    return map;
  }, [categories]);

  // Lançamentos filtrados para a listagem
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        // Filtragem por mês:
        const txMonth = (tx.paymentMethod === 'credit' && tx.invoiceMonth) ? tx.invoiceMonth : tx.date.slice(0, 7);
        if (txMonth !== currentMonthKey) return false;

        // Tipo
        if (filterType !== 'all' && tx.type !== filterType) return false;

        // Categoria
        if (filterCategory !== 'all' && tx.categoryId !== filterCategory) return false;

        // Busca
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchDesc = tx.description.toLowerCase().includes(q);
          const catName = categoryMap.get(tx.categoryId)?.name.toLowerCase() || '';
          return matchDesc || catName.includes(q);
        }

        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [transactions, currentMonthKey, filterType, filterCategory, searchQuery, categoryMap]);

  // Form State para Transação
  const [txType, setTxType] = useState<FinanceTransactionType>('expense');
  const [txDescription, setTxDescription] = useState('');
  const [txAmountStr, setTxAmountStr] = useState('');
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txPaymentMethod, setTxPaymentMethod] = useState<FinancePaymentMethod>('pix');
  const [txCardId, setTxCardId] = useState('');
  const [txInstallments, setTxInstallments] = useState(1);

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

  const {
    isSupported: isSpeechSupported,
    isListening,
    transcript: liveTranscript,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition();

  // Sincroniza fala capturada em tempo real para o campo editável
  useEffect(() => {
    if (liveTranscript) {
      setVoiceInput(liveTranscript);
      setVoiceParsingError(null);
    }
  }, [liveTranscript]);

  const handleVoiceFinal = (rawText: string) => {
    const text = rawText.trim();
    if (!text) {
      setVoiceParsingError('Nenhum texto detectado. Fale ou digite o comando antes de continuar.');
      return;
    }

    const parsed = parseVoiceFinanceCommand(text, categories, cards);
    if (parsed.amountInCents === 0) {
      setVoiceParsingError(`Não identificamos o valor em reais em: "${text}". Tente informar o valor (ex: "Gastei 50 reais no mercado").`);
      return;
    }

    stopListening();
    setShowVoiceModal(false);
    setVoiceParsingError(null);

    setEditingTransaction(null);
    setTxType(parsed.type);
    setTxAmountStr((parsed.amountInCents / 100).toFixed(2).replace('.', ','));
    setTxDescription(parsed.description);
    setTxCategoryId(parsed.categoryId);
    setTxDate(parsed.date);
    setTxPaymentMethod(parsed.paymentMethod);
    setTxCardId(parsed.cardId || (cards[0]?.id || ''));
    setTxInstallments(parsed.totalInstallments);
    setVoiceOriginText(text);
    setShowTransactionModal(true);
  };

  const handleStartVoice = () => {
    setVoiceInput('');
    setVoiceParsingError(null);
    resetTranscript();
    setShowVoiceModal(true);
    if (isSpeechSupported) {
      startListening();
    }
  };

  // Abertura de Modal de Transação (Nova ou Edição)
  const openNewTransactionModal = (type: FinanceTransactionType = 'expense') => {
    setEditingTransaction(null);
    setVoiceOriginText(null);
    setTxType(type);
    setTxDescription('');
    setTxAmountStr('');
    setTxDate(new Date().toISOString().slice(0, 10));
    setTxPaymentMethod(type === 'income' ? 'pix' : 'pix');
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
    setTxCardId(tx.cardId || (cards[0]?.id || ''));
    setTxInstallments(1);
    setShowTransactionModal(true);
  };

  // Salvar Transação (À vista ou Parcelada)
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountInCents = parseBRLToCents(txAmountStr);
    if (!txDescription.trim() || amountInCents <= 0 || !txCategoryId) return;

    const now = Date.now();

    // Se estiver editando
    if (editingTransaction) {
      await db.financeTransactions.update(editingTransaction.id, {
        type: txType,
        description: txDescription.trim(),
        amountInCents,
        categoryId: txCategoryId,
        date: txDate,
        paymentMethod: txPaymentMethod,
        cardId: txPaymentMethod === 'credit' ? txCardId : undefined,
        updatedAt: now,
      });
      setShowTransactionModal(false);
      return;
    }

    // Se for compra parcelada no cartão
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

    // Lançamento normal à vista
    const selectedCard = txPaymentMethod === 'credit' ? cards.find((c) => c.id === txCardId) : null;
    const invoiceMonth = selectedCard ? calculateCardSummary(selectedCard, [], txDate).currentInvoiceMonth : undefined;

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

  // Salvar Nova Categoria Personalizada
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const now = Date.now();
    await db.financeCategories.add({
      id: `cat_custom_${now}_${Math.random().toString(36).substring(2, 7)}`,
      name: newCatName.trim(),
      type: newCatType,
      isCustom: true,
    });

    setNewCatName('');
    setShowNewCategoryModal(false);
  };

  // Processar Upload de CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const { rows } = parseCSVTransactions(text);
        setCsvPreviewRows(rows);
        const defaultCat = categories.find((c) => c.type === 'expense')?.id || '';
        setCsvDefaultCategory(defaultCat);
        setShowCSVModal(true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Confirmar Importação de CSV
  const handleConfirmCSVImport = async () => {
    if (csvPreviewRows.length === 0) return;

    const now = Date.now();
    const newTransactions: FinanceTransaction[] = csvPreviewRows.map((row, idx) => ({
      id: `tx_import_${now}_${idx}`,
      type: row.type || csvDefaultType,
      amountInCents: row.amountInCents,
      description: row.description,
      categoryId: csvDefaultCategory,
      date: row.date,
      paymentMethod: 'other',
      createdAt: now,
      updatedAt: now,
    }));

    await db.financeTransactions.bulkAdd(newTransactions);
    setShowCSVModal(false);
    setCsvPreviewRows([]);
    alert(`${newTransactions.length} lançamentos importados com sucesso!`);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header com Navegação de Mês e Ações Rápidas */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Financeiro</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800">
                Offline & Seguro
              </span>
            </div>
            <p className="text-xs text-slate-500">Controle prático de receitas, despesas e faturas</p>
          </div>
        </div>

        {/* Seletor de Mês */}
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

        {/* Botões de Ação */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
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
            title={isSpeechSupported ? 'Registrar por comando de voz' : 'Reconhecimento de voz não suportado pelo navegador'}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold shadow-xs transition-all active:scale-95"
          >
            <Mic className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">Voz</span>
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
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navegação entre as 3 Sub-abas */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveSubTab('summary')}
          className={`pb-3 px-5 text-sm font-semibold transition-colors relative ${
            activeSubTab === 'summary'
              ? 'text-emerald-600 border-b-2 border-emerald-600'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Resumo do Mês
        </button>
        <button
          onClick={() => setActiveSubTab('transactions')}
          className={`pb-3 px-5 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
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
          className={`pb-3 px-5 text-sm font-semibold transition-colors relative flex items-center gap-2 ${
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
      {/* 1. ABA RESUMO DO MÊS */}
      {/* ============================================================ */}
      {activeSubTab === 'summary' && (
        <div className="space-y-6">
          {/* Grid de KPIs Financeiros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Recebido */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Recebido
                </span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <ArrowDownRight className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-emerald-600">
                {formatCentsToBRL(summary.totalIncomeInCents)}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">Receitas confirmadas</span>
            </div>

            {/* Total Gasto */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Gasto
                </span>
                <span className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
              <div className="text-2xl font-bold text-rose-600">
                {formatCentsToBRL(summary.totalExpenseInCents)}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">À vista + Faturas do mês</span>
            </div>

            {/* Saldo Estimado */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Saldo Estimado
                </span>
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Wallet className="w-4 h-4" />
                </span>
              </div>
              <div
                className={`text-2xl font-bold ${
                  summary.estimatedBalanceInCents >= 0 ? 'text-slate-800' : 'text-rose-600'
                }`}
              >
                {formatCentsToBRL(summary.estimatedBalanceInCents)}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">Receitas - Despesas</span>
            </div>

            {/* Limite Mensal */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Limite Mensal
                </span>
                <button
                  onClick={() => {
                    setBudgetLimitStr(
                      budget?.limitInCents ? (budget.limitInCents / 100).toFixed(2).replace('.', ',') : ''
                    );
                    setShowBudgetModal(true);
                  }}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold underline"
                >
                  {budget?.limitInCents ? 'Editar' : 'Definir'}
                </button>
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {budget?.limitInCents ? formatCentsToBRL(budget.limitInCents) : 'Não definido'}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                {budget?.limitInCents
                  ? summary.isOverLimit
                    ? 'Estourou o orçamento planejado'
                    : `Resta: ${formatCentsToBRL(summary.remainingInCents)}`
                  : 'Clique para definir um teto de gastos'}
              </span>
            </div>
          </div>

          {/* Barra de Progresso do Limite Mensal (se configurado) */}
          {summary.limitInCents > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <Percent className="w-4 h-4 text-emerald-600" />
                  Progresso do Limite Mensal
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">
                    {summary.percentageUsed.toFixed(1)}% utilizado
                  </span>
                  {summary.isOverLimit && (
                    <span className="flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3.5 h-3.5" /> Limite Ultrapassado
                    </span>
                  )}
                </div>
              </div>

              {/* Barra */}
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    summary.isOverLimit
                      ? 'bg-rose-500'
                      : summary.percentageUsed > 85
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, summary.percentageUsed)}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] text-slate-400">
                <span>R$ 0,00</span>
                <span>Meta: {formatCentsToBRL(summary.limitInCents)}</span>
              </div>
            </div>
          )}

          {/* Gastos por Categoria e Cartões do Mês */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Breakdown de Categorias */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Maiores Gastos por Categoria</h3>
                <span className="text-xs text-slate-400">{summary.categoryExpenses.length} categorias</span>
              </div>

              {summary.categoryExpenses.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Nenhum gasto registrado neste mês ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {summary.categoryExpenses.slice(0, 5).map((item) => {
                    const cat = categoryMap.get(item.categoryId);
                    const pct = summary.totalExpenseInCents > 0
                      ? ((item.totalCents / summary.totalExpenseInCents) * 100).toFixed(0)
                      : 0;

                    return (
                      <div key={item.categoryId} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-slate-700">{cat?.name || 'Outros'}</span>
                          <span className="font-semibold text-slate-800">
                            {formatCentsToBRL(item.totalCents)}{' '}
                            <span className="text-[10px] text-slate-400 font-normal">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Faturas de Cartão do Mês */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Faturas de Cartão em Aberto</h3>
                <button
                  onClick={() => setActiveSubTab('cards')}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                >
                  Ver todos
                </button>
              </div>

              {cards.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Nenhum cartão cadastrado. Clique na aba Cartões para adicionar.
                </div>
              ) : (
                <div className="space-y-3">
                  {cardsSummary.map(({ card, currentInvoiceTotalInCents, currentInvoiceMonth }) => (
                    <div
                      key={card.id}
                      className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                          <CreditCard className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800">{card.name}</div>
                          <div className="text-[11px] text-slate-400">
                            Fatura {formatMonthYear(currentInvoiceMonth)} • Vence dia {card.dueDay}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900">
                          {formatCentsToBRL(currentInvoiceTotalInCents)}
                        </div>
                        <span className="text-[10px] text-slate-400">Previsão</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. ABA LANÇAMENTOS */}
      {/* ============================================================ */}
      {activeSubTab === 'transactions' && (
        <div className="space-y-4">
          {/* Barra de Filtros e Busca */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Tipo */}
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
                    filterType === 'income' ? 'bg-white shadow-xs text-emerald-600' : 'text-slate-600'
                  }`}
                >
                  Receitas
                </button>
              </div>

              {/* Categoria */}
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

            {/* Campo de Busca */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Buscar lançamento..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-56 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 outline-none focus:border-emerald-500"
              />
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
                <p className="text-sm font-medium">Nenhum lançamento encontrado para os filtros atuais.</p>
                <p className="text-xs text-slate-400">Clique em "+ Nova Despesa" ou "+ Nova Receita" para registrar.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredTransactions.map((tx) => {
                  const cat = categoryMap.get(tx.categoryId);
                  const isExpense = tx.type === 'expense';
                  const isCredit = tx.paymentMethod === 'credit';
                  const card = isCredit && tx.cardId ? cards.find((c) => c.id === tx.cardId) : null;

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
                          <div className="text-xs sm:text-sm font-bold text-slate-800">
                            {tx.description}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span className="font-medium text-slate-600">{cat?.name || 'Sem categoria'}</span>
                            <span>•</span>
                            <span>{tx.date.split('-').reverse().join('/')}</span>
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
                            <HelpCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTransaction(tx.id, tx.installmentPlanId)}
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
      {/* 3. ABA CARTÕES & FATURAS */}
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
              <p className="text-xs text-slate-400">Cadastre seus cartões para simular compras parceladas e vencimentos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {cardsSummary.map(({ card, currentInvoiceTotalInCents, nextInvoiceTotalInCents, futureInstallmentsTotalInCents, estimatedAvailableLimitInCents, currentInvoiceMonth }) => (
                <div
                  key={card.id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col justify-between"
                >
                  {/* Cartão Visual no topo */}
                  <div className={`p-5 bg-gradient-to-r ${card.color || 'from-indigo-600 to-indigo-800'} text-white`}>
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

                  {/* Informações de Fatura */}
                  <div className="p-5 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Fatura Atual ({formatMonthYear(currentInvoiceMonth)}):</span>
                      <span className="font-bold text-slate-900 text-sm">
                        {formatCentsToBRL(currentInvoiceTotalInCents)}
                      </span>
                    </div>

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
              ))}
            </div>
          )}
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
                {editingTransaction ? 'Editar Lançamento' : `Nova ${txType === 'expense' ? 'Despesa' : 'Receita'}`}
              </h3>
              <button
                onClick={() => setShowTransactionModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              {/* Alerta de Lançamento por Comando de Voz */}
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

              {/* Seletor Tipo */}
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
                      txType === 'expense' ? 'bg-white shadow-xs text-rose-600' : 'text-slate-600'
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
                      txType === 'income' ? 'bg-white shadow-xs text-emerald-600' : 'text-slate-600'
                    }`}
                  >
                    Receita
                  </button>
                </div>
              )}

              {/* Valor */}
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

              {/* Descrição */}
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

              {/* Categoria e Data */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Categoria *
                  </label>
                  <select
                    value={txCategoryId}
                    onChange={(e) => setTxCategoryId(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                  >
                    {categories
                      .filter((c) => c.type === txType)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
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

              {/* Forma de Pagamento */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  value={txPaymentMethod}
                  onChange={(e) => setTxPaymentMethod(e.target.value as FinancePaymentMethod)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                >
                  <option value="pix">Pix</option>
                  <option value="money">Dinheiro em Espécie</option>
                  <option value="debit">Cartão de Débito</option>
                  {txType === 'expense' && <option value="credit">Cartão de Crédito</option>}
                  <option value="other">Outro</option>
                </select>
              </div>

              {/* Se for Cartão de Crédito */}
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

              {/* Botões */}
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
              <button onClick={() => setShowCardModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Cartão *</label>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Limite Total (Opcional)</label>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dia do Fechamento *</label>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dia do Vencimento *</label>
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Estilo Visual do Cartão</label>
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
                        cardColor === c.bg ? 'border-amber-400 scale-105 shadow-xs' : 'border-transparent opacity-80'
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
              <h3 className="text-base font-bold text-slate-900">Limite Mensal ({formatMonthYear(currentMonthKey)})</h3>
              <button onClick={() => setShowBudgetModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Teto de Gastos (R$)</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 3.500,00"
                  value={budgetLimitStr}
                  onChange={(e) => setBudgetLimitStr(e.target.value)}
                  className="w-full text-base font-bold px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
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
      {showNewCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Nova Categoria</h3>
              <button onClick={() => setShowNewCategoryModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setNewCatType('expense')}
                    className={`py-1.5 rounded-lg ${
                      newCatType === 'expense' ? 'bg-white shadow-xs text-rose-600' : 'text-slate-600'
                    }`}
                  >
                    Despesa
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatType('income')}
                    className={`py-1.5 rounded-lg ${
                      newCatType === 'income' ? 'bg-white shadow-xs text-emerald-600' : 'text-slate-600'
                    }`}
                  >
                    Receita
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da Categoria *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Cursos Online, Pet Shop..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCategoryModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: PREVIEW DE IMPORTAÇÃO CSV */}
      {/* ============================================================ */}
      {showCSVModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Revisar Importação de Extrato</h3>
              <button onClick={() => setShowCSVModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Foram identificados <strong>{csvPreviewRows.length}</strong> registros válidos no arquivo CSV.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria Padrão</label>
                <select
                  value={csvDefaultCategory}
                  onChange={(e) => setCsvDefaultCategory(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tratar como</label>
                <select
                  value={csvDefaultType}
                  onChange={(e) => setCsvDefaultType(e.target.value as FinanceTransactionType)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl"
                >
                  <option value="expense">Despesas</option>
                  <option value="income">Receitas</option>
                </select>
              </div>
            </div>

            {/* Tabela de Preview */}
            <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                  <tr>
                    <th className="p-2.5">Data</th>
                    <th className="p-2.5">Descrição</th>
                    <th className="p-2.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {csvPreviewRows.slice(0, 15).map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-medium text-slate-600">{row.date}</td>
                      <td className="p-2.5 text-slate-800">{row.description}</td>
                      <td className="p-2.5 text-right font-bold text-slate-900">
                        {formatCentsToBRL(row.amountInCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvPreviewRows.length > 15 && (
                <div className="p-2 text-center text-[11px] text-slate-400 bg-slate-50/50">
                  + {csvPreviewRows.length - 15} outros lançamentos
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
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
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Importação
              </button>
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
                  stopListening();
                  setShowVoiceModal(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Visual Microfone Animado */}
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              {isListening && (
                <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
              )}
              <button
                type="button"
                onClick={() => {
                  if (isListening) {
                    stopListening();
                  } else if (isSpeechSupported) {
                    resetTranscript();
                    startListening();
                  }
                }}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isListening
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 scale-105'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title={isListening ? 'Clique para pausar microfone' : 'Clique para falar'}
              >
                <Mic className="w-8 h-8" />
              </button>
            </div>

            {/* Status e Campo de Texto Interativo */}
            <div className="space-y-2 text-left">
              <div className="text-center">
                <h4 className="text-sm font-bold text-slate-800">
                  {isListening
                    ? 'Ouvindo... Fale agora'
                    : voiceInput
                    ? 'Texto capturado'
                    : isSpeechSupported
                    ? 'Toque no microfone e fale'
                    : 'Digite o comando financeiro'}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {isListening
                    ? 'Diga o valor, onde gastou e forma de pagamento'
                    : 'Você pode falar ou ajustar o texto diretamente'}
                </p>
              </div>

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
                      handleVoiceFinal(voiceInput);
                    }
                  }}
                  placeholder='Ex: "Gastei 50 reais no mercado hoje" ou "Recebi 200 de freelance no Pix"'
                  rows={3}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none font-medium text-slate-800"
                />
              </div>
            </div>

            {/* Alerta de Erro de Reconhecimento ou Validação */}
            {(speechError || voiceParsingError) && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-tight">{voiceParsingError || speechError}</span>
              </div>
            )}

            {/* Exemplos Rápidos */}
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

            {/* Botões de Ação */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  stopListening();
                  setShowVoiceModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleVoiceFinal(voiceInput)}
                disabled={!voiceInput.trim()}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                Processar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
