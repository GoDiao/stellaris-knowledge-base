import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const GAME_DIR = 'D:/Games/Stellaris Astral Planes';
const SPECIES_CLASS_DIR = path.join(GAME_DIR, 'common', 'species_classes');
const TRAITS_DIR = path.join(GAME_DIR, 'common', 'traits');
const OUTPUT_DIR = 'data/entities/species';

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

async function main() {
  const glossary = await loadGlossary();
  const speciesList = [];

  // Parse species classes
  const classFiles = await fs.readdir(SPECIES_CLASS_DIR);
  for (const file of classFiles.filter(f => f.endsWith('.txt'))) {
    const content = await fs.readFile(path.join(SPECIES_CLASS_DIR, file), 'utf-8');
    const data = parseScript(content);

    for (const [id, sc] of Object.entries(data)) {
      if (typeof sc !== 'object') continue;

      const name = resolveName(`SPECIES_CLASS_${id}`, glossary);
      name.en = stripPrefix(name.en) || id;
      name.zh = stripPrefix(name.zh) || id;

      const archetype = sc.archetype || 'BIOLOGICAL';
      const portraits = [];
      if (sc.portraits && typeof sc.portraits === 'object') {
        portraits.push(...Object.keys(sc.portraits).filter(k => !k.startsWith('#')));
      }

      const entity = {
        id: id.toLowerCase(),
        name,
        category: 'species',
        subcategory: 'species_class',
        dlc: null,
        lore: '',
        traits: [],
        species: {
          archetype,
          portraits,
          graphical_culture: sc.graphical_culture || null,
          gender: sc.gender !== false && sc.gender !== 'no',
        },
        tags: ['species_class', archetype.toLowerCase()],
        relations: [],
      };

      speciesList.push(entity);
    }
  }

  // Parse traits
  const traitFiles = await fs.readdir(TRAITS_DIR);
  for (const file of traitFiles.filter(f => f.endsWith('.txt'))) {
    const content = await fs.readFile(path.join(TRAITS_DIR, file), 'utf-8');
    const data = parseScript(content);

    for (const [id, trait] of Object.entries(data)) {
      if (typeof trait !== 'object') continue;
      if (!id.startsWith('trait_')) continue;

      const name = resolveName(id, glossary);
      name.en = stripPrefix(name.en) || id;
      name.zh = stripPrefix(name.zh) || id;

      const desc = resolveName(`${id}_desc`, glossary);
      desc.en = stripPrefix(desc.en);
      desc.zh = stripPrefix(desc.zh);

      const cost = trait.cost || 0;
      const archetypes = [];
      if (trait.allowed_archetypes && typeof trait.allowed_archetypes === 'object') {
        archetypes.push(...Object.keys(trait.allowed_archetypes));
      }

      // Modifiers summary
      const modifiers = [];
      if (trait.modifier && typeof trait.modifier === 'object') {
        for (const [k, v] of Object.entries(trait.modifier)) {
          if (typeof v === 'string' || typeof v === 'number') modifiers.push(`${k}: ${v}`);
        }
      }

      const entity = {
        id,
        name,
        category: 'species',
        subcategory: 'trait',
        dlc: null,
        lore: desc.zh || desc.en || '',
        traits: modifiers,
        species: {
          cost,
          archetypes,
        },
        tags: ['trait'],
        relations: [],
      };

      if (archetypes.length) entity.tags.push(...archetypes.map(a => a.toLowerCase()));
      if (cost > 0) entity.tags.push('positive');
      if (cost < 0) entity.tags.push('negative');
      if (cost === 0) entity.tags.push('neutral');

      speciesList.push(entity);
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const s of speciesList) {
    await fs.writeFile(path.join(OUTPUT_DIR, `${s.id}.yml`), yaml.dump(s, { noRefs: true, lineWidth: -1 }));
  }

  console.log(`Generated ${speciesList.length} species entities`);
}

main().catch(console.error);
