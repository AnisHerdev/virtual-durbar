// Time-of-day Hindustani Raga soundtrack.
// Plays a recorded track when one exists under public/assets/audio, otherwise
// synthesises a tanpura drone plus a slow bansuri-like phrase generator from
// the raga's aroha / avaroha / pakad. Ragas crossfade as the game phase changes.

import type { RagaDef } from '../content/types';

const LOOKAHEAD_S = 0.6;
const SCHEDULER_MS = 120;
const FADE_S = 2.5;

const semis = (tonic: number, s: number) => tonic * Math.pow(2, s / 12);

interface Voice {
  raga: RagaDef;
  out: GainNode;
  stop: () => void;
}

const fileAvailability = new Map<string, Promise<boolean>>();
function hasRecording(url: string): Promise<boolean> {
  let p = fileAvailability.get(url);
  if (!p) {
    // SPA hosts answer missing files with index.html (200), so check the type.
    p = fetch(url, { method: 'HEAD' })
      .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('audio/'))
      .catch(() => false);
    fileAvailability.set(url, p);
  }
  return p;
}

export class RagaEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: Voice | null = null;
  private wanted: RagaDef | null = null;
  private volume = 0.5;
  private muted = false;

  get current(): RagaDef | null {
    return this.wanted;
  }

  /** Must be called from a user gesture at least once (autoplay policy). */
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.wanted && !this.voice) void this.play(this.wanted);
  }

  get unlocked() {
    return this.ctx?.state === 'running';
  }

  setVolume(v: number) {
    this.volume = v;
    this.applyGain();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyGain();
  }

  private applyGain() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.2);
  }

  async play(raga: RagaDef) {
    this.wanted = raga;
    if (!this.ctx || !this.master) return; // starts on unlock()
    if (this.voice?.raga.id === raga.id) return;

    const old = this.voice;
    const next = (raga.file && (await hasRecording(raga.file)))
      ? this.recordedVoice(raga, raga.file)
      : this.synthVoice(raga);
    if (this.wanted?.id !== raga.id) {
      next.stop(); // superseded while we were checking for a file
      return;
    }
    const t = this.ctx.currentTime;
    next.out.gain.setValueAtTime(0, t);
    next.out.gain.linearRampToValueAtTime(1, t + FADE_S);
    if (old) {
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setValueAtTime(old.out.gain.value, t);
      old.out.gain.linearRampToValueAtTime(0, t + FADE_S);
      setTimeout(old.stop, FADE_S * 1000 + 100);
    }
    this.voice = next;
  }

  stopAll() {
    this.voice?.stop();
    this.voice = null;
    this.wanted = null;
  }

  private recordedVoice(raga: RagaDef, url: string): Voice {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.connect(this.master!);
    const el = new Audio(url);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(el);
    src.connect(out);
    void el.play().catch(() => undefined);
    return {
      raga,
      out,
      stop: () => {
        el.pause();
        src.disconnect();
        out.disconnect();
      },
    };
  }

  private synthVoice(raga: RagaDef): Voice {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.connect(this.master!);

    // A little room: feedback delay as a cheap reverb.
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(out);
    const bus = ctx.createGain();
    bus.connect(out);
    bus.connect(delay);

    const tonic = raga.tonicHz;
    // Tanpura string cycle: Pa (low), Sa, Sa, Sa (low octave).
    const strings = [-5, 0, 0, -12];
    const pluckGap = 1.35 / Math.max(0.4, raga.tempo * 0.9 + 0.3);
    let nextPluck = ctx.currentTime + 0.1;
    let stringIndex = 0;

    const melody = new MelodyGenerator(raga);
    let nextNote = ctx.currentTime + 2.5;
    const lead = ctx.createOscillator();
    lead.type = 'triangle';
    const leadFilter = ctx.createBiquadFilter();
    leadFilter.type = 'lowpass';
    leadFilter.frequency.value = 1800;
    const leadGain = ctx.createGain();
    leadGain.gain.value = 0;
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.2;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = 3;
    vibrato.connect(vibratoDepth).connect(lead.frequency);
    lead.connect(leadFilter).connect(leadGain).connect(bus);
    lead.frequency.value = semis(tonic * 2, 0);
    lead.start();
    vibrato.start();

    const pluck = (when: number, freq: number) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 6;
      // The jawari "buzz": a bright filter sweep that slowly closes.
      filter.frequency.setValueAtTime(freq * 9, when);
      filter.frequency.exponentialRampToValueAtTime(freq * 2.2, when + 3.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.09, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, when + 4.5);
      osc.connect(filter).connect(g).connect(bus);
      osc.start(when);
      osc.stop(when + 4.6);
    };

    const scheduler = setInterval(() => {
      const horizon = ctx.currentTime + LOOKAHEAD_S;
      while (nextPluck < horizon) {
        pluck(nextPluck, semis(tonic, strings[stringIndex % strings.length]));
        stringIndex++;
        nextPluck += pluckGap * (stringIndex % 4 === 0 ? 1.6 : 1);
      }
      while (nextNote < horizon) {
        const note = melody.next();
        const dur = note.beats / raga.tempo;
        if (note.semitone === null) {
          leadGain.gain.setTargetAtTime(0, nextNote, 0.25);
        } else {
          const f = semis(tonic * 2, note.semitone);
          // Meend: glide into the note rather than jumping.
          lead.frequency.setTargetAtTime(f, nextNote, note.glide ? 0.12 : 0.02);
          leadGain.gain.setTargetAtTime(0.05, nextNote, 0.08);
          leadGain.gain.setTargetAtTime(0.028, nextNote + dur * 0.6, 0.3);
        }
        nextNote += dur;
      }
    }, SCHEDULER_MS);

    return {
      raga,
      out,
      stop: () => {
        clearInterval(scheduler);
        const t = ctx.currentTime;
        leadGain.gain.setTargetAtTime(0, t, 0.1);
        lead.stop(t + 0.5);
        vibrato.stop(t + 0.5);
        setTimeout(() => out.disconnect(), 5000);
      },
    };
  }
}

