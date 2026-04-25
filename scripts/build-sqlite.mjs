import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import Database from 'better-sqlite3';

const DATA_DIR = 'data/entities';
const DB_PATH = 'stellaris_kb.db';

async function main() {
  // Remove existing DB
  try { await fs.unlink(DB_PATH); } catch {}

  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE entities (
      id TEXT PRIMARY KEY,
      name_en TEXT,
      name_zh TEXT,
      category TEXT,
      subcategory TEXT,
      dlc TEXT,
      lore TEXT,
      traits TEXT,
      tags TEXT,
      raw_yaml TEXT
    );
    CREATE TABLE relations (
      source_id TEXT,
      target_id TEXT,
      type TEXT,
      description TEXT
    );
    CREATE TABLE tags (tag_name TEXT PRIMARY KEY);
    CREATE TABLE entity_tags (entity_id TEXT, tag_name TEXT);
    CREATE INDEX idx_entities_category ON entities(category);
    CREATE INDEX idx_relations_source ON relations(source_id);
    CREATE INDEX idx_relations_target ON relations(target_id);
  `);

  const insertEntity = db.prepare(`
    INSERT INTO entities (id, name_en, name_zh, category, subcategory, dlc, lore, traits, tags, raw_yaml)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRelation = db.prepare(`
    INSERT INTO relations (source_id, target_id, type, description)
    VALUES (?, ?, ?, ?)
  `);
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (tag_name) VALUES (?)');
  const insertEntityTag = db.prepare('INSERT INTO entity_tags (entity_id, tag_name) VALUES (?, ?)');

  const categories = ['empires', 'crises', 'events', 'psionic', 'technology', 'species'];
  let count = 0;

  for (const category of categories) {
    const dir = path.join(DATA_DIR, category);
    let files = [];
    try { files = await fs.readdir(dir); } catch { continue; }

    for (const file of files.filter(f => f.endsWith('.yml'))) {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8');
      const entity = yaml.load(raw);

      insertEntity.run(
        entity.id,
        entity.name?.en || null,
        entity.name?.zh || null,
        entity.category || category,
        entity.subcategory || null,
        entity.dlc || null,
        entity.lore || null,
        JSON.stringify(entity.traits || []),
        JSON.stringify(entity.tags || []),
        raw
      );

      for (const rel of entity.relations || []) {
        insertRelation.run(entity.id, rel.target, rel.type, rel.description || null);
      }

      for (const tag of entity.tags || []) {
        insertTag.run(tag);
        insertEntityTag.run(entity.id, tag);
      }

      count++;
    }
  }

  db.close();
  console.log(`SQLite built: ${count} entities in ${DB_PATH}`);
}

main().catch(console.error);
