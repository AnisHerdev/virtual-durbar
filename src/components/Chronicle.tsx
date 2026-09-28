import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Court } from '../game/useCourt';
import { useRoleTitles } from './stage/common';

export function Chronicle({ court }: { court: Court }) {
  const log = court.view?.log ?? [];
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);
  return (
    <section className="folio-plain flex min-h-0 flex-col rounded-md" aria-label="Court chronicle">
      <h2 className="border-b border-gold/60 px-3 py-1 font-display text-lg text-sindoor">Chronicle of the court</h2>
      <ol className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-[0.95rem]" aria-live="polite">
        {log.length === 0 && <li className="italic text-ink-soft">The scribe dips his pen…</li>}
        {log.map((e) => (
          <li key={e.id} className="leading-snug">
            <span className="mr-1 text-xs uppercase text-ink-soft">{e.day ? `D${e.day}` : ''}</span>
            {e.text}
          </li>
        ))}
        <li ref={end} aria-hidden />
      </ol>
    </section>
  );
}

/** Private messages between two players; they never pass through the host. */
export function Whispers({ court }: { court: Court }) {
  const titles = useRoleTitles();
  const others = (court.view?.players ?? []).filter((p) => p.identity !== court.selfIdentity);
  const [to, setTo] = useState<string>('');
  const [text, setText] = useState('');
  // How many whispers from each sender have been on screen.
  const [seen, setSeen] = useState<Record<string, number>>({});
  const received = (id: string) => court.whispers.filter((w) => w.from === id).length;
  // Until you pick someone, open the thread of whoever whispered to you last.
  const lastSender = court.whispers.findLast((w) => w.from !== court.selfIdentity)?.from;
  const target = to || lastSender || others[0]?.identity || '';
  const thread = court.whispers.filter((w) => (w.from === target && w.to === court.selfIdentity) || w.to === target);
  const unreadFrom = (id: string) => (id === target ? 0 : received(id) - (seen[id] ?? 0));
  const unread = others.reduce((sum, p) => sum + unreadFrom(p.identity), 0);
  const end = useRef<HTMLLIElement>(null);
  const targetReceived = received(target);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
    if (target) setSeen((s) => (s[target] === targetReceived ? s : { ...s, [target]: targetReceived }));
  }, [thread.length, target, targetReceived]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !target) return;
    court.whisper(target, text.trim());
    setText('');
  };

  return (
    <section className="folio-plain flex min-h-0 flex-col rounded-md" aria-label="Whispers">
      <div className="flex items-center justify-between gap-2 border-b border-gold/60 px-3 py-1">
        <h2 className="font-display text-lg text-lapis">
          Whispers {unread > 0 && <span className="text-sm text-sindoor">· {unread} unread</span>}
        </h2>
        <select className="field w-auto py-0.5 text-sm" value={target} onChange={(e) => setTo(e.target.value)} aria-label="Whisper to">
          {others.map((p) => (
            <option key={p.identity} value={p.identity}>
              {p.name} — {titles[p.role]}
              {unreadFrom(p.identity) > 0 ? ` (${unreadFrom(p.identity)} new)` : ''}
            </option>
          ))}
        </select>
      </div>
      <ol className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-[0.95rem]">
        {!others.length && <li className="italic text-ink-soft">No one to whisper to yet.</li>}
        {others.length > 0 && !thread.length && (
          <li className="italic text-ink-soft">Only the two of you will see these words. Plot, confide — or deceive.</li>
        )}
        {thread.map((w) => (
          <li key={w.id} className={w.from === court.selfIdentity ? 'text-right' : ''}>
            <span
              className={`inline-block max-w-[85%] rounded-md px-2 py-0.5 ${
                w.from === court.selfIdentity ? 'bg-lapis text-parchment' : 'bg-parchment-deep'
              }`}
            >
              {w.text}
            </span>
          </li>
        ))}
        <li ref={end} aria-hidden />
      </ol>
      <form onSubmit={send} className="flex gap-2 border-t border-gold/60 p-2">
        <input
          className="field py-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Whisper…"
          disabled={!target}
          maxLength={500}
          aria-label="Whisper message"
        />
        <button className="btn btn-royal py-1" disabled={!target || !text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
