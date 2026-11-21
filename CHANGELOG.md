# Changelog

## Unreleased

## 1.2.0 - 2026-11-21
- Seller pages: offers whose price can't be read now show in the "couldn't be priced" list, instead of being counted as "under €1".
- Settings page shows validation messages on the page instead of a popup.
- Internal: type checking, a proper test suite, and project docs for development.

## 1.1.x - 2026-11-20
- Seller offer pages: flags cards that are 25% / 15% / 10% under the trend, for €1–3 / €3–5 / above €5. Ignores cards under €1, with no lookups.
- Every other checked card shows the trend price, without a percentage. Hover a card name to see the price read and the trend.
- Works with both the list and the table layout of seller pages.
- Settings page for the percentages, an English-only filter and desktop notifications.
- Overview box with deals, counts and a "couldn't be priced" list.
- Fix: cards that loaded while a check was running were skipped.
- Looser name matching when Cardmarket's card name differs slightly from Scryfall's.
- Prices are cached for 24 hours.

## 1.0.0 - 2026-11-20
- Shopping cart: per seller, compares the total incl. shipping with the summed trend of the cheapest English printing of each card.
