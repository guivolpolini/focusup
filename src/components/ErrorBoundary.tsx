import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Download, RotateCcw } from 'lucide-react';
import { formatDateToLocalYYYYMMDD } from '../lib/srsEngine';

interface ErrorBoundaryProps {
  children: ReactNode;
  scopeLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  exporting: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    exporting: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[FocusUp ErrorBoundary${this.props.scopeLabel ? ` - ${this.props.scopeLabel}` : ''}]`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleEmergencyBackup = async () => {
    this.setState({ exporting: true });
    try {
      const { exportAllData } = await import('../lib/backupEngine');
      const json = await exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `focusup-backup-emergencia-${formatDateToLocalYYYYMMDD(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao exportar backup de emergência:', err);
    } finally {
      this.setState({ exporting: false });
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const scope = this.props.scopeLabel ? `no módulo ${this.props.scopeLabel}` : 'na aplicação';

    return (
      <div
        role="alert"
        className="min-h-[320px] flex items-center justify-center p-6 bg-slate-50"
      >
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Algo deu errado {scope}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Seus dados no dispositivo continuam salvos no IndexedDB.
              </p>
            </div>
          </div>

          {this.state.error?.message && (
            <details className="text-xs text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl p-3">
              <summary className="cursor-pointer font-semibold text-slate-600">
                Detalhes técnicos
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] text-rose-700">
                {this.state.error.message}
              </pre>
            </details>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
            >
              Recarregar página
            </button>
          </div>

          <button
            type="button"
            onClick={this.handleEmergencyBackup}
            disabled={this.state.exporting}
            className="w-full inline-flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {this.state.exporting ? 'Exportando backup...' : 'Baixar Backup de Emergência (.json)'}
          </button>
        </div>
      </div>
    );
  }
}
