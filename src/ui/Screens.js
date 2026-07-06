// Full-screen overlay screens (menu, boon/shop selection, pause, game over,
// victory). Uses the immediate-mode UI helper; reads/mutates Game via methods.
import { GAME_STATE } from '../data/config.js';
import { META_UPGRADES, WEAPONS } from '../data/meta.js';
import { RARITY } from '../data/upgrades.js';
import { roundRect } from './UI.js';

export class Screens {
  constructor(game) {
    this.game = game;
    this.ui = game.ui;
    this.ctx = game.ctx;
  }

  get W() { return this.ctx.canvas.width; }
  get H() { return this.ctx.canvas.height; }

  // ------------------------------------------------------------------- menu
  menu() {
    const c = this.ctx, ui = this.ui, g = this.game;
    // Backdrop gradient.
    const grad = c.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, '#0b0e18'); grad.addColorStop(1, '#141024');
    c.fillStyle = grad; c.fillRect(0, 0, this.W, this.H);

    ui.text('A R O L', this.W / 2, 62, { font: 'bold 52px "Trebuchet MS", system-ui', align: 'center', color: '#eaf1ff', shadow: true });
    ui.text('a rogue-lite dungeon crawler', this.W / 2, 92, { font: '16px "Trebuchet MS", system-ui', align: 'center', color: '#8fa4cc' });
    ui.text(`✦ ${g.save.data.souls} souls`, this.W / 2, 118, { font: 'bold 18px system-ui', align: 'center', color: '#b48cff' });

    // Meta upgrades (left).
    ui.panel(24, 140, 300, 350);
    ui.text('PERMANENT UPGRADES', 40, 166, { font: 'bold 14px system-ui', color: '#9fb2dd' });
    let y = 184;
    for (const m of META_UPGRADES) {
      const lvl = g.save.metaLevel(m.id);
      const maxed = lvl >= m.maxLevel;
      const cost = Math.round(m.baseCost * Math.pow(m.costGrowth, lvl));
      ui.text(m.name, 40, y + 14, { font: 'bold 14px system-ui', color: '#e8ecf5' });
      ui.text(m.desc(lvl + (maxed ? 0 : 1)), 40, y + 30, { font: '11px system-ui', color: '#8ea0c4' });
      // Level pips.
      for (let i = 0; i < m.maxLevel; i++) {
        c.fillStyle = i < lvl ? '#b48cff' : 'rgba(120,130,170,0.3)';
        c.fillRect(40 + i * 12, y + 38, 8, 6);
      }
      const label = maxed ? 'MAX' : `${cost}✦`;
      const affordable = !maxed && g.save.data.souls >= cost;
      if (ui.button(238, y + 6, 70, 36, label, {
        color: maxed ? '#2a2a3a' : affordable ? '#3a2a66' : '#232436',
        hoverColor: affordable ? '#553d99' : '#232436',
        font: 'bold 13px system-ui',
      }) && affordable) {
        g.save.spendSouls(cost);
        g.save.setMetaLevel(m.id, lvl + 1);
      }
      y += 62;
    }

    // Weapons (right).
    ui.panel(this.W - 324, 140, 300, 350);
    ui.text('WEAPON', this.W - 308, 166, { font: 'bold 14px system-ui', color: '#9fb2dd' });
    y = 184;
    for (const w of WEAPONS) {
      const unlocked = g.save.isWeaponUnlocked(w.id);
      const selected = g.save.data.selectedWeapon === w.id;
      const x = this.W - 308;
      if (selected) {
        c.fillStyle = 'rgba(99,184,255,0.12)';
        roundRect(c, x - 8, y - 4, 284, 74, 8); c.fill();
        c.strokeStyle = '#63b8ff'; c.lineWidth = 2; roundRect(c, x - 8, y - 4, 284, 74, 8); c.stroke();
      }
      ui.text(w.name + (selected ? '  ◄' : ''), x, y + 14, { font: 'bold 15px system-ui', color: unlocked ? '#e8ecf5' : '#7a86a2' });
      ui.text(w.desc, x, y + 32, { font: '11px system-ui', color: '#8ea0c4' });
      const label = unlocked ? (selected ? 'EQUIPPED' : 'EQUIP') : `${w.cost}✦`;
      const affordable = unlocked || g.save.data.souls >= w.cost;
      if (ui.button(x + 176, y + 8, 88, 34, label, {
        color: selected ? '#24405f' : affordable ? '#2a3a66' : '#232436',
        font: 'bold 12px system-ui',
      })) {
        if (unlocked) g.save.selectWeapon(w.id);
        else if (affordable) { g.save.spendSouls(w.cost); g.save.unlockWeapon(w.id); g.save.selectWeapon(w.id); }
      }
      y += 84;
    }

