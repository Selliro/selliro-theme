# Whispo versioning and releases

## Where the version lives

| File | Field | Who sees it |
|---|---|---|
| `config/settings_schema.json` | `theme_info.theme_version` | Merchants (Theme actions menu in the editor), the Theme Store, and the ZIP name from `shopify theme package` |
| `package.json` | `version` | Tooling only, kept in sync |
| Git | tag `vX.Y.Z` | The team: the exact code that was submitted |

`npm run version:patch` (or `:minor`, `:major`) updates the first two and opens a new section in `CHANGELOG.md`.

## First release

**1.0.0** is the first version submitted to the Theme Store. Keep it at 1.0.0 while the theme is in review: if
reviewers ask for changes, fix them and upload a new ZIP with the same version. The first real bump (1.0.1, 1.1.0,
etc.) comes with the first update after Whispo is published.

(The 3.0.1 the theme showed before was Horizon's version, inherited from the starter code, not Whispo's.)

## Choosing the next version (X.Y.Z, Shopify's rules)

| Bump | When | Examples from this theme |
|---|---|---|
| **Major** X.0.0 | Changes that are not backwards compatible | Removing or renaming a setting id, section or block; changing a setting's type; adding a global setting; changing a setting value merchants rely on |
| **Minor** 1.Y.0 | New, backwards-compatible features | A new section or block (e.g. the Contact page section), a new setting, a new layout option, a visual redesign of a section without schema changes |
| **Patch** 1.0.Z | Fixes only | Bug fixes, mobile layout fixes, performance and accessibility improvements, translation fixes |

### Manual vs automatic updates for merchants

Shopify installs an update **automatically** for merchants who haven't edited the theme code, unless the update
contains one of these, which makes it a **manual** update (merchants must review and publish a copy):

- a setting id or type changed or removed;
- a `range` setting's `min` raised or `max` lowered;
- a section or block removed.

So after 1.0.0 is live: **never rename or delete setting ids** in a minor or patch release. Add a new setting
instead, keep the old one working, and only clean up in the next major release. Also avoid renaming CSS classes
(merchant custom CSS may depend on them) and never lower section or block limits (the Theme Store rejects that).

## Release notes

- `CHANGELOG.md`: full list for the team, including developer-only changes.
- `docs/release-notes/X.Y.Z.md`: merchant-facing notes in Shopify's format: one short description, then
  `### Added`, `### Changed`, `### Removed`, `### Security`, `### Fixes and other improvements`. Mark key items
  with `Important:`.
- From the **first update after publishing**, copy that file to `release-notes.md` at the root of the theme ZIP.
  (Do not include `release-notes.md` in the first 1.0.0 submission; Shopify only wants it for updates.)

## Release checklist

1. `npm run version:minor` (or patch / major) and tidy the new `CHANGELOG.md` section.
2. Write `docs/release-notes/X.Y.Z.md`.
3. `shopify theme check`: no errors.
4. Test the demo store on desktop, tablet and phone; check the theme editor (presets, empty states).
5. Commit, then tag: `git tag vX.Y.Z && git push --tags`.
6. `npm run theme:package` → `dist/Whispo-X.Y.Z.zip` (only theme folders are included). The script
   (`scripts/package-theme.mjs`) removes the demo store's media and app blocks from the JSON templates, section
   groups and settings: Shopify rejects a template whose video setting points to a video the installing store
   doesn't have, and that page then shows the 404 page. Always upload this ZIP, never a raw folder export.
7. For updates: add `release-notes.md` to the ZIP root. Upload in Partner Dashboard › Themes › Whispo.

## Update cadence (Theme Store)

- At least **4 weeks** between updates.
- Exception: in the **first two months** after publishing, updates can ship every **2 weeks**.
- Group changes so most updates stay automatic (no removed or renamed settings).

## Before the first submission

- Replace `theme_documentation_url` and `theme_support_url` in `config/settings_schema.json` with Selliro's own
  documentation and support pages (they still point to Shopify's).
