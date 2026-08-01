import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the default recovery card. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure to the operator console; a production deployment
    // forwards this to the platform observability sink.
    console.error('[INTELORA] Unhandled interface error', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="panel w-full max-w-lg p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-400/25">
            <AlertOctagon size={20} aria-hidden />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-fg">This view could not be rendered</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-fg-muted">
            The module encountered an unrecoverable error. Reloading the view usually clears it; if it persists, the
            telemetry contract for this module has likely changed.
          </p>
          <pre className="scroll-thin mt-4 max-h-28 overflow-auto rounded-lg border border-overlay/[0.07] bg-ink-850/70 p-3 text-left font-mono text-[10.5px] leading-relaxed text-fg-dim">
            {error.message}
          </pre>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button variant="primary" size="sm" icon={RotateCcw} onClick={this.reset}>
              Retry view
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Reload application
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
