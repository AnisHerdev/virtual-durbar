import { useEffect, useRef } from 'react';
import { useContent } from '../content/loadContent';
import type { CodexCard } from '../content/types';
import { loadCodex } from '../lib/session';

export function CodexCardView({ card, locked, fresh }: { card: CodexCard; locked?: boolean; fresh?: boolean }) {
  if (locked) {
    return (
      <article className="flex min-h-40 flex-col items-center justify-center rounded-md border-2 border-dashed border-ink-soft/40 p-4 text-center text-ink-soft/70">
        <span className="font-display text-3xl">?</span>
        <span className="text-sm">A tale not yet told</span>
      </article>
    );
  }
  return (
    <article className={`folio-plain flex flex-col gap-2 rounded-md p-4 ${fresh ? 'rise ring-4 ring-gold-light' : ''}`}>
      <header>
        <h3 className="text-lg leading-tight text-sindoor">{card.title}</h3>
        <p className="text-xs uppercase tracking-wider text-ink-soft">
          {card.era} · {card.region}
        </p>
      </header>
      <p className="text-[0.95rem] leading-snug">{card.tale}</p>
      <p className="mt-auto border-t border-gold/60 pt-2 text-sm italic text-peacock">{card.lesson}</p>
      <p className="text-xs text-ink-soft">Source: {card.source}</p>
    </article>
  );
}

export function CodexGrid({ unlocked, fresh = [] }: { unlocked: string[]; fresh?: string[] }) {
  const { codex } = useContent();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {codex.map((c) => (
        <CodexCardView key={c.id} card={c} locked={!unlocked.includes(c.id)} fresh={fresh.includes(c.id)} />
      ))}
    </div>
  );
}

export function CodexDialog({ onClose, fresh }: { onClose: () => void; fresh?: string[] }) {
  const { codex } = useContent();
  const ref = useRef<HTMLDialogElement>(null);
  const unlocked = loadCodex();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="folio m-auto max-h-[90vh] w-[min(1100px,94vw)] overflow-y-auto p-5 backdrop:bg-black/70 scroll-thin"
      aria-labelledby="codex-title"
    >
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2 id="codex-title" className="text-3xl text-sindoor">
            Itihas Codex <span className="font-deva text-2xl text-ink-soft">इतिहास</span>
          </h2>
          <p className="text-ink-soft">
            {unlocked.length} of {codex.length} tales collected in this browser. Win tasks to unlock more.
          </p>
        </div>
        <button className="btn btn-royal" onClick={() => ref.current?.close()} autoFocus>
          Close
        </button>
      </header>
      <CodexGrid unlocked={unlocked} fresh={fresh} />
    </dialog>
  );
}
