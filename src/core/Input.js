// Keyboard + mouse input. Exposes queryable state plus edge-triggered "pressed".
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys that went down this frame
    this.mouse = { x: 0, y: 0, down: false, pressed: false };
    this._downThisFrame = new Set();
    this._mousePressedPending = false;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this._downThisFrame.add(k);
      this.keys.add(k);
      // Prevent page scroll on space / arrows during play.
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    canvas.addEventListener('mousemove', (e) => this._updateMouse(e));
    canvas.addEventListener('mousedown', (e) => {
      this._updateMouse(e);
      this.mouse.down = true;
      this._mousePressedPending = true;
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    // Lose focus safety: clear held keys so player doesn't run off forever.
    window.addEventListener('blur', () => this.keys.clear());
  }

  _updateMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    // Map from CSS pixels to canvas logical pixels.
    this.mouse.x = (e.clientX - r.left) * (this.canvas.width / r.width);
    this.mouse.y = (e.clientY - r.top) * (this.canvas.height / r.height);
  }

  // Call once per frame AFTER systems have read input.
  postUpdate() {
    this._downThisFrame.clear();
    this.mouse.pressed = false;
  }

  // Call at the start of frame to promote pending edge events.
  preUpdate() {
    this.pressed = new Set(this._downThisFrame);
    this.mouse.pressed = this._mousePressedPending;
    this._mousePressedPending = false;
  }

  isDown(...ks) { return ks.some((k) => this.keys.has(k)); }
  wasPressed(...ks) { return ks.some((k) => this.pressed.has(k)); }

  // Normalised movement axis from WASD / arrows.
  moveAxis() {
    let x = 0, y = 0;
    if (this.isDown('a', 'arrowleft')) x -= 1;
    if (this.isDown('d', 'arrowright')) x += 1;
    if (this.isDown('w', 'arrowup')) y -= 1;
    if (this.isDown('s', 'arrowdown')) y += 1;
    const len = Math.hypot(x, y);
    if (len > 0) { x /= len; y /= len; }
    return { x, y };
  }
}
