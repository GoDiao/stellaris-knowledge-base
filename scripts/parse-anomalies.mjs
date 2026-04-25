import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const GAME_DIR = 'D:/Games/Stellaris Astral Planes';
const ANOMALIES_DIR = path.join(GAME_DIR, 'common', 'anomalies');
const ARC_SITES_DIR = path.join(GAME_DIR, 'common', 'archaeological_site_types');
const OUTPUT_DIR = 'data/entities/events';

// ------------------------------------------------------------------
// Tokenizer / Parser (same pattern as parse-common.mjs)
// ------------------------------------------------------------------
function parseScript(content) {
  const tokens = tokenize(content);
  const [result] = parseBlock(tokens, 0);
  return result;
}

function tokenize(content) {
  const tokens = [];
  let i = 0;
  while (i < content.length) {
    while (i < content.length && /\s/.test(content[i])) i++;
    if (i >= content.length) break;
    if (content[i] === '#') {
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }
    if (content[i] === '"' || content[i] === "'") {
      const quote = content[i];
      let str = '';
      i++;
      while (i < content.length && content[i] !== quote) {
        if (content[i] === '\\' && i + 1 < content.length) {
          str += content[i + 1];
          i += 2;
        } else {
          str += content[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push({ type: 'string', value: str });
    } else if (content[i] === '{' || content[i] === '}') {
      tokens.push({ type: content[i] });
      i++;
    } else if (content[i] === '=') {
      tokens.push({ type: '=' });
      i++;
    } else {
      let word = '';
      while (i < content.length && !/[\s{}="']/.test(content[i])) {
        word += content[i];
        i++;
      }
      if (word) tokens.push({ type: 'word', value: word });
    }
  }
  return tokens;
}

function parseBlock(tokens, i) {
  const result = {};
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type === '}') return [result, i + 1];
    if (tok.type === 'word') {
      const key = tok.value;
      i++;
      if (i < tokens.length && tokens[i].type === '=') {
        i++;
        if (i < tokens.length) {
          if (tokens[i].type === '{') {
            i++;
            const [val, nextI] = parseBlock(tokens, i);
            if (result[key] !== undefined) {
              if (!Array.isArray(result[key])) result[key] = [result[key]];
              result[key].push(val);
            } else {
              result[key] = val;
            }
            i = nextI;
          } else if (tokens[i].type === 'string' || tokens[i].type === 'word') {
            const val = tokens[i].value;
            if (result[key] !== undefined) {
              if (!Array.isArray(result[key])) result[key] = [result[key]];
              result[key].push(val);
            } else {
              result[key] = val;
            }
            i++;
          } else {
            i++;
          }
        }
      } else {
        // Boolean flag (word without =)
        if (result[key] !== undefined) {
          if (!Array.isArray(result[key])) result[key] = [result[key]];
          result[key].push(true);
        } else {
          result[key] = true;
        }
      }
    } else {
      i++;
    }
  }
  return [result, i];
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
async function loadGlossary() {
  const content = await fs.readFile('data/glossary.yml', 'utf-8');
  return yaml.load(content);
}

function resolveName(key, glossary) {
  if (!key) return { en: null, zh: null };
  const entry = glossary[key];
  if (entry) {
    return {
      en: entry.en || entry.zh || key,
      zh: entry.zh || entry.en || key,
    };
  }
  return { en: key, zh: key };
}

function detectDlc(fileName) {
  if (fileName.includes('astral_planes')) return 'Astral Planes';
  if (fileName.includes('first_contact')) return 'First Contact';
  if (fileName.includes('megacorp')) return 'MegaCorp';
  if (fileName.includes('utopia')) return 'Utopia';
  if (fileName.includes('distant_stars')) return 'Distant Stars';
  if (fileName.includes('ancient_relics')) return 'Ancient Relics';
  if (fileName.includes('federations')) return 'Federations';
  if (fileName.includes('apocalypse')) return 'Apocalypse';
  if (fileName.includes('aquatics')) return 'Aquatics';
  if (fileName.includes('nemesis')) return 'Nemesis';
  if (fileName.includes('overlord')) return 'Overlord';
  if (fileName.includes('paragon')) return 'Paragon';
  if (fileName.includes('leviathans')) return 'Leviathans';
  if (fileName.includes('humanoids')) return 'Humanoids';
  return null;
}

function getDescKey(descData, id) {
  if (!descData) return `${id}_desc`;
  if (typeof descData === 'string') return descData;
  if (Array.isArray(descData)) {
    const first = descData.find(d => d && (d.text || d.desc));
    return first ? (first.text || first.desc) : `${id}_desc`;
  }
  if (typeof descData === 'object') {
    return descData.text || descData.desc || `${id}_desc`;
  }
  return `${id}_desc`;
}

function extractEvents(obj) {
  const events = [];
  if (typeof obj === 'string') {
    events.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) events.push(...extractEvents(item));
  } else if (obj && typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (['anomaly_event', 'ship_event', 'country_event', 'planet_event', 'fleet_event'].includes(key)) {
        if (typeof val === 'string') {
          events.push(val);
        } else if (val && typeof val === 'object') {
          if (val.id && typeof val.id === 'string') events.push(val.id);
          else events.push(...extractEvents(val));
        }
      } else if (!['modifier', 'trigger', 'limit', 'max_once', 'max_once_global'].includes(key)) {
        events.push(...extractEvents(val));
      }
    }
  }
  return [...new Set(events)];
}

function boolOrNull(val) {
  return val === true || val === 'yes' ? true : null;
}

function parseNumeric(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'object') return val; // preserve intervals like { min, max }
  if (typeof val === 'string' && val.startsWith('@')) return val; // preserve script variables
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
  const glossary = await loadGlossary();
  const anomalies = [];
  const arcSites = [];

  // --- Anomalies ---
  const anomalyFiles = (await fs.readdir(ANOMALIES_DIR)).filter(f => f.endsWith('.txt'));
  for (const file of anomalyFiles) {
    const content = await fs.readFile(path.join(ANOMALIES_DIR, file), 'utf-8');
    const data = parseScript(content);
    const dlc = detectDlc(file);

    for (const [id, entry] of Object.entries(data)) {
      if (typeof entry !== 'object' || entry === null) continue;
      if (id.startsWith('@')) continue;

      const descKey = getDescKey(entry.desc, id);
      const name = resolveName(id, glossary);
      const loreEntry = resolveName(descKey, glossary);

      const entity = {
        id,
        name,
        category: 'event',
        subcategory: 'anomaly',
        dlc,
        lore: loreEntry.zh || loreEntry.en || '',
        picture: entry.picture || null,
        level: parseNumeric(entry.level),
        spawn_chance: entry.spawn_chance || null,
        on_success: entry.on_success ? extractEvents(entry.on_success) : [],
        on_fail: entry.on_fail ? extractEvents(entry.on_fail) : [],
        on_critical_fail: entry.on_critical_fail ? extractEvents(entry.on_critical_fail) : [],
        max_once: boolOrNull(entry.max_once),
        max_once_global: boolOrNull(entry.max_once_global),
        null_spawn_chance: parseNumeric(entry.null_spawn_chance),
        should_ai_use: boolOrNull(entry.should_ai_use),
        should_ai_and_humans_use: boolOrNull(entry.should_ai_and_humans_use),
        relations: [],
        tags: ['anomaly'],
      };

      if (dlc) entity.tags.push(dlc.toLowerCase().replace(/\s+/g, '_'));
      anomalies.push(entity);
    }
  }

  // --- Archaeological Sites ---
  const arcSiteFiles = (await fs.readdir(ARC_SITES_DIR)).filter(f => f.endsWith('.txt'));
  for (const file of arcSiteFiles) {
    const content = await fs.readFile(path.join(ARC_SITES_DIR, file), 'utf-8');
    const data = parseScript(content);
    const dlc = detectDlc(file);

    for (const [id, entry] of Object.entries(data)) {
      if (typeof entry !== 'object' || entry === null) continue;
      if (id.startsWith('@')) continue;

      const descKey = getDescKey(entry.desc, id);
      const name = resolveName(id, glossary);
      const loreEntry = resolveName(descKey, glossary);

      const stageList = entry.stage
        ? (Array.isArray(entry.stage) ? entry.stage : [entry.stage])
        : [];

      const stages = stageList.map((s, idx) => ({
        stage_number: idx + 1,
        difficulty: parseNumeric(s.difficulty),
        icon: s.icon || null,
        event: s.event || null,
      }));

      const entity = {
        id,
        name,
        category: 'event',
        subcategory: 'archaeological_site',
        dlc,
        lore: loreEntry.zh || loreEntry.en || '',
        picture: entry.picture || null,
        stages: parseNumeric(entry.stages) ?? (stageList.length || null),
        stage: stages,
        max_instances: parseNumeric(entry.max_instances),
        weight: entry.weight !== undefined ? entry.weight : null,
        allow: entry.allow || null,
        visible: entry.visible || null,
        on_visible: entry.on_visible || null,
        on_roll_failed: entry.on_roll_failed || null,
        relations: [],
        tags: ['archaeological_site'],
      };

      if (dlc) entity.tags.push(dlc.toLowerCase().replace(/\s+/g, '_'));
      arcSites.push(entity);
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const entity of anomalies) {
    const filePath = path.join(OUTPUT_DIR, `${entity.id}.yml`);
    await fs.writeFile(filePath, yaml.dump(entity, { noRefs: true, lineWidth: -1 }));
  }

  for (const entity of arcSites) {
    const filePath = path.join(OUTPUT_DIR, `${entity.id}.yml`);
    await fs.writeFile(filePath, yaml.dump(entity, { noRefs: true, lineWidth: -1 }));
  }

  console.log(`Generated ${anomalies.length} anomaly entities`);
  console.log(`Generated ${arcSites.length} archaeological site entities`);
  console.log(`Total: ${anomalies.length + arcSites.length} entities written to ${OUTPUT_DIR}`);
}

main().catch(console.error);
