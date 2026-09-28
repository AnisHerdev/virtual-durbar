import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Court } from '../game/useCourt';
import { useRoleTitles } from './stage/common';

type Tab = 'chronicle' | 'whispers';

/**
 * The court's record and your private whispers share one panel, so only one
 * stream of text competes for attention. Unread whispers surface on the tab.
 */
export function CourtLog({ court }: { court: Court }) {
  const [tab, setTab] = useState<Tab>('chronicle');
  const [unread, setUnread] = useState(0);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'chronicle', label: 'Chronicle' },
    { id: 'whispers', label: 'Whispers' },
  ];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') setTab((t) => (t === 'chronicle' ? 'whispers' : 'chronicle'));
  };
  return (
    <section className="folio-plain flex min-h-0 flex-1 flex-col rounded-md" aria-label="Court record">
      <div role="tablist" aria-label="Court record" className="flex gap-5 border-b border-gold/60 px-3" onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`log-tab-${t.id}`}
            role="tab"
            type="button"
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`log-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'whispers' && unread > 0 && (
              <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-sindoor px-1 font-body text-xs font-bold text-parchment">
                {unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <div id="log-panel-chronicle" role="tabpanel" aria-labelledby="log-tab-chronicle" hidden={tab !== 'chronicle'} className="flex min-h-0 flex-1 flex-col">
        <Chronicle court={court} />
      </div>
      <div id="log-panel-whispers" role="tabpanel" aria-labelledby="log-tab-whispers" hidden={tab !== 'whispers'} className="flex min-h-0 flex-1 flex-col">
        <Whispers court={court} visible={tab === 'whispers'} onUnread={setUnread} />
      </div>
    </section>
  );
}

function Chronicle({ court }: { court: Court }) {
  const log = court.view?.log ?? [];
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);
  return (
    <>
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
    </>
  );
}

/** Private messages between two players; they never pass through the host. */
function Whispers({ court, visible, onUnread }: { court: Court; visible: boolean; onUnread: (n: number) => void }) {
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
  // The open thread only counts as read while the panel is actually on screen.
  const unreadFrom = (id: string) => (visible && id === target ? 0 : received(id) - (seen[id] ?? 0));
  const unread = others.reduce((sum, p) => sum + unreadFrom(p.identity), 0);
  const end = useRef<HTMLLIElement>(null);
  const targetReceived = received(target);
  useEffect(() => {
    if (!visible) return;
    end.current?.scrollIntoView({ block: 'nearest' });
    if (target) setSeen((s) => (s[target] === targetReceived ? s : { ...s, [target]: targetReceived }));
  }, [visible, thread.length, target, targetReceived]);
  useEffect(() => onUnread(unread), [unread, onUnread]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !target) return;
    court.whisper(target, text.trim());
    setText('');
  };

  return (
    <>
      <label className="flex items-center gap-2 border-b border-gold/30 px-3 py-1.5 text-sm">
        <span className="text-ink-soft">To</span>
        <select className="field min-w-0 flex-1 py-0.5 text-sm" value={target} onChange={(e) => setTo(e.target.value)} disabled={!others.length}>
          {others.map((p) => (
            <option key={p.identity} value={p.identity}>
              {p.name} — {titles[p.role]}
              {unreadFrom(p.identity) > 0 ? ` (${unreadFrom(p.identity)} new)` : ''}
            </option>
          ))}
        </select>
      </label>
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
    </>
  );
}
