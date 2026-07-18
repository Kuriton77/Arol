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
import { RELICS, relicById } from '../data/relics.js';
import { META_TREE, applyMastery, masteryLevel, SMITH_BONUS, ACHIEVEMENTS } from '../data/meta.js';
import { WEAPONS, weaponById } from '../data/weapons.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { bossById } from '../data/bosses.js';
import { biomeForFloor } from '../data/biomes.js';
import { eventById } from '../data/events.js';
import { pactMods, totalHeat, SOUL_BONUS_PER_HEAT, HEAT_MILESTONES } from '../data/pacts.js';
import { SynergySystem } from '../systems/SynergySystem.js';
import { DifficultyManager, DEFAULT_DIFFICULTY } from '../systems/DifficultyManager.js';
import { Hazards } from '../fx/Hazards.js';
import { Renderer } from '../render/Renderer.js';
import { HUD } from '../ui/HUD.js';
import { UI } from '../ui/UI.js';
import { Screens } from '../ui/Screens.js';
import { derive } from '../systems/Stats.js';

// Distance the player must move from a reward pad before a snoozed shop/event
// re-arms. Larger than the ~32px open radius so closing stays closed on-pad.
const REWARD_REARM_DIST = 80;

export class Game {
  constructor(canvas, input, audio, save, settings = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.audio = audio;
    this.save = save;
    this.settings = settings;
    this._settingsReturn = null; // state to restore when settings closes
    this.bus = new EventBus();

    this.camera = new Camera(CONFIG.world.width, CONFIG.world.height);
    this.particles = new Particles();
    this.damageNumbers = new DamageNumbers();
    this.projectiles = createProjectilePool();
    this.hazards = new Hazards();
    this.bossIntroT = 0;       // cinematic letterbox timer
    this.bossDef = null;       // this floor's boss definition

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
    this.upgradeQueue = [];    // pending choice sources: 'boon' | 'relic'
    this.upgradeChoices = [];
    this.choiceSource = 'boon';
    this.ownedTags = {};       // synergy tag counts
    this.synergy = new SynergySystem(this);
    // Single source of truth for difficulty × floor × modifier scaling.
    this.difficulty = new DifficultyManager(this.save.data.difficulty || DEFAULT_DIFFICULTY);
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
      synergy: this.synergy,
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
        // ESC in Settings closes it back to wherever it was opened from,
        // never touching the underlying pause/menu state.
        if (this.state === GAME_STATE.SETTINGS) { this._closeSettings(); }
        else if (this.state === GAME_STATE.PLAYING) this._setState(GAME_STATE.PAUSED);
        else if (this.state === GAME_STATE.PAUSED) this._setState(GAME_STATE.PLAYING);
      }
      if (k === 'm') { const muted = this.audio.toggleMute(); this.prompt = muted ? 'Muted' : null; }
    });
  }

  // --- Settings overlay: single instance, restores its origin state on close.
  _openSettings() {
    if (this.state === GAME_STATE.SETTINGS) return; // never stack
    this._settingsReturn = this.state;               // MENU or PAUSED
    this._setState(GAME_STATE.SETTINGS);
    this.audio.play('ui');
  }
  _closeSettings() {
    if (this.state !== GAME_STATE.SETTINGS) return;
    this._setState(this._settingsReturn || GAME_STATE.MENU);
    this._settingsReturn = null;
    this.audio.play('ui');
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
    this.ownedTags = {};
    this.upgradeQueue = [];
    this.synergy.reset();

    // Lock in the chosen difficulty for this run and reset run-scoped modifiers.
    this.difficulty.setDifficulty(this.save.data.difficulty || DEFAULT_DIFFICULTY).clearModifiers();

    const weapon = weaponById(this.save.data.selectedWeapon);
    this.player = new Player(CONFIG.world.width / 2, CONFIG.world.height / 2, weapon);
    // Boon pool for this run = shared upgrades + the equipped weapon's pool.
    this.boonPool = [...UPGRADES, ...(weapon.upgrades || [])];
    // Difficulty pacts chosen in the hub.
    this.pactMods = pactMods(this.save.data.pacts);
    this.heat = totalHeat(this.save.data.pacts);
    this.player.stats.maxHealthBonus -= this.pactMods.maxHpLoss;
    this.player.stats.healMult = this.pactMods.healMult;
    this._applyMeta(this.player.stats);
    // Weapon mastery + blacksmith forging (permanent, per-weapon).
    applyMastery(this.player.stats, masteryLevel(this.save.weaponKills(weapon.id)));
    this.player.stats.baseDamage *= 1 + SMITH_BONUS * this.save.smithLevel(weapon.id);
    this.player.refreshMaxHealth();
    this.player.health = this.player.maxHealth;
    this.player.shield = this.player.stats.shieldMax; // start with any meta/relic shield
    // Run trackers for achievements.
    this._runMaxGold = 0;
    this._runSynergies = 0;
    this._newFeats = [];

    this._buildFloor();
    if (this.save.hasNode('f6')) {
      const commons = this.boonPool.filter((u) => u.rarity === 'common');
      this._applyUpgrade(commons[this.rng.int(0, commons.length - 1)]);
    }
    this._setState(GAME_STATE.PLAYING);
    this._exploreMood();
  }

  _exploreMood() {
    this.audio.setMood('explore', this.biome ? this.biome.musicScale : null);
  }

  _applyMeta(stats) {
    for (const branch of META_TREE) {
      for (const node of branch.nodes) {
        if (this.save.hasNode(node.id)) node.apply(stats);
      }
    }
  }

  _buildFloor() {
    const seed = (Date.now() ^ (this.floor * 2654435761)) >>> 0;
    this.rng = makeRng(seed);
    if (this.player) this.player.stats.secondWindUsed = false; // once per floor
    // Advance the difficulty manager (floor + player level) before scaling.
    this.difficulty.setFloor(this.floor);
    if (this.player) this.difficulty.setPlayerLevel(this.player.level);
    this.spawnSystem = new SpawnSystem(this.rng, this.difficulty);
    this.biome = biomeForFloor(this.floor);
    this.bossDef = bossById(this.biome.bossId);
    this.dungeon = generateDungeon(this.rng, this.floor - 1, this.biome, this.difficulty.spawnMultiplier());
    this._ambientT = 0;
    this.floorTime = 0;
    this._hourglassTriggered = false;
    this.enemies = [];
    this.boss = null;
    this.projectiles.clear();
    this.particles.clear();
    this.damageNumbers.clear();
    this.hazards.clear();
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
    this.eventFight = null;
    this.currentEvent = null;
    // Shop overlay is state, not a persistent instance — ensure it's closed
    // whenever we change rooms so it can never linger across rooms.
    this.shopMode = false;
    this.shopItems = null;

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

    this.hazards.clear();
    if (room.envHazards) {
      for (const h of room.envHazards) this.hazards.spawn({ ...h });
    }
    if (room.needsClearing) {
      // Keep scaling current with the player's level (leveling mid-floor makes
      // subsequent rooms spawn tougher — enemies scale continuously).
      if (this.player) this.difficulty.setPlayerLevel(this.player.level);
      const { enemies, boss } = this.spawnSystem.spawnRoom(room, this.floor - 1, this.player, this.bossDef);
      this.enemies = enemies;
      this.boss = boss;
      this._applyPactsToSpawns(room);
      room.locked = true;
      if (boss) {
        this.audio.setMood('boss', this.bossDef.musicScale);
        this.audio.play('bossroar');
        this.camera.addShake(10);
        // Cinematic introduction: letterbox + name card; boss briefly invulnerable.
        this.bossIntroT = 2.4;
        boss.iframes = 2.6;
      } else {
        this.audio.setMood('combat');
      }
    } else {
      room.locked = false;
      this._exploreMood();
      if (room.reward && !room.rewardTaken) {
        this.prompt = this._rewardPrompt(room.reward);
      } else if (room.type === ROOM.START && !initial) {
        this.prompt = 'The dungeon awaits...';
      }
    }
  }

  // Difficulty pacts: reshape freshly-spawned encounters.
  _applyPactsToSpawns(room) {
    const m = this.pactMods;
    if (!m) return;
    // Legion: extra copies of existing enemies.
    if (m.legionExtra > 0) {
      const extra = [];
      const depth = room.depth + (this.floor - 1) * 4;
      for (const e of this.enemies) {
        if (this.rng.chance(m.legionExtra) && this.enemies.length + extra.length < 50) {
          extra.push(...this.spawnSystem.spawnPlan(
            [{ type: this._typeOf(e), count: 1 }], room.bounds, this.player, depth));
        }
      }
      this.enemies.push(...extra);
    }
    for (const e of this.enemies) {
      if (m.enemySpeed !== 1) e.speed *= m.enemySpeed;
      if (m.eliteChance > 0 && !e.isElite && this.rng.chance(m.eliteChance)) e.makeElite();
      if (this._hourglassPenalty) e.damage *= this._hourglassPenalty;
    }
    if (this.boss && m.bossMult !== 1) {
      this.boss.maxHealth = Math.round(this.boss.maxHealth * m.bossMult);
      this.boss.health = this.boss.maxHealth;
      this.boss.contactDamage *= m.bossMult;
      this.boss.projDamage = Math.round(this.boss.projDamage * m.bossMult);
    }
  }

  _typeOf(e) {
    // Reverse-lookup an enemy's archetype key from its def reference.
    for (const [k, v] of Object.entries(ENEMY_TYPES)) if (v === e.def) return k;
    return 'melee';
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
      if (this.player.stats.roomHeal > 0) this.player.heal(this.player.stats.roomHeal);
      if (this.isBossRoom) {
        this._pendingVictory = true;
      } else {
        this._exploreMood();
        // Reward for clearing a combat/elite room: a free boon.
        this._queueUpgrades(1, 'boon');
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
  // source: 'boon' (level-ups, room clears) or 'relic' (treasure, boss kills).
  _queueUpgrades(n, source = 'boon') {
    for (let i = 0; i < n; i++) this.upgradeQueue.push(source);
    if (this.state === GAME_STATE.PLAYING) this._openNextUpgrade();
  }

  _openNextUpgrade() {
    if (this.upgradeQueue.length === 0) { this._setState(GAME_STATE.PLAYING); return; }
    this.shopMode = false;
    this.choiceSource = this.upgradeQueue[0];
    const pool = this.choiceSource === 'relic' ? RELICS : this.boonPool;
    const bias = this.choiceSource === 'relic' && this.biome ? this.biome.lootBias : null;
    const nChoices = CONFIG.progression.upgradesOnLevel + (this.save.hasNode('p6') ? 1 : 0);
    const luck = this.player ? (this.player.stats.luck || 0) : 0;
    this.upgradeChoices = drawUpgrades(this.rng, nChoices, this.ownedCounts, pool, bias, luck);
    // Boss kills lead their relic choice with the boss-exclusive relic.
    if (this.choiceSource === 'relic' && this._pendingBossRelic) {
      const exclusive = relicById(this._pendingBossRelic);
      this._pendingBossRelic = null;
      if (exclusive && !this.ownedCounts[exclusive.id]) {
        this.upgradeChoices = [exclusive, ...this.upgradeChoices.slice(0, 2)];
      }
    }
    if (!this.upgradeChoices.length) { this.upgradeQueue.length = 0; this._setState(GAME_STATE.PLAYING); return; }
    this._setState(GAME_STATE.UPGRADE);
  }

  _pickUpgrade(u) {
    this._applyUpgrade(u);
    this.audio.play('levelup');
    this.upgradeQueue.shift();
    if (this.upgradeQueue.length > 0) this._openNextUpgrade();
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
    // Top the Aegis shield up to its (possibly increased) capacity on pickup.
    if (this.player.stats.shieldMax > 0) this.player.shield = this.player.stats.shieldMax;
    // Track synergy tags; announce any newly-unlocked synergies.
    if (u.tags) for (const t of u.tags) this.ownedTags[t] = (this.ownedTags[t] || 0) + 1;
    const fresh = this.synergy.recheck(this.ownedTags);
    this._runSynergies = (this._runSynergies || 0) + fresh.length;
    for (const syn of fresh) {
      this.prompt = `SYNERGY UNLOCKED — ${syn.name}: ${syn.desc}`;
      this.audio.play('victory');
      this.particles.burst(this.player.x, this.player.y, '#ffd23f', 26, { speed: 300, life: 0.7 });
      const expected = this.prompt;
      setTimeout(() => { if (this.prompt === expected) this.prompt = null; }, 4000);
    }
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
      this._queueUpgrades(1, 'relic');
    } else if (room.reward.kind === 'shop') {
      // Reopens only after the player steps away (see _rewardSnoozed release).
      if (room._rewardSnoozed) return;
      this._openShop();
    } else if (room.reward.kind === 'event') {
      // Snoozed events reopen once the player steps away and returns.
      if (room._rewardSnoozed) return;
      this.currentEvent = eventById(room.reward.variant);
      this._setState(GAME_STATE.EVENT);
      this.audio.play('ui');
    }
  }

  // Resolve a chosen event option (or leave). Options may award instantly,
  // open a shop, or start an event fight whose reward pays on clear.
  _eventChoose(opt) {
    const room = this.currentRoom;
    this.currentEvent = null;
    if (!opt) {
      // Leave without committing — the event stays available.
      room._rewardSnoozed = true;
      this._setState(GAME_STATE.PLAYING);
      return;
    }
    room.rewardTaken = true;
    const result = opt.run(this);
    // run() may have changed state (shop/upgrade). Only unfreeze if it didn't.
    if (this.state === GAME_STATE.EVENT) this._setState(GAME_STATE.PLAYING);
    if (this.state === GAME_STATE.PLAYING && this.upgradeQueue.length) this._openNextUpgrade();
    if (result) {
      this.prompt = result;
      const expected = result;
      setTimeout(() => { if (this.prompt === expected) this.prompt = null; }, 3500);
    }
  }

  // Lock the room and spawn an event encounter; reward resolves on clear.
  _startEventFight(plan, reward) {
    const room = this.currentRoom;
    room.locked = true;
    this.eventFight = { ...reward, timeLeft: reward.timeLimit || 0 };
    this.enemies.push(...this.spawnSystem.spawnPlan(plan, room.bounds, this.player, room.depth + (this.floor - 1) * 4));
    this.audio.setMood('combat');
  }

  _resolveEventFight(success) {
    const f = this.eventFight;
    this.eventFight = null;
    this.currentRoom.locked = false;
    this._exploreMood();
    if (!success) {
      this.prompt = 'The trial is failed. The dust settles.';
      return;
    }
    const greed = 1 + (this.player.stats.greed || 0);
    switch (f.kind) {
      case 'prisoner': {
        const gold = Math.round(80 * greed);
        this.player.gold += gold;
        this.player.heal(Math.round(this.player.maxHealth * 0.3));
        this.prompt = `The prisoner presses ${gold} gold into your hands and flees.`;
        this.audio.play('pickup');
        break;
      }
      case 'mirror':
        this.prompt = 'The shadow shatters. Something real remains.';
        this._queueUpgrades(1, 'relic');
        break;
      case 'timed':
        this.prompt = 'The hourglass stills. The trial is won.';
        this._queueUpgrades(1, 'relic');
        break;
      case 'mimic':
        this.prompt = 'The mimic dissolves into loose coins.';
        this.audio.play('pickup');
        break;
    }
  }

  // --- Shop pricing (single source of truth) -------------------------------
  // Displayed price is always derived from an item's base price and the
  // player's current level — item base prices are never mutated, so prices
  // update live on level-up and never reset during a run. Extensible: extra
  // multipliers (discounts, lucky merchants, dynamic economy) slot in here.
  _shopPrice(basePrice) {
    const levelMult = Math.pow(CONFIG.shop.priceLevelMultiplier, this.player.level - 1);
    const discount = 1 - Math.min(0.5, this.player.stats.shopDiscount);
    return Math.max(1, Math.round(basePrice * levelMult * discount));
  }
  // Reroll cost scales with the same pricing function.
  _rerollCost() { return this._shopPrice(CONFIG.shop.rerollCost); }

  // Build a fresh inventory of {upgrade, basePrice, bought} from a pool.
  _genShopItems(pool, costBase, bias, count = CONFIG.shop.items) {
    const luck = this.player ? (this.player.stats.luck || 0) : 0;
    const picks = drawUpgrades(this.rng, count, this.ownedCounts, pool, bias, luck);
    return picks.map((u) => ({ upgrade: u, basePrice: costBase[u.rarity] ?? 10, bought: false }));
  }

  // Hidden-merchant variant of the shop: relic stock at premium prices.
  _openRelicShop() {
    this._enterShop(RELICS, CONFIG.shop.relicCostBase, this.biome ? this.biome.lootBias : null);
  }

  _openShop() {
    this._enterShop(this.boonPool, CONFIG.shop.costBase, null);
  }

  // Open a shop of a given kind. Inventory is generated ONCE per room and
  // persisted on the room, so closing/reopening restores the exact same
  // stock, sold-out slots, and reroll state until the shop is left for good
  // (a new floor regenerates rooms, giving a fresh shop).
  _enterShop(pool, costBase, bias) {
    if (this.shopMode) return; // single shop instance — never stack overlays
    const room = this.currentRoom;
    if (!room.shopInventory) {
      room.shopInventory = {
        items: this._genShopItems(pool, costBase, bias),
        rerolled: false,
        pool, costBase, bias, // remembered so a reroll draws from the same source
      };
    }
    this.shopItems = room.shopInventory.items;
    this.shopMode = true;
    this._setState(GAME_STATE.UPGRADE);
  }

  _buyShopItem(item) {
    if (item.bought) { this.audio.play('ui'); return; }
    const price = this._shopPrice(item.basePrice);
    if (this.player.gold < price) { this.audio.play('ui'); return; }
    this.player.gold -= price;
    item.bought = true; // persisted on room.shopInventory — stays sold on reopen
    this._applyUpgrade(item.upgrade);
    this.audio.play('pickup');
  }

  // One paid reroll per shop: refills only the unpurchased slots, keeps sold
  // ones sold, then locks out further rerolls for this shop.
  _rerollShop() {
    const inv = this.currentRoom && this.currentRoom.shopInventory;
    if (!inv || inv.rerolled) return;
    const cost = this._rerollCost();
    if (this.player.gold < cost) { this.audio.play('ui'); return; }
    this.player.gold -= cost;
    inv.rerolled = true;
    const openSlots = inv.items.filter((it) => !it.bought).length;
    const fresh = this._genShopItems(inv.pool, inv.costBase, inv.bias, openSlots);
    let fi = 0;
    inv.items = inv.items.map((it) => (it.bought ? it : (fresh[fi++] || it)));
    this.shopItems = inv.items;
    this.audio.play('uiconfirm');
  }

  _closeShop() {
    this.shopMode = false;
    this.shopItems = null;
    // Snooze so the shop stays shut while the player is on the pad; stepping
    // away re-arms it (see the _rewardSnoozed release in _updatePlaying).
    if (this.currentRoom) this.currentRoom._rewardSnoozed = true;
    this.prompt = 'Come back anytime — the shopkeeper waits';
    this._setState(GAME_STATE.PLAYING);
  }


  // ----------------------------------------------------------------- kills/end
  _onKilled(target) {
    // Reward multipliers: player boons (greed / xpMult) × difficulty scaling.
    const greed = (1 + (this.player.stats.greed || 0)) * this.difficulty.goldMult();
    // Layered death effect: coloured gib burst + white flash pop for punch.
    const big = target === this.boss || target.isElite;
    this.particles.burst(target.x, target.y, target.color || '#fff', big ? 30 : 16, { speed: big ? 340 : 260, life: 0.6 });
    this.particles.burst(target.x, target.y, '#ffffff', big ? 14 : 8, { speed: big ? 200 : 150, life: 0.28, size: 4 });
    this.camera.addShake(target === this.boss ? 14 : target.isElite ? 8 : 5);
    this.audio.play('die');
    this.kills++;
    this.soulsEarned += 1;
    const s = this.player.stats;
    // Kill-triggered boons.
    if (s.surgeOnKill) s.surgeT = 3.0;
    if (s.killSpeed > 0) s.killSpeedT = 2.0;
    if (s.healOnKill > 0) this.player.heal(s.healOnKill);
    this.synergy.onKill(target);
    const xpBoost = (1 + s.xpMult) * this.difficulty.xpMult();

    if (target === this.boss) {
      this.player.gold += Math.round(target.def.gold * greed);
      const lv = this.player.gainXp(Math.round(target.def.xp * xpBoost));
      this._queueUpgrades(lv, 'boon');
      this._pendingBossRelic = target.def.rewardRelicId;
      this._queueUpgrades(1, 'relic'); // bosses always drop a relic
      // Victory handled by _checkRoomClear.
      return;
    }
    // Regular enemy.
    this.player.gold += Math.round((target.goldValue || 0) * greed);
    this._runMaxGold = Math.max(this._runMaxGold || 0, this.player.gold);
    const levels = this.player.gainXp(Math.round((target.xpValue || 0) * xpBoost));
    if (levels > 0) this._queueUpgrades(levels, 'boon');
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
    const heatMult = 1 + (this.heat || 0) * SOUL_BONUS_PER_HEAT;
    let souls = Math.round((this.soulsEarned + (won ? 40 : 0)) * greed * heatMult);
    if (won && this.heat > 0) {
      for (const m of HEAT_MILESTONES) {
        if (this.heat >= m.heat && !this.save.data.heatMilestones.includes(m.heat)) {
          this.save.data.heatMilestones.push(m.heat);
          souls += m.souls;
          this._newFeats.push({ name: `Heat ${m.heat} Conquered`, souls: m.souls });
        }
      }
    }
    this._lastSouls = souls;
    this.save.addSouls(souls);
    this.save.recordRun({
      won, kills: this.kills, depth: this.floor,
      level: this.player.level, bossId: won && this.bossDef ? this.bossDef.id : null,
    });
    this.save.addWeaponKills(this.player.stats.weaponId, this.kills);
    // Achievements: evaluate against updated save + this run's snapshot.
    const run = {
      synergies: this._runSynergies || 0,
      relics: this.ownedUpgrades.filter((u) => u.relic).length,
      maxGold: this._runMaxGold || 0,
      level: this.player.level,
    };
    for (const a of ACHIEVEMENTS) {
      if (!this.save.hasAchievement(a.id) && a.check(this.save.data, run)) {
        this.save.grantAchievement(a.id);
        this.save.addSouls(a.souls);
        this._newFeats.push(a);
      }
    }
  }

  _descend() {
    // Continue the run to a harder floor after victory.
    this._runCommitted = false;
    this.floor++;
    this._pendingVictory = false;
    this.player.health = Math.min(this.player.maxHealth, this.player.health + Math.round(this.player.maxHealth * 0.35));
    this._buildFloor();
    this._setState(GAME_STATE.PLAYING);
    this._exploreMood();
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
      case GAME_STATE.EVENT:
      case GAME_STATE.SETTINGS:
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

    // Boss cinematic intro: world frozen, letterbox drawn in render().
    if (this.bossIntroT > 0) {
      this.bossIntroT -= dt;
      this.camera.update(dt);
      if (this.bossIntroT > 1.6) this.camera.addShake(0.7); // rumble while the name card lands
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
      if (p.tryDash(axis.x, axis.y)) {
        this.audio.play('dash');
        this.camera.addShake(2);
        this.synergy.onDash();
      }
    }
    if (p.isDashing) this.synergy.dashTick(dt);
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
      spawnProjectile: (o) => {
        if (o.hostile && this.pactMods && this.pactMods.projSpeed !== 1) {
          o.vx *= this.pactMods.projSpeed; o.vy *= this.pactMods.projSpeed;
        }
        return this.projectiles.spawn(o);
      },
      spawnEnemy: (type, x, y) => {
        if (this.enemies.length < 60) {
          const e = this.spawnSystem.spawnAt(type, x, y, bounds, this.floor - 1);
          e.spawnedBySummon = true;
          this.enemies.push(e);
          this.particles.burst(e.x, e.y, e.accent, 8, { speed: 140, life: 0.4 });
        }
      },
      spawnAdd: (boss, type = 'melee') => {
        if (this.enemies.length < 40) {
          this.enemies.push(this.spawnSystem.spawnAdd(boss, bounds, p, type));
        }
      },
      spawnHazard: (o) => this.hazards.spawn(o),
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

    // --- projectiles + hazards + combat ---
    updateProjectiles(this.projectiles, dt, bounds);
    this.hazards.update(dt, {
      player: p,
      damagePlayer: (dmg, x, y, kb) => this.combat._damagePlayer(dmg, x, y, kb),
      onDetonate: (h) => {
        this.particles.burst(h.x, h.y, h.color, 12, { speed: 220, life: 0.4 });
        this.camera.addShake(3);
        this.audio.play('boom');
      },
    });
    this.combat.update(dt);

    // --- separation so enemies don't stack perfectly ---
    this._separateEnemies();

    // --- fx ---
    if (this.biome && this.biome.ambient) {
      this._ambientT -= dt;
      if (this._ambientT <= 0) {
        const amb = this.biome.ambient;
        this._ambientT = 1 / amb.rate;
        this.particles.drift(
          60 + Math.random() * (CONFIG.world.width - 120),
          40 + Math.random() * (CONFIG.world.height - 80),
          amb.color,
          amb.vx + (Math.random() - 0.5) * 6,
          amb.vy + (Math.random() - 0.5) * 6,
          2.5 + Math.random() * 2, amb.size,
        );
      }
    }
    this.particles.update(dt);
    this.damageNumbers.update(dt);
    this.camera.update(dt);

    // Pact of the Hourglass: floor timer empowers enemies when it expires.
    if (this.pactMods && this.pactMods.hourglass) {
      this.floorTime += dt;
      if (!this._hourglassTriggered && this.floorTime > 180) {
        this._hourglassTriggered = true;
        this._hourglassPenalty = 1.3;
        for (const e of this.enemies) e.damage *= 1.3;
        if (this.boss) { this.boss.contactDamage *= 1.3; this.boss.projDamage = Math.round(this.boss.projDamage * 1.3); }
        this.prompt = '⏳ The hourglass runs dry — the dungeon\'s wrath grows!';
        this.audio.play('bossroar');
        this.camera.addShake(8);
      }
    }

    // --- event fights (rooms that aren't needsClearing) ---
    if (this.eventFight) {
      this.enemies = this.enemies.filter((e) => e.alive);
      if (this.eventFight.timeLimit) {
        this.eventFight.timeLeft -= dt;
        this.prompt = `⏳ ${Math.max(0, Math.ceil(this.eventFight.timeLeft))}s — ${this.enemies.length} challengers remain`;
        if (this.eventFight.timeLeft <= 0) this._resolveEventFight(false);
      }
      if (this.eventFight && this.enemies.length === 0) this._resolveEventFight(true);
    }
    // Re-arm a snoozed reward (shop / event) once the player steps away from
    // the pad, so closing it stays closed until deliberately re-triggered.
    if (this.currentRoom && this.currentRoom._rewardSnoozed) {
      const dx = p.x - this.currentRoom.bounds.w / 2, dy = p.y - this.currentRoom.bounds.h / 2;
      if (dx * dx + dy * dy > REWARD_REARM_DIST * REWARD_REARM_DIST) this.currentRoom._rewardSnoozed = false;
    }

    // --- world checks ---
    this._checkRoomClear();
    this._tryTransition();
    this._tryReward();

    if (this._pendingVictory && this.upgradeQueue.length === 0) {
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

    let inWorld = [GAME_STATE.PLAYING, GAME_STATE.UPGRADE, GAME_STATE.EVENT, GAME_STATE.PAUSED].includes(this.state) ||
                    (this.state === GAME_STATE.GAMEOVER) || (this.state === GAME_STATE.VICTORY);
    // Settings opened from pause keeps the paused world visible behind it.
    if (this.state === GAME_STATE.SETTINGS && this._settingsReturn === GAME_STATE.PAUSED) inWorld = true;

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

    // Boss cinematic letterbox + name card.
    if (this.bossIntroT > 0 && this.boss && this.state === GAME_STATE.PLAYING) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      const W = this.canvas.width, H = this.canvas.height;
      const inT = Math.min(1, (2.4 - this.bossIntroT) / 0.35);       // slide in
      const outT = Math.min(1, this.bossIntroT / 0.3);               // slide out
      const bar = 64 * Math.min(inT, outT);
      c.fillStyle = '#000';
      c.fillRect(0, 0, W, bar);
      c.fillRect(0, H - bar, W, bar);
      if (this.bossIntroT < 2.0 && this.bossIntroT > 0.3) {
        const a = Math.min(1, (2.0 - this.bossIntroT) / 0.3);
        c.globalAlpha = a;
        c.textAlign = 'center';
        c.fillStyle = this.boss.accent;
        c.font = 'bold 38px "Trebuchet MS", system-ui';
        c.fillText(this.boss.def.name, W / 2, H / 2 - 90);
        c.fillStyle = 'rgba(230,235,250,0.85)';
        c.font = 'italic 17px "Trebuchet MS", system-ui';
        c.fillText(this.boss.def.title, W / 2, H / 2 - 60);
        c.globalAlpha = 1;
      }
    }

    // State overlays / screens. All centred overlays scale about the screen
    // centre by the global UI scale; full-screen backdrops inside them reset
    // to identity so they always cover the viewport. Mouse hit-testing uses
    // the same centre-anchored mapping (ui.begin), so clicks stay aligned.
    this.ui.begin();
    this.ui.pushCenter();
    switch (this.state) {
      case GAME_STATE.MENU: this.screens.menu(); break;
      case GAME_STATE.UPGRADE: this.screens.upgrade(); break;
      case GAME_STATE.EVENT: this.screens.event(); break;
      case GAME_STATE.SETTINGS: this.screens.settings(); break;
      case GAME_STATE.PAUSED: this.screens.pause(); break;
      case GAME_STATE.GAMEOVER: this.screens.gameOver(); break;
      case GAME_STATE.VICTORY: this.screens.victory(); break;
    }
    this.ui.pop();
  }
}
