// ----------------------------------------------------------------------------
// All sound is synthesized with the WebAudio API — no asset files. A soft
// ambient drone pad, a sparkly pickup arpeggio, footstep ticks and UI blips.
// Audio only starts after a user gesture (the Play button) per browser policy.
// ----------------------------------------------------------------------------

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
    this._stepToggle = 0;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.started = true;
    this._startAmbient();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.5, this.ctx.currentTime + 0.3);
    }
  }

  // Layered detuned oscillators softly drifting = a calm ambient pad.
  _startAmbient() {
    const notes = [110, 164.81, 220, 277.18]; // A minor-ish pad
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.0;
    this.ambientGain.connect(this.master);
    this.ambientGain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 4);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.connect(this.ambientGain);

    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = f * 0.004;
      lfo.connect(lfoGain).connect(osc.frequency);
      const g = this.ctx.createGain();
      g.gain.value = 0.25;
      osc.connect(g).connect(filter);
      osc.start(); lfo.start();
    });

    // slow filter sweep for movement
    const sweep = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      filter.frequency.cancelScheduledValues(t);
      filter.frequency.linearRampToValueAtTime(500 + Math.random() * 700, t + 6);
      this._sweepTimer = setTimeout(sweep, 6000);
    };
    sweep();
  }

  _blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Bright ascending arpeggio for a gem pickup.
  pickup() {
    const base = 523.25; // C5
    const steps = [0, 4, 7, 12]; // major-ish
    steps.forEach((s, i) => {
      const f = base * Math.pow(2, s / 12);
      this._blip(f, 0.3, 'triangle', 0.22, i * 0.06);
    });
  }

  footstep() {
    this._stepToggle ^= 1;
    this._blip(this._stepToggle ? 90 : 70, 0.12, 'sine', 0.12);
  }

  uiClick() { this._blip(660, 0.08, 'square', 0.08); }
  jump() { this._blip(330, 0.18, 'sine', 0.14); this._blip(495, 0.16, 'sine', 0.1, 0.04); }

  // A short band-passed noise burst sweeping down = a watery splash.
  splash() {
    if (!this.ctx || this.muted) return;
    if (!this._noiseBuf) {
      const len = (this.ctx.sampleRate * 1) | 0;
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = b;
    }
    const t = this.ctx.currentTime;
    const dur = 0.32;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(1500, t);
    filter.frequency.exponentialRampToValueAtTime(450, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
