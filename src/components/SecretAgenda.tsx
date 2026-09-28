import { useEffect, useRef, useState } from 'react';
import type { Court } from '../game/useCourt';

/** Each player's private role card — the traitor's instructions live here. */
export function SecretAgenda({ court }: { court: Court }) {
  // Open for the first matter so everyone reads it once; afterwards the one-line gist is enough.
  const [open, setOpen] = useState<boolean | null>(null);
  const view = court.view;
  if (!view || view.status !== 'playing') return null;
  const { isTraitor } = view.me;
  const isRaja = court.myRole === 'raja';
  const expanded = open ?? view.taskIndex === 0;
  const gist = isTraitor ? 'You secretly serve a rival kingdom.' : isRaja ? 'Rule wisely; find the traitor.' : 'You are loyal to the throne.';
  return (
    <section
      className={`rounded-md border-2 p-3 text-sm ${isTraitor ? 'border-sindoor bg-sindoor-deep/80' : 'border-gold/70 bg-stone/80'}`}
      aria-label="Your secret agenda"
    >
      <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen(!expanded)} aria-expanded={expanded}>
        <span>
          <span className="block font-display text-base text-gold-light">🔒 Your secret agenda</span>
          {!expanded && <span className="block text-parchment/80">{gist}</span>}
        </span>
        <span aria-hidden className="text-gold-light">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 text-parchment/90">
          {isTraitor ? (
            <>
              <p>
                <b className="text-gold-light">You are in the pay of a rival kingdom.</b> Enrich yourself and weaken the realm
                — without being named at the final sunset.
              </p>
              <ul className="list-disc pl-4">
                <li>Petitions you judge may come with a bribe.</li>
                <li>At the trial, you can plant a forged report.</li>
                <li>In the famine, your men can divert relief.</li>
                <li>In the siege, a gatekeeper will thin one gate for you.</li>
              </ul>
            </>
          ) : isRaja ? (
            <p>
              Rule wisely. Once, at any sunset, you may test a minister with a false bribe. At the final sunset you may name
              the traitor — if there is one.
            </p>
          ) : (
            <p>
              You are loyal to the throne. One of your fellow ministers may not be. Compare reports, watch the carts, and
              whisper your suspicions to the Raja.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** The "foreign envoy" modal a minister sees when the Raja runs the Loyalty Test. */
export function LoyaltyOffer({ court }: { court: Court }) {
  const offer = court.view?.me.offer;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (offer && !ref.current?.open) ref.current?.showModal();
    if (!offer && ref.current?.open) ref.current.close();
  }, [offer]);
  if (!offer) return null;
  const answer = (accept: boolean) => court.act({ type: 'loyalty/answer', accept });
  return (
    <dialog
      ref={ref}
      className="folio m-auto w-[min(520px,92vw)] p-5 backdrop:bg-black/70"
      onCancel={(e) => e.preventDefault()}
      aria-labelledby="envoy-title"
    >
      <h2 id="envoy-title" className="text-2xl text-sindoor">
        A cloaked envoy
      </h2>
      <p className="mt-2 leading-snug">
        In a dim corridor of the palace, an envoy of a rival kingdom presses a heavy purse into your hands:{' '}
        <b>{offer.amount} gold</b>, yours to keep — if you will leave the eastern postern unbarred on a night of their
        choosing.
      </p>
      <p className="mt-2 text-sm text-ink-soft">No one saw him approach. No one need ever know.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-gold" onClick={() => answer(true)}>
          Take the purse
        </button>
        <button className="btn btn-royal" onClick={() => answer(false)} autoFocus>
          Refuse and send him away
        </button>
      </div>
    </dialog>
  );
}
