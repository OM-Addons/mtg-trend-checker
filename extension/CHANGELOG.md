# Changelog

## Unreleased
- Settings: the price ranges for deals can be edited, added and removed (up to 10). The page shows each range and which offers are ignored. Your old percentages are kept.
- Each range now starts at its price, so an offer of exactly €5.00 uses the "€5 and up" range (10% by default) instead of 15%.
- Seller pages: the overview shows the real "skipped under €X" threshold.
- Seller pages: new switch at the top of the overview box, **My ranges** / **Any under trend**. "Any under trend" flags every card that's cheaper than its trend, including cards under €1, and ignores your ranges. The choice is remembered.
- Seller pages: the overview box no longer shows the "hover a card name" hint. The tooltips on card names still work.
- New "What's new" page (link at the bottom of the settings page) that lists the changes in each version.
- The set name next to a trend price now opens a Cardmarket search for the card, in your site language. The old direct link could get you blocked by Cardmarket ("Error 1015, you are being rate limited").

## 1.2.1 - 2026-11-21
- Signed by Mozilla and installable in regular Firefox from the GitHub releases page, with automatic updates.

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
