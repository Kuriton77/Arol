// In-game heads-up display: health, XP, dash cooldown, gold/souls, floor,
// minimap, boss health bar, and contextual prompts. Drawn in screen space
// (after the world, without camera transform).
import { derive } from '../systems/Stats.js';
import { CONFIG, ROOM } from '../data/config.js';
import { roundRect } from './UI.js';

const ROOM_COLORS = {
  [ROOM.START]: '#5b7bb0', [ROOM.COMBAT]: '#7a8296', [ROOM.ELITE]: '#b06bff',
  [ROOM.TREASURE]: '#e0c04a', [ROOM.SHOP]: '#4fd8a8', [ROOM.EVENT]: '#5b90ff',
  [ROOM.BOSS]: '#ff4f7a',
};

export class HUD {
  constructor(ctx) { this.ctx = ctx; }

  draw(game) {
    const c = this.ctx;
    const p = game.player;
    if (!p) return;

    // --- Health bar ---
    const hpFrac = p.health / p.maxHealth;
    this._bar(16, 16, 260, 22, hpFrac, '#e8574a', '#3a1618');
    c.fillStyle = '#fff'; c.font = 'bold 13px "Trebuchet MS", system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${Math.ceil(p.health)} / ${p.maxHealth}`, 16 + 130, 16 + 11);

    // --- XP bar ---
    this._bar(16, 44, 260, 10, p.xp / p.xpToNext, '#4fd8ff', '#122a33');
    c.textAlign = 'left'; c.fillStyle = '#bfe8ff'; c.font = 'bold 12px "Trebuchet MS", system-ui';
    c.fillText(`LV ${p.level}`, 284, 52);

    // --- Dash cooldown ---
    const dashReady = p.dashCd <= 0;
    const dashFrac = dashReady ? 1 : 1 - p.dashCd / derive.dashCooldown(p.stats);
    c.save();
    c.translate(300, 24);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.beginPath(); c.arc(0, 0, 16, 0, Math.PI * 2); c.fill();
    c.strokeStyle = dashReady ? '#7ee0ff' : '#3a4a66'; c.lineWidth = 4;
    c.beginPath(); c.arc(0, 0, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dashFrac); c.stroke();
    c.fillStyle = dashReady ? '#7ee0ff' : '#6a7a96';
    c.font = 'bold 12px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('⇥', 0, 1);
    c.restore();

    // --- Currency / floor (top-right) ---
    const W = c.canvas.width;
    c.textAlign = 'right'; c.textBaseline = 'top';
    c.font = 'bold 15px "Trebuchet MS", system-ui';
    c.fillStyle = '#ffd23f'; c.fillText(`◆ ${p.gold} gold`, W - 16, 16);
    c.fillStyle = '#b48cff'; c.fillText(`✦ ${game.save.data.souls} souls`, W - 16, 38);
    c.fillStyle = '#cdd6e8'; c.fillText(`Floor ${game.floor}`, W - 16, 60);

    // --- Minimap ---
    this._minimap(game, W - 168, 88);

    // --- Boss health bar ---
    if (game.boss && game.boss.alive) this._bossBar(game);

    // --- Contextual prompt ---
    if (game.prompt) {
      c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.font = 'bold 16px "Trebuchet MS", system-ui';
      c.fillStyle = 'rgba(0,0,0,0.5)';
      const tw = c.measureText(game.prompt).width + 28;
      roundRect(c, W / 2 - tw / 2, c.canvas.height - 92, tw, 30, 8); c.fill();
      c.fillStyle = '#eaf1ff';
      c.fillText(game.prompt, W / 2, c.canvas.height - 70);
    }

    // --- Owned boons (bottom-left, compact) ---
    this._boons(game);
  }

