// Procedural event rooms — data-driven risk-versus-reward choices.
// Each event: name, flavour, and options(game) → [{ label, sub, disabled, run }].
// run(game) returns a result string (shown as a prompt), and may instead start
// an event fight via game._startEventFight(...) whose reward pays on clear.

export const EVENTS = [
  {
    id: 'gamble', name: 'Gambling Den', icon: '🎲',
    flavour: 'A hooded figure shakes a cup of bone dice. "Double or nothing, stranger?"',
    options: (g) => [
      {
        label: 'Bet 25 gold', sub: '50%: win 60 · 50%: lose it',
        disabled: g.player.gold < 25,
        run: (g) => {
          g.player.gold -= 25;
          if (g.rng.chance(0.5)) { g.player.gold += 60; g.audio.play('pickup'); return 'The dice smile on you. +60 gold!'; }
          g.audio.play('hurt'); return 'Snake eyes. The gold is gone.';
        },
      },
      {
        label: 'Bet 60 gold', sub: '40%: win 180 · 60%: lose it',
        disabled: g.player.gold < 60,
        run: (g) => {
          g.player.gold -= 60;
          if (g.rng.chance(0.4)) { g.player.gold += 180; g.audio.play('levelup'); return 'A fortune! +180 gold!'; }
          g.audio.play('hurt'); return 'The house always wins.';
        },
      },
    ],
  },
  {
    id: 'cursed_shrine', name: 'Cursed Shrine', icon: '🕯',
    flavour: 'An altar of black stone whispers promises. The candles burn cold.',
    options: (g) => [
      {
        label: 'Accept the pact', sub: '-20 max health → gain a relic',
        run: (g) => {
          g.player.stats.maxHealthBonus -= 20;
          g.player.refreshMaxHealth();
          if (g.player.health <= 0) g.player.health = 1;
          g._queueUpgrades(1, 'relic');
          g.audio.play('bossroar');
          return 'The shrine takes its due... and pays its debt.';
        },
      },
      {
        label: 'Deface the shrine', sub: '50%: 40 gold · 50%: cursed (-10% damage this floor)',
        run: (g) => {
          if (g.rng.chance(0.5)) { g.player.gold += 40; g.audio.play('pickup'); return 'Gold spills from the cracked stone. +40 gold.'; }
          g.player.stats.damageMult = Math.max(0.3, g.player.stats.damageMult - 0.1);
          g.audio.play('hurt');
          return 'A chill settles into your weapon arm. -10% damage.';
        },
      },
    ],
  },
  {
    id: 'sacrifice', name: 'Sacrifice Altar', icon: '🗡',
    flavour: 'Blood for power. The basin has heard this bargain a thousand times.',
    options: (g) => [
      {
        label: 'Offer your blood', sub: `Lose ${Math.round(g?.player ? g.player.health * 0.3 : 30)} health → epic boon`,
        disabled: g.player.health <= 15,
        run: (g) => {
          g.player.health = Math.max(1, g.player.health - Math.round(g.player.health * 0.3));
          const epics = g.boonPool.filter((u) => (u.rarity === 'epic' || u.rarity === 'legendary') && (u.stackable || !g.ownedCounts[u.id]));
          if (epics.length) {
            const boon = epics[g.rng.int(0, epics.length - 1)];
            g._applyUpgrade(boon);
            g.audio.play('levelup');
            return `Power floods in: ${boon.name}!`;
          }
          return 'The altar is silent.';
        },
      },
      {
        label: 'Offer 40 gold', sub: 'Heal 40% of max health',
        disabled: g.player.gold < 40,
        run: (g) => {
          g.player.gold -= 40;
          g.player.heal(Math.round(g.player.maxHealth * 0.4));
          g.audio.play('heal');
          return 'The altar accepts coin as readily as blood.';
        },
      },
    ],
  },
  {
    id: 'prisoner', name: 'Caged Prisoner', icon: '⛓',
    flavour: 'A ragged figure grips the bars. "Free me — but know that my jailers will come."',
    options: (g) => [
      {
        label: 'Break the lock', sub: 'Fight the jailers → 80 gold + healing',
        run: (g) => {
          g._startEventFight(
            [{ type: 'shieldknight', count: 1, elite: g.floor > 1 }, { type: 'melee', count: 2 }],
            { kind: 'prisoner' },
          );
          return 'The jailers arrive, blades drawn!';
        },
      },
      {
        label: 'Walk away', sub: 'No risk, no reward',
        run: () => 'The prisoner watches you go in silence.',
      },
    ],
  },
  {
    id: 'merchant', name: 'Hidden Merchant', icon: '👁',
    flavour: 'A cloaked trader materialises from the shadows. "Rare goods... for those who pay."',
    options: (g) => [
      {
        label: 'Browse relics', sub: 'Premium prices, exotic stock',
        run: (g) => { g._openRelicShop(); return null; },
      },
    ],
  },
  {
    id: 'statue', name: 'Ancient Statue', icon: '🗿',
    flavour: 'A weathered colossus holds out three open hands. Choose one.',
    options: (g) => [
      { label: 'Hand of Iron', sub: '+25 max health', run: (g) => { g.player.stats.maxHealthBonus += 25; g.player.refreshMaxHealth(); g.player.heal(25); g.audio.play('levelup'); return 'Your flesh hardens like iron.'; } },
      { label: 'Hand of War', sub: '+12% damage', run: (g) => { g.player.stats.damageMult += 0.12; g.audio.play('levelup'); return 'Your grip tightens with purpose.'; } },
      { label: 'Hand of Mercy', sub: 'Heal to full', run: (g) => { g.player.heal(g.player.maxHealth); g.audio.play('heal'); return 'Warm light knits your wounds.'; } },
    ],
  },
  {
    id: 'mirror', name: 'Mirror Trial', icon: '🪞',
    flavour: 'Your reflection steps out of the glass, wearing your face and your stance.',
    options: (g) => [
      {
        label: 'Face yourself', sub: 'Defeat your shadow → a relic',
        run: (g) => {
          g._startEventFight([{ type: 'shadow', count: 1 }], { kind: 'mirror' });
          return 'The shadow raises its blade as you raise yours.';
        },
      },
      {
        label: 'Shatter the mirror', sub: 'Take 10 damage, gain 20 gold',
        run: (g) => {
          g.player.health = Math.max(1, g.player.health - 10);
          g.player.gold += 20;
          g.audio.play('hit');
          return 'Glass rains down. Something glitters among the shards.';
        },
      },
    ],
  },
  {
    id: 'mimic', name: 'Suspicious Chest', icon: '📦',
    flavour: 'A treasure chest sits alone. It is either very generous or very hungry.',
    options: (g) => [
      {
        label: 'Open it', sub: '55%: a relic · 45%: it bites',
        run: (g) => {
          if (g.rng.chance(0.55)) {
            g._queueUpgrades(1, 'relic');
            g.audio.play('pickup');
            return 'Treasure! The chest was honest after all.';
          }
          g._startEventFight([{ type: 'mimic', count: 1, elite: g.floor > 2 }], { kind: 'mimic' });
          g.audio.play('bossroar');
          return 'TEETH. The chest has teeth!';
        },
      },
      {
        label: 'Kick it first', sub: 'Scare it off — small chance of loose gold',
        run: (g) => {
          if (g.rng.chance(0.3)) { g.player.gold += 15; g.audio.play('pickup'); return 'Something rattles loose. +15 gold.'; }
          return 'The chest does not react. You back away slowly.';
        },
      },
    ],
  },
  {
    id: 'timed', name: 'Trial of Haste', icon: '⏳',
    flavour: 'An hourglass turns itself over. Ghostly challengers form from the dust.',
    options: (g) => [
      {
        label: 'Accept the trial', sub: 'Clear the wave in 20s → a relic',
        run: (g) => {
          g._startEventFight(
            [{ type: 'swarmling', count: 4 }, { type: 'melee', count: 2 }],
            { kind: 'timed', timeLimit: 20 },
          );
          return 'The sand is falling!';
        },
      },
      {
        label: 'Decline', sub: 'Time waits — you don\'t have to',
        run: () => 'The hourglass crumbles to dust.',
      },
    ],
  },
  {
    id: 'blessing', name: 'Wheel of Fate', icon: '☸',
    flavour: 'A great wheel of bronze and bone. One free spin per pilgrim.',
    options: (g) => [
      {
        label: 'Spin the wheel', sub: 'Fate decides: riches, vigour, power... or nothing',
        run: (g) => {
          const roll = g.rng();
          if (roll < 0.3) { const gold = 30 + g.floor * 10; g.player.gold += gold; g.audio.play('pickup'); return `The wheel lands on WEALTH. +${gold} gold!`; }
          if (roll < 0.55) { g.player.heal(Math.round(g.player.maxHealth * 0.5)); g.audio.play('heal'); return 'The wheel lands on VIGOUR. You feel restored.'; }
          if (roll < 0.8) { g._queueUpgrades(1, 'boon'); g.audio.play('levelup'); return 'The wheel lands on POWER. Choose your boon.'; }
          if (roll < 0.92) { g.audio.play('ui'); return 'The wheel lands on... NOTHING. Fate shrugs.'; }
          g.player.stats.speedMult += 0.1; g.audio.play('levelup');
          return 'The wheel spins off its axle! +10% move speed, somehow.';
        },
      },
    ],
  },
];

export function eventById(id) {
  return EVENTS.find((e) => e.id === id) || EVENTS[0];
}
