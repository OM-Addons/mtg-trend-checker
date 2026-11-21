# Cardmarket MTG Trend Checker

Firefox extension that compares Magic: The Gathering prices on cardmarket.com with the Cardmarket **trend price of the cheapest English printing** of each card. It is used by the owner and shared with a few friends. The owner has programming experience but Claude does most of the development, so explain non-obvious choices briefly and keep the code readable.

## What it does (business rules: don't change without asking)

**Trend price used everywhere:** for a card, take all **English, paper** printings on Scryfall and use the **lowest** `prices.eur` (Scryfall's copy of Cardmarket's price trend). If a printing only has `eur_foil`, that counts for that printing. Cardmarket has no per-language trend: "English" means *only printings that exist in English*, not an English-only trend.

**Cart page** (`/Magic/ShoppingCart`), per seller:
- Worth it ⇔ seller total incl. shipping and fees **<** Σ (quantity × trend). Strictly lower: equal is *not* worth it.
- If a card has no trend, the seller is "incomplete" (yellow), never green.
- Per card: note with the trend and its set; thin green/red bar on the price cell.

**Seller offer pages** (`/Magic/Users/<seller>/Offers/Singles`), per offer, by the **offer price**:
| Offer price | Deal when at least this % under trend (default, user-configurable) |
|---|---|
| < €1 | ignored: **no API calls** |
| €1 – < €3 | 25% (`pctLow`) |
| €3 – €5 | 15% (`pctMid`) |
| > €5 | 10% (`pctHigh`) |
- Discount is rounded to 0.01% before comparing, so €9 vs €10 is exactly 10% → deal.
- Deals: green row + `🔥 N% under EN trend €x (Set)`. Every other checked card: `EN trend €x (Set)`, **no percentage** (owner's explicit wish).
- Card name tooltip: price read + trend (for verifying).
- `englishOnly` setting (default on): non-English offers are skipped **without API calls**. Unknown language → checked anyway.
- Overview box (bottom-right) always appears, including diagnostics ("No card offers recognised", "couldn't be priced" list).
- Optional desktop notification for new deals.

## Layout

```
extension/            ← exactly what Firefox loads (no build step)
  manifest.json       MV2; content script lists define load order
  src/parse.js        money/name parsing + cart page parser
  src/prices.js       Scryfall lookups, request queue, 24h cache
  src/settings.js     defaults, storage, price brackets (requiredDiscount)
  src/content.js      cart page: evaluate + render
  src/offers.js       seller pages: parse rows, judge, render, re-run on DOM changes
  src/background.js   desktop notifications, open settings page
  src/styles.css      all injected styles (classes prefixed `cmc-`)
  options/            settings page
types/globals.d.ts    shared types for the checker (not shipped)
test/                 node:test + jsdom; fixtures/ = sample Cardmarket pages
.claude/skills/release/  how to set up CI/signing and ship a version
```

Scripts are **classic scripts, not modules**: they share code through the global `CMC` object (`root.CMC = Object.assign(root.CMC || {}, {...})`). Load order in `manifest.json` matters (parse → prices → settings → page script). `test/helpers.js` has `CART_SCRIPTS`/`OFFER_SCRIPTS`, which **must mirror the manifest**.

## Commands

```bash
npm install          # once
npm run check        # typecheck + tests + web-ext lint: run before saying you're done
npm test             # tests only
npm run typecheck    # tsc over the JS via JSDoc types
npm start            # opens Firefox with the extension loaded (web-ext run)
npm run build        # unsigned zip in dist/
```

## Conventions

- **No build step, no framework, no dependencies in the extension.** Ask before introducing any.
- Every file starts with `// @ts-check`. Add JSDoc types to new functions. When a shared data shape changes, update `types/globals.d.ts`.
- Element IDs/classes added to Cardmarket pages are prefixed `cmc-`, and every injected node gets `data-cmc` so a re-run can remove it.
- Money: always parse with `parseEuro`/`allEuros` (handles `1.234,56 €` and `€1,234.56`); display with `fmt` (nl-NL, EUR).
- Keep user-facing text short and in English.
- Keep `README.md` (user docs) in sync when behaviour or settings change, and add a line to `CHANGELOG.md` under "Unreleased".

## Cardmarket pages (the fragile part)

- Claude **cannot open Cardmarket** (it needs the owner's login) and can't see the real HTML. Cart selectors are in `parseCart` (`parse.js`); seller-page selectors in `parseOffers`, `priceOfRow` and `detectLanguage` (`offers.js`). The offer parser anchors on `a[href*='/Products/Singles/']` and walks up to the row, so it handles both the list layout and the table layout.
- **The fixtures in `test/fixtures/` are hand-made imitations**, not real pages. When something breaks on the real site: ask the owner to save the page (Ctrl+S → "Web Page, HTML only"), check it for personal data (name, address, username, e-mail, order numbers) before committing, add it as a fixture, write a failing test, then fix the parser.
- After any parser change, ask the owner to test in the browser (`npm start`, or reload in `about:debugging`) and check the card-name tooltips.

## Scryfall API

- Free, **no API key**. Rules: max ~10 requests/s (the queue waits 110 ms between requests), cache ≥24 h (prices update daily). Don't make this faster or the cache shorter.
- Flow: `/cards/cardmarket/{productId}` → fallback `/cards/named?exact=` → `?fuzzy=` → `/cards/search?q=oracleid:… lang:en game:paper&unique=prints`.
- Cache keys in `browser.storage.local` start with `cmc:`; settings live under `settings`. "Refresh prices" clears only `cmc:` keys.
- Every new feature must keep the "no API calls for offers < €1 / skipped languages" guarantee; there's a test for it.

## Releasing

Use the `release` skill (`.claude/skills/release/SKILL.md`). It covers the one-time setup (GitHub Actions for checks and Mozilla signing, auto-updates for friends) and the steps for each release. **Never change the add-on ID** (`browser_specific_settings.gecko.id`) after the first signed release: installed copies would stop updating.

## Ideas discussed, not built yet

- **Scan all pages of a seller**: a "Scan all pages" button; fetch the seller's other pages with the current filters/sort, ~1 page per 1.5–2 s, one sorted deal list with links and progress. Cardmarket may cap results (possibly 300); suggest the user set a min-price filter of €1. Not automatic, and no scanning many sellers in a row.
- Chrome support (MV3 + browser polyfill) only if a friend asks.
- Replace the hand-made fixtures with real saved pages.
