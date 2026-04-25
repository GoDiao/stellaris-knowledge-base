#!/usr/bin/env node
/**
 * Stellaris Wiki Crawler
 *
 * Enriches entity YAML files with narrative lore from the Stellaris Wiki.
 * When the wiki is unreachable, falls back to the local glossary.yml which
 * contains the canonical English and Chinese game localisation strings.
 *
 * Strategy:
 * - Reads all entity YAMLs under data/entities/
 * - Skips entities whose lore is already substantial (>200 chars)
 * - Attempts to fetch the matching English Wiki page
 * - Falls back to glossary (EMPIRE_DESIGN_{id}_desc) on failure / 404
 * - Cleans citation markers, wiki markup, and Stellaris loc prefixes
 * - Saves updated YAMLs preserving all other fields
 */
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const WIKI_BASE = 'https://stellaris.paradoxwikis.com';
const ENTITIES_DIR = 'data/entities';
const GLOSSARY_PATH = 'data/glossary.yml';
const USER_AGENT = 'StellarisKB-WikiBot/1.0 (personal-project; node)';
const MIN_LORE_LENGTH = 200;
const DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 10000;

// Manual override for wiki page names that don't match the English display name
const WIKI_PAGE_MAP = {
  humans1: 'United_Nations_of_Earth',
  humans1_1: 'United_Nations_of_Earth',
  humans2: 'Commonwealth_of_Man',
  humans2_1: 'Commonwealth_of_Man',
  blorg: 'Blorg_Commonality',
  tzynn: 'Tzynn_Empire',
  yondar: 'Kingdom_of_Yondarim',
  ixidar: "Ix'Idar_Star_Collective",
  chinorr: 'Chinorr_Combine',
  jehetma: 'Jehetma_Dominion',
  scyldari: 'Scyldari_Confederacy',
  kel_azaan: 'Kel-Azaan_Republic',
  iferyx: 'Iferyx_Amalgamated_Fleets',
  xanid: 'Xanid_Suzerainty',
  custodianship: 'Earth_Custodianship',
  tebrid: 'Tebrid_Homolog',
  xt489: 'XT-489_Eliminator',
  voor: 'Voor_Technocracy',
  default: null,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Remove Stellaris localisation prefixes like `0 "..."` or `1 '...'`.
 */
function cleanLocString(text) {
  if (!text || typeof text !== 'string') return text;
  text = text.trim();
  const m = text.match(/^\d+\s*(["'])([\s\S]*)\1\s*$/);
  if (m) return m[2];
  return text;
}

/**
 * Convert literal escape sequences (e.g. \\n -> newline) that sometimes
 * survive the localisation -> glossary pipeline.
 */
function unescapeLocString(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

let glossaryCache = null;

async function loadGlossary() {
  if (glossaryCache) return glossaryCache;
  const raw = await fs.readFile(GLOSSARY_PATH, 'utf-8');
  glossaryCache = yaml.load(raw);
  return glossaryCache;
}

/**
 * Resolve $KEY$ references using the glossary.
 */
function resolveGlossaryRefs(text, glossary) {
  if (typeof text !== 'string') return text;
  return text.replace(/\$([A-Za-z0-9_]+)\$/g, (match, key) => {
    const entry = glossary[key];
    if (!entry) return match;
    const val = entry.en || entry.zh || match;
    return cleanLocString(val);
  });
}

/**
 * Lookup English description in glossary for a given entity id.
 */
function getGlossaryLore(entityId, glossary) {
  const key = `EMPIRE_DESIGN_${entityId}_desc`;
  const entry = glossary[key];
  if (!entry || !entry.en) return null;
  let text = cleanLocString(entry.en);
  text = unescapeLocString(text);
  text = resolveGlossaryRefs(text, glossary);
  return text;
}

/**
 * Determine whether an entity needs its lore enriched.
 */
function needsEnrichment(lore) {
  if (!lore || typeof lore !== 'string') return true;
  const trimmed = lore.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length > MIN_LORE_LENGTH) return false;
  // Treat raw localization keys as placeholders
  if (/^[A-Z_]+desc$/.test(trimmed)) return true;
  if (trimmed === '_desc') return true;
  return true;
}

/* ------------------------------------------------------------------ */
/* Wiki fetching                                                       */
/* ------------------------------------------------------------------ */

async function fetchWikiPage(pageName) {
  const url = `${WIKI_BASE}/${encodeURIComponent(pageName)}`;
  console.log(`    Wiki fetch: ${url}`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      console.log('    -> 404 (page not found)');
      return null;
    }
    if (!res.ok) {
      console.log(`    -> HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    return extractWikiLore(html);
  } catch (err) {
    console.log(`    -> Network error: ${err.name}: ${err.message}`);
    return null;
  }
}

/**
 * Extract introductory paragraphs from MediaWiki HTML.
 * Stops before the first infobox, table, or section heading.
 */
function extractWikiLore(html) {
  // Grab mw-parser-output container
  const parserMatch = html.match(
    /<div\s+class=["']mw-parser-output["']\s*>([\s\S]*?)<\/div>\s*(?:<div|<!--|\z)/i
  );
  if (!parserMatch) return null;
  const content = parserMatch[1];

  // Keep only the intro (before first table/heading/infobox)
  const intro = content.split(/<(table|h2|div\s+class=["']infobox)/i)[0];

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRegex.exec(intro)) !== null) {
    let text = m[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '') // strip any remaining HTML
      .replace(/\[\d+\]/g, '') // remove citation markers like [1]
      .replace(/\[edit\]/gi, '')
      .trim();
    if (text.length > 0) paragraphs.push(text);
  }

  if (paragraphs.length === 0) return null;
  return paragraphs.join('\n\n');
}

/* ------------------------------------------------------------------ */
/* Entity processing                                                   */
/* ------------------------------------------------------------------ */

function getWikiPageName(entity) {
  const id = entity.id;
  if (WIKI_PAGE_MAP[id] !== undefined) return WIKI_PAGE_MAP[id];
  if (entity.name?.en) {
    const clean = cleanLocString(entity.name.en);
    return clean.replace(/ /g, '_');
  }
  return null;
}

async function processEntity(filePath, glossary) {
  const raw = await fs.readFile(filePath, 'utf-8');
  const entity = yaml.load(raw);

  if (!needsEnrichment(entity.lore)) {
    console.log(
      `  SKIP  ${entity.id} (lore already substantial, ${entity.lore.length} chars)`
    );
    return { status: 'skipped', id: entity.id };
  }

  console.log(`  ENRICH ${entity.id}`);

  let newLore = null;
  const wikiPage = getWikiPageName(entity);

  if (wikiPage) {
    newLore = await fetchWikiPage(wikiPage);
    if (newLore) {
      await sleep(DELAY_MS);
    }
  }

  // Fallback to glossary when wiki is unreachable or returns nothing
  if (!newLore) {
    console.log('    -> Falling back to local glossary...');
    newLore = getGlossaryLore(entity.id, glossary);
  }

  if (!newLore) {
    console.log(`    -> No lore source available for ${entity.id}`);
    return { status: 'missing', id: entity.id };
  }

  entity.lore = newLore;
  const out = yaml.dump(entity, { lineWidth: -1, noRefs: true });
  await fs.writeFile(filePath, out, 'utf-8');
  console.log(`    -> Saved (${newLore.length} chars)`);
  return { status: 'enriched', id: entity.id, length: newLore.length };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log('Stellaris Wiki Crawler');
  console.log('======================\n');

  const glossary = await loadGlossary();
  console.log(`Loaded glossary: ${Object.keys(glossary).length.toLocaleString()} entries\n`);

  const categories = [
    'empires',
    'crises',
    'events',
    'psionic',
    'technology',
    'species',
  ];
  const stats = { enriched: 0, skipped: 0, missing: 0, total: 0 };

  for (const category of categories) {
    const dir = path.join(ENTITIES_DIR, category);
    let files = [];
    try {
      files = (await fs.readdir(dir)).filter(f => f.endsWith('.yml'));
    } catch {
      continue;
    }
    if (files.length === 0) continue;

    console.log(`\n[${category}] — ${files.length} file(s)`);
    for (const file of files) {
      const filePath = path.join(dir, file);
      stats.total++;
      const result = await processEntity(filePath, glossary);
      stats[result.status]++;
    }
  }

  console.log('\n======================');
  console.log('Summary');
  console.log('======================');
  console.log(`Total processed : ${stats.total}`);
  console.log(`Enriched        : ${stats.enriched}`);
  console.log(`Skipped         : ${stats.skipped}`);
  console.log(`Missing / Failed: ${stats.missing}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
