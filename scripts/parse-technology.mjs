import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const GAME_DIR = 'D:/Games/Stellaris Astral Planes';
const TECH_DIR = path.join(GAME_DIR, 'common', 'technology');
const OUTPUT_DIR = 'data/entities/technology';

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
        if (content[i] === '\\' && i + 1 < content.length) { str += content[i + 1]; i += 2; }
        else { str += content[i]; i++; }
      }
      i++;
      tokens.push({ type: 'string', value: str });
    } else if (content[i] === '{' || content[i] === '}') {
      tokens.push({ type: content[i] }); i++;
    } else if (content[i] === '=') {
      tokens.push({ type: '=' }); i++;
    } else {
      let word = '';
      while (i < content.length && !/[\s{}="']/.test(content[i])) { word += content[i]; i++; }
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

function stripPrefix(text) {
  if (!text || typeof text !== 'string') return text;
  const m = text.match(/^\d+\s+"(.+)"$/);
  if (m) return m[1];
  return text;
}

function detectDlc(fileName) {
  const dlcs = {
    ancient_relics: 'Ancient Relics', apocalypse: 'Apocalypse', astral_planes: 'Astral Planes',
    distant_stars: 'Distant Stars', first_contact: 'First Contact', horizonsignal: 'Horizon Signal',
    leviathans: 'Leviathans', megacorp: 'MegaCorp', overlord: 'Overlord', plantoids: 'Plantoids',
    fallen_empire: 'Fallen Empires',
  };
  for (const [k, v] of Object.entries(dlcs)) {
    if (fileName.includes(k)) return v;
  }
  return null;
}

function extractPrerequisites(tech) {
  const pre = tech.prerequisites;
  if (!pre) return [];
  if (Array.isArray(pre)) return pre;
  if (typeof pre === 'object') return Object.values(pre).filter(v => typeof v === 'string');
  return [];
}

function extractCategory(tech) {
  const cat = tech.category;
  if (!cat) return null;
  if (Array.isArray(cat)) return cat[0];
  if (typeof cat === 'object') {
    const vals = Object.values(cat).filter(v => typeof v === 'string');
    return vals[0] || null;
  }
  if (typeof cat === 'string') return cat;
  return null;
}

async function main() {
  const glossary = await loadGlossary();
  const files = await fs.readdir(TECH_DIR);
  const techs = [];

  for (const file of files.filter(f => f.endsWith('.txt'))) {
    const content = await fs.readFile(path.join(TECH_DIR, file), 'utf-8');
    const data = parseScript(content);

    for (const [id, tech] of Object.entries(data)) {
      if (typeof tech !== 'object') continue;
      if (id.startsWith('@')) continue; // skip script variables

      const nameKey = tech.start_tech === true ? `${id}` : id;
      const name = resolveName(nameKey, glossary);
      name.en = stripPrefix(name.en);
      name.zh = stripPrefix(name.zh);

      const desc = resolveName(`${id}_desc`, glossary);
      desc.en = stripPrefix(desc.en);
      desc.zh = stripPrefix(desc.zh);

      const area = tech.area || null;
      const tier = tech.tier || null;
      const cost = tech.cost || null;
      const category = extractCategory(tech);
      const prerequisites = extractPrerequisites(tech);

      // Feature flags / unlocks
      const features = [];
      if (tech.feature_flags) {
        const ff = tech.feature_flags;
        if (typeof ff === 'object') features.push(...Object.keys(ff));
        if (Array.isArray(ff)) features.push(...ff);
      }
      if (tech.gateway) features.push(`gateway:${tech.gateway}`);

      // Weight info
      const weight = tech.weight || null;

      // Is repeatable?
      const isRepeatable = file.includes('repeatable') || id.includes('repeatable');

      const entity = {
        id,
        name,
        category: 'technology',
        subcategory: area || 'general',
        dlc: detectDlc(file),
        lore: desc.zh || desc.en || '',
        traits: [],
        tags: ['technology'],
        technology: {
          area,
          tier,
          cost,
          category,
          prerequisites,
          features,
          weight,
          is_repeatable: isRepeatable,
        },
        relations: [],
      };

      if (area) entity.tags.push(area);
      if (category) entity.tags.push(category);
      if (isRepeatable) entity.tags.push('repeatable');

      techs.push(entity);
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const t of techs) {
    await fs.writeFile(path.join(OUTPUT_DIR, `${t.id}.yml`), yaml.dump(t, { noRefs: true, lineWidth: -1 }));
  }

  console.log(`Generated ${techs.length} technology entities`);
}

main().catch(console.error);