    // Start + controls.
    if (ui.button(this.W / 2 - 130, 400, 260, 56, '▶  START RUN', { font: 'bold 22px system-ui', color: '#2f6f4f', hoverColor: '#3f9968' })) {
      g.audio.resume();
      g.startRun();
    }
    const st = g.save.data.stats;
    ui.text(`Runs ${st.runs}  ·  Wins ${st.wins}  ·  Kills ${st.kills}  ·  Best Floor ${st.bestDepth}`,
      this.W / 2, 474, { font: '12px system-ui', align: 'center', color: '#7787a8' });
    ui.text('WASD / Arrows move  ·  Mouse aim  ·  Click attack  ·  Space dash  ·  Esc pause  ·  M mute',
      this.W / 2, 498, { font: '12px system-ui', align: 'center', color: '#66759a' });
    ui.text('v1.0 MVP', this.W - 44, this.H - 12, { font: '11px system-ui', align: 'center', color: '#44506a' });
  }

  // -------------------------------------------------------- boon / shop screen
  upgrade() {
    const c = this.ctx, ui = this.ui, g = this.game;
    ui.dim(0.72);
    const shop = g.shopMode;
    const items = shop ? g.shopItems : g.upgradeChoices;

    ui.text(shop ? 'SHOP' : 'CHOOSE A BOON', this.W / 2, 78,
      { font: 'bold 34px "Trebuchet MS", system-ui', align: 'center', color: '#eaf1ff', shadow: true });
    if (shop) ui.text(`◆ ${g.player.gold} gold`, this.W / 2, 108, { font: 'bold 18px system-ui', align: 'center', color: '#ffd23f' });
    else ui.text('press 1 · 2 · 3 or click', this.W / 2, 108, { font: '14px system-ui', align: 'center', color: '#8fa4cc' });

    const cardW = 260, cardH = 300, gap = 30;
    const total = items.length * cardW + (items.length - 1) * gap;
    const x0 = (this.W - total) / 2, y0 = 140;

    items.forEach((it, i) => {
      const u = shop ? it.upgrade : it;
      const rar = RARITY[u.rarity];
      const x = x0 + i * (cardW + gap);
      const m = this.ui.input.mouse;
      const hover = m.x >= x && m.x <= x + cardW && m.y >= y0 && m.y <= y0 + cardH;

      // Card.
      c.save();
      c.fillStyle = hover ? '#1c2236' : '#161b2c';
      roundRect(c, x, y0, cardW, cardH, 14); c.fill();
      c.strokeStyle = rar.color; c.lineWidth = hover ? 4 : 2.5;
      c.shadowColor = rar.color; c.shadowBlur = hover ? 22 : 8;
      roundRect(c, x, y0, cardW, cardH, 14); c.stroke();
      c.restore();

      // Rarity ribbon.
      c.fillStyle = rar.color;
      ui.text(rar.label.toUpperCase(), x + cardW / 2, y0 + 34, { font: 'bold 13px system-ui', align: 'center', color: rar.color });
      // Icon glyph.
      c.fillStyle = rar.color; c.globalAlpha = 0.9;
      c.beginPath(); c.arc(x + cardW / 2, y0 + 96, 34, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      c.fillStyle = '#0c0f18'; ui.text(u.name[0], x + cardW / 2, y0 + 106, { font: 'bold 34px system-ui', align: 'center', color: '#0c0f18' });

      ui.text(u.name, x + cardW / 2, y0 + 158, { font: 'bold 19px system-ui', align: 'center', color: '#f0f3fb' });
      // Wrapped description.
      this._wrap(u.desc, x + cardW / 2, y0 + 186, cardW - 40, 18, { align: 'center', color: '#c3cee6', font: '14px system-ui' });

      if (shop) {
        const affordable = !it.bought && g.player.gold >= it.cost;
        const label = it.bought ? 'PURCHASED' : `Buy — ${it.cost}◆`;
        if (ui.button(x + 30, y0 + cardH - 52, cardW - 60, 38, label, {
          color: it.bought ? '#2a3a2f' : affordable ? '#7a5a1f' : '#3a3a2a',
          hoverColor: affordable ? '#a87d2c' : '#3a3a2a',
        })) g._buyShopItem(it);
      } else {
        if (ui.button(x + 30, y0 + cardH - 52, cardW - 60, 38, `Choose  [${i + 1}]`, { color: '#2a3a66' })) g._pickUpgrade(u);
      }
      c.shadowBlur = 0;
    });

    // Number-key selection for boons.
    if (!shop) {
      const inp = this.ui.input;
      for (let i = 0; i < items.length; i++) {
        if (inp.wasPressed(String(i + 1))) { g._pickUpgrade(items[i]); break; }
      }
    } else {
      if (ui.button(this.W / 2 - 90, y0 + cardH + 30, 180, 44, 'Leave Shop', { color: '#3a3a4a', hoverColor: '#4a4a5f' })) g._closeShop();
    }
  }

  _wrap(text, cx, y, maxW, lh, opts) {
    const c = this.ctx;
    c.font = opts.font;
    const words = text.split(' ');
    let line = '', lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (c.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.forEach((ln, i) => this.ui.text(ln, cx, y + i * lh, opts));
  }

  // ------------------------------------------------------------------- pause
  pause() {
    const ui = this.ui, g = this.game;
    ui.dim(0.6);
    ui.text('PAUSED', this.W / 2, this.H / 2 - 110, { font: 'bold 40px system-ui', align: 'center', color: '#eaf1ff' });
    const bx = this.W / 2 - 120;
    if (ui.button(bx, this.H / 2 - 50, 240, 46, 'Resume', { color: '#2f6f4f', hoverColor: '#3f9968' })) g._setState(GAME_STATE.PLAYING);
    if (ui.button(bx, this.H / 2 + 6, 240, 46, g.audio._muted ? 'Unmute (M)' : 'Mute (M)')) g.audio.toggleMute();
    if (ui.button(bx, this.H / 2 + 62, 240, 46, 'Abandon Run', { color: '#6f2f38', hoverColor: '#993f4a' })) {
      g._commitRun(false);
      g._setState(GAME_STATE.MENU);
    }
  }

  // --------------------------------------------------------------- game over
  gameOver() {
    const c = this.ctx, ui = this.ui, g = this.game;
    ui.dim(0.75);
    c.fillStyle = 'rgba(120,20,30,0.15)'; c.fillRect(0, 0, this.W, this.H);
    ui.text('YOU DIED', this.W / 2, this.H / 2 - 120, { font: 'bold 48px system-ui', align: 'center', color: '#ff5a6a', shadow: true });
    ui.text(`Floor ${g.floor}  ·  ${g.kills} kills  ·  ${g.roomsCleared} rooms cleared`,
      this.W / 2, this.H / 2 - 66, { font: '18px system-ui', align: 'center', color: '#d8dced' });
    ui.text(`✦ ${g._lastSouls || 0} souls banked`, this.W / 2, this.H / 2 - 36, { font: 'bold 18px system-ui', align: 'center', color: '#b48cff' });
    const bx = this.W / 2 - 120;
    if (ui.button(bx, this.H / 2 + 10, 240, 48, 'Try Again', { color: '#2f6f4f', hoverColor: '#3f9968' })) g.startRun();
    if (ui.button(bx, this.H / 2 + 70, 240, 48, 'Main Menu')) g._setState(GAME_STATE.MENU);
  }

  // ----------------------------------------------------------------- victory
  victory() {
    const c = this.ctx, ui = this.ui, g = this.game;
    ui.dim(0.7);
    c.fillStyle = 'rgba(120,90,20,0.14)'; c.fillRect(0, 0, this.W, this.H);
    ui.text('VICTORY', this.W / 2, this.H / 2 - 130, { font: 'bold 52px system-ui', align: 'center', color: '#ffd23f', shadow: true });
    ui.text('The Hollow King has fallen', this.W / 2, this.H / 2 - 86, { font: '18px system-ui', align: 'center', color: '#ffe6a8' });
    ui.text(`Floor ${g.floor}  ·  ${g.kills} kills  ·  ✦ ${g._lastSouls || 0} souls banked`,
      this.W / 2, this.H / 2 - 54, { font: 'bold 16px system-ui', align: 'center', color: '#d8dced' });
    const bx = this.W / 2 - 130;
    if (ui.button(bx, this.H / 2, 260, 48, '▼  Descend Deeper', { color: '#5a3a7a', hoverColor: '#7a52a8' })) g._descend();
    if (ui.button(bx, this.H / 2 + 60, 260, 48, 'Return to Menu (bank souls)')) g._setState(GAME_STATE.MENU);
  }
}
