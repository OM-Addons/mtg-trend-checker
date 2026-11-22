# Cardmarket MTG Trend Checker

Firefox extension that compares Magic: The Gathering prices on cardmarket.com with the Cardmarket **trend price of the cheapest English printing** of each card. It is used by the owner and shared with a few friends. The owner has programming experience but Claude does most of the development, so explain non-obvious choices briefly and keep the code readable.

## What it does (business rules: don't change without asking)

**Trend price used everywhere** (`settings.trendSource`, cart and seller pages, toggled with the `Cheapest EN | This printing` row in the overview box, saved; also on the settings page):
- `"cheapestEnglish"` (default): for a card, take all **English, paper** printings on Scryfall and use the **lowest** `prices.eur` (Scryfall's copy of Cardmarket's price trend). If a printing only has `eur_foil`, that counts for that printing. Cardmarket has no per-language trend: "English" means *only printings that exist in English*, not an English-only trend.
- `"printing"`: the trend of the exact printing (`/cards/cardmarket/{productId}`): `eur`, or `eur_foil` for **foil offers** (Cardmarket's icon with tooltip "Foil", `isFoil` in `parse.js`) and foil-only printings. **No fallback** (owner's decision): no product ID, or no trend for that finish → no trend ("couldn't be priced" / cart seller incomplete). Without a product ID no API call is made. In the cart, foil and non-foil copies of one product are priced separately (`priceKey`).

**Cart page** (`/Magic/ShoppingCart`), per seller:
- Worth it ⇔ seller total incl. shipping and fees **<** Σ (quantity × trend). Strictly lower: equal is *not* worth it.
- If a card has no trend, the seller is "incomplete" (yellow), never green.
- Per card: note with the trend and its set; thin green/red bar on the price cell.

**Shopping wizard results** (`/Magic/Wants/ShoppingWizard/Results/…`): the cart's rule per seller block (Cardmarket's block Total incl. shipping **<** Σ quantity × trend; missing trend → incomplete) **and overall** (Results Summary grand Total vs Σ of all cards). Shown as two extra rows in Cardmarket's own `<dl>` lists (Σ trend + verdict), a coloured edge on each block, the cart's per-card notes, and the overview box (overall line, counts, seller list, switches). The card checkboxes are **ignored** (owner's decision: whole result, like Cardmarket's Total). Price column is read as per copy unless "Articles Value" says it's per line (only quantity 1 seen so far). Cardmarket stacks the blocks with **Masonry** (absolute positions measured once at load), so after adding or removing rows `relayout()` calls the page's `Masonry.data(grid).layout()` via `wrappedJSObject` (Firefox); if that fails, `cmc-unmasonry` turns the absolute positioning off. Without this the blocks overlap.

