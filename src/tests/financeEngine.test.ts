import { describe, it, expect } from 'vitest';
import {
  formatCentsToBRL,
  parseBRLToCents,
  splitInstallments,
  calculateInvoiceMonth,
  generateInstallmentTransactions,
  calculateMonthlySummary,
  parseCSVTransactions,
  getRecurringOccurrencesForMonth,
  buildRecurringPaymentTransaction,
  calculateCardSummary,
  getUpcomingCommitments,
  calculateFixedVsVariable,
  calculatePreviousMonthComparison,
  calculateMonthlyEvolution,
  DEFAULT_FINANCE_CATEGORIES,
  inferCategoryFromDescription,
} from '../lib/financeEngine';
import type { FinanceTransaction, FinanceRecurringExpense, FinanceCard } from '../types';

describe('financeEngine', () => {
  describe('Formatação e conversão monetária BRL', () => {
    it('formata centavos para BRL corretamente', () => {
      expect(formatCentsToBRL(4990)).toContain('49,90');
      expect(formatCentsToBRL(100000)).toContain('1.000,00');
      expect(formatCentsToBRL(0)).toContain('0,00');
      expect(formatCentsToBRL(-2550)).toContain('25,50');
    });

    it('converte strings em centavos inteiros', () => {
      expect(parseBRLToCents('49,90')).toBe(4990);
      expect(parseBRLToCents('R$ 1.250,50')).toBe(125050);
      expect(parseBRLToCents('-50,00')).toBe(-5000);
      expect(parseBRLToCents('100')).toBe(10000);
      expect(parseBRLToCents(25.5)).toBe(2550);
    });
  });

  describe('Divisão exata de parcelas (centavos inteiros)', () => {
    it('divide centavos sem perda ou dízima periódica', () => {
      // R$ 100,00 em 3x = R$ 33,34 + R$ 33,33 + R$ 33,33 = R$ 100,00
      const installments = splitInstallments(10000, 3);
      expect(installments).toEqual([3334, 3333, 3333]);
      expect(installments.reduce((a, b) => a + b, 0)).toBe(10000);
    });

    it('divide parcelas exatas perfeitamente', () => {
      const installments = splitInstallments(12000, 4);
      expect(installments).toEqual([3000, 3000, 3000, 3000]);
      expect(installments.reduce((a, b) => a + b, 0)).toBe(12000);
    });
  });

  describe('Ciclo de faturamento de cartão de crédito', () => {
    it('atribui compra antes ou no dia do fechamento à fatura do mesmo mês', () => {
      // Fechamento dia 20. Compra dia 15 -> fatura do mês atual (10)
      expect(calculateInvoiceMonth('2026-10-15', 20)).toBe('2026-10');
      // Compra no dia do fechamento (20) -> fatura do mês atual (10)
      expect(calculateInvoiceMonth('2026-10-20', 20)).toBe('2026-10');
    });

    it('atribui compra após dia de fechamento ao próximo mês de fatura', () => {
      // Fechamento dia 20. Compra dia 21 -> fatura de novembro (11)
      expect(calculateInvoiceMonth('2026-10-21', 20)).toBe('2026-11');
      // Virada de ano: compra dia 25/12 com fechamento dia 20 -> fatura 2027-01
      expect(calculateInvoiceMonth('2026-12-25', 20)).toBe('2027-01');
    });

    it('gera parcelas com vencimentos e faturas corretas', () => {
      const transactions = generateInstallmentTransactions({
        planId: 'plan-1',
        description: 'Notebook',
        categoryId: 'cat-compras',
        cardId: 'card-1',
        totalCents: 30000, // R$ 300,00
        totalInstallments: 3,
        firstDate: '2026-10-10',
        closingDay: 20,
      });

      expect(transactions).toHaveLength(3);
      expect(transactions[0].invoiceMonth).toBe('2026-10');
      expect(transactions[1].invoiceMonth).toBe('2026-11');
      expect(transactions[2].invoiceMonth).toBe('2026-12');
      expect(transactions.reduce((acc, t) => acc + t.amountInCents, 0)).toBe(30000);
    });
  });

  describe('Cálculo de resumo mensal e não-duplicação', () => {
    it('calcula receitas, despesas, saldo e limite corretamente', () => {
      const mockTxs: FinanceTransaction[] = [
        {
          id: 'tx-1',
          type: 'income',
          amountInCents: 500000, // R$ 5.000,00
          description: 'Salário',
          categoryId: 'cat-salario',
          date: '2026-10-05',
          paymentMethod: 'pix',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'tx-2',
          type: 'expense',
          amountInCents: 15000, // R$ 150,00
          description: 'Supermercado',
          categoryId: 'cat-alimentacao',
          date: '2026-10-08',
          paymentMethod: 'debit',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'tx-3',
          type: 'expense',
          amountInCents: 10000, // R$ 100,00
          description: 'Restaurante',
          categoryId: 'cat-alimentacao',
          date: '2026-10-12',
          paymentMethod: 'credit',
          cardId: 'card-1',
          invoiceMonth: '2026-10',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          // Pagamento de fatura não pode ser somado como nova despesa
          id: 'tx-4',
          type: 'expense',
          amountInCents: 10000,
          description: 'Pagamento Fatura Cartão',
          categoryId: 'cat-outros-despesa',
          date: '2026-10-25',
          paymentMethod: 'pix',
          isInvoicePayment: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const summary = calculateMonthlySummary(mockTxs, '2026-10', {
        id: 'b-1',
        monthKey: '2026-10',
        limitInCents: 100000, // R$ 1.000,00
        updatedAt: Date.now(),
      });

      expect(summary.totalIncomeInCents).toBe(500000);
      expect(summary.totalExpenseInCents).toBe(25000); // R$ 150 + R$ 100 (exclui os R$ 100 de pagamento de fatura!)
      expect(summary.estimatedBalanceInCents).toBe(475000);
      expect(summary.remainingInCents).toBe(75000);
      expect(summary.percentageUsed).toBe(25);
      expect(summary.isOverLimit).toBe(false);
    });
  });

  describe('Leitura de extrato CSV', () => {
    it('processa linhas válidas de CSV delimitado por vírgula ou ponto-e-vírgula', () => {
      const csv = `Data;Descricao;Valor
10/10/2026;Restaurante;-45,50
12/10/2026;Pix Recebido;200,00
`;
      const result = parseCSVTransactions(csv);
      expect(result.totalParsed).toBe(2);
      expect(result.rows[0].type).toBe('expense');
      expect(result.rows[0].amountInCents).toBe(4550);
      expect(result.rows[0].date).toBe('2026-10-10');
      expect(result.rows[1].type).toBe('income');
      expect(result.rows[1].amountInCents).toBe(20000);
    });
  });

  describe('Gastos Fixos e Recorrências (Zero Duplicidade)', () => {
    const mockRecurrings: FinanceRecurringExpense[] = [
      {
        id: 'rec_aluguel',
        name: 'Aluguel',
        amountInCents: 180000, // R$ 1.800,00
        categoryId: 'cat_moradia',
        firstDueDate: '2026-09-10',
        frequency: 'monthly',
        paymentMethod: 'pix',
        status: 'active',
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'rec_internet',
        name: 'Internet Fibra',
        amountInCents: 12000, // R$ 120,00
        categoryId: 'cat_assinaturas',
        firstDueDate: '2026-10-20',
        frequency: 'monthly',
        paymentMethod: 'debit',
        status: 'active',
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'rec_pausado',
        name: 'Streaming Pausado',
        amountInCents: 3990,
        categoryId: 'cat_assinaturas',
        firstDueDate: '2026-08-05',
        frequency: 'monthly',
        paymentMethod: 'credit',
        status: 'paused',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    it('gera ocorrências determinísticas e identifica contas atrasadas, pendentes e pausadas', () => {
      // Referência: hoje é 2026-10-15 -> Aluguel (10/10) está atrasado, Internet (20/10) pendente, Streaming pausado
      const summary = getRecurringOccurrencesForMonth(
        mockRecurrings,
        [],
        '2026-10',
        '2026-10-15'
      );

      expect(summary.occurrences).toHaveLength(3);
      const aluguel = summary.occurrences.find((o) => o.recurringId === 'rec_aluguel')!;
      const internet = summary.occurrences.find((o) => o.recurringId === 'rec_internet')!;
      const pausado = summary.occurrences.find((o) => o.recurringId === 'rec_pausado')!;

      expect(aluguel.status).toBe('overdue');
      expect(internet.status).toBe('pending');
      expect(pausado.status).toBe('paused');

      // Pausados não entram no total pendente/previsto ativo
      expect(summary.totalExpectedInCents).toBe(192000); // 180000 + 12000
      expect(summary.totalPendingInCents).toBe(192000);
      expect(summary.totalPaidInCents).toBe(0);
      expect(summary.overdueCount).toBe(1);
      expect(summary.pendingCount).toBe(2);
    });

    it('marca ocorrência como paga de forma idempotente sem duplicar transação', () => {
      const summaryBefore = getRecurringOccurrencesForMonth(
        mockRecurrings,
        [],
        '2026-10',
        '2026-10-15'
      );
      const aluguelOcc = summaryBefore.occurrences.find((o) => o.recurringId === 'rec_aluguel')!;

      const paidTx1 = buildRecurringPaymentTransaction({
        occurrence: aluguelOcc,
        paidDate: '2026-10-10',
      });
      const paidTx2 = buildRecurringPaymentTransaction({
        occurrence: aluguelOcc,
        paidDate: '2026-10-10',
        existingTransaction: paidTx1,
      });

      // Mesmo ID determinístico -> put() no banco nunca cria duplicata
      expect(paidTx1.id).toBe('tx_rec_rec_aluguel_2026-10-10');
      expect(paidTx2.id).toBe(paidTx1.id);

      const summaryAfter = getRecurringOccurrencesForMonth(
        mockRecurrings,
        [paidTx1],
        '2026-10',
        '2026-10-15'
      );

      expect(summaryAfter.paidCount).toBe(1);
      expect(summaryAfter.totalPaidInCents).toBe(180000);
      expect(summaryAfter.totalPendingInCents).toBe(12000); // resta apenas Internet
    });

    it('suporta gastos fixos recorrentes sem data de vencimento fixa (apenas valor recorrente)', () => {
      const appleSubscription: FinanceRecurringExpense = {
        id: 'rec_apple',
        name: 'Apple Services',
        amountInCents: 1990, // R$ 19,90
        categoryId: 'cat_assinaturas',
        frequency: 'monthly',
        paymentMethod: 'credit',
        status: 'active',
        createdAt: new Date('2026-10-01').getTime(),
        updatedAt: new Date('2026-10-01').getTime(),
      };

      const summary = getRecurringOccurrencesForMonth(
        [appleSubscription],
        [],
        '2026-10',
        '2026-10-16'
      );

      expect(summary.occurrences).toHaveLength(1);
      const occ = summary.occurrences[0];
      expect(occ.name).toBe('Apple Services');
      expect(occ.dueDate).toBe('');
      // Sem data fixa, nunca fica em atraso; fica pendente para quitação no mês
      expect(occ.status).toBe('pending');
      expect(summary.totalPendingInCents).toBe(1990);
      expect(summary.nextDueOccurrence).not.toBeNull();
      expect(summary.nextDueOccurrence?.recurringId).toBe('rec_apple');

      // Dar baixa sem vencimento fixo
      const paidTx = buildRecurringPaymentTransaction({
        occurrence: occ,
        paidDate: '2026-10-16',
        paidAmountInCents: 1990,
      });

      expect(paidTx.occurrenceKey).toBe('rec_apple_2026-10');

      const summaryPaid = getRecurringOccurrencesForMonth(
        [appleSubscription],
        [paidTx],
        '2026-10',
        '2026-10-16'
      );

      expect(summaryPaid.paidCount).toBe(1);
      expect(summaryPaid.pendingCount).toBe(0);
      expect(summaryPaid.totalPaidInCents).toBe(1990);
      expect(summaryPaid.totalPendingInCents).toBe(0);
    });

    it('separa gastos fixos no cartão de crédito das contas a pagar direto (sem poluir contas pendentes)', () => {
      const mixedRecurrings: FinanceRecurringExpense[] = [
        {
          id: 'rec_aluguel',
          name: 'Aluguel',
          amountInCents: 180000, // R$ 1.800,00
          categoryId: 'cat_moradia',
          firstDueDate: '2026-10-10',
          frequency: 'monthly',
          paymentMethod: 'pix',
          status: 'active',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'rec_netflix',
          name: 'Netflix',
          amountInCents: 5590, // R$ 55,90
          categoryId: 'cat_assinaturas',
          firstDueDate: '2026-10-12',
          frequency: 'monthly',
          paymentMethod: 'credit',
          status: 'active',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'rec_spotify',
          name: 'Spotify',
          amountInCents: 2190, // R$ 21,90
          categoryId: 'cat_assinaturas',
          firstDueDate: '2026-10-14',
          frequency: 'monthly',
          paymentMethod: 'credit',
          status: 'active',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'rec_prime',
          name: 'Amazon Prime',
          amountInCents: 1990, // R$ 19,90
          categoryId: 'cat_assinaturas',
          frequency: 'monthly',
          paymentMethod: 'credit',
          status: 'active',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      const summary = getRecurringOccurrencesForMonth(
        mixedRecurrings,
        [],
        '2026-10',
        '2026-10-15'
      );

      // Total geral previsto (180000 + 5590 + 2190 + 1990 = 189770)
      expect(summary.totalExpectedInCents).toBe(189770);
      expect(summary.totalPendingInCents).toBe(189770);
      expect(summary.pendingCount).toBe(4);

      // Métricas específicas de contas a pagar DIRETO (exclui cartão de crédito)
      expect(summary.totalPendingDirectInCents).toBe(180000); // Apenas o aluguel
      expect(summary.pendingDirectCount).toBe(1);
      expect(summary.overdueDirectCount).toBe(1); // 10/10 < 15/10

      // Métricas de gastos fixos no cartão
      expect(summary.totalCreditInCents).toBe(9770); // 5590 + 2190 + 1990
      expect(summary.creditCount).toBe(3);

      // nextDueOccurrence prioriza o boleto direto a pagar, não as assinaturas do cartão
      expect(summary.nextDueOccurrence?.recurringId).toBe('rec_aluguel');

      // Teste de integração com Cartão de Crédito
      const card: FinanceCard = {
        id: 'card_nubank',
        name: 'Nubank',
        closingDay: 20,
        dueDay: 27,
        limitInCents: 500000,
        isArchived: false,
        createdAt: 1000,
        updatedAt: 1000,
      };

      const cardSummary = calculateCardSummary(
        card,
        [],
        '2026-10-15',
        summary.occurrences,
        1
      );

      // Fatura do cartão inclui automaticamente os R$ 97,70 dos gastos fixos no cartão
      expect(cardSummary.currentInvoiceTotalInCents).toBe(9770);

      // Teste de Próximos Vencimentos: consolida fixos de cartão na fatura, sem duplicação
      const commitments = getUpcomingCommitments(
        summary,
        [cardSummary],
        '2026-10',
        '2026-10-15'
      );

      // Deve ter apenas 2 itens: Aluguel (recorrente direto) e Fatura Nubank (card_invoice)
      expect(commitments).toHaveLength(2);
      expect(commitments.some((c) => c.title === 'Aluguel' && c.kind === 'recurring')).toBe(true);
      expect(commitments.some((c) => c.title === 'Fatura Nubank' && c.kind === 'card_invoice')).toBe(true);
      // Nenhuma das 3 assinaturas avulsas no cartão aparece duplicada
      expect(commitments.some((c) => c.title === 'Netflix')).toBe(false);
      expect(commitments.some((c) => c.title === 'Spotify')).toBe(false);
      expect(commitments.some((c) => c.title === 'Amazon Prime')).toBe(false);
    });

    it('calcula proporção Fixos vs Variáveis e evolução/comparativo mensal com precisão', () => {
      const aluguelTx: FinanceTransaction = {
        id: 'tx_rec_rec_aluguel_2026-10-10',
        type: 'expense',
        amountInCents: 180000,
        description: 'Aluguel',
        categoryId: 'cat_moradia',
        date: '2026-10-10',
        paymentMethod: 'pix',
        recurringExpenseId: 'rec_aluguel',
        occurrenceKey: 'rec_aluguel_2026-10-10',
        createdAt: 1000,
        updatedAt: 1000,
      };
      const variableTx: FinanceTransaction = {
        id: 'tx_var_1',
        type: 'expense',
        amountInCents: 48000, // R$ 480,00
        description: 'Mercado Semanal',
        categoryId: 'cat_alimentacao',
        date: '2026-10-12',
        paymentMethod: 'debit',
        createdAt: 1000,
        updatedAt: 1000,
      };
      const prevMonthTx: FinanceTransaction = {
        id: 'tx_prev_1',
        type: 'expense',
        amountInCents: 100000, // R$ 1.000,00 em setembro
        description: 'Despesa Setembro',
        categoryId: 'cat_moradia',
        date: '2026-09-15',
        paymentMethod: 'pix',
        createdAt: 1000,
        updatedAt: 1000,
      };

      const recSummary = getRecurringOccurrencesForMonth(
        mockRecurrings,
        [aluguelTx, variableTx, prevMonthTx],
        '2026-10',
        '2026-10-15'
      );

      const fv = calculateFixedVsVariable(
        [aluguelTx, variableTx, prevMonthTx],
        recSummary,
        '2026-10'
      );
      expect(fv.fixedRealizedInCents).toBe(180000);
      expect(fv.fixedPendingInCents).toBe(12000);
      expect(fv.fixedTotalInCents).toBe(192000);
      expect(fv.variableRealizedInCents).toBe(48000);
      expect(fv.fixedPercentage).toBe(80); // 1920 / 2400 = 80%
      expect(fv.variablePercentage).toBe(20);

      const comp = calculatePreviousMonthComparison(
        [aluguelTx, variableTx, prevMonthTx],
        '2026-10'
      );
      expect(comp.hasPreviousData).toBe(true);
      expect(comp.previousExpenseInCents).toBe(100000);
      expect(comp.currentExpenseInCents).toBe(228000);
      expect(comp.expenseDiffInCents).toBe(128000);

      const evo = calculateMonthlyEvolution([aluguelTx, variableTx, prevMonthTx], '2026-10', 3);
      expect(evo.hasAnyData).toBe(true);
      expect(evo.points).toHaveLength(3);
    });
  });

  describe('Categorias Financeiras Padrão e Classificação Automática', () => {
    it('fornece conjunto completo de categorias padrão sem exigir cadastro manual', () => {
      expect(DEFAULT_FINANCE_CATEGORIES.length).toBeGreaterThanOrEqual(19);

      const expenses = DEFAULT_FINANCE_CATEGORIES.filter((c) => c.type === 'expense');
      const incomes = DEFAULT_FINANCE_CATEGORIES.filter((c) => c.type === 'income');

      expect(expenses.some((c) => c.id === 'cat-mercado' && c.name === 'Mercado')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-alimentacao' && c.name === 'Alimentação')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-transporte' && c.name === 'Transporte')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-moradia' && c.name === 'Moradia')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-contas' && c.name === 'Contas & Serviços')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-compras' && c.name === 'Compras')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-saude' && c.name === 'Saúde & Farmácia')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-academia' && c.name === 'Academia & Esporte')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-assinaturas' && c.name === 'Assinaturas & Streaming')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-lazer' && c.name === 'Lazer & Viagens')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-educacao' && c.name === 'Educação')).toBe(true);
      expect(expenses.some((c) => c.id === 'cat-cuidados-pessoais' && c.name === 'Cuidados Pessoais')).toBe(true);

      expect(incomes.some((c) => c.id === 'cat-salario' && c.name === 'Salário')).toBe(true);
      expect(incomes.some((c) => c.id === 'cat-freelance')).toBe(true);
      expect(incomes.some((c) => c.id === 'cat-investimentos')).toBe(true);
      expect(incomes.some((c) => c.id === 'cat-vendas')).toBe(true);
      expect(incomes.some((c) => c.id === 'cat-reembolso')).toBe(true);
    });

    it('classifica despesas automaticamente usando as categorias padrão', () => {
      const r1 = inferCategoryFromDescription('Pão de Açúcar Supermercado', 'expense', DEFAULT_FINANCE_CATEGORIES);
      expect(r1.categoryId).toBe('cat-mercado');
      expect(r1.matched).toBe(true);

      const r2 = inferCategoryFromDescription('Ifood restaurante', 'expense', DEFAULT_FINANCE_CATEGORIES);
      expect(r2.categoryId).toBe('cat-alimentacao');
      expect(r2.matched).toBe(true);

      const r3 = inferCategoryFromDescription('Enel Conta de Energia', 'expense', DEFAULT_FINANCE_CATEGORIES);
      expect(r3.categoryId).toBe('cat-contas');
      expect(r3.matched).toBe(true);

      const r4 = inferCategoryFromDescription('Barbearia Vintage', 'expense', DEFAULT_FINANCE_CATEGORIES);
      expect(r4.categoryId).toBe('cat-cuidados-pessoais');
      expect(r4.matched).toBe(true);

      const r5 = inferCategoryFromDescription('Salario Mensal Folha', 'income', DEFAULT_FINANCE_CATEGORIES);
      expect(r5.categoryId).toBe('cat-salario');
      expect(r5.matched).toBe(true);
    });
  });
});