  _bar(x, y, w, h, frac, color, bg) {
    const c = this.ctx;
    frac = Math.max(0, Math.min(1, frac));
    c.fillStyle = bg; roundRect(c, x, y, w, h, h / 2); c.fill();
    if (frac > 0) { c.fillStyle = color; roundRect(c, x, y, Math.max(h, w * frac), h, h / 2); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1.5;
    roundRect(c, x, y, w, h, h / 2); c.stroke();
  }

  _minimap(game, x, y) {
    const c = this.ctx;
    if (!game.dungeon) return;
    const rooms = game.dungeon.rooms;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rooms) {
      minX = Math.min(minX, r.gx); maxX = Math.max(maxX, r.gx);
      minY = Math.min(minY, r.gy); maxY = Math.max(maxY, r.gy);
    }
    const cell = 15, gap = 4;
    const panW = 152, panH = (maxY - minY + 1) * (cell + gap) + 12;
    c.fillStyle = 'rgba(10,12,20,0.7)';
    roundRect(c, x, y, panW, Math.max(panH, 40), 8); c.fill();
    c.strokeStyle = 'rgba(120,140,200,0.3)'; c.lineWidth = 1; c.stroke();

    const ox = x + panW / 2 - ((maxX - minX) * (cell + gap)) / 2;
    const oy = y + 8;
    for (const r of rooms) {
      if (!r.visited) continue;
      const rx = ox + (r.gx - minX) * (cell + gap);
      const ry = oy + (r.gy - minY) * (cell + gap);
      const isCurrent = r === game.currentRoom;
      c.fillStyle = ROOM_COLORS[r.type] || '#7a8296';
      c.globalAlpha = r.cleared || !r.needsClearing ? 1 : 0.55;
      roundRect(c, rx, ry, cell, cell, 3); c.fill();
      c.globalAlpha = 1;
      if (isCurrent) {
        c.strokeStyle = '#ffffff'; c.lineWidth = 2;
        roundRect(c, rx - 1, ry - 1, cell + 2, cell + 2, 3); c.stroke();
      }
      // Connections to visited neighbours.
      c.strokeStyle = 'rgba(200,210,235,0.35)'; c.lineWidth = 2;
      for (const [dir, nid] of Object.entries(r.doors)) {
        const n = game.dungeon.byId.get(nid);
        if (!n.visited) continue;
        const nx = ox + (n.gx - minX) * (cell + gap);
        const ny = oy + (n.gy - minY) * (cell + gap);
        c.beginPath();
        c.moveTo(rx + cell / 2, ry + cell / 2);
        c.lineTo(nx + cell / 2, ny + cell / 2);
        c.stroke();
      }
    }
  }

  _bossBar(game) {
    const c = this.ctx;
    const boss = game.boss;
    const W = c.canvas.width;
    const w = 520, x = (W - w) / 2, y = c.canvas.height - 52;
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.font = 'bold 16px "Trebuchet MS", system-ui';
    c.fillStyle = '#ffb0cf';
    c.fillText(`${boss.def.name} — ${boss.phase.name}`, W / 2, y - 6);
    this._bar(x, y, w, 18, boss.health / boss.maxHealth, '#ff3a5e', '#2a0e18');
    // Phase threshold ticks.
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1;
    for (const ph of boss.def.phases) {
      if (ph.at >= 1) continue;
      const tx = x + w * ph.at;
      c.beginPath(); c.moveTo(tx, y); c.lineTo(tx, y + 18); c.stroke();
    }
  }

  _boons(game) {
    const c = this.ctx;
    const owned = game.ownedUpgrades;
    if (!owned || !owned.length) return;
    const y = c.canvas.height - 24;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = '12px "Trebuchet MS", system-ui';
    c.fillStyle = 'rgba(200,210,235,0.75)';
    // Aggregate counts.
    const counts = {};
    for (const u of owned) counts[u.id] = (counts[u.id] || 0) + 1;
    const parts = Object.entries(counts).map(([id, n]) => {
      const u = owned.find((x) => x.id === id);
      return n > 1 ? `${u.name} x${n}` : u.name;
    });
    c.fillText(parts.join('  ·  '), 16, y);
  }
}
