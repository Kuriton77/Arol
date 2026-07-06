// Relics: unique passive items found in treasure rooms, boss kills, and hidden
// merchants. They share the boon card pipeline (same rarity/apply interface)
// but live in their own pool, never stack, and carry synergy tags.
// r(id, name, rarity, tags, desc, apply) keeps 60 entries readable.

function r(id, name, rarity, tags, desc, apply) {
  return { id: `r_${id}`, name, rarity, tags, desc, apply, stackable: false, relic: true };
}

export const RELICS = [
  // ------------------------------------------------------------------ fire
  r('ember_heart', 'Ember Heart', 'rare', ['fire'], 'Hits apply Burn', (s) => { s.burn += 1; }),
  r('cinder_fang', 'Cinder Fang', 'epic', ['fire'], '+2 Burn, -10 max health', (s) => { s.burn += 2; s.maxHealthBonus -= 10; }),
  r('ashen_band', 'Ashen Band', 'common', ['fire'], '+10% damage, +25% damage-over-time', (s) => { s.damageMult += 0.1; s.dotAmp += 0.25; }),
  r('molten_core', 'Molten Core', 'epic', ['fire'], '+1 Burn, +15% damage', (s) => { s.burn += 1; s.damageMult += 0.15; }),
  r('phoenix_feather', 'Phoenix Feather', 'legendary', ['fire', 'holy'], 'Survive a lethal hit once per floor', (s) => { s.secondWind = true; }),
  r('brand_iron', 'Branding Iron', 'common', ['fire'], '+12% attack speed', (s) => { s.attackSpeedMult += 0.12; }),
  r('salamander', 'Salamander Scale', 'rare', ['fire', 'earth'], 'Take 8% less damage, +1 Burn', (s) => { s.armor += 0.08; s.burn += 1; }),
  // ------------------------------------------------------------------- ice
  r('frost_sigil', 'Frost Sigil', 'rare', ['ice'], 'Hits Chill enemies', (s) => { s.chill += 1; }),
  r('glacial_plate', 'Glacial Plate', 'rare', ['ice', 'earth'], 'Take 12% less damage', (s) => { s.armor += 0.12; }),
  r('winters_grasp', "Winter's Grasp", 'epic', ['ice'], 'Chills slow 20% more, +1 Chill', (s) => { s.chill += 1; s.chillPower += 0.2; }),
  r('frozen_tear', 'Frozen Tear', 'common', ['ice'], '+20 max health, hits lightly Chill', (s) => { s.maxHealthBonus += 20; s.chill += 0.5; }),
  r('hail_shard', 'Hail Shard', 'rare', ['ice'], '+15% projectile damage, +0.5 Chill', (s) => { s.projDamageMult += 0.15; s.chill += 0.5; }),
  r('rime_crown', 'Rime Crown', 'epic', ['ice', 'crit'], '+10% crit, chills slow more', (s) => { s.critChance += 0.1; s.chillPower += 0.1; }),
  // -------------------------------------------------------------- lightning
  r('storm_core', 'Storm Core', 'rare', ['lightning'], 'Hits zap a nearby enemy', (s) => { s.static += 1; }),
  r('conductor_rod', "Conductor's Rod", 'epic', ['lightning'], 'Chain arcs jump +1 time', (s) => { s.chain += 1; }),
  r('charged_anklet', 'Charged Anklet', 'common', ['lightning', 'dash'], '-12% dash cooldown', (s) => { s.dashCdMult *= 0.88; }),
  r('tempest_eye', 'Tempest Eye', 'epic', ['lightning', 'crit'], '+12% critical chance', (s) => { s.critChance += 0.12; }),
  r('galvanic_coil', 'Galvanic Coil', 'rare', ['lightning'], '+15% attack speed', (s) => { s.attackSpeedMult += 0.15; }),
  r('fulgur_bead', 'Fulgur Bead', 'common', ['lightning'], 'Hits weakly zap nearby enemies', (s) => { s.static += 0.6; }),
  // ---------------------------------------------------------------- poison
  r('venom_gland', 'Venom Gland', 'rare', ['poison'], 'Hits apply Poison', (s) => { s.poison += 1; }),
  r('plague_mask', "Plague Doctor's Mask", 'epic', ['poison'], '+1 Poison, +25% damage-over-time', (s) => { s.poison += 1; s.dotAmp += 0.25; }),
  r('toxic_vial', 'Toxic Vial', 'common', ['poison'], 'Weak Poison, +10% attack speed', (s) => { s.poison += 0.5; s.attackSpeedMult += 0.1; }),
  r('spider_fang', 'Spider Fang', 'rare', ['poison'], '+12% damage, weak Poison', (s) => { s.damageMult += 0.12; s.poison += 0.5; }),
  r('blight_stone', 'Blight Stone', 'epic', ['poison', 'void'], 'Execute below 8%, weak Poison', (s) => { s.cull += 0.08; s.poison += 0.5; }),
  // ----------------------------------------------------------------- blood
  r('blood_chalice', 'Blood Chalice', 'epic', ['blood'], 'Heal 6% of damage dealt', (s) => { s.lifesteal += 0.06; }),
  r('crimson_pact', 'Crimson Pact', 'legendary', ['blood'], '+10% lifesteal, -20 max health', (s) => { s.lifesteal += 0.1; s.maxHealthBonus -= 20; }),
  r('vampire_fang', 'Vampire Fang', 'rare', ['blood'], '+8% damage, +3% lifesteal', (s) => { s.damageMult += 0.08; s.lifesteal += 0.03; }),
  r('heartstone', 'Heartstone', 'common', ['blood'], '+30 max health', (s) => { s.maxHealthBonus += 30; }),
  r('rage_vial', 'Rage Vial', 'rare', ['blood'], '+25% attack speed below half health', (s) => { s.frenzy += 0.25; }),
  // ------------------------------------------------------------------ void
  r('void_shard', 'Void Shard', 'epic', ['void'], '+25% damage, take 15% more damage', (s) => { s.damageMult += 0.25; s.fragile += 0.15; }),
  r('entropy_loop', 'Entropy Loop', 'legendary', ['void'], 'Execute enemies below 15% health', (s) => { s.cull += 0.15; }),
  r('dark_lens', 'Dark Lens', 'rare', ['void', 'crit'], '+40% critical damage', (s) => { s.critMult += 0.4; }),
  r('null_band', 'Null Band', 'common', ['void'], '8% chance to dodge any hit', (s) => { s.dodge += 0.08; }),
  r('cursed_doll', 'Cursed Doll', 'legendary', ['void', 'blood'], '+35% damage, take 20% more damage', (s) => { s.damageMult += 0.35; s.fragile += 0.2; }),
  // ------------------------------------------------------------------ holy
  r('sun_idol', 'Sun Idol', 'rare', ['holy'], 'Heal 15 when a room is cleared', (s) => { s.roomHeal += 15; }),
  r('blessed_chain', 'Blessed Chain', 'common', ['holy'], 'Regenerate 0.8 health per second', (s) => { s.regen += 0.8; }),
  r('aegis_relic', 'Aegis Relic', 'epic', ['holy', 'earth'], 'Take 10% less damage, +20 max health', (s) => { s.armor += 0.1; s.maxHealthBonus += 20; }),
  r('halo_fragment', 'Halo Fragment', 'legendary', ['holy'], 'Heal 3 on every kill', (s) => { s.healOnKill += 3; }),
  r('prayer_beads', 'Prayer Beads', 'common', ['holy'], 'Heal 8 when a room is cleared', (s) => { s.roomHeal += 8; }),
  // -------------------------------------------------------- wind & mobility
  r('zephyr_boots', 'Zephyr Boots', 'rare', ['wind', 'dash'], '+12% move speed', (s) => { s.speedMult += 0.12; }),
  r('gale_feather', 'Gale Feather', 'common', ['wind', 'dash'], '-15% dash cooldown', (s) => { s.dashCdMult *= 0.85; }),
  r('tailwind_charm', 'Tailwind Charm', 'epic', ['wind', 'dash'], '+20% damage for 2s after dashing', (s) => { s.dashBuffPct += 0.2; }),
  r('windrunner_band', 'Windrunner Band', 'rare', ['wind'], '+15% damage while moving', (s) => { s.moveDamage += 0.15; }),
  r('storm_cloak', 'Storm Cloak', 'epic', ['wind'], '12% dodge chance', (s) => { s.dodge += 0.12; }),
  // ------------------------------------------------------------------ gold
  r('golden_skull', 'Golden Skull', 'rare', ['gold'], '+30% gold gained', (s) => { s.greed += 0.3; }),
  r('midas_ring', 'Midas Ring', 'epic', ['gold', 'crit'], '+8% crit, +15% gold', (s) => { s.critChance += 0.08; s.greed += 0.15; }),
  r('merchant_dice', "Merchant's Dice", 'common', ['gold'], 'Shop prices 20% cheaper', (s) => { s.shopDiscount += 0.2; }),
  r('soul_magnet', 'Soul Magnet', 'rare', ['gold'], '+20% gold & souls', (s) => { s.greed += 0.2; }),
  r('ancient_coin', 'Ancient Coin', 'common', ['gold'], '+15% gold, +10% XP', (s) => { s.greed += 0.15; s.xpMult += 0.1; }),
  // ------------------------------------------------------------------ crit
  r('assassin_eye', "Assassin's Eye", 'rare', ['crit'], '+10% critical chance', (s) => { s.critChance += 0.1; }),
  r('jagged_point', 'Jagged Point', 'common', ['crit'], '+25% critical damage', (s) => { s.critMult += 0.25; }),
  r('duelist_glove', 'Duelist Glove', 'epic', ['crit', 'dash'], 'First hit after dashing always crits', (s) => { s.dashCrit = true; }),
  r('sharpened_fate', 'Sharpened Fate', 'legendary', ['crit'], '+15% crit, +40% crit damage', (s) => { s.critChance += 0.15; s.critMult += 0.4; }),
  // --------------------------------------------------------------- utility
  r('heavy_gauntlet', 'Heavy Gauntlet', 'common', ['earth'], '+60% knockback', (s) => { s.knockbackMult += 0.6; }),
  r('titan_grip', 'Titan Grip', 'rare', ['earth'], '+15% damage, -8% move speed', (s) => { s.damageMult += 0.15; s.speedMult -= 0.08; }),
  r('mirror_ward', 'Mirror Ward', 'epic', ['earth'], 'Reflect 50% of contact damage', (s) => { s.thorns += 0.5; }),
  r('adrenal_gland', 'Adrenal Gland', 'rare', ['wind'], '+20% move speed for 2s after kills', (s) => { s.killSpeed += 0.2; }),
  r('hunters_mark', "Hunter's Mark", 'rare', [], '+25% damage to full-health enemies', (s) => { s.firstStrikePct += 0.25; }),
  r('echo_bell', 'Echo Bell', 'legendary', [], 'Attacks fire a blade projectile', (s) => { s.projectiles += 1; }),
  r('growth_ring', 'Growth Ring', 'rare', [], '+25% experience gained', (s) => { s.xpMult += 0.25; }),
  r('war_drum', 'War Drum', 'epic', [], '+10% damage, +10% attack speed', (s) => { s.damageMult += 0.1; s.attackSpeedMult += 0.1; }),
];

