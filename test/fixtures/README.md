# Test pages

These HTML files stand in for Cardmarket pages in the tests.

| File | Page | Kind | Used by |
|---|---|---|---|
| `real-cart.html` | `/Magic/ShoppingCart`, 2 sellers | **real** (saved 2026-11-21, anonymised) | `real-pages.test.js` |
| `real-offers-list.html` | Seller offers (`.article-row` divs, the only layout), 20 offers | **real** (saved 2026-11-21, anonymised) | `real-pages.test.js` |
| `real-cart-foil.html` | `/Magic/ShoppingCart`, 2 sellers, foil and non-foil copies of one card | **real** (saved 2026-11-22, anonymised) | `trend-source.test.js` |
| `real-offers-foil.html` | Seller offers, 20 offers, 8 foil | **real** (saved 2026-11-22, anonymised) | `trend-source.test.js` |
| `real-wizard.html` | `/Magic/Wants/ShoppingWizard/Results/…`, 15 sellers, 28 cards, 2 foil | **real** (saved 2026-11-22, anonymised) | `wizard.test.js` |
| `cart.html` | `/Magic/ShoppingCart` with 3 sellers | hand-made | `cart.test.js` |
| `offers-list.html` | Seller offers, edge cases | hand-made | `offers.test.js` |
| `offers-table.html` | Seller offers as `<tr>` rows: robustness test, not a real Cardmarket layout | hand-made | `offers.test.js` |

The hand-made files cover edge cases the real pages don't have (non-English offers, foil-only trends, unknown cards, deals in every price bracket). Keep both kinds.

## Adding a real page

1. Open the page on Cardmarket (logged in), press **Ctrl+S**, choose **"Web Page, HTML only"**, and save it in `incoming-pages/` (git-ignored).
2. Clean it:
   ```bash
   node scripts/clean-page.js cart   "incoming-pages/<file>.htm" test/fixtures/real-<name>.html
   node scripts/clean-page.js offers "incoming-pages/<file>.htm" test/fixtures/real-<name>.html
   node scripts/clean-page.js wizard "incoming-pages/<file>.htm" test/fixtures/real-<name>.html
   ```
   It keeps only what the parsers read, removes scripts, forms and tokens, replaces usernames with `Seller1`, `Seller2`, …, removes account IDs and the wizard's calculation ID, replaces your own country (from shipping tooltips) with `[country]`, and refuses to write if anything from the account name, shipping address, tokens or usernames is left. Add `--forbid "a,b"` for other words that must not appear (e.g. your real name), and `--debug` to see where a leak is.
3. **Check the result yourself** (search it for your name, address, e-mail, username) before committing.
4. Add tests for it, then delete the raw file from `incoming-pages/`.
