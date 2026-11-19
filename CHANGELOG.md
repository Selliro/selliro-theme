# Changelog

All notable changes to the Whispo theme are recorded here (for the team). Merchant-facing release notes live in
`docs/release-notes/`. Versions follow [Semantic Versioning](https://semver.org) as Shopify asks for themes; see
`docs/VERSIONING.md`. Bump with `npm run version:patch | version:minor | version:major`.

## [Unreleased]

### Added

### Changed

### Fixed

## [1.0.0] – Unreleased (first Theme Store submission)

First public version of Whispo, built on Shopify Horizon 3.0.1.

### Added
- Homepage: slideshow with a floating product image that flies into New Arrivals on scroll; New Arrivals showcase
  (tabs, promo card, quick view, quick add); Shop by category bento grid; Image with text collage (collage,
  editorial and mosaic designs, rotating badge); Ticker Duo (text / images, outline text, scroll-reactive);
  countdown banner; bundle builder with tiered discount codes; before / after slider; 3D product viewer with
  feature callouts and AR; product story (split, stacked, immersive); routine builder; reveal image; shop-the-look
  bundle; FAQ with gallery; client testimonials; logo marquee; latest stories.
- Wholesale / B2B section: tier calculator with margin at retail price, quote form pre-filled from the order,
  Shopify B2B contract pricing and quantity rules for logged-in business customers.
- Pages: Our Story (video hero, timeline in vertical and horizontal layouts), skin quiz, Theme features (filterable
  showcase with banner hero), Contact (banner, contact cards, form and Google map).
- Product page: rating, benefits, tags, social proof, icon badges, pair-with upsell, promo cards, sticky add-to-cart,
  ingredients spotlight, routine steps, product facts, comparison table, recommendations.
- Footer: animated wordmark, reveal on scroll, mobile accordions; announcement bar with icons and gradients.
- Cart drawer: floating panel with spring slide-in and content cascade, free shipping progress bar (currency
  aware), item cards with an added-item highlight, "You may also like" recommendations with quick add (Shopify
  recommendations with a fallback collection), animated empty state. Settings in Theme settings › Cart.
- Routine steps (product page): new default "Step by step guide" layout: large photo of the selected step with
  story-style progress bars, numbered steps joined by a progress line, the open step shows its instructions, an
  optional tip, time and the product used (quick add); auto-advance that pauses on hover, focus or off-screen;
  swipe, arrows and keyboard. Carousel and grid layouts are still available.
- Search pop-up: larger floating panel with blur backdrop, recent searches, popular search chips, optional quick
  links menu and trending products before typing; results in two columns (products, plus suggestions, collections,
  pages and blog posts), highlighted matches, keyboard hints and "View all results for …"; blog posts now included.
- Search page: hero with large search field and popular searches, All / Products / Blog posts / Pages tabs, blog
  post and page result cards, New Arrivals style product cards, friendly no-results state. The page search no
  longer limits results to products.
- Add to cart animation for every add to cart button in the theme: a dot (or the product image) circles on the
  button while the cart updates, flies to the cart icon with a trail, and the icon bounces; the drawer opens after
  it lands.
- Shared scroll-in animations for custom sections (respecting reduced motion).

### Changed
- Phone and tablet layouts tuned for every custom section, footer and header.

### Fixed
- Installing the theme ZIP on another store showed the 404 page instead of the homepage: the packaged templates
  referenced the demo store's uploaded videos. `npm run theme:package` now builds a store-independent ZIP (demo
  images, videos and app blocks removed from the JSON files).
