import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const GAME_DIR = 'D:/Games/Stellaris Astral Planes';
const EVENTS_DIR = path.join(GAME_DIR, 'events');
const OUTPUT_DIR = 'data/entities/crises';

// Crisis mapping: file -> crisis name
const CRISIS_FILES = [
  { file: 'crisis_events_1.txt', crisis_id: 'prethoryn_scourge', name_en: 'Prethoryn Scourge' },
  { file: 'crisis_events_2.txt', crisis_id: 'contingency', name_en: 'The Contingency' },
  { file: 'crisis_events_3.txt', crisis_id: 'extradimensional_invaders', name_en: 'Extradimensional Invaders' },
  { file: 'nemesis_crisis_endgame.txt', crisis_id: 'become_crisis', name_en: 'Become the Crisis' },
  { file: 'nemesis_crisis_events.txt', crisis_id: 'become_crisis_events', name_en: 'Crisis Path Events' },
];

// Other threat files
const THREAT_FILES = [
  { file: 'crisis_trigger_events.txt', crisis_id: 'crisis_triggers', name_en: 'Crisis Triggers' },
];

async function loadGlossary() {
  const content = await fs.readFile('data/glossary.yml', 'utf-8');
  return yaml.load(content);
}

function resolveName(key, glossary) {
  if (!key) return { en: null, zh: null };
  const entry = glossary[key];
  if (entry) {
    let en = entry.en || entry.zh || key;
    let zh = entry.zh || entry.en || key;
    const m = en.match(/^\d+\s+"(.+)"$/); if (m) en = m[1];
    const m2 = zh.match(/^\d+\s+"(.+)"$/); if (m2) zh = m2[1];
    return { en, zh };
  }
  return { en: key, zh: key };
}

