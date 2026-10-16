import { describe, it, expect } from 'vitest';
import {
  formatCentsToBRL,
  parseBRLToCents,
  splitInstallments,
  calculateInvoiceMonth,
  generateInstallmentTransactions,
  calculateMonthlySummary,
  parseCSVTransactions,
} from '../lib/financeEngine';
import type { FinanceTransaction } from '../types';

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
});
