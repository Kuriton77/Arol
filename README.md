# Arol — Rogue-Lite Dungeon Crawler (MVP)

A modern, top-down rogue-lite dungeon crawler built with **vanilla JavaScript + HTML5 Canvas** and **ES modules**. Zero runtime dependencies, no build step — open it in a browser and play. Procedural audio (Web Audio API) means no binary asset files are needed.

## Play

Because the game uses ES modules, it must be served over HTTP (not opened as a `file://` URL).

```bash
npm start          # serves at http://127.0.0.1:8017
# or:
python3 -m http.server 8017
```

Then open <http://127.0.0.1:8017>.

### Controls

| Action | Key |
| --- | --- |
| Move | `WASD` / Arrow keys |
| Aim | Mouse |
| Attack | Left click (hold to auto-swing) |
| Dash (i-frames) | `Space` |
| Pause | `Esc` / `P` |
| Mute | `M` |

## Gameplay loop

1. **Explore** a procedurally generated dungeon of connected rooms (unique layout every run).
2. **Fight** through combat, elite, and boss rooms; loot **treasure**, browse **shops**, and gamble at **event** sigils.
3. **Build** your character with stacking boons that create synergies (crit, lifesteal, burn, chain lightning, projectiles…).
4. **Defeat the boss** — a multi-phase encounter with telegraphed attack patterns.
5. **Bank Souls** on death or victory and spend them on **permanent meta-upgrades** and **weapon unlocks** between runs. Choose to **descend deeper** into harder floors for a bigger payout.

## Features

- **Responsive combat** — arc melee with windup/active/recover phases, crits, knockback, i-frames, hit-pause, camera shake, damage numbers, particles, and procedural SFX.
- **Three enemy archetypes** — Grunt (melee lunge), Sniper (ranged kiter), Brute (armored tank), each with distinct AI, telegraphs, and depth scaling.
- **Multi-phase boss** — *The Hollow King* with radial bursts, charges, spirals, and adds across three escalating phases.
- **Procedural dungeons** — deterministic, seeded generation with 6 room types and a live minimap.
- **Meta progression** — persistent Souls currency, permanent upgrades, and unlockable weapons saved to `localStorage`.
- **Full UI** — health/XP bars, dash cooldown, boss health bar, minimap, boon selection, shop, pause, game-over, and victory screens.
- **Performance-minded** — object pooling for projectiles/particles/damage-numbers, event-driven decoupling, and data-driven tuning.

## Architecture

Clean, modular, independently extendable systems. Data-driven config keeps tuning in one place.

```
index.html                 # shell + canvas
src/
  main.js                  # thin entry point / wiring
  core/
    Game.js                # loop, state machine, orchestration
    EventBus.js            # decoupled event-driven messaging
    Input.js               # keyboard + mouse (edge-triggered)
    ObjectPool.js          # generic pooling (GC-free hot paths)
    Camera.js              # trauma-based screen shake / transitions
    math.js                # helpers + seeded PRNG (mulberry32)
  audio/AudioManager.js    # procedural Web Audio SFX + music
  entities/
    Entity.js Player.js Enemy.js Boss.js Projectile.js
  systems/
    CombatSystem.js        # damage, crits, effects, "game feel"
    SpawnSystem.js         # data-driven encounter spawning
    Stats.js               # modifier aggregation + derived stats
    SaveSystem.js          # localStorage meta-persistence
  dungeon/
    Generator.js Room.js   # seeded procedural layout
  fx/Particles.js DamageNumbers.js
  render/Renderer.js       # world drawing
  ui/UI.js HUD.js Screens.js
  data/
    config.js enemies.js upgrades.js meta.js   # all tuning / content
```

**Design principles:** systems talk through the `EventBus` and small context objects rather than hard references; all content (enemies, boons, meta-upgrades, weapons, tuning) is data-driven so the game expands by adding data, not rewriting logic; hot paths (projectiles, particles, damage numbers) use object pools.

## Testing

An automated headless-Chromium smoke test boots the game, watches for console/page errors, drives the simulation through menu → combat → boss, and asserts core invariants.

```bash
npm install        # installs playwright-core (dev only)
npm test           # runs scripts/smoke-test.mjs
npm run shots      # captures screenshots of every screen to scratch-shots/
```

## Roadmap (post-MVP)

- More biomes/floors with themed tilesets and hazards
- Additional bosses and enemy archetypes
- Weapon-specific movesets and combos
- Status-effect framework expansion (freeze, poison, curse)
- Controller support and mobile touch controls
- Sprite/particle art pass and richer audio

## License

MIT
