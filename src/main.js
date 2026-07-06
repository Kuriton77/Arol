// Entry point: wires the canvas, input, audio and save systems into the Game
// and starts the loop. Kept intentionally thin — all logic lives in systems.
import { Game } from './core/Game.js';
import { Input } from './core/Input.js';
import { AudioManager } from './audio/AudioManager.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { CONFIG } from './data/config.js';

function boot() {
  const canvas = document.getElementById('game');
  canvas.width = CONFIG.world.width;
  canvas.height = CONFIG.world.height;

  const input = new Input(canvas);
  const audio = new AudioManager();
  const save = new SaveSystem();

  // Audio context must be created/resumed after a user gesture.
  const unlock = () => { audio.init(); audio.resume(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  const game = new Game(canvas, input, audio, save);
  // Expose for debugging / automated testing.
  window.__AROL__ = game;
  game.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
