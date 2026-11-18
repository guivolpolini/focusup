// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FeedbackProvider, useFeedback } from '../components/FeedbackProvider';
import { useState } from 'react';

afterEach(() => {
  cleanup();
});

function CrashComponent({ shouldCrash }: { shouldCrash: boolean }) {
  if (shouldCrash) {
    throw new Error('Boom simulado');
  }
  return <div>Conteúdo saudável</div>;
}

function FeedbackHarness() {
  const { toast, confirm } = useFeedback();
  const [result, setResult] = useState<string>('none');

  return (
    <div>
      <button type="button" onClick={() => toast.success('Operação salva!')}>
        Disparar Toast
      </button>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: 'Confirmar exclusão',
            message: 'Deseja apagar este item?',
            confirmLabel: 'Apagar',
            destructive: true,
          });
          setResult(ok ? 'accepted' : 'cancelled');
        }}
      >
        Abrir Confirmação
      </button>
      <span data-testid="confirm-result">{result}</span>
    </div>
  );
}

describe('UI Core Components (ErrorBoundary & FeedbackProvider)', () => {
  it('ErrorBoundary catches render errors and shows recovery UI', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary scopeLabel="Finanças">
        <CrashComponent shouldCrash={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Algo deu errado no módulo Finanças/i)).toBeTruthy();
    expect(screen.getByText(/Baixar Backup de Emergência/i)).toBeTruthy();
    spy.mockRestore();
  });

  it('FeedbackProvider shows accessible toast and dismisses it', () => {
    render(
      <FeedbackProvider>
        <FeedbackHarness />
      </FeedbackProvider>
    );

    fireEvent.click(screen.getByText('Disparar Toast'));
    expect(screen.getByRole('status').textContent).toContain('Operação salva!');

    fireEvent.click(screen.getByLabelText('Fechar aviso'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('FeedbackProvider confirm dialog resolves true on confirm and false on Escape', async () => {
    render(
      <FeedbackProvider>
        <FeedbackHarness />
      </FeedbackProvider>
    );

    // Aceitar confirmação
    fireEvent.click(screen.getByText('Abrir Confirmação'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Apagar'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-result').textContent).toBe('accepted');
    });

    // Cancelar via tecla Escape
    fireEvent.click(screen.getByText('Abrir Confirmação'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.getByTestId('confirm-result').textContent).toBe('cancelled');
    });
  });
});
