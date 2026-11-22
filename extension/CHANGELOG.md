# Changelog

## Unreleased
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
