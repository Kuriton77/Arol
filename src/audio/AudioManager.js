// Fully procedural audio via the Web Audio API — no asset files required.
// SFX are short synthesized blips/noise bursts; music is a simple layered
// arpeggio sequencer whose mood switches between explore/combat/boss.
import { CONFIG } from '../data/config.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this._musicTimer = 0;
    this._step = 0;
    this._mood = 'explore';
    this._muted = false;
  }

  // Must be resumed from a user gesture (browser autoplay policy).
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.master;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = CONFIG.audio.music;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = CONFIG.audio.sfx;
    this.sfxGain.connect(this.master);
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this._muted = m;
    if (this.master) this.master.gain.value = m ? 0 : CONFIG.audio.master;
  }
  toggleMute() { this.setMuted(!this._muted); return this._muted; }

  setMood(mood) { this._mood = mood; }

  // --- low level tone helper ---
  _tone(freq, dur, type = 'square', vol = 0.3, dest = null, slide = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(dest || this.sfxGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol = 0.3, filterFreq = 1200) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    src.start(t);
  }

  // --- named SFX ---
  play(name) {
    if (!this.ctx || this._muted) return;
    switch (name) {
      case 'swing':   this._tone(520, 0.09, 'sawtooth', 0.12, null, -260); break;
      case 'hit':     this._tone(180, 0.08, 'square', 0.25, null, -90); this._noise(0.06, 0.15, 2200); break;
      case 'crit':    this._tone(320, 0.12, 'square', 0.3, null, 180); this._noise(0.08, 0.2, 3000); break;
      case 'hurt':    this._tone(140, 0.22, 'sawtooth', 0.3, null, -80); break;
      case 'dash':    this._tone(660, 0.14, 'sine', 0.18, null, 420); break;
      case 'shoot':   this._tone(880, 0.1, 'square', 0.12, null, 260); break;
      case 'enemyhit':this._tone(240, 0.06, 'triangle', 0.14, null, -60); break;
      case 'die':     this._tone(200, 0.3, 'sawtooth', 0.25, null, -160); this._noise(0.25, 0.2, 900); break;
      case 'pickup':  this._tone(700, 0.08, 'sine', 0.2); this._tone(1050, 0.1, 'sine', 0.18); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.18, 'triangle', 0.22), i * 70)); break;
      case 'ui':      this._tone(600, 0.05, 'square', 0.12); break;
      case 'uiconfirm': this._tone(720, 0.07, 'square', 0.15); this._tone(960, 0.08, 'square', 0.13); break;
      case 'bossroar': this._tone(90, 0.6, 'sawtooth', 0.35, null, -30); this._noise(0.5, 0.3, 600); break;
      case 'telegraph': this._tone(440, 0.15, 'sine', 0.14, null, 120); break;
      case 'gameover': [392, 349, 294, 220].forEach((f, i) => setTimeout(() => this._tone(f, 0.35, 'triangle', 0.25), i * 180)); break;
      case 'victory': [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, 'triangle', 0.25), i * 130)); break;
    }
  }

  // Simple step sequencer for background music; mood chooses scale + tempo.
  updateMusic(dt) {
    if (!this.ctx || this._muted || !this.enabled) return;
    const tempo = this._mood === 'boss' ? 0.16 : this._mood === 'combat' ? 0.2 : 0.32;
    this._musicTimer += dt;
    if (this._musicTimer < tempo) return;
    this._musicTimer = 0;

    const scales = {
      explore: [220, 261, 329, 392, 261, 329],
      combat:  [196, 246, 293, 392, 246, 311],
      boss:    [146, 174, 207, 261, 174, 155],
    };
    const scale = scales[this._mood] || scales.explore;
    const note = scale[this._step % scale.length];
    this._step++;

    this._tone(note, tempo * 2.2, 'triangle', 0.06, this.musicGain);
    // Bass on every other step.
    if (this._step % 2 === 0) this._tone(note / 2, tempo * 3, 'sine', 0.09, this.musicGain);
    // Percussive tick in combat/boss.
    if (this._mood !== 'explore' && this._step % 2 === 1) this._noise(0.05, 0.05, 4000);
  }
}
