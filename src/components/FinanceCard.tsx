import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  AlertCircle,
  ChevronRight,
  Receipt,
} from 'lucide-react';
import { db } from '../lib/db';
import {
  formatCentsToBRL,
  getMonthKey,
  formatMonthYear,
  formatDateBR,
  calculateMonthlySummary,
  calculateCardSummary,
  getRecurringOccurrencesForMonth,
  getUpcomingCommitments,
} from '../lib/financeEngine';

interface FinanceCardProps {
  onOpenFinancePage: () => void;
}

export function FinanceCard({ onOpenFinancePage }: FinanceCardProps) {
  const currentMonthKey = useMemo(() => getMonthKey(), []);
  const monthLabel = useMemo(() => formatMonthYear(currentMonthKey), [currentMonthKey]);

  // Consultas Reativas do Banco Dexie
  const transactions = useLiveQuery(() => db.financeTransactions.toArray()) || [];
  const cards = useLiveQuery(() => db.financeCards.filter((c) => !c.isArchived).toArray()) || [];
  const categories = useLiveQuery(() => db.financeCategories.toArray()) || [];
  const budget = useLiveQuery(() => db.financeBudgets.get(`budget_${currentMonthKey}`));
  const recurring = useLiveQuery(() => db.financeRecurring.toArray()) || [];

  // Mapa de categorias para nome rápido
  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const cat of categories) {
      map.set(cat.id, { name: cat.name });
    }
    return map;
  }, [categories]);

  // Cálculos do resumo mensal
  const summary = useMemo(() => {
    return calculateMonthlySummary(transactions, currentMonthKey, budget);
  }, [transactions, currentMonthKey, budget]);

  // Faturas de cartões do mês
  const cardsSummary = useMemo(() => {
    return cards.map((c) => calculateCardSummary(c, transactions, currentMonthKey));
  }, [cards, transactions, currentMonthKey]);

  const totalCardsInvoiceInCents = useMemo(() => {
    return cardsSummary.reduce((sum, cs) => sum + cs.currentInvoiceTotalInCents, 0);
  }, [cardsSummary]);

  // Gastos fixos e pendências do mês
  const recurringSummary = useMemo(() => {
    return getRecurringOccurrencesForMonth(recurring, transactions, currentMonthKey);
  }, [recurring, transactions, currentMonthKey]);

  const upcomingCommitments = useMemo(() => {
    return getUpcomingCommitments(recurringSummary, cardsSummary, currentMonthKey);
  }, [recurringSummary, cardsSummary, currentMonthKey]);

  const pendingCommitments = useMemo(() => {
    return upcomingCommitments.filter((c) => c.status === 'pending' || c.status === 'overdue');
  }, [upcomingCommitments]);

  // Transações recentes deste mês (até 3)
  const recentTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        if (tx.isInvoicePayment) return false;
        const txMonth = (tx.paymentMethod === 'credit' && tx.invoiceMonth) ? tx.invoiceMonth : tx.date.slice(0, 7);
        return txMonth === currentMonthKey;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .slice(0, 3);
  }, [transactions, currentMonthKey]);

  const isBalancePositive = summary.estimatedBalanceInCents >= 0;

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between">
      {/* Topo do Card */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Controle Financeiro</h3>
              <span className="text-[10px] text-slate-400 font-medium capitalize">{monthLabel}</span>
            </div>
          </div>

          <button
            onClick={onOpenFinancePage}
            className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-xl hover:bg-emerald-50 transition flex items-center gap-0.5 text-xs font-bold"
            title="Abrir painel financeiro"
          >
            <span className="text-[11px] text-slate-500 hover:text-emerald-700">Ver tudo</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Saldo Estimado do Mês */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Saldo do Mês
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                isBalancePositive
                  ? 'bg-emerald-100/70 text-emerald-800'
                  : 'bg-rose-100/70 text-rose-800'
              }`}
            >
              {isBalancePositive ? 'Positivo' : 'Atenção'}
            </span>
          </div>

          <div
            className={`text-2xl font-black tracking-tight ${
              isBalancePositive ? 'text-slate-900' : 'text-rose-600'
            }`}
          >
            {isBalancePositive ? '' : '- '}
            {formatCentsToBRL(Math.abs(summary.estimatedBalanceInCents))}
          </div>

          {/* Entradas e Saídas em Chips Compactos */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/50">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-emerald-100/80 text-emerald-700 shrink-0">
                <ArrowUpRight className="w-3 h-3" />
              </span>
              <div className="truncate">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Receitas</div>
                <div className="text-xs font-black text-emerald-700 truncate">
                  {formatCentsToBRL(summary.totalIncomeInCents)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="p-1 rounded-lg bg-rose-100/80 text-rose-700 shrink-0">
                <ArrowDownRight className="w-3 h-3" />
              </span>
              <div className="truncate">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Despesas</div>
                <div className="text-xs font-black text-slate-800 truncate">
                  {formatCentsToBRL(summary.totalExpenseInCents)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Teto de Gastos (se configurado) */}
        {summary.limitInCents > 0 ? (
          <div className="space-y-1.5">
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  summary.isOverLimit
                    ? 'bg-rose-500'
                    : summary.percentageUsed > 85
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, summary.percentageUsed)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
              <span>{Math.round(summary.percentageUsed)}% do teto gasto</span>
              <span className={summary.isOverLimit ? 'text-rose-600 font-black' : 'text-slate-600'}>
                {summary.isOverLimit
                  ? `Estourou ${formatCentsToBRL(Math.abs(summary.remainingInCents))}`
                  : `${formatCentsToBRL(summary.remainingInCents)} livre`}
              </span>
            </div>
          </div>
        ) : (
          /* Chips de Cartões e Contas Pendentes quando não há teto configurado */
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {totalCardsInvoiceInCents > 0 && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50/70 border border-indigo-100 text-indigo-700 font-semibold text-[11px]">
                <CreditCard className="w-3 h-3 text-indigo-500 shrink-0" />
                <span>Faturas: <strong>{formatCentsToBRL(totalCardsInvoiceInCents)}</strong></span>
              </div>
            )}
            {pendingCommitments.length > 0 && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50/70 border border-amber-100 text-amber-800 font-semibold text-[11px]">
                <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                <span>{pendingCommitments.length} conta(s) a vencer</span>
              </div>
            )}
          </div>
        )}

        {/* Últimas Transações do Mês */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Últimos Lançamentos</span>
            <span className="text-[10px] font-semibold text-slate-400">
              {transactions.length > 0 ? `${transactions.length} no total` : '0 lançamentos'}
            </span>
          </div>

          {recentTransactions.length > 0 ? (
            <div className="space-y-1.5">
              {recentTransactions.map((tx) => {
                const cat = categoryMap.get(tx.categoryId);
                const isIncome = tx.type === 'income';

                return (
                  <div
                    key={tx.id}
                    className="p-2 rounded-xl bg-slate-50/60 border border-slate-100 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isIncome ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                      />
                      <div className="truncate">
                        <div className="font-bold text-slate-800 text-[11px] truncate">
                          {tx.description}
                        </div>
                        <div className="text-[9px] text-slate-400 truncate">
                          {formatDateBR(tx.date)} • {cat?.name || 'Geral'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`font-black text-[11px] shrink-0 ${
                        isIncome ? 'text-emerald-600' : 'text-slate-800'
                      }`}
                    >
                      {isIncome ? '+ ' : '- '}
                      {formatCentsToBRL(tx.amountInCents)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-4 text-center text-slate-400 rounded-xl bg-slate-50/50 border border-dashed border-slate-200">
              <Receipt className="w-5 h-5 mx-auto text-slate-300 mb-1" />
              <p className="text-[11px] font-semibold text-slate-500">Sem lançamentos em {monthLabel}</p>
              <p className="text-[10px] text-slate-400">Suas despesas e receitas aparecerão aqui.</p>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé com Atalho Direto para Financeiro */}
      <div className="pt-2">
        <button
          onClick={onOpenFinancePage}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition active:scale-95 border border-emerald-100"
        >
          <Wallet className="w-3.5 h-3.5 text-emerald-600" />
          <span>Acessar Módulo Financeiro</span>
          <ChevronRight className="w-3.5 h-3.5 ml-auto text-emerald-500" />
        </button>
      </div>
    </div>
  );
}
export default FinanceCard;
