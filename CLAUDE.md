# Cardmarket MTG Trend Checker

Firefox extension that compares Magic: The Gathering prices on cardmarket.com with the Cardmarket **trend price of the cheapest English printing** of each card. It is used by the owner and shared with a few friends. The owner has programming experience but Claude does most of the development, so explain non-obvious choices briefly and keep the code readable.

## What it does (business rules: don't change without asking)

**Trend price used everywhere:** for a card, take all **English, paper** printings on Scryfall and use the **lowest** `prices.eur` (Scryfall's copy of Cardmarket's price trend). If a printing only has `eur_foil`, that counts for that printing. Cardmarket has no per-language trend: "English" means *only printings that exist in English*, not an English-only trend.

**Cart page** (`/Magic/ShoppingCart`), per seller:
- Worth it ⇔ seller total incl. shipping and fees **<** Σ (quantity × trend). Strictly lower: equal is *not* worth it.
- If a card has no trend, the seller is "incomplete" (yellow), never green.
- Per card: note with the trend and its set; thin green/red bar on the price cell.

**Seller offer pages** (`/Magic/Users/<seller>/Offers/Singles`), per offer, by the **offer price**:
| Offer price | Deal when at least this % under trend (default brackets) |
|---|---|
| < €1 | ignored: **no API calls** |
| €1 – < €3 | 25% |
| €3 – < €5 | 15% |
| ≥ €5 | 10% |
- Brackets are user-editable (`settings.brackets`: `{from, pct}[]`, max 10). Each `from` is **inclusive** and the bracket runs to the next `from`. Offers below the lowest `from` are ignored with **no API calls**. The lowest `from` may be €0 (owner's decision: then nothing is ignored by price). Old `pctLow/Mid/High` settings are migrated in `migrate()`. The settings page must always say which offers are ignored.
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
  options/            settings page (links to "What's new")
  changelog/          "What's new" page: renders ../CHANGELOG.md (tiny Markdown subset, no library)
  CHANGELOG.md        the changelog: shipped, shown in the add-on, and the source of release notes
types/globals.d.ts    shared types for the checker (not shipped)
test/                 node:test + jsdom; fixtures/ = Cardmarket pages (real-*.html are real, anonymised)
scripts/clean-page.js turn a saved Cardmarket page into an anonymised fixture
incoming-pages/       raw pages saved by the owner (git-ignored except README)
.github/workflows/ci.yml npm run check on every PR and push to main
.github/workflows/release.yml  tag v* → sign (unlisted) → GitHub release → updates.json
updates.json          self-hosted update manifest (written by the release workflow)
.claude/skills/release/  how to set up CI/signing and ship a version
```

Scripts are **classic scripts, not modules**: they share code through the global `CMC` object (`root.CMC = Object.assign(root.CMC || {}, {...})`). Load order in `manifest.json` matters (parse → prices → settings → page script). `test/helpers.js` has `CART_SCRIPTS`/`OFFER_SCRIPTS`, which **must mirror the manifest**.

## Commands

Node.js 22.22.2+ or 24.15+ (`engines` in `package.json`, set by jsdom's requirement; CI uses the latest 22, so don't rely on newer Node features).

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
- **Update `README.md` with every change** (owner's wish): whenever a change affects anything the README describes (features, behaviour, settings, installation, development commands or setup), update it in the same commit. Also add a line to `extension/CHANGELOG.md` under "Unreleased" for user-visible changes. It ships with the add-on and is shown on its "What's new" page, so write for friends, not developers.
- **Tests with every change**: a bug fix starts with a test that fails because of the bug; a new feature comes with tests for its rules. Business rules above (strictly-lower comparison, price brackets, no API calls below the first bracket / skipped languages) must each stay covered.
- **Keep the owner's name out of the repo** (it will be public at `OM-Addons/mtg-trend-checker`): commits are authored as `mtg-tools <noreply@mtg-trend-checker.invalid>` (repo-local git config; set it again in a fresh clone), and no real names, e-mail addresses or usernames go into files, commit messages, fixtures or the add-on. The owner's GitHub username on PRs is accepted. Never rewrite history or force-push without asking.
- **Commit after each change** (owner's wish): once a change is done and `npm run check` passes, commit it on its own with a short message saying what changed and why. One logical change per commit; don't wait to be asked.
- **One branch per feature** (owner's wish): start each new feature or fix on its own branch off an up-to-date `main` (e.g. `feature/scan-all-pages`, `fix/cart-parser`), never commit straight to `main`. Ask the owner before merging into `main` or pushing.
- **Dependabot PRs** (`.github/dependabot.yml`): minor/patch updates are grouped; merge when CI is green. A major update (like web-ext 8 → 10) needs a look at its changelog and, if it touches `web-ext`, a check that `npm start` and the `web-ext sign` flags in the release skill still work.
- **Merge through pull requests**: when the work is done, push the branch and open a PR with `gh pr create` (what changed, why, how it was tested, what the owner should check in the browser). CI (`.github/workflows/ci.yml`) runs `npm run check`; merge only when it's green and the owner agrees, then delete the branch and switch back to an updated `main`.
  **Merge locally, never with GitHub's merge button / `gh pr merge`**: GitHub writes the merge commit under the owner's account e-mail. Instead: `git switch main && git pull && git merge --no-ff <branch> -m "Merge pull request #<n> from <branch>"` (commits as `mtg-tools`), `git push origin main` (GitHub then marks the PR merged), then `git push origin --delete <branch>` and `git branch -d <branch>`. Before pushing `main`, check `git log --format='%an <%ae>' origin/main..main` shows only `mtg-tools` (and `github-actions[bot]`).

## Cardmarket pages (the fragile part)

- Claude **cannot open Cardmarket** (it needs the owner's login) and can't see the real HTML. Cart selectors are in `parseCart` (`parse.js`); seller-page selectors in `parseOffers`, `priceOfRow` and `detectLanguage` (`offers.js`). The offer parser anchors on `a[href*='/Products/Singles/']` and walks up to the row, so it handles both the list layout and the table layout.
- **Fixtures**: `test/fixtures/real-*.html` are real saved pages (cart; seller list layout), anonymised; the others are hand-made and cover edge cases. There is no real **table-layout** seller page yet. When something breaks on the real site: ask the owner to save the page (Ctrl+S → "Web Page, HTML only") into `incoming-pages/` (git-ignored, raw pages never get committed), turn it into a fixture with `scripts/clean-page.js` (see `test/fixtures/README.md`), check the result yourself for personal data (name, address, username, e-mail, order numbers), write a failing test, then fix the parser. Never print personal data from raw pages in the chat.
- Cardmarket renders every cart row twice (desktop table + mobile copy in `.d-lg-none`); `parseCart` must count each card once. Rows without a card image have **no product ID** in the HTML (name lookup is the fallback).
- After any parser change, ask the owner to test in the browser (`npm start`, or reload in `about:debugging`) and check the card-name tooltips.

## Scryfall API

- Free, **no API key**. Rules: max ~10 requests/s (the queue waits 110 ms between requests), cache ≥24 h (prices update daily). Don't make this faster or the cache shorter.
- Flow: `/cards/cardmarket/{productId}` → fallback `/cards/named?exact=` → `?fuzzy=` → `/cards/search?q=oracleid:… lang:en game:paper&unique=prints`.
- Cache keys in `browser.storage.local` start with `cmc:`; settings live under `settings`. "Refresh prices" clears only `cmc:` keys.
- Every new feature must keep the "no API calls for offers below the first bracket (€1 by default) / skipped languages" guarantee; there are tests for it.

## Releasing

Use the `release` skill (`.claude/skills/release/SKILL.md`). It covers the one-time setup (GitHub Actions for checks and Mozilla signing, auto-updates for friends) and the steps for each release. **Never change the add-on ID** (`mtg-trend-checker@mtg-tools`, in `browser_specific_settings.gecko.id`): installed copies would stop updating.

## Ideas discussed, not built yet

- **Scan all pages of a seller**: a "Scan all pages" button; fetch the seller's other pages with the current filters/sort, ~1 page per 1.5–2 s, one sorted deal list with links and progress. Cardmarket may cap results (possibly 300); suggest the user set a min-price filter of €1. Not automatic, and no scanning many sellers in a row.
- Chrome support (MV3 + browser polyfill) only if a friend asks.
- Firefox for Android: left out for now (owner's decision). Self-hosted installs there need the hidden "Install extension from file" menu, auto-updates are unconfirmed, the notifications API doesn't exist, and the mobile Cardmarket layout is untested.
- Real saved page for the seller **table layout** (cart and list layout are done).
