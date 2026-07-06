// Full-screen overlay screens (menu, boon/shop selection, pause, game over,
// victory). Uses the immediate-mode UI helper; reads/mutates Game via methods.
import { GAME_STATE } from '../data/config.js';
import {
  META_TREE, MASTERY_THRESHOLDS, MASTERY_PERKS, masteryLevel,
  SMITH_MAX, SMITH_COSTS, ACHIEVEMENTS,
} from '../data/meta.js';
import { WEAPONS } from '../data/weapons.js';
import { RARITY } from '../data/upgrades.js';
import { PACTS, totalHeat, SOUL_BONUS_PER_HEAT, HEAT_MILESTONES } from '../data/pacts.js';
import { DIFFICULTIES, difficultyById } from '../systems/DifficultyManager.js';
import { SETTINGS_SCHEMA } from '../systems/SettingsManager.js';
import { roundRect } from './UI.js';

const TABS = [
  { id: 'play', label: 'PLAY' },
  { id: 'sanctum', label: 'SANCTUM' },
  { id: 'armory', label: 'ARMORY' },
  { id: 'pact', label: 'PACT' },
  { id: 'feats', label: 'FEATS' },
];

export class Screens {
  constructor(game) {
    this.game = game;
    this.ui = game.ui;
    this.ctx = game.ctx;
    this.tab = 'play';
  }

  get W() { return this.ctx.canvas.width; }
  get H() { return this.ctx.canvas.height; }

  // ---------------------------------------------------------- menu (NPC hub)
  menu() {
    const c = this.ctx, ui = this.ui, g = this.game;
    // Backdrop gradient (full-screen, drawn in identity so UI scale never
    // leaves uncovered borders).
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    const grad = c.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, '#0b0e18'); grad.addColorStop(1, '#141024');
    c.fillStyle = grad; c.fillRect(0, 0, this.W, this.H);
    c.restore();

    ui.text('A R O L', this.W / 2, 52, { font: 'bold 44px "Trebuchet MS", system-ui', align: 'center', color: '#eaf1ff', shadow: true });
    ui.text(`✦ ${g.save.data.souls} souls`, this.W / 2, 80, { font: 'bold 17px system-ui', align: 'center', color: '#b48cff' });

    // Settings gear (top-right).
    if (ui.button(this.W - 116, 20, 96, 34, '⚙ Settings', { font: 'bold 13px system-ui', color: '#1c2236', hoverColor: '#28304e' })) g._openSettings();

    // Tab bar.
    const tw = 130, tx0 = this.W / 2 - (TABS.length * tw) / 2;
    TABS.forEach((t, i) => {
      const active = this.tab === t.id;
      if (ui.button(tx0 + i * tw + 4, 98, tw - 8, 34, t.label, {
        color: active ? '#31427a' : '#1c2236',
        hoverColor: active ? '#31427a' : '#28304e',
        stroke: active ? '#8fb0ff' : 'rgba(120,140,200,0.35)',
        font: 'bold 14px system-ui',
      })) this.tab = t.id;
    });

