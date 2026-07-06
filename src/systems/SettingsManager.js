// SettingsManager — persistent, data-driven player options.
//
// Every option is one entry in SETTINGS_SCHEMA describing its type, default,
// category, and an apply(value, ctx) hook that pushes the value into the live
// game systems. Adding an option (fullscreen, UI scale, language, key
// rebinding…) is a single schema entry — no changes to the store, UI, or save.
//
// Persistence is a lightweight standalone localStorage blob, independent from
// the run/meta save so wiping progress never resets preferences (and vice
// versa). Missing keys fall back to their schema default, so upgrades and
// first launches "just work".

const KEY = 'arol.settings.v1';

// type: 'slider' (0..1, shown as 0–100%) | 'toggle' (boolean).
// ctx passed to apply(): { audio, game }.
export const SETTINGS_SCHEMA = [
  // --- Audio ---
  { id: 'volMaster', category: 'Audio', label: 'Master Volume', type: 'slider', default: 0.6,
    apply: (v, ctx) => ctx.audio.setVolume('master', v) },
  { id: 'volMusic', category: 'Audio', label: 'Music Volume', type: 'slider', default: 0.4,
    apply: (v, ctx) => ctx.audio.setVolume('music', v) },
  { id: 'volSfx', category: 'Audio', label: 'SFX Volume', type: 'slider', default: 0.7,
    apply: (v, ctx) => ctx.audio.setVolume('sfx', v) },
  { id: 'volUi', category: 'Audio', label: 'UI Volume', type: 'slider', default: 0.6,
    apply: (v, ctx) => ctx.audio.setVolume('ui', v) },

  // --- Interface / accessibility ---
  // Stepped slider (75%–200%). `format: 'percent'` shows value×100. Future
  // accessibility options (Large Text, High Contrast, Colorblind, Font, HUD
  // Opacity/Position…) drop in here as additional schema entries.
  { id: 'uiScale', category: 'Interface', label: 'UI Scale', type: 'slider',
    default: 1.0, min: 0.75, max: 2.0, step: 0.25, format: 'percent',
    apply: (v, ctx) => {
      // Scales the entire presentation (canvas + everything drawn in it).
      if (ctx.game.setPresentationScale) ctx.game.setPresentationScale(v);
      else if (ctx.game.ui) ctx.game.ui.setScale(Math.max(1, v));
    } },

  // --- Visuals (demonstrates the toggle path; more can be added freely) ---
  { id: 'screenShake', category: 'Visuals', label: 'Screen Shake', type: 'toggle', default: true,
    apply: (v, ctx) => { if (ctx.game.camera) ctx.game.camera.shakeEnabled = v; } },
  { id: 'damageNumbers', category: 'Visuals', label: 'Damage Numbers', type: 'toggle', default: true,
    apply: (v, ctx) => { if (ctx.game.damageNumbers) ctx.game.damageNumbers.enabled = v; } },
];

export class SettingsManager {
  constructor() {
    this.values = this._load();
    this.ctx = null; // bound later once systems exist
  }

  _defaults() {
    const d = {};
    for (const s of SETTINGS_SCHEMA) d[s.id] = s.default;
    return d;
  }

  _load() {
    const defaults = this._defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      // Merge over defaults so new/removed options stay consistent.
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
  }

  schemaFor(id) { return SETTINGS_SCHEMA.find((s) => s.id === id); }
  get(id) { return this.values[id]; }

  // Set a value, clamp/snap it to its schema, persist, and apply it live.
  set(id, value) {
    const schema = this.schemaFor(id);
    if (!schema) return;
    let v = value;
    if (schema.type === 'slider') {
      const min = schema.min ?? 0, max = schema.max ?? 1;
      v = Math.max(min, Math.min(max, +value));
      if (schema.step) v = Math.min(max, Math.max(min, Math.round((v - min) / schema.step) * schema.step + min));
    } else if (schema.type === 'toggle') {
      v = !!value;
    }
    this.values[id] = v;
    this.save();
    this._applyOne(schema, v);
  }

  toggle(id) { this.set(id, !this.get(id)); }

  // Connect to live systems and push all current values into them.
  bind(ctx) {
    this.ctx = ctx;
    this.applyAll();
  }

  _applyOne(schema, v) {
    if (this.ctx && schema.apply) schema.apply(v, this.ctx);
  }

  applyAll() {
    if (!this.ctx) return;
    for (const s of SETTINGS_SCHEMA) this._applyOne(s, this.values[s.id]);
  }

  reset() {
    this.values = this._defaults();
    this.save();
    this.applyAll();
  }

  // Categories in declaration order, for the settings UI.
  categories() {
    const seen = [];
    for (const s of SETTINGS_SCHEMA) if (!seen.includes(s.category)) seen.push(s.category);
    return seen;
  }
}
