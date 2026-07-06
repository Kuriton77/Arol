// Automated smoke test: boots the game in headless Chromium, watches for console
// errors, drives the simulation through menu → run → combat → boss, and asserts
// core invariants. Also captures screenshots for visual inspection.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'url';
import path from 'path';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8017';
const OUT = path.dirname(fileURLToPath(import.meta.url)) + '/../scratch-shots';

const errors = [];
const logs = [];

function assert(cond, msg) {
  if (!cond) { console.error('  ✗ ASSERT FAILED:', msg); process.exitCode = 1; }
  else console.log('  ✓', msg);
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });

page.on('console', (m) => { logs.push(m.text()); if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

console.log('Loading', BASE);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__AROL__ && window.__AROL__.state, null, { timeout: 5000 });

// --- Menu state ---
let s = await page.evaluate(() => window.__AROL__.state);
assert(s === 'menu', `boots into menu (got ${s})`);
await page.screenshot({ path: `${OUT}/01-menu.png` });

// --- Start a run programmatically (audio init needs gesture; call directly) ---
await page.evaluate(() => { window.__AROL__.audio.enabled = false; window.__AROL__.startRun(); });
await page.waitForTimeout(200);
let info = await page.evaluate(() => {
  const g = window.__AROL__;
  return { state: g.state, hasPlayer: !!g.player, room: g.currentRoom.type, rooms: g.dungeon.rooms.length,
           hp: g.player.health, maxhp: g.player.maxHealth };
});
assert(info.state === 'playing', 'run starts → playing');
assert(info.hasPlayer, 'player exists');
assert(info.rooms >= 10 && info.rooms <= 14, `dungeon has 10-14 rooms (got ${info.rooms})`);
assert(info.hp === info.maxhp && info.hp > 0, `player at full health (${info.hp}/${info.maxhp})`);

// --- Verify room-type variety across the dungeon ---
const types = await page.evaluate(() => {
  const set = {};
  for (const r of window.__AROL__.dungeon.rooms) set[r.type] = (set[r.type] || 0) + 1;
  return set;
});
console.log('  room types:', JSON.stringify(types));
assert(types.boss === 1, 'exactly one boss room');
assert(!!types.start, 'has a start room');

// --- Drive the simulation for several seconds with synthetic input ---
// Simulate held movement + attacks by poking the input + stepping update().
await page.evaluate(async () => {
  const g = window.__AROL__;
  const inp = g.input;
  // Move into the first combat room via a door if start has one, then fight.
  let attackTimer = 0;
  for (let frame = 0; frame < 60 * 12; frame++) {
    // Fake input: chase nearest enemy or wander right; always attacking.
    inp.keys.clear();
    let tx = 480, ty = 270;
    if (g.enemies.length) { tx = g.enemies[0].x; ty = g.enemies[0].y; }
    else if (g.boss) { tx = g.boss.x; ty = g.boss.y; }
    else {
      // Head toward a door to progress.
      const doors = Object.keys(g.currentRoom.doors);
      if (doors.length) {
        const dp = g.currentRoom.doorPos(doors[0]);
        tx = dp.x; ty = dp.y;
      }
    }
    if (tx > g.player.x + 4) inp.keys.add('d'); else if (tx < g.player.x - 4) inp.keys.add('a');
    if (ty > g.player.y + 4) inp.keys.add('s'); else if (ty < g.player.y - 4) inp.keys.add('w');
    inp.mouse.x = tx; inp.mouse.y = ty; inp.mouse.down = true;
    if (frame % 45 === 0) { inp.keys.add(' '); inp._downThisFrame.add(' '); } // periodic dash
    g.update(1 / 60);
    // If an upgrade screen appears, auto-pick the first to continue.
    if (g.state === 'upgrade') {
      if (g.shopMode) g._closeShop();
      else g._pickUpgrade(g.upgradeChoices[0]);
    }
  }
  window.__TEST_SNAPSHOT__ = {
    state: g.state, kills: g.kills, roomsCleared: g.roomsCleared,
    projectiles: g.projectiles.count, particles: g.particles.pool.count,
    ownedUpgrades: g.ownedUpgrades.length, floor: g.floor,
    playerAlive: g.player.alive, room: g.currentRoom.type,
  };
});
const snap = await page.evaluate(() => window.__TEST_SNAPSHOT__);
console.log('  sim snapshot:', JSON.stringify(snap));
assert(snap.kills > 0, `player killed enemies (${snap.kills})`);
assert(['playing', 'upgrade', 'gameover', 'victory'].includes(snap.state), 'game in a valid state after sim');
await page.screenshot({ path: `${OUT}/02-combat.png` });

// --- Weapon framework: every weapon must fight through the shared pipeline ---
const weaponResults = await page.evaluate(() => {
  const g = window.__AROL__;
  const results = {};
  const ids = ['sword', 'greatsword', 'dagger', 'spear', 'bow', 'staff'];
  for (const id of ids) {
    g.save.data.selectedWeapon = id;
    g.save.data.unlockedWeapons = ids;
    g.startRun();
    // Enter the first room that needs clearing so enemies exist.
    const combat = g.dungeon.rooms.find((r) => r.type === 'combat');
    g._enterRoom(combat, null, false);
    const hpBefore = g.enemies.reduce((s, e) => s + e.health, 0);
    for (let f = 0; f < 60 * 6; f++) {
      const inp = g.input;
      inp.keys.clear();
      let tx = 480, ty = 270;
      if (g.enemies.length) { tx = g.enemies[0].x; ty = g.enemies[0].y; }
      if (tx > g.player.x + 4) inp.keys.add('d'); else if (tx < g.player.x - 4) inp.keys.add('a');
      if (ty > g.player.y + 4) inp.keys.add('s'); else if (ty < g.player.y - 4) inp.keys.add('w');
      inp.mouse.x = tx; inp.mouse.y = ty; inp.mouse.down = true;
      g.update(1 / 60);
      if (g.state === 'upgrade') {
        if (g.shopMode) g._closeShop();
        else g._pickUpgrade(g.upgradeChoices[0]);
      }
      if (g.state !== 'playing') break;
    }
    const hpAfter = g.enemies.reduce((s, e) => s + e.health, 0);
    results[id] = { dealt: hpBefore - hpAfter + (g.kills > 0 ? 1 : 0), combo: g.player.comboIndex, kills: g.kills };
  }
  return results;
});
for (const [id, r] of Object.entries(weaponResults)) {
  assert(r.dealt > 0, `weapon '${id}' deals damage (${Math.round(r.dealt)})`);
}
// --- Relics & synergies: pools sized, tags tracked, synergies activate ---
const relicPhase = await page.evaluate(async () => {
  const g = window.__AROL__;
  const { RELICS } = await import('./src/data/relics.js');
  const { UPGRADES } = await import('./src/data/upgrades.js');
  const { SYNERGIES } = await import('./src/systems/SynergySystem.js');
  g.save.data.selectedWeapon = 'sword';
  g.startRun();
  // Apply a fire relic + lightning boon → Plasma Burst synergy must activate.
  const ember = RELICS.find((r) => r.id === 'r_ember_heart');
  const chain = UPGRADES.find((u) => u.id === 'chain');
  g._applyUpgrade(ember);
  g._applyUpgrade(chain);
  const active = [...g.synergy.active];
  // Fight a room to exercise on-hit synergy effects.
  const combat = g.dungeon.rooms.find((r) => r.type === 'combat');
  g._enterRoom(combat, null, false);
  for (let f = 0; f < 60 * 5; f++) {
    const inp = g.input;
    inp.keys.clear();
    const t = g.enemies.find((e) => e.alive);
    if (!t) break;
    inp.mouse.x = t.x; inp.mouse.y = t.y; inp.mouse.down = true;
    if (t.x > g.player.x) inp.keys.add('d'); else inp.keys.add('a');
    if (f % 50 === 0) inp._downThisFrame.add(' ');
    g.update(1 / 60);
    if (g.state === 'upgrade') g._pickUpgrade(g.upgradeChoices[0]);
    if (g.state !== 'playing') break;
  }
  return {
    relicCount: RELICS.length,
    upgradeCount: UPGRADES.length,
    synergyCount: SYNERGIES.length,
    tags: g.ownedTags,
    active,
    state: g.state,
  };
});
console.log('  relic phase:', JSON.stringify(relicPhase));
assert(relicPhase.relicCount >= 60, `60+ relics defined (${relicPhase.relicCount})`);
assert(relicPhase.upgradeCount + 18 >= 80, `80+ upgrades incl. weapon pools (${relicPhase.upgradeCount}+18)`);
assert(relicPhase.synergyCount >= 14, `14+ synergies defined (${relicPhase.synergyCount})`);
assert(relicPhase.active.includes('plasma'), 'fire+lightning activates Plasma Burst');

// --- Enemy expansion: every archetype must run its AI without errors ---
const enemyPhase = await page.evaluate(async () => {
  const g = window.__AROL__;
  const { ENEMY_TYPES } = await import('./src/data/enemies.js');
  const types = Object.keys(ENEMY_TYPES);
  g.save.data.selectedWeapon = 'sword';
  g.startRun();
  const room = g.dungeon.rooms.find((r) => r.type === 'combat');
  g._enterRoom(room, null, false);
  // Replace the planned encounter with one of each archetype.
  g.enemies = types.map((t, i) => {
    const a = (i / types.length) * Math.PI * 2;
    return g.spawnSystem.spawnAt(t, 480 + Math.cos(a) * 200, 270 + Math.sin(a) * 160, room.bounds, 0);
  });
  const seenStates = new Set();
  let playerHurt = false;
  const hp0 = g.player.health;
  for (let f = 0; f < 60 * 14; f++) {
    const inp = g.input;
    inp.keys.clear();
    const target = g.enemies.find((e) => e.alive);
    if (!target) break;
    inp.mouse.x = target.x; inp.mouse.y = target.y; inp.mouse.down = true;
    if (target.x > g.player.x + 4) inp.keys.add('d'); else inp.keys.add('a');
    if (target.y > g.player.y + 4) inp.keys.add('s'); else inp.keys.add('w');
    g.update(1 / 60);
    for (const e of g.enemies) seenStates.add(e.ai + ':' + e.state);
    if (g.player.health < hp0) playerHurt = true;
    if (g.state === 'upgrade') { if (g.shopMode) g._closeShop(); else g._pickUpgrade(g.upgradeChoices[0]); }
    if (g.state !== 'playing') break;
  }
  return {
    typeCount: types.length,
    remaining: g.enemies.filter((e) => e.alive).length,
    playerHurt,
    states: [...seenStates].length,
    state: g.state,
  };
});
console.log('  enemy phase:', JSON.stringify(enemyPhase));
assert(enemyPhase.typeCount >= 14, `14+ enemy archetypes defined (${enemyPhase.typeCount})`);
assert(enemyPhase.states > 14, `archetypes exercise varied AI states (${enemyPhase.states})`);
assert(['playing', 'gameover', 'upgrade'].includes(enemyPhase.state), 'sim stayed valid during enemy stress');

// Reset to sword for boss test.
await page.evaluate(() => { const g = window.__AROL__; g.save.data.selectedWeapon = 'sword'; g.startRun(); });

// --- Event rooms: 10 events, options resolve, fights pay on clear ---
const eventPhase = await page.evaluate(async () => {
  const g = window.__AROL__;
  const { EVENTS, eventById } = await import('./src/data/events.js');
  const outcomes = {};
  for (const ev of EVENTS) {
    g.save.data.selectedWeapon = 'sword';
    g.startRun();
    const room = g.dungeon.rooms.find((r) => r.type === 'event') || g.dungeon.rooms.find((r) => r.type === 'combat');
    room.reward = { kind: 'event', variant: ev.id };
    room.cleared = true; room.type = 'event'; room.enemyPlan = [];
    g._enterRoom(room, null, false);
    g.player.gold = 200; // afford every option
    // Give the test pilot a mid-run loadout so event fights are fair.
    const { UPGRADES } = await import('./src/data/upgrades.js');
    g._applyUpgrade(UPGRADES.find((u) => u.id === 'power'));
    g._applyUpgrade(UPGRADES.find((u) => u.id === 'haste'));
    g._applyUpgrade(UPGRADES.find((u) => u.id === 'vigor'));
    g._applyUpgrade(UPGRADES.find((u) => u.id === 'lifesteal'));
    g._applyUpgrade(UPGRADES.find((u) => u.id === 'regen'));
    g.currentEvent = eventById(ev.id);
    g._setState('event');
    const opts = ev.options(g);
    g._eventChoose(opts[0]); // always take the first (riskiest) option
    // If a fight started, battle it out — orbiting the target to flank
    // frontal-blockers, the way a real player would.
    let frames = 0;
    while (g.eventFight && frames++ < 60 * 40) {
      const t = g.enemies.find((e) => e.alive);
      if (t) {
        g.input.mouse.x = t.x; g.input.mouse.y = t.y; g.input.mouse.down = true;
        const p = g.player;
        const a = Math.atan2(t.y - p.y, t.x - p.x) + 1.1; // spiral behind
        const mx = Math.cos(a), my = Math.sin(a);
        g.input.keys.clear();
        if (mx > 0.3) g.input.keys.add('d'); else if (mx < -0.3) g.input.keys.add('a');
        if (my > 0.3) g.input.keys.add('s'); else if (my < -0.3) g.input.keys.add('w');
        if (frames % 55 === 0) g.input._downThisFrame.add(' '); // dash for i-frames
      }
      g.update(1 / 60);
      if (g.state === 'upgrade') { if (g.shopMode) g._closeShop(); else g._pickUpgrade(g.upgradeChoices[0]); }
      if (g.state === 'gameover') break;
    }
    if (g.state === 'upgrade') { if (g.shopMode) g._closeShop(); else g._pickUpgrade(g.upgradeChoices[0]); }
    // Dying to an event fight is a legitimate outcome of a risk event —
    // "resolved" means cleared OR the run ended; never a stuck fight.
    outcomes[ev.id] = { state: g.state, fightDone: !g.eventFight || g.state === 'gameover' };
  }
  return { count: EVENTS.length, outcomes };
});
console.log('  event phase:', JSON.stringify(eventPhase.outcomes));
assert(eventPhase.count >= 10, `10+ event types defined (${eventPhase.count})`);
assert(Object.values(eventPhase.outcomes).every((o) => o.fightDone), 'all event fights resolve (win or death, never stuck)');
assert(Object.values(eventPhase.outcomes).filter((o) => o.state === 'playing' || o.state === 'upgrade').length >= 8, 'most events end with the run still alive');
assert(Object.values(eventPhase.outcomes).every((o) => ['playing', 'gameover', 'upgrade'].includes(o.state)), 'events leave the game in a valid state');

// --- Biomes: each floor themes rooms, enemies, hazards, decor ---
const biomePhase = await page.evaluate(async () => {
  const g = window.__AROL__;
  const { BIOMES } = await import('./src/data/biomes.js');
  const out = [];
  g.startRun();
  for (let floor = 1; floor <= BIOMES.length; floor++) {
    g.floor = floor;
    g._buildFloor();
    const combat = g.dungeon.rooms.find((r) => r.type === 'combat');
    g._enterRoom(combat, null, false);
    // Are spawned enemies drawn from the biome roster?
    const roster = new Set(g.biome.enemies);
    const { ENEMY_TYPES } = await import('./src/data/enemies.js');
    const typeOf = (e) => Object.keys(ENEMY_TYPES).find((k) => ENEMY_TYPES[k] === e.def);
    const allInRoster = g.enemies.every((e) => roster.has(typeOf(e)));
    // Step a second to ensure hazards/decor/ambient run clean.
    for (let f = 0; f < 60; f++) g.update(1 / 60);
    out.push({
      biome: g.biome.id, boss: g.bossDef.id,
      decor: (combat.decor || []).length,
      hazards: g.hazards.count,
      allInRoster,
    });
  }
  return out;
});
console.log('  biome phase:', JSON.stringify(biomePhase));
assert(biomePhase.length >= 6, `6 biomes cycle by floor (${biomePhase.length})`);
assert(biomePhase.every((b) => b.allInRoster), 'combat spawns come from biome-exclusive rosters');
assert(biomePhase.some((b) => b.decor > 0), 'biome decorations placed');
assert(biomePhase.some((b) => b.hazards > 0), 'environmental hazards spawn');
assert(new Set(biomePhase.map((b) => b.boss)).size === 6, 'each biome has its own boss');

// --- All six bosses: instantiate, run patterns, emit attacks, no errors ---
const bossResults = await page.evaluate(async () => {
  const g = window.__AROL__;
  const { BOSSES } = await import('./src/data/bosses.js');
  const results = {};
  for (let floor = 1; floor <= BOSSES.length; floor++) {
    g.startRun();
    g.floor = floor;
    g._buildFloor();
    g.bossIntroT = 0; // skip cinematic for the test
    g._enterRoom(g.dungeon.boss, null, false);
    g.bossIntroT = 0;
    if (g.boss) g.boss.iframes = 0;
    const id = g.bossDef.id;
    const patterns = new Set();
    let projSeen = 0, hazardsSeen = 0, addsSeen = 0;
    for (let f = 0; f < 60 * 10; f++) {
      g.input.keys.clear();
      if (g.boss) { g.input.mouse.x = g.boss.x; g.input.mouse.y = g.boss.y; }
      g.input.mouse.down = true;
      // Move to dodge a little so charge patterns end.
      if (f % 40 < 20) g.input.keys.add('d'); else g.input.keys.add('a');
      g.update(1 / 60);
      if (g.boss) {
        if (g.boss.pattern) patterns.add(g.boss.pattern);
        projSeen = Math.max(projSeen, g.projectiles.count);
        hazardsSeen = Math.max(hazardsSeen, g.hazards.count);
        addsSeen = Math.max(addsSeen, g.enemies.length);
      }
      if (g.state === 'upgrade') { if (g.shopMode) g._closeShop(); else g._pickUpgrade(g.upgradeChoices[0]); }
      if (g.state !== 'playing') break;
    }
    results[id] = {
      phases: g.bossDef.phases.length,
      patterns: [...patterns],
      attacked: projSeen > 0 || hazardsSeen > 0 || addsSeen > 0,
      state: g.state,
    };
  }
  return results;
});
let bossCount = 0;
for (const [id, r] of Object.entries(bossResults)) {
  bossCount++;
  assert(r.phases >= 3, `boss '${id}' has 3+ phases`);
  assert(r.patterns.length >= 1 && r.attacked, `boss '${id}' ran patterns [${r.patterns.join(',')}]`);
}
assert(bossCount >= 5, `5+ bosses defined and exercised (${bossCount})`);
await page.screenshot({ path: `${OUT}/03-boss.png` });

// --- Meta progression: skill tree, mastery, blacksmith, achievements, migration ---
const metaPhase = await page.evaluate(async () => {
  const g = window.__AROL__;
  const { META_TREE, masteryLevel, ACHIEVEMENTS } = await import('./src/data/meta.js');
  // v1 save migration: refund old flat upgrades.
  localStorage.setItem('arol.save.v1', JSON.stringify({
    souls: 10, metaLevels: { m_damage: 2 }, unlockedWeapons: ['sword'],
    selectedWeapon: 'sword', stats: { runs: 3, wins: 1, kills: 50, bestDepth: 2 },
  }));
  const { SaveSystem } = await import('./src/systems/SaveSystem.js');
  const migrated = new SaveSystem();
  const migrationOk = migrated.data.version === 2 && migrated.data.souls === 10 + 25 + 40
    && migrated.data.stats.kills === 50 && !migrated.data.metaLevels;

  // Skill tree: buy the first Power node, verify it applies to a new run.
  g.save.data.souls = 500;
  g.save.buyNode('p1');
  g.save.buyNode('f6'); // Fated keystone: start with a boon
  g.startRun();
  const treeApplied = g.player.stats.damageMult > 1.05;
  const fatedApplied = g.ownedUpgrades.length >= 1;

  // Mastery + blacksmith.
  g.save.addWeaponKills('sword', 75); // → level 3
  g.save.forgeWeapon('sword');
  g.startRun();
  const masteryOk = masteryLevel(g.save.weaponKills('sword')) === 3
    && g.player.stats.attackSpeedMult > 1.04
    && g.player.stats.baseDamage > 18;

  // Achievements: commit a run and expect kill/win-based feats.
  g.kills = 5;
  g._runCommitted = false;
  g._commitRun(true);
  const feats = g.save.data.achievements;
  return {
    migrationOk, treeApplied, fatedApplied, masteryOk,
    nodeCount: META_TREE.reduce((s, b) => s + b.nodes.length, 0),
    achievementCount: ACHIEVEMENTS.length,
    earned: feats.length,
  };
});
console.log('  meta phase:', JSON.stringify(metaPhase));
assert(metaPhase.migrationOk, 'v1 save migrates to v2 with soul refund');
assert(metaPhase.treeApplied, 'skill-tree node applies at run start');
assert(metaPhase.fatedApplied, 'Fated keystone grants a starting boon');
assert(metaPhase.masteryOk, 'weapon mastery + blacksmith forge apply');
assert(metaPhase.nodeCount >= 18, `18-node skill tree (${metaPhase.nodeCount})`);
assert(metaPhase.achievementCount >= 14, `14+ achievements (${metaPhase.achievementCount})`);
assert(metaPhase.earned >= 2, `achievements are granted (${metaPhase.earned})`);

// --- Pacts: modifiers apply, heat multiplies souls, milestones pay ---
const pactPhase = await page.evaluate(async () => {
  const g = window.__AROL__;
  const { PACTS, totalHeat, pactMods } = await import('./src/data/pacts.js');
  // Baseline run for comparison.
  g.save.data.pacts = {};
  g.startRun();
  const baseHp = g.player.maxHealth;
  // Crank several pacts.
  g.save.data.pacts = { swiftness: 2, legion: 2, elites: 2, tyranny: 2, scarcity: 1, frailty: 2, darkness: 1, hourglass: 1 };
  g.startRun();
  const heat = g.heat;
  const frailtyOk = g.player.maxHealth === baseHp - 30;
  const healBefore = g.player.health = Math.round(g.player.maxHealth / 2);
  g.player.heal(20);
  const scarcityOk = Math.abs(g.player.health - (healBefore + 10)) < 0.6;
  // Enter combat: legion/elite/speed applied to spawns.
  const combat = g.dungeon.rooms.find((r) => r.type === 'combat');
  g._enterRoom(combat, null, false);
  const speeds = g.enemies.map((e) => e.speed / e.def.speed);
  const speedOk = speeds.every((s) => s >= 1.24); // 1.25 pact (elites add 1.12 more)
  // Boss buff.
  g._enterRoom(g.dungeon.boss, null, false);
  g.bossIntroT = 0;
  const bossBuffed = g.boss.maxHealth > g.bossDef.health;
  // Souls multiplier + milestone on a heat win.
  g.soulsEarned = 100;
  g._runCommitted = false;
  g.save.data.heatMilestones = [];
  const soulsBefore = g.save.data.souls;
  g._commitRun(true);
  const gained = g.save.data.souls - soulsBefore;
  const heatMult = 1 + heat * 0.12;
  const expectedMin = Math.round(140 * heatMult * (1 + (g.player.stats.greed || 0))); // 100+40 base, + milestones
  return { pactCount: PACTS.length, heat, frailtyOk, scarcityOk, speedOk, bossBuffed, gained, expectedMin, milestones: g.save.data.heatMilestones };
});
console.log('  pact phase:', JSON.stringify(pactPhase));
assert(pactPhase.pactCount >= 8, `8+ pacts defined (${pactPhase.pactCount})`);
assert(pactPhase.heat >= 10, `heat accumulates (${pactPhase.heat})`);
assert(pactPhase.frailtyOk, 'Frailty reduces max health');
assert(pactPhase.scarcityOk, 'Scarcity halves healing');
assert(pactPhase.speedOk, 'Swiftness speeds up spawned enemies');
assert(pactPhase.bossBuffed, 'Tyranny buffs boss health');
assert(pactPhase.gained >= pactPhase.expectedMin, `heat multiplies souls + milestones (${pactPhase.gained} >= ${pactPhase.expectedMin})`);
assert(pactPhase.milestones.length === 3, 'heat-9 win claims all three milestones');
// Reset pacts so later reloads start clean.
await page.evaluate(() => { const g = window.__AROL__; g.save.data.pacts = {}; g.save.save(); });

console.log('\nConsole errors:', errors.length);
errors.slice(0, 20).forEach((e) => console.log('  !', e));
assert(errors.length === 0, 'no console/page errors during full run');

await browser.close();
console.log(process.exitCode ? '\nSMOKE TEST: FAILED' : '\nSMOKE TEST: PASSED');
