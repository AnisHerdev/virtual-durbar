import { createContext, useContext, useEffect, useState } from 'react';
import type { ARPipeline, ARState } from '../ar/ARPipeline';
import type { RagaEngine } from '../audio/RagaEngine';

export interface Media {
  ar: ARPipeline;
  raga: RagaEngine;
  mic: boolean;
  setMic: (on: boolean) => void;
}

export const MediaContext = createContext<Media | null>(null);

export function useMedia(): Media {
  const m = useContext(MediaContext);
  if (!m) throw new Error('useMedia outside MediaContext');
  return m;
}

export function useARState(ar: ARPipeline): ARState {
  const [state, setState] = useState(ar.state);
  useEffect(() => {
    const off = ar.subscribe(setState);
    return () => void off();
  }, [ar]);
  return state;
}

/** A <video> bound to a MediaStream (used for the local AR canvas stream). */
export function StreamVideo({ stream, mirror, className }: { stream: MediaStream; mirror?: boolean; className?: string }) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [el, stream]);
  return (
    <video
      ref={setEl}
      muted
      playsInline
      autoPlay
      className={className}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
}
