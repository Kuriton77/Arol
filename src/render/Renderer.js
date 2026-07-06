// Draws the world: room, doors, entities, telegraphs, projectiles and FX.
// Pure rendering — reads game state, mutates nothing. Camera shake/transition
// offset is applied around the whole world draw.
import { CONFIG, ROOM } from '../data/config.js';
import { derive } from '../systems/Stats.js';
import { TAU } from '../core/math.js';
import { DIRS } from '../dungeon/Room.js';

export class Renderer {
  constructor(ctx) { this.ctx = ctx; }

  draw(game) {
    const c = this.ctx;
    const shake = game.camera.shakeOffset();
    c.save();
    c.translate(Math.round(shake.x - game.camera.x), Math.round(shake.y - game.camera.y));

    this._room(game);
    this._decor(game);
    this._reward(game);
    game.hazards.render(c);
    // Draw player projectiles & fx below actors, hostile above for readability.
    game.particles.render(c);
    this._projectiles(game);
    for (const e of game.enemies) if (e.alive) this._enemy(c, e);
    if (game.boss && game.boss.alive) this._boss(c, game.boss);
    if (game.player && game.player.alive) this._player(c, game.player);
    // Death particles / lingering fx already in particles.
    game.damageNumbers.render(c);

    c.restore();
  }

  _room(game) {
    const c = this.ctx;
    const room = game.currentRoom;
    const b = { x: 0, y: 0, w: CONFIG.world.width, h: CONFIG.world.height };
    const pad = CONFIG.world.roomPadding;

    // Floor. Boss rooms take their arena theme from the boss definition;
    // ordinary rooms take the biome palette; special rooms keep their tints.
    const tint = (room && room.type === ROOM.BOSS && game.bossDef && game.bossDef.arena)
      ? game.bossDef.arena
      : this._roomTint(room ? room.type : ROOM.COMBAT, game.biome);
    c.fillStyle = tint.floor;
    c.fillRect(0, 0, b.w, b.h);

    // Subtle floor grid.
    c.strokeStyle = tint.grid;
    c.lineWidth = 1;
    c.beginPath();
    for (let x = pad; x <= b.w - pad; x += 48) { c.moveTo(x, pad); c.lineTo(x, b.h - pad); }
    for (let y = pad; y <= b.h - pad; y += 48) { c.moveTo(pad, y); c.lineTo(b.w - pad, y); }
    c.stroke();

    // Walls.
    c.fillStyle = tint.wall;
    c.fillRect(0, 0, b.w, pad);
    c.fillRect(0, b.h - pad, b.w, pad);
    c.fillRect(0, 0, pad, b.h);
    c.fillRect(b.w - pad, 0, pad, b.h);

    // Doors.
    if (room) {
      for (const dir of Object.keys(room.doors)) {
        this._door(c, room, dir, room.locked);
      }
    }
  }

  _door(c, room, dir, locked) {
    const pad = CONFIG.world.roomPadding;
    const b = room.bounds;
    const dw = 74; // door opening size
    const open = !locked;
    const col = open ? '#4fd88a' : '#c94b4b';
    c.fillStyle = open ? '#0d1420' : '#2a1416';
    c.strokeStyle = col;
    c.lineWidth = 3;
    let x, y, w, h;
    if (dir === 'n') { x = b.w / 2 - dw / 2; y = 0; w = dw; h = pad; }
    else if (dir === 's') { x = b.w / 2 - dw / 2; y = b.h - pad; w = dw; h = pad; }
    else if (dir === 'w') { x = 0; y = b.h / 2 - dw / 2; w = pad; h = dw; }
    else { x = b.w - pad; y = b.h / 2 - dw / 2; w = pad; h = dw; }
    c.fillRect(x, y, w, h);
    c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (locked) {
      // Bars.
      c.strokeStyle = 'rgba(220,90,90,0.8)';
      c.lineWidth = 4;
      c.beginPath();
      if (dir === 'n' || dir === 's') {
        for (let i = 1; i < 4; i++) { c.moveTo(x + (w * i) / 4, y); c.lineTo(x + (w * i) / 4, y + h); }
      } else {
        for (let i = 1; i < 4; i++) { c.moveTo(x, y + (h * i) / 4); c.lineTo(x + w, y + (h * i) / 4); }
      }
      c.stroke();
    }
  }