**Seller offer pages** (`/Magic/Users/<seller>/Offers/Singles`), per offer, by the **offer price**:
| Offer price | Deal when at least this % under trend (default brackets) |
|---|---|
| < €1 | ignored: **no API calls** |
| €1 – < €3 | 25% |
| €3 – < €5 | 15% |
| ≥ €5 | 10% |
- Brackets are user-editable (`settings.brackets`: `{from, pct}[]`, max 10). Each `from` is **inclusive** and the bracket runs to the next `from`. Offers below the lowest `from` are ignored with **no API calls**. The lowest `from` may be €0 (owner's decision: then nothing is ignored by price). Old `pctLow/Mid/High` settings are migrated in `migrate()`. The settings page must always say which offers are ignored.
- `dealMode` (default `"ranges"`): `"anyUnder"` ignores the brackets entirely. **Every** priced offer is looked up, including < €1 (owner's decision), and a deal is strictly below trend (`discount > 0`; at trend is not a deal). `englishOnly` still skips without API calls. Toggled from the overview box on seller pages (saved, so it sticks) and on the settings page.
- Discount is rounded to 0.01% before comparing, so €9 vs €10 is exactly 10% → deal.
- Deals: green row + `🔥 N% (€saved) under trend €x (Set)`; overview box lists `Name: €price vs €trend (€saved - N%)`. Every other checked card: `Trend €x (Set)`, **no percentage** (owner's explicit wish). No "EN" in the notes (owner's wish).
- Card name tooltip: price read + trend (for verifying).
- `englishOnly` setting (default on): non-English offers are skipped **without API calls**. Unknown language → checked anyway.
- **On/off** (`settings.enabled`, default on): the ⏻ Off button in the overview box (cart and seller pages) is saved, so it applies to every page. While off: **no parsing, no API calls, no notes**, only a minimized ⏻ On button (bottom-right). Turning off mid-check stops the remaining lookups. The settings page keeps the stored value when saving.
- Overview box (bottom-right) always appears, including diagnostics ("No card offers recognised", "couldn't be priced" list).
- No desktop notifications (removed in 1.4 at the owner's request; the add-on no longer has the permission).

## Layout

```
extension/            ← exactly what Firefox loads (no build step)
  manifest.json       MV2; content script lists define load order
  src/parse.js        money/name parsing + cart page parser
  src/prices.js       Scryfall lookups, request queue, 24h cache
  src/settings.js     defaults, storage, price brackets (requiredDiscount)
  src/onoff.js        overview-box switches shared by cart and seller pages: on/off, trend source (toggleRow)
  src/verdict.js      "worth it" shared by cart and wizard: evaluate, lookups, card notes, overview box
  src/content.js      cart page: verdict panels
  src/wizard.js       shopping wizard results: parse blocks + summary, add verdict rows
  src/offers.js       seller pages: parse rows, judge, render, re-run on DOM changes
  src/background.js   opens the settings page
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

Scripts are **classic scripts, not modules**: they share code through the global `CMC` object (`root.CMC = Object.assign(root.CMC || {}, {...})`). Load order in `manifest.json` matters (parse → prices → settings → onoff → (verdict →) page script; verdict.js on the cart and wizard pages). `test/helpers.js` has `CART_SCRIPTS`/`OFFER_SCRIPTS`/`WIZARD_SCRIPTS`, which **must mirror the manifest** (a test checks this).

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

- **Ask about new features until they're fully clear, before building anything** (owner's wish). When the owner asks for a new feature (or a change to how an existing one behaves), don't start coding until you understand it completely. Ask questions in rounds (use `AskUserQuestion`, a few focused questions per round, with a recommended option where you have one) about whatever is still unclear: what exactly should happen, on which pages, edge cases (no trend, foils, non-English, < €1, empty pages), how it interacts with the business rules above and existing settings, whether it needs a setting and what the default is, UI text and placement, and what's out of scope. Keep asking until nothing is left to guess, then sum up your understanding in a few lines and get the owner's OK before writing code. Small bug fixes and clearly specified tasks don't need this.
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

- Claude **cannot open Cardmarket** (it needs the owner's login) and can't see the real HTML. Cart selectors are in `parseCart` (`parse.js`); wizard selectors in `parseWizard` (`wizard.js`: `.detailed-result-card` blocks, `#ShoppingWizardResult dl`, desktop `td.card-name` rows; totals are the largest amount in a `<dl>`, so they don't depend on the site language); seller-page selectors in `parseOffers`, `priceOfRow` and `detectLanguage` (`offers.js`). The offer parser anchors on `a[href*='/Products/Singles/']` and walks up to the row (`.article-row` div, or a `<tr>` as a fallback). Seller pages have only one layout (owner confirmed); `offers-table.html` is a hand-made `<table>` variant kept as a robustness test.
- **Fixtures**: `test/fixtures/real-*.html` are real saved pages (cart; seller page), anonymised; the others are hand-made and cover edge cases. When something breaks on the real site: ask the owner to save the page (Ctrl+S → "Web Page, HTML only") into `incoming-pages/` (git-ignored, raw pages never get committed), turn it into a fixture with `scripts/clean-page.js` (see `test/fixtures/README.md`), check the result yourself for personal data (name, address, username, e-mail, order numbers), write a failing test, then fix the parser. Never print personal data from raw pages in the chat.
- The wizard page also renders every card twice (desktop table + `.d-md-none` mobile copy); `parseWizard` uses the desktop rows. `clean-page.js` replaces the owner's country in shipping tooltips with `[country]`.
- Cardmarket renders every cart row twice (desktop table + mobile copy in `.d-lg-none`); `parseCart` must count each card once. Rows without a card image have **no product ID** in the HTML (name lookup is the fallback).
- After any parser change, ask the owner to test in the browser (`npm start`, or reload in `about:debugging`) and check the card-name tooltips.

## Scryfall API

- Free, **no API key**. Rules: max ~10 requests/s (the queue waits 110 ms between requests), cache ≥24 h (prices update daily). Don't make this faster or the cache shorter.
- Flow: `/cards/cardmarket/{productId}` → fallback `/cards/named?exact=` → `?fuzzy=` → `/cards/search?q=oracleid:… lang:en game:paper&unique=prints`.
- Cache keys in `browser.storage.local` start with `cmc:`; settings live under `settings`. "Refresh prices" clears only `cmc:` keys.
- Every new feature must keep the "no API calls for offers below the first bracket (€1 by default) / skipped languages" guarantee (except the price part in `dealMode: "anyUnder"`, by the owner's choice); there are tests for it.

## Releasing

Use the `release` skill (`.claude/skills/release/SKILL.md`). It covers the one-time setup (GitHub Actions for checks and Mozilla signing, auto-updates for friends) and the steps for each release. **Never change the add-on ID** (`mtg-trend-checker@mtg-tools`, in `browser_specific_settings.gecko.id`): installed copies would stop updating.

## Ideas discussed, not built yet

- **Scan all pages of a seller**: a "Scan all pages" button; fetch the seller's other pages with the current filters/sort, ~1 page per 1.5–2 s, one sorted deal list with links and progress. Cardmarket may cap results (possibly 300); suggest the user set a min-price filter of €1. Not automatic, and no scanning many sellers in a row.
- Chrome support (MV3 + browser polyfill) only if a friend asks.
- Firefox for Android: left out for now (owner's decision). Self-hosted installs there need the hidden "Install extension from file" menu, auto-updates are unconfirmed, and the mobile Cardmarket layout is untested.
