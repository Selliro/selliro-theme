# Whispo 1.0 — architecture

Branch `whispo-1.0`. A ground-up rebuild of the Whispo theme on **Shopify Skeleton v1.0.0**
(https://github.com/Shopify/skeleton-theme, tag v1.0.0; licence in `LICENSE-skeleton.md`), the only
codebase the Theme Store accepts besides fully original code. The previous Horizon-based theme lives on
`master` / `homepage` and is used **only as a reference for what features must do** — no code is copied
from Horizon or Dawn.

## Rules

1. **Original code only.** Skeleton files may be kept and extended; everything else is written fresh.
2. **Theme Store requirements first** (https://shopify.dev/docs/storefronts/themes/store/requirements):
   JSON templates, sections everywhere, header/footer section groups, app blocks in product sections,
   `font_picker` fonts only (no remote fonts), every string translated, 24 x 24px touch targets,
   visible focus, no duplicate ids, Theme Check at 0 errors / 0 warnings.
3. **Section file order:** header comment → 1. CSS (`stylesheet_tag` + `{% style %}` for setting values)
   → 2. Liquid → 3. Schema. Each section/component has its own documented CSS file in `assets/`.
4. **Editor wording:** sentence case, American English, no ampersands, "heading" not "title",
   "slideshow" not "slider", "home page", "navigation".

## Foundation (phase 1)

| File | Purpose |
| --- | --- |
| `config/settings_schema.json` | Theme settings: logo and favicon, colors (5 color schemes), typography (heading / body / accent fonts), layout, buttons / inputs / cards, animations, cart, search, social media |
| `config/settings_data.json` | The "Whispo" preset: brand fonts (Fraunces, Figtree), color schemes (white, soft gray, sage, yellow, charcoal) |
| `snippets/css-variables.liquid` | Design tokens as CSS custom properties; `.color-scheme-N` classes with `-rgb` triplets; all font variants via `font_modify` |
| `assets/base.css` | Reset, typography (h1–h6 distinct), rich text, layout (`.page-width`, `.section`, `.grid`), buttons, fields, focus, media, utilities, scroll-in animation |
| `assets/component.js` | `Component` base class: `refs` (`data-ref`), auto-removed `on()` listeners, `signal`, `emit()`, `Component.define()` |
| `assets/utilities.js` | `debounce`, `fetchSection(s)` (Section Rendering API), `trapFocus` / `releaseFocus`, `formatMoney`, `prefersReducedMotion` |
| `assets/events.js` | Theme events (`EVENTS.CART_UPDATED`, `VARIANT_CHANGED`, …) with `publish` / `subscribe` |
| `assets/theme.js` | Global script: `no-js` → `js`, scroll-in animation (`[data-animate]`) |
| `layout/theme.liquid` | Document shell: meta, tokens, base CSS, import map (`@whispo/component`, `@whispo/utilities`, `@whispo/events`), `window.Whispo` (routes, money format, strings), skip link, header group, `<main>`, footer group |
| `layout/password.liquid` | Same head, no header/footer |

## Phases

1. **Foundation** — done (this file).
2. **Core store** — header (navigation with mega menu and dropdowns, account component, localization,
   predictive search), footer, product page (blocks: price, variant picker with swatches, quantity, buy
   buttons with accelerated checkout, pickup availability, installments, media gallery with 3D/video,
   recommendations, complementary products, gift card recipient, app blocks), collection (faceted filters,
   sorting, pagination, empty state), search, cart page and drawer (discounts, selling plans, notes),
   blog, article, pages, contact, 404, password, gift card, list of collections, Custom Liquid section.
3. **Port the custom sections** from the Horizon-based theme, decoupled from Horizon (store locator,
   routine builder, bundle builder, wholesale, product story, new arrivals, reveal image, timeline,
   comparison table, countdown, FAQ gallery, testimonials, 3D product, product page add-ons…).
4. **Quality** — accessibility, Lighthouse (≥ 60 performance, ≥ 90 accessibility on home, product and
   collection pages, desktop and mobile), browsers and in-app webviews, presets, demo templates.
5. **Submission** — documentation, support form, demo store, version and release notes.

The Skeleton starter sections (`sections/*.liquid`) stay as placeholders until phase 2 replaces them.
