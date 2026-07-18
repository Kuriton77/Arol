// Entry point: wires the canvas, input, audio and save systems into the Game
// and starts the loop. Kept intentionally thin — all logic lives in systems.
import { Game } from './core/Game.js';
import { Input } from './core/Input.js';
import { AudioManager } from './audio/AudioManager.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { SettingsManager } from './systems/SettingsManager.js';
import { CONFIG } from './data/config.js';

function boot() {
  const canvas = document.getElementById('game');
  canvas.width = CONFIG.world.width;
  canvas.height = CONFIG.world.height;

  const input = new Input(canvas);
  const audio = new AudioManager();
  const save = new SaveSystem();
  const settings = new SettingsManager(); // loads persisted preferences

  const game = new Game(canvas, input, audio, save, settings);

  // --- Presentation scaling -------------------------------------------------
  // The canvas always renders at the fixed logical resolution; CSS sizes the
  // stage to the largest 16:9 rect that fits the window, multiplied by the
  // UI Scale. ≤100% shrinks the whole presentation; >100% stays at full
  // window fill (never cropping) and grows the interface inside instead.
  // Mouse mapping normalises by the displayed rect, so alignment is automatic.
  const stage = document.getElementById('stage');
  let presentationScale = 1;
  function fitPresentation() {
    const aspect = CONFIG.world.width / CONFIG.world.height;
    const availW = window.innerWidth * 0.985;
    const availH = window.innerHeight - 34; // room for the hint line
    const fitW = Math.min(availW, availH * aspect);
    const s = Math.min(1, presentationScale);
    stage.style.width = Math.max(320, Math.round(fitW * s)) + 'px';
    stage.style.height = Math.max(180, Math.round((fitW * s) / aspect)) + 'px';
    game.ui.setScale(Math.max(1, presentationScale));
  }
  game.setPresentationScale = (v) => { presentationScale = v; fitPresentation(); };
  window.addEventListener('resize', fitPresentation);
  fitPresentation();

  // Bind settings to live systems and push loaded values into them. Volumes
  // land on the (not-yet-created) audio nodes' model and are applied on init().
  settings.bind({ audio, game });

  // Audio context must be created/resumed after a user gesture; re-apply the
  // loaded volumes once the real gain nodes exist.
  const unlock = () => { audio.init(); audio.resume(); settings.applyAll(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // Expose for debugging / automated testing.
  window.__AROL__ = game;
  game.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
