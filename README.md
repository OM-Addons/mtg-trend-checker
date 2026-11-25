# Cardmarket MTG Trend Checker (Firefox)

Compares Magic: The Gathering prices on Cardmarket with the trend price of the **cheapest English printing** of each card, in your shopping cart, in the shopping wizard results and on seller pages. Or, if you prefer, with the trend of the **exact printing** on offer (see [Compare with](#compare-with-cheapest-english-or-this-printing)).

## Compare with: cheapest English or this printing

The overview box (bottom-right, on the cart, the shopping wizard results and seller pages) has a switch: **Cheapest EN** / **This printing**. The choice is remembered on every page until you switch back. You can also set it in the settings.
- **Cheapest EN** (default): the lowest trend of all English printings of the card, whichever set the offer is from.
- **This printing**: the trend of the exact printing on offer. Foil offers (Cardmarket's foil icon) are compared with that printing's foil trend, other offers with its normal trend. If that printing has no trend for that finish, or the offer has no product ID (some seller-page rows without a picture), the card counts as having no trend. On a seller page it is listed under "couldn't be priced", and in the cart that seller becomes "incomplete" (yellow).

Everything else (price ranges, "Any under trend", English only, no lookups for cheap or non-English offers) works the same in both modes. Below, "trend" means whichever one you picked.

### Skipping printings for "Cheapest EN"

Some printings have a trend that says little about what a normal copy costs. The settings page lets you leave them out of **Cheapest EN**:
- **Categories:** Memorabilia (gold-bordered World Championship decks, Collectors' Edition, 30th Anniversary Edition, art series), Un-sets and playtest cards, Promos, Secret Lair, The List. **Memorabilia is skipped by default.**
- **Single sets:** type part of a set's name or code, then tick it. Ticked sets appear as tags, and clicking a tag (✕) stops skipping that set. The set list comes from Scryfall and is loaded once a day, only on the settings page.

If a skipped printing was cheaper than the one used, the set note says so, e.g. "(Trend from: M10, 1 cheaper filtered)". If *every* printing of a card is skipped, its cheapest one is used anyway and the note says "(Trend from: …, excluded set)". **This printing** isn't affected. After you change the selection, open pages look their cards up again.

## Shopping cart

Checks your cart one seller at a time:

> **Worth it** = seller total (cards + shipping + fees) **<** Σ (quantity × trend price of each card: of its *cheapest English printing*, or of *this printing*)

What you'll see on `cardmarket.com/<lang>/Magic/ShoppingCart`:
- Two extra rows in each seller's summary, under Cardmarket's Total: the summed trend, and ✅ *Worth it: you save €x* / ❌ *Not worth it: over by €x* / ⚠️ *Incomplete*. The seller block also gets a green, red or yellow edge. Cards, shipping and total aren't repeated: Cardmarket already shows them.
- Right under each card's price: how far the price (per copy) is under or over the trend, then the trend itself, e.g. "▼ € 4,50 under" and "trend € 7,00" (or "▲ € 0,80 over", "= trend"). Prices under trend are bold green, like deals on seller pages. Cards without a trend say "no trend" there, with the reason under the name.
- Below each card's name: which set the trend is from, e.g. "(Trend from: M10)" (", foil" when it is a foil trend). The set name links to a Cardmarket search for the card, where you can pick that printing. It isn't a direct link to the printing: Scryfall's direct link got an IP address rate-limited by Cardmarket (Cloudflare "Error 1015").
- A small overview box in the bottom-right corner listing all sellers, each marked ✅ / ❌ / ⚠️ (not only by colour), with **Refresh prices** and **Settings** buttons.

It re-checks automatically when you remove items or sellers.

## Shopping wizard results

The same check on the results of Cardmarket's shopping wizard (`cardmarket.com/<lang>/Magic/Wants/ShoppingWizard/Results/…`):
- **Each seller block** gets two extra rows in its list under Total: the summed trend, and ✅ *Worth it: you save €x* / ❌ *Not worth it: over by €x* / ⚠️ *Incomplete*. The block also gets a green, red or yellow edge. The rule is the cart's: the seller's Total (incl. shipping) must be lower than the summed trend.
- **Results Summary** gets the same two rows for the whole result: Cardmarket's grand Total against the summed trend of all cards.
- Each card shows its trend and difference under the price, and its set under the name, as in the cart.
- The overview box shows the overall verdict, how many sellers are worth it, and the list of sellers (click one to jump to it).
- The verdicts always cover the whole result, like Cardmarket's own Total. Unticking cards doesn't change them. Once you add cards to your cart, the cart check covers what you actually picked.

## Seller offer pages: under-trend deals

On `cardmarket.com/<lang>/Magic/Users/<seller>/Offers/Singles` every offer is checked against the trend (cheapest English printing, or this printing):

| Offer price | Flagged when at least this much below trend (default) |
|---|---|
| under €1 | ignored: no lookup at all |
| €1 – under €3 | 25% |
| €3 – under €5 | 15% |
| €5 and up | 10% |

These price ranges can be changed in the settings (see below). Offers below the start of the first range are ignored, without a lookup.

**Any under trend:** sometimes you just want to see every card that's cheaper than its trend. The overview box on a seller page has a switch at the top: **My ranges** / **Any under trend**. In "Any under trend" mode every offer is checked, including cheap ones, and anything strictly below trend is flagged. The English-only filter still applies. The choice is remembered for other pages and sellers until you switch back.

- Right under each checked offer's price: the difference, then the trend, e.g. "▼ € 1,02 under" and "trend € 7,21". Deals also get a green row and, on the next line, the percentage with a 🔥: "(14%) 🔥". The lines wrap to fit the price column. Other offers show no percentage. Offers without a trend say "no trend". The set the trend is from is below the card name ("(Trend from: …)").
- An overview box (bottom-right) lists the deals on the page with the price, the trend and the savings, e.g. "Adrix and Nev, Twincasters: € 4,49 vs € 5,71 (€ 1,22 - 21%)".
- Only the page you're viewing is checked, so with a 20-per-page shop you check page by page. Sort by price descending to see the expensive cards first.
- By default only English offers are checked, and non-English offers aren't looked up at all. If an offer's language can't be read from the flag icon, it is checked anyway.

**Turning it off:** the **⏻ Off** button at the top of the overview box (cart, wizard and seller pages) turns the add-on off on every Cardmarket page: no notes, no price lookups, just a small **⏻ On** button in the corner. Click it to turn the add-on back on.

**Minimizing the box:** the **–** button at the top of the overview box shrinks it to one line with the title and a short summary (e.g. "Under-trend deals · 🔥 3 deals" or "MTG cart check · ✅ 2 · ❌ 1 · ⚠️ 0"). Click that line to get the full box back. The choice is remembered on every Cardmarket page until you restore it. The checks and the card notes keep working while the box is minimized.

**Settings:** `about:addons` → *Cardmarket MTG Trend Checker* → **Preferences**, or the **Settings** button in the overview box (cart, shopping wizard and seller pages). You can change what to compare with, which printings "Cheapest EN" skips, the English-only filter and the price ranges. For the ranges you can edit, add (up to 10) and remove them. Each range has a start price and a percentage, and runs until the next range starts. The settings page shows each range and which offers are ignored. Set the first range to start at €0 to check every offer. Every change is saved straight away (there is no Save button); a short "Saved ✓" confirms it. If a price range is invalid, it's marked red and your ranges aren't saved until you fix it (other changes still are). **Reset to defaults** asks first and leaves the ⏻ On/Off and minimize choices alone. Changes apply immediately to open seller pages. The **What's new** link at the top of the settings page describes the features and lists the changes in each new version. Hover over a small **i** for more details on a setting.

## Install

**Friends (Firefox on desktop):** open the [latest release](https://github.com/OM-Addons/mtg-trend-checker/releases/latest) and click the `.xpi` file; Firefox asks whether to add it. (Or download it and use `about:addons` → gear icon → *Install Add-on From File*.) It updates automatically; to update right away: `about:addons` → gear icon → *Check for Updates*. *(Available after the first signed release.)* Firefox for Android isn't supported yet.

**Try a local copy without signing:** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select `extension/manifest.json`. Firefox removes it when it restarts.

## Development

Needs Node.js 22.22.2+ or 24.15+ (required by the test library jsdom).

```bash
npm install
npm start          # opens Firefox with the extension loaded; reloads when files change
npm run check      # type check + tests + Firefox add-on lint
```

`npm start` uses a fresh Firefox profile, so you need to log in to Cardmarket there. To use your normal profile instead (Firefox must be closed):
`npx web-ext run --source-dir extension --firefox-profile=default-release --keep-profile-changes`

Work happens on a branch per feature and is merged through a pull request; GitHub Actions runs `npm run check` on every PR, and Dependabot opens PRs for dependency updates.

Project notes for Claude Code are in `CLAUDE.md`. Release steps are in `.claude/skills/release/SKILL.md`. Changes are listed in [`extension/CHANGELOG.md`](extension/CHANGELOG.md). The add-on ships this file and shows it as its *What's new* page.

## How the price is determined
1. Each cart row carries Cardmarket's product ID (`data-product-id`).
2. Scryfall maps that ID to the card (`/cards/cardmarket/:id`), then lists all **English, paper** printings (`oracleid:… lang:en game:paper`).
3. The lowest Scryfall `prices.eur` value is used. That is Cardmarket's price trend for that printing. If a printing only exists as a foil, its foil trend counts. Printings in skipped categories (Scryfall's `set_type`, or a few set codes for Secret Lair and The List) or skipped sets are left out, unless that would leave none.

With **This printing**, step 2 stops at the card Scryfall returns for the product ID: its `prices.eur` is used, or `prices.eur_foil` for foil offers and foil-only printings. The same request serves both modes, so switching doesn't cost extra lookups.

Results are cached for 24 hours (Scryfall updates prices once a day). Once a day, before the first lookup, expired entries are deleted, so the cache doesn't keep growing. A cached cheapest printing remembers which sets were skipped, and is looked up again when that selection changes. Requests are throttled to about 9 per second, as Scryfall asks. Scryfall needs no API key.

### Caveat about "English"
Cardmarket doesn't publish a trend price per language. The trend for a printing is calculated from sales in all languages. So "English" here means *only printings that exist in English are considered*, e.g. Japanese-only or Foreign Black Border printings are excluded. The trend value itself is still Cardmarket's all-language trend.

## Troubleshooting
- **Nothing appears:** Cardmarket may have changed its page structure. The selectors are in `extension/src/parse.js` (cart), `extension/src/wizard.js` (shopping wizard) and `extension/src/offers.js` (seller pages). Open the browser console (F12) and look for `[CMC]` messages.
- **Cardmarket shows "Error 1015 / You are being rate limited":** Cardmarket's Cloudflare protection has blocked your IP address for sending too many requests. The add-on itself never sends requests to Cardmarket (only to Scryfall). Wait, or restart your router to get a new IP address, and click through pages less quickly.
- **⚠️ Couldn't read seller total:** the `.summary` box has a different layout. Save the page (Ctrl+S, "Web Page, HTML only") so the parser can be fixed against it; see `test/fixtures/README.md`.
- Only cards are priced. Sealed products in the cart show "No English trend price found" (or "No trend for this printing") and make that seller "incomplete".
