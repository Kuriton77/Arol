// Game orchestrator: owns the loop, the state machine, and wires every system
// together. Systems (combat, spawning, dungeon, progression, audio, UI) are
// independent and communicate through the EventBus and small context objects.
import { CONFIG, GAME_STATE, ROOM } from '../data/config.js';
import { makeRng } from './math.js';
import { EventBus } from './EventBus.js';
import { Camera } from './Camera.js';
import { Particles } from '../fx/Particles.js';
import { DamageNumbers } from '../fx/DamageNumbers.js';
import { createProjectilePool, updateProjectiles } from '../entities/Projectile.js';
import { Player } from '../entities/Player.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { generateDungeon } from '../dungeon/Generator.js';
import { DIRS } from '../dungeon/Room.js';
import { drawUpgrades, UPGRADES, RARITY } from '../data/upgrades.js';
import { META_UPGRADES } from '../data/meta.js';
import { WEAPONS, weaponById } from '../data/weapons.js';
import { Renderer } from '../render/Renderer.js';
import { HUD } from '../ui/HUD.js';
import { UI } from '../ui/UI.js';
import { Screens } from '../ui/Screens.js';
import { derive } from '../systems/Stats.js';

export class Game {
  constructor(canvas, input, audio, save) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.audio = audio;
    this.save = save;
    this.bus = new EventBus();

    this.camera = new Camera(CONFIG.world.width, CONFIG.world.height);
    this.particles = new Particles();
    this.damageNumbers = new DamageNumbers();
    this.projectiles = createProjectilePool();

    this.renderer = new Renderer(this.ctx);
    this.hud = new HUD(this.ctx);
    this.ui = new UI(this.ctx, input, audio);
    this.screens = new Screens(this);

    this.state = GAME_STATE.MENU;
    this.time = 0;
    this.hitPauseTimer = 0;

    // Run state (reset by startRun).
    this.player = null;
    this.enemies = [];
    this.boss = null;
    this.dungeon = null;
    this.currentRoom = null;
    this.floor = 1;
    this.kills = 0;
    this.roomsCleared = 0;
    this.soulsEarned = 0;
    this.ownedUpgrades = [];
    this.ownedCounts = {};
    this.prompt = null;

    // Transition / overlay state.
    this.fade = 0;
    this._transition = null;   // { room, dir, t }
    this.upgradeQueue = 0;
    this.upgradeChoices = [];
    this.shopMode = false;
    this.shopItems = null;
    this.eventResult = null;
    this._pendingVictory = false;

    this.combat = new CombatSystem({
      player: () => this.player,
      getEnemies: () => this.enemies,
      getBoss: () => this.boss,
      // The context uses live getters where identity changes across rooms.
      get playerRef() { return null; },
      projectiles: this.projectiles,
      particles: this.particles,
      damageNumbers: this.damageNumbers,
      camera: this.camera,
      audio: this.audio,
      bus: this.bus,
      hitPause: (s) => { this.hitPauseTimer = Math.max(this.hitPauseTimer, s); },
      onKilled: (t) => this._onKilled(t),
    });
    // CombatSystem reads player via getter; patch ctx to expose it directly.
    Object.defineProperty(this.combat.ctx, 'player', { get: () => this.player });

    this.bus.on('player:died', () => this._gameOver());

