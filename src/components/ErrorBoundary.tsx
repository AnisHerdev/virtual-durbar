import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[durbar] crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-full place-items-center p-6">
        <div className="folio flex max-w-lg flex-col gap-3 p-6">
          <h1 className="text-2xl text-sindoor">The court has fallen into disarray</h1>
          <pre className="whitespace-pre-wrap rounded bg-parchment-deep p-3 text-sm">{this.state.error.message}</pre>
          <p className="text-sm text-ink-soft">If you were the Raja, reloading resumes the game where it stopped.</p>
          <button className="btn btn-royal self-start" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </main>
    );
  }
}
