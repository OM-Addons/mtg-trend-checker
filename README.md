# Cardmarket MTG Trend Checker (Firefox)

Compares Magic: The Gathering prices on Cardmarket with the trend price of the **cheapest English printing** of each card, in your shopping cart and on seller pages.

## Shopping cart

Checks your cart one seller at a time:

> **Worth it** = seller total (cards + shipping + fees) **<** Σ (quantity × trend price of the *cheapest English printing* of each card)

What you'll see on `cardmarket.com/<lang>/Magic/ShoppingCart`:
- A green ✅ / red ❌ / yellow ⚠️ panel above each seller's summary, showing cards, shipping, total, summed trend and how much you save or overpay.
- Under each card: the cheapest English trend price and which set it is from (links to that printing on Cardmarket). The price cell gets a green bar if that copy is at or below the trend, red if above.
- A small overview box in the bottom-right corner listing all sellers, with a **Refresh prices** button.

It re-checks automatically when you remove items or sellers.

## Seller offer pages: under-trend deals

On `cardmarket.com/<lang>/Magic/Users/<seller>/Offers/Singles` every offer is checked against the same "cheapest English printing" trend:

| Offer price | Flagged when at least this much below trend (default) |
|---|---|
| under €1 | ignored: no lookup at all |
| €1 – under €3 | 25% |
| €3 – €5 | 15% |
| above €5 | 10% |

- Deals are marked with a green row and a 🔥 note. Every other checked card shows the cheapest English trend price (no percentage).
- An overview box (bottom-right) lists the deals on the page. A desktop notification pops up as well; click it to jump back to the tab.
- Only the page you're viewing is checked, so with a 20-per-page shop you'll get notified page by page. Sort by price descending to see the expensive cards first.
- By default only English offers are checked, and non-English offers aren't looked up at all. If an offer's language can't be read from the flag icon, it is checked anyway.

**Settings:** `about:addons` → *Cardmarket MTG Trend Checker* → **Preferences**, or the **Settings** button in the overview box. You can change the three percentages, the English-only filter and desktop notifications. Changes apply immediately to open seller pages.

## Install

**Friends:** download the latest `.xpi` from this repo's GitHub **Releases** page and open it in Firefox (or go to `about:addons` → gear icon → *Install Add-on From File*). It updates automatically. *(Available after the first signed release.)*

**Try a local copy without signing:** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `extension/manifest.json`. Firefox removes it when it restarts.

## Development

Needs Node.js 22+.

```bash
npm install
npm start          # opens Firefox with the extension loaded; reloads when files change
npm run check      # type check + tests + Firefox add-on lint
```

`npm start` uses a fresh Firefox profile, so you need to log in to Cardmarket there. To use your normal profile instead (Firefox must be closed):
`npx web-ext run --source-dir extension --firefox-profile=default-release --keep-profile-changes`

Work happens on a branch per feature and is merged through a pull request; GitHub Actions runs `npm run check` on every PR.

Project notes for Claude Code are in `CLAUDE.md`. Release steps are in `.claude/skills/release/SKILL.md`. Changes are listed in `CHANGELOG.md`.

## How the price is determined
1. Each cart row carries Cardmarket's product ID (`data-product-id`).
2. Scryfall maps that ID to the card (`/cards/cardmarket/:id`), then lists all **English, paper** printings (`oracleid:… lang:en game:paper`).
3. The lowest Scryfall `prices.eur` value is used. That is Cardmarket's price trend for that printing. If a printing only exists as a foil, its foil trend counts.

Results are cached for 24 hours (Scryfall updates prices once a day). Requests are throttled to about 9 per second, as Scryfall asks. Scryfall needs no API key.

### Caveat about "English"
Cardmarket doesn't publish a trend price per language. The trend for a printing is calculated from sales in all languages. So "English" here means *only printings that exist in English are considered*, e.g. Japanese-only or Foreign Black Border printings are excluded. The trend value itself is still Cardmarket's all-language trend.

## Troubleshooting
- **Nothing appears:** Cardmarket may have changed its page structure. The selectors are in `extension/src/parse.js` (cart) and `extension/src/offers.js` (seller pages). Open the browser console (F12) and look for `[CMC]` messages.
- **⚠️ Couldn't read seller total:** the `.summary` box has a different layout. Save the page (Ctrl+S, "Web Page, HTML only") so the parser can be fixed against it; see `test/fixtures/README.md`.
- Only cards are priced. Sealed products in the cart show "No English trend price found" and make that seller "incomplete".
