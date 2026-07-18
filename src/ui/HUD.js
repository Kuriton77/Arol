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
    const W = c.canvas.width, H = c.canvas.height;
    // Each HUD cluster scales about its own screen corner (via the shared UI
    // scale) so it grows/shrinks in place and stays pinned to its edge — never
    // drifting off-screen the way a single centre-scale would. Fall back to a
    // no-op push/pop if no UI is wired (defensive).
    const ui = game.ui || { pushAnchor() { c.save(); }, pop() { c.restore(); } };

    ui.pushAnchor(0, 0); // top-left cluster
    // --- Health bar ---
    const hpFrac = p.health / p.maxHealth;
    this._bar(16, 16, 260, 22, hpFrac, '#e8574a', '#3a1618');
    // Aegis shield: a cyan overlay riding on top of the health fill.
    if (p.stats.shieldMax > 0 && p.shield > 0.5) {
      const shieldFrac = Math.min(1, p.shield / p.maxHealth);
      c.save();
      c.globalAlpha = 0.8;
      this._bar(16, 16, 260, 22, shieldFrac, '#8fd8ff', 'rgba(0,0,0,0)');
      c.restore();
    }
    c.fillStyle = '#fff'; c.font = 'bold 13px "Trebuchet MS", system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const hpText = p.shield > 0.5 ? `${Math.ceil(p.health)} / ${p.maxHealth}  +${Math.ceil(p.shield)}` : `${Math.ceil(p.health)} / ${p.maxHealth}`;
    c.fillText(hpText, 16 + 130, 16 + 11);

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

    // --- Combo chain pips ---
    const steps = p.weapon.combo.length;
    const active = p.comboTimer > 0 ? p.comboIndex : 0;
    for (let i = 0; i < steps; i++) {
      c.fillStyle = i < active ? '#ffd23f' : 'rgba(120,130,170,0.35)';
      c.beginPath();
      c.arc(330 + i * 13, 24, 4, 0, Math.PI * 2);
      c.fill();
    }
    ui.pop(); // end top-left cluster

    // --- Currency / floor / difficulty / heat + minimap (top-right cluster) ---
    ui.pushAnchor(W, 0);
    c.textAlign = 'right'; c.textBaseline = 'top';
    c.font = 'bold 15px "Trebuchet MS", system-ui';
    let ty = 16;
    c.fillStyle = '#ffd23f'; c.fillText(`◆ ${p.gold} gold`, W - 16, ty); ty += 22;
    c.fillStyle = '#b48cff'; c.fillText(`✦ ${game.save.data.souls} souls`, W - 16, ty); ty += 22;
    c.fillStyle = '#cdd6e8';
    c.fillText(`Floor ${game.floor}${game.biome ? ' — ' + game.biome.name : ''}`, W - 16, ty); ty += 20;
    if (game.difficulty && game.difficulty.def.id !== 'normal') {
      c.fillStyle = game.difficulty.def.color;
      c.font = 'bold 13px "Trebuchet MS", system-ui';
      c.fillText(`${game.difficulty.def.name.toUpperCase()}  ×${game.difficulty.def.mult.toFixed(2)}`, W - 16, ty);
      c.font = 'bold 15px "Trebuchet MS", system-ui';
      ty += 20;
    }
    if (game.heat > 0) {
      c.fillStyle = '#ff9a5a';
      let heatLine = `🔥 Heat ${game.heat}`;
      if (game.pactMods && game.pactMods.hourglass) {
        const left = Math.max(0, 180 - game.floorTime);
        heatLine += `  ·  ⏳ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      }
      c.fillText(heatLine, W - 16, ty); ty += 20;
    }

    // --- Minimap (below the stacked status lines) ---
    this._minimap(game, W - 168, ty + 4);
    ui.pop(); // end top-right cluster

    // --- Boss health bar (bottom-centre) ---
    if (game.boss && game.boss.alive) {
      ui.pushAnchor(W / 2, H);
      this._bossBar(game);
      ui.pop();
    }

    // --- Contextual prompt (bottom-centre) ---
    if (game.prompt) {
      ui.pushAnchor(W / 2, H);
      c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.font = 'bold 16px "Trebuchet MS", system-ui';
      c.fillStyle = 'rgba(0,0,0,0.5)';
      const tw = c.measureText(game.prompt).width + 28;
      roundRect(c, W / 2 - tw / 2, H - 92, tw, 30, 8); c.fill();
      c.fillStyle = '#eaf1ff';
      c.fillText(game.prompt, W / 2, H - 70);
      ui.pop();
    }

    // --- Owned boons (bottom-left, compact) ---
    ui.pushAnchor(0, H);
    this._boons(game);
    ui.pop();
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
    c.textAlign = 'left'; c.textBaseline = 'middle';
    // Active synergies in gold above the boon list.
    const syns = game.synergy ? game.synergy.activeList() : [];
    if (syns.length) {
      c.font = 'bold 12px "Trebuchet MS", system-ui';
      c.fillStyle = 'rgba(255,210,63,0.9)';
      c.fillText('⚡ ' + syns.map((s) => s.name).join('  ·  '), 16, c.canvas.height - 42);
    }
    const y = c.canvas.height - 24;
    c.font = '12px "Trebuchet MS", system-ui';
    c.fillStyle = 'rgba(200,210,235,0.75)';
    // Aggregate counts.
    const counts = {};
    for (const u of owned) counts[u.id] = (counts[u.id] || 0) + 1;
    const parts = Object.entries(counts).map(([id, n]) => {
      const u = owned.find((x) => x.id === id);
      return n > 1 ? `${u.name} x${n}` : u.name;
    });
    let line = parts.join('  ·  ');
    if (c.measureText(line).width > c.canvas.width - 220) {
      line = `${owned.length} boons & relics collected`;
    }
    c.fillText(line, 16, y);
  }
}
