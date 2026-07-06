// Captures the remaining overlay screens for visual QA.
import { chromium } from 'playwright-core';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = 'http://127.0.0.1:8017';
const OUT = new URL('../scratch-shots/', import.meta.url).pathname;

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__AROL__);

await page.screenshot({ path: OUT + '04-menu-fixed.png' });

// Upgrade screen.
await page.evaluate(() => { const g = window.__AROL__; g.audio.enabled = false; g.startRun(); g._queueUpgrades(1, 'level'); });
await page.waitForTimeout(120);
await page.screenshot({ path: OUT + '05-upgrade.png' });

// Shop screen.
await page.evaluate(() => { const g = window.__AROL__; if (g.state === 'upgrade') g._pickUpgrade(g.upgradeChoices[0]); g.player.gold = 200; g._openShop(); });
await page.waitForTimeout(120);
await page.screenshot({ path: OUT + '06-shop.png' });

// Victory screen.
await page.evaluate(() => { const g = window.__AROL__; g._closeShop(); g._victory(); });
await page.waitForTimeout(120);
await page.screenshot({ path: OUT + '07-victory.png' });

// Game over screen.
await page.evaluate(() => { const g = window.__AROL__; g._setState('menu'); g.startRun(); g._runCommitted = false; g._gameOver(); });
await page.waitForTimeout(120);
await page.screenshot({ path: OUT + '08-gameover.png' });

await browser.close();
console.log('captured');
