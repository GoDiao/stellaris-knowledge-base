import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const GAME_DIR = 'D:/Games/Stellaris Astral Planes';
const AP_DIR = path.join(GAME_DIR, 'common', 'ascension_perks');
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
    if (content[i] === '#') { while (i < content.length && content[i] !== '\n') i++; continue; }
    if (content[i] === '"' || content[i] === "'") {
      const q = content[i]; let s = ''; i++;
      while (i < content.length && content[i] !== q) {
        if (content[i] === '\\' && i + 1 < content.length) { s += content[i + 1]; i += 2; } else { s += content[i]; i++; }
      }
      i++; tokens.push({ type: 'string', value: s });
    } else if (content[i] === '{' || content[i] === '}') { tokens.push({ type: content[i] }); i++; }
    else if (content[i] === '=') { tokens.push({ type: '=' }); i++; }
    else {
      let w = '';
      while (i < content.length && !/[\s{}="']/.test(content[i])) { w += content[i]; i++; }
      if (w) tokens.push({ type: 'word', value: w });
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
      const key = tok.value; i++;
      if (i < tokens.length && tokens[i].type === '=') {
        i++;
        if (i < tokens.length) {
          if (tokens[i].type === '{') {
            i++; const [val, ni] = parseBlock(tokens, i);
            if (result[key] !== undefined) { if (!Array.isArray(result[key])) result[key] = [result[key]]; result[key].push(val); } else result[key] = val;
            i = ni;
          } else if (tokens[i].type === 'string' || tokens[i].type === 'word') {
            const val = tokens[i].value;
            if (result[key] !== undefined) { if (!Array.isArray(result[key])) result[key] = [result[key]]; result[key].push(val); } else result[key] = val;
            i++;
          } else i++;
        }
      } else {
        if (result[key] !== undefined) { if (!Array.isArray(result[key])) result[key] = [result[key]]; result[key].push(true); } else result[key] = true;
      }
    } else i++;
  }
  return [result, i];
}

async function loadGlossary() {
  return yaml.load(await fs.readFile('data/glossary.yml', 'utf-8'));
}

function resolveName(key, glossary) {
  if (!key) return { en: null, zh: null };
  const e = glossary[key];
  if (e) {
    let en = e.en || e.zh || key, zh = e.zh || e.en || key;
    const m = en.match(/^\d+\s+"(.+)"$/); if (m) en = m[1];
    const m2 = zh.match(/^\d+\s+"(.+)"$/); if (m2) zh = m2[1];
    return { en, zh };
  }
  return { en: key, zh: key };
}

function detectDlc(ap) {
  const potential = typeof ap.potential === 'object' ? JSON.stringify(ap.potential) : '';
  if (potential.includes('Ancient Relics')) return 'Ancient Relics';
  if (potential.includes('First Contact')) return 'First Contact';
  if (potential.includes('Nemesis')) return 'Nemesis';
  if (potential.includes('Aquatics')) return 'Aquatics';
  if (potential.includes('Overlord')) return 'Overlord';
  if (potential.includes('MegaCorp')) return 'MegaCorp';
  if (potential.includes('Utopia')) return 'Utopia';
  if (potential.includes('Apocalypse')) return 'Apocalypse';
  return null;
}

async function main() {
  const glossary = await loadGlossary();
  const perks = [];

  const files = await fs.readdir(AP_DIR);
  for (const file of files.filter(f => f.endsWith('.txt'))) {
    const content = await fs.readFile(path.join(AP_DIR, file), 'utf-8');
    const data = parseScript(content);

    const isPath = file.includes('ascension_path');

    for (const [id, ap] of Object.entries(data)) {
      if (typeof ap !== 'object' || !id.startsWith('ap_')) continue;

      const name = resolveName(id, glossary);
      const desc = resolveName(`${id}_desc`, glossary);

      const modifiers = [];
      if (ap.modifier && typeof ap.modifier === 'object') {
        for (const [k, v] of Object.entries(ap.modifier)) {
          if (typeof v === 'string' || typeof v === 'number') modifiers.push(`${k}: ${v}`);
        }
      }

      const entity = {
        id,
        name,
        category: 'technology',
        subcategory: isPath ? 'ascension_path' : 'ascension_perk',
        dlc: detectDlc(ap),
        lore: desc.zh || desc.en || '',
        traits: modifiers,
        tags: ['technology', isPath ? 'ascension_path' : 'ascension_perk'],
        technology: {
          area: null,
          tier: null,
          category: isPath ? 'ascension_path' : 'ascension_perk',
          prerequisites: [],
          features: [],
          is_repeatable: false,
        },
        relations: [],
      };

      perks.push(entity);
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const p of perks) {
    await fs.writeFile(path.join(OUTPUT_DIR, `${p.id}.yml`), yaml.dump(p, { noRefs: true, lineWidth: -1 }));
  }

  console.log(`Generated ${perks.length} ascension perk/path entities`);
}

main().catch(console.error);
