import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

const DATA_DIR = 'data/entities';
const OUTPUT_DIR = 'public/api';

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.join(OUTPUT_DIR, 'entity'), { recursive: true });

  const categories = ['empires', 'crises', 'events', 'psionic', 'technology', 'species'];
  const allEntities = [];
  const nodes = [];
  const links = [];

  for (const category of categories) {
    const dir = path.join(DATA_DIR, category);
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch { continue; }

    const categoryEntities = [];
    for (const file of files.filter(f => f.endsWith('.yml'))) {
      const content = await fs.readFile(path.join(dir, file), 'utf-8');
      const entity = yaml.load(content);
      categoryEntities.push(entity);
      allEntities.push(entity);

      // Graph node
      nodes.push({
        id: entity.id,
        name: entity.name?.zh || entity.id,
        group: category,
        weight: (entity.relations || []).length,
      });

      // Graph links from relations
      for (const rel of entity.relations || []) {
        links.push({
          source: entity.id,
          target: rel.target,
          type: rel.type,
        });
      }

      // Individual entity JSON
      await fs.writeFile(
        path.join(OUTPUT_DIR, 'entity', `${entity.id}.json`),
        JSON.stringify(entity, null, 2)
      );
    }

    // Category index
    await fs.writeFile(
      path.join(OUTPUT_DIR, `${category}.json`),
      JSON.stringify(categoryEntities, null, 2)
    );
  }

  // Global index
  const index = allEntities.map(e => ({
    id: e.id,
    name_zh: e.name?.zh || e.id,
    name_en: e.name?.en || e.id,
    category: e.category,
    subcategory: e.subcategory,
    tags: e.tags || [],
  }));
  await fs.writeFile(path.join(OUTPUT_DIR, 'index.json'), JSON.stringify(index, null, 2));

  // Graph data
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'graph.json'),
    JSON.stringify({ nodes, links }, null, 2)
  );

  console.log(`API built: ${allEntities.length} entities, ${nodes.length} nodes, ${links.length} links`);
}

main().catch(console.error);