// Extract event blocks from file using a simpler approach
// Find event id, title, desc, picture, and options
function extractEvents(content, crisisId) {
  const events = [];
  // Match event blocks: type = { ... } with nested braces
  const eventRegex = /(\w+_event)\s*=\s*\{/g;
  let match;

  while ((match = eventRegex.exec(content)) !== null) {
    const eventType = match[1];
    const startPos = match.index + match[0].length;

    // Find matching closing brace
    let depth = 1;
    let pos = startPos;
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth++;
      if (content[pos] === '}') depth--;
      pos++;
    }

    const block = content.substring(startPos, pos - 1);

    // Extract fields
    const idMatch = block.match(/^\s*id\s*=\s*(\S+)/m);
    const titleMatch = block.match(/^\s*title\s*=\s*"?([^"\n]+)"?/m);
    const descMatch = block.match(/^\s*desc\s*=\s*"?([^"\n]+)"?/m);
    const pictureMatch = block.match(/^\s*picture\s*=\s*(\S+)/m);

    // Skip hidden/test events
    const isHidden = /hide_window\s*=\s*yes/.test(block);
    const isTest = /is_test_event\s*=\s*yes/.test(block);

    if (!idMatch) continue;

    const eventId = idMatch[1];
    const title = titleMatch ? titleMatch[1].replace(/"/g, '') : null;
    const desc = descMatch ? descMatch[1].replace(/"/g, '') : null;
    const picture = pictureMatch ? pictureMatch[1] : null;

    // Extract options
    const options = [];
    const optRegex = /option\s*=\s*\{/g;
    let optMatch;
    while ((optMatch = optRegex.exec(block)) !== null) {
      const optStart = optMatch.index + optMatch[0].length;
      let oDepth = 1;
      let oPos = optStart;
      while (oPos < block.length && oDepth > 0) {
        if (block[oPos] === '{') oDepth++;
        if (block[oPos] === '}') oDepth--;
        oPos++;
      }
      const optBlock = block.substring(optStart, oPos - 1);
      const nameMatch = optBlock.match(/^\s*name\s*=\s*(\S+)/m);
      if (nameMatch) options.push(nameMatch[1]);
    }

    events.push({
      event_id: eventId,
      event_type: eventType,
      title_key: title,
      desc_key: desc,
      picture,
      is_hidden: isHidden,
      is_test: isTest,
      options,
      crisis: crisisId,
    });
  }

  return events;
}

async function main() {
  const glossary = await loadGlossary();
  const allCrises = [];

  for (const cf of [...CRISIS_FILES, ...THREAT_FILES]) {
    const filePath = path.join(EVENTS_DIR, cf.file);
    let content;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      console.log(`  Skipping ${cf.file} (not found)`);
      continue;
    }

    const events = extractEvents(content, cf.crisis_id);
    const visibleEvents = events.filter(e => !e.is_hidden && !e.is_test);

    console.log(`  ${cf.file}: ${events.length} events (${visibleEvents.length} visible)`);

    // Group into a single crisis entity with sub-events
    const crisisEntity = {
      id: cf.crisis_id,
      name: resolveName(cf.crisis_id, glossary),
      category: 'crisis',
      subcategory: 'endgame_crisis',
      dlc: cf.file.includes('nemesis') ? 'Nemesis' : null,
      lore: '',
      traits: [],
      events: visibleEvents.map(e => ({
        id: e.event_id,
        name: resolveName(e.title_key, glossary),
        desc: resolveName(e.desc_key, glossary),
        type: e.event_type,
        options: e.options.map(o => resolveName(o, glossary)),
      })),
      tags: ['crisis'],
      relations: [],
    };

    // Build a short lore from the first visible event description
    if (crisisEntity.events.length > 0 && crisisEntity.events[0].desc?.zh) {
      crisisEntity.lore = crisisEntity.events[0].desc.zh;
    }

    // Adjust subcategory
    if (cf.crisis_id === 'prethoryn_scourge') {
      crisisEntity.subcategory = 'prethoryn';
      crisisEntity.name = { en: 'Prethoryn Scourge', zh: resolveName('PRETHORYN_SCOURGE', glossary).zh || '虫灾' };
    } else if (cf.crisis_id === 'contingency') {
      crisisEntity.subcategory = 'contingency';
      crisisEntity.name = { en: 'The Contingency', zh: resolveName('CONTINGENCY', glossary).zh || '肃正协议' };
    } else if (cf.crisis_id === 'extradimensional_invaders') {
      crisisEntity.subcategory = 'unbidden';
      crisisEntity.name = { en: 'Extradimensional Invaders', zh: resolveName('EXTRADIMENSIONAL_INVADERS', glossary).zh || '高维恶魔' };
    } else if (cf.crisis_id.startsWith('become_crisis')) {
      crisisEntity.subcategory = 'become_crisis';
      crisisEntity.name = { en: cf.name_en, zh: '成为危机' };
    }

    crisisEntity.tags.push(crisisEntity.subcategory);
    allCrises.push(crisisEntity);

    // Also create individual event entities for major visible events
    for (const e of visibleEvents) {
      const eName = resolveName(e.title_key, glossary);
      const eDesc = resolveName(e.desc_key, glossary);
      allCrises.push({
        id: e.event_id.replace(/\./g, '_'),
        name: eName,
        category: 'crisis',
        subcategory: cf.crisis_id,
        dlc: cf.file.includes('nemesis') ? 'Nemesis' : null,
        lore: eDesc.zh || eDesc.en || '',
        traits: [],
        tags: ['crisis_event', cf.crisis_id],
        relations: [{ type: '所属', target: cf.crisis_id }],
        event_type: e.event_type,
        picture: e.picture,
      });
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const c of allCrises) {
    const filePath = path.join(OUTPUT_DIR, `${c.id}.yml`);
    await fs.writeFile(filePath, yaml.dump(c, { noRefs: true, lineWidth: -1 }));
  }

  console.log(`\nGenerated ${allCrises.length} crisis entities`);
}

main().catch(console.error);
