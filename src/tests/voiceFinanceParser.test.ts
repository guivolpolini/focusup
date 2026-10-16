import { describe, it, expect } from 'vitest';
import {
  extractAmountInCents,
  extractInstallments,
  extractPaymentMethod,
  extractDate,
  parseVoiceFinanceCommand,
} from '../lib/voiceFinanceParser';
import type { FinanceCategory, FinanceCard } from '../types';

describe('voiceFinanceParser', () => {
  const mockCategories: FinanceCategory[] = [
    { id: 'cat-alimentacao', name: 'Alimentação', type: 'expense' },
    { id: 'cat-transporte', name: 'Transporte', type: 'expense' },
    { id: 'cat-lazer', name: 'Lazer', type: 'expense' },
    { id: 'cat-academia', name: 'Academia', type: 'expense' },
    { id: 'cat-assinaturas', name: 'Assinaturas', type: 'expense' },
    { id: 'cat-compras', name: 'Compras', type: 'expense' },
    { id: 'cat-outros-despesa', name: 'Outros', type: 'expense' },
    { id: 'cat-salario', name: 'Salário', type: 'income' },
    { id: 'cat-freelance', name: 'Freelance', type: 'income' },
    { id: 'cat-outros-receita', name: 'Outras Receitas', type: 'income' },
  ];

  const mockCards: FinanceCard[] = [
    {
      id: 'card-nubank',
      name: 'Nubank',
      closingDay: 20,
      dueDay: 5,
      isArchived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  describe('Extração de Valores', () => {
    it('extrai valor com números diretos e reais', () => {
      expect(extractAmountInCents('Gastei 50 reais no mercado')).toBe(5000);
      expect(extractAmountInCents('Paguei 35.50 no almoço')).toBe(3550);
      expect(extractAmountInCents('Comprei 120,00 reais')).toBe(12000);
      expect(extractAmountInCents('18 reais e 50 centavos')).toBe(1850);
    });

    it('extrai valores com palavras por extenso', () => {
      expect(extractAmountInCents('Recebi duzentos reais de freela')).toBe(20000);
      expect(extractAmountInCents('Gastei cinquenta reais')).toBe(5000);
      expect(extractAmountInCents('cem reais')).toBe(10000);
    });

    it('retorna 0 para frases sem valor monetário', () => {
      expect(extractAmountInCents('Fui no mercado hoje de tarde')).toBe(0);
    });
  });

  describe('Extração de Parcelas', () => {
    it('identifica parcelamento por dígitos ou extenso', () => {
      expect(extractInstallments('Comprei em 3x no cartão')).toBe(3);
      expect(extractInstallments('Dividido em 10 parcelas')).toBe(10);
      expect(extractInstallments('Comprei em três parcelas')).toBe(3);
      expect(extractInstallments('Paguei à vista')).toBe(1);
    });
  });

  describe('Extração de Forma de Pagamento', () => {
    it('identifica pix, cartão de crédito, débito e dinheiro', () => {
      expect(extractPaymentMethod('Paguei no Pix', false)).toBe('pix');
      expect(extractPaymentMethod('Gastei no cartão de crédito', false)).toBe('credit');
      expect(extractPaymentMethod('Comprei no crédito', false)).toBe('credit');
      expect(extractPaymentMethod('Paguei no débito', false)).toBe('debit');
      expect(extractPaymentMethod('Paguei em dinheiro', false)).toBe('money');
      expect(extractPaymentMethod('Comprei em 3 parcelas', true)).toBe('credit');
    });
  });

  describe('Extração de Data Relativa', () => {
    it('calcula data de hoje e ontem', () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(extractDate('Gastei hoje no almoço')).toBe(todayStr);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      expect(extractDate('Gastei 18 reais no almoço ontem')).toBe(yesterdayStr);
    });
  });

  describe('Interpretação Completa dos Exemplos Reais', () => {
    it('Cenário 1: "Gastei 50 reais no mercado hoje."', () => {
      const result = parseVoiceFinanceCommand('Gastei 50 reais no mercado hoje.', mockCategories, mockCards);
      expect(result.type).toBe('expense');
      expect(result.amountInCents).toBe(5000);
      expect(result.categoryId).toBe('cat-alimentacao');
      expect(result.description.toLowerCase()).toContain('mercado');
    });

    it('Cenário 2: "Paguei 35 reais de Uber no Pix."', () => {
      const result = parseVoiceFinanceCommand('Paguei 35 reais de Uber no Pix.', mockCategories, mockCards);
      expect(result.type).toBe('expense');
      expect(result.amountInCents).toBe(3500);
      expect(result.categoryId).toBe('cat-transporte');
      expect(result.paymentMethod).toBe('pix');
      expect(result.description.toLowerCase()).toContain('uber');
    });

    it('Cenário 3: "Recebi 200 reais de um freelance."', () => {
      const result = parseVoiceFinanceCommand('Recebi 200 reais de um freelance.', mockCategories, mockCards);
      expect(result.type).toBe('income');
      expect(result.amountInCents).toBe(20000);
      expect(result.categoryId).toBe('cat-freelance');
      expect(result.description.toLowerCase()).toContain('freelance');
    });

    it('Cenário 4: "Gastei 120 reais na academia no cartão de crédito."', () => {
      const result = parseVoiceFinanceCommand('Gastei 120 reais na academia no cartão de crédito.', mockCategories, mockCards);
      expect(result.type).toBe('expense');
      expect(result.amountInCents).toBe(12000);
      expect(result.categoryId).toBe('cat-academia');
      expect(result.paymentMethod).toBe('credit');
    });

    it('Cenário 5: "Comprei um tênis de 240 reais em três parcelas."', () => {
      const result = parseVoiceFinanceCommand('Comprei um tênis de 240 reais em três parcelas.', mockCategories, mockCards);
      expect(result.type).toBe('expense');
      expect(result.amountInCents).toBe(24000);
      expect(result.totalInstallments).toBe(3);
      expect(result.paymentMethod).toBe('credit');
      expect(result.categoryId).toBe('cat-compras');
    });

    it('Cenário 6: "Gastei 18 reais no almoço ontem."', () => {
      const result = parseVoiceFinanceCommand('Gastei 18 reais no almoço ontem.', mockCategories, mockCards);
      expect(result.type).toBe('expense');
      expect(result.amountInCents).toBe(1800);
      expect(result.categoryId).toBe('cat-alimentacao');

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      expect(result.date).toBe(yesterdayStr);
    });

    it('Cenário 7: Frase sem valor identificável', () => {
      const result = parseVoiceFinanceCommand('Hoje fui no shopping passear', mockCategories, mockCards);
      expect(result.amountInCents).toBe(0);
      expect(result.confidence).toBe('low');
    });
  });
});