// Boss-exclusive relics — never in the random pool; offered as the first
// choice after defeating the matching boss (bosses.js rewardRelicId).
export const BOSS_RELICS = [
  r('hollow_crown', 'Hollow Crown', 'legendary', ['void'], '+1 blade projectile, +10% damage', (s) => { s.projectiles += 1; s.damageMult += 0.1; }),
  r('bone_scepter', 'Bone Scepter', 'legendary', ['blood'], '+15% damage, heal 2 on every kill', (s) => { s.damageMult += 0.15; s.healOnKill += 2; }),
  r('web_talisman', 'Web Talisman', 'legendary', ['ice', 'poison'], 'Hits Chill, +10% attack speed', (s) => { s.chill += 1; s.attackSpeedMult += 0.1; }),
  r('wyrm_scale', 'Wyrm Scale', 'legendary', ['ice', 'earth'], 'Take 12% less damage, hits Chill', (s) => { s.armor += 0.12; s.chill += 1; }),
  r('magma_heart', 'Magma Heart', 'legendary', ['fire'], '+2 Burn, +20 max health', (s) => { s.burn += 2; s.maxHealthBonus += 20; }),
  r('void_prism', 'Void Prism', 'legendary', ['void', 'wind'], 'Execute below 10%, 8% dodge', (s) => { s.cull += 0.1; s.dodge += 0.08; }),
];

export function relicById(id) {
  return RELICS.find((x) => x.id === id) || BOSS_RELICS.find((x) => x.id === id) || null;
}
