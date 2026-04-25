import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const GAME_DIR = 'D:/Games/Stellaris Astral Planes';
const OUTPUT_DIR = 'data/entities/empires';

// Parse Stellaris script format (nested braces)
function parseScript(content) {
  const tokens = tokenize(content);
  const [result] = parseBlock(tokens, 0);
  return result;
}

function tokenize(content) {
  const tokens = [];
  let i = 0;
  while (i < content.length) {
    // Skip whitespace and comments
    while (i < content.length && /\s/.test(content[i])) i++;
    if (i >= content.length) break;
    if (content[i] === '#' ) {
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
            // If same key appears multiple times, make it an array
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
  return null;
}

async function main() {
  const glossary = await loadGlossary();
  const dir = path.join(GAME_DIR, 'prescripted_countries');
  const files = await fs.readdir(dir);
  const empires = [];

  for (const file of files.filter(f => f.endsWith('.txt'))) {
    const content = await fs.readFile(path.join(dir, file), 'utf-8');
    const data = parseScript(content);

    for (const [id, empire] of Object.entries(data)) {
      if (typeof empire !== 'object') continue;

      const nameKey = empire.name;
      const species = empire.species || {};

      const entity = {
        id,
        name: resolveName(nameKey, glossary),
        category: 'empire',
        subcategory: 'prescripted',
        dlc: detectDlc(file),
        lore: resolveName(nameKey + '_desc', glossary).zh || '',
        traits: [],
        species: {
          class: species.class || null,
          name: resolveName(species.name, glossary),
          portrait: species.portrait || null,
          traits: Array.isArray(species.trait) ? species.trait : species.trait ? [species.trait] : [],
        },
        authority: empire.authority || null,
        civics: Array.isArray(empire.civics)
          ? Object.values(empire.civics)
          : empire.civics
          ? [empire.civics]
          : [],
        ethics: Array.isArray(empire.ethic)
          ? empire.ethic
          : empire.ethic
          ? [empire.ethic]
          : [],
        origin: empire.origin || null,
        government: empire.government || null,
        planet: {
          name: resolveName(empire.planet_name, glossary),
          class: empire.planet_class || null,
        },
        system: {
          name: resolveName(empire.system_name, glossary),
        },
        graphical_culture: empire.graphical_culture || null,
        relations: [],
        tags: ['prescripted_empire'],
      };

      if (entity.species.traits.length) {
        entity.traits = [...entity.species.traits];
      }
      if (entity.authority) entity.tags.push(entity.authority.replace('auth_', ''));
      if (entity.origin) entity.tags.push(entity.origin.replace('origin_', ''));

      empires.push(entity);
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const empire of empires) {
    const filePath = path.join(OUTPUT_DIR, `${empire.id}.yml`);
    await fs.writeFile(filePath, yaml.dump(empire, { noRefs: true, lineWidth: -1 }));
  }

  console.log(`Generated ${empires.length} empire entities`);
}

main().catch(console.error);
