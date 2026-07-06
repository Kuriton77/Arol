// Persistent meta-progression via localStorage. Fails gracefully (private
// mode, disabled storage) by falling back to an in-memory object so play
// never breaks. Schema v2; v1 saves migrate with a full soul refund for
// upgrades bought under the old flat system.
import { LEGACY_META } from '../data/meta.js';

const KEY = 'arol.save.v1'; // key kept stable; `version` field governs schema

const DEFAULT = {
  version: 2,
  souls: 0,
  metaNodes: {},          // skill-tree nodeId -> 1
  unlockedWeapons: ['sword'],
  selectedWeapon: 'sword',
  difficulty: 'normal',   // chosen tier; missing on old saves → Normal via merge
  weaponMastery: {},      // weaponId -> { kills }
  smith: {},              // weaponId -> forge level
  achievements: [],       // earned achievement ids
  pacts: {},              // pactId -> rank (difficulty modifiers)
  heatMilestones: [],     // claimed heat-victory bonuses
  stats: {
    runs: 0, wins: 0, kills: 0, bestDepth: 0,
    bestLevel: 0, lifetimeSouls: 0, bossesDefeated: {},
  },
};

export class SaveSystem {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT);
      const parsed = JSON.parse(raw);
      return this._migrate(parsed);
    } catch {
      return structuredClone(DEFAULT);
    }
  }

  // Merge into current defaults, then upgrade old schemas.
  _migrate(parsed) {
    const data = { ...structuredClone(DEFAULT), ...parsed };
    data.stats = { ...structuredClone(DEFAULT.stats), ...(parsed.stats || {}) };
    if (!parsed.version || parsed.version < 2) {
      // v1 -> v2: the flat meta-upgrade list became a skill tree. Refund every
      // soul spent on the old system so no progress is lost.
      let refund = 0;
      for (const legacy of LEGACY_META) {
        const lvl = (parsed.metaLevels || {})[legacy.id] || 0;
        for (let i = 0; i < lvl; i++) {
          refund += Math.round(legacy.baseCost * Math.pow(legacy.costGrowth, i));
        }
      }
      data.souls += refund;
      delete data.metaLevels;
      data.version = 2;
    }
    return data;
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  addSouls(n) {
    const v = Math.round(n);
    this.data.souls += v;
    if (v > 0) this.data.stats.lifetimeSouls += v;
    this.save();
  }
  spendSouls(n) {
    if (this.data.souls < n) return false;
    this.data.souls -= n; this.save(); return true;
  }

  // --- skill tree ---
  hasNode(id) { return !!this.data.metaNodes[id]; }
  buyNode(id) { this.data.metaNodes[id] = 1; this.save(); }

  // --- weapons ---
  unlockWeapon(id) {
    if (!this.data.unlockedWeapons.includes(id)) {
      this.data.unlockedWeapons.push(id);
      this.save();
    }
  }
  isWeaponUnlocked(id) { return this.data.unlockedWeapons.includes(id); }
  selectWeapon(id) { this.data.selectedWeapon = id; this.save(); }

  // --- mastery & blacksmith ---
  addWeaponKills(id, kills) {
    if (!kills) return;
    const m = this.data.weaponMastery[id] || (this.data.weaponMastery[id] = { kills: 0 });
    m.kills += kills;
    this.save();
  }
  weaponKills(id) { return (this.data.weaponMastery[id] || {}).kills || 0; }
  smithLevel(id) { return this.data.smith[id] || 0; }
  forgeWeapon(id) { this.data.smith[id] = this.smithLevel(id) + 1; this.save(); }

  // --- achievements ---
  hasAchievement(id) { return this.data.achievements.includes(id); }
  grantAchievement(id) {
    if (!this.hasAchievement(id)) { this.data.achievements.push(id); this.save(); }
  }

  recordRun({ won, kills, depth, level, bossId }) {
    const st = this.data.stats;
    st.runs++;
    if (won) st.wins++;
    st.kills += kills;
    st.bestDepth = Math.max(st.bestDepth, depth);
    st.bestLevel = Math.max(st.bestLevel, level || 0);
    if (won && bossId) st.bossesDefeated[bossId] = true;
    this.save();
  }

  reset() { this.data = structuredClone(DEFAULT); this.save(); }
}