interface Note {
  semitone: number | null; // null = rest
  beats: number;
  glide: boolean;
}

/** Wanders the raga's scale: ascend by aroha, descend by avaroha, return to the pakad. */
export class MelodyGenerator {
  private queue: Note[] = [];
  private rng: () => number;

  constructor(
    private raga: RagaDef,
    seed = 1,
  ) {
    let s = seed * 9301 + 49297;
    this.rng = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  }

  next(): Note {
    if (!this.queue.length) this.refill();
    return this.queue.shift()!;
  }

  private refill() {
    const r = this.rng();
    const { aroha, avaroha, pakad } = this.raga;
    if (r < 0.35) {
      // State the pakad â€” the raga's identity.
      pakad.forEach((s, i) => this.queue.push({ semitone: s, beats: i === pakad.length - 1 ? 3 : 1, glide: i > 0 }));
    } else if (r < 0.7) {
      // Climb part of the aroha from the current position.
      const start = Math.floor(this.rng() * Math.max(1, aroha.length - 3));
      const len = 3 + Math.floor(this.rng() * 3);
      for (let i = start; i < Math.min(aroha.length, start + len); i++) {
        this.queue.push({ semitone: aroha[i], beats: this.rng() < 0.3 ? 2 : 1, glide: true });
      }
    } else {
      const start = Math.floor(this.rng() * Math.max(1, avaroha.length - 3));
      const len = 3 + Math.floor(this.rng() * 4);
      for (let i = start; i < Math.min(avaroha.length, start + len); i++) {
        this.queue.push({ semitone: avaroha[i], beats: 1, glide: true });
      }
    }
    // Rest on Sa, then breathe.
    this.queue.push({ semitone: 0, beats: 2.5, glide: true });
    this.queue.push({ semitone: null, beats: 1.5 + this.rng() * 2, glide: false });
  }
}

export function ragaForPhase(ragas: RagaDef[], phase: string): RagaDef {
  return ragas.find((r) => r.phases.includes(phase as RagaDef['phases'][number])) ?? ragas[0];
}