  _roomTint(type, biome = null) {
    switch (type) {
      case ROOM.BOSS:     return { floor: '#241018', wall: '#3a1826', grid: 'rgba(200,80,120,0.08)' };
      case ROOM.ELITE:    return (biome && biome.elitePalette) || { floor: '#1c1526', wall: '#2c2140', grid: 'rgba(150,110,220,0.09)' };
      case ROOM.TREASURE: return { floor: '#1e1c12', wall: '#33301c', grid: 'rgba(220,190,90,0.09)' };
      case ROOM.SHOP:     return { floor: '#12201c', wall: '#1d3330', grid: 'rgba(90,210,180,0.09)' };
      case ROOM.EVENT:    return { floor: '#141a24', wall: '#22304a', grid: 'rgba(120,160,230,0.09)' };
      default:            return (biome && biome.palette) || { floor: '#12141c', wall: '#20242f', grid: 'rgba(120,140,200,0.06)' };
    }
  }

  // Biome decorations: cheap deterministic canvas props drawn as floor decals.
  _decor(game) {
    const room = game.currentRoom;
    if (!room || !room.decor) return;
    const c = this.ctx;
    const col = game.biome ? game.biome.decor.color : '#2c3245';
    for (const d of room.decor) {
      c.save();
      c.translate(d.x, d.y);
      const s = d.size;
      switch (d.kind) {
        case 'pillar':
          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.beginPath(); c.ellipse(0, 14 * s, 14 * s, 5 * s, 0, 0, TAU); c.fill();
          c.fillStyle = col;
          c.fillRect(-9 * s, -22 * s, 18 * s, 36 * s);
          c.fillStyle = 'rgba(255,255,255,0.08)';
          c.fillRect(-9 * s, -22 * s, 5 * s, 36 * s);
          break;
        case 'grave':
          c.fillStyle = 'rgba(0,0,0,0.3)';
          c.beginPath(); c.ellipse(0, 10 * s, 12 * s, 4 * s, 0, 0, TAU); c.fill();
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(-8 * s, 10 * s); c.lineTo(-8 * s, -6 * s);
          c.arc(0, -6 * s, 8 * s, Math.PI, 0);
          c.lineTo(8 * s, 10 * s); c.closePath(); c.fill();
          break;
        case 'tree':
          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.beginPath(); c.ellipse(0, 16 * s, 16 * s, 5 * s, 0, 0, TAU); c.fill();
          c.fillStyle = '#241a10';
          c.fillRect(-3 * s, 2 * s, 6 * s, 14 * s);
          c.fillStyle = col;
          c.beginPath(); c.arc(0, -6 * s, 17 * s, 0, TAU); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.06)';
          c.beginPath(); c.arc(-5 * s, -10 * s, 9 * s, 0, TAU); c.fill();
          break;
        case 'crystal': {
          c.fillStyle = col;
          c.globalAlpha = 0.9;
          const spikes = 3;
          for (let i = 0; i < spikes; i++) {
            const a = (d.seed * 6 + i) * 2.1;
            const h = (14 + i * 6) * s;
            c.save(); c.rotate(Math.sin(a) * 0.4);
            c.beginPath();
            c.moveTo(0, 6 * s); c.lineTo(-5 * s, 0); c.lineTo(0, -h); c.lineTo(5 * s, 0);
            c.closePath(); c.fill();
            c.restore();
          }
          c.fillStyle = 'rgba(200,240,255,0.25)';
          c.beginPath(); c.arc(0, -8 * s, 3 * s, 0, TAU); c.fill();
          break;
        }
        case 'vent':
          c.fillStyle = col;
          c.beginPath(); c.ellipse(0, 0, 16 * s, 11 * s, 0, 0, TAU); c.fill();
          c.fillStyle = `rgba(255,120,50,${0.35 + Math.sin(game.time * 3 + d.seed * 9) * 0.15})`;
          c.beginPath(); c.ellipse(0, 0, 8 * s, 5 * s, 0, 0, TAU); c.fill();
          break;
        case 'shard': {
          const bob = Math.sin(game.time * 1.5 + d.seed * 12) * 4;
          c.translate(0, bob);
          c.rotate(d.seed * TAU + game.time * 0.2);
          c.globalAlpha = 0.7;
          c.fillStyle = col;
          c.beginPath();
          c.moveTo(0, -14 * s); c.lineTo(8 * s, 6 * s); c.lineTo(-8 * s, 6 * s);
          c.closePath(); c.fill();
          c.strokeStyle = 'rgba(190,150,255,0.4)'; c.lineWidth = 1.5; c.stroke();
          break;
        }
      }
      c.restore();
    }
  }

  _reward(game) {
    const room = game.currentRoom;
    if (!room || !room.reward || room.rewardTaken) return;
    const c = this.ctx;
    const cx = room.bounds.w / 2, cy = room.bounds.h / 2;
    c.save();
    const pulse = 1 + Math.sin(game.time * 4) * 0.06;
    c.translate(cx, cy);
    c.scale(pulse, pulse);
    if (room.reward.kind === 'upgrade') {
      c.fillStyle = '#c9a227'; c.strokeStyle = '#ffe08a'; c.lineWidth = 3;
      c.fillRect(-22, -16, 44, 32); c.strokeRect(-22, -16, 44, 32);
      c.fillStyle = '#ffe08a'; c.fillRect(-22, -4, 44, 6);
      this._label(c, 'TREASURE', 0, -30);
    } else if (room.reward.kind === 'shop') {
      c.fillStyle = '#2fae87'; c.strokeStyle = '#7effcf'; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#04211a'; c.font = 'bold 22px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('$', 0, 1);
      this._label(c, 'SHOP', 0, -34);
    } else if (room.reward.kind === 'event') {
      c.fillStyle = '#3f6fd8'; c.strokeStyle = '#a8c6ff'; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#eaf1ff'; c.font = 'bold 26px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('?', 0, 1);
      this._label(c, 'EVENT', 0, -34);
    }
    c.restore();
  }

  _label(c, text, x, y) {
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = 'bold 11px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, x, y);
  }

  _healthBar(c, e) {
    if (e.health >= e.maxHealth) return;
    const w = e.radius * 2.2, h = 4;
    const x = e.x - w / 2, y = e.y - e.radius - 10;
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x, y, w, h);
    c.fillStyle = e.isElite ? '#ff9d4a' : '#5adc7a';
    c.fillRect(x, y, w * (e.health / e.maxHealth), h);
  }

  _flash(c, e) {
    return e.hurtFlash > 0;
  }

  _enemy(c, e) {
    // Charger: telegraph the charge line across the room while winding up.
    if (e.ai === 'charger' && e.state === 'windup') {
      c.save();
      c.globalAlpha = 0.15 + e.telegraph * 0.3;
      c.strokeStyle = e.accent; c.lineWidth = e.radius * 1.4;
      c.beginPath(); c.moveTo(e.x, e.y);
      c.lineTo(e.x + Math.cos(e.facing) * 600, e.y + Math.sin(e.facing) * 600);
      c.stroke();
      c.restore();
    }
    // Healer: channel beam to its heal target.
    if (e.ai === 'healer' && e.healTarget && e.healTarget.alive) {
      c.save();
      c.globalAlpha = 0.4 + Math.sin(performance.now() / 90) * 0.15;
      c.strokeStyle = '#7effbe'; c.lineWidth = 2.5;
      c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.healTarget.x, e.healTarget.y); c.stroke();
      c.restore();
    }

    c.save();
    c.translate(e.x, e.y);
    const flash = e.hurtFlash > 0;
    const body = flash ? '#ffffff' : e.color;

    // Assassin vanish shimmer.
    if (e.invisible) c.globalAlpha = 0.18;

    // Telegraph ring during windup (bomber pulses faster as it primes).
    if (e.telegraph > 0) {
      c.save();
      const pulse = e.ai === 'bomber' ? (Math.sin(performance.now() / (60 - e.telegraph * 35)) > 0 ? 0.5 : 0.15) : 0;
      c.globalAlpha = 0.35 + e.telegraph * 0.35 + pulse;
      c.strokeStyle = e.ai === 'bomber' ? '#ff7b4a' : '#ffdf6b';
      c.lineWidth = 3;
      const r = e.ai === 'bomber'
        ? e.def.attack.blastRadius * e.telegraph
        : e.radius + 6 + e.telegraph * 10;
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
      c.restore();
    }

    if (e.isElite) { c.shadowColor = e.accent; c.shadowBlur = 14; }

    // Status rings: chill (icy blue) and damage-over-time (ember orange).
    if (e.chillT > 0) {
      c.strokeStyle = 'rgba(140,210,255,0.7)'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(0, 0, e.radius + 3, 0, TAU); c.stroke();
    }
    if (e.dots.length > 0) {
      c.strokeStyle = 'rgba(255,150,70,0.6)'; c.lineWidth = 2;
      const a0 = performance.now() / 200;
      c.beginPath(); c.arc(0, 0, e.radius + 6, a0, a0 + 1.6); c.stroke();
    }

    c.fillStyle = body;
    c.strokeStyle = flash ? '#fff' : e.accent;
    c.lineWidth = 2;
    this._shape(c, e.def.shape || 'circle', e.radius, e);

    // Shield Knight: bright frontal shield arc showing the blocked zone.
    if (e.def.blockFrontal) {
      c.shadowBlur = 0;
      c.strokeStyle = e.state === 'strike' ? 'rgba(220,120,120,0.5)' : '#f0f4ff';
      c.lineWidth = 4;
      c.beginPath(); c.arc(0, 0, e.radius + 5, e.facing - 1.1, e.facing + 1.1); c.stroke();
    }

    // Facing pip.
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath();
    c.arc(Math.cos(e.facing) * e.radius * 0.55, Math.sin(e.facing) * e.radius * 0.55, 3, 0, TAU);
    c.fill();

    // Stun stars.
    if (e.state === 'stunned') {
      c.fillStyle = '#ffe08a';
      for (let i = 0; i < 3; i++) {
        const a = performance.now() / 300 + (i / 3) * TAU;
        c.beginPath();
        c.arc(Math.cos(a) * (e.radius + 8), Math.sin(a) * (e.radius + 8) * 0.4 - e.radius - 6, 2.5, 0, TAU);
        c.fill();
      }
    }
    c.restore();

    if (!e.invisible) this._healthBar(c, e);
  }

  // Generic body shapes keyed by enemy data.
  _shape(c, shape, r, e) {
    switch (shape) {
      case 'diamond':
        c.beginPath();
        c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.closePath();
        c.fill(); c.stroke();
        break;
      case 'square':
        c.fillRect(-r, -r, r * 2, r * 2);
        c.strokeRect(-r, -r, r * 2, r * 2);
        break;
      case 'triangle': {
        const f = e ? e.facing : 0;
        c.save(); c.rotate(f);
        c.beginPath();
        c.moveTo(r * 1.15, 0); c.lineTo(-r * 0.8, -r * 0.85); c.lineTo(-r * 0.8, r * 0.85);
        c.closePath(); c.fill(); c.stroke();
        c.restore();
        break;
      }
      case 'hex': {
        c.save(); c.rotate(e ? e.spin : 0);
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.closePath(); c.fill(); c.stroke();
        c.restore();
        break;
      }
      case 'ring':
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = 'rgba(10,10,18,0.75)';
        c.beginPath(); c.arc(0, 0, r * 0.5, 0, TAU); c.fill();
        break;
      case 'spider': {
        // Legs.
        c.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI - Math.PI / 2 + 0.4;
          const wig = Math.sin(performance.now() / 80 + i) * 3;
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7) + wig);
          c.moveTo(0, 0);
          c.lineTo(-Math.cos(a) * (r + 7), Math.sin(a) * (r + 7) - wig);
          c.stroke();
        }
        c.lineWidth = 2;
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
        break;
      }
      case 'cross':
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = '#0c1f14';
        c.fillRect(-r * 0.55, -r * 0.18, r * 1.1, r * 0.36);
        c.fillRect(-r * 0.18, -r * 0.55, r * 0.36, r * 1.1);
        break;
      default:
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
    }
  }

  _boss(c, boss) {
    c.save();
    const kind = boss.telegraphKind;
    // Charge telegraph line.
    if (kind === 'line') {
      c.save();
      c.globalAlpha = 0.25 + boss.telegraph * 0.4;
      c.strokeStyle = boss.accent; c.lineWidth = boss.radius * 0.5;
      c.beginPath(); c.moveTo(boss.x, boss.y);
      c.lineTo(boss.x + Math.cos(boss.facing) * 700, boss.y + Math.sin(boss.facing) * 700);
      c.stroke();
      c.restore();
    }
    // Projectile-pattern warning ring.
    if (kind === 'ring') {
      c.save();
      c.globalAlpha = 0.3 + boss.telegraph * 0.4;
      c.strokeStyle = boss.accent; c.lineWidth = 4;
      c.beginPath(); c.arc(boss.x, boss.y, boss.radius + 20 + boss.telegraph * 40, 0, TAU); c.stroke();
      c.restore();
    }
    // Slam/teleport burst warning: pulsing filled disc.
    if (kind === 'burst') {
      c.save();
      c.globalAlpha = (0.12 + boss.telegraph * 0.22) * (0.7 + Math.sin(performance.now() / 70) * 0.3);
      c.fillStyle = boss.accent;
      const r = (boss.def.params.slamRadius ?? 130);
      c.beginPath(); c.arc(boss.x, boss.y, r, 0, TAU); c.fill();
      c.restore();
    }

    c.translate(boss.x, boss.y);
    const flash = boss.hurtFlash > 0;
    // Later phases push the body colour hotter and the glow stronger.
    const phaseTint = boss.phaseIndex >= 2 ? boss.accent : boss.color;
    c.shadowColor = phaseTint; c.shadowBlur = 24 + boss.phaseIndex * 10;
    c.fillStyle = flash ? '#fff' : phaseTint;
    c.strokeStyle = boss.accent; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, boss.radius, 0, TAU); c.fill(); c.stroke();
    // Crown-ish inner mark.
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(0, 0, boss.radius * 0.5, 0, TAU); c.fill();
    c.fillStyle = phaseTint;
    c.beginPath(); c.arc(0, 0, boss.radius * 0.3, 0, TAU); c.fill();
    // Facing pip.
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath(); c.arc(Math.cos(boss.facing) * boss.radius * 0.7, Math.sin(boss.facing) * boss.radius * 0.7, 5, 0, TAU); c.fill();
    c.restore();
  }

  _player(c, p) {
    c.save();
    // Dash trail.
    if (p.isDashing) {
      c.globalAlpha = 0.3;
      c.fillStyle = '#7ecbff';
      for (let i = 1; i <= 3; i++) {
        c.beginPath();
        c.arc(p.x - p.vx * 0.01 * i, p.y - p.vy * 0.01 * i, p.radius * (1 - i * 0.15), 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    // Weapon attack visuals — shape-specific per combo step.
    if (p.attackPhase === 'active' || p.attackPhase === 'windup') {
      const step = p.currentStep || {};
      const shape = step.shape || 'arc';
      const color = (p.weapon.vfx && p.weapon.vfx.color) || '#dff0ff';
      const range = derive.range(p.stats) * (step.rangeMult ?? 1);
      c.save();
      c.translate(p.x, p.y);
      if (shape === 'arc') {
        const half = (derive.arc(p.stats) * (step.arcMult ?? 1)) / 2;
        const prog = p.attackPhase === 'active' ? p.swingProgress : 0;
        c.globalAlpha = p.attackPhase === 'active' ? 0.5 : 0.18;
        c.fillStyle = color;
        // Alternating combo steps sweep in the reverse direction.
        const sweep = half * 2 * (p.attackPhase === 'active' ? prog : 1);
        const a0 = step.reversed ? p.swingDir + half - sweep : p.swingDir - half;
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, range, a0, a0 + sweep);
        c.closePath();
        c.fill();
      } else if (shape === 'thrust') {
        const w = (p.weapon.base.width || 28) / 2;
        const ext = p.attackPhase === 'active' ? (0.35 + 0.65 * p.swingProgress) : 0.2;
        c.rotate(p.swingDir);
        c.globalAlpha = p.attackPhase === 'active' ? 0.6 : 0.2;
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(p.radius, -w * 0.6);
        c.lineTo(range * ext, -w * 0.25);
        c.lineTo(range * ext + 10, 0);
        c.lineTo(range * ext, w * 0.25);
        c.lineTo(p.radius, w * 0.6);
        c.closePath();
        c.fill();
      } else if (shape === 'shot' || shape === 'bolt' || shape === 'nova') {
        // Draw/charge indicator during windup; muzzle flash on release.
        c.rotate(p.swingDir);
        c.globalAlpha = p.attackPhase === 'windup' ? 0.5 : 0.3;
        c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2;
        if (shape === 'shot') {
          c.beginPath(); c.arc(p.radius + 6, 0, 9, -1.2, 1.2); c.stroke();
          c.beginPath(); c.moveTo(p.radius + 2, -8); c.lineTo(p.radius + 2, 8); c.stroke();
        } else {
          const r = p.attackPhase === 'windup' ? 5 + 5 * (1 - p.attackTimer / (step.windup || 0.12)) : 7;
          c.beginPath(); c.arc(p.radius + 10, 0, r, 0, TAU); c.fill();
        }
      }
      c.restore();
    }

    // Body.
    c.translate(p.x, p.y);
    const blink = p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0;
    c.globalAlpha = blink ? 0.4 : 1;
    c.shadowColor = '#63b8ff'; c.shadowBlur = 12;
    c.fillStyle = p.hurtFlash > 0 ? '#fff' : '#63b8ff';
    c.strokeStyle = '#d6ecff'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, p.radius, 0, TAU); c.fill(); c.stroke();
    c.shadowBlur = 0;
    // Facing indicator (weapon nub).
    c.fillStyle = '#eaf4ff';
    c.beginPath();
    c.arc(Math.cos(p.facing) * p.radius * 0.9, Math.sin(p.facing) * p.radius * 0.9, 4, 0, TAU);
    c.fill();
    c.restore();
  }

  _projectiles(game) {
    const c = this.ctx;
    game.projectiles.forEach((p) => {
      c.save();
      c.shadowColor = p.color; c.shadowBlur = 10;
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.radius, 0, TAU); c.fill();
      c.restore();
    });
  }
}