    switch (this.tab) {
      case 'play': this._tabPlay(); break;
      case 'sanctum': this._tabSanctum(); break;
      case 'armory': this._tabArmory(); break;
      case 'pact': this._tabPact(); break;
      case 'feats': this._tabFeats(); break;
    }
  }

  // Difficulty pacts: rank pickers, live heat total, reward preview.
  _tabPact() {
    const c = this.ctx, ui = this.ui, g = this.game;
    const heat = totalHeat(g.save.data.pacts);
    const x = this.W / 2 - 390, w = 780;
    ui.panel(x, 146, w, 374);
    ui.text(`🔥 HEAT ${heat}`, this.W / 2 - 180, 174, { font: 'bold 20px system-ui', align: 'center', color: heat > 0 ? '#ff7b4a' : '#71809f' });
    ui.text(`souls +${Math.round(heat * SOUL_BONUS_PER_HEAT * 100)}%`, this.W / 2 + 40, 174, { font: 'bold 14px system-ui', align: 'center', color: '#b48cff' });
    const nextMile = HEAT_MILESTONES.find((m) => !g.save.data.heatMilestones.includes(m.heat));
    ui.text(nextMile ? `win at heat ${nextMile.heat} → +${nextMile.souls}✦ bonus` : 'all heat milestones conquered',
      this.W / 2 + 240, 174, { font: '12px system-ui', align: 'center', color: '#8ea0c4' });

    const colW = 380;
    PACTS.forEach((p, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const px = x + 20 + col * colW, py = 194 + row * 64;
      const rank = g.save.data.pacts[p.id] || 0;
      ui.text(p.name, px, py + 12, { font: 'bold 13px system-ui', color: rank > 0 ? '#ffb47a' : '#c3cee6' });
      ui.text(rank > 0 ? p.ranks[rank - 1] : p.ranks[0], px, py + 29, { font: '11px system-ui', color: rank > 0 ? '#d8a88a' : '#71809f' });
      // Rank pips: click a pip to set the rank (click current rank to clear).
      for (let r = 1; r <= p.ranks.length; r++) {
        const bx = px + 250 + (r - 1) * 40;
        const on = rank >= r;
        if (ui.button(bx, py + 2, 34, 30, String(r), {
          color: on ? '#7a3a20' : '#232436',
          hoverColor: on ? '#9c4c28' : '#323a56',
          stroke: on ? '#ff9a5a' : 'rgba(120,140,200,0.35)',
          font: 'bold 13px system-ui',
        })) {
          g.save.data.pacts[p.id] = rank === r ? 0 : r;
          g.save.save();
          g.audio.play('ui');
        }
      }
    });
    ui.text('Pacts apply to your next run. Higher heat, richer souls.',
      this.W / 2, 508, { font: '12px system-ui', align: 'center', color: '#66759a' });
  }

  _tabPlay() {
    const c = this.ctx, ui = this.ui, g = this.game;
    // Weapon quick-select (left).
    ui.panel(24, 150, 300, 340);
    ui.text('LOADOUT', 40, 176, { font: 'bold 14px system-ui', color: '#9fb2dd' });
    let y = 190;
    for (const w of WEAPONS) {
      const unlocked = g.save.isWeaponUnlocked(w.id);
      const selected = g.save.data.selectedWeapon === w.id;
      const x = 40;
      if (selected) {
        c.fillStyle = 'rgba(99,184,255,0.12)';
        roundRect(c, x - 8, y - 3, 284, 44, 8); c.fill();
        c.strokeStyle = '#63b8ff'; c.lineWidth = 2; roundRect(c, x - 8, y - 3, 284, 44, 8); c.stroke();
      }
      const mlvl = masteryLevel(g.save.weaponKills(w.id));
      ui.text(`${w.name}${mlvl ? ' ★' + mlvl : ''}`, x, y + 13, { font: 'bold 13px system-ui', color: unlocked ? '#e8ecf5' : '#7a86a2' });
      ui.text(w.desc, x, y + 29, { font: '10px system-ui', color: '#8ea0c4' });
      const label = unlocked ? (selected ? 'USING' : 'EQUIP') : `${w.cost}✦`;
      const affordable = unlocked || g.save.data.souls >= w.cost;
      if (ui.button(x + 202, y + 5, 64, 28, label, {
        color: selected ? '#24405f' : affordable ? '#2a3a66' : '#232436',
        font: 'bold 11px system-ui',
      })) {
        if (unlocked) g.save.selectWeapon(w.id);
        else if (affordable) { g.save.spendSouls(w.cost); g.save.unlockWeapon(w.id); g.save.selectWeapon(w.id); }
      }
      y += 49;
    }

    // Difficulty selector (right column). Normal is preselected via the save
    // default; the chosen tier is stored and used by the next run.
    const rx = this.W / 2 - 20, rw = 476;
    ui.panel(rx, 150, rw, 92);
    ui.text('DIFFICULTY', rx + 16, 174, { font: 'bold 14px system-ui', color: '#9fb2dd' });
    const selId = g.save.data.difficulty || 'normal';
    const bw = 84, gap = 8, dtot = DIFFICULTIES.length * bw + (DIFFICULTIES.length - 1) * gap;
    const dx0 = rx + (rw - dtot) / 2;
    DIFFICULTIES.forEach((d, i) => {
      const active = d.id === selId;
      if (ui.button(dx0 + i * (bw + gap), 184, bw, 32, d.name, {
        color: active ? '#2a3350' : '#1a1f30',
        hoverColor: active ? '#2a3350' : '#28304e',
        stroke: active ? d.color : 'rgba(120,140,200,0.3)',
        textColor: active ? d.color : '#aab8d6',
        font: 'bold 12px system-ui',
      })) {
        g.save.data.difficulty = d.id;
        g.save.save();
        g.audio.play('ui');
      }
    });
    const selDef = difficultyById(selId);
    ui.text(`×${selDef.mult.toFixed(2)} enemy scaling — ${selDef.desc}`, rx + rw / 2, 230,
      { font: '12px system-ui', align: 'center', color: selDef.color });

    // Start.
    if (ui.button(rx, 258, rw, 58, '▶  START RUN', { font: 'bold 24px system-ui', color: '#2f6f4f', hoverColor: '#3f9968' })) {
      g.audio.resume();
      g.startRun();
    }
    const heat = totalHeat(g.save.data.pacts);
    if (heat > 0) {
      ui.text(`🔥 Heat ${heat} — souls +${Math.round(heat * SOUL_BONUS_PER_HEAT * 100)}%`,
        rx + rw / 2, 332, { font: 'bold 13px system-ui', align: 'center', color: '#ff9a5a' });
    }
    const st = g.save.data.stats;
    ui.panel(rx, 344, rw, 118);
    ui.text('CHRONICLE', rx + rw / 2, 368, { font: 'bold 13px system-ui', align: 'center', color: '#9fb2dd' });
    const lines = [
      `Runs ${st.runs}   ·   Wins ${st.wins}`,
      `Kills ${st.kills}   ·   Best Floor ${st.bestDepth}`,
      `Lifetime souls ${st.lifetimeSouls}   ·   Feats ${g.save.data.achievements.length}/${ACHIEVEMENTS.length}`,
    ];
    lines.forEach((ln, i) => ui.text(ln, rx + rw / 2, 392 + i * 22, { font: '13px system-ui', align: 'center', color: '#aab8d6' }));

    ui.text('WASD / Arrows move  ·  Mouse aim  ·  Click attack  ·  Space dash  ·  Esc pause  ·  M mute',
      this.W / 2, this.H - 20, { font: '12px system-ui', align: 'center', color: '#66759a' });
  }

  // Skill tree: three branches, nodes unlock top-to-bottom.
  _tabSanctum() {
    const c = this.ctx, ui = this.ui, g = this.game;
    const colW = 290, x0 = this.W / 2 - (colW * 3) / 2;
    META_TREE.forEach((branch, bi) => {
      const x = x0 + bi * colW + 20;
      ui.text(branch.name, x + 125, 168, { font: 'bold 15px system-ui', align: 'center', color: branch.color });
      branch.nodes.forEach((node, ni) => {
        const y = 180 + ni * 58;
        const owned = g.save.hasNode(node.id);
        const prevOwned = ni === 0 || g.save.hasNode(branch.nodes[ni - 1].id);
        const affordable = g.save.data.souls >= node.cost;
        const canBuy = !owned && prevOwned && affordable;
        // Connector line.
        if (ni > 0) {
          c.strokeStyle = owned || prevOwned ? branch.color : 'rgba(90,100,130,0.35)';
          c.globalAlpha = owned ? 0.8 : 0.35;
          c.lineWidth = 2;
          c.beginPath(); c.moveTo(x + 125, y - 8); c.lineTo(x + 125, y + 2); c.stroke();
          c.globalAlpha = 1;
        }
        const bg = owned ? '#233a2c' : canBuy ? '#2a3055' : '#191d2c';
        if (ui.button(x, y, 250, 50, '', {
          color: bg, hoverColor: canBuy ? '#3a4378' : bg,
          stroke: owned ? branch.color : prevOwned ? 'rgba(140,160,220,0.5)' : 'rgba(80,90,115,0.35)',
        }) && canBuy) {
          g.save.spendSouls(node.cost);
          g.save.buyNode(node.id);
          g.audio.play('levelup');
        }
        const nameCol = owned ? branch.color : prevOwned ? '#e8ecf5' : '#5f6880';
        ui.text(`${node.keystone ? '◆ ' : ''}${node.name}`, x + 14, y + 20, { font: 'bold 13px system-ui', color: nameCol });
        ui.text(node.desc, x + 14, y + 37, { font: '11px system-ui', color: prevOwned ? '#8ea0c4' : '#565f78' });
        ui.text(owned ? 'OWNED' : `${node.cost}✦`, x + 236, y + 25, {
          font: 'bold 12px system-ui', align: 'right',
          color: owned ? branch.color : affordable && prevOwned ? '#b48cff' : '#565f78',
        });
      });
    });
  }

  // Armory: mastery progress + blacksmith forging per weapon.
  _tabArmory() {
    const c = this.ctx, ui = this.ui, g = this.game;
    const x = this.W / 2 - 380, w = 760;
    ui.panel(x, 148, w, 360);
    ui.text('Mastery grows with kills. The blacksmith hones base damage permanently.',
      this.W / 2, 172, { font: '12px system-ui', align: 'center', color: '#8ea0c4' });
    let y = 188;
    for (const wp of WEAPONS) {
      const unlocked = g.save.isWeaponUnlocked(wp.id);
      const kills = g.save.weaponKills(wp.id);
      const mlvl = masteryLevel(kills);
      const next = MASTERY_THRESHOLDS[mlvl];
      const smith = g.save.smithLevel(wp.id);
      ui.text(wp.name, x + 24, y + 16, { font: 'bold 14px system-ui', color: unlocked ? '#e8ecf5' : '#7a86a2' });
      // Mastery stars + progress bar.
      for (let i = 0; i < 5; i++) {
        c.fillStyle = i < mlvl ? '#ffd23f' : 'rgba(120,130,170,0.3)';
        c.font = '12px system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText('★', x + 24 + i * 14, y + 33);
      }
      const frac = next ? Math.min(1, kills / next) : 1;
      ui.bar(x + 110, y + 27, 180, 10, frac, '#ffd23f', { stroke: 'rgba(255,255,255,0.15)' });
      ui.text(next ? `${kills}/${next} kills — next: ${MASTERY_PERKS[mlvl]}` : `MASTERED (${kills} kills)`,
        x + 300, y + 33, { font: '11px system-ui', color: '#8ea0c4' });
      // Blacksmith.
      const maxed = smith >= SMITH_MAX;
      const cost = maxed ? 0 : SMITH_COSTS[smith];
      const affordable = !maxed && unlocked && g.save.data.souls >= cost;
      ui.text(`Forge +${Math.round(smith * 6)}%`, x + 556, y + 22, { font: 'bold 12px system-ui', color: smith > 0 ? '#ffb47a' : '#71809f' });
      if (ui.button(x + 646, y + 6, 90, 32, maxed ? 'MAX' : `⚒ ${cost}✦`, {
        color: maxed ? '#242434' : affordable ? '#5a3a20' : '#232436',
        hoverColor: affordable ? '#7a5230' : '#232436',
        font: 'bold 12px system-ui',
      }) && affordable) {
        g.save.spendSouls(cost);
        g.save.forgeWeapon(wp.id);
        g.audio.play('uiconfirm');
      }
      y += 52;
    }
  }

  _tabFeats() {
    const ui = this.ui, g = this.game;
    const colW = 400, x0 = this.W / 2 - colW;
    ui.panel(x0 - 20, 148, colW * 2 + 40, 372);
    ACHIEVEMENTS.forEach((a, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = x0 + col * colW, y = 170 + row * 48;
      const owned = g.save.hasAchievement(a.id);
      ui.text(owned ? '✓' : '○', x, y + 12, { font: 'bold 16px system-ui', color: owned ? '#4fd88a' : '#565f78' });
      ui.text(a.name, x + 26, y + 8, { font: 'bold 13px system-ui', color: owned ? '#e8ecf5' : '#8a94ac' });
      ui.text(a.desc, x + 26, y + 25, { font: '11px system-ui', color: owned ? '#8ea0c4' : '#5f6880' });
      ui.text(`+${a.souls}✦`, x + colW - 50, y + 15, { font: 'bold 12px system-ui', align: 'right', color: owned ? '#b48cff' : '#565f78' });
    });
  }

  // -------------------------------------------------------- boon / shop screen
  upgrade() {
    const c = this.ctx, ui = this.ui, g = this.game;
    ui.dim(0.72);
    const shop = g.shopMode;
    const items = shop ? g.shopItems : g.upgradeChoices;

    const title = shop ? 'SHOP' : g.choiceSource === 'relic' ? 'CHOOSE A RELIC' : 'CHOOSE A BOON';
    ui.text(title, this.W / 2, 78,
      { font: 'bold 34px "Trebuchet MS", system-ui', align: 'center', color: g.choiceSource === 'relic' && !shop ? '#ffd9a0' : '#eaf1ff', shadow: true });
    if (shop) ui.text(`◆ ${g.player.gold} gold`, this.W / 2, 108, { font: 'bold 18px system-ui', align: 'center', color: '#ffd23f' });
    else ui.text('press 1 · 2 · 3 or click', this.W / 2, 108, { font: '14px system-ui', align: 'center', color: '#8fa4cc' });

    const cardW = 260, cardH = 300, gap = 30;
    const total = items.length * cardW + (items.length - 1) * gap;
    const x0 = (this.W - total) / 2, y0 = 140;

    items.forEach((it, i) => {
      const u = shop ? it.upgrade : it;
      const rar = RARITY[u.rarity];
      const x = x0 + i * (cardW + gap);
      const hover = this.ui.mx >= x && this.ui.mx <= x + cardW && this.ui.my >= y0 && this.ui.my <= y0 + cardH;

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

  // ------------------------------------------------------------------- event
  event() {
    const c = this.ctx, ui = this.ui, g = this.game;
    const ev = g.currentEvent;
    if (!ev) return;
    ui.dim(0.65);

    const w = 560, x = (this.W - w) / 2;
    const options = ev.options(g);
    const h = 210 + options.length * 66 + 56;
    const y = (this.H - h) / 2;
    ui.panel(x, y, w, h, { stroke: 'rgba(140,160,230,0.6)' });

    ui.text(ev.icon || '✦', this.W / 2, y + 52, { font: '34px system-ui', align: 'center' });
    ui.text(ev.name.toUpperCase(), this.W / 2, y + 88, { font: 'bold 24px "Trebuchet MS", system-ui', align: 'center', color: '#eaf1ff', shadow: true });
    this._wrap(ev.flavour, this.W / 2, y + 118, w - 80, 19, { align: 'center', color: '#9fb2dd', font: 'italic 14px "Trebuchet MS", system-ui' });

    let oy = y + 175;
    for (const opt of options) {
      const enabled = !opt.disabled;
      if (ui.button(x + 40, oy, w - 80, 52, '', {
        color: enabled ? '#25335c' : '#1c2030',
        hoverColor: enabled ? '#35498a' : '#1c2030',
        stroke: enabled ? undefined : 'rgba(90,100,130,0.4)',
      }) && enabled) {
        g._eventChoose(opt);
        return;
      }
      ui.text(opt.label, x + 60, oy + 22, { font: 'bold 15px system-ui', color: enabled ? '#f0f3fb' : '#6a7590' });
      ui.text(opt.sub, x + 60, oy + 40, { font: '12px system-ui', color: enabled ? '#96a8d0' : '#565f78' });
      oy += 66;
    }
    if (ui.button(this.W / 2 - 70, oy + 4, 140, 36, 'Leave', { color: '#3a3a4a', hoverColor: '#4a4a5f', font: 'bold 14px system-ui' })) {
      g._eventChoose(null);
    }
  }

  // ------------------------------------------------------------------- pause
  pause() {
    const ui = this.ui, g = this.game;
    ui.dim(0.6);
    ui.text('PAUSED', this.W / 2, this.H / 2 - 130, { font: 'bold 40px system-ui', align: 'center', color: '#eaf1ff' });
    const bx = this.W / 2 - 120;
    if (ui.button(bx, this.H / 2 - 76, 240, 44, 'Resume', { color: '#2f6f4f', hoverColor: '#3f9968' })) g._setState(GAME_STATE.PLAYING);
    if (ui.button(bx, this.H / 2 - 26, 240, 44, '⚙  Settings')) g._openSettings();
    if (ui.button(bx, this.H / 2 + 24, 240, 44, g.audio._muted ? 'Unmute (M)' : 'Mute (M)')) g.audio.toggleMute();
    if (ui.button(bx, this.H / 2 + 74, 240, 44, 'Abandon Run', { color: '#6f2f38', hoverColor: '#993f4a' })) {
      g._commitRun(false);
      g._setState(GAME_STATE.MENU);
    }
  }

  // ---------------------------------------------------------------- settings
  // Data-driven from SETTINGS_SCHEMA: sliders + toggles grouped by category.
  // Overlays whatever it was opened from (menu backdrop or paused world).
  settings() {
    const ui = this.ui, g = this.game, s = g.settings;
    ui.dim(0.8);
    ui.text('SETTINGS', this.W / 2, 46, { font: 'bold 32px "Trebuchet MS", system-ui', align: 'center', color: '#eaf1ff', shadow: true });
    ui.text('drag sliders · click toggles · ESC to close', this.W / 2, 70,
      { font: '13px system-ui', align: 'center', color: '#8fa4cc' });

    const px = this.W / 2 - 300, pw = 600;
    ui.panel(px, 90, pw, 388);
    let y = 112;
    for (const cat of s.categories()) {
      ui.text(cat.toUpperCase(), px + 28, y + 4, { font: 'bold 13px system-ui', color: '#9fb2dd' });
      y += 26;
      for (const opt of SETTINGS_SCHEMA.filter((o) => o.category === cat)) {
        const val = s.get(opt.id);
        ui.text(opt.label, px + 40, y + 13, { font: '14px system-ui', color: '#e8ecf5' });
        if (opt.type === 'slider') {
          const sx = px + 250, sw = 200;
          const min = opt.min ?? 0, max = opt.max ?? 1;
          const norm = (val - min) / (max - min);
          const nn = ui.slider(sx, y + 9, sw, opt.id, norm, { color: '#63b8ff' });
          if (Math.abs(nn - norm) > 0.0005) s.set(opt.id, min + nn * (max - min));
          ui.text(`${Math.round(s.get(opt.id) * 100)}%`, px + pw - 28, y + 13,
            { font: 'bold 13px system-ui', align: 'right', color: '#bfe8ff' });
        } else if (opt.type === 'toggle') {
          if (ui.button(px + pw - 116, y - 2, 88, 28, val ? 'ON' : 'OFF', {
            color: val ? '#2f6f4f' : '#3a3a4a', hoverColor: val ? '#3f9968' : '#4a4a5f',
            font: 'bold 13px system-ui',
          })) s.toggle(opt.id);
        }
        y += 38;
      }
      y += 6;
    }

    if (ui.button(this.W / 2 - 180, 490, 170, 40, 'Reset Defaults', { color: '#3a3a4a', hoverColor: '#4a4a5f' })) {
      s.reset();
      g.audio.play('uiconfirm');
    }
    if (ui.button(this.W / 2 + 10, 490, 170, 40, 'Close', { color: '#2f6f4f', hoverColor: '#3f9968' })) g._closeSettings();
  }

  // --------------------------------------------------------------- game over
  gameOver() {
    const c = this.ctx, ui = this.ui, g = this.game;
    ui.dim(0.75);
    ui.fillScreen('rgba(120,20,30,0.15)');
    ui.text('YOU DIED', this.W / 2, this.H / 2 - 120, { font: 'bold 48px system-ui', align: 'center', color: '#ff5a6a', shadow: true });
    ui.text(`Floor ${g.floor}  ·  ${g.kills} kills  ·  ${g.roomsCleared} rooms cleared`,
      this.W / 2, this.H / 2 - 66, { font: '18px system-ui', align: 'center', color: '#d8dced' });
    ui.text(`✦ ${g._lastSouls || 0} souls banked`, this.W / 2, this.H / 2 - 36, { font: 'bold 18px system-ui', align: 'center', color: '#b48cff' });
    this._featBanners();
    const bx = this.W / 2 - 120;
    if (ui.button(bx, this.H / 2 + 10, 240, 48, 'Try Again', { color: '#2f6f4f', hoverColor: '#3f9968' })) g.startRun();
    if (ui.button(bx, this.H / 2 + 70, 240, 48, 'Main Menu')) g._setState(GAME_STATE.MENU);
  }

  // Newly earned achievements, shown on both end screens.
  _featBanners() {
    const g = this.game;
    if (!g._newFeats || !g._newFeats.length) return;
    const names = g._newFeats.map((a) => `${a.name} (+${a.souls}✦)`).join('   ·   ');
    this.ui.text(`🏆 FEAT UNLOCKED: ${names}`, this.W / 2, this.H - 40,
      { font: 'bold 14px system-ui', align: 'center', color: '#ffd23f', shadow: true });
  }

  // ----------------------------------------------------------------- victory
  victory() {
    const c = this.ctx, ui = this.ui, g = this.game;
    ui.dim(0.7);
    ui.fillScreen('rgba(120,90,20,0.14)');
    ui.text('VICTORY', this.W / 2, this.H / 2 - 130, { font: 'bold 52px system-ui', align: 'center', color: '#ffd23f', shadow: true });
    ui.text(`${g.bossDef ? g.bossDef.name : 'The boss'} has fallen`, this.W / 2, this.H / 2 - 86, { font: '18px system-ui', align: 'center', color: '#ffe6a8' });
    ui.text(`Floor ${g.floor}  ·  ${g.kills} kills  ·  ✦ ${g._lastSouls || 0} souls banked`,
      this.W / 2, this.H / 2 - 54, { font: 'bold 16px system-ui', align: 'center', color: '#d8dced' });
    this._featBanners();
    const bx = this.W / 2 - 130;
    if (ui.button(bx, this.H / 2, 260, 48, '▼  Descend Deeper', { color: '#5a3a7a', hoverColor: '#7a52a8' })) g._descend();
    if (ui.button(bx, this.H / 2 + 60, 260, 48, 'Return to Menu (bank souls)')) g._setState(GAME_STATE.MENU);
  }
}
