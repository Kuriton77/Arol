// Camera with trauma-based screen shake. Rooms are single-screen, so the camera
// mostly stays centred but adds shake and smooth transitions between rooms.
import { clamp } from './math.js';

export class Camera {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.x = 0; this.y = 0;      // top-left offset
    this.ox = 0; this.oy = 0;    // target offset (for room transitions)
    this.trauma = 0;             // 0..1, decays over time
    this._t = 0;
    this.shakeEnabled = true;    // toggled by the Screen Shake setting
  }

  addShake(amount) {
    if (!this.shakeEnabled) return;
    this.trauma = clamp(this.trauma + amount / 20, 0, 1);
  }

  update(dt) {
    this._t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    // Smoothly approach target offset (room transition slide).
    this.x += (this.ox - this.x) * Math.min(1, dt * 9);
    this.y += (this.oy - this.y) * Math.min(1, dt * 9);
  }

  // Returns the shake offset to apply this frame (trauma squared feels punchier).
  shakeOffset() {
    const t = this.trauma * this.trauma;
    if (t <= 0) return { x: 0, y: 0 };
    const mag = 16 * t;
    return {
      x: mag * (Math.sin(this._t * 47) + Math.sin(this._t * 89) * 0.5),
      y: mag * (Math.cos(this._t * 53) + Math.cos(this._t * 71) * 0.5),
    };
  }
}
