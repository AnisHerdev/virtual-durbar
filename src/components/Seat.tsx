import { useTracks, VideoTrack } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { roleDef, useContent } from '../content/loadContent';
import type { RoleId } from '../content/types';
import type { Court } from '../game/useCourt';
import { StreamVideo, useARState, useMedia } from './media';

export interface SeatBadge {
  text: string;
  tone: 'gold' | 'lapis' | 'sindoor' | 'peacock';
}

const TONES: Record<SeatBadge['tone'], string> = {
  gold: 'bg-gold text-ink',
  lapis: 'bg-lapis text-parchment',
  sindoor: 'bg-sindoor text-parchment',
  peacock: 'bg-peacock text-parchment',
};

export function Seat({
  court,
  role,
  throne,
  speaking,
  badges = [],
}: {
  court: Court;
  role: RoleId;
  throne?: boolean;
  speaking: Set<string>;
  badges?: SeatBadge[];
}) {
  const content = useContent();
  const def = roleDef(content, role);
  const inGame = court.view?.players.find((p) => p.role === role);
  const claimant = [...court.roles].find(([, r]) => r === role)?.[0];
  const identity = inGame?.identity ?? claimant;
  const name = inGame?.name ?? court.peers.find((p) => p.identity === identity)?.name;
  const away = inGame ? !inGame.connected : false;
  const isSelf = identity === court.selfIdentity;

  return (
    <figure className={`flex min-w-0 flex-col items-center ${away ? 'opacity-50' : ''}`}>
      <div className={`seat-frame arch relative w-full ${identity && speaking.has(identity) ? 'speaking' : ''}`}>
        <div className={`arch relative overflow-hidden bg-stone ${throne ? 'aspect-[3/4]' : 'aspect-[4/3]'}`}>
          {identity ? (
            isSelf ? (
              <SelfVideo />
            ) : court.transport.kind === 'livekit' ? (
              <RemoteVideo identity={identity} emblem={def.emblem} color={def.color} />
            ) : (
              <Emblem emblem={def.emblem} color={def.color} note="Rehearsal: video stays in its own tab" />
            )
          ) : (
            <Emblem emblem={def.emblem} color={def.color} note="Vacant seat" faded />
          )}
          {badges.length > 0 && (
            <div className="absolute inset-x-1 bottom-1 flex flex-wrap justify-center gap-1">
              {badges.map((b) => (
                <span key={b.text} className={`rounded px-1.5 text-xs font-semibold shadow ${TONES[b.tone]}`}>
                  {b.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <figcaption className="-mt-2 w-[92%] rounded-b-md border-2 border-t-0 border-gold bg-sindoor-deep px-2 pb-1 pt-2 text-center leading-tight">
        <span className="block truncate font-display text-[0.95rem] text-gold-light" title={def.title}>
          <span aria-hidden style={{ color: def.color }} className="mr-1 [text-shadow:0_0_2px_#f3e3c3]">
            {def.emblem}
          </span>
          {def.title}
        </span>
        <span className="block truncate text-sm text-parchment/85">
          {name ? `${name}${isSelf ? ' (you)' : ''}${away ? ' · away' : ''}` : '—'}
        </span>
      </figcaption>
    </figure>
  );
}

function SelfVideo() {
  const { ar } = useMedia();
  // Mirror only a live camera; the painted placeholder contains text.
  const live = useARState(ar).status === 'running';
  return <StreamVideo stream={ar.getStream()} mirror={live} className="h-full w-full object-cover" />;
}

function RemoteVideo({ identity, emblem, color }: { identity: string; emblem: string; color: string }) {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const ref = tracks.find((t) => t.participant.identity === identity);
  if (!ref?.publication) return <Emblem emblem={emblem} color={color} note="Camera arriving…" />;
  return <VideoTrack trackRef={ref} className="h-full w-full object-cover" />;
}

function Emblem({ emblem, color, note, faded }: { emblem: string; color: string; note?: string; faded?: boolean }) {
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-1 bg-[radial-gradient(circle,#4a3426,#221610)] ${faded ? 'opacity-60' : ''}`}
    >
      <span
        aria-hidden
        className="grid size-16 place-items-center rounded-full border-4 bg-parchment text-4xl"
        style={{ borderColor: color, color }}
      >
        {emblem}
      </span>
      {note && <span className="px-2 text-center text-xs text-parchment/70">{note}</span>}
    </div>
  );
}
