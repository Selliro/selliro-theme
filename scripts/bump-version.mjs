#!/usr/bin/env node
/**
 * Bump the Whispo theme version everywhere it lives, in one step.
 *
 *   node scripts/bump-version.mjs patch        1.0.0 → 1.0.1   bug fixes, no visual/setting changes
 *   node scripts/bump-version.mjs minor        1.0.0 → 1.1.0   new sections/blocks, new features (backwards compatible)
 *   node scripts/bump-version.mjs major        1.0.0 → 2.0.0   removed/renamed settings, sections or blocks
 *   node scripts/bump-version.mjs 1.4.2        set an exact version
 *   add --dry-run to only print what would change
 *
 * Updates:
 *   config/settings_schema.json  theme_info.theme_version   (what merchants and the Theme Store see)
 *   package.json                 version                     (kept in sync for tooling)
 *   CHANGELOG.md                 opens a new "## [x.y.z] – date" section from "## [Unreleased]"
 *
 * It does not commit or tag; see docs/VERSIONING.md for the release checklist.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const kind = args.find((a) => !a.startsWith('--'));

const SCHEMA = resolve(root, 'config/settings_schema.json');
const PKG = resolve(root, 'package.json');
const CHANGELOG = resolve(root, 'CHANGELOG.md');

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (!kind) fail('Say which part to bump: patch, minor, major, or an exact version such as 1.2.0');

// settings_schema.json may contain comments, so edit the text instead of re-serialising the JSON
const schemaText = readFileSync(SCHEMA, 'utf8');
const match = schemaText.match(/"theme_version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!match) fail('Could not find theme_info.theme_version (X.Y.Z) in config/settings_schema.json');

const [major, minor, patch] = match.slice(1).map(Number);
const current = `${major}.${minor}.${patch}`;
let next;
if (kind === 'major') next = `${major + 1}.0.0`;
else if (kind === 'minor') next = `${major}.${minor + 1}.0`;
else if (kind === 'patch') next = `${major}.${minor}.${patch + 1}`;
else if (/^\d+\.\d+\.\d+$/.test(kind)) next = kind;
else fail(`"${kind}" is not patch, minor, major or an X.Y.Z version`);

const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
if (cmp(next, current) <= 0) fail(`New version ${next} must be higher than the current ${current}`);

const changes = [];

// 1. theme_info.theme_version
changes.push(['config/settings_schema.json', schemaText.replace(match[0], match[0].replace(current, next)), SCHEMA]);

// 2. package.json version
if (existsSync(PKG)) {
  const pkgText = readFileSync(PKG, 'utf8');
  const updated = pkgText.replace(/("version"\s*:\s*")[^"]*(")/, `$1${next}$2`);
  changes.push(['package.json', updated, PKG]);
}

// 3. CHANGELOG.md: turn the Unreleased notes into the new version's section and open a fresh Unreleased one
if (existsSync(CHANGELOG)) {
  const log = readFileSync(CHANGELOG, 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  if (log.includes(`## [${next}]`)) fail(`CHANGELOG.md already has a section for ${next}`);
  const heading = '## [Unreleased]';
  const updated = log.includes(heading)
    ? log.replace(heading, `${heading}\n\n### Added\n\n### Changed\n\n### Fixed\n\n## [${next}] – ${date}`)
    : log.replace(/\n## /, `\n## [${next}] – ${date}\n\n### Added\n\n### Changed\n\n### Fixed\n\n## `);
  changes.push(['CHANGELOG.md', updated, CHANGELOG]);
}

console.log(`${dryRun ? '(dry run) ' : ''}Whispo ${current} → ${next}`);
for (const [label, text, path] of changes) {
  if (!dryRun) writeFileSync(path, text);
  console.log(`  ✓ ${label}`);
}
if (!dryRun) {
  console.log('\nNext: tidy the CHANGELOG entry, write release notes (docs/release-notes/), run theme check,');
  console.log(`then commit, tag v${next} and package with "npm run theme:package". See docs/VERSIONING.md.`);
}
