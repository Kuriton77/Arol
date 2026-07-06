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

// --- Force a boss room to validate boss systems ---
await page.evaluate(() => {
  const g = window.__AROL__;
  const boss = g.dungeon.boss;
  g._enterRoom(boss, null, false);
});
await page.waitForTimeout(50);
let bossInfo = await page.evaluate(() => {
  const g = window.__AROL__;
  return { hasBoss: !!g.boss, bhp: g.boss ? g.boss.health : 0, phases: g.boss ? g.boss.def.phases.length : 0 };
});
assert(bossInfo.hasBoss, 'boss spawns in boss room');
assert(bossInfo.phases >= 3, `boss has 3+ phases (${bossInfo.phases})`);

// Step boss fight to ensure it emits projectiles / changes state without error.
await page.evaluate(() => {
  const g = window.__AROL__;
  for (let i = 0; i < 60 * 8; i++) {
    g.input.keys.clear();
    g.input.mouse.x = g.boss ? g.boss.x : 480; g.input.mouse.y = g.boss ? g.boss.y : 270;
    g.input.mouse.down = true;
    g.update(1 / 60);
  }
  window.__BOSS_SNAP__ = { proj: g.projectiles.count, bhp: g.boss ? g.boss.health : -1, state: g.state };
});
const bsnap = await page.evaluate(() => window.__BOSS_SNAP__);
console.log('  boss snapshot:', JSON.stringify(bsnap));
await page.screenshot({ path: `${OUT}/03-boss.png` });

console.log('\nConsole errors:', errors.length);
errors.slice(0, 20).forEach((e) => console.log('  !', e));
assert(errors.length === 0, 'no console/page errors during full run');

await browser.close();
console.log(process.exitCode ? '\nSMOKE TEST: FAILED' : '\nSMOKE TEST: PASSED');