    this._bindGlobalKeys();
  }

  _bindGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'p') {
        if (this.state === GAME_STATE.PLAYING) this._setState(GAME_STATE.PAUSED);
        else if (this.state === GAME_STATE.PAUSED) this._setState(GAME_STATE.PLAYING);
      }
      if (k === 'm') { const muted = this.audio.toggleMute(); this.prompt = muted ? 'Muted' : null; }
    });
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    this._last = performance.now();
    const loop = (now) => {
      let dt = (now - this._last) / 1000;
      this._last = now;
      dt = Math.min(dt, 0.05); // clamp to avoid spiral-of-death on tab switch
      this.update(dt);
      this.render();
      this.input.postUpdate();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  startRun() {
    this.floor = 1;
    this.kills = 0;
    this.roomsCleared = 0;
    this.soulsEarned = 0;
    this.ownedUpgrades = [];
    this.ownedCounts = {};

    const weapon = weaponById(this.save.data.selectedWeapon);
    this.player = new Player(CONFIG.world.width / 2, CONFIG.world.height / 2, weapon);
    // Boon pool for this run = shared upgrades + the equipped weapon's pool.
    this.boonPool = [...UPGRADES, ...(weapon.upgrades || [])];
    this._applyMeta(this.player.stats);
    this.player.refreshMaxHealth();
    this.player.health = this.player.maxHealth;

    this._buildFloor();
    this._setState(GAME_STATE.PLAYING);
    this.audio.setMood('explore');
  }

  _applyMeta(stats) {
    for (const m of META_UPGRADES) {
      const lvl = this.save.metaLevel(m.id);
      if (lvl > 0) m.apply(stats, lvl);
    }
  }

  _buildFloor() {
    const seed = (Date.now() ^ (this.floor * 2654435761)) >>> 0;
    this.rng = makeRng(seed);
    this.spawnSystem = new SpawnSystem(this.rng);
    this.dungeon = generateDungeon(this.rng, this.floor - 1);
    this.enemies = [];
    this.boss = null;
    this.projectiles.clear();
    this.particles.clear();
    this.damageNumbers.clear();
    this._enterRoom(this.dungeon.start, null, true);
  }

  // ------------------------------------------------------------------- rooms
  _enterRoom(room, entryDir, initial = false) {
    this.currentRoom = room;
    room.visited = true;
    this.enemies = [];
    this.boss = null;
    this.projectiles.clear();
    this.isBossRoom = room.type === ROOM.BOSS;
    this.prompt = null;

    // Place the player just inside the entry door (or centre on first spawn).
    if (entryDir) {
      const dp = room.doorPos(entryDir);
      const cx = room.bounds.w / 2, cy = room.bounds.h / 2;
      const tx = dp.x + (cx - dp.x) * 0.18;
      const ty = dp.y + (cy - dp.y) * 0.18;
      this.player.x = tx; this.player.y = ty;
      this.player.vx = this.player.vy = 0;
      this.player._kx = this.player._ky = 0;
    } else if (initial) {
      this.player.x = room.bounds.w / 2;
      this.player.y = room.bounds.h * 0.6;
    }

    if (room.needsClearing) {
      const { enemies, boss } = this.spawnSystem.spawnRoom(room, this.floor - 1, this.player);
      this.enemies = enemies;
      this.boss = boss;
      room.locked = true;
      if (boss) {
        this.audio.setMood('boss');
        this.audio.play('bossroar');
        this.camera.addShake(10);
      } else {
        this.audio.setMood('combat');
      }
    } else {
      room.locked = false;
      this.audio.setMood('explore');
      if (room.reward && !room.rewardTaken) {
        this.prompt = this._rewardPrompt(room.reward);
      } else if (room.type === ROOM.START && !initial) {
        this.prompt = 'The dungeon awaits...';
      }
    }
  }

  _rewardPrompt(reward) {
    if (reward.kind === 'upgrade') return 'Step onto the treasure to claim a boon';
    if (reward.kind === 'shop') return 'Step onto the shop to browse (costs gold)';
    if (reward.kind === 'event') return 'Step onto the sigil to tempt fate';
    return null;
  }

  _checkRoomClear() {
    const room = this.currentRoom;
    if (!room || !room.needsClearing) return;
    // Sweep dead enemies from the active list.
    this.enemies = this.enemies.filter((e) => e.alive);
    const bossDone = !this.boss || !this.boss.alive;
    if (this.enemies.length === 0 && bossDone) {
      room.cleared = true;
      room.locked = false;
      this.roomsCleared++;
      this.soulsEarned += 3;
      if (this.isBossRoom) {
        this._pendingVictory = true;
      } else {
        this.audio.setMood('explore');
        // Reward for clearing a combat/elite room: a free boon.
        this._queueUpgrades(1, 'clear');
      }
    }
  }

  _tryTransition() {
    const room = this.currentRoom;
    if (!room || room.locked || this._transition) return;
    const p = this.player;
    const pad = CONFIG.world.roomPadding;
    const b = room.bounds;
    const half = 40; // door half-width for trigger
    for (const dir of Object.keys(room.doors)) {
      let atDoor = false;
      if (dir === 'n') atDoor = p.y - pad < p.radius + 6 && Math.abs(p.x - b.w / 2) < half;
      else if (dir === 's') atDoor = (b.h - pad) - p.y < p.radius + 6 && Math.abs(p.x - b.w / 2) < half;
      else if (dir === 'w') atDoor = p.x - pad < p.radius + 6 && Math.abs(p.y - b.h / 2) < half;
      else if (dir === 'e') atDoor = (b.w - pad) - p.x < p.radius + 6 && Math.abs(p.y - b.h / 2) < half;
      if (atDoor) {
        const nid = room.doors[dir];
        const neighbour = this.dungeon.byId.get(nid);
        this._transition = { room: neighbour, dir: DIRS[dir].opp, t: 0, swapped: false };
        this.audio.play('ui');
        return;
      }
    }
  }

  // ------------------------------------------------------------- upgrades/loot
  _queueUpgrades(n, source) {
    this.upgradeQueue += n;
    this._upgradeSource = source;
    if (this.state === GAME_STATE.PLAYING) this._openNextUpgrade();
  }

  _openNextUpgrade() {
    if (this.upgradeQueue <= 0) { this._setState(GAME_STATE.PLAYING); return; }
    this.shopMode = false;
    this.upgradeChoices = drawUpgrades(this.rng, CONFIG.progression.upgradesOnLevel, this.ownedCounts, this.boonPool);
    if (!this.upgradeChoices.length) { this.upgradeQueue = 0; this._setState(GAME_STATE.PLAYING); return; }
    this._setState(GAME_STATE.UPGRADE);
  }

  _pickUpgrade(u) {
    this._applyUpgrade(u);
    this.audio.play('levelup');
    this.upgradeQueue--;
    if (this.upgradeQueue > 0) this._openNextUpgrade();
    else this._setState(GAME_STATE.PLAYING);
  }

  _applyUpgrade(u) {
    u.apply(this.player.stats);
    this.ownedUpgrades.push(u);
    this.ownedCounts[u.id] = (this.ownedCounts[u.id] || 0) + 1;
    this.player.refreshMaxHealth();
    if (this.player.stats.healOnPick > 0) {
      this.player.heal(this.player.stats.healOnPick);
      this.player.stats.healOnPick = 0;
    }
    if (this.player.health <= 0) this.player.health = 1; // glass cannon safety
  }

  // -------------------------------------------------------------- interactions
  _tryReward() {
    const room = this.currentRoom;
    if (!room || !room.reward || room.rewardTaken) return;
    const p = this.player;
    const cx = room.bounds.w / 2, cy = room.bounds.h / 2;
    if ((p.x - cx) ** 2 + (p.y - cy) ** 2 > 32 * 32) return;

    if (room.reward.kind === 'upgrade') {
      room.rewardTaken = true;
      this.prompt = null;
      this._queueUpgrades(1, 'treasure');
    } else if (room.reward.kind === 'shop') {
      this._openShop();
    } else if (room.reward.kind === 'event') {
      room.rewardTaken = true;
      this._applyEvent(room.reward.variant);
    }
  }

  _openShop() {
    this.shopMode = true;
    const picks = drawUpgrades(this.rng, 3, this.ownedCounts, this.boonPool);
    const costBase = { common: 8, rare: 14, epic: 22, legendary: 35 };
    this.shopItems = picks.map((u) => ({
      upgrade: u,
      cost: Math.round(costBase[u.rarity] * (1 + (this.floor - 1) * 0.3)),
      bought: false,
    }));
    this._setState(GAME_STATE.UPGRADE);
  }

  _buyShopItem(item) {
    if (item.bought || this.player.gold < item.cost) { this.audio.play('ui'); return; }
    this.player.gold -= item.cost;
    item.bought = true;
    this._applyUpgrade(item.upgrade);
    this.audio.play('pickup');
  }

  _closeShop() {
    this.shopMode = false;
    this.shopItems = null;
    if (this.currentRoom.reward) this.currentRoom.reward.exhausted = true;
    this.prompt = 'Come back anytime — the shopkeeper waits';
    this._setState(GAME_STATE.PLAYING);
  }

  _applyEvent(variant) {
    const p = this.player;
    if (variant === 'heal') {
      const amt = Math.round(p.maxHealth * 0.4);
      p.heal(amt);
      this.eventResult = `A soothing light restores ${amt} HP.`;
      this.audio.play('levelup');
    } else if (variant === 'gamble') {
      if (this.rng.chance(0.55)) {
        const g = 25 + this.floor * 10;
        p.gold += g;
        this.eventResult = `Fortune favours you! +${g} gold.`;
        this.audio.play('pickup');
      } else {
        const dmg = Math.round(p.maxHealth * 0.2);
        p.health = Math.max(1, p.health - dmg);
        this.eventResult = `The dice betray you... -${dmg} HP.`;
        this.audio.play('hurt');
      }
    } else if (variant === 'sacrifice') {
      p.stats.maxHealthBonus -= 15;
      p.refreshMaxHealth();
      const epics = UPGRADES.filter((u) => u.rarity === 'epic' || u.rarity === 'legendary');
      const boon = epics[this.rng.int(0, epics.length - 1)];
      this._applyUpgrade(boon);
      this.eventResult = `You trade vitality for power: ${boon.name}!`;
      this.audio.play('levelup');
    }
    this.prompt = this.eventResult;
    setTimeout(() => { if (this.prompt === this.eventResult) this.prompt = null; }, 3200);
  }

  // ----------------------------------------------------------------- kills/end
  _onKilled(target) {
    const greed = 1 + (this.player.stats.greed || 0);
    this.particles.burst(target.x, target.y, target.color || '#fff', 16, { speed: 260, life: 0.6 });
    this.camera.addShake(target === this.boss ? 12 : 5);
    this.audio.play('die');
    this.kills++;
    this.soulsEarned += 1;
    // Resonance boon: kills grant a short attack-speed surge.
    if (this.player.stats.surgeOnKill) this.player.stats.surgeT = 3.0;

    if (target === this.boss) {
      this.player.gold += Math.round(target.def.gold * greed);
      const lv = this.player.gainXp(target.def.xp);
      this._queueUpgrades(lv, 'level');
      // Victory handled by _checkRoomClear.
      return;
    }
    // Regular enemy.
    this.player.gold += Math.round((target.goldValue || 0) * greed);
    const levels = this.player.gainXp(target.xpValue || 0);
    if (levels > 0) this._queueUpgrades(levels, 'level');
  }

  _gameOver() {
    this._commitRun(false);
    this.audio.play('gameover');
    this.audio.setMood('explore');
    this._setState(GAME_STATE.GAMEOVER);
  }

  _victory() {
    this._commitRun(true);
    this.audio.play('victory');
    this.audio.setMood('explore');
    this._setState(GAME_STATE.VICTORY);
  }

  _commitRun(won) {
    if (this._runCommitted) return;
    this._runCommitted = true;
    const greed = 1 + (this.player.stats.greed || 0);
    const souls = Math.round((this.soulsEarned + (won ? 40 : 0)) * greed);
    this._lastSouls = souls;
    this.save.addSouls(souls);
    this.save.recordRun({ won, kills: this.kills, depth: this.floor });
  }

  _descend() {
    // Continue the run to a harder floor after victory.
    this._runCommitted = false;
    this.floor++;
    this._pendingVictory = false;
    this.player.health = Math.min(this.player.maxHealth, this.player.health + Math.round(this.player.maxHealth * 0.35));
    this._buildFloor();
    this._setState(GAME_STATE.PLAYING);
    this.audio.setMood('explore');
  }

  _setState(s) {
    this.state = s;
    if (s === GAME_STATE.PLAYING) this._runCommitted = this._runCommitted && false;
  }

  // -------------------------------------------------------------------- update
  update(dt) {
    this.input.preUpdate();
    this.time += dt;
    this.audio.updateMusic(dt);

    switch (this.state) {
      case GAME_STATE.PLAYING: this._updatePlaying(dt); break;
      case GAME_STATE.MENU:
      case GAME_STATE.UPGRADE:
      case GAME_STATE.PAUSED:
      case GAME_STATE.GAMEOVER:
      case GAME_STATE.VICTORY:
        // Screens are interactive but the sim is frozen; still animate camera/fx a touch.
        this.camera.update(dt);
        break;
    }
  }

  _updatePlaying(dt) {
    // Hit-pause freezes the simulation briefly for impact.
    if (this.hitPauseTimer > 0) {
      this.hitPauseTimer -= dt;
      this.camera.update(dt);
      return;
    }

    // Room transition fade.
    if (this._transition) {
      this._transition.t += dt;
      const dur = 0.34;
      if (!this._transition.swapped && this._transition.t >= dur / 2) {
        this._enterRoom(this._transition.room, this._transition.dir);
        this._transition.swapped = true;
      }
      if (this._transition.t >= dur) this._transition = null;
      this.fade = this._transition ? 1 - Math.abs((this._transition.t / dur) - 0.5) * 2 : 0;
      this.camera.update(dt);
      // Freeze gameplay during the swap for cleanliness.
      if (this._transition && !this._transition.swapped) return;
    } else {
      this.fade = 0;
    }

    const input = this.input;
    const p = this.player;
    const bounds = this.currentRoom.bounds;

    // --- player input ---
    if (input.wasPressed(' ')) {
      const axis = input.moveAxis();
      if (p.tryDash(axis.x, axis.y)) { this.audio.play('dash'); this.camera.addShake(2); }
    }
    if (input.mouse.down) {
      // Shot/bolt steps play their SFX at fire time in CombatSystem.
      if (p.tryAttack(input.mouse.x, input.mouse.y)) {
        const shape = p.currentStep.shape || 'arc';
        if (shape === 'arc' || shape === 'thrust') this.audio.play(p.weapon.sfx || 'swing');
      }
    }
    p.update(dt, input, bounds);

    // --- enemies ---
    const ctx = {
      player: p,
      bounds,
      enemies: () => this.enemies,
      spawnProjectile: (o) => this.projectiles.spawn(o),
      spawnEnemy: (type, x, y) => {
        if (this.enemies.length < 60) {
          const e = this.spawnSystem.spawnAt(type, x, y, bounds, this.floor - 1);
          e.spawnedBySummon = true;
          this.enemies.push(e);
          this.particles.burst(e.x, e.y, e.accent, 8, { speed: 140, life: 0.4 });
        }
      },
      spawnAdd: (boss) => {
        if (this.enemies.length < 40) {
          this.enemies.push(this.spawnSystem.spawnAdd(boss, bounds, p));
        }
      },
      explode: (x, y, r, dmg, color) => this.combat.explode(x, y, r, dmg, color),
      onShoot: () => this.audio.play('shoot'),
      onTelegraph: () => this.audio.play('telegraph'),
      onExecute: () => this.camera.addShake(4),
      onBlink: (e) => { this.audio.play('blink'); this.particles.burst(e.x, e.y, e.accent, 10, { speed: 160, life: 0.35 }); },
      onSummon: (e) => { this.audio.play('telegraph'); this.particles.burst(e.x, e.y, e.accent, 12, { speed: 180, life: 0.45 }); },
      onHeal: (e, target) => this.particles.burst(target.x, target.y, '#c0ffd8', 3, { speed: 60, life: 0.5, drag: 0.95 }),
      onSlam: (e) => { this.camera.addShake(7); this.audio.play('boom'); this.particles.burst(e.x, e.y, e.accent, 14, { speed: 220, life: 0.4 }); },
    };
    for (const e of this.enemies) if (e.alive) e.update(dt, ctx);
    if (this.boss && this.boss.alive) {
      this.boss.update(dt, ctx);
      if (this.boss.justChangedPhase) {
        this.boss.justChangedPhase = false;
        this.audio.play('bossroar');
        this.camera.addShake(10);
        this.particles.burst(this.boss.x, this.boss.y, this.boss.accent, 40, { speed: 320, life: 0.8 });
      }
    }

    // --- projectiles + combat ---
    updateProjectiles(this.projectiles, dt, bounds);
    this.combat.update(dt);

    // --- separation so enemies don't stack perfectly ---
    this._separateEnemies();

    // --- fx ---
    this.particles.update(dt);
    this.damageNumbers.update(dt);
    this.camera.update(dt);

    // --- world checks ---
    this._checkRoomClear();
    this._tryTransition();
    this._tryReward();

    if (this._pendingVictory && this.upgradeQueue <= 0) {
      this._pendingVictory = false;
      this._victory();
    }
  }

  // Light-weight O(n^2) separation; fine for the enemy counts an arena holds.
  _separateEnemies() {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  // -------------------------------------------------------------------- render
  render() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.fillStyle = '#06070c';
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const inWorld = [GAME_STATE.PLAYING, GAME_STATE.UPGRADE, GAME_STATE.PAUSED].includes(this.state) ||
                    (this.state === GAME_STATE.GAMEOVER) || (this.state === GAME_STATE.VICTORY);

    if (this.player && inWorld && this.currentRoom) {
      this.renderer.draw(this);
      this.hud.draw(this);
    }

    // Transition fade overlay.
    if (this.fade > 0) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = `rgba(4,5,10,${this.fade})`;
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // State overlays / screens.
    this.ui.begin();
    switch (this.state) {
      case GAME_STATE.MENU: this.screens.menu(); break;
      case GAME_STATE.UPGRADE: this.screens.upgrade(); break;
      case GAME_STATE.PAUSED: this.screens.pause(); break;
      case GAME_STATE.GAMEOVER: this.screens.gameOver(); break;
      case GAME_STATE.VICTORY: this.screens.victory(); break;
    }
  }
}
