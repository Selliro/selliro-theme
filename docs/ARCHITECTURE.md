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

## Header (phase 2, done)

| File | Purpose |
| --- | --- |
| `sections/announcement-bar.liquid` | Announcements as a slideshow (arrows, autoplay with pause) or scrolling text; optional link and icon each |
| `sections/header.liquid` | Logo (`<h1>` on the home page), navigation, button, country/region and language, search, `<shopify-account>`, cart count; menu drawer on mobile |
| `snippets/header-mega-promo.liquid` | "Mega menu image" block card |
| `snippets/localization-form.liquid` | Country/region and language lists (submit buttons, work without JS) |
| `snippets/search-modal.liquid` · `sections/predictive-search.liquid` | Search window and predictive results (combobox + listbox) |
| `snippets/icon.liquid` | Inline SVG icons |
| `assets/dialog.js` (`@whispo/dialog`) | Every drawer and modal: native `<dialog>`, animated close, Escape, backdrop click, scroll lock |
| `assets/header.js` | Sticky modes, submenus (hover, chevron, first tap), disclosures, `<cart-count>` |
| `assets/predictive-search.js` | Predictive Search API requests, keyboard navigation, result count announcement |

Submenus: "Automatic" opens a mega menu for links with three levels or a "Mega menu image" block, a dropdown otherwise.

## Core store (phase 2, done)

| Area | Files |
| --- | --- |
| Footer | `sections/footer.liquid` (brand, menus, newsletter, text; bottom bar; reveal on scroll), `assets/footer.js`, `assets/section-footer.css`, `snippets/social-icons.liquid` |
| Product page | `sections/main-product.liquid` (21 block types), `snippets/` media-gallery, product-media, price, variant-picker, buy-buttons, gift-card-recipient, product-pair-with, pair-with-row; `sections/pickup-availability.liquid`, `sections/pair-with.liquid`; `assets/product-info.js`, `media-gallery.js`, `quantity-input.js` |
| Cart | `assets/cart.js` (`@whispo/cart`: add / change / update, publishes CART_UPDATED with section HTML; bridges legacy `cart:update` events), `snippets/cart-drawer*.liquid`, `cart-line.liquid`, `cart-summary.liquid`, `sections/cart-drawer.liquid`, `sections/main-cart.liquid`, `assets/cart-items.js`, `cart-drawer.js`, `cart.css` |
| Cards and quick view | `snippets/product-card.liquid`, `collection-card.liquid`, `article-card.liquid`; `sections/quick-view.liquid`, `assets/quick-view.js`, `component-product-card.css` |
| Collection and search | `sections/main-collection.liquid`, `main-search.liquid`, `snippets/facets.liquid` (form / toolbar / filters / active), `pagination.liquid`, `assets/facets.js`, `component-facets.css` |
| Content pages | `sections/page.liquid`, `main-contact.liquid`, `404.liquid`, `blog.liquid`, `article.liquid`, `collections.liquid`, `password.liquid`, `product-recommendations.liquid`; `assets/template-content.css` |

Variant changes re-render the section with `option_values` (Section Rendering API) and swap every
`[data-variant-update]` part. Cart changes return the HTML of every `[data-cart-section]` section in one request.

## Ported Selliro sections (phase 3, done)

The custom sections from the Horizon-based theme were copied with their CSS/JS and decoupled: Horizon design tokens
were renamed to Whispo tokens, Horizon snippets replaced (`price`, `icon`, `typography-style` → `text-style-vars`),
the Horizon quick view replaced by Whispo's, `pdp.js` became `assets/pdp-extras.js` (without the old sticky bar),
and Swiper (MIT) is loaded only by the sections that use it. Horizon-native home page sections were rebuilt:
`slideshow`, `image-banner` (hero), `featured-collection` (product list), `icons-with-text` (promises) and
`logo-marquee`. Templates (home, product, product.skincare, our story, quiz, store locator, theme features,
collection, 404, cart) carry the same content as before.

Shared tokens the ported sections rely on live in `snippets/css-variables.liquid` (`--section-title-*`,
`--color-text-muted`, `--color-shadow-rgb` …) and helpers in `assets/base.css` §20.

## Quality (phase 4, in progress)

- Accessibility (audited on home, product, collection, search, cart, blog, article, our story, quiz, theme
  features, contact; desktop and mobile): every control and field named, images have alt (Shopify's video
  fallback images get alt=""), one h1 per page and no skipped heading levels, text contrast at least 4.5:1, touch
  targets at least 24 x 24px, hidden panels inert, drawers focus their heading when they open.
- Performance (throttled mobile run: slow 4G, 4x CPU): layout shift near 0 on every page; offscreen videos load and
  play only near the screen (`video[data-autoplay-visible]`, assets/theme.js); the first product, slide and
  collection images load with high priority; the slideshow starts autoplay after the shopper engages, so the
  first slide stays the page's largest paint. Estimated scores on the local dev server: home ~70, product ~67,
  collection ~71 (higher on Shopify's CDN).
- Lighthouse 12.8 on the local dev server (which serves files uncompressed, about 1 MB extra per page, so the store
  scores higher): accessibility 100 on mobile, 97–100 on desktop (the product story's dimmed inactive steps are
  intentional); performance mobile 58–71, desktop 77–91; SEO 92–100. Best-practices failures come from the local
  setup (http on 127.0.0.1, Shop Pay and account scripts). Re-run on the live demo store before submitting.
- Section styles that Shopify bundled into styles.css on every page were moved into per-section asset files.
- Browsers: Chromium and WebKit (Safari engine) on desktop and phone sizes.

## Phases

1. **Foundation** — done.
2. **Core store** — done: header (navigation with mega menu and dropdowns, account component, localization,
   predictive search), footer, product page (blocks: price, variant picker with swatches, quantity, buy
   buttons with accelerated checkout, pickup availability, installments, media gallery with 3D/video,
   recommendations, complementary products, gift card recipient, app blocks), collection (faceted filters,
   sorting, pagination, empty state), search, cart page and drawer (discounts, selling plans, notes),
   blog, article, pages, contact, 404, password, gift card, list of collections, Custom Liquid section.
3. **Port the custom sections** — done: from the Horizon-based theme, decoupled from Horizon (store locator,
   routine builder, bundle builder, wholesale, product story, new arrivals, reveal image, timeline,
   comparison table, countdown, FAQ gallery, testimonials, 3D product, product page add-ons…).
4. **Quality** — accessibility, Lighthouse (≥ 60 performance, ≥ 90 accessibility on home, product and
   collection pages, desktop and mobile), browsers and in-app webviews, presets, demo templates.
5. **Submission** — documentation, support form, demo store, version and release notes.

The Skeleton starter sections product, collection, cart, search and hello-world are no longer used by any template.
