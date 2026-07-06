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
  }

  // Begin a frame of UI (call once before declaring widgets).
  begin() {
    this._hoveredAny = false;
    // Drop the drag latch as soon as the mouse is released.
    if (!this.input.mouse.down) this._activeSlider = null;
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
    const m = this.input.mouse;
    const hover = m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;
    const clicked = hover && m.pressed;
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

  dim(alpha = 0.6) {
    const c = this.ctx;
    c.fillStyle = `rgba(6,8,16,${alpha})`;
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  }

  // Draggable horizontal slider (immediate-mode). `id` latches the active drag
  // across frames so the value updates live while the mouse is held anywhere.
  // Returns the current value in [0,1]; caller compares to detect changes.
  slider(x, y, w, id, value, opts = {}) {
    const c = this.ctx;
    const m = this.input;
    const h = opts.height ?? 8;
    const cy = y + h / 2;
    const pad = 10; // generous vertical hit padding for the track
    const overTrack = m.mouse.x >= x - 8 && m.mouse.x <= x + w + 8 &&
                      m.mouse.y >= cy - pad && m.mouse.y <= cy + pad;
    if (m.mouse.pressed && overTrack) this._activeSlider = id;
    let v = clamp(value, 0, 1);
    if (this._activeSlider === id) v = clamp((m.mouse.x - x) / w, 0, 1);

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
