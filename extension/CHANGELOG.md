# Changelog

## Unreleased

## 2.2.0 - 2026-11-22
- **Minimize the overview box:** the new **–** button shrinks the box to one line with a short summary (e.g. "🔥 3 deals" or "✅ 2 · ❌ 1 · ⚠️ 0"). Click the line to get the full box back. It stays minimized on every page until you restore it. The × button is gone.
- **New look for the settings page:** grouped into "Seller pages" and "Trend price", shorter explanations (hover over **i** for details) and the version at the top.
- **Settings save themselves:** no more Save button, every change is saved right away. A wrong price range is marked red and not saved until you fix it. "Reset to defaults" now asks first.

## 2.1.0 - 2026-11-22
- **Settings button on the cart and shopping wizard pages:** the overview box there now has a **Settings** button too, like on seller pages.
- **Skip printings for "Cheapest EN":** in the settings you can now leave out printings whose trend says little about a normal copy: categories (Memorabilia, Un-sets, Promos, Secret Lair, The List) and single sets you search for and tick. **Memorabilia (gold-bordered World Championship decks, Collectors' Edition, 30th Anniversary…) is skipped by default, so some trends may go up a little after this update.** If a cheaper printing was skipped, the note says e.g. "(M10, 1 cheaper filtered)".
- Old saved prices are now cleaned up once a day, so the add-on's storage doesn't keep growing.
- **Easier to read for colour-blind users:** the seller list in the overview box (cart and shopping wizard) now shows ✅ / ❌ / ⚠️ in front of each seller, not just green and red.
- Removed the green/red bar on each card's price (cart): it only used colour, and the note under the card already shows the trend.
- **Shopping wizard results:** the cart's ✅ worth it / ❌ not worth it check now also appears in the wizard results. Each seller block shows the summed trend and whether it's worth it, and the Results Summary does the same for the whole result. Cards get their trend notes, and the overview box lists the sellers.
- **Compare with this printing:** a new switch in the overview box (cart and seller pages), **Cheapest EN** / **This printing**. "This printing" compares with the trend of the exact printing on offer instead of the cheapest English one, and foils with their foil trend. Cards without a trend for that printing show up as "couldn't be priced" (or make a cart seller "incomplete"). The choice is remembered, and it's also in the settings.

## 2.0.1 - 2026-11-21
- Fixed: button labels in the overview box were invisible (white on white) when Firefox or Windows uses a dark theme.

## 2.0.0 - 2026-11-21
- Compares Cardmarket prices with the trend price of the **cheapest English printing** of each card (Cardmarket's trend, via Scryfall). Prices are kept for 24 hours; **Refresh prices** in the overview box fetches them again.
- **Shopping cart:** for each seller, a green ✅ / red ❌ / yellow ⚠️ panel shows whether the total incl. shipping and fees is lower than the summed trend of the cards. Each card shows its trend and set, and a green or red bar says whether that copy is at or below trend, or above it. The set name opens a Cardmarket search for the card.
- **Seller pages:** cards that are far enough under trend get a green row and a 🔥 note, e.g. "🔥 14% (€ 1,02) under trend € 7,21". Other cards show their trend price. Hover a card name to see the price read and the trend.
- **Price ranges:** by default a deal is 25% under trend for €1–3, 15% for €3–5 and 10% from €5. Offers under €1 are ignored. You can change, add and remove ranges in the settings.
- **Any under trend:** the switch at the top of the overview box on seller pages flags every card that's cheaper than its trend, including cards under €1. The choice is remembered.
- **English only:** by default only English offers are checked. You can turn this off in the settings.
- **Overview box** (bottom-right): lists the sellers in your cart, or the deals on a seller page with price, trend and savings, plus cards that couldn't be priced.
- **⏻ Off / On:** the button in the overview box turns the add-on off on every Cardmarket page until you turn it back on.
- **Settings:** `about:addons` → Cardmarket MTG Trend Checker → Preferences, or the **Settings** button in the overview box.
