// Synthesized sound for Dino Dash — Web Audio API, no asset files (placeholder until real music).
// Browsers require a user gesture to start audio, so call resume() from the Play tap.

export interface RunnerSfx {
  jump?: () => void;
  coin?: () => void;
  smash?: () => void;
  hit?: () => void;
  rune?: () => void;
  boost?: () => void;
}

const MUTE_KEY = 'dinoDashMuted';

export class RunnerAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // ignore (private mode)
    }
  }

  /** Create/resume the audio context. Must be called from a user gesture (the Play tap). */
  resume() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0001;
      this.musicGain.connect(this.master);
    }
    void this.ctx.resume();
  }

  get isMuted() {
    return this.muted;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      // ignore
    }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private tone(o: { freq: number; to?: number; dur: number; type?: OscillatorType; vol?: number; delay?: number }) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (o.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.25, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
  }

  private noise(o: { dur: number; vol?: number; lp?: number }) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * o.dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = o.lp ?? 2000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.03);
  }

  jump() {
    this.tone({ freq: 320, to: 640, dur: 0.16, type: 'square', vol: 0.18 });
  }
  coin() {
    this.tone({ freq: 880, dur: 0.07, type: 'sine', vol: 0.2 });
    this.tone({ freq: 1320, dur: 0.09, type: 'sine', vol: 0.16, delay: 0.06 });
  }
  smash() {
    this.noise({ dur: 0.18, vol: 0.32, lp: 1600 });
    this.tone({ freq: 200, to: 80, dur: 0.18, type: 'square', vol: 0.14 });
  }
  hit() {
    this.tone({ freq: 220, to: 60, dur: 0.3, type: 'sawtooth', vol: 0.28 });
    this.noise({ dur: 0.12, vol: 0.18, lp: 800 });
  }
  rune() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.13, type: 'triangle', vol: 0.18, delay: i * 0.07 }));
  }
  boost() {
    this.tone({ freq: 300, to: 1200, dur: 0.25, type: 'sawtooth', vol: 0.18 });
  }

  /** Gentle looping melody (placeholder for a real track). */
  startMusic() {
    if (!this.ctx || !this.musicGain || this.musicTimer != null) return;
    this.musicGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.musicGain.gain.exponentialRampToValueAtTime(0.14, this.ctx.currentTime + 1.2);
    const notes = [262, 330, 392, 523, 392, 330]; // C E G C G E — upbeat, simple
    let i = 0;
    const step = () => {
      if (!this.ctx || !this.musicGain) return;
      const f = notes[i % notes.length]!;
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(t0);
      osc.stop(t0 + 0.36);
      i++;
    };
    this.musicTimer = window.setInterval(step, 360);
  }

  stopMusic() {
    if (this.musicTimer != null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain && this.ctx) this.musicGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
  }

  dispose() {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
  }
}
