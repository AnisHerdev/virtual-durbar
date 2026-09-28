import { useState } from 'react';
import { useContent } from '../content/loadContent';
import type { RoleDef, RoleId } from '../content/types';
import type { Court } from '../game/useCourt';
import { navigate } from '../lib/session';
import { PreviewMirror } from './PreviewMirror';

const PHASE_NAMES: Record<string, string> = {
  lobby: 'gathering',
  morning: 'morning',
  midday: 'midday',
  afternoon: 'afternoon',
  sunset: 'sunset',
  debrief: 'debrief',
};

export function Lobby({ court, onEnter }: { court: Court; onEnter: () => void }) {
  const content = useContent();
  const [copied, setCopied] = useState(false);
  const { view, summary, peers, roles, myRole, roleConflict } = court;

  // A seat is taken if someone claims it now, or if it is locked into a running game.
  const holders = new Map<RoleId, { name: string; you: boolean; away?: boolean }>();
  for (const [identity, role] of roles) {
    const peer = peers.find((p) => p.identity === identity);
    holders.set(role, { name: peer?.name ?? '…', you: identity === court.selfIdentity });
  }
  if (view && view.status !== 'lobby') {
    for (const p of view.players) {
      if (!holders.has(p.role)) holders.set(p.role, { name: p.name, you: p.identity === court.selfIdentity, away: !p.connected });
    }
  }
  const inGame = view && view.status !== 'lobby';
  const myGameSeat = view?.players.find((p) => p.identity === court.selfIdentity)?.role;
  const unseated = peers.filter((p) => !roles.has(p.identity));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <main className="mx-auto flex min-h-full max-w-7xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <button className="text-sm text-gold-light underline-offset-2 hover:underline" onClick={() => navigate(null)}>
            ← Leave
          </button>
          <h1 className="text-4xl text-parchment">
            The antechamber of <span className="font-mono text-gold-light">{court.roomId}</span>
          </h1>
          <p className="text-parchment/75">
            {court.hostIdentity
              ? summary && summary.status !== 'lobby'
                ? `Court in session — Day ${summary.day}, ${PHASE_NAMES[summary.phase] ?? summary.phase}.`
                : 'The Raja is seated. Choose your role and enter.'
              : 'The throne is empty. The game begins once someone takes the seat of Raja or Rani.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {court.transport.kind === 'rehearsal' && (
            <span className="rounded bg-lapis px-2 py-1 text-sm">Rehearsal mode · open more tabs to fill seats</span>
          )}
          <button className="btn btn-ghost text-sm text-gold-light" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="flex flex-col gap-4">
          <PreviewMirror showMic={court.transport.kind === 'livekit'} />
          <div className="folio-plain rounded-md p-4 text-center">
            {roleConflict ? (
              <p className="text-sindoor">Someone claimed the {roleTitle(content.roles, roleConflict)} seat a moment before you. Choose another.</p>
            ) : myRole ? (
              <p>
                You will sit as <b>{roleTitle(content.roles, myRole)}</b>.
              </p>
            ) : inGame && myGameSeat ? (
              <p>Reclaiming your seat…</p>
            ) : (
              <p>Choose a seat to see your royal attire.</p>
            )}
            <button className="btn btn-royal mt-3 w-full text-lg" disabled={!myRole} onClick={onEnter}>
              Enter the Durbar
            </button>
          </div>
        </div>

        <section aria-label="Choose your role" className="grid content-start gap-3 sm:grid-cols-2">
          {content.roles.map((r) => {
            const holder = holders.get(r.id);
            const mine = holder?.you;
            const lockedOut = !!inGame && !!myGameSeat && myGameSeat !== r.id;
            return (
              <button
                key={r.id}
                type="button"
                disabled={(!!holder && !mine) || lockedOut}
                onClick={() => void court.claimRole(mine ? null : r.id)}
                aria-pressed={!!mine}
                className={`folio-plain group flex flex-col gap-1 rounded-md p-4 text-left transition ${
                  mine ? 'ring-4 ring-gold-light' : holder ? 'opacity-60' : 'hover:-translate-y-0.5'
                } ${r.id === 'raja' ? 'sm:col-span-2' : ''} disabled:cursor-not-allowed`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex items-baseline gap-2">
                    <span aria-hidden className="text-2xl" style={{ color: r.color }}>
                      {r.emblem}
                    </span>
                    <span className="font-display text-xl">{r.title}</span>
                    <span className="font-deva text-ink-soft">{r.sanskrit}</span>
                  </span>
                  <span className="text-xs uppercase tracking-wider text-ink-soft">
                    {mine ? 'Your seat' : holder ? `${holder.name}${holder.away ? ' (away)' : ''}` : 'Vacant'}
                  </span>
                </span>
                <span className="text-sm font-semibold text-sindoor">{r.epithet}</span>
                <span className="text-[0.95rem] leading-snug">{r.description}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {r.naturalFit.map((f) => (
                    <span key={f} className="rounded-full bg-parchment-deep px-2 text-xs text-ink-soft">
                      {f}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
          {unseated.length > 0 && (
            <p className="text-sm text-parchment/70 sm:col-span-2">
              In the antechamber, unseated: {unseated.map((p) => p.name).join(', ')}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function roleTitle(roles: RoleDef[], id: RoleId) {
  return roles.find((r) => r.id === id)?.title ?? id;
}
