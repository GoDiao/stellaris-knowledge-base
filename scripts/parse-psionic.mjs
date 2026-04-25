import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const GAME_DIR = 'D:/Games/Stellaris Astral Planes';
const EVENTS_DIR = path.join(GAME_DIR, 'events');
const OUTPUT_DIR = 'data/entities/psionic';

const PSIONIC_FILES = [
  { file: 'utopia_shroud_events.txt', source_id: 'shroud', name_en: 'The Shroud' },
  { file: 'horizonsignal_events.txt', source_id: 'horizon_signal', name_en: 'Horizon Signal' },
];

// Known psionic patrons (covenants)
const PATRONS = [
  { id: 'composer_of_strands', en: 'Composer of Strands', zh: '织缕者', tag: 'covenant' },
  { id: 'eater_of_worlds', en: 'Eater of Worlds', zh: '噬界者', tag: 'covenant' },
  { id: 'instrument_of_desire', en: 'Instrument of Desire', zh: '欲望之器', tag: 'covenant' },
  { id: 'whisperers_in_the_void', en: 'Whisperers in the Void', zh: '虚空低语者', tag: 'covenant' },
  { id: 'end_of_the_cycle', en: 'The End of the Cycle', zh: '终焉之轮回', tag: 'endgame_covenant' },
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

function extractEvents(content, sourceId) {
  const events = [];
  const eventRegex = /(\w+_event)\s*=\s*\{/g;
  let match;

  while ((match = eventRegex.exec(content)) !== null) {
    const eventType = match[1];
    const startPos = match.index + match[0].length;
    let depth = 1, pos = startPos;
    while (pos < content.length && depth > 0) {
      if (content[pos] === '{') depth++;
      if (content[pos] === '}') depth--;
      pos++;
    }
    const block = content.substring(startPos, pos - 1);

    const idMatch = block.match(/^\s*id\s*=\s*(\S+)/m);
    const titleMatch = block.match(/^\s*title\s*=\s*"?([^"\n]+)"?/m);
    const descMatch = block.match(/^\s*desc\s*=\s*"?([^"\n]+)"?/m);
    const pictureMatch = block.match(/^\s*picture\s*=\s*(\S+)/m);

    const isHidden = /hide_window\s*=\s*yes/.test(block);
    const isTest = /is_test_event\s*=\s*yes/.test(block);

    if (!idMatch) continue;

    const eventId = idMatch[1];
    const title = titleMatch ? titleMatch[1].replace(/"/g, '') : null;
    // desc can be multiline with trigger blocks - just grab the first text= key
    let desc = null;
    const descTextMatch = block.match(/text\s*=\s*"?(\S+)"?/m);
    if (descMatch) desc = descMatch[1].replace(/"/g, '');
    else if (descTextMatch) desc = descTextMatch[1];
    const picture = pictureMatch ? pictureMatch[1] : null;

    const options = [];
    const optRegex = /option\s*=\s*\{/g;
    let optMatch;
    while ((optMatch = optRegex.exec(block)) !== null) {
      const optStart = optMatch.index + optMatch[0].length;
      let oDepth = 1, oPos = optStart;
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
      source: sourceId,
    });
  }
  return events;
}

async function main() {
  const glossary = await loadGlossary();
  const allPsionic = [];

  // Create patron entities (high-level psionic beings)
  for (const p of PATRONS) {
    const entity = {
      id: p.id,
      name: { en: p.en, zh: p.zh },
      category: 'psionic',
      subcategory: 'patron',
      dlc: 'Utopia',
      lore: '',
      traits: [p.tag],
      tags: ['psionic', 'patron', p.tag],
      relations: [{ type: '所在', target: 'shroud' }],
    };
    allPsionic.push(entity);
  }

  // Create source-level entities (The Shroud, Horizon Signal)
  for (const sf of PSIONIC_FILES) {
    const filePath = path.join(EVENTS_DIR, sf.file);
    let content;
    try { content = await fs.readFile(filePath, 'utf-8'); } catch { continue; }

    const events = extractEvents(content, sf.source_id);
    const visible = events.filter(e => !e.is_hidden && !e.is_test);

    console.log(`  ${sf.file}: ${events.length} events (${visible.length} visible)`);

    const sourceEntity = {
      id: sf.source_id,
      name: resolveName(sf.source_id, glossary),
      category: 'psionic',
      subcategory: 'source',
      dlc: sf.file.includes('utopia') ? 'Utopia' : sf.file.includes('horizon') ? 'Horizon Signal' : null,
      lore: '',
      traits: [],
      events: visible.slice(0, 50).map(e => ({
        id: e.event_id,
        name: resolveName(e.title_key, glossary),
        desc: resolveName(e.desc_key, glossary),
        type: e.event_type,
      })),
      tags: ['psionic', sf.source_id],
      relations: [],
    };

    if (sf.source_id === 'shroud') {
      sourceEntity.name = { en: 'The Shroud', zh: '虚境' };
      sourceEntity.lore = '虚境是一个灵能维度，是意识的领域。灵能帝国可以进入虚境，与虚境中的强大存在建立契约。';
      for (const p of PATRONS) {
        sourceEntity.relations.push({ type: '包含', target: p.id });
      }
    } else if (sf.source_id === 'horizon_signal') {
      sourceEntity.name = { en: 'Horizon Signal', zh: '时之螶' };
      sourceEntity.lore = '一个来自银河边缘的神秘信号，似乎在侵蚀现实的边界。';
    }

    allPsionic.push(sourceEntity);

    // Individual event entities for key events
    for (const e of visible) {
      const eName = resolveName(e.title_key, glossary);
      const eDesc = resolveName(e.desc_key, glossary);

      // Determine subcategory from event content
      let subcat = sf.source_id + '_event';
      for (const p of PATRONS) {
        if (e.event_id.includes(p.id) || (e.title_key && e.title_key.toLowerCase().includes(p.id))) {
          subcat = p.id;
          break;
        }
      }

      allPsionic.push({
        id: e.event_id.replace(/\./g, '_'),
        name: eName,
        category: 'psionic',
        subcategory: subcat,
        dlc: sf.file.includes('utopia') ? 'Utopia' : sf.file.includes('horizon') ? 'Horizon Signal' : null,
        lore: eDesc.zh || eDesc.en || '',
        traits: [],
        tags: ['psionic_event', sf.source_id],
        relations: [{ type: '所属', target: sf.source_id }],
        event_type: e.event_type,
        picture: e.picture,
      });
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const p of allPsionic) {
    await fs.writeFile(path.join(OUTPUT_DIR, `${p.id}.yml`), yaml.dump(p, { noRefs: true, lineWidth: -1 }));
  }

  console.log(`\nGenerated ${allPsionic.length} psionic entities`);
}

main().catch(console.error);
