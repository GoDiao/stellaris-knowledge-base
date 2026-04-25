import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const DATA_DIR = 'data/entities';
const CATEGORIES = ['empires', 'crises', 'events', 'psionic', 'technology', 'species'];

const GENERIC_TAGS = new Set([
  'prescripted_empire',
  'default',
  'democratic',
  'dictatorial',
  'imperial',
  'oligarchic',
  'machine_intelligence',
  'corporate',
  'hive_mind',
]);

function stripEnName(en) {
  if (!en || typeof en !== 'string') return null;
  const m = en.match(/^\d+\s+"(.+)"$/);
  if (m) return m[1];
  // localization key pattern
  if (/^[A-Z][A-Z0-9_]*$/.test(en)) return null;
  return en;
}

function isRealZhName(zh) {
  if (!zh || typeof zh !== 'string') return false;
  if (/^[A-Z][A-Z0-9_]*$/.test(zh)) return false;
  return zh.length > 0;
}

function isRealLore(lore) {
  if (!lore || typeof lore !== 'string') return false;
  if (lore.length < 10) return false;
  if (/^[A-Z][A-Z0-9_]*$/.test(lore.trim())) return false;
  return true;
}

function findEntityIdsInValue(value, idSet) {
  const found = [];
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    for (const id of idSet) {
      if (lower.includes(id.toLowerCase())) {
        found.push(id);
      }
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      found.push(...findEntityIdsInValue(item, idSet));
    }
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      found.push(...findEntityIdsInValue(v, idSet));
    }
  }
  return found;
}

async function main() {
  const allEntities = [];
  const byId = new Map();
  const byFile = new Map();

  for (const category of CATEGORIES) {
    const dir = path.join(DATA_DIR, category);
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch { continue; }

    for (const file of files.filter(f => f.endsWith('.yml'))) {
      const filePath = path.join(dir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const entity = yaml.load(content);
      entity._filePath = filePath;
      entity._category = category;
      allEntities.push(entity);
      byId.set(entity.id, entity);
      byFile.set(filePath, { content, entity });
    }
  }

  const idSet = new Set(byId.keys());

  // Build name index for lore matching
  const nameIndex = [];
  for (const entity of allEntities) {
    const en = stripEnName(entity.name?.en);
    const zh = isRealZhName(entity.name?.zh) ? entity.name.zh : null;
    nameIndex.push({ id: entity.id, en, zh });
  }

  // Track stats
  const stats = { total: 0, byType: {} };

  for (const entity of allEntities) {
    const candidates = []; // { target, type, score }
    const lore = entity.lore;
    const hasRealLore = isRealLore(lore);

    // Rule 1: Tag-based linking
    const myTags = (entity.tags || []).filter(t => !GENERIC_TAGS.has(t));
    for (const other of allEntities) {
      if (other.id === entity.id) continue;
      const otherTags = (other.tags || []).filter(t => !GENERIC_TAGS.has(t));
      const shared = myTags.filter(t => otherTags.includes(t));
      if (shared.length > 0) {
        candidates.push({ target: other.id, type: '关联', score: 5 });
      }
    }

    // Rule 2: Lore text keyword matching
    if (hasRealLore) {
      for (const { id, en, zh } of nameIndex) {
        if (id === entity.id) continue;
        let matched = false;
        if (zh && lore.includes(zh)) matched = true;
        if (en && lore.toLowerCase().includes(en.toLowerCase())) matched = true;
        if (lore.toLowerCase().includes(id.toLowerCase())) matched = true;
        if (matched) {
          candidates.push({ target: id, type: '提及', score: 10 });
        }
      }
    }

    // Rule 3: Trigger condition extraction
    if (entity.trigger_conditions) {
      const foundIds = findEntityIdsInValue(entity.trigger_conditions, idSet);
      for (const fid of foundIds) {
        if (fid === entity.id) continue;
        candidates.push({ target: fid, type: '触发条件', score: 8 });
      }
    }

    // Rule 4: Category bridges
    for (const other of allEntities) {
      if (other.id === entity.id) continue;

      // Same species class
      if (entity.species?.class && other.species?.class && entity.species.class === other.species.class) {
        candidates.push({ target: other.id, type: '同种族', score: 4 });
      }

      // Same DLC
      if (entity.dlc && other.dlc && entity.dlc === other.dlc) {
        // Use "同DLC预设" for empires (Rule 5 takes precedence), otherwise "同DLC"
        if (entity.category !== 'empire' || other.category !== 'empire') {
          candidates.push({ target: other.id, type: '同DLC', score: 1 });
        }
      }

      // Same origin
      if (entity.origin && other.origin && entity.origin === other.origin) {
        const isDefaultOrigin = entity.origin === 'origin_default';
        candidates.push({ target: other.id, type: '同起源', score: isDefaultOrigin ? 1 : 3 });
      }
    }

    // Rule 5: Prescripted empire relations (same DLC)
    if (entity.category === 'empire' && entity.dlc) {
      for (const other of allEntities) {
        if (other.id === entity.id) continue;
        if (other.category === 'empire' && other.dlc === entity.dlc) {
          candidates.push({ target: other.id, type: '同DLC预设', score: 4 });
        }
      }
    }

    // Deduplicate by target (keep highest score)
    const bestByTarget = new Map();
    for (const c of candidates) {
      const key = c.target;
      if (!bestByTarget.has(key) || bestByTarget.get(key).score < c.score) {
        bestByTarget.set(key, c);
      }
    }

    // Merge with existing relations
    const existing = entity.relations || [];
    const existingKeys = new Set(existing.map(r => `${r.type}|${r.target}`));
    const merged = [...existing];

    const sorted = Array.from(bestByTarget.values()).sort((a, b) => b.score - a.score);
    let added = 0;
    for (const c of sorted) {
      if (merged.length >= 5) break;
      const key = `${c.type}|${c.target}`;
      if (existingKeys.has(key)) continue;
      merged.push({ type: c.type, target: c.target });
      existingKeys.add(key);
      added++;
      stats.total++;
      stats.byType[c.type] = (stats.byType[c.type] || 0) + 1;
    }

    if (added > 0) {
      entity.relations = merged;
      const { content } = byFile.get(entity._filePath);
      const doc = yaml.load(content);
      doc.relations = merged;
      const dumped = yaml.dump(doc, { lineWidth: -1, noRefs: true, sortKeys: false });
      await fs.writeFile(entity._filePath, dumped, 'utf-8');
    }
  }

  console.log(`Relations generated: ${stats.total}`);
  console.log('Breakdown by type:');
  for (const [type, count] of Object.entries(stats.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}

main().catch(console.error);
