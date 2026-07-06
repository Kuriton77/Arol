// Tiny immediate-mode UI toolkit. Each frame the active screen declares its
// buttons/panels; UI both draws them and reports clicks/hover using the shared
// Input. This keeps menu code declarative and avoids callback plumbing.
import { clamp } from '../core/math.js';

export class UI {
  constructor(ctx, input, audio) {
    this.ctx = ctx;
    this.input = input;
    this.audio = audio;
    this._hoverPrev = null;
    this._activeSlider = null; // id of the slider currently being dragged
    // Single global UI scale (set from the UI Scale setting). Widgets are
    // drawn in the fixed 960×540 design space; a scale transform about an
    // anchor resizes them, and mouse coords are mapped by the same transform
    // so hit-testing always aligns. Centered overlays scale about the centre;
    // the HUD scales each cluster about its own screen corner.
    this.scale = 1;
    this.mx = 0; this.my = 0; // design-space mouse for centre-anchored widgets
  }

  setScale(s) { this.scale = s; }

  get _cx() { return this.ctx.canvas.width / 2; }
  get _cy() { return this.ctx.canvas.height / 2; }

  // Scale transform about an arbitrary screen anchor (absolute canvas px).
  pushAnchor(ax, ay) {
    const c = this.ctx;
    c.save();
    c.translate(ax, ay); c.scale(this.scale, this.scale); c.translate(-ax, -ay);
  }
  pushCenter() { this.pushAnchor(this._cx, this._cy); }
  pop() { this.ctx.restore(); }

  // Map a raw canvas mouse coord back into design space for a given anchor,
  // so scaled widgets hit-test correctly.
  _unproject(px, py, ax, ay) {
    return { x: ax + (px - ax) / this.scale, y: ay + (py - ay) / this.scale };
  }

  // Begin a frame of UI (call once before declaring widgets). Precomputes the
  // centre-anchored design-space mouse used by all interactive widgets (which
  // only ever live in centre-scaled overlays).
  begin() {
    this._hoveredAny = false;
    if (!this.input.mouse.down) this._activeSlider = null;
    const m = this._unproject(this.input.mouse.x, this.input.mouse.y, this._cx, this._cy);
    this.mx = m.x; this.my = m.y;
  }

  panel(x, y, w, h, opts = {}) {
    const c = this.ctx;
    c.save();
    c.fillStyle = opts.fill || 'rgba(18,20,32,0.92)';
    c.strokeStyle = opts.stroke || 'rgba(120,140,200,0.5)';
    c.lineWidth = opts.lineWidth || 2;
    roundRect(c, x, y, w, h, opts.radius ?? 12);
    c.fill();
    if (opts.stroke !== 'none') c.stroke();
    c.restore();
  }

  text(str, x, y, opts = {}) {
    const c = this.ctx;
    c.save();
    c.font = opts.font || '16px "Trebuchet MS", system-ui, sans-serif';
    c.fillStyle = opts.color || '#e8ecf5';
    c.textAlign = opts.align || 'left';
    c.textBaseline = opts.baseline || 'alphabetic';
    if (opts.shadow) { c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 4; c.shadowOffsetY = 1; }
    c.fillText(str, x, y);
    c.restore();
  }

  // Returns true on the frame the button is clicked.
  button(x, y, w, h, label, opts = {}) {
    const c = this.ctx;
    // Use the scale-mapped design-space mouse so hit areas match what's drawn.
    const mx = this.mx, my = this.my;
    const hover = mx >= x && mx <= x + w && my >= y && my <= y + h;
    const clicked = hover && this.input.mouse.pressed;
    if (hover) this._hoveredAny = true;

    c.save();
    const base = opts.color || '#2a3a66';
    c.fillStyle = hover ? (opts.hoverColor || '#3d5599') : base;
    c.strokeStyle = opts.stroke || (hover ? '#8fb0ff' : 'rgba(140,160,220,0.55)');
    c.lineWidth = 2;
    roundRect(c, x, y, w, h, opts.radius ?? 10);
    c.fill(); c.stroke();
    c.fillStyle = opts.textColor || '#f0f3fb';
    c.font = opts.font || 'bold 18px "Trebuchet MS", system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(label, x + w / 2, y + h / 2 + 1);
    c.restore();

    if (clicked && this.audio) this.audio.play('uiconfirm');
    return clicked;
  }

  // Horizontal progress/stat bar.
  bar(x, y, w, h, frac, color, opts = {}) {
    const c = this.ctx;
    frac = Math.max(0, Math.min(1, frac));
    c.save();
    c.fillStyle = opts.bg || 'rgba(0,0,0,0.55)';
    roundRect(c, x, y, w, h, opts.radius ?? h / 2);
    c.fill();
    if (frac > 0) {
      c.fillStyle = color;
      roundRect(c, x, y, Math.max(h, w * frac), h, opts.radius ?? h / 2);
      c.fill();
    }
    if (opts.stroke) {
      c.strokeStyle = opts.stroke; c.lineWidth = 1.5;
      roundRect(c, x, y, w, h, opts.radius ?? h / 2); c.stroke();
    }
    c.restore();
  }

  // Full-screen backdrops always cover the viewport regardless of UI scale, so
  // they're drawn in identity space (the scale transform is reset then restored).
  fillScreen(style) {
    const c = this.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = style;
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
  }
  dim(alpha = 0.6) { this.fillScreen(`rgba(6,8,16,${alpha})`); }

  // Draggable horizontal slider (immediate-mode). `id` latches the active drag
  // across frames so the value updates live while the mouse is held anywhere.
  // Returns the current value in [0,1]; caller compares to detect changes.
  slider(x, y, w, id, value, opts = {}) {
    const c = this.ctx;
    const h = opts.height ?? 8;
    const cy = y + h / 2;
    const pad = 10; // generous vertical hit padding for the track
    // Scale-mapped mouse so the grab point matches the drawn handle.
    const mx = this.mx, my = this.my;
    const overTrack = mx >= x - 8 && mx <= x + w + 8 && my >= cy - pad && my <= cy + pad;
    if (this.input.mouse.pressed && overTrack) this._activeSlider = id;
    let v = clamp(value, 0, 1);
    if (this._activeSlider === id) v = clamp((mx - x) / w, 0, 1);

    const accent = opts.color || '#63b8ff';
    // Track.
    c.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(c, x, cy - h / 2, w, h, h / 2); c.fill();
    // Fill.
    c.fillStyle = accent;
    roundRect(c, x, cy - h / 2, Math.max(h, w * v), h, h / 2); c.fill();
    // Handle.
    const hx = x + w * v;
    c.fillStyle = this._activeSlider === id ? '#ffffff' : '#dde8ff';
    c.strokeStyle = accent; c.lineWidth = 2;
    c.beginPath(); c.arc(hx, cy, opts.handle ?? 8, 0, Math.PI * 2); c.fill(); c.stroke();
    return v;
  }
}

export function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
