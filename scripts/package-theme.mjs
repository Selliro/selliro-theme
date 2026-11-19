#!/usr/bin/env node
/**
 * Build the installable theme ZIP: dist/Whispo-<version>.zip
 *
 *   node scripts/package-theme.mjs            (npm run theme:package)
 *   node scripts/package-theme.mjs --keep-dir (also keep the unzipped copy in dist/build/)
 *
 * Why not `shopify theme package` directly: the templates in this repo carry the demo store's content, and some of
 * it only exists on the demo store. Shopify rejects a whole JSON template on upload when a `video` setting points to a
 * video file the store doesn't have ("does not point to an applicable shopify-hosted video resource"), and the
 * homepage then shows the 404 page. So the package gets store-independent copies of the JSON files:
 *
 *   - settings pointing at the demo store's files are removed (shopify://files/..., shopify://shop_images/...),
 *     so sections fall back to their built-in placeholders and merchants pick their own media;
 *   - app blocks and app embeds (shopify://apps/...) are removed, since the apps may not be installed.
 *
 * Products, collections, menus and pages referenced by handle are kept: Shopify accepts them and they simply render
 * empty states until the merchant picks their own. The repo files are never changed; only the copy in dist/.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keepDir = process.argv.includes('--keep-dir');

const THEME_DIRS = ['assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
const FILE_REF = /^shopify:\/\/(files|shop_images)\//;
const APP_REF = /^shopify:\/\/apps\//;

const schema = readFileSync(join(root, 'config/settings_schema.json'), 'utf8');
const info = JSON.parse(schema).find((group) => group.name === 'theme_info') || {};
const name = (info.theme_name || 'Whispo').replace(/\s+/g, '-');
const version = info.theme_version || '0.0.0';

const distDir = join(root, 'dist');
const buildRoot = join(distDir, 'build');
const buildDir = join(buildRoot, `${name}-${version}`);
const zipPath = join(distDir, `${name}-${version}.zip`);

// Patterns from .shopifyignore that apply inside the theme folders (e.g. templates/gift_card.liquid)
const ignored = new Set(
  readFileSync(join(root, '.shopifyignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && THEME_DIRS.some((dir) => line.startsWith(`${dir}/`)) && !line.includes('*'))
);

/* ------------------------------------------------------------------ copy */
if (existsSync(buildDir)) rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
for (const dir of THEME_DIRS) {
  const from = join(root, dir);
  if (!existsSync(from)) continue;
  cpSync(from, join(buildDir, dir), {
    recursive: true,
    filter: (src) => {
      const rel = relative(root, src);
      if (ignored.has(rel)) return false;
      const base = rel.split('/').pop() || '';
      return !base.startsWith('.');
    },
  });
}

/* -------------------------------------------------------------- sanitise */
const report = { files: 0, settings: 0, appBlocks: 0, embeds: 0 };

/** Split an optional leading block comment (Shopify's "auto-generated" notice) from the JSON body. */
const splitHeader = (text) => {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('/*')) return ['', text];
  const end = text.indexOf('*/') + 2;
  return [text.slice(0, end) + '\n', text.slice(end)];
};

const cleanSettings = (settings, where) => {
  if (!settings || typeof settings !== 'object') return;
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'string' && FILE_REF.test(value)) {
      delete settings[key];
      report.settings++;
    } else if (Array.isArray(value) && value.some((v) => typeof v === 'string' && FILE_REF.test(v))) {
      settings[key] = value.filter((v) => !(typeof v === 'string' && FILE_REF.test(v)));
      report.settings++;
    }
  }
};

const cleanBlocks = (node) => {
  if (!node || typeof node !== 'object') return;
  cleanSettings(node.settings);
  if (node.blocks && typeof node.blocks === 'object') {
    for (const [id, block] of Object.entries(node.blocks)) {
      if (APP_REF.test(block?.type || '')) {
        delete node.blocks[id];
        if (Array.isArray(node.block_order)) node.block_order = node.block_order.filter((b) => b !== id);
        report.appBlocks++;
        continue;
      }
      cleanBlocks(block);
    }
  }
};

const cleanJsonFile = (path) => {
  const text = readFileSync(path, 'utf8');
  const [header, body] = splitHeader(text);
  let data;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new Error(`${relative(buildDir, path)} is not valid JSON: ${error.message}`);
  }
  const before = JSON.stringify(data);

  if (path.endsWith(join('config', 'settings_data.json'))) {
    const scopes = [data.current, ...Object.values(data.presets || {})].filter((s) => s && typeof s === 'object');
    for (const scope of scopes) {
      cleanSettings(scope);
      if (scope.blocks) {
        for (const [id, block] of Object.entries(scope.blocks)) {
          if (APP_REF.test(block?.type || '')) {
            delete scope.blocks[id];
            report.embeds++;
          }
        }
      }
    }
  } else if (data.sections) {
    // Templates and section groups
    for (const [id, section] of Object.entries(data.sections)) {
      if (APP_REF.test(section?.type || '')) {
        delete data.sections[id];
        if (Array.isArray(data.order)) data.order = data.order.filter((s) => s !== id);
        report.appBlocks++;
        continue;
      }
      cleanBlocks(section);
    }
  }

  if (JSON.stringify(data) !== before) {
    writeFileSync(path, header + JSON.stringify(data, null, 2) + '\n');
    report.files++;
  }
};

const jsonFiles = [
  ...readdirSync(join(buildDir, 'templates')).filter((f) => f.endsWith('.json')).map((f) => join(buildDir, 'templates', f)),
  ...readdirSync(join(buildDir, 'sections')).filter((f) => f.endsWith('.json')).map((f) => join(buildDir, 'sections', f)),
  join(buildDir, 'config', 'settings_data.json'),
];
jsonFiles.filter((f) => existsSync(f)).forEach(cleanJsonFile);

// Nothing store-specific may remain
const leftovers = [];
for (const file of jsonFiles) {
  const text = readFileSync(file, 'utf8');
  const hits = text.match(/shopify:\/\/(files|shop_images|apps)\/[^"]+/g);
  if (hits) leftovers.push(`${relative(buildDir, file)}: ${hits.slice(0, 3).join(', ')}`);
}
if (leftovers.length) {
  console.error('✗ Store-specific references are still in the package:\n  ' + leftovers.join('\n  '));
  process.exit(1);
}

/* ------------------------------------------------------------------- zip */
if (existsSync(zipPath)) rmSync(zipPath);
execFileSync('zip', ['-q', '-r', '-X', zipPath, ...THEME_DIRS.filter((d) => existsSync(join(buildDir, d)))], { cwd: buildDir });

const count = (dir) =>
  readdirSync(dir).reduce((n, f) => {
    const p = join(dir, f);
    return n + (statSync(p).isDirectory() ? count(p) : 1);
  }, 0);

console.log(`✓ ${relative(root, zipPath)}  (${count(buildDir)} files, ${(statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(
  `  cleaned ${report.files} JSON files: removed ${report.settings} demo media settings, ` +
    `${report.appBlocks} app blocks, ${report.embeds} app embeds`
);
if (!keepDir) rmSync(buildRoot, { recursive: true, force: true });
else console.log(`  unzipped copy: ${relative(root, buildDir)}`);
