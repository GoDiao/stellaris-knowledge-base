import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const GAME_DIR = 'D:/Games/Stellaris Astral Planes';
const OUTPUT_DIR = 'data';

async function parseLocalisationDir(lang) {
  const dir = path.join(GAME_DIR, 'localisation', lang);
  const files = await fs.readdir(dir);
  const entries = {};

  for (const file of files.filter(f => f.endsWith('.yml'))) {
    const content = await fs.readFile(path.join(dir, file), 'utf-8');
    // Remove BOM
    const clean = content.replace(/^﻿/, '');
    try {
      const data = yaml.load(clean);
      const key = Object.keys(data).find(k => k.startsWith('l_'));
      if (key && typeof data[key] === 'object') {
        Object.assign(entries, data[key]);
      }
    } catch (e) {
      // Stellaris YAML is not always valid - parse line by line as fallback
      const lines = clean.split('\n');
      let inBlock = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed.endsWith(':') && !trimmed.includes(': ')) {
          inBlock = true;
          continue;
        }
        const match = trimmed.match(/^([\w.]+):\s*(.*)$/);
        if (match) {
          let value = match[2].trim();
          // Remove surrounding quotes
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          entries[match[1]] = value;
        }
      }
    }
  }
  return entries;
}

function resolveReferences(text, glossary) {
  if (typeof text !== 'string') return text;
  return text.replace(/\$([A-Za-z0-9_]+)\$/g, (match, key) => {
    return glossary[key] !== undefined ? glossary[key] : match;
  });
}

async function main() {
  console.log('Parsing English localisation...');
  const en = await parseLocalisationDir('english');
  console.log(`  Found ${Object.keys(en).length} keys`);

  console.log('Parsing Chinese localisation...');
  const zh = await parseLocalisationDir('simp_chinese');
  console.log(`  Found ${Object.keys(zh).length} keys`);

  // Build bilingual glossary
  const glossary = {};
  const allKeys = new Set([...Object.keys(en), ...Object.keys(zh)]);
  for (const key of allKeys) {
    glossary[key] = {
      en: en[key] || null,
      zh: zh[key] || null,
    };
  }

  // Resolve $REF$ in values
  for (const key of Object.keys(glossary)) {
    if (glossary[key].en) glossary[key].en = resolveReferences(glossary[key].en, en);
    if (glossary[key].zh) glossary[key].zh = resolveReferences(glossary[key].zh, zh);
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'glossary.yml'),
    yaml.dump(glossary, { noRefs: true, lineWidth: -1 })
  );

  console.log(`Glossary written: ${Object.keys(glossary).length} entries`);
}

main().catch(console.error);
